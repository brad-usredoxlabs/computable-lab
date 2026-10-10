/**
 * W2-9 T3 — applyDraftProtocolEdit (spec §3 R3, OQ2(a) ruling).
 *
 * The draft-aware apply fn: ONE getRecord(XDR) -> meta.contentSha lock
 * (refuse-without-token) -> PURE applyOps (imported from protocolEditOps.ts,
 * byte-untouched) -> deepEqual no-op -> SURGICAL envelope rebuild (replace
 * ONLY candidates[i].draft; source_artifact / ambiguity_spans / statuses /
 * diagnostics verbatim) -> ONE updateRecord(xdrId, envelope, {expectedSha,
 * message}) -> stale-409 -> STALE_PROTOCOL_WRITE_MESSAGE, no retry.
 *
 * The kind wall arrives via the reused applyOps itself: a draft body that is
 * NOT kind 'protocol' throws a NAMED error (editableProtocolSteps), never a
 * silent no-op. Provenance is NEVER constructible via ops: post-apply payload
 * deep-equals the provenance sub-trees.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getRecordMock = vi.fn()
const updateRecordMock = vi.fn()

vi.mock('../../../shared/api/client', () => ({
  apiClient: {
    getRecord: (...args: unknown[]) => getRecordMock(...args),
    updateRecord: (...args: unknown[]) => updateRecordMock(...args),
  },
}))

import { applyDraftProtocolEdit, CHAT_ACCEPT_COMMIT_MESSAGE } from './applyDraftProtocolEdit'
import { STALE_PROTOCOL_WRITE_MESSAGE } from './protocolEditOps'
import { ApiError } from '../../../shared/api/errors'

const XDR_ID = 'XDR-semantic-w29demo0001'
const CAN_ID = 'CAN-w29-demo'
const VPDF_ID = 'VPDF-ABCDEF012345'

function xdrPayload() {
  return {
    kind: 'extraction-draft',
    recordId: XDR_ID,
    status: 'draft',
    source_artifact: { kind: 'file', id: VPDF_ID, locator: 'zymo.pdf' },
    candidates: [
      {
        target_kind: 'protocol',
        confidence: 0.9,
        status: 'proposed',
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
              description: 'Lyse the sample.',
              intent: {
                semanticVerb: { ref: { kind: 'record', type: 'verb-definition', id: 'verb-lyse' } },
                provenance: [
                  { kind: 'record', type: 'vendor-protocol-candidate', id: CAN_ID, pageStart: 2, label: 'Sample prep' },
                ],
              },
            },
            {
              stepId: 'step-wash',
              label: 'Wash beads',
              ordinal: 2,
              kind: 'wash',
              intent: {
                provenance: [
                  { kind: 'record', type: 'vendor-protocol-candidate', id: CAN_ID, pageStart: 2, label: 'Wash' },
                ],
              },
            },
          ],
          branch_axes: [
            { axisId: 'axis-input', label: 'Input type', conditions: [{ id: 'cond-feces', label: 'Feces' }, { id: 'cond-pellet', label: 'Pellet' }] },
          ],
        },
      },
    ],
    ambiguity_spans_by_candidate: [[{ text: 'briefly wash', page: 2 }]],
    diagnostics: [{ code: 'NOTE', message: 'carried verbatim' }],
  }
}

function xdrEnvelope() {
  return {
    recordId: XDR_ID,
    schemaId: 'extraction-draft',
    payload: xdrPayload(),
    meta: { kind: 'extraction-draft', contentSha: 'xdr-sha-1' },
  }
}

function staleConflict() {
  return new ApiError({ status: 409, code: 'SHA mismatch', message: 'SHA mismatch: record changed since read' })
}

describe('applyDraftProtocolEdit (W2-9 T3)', () => {
  beforeEach(() => {
    getRecordMock.mockReset()
    updateRecordMock.mockReset()
    getRecordMock.mockResolvedValue(xdrEnvelope())
    updateRecordMock.mockResolvedValue({ record: { recordId: XDR_ID } })
  })

  it('accept lands ONE PUT whose payload changed ONLY candidates[0].draft — every other XDR field byte-preserved', async () => {
    const before = xdrPayload()
    const outcome = await applyDraftProtocolEdit(XDR_ID, 0, [
      { op: 'step_update', stepId: 'step-lyse', label: 'Lyse samples (bench wording)' },
    ])

    expect(outcome.wrote).toBe(true)
    expect(getRecordMock).toHaveBeenCalledTimes(1)
    expect(updateRecordMock).toHaveBeenCalledTimes(1)

    const [xdrId, envelope, options] = updateRecordMock.mock.calls[0]
    expect(xdrId).toBe(XDR_ID)
    // The lock + the commit message ride the ONE write.
    expect(options).toEqual({ expectedSha: 'xdr-sha-1', message: CHAT_ACCEPT_COMMIT_MESSAGE })

    // Field-by-field envelope proof: everything OUTSIDE candidates[0].draft is
    // byte-identical to the fetched payload.
    expect(envelope.kind).toBe(before.kind)
    expect(envelope.recordId).toBe(before.recordId)
    expect(envelope.status).toBe(before.status)
    expect(envelope.source_artifact).toEqual(before.source_artifact)
    expect(envelope.ambiguity_spans_by_candidate).toEqual(before.ambiguity_spans_by_candidate)
    expect(envelope.diagnostics).toEqual(before.diagnostics)
    // The candidate envelope around the draft (target_kind/confidence/status) survives.
    expect(envelope.candidates[0].target_kind).toBe('protocol')
    expect(envelope.candidates[0].confidence).toBe(0.9)
    expect(envelope.candidates[0].status).toBe('proposed')
    // Only the draft body moved — and only the label.
    const draftBefore = before.candidates[0].draft as Record<string, unknown>
    const draftAfter = envelope.candidates[0].draft as Record<string, unknown>
    expect((draftAfter.steps as Array<Record<string, unknown>>)[0].label).toBe('Lyse samples (bench wording)')
    expect(draftAfter.recordId).toBe(draftBefore.recordId)
    expect(draftAfter.title).toBe(draftBefore.title)
    expect(draftAfter.branch_axes).toEqual(draftBefore.branch_axes)
    expect((draftAfter.steps as Array<Record<string, unknown>>)[0].description).toBe('Lyse the sample.')
    expect((draftAfter.steps as Array<Record<string, unknown>>)[1]).toEqual((draftBefore.steps as never[])[1])
  })

  it('provenance is byte-equal after a step_update — ops can never construct or move provenance', async () => {
    const before = xdrPayload()
    const outcome = await applyDraftProtocolEdit(XDR_ID, 0, [
      { op: 'step_update', stepId: 'step-lyse', label: 'Renamed', notes: 'bench note' },
    ])
    expect(outcome.wrote).toBe(true)
    const [, envelope] = updateRecordMock.mock.calls[0]
    const stepsBefore = (before.candidates[0].draft as Record<string, unknown>).steps as Array<Record<string, unknown>>
    const stepsAfter = (envelope.candidates[0].draft as Record<string, unknown>).steps as Array<Record<string, unknown>>
    expect(stepsAfter[0].intent).toEqual(stepsBefore[0].intent)
    expect(stepsAfter[1].intent).toEqual(stepsBefore[1].intent)
  })

  it('a draft body that is NOT kind protocol throws a NAMED error and writes nothing (the kind wall rides applyOps)', async () => {
    const env = xdrEnvelope()
    ;(env.payload.candidates[0] as Record<string, unknown>).draft = { kind: 'intent-arm', steps: [] }
    getRecordMock.mockResolvedValue(env)
    await expect(
      applyDraftProtocolEdit(XDR_ID, 0, [{ op: 'step_update', stepId: 'step-lyse', label: 'x' }]),
    ).rejects.toThrow(/inherited|source protocol/i)
    expect(updateRecordMock).not.toHaveBeenCalled()
  })

  it('refuse-without-token: no meta.contentSha -> named refusal, zero writes', async () => {
    const env = xdrEnvelope()
    delete (env as { meta?: unknown }).meta
    getRecordMock.mockResolvedValue(env)
    await expect(
      applyDraftProtocolEdit(XDR_ID, 0, [{ op: 'step_update', stepId: 'step-lyse', label: 'x' }]),
    ).rejects.toThrow(/no save token/i)
    expect(updateRecordMock).not.toHaveBeenCalled()
  })

  it('no-op accept writes NOTHING (deepEqual idempotence)', async () => {
    const outcome = await applyDraftProtocolEdit(XDR_ID, 0, [
      { op: 'step_update', stepId: 'step-lyse', label: 'Lyse samples' },
    ])
    expect(outcome.wrote).toBe(false)
    expect(updateRecordMock).not.toHaveBeenCalled()
  })

  it('stale-409 -> the exact reload message verbatim, NO retry (zero further writes)', async () => {
    updateRecordMock.mockRejectedValue(staleConflict())
    await expect(
      applyDraftProtocolEdit(XDR_ID, 0, [{ op: 'step_update', stepId: 'step-lyse', label: 'New label' }]),
    ).rejects.toThrow(STALE_PROTOCOL_WRITE_MESSAGE)
    expect(updateRecordMock).toHaveBeenCalledTimes(1)
    expect(getRecordMock).toHaveBeenCalledTimes(1)
  })

  it('a moved record (proposal bound to an older sha) STOPS with the reload message and zero writes (bait 6)', async () => {
    await expect(
      applyDraftProtocolEdit(XDR_ID, 0, [{ op: 'step_update', stepId: 'step-lyse', label: 'Stale accept' }], 'sha-from-before-the-direct-save'),
    ).rejects.toThrow(STALE_PROTOCOL_WRITE_MESSAGE)
    expect(updateRecordMock).not.toHaveBeenCalled()
    expect(getRecordMock).toHaveBeenCalledTimes(1)
  })

  it('an op-index failure names the op and issues zero writes (pure applyOps throws before any PUT)', async () => {
    await expect(
      applyDraftProtocolEdit(XDR_ID, 0, [
        { op: 'step_update', stepId: 'step-lyse', label: 'ok' },
        { op: 'step_delete', stepId: 'step-ghost' },
      ]),
    ).rejects.toThrow(/Edit op 1 \(step_delete\)/)
    expect(updateRecordMock).not.toHaveBeenCalled()
  })

  it('a candidate index with no candidate throws a named error, zero writes', async () => {
    await expect(
      applyDraftProtocolEdit(XDR_ID, 5, [{ op: 'step_update', stepId: 'step-lyse', label: 'x' }]),
    ).rejects.toThrow(/no candidate at candidates\[5\]/)
    expect(updateRecordMock).not.toHaveBeenCalled()
  })
})
