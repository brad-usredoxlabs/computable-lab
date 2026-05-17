/**
 * FoundryReviewInnerLoopStrip — verifies prompt submission cycles through SSE
 * stages, the diff renders with click-to-highlight, and the no-critic banner
 * is shown by default.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import type { FoundryInnerLoopEvent, FoundryInnerLoopTrace } from '../shared/api/client'

vi.mock('../shared/api/client', () => ({
  apiClient: {
    streamFoundryInnerLoop: vi.fn(),
    promoteFoundryDraftSpec: vi.fn(),
  },
}))

import { apiClient } from '../shared/api/client'
import { FoundryReviewInnerLoopStrip } from './FoundryReviewInnerLoopStrip'

async function* yieldEvents(events: FoundryInnerLoopEvent[]): AsyncGenerator<FoundryInnerLoopEvent> {
  for (const e of events) yield e
}

function makeTrace(overrides?: Partial<FoundryInnerLoopTrace>): FoundryInnerLoopTrace {
  return {
    kind: 'protocol-foundry-review-inner-loop-trace',
    id: 'TRC-demo-manual_tubes-abc',
    protocolId: 'demo',
    variant: 'manual_tubes',
    generatedAt: '2026-05-15T00:00:00Z',
    prompt: 'add wash',
    draftSpec: {
      id: 'foundry-draft-demo-manual_tubes-abc',
      draftPath: '/tmp/draft.yaml',
      title: 'Add wash mapping',
      fixClass: 'material_catalog_or_spec_gap',
    },
    coder: { status: 'applied', touchedFiles: ['records/wash.yaml'] },
    recompile: { outcome: 'complete', eventCount: 2 },
    diff: {
      added: [{ key: 'sk:EVT-wash-1', semanticKey: 'EVT-wash-1', eventType: 'wash' }],
      removed: [],
      changed: [{ key: 'sk:EVT-add-pbs-1', semanticKey: 'EVT-add-pbs-1', eventType: 'add_material' }],
    },
    status: 'completed',
    ...overrides,
  } as FoundryInnerLoopTrace
}

describe('FoundryReviewInnerLoopStrip', () => {
  beforeEach(() => {
    vi.mocked(apiClient.streamFoundryInnerLoop).mockReset()
    vi.mocked(apiClient.promoteFoundryDraftSpec).mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it('shows the no-critic banner by default and dismisses it when the toggle is enabled', () => {
    render(<FoundryReviewInnerLoopStrip protocolId="demo" variant="manual_tubes" />)
    expect(screen.getByTestId('foundry-inner-loop-no-critic')).toBeTruthy()
    fireEvent.click(screen.getByTestId('foundry-inner-loop-critic-toggle'))
    expect(screen.queryByTestId('foundry-inner-loop-no-critic')).toBeNull()
  })

  it('streams stages and renders the diff with added/removed/changed columns', async () => {
    const trace = makeTrace()
    vi.mocked(apiClient.streamFoundryInnerLoop).mockImplementation(() =>
      yieldEvents([
        { type: 'status', stage: 'snapshotting' },
        { type: 'status', stage: 'synthesizing' },
        { type: 'status', stage: 'applying' },
        { type: 'status', stage: 'recompiling' },
        { type: 'status', stage: 'diffing' },
        { type: 'done', trace, tracePath: '/tmp/trace.yaml' },
      ]),
    )
    const onTraceCompleted = vi.fn()
    render(
      <FoundryReviewInnerLoopStrip
        protocolId="demo"
        variant="manual_tubes"
        onTraceCompleted={onTraceCompleted}
      />,
    )

    fireEvent.change(screen.getByTestId('foundry-inner-loop-prompt'), {
      target: { value: 'add wash' },
    })
    fireEvent.click(screen.getByTestId('foundry-inner-loop-run'))

    await waitFor(() => {
      expect(onTraceCompleted).toHaveBeenCalledWith(trace)
    })
    expect(screen.getByTestId('foundry-inner-loop-diff')).toBeTruthy()
    expect(screen.getByTestId('foundry-inner-loop-diff-added-sk:EVT-wash-1')).toBeTruthy()
    expect(screen.getByTestId('foundry-inner-loop-diff-changed-sk:EVT-add-pbs-1')).toBeTruthy()
  })

  it('fires the highlight callback when a diff row is clicked', async () => {
    vi.mocked(apiClient.streamFoundryInnerLoop).mockImplementation(() =>
      yieldEvents([{ type: 'done', trace: makeTrace(), tracePath: '/tmp/trace.yaml' }]),
    )
    const onHighlight = vi.fn()
    render(
      <FoundryReviewInnerLoopStrip
        protocolId="demo"
        variant="manual_tubes"
        onHighlightEvent={onHighlight}
      />,
    )
    fireEvent.change(screen.getByTestId('foundry-inner-loop-prompt'), {
      target: { value: 'add wash' },
    })
    fireEvent.click(screen.getByTestId('foundry-inner-loop-run'))
    await waitFor(() => {
      expect(screen.getByTestId('foundry-inner-loop-diff')).toBeTruthy()
    })
    const row = screen.getByTestId('foundry-inner-loop-diff-added-sk:EVT-wash-1')
    fireEvent.click(row.querySelector('button')!)
    expect(onHighlight).toHaveBeenCalledWith('sk:EVT-wash-1')
  })

  it('calls promoteFoundryDraftSpec when the promote button is clicked', async () => {
    const trace = makeTrace()
    vi.mocked(apiClient.streamFoundryInnerLoop).mockImplementation(() =>
      yieldEvents([{ type: 'done', trace, tracePath: '/tmp/trace.yaml' }]),
    )
    vi.mocked(apiClient.promoteFoundryDraftSpec).mockResolvedValue({
      success: true,
      status: 'queued',
      queuePath: '/tmp/queue.yaml',
      patchSpecPath: '/tmp/patch.yaml',
      adoptionPath: '/tmp/adoption.yaml',
      reviewPath: '/tmp/review.yaml',
    })
    const onPromoted = vi.fn()
    render(
      <FoundryReviewInnerLoopStrip
        protocolId="demo"
        variant="manual_tubes"
        onPromoted={onPromoted}
      />,
    )
    fireEvent.change(screen.getByTestId('foundry-inner-loop-prompt'), {
      target: { value: 'add wash' },
    })
    fireEvent.click(screen.getByTestId('foundry-inner-loop-run'))
    await waitFor(() => {
      expect(screen.getByTestId('foundry-inner-loop-promote')).toBeTruthy()
    })
    fireEvent.click(screen.getByTestId('foundry-inner-loop-promote'))
    await waitFor(() => {
      expect(apiClient.promoteFoundryDraftSpec).toHaveBeenCalledWith(
        'demo',
        'manual_tubes',
        trace.draftSpec.id,
      )
      expect(onPromoted).toHaveBeenCalled()
    })
  })
})
