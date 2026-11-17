/**
 * ChatLog.journeyDoors.test.tsx — L2-NOUN-CREATION-JOURNEY-1 (u1journey c2
 * FIX 2).
 *
 * The cycle-1 defect: the GROUPED card rendered the declared journey doors,
 * but the SINGLE-fact absence arm (ChatLog.tsx `renderTypedClarification`,
 * mounted for ONE clarification request) ignored `request.journey` and offered
 * the labware create link. The cycle-1 evidence was a component-direct render
 * of ChatClarificationCard — which cannot see the single arm at all. This test
 * renders ChatLog itself, with ONE request.
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AiClarificationRequest, ChatMessage } from '../types/ai'
import { ChatLog } from './ChatLog'

vi.mock('pdfjs-dist', () => ({
  getDocument: vi.fn(() => ({ promise: Promise.resolve({ numPages: 0, fingerprints: [''], getPage: () => Promise.resolve(null), destroy: () => undefined }), destroy: () => undefined })),
  GlobalWorkerOptions: { workerSrc: '' },
  TextLayer: class { render() { return Promise.resolve() } },
}))

const JOURNEY_MOD = '../../../server/src/compiler/journey/journeyDeclarationDoors.js'
const NOUN = 'DMEM'

const props = { isStreaming: false, prompt: '', onPromptChange: vi.fn(), onSend: vi.fn(), onCancel: vi.fn() }

afterEach(cleanup)

describe('ChatLog — single-fact arm renders the DECLARED journey doors (AC2)', () => {
  it('renders one anchor per declared door and NOT the labware create link', async () => {
    const mod = await import(JOURNEY_MOD)
    const declared = mod.nounCreateJourneyForCandidate(NOUN)
    expect(declared).toBeDefined()
    // A two-door projection of the SAME declared data (never a hand-written
    // door list): the arm's shape is per-door, not per-count.
    const journey = { ...declared, doors: declared.doors.slice(0, 2) }
    const request = {
      id: 'fact-journey-1',
      kind: 'noun',
      prompt: 'Which material do you mean?',
      options: [],
      absence: { mention: NOUN, reason: mod.notALocalTermReason(NOUN) },
      journey,
    } as unknown as AiClarificationRequest
    const message: ChatMessage = {
      id: 'clar-journey-single',
      role: 'assistant',
      content: 'Which material do you mean?',
      timestamp: 0,
      clarificationRequests: [request],
    }

    render(<ChatLog {...props} messages={[message]} />)

    // ONE chat-log request node (the single arm, not the grouped card).
    const node = screen.getByTestId('chat-log-request-fact-journey-1')
    expect(node.classList.contains('chat-log-clarification')).toBe(true)

    const doors = node.querySelectorAll('[data-testid^="chat-clarification-door-"]')
    expect(doors).toHaveLength(2)
    for (const door of journey.doors) {
      expect(screen.getByTestId(`chat-clarification-door-${door.id}`).tagName).toBe('A')
    }

    // The labware create link is NOT offered for a material noun.
    expect(screen.queryByTestId('chat-clarification-absent-create')).toBeNull()
    expect(node.querySelector('.chat-clarification-card__absent-reason')).toHaveTextContent(NOUN)
  })
})
