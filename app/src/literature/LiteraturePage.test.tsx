/**
 * Phase 6 tests for the `/literature` shell.
 *
 * Verifies facet routing via `?view=`, chip selection, and that each facet
 * mounts its expected panel. Mirrors the Phase 5 ProtocolsPage tests.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '../shared/shell'

vi.mock('../knowledge/LiteratureExplorer', () => ({
  LiteratureExplorer: () => <div data-testid="explore-panel">explore-panel</div>,
}))
vi.mock('../ingestion/IngestionPage', () => ({
  IngestionPage: () => <div data-testid="ingest-panel">ingest-panel</div>,
}))
vi.mock('../extraction/ExtractionDraftsListPage', () => ({
  ExtractionDraftsListPage: () => <div data-testid="drafts-panel">drafts-panel</div>,
}))
vi.mock('../extraction/ExtractionReviewPage', () => ({
  ExtractionReviewPage: () => <div data-testid="review-panel">review-panel</div>,
}))
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

import { LiteraturePage } from './LiteraturePage'

afterEach(() => {
  cleanup()
})

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <ThemeProvider>
        <LiteraturePage />
      </ThemeProvider>
    </MemoryRouter>,
  )
}

describe('LiteraturePage', () => {
  it('defaults to the Explore facet when no ?view is present', async () => {
    renderAt('/literature')
    await waitFor(() => expect(screen.getByTestId('explore-panel')).toBeTruthy())
    expect(screen.queryByTestId('ingest-panel')).toBeNull()
  })

  it('mounts the ingest panel for ?view=ingest', async () => {
    renderAt('/literature?view=ingest')
    await waitFor(() => expect(screen.getByTestId('ingest-panel')).toBeTruthy())
  })

  it('mounts the drafts panel for ?view=drafts', async () => {
    renderAt('/literature?view=drafts')
    await waitFor(() => expect(screen.getByTestId('drafts-panel')).toBeTruthy())
  })

  it('mounts the review panel for ?view=review&recordId=…', async () => {
    renderAt('/literature?view=review&recordId=DRA-1')
    await waitFor(() => expect(screen.getByTestId('review-panel')).toBeTruthy())
  })

  it('switches facets when a chip is clicked', async () => {
    renderAt('/literature')
    await waitFor(() => expect(screen.getByTestId('explore-panel')).toBeTruthy())
    fireEvent.click(screen.getByRole('tab', { name: 'Drafts' }))
    await waitFor(() => expect(screen.getByTestId('drafts-panel')).toBeTruthy())
    expect(screen.queryByTestId('explore-panel')).toBeNull()
  })

  it('falls back to explore when ?view= is unknown', async () => {
    renderAt('/literature?view=garbage')
    await waitFor(() => expect(screen.getByTestId('explore-panel')).toBeTruthy())
  })

  it('marks the active facet chip with aria-selected=true', async () => {
    renderAt('/literature?view=drafts')
    await waitFor(() => expect(screen.getByTestId('drafts-panel')).toBeTruthy())
    expect(screen.getByRole('tab', { name: 'Drafts' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tab', { name: 'Explore' }).getAttribute('aria-selected')).toBe('false')
  })
})
