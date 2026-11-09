/**
 * L2-CLARIFY-TARGET-1 — UI-GATE FIX 1 / D3 (the inert row `Discard` toggle).
 *
 * The gate (receipt 2026-11-03_112138 §Defect 3): after a real pointer click AND
 * a direct DOM click, `aria-pressed` stays "false", the verb stays `Discard`,
 * the header stays `1 event`, and the row keeps `chat-preview__event` — the verb
 * can never become `Restore`.
 *
 * Two wiring facts make the toggle inert at the surface:
 *  (1) RE-RENDER: the pane (HarnessChatPane) is a CONSUMER — it reads
 *      `chatRef.current` and re-renders ONLY when the AiPanel registration
 *      version bumps (AiPanelContext `useAiPanel`/`useRegistrationStore`, the
 *      seam whose comment at AiPanelContext.tsx:193-197 says "a clarification
 *      turn provides no such host re-render"). The bump is driven by
 *      `paneRelevantSignature` in `useRegisterAiChat` — and that signature
 *      OMITS `previewEventStates`, so dropping/restoring a row never bumps and
 *      the pane keeps rendering the stale (pending) row.
 *  (2) HEADER COUNT: `ChatPreviewCard` counts the header as the total staged
 *      events (`events.length`) — a dropped row is still in `previewEvents`
 *      (dropping only flips its STATE in `previewEventStates`), so the header
 *      must count the ACTIVE (non-dropped) events to reflect the row's real
 *      dropped state.
 *
 * These pins exercise the REAL seam end-to-end (the defect), not just
 * render-from-a-given-state (already pinned by ChatPreviewCard.rowFact). A
 * stateful host OWNS the staged preview exactly the way `useAiChat` does
 * (a `useState` Map + a `setPreviewEventState` that builds a NEW Map, as the
 * real setter at useAiChat.ts:1120-1125 does) and registers it via
 * `useRegisterAiChat`. The host and the pane are SIBLINGS under one
 * `AiPanelProvider` (separate subtrees) so the pane can ONLY see the change
 * through the registration bump — never through host re-render propagation.
 * That is the faithful production topology (the pane is a consumer in a
 * different subtree from the chat-owning host). The toggle's write path is the
 * EXISTING `chat.setPreviewEventState` (the rowFact-guarded seam) — no new
 * store, no new event type. RED against the pre-fix wiring (signature omits
 * the states, so a drop triggers no bump and the pane stays stale; the header
 * counts all events).
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { AiPanelProvider, useRegisterAiChat } from '../shared/context/AiPanelContext'
import type { UseAiChatReturn } from '../shared/hooks/useAiChat'
import { HarnessChatPane } from './HarnessChatPane'

// ChatLog's import graph reaches pdfjs-dist; mock it so jsdom does not crash on
// DOMMatrix (the proven pattern from HarnessChatPane.test.tsx).
vi.mock('pdfjs-dist', () => ({
  getDocument: vi.fn(() => ({ promise: Promise.resolve({ numPages: 0, fingerprints: [''], getPage: () => Promise.resolve(null), destroy: () => undefined }), destroy: () => undefined })),
  GlobalWorkerOptions: { workerSrc: '' },
  TextLayer: class { render() { return Promise.resolve() } },
}))
// The preview card does not render a picker, but ChatLog imports the module;
// mock to a no-op so the pane mounts without the slash-resolver graph.
vi.mock('../event-editor/right-pane/ai/ClarificationPicker', () => ({
  ClarificationPicker: () => null,
  requestHasPicker: () => false,
}))

afterEach(cleanup)

type PState = 'pending' | 'rejected'

/**
 * The chat-owning HOST (faithful to `useAiChat`): owns the staged preview — a
 * `useState` Map of per-event states plus a `setPreviewEventState` that builds
 * a NEW Map (exactly useAiChat.ts:1120-1125) — and registers the current chat
 * each render. Renders NOTHING (the pane is a sibling consumer in a separate
 * subtree), so a row drop can only reach the pane through the registration
 * bump.
 */
