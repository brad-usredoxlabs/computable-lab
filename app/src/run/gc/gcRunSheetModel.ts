/**
 * GC-12 (deliverable A) — the GC run-sheet model: PURE functions over the
 * instrument-sequence / instrument-sequence-entry record payloads.
 *
 * No fetch, no React, no DOM, no config. The component layer
 * (GcRunSheetSection) owns the probe accounting pin (D7); this module owns
 * the LINKING rule, the FULL-COLUMN row projection (bait #9: every declared
 * entry column incl. the *Uninterpreted / uninterpreted honesty arms), and
 * the append-only analysisRunRefs merge (bait #8: rerun keeps history).
 *
 * (The `?gc=` Analyze handoff — buildGcHandoff / gcHandoffUrlParam /
 * parseGcHandoffParam / GcHandoffInput / GcHandoffPayload — was DELETED in
 * fix-cycle-1 per the architect ruling GC12-D3-answer (OPT-A): the run sheet
 * creates the analysis run in place (Flow A) and lands /analysis?run=<id>;
 * the ?gc= prefill path was the loser and its removal is the no-dead-chrome
 * clause. The created run's parameters come from the revision's
 * parameterSchema defaults (collectDefaults) — see GcSectionChrome.analyze.)
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

/**
 * FAME-1 — the acquisition-package payload (schema/knowledge/
 * acquisition-package). The status + evidence fields are DATA the
 * registration stamps at attach time (strict-UTF-16 RUN.LOG decode + the
 * declared rule file); the run sheet READS them, it never re-derives them
 * (no interpretation in TSX — the classification is the record's own).
 * `acquisitionStatus`/`evidence` are optional: a package registered before
 * FAME-1 carries neither.
 */
export interface AcquisitionPackagePayload {
  kind?: string
  id?: string
  title?: string
  storageDeviceId?: string
  directoryKey?: string
  files?: Array<{ relativePath: string; role: string; dataReferenceRef?: RecordRef }>
  signalCollectionRef?: RecordRef
  sampleRef?: RecordRef
  state?: string
  acquisitionStatus?: 'completed' | 'aborted' | 'stopped-by-user' | 'unknown'
  /**
   * FAME-1 (D3): the DECLARED run-sheet qualification for acquisitionStatus
   * (the rule file's `statusQualification`, stamped at registration — DATA,
   * not code). The chrome renders THIS flag to decide visibly-qualified vs
   * quiet word; it never branches on the status literal in TSX. Absent on
   * packages registered before FAME-1.
   */
  acquisitionStatusQualified?: boolean
  acquisitionStatusEvidence?: {
    /**
     * FAME-1 FIX2 (D5, mirror the schema): the ruleset identity is present
     * ONLY when the rule file is readable — the degenerate
     * rule-file-missing arm stamps an ABSENCE-SHAPED (empty) ruleset
     * (acquisitionPackageStatus.ts, `ruleset: {}`), so every member is
     * optional on a legitimate record (the schema
     * acquisition-package.schema.yaml declares the same).
     */
    ruleset: { id?: string; version?: string | number; sourceFile?: string }
    sourceMember: { relativePath: string }
    decode: { encoding: string; bomPresent: boolean }
    matched: Array<{ line: string; ruleId: string; lineIndex: number }>
    noEvidenceReason?: string
  }
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

export { RECORD_REF_KEYS }

/**
 * FAME-1 — the RUN.LOG data-reference id for an acquisition package: the
 * `files[]` item whose role is `run_log`, its `dataReferenceRef.id`. This is
 * the /record/<DREF> the run-sheet evidence link points at (OQ-1: the generic
 * record host — there is NO raw-blob route for the log bytes). Returns
 * undefined when the package has no run_log file (the absent arm: the link
 * is simply not rendered, the status word still is).
 */
export function runLogDrefId(payload: AcquisitionPackagePayload): string | undefined {
  const files = Array.isArray(payload.files) ? payload.files : []
  const runLog = files.find((f) => f.role === 'run_log')
  const ref = runLog?.dataReferenceRef
  return ref && typeof ref.id === 'string' && ref.id.length > 0 ? ref.id : undefined
}

/**
 * FAME-1 — the verbatim matched RUN.LOG lines on the package's status
 * evidence (the WHY a human reads instead of a byte-serving route). Empty
 * when there is no evidence or nothing matched (the noEvidenceReason arm).
 * Reads DATA verbatim — never rewrites or drops a line (bait #7).
 */
export function matchedAcquisitionLines(payload: AcquisitionPackagePayload): Array<{ line: string; ruleId: string; lineIndex: number }> {
  const ev = payload.acquisitionStatusEvidence
  const matched = ev?.matched
  return Array.isArray(matched) ? matched : []
}
