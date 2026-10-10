/**
 * W2-8 T4 — the realization entry asks the FAMILY's questions (spec §3 W4, §5 A5).
 *
 * Questions moved from extraction review to the point of localization. The
 * thread already asks the AI-emitted axes; W4 adds the protocol record's OWN
 * branch_axes[] (the family's questions, verbatim ids — bait 4), deduped by
 * axisId against the AI axes, with answers flowing into the existing `answers`
 * state so POST /intent/accept records them as branch_resolution (server
 * unchanged).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { apiClient } from '../../../shared/api/client'
import {
  ProtocolLocalizationThread,
  protocolBranchAxesToQuestionAxes,
} from './ProtocolLocalizationThread'

vi.mock('../../../shared/api/client', () => ({
  apiClient: {
    intentCompileFromPrompt: vi.fn(),
    intentAccept: vi.fn(),
    intentTrainingPair: vi.fn(),
    getRecord: vi.fn(),
  },
}))

vi.mock('../../EventEditorContext', () => ({
  useOptionalEventEditor: () => ({
    state: {
      platforms: [{ id: 'integra_assist', label: 'Integra Assist', variants: [{ id: 'default', title: 'Default', slots: [{ id: 'B2', kind: 'standard' }] }] }],
      platformId: 'integra_assist',
      variantId: 'default',
      runId: 'RUN-1',
      runDeckLock: null,
      labwares: {},
      placements: [],
      events: [],
      preview: { previewPlacements: [], previewEvents: [{}], previewLabwares: {} },
    },
    actions: { setPreview: vi.fn(), commitPreview: vi.fn(), clearPreview: vi.fn(), setPlatform: vi.fn() },
  }),
}))

const mockClient = apiClient as unknown as {
  intentCompileFromPrompt: ReturnType<typeof vi.fn>
  intentAccept: ReturnType<typeof vi.fn>
  intentTrainingPair: ReturnType<typeof vi.fn>
  getRecord: ReturnType<typeof vi.fn>
}

const COMPILED_RES = {
  outcome: 'complete',
  terminalArtifacts: {
    events: [{ eventId: 'e1', event_type: 'transfer', details: {} }],
    labwareAdditions: [{ recordId: 'lbw-def-plate', reason: 'plate', deckSlot: 'B2' }],
  },
  localMacro: { intentId: 'zymo-local', actions: [{ action: 'transfer' }] },
}

const AI_AXIS_RES = {
  needsAnswers: true,
  axes: [
    { axisId: 'sample_type', question: 'What sample?', choices: [{ value: 'bacterial', label: 'Bacteria' }, { value: 'mammalian', label: 'Mammalian' }] },
  ],
}

const FAMILY_PROTOCOL = {
  recordId: 'PRT-zymo',
  schemaId: 'protocol',
  payload: {
    kind: 'protocol',
    recordId: 'PRT-zymo',
    title: 'ZymoBIOMICS',
    steps: [{ stepId: 'step-lyse', label: 'Lyse', ordinal: 1, kind: 'other' }],
    branch_axes: [
      {
        axisId: 'lysis-method',
        label: 'Which lysis method?',
        conditions: [
          { id: 'bead-beater', label: 'Bead beater', predicate: {}, then_stepIds: ['step-lyse'] },
          { id: 'freeze-thaw', label: 'Freeze-thaw', predicate: {}, then_stepIds: ['step-lyse'] },
        ],
      },
      {
        // Same axisId the AI pass emits: the family copy must not duplicate it.
        axisId: 'sample_type',
        label: 'Which sample type? (family)',
        conditions: [
          { id: 'bacterial', label: 'Bacterial', predicate: {}, then_stepIds: ['step-lyse'] },
        ],
      },
    ],
  },
  meta: { kind: 'protocol' },
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('protocolBranchAxesToQuestionAxes (the pure adapter)', () => {
  it('maps a protocol branch_axis to an answerable axis: label -> question, condition id/label -> choices', () => {
    const axes = protocolBranchAxesToQuestionAxes(FAMILY_PROTOCOL.payload.branch_axes)
    expect(axes).toHaveLength(2)
    expect(axes[0]!.axisId).toBe('lysis-method')
    expect(axes[0]!.question).toBe('Which lysis method?')
    expect(axes[0]!.choices).toEqual([
      { value: 'bead-beater', label: 'Bead beater' },
      { value: 'freeze-thaw', label: 'Freeze-thaw' },
    ])
  })

  it('skips an axis with no answerable conditions instead of inventing one', () => {
    expect(protocolBranchAxesToQuestionAxes([{ axisId: 'empty', label: 'Empty', conditions: [] }])).toHaveLength(0)
  })

  it('tolerates a missing/foreign branch_axes value', () => {
    expect(protocolBranchAxesToQuestionAxes(undefined)).toEqual([])
    expect(protocolBranchAxesToQuestionAxes('nope')).toEqual([])
  })
})

describe('ProtocolLocalizationThread — the family questions at the realization entry (A5)', () => {
  it('loads the source protocol record and renders its branch_axes as answerable questions', async () => {
    mockClient.getRecord.mockResolvedValue(FAMILY_PROTOCOL)
    mockClient.intentCompileFromPrompt.mockResolvedValueOnce(COMPILED_RES)

    render(<ProtocolLocalizationThread initialProtocolText="zymo text" sourceProtocolId="PRT-zymo" sourceTitle="ZymoBIOMICS" />)

    await waitFor(() => expect(mockClient.getRecord).toHaveBeenCalledWith('PRT-zymo'))
    await waitFor(() => expect(screen.getByTestId('pl-clarify')).toBeTruthy())
    expect(screen.getByText('Which lysis method?')).toBeTruthy()
    // The family's condition labels are the choices (verbatim ids on the inputs).
    expect(screen.getByLabelText('Bead beater')).toBeTruthy()
    expect(screen.getByLabelText('Freeze-thaw')).toBeTruthy()
  })

  it('dedupes by axisId when the AI pass emits the SAME axis (no duplicate question, bait 9)', async () => {
    mockClient.getRecord.mockResolvedValue(FAMILY_PROTOCOL)
    mockClient.intentCompileFromPrompt.mockResolvedValueOnce(AI_AXIS_RES)

    render(<ProtocolLocalizationThread initialProtocolText="zymo text" sourceProtocolId="PRT-zymo" />)

    await waitFor(() => expect(screen.getByTestId('pl-clarify')).toBeTruthy())
    // One axis container per axisId: lysis-method + sample_type, never a third.
    const axisContainers = document.querySelectorAll('.pl-axis')
    expect(axisContainers.length).toBe(2)
    // 'sample type' is asked once, not twice.
    expect(screen.getAllByText(/sample type\?/i).length).toBe(1)
    // The family's declared axis won the dedupe (its own condition label is the choice).
    expect(screen.getByLabelText('Bacterial')).toBeTruthy()
  })

  it('family answers flow into the accept body so POST /intent/accept records branch_resolution (A5)', async () => {
    mockClient.getRecord.mockResolvedValue(FAMILY_PROTOCOL)
    // call 1 = the mount auto-localize; call 2 = the answers submit.
    mockClient.intentCompileFromPrompt
      .mockResolvedValueOnce({ needsAnswers: true, axes: [] })
      .mockResolvedValueOnce(COMPILED_RES)
    mockClient.intentAccept.mockResolvedValueOnce({ ok: true, recordId: 'LPR-zymo-x' })
    mockClient.intentTrainingPair.mockResolvedValueOnce({ ok: true, entryId: 'CRM-1' })

    render(<ProtocolLocalizationThread initialProtocolText="zymo text" sourceProtocolId="PRT-zymo" sourceTitle="ZymoBIOMICS" />)

    await waitFor(() => expect(screen.getByTestId('pl-clarify')).toBeTruthy())
    // Every rendered axis must be answered before the thread re-compiles.
    fireEvent.click(screen.getByLabelText('Bead beater'))
    fireEvent.click(screen.getByLabelText('Bacterial'))
    fireEvent.click(screen.getByTestId('pl-submit-answers'))
    await waitFor(() => expect(mockClient.intentCompileFromPrompt).toHaveBeenCalledTimes(2))
    expect(mockClient.intentCompileFromPrompt.mock.calls[1]![0]).toMatchObject({
      answers: { 'lysis-method': 'bead-beater', sample_type: 'bacterial' },
    })
    await waitFor(() => expect(screen.getByTestId('pl-deck-review')).toBeTruthy())

    fireEvent.click(screen.getByTestId('pl-load-deck'))
    await waitFor(() => expect(screen.getByTestId('pl-accept')).toBeTruthy())
    fireEvent.click(screen.getByTestId('pl-accept'))
    await waitFor(() => expect(mockClient.intentAccept).toHaveBeenCalled())
    const body = mockClient.intentAccept.mock.calls[0]![0] as Record<string, unknown>
    expect(body.answers).toMatchObject({ 'lysis-method': 'bead-beater', sample_type: 'bacterial' })
    expect(body.sourceProtocolId).toBe('PRT-zymo')
  })

  it('a protocol with no branch_axes asks nothing extra (no invented question)', async () => {
    mockClient.getRecord.mockResolvedValue({ ...FAMILY_PROTOCOL, payload: { kind: 'protocol', recordId: 'PRT-zymo', title: 't', steps: [] } })
    mockClient.intentCompileFromPrompt.mockResolvedValueOnce(COMPILED_RES)
    render(<ProtocolLocalizationThread initialProtocolText="zymo text" sourceProtocolId="PRT-zymo" />)
    await waitFor(() => expect(mockClient.getRecord).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByTestId('pl-deck-review')).toBeTruthy())
    expect(screen.queryByTestId('pl-clarify')).toBeNull()
  })
})
