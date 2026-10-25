/**
 * REVISE-GHOST-1 fix 3 (browser-gate Defect 2, attempt-9 receipts
 * 2026-10-24-attempt9: q3kibt revise 'Actually make it 32 wells instead…'
 * → done success=true events=0 clarifications=1 after 66.5s; the gate's 30s
 * poll measured INTERPRETING + 'No operations parsed yet' + cards=0,
 * chatSend=0, chatInput=0, honestWall=0, noStopObserved:true — a pane with
 * NO questions, NO input and NO escape).
 *
 * The trace (verified from source, not assumed): the revise hold arm is NOT
 * swallowed — onDraftResult dispatches 'clarifications-needed' BEFORE the
 * preview leg (the `if (!hasPreview) return` at the preview build sits after
 * the sidebar dispatch), so a hold that ARRIVES renders its cards even with a
 * preview mounted (guard leg 1 below pins this on the revise context:
 * historyLen>0, previewActive). What the gate actually caught is the window
 * BEFORE arrival: sidebar 'interpreting' renders NO ChatInput (isChatEnabled
 * false), NO clarifying/updating block, NO Stop — a 66-second cold-model turn
 * leaves the pane with zero controls and zero surfaced reason. D4: never a
 * stuck/happy-empty state — the pane must carry an escape while the turn is
 * in flight.
 *
 * Fix shape: the 'interpreting' mode renders a Stop escape that aborts the
 * in-flight stream AND returns the sidebar to chat (reset). The mounted
 * preview is NOT discarded (Stop abandons the request, not the draft the
 * deck already shows). Fresh-draft hold arms stay byte-identical.
 *
 * Harness: the option-capturing `useChatThread` seam (ghostRemount pattern)
 * with a mutable chat state so the test can hold the pane mid-turn
 * (pending non-null → isStreaming true), and the fixIt pendingRetryPrompt
 * effect as the REAL handleSend drive (start-interpreting + sendChat).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { OpenTabsProvider } from '../../../shared/shell/OpenTabsContext'
import { WorkspaceProvider } from '../../workspace/WorkspaceContext'
import { defaultWorkspaceState } from '../../workspace/types'
import type { PlatformManifest } from '../../../types/platformRegistry'
import type { AiClarificationRequest } from '../../../types/ai'

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
  chatOptions: null as null | { onDraftResult?: (result: unknown, prompt: string) => void },
  chatState: {
    current: {
      messages: [] as Array<{ id: string; role: 'user' | 'assistant'; text: string; ts: number }>,
      pending: null as null | { id: string; role: 'assistant'; text: string; ts: number },
      status: null as null | { message: string },
      error: null as string | null,
    },
  },
  streaming: { current: false },
  onSend: null as null | ((text: string) => void | Promise<void>),
  editorActions: {
    setPreview: vi.fn(),
    clearPreview: vi.fn(),
    commitPreview: vi.fn(),
    consumeRetryPrompt: vi.fn(),
    setGraphLemurSource: vi.fn(),
  },
  editor: { current: null as unknown },
  api: {
    intentCompile: vi.fn(async () => ({})),
    warmAiContext: vi.fn(async () => null),
    getAiWarmStatus: vi.fn(async () => null),
    getSurfaces: vi.fn(async () => ({ surfaces: [] })),
    listAiProfiles: vi.fn(async () => ({ profiles: [] })),
  },
}))

vi.mock('./useChatThread', () => ({
  useChatThread: (options: { onDraftResult?: (result: unknown, prompt: string) => void }) => {
    mocks.chatOptions = options
    return {
      get state() {
        return mocks.chatState.current
      },
      isStreaming: mocks.streaming.current,
      send: vi.fn(async () => undefined),
      stop: vi.fn(() => {
        // Mirror the real stop: the stream is no longer in flight.
        mocks.streaming.current = false
        mocks.chatState.current = { ...mocks.chatState.current, pending: null, status: null }
      }),
      reset: vi.fn(),
      clearProtocolCandidate: vi.fn(),
    }
  },
}))

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

vi.mock('../../EventEditorContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../EventEditorContext')>()
  return { ...actual, useOptionalEventEditor: () => mocks.editor.current }
})

vi.mock('../../protocol/ProtocolSelectionContext', () => ({
  NO_PROTOCOL_RESOURCES: { labwares: [], equipment: [] },
  NO_LABWARE_BINDINGS: {},
  useProtocolSelection: () => null,
}))

vi.mock('../../../shared/api/client', () => ({ apiClient: mocks.api }))

import { AiTabPanel } from './AiTabPanel'

const singlePlateVariant = {
  id: 'manual_single_plate',
  title: 'Single SBS Plate',
  slots: [{ id: 'PLATE', kind: 'standard' as const, orientationMode: 'locked_landscape' as const, reachable: true }],
}
const singlePlatePlatform: PlatformManifest = {
  id: 'manual',
  label: 'Manual',
  allowedVocabIds: ['liquid-handling/v1'],
  defaultVariant: 'manual_single_plate',
  toolTypeIds: [],
  modules: [],
  variants: [singlePlateVariant],
}

const SHORTHAND_YAML = [
  'intentId: rg1-fix3-revise-hold',
  'actions:',
  '  - action: add_material',
  '    labware: Sample Plate',
  '    material: Test Reagent',
  '    volumeUl: 50',
  '    targetWells: [A1, A2, A3]',
  '',
].join('\n')

const HOLD_QUESTION: AiClarificationRequest = {
  id: 'unresolved-c-rg1-fix3',
  kind: 'material',
  prompt: 'The draft names "Test Reagent" and the lab spine could not bind it (no matching record). Choose what it is.',
  entityType: 'material',
  menuProvider: '/m',
  query: 'Test Reagent',
  options: [],
  allowCreateLocal: true,
}

function mountRunDeck(withPreview: boolean) {
  mocks.editor.current = {
    state: {
      platforms: [singlePlatePlatform],
      platformId: 'manual',
      variantId: 'manual_single_plate',
      runId: 'EXR-LANE2-AI10',
      placements: [],
      labwares: {},
      events: [],
      selection: null,
      focusPlacementId: null,
      vocabPackId: 'liquid-handling/v1',
      eventGraphId: 'EVG-rg1-fix3-hold',
      preview: withPreview
        ? {
            previewLabwares: {},
            previewEquipments: {},
            previewPlacements: [],
            previewEvents: [
              { eventId: 'ev-rg1-hold-1', event_type: 'add_material', details: { labwareId: 'LAB-x', wells: ['A1'] } },
            ],
            labwareRequirements: [],
            labwareAdditions: [],
            revisionHistory: [{ prompt: 'add 50 uL of Test Reagent to A1:A3', createdAt: '2026-10-24T02:16:00.000Z' }],
          }
        : null,
      fixIt: {
        isOpen: false,
        seed: null,
        chat: [],
        streaming: false,
        stage: 'idle',
        error: null,
        spec: null,
        applyStage: null,
        applyProgress: [],
        applyReasoning: '',
        applyResult: null,
        fixHistory: [],
        pendingRetryPrompt: null,
      },
    },
    actions: mocks.editorActions,
  }
}

function panelTree() {
  const base = defaultWorkspaceState('STU-000001')
  return (
    <MemoryRouter>
      <OpenTabsProvider>
        <WorkspaceProvider
          studyId="STU-000001"
          saveDebounceMs={0}
          loadFn={async () => ({
            state: {
              ...base,
              tabs: [{ id: 't1', kind: 'deck' as const, eventGraphId: 'EVG-rg1-fix3-hold', title: 'Deck' }],
              activeTabId: 't1',
            } as ReturnType<typeof defaultWorkspaceState>,
          })}
          saveFn={async (_id, s) => ({ state: s })}
        >
          <AiTabPanel />
        </WorkspaceProvider>
      </OpenTabsProvider>
    </MemoryRouter>
  )
}

/** Drive the REAL handleSend through the ChatInput seam (the ledgerTurn
 *  pattern): the panel's onSend IS handleSend — start-interpreting + sendChat. */
