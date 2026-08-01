/**
 * QuestionsPanel — persistent clarification surface.
 *
 * Renders all unanswered clarification requests as a scrollable list of cards
 * with a progress bar and batch-submit / cancel controls. Unlike the inline
 * ClarificationCards in MessageLog, this panel stays visible while the user
 * works through multiple questions — the draft is paused until all are resolved.
 */

import { useEffect } from 'react'
import { ClarificationPicker } from './ClarificationPicker'
import type { AiClarificationAnswer, AiClarificationRequest } from '../../../types/ai'

export interface QuestionsPanelProps {
  questions: AiClarificationRequest[]
  answers: Record<string, AiClarificationAnswer>
  activeQuestionId: string
  onAnswer: (questionId: string, answer: AiClarificationAnswer) => void
  onChangeQuestion: (questionId: string) => void
  onSubmit: () => void
  onCancel: () => void
}

export function QuestionsPanel({
  questions,
  answers,
  activeQuestionId,
  onAnswer,
  onChangeQuestion,
  onSubmit,
  onCancel,
}: QuestionsPanelProps) {
  const answeredCount = questions.filter((q) => answers[q.id]).length
  const allAnswered = answeredCount === questions.length && questions.length > 0

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
      <div className="questions-panel__header">
        <span className="questions-panel__count">
          {questions.length - answeredCount} answers needed
        </span>
        <p className="questions-panel__hint">
          The draft is paused until these are resolved.
        </p>
      </div>

      <div className="questions-panel__list">
        {questions.map((request, index) => {
          const answer = answers[request.id]
          const isActive = request.id === activeQuestionId
          return (
            <section
              key={request.id}
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
                </div>
              ) : (
                <ClarificationPicker
                  request={request}
                  onPick={(ans) => onAnswer(request.id, ans)}
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
