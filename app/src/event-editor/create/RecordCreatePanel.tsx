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
 * /registry use). GC-16 FIX RUN 2 (adversarial defect 5): the registry is
 * the PRIMARY resolution path for EVERY kind — the spine included. The
 * `SPINE_SCHEMA_IDS` literal is a documented FALLBACK used ONLY when the
 * registry call fails (a registry outage never regresses spine creation).
 * A kind the loaded registry does not serve gets a LOUD NAMED refusal —
 * never a dead "Create undefined" form (dead-chrome ban).
 *
 * GC-16 FIX RUN 2 (adversarial defects 1/4/9; the id-mint ruling is
 * PROVISIONAL default D-A — the decision-override file was absent at work
 * time, re-check before relying on this): identity fields are SCHEMA-DRIVEN,
 * never client-stamped:
 * - `shortSlug` is attached ONLY when the served schema's declared
 *   `properties` contain `shortSlug` (GET /schemas/:id — the same single
 *   schema source the registry door uses). The knowledge triplet's schemas
 *   are `unevaluatedProperties: false` and declare no `shortSlug`, so a
 *   knowledge payload carries none (adversarial defect 1 was an unconditional
 *   client stamp that 422'd every knowledge create).
 * - the client-side "Title is required" gate applies ONLY when the served
 *   schema's top-level `required` names `title` (adversarial defect 9):
 *   Ajv is the single validation authority — a client rule the schema does
 *   not declare both blocks legitimate records and masks the server's real
 *   error. When the schema doc is unavailable the client gate is SKIPPED
 *   and the server's required-check speaks.
 * - the knowledge kinds get NO client-minted id (adversarial defect 4;
 *   provisional-pending-ruling D-A): the form exposes the schema-declared
 *   `id` field (the ui.yaml `$.id` slot, editable) and the AUTHOR supplies
 *   the stable identifier; the server's required-check speaks. The spine
 *   keeps its pre-existing client-side recordId mint (the documented
 *   fallback, spine behavior unchanged).
 *
 * GC-16 FIX RUN 3 (adversarial defect 12 — the spine race): that schema
 * document decision is GATED — while the document is unresolved the submit
 * path refuses (a named message) instead of treating "unknown" as
 * "not declared": the spine's identity fields (shortSlug) are
 * client-decided from the document, and the spine schemas REQUIRE
 * shortSlug, so an early submit would post a payload the server Ajv
 * rejects. Knowledge kinds (schema-driven, no client identity decisions)
 * are gated on the same flag — the form is not authoring-useful until its
 * projection + document have settled, and the gate is a one-fetch wait.
 *
 * GC-16 FIX RUN 4 (adversarial defect 16 — the failed-fetch arm; Option A
 * RATIFIED by the architect ruling file
 * 2026-10-30_lane1-gc16-d16-failed-fetch-shortSlug-decision.md — VERDICT:
 * Option A; the ruling ratifies the provisional Option A shipped here and
 * rules the two bounded deltas (4: refusal wording; 5: the
 * knowledge-on-failed pin; 6: this ruling cite) folded into the closing
 * run): the document's settled state is TRI-STATE (unresolved / resolved /
 * failed), not "settled = available". A FAILED fetch (FIX RUN 5 (D20): and
 * a 200 whose `schema` field is absent — a document never arrived) no
 * longer settles as "unavailable → not declared" for the spine: shortSlug
 * is client-decided from the document (the server cannot supply a value the
 * client owns), so on failed the spine submits are REFUSED with a named
 * message — no
 * silent invalid POST, no stripping of an author-typed value. Knowledge
 * kinds keep today's behavior on failed (nothing declared → the
 * shortSlug-deletion branch is the correct 'not declared' outcome, and the
 * server's required-check speaks, per the D9 contract).
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
import type { JsonSchema } from '../../types/kernel'
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
 * Spine FALLBACK only (GC-16 FIX RUN 2, adversarial defect 5): the served
 * schema registry (GET /schemas) is the PRIMARY kind→schema $id resolver for
 * EVERY kind — the spine included. This literal is consulted ONLY when the
 * registry call fails, so a registry outage leaves spine creation
 * byte-identical to pre-GC-16 behavior. It is a safety net, never the
 * resolver (a non-spine kind has NO fallback — it is either served or loudly
 * refused).
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
 * Spine recordId prefix convention — the panel's EXISTING id-minting
 * mechanism, SPINE-ONLY (GC-16 FIX RUN 2, adversarial defect 4; provisional
 * default D-A, pending the id-mint ruling): the knowledge kinds get NO
 * client-minted id. The previous FIX RUN 1 extended this table to
 * claim/assertion/evidence — a new TypeScript copy of domain vocabulary keyed
 * by schema kind, which the repo's own OQ-3 ruling (RecordRegistryPage.tsx
 * "The Hard Boundary") names the anti-pattern. Knowledge ids are now the
 * AUTHOR's: the form exposes the schema-declared `id` field and the server's
 * required-check (Ajv) speaks. The spine keeps its pre-existing client-side
 * recordId mint (the spine is the panel's original authoring surface and its
 * behavior is unchanged by this fix).
 */
