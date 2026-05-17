/**
 * FoundryReviewDetail — verifies the inbox detail layout exposes the five
 * spec-mandated regions (header, graph, inner-loop, actions, chat) and pulls
 * event-graph data through the dedicated Foundry endpoint.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { FoundryReviewContext } from '../shared/api/client'

vi.mock('../shared/api/client', () => ({
  apiClient: {
    getFoundryEventGraph: vi.fn(),
    streamFoundryReviewChat: vi.fn(),
  },
}))

import { apiClient } from '../shared/api/client'
import { FoundryReviewDetail } from './FoundryReviewDetail'

function buildContext(overrides?: Partial<FoundryReviewContext>): FoundryReviewContext {
  return {
    kind: 'protocol-foundry-review-context',
    protocolId: 'demo-protocol',
    variant: 'manual_tubes',
    generatedAt: new Date().toISOString(),
    status: 'reviewing',
    semanticContract: {
      dataFirst: 'data first',
      ontologyAware: 'ontology aware',
      knowledgeLayer: 'knowledge',
    },
    source: {
      title: 'Demo protocol',
      pageImages: [],
    },
    artifacts: {
      patchSpecs: [{ title: 'Fix volume parse', rationale: 'volume parses wrong' }],
      humanReview: {
        chatTranscript: [
          { role: 'user', content: 'hi', at: '2026-05-15T00:00:00Z' },
          { role: 'assistant', content: 'hello', at: '2026-05-15T00:00:01Z' },
        ],
      },
    },
    artifactRefs: {},
    semantic: {
      eventSemanticKeys: ['k1', 'k2'],
      graphAnchors: [],
      materialLayerDecisions: [],
      ontologyRefs: [],
      ontologyBackfillNeeds: [],
      fixClassification: 'data-only',
    },
    knowledgeLayer: { contextRefs: [], claimRefs: [], assertionRefs: [], evidenceRefs: [] },
    ...overrides,
  } as FoundryReviewContext
}

describe('FoundryReviewDetail', () => {
  beforeEach(() => {
    vi.mocked(apiClient.getFoundryEventGraph).mockResolvedValue({
      success: true,
      events: [{ eventId: 'evt-1' }],
      labwares: [{ labwareId: 'sample_plate', labwareType: 'plate_96' }],
      deckPlacements: [],
    })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('renders all five spec-mandated regions', async () => {
    render(
      <MemoryRouter>
        <FoundryReviewDetail context={buildContext()} onChanged={() => {}} />
      </MemoryRouter>,
    )

    expect(screen.getByTestId('foundry-review-header')).toBeTruthy()
    expect(screen.getByTestId('foundry-review-inner-loop')).toBeTruthy()
    expect(screen.getByTestId('foundry-review-actions')).toBeTruthy()
    expect(screen.getByTestId('foundry-review-chat')).toBeTruthy()
    // graph region appears once event-graph fetch resolves
    await waitFor(() => {
      expect(screen.getByTestId('foundry-review-graph')).toBeTruthy()
    })
  })

  it('fetches event-graph data through the Foundry endpoint', async () => {
    render(
      <MemoryRouter>
        <FoundryReviewDetail context={buildContext()} onChanged={() => {}} />
      </MemoryRouter>,
    )
    await waitFor(() => {
      expect(apiClient.getFoundryEventGraph).toHaveBeenCalledWith('demo-protocol', 'manual_tubes')
    })
  })

  it('hydrates the chat pane with the existing transcript from human-review', async () => {
    render(
      <MemoryRouter>
        <FoundryReviewDetail context={buildContext()} onChanged={() => {}} />
      </MemoryRouter>,
    )
    await waitFor(() => {
      expect(screen.getByTestId('foundry-chat-msg-0').textContent).toContain('hi')
      expect(screen.getByTestId('foundry-chat-msg-1').textContent).toContain('hello')
    })
  })

  it('shows status and fix-classification chips in the header', () => {
    render(
      <MemoryRouter>
        <FoundryReviewDetail
          context={buildContext({ status: 'queued' })}
          onChanged={() => {}}
        />
      </MemoryRouter>,
    )
    const header = screen.getByTestId('foundry-review-header')
    expect(header.textContent).toContain('queued')
    expect(header.textContent).toContain('data-only')
  })
})
