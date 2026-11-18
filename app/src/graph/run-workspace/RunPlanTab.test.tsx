/**
 * RunPlanTab tests — "Build run graph" affordance (L2-SUBPROTOCOL-EXPAND-1 u6).
 *
 * Pins the frontend seam onto the existing POST /runs/:id/plan-graph route:
 *  - enabled + calls apiClient.buildPlanGraph(plannedRunId) when plannedRunRef exists
 *  - disabled and silent when the run has no plannedRunRef
 *  - reused:true is surfaced in the status line
 */

import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { RunWorkspaceResponse } from '../../shared/api/client'
import type { RunWorkspaceSummary } from '../hooks/useRunWorkspace'

vi.mock('../../shared/api/client', () => ({
  apiClient: {
    getProtocolContext: vi.fn(async () => ({ experimentProtocols: [], projectTemplates: [] })),
    buildPlanGraph: vi.fn(),
    promoteRunMethodToProjectTemplate: vi.fn(),
  },
}))

import { apiClient } from '../../shared/api/client'
import { RunPlanTab } from './RunPlanTab'

const summary: RunWorkspaceSummary = {
  runId: 'RUN-TEST-001',
  title: 'Test run',
  status: 'planned',
  objective: '',
  methodSummary: '',
  nextActions: [],
  counts: { plan: '', biology: '', readouts: '', results: '', claims: '', budget: '' },
}

function workspaceWith(payload: Record<string, unknown>): RunWorkspaceResponse {
  return {
    run: { schemaId: 'run', recordId: 'RUN-TEST-001', payload },
  } as unknown as RunWorkspaceResponse
}

function renderTab(payload: Record<string, unknown>) {
  return render(
    <MemoryRouter initialEntries={['/run/RUN-TEST-001']}>
      <RunPlanTab summary={summary} workspace={workspaceWith(payload)} />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.mocked(apiClient.buildPlanGraph).mockReset()
})

afterEach(() => {
  cleanup()
})

describe('RunPlanTab build run graph', () => {
  it('calls buildPlanGraph with the planned run id and shows the graph id', async () => {
    vi.mocked(apiClient.buildPlanGraph).mockResolvedValue({ success: true, graphId: 'GRAPH-42' })
    renderTab({ plannedRunRef: 'PLRUN-7' })

    const button = screen.getByTestId('run-plan-build-graph')
    expect(button).toBeEnabled()
    fireEvent.click(button)

    await waitFor(() => expect(apiClient.buildPlanGraph).toHaveBeenCalledWith('PLRUN-7'))
    expect(await screen.findByText('Run graph GRAPH-42')).toBeInTheDocument()
  })

  it('is disabled and makes no call when the run has no plannedRunRef', () => {
    renderTab({})

    expect(screen.getAllByText('None').length).toBeGreaterThan(0)
    const button = screen.getByTestId('run-plan-build-graph')
    expect(button).toBeDisabled()
    fireEvent.click(button)
    expect(apiClient.buildPlanGraph).not.toHaveBeenCalled()
  })

  it('marks a reused graph in the status line', async () => {
    vi.mocked(apiClient.buildPlanGraph).mockResolvedValue({ success: true, graphId: 'GRAPH-42', reused: true })
    renderTab({ plannedRunRef: 'PLRUN-7' })

    fireEvent.click(screen.getByTestId('run-plan-build-graph'))

    expect(await screen.findByText('Run graph GRAPH-42 (reused)')).toBeInTheDocument()
  })
})
