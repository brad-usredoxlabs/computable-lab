/**
 * GC-12 (deliverable A) — the GC run-sheet model: PURE functions over the
 * instrument-sequence / instrument-sequence-entry record payloads.
 *
 * No fetch, no React, no DOM, no config. The component layer
 * (GcRunSheetSection) owns the probe accounting pin (D7); this module owns
 * the LINKING rule, the FULL-COLUMN row projection (bait #9: every declared
 * entry column incl. the *Uninterpreted / uninterpreted honesty arms), the
 * append-only analysisRunRefs merge (bait #8: rerun keeps history), and the
 * Analyze handoff payload (bait #10: ids only — never file bytes or payloads).
 *
 * The row projection walks the entry payload generically (no per-column
 * whitelist in TS): the schema's declared columns are the data; the table
 * renders whatever the payload carries, and the honesty arms survive
 * because they ARE payload keys.
 */

/** A record ref exactly as the ref datatype models it (kind record). */
export interface RecordRef {
  kind: 'record'
  id: string
  type?: string
  label?: string
  revisionRef?: { kind: 'record'; type: string; id: string }
}

/** The instrument-sequence header payload (schema/lab/instrument-sequence). */
export interface SequencePayload {
  kind?: string
  id?: string
  title?: string
  studyRef?: RecordRef
  runRef?: RecordRef
  operatorRef?: RecordRef
  instrumentRef?: RecordRef
  entryRefs?: RecordRef[]
  state?: string
  [key: string]: unknown
}

/** The instrument-sequence-entry payload (schema/lab/instrument-sequence-entry). */
export interface EntryPayload {
  kind?: string
  id?: string
  position?: string | { vial?: string; tray?: string }
  runRef?: RecordRef
  sampleRef?: RecordRef
  gcMethodRef?: RecordRef
  acquisitionPackageRef?: RecordRef
  analysisRunRefs?: RecordRef[]
  sampleName?: string
  dataFileName?: string
  acquisitionStartedAt?: string
  dateTimeRaw?: string
  amount?: { value?: number; unit?: string }
  amountUninterpreted?: number
  multiplier?: number
  dilution?: number
  istdNum?: number
  istdAmount?: { value?: number; unit?: string }
  istdAmountUninterpreted?: number
  manualInjection?: boolean
  vendorMethodLabel?: string
  uninterpreted?: Record<string, string>
  state?: string
  [key: string]: unknown
}

export interface Envelope<P = unknown> {
  recordId: string
  payload: P
  [key: string]: unknown
}

const RECORD_REF_KEYS = ['kind', 'id', 'type', 'label', 'revisionRef']

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function refId(ref: unknown): string | undefined {
  return isRecord(ref) && typeof ref.id === 'string' && ref.id.length > 0 ? ref.id : undefined
}

/**
 * The D1 linking probe (pure half): which sequences link the given run?
 *
 * A sequence links a run when EITHER
 *   (a) the header `runRef.id` matches the run, or
 *   (b) any of its `entryRefs` resolves (via `entryPayloads`) to an entry
 *       whose REQUIRED `runRef.id` matches the run.
 *
 * (b) is schema-guaranteed to exist for well-formed entries (entry.runRef is
 * REQUIRED) and covers headers that omit the optional runRef. `entryPayloads`
 * is the caller's id → entry-payload map (fetched by the component); absent
 * ids are skipped, never invented.
 */
export function findLinkedSequences(
  sequences: Array<Envelope<SequencePayload>>,
  runId: string,
  entryPayloads: Record<string, EntryPayload> = {},
): Array<Envelope<SequencePayload>> {
  return sequences.filter((seq) => {
    const p = seq.payload
    if (!isRecord(p)) return false
    const headerRef = refId(p.runRef)
    if (headerRef === runId) return true
    const entryRefs = Array.isArray(p.entryRefs) ? p.entryRefs : []
    return entryRefs.some((ref) => {
      const id = refId(ref)
      if (!id) return false
      const entry = entryPayloads[id]
      return isRecord(entry) && refId(entry.runRef) === runId
    })
  })
}

/**
 * Read a leaf value from a nested payload by dotted path (`$.a.b.c`).
 * Missing segments read undefined — the column renders its absent arm,
 * the value is never fabricated.
 */
export function readLeaf(payload: Record<string, unknown>, path: string): unknown {
  let cur: unknown = payload
  for (const seg of path.split('.')) {
    if (!isRecord(cur) || !(seg in cur)) return undefined
    cur = cur[seg]
  }
  return cur
}

/**
 * The full-column row projection (bait #9). Returns a column-key → display
 * value map for EVERY column the entry payload actually carries:
 *   - scalar leaves pass through verbatim (strings, numbers, booleans),
 *   - `position` (string OR {vial,tray}) projects to its leaf parts,
 *   - the `uninterpreted` string map projects to `uninterpreted.<key>`
 *     entries VERBATIM (unknown-is-unknown: never dropped, never renamed),
 *   - ref fields project to their id (the machine link is the record, not
 *     a copy of its fields),
 *   - `analysisRunRefs` projects to the ordered id list (append-only
 *     history, D5).
 * The caller renders the column set from the union of the schema's declared
 * entry fields and this map's keys — nothing is dropped to look tidy.
 */
