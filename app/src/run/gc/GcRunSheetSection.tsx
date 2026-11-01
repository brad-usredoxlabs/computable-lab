/**
 * GC-12 (deliverable B/C) — GcRunSheetSection: the additive GC run-sheet
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
 * The section renders the full-column table (GcRunTable), the per-entry
 * results flow-back, and the interactive chrome (GcSectionChrome: method
 * select, sample add, the per-entry GcAttachPanel attach slot, and the
 * Analyze handoff). A user action (sample add / attach / analyze) triggers a
 * RE-PROBE + entry refetch (onEntryUpdated) so the new row / ACQP ref /
 * appended analysis-run ref shows in the table — that refresh is
 * user-triggered, never a mount fetch.
 */
import { useEffect, useRef, useState } from 'react'
import { apiClient } from '../../shared/api/client'
import {
  findLinkedSequences,
  type EntryPayload,
  type SequencePayload,
  type AcquisitionPackagePayload,
} from './gcRunSheetModel'
import { GcRunTable, type GcRunTableEntry } from './GcRunTable'
import { GcSectionChrome, type GcChromeEntry } from './GcSectionChrome'
import { GcEvidenceHandoff } from './GcEvidenceHandoff'
import './gcRunSheet.css'

/** A rendered row: the fetched entry + its append-only analysis-run history. */
interface LinkedRow {
  recordId: string
  payload: EntryPayload
  analysisRunIds: string[]
}

/** The per-entry results flow-back row (D5): the append-only analysis-run
 *  history with each run's status (read verbatim from the record enum) and a
 *  link to /analysis?run=<id> (the GC-11 seam). GC-13 (D1, orch re-anchor):
 *  the evidence hand-off affordance mounts INSIDE this component — one
 *  GcEvidenceHandoff per analysis-run row (closed at mount, zero fetches).
 *  No new results chrome, no dead graph/ page revival (OQ-2). */
function GcResultsList({
  entry,
  status,
  onRefresh,
}: {
  entry: LinkedRow
  status: Record<string, string>
  onRefresh: () => void
}) {
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
            <GcEvidenceHandoff
              isenId={entry.recordId}
              runId={id}
              onBundleCreated={onRefresh}
            />
          </li>
        ))}
      </ul>
    </div>
  )
}

