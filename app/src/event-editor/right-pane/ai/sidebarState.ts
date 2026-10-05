import type { AiClarificationRequest, AiClarificationAnswer } from '../../../types/ai'
import type { DraftTermRow } from './TermPanel'

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

/**
 * --------------------------------------------------------------- PROTO-AI-9
 * The DISPLAY shape of a `protocol_edit` proposal (the AiProtocolEditProposal
 * envelope, PROTO-AI-7) rendered by ChangesPanel. The validated op vocabulary
 * stays schema-owned (protocol-edit-op.schema.yaml); this is the review-side
 * view built from it by `protocolEditDiffFrom`. EVERY field here is optional
 * and the `protocolDiff` fields below are optional too, so every existing
 * dispatch and the whole event-graph review path compile unchanged.
 */
export type ProtocolStepKind =
  | 'add_material'
  | 'transfer'
  | 'mix'
  | 'wash'
  | 'incubate'
  | 'read'
  | 'harvest'
  | 'other'

/** A step setting as displayed in a diff row. Identity is `settingId`
 *  (setting.schema.yaml); the remaining fields render best-effort. */
export interface ProtocolEditSetting {
  settingId: string
  label?: string
  type?: string
  [key: string]: unknown
}

/** One side (before or after) of a step edit: text, kind, settings, position. */
export interface StepFieldBeforeAfter {
  label?: string
  /** Step text (plain). Rich text is DERIVED by the applier, never proposed. */
  description?: string
  kind?: ProtocolStepKind
  settings?: ProtocolEditSetting[]
  /** Proposed 1..N ordinal after apply (when the proposal fixes one). */
  ordinal?: number
}

/** One side of a role edit (labware / instrument / material role section). */
export interface RoleBeforeAfter {
  roleId: string
  description?: string
  /** Labware roles: declared compatible labware DESIGN ids. */
  expectedLabwareKinds?: string[]
  /** Instrument roles: declared allowable instrument DESIGN ids. */
  allowedInstrumentIds?: string[]
}

export interface ProtocolEditOp {
  op: 'add' | 'modify' | 'remove'
  target:
    | { type: 'step'; stepId: string }
    | { type: 'role'; roleKind: 'labwareRoles' | 'instrumentRoles' | 'materialRoles'; roleId: string }
  /** Absent for op:'add' (a new step's stepId is minted by the applier). */
  before?: StepFieldBeforeAfter | RoleBeforeAfter
  /** Absent for op:'remove'. */
  after?: StepFieldBeforeAfter | RoleBeforeAfter
  /** add-step: anchor position, matching insertProtocolStep's anchor model. */
  position?: { anchorStepId: string; relative: 'before' | 'after' }
}

export interface ProtocolEditDiff {
  /** The target protocol named — never an anonymous diff. */
  protocol: { recordId: string; title?: string }
  ops: ProtocolEditOp[]
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
      /**
       * The terms this draft used, as the server classified them (term panel).
       * Optional: an older payload carries none, and a draft with no material refs
       * has nothing to show — the panel renders itself away either way.
       */
      terms?: DraftTermRow[]
      /**
       * A `protocol_edit` proposal shown for review in the SAME ChangesPanel
       * surface (PROTO-AI-9, D1: no new rail). Optional: an event-graph draft
       * never carries one and its review state stays byte-identical.
       */
      protocolDiff?: ProtocolEditDiff
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
      terms?: DraftTermRow[]
      /** See AiSidebarState 'reviewing'.protocolDiff — all-optional so every
       *  existing event-graph dispatch compiles unchanged. */
      protocolDiff?: ProtocolEditDiff
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
        terms: action.terms,
        // Conditional spread: an event-graph draft's reviewing state stays
        // byte-identical (no `protocolDiff: undefined` key is ever introduced).
        ...(action.protocolDiff ? { protocolDiff: action.protocolDiff } : {}),
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
