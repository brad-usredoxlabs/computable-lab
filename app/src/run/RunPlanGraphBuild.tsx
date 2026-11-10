/**
 * RunPlanGraphBuild — a single-line control in the run-workspace toolbar.
 *
 * Resolves the PLANNED-RUN id from the run envelope (or uses the runId itself
 * when the record is a planned-run), renders a "Build plan graph" button, and
 * shows the returned graphId (with a reused marker) or the server's named
 * error code + message on failure. Mirrors RunProtocolList's style consts and
 * best-effort read rule.
 */

import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { apiClient } from '../shared/api/client'
import { ApiError } from '../shared/api/errors'

export interface RunPlanGraphBuildProps {
  runId: string
}

const wrapStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '0 8px' }
const controlStyle: CSSProperties = {
  fontSize: '11px', color: 'var(--cl-text)', background: 'transparent',
  border: '1px solid var(--cl-border)', borderRadius: '4px', padding: '0 6px', cursor: 'pointer',
}
const resultStyle: CSSProperties = { fontSize: '11px', color: 'var(--cl-text)', whiteSpace: 'nowrap' }
const reusedStyle: CSSProperties = { fontSize: '11px', color: 'var(--cl-text-dim)', fontStyle: 'italic' }
const errorStyle: CSSProperties = { fontSize: '11px', color: 'var(--cl-error)', whiteSpace: 'nowrap' }

/**
 * Resolve the planned-run id:
 *   — if the record kind is 'planned-run', use the runId itself
 *   — otherwise use payload.plannedRunRef.id
 *   — return null when neither applies
 */
async function resolvePlannedRunId(runId: string): Promise<string | null> {
  const resp = await apiClient.getRecordWithUI(runId)
  const payload = (resp.record?.payload ?? null) as Record<string, unknown> | null
  if (payload?.kind === 'planned-run') return runId
  const ref = payload?.plannedRunRef as { id?: string } | undefined
  if (typeof ref?.id === 'string' && ref.id.length > 0) return ref.id
  return null
}

export function RunPlanGraphBuild({ runId }: RunPlanGraphBuildProps) {
  const [plannedRunId, setPlannedRunId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ graphId: string; reused: boolean } | null>(null)
  const [failure, setFailure] = useState<{ code: string; message: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const id = await resolvePlannedRunId(runId)
        if (cancelled) return
        if (id) setPlannedRunId(id)
      } catch {
        // Best-effort read: nothing renderable
        if (!cancelled) setPlannedRunId(null)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [runId])

  const handleBuild = async () => {
    if (!plannedRunId) return
    setBusy(true)
    try {
      const body = await apiClient.buildPlanGraph(plannedRunId)
      setResult({ graphId: body.graphId, reused: body.reused === true })
    } catch (error) {
      if (ApiError.isApiError(error)) {
        setFailure({ code: error.code, message: error.message })
      } else {
        setFailure({ code: 'NETWORK', message: String(error) })
      }
    } finally {
      setBusy(false)
    }
  }

  // No planned-run → render nothing (same honesty rule as RunProtocolList).
  if (!plannedRunId) return null

  return (
    <div style={wrapStyle}>
      <button
        type="button"
        style={controlStyle}
        disabled={busy}
        onClick={handleBuild}
        data-testid="run-build-plan-graph"
      >
        Build plan graph
      </button>
      {result && (
        <>
          <span style={resultStyle}>{result.graphId}</span>
          {result.reused && <span style={reusedStyle}>reused</span>}
        </>
      )}
      {failure && (
        <span style={errorStyle} role="alert">
          {failure.code}: {failure.message}
        </span>
      )}
    </div>
  )
}
