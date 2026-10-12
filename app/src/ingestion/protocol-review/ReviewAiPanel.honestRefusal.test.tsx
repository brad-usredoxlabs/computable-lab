/**
 * W2-9 g2c DEFECT-2 (RED) — the review panel renders an honest refusal turn.
 *
 * Gate evidence (2026-10-12_1330-g2c asks (d)/(e), shots/32-*, shots/39-*): a
 * model turn that declined in text with no tool call showed ONLY the internal
 * trace "AI stopped without calling compile_event_graph_draft, and
 * compiler-argument fallback did not produce valid JSON. Last text: <refusal>"
 * — no assistant bubble, and the text named server internals.
 *
 * The server now routes such a turn as a plain assistant TEXT turn (notes
 * channel, no error event — AgentOrchestrator.honestRefusal.test.ts). THIS
 * test drives the REAL chat thread (useChatThread + chatReducer + MessageLog
 * inside ReviewAiPanel) against a mocked transport seam replaying the server's
 * honest-refusal frames and asserts:
 *   - the refusal prose renders in the chat log as the assistant bubble;
 *   - NO "AI stopped without calling …" wrapper text anywhere in the panel;
 *   - NO refusal-banner hijack (review-ai-refusal stays absent — the banner is
 *     the deterministic wall's surface, not this path's);
 *   - NO actionable Apply/Accept card;
 *   - zero writes.
 *
 * Seam pattern: AiTabPanel.ledgerTurn.test.tsx — the real hook runs against a
 * mocked runAssistStream (summarizeDraftResult stays real) + a ChatInput seam
 * that starts the turn through the panel's real send path.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'

const getRecordMock = vi.fn()
const updateRecordMock = vi.fn()
const createRecordMock = vi.fn()
const listRecordsByKindMock = vi.fn()

vi.mock('../../shared/api/client', () => ({
  apiClient: {
    getRecord: (...args: unknown[]) => getRecordMock(...args),
    updateRecord: (...args: unknown[]) => updateRecordMock(...args),
    createRecord: (...args: unknown[]) => createRecordMock(...args),
    listRecordsByKind: (...args: unknown[]) => listRecordsByKindMock(...args),
  },
}))

const mocks = vi.hoisted(() => ({
  // SSE seam: the REAL useChatThread runs against this fake transport; each
  // send captures the hook's onEvent so the test can push frames in order.
  emitters: [] as Array<(event: { type: string; message?: string; delta?: string; result?: unknown }) => void>,
  runAssistStream: vi.fn(async (_request: unknown, handlers: { onEvent: (event: { type: string; message?: string; delta?: string; result?: unknown }) => void }) => {
    mocks.emitters.push(handlers.onEvent)
  }),
  // ChatInput seam: capture the panel's onSend so a turn starts through the
  // panel's real send path. Keeps TipTap out of the DOM.
  onSend: null as null | ((text: string) => void | Promise<void>),
}))

// The transport seam only: summarizeDraftResult and the type stack stay real.
vi.mock('../../event-editor/right-pane/ai/assistStream', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../event-editor/right-pane/ai/assistStream')>()
  return { ...actual, runAssistStream: mocks.runAssistStream }
})

vi.mock('../../event-editor/right-pane/ai/ChatInput', () => ({
  ChatInput: ({ onSend }: { onSend: (text: string) => void | Promise<void> }) => {
    mocks.onSend = onSend
    return (
      <div data-testid="chat-input">
        <button type="button" data-testid="chat-input-send" onClick={() => void onSend('turn')}>
          Send
        </button>
      </div>
    )
  },
}))

import { ReviewAiPanel } from './ReviewAiPanel'

const VPDF_ID = 'VPDF-5256F3288E3C'
const XDR_ID = 'XDR-w29-gate-panel01'

const REFUSAL_PROSE = 'Authorization cannot be bypassed, and a draft cannot be promoted without the signing/approval chain. I can\u2019t skip the gate, and I can\u2019t sign on your behalf.'
const GATE_ASK_E = 'Apply the change to protocol PRT-4iaey2 instead of this draft.'
const INTERNAL_WRAPPER = 'AI stopped without calling compile_event_graph_draft, and compiler-argument fallback did not produce valid JSON. Last text: <empty>'

function xdrEnvelope() {
  return {
    recordId: XDR_ID,
    schemaId: 'extraction-draft',
    payload: {
      kind: 'extraction-draft',
      recordId: XDR_ID,
      status: 'pending_review',
      source_artifact: { kind: 'file', id: VPDF_ID, locator: 'gate.pdf' },
      candidates: [
        {
          target_kind: 'protocol',
          confidence: 0.9,
          draft: {
            kind: 'protocol',
            recordId: `PRT-${XDR_ID}-semantic`,
            title: 'Gate draft',
            steps: [
              { stepId: 'step-lyse', label: 'Lyse the sample (gate 2025)', ordinal: 1, kind: 'other' },
              { stepId: 'step-lyse-a', label: 'Lyse (variant a)', ordinal: 2, kind: 'other' },
            ],
          },
        },
      ],
      diagnostics: [],
    },
    meta: { kind: 'extraction-draft', contentSha: 'gate-xdr-sha' },
  }
}

function seedRecords() {
  listRecordsByKindMock.mockImplementation(async (kind: string) => {
    if (kind === 'extraction-draft') return { records: [xdrEnvelope()], total: 1 }
    return { records: [], total: 0 }
  })
  getRecordMock.mockImplementation(async (id: string) => {
    if (id === XDR_ID) return xdrEnvelope()
    throw new Error(`unexpected getRecord(${id})`)
  })
  updateRecordMock.mockResolvedValue({ record: { recordId: XDR_ID } })
}

async function sendTurn(prompt: string) {
  await act(async () => {
    await mocks.onSend?.(prompt)
  })
}

function renderPanel() {
  render(<ReviewAiPanel recordId={VPDF_ID} onDraftApplied={vi.fn()} />)
}

describe('ReviewAiPanel honest refusal turn (W2-9 g2c DEFECT-2)', () => {
  beforeEach(() => {
    cleanup()
    getRecordMock.mockReset()
    updateRecordMock.mockReset()
    createRecordMock.mockReset()
    listRecordsByKindMock.mockReset()
    mocks.emitters.length = 0
    mocks.onSend = null
    mocks.runAssistStream.mockClear()
    seedRecords()
  })

  it('a model-declines-in-text turn renders the refusal prose as the assistant bubble — no harness wrapper, no banner hijack, no card, zero writes', async () => {
    renderPanel()
    await screen.findByTestId('review-ai-panel')
    await sendTurn(GATE_ASK_E)

    // Replay the server's honest-refusal emission (post-fix routing): the prose
    // streams as text_delta, then `done` carries the notes-only result and NO
    // error frame.
    const emit = mocks.emitters[0]
    expect(emit).toBeDefined()
    await act(async () => {
      emit!({ type: 'text_delta', delta: REFUSAL_PROSE })
      emit!({ type: 'done', result: { success: false, notes: [REFUSAL_PROSE] } })
    })

    // The refusal prose IS the assistant bubble in the chat log.
    const bubbles = await screen.findAllByText(REFUSAL_PROSE)
    expect(bubbles.length).toBeGreaterThan(0)

    // The harness wrapper never appears anywhere in the panel.
    expect(document.body.textContent).not.toMatch(/AI stopped without calling/)
    expect(document.body.textContent).not.toMatch(/compiler-argument fallback/)
    expect(document.body.textContent).not.toMatch(/compile_event_graph_draft/)

    // No refusal-banner hijack: the red review-ai-refusal banner is the
    // deterministic wall's surface; a model-declined-in-text turn is a plain
    // answer, not a wall refusal.
    expect(screen.queryByTestId('review-ai-refusal')).toBeNull()

    // No actionable Apply/Accept card over a refused ask.
    expect(screen.queryByTestId('changes-panel')).toBeNull()
    expect(screen.queryByTestId('changes-apply')).toBeNull()

    // And nothing was written.
    expect(updateRecordMock).not.toHaveBeenCalled()
    expect(createRecordMock).not.toHaveBeenCalled()
  })

  it('boundary: the error-shaped turn (no prose) still renders no card and no write (PB-CH-4 D1 holds)', async () => {
    renderPanel()
    await screen.findByTestId('review-ai-panel')
    await sendTurn(GATE_ASK_E)

    // The pre-fix / empty-prose shape: an error frame + a done result carrying
    // the error. The panel must NOT open a card over it.
    const emit = mocks.emitters[0]
    expect(emit).toBeDefined()
    await act(async () => {
      emit!({ type: 'error', message: INTERNAL_WRAPPER })
      emit!({ type: 'done', result: { success: false, error: INTERNAL_WRAPPER } })
    })

    await waitFor(() => expect(screen.queryByTestId('changes-apply')).toBeNull())
    expect(screen.queryByTestId('changes-panel')).toBeNull()
    expect(updateRecordMock).not.toHaveBeenCalled()
  })
})
