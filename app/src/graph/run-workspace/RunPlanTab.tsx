import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiClient, type ProtocolContextResponse, type RunWorkspaceResponse } from '../../shared/api/client'
import type { RunWorkspaceSummary } from '../hooks/useRunWorkspace'

interface RunPlanTabProps {
  summary: RunWorkspaceSummary
  workspace: RunWorkspaceResponse | null
  onRefresh?: () => Promise<void>
}

function refId(value: unknown): string | null {
  if (typeof value === 'string' && value.length > 0) return value
  if (value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'string') {
    return (value as { id: string }).id
  }
  return null
}

function titleForRecord(record: ProtocolContextResponse['projectTemplates'][number]): string {
  const payload = record.payload as Record<string, unknown>
  return typeof payload.title === 'string' ? payload.title : record.recordId
}

function kindForRecord(record: ProtocolContextResponse['projectTemplates'][number]): string {
  const payload = record.payload as Record<string, unknown>
  return typeof payload.kind === 'string' ? payload.kind : 'record'
}

export function RunPlanTab({ summary, workspace, onRefresh }: RunPlanTabProps) {
  const navigate = useNavigate()
  const [context, setContext] = useState<ProtocolContextResponse | null>(null)
  const [loadingContext, setLoadingContext] = useState(false)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const runPayload = (workspace?.run?.payload ?? {}) as Record<string, unknown>
  const studyId = typeof runPayload.studyId === 'string' ? runPayload.studyId : undefined
  const experimentId = typeof runPayload.experimentId === 'string' ? runPayload.experimentId : undefined
  const methodEventGraphId = typeof runPayload.methodEventGraphId === 'string' ? runPayload.methodEventGraphId : null
  const plannedRunId = refId(runPayload.plannedRunRef)
  const localProtocolId = refId(runPayload.localProtocolRef)
  const deckLock = runPayload.methodDeckLock && typeof runPayload.methodDeckLock === 'object'
    ? runPayload.methodDeckLock as Record<string, unknown>
    : null

  useEffect(() => {
    let cancelled = false
    setLoadingContext(true)
    apiClient.getProtocolContext({ runId: summary.runId, ...(studyId ? { studyId } : {}), ...(experimentId ? { experimentId } : {}) })
      .then((result) => {
        if (!cancelled) setContext(result)
      })
      .catch((err: unknown) => {
        if (!cancelled) setActionError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setLoadingContext(false)
      })
    return () => {
      cancelled = true
    }
  }, [summary.runId, studyId, experimentId])

  const attachableProtocols = useMemo(() => {
    const records = [...(context?.experimentProtocols ?? []), ...(context?.projectTemplates ?? [])]
    const seen = new Set<string>()
    return records.filter((record) => {
      const kind = kindForRecord(record)
      if (kind !== 'protocol' && kind !== 'local-protocol') return false
      if (seen.has(record.recordId)) return false
      seen.add(record.recordId)
      return true
    })
  }, [context])

  const useProtocol = async (protocolId: string) => {
    setBusyId(protocolId)
    setActionError(null)
    setActionMessage(null)
    try {
      const result = await apiClient.useProtocolInRun({
        protocolId,
        runId: summary.runId,
        ...(studyId ? { studyId } : {}),
        ...(experimentId ? { experimentId } : {}),
      })
      setActionMessage(`Attached ${result.plannedRunId}`)
      await onRefresh?.()
      if (studyId) {
        navigate(`/project/${encodeURIComponent(studyId)}/event-graph/${encodeURIComponent(result.methodEventGraphId)}`)
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to attach protocol')
    } finally {
      setBusyId(null)
    }
  }

  const promote = async () => {
    setBusyId('promote')
    setActionError(null)
    setActionMessage(null)
    try {
      const result = await apiClient.promoteRunMethodToProjectTemplate({
        runId: summary.runId,
        ...(studyId ? { studyId } : {}),
      })
      setActionMessage(`Promoted ${result.record.recordId}`)
      await onRefresh?.()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to promote run method')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="run-workspace-tab-grid">
      <section className="run-workspace-card">
        <h2>Plan</h2>
        <p>The current plate editor remains the central authoring surface. Use Plan mode for transfers, additions, reads, and platform-aware setup.</p>
        <button
          type="button"
          className="run-workspace-card__button"
          disabled={!studyId || !methodEventGraphId}
          onClick={() => {
            if (studyId && methodEventGraphId) {
              navigate(`/project/${encodeURIComponent(studyId)}/event-graph/${encodeURIComponent(methodEventGraphId)}`)
            }
          }}
        >
          Open method graph
        </button>
      </section>

      <section className="run-workspace-card">
        <h2>Run Method</h2>
        <ul className="run-workspace-protocol-list">
          <li><strong>Planned run</strong><span>{plannedRunId ?? 'None'}</span></li>
          <li><strong>Event graph</strong><span>{methodEventGraphId ?? 'None'}</span></li>
          <li><strong>Local protocol</strong><span>{localProtocolId ?? 'None'}</span></li>
          <li><strong>Deck lock</strong><span>{deckLock ? `${String(deckLock.platformId ?? 'platform')} / ${String(deckLock.variantId ?? 'variant')}` : 'Manual/open deck'}</span></li>
        </ul>
        {methodEventGraphId ? (
          <button type="button" className="run-workspace-card__button" onClick={promote} disabled={busyId === 'promote'}>
            Promote to project template
          </button>
        ) : null}
      </section>

      <section className="run-workspace-card">
        <h2>Available Protocols</h2>
        {loadingContext ? (
          <p>Loading protocols…</p>
        ) : attachableProtocols.length === 0 ? (
          <p>No project or experiment protocols are available for this run.</p>
        ) : (
          <ul className="run-workspace-protocol-list">
            {attachableProtocols.map((record) => (
              <li key={record.recordId}>
                <span>
                  <strong>{titleForRecord(record)}</strong>
                  <small>{record.recordId} · {kindForRecord(record)}</small>
                </span>
                <button
                  type="button"
                  className="run-workspace-card__button"
                  onClick={() => void useProtocol(record.recordId)}
                  disabled={Boolean(methodEventGraphId) || busyId === record.recordId}
                  title={methodEventGraphId ? 'This run already has an attached method' : `Use ${titleForRecord(record)} in this run`}
                >
                  Use in run
                </button>
              </li>
            ))}
          </ul>
        )}
        {actionMessage ? <p className="run-workspace-card__status">{actionMessage}</p> : null}
        {actionError ? <p className="run-workspace-card__error">{actionError}</p> : null}
      </section>
    </div>
  )
}
