/**
 * L2-CLARIFY-TARGET-1 — UI-GATE FIX 1 / D2 (the host path with a REAL selection).
 *
 * The ruling (Q2) makes `HarnessChatPane` the host that SUPPLIES the slot's
 * selection as DATA: it reads `useOptionalEventEditor()?.state.selection`
 * (the deck's real selection), maps it at the seam to a sorted plain
 * `readonly string[]` of well addresses, and threads one optional prop
 * `selectedWells` down `ChatLog` -> `ClarifyWellTargetSlot`. The slot keeps
 * `useOptionalWellSelection()` as its fallback (no existing caller breaks),
 * but when the host supplies the prop it takes precedence.
 *
 * These pins render the HOST PATH with a real selection. They are deliberately
 * NOT the test-scoped-past-the-defect pattern: nothing here is wrapped in a
 * `WellSelectionProvider` (that is how the old slot-only pins went green while
 * the live deck stayed inert — the slot's context fallback is never the thing
 * under test). Instead the host's OWN seam (`useOptionalEventEditor`) is the
 * source of the selection, so the pin exercises the actual fix: host reads the
 * deck's published selection -> maps it -> threads it -> the slot renders the
 * enabled affordance. RED against the pre-fix code (where the host never read
 * the editor and never threaded a prop, so the slot's context fallback saw
 * null and rendered neither button nor reason line).
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AiPanelProvider, useRegisterAiChat } from '../shared/context/AiPanelContext'
import type { UseAiChatReturn } from '../shared/hooks/useAiChat'
import type { AiClarificationRequest, ChatMessage } from '../types/ai'
import { HarnessChatPane } from './HarnessChatPane'

// ChatLog reuses clarificationAnswerPrompt from AiTabPanel, whose import graph
// reaches pdfjs-dist; mock it so jsdom does not crash on DOMMatrix (same
// proven pattern as HarnessChatPane.test.tsx).
vi.mock('pdfjs-dist', () => ({
  getDocument: vi.fn(() => ({ promise: Promise.resolve({ numPages: 0, fingerprints: [''], getPage: () => Promise.resolve(null), destroy: () => undefined }), destroy: () => undefined })),
  GlobalWorkerOptions: { workerSrc: '' },
  TextLayer: class { render() { return Promise.resolve() } },
}))

// Deterministic fake picker (the single-request wells test uses
// menuProvider:'choice' so no picker renders; mock to a no-op so the card
// mounts without the slash-resolver graph — the proven pattern from
// ChatClarification.target1.test.tsx).
vi.mock('../event-editor/right-pane/ai/ClarificationPicker', () => ({
  ClarificationPicker: () => null,
  requestHasPicker: () => false,
}))

// The HOST seam under test: the deck's real well selection. We override ONLY
// useOptionalEventEditor (the host reads state.selection from here); every
// other export of EventEditorContext is preserved verbatim via importOriginal,
// so nothing else in the graph is touched. This is the host SUPPLYING its
// selection as data — the fix the ruling names — NOT a WellSelectionProvider
// wrapped around the slot.
const selectedWellsMock = vi.hoisted(() => ({
  // mutable so each case can point the deck at a different selection
  current: null as { labwareId: string; wells: string[]; anchor: string | null } | null,
}))
vi.mock('../event-editor/EventEditorContext', async (importOriginal) => {
  const original = await importOriginal<typeof import('../event-editor/EventEditorContext')>()
  return {
    ...original,
    useOptionalEventEditor: () =>
      selectedWellsMock.current == null ? null : { state: { selection: selectedWellsMock.current } },
  }
})

afterEach(() => {
  cleanup()
  selectedWellsMock.current = null
})

/** A stub of the registered chat: only the fields the pane actually consumes. */
function stubChat(overrides: Partial<UseAiChatReturn> = {}): UseAiChatReturn {
  const base = {
    messages: [] as ChatMessage[],
    isStreaming: false,
    isAccepting: false,
    previewEvents: [],
    previewLabwareAdditions: [],
    previewEventStates: new Map(),
    executingApplianceJobIds: new Set<string>(),
    hasPreview: false,
    unresolvedRefs: [],
    inputText: '',
    sendPrompt: vi.fn(),
    cancelStream: vi.fn(),
    acceptPreview: vi.fn(),
    acceptPreviewWithResolutions: vi.fn(),
    rejectPreview: vi.fn(),
    setPreviewEventState: vi.fn(),
    setPreviewEvents: vi.fn(),
    commitAcceptedPreviewEvents: vi.fn(async () => {}),
    clearHistory: vi.fn(),
    applyToGraph: vi.fn(),
    executeInstrumentApplianceJob: vi.fn(async () => {}),
    aiAvailable: true,
    recheckHealth: vi.fn(),
    thinkingMode: false,
    setThinkingMode: vi.fn(),
  }
  return { ...base, ...overrides } as UseAiChatReturn
}