async function driveSend() {
  await act(async () => {
    fireEvent.click(screen.getByTestId('chat-input-send'))
    await Promise.resolve()
  })
}

function emitDraft(result: unknown, prompt: string) {
  return act(async () => {
    mocks.chatOptions?.onDraftResult?.(result, prompt)
  })
}

beforeEach(() => {
  cleanup()
  mocks.chatOptions = null
  mocks.editor.current = null
  mocks.streaming.current = false
  mocks.chatState.current = { messages: [], pending: null, status: null, error: null }
  vi.clearAllMocks()
})

describe('REVISE-GHOST-1 fix3 — a revise-context hold is never a stuck pane (D4: cards OR an escape, never happy-empty)', () => {
  it('guard (arm order, byte-stable): a hold arriving WHILE a preview is mounted (revise context) still dispatches clarifications-needed and renders its cards — the preview leg never swallows it', async () => {
    mountRunDeck(true)
    render(panelTree())
    await screen.findByTestId('ai-tab-system-prompt')

    await emitDraft(
      {
        success: true,
        events: [],
        clarificationRequests: [HOLD_QUESTION],
        shorthand: SHORTHAND_YAML,
      },
      'Actually make it 32 wells instead, keep the rest the same.',
    )

    // The hold arm fired BEFORE any preview early-return: mode 'clarifying'
    // → the Questions subtab + the card render even with a preview mounted.
    expect(await screen.findByTestId('questions-panel')).toBeTruthy()
    expect(screen.queryByText('Interpreting…')).toBeNull()
    expect(document.querySelector(`[data-question-id="${HOLD_QUESTION.id}"]`)).toBeTruthy()
  })

  it('RED (the gate window): while a turn is in flight (sidebar interpreting), the pane renders an escape — Stop aborts the stream, returns the pane to chat, and does NOT discard the mounted preview', async () => {
    mountRunDeck(true)
    render(panelTree())
    await screen.findByTestId('ai-tab-system-prompt')

    // Mid-turn posture: handleSend dispatched 'interpreting' and the stream is
    // in flight (pending non-null → isStreaming true).
    mocks.streaming.current = true
    mocks.chatState.current = {
      messages: [{ id: 'msg-1-user', role: 'user', text: 'Actually make it 32 wells instead, keep the rest the same.', ts: 1 }],
      pending: { id: 'msg-2-assistant', role: 'assistant', text: '', ts: 2 },
      status: { message: 'Processing workspace.deck request…' },
      error: null,
    }
    await driveSend()

    expect(await screen.findByText('Interpreting…')).toBeTruthy()
    // The gate measured chatSend=0, chatInput=0, noStopObserved:true — the
    // pane had NO control at all. The escape must exist while interpreting.
    const stop = screen.getByTestId('interpreting-stop')
    expect(stop).toBeTruthy()

    fireEvent.click(stop)

    // The stream was aborted and the sidebar returned to chat — the pane is
    // usable again (ChatInput mounted), NOT stranded at 'interpreting'.
    expect(screen.queryByText('Interpreting…')).toBeNull()
    expect(await screen.findByTestId('chat-input')).toBeTruthy()
    // Stop abandons the REQUEST, not the draft: the mounted preview survives.
    expect(mocks.editorActions.clearPreview).not.toHaveBeenCalled()
  })

  it('the escape also covers a dead stream (error frame, no done): interpreting + no in-flight stream still offers the escape and reset returns to chat', async () => {
    mountRunDeck(true)
    render(panelTree())
    await screen.findByTestId('ai-tab-system-prompt')

    mocks.chatState.current = {
      messages: [{ id: 'msg-1-user', role: 'user', text: 'revise', ts: 1 }],
      pending: null,
      status: null,
      error: 'socket hang up',
    }
    await driveSend()

    expect(await screen.findByText('Interpreting…')).toBeTruthy()
    fireEvent.click(screen.getByTestId('interpreting-stop'))
    expect(screen.queryByText('Interpreting…')).toBeNull()
    expect(await screen.findByTestId('chat-input')).toBeTruthy()
  })
})
