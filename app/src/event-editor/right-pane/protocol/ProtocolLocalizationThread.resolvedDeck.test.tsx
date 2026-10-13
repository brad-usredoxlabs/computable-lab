/**
 * DECK-FOLD-1 (C4, RED-first) — the Review-deck gate surfaces resolved
 * inventory as placement offers of the EXISTING records.
 *
 * A fully-resolved macro (resolvedLabwares only — no additions, no
 * requirements) must render >=1 `deck-labware-<recordId>` checkbox (NOT
 * `pl-deckreview-empty`), the row label is the record's REAL title, and
 * picking one + `pl-load-deck` ghosts a placement whose labwareId === the
 * existing recordId with NO proposedRecord — opening the Brad-pinned accept
 * gate (>=1 placement) on the chat path.
 *
 * Zero-match pin: the additions fixtures keep their EXACT current testids and
 * behavior byte-stable (the sibling ProtocolLocalizationThread.test.tsx legs
 * cover the additions path; the dedup leg pins ONE checkbox per recordId with
 * the addition kind winning).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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

// A capture of the ghost the thread builds, so the test can assert the REAL
// placement identity instead of trusting the UI alone. The mock mirrors the
// real context: setPreview lands in editor state, so the accept gate opens on
// the ghosted placement (not on a pre-seeded preview).
const editorHarness = vi.hoisted(() => ({
  preview: null as Record<string, unknown> | null,
}))

vi.mock('../../EventEditorContext', () => ({
  useOptionalEventEditor: () => ({
    state: {
      platforms: [{ id: 'integra_assist', label: 'Integra Assist', variants: [{ id: 'default', title: 'Default', slots: [{ id: 'B2', kind: 'standard' }, { id: 'B5', kind: 'standard' }], surface: { kind: 'lawn', widthMm: 400, heightMm: 300 } }] }],
      platformId: 'integra_assist',
      variantId: 'default',
      runId: 'RUN-1',
      runDeckLock: null,
      labwares: {},
      placements: [],
      events: [],
      // No preview until the ghost lands: the accept gate must OPEN on the
      // resolved placement, not ride a pre-seeded preview.
      preview: editorHarness.preview,
    },
    actions: {
      setPreview: (preview: Record<string, unknown>) => { editorHarness.preview = preview },
      commitPreview: vi.fn(),
      clearPreview: vi.fn(),
      setPlatform: vi.fn(),
    },
  }),
}))

/** Fully-resolved compile: the hints bound against REAL inventory, nothing to
 *  author. Mirrors the server's post-fold terminalArtifacts shape. */
const RESOLVED_RES = {
  outcome: 'complete',
  terminalArtifacts: {
    events: [
      { eventId: 'e1', event_type: 'transfer', details: {} },
    ],
    resolvedLabwares: [
      { hint: 'hint plate', recordId: 'LAB-hint-plate', title: 'hint plate' },
      { hint: 'fresh plate', recordId: 'LAB-fresh-plate', title: 'Fresh 96-well plate' },
    ],
  },
  localMacro: {
    intentId: 'resolved-local',
    actions: [{ action: 'transfer', source: 'hint plate', target: 'fresh plate', volumeUl: 25 }],
  },
}

const ACCEPT_RES = { ok: true, recordId: 'LPR-resolved' }
const CORPUS_RES = { ok: true, entryId: 'CRM-1' }

