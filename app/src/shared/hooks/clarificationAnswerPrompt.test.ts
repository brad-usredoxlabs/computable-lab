/**
 * clarificationAnswerPrompt unit tests — PORTED from
 * event-editor/right-pane/ai/AiTabPanel.test.tsx (the 'clarification answer
 * routing' describe + the material-mention-token case, L2-CHAT-UI-1 LEG D
 * spec §2.2 / §3 step 1). The legacy host file dies in the deletion commit;
 * the helpers live on neutral ground (shared/hooks) with the assertions
 * byte-identical (mentionTokenForOption stays where it always was: MessageLog).
 *
 * RED-first: this file fails at base (the module does not exist yet) and is
 * GREEN the moment commit A lands the module + the ChatLog re-point.
 */
import { describe, expect, it } from 'vitest'
import { clarificationAnswerPrompt } from './clarificationAnswerPrompt'
import { mentionTokenForOption } from '../../event-editor/right-pane/ai/MessageLog'

describe('clarification answer routing', () => {
  it('builds material mention tokens from CURIE-backed options', () => {
    expect(mentionTokenForOption(
      { id: 'cells', kind: 'material', prompt: 'Which cells?', menuProvider: '/m', options: [] },
      { id: 'fallback-id', label: 'Hep G2 Cells', ref: { id: 'mesh:D056945', kind: 'ontology' } },
    )).toBe('[[material:mesh:D056945|Hep G2 Cells]]')
  })

  it('sends clarification answers with the mention token in the prompt text', () => {
    expect(clarificationAnswerPrompt(
      {
        requestId: 'cells',
        label: 'Hep G2 Cells',
        mentionToken: '[[material:mesh:D056945|Hep G2 Cells]]',
      },
      { id: 'cells', kind: 'material', prompt: 'Which cells?', entityType: 'material', menuProvider: '/m', options: [] },
    )).toBe('Use [[material:mesh:D056945|Hep G2 Cells]] for material.')
  })
})
