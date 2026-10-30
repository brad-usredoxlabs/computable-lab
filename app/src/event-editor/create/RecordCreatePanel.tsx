/**
 * RecordCreatePanel — generic TapTab-first creation surface for the
 * study / experiment / run spine (specifications/creation-entry-points.md).
 *
 * Renders a projection-backed TapTab editor over the node type's draft
 * projection (same path CreateNodeModal uses), falling back to a minimal
 * title+description form when no projection is available. Unlike the legacy
 * modal it has no BrowserContext dependency, uses workspace design tokens,
 * and reports creation through `onCreated` so hosts decide navigation:
 *   - the `/create/study` route navigates into the new project
 *   - the workspace `record-create` tab closes itself and refreshes the tree
 *
 * Parent ids (studyId / experimentId) arrive via props, are stamped into the
 * payload, and their slots are forced read-only — the hierarchy is chosen by
 * where you clicked "New …", not edited in the form.
 *
 * GC-16 (W3, architect GAP-1) — de-hardcoded kind→schemaId resolution:
 * the panel no longer hardcodes a `SCHEMA_IDS` literal as its ONLY source.
 * A kind's schema $id is resolved from the SERVED schema registry
 * (GET /schemas + deriveSchemaNode, the same single resolver /browser and
 * /registry use); the three spine kinds keep a fallback literal so spine
 * creation is unaffected if the registry is unavailable. A kind the registry
 * does not serve gets a LOUD NAMED refusal — never a dead "Create undefined"
 * form (dead-chrome ban). The identity field is the schema-declared one
 * (`recordId` for the spine — the only recordId users; `id` for FAIRCommon
 * records such as the knowledge triplet), so a draft built here posts the
 * field the schema actually requires.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { apiClient } from '../../shared/api/client'
import { describeApiError } from '../../shared/api/errors'
// Import via the barrel — index.ts is what pulls in taptab.css. A direct
// `./TapTabEditor` import renders the editor with no styling at all.
import {
  ProjectionTapTabEditor,
  serializeDocument,
  stripSystemProvenance,
  type TapTabEditorHandle,
} from '../../editor/taptab'
import type { EditorProjectionResponse } from '../../types/uiSpec'
import { deriveSchemaNode, type SchemaNode } from '../../browser/SchemaTree'
import './RecordCreatePanel.css'

/**
 * The spine node types — the panel's original authoring target. Kept as an
 * exported union for the consumers that index on it (RecordHostPage, the
 * record-create WorkspaceTab / recordCreateTabId). The panel's own `nodeType`
 * PROP is `string` so any served kind (e.g. the knowledge triplet) can open
 * the door without widening the spine union that the tab id / type union
 * depend on.
 */
export type SpineKind = 'study' | 'experiment' | 'run'
export type CreateNodeType = SpineKind

/**
 * Spine fallback: the three spine schema $ids. The registry (GET /schemas) is
 * the PRIMARY source for every kind; this literal is a safety net so spine
 * creation is byte-identical to pre-GC-16 behavior even if the registry call
 * is unavailable (the spine is the panel's original, core authoring surface).
 * A non-spine kind has NO fallback — it is either served (registry) or
 * loudly refused.
 */
const SPINE_SCHEMA_IDS: Record<SpineKind, string> = {
  study: 'https://computable-lab.com/schema/computable-lab/study.schema.yaml',
  experiment:
    'https://computable-lab.com/schema/computable-lab/experiment.schema.yaml',
  run: 'https://computable-lab.com/schema/computable-lab/run.schema.yaml',
}

/** Spine display labels (unchanged — "study" shows as "project"). */
const SPINE_LABELS: Record<SpineKind, string> = {
  study: 'project',
  experiment: 'experiment',
  run: 'run',
}

/**
 * Identity-field prefix convention, derived from each schema's own documented
 * id convention (study "e.g. STU-000003", claim "e.g. CLM-0001", assertion
 * "e.g. ASN-0001", evidence "e.g. EVD-0001"). This is the panel's EXISTING
 * id-minting mechanism (the spine already mints STU/EXP/RUN client-side; the
 * spine's `recordId` declares no pattern either) extended to the knowledge
 * triplet. It is an id-format convention, NOT a kind→schema table — the
 * kind→schema $id resolution is the served registry (SPINE_SCHEMA_IDS is a
 * spine-only safety net, not the resolver). A kind with no documented prefix
 * is left without a fabricated id (honest note) rather than minted with a
 * guessed prefix.
 */
const ID_PREFIXES: Record<string, string> = {
  study: 'STU',
  experiment: 'EXP',
  run: 'RUN',
  claim: 'CLM',
  assertion: 'ASN',
  evidence: 'EVD',
}

