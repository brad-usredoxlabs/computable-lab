import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MessageLog } from './MessageLog'
import type { ChatState } from './chatReducer'
import type { AiClarificationRequest } from '../../../types/ai'

function stateWith(requests: AiClarificationRequest[]): ChatState {
  return {
    messages: [{ id: 'm1', role: 'assistant', text: 'Need info', ts: 1, clarificationRequests: requests }],
    pending: null,
    status: null,
    error: null,
    trace: [],
  }
}

function stateWithTrace(trace: ChatState['trace']): ChatState {
  return {
    messages: [],
    pending: null,
    status: null,
    error: null,
    trace,
  }
}

afterEach(() => cleanup())

describe('MessageLog clarification summary', () => {
  it('shows a summary line for clarification requests instead of inline cards', () => {
    render(<MessageLog state={stateWith([{ id: 'a', kind: 'material', prompt: 'X', menuProvider: 'choice', options: [] }])} />)
    expect(screen.getByText('1 clarification needed — see Questions panel above.')).toBeTruthy()
  })

  it('pluralizes "clarifications" when there are multiple', () => {
    render(<MessageLog state={stateWith([
      { id: 'a', kind: 'material', prompt: 'X', menuProvider: 'choice', options: [] },
      { id: 'b', kind: 'labware', prompt: 'Y', menuProvider: '/l', options: [] },
    ])} />)
    expect(screen.getByText('2 clarifications needed — see Questions panel above.')).toBeTruthy()
  })

  it('shows no summary when there are no clarification requests', () => {
    render(<MessageLog state={stateWith([])} />)
    expect(screen.queryByText(/clarification.*needed/i)).toBeNull()
  })
})

describe('MessageLog observability trace', () => {
  it('renders the tool-call trail, results, and diagnostics during a turn', () => {
    render(<MessageLog state={stateWithTrace([
      { seq: 0, kind: 'tool_call', toolName: 'search_records', args: { query: 'T25' } },
      { seq: 1, kind: 'tool_result', toolName: 'search_records', success: true, durationMs: 12 },
      { seq: 2, kind: 'diagnostic', passId: 'validate', code: 'V1', severity: 'warning', message: 'labware resolved' },
    ])} />)
    expect(screen.getByTestId('message-log-trace')).not.toBeNull()
    expect(screen.getAllByTestId('trace-tool_call').length).toBe(1)
    expect(screen.getAllByTestId('trace-tool_result').length).toBe(1)
    expect(screen.getAllByTestId('trace-diagnostic').length).toBe(1)
    expect(screen.getAllByText(/search_records/).length).toBeGreaterThan(0)
    expect(screen.getByText(/labware resolved/)).not.toBeNull()
  })

  it('renders nothing when the turn has no trace', () => {
    render(<MessageLog state={stateWithTrace([])} />)
    expect(screen.queryByTestId('message-log-trace')).toBeNull()
  })
})