/** Host that registers a chat into the nearest AiPanelProvider (the seam's producer). */
function Registrant({ chat, children }: { chat: UseAiChatReturn; children: React.ReactNode }) {
  useRegisterAiChat(chat)
  return <>{children}</>
}

// The live target-wells shape (useAiChat.ts first-ask): the assistant bubble's
// `content` IS the first request's prompt, and the single-request typed arm
// renders the declared wells slot.
const wellsRequest: AiClarificationRequest = {
  id: 'req-wells',
  kind: 'general',
  prompt: 'Which plate wells are the targets?',
  entityType: 'wells',
  menuProvider: 'choice', // no picker -> the declared slot is the answer surface
  options: [],
  slot: 'targetWells',
  clarifyControl: { kind: 'wells', question: 'Which plate wells are the targets?' },
} as AiClarificationRequest

function renderWithWellsTurn(selection: { labwareId: string; wells: string[]; anchor: string | null } | null) {
  selectedWellsMock.current = selection
  const message: ChatMessage = {
    id: 'a1',
    role: 'assistant',
    content: wellsRequest.prompt,
    clarificationRequests: [wellsRequest],
    timestamp: 0,
  }
  return render(
    <AiPanelProvider>
      <Registrant chat={stubChat({ messages: [message] })}>
        <HarnessChatPane />
      </Registrant>
    </AiPanelProvider>,
  )
}

describe('D2 (UI-gate fix 1): the host supplies the deck selection to the slot', () => {
  it('a rectangular deck selection renders the ENABLED "Use selected wells (A2:B3)" button (host path, real selection)', () => {
    // A full 2x2 rectangle, deliberately UNsorted -> the host must sort it at
    // the seam (the button names the sorted range literal).
    renderWithWellsTurn({ labwareId: 'lbw-seed', wells: ['B3', 'A2', 'B2', 'A3'], anchor: 'A2' })
    const btn = screen.getByRole('button', { name: 'Use selected wells (A2:B3)' })
    expect(btn).toBeInTheDocument()
    expect((btn as HTMLButtonElement).disabled).toBe(false)
    // the reason line must be ABSENT for a rectangular (valid) selection
    expect(screen.queryByTestId('clarify-well-target-use-selected-reason')).toBeNull()
  })

  it('a single-well selection renders the ENABLED bare-address button (B2, never B2:B2)', () => {
    renderWithWellsTurn({ labwareId: 'lbw-seed', wells: ['B2'], anchor: 'B2' })
    const btn = screen.getByRole('button', { name: 'Use selected wells (B2)' })
    expect(btn).toBeInTheDocument()
    expect((btn as HTMLButtonElement).disabled).toBe(false)
  })

  it('a non-rectangular selection renders the DISABLED button naming the wells + the verbatim reason line', () => {
    // A missing corner (an L-shape): A2, A3, B2 but not B3 -> not a full rectangle.
    renderWithWellsTurn({ labwareId: 'lbw-seed', wells: ['A2', 'A3', 'B2'], anchor: 'A2' })
    const btn = screen.getByRole('button', { name: 'Use selected wells (A2, A3, B2)' })
    expect(btn).toBeInTheDocument()
    expect((btn as HTMLButtonElement).disabled).toBe(true)
    const reason = screen.getByTestId('clarify-well-target-use-selected-reason')
    expect(reason).toHaveTextContent(
      "Selection isn't a rectangular range — type it as a well address or range (e.g. A2:B3).",
    )
  })

  it('with no deck selection (run-workspace host) the slot renders WITHOUT the button and nothing crashes', () => {
    renderWithWellsTurn(null) // no editor selection at all
    // the slot still mounts (input + approve) but the affordance is absent
    expect(screen.getByTestId('clarify-well-target-slot')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Use selected wells/ })).toBeNull()
  })

  it('with an EMPTY deck selection the button is absent (empty selection is no selection)', () => {
    renderWithWellsTurn({ labwareId: 'lbw-seed', wells: [], anchor: null })
    expect(screen.getByTestId('clarify-well-target-slot')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Use selected wells/ })).toBeNull()
  })
})