/** Slug a title for use inside a recordId / shortSlug. */
function slugify(title: string, max: number): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, max)
}

/**
 * recordId / id = PREFIX-slug-rand (e.g. EXP-dose-response-k3f2, CLM-…-…),
 * following the records tree's STU-/CLM- style. The random suffix is fixed
 * per panel mount so typing the title doesn't churn the id. Returns null when
 * the kind has no documented prefix convention (no fabricated id).
 */
function generateId(nodeType: string, title: string, rand: string): string | null {
  const prefix = ID_PREFIXES[nodeType]
  if (!prefix) return null
  const slug = slugify(title, 24) || 'untitled'
  return `${prefix}-${slug}-${rand}`
}

export interface RecordCreatePanelProps {
  /**
   * The record kind to create. Spine kinds ('study'|'experiment'|'run') keep
   * their original behavior; any other kind is resolved against the served
   * schema registry (GC-16) — a served kind opens the schema-backed form, an
   * unserved kind is loudly refused.
   */
  nodeType: string
  /** Parent study — required for experiment and run creation. */
  studyId?: string
  /** Parent experiment — required for run creation. */
  experimentId?: string
  /** Optional title prefill (e.g. carried from the picker's search query). */
  draftTitle?: string
  onCreated: (recordId: string, title: string) => void
  onCancel?: () => void
}