describe('ProtocolLocalizationThread — resolved inventory as placement offers (DECK-FOLD-1)', () => {
  afterEach(() => {
    vi.clearAllMocks()
    editorHarness.preview = null
  })

  it('resolved-only compile renders checkable placement offers (NOT the empty state)', async () => {
    mockClient.intentCompileFromPrompt.mockResolvedValueOnce(RESOLVED_RES)

    render(<ProtocolLocalizationThread initialProtocolText="move 25 uL" sourceProtocolId="prt-x" />)

    await waitFor(() => expect(screen.getByTestId('pl-deck-review')).toBeTruthy())
    expect(screen.queryByTestId('pl-deckreview-empty')).toBeNull()

    const plate = screen.getByTestId('deck-labware-LAB-hint-plate') as HTMLInputElement
    const fresh = screen.getByTestId('deck-labware-LAB-fresh-plate') as HTMLInputElement
    expect(plate.checked).toBe(true)
    expect(fresh.checked).toBe(true)
    // Row label = the record's REAL title, not a string-guess.
    expect(screen.getByText('hint plate')).toBeTruthy()
    expect(screen.getByText('Fresh 96-well plate')).toBeTruthy()
  })

  it('picking a resolved offer + load-deck ghosts a placement of the EXISTING record and opens accept', async () => {
    // events: [] deliberately — with no ghosted events, the accept gate can
    // only open on the >=1 REAL placement (bait §10), not on checkbox count.
    mockClient.intentCompileFromPrompt.mockResolvedValueOnce({
      ...RESOLVED_RES,
      terminalArtifacts: { ...RESOLVED_RES.terminalArtifacts, events: [] },
    })
    mockClient.intentAccept.mockResolvedValueOnce(ACCEPT_RES)
    mockClient.intentTrainingPair.mockResolvedValueOnce(CORPUS_RES)

    render(<ProtocolLocalizationThread initialProtocolText="move 25 uL" sourceProtocolId="prt-x" />)
    await waitFor(() => expect(screen.getByTestId('pl-deck-review')).toBeTruthy())

    // Uncheck one, keep the other: the ghost carries exactly the picked record.
    fireEvent.click(screen.getByTestId('deck-labware-LAB-fresh-plate'))
    const plate = screen.getByTestId('deck-labware-LAB-hint-plate') as HTMLInputElement
    expect(plate.checked).toBe(true)

    fireEvent.click(screen.getByTestId('pl-load-deck'))

    await waitFor(() => expect(editorHarness.preview).not.toBeNull())
    const preview = editorHarness.preview!
    const placements = preview.previewPlacements as Array<Record<string, unknown>>
    expect(placements).toHaveLength(1)
    // The ghost is a placement of the EXISTING record: labwareId === recordId,
    // sourceRecordId === recordId, NO proposedRecord (submitSuggestionTool.ts:311).
    expect(placements[0]!.labwareId).toBe('LAB-hint-plate')
    const ghostedLabwares = preview.previewLabwares as Record<string, Record<string, unknown>>
    const ghost = ghostedLabwares['LAB-hint-plate']!
    expect(ghost.labwareId).toBe('LAB-hint-plate')
    expect(ghost.sourceRecordId).toBe('LAB-hint-plate')
    expect(Object.keys(ghost)).not.toContain('proposedRecord')

    // The accept gate opens on the >=1 REAL placement (not on checkbox count).
    const accept = screen.getByTestId('pl-accept') as HTMLButtonElement
    await waitFor(() => expect(accept.disabled).toBe(false))

    fireEvent.click(accept)
    await waitFor(() => expect(mockClient.intentAccept).toHaveBeenCalled())
    expect(mockClient.intentAccept).toHaveBeenCalledWith(
      expect.objectContaining({ sourceProtocolId: 'prt-x', localMacro: expect.objectContaining({ intentId: 'resolved-local' }) }),
    )
  })

  it('dedup: one checkbox per recordId when a recordId is BOTH an addition and a resolved row (addition wins)', async () => {
    mockClient.intentCompileFromPrompt.mockResolvedValueOnce({
      outcome: 'complete',
      terminalArtifacts: {
        events: [],
        labwareAdditions: [
          { recordId: 'LAB-dual-plate', reason: 'placed via prompt', deckSlot: 'B2' },
        ],
        resolvedLabwares: [
          { hint: 'dual plate', recordId: 'LAB-dual-plate', title: 'Dual Plate' },
        ],
      },
      localMacro: { intentId: 'dual', actions: [{ action: 'spin', rpm: 300 }] },
    })

    render(<ProtocolLocalizationThread initialProtocolText="spin the dual plate" sourceProtocolId="prt-dual" />)
    await waitFor(() => expect(screen.getByTestId('pl-deck-review')).toBeTruthy())

    const boxes = screen.getAllByTestId('deck-labware-LAB-dual-plate')
    expect(boxes).toHaveLength(1)
    // Addition-kind wins: the row keeps the addition's slot rendering.
    expect(screen.getByText('B2')).toBeTruthy()
  })

  it('zero-match legs byte-stable: additions-only compile keeps its exact testids/labels', async () => {
    mockClient.intentCompileFromPrompt.mockResolvedValueOnce({
      outcome: 'complete',
      terminalArtifacts: {
        events: [{ eventId: 'e1', event_type: 'transfer', details: {} }],
        labwareAdditions: [
          { recordId: 'lbw-def-generic-96-well-plate', reason: 'primary sample plate', deckSlot: 'B2' },
        ],
      },
      localMacro: { intentId: 'zero-match', actions: [{ action: 'transfer', volumeUl: 25 }] },
    })

    render(<ProtocolLocalizationThread initialProtocolText="zymo text" sourceProtocolId="prt-zymo" />)
    await waitFor(() => expect(screen.getByTestId('pl-deck-review')).toBeTruthy())

    // Same testid, same label (recordId), same pre-checked state as today.
    const checkbox = screen.getByTestId('deck-labware-lbw-def-generic-96-well-plate') as HTMLInputElement
    expect(checkbox.checked).toBe(true)
    expect(screen.getByText('lbw-def-generic-96-well-plate')).toBeTruthy()
    expect(screen.queryByTestId('pl-deckreview-empty')).toBeNull()
  })
})
