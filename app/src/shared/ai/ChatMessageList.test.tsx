import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ChatMessageList } from './ChatMessageList'
import type { ChatMessage } from '../../types/ai'

describe('ChatMessageList', () => {
  it('shows the full submitted prompt and an active running indicator in the content pane', () => {
    const prompt = 'Put a reservoir in source.\nThen transfer 50 uL to A1.'
    const messages: ChatMessage[] = [
      {
        id: 'user-1',
        role: 'user',
        content: prompt,
        timestamp: 1,
      },
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'Prompt received. Starting compiler pipeline...',
        timestamp: 2,
        isStreaming: true,
        streamEvents: [
          { type: 'status', message: 'Resolving labware references...' },
        ],
      },
    ]

    render(<ChatMessageList messages={messages} />)

    expect(screen.getByText((_, element) => element?.textContent === prompt)).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Prompt received. Working...')
    expect(screen.getByRole('status')).toHaveTextContent('Resolving labware references...')
  })
})
