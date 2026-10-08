/**
 * PB-CH-8 fix1 — the ledger-turn flag: a turn whose SSE stream carries a
 * ledger_answer event must render the SERVER-BUILT answer in the chat pane,
 * NOT park the sidebar on 'reviewing'/changes over an empty change list.
 *
 * Defect (lanes/2/decisions/PB-CH-8-ledger-render-defect.md, receipts
 * PB-CH-8/2026-10-08 probe1/capture1/witness1): the SSE carries the answer,
 * a MutationObserver proves it NEVER enters the DOM — the ledger turn sets no
 * flag, so onDraftResult falls to the final else, dispatches draft-ready with
 * empty changes, the sidebar auto-switches to 'changes', and the chat section
 * (where the kind:'ledger' trace renders) UNMOUNTS before 'done' commits the
 * trace. Exactly the PB-CH-4 D1 failure class replayed for ledger turns.
 *
 * Unlike the workstate harness (which mocks useChatThread), this suite runs
 * the REAL hook against a mocked runAssistStream seam: SSE frames are fed
 * through the hook's onEvent exactly as the browser would receive them, so
 * the ledger_answer -> trace -> DOM path is exercised end-to-end. The server
 * ordering is the verified one the workstate comment cites (ledger_answer
 * emits during run(), BEFORE the post-run `done` frame).
 *
 * Pins:
 *  - T1 (both envelope shapes): after done, answerText verbatim is in the
 *    rendered chat pane; NO changes subtab, NO Apply-to-run, header not
 *    'Review changes'; chat input enabled and the chat subtab active.
 *  - T2 (regression): a workstate_proposal turn still keeps the card as the
 *    only review surface — draft-ready still suppressed.
 *  - T3 (regression): a normal draft turn still opens draft-ready.
 *  - T4 (flag hygiene): a ledger turn followed by a normal draft turn — the
 *    second turn DOES open draft-ready (sendChat choke-point clear).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { WorkspaceProvider } from '../../workspace/WorkspaceContext'
import { defaultWorkspaceState } from '../../workspace/types'
import { OpenTabsProvider } from '../../../shared/shell/OpenTabsContext'
import type { SurfaceSpec } from '../../../shared/surfaces'
import type { AssistStreamEvent, LedgerAnswerEnvelope } from './assistStream'

vi.mock('pdfjs-dist', () => ({
  getDocument: vi.fn(() => ({
    promise: Promise.resolve({
      numPages: 0,
      fingerprints: [''],
      getPage: () => Promise.resolve(null),
      destroy: () => undefined,
    }),
    destroy: () => undefined,
  })),
  GlobalWorkerOptions: { workerSrc: '' },
  TextLayer: class {
    render() {
      return Promise.resolve()
    }
  },
}))
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: 'worker.mjs' }))

const mocks = vi.hoisted(() => ({
  // SSE seam: the REAL useChatThread runs against this fake transport; each
  // send captures the hook's onEvent so the test can push frames in order.
  emitters: [] as Array<(event: AssistStreamEvent) => void>,
  runAssistStream: vi.fn(async (_request: unknown, handlers: { onEvent: (event: AssistStreamEvent) => void }) => {
    mocks.emitters.push(handlers.onEvent)
  }),
  // ChatInput seam: capture the panel's onSend (handleSend) so a turn starts
  // through the panel's real send path (sendChat choke point included).
  onSend: null as null | ((text: string) => void | Promise<void>),
  compileWorkstateDraft: vi.fn(),
  acceptWorkstateDraft: vi.fn(),
  getSession: vi.fn(),
  putSession: vi.fn(),
  executeTier1: vi.fn(),
  applyAcceptedWorkstate: vi.fn(),
}))

// The transport seam only: summarizeDraftResult and the type stack stay real.
vi.mock('./assistStream', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./assistStream')>()
  return { ...actual, runAssistStream: mocks.runAssistStream }
})

// ChatInput seam: a plain button that calls the panel's onSend. Keeps TipTap
// out of the DOM and makes "the user pressed Send" deterministic.
vi.mock('./ChatInput', () => ({
  ChatInput: ({ onSend }: { onSend: (text: string) => void | Promise<void> }) => {
    mocks.onSend = onSend
    return (
      <div data-testid="chat-input">
        <button type="button" data-testid="chat-input-send" onClick={() => void onSend('test turn')}>
          Send
        </button>
      </div>
    )
  },
}))

vi.mock('../../../shared/session/useWorkstateExecutor', () => ({
  useWorkstateExecutor: () => ({
    executeTier1: mocks.executeTier1,
    applyAcceptedWorkstate: mocks.applyAcceptedWorkstate,
  }),
}))

const REGISTRY = [
  { id: 'surface-run', label: 'Run surface', path: '/runs/:runId', params: { runId: 'run' }, objectTypes: ['run'], selectableKinds: [] },
] as unknown as SurfaceSpec[]

vi.mock('../../../shared/surfaces/registry', () => ({
  useSurfaceRegistry: () => REGISTRY,
  loadSurfaceRegistry: () => Promise.resolve(REGISTRY),
}))

vi.mock('../../protocol/ProtocolSelectionContext', () => ({
  NO_PROTOCOL_RESOURCES: { labwares: [], equipment: [] },
  NO_LABWARE_BINDINGS: {},
  useProtocolSelection: () => ({
    protocol: { recordId: 'PRT-000123', title: 'ROS assay' },
    steps: [
      { stepId: 'step-seed', label: 'Seed cells', ordinal: 1, kind: 'add_material' },
      { stepId: 'step-read', label: 'Read plate', ordinal: 2, kind: 'read' },
    ],
    resources: { labwares: [], equipment: [] },
    focusedStep: null,
    setFocusedStep: vi.fn(),
  }),
}))

vi.mock('../../../shared/api/client', () => ({
  apiClient: {
    warmAiContext: vi.fn(async () => null),
    getAiWarmStatus: vi.fn(async () => null),
    getSurfaces: vi.fn(async () => ({ surfaces: REGISTRY })),
    compileWorkstateDraft: (...args: unknown[]) => mocks.compileWorkstateDraft(...(args as [])),
    acceptWorkstateDraft: (...args: unknown[]) => mocks.acceptWorkstateDraft(...(args as [])),
    getSession: (...args: unknown[]) => mocks.getSession(...(args as [])),
    putSession: (...args: unknown[]) => mocks.putSession(...(args as [])),
  },
}))

import { AiTabPanel } from './AiTabPanel'

// Envelopes mirror the server's LedgerAnswerEnvelope (assistStream mirror).
const FOUND: LedgerAnswerEnvelope = {
  status: 'found',
  asOf: '2026-10-07T10:05:00.000Z',
  capturedAt: '2026-10-07T10:00:00.000Z',
  disclosure: 'as captured at 2026-10-07T10:00:00.000Z — nearest stored snapshot at or before 2026-10-07T10:05:00.000Z',
  links: ['EVT-1'],
  answerText: 'Workstate as captured at 2026-10-07T10:00:00.000Z.\nLinked lab events: EVT-1',
}

const NO_HISTORY: LedgerAnswerEnvelope = {
  status: 'no-history',
  asOf: '2026-09-01T09:00:00.000Z',
  reason: 'predates-first-capture',
  labEvents: [{ recordId: 'EVT-1', action: 'run.status-changed', occurredAt: '2026-09-01T08:50:00.000Z', subjectId: 'RUN-1' }],
  answerText: 'No workstate history exists for that time — it predates your first stored snapshot.',
}

const INTENT = {
  operation: 'compose-workstate',
  tabs: [{ surface: 'surface-run', target: { term: 'ROS run' } }],
}

const COMPILED_OK = {
  draftId: 'DRAFT-7',
  revision: 1,
  reviewHash: 'a'.repeat(64),
  canAccept: true,
  diagnostics: [],
  result: {
    sessionDocument: { version: 1, tabs: [{ kind: 'run', runId: 'RUN-9', title: 'ROS run' }], activeTabId: 'run:RUN-9' },
    summary: 'Open the ROS run',
    resolvedTerms: [{ term: 'ROS run', curieOrRecordId: 'RUN-9', label: 'ROS run' }],
  },
}

function renderPanel() {
  const base = defaultWorkspaceState('STU-000001')
  return render(
    <MemoryRouter>
      <OpenTabsProvider>
        <WorkspaceProvider
          studyId="STU-000001"
          saveDebounceMs={0}
          loadFn={async () => ({
            state: {
              ...base,
              tabs: [{ id: 't1', kind: 'deck' as const, eventGraphId: 'EVG-1', title: 'Deck' }],
              activeTabId: 't1',
            } as ReturnType<typeof defaultWorkspaceState>,
          })}
          saveFn={async (_id, s) => ({ state: s })}
        >
          <AiTabPanel />
        </WorkspaceProvider>
      </OpenTabsProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  window.localStorage.clear()
  mocks.emitters.length = 0
  mocks.onSend = null
  mocks.compileWorkstateDraft.mockReset()
  mocks.compileWorkstateDraft.mockResolvedValue(COMPILED_OK)
  mocks.acceptWorkstateDraft.mockReset()
  mocks.getSession.mockReset()
  mocks.getSession.mockResolvedValue({
    session: { version: 1, userId: 'default', tabs: [], activeTabId: null, updatedAt: '2026-10-07T00:00:00.000Z' },
  })
  mocks.putSession.mockReset()
  mocks.putSession.mockResolvedValue({ session: { updatedAt: '2026-10-07T00:00:01.000Z' } })
  mocks.executeTier1.mockReset()
  mocks.applyAcceptedWorkstate.mockReset()
  ;(mocks.runAssistStream as ReturnType<typeof vi.fn>).mockClear()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

async function mount() {
  renderPanel()
  await act(async () => {
    await Promise.resolve()
  })
}

/** Start a turn through the panel's real send path (handleSend -> sendChat
 *  choke point -> real useChatThread.send -> mocked transport). */