function ChatHost() {
  const [previewEventStates, setPreviewEventStatesMap] = useState<Map<string, PState>>(
    () => new Map<string, PState>([['EVT-1', 'pending']]),
  )
  const previewEvents = [
    { eventId: 'EVT-1', event_type: 'add_material', details: { well: 'A1', material: 'DMEM', volumeUl: 100, volume: { value: 100, unit: 'uL' } } },
  ]
  const setPreviewEventState = (eventId: string, state: PState) => {
    setPreviewEventStatesMap((prev) => {
      const next = new Map(prev)
      next.set(eventId, state)
      return next
    })
  }
  const chat = {
    messages: [],
    isStreaming: false,
    isAccepting: false,
    previewEvents,
    previewLabwareAdditions: [],
    previewEventStates,
    previewStagedLabwareCount: 1,
    executingApplianceJobIds: new Set<string>(),
    hasPreview: true,
    unresolvedRefs: [],
    honestWall: null,
    adoptionError: null,
    inputText: '',
    sendPrompt: vi.fn(),
    cancelStream: vi.fn(),
    acceptPreview: vi.fn(),
    acceptPreviewWithResolutions: vi.fn(),
    rejectPreview: vi.fn(),
    setPreviewEventState,
    setPreviewEvents: vi.fn(),
    commitAcceptedPreviewEvents: vi.fn(async () => {}),
    clearStagedPreviewForExternalCommit: vi.fn(),
    clearHistory: vi.fn(),
    applyToGraph: vi.fn(),
    executeInstrumentApplianceJob: vi.fn(async () => {}),
    aiAvailable: true,
    recheckHealth: vi.fn(),
    thinkingMode: false,
    setThinkingMode: vi.fn(),
  } as UseAiChatReturn
  useRegisterAiChat(chat)
  return null
}

/** The PANE (consumer) — a SEPARATE subtree from the host, so it re-renders
    only via the AiPanel registration bump. */
function renderTree() {
  return render(
    <AiPanelProvider>
      <ChatHost />
      <HarnessChatPane />
    </AiPanelProvider>,
  )
}

function countsText(): string {
  const section = screen.getByTestId('chat-preview')
  return section.querySelector('.chat-preview__counts')?.textContent ?? ''
}

describe('D3 (UI-gate fix 1): the row Discard toggle actually drops and restores', () => {
  it('dropping the only staged row -> Restore + dimmed class + header count 0; restoring -> back', () => {
    renderTree()

    // Initial (pending): the row is active, the verb is the bar's own `Discard`,
    // and the header counts the one staged event.
    const row = screen.getByTestId('chat-preview').querySelector('li') as HTMLElement
    const toggle = screen.getByTestId('chat-preview-toggle-EVT-1') as HTMLButtonElement
    expect(row.className).toBe('chat-preview__event')
    expect(toggle.textContent).toBe('Discard')
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
    expect(countsText()).toBe('1 event · 1 new labware')

    // DROP (a real pointer click on the row toggle): the existing staged-preview
    // state is the only write path. The pane is a sibling consumer — the ONLY
    // way it can see the drop is the registration bump (the signature). Pre-fix
    // the signature omits previewEventStates, so no bump, no re-render: the row
    // stays stale (this is the inert-Discard defect).
    fireEvent.click(toggle)
    const droppedRow = screen.getByTestId('chat-preview').querySelector('li') as HTMLElement
    const droppedToggle = screen.getByTestId('chat-preview-toggle-EVT-1') as HTMLButtonElement
    expect(droppedRow.className).toBe('chat-preview__event chat-preview__event--dropped')
    expect(droppedToggle.textContent).toBe('Restore')
    expect(droppedToggle.getAttribute('aria-pressed')).toBe('true')
    // header count reflects the row's real dropped state (0 events will apply)
    expect(countsText()).toBe('0 events · 1 new labware')

    // RESTORE (click again): back to the pending state.
    fireEvent.click(droppedToggle)
    const restoredRow = screen.getByTestId('chat-preview').querySelector('li') as HTMLElement
    const restoredToggle = screen.getByTestId('chat-preview-toggle-EVT-1') as HTMLButtonElement
    expect(restoredRow.className).toBe('chat-preview__event')
    expect(restoredToggle.textContent).toBe('Discard')
    expect(restoredToggle.getAttribute('aria-pressed')).toBe('false')
    expect(countsText()).toBe('1 event · 1 new labware')
  })
})
