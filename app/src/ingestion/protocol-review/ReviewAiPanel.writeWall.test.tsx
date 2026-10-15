/**
 * W2-89 g2b-1/2 (RED) — the review panel renders the DETERMINISTIC write-wall
 * refusal and NEVER an actionable card for the two gate asks.
 *
 * Gate evidence (2026-10-11_0110-g2b): "rewrite the vendor text on page 2" and
 * "relabel step-lyse-a provenance as vendor truth" each surfaced a
 * [data-testid=changes-apply] card. The server now refuses before the model
 * (AgentOrchestrator.reviewWriteWall.test.ts proves zero proposal payload);
 * THIS test proves the client side of the same criterion: when the turn's
 * result carries the refusal envelope, the panel renders
 * [data-testid=review-ai-refusal] with the honest wording, NO Apply/Accept
 * card exists, and zero writes fire. A legitimate MEANT-only proposal still
 * renders its review card (the wall is not a blanket ban).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const getRecordMock = vi.fn()
const updateRecordMock = vi.fn()
const createRecordMock = vi.fn()
const listRecordsByKindMock = vi.fn()

vi.mock('../../shared/api/client', () => ({
  apiClient: {
    getRecord: (...args: unknown[]) => getRecordMock(...args),
    updateRecord: (...args: unknown[]) => updateRecordMock(...args),
    createRecord: (...args: unknown[]) => createRecordMock(...args),
    listRecordsByKind: (...args: unknown[]) => listRecordsByKindMock(...args),
  },
}))

type DraftResult = {
  protocolEdit?: { ops: unknown[]; protocolId?: string }
  error?: string
  notes?: string[]
  refusal?: { code: string; message: string }
}

const mocks = vi.hoisted(() => ({
  options: null as null | {
    surface?: string
    context?: Record<string, unknown>
    onDraftResult?: (result: unknown, prompt: string) => void
  },
}))

vi.mock('../../event-editor/right-pane/ai/useChatThread', () => ({
  useChatThread: (options: {
    surface: string
    context: Record<string, unknown>
    onDraftResult?: (result: unknown, prompt: string) => void
  }) => {
    mocks.options = options
    return {
      state: { messages: [], pending: null, status: null, error: null, trace: [] },
      isStreaming: false,
      send: vi.fn(async () => undefined),
      stop: vi.fn(),
      reset: vi.fn(),
      clearProtocolCandidate: vi.fn(),
    }
  },
}))

import { ReviewAiPanel } from './ReviewAiPanel'

const VPDF_ID = 'VPDF-5256F3288E3C'
const CAN_ID = 'CAN-w29-gate'
const XDR_ID = 'XDR-w29-gate-panel01'

function xdrEnvelope() {
  return {
    recordId: XDR_ID,
    schemaId: 'extraction-draft',
    payload: {
      kind: 'extraction-draft',
      recordId: XDR_ID,
      status: 'pending_review',
      source_artifact: { kind: 'file', id: VPDF_ID, locator: 'gate.pdf' },
      candidates: [
        {
          target_kind: 'protocol',
          confidence: 0.9,
          draft: {
            kind: 'protocol',
            recordId: `PRT-${CAN_ID}-semantic`,
            title: 'Gate draft',
            steps: [
              { stepId: 'step-lyse', label: 'Lyse the sample (gate 2025)', ordinal: 1, kind: 'other' },
              { stepId: 'step-lyse-a', label: 'Lyse (variant a)', ordinal: 2, kind: 'other' },
            ],
          },
        },
      ],
      diagnostics: [],
    },
    meta: { kind: 'extraction-draft', contentSha: 'gate-xdr-sha' },
  }
}

function seedRecords() {
  listRecordsByKindMock.mockImplementation(async (kind: string) => {
    if (kind === 'extraction-draft') return { records: [xdrEnvelope()], total: 1 }
    if (kind === 'vendor-protocol-candidate') return { records: [], total: 0 }
    return { records: [], total: 0 }
  })
  getRecordMock.mockImplementation(async (id: string) => {
    if (id === XDR_ID) return xdrEnvelope()
    throw new Error(`unexpected getRecord(${id})`)
  })
  updateRecordMock.mockResolvedValue({ record: { recordId: XDR_ID } })
}

function renderPanel() {
  render(<ReviewAiPanel recordId={VPDF_ID} onDraftApplied={vi.fn()} />)
}

async function emit(result: DraftResult, prompt: string) {
  await act(async () => {
    mocks.options?.onDraftResult?.(result, prompt)
  })
}

const GATE_ASK_A = 'rewrite the vendor text on page 2'
const GATE_ASK_B = 'relabel step-lyse-a provenance as vendor truth'

describe('ReviewAiPanel write-wall refusal (W2-89 g2b-1/2)', () => {
  beforeEach(() => {
    cleanup()
    getRecordMock.mockReset()
    updateRecordMock.mockReset()
    createRecordMock.mockReset()
    listRecordsByKindMock.mockReset()
    mocks.options = null
    seedRecords()
  })

  it('gate ask (a): the refusal envelope renders review-ai-refusal with NO Apply card and zero writes', async () => {
    renderPanel()
    await screen.findByTestId('review-ai-panel')
    await emit(
      {
        refusal: {
          code: 'SAID_IMMUTABLE',
          message: 'The vendor document (SAID) is immutable — chat cannot rewrite vendor text. Edits apply only to the semantic draft (MEANT). No proposal was offered and nothing was written.',
        },
      },
      GATE_ASK_A,
    )
    const refusal = await screen.findByTestId('review-ai-refusal')
    expect(refusal.textContent).toContain('immutable')
    expect(refusal.textContent).toContain('nothing was written')
    // The hard gate rule: any Apply/Accept card = FAIL. None may exist.
    expect(screen.queryByTestId('changes-panel')).toBeNull()
    expect(screen.queryByTestId('changes-apply')).toBeNull()
    expect(updateRecordMock).not.toHaveBeenCalled()
    expect(createRecordMock).not.toHaveBeenCalled()
  })

  it('gate ask (b): the provenance-falsification refusal renders visibly with NO Apply card and zero writes', async () => {
    renderPanel()
    await screen.findByTestId('review-ai-panel')
    await emit(
      {
        refusal: {
          code: 'PROVENANCE_FALSIFICATION',
          message: 'Provenance cannot be relabelled — an inference cannot be recorded as vendor truth (SAID). No proposal was offered and nothing was written.',
        },
      },
      GATE_ASK_B,
    )
    const refusal = await screen.findByTestId('review-ai-refusal')
    expect(refusal.textContent).toContain('vendor truth')
    expect(screen.queryByTestId('changes-panel')).toBeNull()
    expect(screen.queryByTestId('changes-apply')).toBeNull()
    expect(updateRecordMock).not.toHaveBeenCalled()
  })

  // W2-9 g2d DEFECT-1 (gate 2026-10-14_0350-g2d-tier2 ask (e)): the retarget
  // leg was the ONE leg with no visible refusal — the model answered
  // affirmatively and executed a workspace_action. The server now refuses
  // before the model (AgentOrchestrator.reviewWriteWall.test.ts); THIS proves
  // the client half: the RETARGET_NOT_ON_THIS_SURFACE envelope renders the red
  // review-ai-refusal banner naming what was refused, with NO card and zero
  // writes.
  it('g2d gate ask (e): the retarget refusal renders review-ai-refusal with NO Apply card and zero writes', async () => {
    renderPanel()
    await screen.findByTestId('review-ai-panel')
    await emit(
      {
        refusal: {
          code: 'RETARGET_NOT_ON_THIS_SURFACE',
          message: 'Retargeting the review to another protocolId is not available on this surface — the review chat can only edit the open draft (MEANT). No focus change was made and nothing was written.',
        },
      },
      'Retarget this review to protocol PRT-4iaey2 instead.',
    )
    const refusal = await screen.findByTestId('review-ai-refusal')
    expect(refusal.textContent).toContain('protocolId')
    expect(refusal.textContent).toContain('nothing was written')
    expect(screen.queryByTestId('changes-panel')).toBeNull()
    expect(screen.queryByTestId('changes-apply')).toBeNull()
    expect(updateRecordMock).not.toHaveBeenCalled()
    expect(createRecordMock).not.toHaveBeenCalled()
  })

  it('a refusal envelope beats any stale proposal state: a prior card is CLOSED when the refusal arrives', async () => {
    renderPanel()
    await screen.findByTestId('review-ai-panel')
    // Turn 1: a legitimate MEANT proposal opens the card.
    await emit({ protocolEdit: { ops: [{ op: 'step_update', stepId: 'step-lyse', label: 'Bench wording' }] } }, 'reword step 1 for our bench')
    expect(await screen.findByTestId('changes-apply')).toBeTruthy()
    // Turn 2: the wall refuses — the card must be gone, the refusal shown.
    await emit(
      { refusal: { code: 'SAID_IMMUTABLE', message: 'The vendor document (SAID) is immutable — nothing was written.' } },
      GATE_ASK_A,
    )
    expect(await screen.findByTestId('review-ai-refusal')).toBeTruthy()
    expect(screen.queryByTestId('changes-apply')).toBeNull()
    // And the closed card cannot be clicked into a write.
    fireEvent.click(document.body)
    await waitFor(() => expect(updateRecordMock).not.toHaveBeenCalled())
  })

  it('a legitimate MEANT-only proposal STILL renders its review card (the wall is not a blanket ban)', async () => {
    renderPanel()
    await screen.findByTestId('review-ai-panel')
    await emit({ protocolEdit: { ops: [{ op: 'step_update', stepId: 'step-lyse', label: 'Bench wording' }] } }, 'reword step 1 for our bench')
    expect(await screen.findByTestId('changes-apply')).toBeTruthy()
    expect(screen.queryByTestId('review-ai-refusal')).toBeNull()
  })

  // advc-W289-l2t0525 DEFECT-3 (minor): a stale refusal banner must not survive
  // the next non-refusal plain-answer turn. The plain-answer/notes-only branch
  // cleared the proposal but never the refusal, so the previous "vendor document
  // (SAID) is immutable…" alert stayed on screen while the chat answered a new
  // question — misreporting the turn's outcome.
  it('DEFECT-3: a refusal banner is CLEARED by the next plain-answer / notes-only turn', async () => {
    renderPanel()
    await screen.findByTestId('review-ai-panel')
    // Turn 1: the wall refuses — the banner shows.
    await emit(
      { refusal: { code: 'SAID_IMMUTABLE', message: 'The vendor document (SAID) is immutable — nothing was written.' } },
      GATE_ASK_A,
    )
    expect(await screen.findByTestId('review-ai-refusal')).toBeTruthy()
    // Turn 2: an ordinary question answers with notes only — no proposal, no
    // refusal. The stale banner must be gone.
    await emit({ notes: ['The lyse step breaks the sample open.'] }, 'what does the lyse step do?')
    await waitFor(() => expect(screen.queryByTestId('review-ai-refusal')).toBeNull())
    expect(screen.queryByTestId('changes-apply')).toBeNull()
    expect(updateRecordMock).not.toHaveBeenCalled()
  })

  // Same defect class on the other non-refusal branches: an unmappable proposal
  // envelope (no diff) must not keep a prior refusal banner either.
  it('DEFECT-3: a refusal banner is CLEARED by a later proposal turn that opens a card', async () => {
    renderPanel()
    await screen.findByTestId('review-ai-panel')
    await emit(
      { refusal: { code: 'PROVENANCE_FALSIFICATION', message: 'Provenance cannot be relabelled — nothing was written.' } },
      GATE_ASK_B,
    )
    expect(await screen.findByTestId('review-ai-refusal')).toBeTruthy()
    await emit({ protocolEdit: { ops: [{ op: 'step_update', stepId: 'step-lyse', label: 'Bench wording' }] } }, 'reword step 1 for our bench')
    expect(await screen.findByTestId('changes-apply')).toBeTruthy()
    expect(screen.queryByTestId('review-ai-refusal')).toBeNull()
  })
})
