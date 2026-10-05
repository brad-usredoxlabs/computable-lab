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
type BindingMap = Record<string, { instanceRef: { id: string; label?: string }; geometryRef?: { id: string; label?: string } }>

/** Read the current steps published to the shared context, via an effect. */
function StepsReader({ onSteps }: { onSteps: (steps: StepSummary[]) => void }) {
  const sel = useProtocolSelection()
  useEffect(() => {
    onSteps(sel?.steps ?? [])
  })
  return null
}

/** Read the current run-bound labware instance map, via an effect. */
function BindingsReader({ onBindings }: { onBindings: (b: BindingMap) => void }) {
  const sel = useProtocolSelection()
  useEffect(() => {
    onBindings(sel?.labwareBindings ?? {})
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

  // ---- Run-bound labware instances (PROTO-AI-10) ----------------------------

  /** Steps payload both branches share — keeps the resource publish sane. */
  const stepsProtocolPayload = {
    kind: 'protocol',
    steps: [{ stepId: 's1', label: 'Lyse', ordinal: 1 }],
    roles: {
      labwareRoles: [{ roleId: 'deep-well-block', description: 'deep-well block' }, { roleId: 'lysis-rack' }],
      instrumentRoles: [{ roleId: 'bead-beater' }],
    },
  }

  function mockStepsEndpoint(urlFragment: string) {
    const origFetch = globalThis.fetch
    return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      if (String(input).includes(urlFragment)) {
        return new Response(JSON.stringify({ steps: [{ stepId: 's1', label: 'Lyse', ordinal: 1 }] }), { status: 200 })
      }
      return origFetch(input)
    })
  }

  it('publishes roleId → bound instance from the PLR bindings (geometryRef rides, unbound roles absent)', async () => {
    mocks.getRecord
      .mockResolvedValueOnce(seedRecord('RUN-1', { plannedRunRef: { id: 'PLR-1' } }))
      .mockResolvedValueOnce(seedRecord('PLR-1', {
        protocolRef: { id: 'PRT-zymo', kind: 'protocol' },
        bindings: {
          labware: [
            {
              roleId: 'deep-well-block',
              labwareInstanceRef: { kind: 'record', type: 'labware-instance', id: 'LABI-96A', label: 'Deep well plate A' },
              labwareGeometryRef: { kind: 'record', type: 'plate-geometry', id: 'GEO-96x2' },
            },
            // No labwareInstanceRef → binds nothing concrete → not published.
            { roleId: 'lysis-rack' },
          ],
        },
      }))
      .mockResolvedValueOnce(seedRecord('PRT-zymo', stepsProtocolPayload))
    const fetchMock = mockStepsEndpoint('/api/protocols/PRT-zymo/steps')

    let readBindings: BindingMap = { stale: 'sentinel' as unknown as BindingMap[string] }
    render(
      <ProtocolSelectionProvider>
        <RunProtocolStepsLoader runId="RUN-1" />
        <BindingsReader onBindings={(b) => (readBindings = b)} />
      </ProtocolSelectionProvider>,
    )

    await waitFor(() => {
      expect(readBindings['deep-well-block']).toEqual({
        instanceRef: { id: 'LABI-96A', label: 'Deep well plate A' },
        geometryRef: { id: 'GEO-96x2' },
      })
    })
    // Zero guessing: an unbound role publishes NOTHING, not a guess.
    expect(readBindings['lysis-rack']).toBeUndefined()
    expect(readBindings['bead-beater']).toBeUndefined()
    fetchMock.mockRestore()
  })

  it('publishes an empty map when the run binds nothing (PLR without bindings)', async () => {
    mocks.getRecord
      .mockResolvedValueOnce(seedRecord('RUN-1', { plannedRunRef: { id: 'PLR-1' } }))
      .mockResolvedValueOnce(seedRecord('PLR-1', { protocolRef: { id: 'PRT-zymo', kind: 'protocol' } }))
      .mockResolvedValueOnce(seedRecord('PRT-zymo', stepsProtocolPayload))
    const fetchMock = mockStepsEndpoint('/api/protocols/PRT-zymo/steps')

    let readBindings: BindingMap | null = null
    render(
      <ProtocolSelectionProvider>
        <RunProtocolStepsLoader runId="RUN-1" />
        <BindingsReader onBindings={(b) => (readBindings = b)} />
      </ProtocolSelectionProvider>,
    )

    // Wait for the steps too — the resource publish has landed by then.
    await waitFor(() => {
      expect(readBindings).toEqual({})
    })
    fetchMock.mockRestore()
  })

  it('keeps two roles bound to DIFFERENT instances of the same design distinguishable', async () => {
    mocks.getRecord
      .mockResolvedValueOnce(seedRecord('RUN-1', { plannedRunRef: { id: 'PLR-1' } }))
      .mockResolvedValueOnce(seedRecord('PLR-1', {
        protocolRef: { id: 'PRT-zymo', kind: 'protocol' },
        bindings: {
          labware: [
            { roleId: 'deep-well-block', labwareInstanceRef: { kind: 'record', type: 'labware-instance', id: 'LABI-96A', label: 'Deep well plate A' } },
            // Same design, different physical instance — must stay distinct.
            { roleId: 'elution-block', labwareInstanceRef: { kind: 'record', type: 'labware-instance', id: 'LABI-96B', label: 'Deep well plate B' } },
          ],
        },
      }))
      .mockResolvedValueOnce(seedRecord('PRT-zymo', stepsProtocolPayload))
    const fetchMock = mockStepsEndpoint('/api/protocols/PRT-zymo/steps')

    let readBindings: BindingMap = {}
    render(
      <ProtocolSelectionProvider>
        <RunProtocolStepsLoader runId="RUN-1" />
        <BindingsReader onBindings={(b) => (readBindings = b)} />
      </ProtocolSelectionProvider>,
    )

    await waitFor(() => {
      expect(readBindings['deep-well-block']?.instanceRef.id).toBe('LABI-96A')
      expect(readBindings['elution-block']?.instanceRef.id).toBe('LABI-96B')
    })
    expect(readBindings['deep-well-block']?.instanceRef.id)
      .not.toBe(readBindings['elution-block']?.instanceRef.id)
    fetchMock.mockRestore()
  })

  it('clears stale bindings when runId switches to a run whose PLR binds nothing', async () => {
    // Run A binds deep-well-block; Run B's PLR has no bindings at all.
    mocks.getRecord
      // RUN-A chain
      .mockResolvedValueOnce(seedRecord('RUN-A', { plannedRunRef: { id: 'PLR-A' } }))
      .mockResolvedValueOnce(seedRecord('PLR-A', {
        protocolRef: { id: 'PRT-zymo', kind: 'protocol' },
        bindings: { labware: [{ roleId: 'deep-well-block', labwareInstanceRef: { kind: 'record', type: 'labware-instance', id: 'LABI-96A' } }] },
      }))
      .mockResolvedValueOnce(seedRecord('PRT-zymo', stepsProtocolPayload))
      // RUN-B chain
      .mockResolvedValueOnce(seedRecord('RUN-B', { plannedRunRef: { id: 'PLR-B' } }))
      .mockResolvedValueOnce(seedRecord('PLR-B', { protocolRef: { id: 'PRT-zymo', kind: 'protocol' } }))
      .mockResolvedValueOnce(seedRecord('PRT-zymo', stepsProtocolPayload))
    const fetchMock = mockStepsEndpoint('/api/protocols/PRT-zymo/steps')

    let readBindings: BindingMap = {}
    const view = render(
      <ProtocolSelectionProvider>
        <RunProtocolStepsLoader runId="RUN-A" />
        <BindingsReader onBindings={(b) => (readBindings = b)} />
      </ProtocolSelectionProvider>,
    )

    await waitFor(() => {
      expect(readBindings['deep-well-block']?.instanceRef.id).toBe('LABI-96A')
    })

    view.rerender(
      <ProtocolSelectionProvider>
        <RunProtocolStepsLoader runId="RUN-B" />
        <BindingsReader onBindings={(b) => (readBindings = b)} />
      </ProtocolSelectionProvider>,
    )

    await waitFor(() => {
      expect(readBindings).toEqual({})
    })
    fetchMock.mockRestore()
  })
})