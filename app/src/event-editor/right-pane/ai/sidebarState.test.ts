import { describe, it, expect } from 'vitest'
import { initialSidebarState, sidebarReducer, isChatEnabled, primaryActionLabel, headerLabel } from './sidebarState'
import type { AiClarificationRequest } from '../../../types/ai'

const mockQuestion: AiClarificationRequest = {
  id: 'q1',
  kind: 'material',
  prompt: 'Which material?',
  menuProvider: '/m',
  options: [],
}

describe('sidebarState', () => {
  it('starts in ready mode', () => {
    expect(initialSidebarState.mode).toBe('ready')
  })

  it('transitions ready → interpreting on start-interpreting', () => {
    const state = sidebarReducer(initialSidebarState, {
      type: 'start-interpreting',
      prompt: 'add 10 uL clofibrate to A1',
    })
    expect(state.mode).toBe('interpreting')
    if (state.mode === 'interpreting') {
      expect(state.prompt).toBe('add 10 uL clofibrate to A1')
    }
  })

  it('transitions interpreting → clarifying when questions arrive', () => {
    const interpreting = { mode: 'interpreting' as const, prompt: 'test', progress: { steps: [] } }
    const state = sidebarReducer(interpreting, {
      type: 'clarifications-needed',
      draftId: 'draft-1',
      questions: [mockQuestion],
    })
    expect(state.mode).toBe('clarifying')
    if (state.mode === 'clarifying') {
      expect(state.questions).toHaveLength(1)
      expect(state.activeQuestionId).toBe('q1')
    }
  })

  it('transitions clarifying → updating on submit-answers', () => {
    const clarifying = {
      mode: 'clarifying' as const,
      draftId: 'draft-1',
      questions: [mockQuestion],
      answers: {},
      activeQuestionId: 'q1',
    }
    const state = sidebarReducer(clarifying, {
      type: 'submit-answers',
      answers: { q1: { requestId: 'q1', label: 'test', mentionToken: '[[material:x|test]]' } },
    })
    expect(state.mode).toBe('updating')
  })

  it('transitions updating → reviewing on draft-ready', () => {
    const updating = { mode: 'updating' as const, draftId: 'draft-1' }
    const state = sidebarReducer(updating, {
      type: 'draft-ready',
      draftId: 'draft-1',
      interpretation: { operations: [] },
      changes: [],
      warnings: [],
    })
    expect(state.mode).toBe('reviewing')
  })

  it('draft-ready carries protocolDiff into the reviewing state', () => {
    const protocolDiff = {
      protocol: { recordId: 'PROT-1', title: 'Hep G2 ROS assay' },
      ops: [
        {
          op: 'add' as const,
          target: { type: 'step' as const, stepId: 'step-3' },
          after: { label: 'Wash', kind: 'wash' as const, description: 'Wash twice with PBS' },
          position: { anchorStepId: 'step-3', relative: 'after' as const },
        },
      ],
    }
    const state = sidebarReducer({ mode: 'updating', draftId: 'draft-1' }, {
      type: 'draft-ready',
      draftId: 'draft-1',
      interpretation: { operations: [] },
      changes: [],
      warnings: [],
      protocolDiff,
    })
    expect(state.mode).toBe('reviewing')
    if (state.mode === 'reviewing') {
      expect(state.protocolDiff).toEqual(protocolDiff)
    }
  })

  it('draft-ready WITHOUT protocolDiff leaves the key absent (event-graph dispatches compile unchanged)', () => {
    const state = sidebarReducer({ mode: 'updating', draftId: 'draft-2' }, {
      type: 'draft-ready',
      draftId: 'draft-2',
      interpretation: { operations: [] },
      changes: [{ op: 'add', description: 'Dispense 10 uL DMEM into A1' }],
      warnings: [],
    })
    expect(state.mode).toBe('reviewing')
    if (state.mode === 'reviewing') {
      // The event-graph review payload must stay byte-identical: no
      // `protocolDiff: undefined` key is introduced by the reducer.
      expect('protocolDiff' in state).toBe(false)
      expect(Object.keys(state).sort()).toEqual(
        ['changes', 'draftId', 'interpretation', 'mode', 'terms', 'warnings'],
      )
    }
  })

  it('transitions reviewing → committing on commit', () => {
    const reviewing = {
      mode: 'reviewing' as const,
      draftId: 'draft-1',
      interpretation: { operations: [] },
      changes: [],
      warnings: [],
    }
    const state = sidebarReducer(reviewing, { type: 'commit' })
    expect(state.mode).toBe('committing')
  })

  it('R-Defect-2: committing has a bounded reset path — reset/cancel return to ready', () => {
    // `committing` disables the chat input (isChatEnabled false), so it must
    // never be terminal: the reducer's reset/cancel are the exits the panel
    // fires after a commit lands (AiTabPanel.onApply) and on empty applies.
    const committing = { mode: 'committing' as const, draftId: 'draft-1' }
    expect(isChatEnabled(committing)).toBe(false)
    expect(sidebarReducer(committing, { type: 'reset' }).mode).toBe('ready')
    expect(sidebarReducer(committing, { type: 'cancel' }).mode).toBe('ready')
  })

  it('transitions to ready on cancel from any state', () => {
    const clarifying = {
      mode: 'clarifying' as const,
      draftId: 'draft-1',
      questions: [],
      answers: {},
      activeQuestionId: '',
    }
    const state = sidebarReducer(clarifying, { type: 'cancel' })
    expect(state.mode).toBe('ready')
  })

  it('answer-question adds to answers map', () => {
    const clarifying = {
      mode: 'clarifying' as const,
      draftId: 'draft-1',
      questions: [mockQuestion],
      answers: {},
      activeQuestionId: 'q1',
    }
    const state = sidebarReducer(clarifying, {
      type: 'answer-question',
      questionId: 'q1',
      answer: { requestId: 'q1', label: 'Clofibrate', mentionToken: '[[material:MAT-1|Clofibrate]]' },
    })
    if (state.mode === 'clarifying') {
      expect(state.answers.q1).toBeDefined()
      expect(state.answers.q1.label).toBe('Clofibrate')
    }
  })

  // SH-QA-2: the old leg was a pure highlight move — an already-answered card
  // re-rendered identically and the click did nothing visible (dead chrome).
  // The leg now REOPENS the question: activeQuestionId moves AND the answer
  // key is removed so the card falls back to its picker/parameter branch.
  it('change-question updates activeQuestionId (unanswered question: answers untouched)', () => {
    const q2 = { ...mockQuestion, id: 'q2' }
    const clarifying = {
      mode: 'clarifying' as const,
      draftId: 'draft-1',
      questions: [mockQuestion, q2],
      answers: {},
      activeQuestionId: 'q1',
    }
    const state = sidebarReducer(clarifying, { type: 'change-question', questionId: 'q2' })
    if (state.mode === 'clarifying') {
      expect(state.activeQuestionId).toBe('q2')
    }
  })

  // DC2 (SH-QA-2 requirement (2)): Change on an ANSWERED question is a reopen —
  // the answer KEY is gone (not undefined) so the card re-renders editable.
  it('DC2: change-question on an answered question REOPENS it — the answer key is removed, activeQuestionId set', () => {
    const q2 = { ...mockQuestion, id: 'q2' }
    const clarifying = {
      mode: 'clarifying' as const,
      draftId: 'draft-1',
      questions: [mockQuestion, q2],
      answers: { q1: { requestId: 'q1', label: 'Clofibrate', mentionToken: '[[material:MAT-1|Clofibrate]]' } },
      activeQuestionId: 'q2',
    }
    const state = sidebarReducer(clarifying, { type: 'change-question', questionId: 'q1' })
    expect(state.mode).toBe('clarifying')
    if (state.mode === 'clarifying') {
      expect(state.activeQuestionId).toBe('q1')
      // The KEY is gone — never `answers.q1 = undefined` (that would keep the
      // answer truthy-typed and keep the card in its answered branch).
      expect('q1' in state.answers).toBe(false)
      expect(state.answers.q2).toBeUndefined()
    }
  })

  it('DC2: change-question reopen keeps the other answers and the carried shorthand', () => {
    const q2 = { ...mockQuestion, id: 'q2' }
    const clarifying = {
      mode: 'clarifying' as const,
      draftId: 'draft-1',
      questions: [mockQuestion, q2],
      answers: {
        q1: { requestId: 'q1', label: 'Clofibrate' },
        q2: { requestId: 'q2', label: 'DMEM' },
      },
      activeQuestionId: 'q1',
      shorthand: 'intentId: x\nactions: []\n',
    }
    const state = sidebarReducer(clarifying, { type: 'change-question', questionId: 'q1' })
    expect(state.mode).toBe('clarifying')
    if (state.mode === 'clarifying') {
      expect('q1' in state.answers).toBe(false)
      expect(state.answers.q2?.label).toBe('DMEM')
      expect(state.shorthand).toBe('intentId: x\nactions: []\n')
    }
  })

  it('DC2: change-question stays clarifying-guarded (other modes byte-unchanged)', () => {
    const updating = { mode: 'updating' as const, draftId: 'draft-1' }
    expect(sidebarReducer(updating, { type: 'change-question', questionId: 'q1' })).toBe(updating)
  })

  it('isChatEnabled returns true for ready and reviewing', () => {
    expect(isChatEnabled({ mode: 'ready' })).toBe(true)
    expect(isChatEnabled({ mode: 'reviewing', draftId: 'd1', interpretation: { operations: [] }, changes: [], warnings: [] })).toBe(true)
    expect(isChatEnabled({ mode: 'interpreting', prompt: 'x', progress: { steps: [] } })).toBe(false)
    expect(isChatEnabled({ mode: 'clarifying', draftId: 'd1', questions: [], answers: {}, activeQuestionId: '' })).toBe(false)
  })

  it('headerLabel shows remaining count for clarifying', () => {
    const clarifying = {
      mode: 'clarifying' as const,
      draftId: 'draft-1',
      questions: [mockQuestion, { ...mockQuestion, id: 'q2' }],
      answers: { q1: { requestId: 'q1', label: 'test' } },
      activeQuestionId: 'q2',
    }
    expect(headerLabel(clarifying)).toBe('1 answers needed')
  })

  it('primaryActionLabel returns correct labels per mode', () => {
    expect(primaryActionLabel({ mode: 'ready' })).toBeNull()
    expect(primaryActionLabel({ mode: 'interpreting', prompt: 'x', progress: { steps: [] } })).toBeNull()
    expect(primaryActionLabel({ mode: 'clarifying', draftId: 'd1', questions: [], answers: {}, activeQuestionId: '' })).toBe('Update draft')
    expect(primaryActionLabel({ mode: 'updating', draftId: 'd1' })).toBeNull()
    expect(primaryActionLabel({ mode: 'reviewing', draftId: 'd1', interpretation: { operations: [] }, changes: [], warnings: [] })).toBe('Apply to run')
    expect(primaryActionLabel({ mode: 'committing', draftId: 'd1' })).toBeNull()
  })
})

