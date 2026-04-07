import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiClient, type RunWorkspaceResponse } from '../../shared/api/client'
import { isBiologyContext } from '../lib/readoutMetadata'

export interface RunWorkspaceSummary {
  runId: string
  title: string
  status: 'planned' | 'in_progress' | 'completed'
  objective: string
  methodSummary: string
  nextActions: string[]
  counts: {
    plan: string
    biology: string
    readouts: string
    results: string
    claims: string
  }
}

export interface UseRunWorkspaceResult {
  summary: RunWorkspaceSummary
  workspace: RunWorkspaceResponse | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

function summarizeCounts(workspace: RunWorkspaceResponse | null) {
  if (!workspace) {
    return {
      plan: 'No run loaded',
      biology: 'No biology yet',
      readouts: 'No readouts yet',
      results: 'No result jobs yet',
      claims: 'No claims yet',
    }
  }
  const assignmentCount = Object.values(workspace.wellRoleAssignmentsByContext).flat().length
  const visibleReadoutContexts = workspace.measurementContexts.filter((context) => !isBiologyContext(context.payload))
  return {
    plan: workspace.eventGraph ? `${workspace.eventGraph.payload.labwares?.length || 0} labwares` : 'No event graph',
    biology: `${workspace.wellGroups.length} groups · ${assignmentCount} role assignments`,
    readouts: `${visibleReadoutContexts.length} contexts`,
      results: `${workspace.measurements.length} measurements`,
      claims: `${workspace.claims.length} claims · ${workspace.evidence.length} evidence · ${workspace.assertions.length} assertions`,
  }
}

export function useRunWorkspace(runId: string | undefined): UseRunWorkspaceResult {
  const [workspace, setWorkspace] = useState<RunWorkspaceResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!runId) return
    setLoading(true)
    setError(null)
    try {
      const response = await apiClient.getRunWorkspace(runId)
      setWorkspace(response)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load run workspace')
    } finally {
      setLoading(false)
    }
  }, [runId])

  useEffect(() => {
    let cancelled = false
    if (!runId) return
    setLoading(true)
    setError(null)
    void apiClient.getRunWorkspace(runId)
      .then((response) => {
        if (!cancelled) setWorkspace(response)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load run workspace')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [runId])

  const summary = useMemo<RunWorkspaceSummary>(() => {
    const resolvedRunId = runId || 'RUN-UNKNOWN'
    const counts = summarizeCounts(workspace)
    const runPayload = workspace?.run?.payload as Record<string, unknown> | undefined
    const title = typeof runPayload?.title === 'string' && runPayload.title.trim()
      ? `${runPayload.title} · ${resolvedRunId}`
      : `Run Workspace · ${resolvedRunId}`
    const status = runPayload?.status === 'completed'
      ? 'completed'
      : runPayload?.status === 'in_progress'
        ? 'in_progress'
        : 'planned'
    const contexts = workspace?.measurementContexts.filter((context) => !isBiologyContext(context.payload)).length ?? 0
    const measurements = workspace?.measurements.length ?? 0
    return {
      runId: resolvedRunId,
      title,
      status,
      objective: 'Organize one run around a single spatial workflow from plan to biology to readouts to results to claims.',
      methodSummary: workspace?.eventGraph
        ? `${workspace.eventGraph.payload.events?.length || 0} events across ${workspace.eventGraph.payload.labwares?.length || 0} labwares`
        : 'No method event graph attached yet.',
      nextActions: contexts === 0
        ? [
            'Open Plan mode and confirm the plate layout and read events.',
            'Switch to Biology mode and label controls, treatments, and replicate groups.',
            'Switch to Readouts mode and create the first readout context.',
          ]
        : measurements === 0
          ? [
              'Review biological assignments in Biology mode.',
              'Review or create readout contexts in Readouts mode.',
              'Switch to Results mode to attach and interpret returned data.',
            ]
          : [
              'Inspect reviewed measurements in Results mode.',
              'Return to Biology mode to refine semantic groupings if needed.',
              'Return to Readouts mode to refine assay context or QC expectations.',
              'Use the Claims tab to draft evidence and assertions next.',
            ],
      counts,
    }
  }, [runId, workspace])

  return {
    summary,
    workspace,
    loading,
    error,
    refresh,
  }
}
