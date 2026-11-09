/**
 * GC-12 (deliverables C/D3/E) — GcSectionChrome: the run-sheet's interactive
 * affordances — method author/select (D3), sample add (D3), NAS attach (C,
 * the GcAttachPanel slot per entry), and the Analyze handoff (E).
 *
 * LAZY BY DESIGN (the D7 mount-accounting pin, bait #5): the section's probe
 * is the ONLY listRecordsByKind on mount (the GcRunSheetSection test asserts
 * exactly one). This chrome therefore does NOT fetch gc-methods /
 * analysis-revisions on mount — it fetches them only when the user opens the
 * "Configure" disclosure. Mount = zero calls from this component; every
 * fetch is user-triggered.
 *
 * D3 method author/select: a combobox over listRecordsByKind('gc-method')
 * (data-driven — the lane's gc-method records) + an "Author method" link to
 * the EXISTING /registry surface (the gc-method UI triplet — the manual-
 * entry provenance arms are GC-2's shipped surface, NOT re-built).
 * D3 sample add: an inline minimal form that mints the minimal
 * party→request→sample→entry chain via the EXISTING createRecord
 * (buildGcSampleAdd — the lane has 0 requests/samples, bait #12) and then
 * APPENDS the new entry ref to the sequence's entryRefs via updateRecord
 * (append-only — existing rows are never dropped).
 * C NAS attach: per entry WITHOUT an acquisitionPackageRef, a "Attach .D"
 * affordance opens the GcAttachPanel (GC-4 registration flow — the device
 * dropdown is CONFIG data, every failure token renders its named message).
 * The server glue PUTs the minted ACQP ref onto the entry; the panel's
 * onAttached triggers the section's refetch so the ref shows in the table.
 * E Analyze: a revision selector (listAnalysisRevisions) + a per-entry
 * Analyze that, for an entry carrying an acquisitionPackageRef, calls the
 * VERIFY-FIRST getPackageAnalysisInputs route (bait #11) and then CREATES
 * the analysis-run against the chosen revision with the pinned inputs,
 * APPENDING the new run ref to the entry's analysisRunRefs via
 * updateRecord + appendAnalysisRunRef (bait #8: a rerun KEEPS history —
 * prior refs are never dropped) and navigates /analysis?run=<id> (the
 * GC-11 seam — the created run IS the results surface). No execute on the
 * run-sheet — execute stays a click on /analysis (bait #5).
 *
 * Not-ready states render a STATED reason + a working authoring link — never
 * a disabled Analyze pretending (dead-chrome clause, bait #6).
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiClient } from '../../shared/api/client'
import { collectDefaults } from '../../analysis/ParameterForm'
import {
  appendAnalysisRunRef,
  type EntryPayload,
  type RecordRef,
  type AcquisitionPackagePayload,
  runLogDrefId,
  matchedAcquisitionLines,
} from './gcRunSheetModel'
import { buildGcSampleAdd } from './gcSheetCreate'
import { GcAttachPanel } from './GcAttachPanel'

/** One linked entry's payload (for the Analyze handoff + method/sample refs). */
export interface GcChromeEntry {
  recordId: string
  payload: EntryPayload
  /**
   * FAME-1: the attached acquisition-package payload (status + evidence
   * DATA), when the entry carries an acquisitionPackageRef AND the section
   * has fetched it. Absent when the entry has no package OR the fetch
   * hasn't landed — the qualification arm renders only what the record
   * actually says (never a fabricated status word).
   */
  acquisitionPackage?: AcquisitionPackagePayload
}

interface MethodRecord {
  recordId: string
  payload: { title?: string; name?: string }
}

interface RevisionRecord {
  recordId: string
  payload: { title?: string }
}

