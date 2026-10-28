/**
 * L2-SUITE-A-uifix1 [D1] RED — a deck_layout done does not change the deck
 * (gate: P1 "Navigate to the freeform manual deck" left the deck on
 * "Liquid Handling · Manual · Single SBS Plate"; only an honest wall showed.
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
 * deck path through the DeckSurfaceChat seam (smallest correct seam: the
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
import { cleanup, render, waitFor } from '@testing-library/react'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AiPanelProvider } from '../../shared/context/AiPanelContext'
import { streamAssist } from '../../shared/api/aiClient'
import { DeckSurfaceChat } from './DeckSurfaceChat'
import { HarnessChatPane } from '../../agent/HarnessChatPane'
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

vi.mock('../right-pane/ai/AiTabPanel', () => ({
  clarificationAnswerPrompt: (answer: { optionId?: string }, request: { prompt: string }) =>
    `${request.prompt} — ${answer.optionId ?? 'answer'}`,
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
      <DeckSurfaceChat />
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

describe('DeckSurfaceChat — L2-SUITE-A-uifix1 D1: a deck_layout done switches the deck', () => {
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
      input.value = 'Navigate to the freeform manual deck'
      input.dispatchEvent(new Event('change', { bubbles: true }))
      const send = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Send')
      send?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
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
      input.value = 'switch to a deck variant that does not exist'
      input.dispatchEvent(new Event('change', { bubbles: true }))
      const send = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Send')
      send?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
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
})
