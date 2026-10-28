/**
 * GC-12 (deliverable B/E) — GcRunSheetSection: the additive GC run-sheet
 * section on /runs/:runId.
 *
 * D1 gating (bait #2): the section renders NOTHING when the probe finds no
 * sequence linking the run — the DNA case is byte-identical (no GC chrome at
 * all). The probe is the ONLY listRecordsByKind call, fired EXACTLY once per
 * runId (deduped via a done-ref; D7/bait #5). Linked entries are fetched via
 * getRecord (one per distinct entryRef), NEVER a second listRecordsByKind.
 *
 * Mount is read-only: it NEVER calls registerAcquisitionPackage,
 * createAnalysisRun, or executeAnalysisRun (register/analyze/execute are
 * click-only — the AnalysisPage no-execute idiom transplanted). Results
 * flow-back (D5) reads entry.analysisRunRefs via getAnalysisRun (existing
 * route); the append-only history is the entry's own data (bait #8).
 *
 * This container owns the probe + the table (GcRunTable) + the per-entry
 * results flow-back. The method/sample/attach/analyze chrome lives in the
 * sibling components (GcMethodSelect, GcSampleAdd, GcAttachPanel).
 */
import { useEffect, useRef, useState } from 'react'
import { apiClient } from '../../shared/api/client'
import {
  findLinkedSequences,
  type EntryPayload,
  type SequencePayload,
} from './gcRunSheetModel'
import { GcRunTable, type GcRunTableEntry } from './GcRunTable'

/** A rendered row: the fetched entry + its append-only analysis-run history. */
interface LinkedRow {
  recordId: string
  payload: EntryPayload
  analysisRunIds: string[]
}

/** The per-entry results flow-back row (D5): the append-only analysis-run
 *  history with each run's status (read verbatim from the record enum) and a
 *  link to /analysis?run=<id> (the GC-11 seam). No new results chrome, no
 *  dead graph/ page revival (OQ-2). */