export function entryRunTableRows(payload: EntryPayload): Map<string, unknown> {
  const rows = new Map<string, unknown>()
  const p = payload as Record<string, unknown>
  for (const [key, value] of Object.entries(p)) {
    if (value === undefined) continue
    if (key === 'uninterpreted' && isRecord(value)) {
      // The *uninterpreted* honesty arms survive verbatim (bait #9): each
      // vendor-supplied key becomes its own `uninterpreted.<key>` column.
      for (const [k, v] of Object.entries(value)) {
        if (v !== undefined) rows.set(`uninterpreted.${k}`, v)
      }
    } else if (key === 'analysisRunRefs' && Array.isArray(value)) {
      // Append-only history (D5 / bait #8): the ordered ref-id list.
      rows.set('analysisRunRefs', value.map((r) => refId(r) ?? '').filter(Boolean))
    } else if (key === 'position' && isRecord(value)) {
      // position is a fixed-shape object: vial + tray survive as leaves.
      for (const [k, v] of Object.entries(value)) {
        if (v !== undefined) rows.set(`position.${k}`, v)
      }
    } else if (isRecord(value) && (value.kind === 'record' || value.kind === 'ontology')) {
      // A machine link is a REF: project to the id only (never a field copy).
      rows.set(key, refId(value) ?? '')
    } else if (isRecord(value)) {
      // Any other object projects its leaves.
      for (const [k, v] of Object.entries(value)) {
        if (v !== undefined) rows.set(`${key}.${k}`, v)
      }
    } else {
      rows.set(key, value)
    }
  }
  return rows
}

/**
 * The DISPLAY projection the table renders: one `{ key, text }` cell per
 * column the payload carries, formatted for human reading:
 *   - `position` -> positionText (string or "Vial <vial> (<tray>)"),
 *   - `amount`/`istdAmount` -> amountText (unit stated; the *Uninterpreted
 *     siblings format the bare number with the unit explicitly unknown),
 *   - `uninterpreted.<k>` -> the vendor value verbatim (bait #9),
 *   - ref fields -> the record id; `analysisRunRefs` -> the ordered id list,
 *   - scalars -> their string form (booleans read "true"/"false" — the raw
 *     payload value, never a faked state word).
 * Column keys ARE the payload keys (the testids + the full-column clause
 * both hang off them). The raw-value twin (entryRunTableRows) is kept for
 * programmatic use; the display twin is what the chrome renders.
 */
export function entryDisplayColumns(payload: EntryPayload): Array<{ key: string; text: string }> {
  const p = payload as Record<string, unknown>
  const out: Array<{ key: string; text: string }> = []
  const push = (key: string, value: unknown, text?: string) => {
    if (value === undefined || value === null) return
    out.push({ key, text: text !== undefined ? text : String(value) })
  }
  for (const [key, value] of Object.entries(p)) {
    if (value === undefined) continue
    if (key === 'uninterpreted' && isRecord(value)) {
      for (const [k, v] of Object.entries(value)) push(`uninterpreted.${k}`, v)
    } else if (key === 'analysisRunRefs' && Array.isArray(value)) {
      const ids = value.map((r) => refId(r) ?? '').filter(Boolean)
      push(key, ids, ids.length > 0 ? ids.join(', ') : '—')
    } else if (key === 'position') {
      push(key, value, positionText(value as EntryPayload['position']))
    } else if (key === 'amount') {
      push(key, value, amountText(value as { value?: number; unit?: string }, payload.amountUninterpreted))
    } else if (key === 'istdAmount') {
      push(key, value, amountText(value as { value?: number; unit?: string }, payload.istdAmountUninterpreted))
    } else if (key === 'amountUninterpreted' || key === 'istdAmountUninterpreted') {
      push(key, value, amountText(undefined, value as number))
    } else if (isRecord(value) && (value.kind === 'record' || value.kind === 'ontology')) {
      push(key, value, refId(value) ?? '—')
    } else if (isRecord(value)) {
      for (const [k, v] of Object.entries(value)) push(`${key}.${k}`, v)
    } else {
      push(key, value)
    }
  }
  return out
}

/** positionText: the readable vial cell (string or {vial,tray}). */
export function positionText(position: EntryPayload['position']): string {
  if (position === undefined || position === null) return '—'
  if (typeof position === 'string') return position
  const vial = position.vial ?? ''
  const tray = position.tray ? ` (${position.tray})` : ''
  return vial ? `Vial ${vial}${tray}` : '—'
}

/**
 * amountText: the honest amount cell. A dimensioned quantity reads
 * "value unit"; the unknown-unit arm reads the raw number with the unit
 * EXPLICITLY stated as unknown (bait #9: a faked unit would falsify the
 * *Uninterpreted arm).
 */