async function sendTurn(text: string) {
  await act(async () => {
    await mocks.onSend?.(text)
  })
}

/** Push one SSE frame into the CURRENT turn's hook onEvent. */
async function emit(event: AssistStreamEvent) {
  const onEvent = mocks.emitters[mocks.emitters.length - 1]
  if (!onEvent) throw new Error('no stream turn in flight')
  await act(async () => {
    onEvent(event)
    await Promise.resolve()
  })
}

describe('AiTabPanel — PB-CH-8 fix1: a ledger turn renders the answer in the chat pane', () => {
  // The defect's exact signature (witness1: MutationObserver added-node set
  // containing the needle = []): the answer NEVER enters the DOM because the
  // draft-ready park unmounts the chat section before the trace commits.
  it('T1a: a found ledger_answer turn renders answerText verbatim; no reviewing/changes, no Apply-to-run, chat stays mounted', async () => {
    await mount()
    await sendTurn('what was the workstate history of the ROS run?')
    // Verified server ordering: ledger_answer during run(), done after.
    await emit({ type: 'ledger_answer', answer: FOUND })
    await emit({ type: 'done', result: { success: true, notes: ['Ledger answer delivered from stored snapshots.'] } })

    // (a) the SERVER-BUILT answer is in the rendered chat pane, verbatim.
    const trace = screen.getByTestId('message-log-trace')
    expect(trace.textContent).toContain(FOUND.answerText as string)
    expect(screen.getByTestId('trace-ledger')).toBeTruthy()
    // (b) the pane is NOT in 'reviewing'/changes mode.
    expect(screen.queryByTestId('ai-subtab-changes')).toBeNull()
    expect(screen.getByTestId('ai-tab-system-prompt').textContent).not.toContain('Review changes')
    // (c) NO 'Apply to run' affordance anywhere.
    expect(screen.queryByTestId('changes-apply')).toBeNull()
    expect(screen.queryByText('Apply to run')).toBeNull()
    // (d) chat subtab active and the input enabled.
    expect(screen.getByTestId('ai-subtab-chat').className).toContain('ai-tab__subtab--active')
    expect(screen.getByTestId('chat-input')).toBeTruthy()
  })

  it('T1b: a no-history ledger_answer turn renders the honest answer verbatim with its labeled lab events; no changes review', async () => {
    await mount()
    await sendTurn('what was the workstate of the run last month?')
    await emit({ type: 'ledger_answer', answer: NO_HISTORY })
    await emit({ type: 'done', result: { success: true, notes: ['Ledger answer delivered from stored snapshots.'] } })

    const trace = screen.getByTestId('message-log-trace')
    expect(trace.textContent).toContain(NO_HISTORY.answerText as string)
    expect(screen.getByTestId('trace-ledger-lab-events').textContent).toContain('lab events, not workstate')
    expect(screen.queryByTestId('ai-subtab-changes')).toBeNull()
    expect(screen.queryByTestId('changes-apply')).toBeNull()
    expect(screen.queryByText('Apply to run')).toBeNull()
    expect(screen.getByTestId('ai-subtab-chat').className).toContain('ai-tab__subtab--active')
    expect(screen.getByTestId('chat-input')).toBeTruthy()
  })

  it('T2 (regression): a workstate_proposal turn still keeps the card as the ONLY review surface', async () => {
    await mount()
    await sendTurn('open the ROS run')
    await emit({ type: 'workstate_proposal', workstate: INTENT })
    await emit({ type: 'done', result: { success: true, notes: ['Proposed a workspace — review the card to accept; nothing was written.'] } })

    expect(screen.getByTestId('workstate-card')).toBeTruthy()
    expect(screen.getByTestId('workstate-card-accept')).toBeTruthy()
    expect(screen.queryByTestId('ai-subtab-changes')).toBeNull()
    expect(screen.queryByTestId('changes-apply')).toBeNull()
    expect(screen.getByTestId('ai-subtab-chat').className).toContain('ai-tab__subtab--active')
  })

  it('T3 (regression): a normal draft turn still opens draft-ready with a real changes review', async () => {
    await mount()
    await sendTurn('draft a transfer')
    await emit({ type: 'done', result: { success: true, events: [{ event_type: 'transfer' }] } })

    expect(screen.getByTestId('ai-subtab-changes')).toBeTruthy()
    expect(screen.getByTestId('changes-apply')).toBeTruthy()
  })

  it('T4 (flag hygiene): a ledger turn followed by a normal draft turn — the second turn DOES open draft-ready', async () => {
    await mount()

    // Turn 1: ledger turn — renders the answer, parks on NOTHING.
    await sendTurn('what was the workstate history of the ROS run?')
    await emit({ type: 'ledger_answer', answer: FOUND })
    await emit({ type: 'done', result: { success: true, notes: ['Ledger answer delivered from stored snapshots.'] } })
    expect(screen.queryByTestId('ai-subtab-changes')).toBeNull()
    expect(screen.getByTestId('message-log-trace').textContent).toContain(FOUND.answerText as string)

    // Turn 2: a normal draft turn must NOT be suppressed by the ledger flag.
    await sendTurn('draft a transfer')
    await emit({ type: 'done', result: { success: true, events: [{ event_type: 'transfer' }] } })
    expect(screen.getByTestId('ai-subtab-changes')).toBeTruthy()
    expect(screen.getByTestId('changes-apply')).toBeTruthy()
  })
})
