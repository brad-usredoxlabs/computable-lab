/**
 * SH-QA-2 — dead-chrome component legs (presentational).
 *
 * An answered or prefilled clarification card is NEVER dead chrome: it carries
 * a live affordance — "Continue with this answer" (all answered: the SAME
 * onSubmit the "Update draft" button calls — OQ2 batch-proceed, no new wire)
 * or "Go to next unanswered" (some answered: dispatches change-question on the
 * next unanswered id, which the focus effect makes VISIBLE) — and "Change"
 * genuinely re-opens the card's picker/parameter leg (the reducer drops the
 * answer key; the card falls to its existing input branch).
 *
 * Harness: the panel mounted through the REAL sidebarReducer (the same wiring
 * AiTabPanel's mount block uses), so reopen/focus/auto-submit are proven at
 * the component seam, not against a stub.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { QuestionsPanel } from './QuestionsPanel'
import { sidebarReducer, type AiSidebarState } from './sidebarState'
import type { AiClarificationAnswer, AiClarificationRequest } from '../../../types/ai'
import type { SlashSuggestion } from '../../../shared/taptab/slashMenu/types'

// Stub the slash-menu resolvers so picker legs are deterministic (same seam as
// ClarificationPicker.test.tsx — the real resolvers hit the API).
const resolveMaterial = vi.fn()
vi.mock('../../../shared/taptab/slashMenu/resolvers', () => ({
  resolveMaterial: (q: string, ctx: unknown) => resolveMaterial(q, ctx),
  resolveLabware: () => Promise.resolve([]),
  resolveEquipment: () => Promise.resolve([]),
}))
vi.mock('../../lib/groundMaterialRef', () => ({
  groundMaterialRef: vi.fn(async () => ({ kind: 'ontology' })),
}))

const pickerQuestion: AiClarificationRequest = {
  id: 'q1',
  kind: 'material',
  prompt: 'Which material is "clofibrate"?',
  menuProvider: '/m',
  query: 'clofibrate',
  options: [],
}
const paramQuestion: AiClarificationRequest = {
  id: 'q2',
  kind: 'parameter',
  prompt: 'What volume of DMEM?',
  menuProvider: 'choice',
  options: [],
}
const clofibrateAnswer: AiClarificationAnswer = {
  requestId: 'q1',
  label: 'Clofibrate',
  mentionToken: '[[material:MAT-1|Clofibrate]]',
}
const hit: SlashSuggestion = {
  key: 'material:MAT-1',
  label: 'Clofibrate (local)',
  badge: 'Concept',
  mention: { type: 'material', entityKind: 'material', id: 'MAT-1', label: 'Clofibrate (local)' },
}

/** The host wiring from AiTabPanel's mount block (:1303-1322), verbatim in
 *  shape: answer-question / change-question dispatches on the real reducer. */
function renderHarness(
  questions: AiClarificationRequest[],
  initialAnswers: Record<string, AiClarificationAnswer>,
  onSubmit: () => void,
) {
  function Harness() {
    const [state, dispatch] = useState<AiSidebarState>({
      mode: 'clarifying',
      draftId: 'draft-1',
      questions,
      answers: initialAnswers,
      activeQuestionId: questions[0]?.id ?? '',
    })
    return (
      <QuestionsPanel
        questions={state.mode === 'clarifying' ? state.questions : []}
        answers={state.mode === 'clarifying' ? state.answers : {}}
        activeQuestionId={state.mode === 'clarifying' ? state.activeQuestionId : ''}
        onAnswer={(qId, ans) =>
          dispatch((prev) => sidebarReducer(prev, { type: 'answer-question', questionId: qId, answer: ans }))
        }
        onChangeQuestion={(qId) =>
          dispatch((prev) => sidebarReducer(prev, { type: 'change-question', questionId: qId }))
        }
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />
    )
  }
  return render(<Harness />)
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  resolveMaterial.mockReset()
})

