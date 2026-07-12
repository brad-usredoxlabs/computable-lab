import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { ProtocolIdeShell } from './ProtocolIdeShell'
import type { ProtocolIdeSession } from './types'

const draftProtocolIdeGraph = vi.fn()
const getProtocolIdeIssueCards = vi.fn()
const getProtocolIdeRollingSummary = vi.fn()

vi.mock('../shared/api/client', () => ({
  apiClient: {
    getProtocolIdeIssueCards: (...args: unknown[]) => getProtocolIdeIssueCards(...args),
    getProtocolIdeRollingSummary: (...args: unknown[]) => getProtocolIdeRollingSummary(...args),
    draftProtocolIdeGraph: (...args: unknown[]) => draftProtocolIdeGraph(...args),
    submitProtocolIdeFeedback: vi.fn(),
    setProtocolIdeLabContextOverride: vi.fn(),
    rerunProtocolIdeSession: vi.fn(),
    createPlannedRunFromLocalProtocol: vi.fn(),
    getProtocolIdeOverlaySummaries: vi.fn(),
    getProtocolIdeEventGraph: vi.fn(),
    listCuratedVendors: vi.fn().mockResolvedValue([]),
  },
}))

function makeSession(overrides?: Partial<ProtocolIdeSession>): ProtocolIdeSession {
  return {
    kind: 'protocol-ide-session',
    recordId: 'PIS-clar-001',
    sourceMode: 'directive',
    title: 'Clarification test',
    status: 'projected',
    latestDirectiveText: 'Draft the graph',
    ...overrides,
  }
}

describe('ProtocolIdeShell clarification loop', () => {
  beforeEach(() => {
    draftProtocolIdeGraph.mockResolvedValue({ success: true, draftIteration: 2 })
    getProtocolIdeIssueCards.mockResolvedValue({ success: true, cards: [] })
    getProtocolIdeRollingSummary.mockResolvedValue({ success: true, summary: '' })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('batches visible clarification answers into one draft-graph request', async () => {
    const onRefresh = vi.fn()
    render(
      <MemoryRouter>
        <ProtocolIdeShell
          session={makeSession({
            latestClarificationRequests: [
              {
                id: 'layout-choice',
                kind: 'parameter',
                menuProvider: 'choice',
                prompt: 'Which layout should be used?',
                options: [
                  { id: 'layout-96', label: '96-well plate' },
                ],
              },
            ],
          })}
          onRefresh={onRefresh}
        />
      </MemoryRouter>,
    )

    expect(screen.getByTestId('protocol-ide-clarification-cards')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /96-well plate/i }))

    await waitFor(() => expect(draftProtocolIdeGraph).toHaveBeenCalledTimes(1))
    expect(draftProtocolIdeGraph).toHaveBeenCalledWith('PIS-clar-001', {
      directiveText: 'Draft the graph',
      clarificationAnswers: [
        expect.objectContaining({
          requestId: 'layout-choice',
          optionId: 'layout-96',
          label: '96-well plate',
        }),
      ],
    })
    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1))
  })

  it('renders latest draft diagnostics in the action rail', () => {
    render(
      <MemoryRouter>
        <ProtocolIdeShell
          session={makeSession({
            latestProjectionDiagnostics: [
              { severity: 'info', code: 'AWAITING_CLARIFICATION', message: 'The draft produced clarification cards before emitting a replacement graph.' },
            ],
          })}
        />
      </MemoryRouter>,
    )

    expect(screen.getByTestId('protocol-ide-diagnostics')).toHaveTextContent('AWAITING_CLARIFICATION')
    expect(screen.getByTestId('protocol-ide-diagnostics')).toHaveTextContent('clarification cards')
  })
})
