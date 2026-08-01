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

  it('change-question updates activeQuestionId', () => {
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