const SPINE_ID_PREFIXES: Record<SpineKind, string> = {
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
 * recordId = PREFIX-slug-rand (e.g. EXP-dose-response-k3f2) — the spine's
 * EXISTING client-side recordId mint, following the records tree's STU-/EXP-
 * style. The random suffix is fixed per panel mount so typing the title
 * doesn't churn the id. SPINE-ONLY (GC-16 FIX RUN 2, defect 4, provisional
 * D-A): returns null for a non-spine kind — knowledge records get no
 * client-fabricated id; the author supplies the schema-declared `id`.
 */
function generateSpineRecordId(nodeType: SpineKind, title: string, rand: string): string {
  const prefix = SPINE_ID_PREFIXES[nodeType]
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
  // GC-16 FIX RUN 2 (adversarial defect 4; provisional D-A): honest note for
  // a SERVED non-spine kind — the client mints no id; the form exposes the
  // schema-declared `id` field for the author to fill (the server's
  // required-check speaks). Spine kinds carry no note (the client mints
  // recordId as before).

  const taptabEditorRef = useRef<TapTabEditorHandle | null>(null)
  // Fixed per mount so the derived id is stable while typing.
  const randRef = useRef(Math.random().toString(36).slice(2, 6))

  // GC-16 FIX RUN 2 (adversarial defect 5): the served schema registry
  // (GET /schemas + deriveSchemaNode — the same single resolver /browser and
  // /registry use) is the PRIMARY kind→schema $id resolver for EVERY kind,
  // the spine included. The SPINE_SCHEMA_IDS literal is consulted only as a
  // documented FALLBACK when the registry call fails (a registry outage
  // never regresses spine creation). A kind the LOADED registry does not
  // serve (other than a spine-on-failure) gets a loud named refusal.
  const [registryNodes, setRegistryNodes] = useState<SchemaNode[] | null>(null)
  const [registryError, setRegistryError] = useState<string | null>(null)
  useEffect(() => {
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
  }, [nodeType])

  const resolvedNode = registryNodes?.find((n) => n.kind === nodeType) ?? null
  // The schema $id: the served registry for every kind (PRIMARY). When the
  // registry call FAILED, a spine kind falls back to the documented
  // SPINE_SCHEMA_IDS literal (safety net — byte-identical to pre-GC-16); a
  // non-spine kind has no fallback (loud named refusal). While the registry
  // is still loading (or before the fallback settles) there is no $id, so
  // the form renders its loading state — never a dead "Create undefined".
  const schemaId = resolvedNode?.schemaId ?? (registryError !== null && isSpine ? SPINE_SCHEMA_IDS[nodeType as SpineKind] : null)
  // A kind the LOADED registry does not serve → loud named refusal. A spine
  // kind on a registry failure is NOT unserved (its fallback resolves it).
  const unserved = registryNodes !== null && resolvedNode === null && !(registryError !== null && isSpine)
  const registryUnavailable = registryError !== null && resolvedNode === null

  // GC-16 FIX RUN 2 (adversarial defect 4; provisional D-A): honest note for
  // a SERVED non-spine kind — the client mints no id; the form exposes the
  // schema-declared `id` field for the author to fill (the server's
  // required-check speaks). Spine kinds carry no note (the client mints
  // recordId as before).
  const idNote =
    isSpine || registryNodes === null || resolvedNode === null
      ? null
      : `Supply a stable id before saving — the client does not mint knowledge ids; the schema requires one (server validation is the authority).`

  const label =
    resolvedNode?.title ?? (isSpine ? SPINE_LABELS[nodeType as SpineKind] : nodeType)

  // GC-16 FIX RUN 2 (adversarial defects 1/4/9; provisional D-A): the served
  // schema document (GET /schemas/:id — the same single schema source the
  // registry door uses) drives the client's identity handling: `shortSlug`
  // is stamped only when the schema's `properties` declare it, and the
  // client-side title gate applies only when the schema's `required` names
  // `title`. Ajv (the server) is the single validation authority; when the
  // schema doc is unavailable the client gates are skipped and the server
  // speaks.
  const [schemaDoc, setSchemaDoc] = useState<JsonSchema | null>(null)
  // GC-16 FIX RUN 3 (adversarial defect 12 — the spine race): the schemaId
  // this document belongs to ONCE SETTLED. While it does not equal the
  // resolved schemaId the document is IN FLIGHT for that schemaId: the
  // submit path must refuse, not treat "unknown" as "not declared".
  const [schemaDocFor, setSchemaDocFor] = useState<string | null>(null)
  // GC-16 FIX RUN 4 (adversarial defect 16 — the failed-fetch arm; Option A
  // RATIFIED by the architect ruling
  // 2026-10-30_lane1-gc16-d16-failed-fetch-shortSlug-decision.md): TRI-STATE
  // settlement. FIX RUN 3's `schemaDocFor` alone counted a FAILED fetch as
  // settled (`:296-300`), which drove `schemaDeclaresShortSlug` to false and
  // let the submit path DELETE the spine's schema-required shortSlug — a
  // silent invalid POST with no client remedy (even an author-typed value
  // stripped). `schemaDocFailed` is true ONLY for the schemaId the fetch
  // failed for (FIX RUN 5 (D20) — and a 200 whose `schema` field is absent:
  // a document-less success settles as failed too — see the .then arm),
  // so on failed the
  // spine (whose identity fields the client mints) must REFUSE, not
  // guess; the knowledge kinds keep the D9 "server speaks" behavior
  // (nothing declared → the shortSlug-deletion branch is correct there,
  // and their required fields come from the author, not a client stamp).
  const [schemaDocFailed, setSchemaDocFailed] = useState(false)
  useEffect(() => {
    if (!schemaId) {
      setSchemaDoc(null)
      setSchemaDocFor(null)
      setSchemaDocFailed(false)
      return
    }
    let cancelled = false
    setSchemaDoc(null)
    setSchemaDocFor(null)
    setSchemaDocFailed(false)
    apiClient
      .getSchema(schemaId)
      .then((info) => {
        if (cancelled) return
        // GC-16 FIX RUN 5 (D20): a 200 whose `schema` field is ABSENT (the
        // client contract SchemaInfo.schema is optional —
        // app/src/types/kernel.ts) settles as FAILED, NOT as "resolved,
        // declares nothing": otherwise schemaDeclaresShortSlug goes false
        // and the submit path DELETES the spine's schema-required shortSlug
        // (the review's PROBE4C — a shortSlug-less spine POST with no client
        // error). "Resolved" always means a document arrived.
        if (info.schema == null) {
          setSchemaDoc(null)
          setSchemaDocFor(schemaId)
          setSchemaDocFailed(true)
          return
        }
        setSchemaDoc(info.schema ?? null)
        setSchemaDocFor(schemaId)
      })
      .catch(() => {
        if (cancelled) return
        setSchemaDoc(null)
        setSchemaDocFor(schemaId)
        // FIX RUN 4 (D16): the failure SETTLES the document's state as
        // FAILED for this schemaId — not as "unavailable → not declared".
        // The submit gate distinguishes the two (refusal vs the D9
        // not-declared branch).
        setSchemaDocFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [schemaId])
  // Schema-declared flags (false when the schema doc is unavailable).
  // FIX RUN 4 (D16): for the SPINE, "unavailable" is no longer a decision
  // input — a failed document fetch is refused in the submit gate (the
  // named refusal in handleSubmit) BEFORE this branch can act, so the
  // false here can only act on a RESOLVED document that declares no
  // shortSlug (the knowledge triplet — the D9 not-declared outcome the
  // server's required-check then speaks for).
  const schemaDeclaresShortSlug = Boolean(
    schemaDoc?.properties && 'shortSlug' in (schemaDoc.properties as Record<string, unknown>),
  )
  const schemaRequiresTitle = Boolean(schemaDoc?.required?.includes('title'))

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

    // GC-16 FIX RUN 2 (adversarial defect 4; provisional D-A): the client
    // mints an id ONLY for the spine (its pre-existing recordId mint). The
    // knowledge kinds expose the schema-declared `id` field to the AUTHOR —
    // no client-fabricated id, the server's required-check speaks.
    const initial: Record<string, unknown> = {
      kind: nodeType,
    }
    if (isSpine) {
      initial[idField] = generateSpineRecordId(nodeType as SpineKind, draftTitle ?? '', randRef.current)
      // Parent/hierarchy + spine lifecycle fields are spine-only: a knowledge
      // draft must NOT carry studyId/experimentId/state/status (the knowledge
      // schemas are unevaluatedProperties:false and declare none of them).
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
    // GC-16 FIX RUN 2 (adversarial defect 1): shortSlug is a SCHEMA-DRIVEN
    // field — attached only when the served schema's declared `properties`
    // contain `shortSlug` (spine schemas declare + require it; the knowledge
    // triplet is unevaluatedProperties:false and declares none, so a
    // knowledge payload carries no shortSlug). Until the schema doc arrives
    // there is no seed (the submit path stamps it once the doc has
    // resolved — the submit is GATED on that resolution, FIX RUN 3 defect
    // 12: the flag intentionally does NOT re-seed this effect — when the
    // doc resolves late, re-seeding would discard what the author typed in
    // the window (the review's second root cause); the submit re-stamp +
    // gate carry the behavior instead).
    if (draftTitle) {
      initial.title = draftTitle
      if (schemaDeclaresShortSlug) initial.shortSlug = slugify(draftTitle, 30)
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
    // FIX RUN 3 (defect 12): schemaDeclaresShortSlug is deliberately NOT a
    // dependency — it flips when the async doc fetch settles, and re-seeding
    // formData at that moment would discard the author's in-flight edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        // GC-16 FIX RUN 2 (defect 4; provisional D-A): the client re-mints the
        // id ONLY for the spine (pre-existing recordId mint). Knowledge kinds
        // keep the author-supplied id untouched.
        if (isSpine) {
          next[idField] = generateSpineRecordId(nodeType as SpineKind, next.title, randRef.current)
        }
        // GC-16 FIX RUN 2 (defect 1): shortSlug is a schema-driven field —
        // stamped only when the served schema declares it (spine schemas do;
        // the knowledge triplet's unevaluatedProperties:false schemas do not).
        if (schemaDeclaresShortSlug) next.shortSlug = slugify(next.title, 30)
      }
      setFormData(next)
    },
    [formData.title, nodeType, idField, isSpine, schemaDeclaresShortSlug],
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

      // GC-16 FIX RUN 2 (adversarial defect 9): the client-side title gate
      // applies ONLY when the served schema's `required` names `title`
      // (spine: study/experiment require it; run and the knowledge triplet do
      // not). Ajv (the server) is the single validation authority — a client
      // rule the schema does not declare blocks legitimate records and masks
      // the server's real error. Schema doc unavailable → the client gate is
      // skipped and the server speaks.
      const titleOk =
        typeof formData.title === 'string' && formData.title.trim() !== ''
      if (schemaRequiresTitle && !titleOk) {
        setError('Title is required')
        return
      }
      if (!schemaId) {
        setError(
          `No registered schema for kind "${nodeType}" — this record kind is not served by the schema registry.`,
        )
        return
      }
      // GC-16 FIX RUN 3 (adversarial defect 12 — the spine race): the
      // shortSlug / title-required decisions are made from the served schema
      // DOCUMENT (GET /schemas/:id). While it has not settled for the
      // resolved schemaId, "unknown" must NOT be treated as "not declared"
      // — for the spine the schema REQUIRES shortSlug and an early submit
      // would post a payload the server Ajv rejects; the knowledge
      // projection is fetched in the same window, so its form is not
      // settled either. REFUSE until the document has settled.
      if (schemaDocFor !== schemaId) {
        setError(
          `Loading the schema document for "${nodeType}" — the identity fields are decided from it (shortSlug is schema-required for spine records). Submit once the form has settled.`,
        )
        return
      }
      // GC-16 FIX RUN 4 (adversarial defect 16 — the failed-fetch arm;
      // Option A ratified by the architect ruling
      // 2026-10-30_lane1-gc16-d16-failed-fetch-shortSlug-decision.md): a
      // FAILED fetch (and, FIX RUN 5 (D20), a document-less 200) is a
      // settled state too — but
      // it is NOT "not declared" for the spine. The spine's identity fields
      // are CLIENT-DECIDED from the document (recordId mint + shortSlug
      // stamp) — the server cannot
      // supply a value the client owns, so on failed the spine submits are
      // REFUSED with a named message (retry affordance: the schemas
      // endpoint is local; the form + author edits are preserved, so a
      // retry re-decides cleanly). A failed fetch must never reach the
      // `delete payload.shortSlug` branch for a spine kind — that branch
      // (FIX RUN 2 defect 1) exists only for a RESOLVED document that
      // declares no shortSlug (the knowledge triplet). Knowledge kinds
      // keep today's behavior on failed: nothing is declared, so the
      // not-declared branch is the D9-correct outcome (the server's
      // required-check speaks; their id is the author's).
      if (schemaDocFailed && isSpine) {
        setError(
          `The schema document for "${nodeType}" could not be loaded — the identity fields cannot be decided (spine identity fields such as shortSlug are decided from the document; the client will not guess them). Retry, or try again later.`,
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
        // Re-stamp the derived recordId + kind so an editor serialization
        // pass can never drop them (the document's recordId/shortSlug rows
        // hold stale empties — the derived values live in React state only).
        // GC-16 FIX RUN 2 (defect 4; provisional D-A): the id re-stamp is
        // SPINE-ONLY — knowledge kinds carry the AUTHOR's id (never
        // client-fabricated), so it is left untouched here.
        if (isSpine) {
          payload[idField] = generateSpineRecordId(
            nodeType as SpineKind,
            (payload.title as string) ?? '',
            randRef.current,
          )
        }
        payload.kind = nodeType
        // System provenance is server-owned — never submit it from the client.
        stripSystemProvenance(payload)
        // GC-16 FIX RUN 2 (defect 1): shortSlug is a schema-driven field —
        // re-stamped ONLY when the served schema declares it (spine schemas
        // do; the knowledge triplet's unevaluatedProperties:false schemas do
        // not). A stale shortSlug the editor serialization resurrected on a
        // schema that does not declare it is REMOVED (unevaluatedProperties
        // would 422 it).
        if (schemaDeclaresShortSlug) {
          if (!payload.shortSlug && typeof payload.title === 'string') {
            payload.shortSlug = slugify(payload.title, 30)
          }
        } else {
          delete payload.shortSlug
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
    [
      formData,
      nodeType,
      studyId,
      experimentId,
      onCreated,
      schemaId,
      idField,
      isSpine,
      schemaDeclaresShortSlug,
      schemaRequiresTitle,
      schemaDocFor,
      schemaDocFailed,
    ],
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
