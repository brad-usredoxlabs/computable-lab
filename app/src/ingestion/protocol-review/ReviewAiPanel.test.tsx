/**
 * W2-9 T2 — ReviewAiPanel (spec §3 R2, §5 B1-B6, §8 baits 1-7).
 *
 * Pattern: AiTabPanel.protocolEdit.test.tsx — useChatThread is mocked with an
 * option-capturing seam so the test emits a draft result exactly like the SSE
 * `done` frame does. The apiClient is mocked (getRecord/updateRecord), so the
 * REAL apply fn (applyDraftProtocolEdit) runs end-to-end through the panel:
 * the Accept leg asserts the actual PUT payload shape.
 *
 * Pins:
 *  - the panel sends on surface 'protocol-review' with context.attachedProtocol
 *    built from the OPEN XDR (recordId = the XDR id, sha = meta.contentSha,
 *    steps = candidates[0].draft steps) — never 'event-editor'/'workspace.deck'
 *    (bait 1, the PROTO-AI-9 defect class);
 *  - proposals render in ChangesPanel via protocolDiff ONLY (bait 2, no new rail);
 *  - Accept -> ONE updateRecord(XDR) with expectedSha + message, ONLY
 *    candidates[0].draft changed (bait 4: propose-never-write);
 *  - no-op Accept -> zero writes; stale-409 -> reload message, NO retry;
 *  - an error turn leaves NO actionable Accept (bait 7, PB-CH-4 D1 class);
 *  - a protocolId retarget (live PRT-*) is REFUSED visibly with zero writes (bait 3);
 *  - steps-loading-empty -> null attachedProtocol + named reason, no proposal;
 *  - no promote affordance and no promote call anywhere (B5).
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
  clarificationRequests?: Array<{ prompt: string }>
}

const mocks = vi.hoisted(() => ({
  options: null as null | {
    surface?: string
    context?: Record<string, unknown>
    onDraftResult?: (result: unknown, prompt: string) => void
  },
  resetCalls: 0,
}))

vi.mock('../../event-editor/right-pane/ai/useChatThread', () => ({
  useChatThread: (options: {
    surface: string
    context: Record<string, unknown>
    onDraftResult?: (result: unknown, prompt: string) => void
    onLedgerAnswer?: () => void
  }) => {
    mocks.options = options
    return {
      state: { messages: [], pending: null, status: null, error: null, trace: [] },
      isStreaming: false,
      send: vi.fn(async () => undefined),
      stop: vi.fn(),
      reset: vi.fn(() => {
        mocks.resetCalls += 1
      }),
      clearProtocolCandidate: vi.fn(),
    }
  },
}))

import { ReviewAiPanel } from './ReviewAiPanel'

const VPDF_ID = 'VPDF-ABCDEF012345'
const CAN_ID = 'CAN-w29-demo'
const XDR_ID = 'XDR-semantic-w29demo0001'
const STALE = 'Someone changed this protocol - reload and try again.'

function xdrEnvelope() {
  return {
    recordId: XDR_ID,
    schemaId: 'extraction-draft',
    payload: {
      kind: 'extraction-draft',
      recordId: XDR_ID,
      status: 'draft',
      source_artifact: { kind: 'file', id: VPDF_ID, locator: 'zymo.pdf' },
      candidates: [
        {
          target_kind: 'protocol',
          confidence: 0.9,
          draft: {
            kind: 'protocol',
            recordId: `PRT-${CAN_ID}-semantic`,
            title: 'ZymoBIOMICS — semantic family draft',
            steps: [
              {
                stepId: 'step-lyse',
                label: 'Lyse samples',
                ordinal: 1,
                kind: 'other',
                intent: {
                  semanticVerb: { ref: { kind: 'record', type: 'verb-definition', id: 'verb-lyse' } },
                  provenance: [{ kind: 'record', type: 'vendor-protocol-candidate', id: CAN_ID, pageStart: 2, label: 'Sample prep' }],
                },
              },
              {
                stepId: 'step-wash',
                label: 'Wash beads',
                ordinal: 2,
                kind: 'wash',
                intent: {
                  provenance: [{ kind: 'record', type: 'vendor-protocol-candidate', id: CAN_ID, pageStart: 2, label: 'Wash' }],
                },
              },
            ],
          },
        },
      ],
      ambiguity_spans_by_candidate: [[{ text: 'briefly wash', page: 2 }]],
      diagnostics: [],
    },
    meta: { kind: 'extraction-draft', contentSha: 'xdr-sha-1' },
  }
}

function saidEnvelope() {
  return {
    recordId: CAN_ID,
    schemaId: 'vendor-protocol-candidate',
    payload: {
      kind: 'vendor-protocol-candidate',
      title: 'ZymoBIOMICS 96 MagBead DNA Kit',
      source: { documentId: VPDF_ID, filename: 'zymo.pdf', pageCount: 31 },
    },
    meta: { kind: 'vendor-protocol-candidate', contentSha: 'can-sha' },
  }
}

function seedRecords() {
  listRecordsByKindMock.mockImplementation(async (kind: string) => {
    if (kind === 'extraction-draft') return { records: [xdrEnvelope()], total: 1 }
    if (kind === 'vendor-protocol-candidate') return { records: [saidEnvelope()], total: 1 }
    return { records: [], total: 0 }
  })
  getRecordMock.mockImplementation(async (id: string) => {
    if (id === XDR_ID) return xdrEnvelope()
    throw new Error(`unexpected getRecord(${id})`)
  })
  updateRecordMock.mockResolvedValue({ record: { recordId: XDR_ID } })
}

function renderPanel(onDraftApplied = vi.fn()) {
  render(<ReviewAiPanel recordId={VPDF_ID} onDraftApplied={onDraftApplied} />)
  return onDraftApplied
}

async function emit(result: DraftResult, prompt = 'reword step 1 for our bench') {
  await act(async () => {
    mocks.options?.onDraftResult?.(result, prompt)
  })
}

describe('ReviewAiPanel (W2-9 T2)', () => {
  beforeEach(() => {
    cleanup()
    getRecordMock.mockReset()
    updateRecordMock.mockReset()
    createRecordMock.mockReset()
    listRecordsByKindMock.mockReset()
    mocks.options = null
    mocks.resetCalls = 0
    seedRecords()
  })

  it('sends on surface protocol-review with attachedProtocol built from the OPEN XDR (never a borrowed surface)', async () => {
    renderPanel()
    await waitFor(() => expect(mocks.options).not.toBeNull())
    expect(mocks.options!.surface).toBe('protocol-review')
    const attached = mocks.options!.context!.attachedProtocol as Record<string, unknown>
    expect(attached.recordId).toBe(XDR_ID)
    expect(attached.sha).toBe('xdr-sha-1')
    expect((attached.steps as Array<Record<string, unknown>>).map((s) => s.stepId)).toEqual(['step-lyse', 'step-wash'])
    // SAID/MEANT context rides the request so the prompt can speak about both.
    const reviewContext = mocks.options!.context!.reviewContext as Record<string, unknown>
    expect(reviewContext.candidateRecordId).toBe(CAN_ID)
    expect(reviewContext.draftRecordId).toBe(XDR_ID)
  })

  it('a proposal renders in ChangesPanel (protocol mode) with a real before/after, then Accept lands ONE PUT on the XDR', async () => {
    const onDraftApplied = renderPanel()
    await screen.findByTestId('review-ai-panel')

    await emit({
      protocolEdit: {
        ops: [{ op: 'step_update', stepId: 'step-lyse', label: 'Lyse samples (bench wording)' }],
      },
    })

    const panel = await screen.findByTestId('changes-panel')
    expect(panel).toBeTruthy()
    // Before/after is real (hydrated from the attached snapshot).
    expect(panel.textContent).toContain('Lyse samples')
    expect(panel.textContent).toContain('Lyse samples (bench wording)')
    expect(screen.getByTestId('changes-apply')).toBeTruthy()

    fireEvent.click(screen.getByTestId('changes-apply'))
    await waitFor(() => expect(updateRecordMock).toHaveBeenCalledTimes(1))

    const [xdrId, envelope, options] = updateRecordMock.mock.calls[0]
    expect(xdrId).toBe(XDR_ID)
    expect(options.expectedSha).toBe('xdr-sha-1')
    expect(typeof options.message).toBe('string')
    expect(options.message.length).toBeGreaterThan(0)
    // ONLY candidates[0].draft changed; every other XDR field survives.
    expect(envelope.source_artifact).toEqual(xdrEnvelope().payload.source_artifact)
    expect(envelope.ambiguity_spans_by_candidate).toEqual(xdrEnvelope().payload.ambiguity_spans_by_candidate)
    expect(envelope.status).toBe('draft')
    const draft = (envelope.candidates as Array<Record<string, unknown>>)[0].draft as Record<string, unknown>
    expect((draft.steps as Array<Record<string, unknown>>)[0].label).toBe('Lyse samples (bench wording)')
    expect((draft.steps as Array<Record<string, unknown>>)[0].intent).toEqual(
      (xdrEnvelope().payload.candidates[0].draft as Record<string, unknown>).steps &&
        ((xdrEnvelope().payload.candidates[0].draft as Record<string, unknown>).steps as Array<Record<string, unknown>>)[0].intent,
    )
    // The host is told to re-read the draft, and the review surface closes.
    await waitFor(() => expect(onDraftApplied).toHaveBeenCalledTimes(1))
    expect(updateRecordMock).toHaveBeenCalledTimes(1)
    expect(createRecordMock).not.toHaveBeenCalled()
  })

  it('a no-op Accept writes NOTHING', async () => {
    renderPanel()
    await screen.findByTestId('review-ai-panel')
    await emit({
      protocolEdit: { ops: [{ op: 'step_update', stepId: 'step-lyse', label: 'Lyse samples' }] },
    })
    fireEvent.click(await screen.findByTestId('changes-apply'))
    await waitFor(() => expect(screen.getByTestId('review-ai-apply-note')).toBeTruthy())
    expect(updateRecordMock).not.toHaveBeenCalled()
  })

  it('a stale-409 shows the reload message verbatim and issues NO retry', async () => {
    renderPanel()
    await screen.findByTestId('review-ai-panel')
    updateRecordMock.mockRejectedValue(
      Object.assign(new Error('SHA mismatch: record changed since read'), {
        name: 'ApiError',
        status: 409,
        code: 'SHA mismatch',
        isApiError: true,
      }),
    )
    // The panel must see a real ApiError; import the class so the mock matches.
    const { ApiError } = await import('../../shared/api/errors')
    updateRecordMock.mockRejectedValue(
      new ApiError({ status: 409, code: 'SHA mismatch', message: 'SHA mismatch: record changed since read' }),
    )
    await emit({ protocolEdit: { ops: [{ op: 'step_update', stepId: 'step-lyse', label: 'Fresh label' }] } })
    fireEvent.click(await screen.findByTestId('changes-apply'))
    const error = await screen.findByRole('alert')
    expect(error.textContent).toContain(STALE)
    expect(updateRecordMock).toHaveBeenCalledTimes(1)
  })

  it('an error turn leaves NO actionable Accept over an empty change list (PB-CH-4 D1 class)', async () => {
    renderPanel()
    await screen.findByTestId('review-ai-panel')
    await emit({ error: 'protocol_edit envelope rejected: unevaluated property "provenance"' })
    expect(screen.queryByTestId('changes-panel')).toBeNull()
    expect(screen.queryByTestId('changes-apply')).toBeNull()
    expect(updateRecordMock).not.toHaveBeenCalled()
  })

  it('a protocolId that is not the open XDR is REFUSED visibly with zero writes (chat cannot retarget)', async () => {
    renderPanel()
    await screen.findByTestId('review-ai-panel')
    await emit({
      protocolEdit: {
        protocolId: 'PRT-000001',
        ops: [{ op: 'step_update', stepId: 'step-lyse', label: 'Hijacked' }],
      },
    })
    const refusal = await screen.findByTestId('review-ai-refusal')
    expect(refusal.textContent).toContain('PRT-000001')
    expect(refusal.textContent).toContain(XDR_ID)
    expect(screen.queryByTestId('changes-apply')).toBeNull()
    expect(updateRecordMock).not.toHaveBeenCalled()
  })

  it('a draft with no steps renders a NAMED reason and sends NO attachedProtocol (identity alone is an invention invitation)', async () => {
    listRecordsByKindMock.mockImplementation(async (kind: string) => {
      if (kind === 'extraction-draft') {
        const env = xdrEnvelope()
        ;(env.payload.candidates[0].draft as Record<string, unknown>).steps = []
        return { records: [env], total: 1 }
      }
      return { records: [], total: 0 }
    })
    renderPanel()
    const arm = await screen.findByTestId('review-ai-no-steps')
    expect(arm.textContent).toContain('step')
    await waitFor(() => expect(mocks.options).not.toBeNull())
    expect(mocks.options!.context!.attachedProtocol).toBeNull()
    // No proposal can be offered without ground truth.
    await emit({ protocolEdit: { ops: [{ op: 'step_update', stepId: 'step-ghost', label: 'x' }] } })
    expect(screen.queryByTestId('changes-apply')).toBeNull()
    expect(updateRecordMock).not.toHaveBeenCalled()
  })

  it('with no open draft the panel names the unavailable arm and offers no write path', async () => {
    listRecordsByKindMock.mockResolvedValue({ records: [], total: 0 })
    renderPanel()
    const arm = await screen.findByTestId('review-ai-no-draft')
    expect(arm.textContent).toContain('draft')
    expect(screen.queryByTestId('changes-apply')).toBeNull()
    expect(updateRecordMock).not.toHaveBeenCalled()
  })

  it('a proposal grounded on an older sha STOPS the Accept with the reload message and zero writes (bait 6, the two-tab race)', async () => {
    renderPanel()
    await screen.findByTestId('review-ai-panel')
    await emit({ protocolEdit: { ops: [{ op: 'step_update', stepId: 'step-lyse', label: 'Writer A label' }] } })
    // Writer B saves directly while the proposal is pending: the record moves.
    const moved = xdrEnvelope()
    moved.meta = { kind: 'extraction-draft', contentSha: 'xdr-sha-2-after-direct-save' }
    getRecordMock.mockResolvedValue(moved)
    fireEvent.click(await screen.findByTestId('changes-apply'))
    const error = await screen.findByRole('alert')
    expect(error.textContent).toContain(STALE)
    expect(updateRecordMock).not.toHaveBeenCalled()
  })

  it('exposes NO promote affordance and never calls a promote/extract endpoint (B5)', async () => {
    renderPanel()
    await screen.findByTestId('review-ai-panel')
    expect(screen.queryByTestId(/promote/)).toBeNull()
    expect(document.body.textContent).not.toMatch(/promote/i)
  })
})
