/**
 * W2-8 A5 fix (C leg, component part) — the 422-held bundle folds into the
 * existing deck-review flow instead of dead-ending.
 *
 * Gate A5c proved: both answered compiles 422'd and the UI showed
 * "Localize failed: NEEDS_CLARIFICATION" with NO pl-deck-review — the held
 * {localMacro, terminalArtifacts} were discarded.
 *
 * Fix contract (spec §C): a 422 carrying error==='NEEDS_CLARIFICATION' WITH
 * localMacro && terminalArtifacts folds EXACTLY like the 2xx branch
 * (setLocalMacro + holdForReview) and lists the clarifications HONESTLY as
 * unresolved facts (messageKind 'info'). A macro-less 422 keeps the error path.
 *
 * HELD_RES mirrors the REAL wire shape captured at the gate (A5c trail step 18)
 * and pinned by the server's SPINE-4 OQ3(a) zero-artifact bar: the held 422
 * carries the parseable macro + clarifications, terminalArtifacts = {events:[]}.
 * The accept leg proceeds on the folded macro once the deck-review flow
 * completes (the harness's non-empty editor preview mirrors the post-ghost
 * state, same as the sibling tests in this folder).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { apiClient } from '../../../shared/api/client'
import { ProtocolLocalizationThread } from './ProtocolLocalizationThread'

vi.mock('../../../shared/api/client', () => ({
  apiClient: {
    intentCompileFromPrompt: vi.fn(),
    intentAccept: vi.fn(),
    intentTrainingPair: vi.fn(),
    getRecord: vi.fn(),
  },
}))

vi.mock('../../EventEditorContext', () => ({
  // Deck setup is a start-of-run decision; these suites never lock it.
  isDeckSetupLocked: () => false,
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

const FAMILY_AXES_RES = {
  needsAnswers: true,
  axes: [],
}

/** The discriminated held bundle the fixed client method returns on a 422 —
 *  the gate's EXACT captured shape (zero-artifact bar, OQ3(a); macro parseable,
 *  actions present; material-noun clarifications). */
const HELD_RES = {
  held: true,
  error: 'NEEDS_CLARIFICATION',
  outcome: 'needs-clarification',
  clarifications: [
    { label: 'sample (gate 2025)', reason: 'unknown-noun' },
    { label: 'Lysis Solution', reason: 'unknown-noun' },
  ],
  localMacro: {
    kind: 'scientist-intent',
    version: 1,
    intentId: 'lyse-run',
    actions: [{ action: 'lyse', target: 'sample' }],
    unresolved: [{ label: 'Lysis Solution', reason: 'unknown-noun' }],
  },
  terminalArtifacts: { events: [] },
}

const ACCEPT_RES = { ok: true, recordId: 'LPR-a5-held' }
const CORPUS_RES = { ok: true, entryId: 'CRM-1' }

