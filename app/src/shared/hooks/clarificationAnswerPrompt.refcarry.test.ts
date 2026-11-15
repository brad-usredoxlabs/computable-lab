/**
 * L2-P1-AMBIGUOUS-OPTIONS-1 / u2refcarry — the plain-option answer sentence
 * must carry the RECORD IDENTITY the option held.
 *
 * Gate r11 defect 1: the ChatLog plain-options arm (`ol li button`) built
 * `{requestId, optionId, label, ref}` but clarificationAnswerPrompt DROPPED
 * the ref's identity from the rendered sentence, so the server re-resolved
 * the ambiguous label and re-asked the identical question ("no proposal"
 * loop). The choice the person made must travel as the record they chose,
 * not as prose the server re-guesses.
 *
 * The real ref shape (ClarificationPicker.answerFromMention /
 * groundedAnswerFromMention, app/src/agent/ChatLog.answerChannel.test.tsx):
 * `{ kind: 'record', id: <recordId>, type, label }` — the identity lives in
 * `id`, never a mint.
 */
import { describe, expect, it } from 'vitest'
import type { AiClarificationAnswer, AiClarificationRequest } from '../../types/ai'
import { clarificationAnswerPrompt, clarificationAnswersPrompt } from './clarificationAnswerPrompt'

const request: AiClarificationRequest = {
  id: 'req-96',
  kind: 'labware',
  prompt: 'The draft names "generic 96-well plate" and the lab spine could not bind it (ambiguous-noun).',
  entityType: 'labware',
  menuProvider: '/l',
  options: [
    { id: 'opt-1', label: 'Generic 96-Well Plate', ref: { kind: 'record', id: 'lbw-def-generic-96-well-plate', type: 'labware', label: 'Generic 96-Well Plate' } },
    { id: 'opt-2', label: 'Generic 96-Well Plate' },
  ],
}

describe('u2refcarry — the plain-option answer sentence carries the record identity', () => {
  it('a ref-carrying option renders the record id into the sentence', () => {
    const answer: AiClarificationAnswer = {
      requestId: request.id,
      optionId: 'opt-1',
      label: 'Generic 96-Well Plate',
      ref: { kind: 'record', id: 'lbw-def-generic-96-well-plate', type: 'labware', label: 'Generic 96-Well Plate' },
    }
    expect(clarificationAnswerPrompt(answer, request)).toBe(
      'Use Generic 96-Well Plate (lbw-def-generic-96-well-plate) for labware.',
    )
  })

  it('the batch builder carries the identity too (one format, no divergence)', () => {
    const answer: AiClarificationAnswer = {
      requestId: request.id,
      optionId: 'opt-1',
      label: 'Generic 96-Well Plate',
      ref: { kind: 'record', id: 'lbw-def-generic-96-well-plate', type: 'labware', label: 'Generic 96-Well Plate' },
    }
    expect(clarificationAnswersPrompt([answer], [request])).toBe(
      'Use Generic 96-Well Plate (lbw-def-generic-96-well-plate) for labware.',
    )
  })

  it('an option without a record ref keeps today\'s label-only sentence unchanged', () => {
    const answer: AiClarificationAnswer = { requestId: request.id, optionId: 'opt-2', label: 'Generic 96-Well Plate' }
    expect(clarificationAnswerPrompt(answer, request)).toBe('Use Generic 96-Well Plate for labware.')
  })

  it('the mention-token path stays byte-stable (the token already names the identity — no second one appended)', () => {
    const cells: AiClarificationRequest = {
      id: 'cells',
      kind: 'material',
      prompt: 'Which cells?',
      entityType: 'material',
      menuProvider: '/m',
      options: [],
    }
    const answer: AiClarificationAnswer = {
      requestId: cells.id,
      label: 'Hep G2 Cells',
      mentionToken: '[[material:mesh:D056945|Hep G2 Cells]]',
      ref: { kind: 'ontology', id: 'mesh:D056945', label: 'Hep G2 Cells' },
    }
    expect(clarificationAnswerPrompt(answer, cells)).toBe('Use [[material:mesh:D056945|Hep G2 Cells]] for material.')
  })
})
