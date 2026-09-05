import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { ProtocolLocalizationThread } from './ProtocolLocalizationThread'
import { apiClient } from '../../../shared/api/client'

vi.mock('../../../shared/api/client', () => ({
  apiClient: {
    intentCompileFromPrompt: vi.fn(),
    intentAccept: vi.fn(),
    intentTrainingPair: vi.fn(),
  },
}))

const mockClient = apiClient as unknown as {
  intentCompileFromPrompt: ReturnType<typeof vi.fn>
  intentAccept: ReturnType<typeof vi.fn>
  intentTrainingPair: ReturnType<typeof vi.fn>
}

const BRANCH_RES = {
  needsAnswers: true,
  axes: [{
    axisId: 'sample_type',
    question: 'What sample?',
    choices: [{ value: 'bacterial', label: 'Bacteria' }, { value: 'mammalian', label: 'Mammalian' }],
  }],
}

const COMPILED_RES = {
  outcome: 'complete',
  terminalArtifacts: {
    events: [
      { eventId: 'e1', event_type: 'transfer', details: {} },
      { eventId: 'e2', event_type: 'mix', details: {} },
    ],
    // The one-shot now surfaces the deck labware so the Review-deck gate has
    // something to place before it ghosts events.
    labwareAdditions: [
      { recordId: 'lbw-def-generic-96-well-plate', reason: 'primary sample plate', deckSlot: 'B2' },
      { recordId: 'lbw-def-tube-block', reason: 'elution rack', deckSlot: 'B5' },
    ],
  },
  localMacro: {
    intentId: 'zymo-local',
    actions: [{ action: 'transfer', source: 'block', target: 'magstand', volumeUl: 200 }],
  },
}

const ACCEPT_RES = { ok: true, recordId: 'LPR-zymo-x' }
const CORPUS_RES = { ok: true, entryId: 'CRM-1' }

// Minimal EventEditorContext mock so the thread's editor lookups are safe.
vi.mock('../../EventEditorContext', () => ({
  useOptionalEventEditor: () => ({
    state: {
      platforms: [{ id: 'integra_assist', label: 'Integra Assist', variants: [{ id: 'default', title: 'Default', slots: [{ id: 'B2', kind: 'standard' }, { id: 'B5', kind: 'standard' }] }] }],
      platformId: 'integra_assist',
      variantId: 'default',
      runId: 'RUN-1',
      runDeckLock: null,
      labwares: {},
      placements: [],
      events: [],
      // Non-empty preview → hasPreview=true → Accept enabled (mirrors ghosting).
      preview: { previewPlacements: [], previewEvents: [{}], previewLabwares: {} },
    },
    actions: {
      setPreview: vi.fn(),
      commitPreview: vi.fn(),
      clearPreview: vi.fn(),
      setPlatform: vi.fn(),
    },
  }),
}))

describe('ProtocolLocalizationThread', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('auto-runs branch questions on mount when a source universal protocol is provided (Point 3)', async () => {
    mockClient.intentCompileFromPrompt
      .mockResolvedValueOnce(BRANCH_RES)

    render(<ProtocolLocalizationThread initialProtocolText="zymo text" sourceProtocolId="prt-zymo" />)

    await waitFor(() => expect(screen.getByTestId('pl-clarify')).toBeTruthy())
    expect(screen.getByText('What sample?')).toBeTruthy()
    expect(mockClient.intentCompileFromPrompt).toHaveBeenCalledWith(
      expect.objectContaining({ protocolText: 'zymo text', sourceProtocolId: 'prt-zymo' }),
    )
  })

  it('gates event ghosting behind the Review-deck step: branch Q&A → review deck → confirm loads deck, THEN events ghost', async () => {
    mockClient.intentCompileFromPrompt
      .mockResolvedValueOnce(BRANCH_RES)
      .mockResolvedValueOnce(COMPILED_RES)

    render(<ProtocolLocalizationThread initialProtocolText="zymo text" sourceProtocolId="prt-zymo" />)

    await waitFor(() => expect(screen.getByTestId('pl-clarify')).toBeTruthy())

    // choose Bacterial, submit answers → compiled result
    fireEvent.click(screen.getByLabelText('Bacteria'))
    fireEvent.click(screen.getByTestId('pl-submit-answers'))

    // The Review-deck step appears BEFORE any ghosting — and the macro is held.
    await waitFor(() => expect(screen.getByTestId('pl-deck-review')).toBeTruthy())
    expect(screen.getByTestId('pl-macro-view').textContent).toContain('1 actions')

    // The suggested labware is present and pre-checked.
    const plateCheckbox = screen.getByTestId('deck-labware-lbw-def-generic-96-well-plate') as HTMLInputElement
    expect(plateCheckbox.checked).toBe(true)

    // Confirm the deck → the draft is ghosted (preview events populate).
    fireEvent.click(screen.getByTestId('pl-load-deck'))
    await waitFor(() => expect(screen.getByTestId('pl-msg').textContent).toContain('events ghosted'))
    expect(screen.queryByTestId('pl-deck-review')).toBeNull()
  })

  it('accept posts the macro-focused training pair and saves local-protocol', async () => {
    mockClient.intentCompileFromPrompt.mockResolvedValueOnce(COMPILED_RES)
    mockClient.intentAccept.mockResolvedValueOnce(ACCEPT_RES)
    mockClient.intentTrainingPair.mockResolvedValueOnce(CORPUS_RES)

    render(<ProtocolLocalizationThread initialProtocolText="zymo text" sourceProtocolId="prt-zymo" />)
    // auto-run compiles immediately → Review-deck gate
    await waitFor(() => expect(screen.getByTestId('pl-deck-review')).toBeTruthy())
    // confirm deck → ghost
    fireEvent.click(screen.getByTestId('pl-load-deck'))
    await waitFor(() => expect(screen.getByTestId('pl-refine')).toBeTruthy())

    fireEvent.click(screen.getByTestId('pl-accept'))

    await waitFor(() => expect(screen.getByTestId('pl-msg').textContent).toContain('Accepted'))
    expect(mockClient.intentAccept).toHaveBeenCalledWith(
      expect.objectContaining({ sourceProtocolId: 'prt-zymo', localMacro: expect.objectContaining({ intentId: 'zymo-local' }) }),
    )
    expect(mockClient.intentTrainingPair).toHaveBeenCalledWith(
      expect.objectContaining({
        acceptedProtocolId: 'LPR-zymo-x',
        localMacro: expect.objectContaining({ intentId: 'zymo-local' }),
      }),
    )
    const tpCall = mockClient.intentTrainingPair.mock.calls[0]![0] as Record<string, unknown>
    expect(tpCall.localMacro).toMatchObject({ intentId: 'zymo-local' })
  })
})

