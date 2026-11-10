/**
 * RunPlanGraphBuild — tests for the build-plan-graph door.
 *
 * Four legs:
 *   (a) run with plannedRunRef → renders button, POSTs, shows graphId
 *   (b) reused:true → shows distinct "already built" marker
 *   (c) 409 UNBOUND_ROLE → shows code + message, control re-enabled
 *   (d) no plannedRunRef and kind !== 'planned-run' → renders nothing
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { RunPlanGraphBuild } from './RunPlanGraphBuild'

const mocks = vi.hoisted(() => ({
  getRecordWithUI: vi.fn(),
  buildPlanGraph: vi.fn(),
  ApiError: class ApiError extends Error {
    public readonly status: number
    public readonly code: string
    constructor(status: number, code: string, message: string) {
      super(message)
      this.name = 'ApiError'
      this.status = status
      this.code = code
    }
    static isApiError(error: unknown): error is ApiError {
      return error instanceof ApiError
    }
  },
}))

vi.mock('../shared/api/client', () => ({
  apiClient: {
    getRecordWithUI: mocks.getRecordWithUI,
    buildPlanGraph: mocks.buildPlanGraph,
  },
  ApiError: mocks.ApiError,
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
    // Run envelope with plannedRunRef
    mocks.getRecordWithUI.mockResolvedValueOnce({
      record: {
        recordId: 'RUN-1',
        payload: { kind: 'run', plannedRunRef: { id: 'PLR-1' } },
      },
    })
    mocks.buildPlanGraph.mockResolvedValueOnce({ success: true, graphId: 'EVG-abc123' })

    render(<RunPlanGraphBuild runId="RUN-1" />)

    // Button should be visible
    const btn = await screen.findByRole('button', { name: 'Build plan graph' })
    expect(btn).toBeTruthy()

    // Click it
    fireEvent.click(btn)

    // Should call buildPlanGraph with the PLR id
    await waitFor(() => {
      expect(mocks.buildPlanGraph).toHaveBeenCalledWith('PLR-1')
    })

    // Should show the graphId
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

    // Should show graphId and a reused marker (not "fresh build")
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
    const apiError = new mocks.ApiError(409, 'UNBOUND_ROLE', "Role 'source' has no binding")
    mocks.buildPlanGraph.mockRejectedValueOnce(apiError)

    render(<RunPlanGraphBuild runId="RUN-3" />)

    const btn = await screen.findByRole('button', { name: 'Build plan graph' })
    fireEvent.click(btn)

    // Should show error code in alert role
    const alert = await screen.findByRole('alert')
    expect(alert).toBeTruthy()
    // The alert text contains "code: message" — match the code as part of the text
    expect(alert.textContent).toContain('UNBOUND_ROLE')
    expect(alert.textContent).toContain("Role 'source' has no binding")

    // Button should be re-enabled (not stuck in spinner)
    expect(btn).not.toBeDisabled()
  })

  it('(d) no plannedRunRef and kind !== "planned-run" → renders nothing', async () => {
    // Run envelope with no plannedRunRef
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

    // Nothing rendered
    expect(container.innerHTML).toBe('')
  })
})
