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
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { apiClient } from '../../shared/api/client'
// Import via the barrel — index.ts is what pulls in taptab.css. A direct
// `./TapTabEditor` import renders the editor with no styling at all.
import {
  ProjectionTapTabEditor,
  serializeDocument,
  type TapTabEditorHandle,
} from '../../editor/taptab'
import type { EditorProjectionResponse } from '../../types/uiSpec'
import './RecordCreatePanel.css'

export type CreateNodeType = 'study' | 'experiment' | 'run'

const SCHEMA_IDS: Record<CreateNodeType, string> = {
  study: 'https://computable-lab.com/schema/computable-lab/study.schema.yaml',
  experiment:
    'https://computable-lab.com/schema/computable-lab/experiment.schema.yaml',
  run: 'https://computable-lab.com/schema/computable-lab/run.schema.yaml',
}

const NODE_LABELS: Record<CreateNodeType, string> = {
  study: 'project',
  experiment: 'experiment',
  run: 'run',
}

const ID_PREFIXES: Record<CreateNodeType, string> = {
  study: 'STU',
  experiment: 'EXP',
  run: 'RUN',
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
 * recordId = PREFIX-slug-rand4 (e.g. EXP-dose-response-k3f2), following the
 * records tree's MAT-clofibrate-yy2t style. The random suffix is fixed per
 * panel mount so typing the title doesn't churn the id.
 */
function generateRecordId(
  nodeType: CreateNodeType,
  title: string,
  rand: string,
): string {
  const slug = slugify(title, 24) || 'untitled'
  return `${ID_PREFIXES[nodeType]}-${slug}-${rand}`
}

export interface RecordCreatePanelProps {
  nodeType: CreateNodeType
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
  const [projection, setProjection] = useState<EditorProjectionResponse | null>(
    null,
  )
  const [projectionError, setProjectionError] = useState<string | null>(null)
  const [loadingSpec, setLoadingSpec] = useState(true)
  const [formData, setFormData] = useState<Record<string, unknown>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const taptabEditorRef = useRef<TapTabEditorHandle | null>(null)
  // Fixed per mount so the derived recordId is stable while typing.
  const randRef = useRef(Math.random().toString(36).slice(2, 6))

  const parentPaths = useMemo(() => {
    const paths: string[] = []
    if (nodeType !== 'study') paths.push('studyId')
    if (nodeType === 'run') paths.push('experimentId')
    return paths
  }, [nodeType])

  useEffect(() => {
    setError(null)
    setProjection(null)
    setProjectionError(null)

    const initial: Record<string, unknown> = {
      recordId: generateRecordId(nodeType, draftTitle ?? '', randRef.current),
      kind: nodeType,
    }
    if (draftTitle) {
      initial.title = draftTitle
      initial.shortSlug = slugify(draftTitle, 30)
    }
    if (nodeType === 'study' || nodeType === 'experiment') {
      initial.state = 'draft'
    }
    if (nodeType === 'experiment' && studyId) initial.studyId = studyId
    if (nodeType === 'run') {
      if (experimentId) initial.experimentId = experimentId
      if (studyId) initial.studyId = studyId
      initial.status = 'planned'
    }
    setFormData(initial)

    setLoadingSpec(true)
    apiClient
      .getEditorDraftProjection(SCHEMA_IDS[nodeType])
      .then(setProjection)
      .catch((err) => {
        console.warn('Editor draft projection unavailable; falling back.', err)
        setProjectionError(
          err instanceof Error ? err.message : 'Draft projection fetch failed',
        )
      })
      .finally(() => setLoadingSpec(false))
  }, [nodeType, studyId, experimentId, draftTitle])

  // Parent-id slots render read-only: the hierarchy comes from the click
  // site, not the form. Projection paths are JSONPath-style ("$.studyId").
  const slots = useMemo(() => {
    if (!projection) return []
    return projection.slots.map((slot) =>
      parentPaths.includes(slot.path.replace(/^\$\./, ''))
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
        next.recordId = generateRecordId(nodeType, next.title, randRef.current)
        next.shortSlug = slugify(next.title, 30)
      }
      setFormData(next)
    },
    [formData.title, nodeType],
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
        // Re-stamp derived + parent fields so an editor serialization pass
        // can never drop them (the document's shortSlug/recordId rows hold
        // stale empties — the derived values live in React state only).
        payload.recordId = generateRecordId(
          nodeType,
          (payload.title as string) ?? '',
          randRef.current,
        )
        payload.kind = nodeType
        if (!payload.shortSlug && typeof payload.title === 'string') {
          payload.shortSlug = slugify(payload.title, 30)
        }
        if (nodeType !== 'study' && studyId) payload.studyId = studyId
        if (nodeType === 'run' && experimentId)
          payload.experimentId = experimentId

        await apiClient.createRecord(SCHEMA_IDS[nodeType], payload)
        // Let live tree views (Find tab) know the spine changed.
        window.dispatchEvent(new CustomEvent('cl:records-changed'))
        onCreated(payload.recordId as string, payload.title as string)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create record')
      } finally {
        setIsSubmitting(false)
      }
    },
    [formData, nodeType, studyId, experimentId, onCreated],
  )

  const label = NODE_LABELS[nodeType]
  const useProjection = projection !== null && !loadingSpec

  return (
    <div className="record-create-panel" data-testid="record-create-panel">
      <header className="record-create-panel__head">
        <h2 className="record-create-panel__title">New {label}</h2>
        <span className="record-create-panel__sub">
          {String(formData.recordId ?? '')}
          {studyId ? ` · in ${studyId}` : ''}
          {experimentId ? ` / ${experimentId}` : ''}
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
