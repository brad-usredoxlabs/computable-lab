/**
 * L2-SUITE-A-uifix1 [D1] RED — a deck_layout done does not change the deck
 * (gate: P1 "Navigate to the freeform manual deck" left the deck on
 * "Liquid Handling · Manual · Single SBS Plate"; only an honest wall showed.
 * retargeted from DeckSurfaceChat — assertions unchanged (CHATHOST-CONSOLIDATE-1 T-3)
 * The SERVER leg works: `done deck_layout success=true variant=manual_freeform`
 * every drive — AgentOrchestrator.ts:2885-2920 returns
 * `{ success: true, deckLayout: { platformId, variantId } }`, a deliverable
 * channel the universal done arm (useAiChat.ts:1095-1265) has NO mount arm
 * for — the "NO universal arm" comment at useAiChat.ts:1205-1213).
 *
 * The fix ports the SAME editor action the legacy/native surfaces use to
 * switch the deck — `actions.setPlatform` + `actions.setVariant`
 * (EventEditorContext.tsx:1102-1103; variant `manual_freeform` =
 * "Manual Bench (freeform)", defaultManifests.ts:71-72) — into the universal
 * deck path through the deck door seam (smallest correct seam: the
 * same ref-callback family as onProposalDrafted).
 *
 * RED pins (shaped on the gate trail's P1 read):
 *  - the done's deckLayout is APPLIED to the editor state: the deck variant
 *    flips to the delivered one (the toolbar label would become
 *    "Manual · Manual Bench (freeform)");
 *  - the variant is validated against the platform manifest — an unknown
 *    variant is NOT applied (the server validates loosely; the client guards,
 *    per the server's own contract comment);
 *  - the false "AI completed the task but did not propose any changes."
 *    bubble is absent (the deck visibly changed — the turn DID propose
 *    something);
 *  - the honest wall still names the delivered channel (its job — and with
 *    the D2 verb fix: "it delivered only a deck layout").
 */
import { cleanup, fireEvent, render } from '@testing-library/react'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AiPanelProvider } from '../../shared/context/AiPanelContext'
import { streamAssist } from '../../shared/api/aiClient'
import { DeckChatSlice } from './DeckChatSlice'
import { SurfaceChatBridge } from '../../shared/shell/SurfaceChatBridge'
import { HarnessChatPane } from '../../agent/HarnessChatPane'

// LEG D step 5 (OQ-4 PORT): HarnessChatPane now mounts the attached-sources
// chrome (RunInEventEditorButton), whose usePdfViewer excerpt dep reaches
// pdfjs-dist — jsdom has no DOMMatrix, so mock it (the proven pattern this
// file already relied on transitively). Mock-only; no assertion changes.
vi.mock('pdfjs-dist', () => ({
  getDocument: vi.fn(() => ({ promise: Promise.resolve({ numPages: 0, fingerprints: [''], getPage: () => Promise.resolve(null), destroy: () => undefined }), destroy: () => undefined })),
  GlobalWorkerOptions: { workerSrc: '' },
  TextLayer: class { render() { return Promise.resolve() } },
}))
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: 'worker.mjs' }))
import type { EventEditorState } from '../EventEditorContext'

const mocks = vi.hoisted(() => ({
  state: null as unknown as EventEditorState,
  setPlatform: vi.fn(),
  setVariant: vi.fn(),
  setPreview: vi.fn((preview: unknown) => {
    mocks.state = { ...mocks.state, preview } as unknown as EventEditorState
  }),
  clearPreview: vi.fn(),
  appendEvent: vi.fn(),
  commitPreview: vi.fn(),
}))

vi.mock('../EventEditorContext', () => ({
  useEventEditor: () => ({
    state: mocks.state,
    actions: {
      setPlatform: mocks.setPlatform,
      setVariant: mocks.setVariant,
      setPreview: mocks.setPreview,
      clearPreview: mocks.clearPreview,
      appendEvent: mocks.appendEvent,
      commitPreview: mocks.commitPreview,
    },
  }),
}))

vi.mock('../eventGraphPersistence', () => ({
  persistAcceptedEventGraph: vi.fn(async (input: { eventGraphId?: string | null }) => ({
    eventGraphId: input.eventGraphId ?? 'EG-1',
    commit: { sha: 'sha-ghost', message: 'ghost test commit', timestamp: '2026-10-26T00:00:00Z' },
  })),
}))

vi.mock('../../shared/api/aiClient', () => ({
  streamAssist: vi.fn(),
  getAiHealth: vi.fn().mockResolvedValue({ available: true }),
}))

vi.mock('../../shared/api/aiThreadClient', () => ({
  getThread: vi.fn().mockRejectedValue(new Error('no thread')),
  appendThreadMessage: vi.fn().mockResolvedValue(undefined),
  promoteThread: vi.fn().mockResolvedValue(undefined),
  // L2-THREAD-SCOPED-1 FIX2 D1: useAiChat statically imports listThreads
  // (the picker's seam), so a wholesale mock of this module must export it —
  // an unexported named import throws at the pane's mount. Empty list: the
  // deckLayout lock never exercises the picker.
  listThreads: vi.fn(async () => ({ threads: [] })),
}))

