/**
 * INSTR-READCHAIN-1 (b) — the chatbot executor attaches the run's read-event
 * chain to Gemini appliance executions when the run's event graph carries
 * EXACTLY ONE applicable read event (spec §(b): attach on exactly-one;
 * attach NOTHING on zero / ambiguous / no-graph — never "the first one").
 *
 * RED-first posture: at HEAD executeInstrumentApplianceJob sends job.request
 * untouched (no chain), so T-b1 is RED by construction. T-b2/T-b3/T-b4 pin the
 * attach-nothing branches with the keys ABSENT (not undefined) — the exact
 * shape the server's honest-400 pre-flight expects.
 *
 * Fixture data MAY name 'read' / equipment ids: fixtures are DATA; the H1/H2
 * ban is on policy literals in production TS (useAiChat.ts). The executor's
 * capable-verb set must arrive through the mocked equipment-capability +
 * verb-definition RECORDS, and the equipment id through
 * job.request.instrumentRef.id — the mocks below are the only place these
 * names exist.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAiChat } from './useAiChat'
import { apiClient } from '../api/client'
import type { AiContext } from '../../types/aiContext'
import type { InstrumentApplianceJob } from '../../types/ai'

vi.mock('../api/aiClient', () => ({
  streamAssist: vi.fn(),
  getAiHealth: vi.fn().mockResolvedValue({ available: true }),
}))

vi.mock('../api/client', () => ({
  apiClient: {
    getRecord: vi.fn(),
    listRecordsByKind: vi.fn(),
    getPromptTemplate: vi.fn().mockResolvedValue({ error: 'not found' }),
    executeInstrumentApplianceJob: vi.fn(),
  },
}))

const GRAPH_ID = 'EVG-RC1-GRAPH'
const EQUIPMENT_ID = 'EQP-RC1-READER'
const CLASS_ID = 'CL:plate_reader'
const VERB_RECORD_ID = 'VERB-RC1-READ'
const CANONICAL_VERB = 'read' // fixture data, not a production literal

function applianceJob(): InstrumentApplianceJob {
  return {
    kind: 'instrument-appliance-job',
    jobId: 'gemini-em-active-read-1',
    adapterId: 'molecular_devices_gemini',
    operation: 'active_read',
    instrument: 'Gemini EM plate reader',
    request: {
      adapterId: 'molecular_devices_gemini',
      instrumentRef: { kind: 'record', id: EQUIPMENT_ID, type: 'equipment' },
      outputPath: 'records/inbox/rc1-readchain.csv',
      parameters: { simulate: true, mode: 'fluorescence', wavelengthNm: 520 },
    },
    sourceRunFile: {
      instrument: 'Gemini EM plate reader',
      wells: [{ well: 'A1' }],
    },
    executionReadiness: {
      jobId: 'gemini-em-active-read-1',
      status: 'ready',
      executionMode: 'simulate',
      requiresConfirmation: false,
      blockers: [],
    },
  }
}

interface MockOptions {
  events: Array<Record<string, unknown>>
}

/** Serves the record join the executor must perform from records only:
 *  graph -> equipment (class ref) -> equipment-capability (active, class-
 *  matched, VERB record) -> verb-definition (canonical name). */
function mockRecordJoin(options: MockOptions): void {
  vi.mocked(apiClient.getRecord).mockImplementation(async (recordId: string) => {
    if (recordId === GRAPH_ID) {
      return {
        recordId: GRAPH_ID,
        schemaId: 'https://computable-lab.com/schema/computable-lab/event-graph.schema.yaml',
        payload: {
          kind: 'event-graph',
          recordId: GRAPH_ID,
          id: GRAPH_ID,
          events: options.events,
          labwares: [{ labwareId: 'LW-RC1', labwareType: 'plate_96' }],
        },
      }
    }
    if (recordId === EQUIPMENT_ID) {
      return {
        recordId: EQUIPMENT_ID,
        schemaId: 'https://computable-lab.com/schema/computable-lab/equipment.schema.yaml',
        payload: {
          kind: 'equipment',
          id: EQUIPMENT_ID,
          name: 'RC1 fixture reader',
          equipmentClassRef: { kind: 'ontology', id: CLASS_ID },
        },
      }
    }
    throw new Error(`unexpected getRecord(${recordId})`)
  })

  vi.mocked(apiClient.listRecordsByKind).mockImplementation(async (kind: string) => {
    if (kind === 'equipment-capability') {
      return {
        records: [
          {
            recordId: 'ECP-RC1',
            schemaId: 'https://computable-lab.com/schema/computable-lab/equipment-capability.schema.yaml',
            payload: {
              kind: 'equipment-capability',
              id: 'ECP-RC1',
              status: 'active',
              equipmentClassRef: { kind: 'ontology', id: CLASS_ID },
              capabilities: [
                { verbRef: { kind: 'record', type: 'verb-definition', id: VERB_RECORD_ID } },
              ],
            },
          },
        ],
        total: 1,
      }
    }
    if (kind === 'verb-definition') {
      return {
        records: [
          {
            recordId: VERB_RECORD_ID,
            schemaId: 'https://computable-lab.com/schema/computable-lab/verb-definition.schema.yaml',
            payload: {
              kind: 'verb-definition',
              id: VERB_RECORD_ID,
              canonical: CANONICAL_VERB,
            },
          },
        ],
        total: 1,
      }
    }
    throw new Error(`unexpected listRecordsByKind(${kind})`)
  })

  vi.mocked(apiClient.executeInstrumentApplianceJob).mockResolvedValue({ success: true })
}

