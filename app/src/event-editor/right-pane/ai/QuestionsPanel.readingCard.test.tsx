/**
 * READING-CARD-ANSWER-1 — the choice card renders the bar's own readings as
 * answer rows (RED-first, app component leg).
 *
 * The defect: the composition-fraction-sum card carried its readings on the
 * server fact but the chat clarification surface rendered it as a material
 * picker with a mint exit — no way to answer. After the map arm (see
 * server/src/ai/shorthandChat.readingCard.test.ts), the card arrives as a
 * 'choice' request whose options ARE the readings (id = reading id, label =
 * CompositionReading.label, snippet = the computed final fractions + note).
 *
 * Pinned here (Ruling 2 #3): one choice row per reading, ARRAY ORDER
 * preserved, snippet shows the fractions (+note when present), NO mint row,
 * and picking a row answers with the reading id on the existing wire
 * (value = reading id, requestId = the join id). A choice card with NO
 * options (a parameter question) still renders the free-text box unchanged.
 */
import { describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QuestionsPanel } from './QuestionsPanel'
import type { AiClarificationRequest } from '../../../types/ai'

/** The card shape the server map emits for a readings-bearing fact (test
 *  seed ONLY — repo rip-out rule: no reagent nouns in product code). */
const readingCard: AiClarificationRequest = {
  id: 'unresolved-c-0123456789',
  kind: 'material',
  entityType: 'material',
  prompt: 'The declared composition fractions sum to 110 percent, not the declared 100 percent (percent-of-final-volume). The utterance carries more than one legal parse — choose which reading applies; each candidate lists its computed final fractions.',
  menuProvider: 'choice',
  query: 'Alpha Reagent, Beta Buffer, Gamma Serum',
  allowCreateLocal: false,
  options: [
    {
      id: 'whole-mixture-supplement',
      label: 'whole-mixture supplement (the supplement is a share of the final volume; the bases re-base)',
      snippet: 'Alpha Reagent 45.45%, Beta Buffer 45.45%, Gamma Serum 9.1%',
    },
    {
      id: 'preceding-noun-recipe',
      label: 'preceding-noun in-house recipe (the supplement attaches to the entry that precedes it — a complete medium the lab makes)',
      snippet: 'Alpha Reagent 50%, Beta Buffer 45%, Gamma Serum 5%',
    },
    {
      id: 'explicit-on-top',
      label: 'explicit on-top (declared fractions stay fractions-of-mixture)',
      snippet: 'Alpha Reagent 50%, Beta Buffer 50%, Gamma Serum 10% — Declared fractions sum to 110 percent of the mixture, not 100 percent — the fractions are kept as declared fractions-of-mixture.',
    },
  ],
}

const paramCard: AiClarificationRequest = {
  id: 'q-param',
  kind: 'parameter',
  prompt: 'What volume of Beta Buffer?',
  menuProvider: 'choice',
  options: [],
}

function renderPanel(onAnswer = vi.fn()) {
  render(
    <QuestionsPanel
      questions={[readingCard]}
      answers={{}}
      activeQuestionId={readingCard.id}
      onAnswer={onAnswer}
      onChangeQuestion={vi.fn()}
      onSubmit={vi.fn()}
      onCancel={vi.fn()}
    />,
  )
  return onAnswer
}

describe('READING-CARD-ANSWER-1 — QuestionsPanel renders the readings as choice rows', () => {
  it('one row per reading, array order preserved, label + computed fractions visible', () => {
    renderPanel()
    const rows = screen.getAllByTestId(/^reading-option-/)
    expect(rows.map((r) => r.getAttribute('data-testid'))).toEqual(
      readingCard.options.map((o) => `reading-option-${readingCard.id}-${o.id}`),
    )
    // Label = the reading's own label; snippet shows the computed fractions.
    expect(rows[0]!.textContent).toContain('whole-mixture supplement')
    expect(rows[0]!.textContent).toContain('45.45')
    expect(rows[1]!.textContent).toContain('preceding-noun in-house recipe')
    expect(rows[1]!.textContent).toContain('45')
    // The note rides the row that carries it.
    expect(rows[2]!.textContent).toContain('explicit on-top')
    expect(rows[2]!.textContent).toContain('kept as declared fractions-of-mixture')
  })

  it('picking a row answers with the READING ID on the existing wire (value = reading id, requestId = the join id)', () => {
    const onAnswer = renderPanel()
    fireEvent.click(screen.getByTestId(`reading-option-${readingCard.id}-preceding-noun-recipe`))
    expect(onAnswer).toHaveBeenCalledTimes(1)
    const [questionId, answer] = onAnswer.mock.calls[0]!
    expect(questionId).toBe(readingCard.id)
    expect(answer).toEqual({
      requestId: readingCard.id,
      optionId: 'preceding-noun-recipe',
      label: 'preceding-noun in-house recipe (the supplement attaches to the entry that precedes it — a complete medium the lab makes)',
      value: 'preceding-noun-recipe',
    })
  })

  it('NO mint row: a reading card offers no free-text/mint leg and no create-local copy', () => {
    renderPanel()
    expect(screen.queryByTestId('parameter-answer')).toBeNull()
    expect(screen.queryByText(/create a local term/i)).toBeNull()
    expect(screen.queryByText(/mint/i)).toBeNull()
  })

  it('byte-stability: a choice card with NO options still renders the free-text box (parameter question unchanged)', () => {
    render(
      <QuestionsPanel
        questions={[paramCard]}
        answers={{}}
        activeQuestionId={paramCard.id}
        onAnswer={vi.fn()}
        onChangeQuestion={vi.fn()}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByTestId('parameter-answer')).toBeDefined()
    expect(screen.queryAllByTestId(/^reading-option-/)).toHaveLength(0)
  })

  it('an answered reading card shows the reading label (the answered leg rides the existing shape)', () => {
    cleanup()
    render(
      <QuestionsPanel
        questions={[readingCard]}
        answers={{
          [readingCard.id]: {
            requestId: readingCard.id,
            optionId: 'preceding-noun-recipe',
            label: 'preceding-noun in-house recipe (the supplement attaches to the entry that precedes it — a complete medium the lab makes)',
            value: 'preceding-noun-recipe',
          },
        }}
        activeQuestionId={readingCard.id}
        onAnswer={vi.fn()}
        onChangeQuestion={vi.fn()}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByTestId(`answered-${readingCard.id}`)).toBeDefined()
    expect(screen.getByTestId(`answered-${readingCard.id}`)).toHaveTextContent('preceding-noun in-house recipe')
    expect(screen.queryAllByTestId(/^reading-option-/)).toHaveLength(0)
  })
})
