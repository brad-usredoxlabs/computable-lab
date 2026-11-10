/**
 * RunPlanGraphBuild — tests for the build-plan-graph door.
 *
 * Eight legs:
 *   (a) run with plannedRunRef → renders button, POSTs, shows graphId
 *   (b) reused:true → shows distinct "already built" marker
 *   (c) 409 UNBOUND_ROLE → shows code + message, control re-enabled
 *   (d) no plannedRunRef and kind !== 'planned-run' → renders nothing
 *   (e) self-PLR arm: record kind is 'planned-run' → uses runId as PLR
 *   (f) navigation reset: changing runId clears stale state
 *   (g) real ApiError fromResponse — message contains UNBOUND_ROLE without HTTP_409
 *   (h) stale banner: success clears failure, and failure clears success
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { RunPlanGraphBuild } from './RunPlanGraphBuild'
import { ApiError } from '../shared/api/errors'

const mocks = vi.hoisted(() => ({
  getRecordWithUI: vi.fn(),
  buildPlanGraph: vi.fn(),
}))

vi.mock('../shared/api/client', () => ({
  apiClient: {
    getRecordWithUI: mocks.getRecordWithUI,
    buildPlanGraph: mocks.buildPlanGraph,
  },
}))

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

beforeEach(() => {
  mocks.getRecordWithUI.mockReset()
  mocks.buildPlanGraph.mockReset()
})

describe('RunPlanGraphBuild', () => {
  it('(a) renders button when run has plannedRunRef; click POSTs and shows graphId', async () => {
    mocks.getRecordWithUI.mockResolvedValueOnce({
      record: {
        recordId: 'RUN-1',
        payload: { kind: 'run', plannedRunRef: { id: 'PLR-1' } },
      },
    })
    mocks.buildPlanGraph.mockResolvedValueOnce({ success: true, graphId: 'EVG-abc123' })

    render(<RunPlanGraphBuild runId="RUN-1" />)

    const btn = await screen.findByRole('button', { name: 'Build plan graph' })
    expect(btn).toBeTruthy()

    fireEvent.click(btn)

    await waitFor(() => {
      expect(mocks.buildPlanGraph).toHaveBeenCalledWith('PLR-1')
    })

    expect(await screen.findByText('EVG-abc123')).toBeTruthy()
  })

  it('(b) reused:true shows distinct already-built marker', async () => {
    mocks.getRecordWithUI.mockResolvedValueOnce({
      record: {
        recordId: 'RUN-2',
        payload: { kind: 'run', plannedRunRef: { id: 'PLR-2' } },
      },
    })
    mocks.buildPlanGraph.mockResolvedValueOnce({
      success: true,
      graphId: 'EVG-abc123',
      reused: true,
    })

    render(<RunPlanGraphBuild runId="RUN-2" />)

    const btn = await screen.findByRole('button', { name: 'Build plan graph' })
    fireEvent.click(btn)

    expect(await screen.findByText('EVG-abc123')).toBeTruthy()
    expect(await screen.findByText('reused')).toBeTruthy()
  })

  it('(c) 409 error surfaces code + message; button re-enabled', async () => {
    mocks.getRecordWithUI.mockResolvedValueOnce({
      record: {
        recordId: 'RUN-3',
        payload: { kind: 'run', plannedRunRef: { id: 'PLR-3' } },
      },
    })
    const apiError = new ApiError({
      status: 409,
      code: 'UNBOUND_ROLE',
      message: "Role 'source' has no binding",
    })
    mocks.buildPlanGraph.mockRejectedValueOnce(apiError)

    render(<RunPlanGraphBuild runId="RUN-3" />)

    const btn = await screen.findByRole('button', { name: 'Build plan graph' })
    fireEvent.click(btn)

    const alert = await screen.findByRole('alert')
    expect(alert).toBeTruthy()
    expect(alert.textContent).toContain("Role 'source' has no binding")

    expect(btn).not.toBeDisabled()
  })

  it('(d) no plannedRunRef and kind !== "planned-run" → renders nothing', async () => {
    mocks.getRecordWithUI.mockResolvedValueOnce({
      record: {
        recordId: 'RUN-4',
        payload: { kind: 'run', title: 'No PLR' },
      },
    })

    const { container } = render(<RunPlanGraphBuild runId="RUN-4" />)

    await waitFor(() => {
      expect(mocks.getRecordWithUI).toHaveBeenCalledWith('RUN-4')
    })

    expect(container.innerHTML).toBe('')
  })

  it('(e) self-PLR arm: record kind is "planned-run" → uses runId as PLR', async () => {
    mocks.getRecordWithUI.mockResolvedValueOnce({
      record: { recordId: 'PLR-9', payload: { kind: 'planned-run' } },
    })
    mocks.buildPlanGraph.mockResolvedValueOnce({ success: true, graphId: 'EVG-xyz789' })

    render(<RunPlanGraphBuild runId="PLR-9" />)

    const btn = await screen.findByRole('button', { name: 'Build plan graph' })
    expect(btn).toBeTruthy()

    fireEvent.click(btn)

    await waitFor(() => {
      expect(mocks.buildPlanGraph).toHaveBeenCalledWith('PLR-9')
    })

    expect(await screen.findByText('EVG-xyz789')).toBeTruthy()
  })

  it('(f) navigation reset: changing runId clears stale state', async () => {
    mocks.getRecordWithUI
      .mockResolvedValueOnce({
        record: {
          recordId: 'RUN-A',
          payload: { kind: 'run', plannedRunRef: { id: 'PLR-A' } },
        },
      })
      .mockResolvedValueOnce({
        record: {
          recordId: 'RUN-B',
          payload: { kind: 'run', title: 'no PLR' },
        },
      })

    const { rerender } = render(<RunPlanGraphBuild runId="RUN-A" />)

    const btn = await screen.findByRole('button', { name: 'Build plan graph' })
    expect(btn).toBeTruthy()

    rerender(<RunPlanGraphBuild runId="RUN-B" />)

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Build plan graph' })).toBeNull()
    })

    expect(mocks.getRecordWithUI).toHaveBeenCalledWith('RUN-B')
    expect(mocks.buildPlanGraph).not.toHaveBeenCalled()
  })

  it('(g) real ApiError fromResponse — message contains UNBOUND_ROLE without HTTP_409', async () => {
    mocks.getRecordWithUI.mockResolvedValueOnce({
      record: {
        recordId: 'RUN-G',
        payload: { kind: 'run', plannedRunRef: { id: 'PLR-G' } },
      },
    })

    const apiError = await ApiError.fromResponse(
      new Response(
        JSON.stringify({ error: 'UNBOUND_ROLE', message: "Role 'source' has no binding" }),
        { status: 409 },
      ),
    )
    mocks.buildPlanGraph.mockRejectedValueOnce(apiError)

    render(<RunPlanGraphBuild runId="RUN-G" />)

    const btn = await screen.findByRole('button', { name: 'Build plan graph' })
    fireEvent.click(btn)

    const alert = await screen.findByRole('alert')
    expect(alert).toBeTruthy()
    expect(alert.textContent).toContain('UNBOUND_ROLE')
    expect(alert.textContent).toContain("Role 'source' has no binding")
    expect(alert.textContent).not.toContain('HTTP_409')
  })

  it('(h) stale banner: success clears failure, and failure clears success', async () => {
    mocks.getRecordWithUI.mockResolvedValueOnce({
      record: {
        recordId: 'RUN-H',
        payload: { kind: 'run', plannedRunRef: { id: 'PLR-H' } },
      },
    })

    const apiError = new ApiError({
      status: 409,
      code: 'UNBOUND_ROLE',
      message: "Role 'source' has no binding",
    })
    mocks.buildPlanGraph
      .mockRejectedValueOnce(apiError)
      .mockResolvedValueOnce({ success: true, graphId: 'EVG-abc123' })

    render(<RunPlanGraphBuild runId="RUN-H" />)

    const btn = await screen.findByRole('button', { name: 'Build plan graph' })

    // First click → error
    fireEvent.click(btn)
    const alert = await screen.findByRole('alert')
    expect(alert).toBeTruthy()

    // Second click → success clears error
    fireEvent.click(btn)
    await waitFor(() => {
      expect(screen.queryByRole('alert')).toBeNull()
    })
    expect(await screen.findByText('EVG-abc123')).toBeTruthy()
  })
})