vi.mock('../../shared/api/client', () => ({
  apiClient: {
    getRecord: vi.fn(),
    getPromptTemplate: vi.fn().mockResolvedValue({ error: 'not found' }),
  },
}))

vi.mock('../../shared/ai/useWorkstateProposalFlow', () => ({
  useWorkstateProposalFlow: () => ({
    card: null,
    proposeWorkstate: vi.fn(),
    acceptWorkstate: vi.fn(),
    rejectWorkstate: vi.fn(),
    handleAgentAction: vi.fn(),
  }),
}))

vi.mock('../right-pane/ai/WorkstateProposalCard', () => ({
  WorkstateProposalCard: (props: { summary?: string }) => (
    <div data-testid="workstate-card">{props.summary}</div>
  ),
}))

afterEach(cleanup)

// The gate's deck: Manual platform, single-plate variant (the "Liquid
// Handling · Manual · Single SBS Plate" toolbar read), PLUS the freeform
// variant the P1 turn asks for (defaultManifests.ts:71-72 /
// config/platforms/manual.yaml:39-40 — declared data, not a test stub).
const singlePlateVariant = {
  id: 'manual_single_plate',
  title: 'Single SBS Plate',
  slots: [{ id: 'PLATE', kind: 'standard' as const, orientationMode: 'locked_landscape' as const, reachable: true }],
}
const freeformVariant = {
  id: 'manual_freeform',
  title: 'Manual Bench (freeform)',
  slots: [] as Array<{ id: string; kind: string }>,
  surface: { kind: 'lawn' as const, widthMm: 1200, heightMm: 800 },
  sideLawn: { widthMm: 600, heightMm: 400, label: 'Labware lawn' },
}
const manualPlatform = {
  id: 'manual',
  label: 'Manual',
  allowedVocabIds: ['liquid-handling/v1'],
  defaultVariant: 'manual_single_plate',
  toolTypeIds: [],
  modules: [],
  variants: [singlePlateVariant, freeformVariant],
} as const

beforeEach(() => {
  vi.clearAllMocks()
  mocks.state = {
    platforms: [manualPlatform],
    platformId: 'manual',
    variantId: 'manual_single_plate',
    labwares: {},
    equipments: {},
    placements: [],
    events: [],
    preview: null,
    runId: 'RUN-1',
    eventGraphId: 'EG-1',
    focusPlacementId: null,
    selection: null,
  } as unknown as EventEditorState
})

function frames(...events: Array<Record<string, unknown>>) {
  vi.mocked(streamAssist).mockImplementation(async function* () {
    for (const e of events) yield e as never
  })
}

function renderDeckChat() {
  const makeTree = () => (
    <AiPanelProvider>
      <DeckChatSlice />
      <SurfaceChatBridge host="event-editor" />
      <HarnessChatPane />
    </AiPanelProvider>
  )
  const utils = render(makeTree())
  return { ...utils, reread: () => utils.rerender(makeTree()) }
}

async function awaitTurnComplete(deck: ReturnType<typeof renderDeckChat>, timeoutMs = 4000) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    await act(async () => {
      deck.reread()
    })
    // The false empty-success bubble is the pane's turn-complete marker
    // for a no-proposal turn; the streaming stop button leaving means the
    // stream ended. Poll on the stop button's absence (stream done).
    if (!document.querySelector('[data-testid="interpreting-stop"]')) return
    if (Date.now() >= deadline) throw new Error('stream never ended')
    await new Promise((r) => setTimeout(r, 50))
  }
}