function contextWithGraph(eventGraphId: string | null): AiContext {
  return {
    surface: 'run-workspace',
    summary: 'RC1 read-chain fixture surface',
    surfaceContext: { runId: 'RUN-RC1', eventGraphId },
  }
}

async function runExecutor(aiContext: AiContext): Promise<Record<string, unknown>> {
  const { result } = renderHook(() => useAiChat({ aiContext }))
  await act(async () => {
    await result.current.executeInstrumentApplianceJob(applianceJob())
  })
  const calls = vi.mocked(apiClient.executeInstrumentApplianceJob).mock.calls
  expect(calls.length, 'the dispatch must still happen (the server pre-flight owns the refusal)').toBe(1)
  // Read the request generically: the test must compile even while the typed
  // fields are not yet declared (RED phase), and it asserts on the RUNTIME
  // shape — key presence/absence — which is what the server consumes.
  return calls[0]![0].request as unknown as Record<string, unknown>
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('no fetch allowed in this test'))))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useAiChat read-event chain (INSTR-READCHAIN-1 §(b))', () => {
  it('T-b1 exactly-one: attaches eventGraphRef + readEventRef of the sole capable event', async () => {
    mockRecordJoin({
      events: [
        {
          eventId: 'EVT-RC1-CAPABLE',
          event_type: 'read',
          semanticKeyComponents: { verb: CANONICAL_VERB, identity: { plate: 'LW-RC1' }, phaseId: 'p1', ordinal: 1 },
        },
        {
          eventId: 'EVT-RC1-INCAPABLE',
          event_type: 'wash',
          semanticKeyComponents: { verb: 'wash', identity: { plate: 'LW-RC1' }, phaseId: 'p1', ordinal: 2 },
        },
      ],
    })

    const request = await runExecutor(contextWithGraph(GRAPH_ID))

    expect('eventGraphRef' in request, 'exactly-one must attach the graph ref').toBe(true)
    const graphRef = request['eventGraphRef'] as { kind?: string; id?: string; type?: string }
    expect(graphRef.kind).toBe('record')
    expect(graphRef.id).toBe(GRAPH_ID)
    expect(graphRef.type).toBe('event-graph')
    expect(request['readEventRef'], 'exactly-one must attach the sole capable event id').toBe('EVT-RC1-CAPABLE')
  })

  it('T-b2 zero-candidates: NEITHER key present (ABSENT, not undefined)', async () => {
    mockRecordJoin({
      events: [
        { eventId: 'EVT-RC1-WASH', event_type: 'wash', semanticKeyComponents: { verb: 'wash', ordinal: 1 } },
        { eventId: 'EVT-RC1-HEAT', event_type: 'heat', semanticKeyComponents: { verb: 'heat', ordinal: 2 } },
      ],
    })

    const request = await runExecutor(contextWithGraph(GRAPH_ID))

    expect('eventGraphRef' in request, 'zero-candidates must attach nothing').toBe(false)
    expect('readEventRef' in request, 'zero-candidates must attach nothing').toBe(false)
  })

  it('T-b3 ambiguous: two capable events -> attach NOTHING (never "the first one")', async () => {
    mockRecordJoin({
      events: [
        { eventId: 'EVT-RC1-CAPABLE-A', event_type: 'read', semanticKeyComponents: { verb: CANONICAL_VERB, ordinal: 1 } },
        { eventId: 'EVT-RC1-CAPABLE-B', event_type: 'read', semanticKeyComponents: { verb: CANONICAL_VERB, ordinal: 2 } },
      ],
    })

    const request = await runExecutor(contextWithGraph(GRAPH_ID))

    expect('eventGraphRef' in request, 'ambiguous must attach nothing — over-attachment fabricates context').toBe(false)
    expect('readEventRef' in request, 'ambiguous must attach nothing — over-attachment fabricates context').toBe(false)
  })

  it('T-b4 no-graph: keys ABSENT and the dispatch still happens (honest-400 path preserved)', async () => {
    mockRecordJoin({ events: [] })

    const request = await runExecutor(contextWithGraph(null))

    expect('eventGraphRef' in request).toBe(false)
    expect('readEventRef' in request).toBe(false)
    expect(apiClient.getRecord, 'no graph id -> no graph fetch').not.toHaveBeenCalled()
  })
})