export function GcSectionChrome({
  entries,
  runId,
  sequenceRef,
  onEntryUpdated,
}: {
  entries: GcChromeEntry[]
  runId: string
  /** The sequence header (to append a new entry ref on sample-add). */
  sequenceRef: { recordId: string; entryRefs: Array<{ kind: 'record'; id: string; type: string }> } | null
  /** Called after a sample-add / attach / analyze-append so the section
   *  refetches the linked entries (the new row / ACQP ref / analysis-run
   *  ref then shows in the table). */
  onEntryUpdated: () => void
}) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [methods, setMethods] = useState<MethodRecord[]>([])
  const [revisions, setRevisions] = useState<RevisionRecord[]>([])
  const [methodId, setMethodId] = useState('')
  const [sampleLabel, setSampleLabel] = useState('')
  const [sampleVial, setSampleVial] = useState('')
  const [revisionId, setRevisionId] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  // The entries whose attach panel is OPEN (C): a disclosure per entry,
  // click-only — mounting the chrome never registers anything.
  const [attachOpen, setAttachOpen] = useState<Set<string>>(new Set())

  // LAZY: fetch gc-methods + analysis-revisions ONLY when the user opens the
  // disclosure (the section's mount accounting stays at exactly one
  // listRecordsByKind — the sequence probe).
  useEffect(() => {
    if (!open) return
    let cancelled = false
    void (async () => {
      try {
        const [m, r] = await Promise.all([
          apiClient.listRecordsByKind('gc-method', 500),
          apiClient.listAnalysisRevisions(),
        ])
        if (cancelled) return
        setMethods(m.records as unknown as MethodRecord[])
        setRevisions(r.revisions as unknown as RevisionRecord[])
      } catch {
        /* the not-ready arms render below */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open])

  // D3 sample add: mint party→request→sample→entry (buildGcSampleAdd) via
  // createRecord, then APPEND the entry ref to the sequence (updateRecord).
  const addSample = async () => {
    if (busy) {
      // GC-12 fix-cycle-3 (DIRFIX-3 minor 6): a click during an in-flight
      // write used to be a SILENT no-op (the browser-gate phase-3
      // reproduction: the sample add took >12 s and the Analyze click that
      // followed fired no request and showed no message). Now it is
      // VISIBLE — a named note on the ignored click, never a silent
      // swallow (the note line is the owner, one note per state).
      setNote('An action is already in progress — try again when it completes.')
      return
    }
    const label = sampleLabel.trim()
    const vial = sampleVial.trim()
    const method = methodId || methods[0]?.recordId || ''
    if (!label || !vial || !method) {
      setNote('Enter a sample label, a vial, and a method to add a row.')
      return
    }
    setBusy(true)
    // GC-12 fix-cycle-3 (DIRFIX-3 minor 5): ONE owner for the note line — a
    // NEW action clears the STALE note from a prior failure. All three chrome
    // actions clear at their start: sample add (here), analyze, and the
    // attach-panel register (via GcAttachPanel's onActionStart — the regate2
    // defect 5 shape: the add's validation note rendered beside the register's
    // PACKAGE_DEVICE_MISSING token, so two different failures looked like the
    // current action's).
    setNote(null)
    try {
      const { steps, entryRecordId } = buildGcSampleAdd({
        runId,
        gcMethodId: method,
        vial,
        sampleLabel: label,
        rand: Math.random().toString(36).slice(2, 8),
      })
      for (const step of steps) {
        await apiClient.createRecord(step.schemaId, step.payload)
      }
      if (sequenceRef) {
        const env = await apiClient.getRecord(sequenceRef.recordId)
        const payload = env.payload as Record<string, unknown> & { entryRefs?: unknown[] }
        const existing: unknown[] = Array.isArray(payload.entryRefs) ? payload.entryRefs : []
        payload.entryRefs = [
          ...existing,
          { kind: 'record', id: entryRecordId, type: 'instrument-sequence-entry' },
        ]
        await apiClient.updateRecord(sequenceRef.recordId, payload)
      }
      setSampleLabel('')
      setSampleVial('')
      onEntryUpdated()
    } catch (err) {
      setNote(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  // E Analyze (bait #8/#10/#11): for an entry with an acquisitionPackageRef:
  //  1. resolve the VERIFY-FIRST pinned inputs (the trust boundary — the
  //     analysis-inputs route, never client-side resolution),
  //  2. CREATE the analysis-run against the chosen revision with those
  //     pinned inputs (createAnalysisRun — the run sheet's own write),
  //  3. APPEND the new run ref to the entry's analysisRunRefs (append-only
  //     merge — a rerun keeps every prior ref; bait #8),
  //  4. navigate /analysis?run=<new id> (the GC-11 seam — the created run
  //     IS the results surface). No execute here — execute stays a click on
  //     /analysis (the no-execute accounting survives, bait #5).
  const analyze = async (entry: GcChromeEntry) => {
    if (busy) {
      // GC-12 fix-cycle-3 (DIRFIX-3 minor 6): a click during an in-flight
      // write used to be a SILENT no-op — now a NAMED note on the ignored
      // click (the note line is the owner, one note per state).
      setNote('An action is already in progress — try again when it completes.')
      return
    }
    const pkgId = entry.payload.acquisitionPackageRef?.id
    if (!pkgId) return
    if (!revisionId) {
      setNote('Select an analysis revision to analyze.')
      return
    }
    setBusy(true)
    // GC-12 fix-cycle-3 (DIRFIX-3 minor 5): ONE owner for the note line — a
    // NEW action clears the STALE note from a prior failure (see addSample —
    // the note line is the owner, all three chrome actions clear at start).
    setNote(null)
    try {
      // The verify-first trust boundary (bait #11).
      const inputs = await apiClient.getPackageAnalysisInputs(pkgId)
      // The pinned handoff title (ids only — bait #10) names the entry.
      const title = `GC run-sheet ${entry.recordId}`
      // GC-12 fix-cycle-1 (D3, architect ruling OPT-A / amend V7(f)): the
      // created run carries the revision's parameter defaults. The run sheet
      // does NOT render a ParameterForm (Flow A: it creates and lands the
      // created run), so the created run would otherwise carry NO parameters.
      // Get the selected revision, collect its parameterSchema defaults
      // (collectDefaults — the same source the GC-9 form pre-fills from), and
      // pass them as the run's parameters (set ONLY when non-empty — a
      // revision with no declared defaults creates a run with none, never a
      // fabricated `{}`).
      const revEnv = await apiClient.getRecord(revisionId)
      const revPayload = revEnv.payload as { parameterSchema?: Record<string, unknown> }
      const params = collectDefaults(revPayload.parameterSchema)
      const res = await apiClient.createAnalysisRun({
        title,
        revisionRef: { kind: 'record', id: revisionId, type: 'analysis-revision' },
        // GC-12 fix-cycle-3 (DIRFIX-1, architect ruling B-amended): the
        // handoff pins the FILE-level data-reference ONLY. The verify-first
        // route returns { signal, package } — `package` is the DIRECTORY-kind
        // manifest DREF (dataKind signal-collection), NOT a runner-consumable
        // input (provisionInputs streams file-kind refs only; a directory pin
        // is a named INPUT_IS_DIRECTORY refusal, the runner's A guard).
        // Provenance is not collapsed: the entry's acquisitionPackageRef →
        // ACQP record carries the manifest + per-member file DREFs; the run
        // consumes only what the engine reads (the role-resolved member file).
        // The title names the entry — the run's provenance anchor.
        inputs: {
          signal: { kind: 'record', id: inputs.signal.id, type: 'data-reference' },
        },
        ...(Object.keys(params).length > 0 ? { parameters: params } : {}),
      })
      if (!res.recordId) {
        throw new Error('The analysis-run create returned no record id.')
      }
      // Append the new run ref to the entry's history (bait #8: prior refs
      // survive — appendAnalysisRunRef never drops).
      const env = await apiClient.getRecord(entry.recordId)
      const payload = env.payload as Record<string, unknown> & { analysisRunRefs?: RecordRef[] }
      payload.analysisRunRefs = appendAnalysisRunRef(
        Array.isArray(payload.analysisRunRefs) ? payload.analysisRunRefs : undefined,
        { kind: 'record', id: res.recordId, type: 'analysis-run' },
      )
      await apiClient.updateRecord(entry.recordId, payload)
      onEntryUpdated()
      navigate(`/analysis?run=${encodeURIComponent(res.recordId)}`)
    } catch (err) {
      setNote(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="gc-chrome" data-testid="gc-chrome">
      <button type="button" data-testid="gc-chrome-toggle" onClick={() => setOpen((o) => !o)}>
        {open ? 'Hide method / samples / attach / analyze' : 'Configure method / samples / attach / analyze'}
      </button>
      {!open ? null : (
        <div className="gc-chrome__body" data-testid="gc-chrome-body">
          {methods.length === 0 ? (
            <p className="gc-chrome__notready" data-testid="gc-method-notready">
              No gc-methods are configured.{' '}
              <a href="/registry" data-testid="gc-method-author">
                Author a method in the registry
              </a>{' '}
              (the gc-method manual-entry provenance arms).
            </p>
          ) : (
            <>
              <label htmlFor="gc-method-select">Method</label>
              <select id="gc-method-select" data-testid="gc-method-select" value={methodId} onChange={(e) => setMethodId(e.target.value)}>
                <option value="">Select gc-method…</option>
                {methods.map((m) => (
                  <option key={m.recordId} value={m.recordId}>
                    {m.payload.name ?? m.payload.title ?? m.recordId}
                  </option>
                ))}
              </select>
              <a href="/registry" data-testid="gc-method-author">
                Author method
              </a>
            </>
          )}

          <div className="gc-chrome__sample" data-testid="gc-sample-add">
            <input data-testid="gc-sample-label" placeholder="sample label" value={sampleLabel} onChange={(e) => setSampleLabel(e.target.value)} />
            <input data-testid="gc-sample-vial" placeholder="vial" value={sampleVial} onChange={(e) => setSampleVial(e.target.value)} />
            <button type="button" data-testid="gc-sample-add-btn" onClick={() => void addSample()}>
              {busy ? 'Adding…' : 'Add sample row'}
            </button>
          </div>

          {entries.length === 0 ? (
            <p className="gc-chrome__notready" data-testid="gc-analyze-notready">
              No entries — add a sample row to attach and analyze.
            </p>
          ) : (
            <>
              <label htmlFor="gc-analyze-rev">Analysis revision</label>
              {revisions.length === 0 ? (
                <p className="gc-chrome__notready" data-testid="gc-revision-notready">
                  No analysis revisions are available —{' '}
                  <a href="/analysis" data-testid="gc-revision-author">
                    author one on the analysis page
                  </a>{' '}
                  before running an analysis from this sheet.
                </p>
              ) : (
                <select id="gc-analyze-rev" data-testid="gc-analyze-rev" value={revisionId} onChange={(e) => setRevisionId(e.target.value)}>
                  <option value="">Select analysis revision…</option>
                  {revisions.map((r) => (
                    <option key={r.recordId} value={r.recordId}>
                      {r.payload.title ?? r.recordId}
                    </option>
                  ))}
                </select>
              )}
              {entries.map((e) => {
                const hasPkg = Boolean(e.payload.acquisitionPackageRef?.id)
                // FAME-1 (D3): the acquisition-status qualification, next to
                // the "attached: ACQP-…" line. It renders ONLY DATA the
                // package record carries (no interpretation in TSX): the
                // status word, the /record/<RUN.LOG DREF> evidence link
                // (OQ-1), and the verbatim matched lines. Which statuses are
                // VISIBLY QUALIFIED is the DECLARED `acquisitionStatusQualified`
                // flag (the rule file's statusQualification, stamped at
                // registration) — a DATA decision, NEVER a hardcoded
                // status-literal branch (the D3 defect). A qualified status
                // renders a non-collapsing warning line; a non-qualified one a
                // quiet word. The package payload is absent until the section's
                // ACQP fetch lands — then only the attach id shows.
                // Attach/Analyze stay available in ALL cases (bait #10): this
                // is extra visible data, never a gate.
                const acqpStatus = e.acquisitionPackage?.acquisitionStatus
                const acqpStatusQualified =
                  e.acquisitionPackage?.acquisitionStatusQualified === true
                const runLogDref = e.acquisitionPackage ? runLogDrefId(e.acquisitionPackage) : undefined
                const matchedLines = e.acquisitionPackage ? matchedAcquisitionLines(e.acquisitionPackage) : []
                const noEvidenceReason = e.acquisitionPackage?.acquisitionStatusEvidence?.noEvidenceReason
                return (
                  <div key={e.recordId} className="gc-chrome__row" data-testid={`gc-analyze-entry-${e.recordId}`}>
                    <span>{e.recordId}</span>
                    {!hasPkg && (
                      <button
                        type="button"
                        data-testid={`gc-attach-toggle-${e.recordId}`}
                        onClick={() =>
                          setAttachOpen((prev) => {
                            const next = new Set(prev)
                            if (next.has(e.recordId)) next.delete(e.recordId)
                            else next.add(e.recordId)
                            return next
                          })
                        }
                      >
                        {attachOpen.has(e.recordId) ? 'Hide attach' : 'Attach .D'}
                      </button>
                    )}
                    {hasPkg ? (
                      <>
                        <span className="gc-chrome__notready">
                          attached: {e.payload.acquisitionPackageRef?.id}
                        </span>
                        {acqpStatus && (
                          <span
                            className={
                              acqpStatusQualified
                                ? 'gc-acqp-status gc-acqp-status--qualified'
                                : 'gc-acqp-status'
                            }
                            data-testid={`gc-acqp-status-${e.recordId}`}
                          >
                            acquisition status: {acqpStatus}
                            {runLogDref && (
                              <>
                                {' · '}
                                <a
                                  href={`/record/${encodeURIComponent(runLogDref)}`}
                                  data-testid={`gc-acqp-status-link-${e.recordId}`}
                                  title="RUN.LOG evidence (the matched lines are on the package record)"
                                >
                                  RUN.LOG evidence
                                </a>
                              </>
                            )}
                          </span>
                        )}
                        {acqpStatusQualified && (
                          <details
                            className="gc-acqp-status__evidence"
                            data-testid={`gc-acqp-status-evidence-${e.recordId}`}
                          >
                            <summary>
                              {matchedLines.length > 0
                                ? `matched RUN.LOG lines (${matchedLines.length})`
                                : `no RUN.LOG evidence (${noEvidenceReason ?? 'reason unstated'})`}
                            </summary>
                            {matchedLines.length > 0 ? (
                              <ul>
                                {matchedLines.map((m, i) => (
                                  <li key={i} title={`matched by rule ${m.ruleId} (line ${m.lineIndex})`}>
                                    {m.line}
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p>{noEvidenceReason ?? 'no evidence recorded'}</p>
                            )}
                          </details>
                        )}
                        <button type="button" data-testid={`gc-analyze-btn-${e.recordId}`} onClick={() => void analyze(e)}>
                          Analyze
                        </button>
                      </>
                    ) : attachOpen.has(e.recordId) ? (
                      <GcAttachPanel
                        entryId={e.recordId}
                        onActionStart={() => setNote(null)}
                        onAttached={() => {
                          setAttachOpen((prev) => {
                            const next = new Set(prev)
                            next.delete(e.recordId)
                            return next
                          })
                          onEntryUpdated()
                        }}
                      />
                    ) : (
                      <span className="gc-chrome__notready" data-testid={`gc-analyze-attachfirst-${e.recordId}`}>
                        Attach a .D (GC-4 registration) to analyze this entry.
                      </span>
                    )}
                  </div>
                )
              })}
            </>
          )}
          {note ? <p className="gc-chrome__note" data-testid="gc-chrome-note">{note}</p> : null}
        </div>
      )}
    </div>
  )
}