describe('deck door — L2-SUITE-A-uifix1 D1: a deck_layout done switches the deck (T-3 retarget)', () => {
  it('applies the delivered variant through the native editor action (setPlatform+setVariant) and skips the false empty-success bubble', async () => {
    frames(
      { type: 'status', message: 'working' },
      {
        type: 'done',
        result: {
          success: true,
          notes: [],
          deckLayout: { platformId: 'manual', variantId: 'manual_freeform' },
        },
      },
    )
    const deck = renderDeckChat()
    await act(async () => {
      deck.reread()
      const input = document.querySelector('.sequence-chat textarea') as HTMLTextAreaElement
      // React's controlled textarea: a raw value-set + dispatchEvent never
      // reaches the hook (the controlled state resets on re-render) — the
      // repo's own pane tests (HarnessChatPane.test.tsx:219) drive it with
      // fireEvent.change, which patches the native setter.
      fireEvent.change(input, { target: { value: 'Navigate to the freeform manual deck' } })
      const send = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Send')
      fireEvent.click(send!)
    })
    await awaitTurnComplete(deck)

    // THE D1 CLAIM: the deck variant switched to the delivered one.
    expect(mocks.setVariant).toHaveBeenCalledWith('manual_freeform')
    // The delivered platform is honored (same platform here; the action
    // family is platform-first so a cross-platform deck switch also works).
    expect(mocks.setPlatform).toHaveBeenCalledWith('manual')

    // The turn changed the deck — the false "nothing was proposed" bubble
    // is absent (gate: it appeared beside an unchanged deck).
    const falseBubble = await act(async () => {
      deck.reread()
      return null
    })
    void falseBubble
    expect(document.body.textContent).not.toContain('AI completed the task but did not propose any changes.')
  })

  it('does NOT apply a deckLayout whose variant the platform manifest does not declare (client guard over the server\u2019s loose validation)', async () => {
    frames(
      { type: 'status', message: 'working' },
      {
        type: 'done',
        result: {
          success: true,
          notes: [],
          deckLayout: { platformId: 'manual', variantId: 'manual_not_a_variant' },
        },
      },
    )
    const deck = renderDeckChat()
    await act(async () => {
      deck.reread()
      const input = document.querySelector('.sequence-chat textarea') as HTMLTextAreaElement
      fireEvent.change(input, { target: { value: 'switch to a deck variant that does not exist' } })
      const send = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Send')
      fireEvent.click(send!)
    })
    await awaitTurnComplete(deck)

    // Guarded: the unknown variant is not applied to the live editor.
    expect(mocks.setVariant).not.toHaveBeenCalled()
    // The wall still names the delivered channel (honest reporting of an
    // unmountable turn — the deck did NOT change).
    await act(async () => {
      deck.reread()
    })
    const wall = document.querySelector('[data-testid="honest-wall"]')?.textContent
    expect(wall ?? '').toContain('deck layout')
  })

  it('F3: a MOUNTED deckLayout turn does not get a wall claiming "nothing was applied"', async () => {
    // The D2/D1 defect: with the D1 seam wired, a deck_layout turn MOUNTS
    // the layout (setPlatform+setVariant) yet the wall still closed with
    // "Nothing was proposed and nothing was applied." — the user sees the
    // deck switch AND a wall asserting nothing was applied.
    frames(
      { type: 'status', message: 'working' },
      {
        type: 'done',
        result: {
          success: true,
          notes: [],
          deckLayout: { platformId: 'manual', variantId: 'manual_freeform' },
        },
      },
    )
    const deck = renderDeckChat()
    await act(async () => {
      deck.reread()
      const input = document.querySelector('.sequence-chat textarea') as HTMLTextAreaElement
      fireEvent.change(input, { target: { value: 'Navigate to the freeform manual deck' } })
      const send = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Send')
      fireEvent.click(send!)
    })
    await awaitTurnComplete(deck)
    // The layout MOUNTED (the D1 claim)…
    expect(mocks.setVariant).toHaveBeenCalledWith('manual_freeform')
    // …so the wall must not claim nothing was applied.
    await act(async () => {
      deck.reread()
    })
    const wall = document.querySelector('[data-testid="honest-wall"]')?.textContent ?? ''
    expect(wall).toContain('a deck layout')
    expect(wall).not.toContain('Nothing was proposed and nothing was applied.')
    // L2-SUITE-A-uifix3 D1 (regate-5): the mount is view-session-only — the
    // record never carries the variant (methodContext.deckVariant stays
    // "default"), so the wall scopes the claim to the VIEW. The old
    // "applied to the deck." overclaimed and silently reversed on reload.
    expect(wall).toContain('The deck layout was applied to this view.')
    expect(wall).not.toContain('applied to the deck')
  })

  it('F4: a REJECTED mount (manifest guard miss) does NOT suppress the empty-success bubble', async () => {
    // The D1 defect: deckLayoutDelivered was keyed on the seam being
    // REGISTERED, not on the mount SUCCEEDING. On a manifest-guard miss the
    // deck does not change, yet the bubble ("did not propose any changes")
    // was suppressed as if it had.
    frames(
      { type: 'status', message: 'working' },
      {
        type: 'done',
        result: {
          success: true,
          notes: [],
          deckLayout: { platformId: 'manual', variantId: 'manual_not_a_variant' },
        },
      },
    )
    const deck = renderDeckChat()
    await act(async () => {
      deck.reread()
      const input = document.querySelector('.sequence-chat textarea') as HTMLTextAreaElement
      fireEvent.change(input, { target: { value: 'switch to a deck variant that does not exist' } })
      const send = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Send')
      fireEvent.click(send!)
    })
    await awaitTurnComplete(deck)
    // The mount was rejected — the deck did not change…
    expect(mocks.setVariant).not.toHaveBeenCalled()
    // …so the honest empty-success bubble must NOT be over-suppressed.
    await act(async () => {
      deck.reread()
    })
    expect(document.body.textContent).toContain('AI completed the task but did not propose any changes.')
  })
})
