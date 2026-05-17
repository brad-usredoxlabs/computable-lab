/**
 * Verifies the Foundry inbox poll only fires while the selected review is in
 * a non-terminal status (queued/reviewing) and stops once it becomes terminal.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { FoundryReviewContext, FoundryReviewSummary } from '../shared/api/client'

vi.mock('../shared/api/client', () => ({
  apiClient: {
    listFoundryReviews: vi.fn(),
    getFoundryReviewContext: vi.fn(),
    getFoundryEventGraph: vi.fn(),
    streamFoundryReviewChat: vi.fn(),
    streamFoundryInnerLoop: vi.fn(),
    promoteFoundryDraftSpec: vi.fn(),
  },
}))

// Stub the AI panel context — the real provider lives in App.tsx, but the
// Protocol IDE page registers a chat via this context.
vi.mock('../shared/context/AiPanelContext', () => ({
  useRegisterAiChat: () => {},
}))
vi.mock('../shared/hooks/useAiChat', () => ({
  useAiChat: () => ({ messages: [], submit: vi.fn(), isStreaming: false }),
}))

import { apiClient } from '../shared/api/client'
import { ProtocolIdePage } from './ProtocolIdePage'

const REVIEW: FoundryReviewSummary = {
  protocolId: 'demo',
  variant: 'manual_tubes',
  status: 'queued',
  patchSpecCount: 1,
  fixClassification: 'data-only',
  artifacts: {},
}

function makeContext(status: FoundryReviewContext['status']): FoundryReviewContext {
  return {
    kind: 'protocol-foundry-review-context',
    protocolId: 'demo',
    variant: 'manual_tubes',
    generatedAt: new Date().toISOString(),
    status,
    semanticContract: { dataFirst: '', ontologyAware: '', knowledgeLayer: '' },
    source: { pageImages: [] },
    artifacts: { patchSpecs: [] },
    artifactRefs: {},
    semantic: {
      eventSemanticKeys: [],
      graphAnchors: [],
      materialLayerDecisions: [],
      ontologyRefs: [],
      ontologyBackfillNeeds: [],
      fixClassification: 'data-only',
    },
    knowledgeLayer: { contextRefs: [], claimRefs: [], assertionRefs: [], evidenceRefs: [] },
  } as FoundryReviewContext
}

describe('ProtocolIdePage Foundry inbox poll', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.mocked(apiClient.listFoundryReviews).mockResolvedValue([REVIEW])
    vi.mocked(apiClient.getFoundryEventGraph).mockResolvedValue({
      success: true, events: [], labwares: [], deckPlacements: [],
    })
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('polls every 5s while status is queued and stops once status is implemented', async () => {
    let status: FoundryReviewContext['status'] = 'queued'
    vi.mocked(apiClient.getFoundryReviewContext).mockImplementation(async () => makeContext(status))

    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/protocol-ide?protocolId=demo&variant=manual_tubes']}>
          <ProtocolIdePage />
        </MemoryRouter>,
      )
    })

    // Let mount-time effects + initial fetch resolve.
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(apiClient.getFoundryReviewContext).toHaveBeenCalledTimes(1)

    // First poll tick at 5s while still queued → second fetch.
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    expect(apiClient.getFoundryReviewContext.mock.calls.length).toBeGreaterThanOrEqual(2)

    // Flip to terminal status; the next tick fires once and then tears down.
    status = 'implemented'
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    const callsBeforeIdle = vi.mocked(apiClient.getFoundryReviewContext).mock.calls.length

    // No more polls after the status becomes terminal.
    await act(async () => { await vi.advanceTimersByTimeAsync(30000) })
    expect(apiClient.getFoundryReviewContext.mock.calls.length).toBe(callsBeforeIdle)
  })

  it('does not poll when no review is selected', async () => {
    vi.mocked(apiClient.getFoundryReviewContext).mockResolvedValue(makeContext('queued'))
    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/protocol-ide']}>
          <ProtocolIdePage />
        </MemoryRouter>,
      )
    })
    await act(async () => { await vi.advanceTimersByTimeAsync(20000) })
    expect(apiClient.getFoundryReviewContext).not.toHaveBeenCalled()
  })
})
