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
      /**
       * SHORTHAND-CHAT fix cycle 1 (advc1 DEFECT-5): the shorthand document
       * the paused draft was built from, VERBATIM. A needs-clarification turn
       * IS proposal-bearing — the panel shows the document above the questions
       * while the draft is paused. Optional: a clarification from a draft
       * without shorthand leaves the clarifying state byte-identical (the key
       * is never introduced as undefined).
       */
      shorthand?: string
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
      /**
       * SHORTHAND-CHAT: the compiled scientist-intent document VERBATIM, shown
       * above the changes list. Optional: a draft without shorthand stays
       * byte-identical (the key is never introduced as undefined).
       */
      shorthand?: string
    }
  | { mode: 'committing'; draftId: string }

export type SidebarAction =
  | { type: 'start-interpreting'; prompt: string }
  | { type: 'update-progress'; progress: InterpretationProgress }
  | {
      type: 'clarifications-needed'
      draftId: string
      questions: AiClarificationRequest[]
      /** See AiSidebarState 'clarifying'.shorthand (SHORTHAND-CHAT fix cycle 1). */
      shorthand?: string
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
      /** See AiSidebarState 'reviewing'.shorthand (SHORTHAND-CHAT). */
      shorthand?: string
    }
  | { type: 'commit' }
  | { type: 'cancel' }
  | { type: 'reset' }

export const initialSidebarState: AiSidebarState = { mode: 'ready' }


/**
 * Identity of a clarification question for de-duplication. The compiler emits
 * one clarification PER unresolved request, so a label referenced twice (or a
 * re-run after an answer) produced IDENTICAL questions side by side — on a
 * phone that read as "2 answers needed" for one term. Two questions are the
 * same question when they ask about the same entity, about the same words, with
 * the same prompt.
 */
export function questionKey(question: AiClarificationRequest): string {
  const entity = question.entityType ?? question.kind ?? ''
  const subject = (question.query ?? '').trim().toLowerCase()
  return `${entity}|${subject}|${question.prompt.trim().toLowerCase()}`
}

/** Collapse identical questions, keeping the first (its id is the stable key). */
export function dedupeQuestions(questions: AiClarificationRequest[]): AiClarificationRequest[] {
  const seen = new Set<string>()
  const out: AiClarificationRequest[] = []
  for (const question of questions) {
    const key = questionKey(question)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(question)
  }
  return out
}

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

    case 'clarifications-needed': {
      // ONE question per unresolved term. The compiler legitimately emits a
      // clarification per request, so the same term can arrive twice; showing
      // both made the queue double every round ("1 answers needed" → "2").
      const questions = dedupeQuestions(action.questions)
      return {
        mode: 'clarifying',
        draftId: action.draftId,
        questions,
        answers: {},
        activeQuestionId: questions[0]?.id ?? '',
        // SHORTHAND-CHAT fix cycle 1 (advc1 DEFECT-5): same conditional-spread
        // discipline as 'draft-ready' — a clarification from a draft WITHOUT
        // shorthand leaves the clarifying state byte-identical.
        ...(action.shorthand !== undefined ? { shorthand: action.shorthand } : {}),
      }
    }

    case 'answer-question':
      if (state.mode !== 'clarifying') return state
      return {
        ...state,
        answers: { ...state.answers, [action.questionId]: action.answer },
      }

    case 'change-question': {
      if (state.mode !== 'clarifying') return state
      // SH-QA-2 (b): this leg used to be a pure highlight move — an already-
      // answered card re-rendered identically and the click did nothing
      // visible (dead chrome). It is now a REOPEN: the answer KEY is removed
      // (the map is recomputed with the key filtered out — never
      // `answers[id] = undefined`, which would keep the answer truthy-typed
      // and pin the card to its answered branch) so the card falls back to
      // its existing picker/parameter leg and a re-pick rides the SAME
      // answer-question → auto-submit → resend path as the first pick.
      const reopenedAnswers = Object.fromEntries(
        Object.entries(state.answers).filter(([questionId]) => questionId !== action.questionId),
      )
      return { ...state, answers: reopenedAnswers, activeQuestionId: action.questionId }
    }

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
        // SHORTHAND-CHAT: same discipline for the shorthand document.
        ...(action.shorthand !== undefined ? { shorthand: action.shorthand } : {}),
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
