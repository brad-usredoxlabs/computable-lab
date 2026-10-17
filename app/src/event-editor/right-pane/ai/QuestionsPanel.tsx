/**
 * QuestionsPanel — persistent clarification surface.
 *
 * Renders all unanswered clarification requests as a scrollable list of cards
 * with a progress bar and batch-submit / cancel controls. Unlike the inline
 * ClarificationCards in MessageLog, this panel stays visible while the user
 * works through multiple questions — the draft is paused until all are resolved.
 */

import { useEffect, useRef } from 'react'
import { ClarificationPicker, requestHasPicker } from './ClarificationPicker'
import { ParameterAnswerInput } from './ParameterAnswerInput'
import { ShorthandView } from './ChangesPanel'
import type { AiClarificationAnswer, AiClarificationRequest } from '../../../types/ai'

export interface QuestionsPanelProps {
  questions: AiClarificationRequest[]
  answers: Record<string, AiClarificationAnswer>
  activeQuestionId: string
  /**
   * SHORTHAND-CHAT fix cycle 1 (advc1 DEFECT-5): the shorthand document the
   * paused draft was built from, VERBATIM — a needs-clarification turn IS
   * proposal-bearing, so the spec's "shows the shorthand VERBATIM above the
   * proposal" holds while the draft is paused. Render-only (the SAME
   * ShorthandView component the review panel uses — no second grammar, no edit
   * affordance mid-clarification). Optional: a clarification from a draft
   * without shorthand renders byte-unchanged.
   */
  shorthand?: string
  onAnswer: (questionId: string, answer: AiClarificationAnswer) => void
  onChangeQuestion: (questionId: string) => void
  onSubmit: () => void
  onCancel: () => void
}

export function QuestionsPanel({
  questions,
  answers,
  activeQuestionId,
  shorthand,
  onAnswer,
  onChangeQuestion,
  onSubmit,
  onCancel,
}: QuestionsPanelProps) {
  const answeredCount = questions.filter((q) => answers[q.id]).length
  const allAnswered = answeredCount === questions.length && questions.length > 0

  // SH-QA-2 (a): the next card the biologist can still answer. An ANSWERED card
  // is never actionless — when the batch is not complete its proceed affordance
  // walks to this question, and the focus effect below makes that walk VISIBLE.
  const nextUnansweredId = questions.find((q) => !answers[q.id])?.id ?? null

  // SH-QA-2 (a): `activeQuestionId` used to move only a CSS class, which is why
  // a "Change"/next click "did nothing visible". Now naming a card focuses its
  // first interactive control — the affordance the user needs is under the
  // cursor (and keyboard) the moment the card becomes active. The signature
  // guard fires the focus only when the card BECOMES editable (id changed, or
  // an answered card was reopened) — answering a card never steals focus from
  // the one the biologist is typing in.
  const listRef = useRef<HTMLDivElement | null>(null)
  const lastFocusSignatureRef = useRef<string | null>(null)
  useEffect(() => {
    if (!activeQuestionId) return
    const signature = `${activeQuestionId}|${answers[activeQuestionId] ? 'answered' : 'open'}`
    if (lastFocusSignatureRef.current === signature) return
    lastFocusSignatureRef.current = signature
    if (answers[activeQuestionId]) return
    const card = listRef.current?.querySelector(`[data-question-id="${activeQuestionId}"]`)
    card?.querySelector<HTMLElement>('input, button')?.focus()
  }, [activeQuestionId, answers])

  // Auto-submit when all questions are answered — don't make the user
  // hunt for a button. The old ClarificationCards did this via useEffect.
  useEffect(() => {
    if (allAnswered) {
      const timer = setTimeout(() => onSubmit(), 300)
      return () => clearTimeout(timer)
    }
  }, [allAnswered, onSubmit])

  return (
    <div className="questions-panel" data-testid="questions-panel">
      {shorthand !== undefined ? (
        // SHORTHAND-CHAT fix cycle 1: the paused draft's document, VERBATIM,
        // above the questions (render-only — no onRecompile, no edit affordance
        // mid-clarification; the answer fold is the server's deterministic job).
        <ShorthandView yaml={shorthand} />
      ) : null}
      <div className="questions-panel__header">
        <span className="questions-panel__count">
          {questions.length - answeredCount} answers needed
        </span>
        <p className="questions-panel__hint">
          The draft is paused until these are resolved.
        </p>
      </div>

      <div className="questions-panel__list" ref={listRef}>
        {questions.map((request, index) => {
          const answer = answers[request.id]
          const isActive = request.id === activeQuestionId
          return (
            <section
              key={request.id}
              data-question-id={request.id}
              className={
                isActive
                  ? 'questions-panel__card questions-panel__card--active'
                  : 'questions-panel__card'
              }
            >
              <div className="questions-panel__card-head">
                <span className="questions-panel__card-number">
                  Question {index + 1} of {questions.length}
                </span>
                <span className="questions-panel__card-kind">
                  {request.entityType ?? request.kind}
                </span>
              </div>
              <p className="questions-panel__prompt">{request.prompt}</p>
              {request.snippet ? (
                <p className="questions-panel__snippet">{request.snippet}</p>
              ) : null}
              {answer ? (
                <div className="questions-panel__answered" data-testid={`answered-${request.id}`}>
                  <span>{'\u2713'} {answer.label ?? answer.value ?? 'answered'}</span>
                  <button
                    type="button"
                    className="questions-panel__change-btn"
                    onClick={() => onChangeQuestion(request.id)}
                  >
                    Change
                  </button>
                  {/* SH-QA-2 (a): an answered card is NEVER dead chrome. All
                      answered → a per-card proceed affordance that calls the
                      SAME onSubmit the "Update draft" primary calls (OQ2
                      batch-proceed: the existing handleClarificationsSubmit
                      resend, no new wire, no per-answer accept). Not all
                      answered → the card walks to the next unanswered question
                      via the change-question leg, which the focus effect makes
                      visible. */}
                  {allAnswered ? (
                    <button
                      type="button"
                      className="questions-panel__btn questions-panel__btn--primary"
                      data-testid={`continue-${request.id}`}
                      onClick={onSubmit}
                    >
                      Continue with this answer
                    </button>
                  ) : nextUnansweredId && nextUnansweredId !== request.id ? (
                    <button
                      type="button"
                      className="questions-panel__btn"
                      data-testid={`next-unanswered-${request.id}`}
                      onClick={() => onChangeQuestion(nextUnansweredId)}
                    >
                      Go to next unanswered
                    </button>
                  ) : null}
                </div>
              ) : requestHasPicker(request) ? (
                <ClarificationPicker
                  key={request.id}
                  request={request}
                  onPick={(ans) => onAnswer(request.id, ans)}
                />
              ) : (
                // Nothing to choose from — the question wants a value ("what
                // volume?"). Render the box that lets them answer it.
                <ParameterAnswerInput
                  key={request.id}
                  requestId={request.id}
                  onAnswer={(ans) => onAnswer(request.id, ans)}
                />
              )}
            </section>
          )
        })}
      </div>

      <div className="questions-panel__progress">
        {answeredCount} of {questions.length} answered
      </div>

      <div className="questions-panel__actions">
        {allAnswered ? (
          <button
            type="button"
            className="questions-panel__btn questions-panel__btn--primary"
            onClick={onSubmit}
            data-testid="questions-submit"
          >
            Update draft
          </button>
        ) : null}
        <button
          type="button"
          className="questions-panel__btn questions-panel__btn--cancel"
          onClick={onCancel}
        >
          Cancel this draft and start a new prompt
        </button>
      </div>
    </div>
  )
}
