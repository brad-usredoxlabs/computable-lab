/**
 * W2-89 g2b-3 + g2b-1/2 (RED) — the refusal bubble and the reasoning channel
 * on the CLIENT side.
 *
 * 1. summarizeDraftResult must surface the refusal envelope's message as the
 *    assistant text (a refusal turn always has a user-visible answer — never
 *    "(no response)").
 * 2. useChatThread: a `done` frame carrying the refusal commits the refusal
 *    wording as the assistant bubble (the MessageLog renders m.text verbatim,
 *    so the bubble text IS the refusal).
 * 3. reviewAiPanel.css: `.review-ai__log` must actually scroll
 *    (overflow-y: auto) — gate defect D-SCROLL (logCH==logSH at mount,
 *    overflow:hidden with fixed height).
 */
import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act, renderHook } from '@testing-library/react'
import { summarizeDraftResult, type AssistDraftResult, type AssistStreamEvent, type AssistStreamRequest } from '../../event-editor/right-pane/ai/assistStream'
import { useChatThread } from '../../event-editor/right-pane/ai/useChatThread'

type RunStreamHandlers = { onEvent: (event: AssistStreamEvent) => void; signal?: AbortSignal }

describe('summarizeDraftResult — refusal envelope (W2-89 g2b-1/2)', () => {
  it('a refusal result summarizes to the refusal message verbatim (user-visible answer)', () => {
    const result: AssistDraftResult = {
      success: true,
      notes: [],
      refusal: { code: 'SAID_IMMUTABLE', message: 'The vendor document (SAID) is immutable — nothing was written.' },
    }
    expect(summarizeDraftResult(result)).toBe('The vendor document (SAID) is immutable — nothing was written.')
  })

  it('the refusal wording wins over any other summary channel', () => {
    const result: AssistDraftResult = {
      success: true,
      notes: ['internal note'],
      refusal: { code: 'PROVENANCE_FALSIFICATION', message: 'Provenance cannot be relabelled.' },
    }
    expect(summarizeDraftResult(result)).toBe('Provenance cannot be relabelled.')
  })
})

describe('useChatThread — refusal turn commits a visible assistant bubble (g2b-1/2)', () => {
  it('a done frame with the refusal envelope commits the refusal text as the assistant message', async () => {
    const emitters: Array<(event: AssistStreamEvent) => void> = []
    const runStream = vi.fn(async (_request: AssistStreamRequest, handlers: RunStreamHandlers) => {
      emitters.push(handlers.onEvent)
    })
    const { result } = renderHook(() =>
      useChatThread({
        surface: 'protocol-review',
        context: { attachedProtocol: null },
        runStream,
      }),
    )
    await act(async () => {
      await result.current.send('rewrite the vendor text on page 2')
    })
    await act(async () => {
      emitters[0]?.({
        type: 'done',
        result: {
          success: true,
          notes: [],
          refusal: { code: 'SAID_IMMUTABLE', message: 'The vendor document (SAID) is immutable — chat cannot rewrite vendor text. Edits apply only to the semantic draft (MEANT). No proposal was offered and nothing was written.' },
        },
      })
    })
    const assistant = result.current.state.messages.find((m) => m.role === 'assistant')
    expect(assistant).toBeDefined()
    // The bubble text IS the refusal (MessageLog renders m.text verbatim):
    // never "(no response)", never raw chain-of-thought.
    expect(assistant!.text).toContain('SAID')
    expect(assistant!.text).toContain('immutable')
    expect(assistant!.text).not.toContain('(no response)')
  })
})

describe('reviewAiPanel.css — the log actually scrolls (g2b-4, D-SCROLL)', () => {
  const cssSource = readFileSync(resolve(process.cwd(), 'src/ingestion/protocol-review/reviewAiPanel.css'), 'utf8')

  it('.review-ai__log uses overflow-y: auto (not overflow: hidden)', () => {
    const logRule = cssSource.match(/\.review-ai__log\s*{[^}]*}/)?.[0]
    expect(logRule, 'missing .review-ai__log rule').toBeTruthy()
    expect(logRule).toContain('overflow-y: auto')
    expect(logRule).not.toMatch(/overflow:\s*hidden/)
  })
})
