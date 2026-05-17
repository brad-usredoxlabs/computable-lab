import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FoundryStatusPanel } from './FoundryStatusPanel'

const statusResponse = {
  success: true,
  status: {
    kind: 'protocol-foundry-operational-status',
    generated_at: '2026-05-10T10:00:00.000Z',
    artifactRoot: '/tmp/artifacts',
    protocolCount: 1,
    variantCount: 3,
    loop: {
      metadataPath: 'manifests/loop-runtime.yaml',
      running: true,
      status: 'running',
      pid: 4242,
      startedAt: '2026-05-10T09:50:00.000Z',
      updatedAt: '2026-05-10T10:00:00.000Z',
      logPath: '/tmp/foundry-loop-v5.log',
      command: 'protocolFoundryLoop.ts --artifact-root /tmp/artifacts',
    },
    counts: {
      collected: 1,
      extractedText: 1,
      compiled: 1,
      architectReviewed: 1,
      awaitingHumanReview: 1,
      reviewing: 0,
      queued: 1,
      patching: 0,
      implemented: 0,
      rejected: 0,
      failed: 1,
    },
    latestErrors: [{
      protocolId: 'demo-protocol',
      variant: 'manual_tubes',
      category: 'missing_wash',
      message: 'Wash event missing from graph',
      artifact: 'compiler/demo-protocol/manual_tubes.yaml',
    }],
    nextTasks: [{
      protocolId: 'demo-protocol',
      variant: 'manual_tubes',
      stage: 'coder_patch',
    }],
  },
  index: {
    kind: 'protocol-foundry-manifest-index',
    generated_at: '2026-05-10T10:00:00.000Z',
    artifactRoot: '/tmp/artifacts',
    protocolCount: 1,
    variantCount: 3,
    manifests: [{
      protocolId: 'demo-protocol',
      variant: 'manual_tubes',
      status: 'ready',
      path: 'manifests/demo-protocol/manual_tubes.yaml',
      missingArtifactCount: 0,
      humanReviewStatus: 'queued',
    }],
  },
}

describe('FoundryStatusPanel', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => statusResponse,
    })
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('renders Foundry operational status rollups', async () => {
    render(
      <MemoryRouter>
        <FoundryStatusPanel />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('foundry-status-panel')).toBeTruthy()
    })

    expect(screen.getByText('Foundry Status')).toBeTruthy()
    expect(screen.getByTestId('foundry-loop-runtime')).toBeTruthy()
    expect(screen.getByText('/tmp/foundry-loop-v5.log')).toBeTruthy()
    expect(screen.getAllByText('demo-protocol').length).toBeGreaterThan(0)
    expect(screen.getByText('coder_patch')).toBeTruthy()
    expect(screen.getByText('missing_wash')).toBeTruthy()
    expect(screen.getByText('Wash event missing from graph')).toBeTruthy()
  })
})
