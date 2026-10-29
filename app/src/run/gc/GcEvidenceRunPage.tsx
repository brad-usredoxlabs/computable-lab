/**
 * GC-13 gate-fix (D5, gate G7) — GcEvidenceRunPage: the landing surface for
 * a reciprocal claim -> analysis-run link.
 *
 * The defect (gate shot partB/shots/14-b3-g7-run-landed.png): the claim
 * workspace's Connections "Runs" row linked /runs/:runId — the Run·Design
 * workspace, the plate-design canvas that serves `run` records. An
 * ANALYSIS-RUN id landing there rendered "Click to choose labware" /
 * "No protocol attached" and none of the run's GC evidence context
 * (no GC results list, no evidence row, no gc-evidence-claim-link*).
 *
 * The fix is a ROUTE, not a re-implementation: the shipped GC-13
 * GcEvidenceHandoff (leg D) IS this run's GC evidence context — its body
 * renders the run's output-artifact chips (name + dataKind, the "Full
 * context" affordance into the SHIPPED GcProvenancePanel) AND the run's
 * evidence back-links — the gc-evidence-claim-link* anchors that loop
 * back to /claims/:id. This page mounts that ONE shipped component for a
 * direct analysis-run id:
 *
 *  - the record kind is VERIFIED from the resolved record (payload.kind,
 *    the existing getAnalysisRun route — the same read surface the GC-12
 *    results flow-back uses) before the GC chrome renders. A record that
 *    is not an analysis-run gets a NAMED refusal arm (id + actual kind),
 *    never the plate canvas, never invented context;
 *  - the hand-off is OPEN at mount (initialOpen): the evidence context is
 *    the POINT of the deep-link landing, so the back-links and the
 *    artifact chips are present without a second click. (In the GC-12
 *    results flow-back the component stays closed at mount — the D7 pin
 *    there is untouched; only this landing surface opts in.)
 *
 * Route: /gc-run/:runId (App.tsx). ClaimWorkspace's reciprocal row links
 * HERE (the run the evidence bundles' sources point at). No new record
 * kinds, no RunWorkspacePage resurrection, no AnalysisPage lines.
 */
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { AppShell } from '../../shared/shell'
import { apiClient } from '../../shared/api/client'
import { GcEvidenceHandoff } from './GcEvidenceHandoff'
import './GcEvidenceRunPage.css'

export function GcEvidenceRunPage() {
  const { runId } = useParams<{ runId: string }>()
  const [kind, setKind] = useState<string | null>(null)
  const [title, setTitle] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!runId) return
    let cancelled = false
    setKind(null)
    setTitle(null)
    setStatus(null)
    setError(null)
    // The run's record via the EXISTING getAnalysisRun route. payload.kind
    // verifies the record IS an analysis-run before the GC chrome renders
    // (the same kind gate RunWorkspacePage.tsx applies to the run sheet —
    // a non-run id there is the DNA case).
    apiClient
      .getAnalysisRun(runId)
      .then((res) => {
        if (cancelled) return
        const payload = res.record.payload as Record<string, unknown>
        const k = typeof payload.kind === 'string' ? payload.kind : null
        setKind(k)
        if (k !== 'analysis-run') {
          // Not an analysis-run: a NAMED refusal arm (the id + the actual
          // kind). Never the plate canvas, never invented context.
          setError(`'${runId}' is a '${k ?? 'unknown'}' record, not an analysis-run — no GC evidence context to show`)
          return
        }
        const t = typeof payload.title === 'string' && payload.title.trim() !== '' ? payload.title : null
        setTitle(t)
        const s = typeof payload.status === 'string' ? payload.status : null
        setStatus(s)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }, [runId])

  const content = (
    <div className="gc-evidence-run" data-testid="gc-evidence-run-page">
      <header className="gc-evidence-run__header">
        <div>
          <h1 className="gc-evidence-run__title">
            {title !== null ? title : runId}
            <span className="gc-evidence-run__kind">analysis-run</span>
          </h1>
          <span className="gc-evidence-run__id">{runId}</span>
        </div>
        {status !== null && (
          <span className="gc-evidence-run__status" data-testid="gc-evidence-run-status">
            {status}
          </span>
        )}
      </header>

      {error !== null ? (
        <p className="gc-evidence-run__error" data-testid="gc-evidence-run-error">
          {error}
        </p>
      ) : kind !== 'analysis-run' ? (
        <p className="gc-evidence-run__hint">Loading run…</p>
      ) : (
        <section className="gc-evidence-run__section" data-testid="gc-evidence-run-evidence">
          <h2 className="gc-evidence-run__section-title">GC evidence context</h2>
          {/* The SHIPPED hand-off (leg D): the run's output-artifact chips
              (name + dataKind; the "Full context" affordance into the
              shipped GcProvenancePanel; the "Add as evidence…" authoring
              form) AND the run's evidence back-links — the
              gc-evidence-claim-link* anchors back to /claims/:id (the G7
              loop closed both ways). Open at mount: the evidence context
              is the point of the deep-link landing, so the back-links are
              present without a second click. The isenId prop is the run
              id — the component scopes its testid with it (the GC-12 flow
              uses the entry id there). */}
          <GcEvidenceHandoff
            isenId={runId ?? ''}
            runId={runId ?? ''}
            onBundleCreated={() => undefined}
            initialOpen
          />
        </section>
      )}
    </div>
  )

  return (
    <AppShell brand="Analysis run" layout="workspace" leftPane={content} />
  )
}