describe('QuestionsPanel — SH-QA-2 dead chrome: answered/prefilled cards carry a live affordance', () => {
  // DC1 RED: a prefilled answered card today renders ONLY the ✓ + a dead
  // "Change" (QuestionsPanel.tsx:100-110) — no proceed affordance at all.
  it('DC1: a prefilled answered card renders a live proceed affordance that fires onSubmit exactly once', () => {
    const onSubmit = vi.fn()
    renderHarness([pickerQuestion], { q1: clofibrateAnswer }, onSubmit)

    const continueBtn = screen.getByTestId('continue-q1')
    expect(continueBtn.textContent).toBe('Continue with this answer')
    fireEvent.click(continueBtn)
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('DC1: every answered card carries its own proceed affordance when all answered', () => {
    const onSubmit = vi.fn()
    renderHarness(
      [pickerQuestion, paramQuestion],
      { q1: clofibrateAnswer, q2: { requestId: 'q2', value: '50 uL', label: '50 uL' } },
      onSubmit,
    )
    expect(screen.getByTestId('continue-q1')).toBeDefined()
    expect(screen.getByTestId('continue-q2')).toBeDefined()
    // The panel-level primary stays (it is what the silent auto-submit hid).
    expect(screen.getByTestId('questions-submit')).toBeDefined()
  })

  // S3: a partially-answered card's proceed affordance is "Go to next
  // unanswered" — it dispatches change-question on the next unanswered id AND
  // the focus effect makes the move VISIBLE (activeElement lands on the next
  // card's input; today activeQuestionId only moves a CSS class).
  it('DC6/S3: "Go to next unanswered" advances activeQuestionId and visibly focuses the next card', async () => {
    resolveMaterial.mockResolvedValue([hit])
    const onSubmit = vi.fn()
    renderHarness([pickerQuestion, paramQuestion], { q1: clofibrateAnswer }, onSubmit)

    const goBtn = screen.getByTestId('next-unanswered-q1')
    expect(goBtn.textContent).toBe('Go to next unanswered')
    fireEvent.click(goBtn)

    const nextInput = (await screen.findByTestId('parameter-answer-input')) as HTMLInputElement
    expect(document.activeElement).toBe(nextInput)
    // Progress affordance, not a no-op: the answered card stays actionable and
    // the unanswered card's input is live.
    expect(nextInput.disabled).toBe(false)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  // DC5 RED: prefilled answered card → Change → re-picked → allAnswered flips
  // false→true ONCE → the existing auto-submit effect fires EXACTLY ONE submit
  // (the reopen clears the pending timer; no double-resend across the cycle).
  it('DC5: Change reopens the answered card; re-picking fires exactly ONE auto-submit', async () => {
    vi.useFakeTimers()
    resolveMaterial.mockResolvedValue([hit])
    const onSubmit = vi.fn()
    renderHarness([pickerQuestion], { q1: clofibrateAnswer }, onSubmit)

    // Prefilled-carried: the card is actionable from the first render.
    expect(screen.getByTestId('continue-q1')).toBeDefined()

    // Change on the answered card REOPENS it: the picker leg is back and the
    // pending auto-submit timer is cleared (allAnswered flipped false).
    fireEvent.click(screen.getByText('Change'))
    const reopened = (await screen.findByPlaceholderText(/Search materials/)) as HTMLInputElement
    expect(reopened.value).toBe('clofibrate')
    expect(screen.queryByTestId('answered-q1')).toBeNull()
    await act(async () => {
      vi.advanceTimersByTime(1000)
    })
    expect(onSubmit).not.toHaveBeenCalled()

    // Re-pick through the SAME picker leg the first pick used.
    await act(async () => {
      vi.advanceTimersByTime(150) // the picker's resolver debounce
    })
    await act(async () => {
      vi.advanceTimersByTime(0) // flush the resolver promise
    })
    const row = await screen.findByText('Clofibrate (local)')
    await act(async () => {
      fireEvent.mouseDown(row)
    })

    // allAnswered re-trips → the auto-submit effect fires EXACTLY ONE submit.
    await act(async () => {
      vi.advanceTimersByTime(300)
    })
    expect(onSubmit).toHaveBeenCalledTimes(1)

    await act(async () => {
      vi.advanceTimersByTime(1000)
    })
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  // DC6 INVARIANT: every clarifying shape carries a PROGRESS affordance
  // (cancel-always-present does NOT satisfy it).
  it.each([
    {
      name: 'S1 clarifying, no answers, picker question',
      questions: [pickerQuestion],
      answers: {} as Record<string, AiClarificationAnswer>,
    },
    {
      name: 'S2 clarifying, no answers, parameter question',
      questions: [paramQuestion],
      answers: {} as Record<string, AiClarificationAnswer>,
    },
    {
      name: 'S3 clarifying, some answered',
      questions: [pickerQuestion, paramQuestion],
      answers: { q1: clofibrateAnswer } as Record<string, AiClarificationAnswer>,
    },
    {
      name: 'S4 clarifying, all answered (prefilled-carried)',
      questions: [pickerQuestion, paramQuestion],
      answers: {
        q1: clofibrateAnswer,
        q2: { requestId: 'q2', value: '50 uL', label: '50 uL' },
      } as Record<string, AiClarificationAnswer>,
    },
  ])('DC6 invariant: $name renders a progress affordance (not merely cancel)', async ({ name, questions, answers }) => {
    resolveMaterial.mockResolvedValue([hit])
    const onSubmit = vi.fn()
    renderHarness(questions, answers, onSubmit)

    if (name.startsWith('S1')) {
      const input = (await screen.findByPlaceholderText(/Search materials/)) as HTMLInputElement
      expect(input.disabled).toBe(false)
      return
    }
    if (name.startsWith('S2')) {
      const input = (screen.getByTestId('parameter-answer-input')) as HTMLInputElement
      expect(input.disabled).toBe(false)
      return
    }
    if (name.startsWith('S3')) {
      // Answered card: Change + a live next-step affordance; unanswered card keeps its input.
      expect(screen.getByText('Change')).toBeDefined()
      expect(screen.getByTestId('next-unanswered-q1')).toBeDefined()
      expect(screen.getByTestId('parameter-answer-input')).toBeDefined()
      return
    }
    // S4: every answered card proceeds; the panel primary stays.
    expect(screen.getByTestId('continue-q1')).toBeDefined()
    expect(screen.getByTestId('continue-q2')).toBeDefined()
    expect(screen.getByTestId('questions-submit')).toBeDefined()
  })
})
