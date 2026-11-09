import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Labware } from '../../types/labware'
import type { PlateEvent } from '../../types/events'
import type { EventEditorPreview, EventEditorState } from '../EventEditorContext'
import { EMPTY_HISTORY } from '../editorHistory'
import { PreviewActionBar } from './PreviewActionBar'
import type { TermDecision } from './acceptedOntologyBindings'

const mocks = vi.hoisted(() => ({
  commitPreview: vi.fn(),
  clearPreview: vi.fn(),
  openFixIt: vi.fn(),
  persistAcceptedEventGraph: vi.fn(),
  materializeAcceptedOntologyBindings: vi.fn(),
  rewriteAcceptedOntologyRefs: vi.fn(),
  state: null as EventEditorState | null,
  // L2-CLARIFY-TARGET-1 D2: knob to control useOptionalAiPanel for chat-preview
  // visibility tests. Default null so ALL existing legs run unchanged.
  aiPanelMock: null as { chat: { hasPreview: boolean } | null } | null,
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

vi.mock('../../shared/context/AiPanelContext', () => ({
  useOptionalAiPanel: () => mocks.aiPanelMock,
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

const approvedDecisions: Record<string, TermDecision> = {
  'CHEBI:5001': { status: 'approved' },
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
    equipments: {},
    placements: [],
    focusPlacementId: null,
    selection: null,
    events: [],
    tipState: { kind: 'empty' },
    preview,
    graphLemurSource: null,
    runDeck: null,
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
  // The fixture has a draftOnly binding → Accept is gated until the user
  // signs off. Opening the modal and approving all satisfies the gate.
  function approveTerms() {
    fireEvent.click(screen.getByRole('button', { name: /view changes/i }))
    fireEvent.click(screen.getByTestId('term-approve-all'))
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
  }

  it('never lets an equipment ADD block the accept', async () => {
    // The add is materialized before the durable save. With no records API in the
    // jsdom environment the lookup fails — the accept must still complete (the
    // failure is a warning, not a veto), because the placement is the user's
    // primary intent and the missing record is reported.
    mocks.state = makeState({
      preview: {
        ...preview,
        recordCreations: [{ kind: 'equipment', name: 'Benchmark Incu-Mixer MP4', source: 'user-description' }],
      },
    } as never)
    renderBar()
    approveTerms()
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }))
    await waitFor(() => expect(mocks.commitPreview).toHaveBeenCalled())
  })

  it('materializes draft bindings, saves the full graph, commits rewritten events, and replaces the URL', async () => {
    renderBar()

    approveTerms()
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }))

    await waitFor(() => expect(mocks.commitPreview).toHaveBeenCalledWith([acceptedEvent], 'EVG-001', {
      sha: 'abc1234',
      message: 'Create EVG-001',
      timestamp: '2026-05-31T12:00:00Z',
    }))
    expect(mocks.materializeAcceptedOntologyBindings).toHaveBeenCalledWith(
      preview.ontologyBindings,
      undefined,
      approvedDecisions,
    )
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

    approveTerms()
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

    approveTerms()
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

    approveTerms()
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Accept failed')
    expect(alert.textContent).toContain('missing labwareId')
    expect(alert.getAttribute('title')).toBe('Event graph validation failed: /events/0/details: missing labwareId')
    expect(mocks.commitPreview).not.toHaveBeenCalled()
  })

  it('blocks Accept and opens the review modal until pending ontology terms are decided', async () => {
    renderBar()

    // Accept is hard-blocked until the term is signed off — clicking it opens
    // the review modal instead of persisting anything.
    fireEvent.click(screen.getByRole('button', { name: /review terms to accept/i }))
    expect(screen.getByTestId('term-review-section')).toBeTruthy()
    expect(mocks.persistAcceptedEventGraph).not.toHaveBeenCalled()

    // Sign off the term (approve), close, then Accept persists normally.
    fireEvent.click(screen.getByTestId('term-approve-all'))
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.getByRole('button', { name: 'Accept' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }))
    await waitFor(() => expect(mocks.persistAcceptedEventGraph).toHaveBeenCalled())
  })
})

describe('PreviewActionBar commit verb visibility (L2-CLARIFY-TARGET-1 D2)', () => {
  it('hides Accept and Discard when chat.hasPreview is true and no terms pending', () => {
    // With no unsigned terms (empty ontologyBindings), the chat surface is
    // the sole commit path, so the deck bar's Accept/Discard are hidden.
    mocks.aiPanelMock = { chat: { hasPreview: true } }
    mocks.state = makeState({
      preview: { ...preview, ontologyBindings: [] },
    } as never)
    renderBar()

    expect(screen.queryByRole('button', { name: /^Accept$/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Discard$/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'View changes' })).toBeTruthy()
  })

  it('keeps Accept visible when chat.hasPreview is true but ontology terms need sign-off (D2-fix2 binding fallback)', () => {
    // Ruling 24f95c54 fallback: when the chat has a preview AND there are
    // unsigned ontology terms, the deck bar MUST keep Accept because the
    // card's Apply hardcodes termDecisions: {} and would be permanently blocked.
    mocks.aiPanelMock = { chat: { hasPreview: true } }
    // The default fixture has a draftOnly binding with no user decisions,
    // so pendingDecisions.length > 0 → Accept AND Discard must be rendered.
    renderBar()

    expect(screen.queryByRole('button', { name: /review terms to accept/i })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Discard$/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'View changes' })).toBeTruthy()
  })

  it('shows Accept and Discard when chat.hasPreview is false', () => {
    mocks.aiPanelMock = { chat: { hasPreview: false } }
    renderBar()

    expect(screen.getByRole('button', { name: 'View changes' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^Discard$/ })).toBeTruthy()
    // Accept is shown as "Review terms to accept" (blocked until terms decided)
    expect(screen.getByRole('button', { name: /review terms to accept/i })).toBeTruthy()
  })

  it('shows Accept and Discard when aiPanel is null', () => {
    mocks.aiPanelMock = null
    renderBar()

    expect(screen.getByRole('button', { name: 'View changes' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^Discard$/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /review terms to accept/i })).toBeTruthy()
  })

  it('after sign-off with hasPreview, shows Accept and persists on click (D2-fix3 post-sign-off commit path)', async () => {
    // D2-fix3: after signing off all decisionNeeded terms, the bar must still
    // show Accept (chatCommitSurface must not hide it post-sign-off) and clicking
    // Accept must call persistAcceptedEventGraph exactly once.
    mocks.aiPanelMock = { chat: { hasPreview: true } }
    // Preview has 1 decisionNeeded term (draftOnly binding)
    renderBar()
    expect(preview.ontologyBindings!.filter((b) => b.draftOnly)).toHaveLength(1)

    // Open "View changes", sign off the term, close
    fireEvent.click(screen.getByRole('button', { name: /review terms to accept/i }))
    fireEvent.click(screen.getByTestId('term-approve-all'))
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    // Accept button must be present (not hidden by chatCommitSurface)
    expect(screen.getByRole('button', { name: 'Accept' })).toBeTruthy()

    // Clicking Accept must persist exactly once
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }))
    await waitFor(() => expect(mocks.persistAcceptedEventGraph).toHaveBeenCalledTimes(1))
  })
})