export function GcRunSheetSection({ runId }: { runId: string }) {
  const [sequences, setSequences] = useState<unknown[]>([])
  const [entries, setEntries] = useState<Record<string, EntryPayload>>({})
  // FAME-1 (OQ-2): the attached ACQP payloads, keyed by ACQP id — fetched ONE
  // getRecord per DISTINCT attached acquisitionPackageRef (deduped across
  // entries; the mount-fetch fence extension, rationale in the no-fetch
  // accounting test header). This is what lets the run sheet show the
  // acquisition status (aborted / stopped / unknown = visibly qualified) on
  // a FRESH mount — the entry payloads carry only the ACQP REF, not its
  // status. Read-only: no fetch is ever triggered by a render (the effect
  // keys on the joined distinct ids).
  const [acqpPayloads, setAcqpPayloads] = useState<Record<string, AcquisitionPackagePayload>>({})
  const [probed, setProbed] = useState(false)
  const [statuses, setStatuses] = useState<Record<string, Record<string, string>>>({})
  // The user-triggered refresh tick (sample add / attach / analyze): the
  // sequence probe re-runs (a user action, NOT a mount call — the D7 pin
  // counts MOUNT calls only) and the linked entries re-fetch, so the new
  // data shows (the appended entry ROW / the ACQP ref / the appended
  // analysis-run ref). The probe's on-mount call stays EXACTLY once per
  // runId; the refresh re-probe is gated on the user action.
  const [refreshTick, setRefreshTick] = useState(0)
  const refresh = () => setRefreshTick((t) => t + 1)
  // The dedupe ref (D7/bait #5): the MOUNT probe fires at most once per
  // runId — a re-render (e.g. after the entry fetch resolves) must NOT
  // re-fire it. A user-triggered refresh intentionally re-runs the probe
  // (keyed on runId+refreshTick; the mount call is the refreshTick===0 pass).
  const probeDoneRef = useRef<string | null>(null)

  // GC-12 fix-cycle-1 (D2): a runId change on the SAME component instance
  // (back/forward, OpenTabs, ProtocolTabPanel links — all the same
  // /runs/:runId route) must NOT leak the previous run's state. refreshTick
  // (state), the linked-entries map, and the dedupe ref all survive a
  // same-route param change, so a stale "last non-empty linkage" (and the
  // cross-run write it enables via the live chrome) could render run A's
  // sheet under run B's URL. Reset every per-run piece of state to a
  // fresh-mount value the moment runId changes. This is a render-time reset
  // (the documented "adjust state when a prop changes" idiom, guarded by
  // prevRunIdRef so it fires exactly once per change) rather than an effect,
  // so the new runId's MOUNT probe fires EXACTLY once (an effect reset would
  // race the probe effect's refreshTick key and double-fire it).
  const prevRunIdRef = useRef(runId)
  if (prevRunIdRef.current !== runId) {
    prevRunIdRef.current = runId
    setRefreshTick(0) // a new run starts at its MOUNT pass, not a refresh
    setEntries({}) // never show another run's entry payloads
    setAcqpPayloads({}) // never show another run's attached-package statuses
    setProbed(false)
    setSequences([])
    probeDoneRef.current = null // re-arm the dedupe for the new runId
  }

  // D1 probe (ONE listRecordsByKind on mount, deduped on runId). The payload
  // is typed at the use site (findLinkedSequences) — the client returns
  // untyped envelopes; we never widen the API surface.
  //
  // GC-12 bfix1 (browser-gate fix): the `probed` latch is the ONLY piece of
  // probe state that must NOT die with a cancelled pass. main.tsx:37 wraps
  // the app in <React.StrictMode> (the labware-fixture branch at main.tsx:17
  // is wrapped too), and the development build runs every
  // mount effect as mount → cleanup → re-mount. Stamping probeDoneRef BEFORE
  // the request (the pre-fix placement) made pass 1 the only pass to ever
  // fire the fetch — its cleanup set `cancelled`, its setSequences/setProbed
  // were discarded, and pass 2 early-returned on the already-stamped dedupe
  // ref: probed never flipped and the whole section rendered null in a real
  // browser. The latch is therefore stamped in `.finally` UNCONDITIONALLY —
  // idempotent on the surviving pass (StrictMode pass 2 re-fires the
  // idempotent GET and both passes converge to probed=true), and a re-render
  // with the same key still sees the stamped ref and does NOT re-fire (the
  // dedupe is preserved, not removed). setSequences stays cancelled-gated:
  // a cancelled pass must not write sequences, but the surviving pass's
  // fetch always lands the same payload (the probe is keyed on runId).
  useEffect(() => {
    const key = refreshTick === 0 ? runId : `${runId}@${refreshTick}`
    if (probeDoneRef.current === key) return
    let cancelled = false
    apiClient
      .listRecordsByKind('instrument-sequence', 500)
      .then((res) => {
        if (!cancelled) setSequences(res.records)
      })
      .catch(() => {
        /* the probe failed: the linkage falls back to the last non-empty
           result (never a fabricated sheet, never a flash to nothing on a
           refresh in-flight) */
      })
      .finally(() => {
        // The latch lands on WHICHEVER pass settles first — pass 1 under
        // StrictMode (its cancelled continuations above skip the setState,
        // the latch still stands) or the surviving pass otherwise.
        probeDoneRef.current = key
        setProbed(true)
      })
    return () => {
      cancelled = true
    }
  }, [runId, refreshTick])

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
  // The last NON-EMPTY linkage (render guard, REFRESH only): a user-triggered
  // re-probe in-flight must not flash the section to nothing (the user
  // action's result is what is landing). The MOUNT path is unaffected:
  // at refreshTick 0 an empty linkage renders NOTHING (bait #2, byte-
  // identical DNA).
  // GC-12 fix-cycle-1 (D2): the guard is SCOPED TO THE CURRENT runId — it
  // stores the runId the linkage was resolved for and the fallback is used
  // ONLY when that runId matches. After a runId change the guard is empty
  // (a new run has no prior linkage), so the section can NEVER render a
  // linkage whose sequences were resolved for a different runId.
  const linkedRef = useRef<{ forRunId: string; value: ReturnType<typeof findLinkedSequences> }>({
    forRunId: '',
    value: [],
  })
  if (linkedSequences.length > 0) linkedRef.current = { forRunId: runId, value: linkedSequences }
  const linked =
    refreshTick === 0 || linkedSequences.length > 0
      ? linkedSequences
      : linkedRef.current.forRunId === runId
        ? linkedRef.current.value
        : []

  // The distinct linked entry ids (in entryRefs order).
  const linkedEntryIds: string[] = []
  {
    const seen = new Set<string>()
    for (const seq of linked) {
      for (const ref of seq.payload.entryRefs ?? []) {
        if (!seen.has(ref.id)) {
          seen.add(ref.id)
          linkedEntryIds.push(ref.id)
        }
      }
    }
  }

  // Fetch the linked entries (one getRecord per distinct entryRef).
  // Re-fires on a user-triggered refresh (attach / sample-add / analyze
  // append changed the records) — never on its own.
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
  }, [linkedEntryIds.join(','), refreshTick])

  // FAME-1 (OQ-2): the DISTINCT attached ACQP ids (deduped across entries —
  // the fence extension: one getRecord per DISTINCT attached ACQP, each
  // ONCE). Derived from the entry payloads' acquisitionPackageRef; absent
  // refs are skipped, never invented.
  const linkedAcqpIds: string[] = []
  {
    const seen = new Set<string>()
    for (const id of linkedEntryIds) {
      const ref = entries[id]?.acquisitionPackageRef
      const acqpId = ref && typeof ref.id === 'string' && ref.id.length > 0 ? ref.id : undefined
      if (acqpId && !seen.has(acqpId)) {
        seen.add(acqpId)
        linkedAcqpIds.push(acqpId)
      }
    }
  }

  // Fetch the attached ACQP records (one getRecord per DISTINCT attached
  // ACQP). Re-fires on a user-triggered refresh (an attach added/changed an
  // ACQP ref) — never on its own. CANCEL-ON-UNMOUNT (mirror the entry-fetch
  // pattern above): a cancelled pass must not write payloads.
  useEffect(() => {
    if (linkedAcqpIds.length === 0) return
    let cancelled = false
    void (async () => {
      const fetched: Record<string, AcquisitionPackagePayload> = {}
      for (const id of linkedAcqpIds) {
        try {
          const env = await apiClient.getRecord(id)
          if (!cancelled) fetched[id] = env.payload as AcquisitionPackagePayload
        } catch {
          // A missing ACQP is skipped (never invented) — the row renders its
          // absent status arm (the "attached" id still shows).
        }
      }
      if (!cancelled) setAcqpPayloads((prev) => ({ ...prev, ...fetched }))
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedAcqpIds.join(','), refreshTick])

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
  if (linked.length === 0) return null

  const tableEntries: GcRunTableEntry[] = rows.map((r) => ({ recordId: r.recordId, payload: r.payload }))
  // The chrome's sequence header ref (the FIRST linked sequence — sample add
  // appends its new entry ref to the header's entryRefs).
  const firstSeq = linked[0]
  const sequenceRef = {
    recordId: firstSeq.recordId,
    entryRefs: (firstSeq.payload.entryRefs ?? []) as Array<{ kind: 'record'; id: string; type: string }>,
  }
  // FAME-1: each chrome entry also carries its attached ACQP payload (the
  // status + evidence DATA), so the qualification renders next to the
  // "attached: ACQP-…" line. Absent when the fetch hasn't landed (the row
  // shows the attach id, no status word — never a fabricated one).
  const chromeEntries: GcChromeEntry[] = rows.map((r) => ({
    recordId: r.recordId,
    payload: r.payload,
    // FAME-1 fix-run (D10): conditional spread — omit the key when there is no
    // attached package rather than setting it to `undefined` (the server-side
    // house pattern; exactOptionalPropertyTypes discipline).
    ...(r.payload.acquisitionPackageRef?.id
      ? { acquisitionPackage: acqpPayloads[r.payload.acquisitionPackageRef.id] }
      : {}),
  }))

  return (
    <section data-testid="gc-run-sheet" className="gc-run-sheet">
      <h2 data-testid="gc-run-sheet-title">
        {'GC run sheet ' + linked.map((s) => s.payload.title).filter(Boolean).join(' · ')}
      </h2>
      <GcRunTable entries={tableEntries} />
      {rows.map((row) => (
        <GcResultsList
          key={row.recordId}
          entry={row}
          status={statuses[row.recordId] ?? {}}
          onRefresh={refresh}
        />
      ))}
      <GcSectionChrome entries={chromeEntries} runId={runId} sequenceRef={sequenceRef} onEntryUpdated={refresh} />
    </section>
  )
}