function GcResultsList({ entry, status }: { entry: LinkedRow; status: Record<string, string> }) {
  if (entry.analysisRunIds.length === 0) return null
  return (
    <div data-testid={`gc-results-${entry.recordId}`} className="gc-results">
      <span className="gc-results__label">Analysis runs</span>
      <ul>
        {entry.analysisRunIds.map((id) => (
          <li key={id} data-testid={`gc-result-${entry.recordId}-${id}`}>
            <a href={`/analysis?run=${encodeURIComponent(id)}`}>{id}</a>
            <span data-testid={`gc-result-status-${entry.recordId}-${id}`}>
              {status[id] ?? 'unknown'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function GcRunSheetSection({ runId }: { runId: string }) {
  const [sequences, setSequences] = useState<unknown[]>([])
  const [entries, setEntries] = useState<Record<string, EntryPayload>>({})
  const [probed, setProbed] = useState(false)
  const [statuses, setStatuses] = useState<Record<string, Record<string, string>>>({})
  // The dedupe ref (D7/bait #5): the probe fires at most once per runId — a
  // re-render (e.g. after the entry fetch resolves) must NOT re-fire it.
  const probeDoneRef = useRef<string | null>(null)

  // D1 probe (ONE listRecordsByKind, deduped on runId). The payload is typed
  // at the use site (findLinkedSequences) — the client returns untyped
  // envelopes; we never widen the API surface.
  useEffect(() => {
    if (probeDoneRef.current === runId) return
    let cancelled = false
    probeDoneRef.current = runId
    apiClient
      .listRecordsByKind('instrument-sequence', 500)
      .then((res) => {
        if (!cancelled) {
          setSequences(res.records)
          setProbed(true)
        }
      })
      .catch(() => {
        if (!cancelled) setProbed(true)
      })
    return () => {
      cancelled = true
    }
  }, [runId])

  // The linkage (header runRef OR entry runRef — the entry payload is the
  // schema-guaranteed REQUIRED runRef). Zero links = render NOTHING (bait #2).
  const linkedSequences = probed
    ? findLinkedSequences(
        sequences.map((r) => {
          const env = r as { recordId: string; payload: SequencePayload }
          return { recordId: env.recordId, payload: env.payload }
        }),
        runId,
        entries,
      )
    : []

  // The distinct linked entry ids (in entryRefs order).
  const linkedEntryIds: string[] = []
  {
    const seen = new Set<string>()
    for (const seq of linkedSequences) {
      for (const ref of seq.payload.entryRefs ?? []) {
        if (!seen.has(ref.id)) {
          seen.add(ref.id)
          linkedEntryIds.push(ref.id)
        }
      }
    }
  }

  // Fetch the linked entries (one getRecord per distinct entryRef).
  useEffect(() => {
    if (linkedEntryIds.length === 0) return
    let cancelled = false
    void (async () => {
      const fetched: Record<string, EntryPayload> = {}
      for (const id of linkedEntryIds) {
        try {
          const env = await apiClient.getRecord(id)
          if (!cancelled) fetched[id] = env.payload as EntryPayload
        } catch {
          // A missing entry is skipped (never invented) — the row renders its
          // absent arms; the linkage still holds via the header runRef.
        }
      }
      if (!cancelled) setEntries((prev) => ({ ...prev, ...fetched }))
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedEntryIds.join(',')])

  // The rendered rows (linked entries that resolved to payloads).
  const rows: LinkedRow[] = linkedEntryIds.flatMap((id) => {
    const payload = entries[id]
    if (!payload) return []
    const refs = Array.isArray(payload.analysisRunRefs) ? payload.analysisRunRefs : []
    return [
      {
        recordId: id,
        payload,
        analysisRunIds: refs.map((r) => r.id).filter((x): x is string => typeof x === 'string'),
      },
    ]
  })
  const runIdsKey = rows.map((r) => `${r.recordId}:${r.analysisRunIds.join('|')}`).join(',')

  // D5 results flow-back: read each row's analysis-run statuses via the
  // EXISTING getAnalysisRun route (read-only; writes are the Analyze/execute
  // affordances, never here).
  useEffect(() => {
    const needed: Array<{ rowId: string; runId: string }> = []
    for (const row of rows) {
      for (const rid of row.analysisRunIds) needed.push({ rowId: row.recordId, runId: rid })
    }
    if (needed.length === 0) return
    let cancelled = false
    void (async () => {
      const next: Record<string, Record<string, string>> = {}
      for (const { rowId, runId: rid } of needed) {
        try {
          const { record } = await apiClient.getAnalysisRun(rid)
          const status = (record.payload as Record<string, unknown>).status
          if (!cancelled) next[rowId] = { ...(next[rowId] ?? {}), [rid]: typeof status === 'string' ? status : 'unknown' }
        } catch {
          // A missing run shows its "unknown" arm — never a fabricated status.
        }
      }
      if (!cancelled) setStatuses((prev) => {
        const merged: Record<string, Record<string, string>> = { ...prev }
        for (const [k, v] of Object.entries(next)) merged[k] = { ...merged[k], ...v }
        return merged
      })
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runIdsKey])

  // D1/bait #2: zero linked sequences = NOTHING (the DNA case, byte-identical).
  if (linkedSequences.length === 0) return null

  const tableEntries: GcRunTableEntry[] = rows.map((r) => ({ recordId: r.recordId, payload: r.payload }))

  return (
    <section data-testid="gc-run-sheet" className="gc-run-sheet">
      <h2 data-testid="gc-run-sheet-title">
        {'GC run sheet ' + linkedSequences.map((s) => s.payload.title).filter(Boolean).join(' · ')}
      </h2>
      <GcRunTable entries={tableEntries} />
      {rows.map((row) => (
        <GcResultsList key={row.recordId} entry={row} status={statuses[row.recordId] ?? {}} />
      ))}
    </section>
  )
}
