/**
 * Phase 5 tests for the `/protocols` shell.
 *
 * Verifies: facet routing via `?view=`, the four-chip topbar, and that
 * each facet mounts its expected panel. We mock the lazy-loaded panels so
 * the assertion is on routing behaviour, not on the panel internals.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '../shared/shell'

vi.mock('../protocol-ide/ProtocolIdePage', () => ({
  ProtocolIdePage: () => <div data-testid="ide-panel">ide-panel</div>,
}))
vi.mock('../protocol-ide/FoundryStatusPanel', () => ({
  FoundryStatusPanel: () => <div data-testid="foundry-panel">foundry-panel</div>,
}))
vi.mock('../protocol-ide/FoundryAcquisitionJobsPanel', () => ({
  FoundryAcquisitionJobsPanel: () => <div data-testid="jobs-panel">jobs-panel</div>,
}))
vi.mock('./ProtocolCandidatesView', () => ({
  ProtocolCandidatesView: () => <div data-testid="candidates-panel">candidates-panel</div>,
}))

// The page mounts AiChatPanel which reaches into a portal and the chat
// client; we stub it to a passthrough so the routing assertion isn't
// blocked on AI infrastructure.
vi.mock('../shared/ai/AiChatPanel', () => ({
  AiChatPanel: () => null,
}))

// Stub useAiChat to avoid network calls.
vi.mock('../shared/hooks/useAiChat', () => ({
  useAiChat: () => ({
    messages: [],
    isStreaming: false,
    isAccepting: false,
    previewEvents: [],
    previewLabwareAdditions: [],
    previewEventStates: new Map(),
    executingApplianceJobIds: new Set(),
    hasPreview: false,
    unresolvedRefs: [],
    inputText: '',
    sendPrompt: () => {},
    cancelStream: () => {},
    acceptPreview: () => {},
    acceptPreviewWithResolutions: () => {},
    rejectPreview: () => {},
    setPreviewEventState: () => {},
    setPreviewEvents: () => {},
    commitAcceptedPreviewEvents: async () => {},
    clearHistory: () => {},
    applyToGraph: () => {},
    executeInstrumentApplianceJob: async () => {},
    aiAvailable: null,
    recheckHealth: () => {},
    thinkingMode: false,
    setThinkingMode: () => {},
  }),
}))

import { ProtocolsPage } from './ProtocolsPage'

afterEach(() => {
  cleanup()
})

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <ThemeProvider>
        <ProtocolsPage />
      </ThemeProvider>
    </MemoryRouter>,
  )
}

describe('ProtocolsPage', () => {
  it('defaults to the IDE facet when no ?view is present', async () => {
    renderAt('/protocols')
    await waitFor(() => expect(screen.getByTestId('ide-panel')).toBeTruthy())
    expect(screen.queryByTestId('foundry-panel')).toBeNull()
  })

  it('mounts the foundry panel for ?view=foundry', async () => {
    renderAt('/protocols?view=foundry')
    await waitFor(() => expect(screen.getByTestId('foundry-panel')).toBeTruthy())
  })

  it('mounts the jobs panel for ?view=jobs', async () => {
    renderAt('/protocols?view=jobs')
    await waitFor(() => expect(screen.getByTestId('jobs-panel')).toBeTruthy())
  })

  it('mounts the candidates view for ?view=candidates', async () => {
    renderAt('/protocols?view=candidates')
    await waitFor(() => expect(screen.getByTestId('candidates-panel')).toBeTruthy())
  })

  it('switches facets when a chip is clicked', async () => {
    renderAt('/protocols')
    await waitFor(() => expect(screen.getByTestId('ide-panel')).toBeTruthy())
    fireEvent.click(screen.getByRole('tab', { name: 'Foundry' }))
    await waitFor(() => expect(screen.getByTestId('foundry-panel')).toBeTruthy())
    expect(screen.queryByTestId('ide-panel')).toBeNull()
  })

  it('falls back to ide when ?view= value is unknown', async () => {
    renderAt('/protocols?view=garbage')
    await waitFor(() => expect(screen.getByTestId('ide-panel')).toBeTruthy())
  })

  it('marks the active facet chip with aria-selected=true', async () => {
    renderAt('/protocols?view=jobs')
    await waitFor(() => expect(screen.getByTestId('jobs-panel')).toBeTruthy())
    const jobsChip = screen.getByRole('tab', { name: 'Jobs' })
    expect(jobsChip.getAttribute('aria-selected')).toBe('true')
    const ideChip = screen.getByRole('tab', { name: 'Authoring' })
    expect(ideChip.getAttribute('aria-selected')).toBe('false')
  })
})