export function RecordCreatePanel({
  nodeType,
  studyId,
  experimentId,
  draftTitle,
  onCreated,
  onCancel,
}: RecordCreatePanelProps) {
  const isSpine = nodeType === 'study' || nodeType === 'experiment' || nodeType === 'run'
  // The identity field the schema declares: the spine uses `recordId` (the
  // ONLY recordId users — FAIRCommon records use `id`). Verified against the
  // served schemas (study/experiment/run require `recordId`; claim/
  // assertion/evidence require `id`).
  const idField = isSpine ? 'recordId' : 'id'

  const [projection, setProjection] = useState<EditorProjectionResponse | null>(
    null,
  )
  const [projectionError, setProjectionError] = useState<string | null>(null)
  const [loadingSpec, setLoadingSpec] = useState(true)
  const [formData, setFormData] = useState<Record<string, unknown>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // GC-16: honest note when a served kind declares no client-side id
  // convention (the id field is left for the user rather than fabricated).
  const [idNote, setIdNote] = useState<string | null>(null)

  const taptabEditorRef = useRef<TapTabEditorHandle | null>(null)
  // Fixed per mount so the derived id is stable while typing.
  const randRef = useRef(Math.random().toString(36).slice(2, 6))

  // GC-16: the served schema registry — the kind→schema $id resolver for
  // non-spine kinds (the same single resolver /browser and /registry use:
  // GET /schemas + deriveSchemaNode). Spine kinds do NOT depend on it (they
  // use SPINE_SCHEMA_IDS), so a registry failure never regresses the spine
  // and the pre-existing suite (which does not mock getSchemas) stays valid.
  const [registryNodes, setRegistryNodes] = useState<SchemaNode[] | null>(null)
  const [registryError, setRegistryError] = useState<string | null>(null)
  useEffect(() => {
    if (isSpine) return
    let cancelled = false
    setRegistryNodes(null)
    setRegistryError(null)
    apiClient
      .getSchemas()
      .then((schemas) => {
        if (cancelled) return
        setRegistryNodes(
          schemas
            .map(deriveSchemaNode)
            .filter((n): n is SchemaNode => n !== null),
        )
      })
      .catch((err) => {
        if (cancelled) return
        setRegistryError(err instanceof Error ? err.message : 'schema registry unavailable')
      })
    return () => {
      cancelled = true
    }
  }, [isSpine, nodeType])

  const resolvedNode = isSpine
    ? null
    : (registryNodes?.find((n) => n.kind === nodeType) ?? null)
  // The schema $id: the registry for non-spine kinds (primary), the fallback
  // literal for the spine (safety net — byte-identical to pre-GC-16).
  const schemaId = isSpine
    ? SPINE_SCHEMA_IDS[nodeType as SpineKind]
    : (resolvedNode?.schemaId ?? null)
  // A non-spine kind the LOADED registry does not serve → loud named refusal.
  const unserved = !isSpine && registryNodes !== null && resolvedNode === null
  const registryUnavailable = !isSpine && registryError !== null

  const label = isSpine
    ? SPINE_LABELS[nodeType as SpineKind]
    : (resolvedNode?.title ?? nodeType)

  const parentPaths = useMemo(() => {
    const paths: string[] = []
    if (isSpine && nodeType !== 'study') paths.push('studyId')
    if (nodeType === 'run') paths.push('experimentId')
    return paths
  }, [isSpine, nodeType])

  useEffect(() => {
    if (!schemaId) return
    setError(null)
    setProjection(null)
    setProjectionError(null)

    const seededId = generateId(nodeType, draftTitle ?? '', randRef.current)
    const initial: Record<string, unknown> = {
      kind: nodeType,
    }
    if (seededId) initial[idField] = seededId
    setIdNote(
      seededId
        ? null
        : `The schema for "${nodeType}" declares no client-side id convention — supply the stable ${idField} before saving.`,
    )
    if (draftTitle) {
      initial.title = draftTitle
      initial.shortSlug = slugify(draftTitle, 30)
    }
    // Parent/hierarchy + spine lifecycle fields are spine-only: a knowledge
    // draft must NOT carry studyId/experimentId/state/status (the knowledge
    // schemas are unevaluatedProperties:false and declare none of them).
    if (isSpine) {
      if (nodeType === 'study' || nodeType === 'experiment') {
        initial.state = 'draft'
      }
      if (nodeType === 'experiment' && studyId) initial.studyId = studyId
      if (nodeType === 'run') {
        if (experimentId) initial.experimentId = experimentId
        if (studyId) initial.studyId = studyId
        initial.status = 'planned'
      }
    }
    setFormData(initial)

    setLoadingSpec(true)
    apiClient
      .getEditorDraftProjection(schemaId)
      .then(setProjection)
      .catch((err) => {
        console.warn('Editor draft projection unavailable; falling back.', err)
        setProjectionError(
          err instanceof Error ? err.message : 'Draft projection fetch failed',
        )
      })
      .finally(() => setLoadingSpec(false))
  }, [schemaId, nodeType, studyId, experimentId, draftTitle, idField, isSpine])

  // Parent-id slots render read-only: the hierarchy comes from the click
  // site, not the form. Projection paths are JSONPath-style ("$.studyId").
  const slots = useMemo(() => {
    if (!projection) return []
    return projection.slots.map((slot) =>
      parentPaths.includes(slot.path.replace(/^\$./, ''))
        ? { ...slot, readOnly: true }
        : slot,
    )
  }, [projection, parentPaths])

  const handleFormChange = useCallback(
    (next: Record<string, unknown>) => {
      if (
        next.title &&
        typeof next.title === 'string' &&
        next.title !== formData.title
      ) {
        const regenerated = generateId(nodeType, next.title, randRef.current)
        if (regenerated) next[idField] = regenerated
        next.shortSlug = slugify(next.title, 30)
      }
      setFormData(next)
    },
    [formData.title, nodeType, idField],
  )

  const handleEditorUpdate = useCallback(
    (serialized: Record<string, unknown>) => {
      handleFormChange(serialized)
    },
    [handleFormChange],
  )

  const handleSubmit = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault()

      if (!formData.title || !(formData.title as string).trim()) {
        setError('Title is required')
        return
      }
      if (!schemaId) {
        setError(
          `No registered schema for kind "${nodeType}" — this record kind is not served by the schema registry.`,
        )
        return
      }

      setIsSubmitting(true)
      setError(null)
      try {
        let payload: Record<string, unknown> = formData
        const editor = taptabEditorRef.current?.getEditor()
        if (editor) {
          payload = serializeDocument(editor.getJSON(), formData)
        }
        // The serializer writes EVERY field row back, so untouched fields
        // land as empty strings — which strict schemas reject for
        // array-typed (tags, keywords) and provenance (createdBy) fields.
        // A new record simply omits what the user didn't fill in.
        for (const [key, val] of Object.entries(payload)) {
          if (
            val === '' ||
            val === null ||
            val === undefined ||
            (Array.isArray(val) && val.length === 0)
          ) {
            delete payload[key]
          }
        }
        // Re-stamp the derived id + kind so an editor serialization pass can
        // never drop them (the document's id/shortSlug rows hold stale
        // empties — the derived values live in React state only).
        const restamped = generateId(nodeType, (payload.title as string) ?? '', randRef.current)
        if (restamped) payload[idField] = restamped
        payload.kind = nodeType
        // System provenance is server-owned — never submit it from the client.
        stripSystemProvenance(payload)
        if (!payload.shortSlug && typeof payload.title === 'string') {
          payload.shortSlug = slugify(payload.title, 30)
        }
        // Hierarchy stamping is spine-only (knowledge drafts must not carry
        // studyId/experimentId — the knowledge schemas declare neither).
        if (isSpine) {
          if (nodeType !== 'study' && studyId) payload.studyId = studyId
          if (nodeType === 'run' && experimentId)
            payload.experimentId = experimentId
        }

        await apiClient.createRecord(schemaId, payload)
        // Let live tree views (Find tab) know the spine changed.
        window.dispatchEvent(new CustomEvent('cl:records-changed'))
        onCreated(String(payload[idField] ?? ''), payload.title as string)
      } catch (err) {
        setError(describeApiError(err))
      } finally {
        setIsSubmitting(false)
      }
    },
    [formData, nodeType, studyId, experimentId, onCreated, schemaId, idField, isSpine],
  )

  // GC-16: loud named refusal / registry-unavailable states — never a dead
  // "Create undefined" form. Rendered in place of the form body.
  if (!isSpine && (unserved || registryUnavailable)) {
    const message = registryUnavailable
      ? `The schema registry could not be loaded (${registryError ?? 'unavailable'}) — the "${nodeType}" form cannot be resolved. Retry when the registry is reachable.`
      : `No registered schema for kind "${nodeType}" — this record kind is not served by the schema registry (SCHEMA_NOT_FOUND: ${nodeType}). Create a served kind instead.`
    return (
      <div className="record-create-panel" data-testid="record-create-panel">
        <header className="record-create-panel__head">
          <h2 className="record-create-panel__title">New {label}</h2>
        </header>
        <div className="record-create-panel__body">
          <div
            className="record-create-panel__error"
            role="alert"
            data-testid="record-create-refusal"
          >
            {message}
          </div>
          <footer className="record-create-panel__actions">
            {onCancel ? (
              <button
                type="button"
                className="record-create-panel__btn"
                onClick={onCancel}
                data-testid="record-create-cancel"
              >
                Cancel
              </button>
            ) : null}
          </footer>
        </div>
      </div>
    )
  }

  const useProjection = projection !== null && !loadingSpec

  return (
    <div className="record-create-panel" data-testid="record-create-panel">
      <header className="record-create-panel__head">
        <h2 className="record-create-panel__title">New {label}</h2>
        <span className="record-create-panel__sub">
          {String(formData[idField] ?? '')}
          {isSpine && studyId ? ` · in ${studyId}` : ''}
          {isSpine && experimentId ? ` / ${experimentId}` : ''}
        </span>
      </header>

      <form
        className="record-create-panel__form"
        onSubmit={(e) => void handleSubmit(e)}
      >
        <div className="record-create-panel__body">
          {error ? (
            <div className="record-create-panel__error" role="alert">
              {error}
            </div>
          ) : null}
          {idNote ? (
            <p className="record-create-panel__hint" data-testid="record-create-id-note">
              {idNote}
            </p>
          ) : null}

          {loadingSpec ? (
            <p className="record-create-panel__hint">Loading form…</p>
          ) : useProjection && projection ? (
            <ProjectionTapTabEditor
              ref={taptabEditorRef as never}
              blocks={projection.blocks}
              slots={slots}
              data={formData}
              disabled={isSubmitting}
              onUpdate={handleEditorUpdate}
              enableOntologyCopilot
            />
          ) : (
            <div className="record-create-panel__fallback">
              {projectionError ? (
                <p className="record-create-panel__hint">
                  Structured form unavailable ({projectionError}); using the
                  minimal form.
                </p>
              ) : null}
              <label
                className="record-create-panel__label"
                htmlFor="record-create-title"
              >
                Title <span aria-hidden>*</span>
              </label>
              <input
                id="record-create-title"
                type="text"
                className="record-create-panel__input"
                value={(formData.title as string) || ''}
                onChange={(e) =>
                  handleFormChange({ ...formData, title: e.target.value })
                }
                placeholder={`Name this ${label}…`}
                disabled={isSubmitting}
                autoFocus
                data-testid="record-create-title"
              />
              <label
                className="record-create-panel__label"
                htmlFor="record-create-description"
              >
                Description
              </label>
              <textarea
                id="record-create-description"
                className="record-create-panel__input"
                value={(formData.description as string) || ''}
                onChange={(e) =>
                  handleFormChange({
                    ...formData,
                    description: e.target.value,
                  })
                }
                rows={3}
                disabled={isSubmitting}
              />
            </div>
          )}
        </div>

        <footer className="record-create-panel__actions">
          {onCancel ? (
            <button
              type="button"
              className="record-create-panel__btn"
              onClick={onCancel}
              disabled={isSubmitting}
              data-testid="record-create-cancel"
            >
              Cancel
            </button>
          ) : null}
          <button
            type="submit"
            className="record-create-panel__btn record-create-panel__btn--primary"
            disabled={isSubmitting}
            data-testid="record-create-submit"
          >
            {isSubmitting ? 'Creating…' : `Create ${label}`}
          </button>
        </footer>
      </form>
    </div>
  )
}
