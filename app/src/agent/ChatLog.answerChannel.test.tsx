/**
 * ANSWER-CHANNEL — the clarification answer must reach the server as DATA, not
 * only as prose.
 *
 * The regression (measured live on :3093, 6 consecutive answer turns): the
 * universal pane handed the pure-sentence callback (`clarificationAnswerPrompt`)
 * to the next turn and DROPPED the structured `{requestId, label, mentionToken,
 * ref}`. The server therefore never saw an answer, re-drafted the ambiguous noun
 * from the sentence, re-derived the same ambiguity and re-asked forever (the
 * "add 100ul of DMEM" loop — "DMEM", then "Thermo DMEM", never binding
 * MAT-thermo-dmem-1vq1).
 *
 * This pins the client half: the sentence STAYS the first argument (it is the
 * visible transcript turn), and the structured answer + its request ride the
 * same callback so the host can put them on the wire.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AiClarificationRequest, ChatMessage } from '../types/ai'
import { ChatLog } from './ChatLog'

// ChatLog's import graph reaches pdfjs-dist; mock it so jsdom does not crash on
// DOMMatrix (the ChatLog.test.tsx precedent).
vi.mock('pdfjs-dist', () => ({
  getDocument: vi.fn(() => ({ promise: Promise.resolve({ numPages: 0, fingerprints: [''], getPage: () => Promise.resolve(null), destroy: () => undefined }), destroy: () => undefined })),
  GlobalWorkerOptions: { workerSrc: '' },
  TextLayer: class { render() { return Promise.resolve() } },
}))

afterEach(cleanup)

const props = { isStreaming: false, prompt: '', onPromptChange: vi.fn(), onSend: vi.fn(), onCancel: vi.fn() }

const REQUEST: AiClarificationRequest = {
  id: 'unresolved-c-77b31b815b',
  kind: 'material',
  prompt: 'The draft names "DMEM" and the lab spine could not bind it (ambiguous-noun). Choose what it is, or create a local term.',
  entityType: 'material',
  menuProvider: '/m',
  options: [
    {
      id: 'opt-thermo-dmem',
      label: 'Thermo DMEM',
      ref: { kind: 'record', id: 'MAT-thermo-dmem-1vq1', type: 'material', label: 'Thermo DMEM' },
    },
  ],
}

function cardMessage(): ChatMessage {
  return {
    id: 'msg-card-1',
    role: 'assistant',
    content: REQUEST.prompt,
    timestamp: 0,
    clarificationRequests: [REQUEST],
  }
}

describe('ANSWER-CHANNEL: the structured clarification answer rides the turn', () => {
  it('option pick carries (sentence, structured answer, request) — the ref is not flattened away', () => {
    const onClarificationPick = vi.fn()
    render(<ChatLog {...props} messages={[cardMessage()]} onClarificationPick={onClarificationPick} />)

    fireEvent.click(screen.getByRole('button', { name: /Thermo DMEM/ }))

    expect(onClarificationPick).toHaveBeenCalledTimes(1)
    const [sentence, answer, request] = onClarificationPick.mock.calls[0]!
    // 1. the human sentence is unchanged (it is the visible transcript turn)
    expect(sentence).toBe('Use Thermo DMEM for material.')
    // 2. the structured answer survives — this is what the server folds, and
    //    its `ref` is what narrows the ambiguous noun to the chosen record.
    expect(answer).toMatchObject({ requestId: REQUEST.id, label: 'Thermo DMEM' })
    expect(answer.ref).toEqual({ kind: 'record', id: 'MAT-thermo-dmem-1vq1', type: 'material', label: 'Thermo DMEM' })
    // 3. the request rides along so the host can log/attribute the answer
    expect(request).toBe(REQUEST)
  })

  it('a card without an answer callback offers no pick (no silent dead control)', () => {
    render(<ChatLog {...props} messages={[cardMessage()]} />)
    expect(screen.queryByRole('button', { name: /Thermo DMEM/ })).toBeNull()
  })
})
