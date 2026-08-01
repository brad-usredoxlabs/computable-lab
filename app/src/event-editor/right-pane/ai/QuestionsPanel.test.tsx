import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QuestionsPanel } from './QuestionsPanel'
import type { AiClarificationRequest } from '../../../types/ai'

const mockQuestion: AiClarificationRequest = {
  id: 'q1',
  kind: 'material',
  prompt: 'Which material is "clofibrate"?',
  menuProvider: '/m',
  options: [],
  allowCreateLocal: true,
  query: 'clofibrate',
}

describe('QuestionsPanel', () => {
  it('renders question prompt and progress', () => {
    render(
      <QuestionsPanel
        questions={[mockQuestion]}
        answers={{}}
        activeQuestionId="q1"
        onAnswer={vi.fn()}
        onChangeQuestion={vi.fn()}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByText(/Which material/)).toBeDefined()
    expect(screen.getByText(/1 answers needed/)).toBeDefined()
  })

  it('shows update button when all answered', () => {
    render(
      <QuestionsPanel
        questions={[mockQuestion]}
        answers={{ q1: { requestId: 'q1', label: 'test' } }}
        activeQuestionId="q1"
        onAnswer={vi.fn()}
        onChangeQuestion={vi.fn()}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByText('1 of 1 answered')).toBeDefined()
    expect(screen.getByText('Update draft')).toBeDefined()
  })

  it('shows cancel escape hatch', () => {
    render(
      <QuestionsPanel
        questions={[mockQuestion]}
        answers={{}}
        activeQuestionId="q1"
        onAnswer={vi.fn()}
        onChangeQuestion={vi.fn()}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByText(/Cancel this draft/)).toBeDefined()
  })

  it('shows answered questions as editable with Change button', () => {
    render(
      <QuestionsPanel
        questions={[mockQuestion]}
        answers={{ q1: { requestId: 'q1', label: 'Clofibrate MAT-001' } }}
        activeQuestionId="q1"
        onAnswer={vi.fn()}
        onChangeQuestion={vi.fn()}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByText(/Clofibrate MAT-001/)).toBeDefined()
    expect(screen.getByText('Change')).toBeDefined()
  })

  it('fires onCancel when cancel button clicked', () => {
    const onCancel = vi.fn()
    render(
      <QuestionsPanel
        questions={[mockQuestion]}
        answers={{}}
        activeQuestionId="q1"
        onAnswer={vi.fn()}
        onChangeQuestion={vi.fn()}
        onSubmit={vi.fn()}
        onCancel={onCancel}
      />,
    )
    fireEvent.click(screen.getByText(/Cancel this draft/))
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('fires onSubmit when update draft clicked', () => {
    const onSubmit = vi.fn()
    render(
      <QuestionsPanel
        questions={[mockQuestion]}
        answers={{ q1: { requestId: 'q1', label: 'test' } }}
        activeQuestionId="q1"
        onAnswer={vi.fn()}
        onChangeQuestion={vi.fn()}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByText('Update draft'))
    expect(onSubmit).toHaveBeenCalledOnce()
  })
})
