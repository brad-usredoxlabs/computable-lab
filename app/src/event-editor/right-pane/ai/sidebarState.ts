import type { AiClarificationRequest, AiClarificationAnswer } from '../../../types/ai'

export interface InterpretationStep {
  label: string
  done: boolean
}

export interface InterpretationProgress {
  steps: InterpretationStep[]
}

export interface SemanticInterpretation {
  operations: Array<{
    type: string
    target?: string
    material?: string
    parameters?: Record<string, unknown>
    resolved: boolean
  }>
}

export interface EventGraphChange {
  op: 'add' | 'modify' | 'remove'
  description: string
  eventId?: string
}

export interface ValidationGap {
  code: string
  message: string
  severity: 'info' | 'warning' | 'error'
}

export type AiSidebarState =
  | { mode: 'ready' }
  | { mode: 'interpreting'; prompt: string; progress: InterpretationProgress }
  | {
      mode: 'clarifying'
      draftId: string
      questions: AiClarificationRequest[]
      answers: Record<string, AiClarificationAnswer>
      activeQuestionId: string
    }
  | { mode: 'updating'; draftId: string }
  | {
      mode: 'reviewing'
      draftId: string
      interpretation: SemanticInterpretation
      changes: EventGraphChange[]
      warnings: ValidationGap[]
    }
  | { mode: 'committing'; draftId: string }

export type SidebarAction =
  | { type: 'start-interpreting'; prompt: string }
  | { type: 'update-progress'; progress: InterpretationProgress }
  | {
      type: 'clarifications-needed'
      draftId: string
      questions: AiClarificationRequest[]
    }
  | { type: 'answer-question'; questionId: string; answer: AiClarificationAnswer }
  | { type: 'change-question'; questionId: string }
  | { type: 'submit-answers'; answers: Record<string, AiClarificationAnswer> }
  | {
      type: 'draft-ready'
      draftId: string
      interpretation: SemanticInterpretation
      changes: EventGraphChange[]
      warnings: ValidationGap[]
    }
  | { type: 'commit' }
  | { type: 'cancel' }
  | { type: 'reset' }

export const initialSidebarState: AiSidebarState = { mode: 'ready' }

export function sidebarReducer(state: AiSidebarState, action: SidebarAction): AiSidebarState {
  switch (action.type) {
    case 'start-interpreting':
      return {
        mode: 'interpreting',
        prompt: action.prompt,
        progress: { steps: [] },
      }

    case 'update-progress':
      if (state.mode !== 'interpreting') return state
      return { ...state, progress: action.progress }

    case 'clarifications-needed':
      return {
        mode: 'clarifying',
        draftId: action.draftId,
        questions: action.questions,
        answers: {},
        activeQuestionId: action.questions[0]?.id ?? '',
      }

    case 'answer-question':
      if (state.mode !== 'clarifying') return state
      return {
        ...state,
        answers: { ...state.answers, [action.questionId]: action.answer },
      }

    case 'change-question':
      if (state.mode !== 'clarifying') return state
      return { ...state, activeQuestionId: action.questionId }

    case 'submit-answers':
      if (state.mode !== 'clarifying') return state
      return { mode: 'updating', draftId: state.draftId }

    case 'draft-ready':
      return {
        mode: 'reviewing',
        draftId: action.draftId,
        interpretation: action.interpretation,
        changes: action.changes,
        warnings: action.warnings,
      }

    case 'commit':
      if (state.mode !== 'reviewing') return state
      return { mode: 'committing', draftId: state.draftId }

    case 'cancel':
    case 'reset':
      return initialSidebarState

    default: {
      const _exhaustive: never = action
      return _exhaustive ?? state
    }
  }
}

export function isChatEnabled(state: AiSidebarState): boolean {
  return state.mode === 'ready' || state.mode === 'reviewing'
}

export function primaryActionLabel(state: AiSidebarState): string | null {
  switch (state.mode) {
    case 'ready': return null
    case 'interpreting': return null
    case 'clarifying': return 'Update draft'
    case 'updating': return null
    case 'reviewing': return 'Apply to run'
    case 'committing': return null
  }
}

export function headerLabel(state: AiSidebarState): string {
  switch (state.mode) {
    case 'ready': return 'AI Assistant'
    case 'interpreting': return 'Interpreting…'
    case 'clarifying': {
      const answered = Object.keys(state.answers).length
      const total = state.questions.length
      return `${total - answered} answers needed`
    }
    case 'updating': return 'Updating draft…'
    case 'reviewing': return 'Review changes'
    case 'committing': return 'Applying…'
  }
}
