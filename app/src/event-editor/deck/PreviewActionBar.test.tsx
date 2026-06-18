import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Labware } from '../../types/labware'
import type { PlateEvent } from '../../types/events'
import type { EventEditorPreview, EventEditorState } from '../EventEditorContext'
import { EMPTY_HISTORY } from '../editorHistory'
import { PreviewActionBar } from './PreviewActionBar'

const mocks = vi.hoisted(() => ({
  commitPreview: vi.fn(),
  clearPreview: vi.fn(),
  openFixIt: vi.fn(),
  persistAcceptedEventGraph: vi.fn(),
  materializeAcceptedOntologyBindings: vi.fn(),
  rewriteAcceptedOntologyRefs: vi.fn(),
  state: null as EventEditorState | null,
}))

vi.mock('../EventEditorContext', () => ({
  useEventEditor: () => ({
    state: mocks.state,
    actions: {
      commitPreview: mocks.commitPreview,
      clearPreview: mocks.clearPreview,
      openFixIt: mocks.openFixIt,
    },
  }),
}))

vi.mock('../../shared/shell', () => ({
  useViewport: () => ({ isMobile: false }),
}))

vi.mock('../eventGraphPersistence', () => ({
  persistAcceptedEventGraph: mocks.persistAcceptedEventGraph,
}))

vi.mock('./acceptedOntologyBindings', () => ({
  materializeAcceptedOntologyBindings: mocks.materializeAcceptedOntologyBindings,
  rewriteAcceptedOntologyRefs: mocks.rewriteAcceptedOntologyRefs,
}))

const acceptedEvent: PlateEvent = {
  eventId: 'evt-accepted',
  event_type: 'add_material',
  details: { labwareId: 'plate-1', wells: ['A1'] },
}

const previewEvent: PlateEvent = {
  eventId: 'evt-preview',
  event_type: 'add_material',
  details: { material_ref: { kind: 'ontology', id: 'CHEBI:5001', label: 'fenofibrate' } } as PlateEvent['details'],
}

const preview: EventEditorPreview = {
  previewLabwares: {
    'plate-1': { labwareId: 'plate-1', type: 'plate_96', name: 'Plate 1' } as unknown as Labware,
  },
  previewPlacements: [{
    placementId: 'pl-1',
    labwareId: 'plate-1',
    location: { kind: 'lawn', xMm: 10, yMm: 20 },
    orientation: 'portrait',
  }],
  previewEvents: [previewEvent],
  ontologyBindings: [{
    curie: 'CHEBI:5001',
    recordId: 'CHEBI:5001',
    label: 'fenofibrate',
    minted: false,
    via: 'class-ref',
    draftOnly: true,
  }],
}

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname}{location.search}</div>
}

function makeState(overrides: Partial<EventEditorState> = {}): EventEditorState {
  return {
    loadState: 'ready',
    loadError: null,
    platforms: [],
    platformId: 'manual',
    variantId: 'default',
    vocabPackId: 'liquid-handling/v1',
    toolTypeId: null,
    assistPipetteId: null,
    runId: null,
    eventGraphId: null,
    eventGraphSave: null,
    labwares: {},
    placements: [],
    focusPlacementId: null,
    selection: null,
    events: [],
    tipState: { kind: 'empty' },
    preview,
    graphLemurSource: null,
    runDeckLock: null,
    fixIt: {
      isOpen: false,
      seed: null,
      chat: [],
      streaming: false,
      stage: 'chatting',
      error: null,
      spec: null,
      applyStage: null,
      applyProgress: [],
      applyReasoning: '',
      applyResult: null,
      fixHistory: [],
      pendingRetryPrompt: null,
    },
    plateRail: {},
    history: EMPTY_HISTORY,
    ...overrides,
  }
}

function renderBar(initialEntry = '/event-editor') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="*" element={<><PreviewActionBar /><LocationProbe /></>} />
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.state = makeState()
  mocks.materializeAcceptedOntologyBindings.mockResolvedValue([{ curie: 'CHEBI:5001', recordId: 'MAT-CHEBI-5001', label: 'fenofibrate' }])
  mocks.rewriteAcceptedOntologyRefs.mockReturnValue([acceptedEvent])
  mocks.persistAcceptedEventGraph.mockResolvedValue({
    eventGraphId: 'EVG-001',
    commit: { sha: 'abc1234', message: 'Create EVG-001', timestamp: '2026-05-31T12:00:00Z' },
  })
})

describe('PreviewActionBar Accept persistence', () => {
  it('materializes draft bindings, saves the full graph, commits rewritten events, and replaces the URL', async () => {
    renderBar()

    fireEvent.click(screen.getByRole('button', { name: 'Accept' }))

    await waitFor(() => expect(mocks.commitPreview).toHaveBeenCalledWith([acceptedEvent], 'EVG-001', {
      sha: 'abc1234',
      message: 'Create EVG-001',
      timestamp: '2026-05-31T12:00:00Z',
    }))
    expect(mocks.materializeAcceptedOntologyBindings).toHaveBeenCalledWith(preview.ontologyBindings)
    expect(mocks.rewriteAcceptedOntologyRefs).toHaveBeenCalledWith([previewEvent], [{
      curie: 'CHEBI:5001',
      recordId: 'MAT-CHEBI-5001',
      label: 'fenofibrate',
    }])
    expect(mocks.persistAcceptedEventGraph).toHaveBeenCalledWith({
      eventGraphId: null,
      runId: null,
      events: [acceptedEvent],
      labwares: preview.previewLabwares,
      placements: preview.previewPlacements,
    })
    expect(screen.getByTestId('location').textContent).toBe('/event-editor/EVG-001')
  })

  it('uses the run-scoped resumable URL when a run is attached', async () => {
    mocks.state = makeState({ runId: 'RUN-001' })
    renderBar('/runs/RUN-001/event-editor')

    fireEvent.click(screen.getByRole('button', { name: 'Accept' }))

    await waitFor(() => expect(mocks.commitPreview).toHaveBeenCalledWith([acceptedEvent], 'EVG-001', {
      sha: 'abc1234',
      message: 'Create EVG-001',
      timestamp: '2026-05-31T12:00:00Z',
    }))
    expect(screen.getByTestId('location').textContent).toBe('/runs/RUN-001/event-editor?id=EVG-001')
  })

  it('does not start duplicate saves from rapid double-clicks', async () => {
    let resolveSave: (result: { eventGraphId: string }) => void = () => undefined
    mocks.persistAcceptedEventGraph.mockReturnValue(new Promise((resolve) => { resolveSave = resolve }))
    renderBar()

    const accept = screen.getByRole('button', { name: 'Accept' })
    fireEvent.click(accept)
    fireEvent.click(accept)

    await waitFor(() => expect(mocks.persistAcceptedEventGraph).toHaveBeenCalledTimes(1))
    resolveSave({ eventGraphId: 'EVG-001' })
    await waitFor(() => expect(mocks.commitPreview).toHaveBeenCalledTimes(1))
  })

  it('shows a readable error and does not commit when save fails', async () => {
    mocks.persistAcceptedEventGraph.mockRejectedValue(new Error('Event graph validation failed: /events/0/details: missing labwareId'))
    renderBar()

    fireEvent.click(screen.getByRole('button', { name: 'Accept' }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Accept failed')
    expect(alert.textContent).toContain('missing labwareId')
    expect(alert.getAttribute('title')).toBe('Event graph validation failed: /events/0/details: missing labwareId')
    expect(mocks.commitPreview).not.toHaveBeenCalled()
  })
})