describe('ProtocolLocalizationThread — held 422 folds into deck review (W2-8 A5)', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('answered 422 WITH held macro: deck review appears, clarifications surface honestly (info, not error)', async () => {
    mockClient.getRecord.mockResolvedValueOnce({
      payload: { branch_axes: [{ axisId: 'lysis-method', label: 'Which lysis method?', conditions: [{ id: 'bead-beater', label: 'Bead beater' }, { id: 'freeze-thaw', label: 'Freeze-thaw' }] }] },
    })
    mockClient.intentCompileFromPrompt
      .mockResolvedValueOnce(FAMILY_AXES_RES)
      .mockResolvedValueOnce(HELD_RES)

    render(<ProtocolLocalizationThread initialProtocolText="1. Lyse the sample (gate 2025)" sourceProtocolId="CAN-protocol-1791692042751" />)

    await waitFor(() => expect(screen.getByTestId('pl-clarify')).toBeTruthy())
    fireEvent.click(screen.getByLabelText('Bead beater'))
    fireEvent.click(screen.getByTestId('pl-submit-answers'))

    // The held macro folds into the SAME deck-review flow the 2xx branch uses.
    await waitFor(() => expect(screen.getByTestId('pl-deck-review')).toBeTruthy())
    expect(screen.getByTestId('pl-macro-view').textContent).toContain('1 actions')

    // The dead-end message is GONE; the clarifications are listed honestly.
    const msg = screen.getByTestId('pl-msg').textContent ?? ''
    expect(msg).not.toContain('Localize failed')
    expect(msg).not.toContain('NEEDS_CLARIFICATION')
    expect(msg).toContain('sample (gate 2025)')
    expect(msg).toContain('Lysis Solution')
    expect(msg).toContain('unknown-noun')
    // messageKind 'info': NOT the error-styled bubble.
    expect(screen.getByTestId('pl-msg').className).not.toContain('msg--error')

    // The zero-artifact bar is honest: the deck review says the deck starts empty.
    expect(screen.getByTestId('pl-deckreview-empty')).toBeTruthy()
  })

  it('folded held macro is held for the accept leg: intentAccept carries the macro + answers', async () => {
    mockClient.getRecord.mockResolvedValueOnce({ payload: { branch_axes: [] } })
    mockClient.intentCompileFromPrompt
      .mockResolvedValueOnce({ needsAnswers: true, axes: [{ axisId: 'lysis_variant', question: 'Which lysis variant?', choices: [{ value: 'variant_a', label: 'Lyse (variant a)' }] }] })
      .mockResolvedValueOnce(HELD_RES)
    mockClient.intentAccept.mockResolvedValueOnce(ACCEPT_RES)
    mockClient.intentTrainingPair.mockResolvedValueOnce(CORPUS_RES)

    render(<ProtocolLocalizationThread initialProtocolText="1. Lyse the sample" sourceProtocolId="CAN-protocol-1791692042751" />)
    await waitFor(() => expect(screen.getByTestId('pl-clarify')).toBeTruthy())
    fireEvent.click(screen.getByLabelText('Lyse (variant a)'))
    fireEvent.click(screen.getByTestId('pl-submit-answers'))

    // The folded macro is held (pl-macro-view) — the accept leg proceeds on it.
    await waitFor(() => expect(screen.getByTestId('pl-deck-review')).toBeTruthy())
    expect(screen.getByTestId('pl-macro-view').textContent).toContain('1 actions')
    expect(mockClient.intentAccept).not.toHaveBeenCalled()

    // Deck review completes (harness preview mirrors the post-ghost editor
    // state, same as the sibling tests) → Accept posts the FOLDED macro + answers.
    fireEvent.click(screen.getByTestId('pl-load-deck'))
    await waitFor(() => expect((screen.getByTestId('pl-accept') as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByTestId('pl-accept'))

    await waitFor(() => expect(mockClient.intentAccept).toHaveBeenCalledTimes(1))
    const acceptBody = mockClient.intentAccept.mock.calls[0]![0] as Record<string, unknown>
    expect(acceptBody.localMacro).toMatchObject({ intentId: 'lyse-run' })
    expect(acceptBody.answers).toMatchObject({ lysis_variant: 'variant_a' })
  })

  it('macro-less 422 keeps the error path (no deck review, error-styled message)', async () => {
    mockClient.getRecord.mockResolvedValueOnce({ payload: { branch_axes: [] } })
    mockClient.intentCompileFromPrompt
      .mockResolvedValueOnce({ needsAnswers: true, axes: [{ axisId: 'a', question: 'Q?', choices: [{ value: 'v', label: 'V' }] }] })
      .mockRejectedValueOnce(new Error('NEEDS_CLARIFICATION'))

    render(<ProtocolLocalizationThread initialProtocolText="text" sourceProtocolId="prt-x" />)
    await waitFor(() => expect(screen.getByTestId('pl-clarify')).toBeTruthy())
    fireEvent.click(screen.getByLabelText('V'))
    fireEvent.click(screen.getByTestId('pl-submit-answers'))

    await waitFor(() => expect(screen.getByTestId('pl-msg').textContent).toContain('Localize failed'))
    expect(screen.getByTestId('pl-msg').className).toContain('msg--error')
    expect(screen.queryByTestId('pl-deck-review')).toBeNull()
    expect((screen.getByTestId('pl-accept') as HTMLButtonElement).disabled).toBe(true)
  })
})