export function amountText(amount: { value?: number; unit?: string } | undefined, amountUninterpreted?: number): string {
  if (amount && amount.value !== undefined) {
    return amount.unit ? `${amount.value} ${amount.unit}` : `${amount.value} (unit unknown)`
  }
  if (amountUninterpreted !== undefined) return `${amountUninterpreted} (unit unknown)`
  return '—'
}

/**
 * appendAnalysisRunRef (bait #8): the rerun-keeps-history merge. APPENDS the
 * new ref to the EXISTING array (preserving every prior ref) and dedupes by
 * id (the schema's uniqueItems). Returns a NEW array; the input is never
 * mutated. A completed analysis-run is NEVER touched here — this is the
 * run-sheet side only (the schema's append-only-by-convention guarantee).
 */
export function appendAnalysisRunRef(
  existing: RecordRef[] | undefined,
  newRef: RecordRef,
): RecordRef[] {
  const base: RecordRef[] = Array.isArray(existing) ? [...existing] : []
  if (base.some((r) => r.id === newRef.id)) return base
  return [...base, newRef]
}

/**
 * The Analyze handoff (D4, bait #10/#11): the pinned inputs come from the
 * server's VERIFY-FIRST analysis-inputs route (never client-resolved from
 * the ACQP payload) and the payload carries IDS ONLY — revisionRef, the
 * data-reference input ids, the title, and the revision-declared parameters.
 * No file bytes, no embedded YAML, no parameter defaults the revision does
 * not declare.
 */
export interface GcHandoffInput {
  title: string
  /** The analysis-revision recordId the run will be created against. */
  revisionId: string
  /** The pinned inputs from packageAnalysisInputs (signal + package drefs). */
  inputs: Record<string, { kind: 'record'; id: string; type: string }>
  /** The revision-declared parameters (from the GC-9 ParameterForm state). */
  parameters?: Record<string, unknown>
}

export interface GcHandoffPayload {
  title: string
  revisionRef: { kind: 'record'; type: 'analysis-revision'; id: string }
  inputs: Record<string, { kind: 'record'; id: string; type: string }>
  parameters?: Record<string, unknown>
}

/** Strip non-id noise from an inputs map so the handoff is ids-only. */
function idsOnlyInputs(
  inputs: Record<string, { kind: 'record'; id: string; type: string }>,
): Record<string, { kind: 'record'; id: string; type: string }> {
  const out: Record<string, { kind: 'record'; id: string; type: string }> = {}
  for (const [name, ref] of Object.entries(inputs)) {
    if (isRecord(ref) && typeof ref.id === 'string' && ref.id.length > 0) {
      out[name] = { kind: 'record', id: ref.id, type: typeof ref.type === 'string' ? ref.type : 'data-reference' }
    }
  }
  return out
}

export function buildGcHandoff(input: GcHandoffInput): GcHandoffPayload {
  const out: GcHandoffPayload = {
    title: input.title,
    revisionRef: { kind: 'record', type: 'analysis-revision', id: input.revisionId },
    inputs: idsOnlyInputs(input.inputs),
  }
  if (input.parameters && Object.keys(input.parameters).length > 0) {
    out.parameters = input.parameters
  }
  return out
}

/** Serialize a handoff into the `?gc=` param value. The router's
 *  `searchParams.get('gc')` returns the DECODED value, so the model works
 *  with the plain JSON string (URL-encoding is the URL layer's job, not the
 *  payload's — bait #10: ids only, no smuggling). */
export function gcHandoffUrlParam(payload: GcHandoffPayload): string {
  return JSON.stringify(payload)
}

/** Parse + validate a `?gc=` param back into a handoff (null when invalid). */
export function parseGcHandoffParam(raw: string | null): GcHandoffPayload | null {
  if (!raw) return null
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isRecord(value)) return null
  if (typeof value.title !== 'string') return null
  const revRef = value.revisionRef
  if (!isRecord(revRef) || revRef.kind !== 'record' || typeof revRef.id !== 'string' || revRef.id.length === 0) {
    return null
  }
  const inputs = value.inputs
  if (!isRecord(inputs)) return null
  const cleanInputs: Record<string, { kind: 'record'; id: string; type: string }> = {}
  for (const [name, ref] of Object.entries(inputs)) {
    if (!isRecord(ref) || ref.kind !== 'record' || typeof ref.id !== 'string' || ref.id.length === 0) {
      return null
    }
    cleanInputs[name] = {
      kind: 'record',
      id: ref.id,
      type: typeof ref.type === 'string' ? ref.type : 'data-reference',
    }
  }
  const out: GcHandoffPayload = {
    title: value.title,
    revisionRef: { kind: 'record', type: 'analysis-revision', id: revRef.id },
    inputs: cleanInputs,
  }
  if (isRecord(value.parameters) && Object.keys(value.parameters).length > 0) {
    out.parameters = value.parameters
  }
  return out
}

export { RECORD_REF_KEYS }