describe('sidebarState — SHORTHAND-CHAT shorthand on the review state', () => {
  const baseDraftReady = {
    type: 'draft-ready' as const,
    draftId: 'd1',
    interpretation: { operations: [] },
    changes: [{ op: 'add' as const, description: 'x' }],
    warnings: [],
    terms: [],
  }

  it('draft-ready WITHOUT shorthand leaves the reviewing state byte-identical (no undefined key)', () => {
    const state = sidebarReducer(initialSidebarState, baseDraftReady)
    expect(state.mode).toBe('reviewing')
    expect('shorthand' in state).toBe(false)
  })

  it('draft-ready WITH shorthand carries it verbatim', () => {
    const state = sidebarReducer(initialSidebarState, {
      ...baseDraftReady,
      shorthand: 'intentId: x\nactions: []\n',
    })
    expect(state.mode).toBe('reviewing')
    if (state.mode === 'reviewing') {
      expect(state.shorthand).toBe('intentId: x\nactions: []\n')
    }
  })

  // fix cycle 1 (advc1 DEFECT-5): a needs-clarification turn IS proposal-bearing.
  it('clarifications-needed WITH shorthand carries it verbatim on the clarifying state', () => {
    const interpreting = { mode: 'interpreting' as const, prompt: 'test', progress: { steps: [] } }
    const state = sidebarReducer(interpreting, {
      type: 'clarifications-needed',
      draftId: 'draft-1',
      questions: [mockQuestion],
      shorthand: 'intentId: x\nactions: []\n',
    })
    expect(state.mode).toBe('clarifying')
    if (state.mode === 'clarifying') {
      expect(state.shorthand).toBe('intentId: x\nactions: []\n')
    }
  })

  it('clarifications-needed WITHOUT shorthand leaves the clarifying state byte-identical (no undefined key)', () => {
    const interpreting = { mode: 'interpreting' as const, prompt: 'test', progress: { steps: [] } }
    const state = sidebarReducer(interpreting, {
      type: 'clarifications-needed',
      draftId: 'draft-1',
      questions: [mockQuestion],
    })
    expect(state.mode).toBe('clarifying')
    expect('shorthand' in state).toBe(false)
  })

  it('answer-question / change-question keep the carried shorthand on the clarifying state', () => {
    const interpreting = { mode: 'interpreting' as const, prompt: 'test', progress: { steps: [] } }
    let state = sidebarReducer(interpreting, {
      type: 'clarifications-needed',
      draftId: 'draft-1',
      questions: [mockQuestion],
      shorthand: 'intentId: x\nactions: []\n',
    })
    state = sidebarReducer(state, { type: 'answer-question', questionId: 'q1', answer: { requestId: 'q1', label: 'y' } })
    expect(state.mode).toBe('clarifying')
    if (state.mode === 'clarifying') {
      expect(state.shorthand).toBe('intentId: x\nactions: []\n')
      expect(state.answers['q1']?.label).toBe('y')
    }
  })
})
