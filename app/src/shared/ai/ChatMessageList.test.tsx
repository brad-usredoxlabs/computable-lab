import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ChatMessageList } from './ChatMessageList'
import type { ChatMessage, InstrumentApplianceJob } from '../../types/ai'

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

    expect(screen.getByText((_, element) => element?.textContent === prompt)).toBeTruthy()
    expect(screen.getByRole('status').textContent).toContain('Prompt received. Working...')
    expect(screen.getByRole('status').textContent).toContain('Resolving labware references...')
  })

  it('renders appliance jobs with an execute action', () => {
    const job: InstrumentApplianceJob = {
      kind: 'instrument-appliance-job',
      jobId: 'gemini-em-active-read-1',
      adapterId: 'molecular_devices_gemini',
      operation: 'active_read',
      instrument: 'Gemini EM plate reader',
      request: {
        adapterId: 'molecular_devices_gemini',
        outputPath: 'records/inbox/gemini-em-active-read-1.csv',
        parameters: {},
      },
      sourceRunFile: {
        instrument: 'Gemini EM plate reader',
        wells: [{ well: 'A1' }, { well: 'A2' }],
      },
    }
    const messages: ChatMessage[] = [
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'Ready to run.',
        timestamp: 1,
        instrumentApplianceJobs: [job],
      },
    ]
    let executed: InstrumentApplianceJob | undefined

    render(
      <ChatMessageList
        messages={messages}
        onExecuteInstrumentApplianceJob={(nextJob) => {
          executed = nextJob
        }}
      />,
    )

    expect(screen.getByText('Gemini EM plate reader active_read')).toBeTruthy()
    expect(screen.getByText(/2 wells .*records\/inbox\/gemini-em-active-read-1.csv/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Execute' }))
    expect(executed).toBe(job)
  })

  it('disables blocked appliance jobs and shows blockers', () => {
    const job: InstrumentApplianceJob = {
      kind: 'instrument-appliance-job',
      jobId: 'gemini-em-active-read-1',
      adapterId: 'molecular_devices_gemini',
      operation: 'active_read',
      instrument: 'Gemini EM plate reader',
      request: {
        adapterId: 'molecular_devices_gemini',
        outputPath: 'records/inbox/gemini-em-active-read-1.csv',
        parameters: {},
      },
      sourceRunFile: {
        instrument: 'Gemini EM plate reader',
        wells: [{ well: 'A1' }],
      },
      executionReadiness: {
        jobId: 'gemini-em-active-read-1',
        status: 'blocked',
        requiresConfirmation: false,
        blockers: [{ code: 'missing_execution_mode', message: 'Execution mode must be explicit.' }],
      },
    }
    const messages: ChatMessage[] = [
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'Needs review.',
        timestamp: 1,
        instrumentApplianceJobs: [job],
      },
    ]
    let executed: InstrumentApplianceJob | undefined

    render(
      <ChatMessageList
        messages={messages}
        onExecuteInstrumentApplianceJob={(nextJob) => {
          executed = nextJob
        }}
      />,
    )

    const button = screen.getByRole('button', { name: 'Blocked' })
    expect((button as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('Execution mode must be explicit.')).toBeTruthy()
    fireEvent.click(button)
    expect(executed).toBeUndefined()
  })
})
