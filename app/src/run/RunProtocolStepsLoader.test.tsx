import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, waitFor, cleanup } from '@testing-library/react'
import { useEffect } from 'react'
import { ProtocolSelectionProvider, useProtocolSelection } from '../event-editor/protocol/ProtocolSelectionContext'
import { RunProtocolStepsLoader } from './RunProtocolStepsLoader'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const mocks = vi.hoisted(() => ({
  getRecord: vi.fn(),
}))

vi.mock('../shared/api/client', () => ({
  apiClient: { getRecord: mocks.getRecord },
}))

type StepSummary = { stepId: string; label: string; ordinal: number }

/** Read the current steps published to the shared context, via an effect. */
function StepsReader({ onSteps }: { onSteps: (steps: StepSummary[]) => void }) {
  const sel = useProtocolSelection()
  useEffect(() => {
    onSteps(sel?.steps ?? [])
  })
  return null
}

function seedRecord(id: string, payload: Record<string, unknown>): Record<string, unknown> {
  return { recordId: id, payload }
}

describe('RunProtocolStepsLoader', () => {
  it('publishes the run protocol steps to the shared context (run → PLR → protocol)', async () => {
    // run -> plannedRunRef -> protocol
    mocks.getRecord
      .mockResolvedValueOnce(seedRecord('RUN-1', { plannedRunRef: { id: 'PLR-1' } }))
      .mockResolvedValueOnce(seedRecord('PLR-1', { protocolRef: { id: 'PRT-cellrox', kind: 'protocol' } }))
    const origFetch = globalThis.fetch
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/protocols/PRT-cellrox/steps')) {
        return new Response(JSON.stringify({ steps: [
          { stepId: 's1', label: 'Grow cells', ordinal: 1 },
          { stepId: 's2', label: 'Add reagent', ordinal: 2 },
        ] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return origFetch(input)
    })

    let readSteps: Array<{ stepId: string; label: string; ordinal: number }> = []
    render(
      <ProtocolSelectionProvider>
        <RunProtocolStepsLoader runId="RUN-1" />
        <StepsReader onSteps={(s) => (readSteps = s)} />
      </ProtocolSelectionProvider>,
    )

    await waitFor(() => {
      expect(readSteps.map((s) => s.stepId)).toEqual(['s1', 's2'])
    })
    expect(readSteps[0]?.label).toBe('Grow cells')
    expect(readSteps[1]?.ordinal).toBe(2)
    fetchMock.mockRestore()
  })

  it('follows local-protocol inherits_from to the universal steps', async () => {
    mocks.getRecord
      .mockResolvedValueOnce(seedRecord('RUN-1', { plannedRunRef: { id: 'PLR-1' } }))
      .mockResolvedValueOnce(seedRecord('PLR-1', { protocolRef: { id: 'LPR-9', kind: 'local-protocol' } }))
      .mockResolvedValueOnce(seedRecord('LPR-9', { kind: 'local-protocol', inherits_from: { id: 'PRT-universal' } }))
    const origFetch = globalThis.fetch
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/protocols/PRT-universal/steps')) {
        return new Response(JSON.stringify({ steps: [{ stepId: 's1', label: 'Universal step', ordinal: 1 }] }), { status: 200 })
      }
      return origFetch(input)
    })

    let readSteps: Array<{ stepId: string; label: string; ordinal: number }> = []
    render(
      <ProtocolSelectionProvider>
        <RunProtocolStepsLoader runId="RUN-1" />
        <StepsReader onSteps={(s) => (readSteps = s)} />
      </ProtocolSelectionProvider>,
    )

    await waitFor(() => {
      expect(readSteps[0]?.label).toBe('Universal step')
    })
    fetchMock.mockRestore()
  })
})