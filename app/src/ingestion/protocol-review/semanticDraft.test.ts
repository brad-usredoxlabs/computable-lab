/**
 * W2-8 SAID/MEANT — the MEANT edit discipline (spec §3 W2, §8 bait 2 + bait 6).
 *
 * The save loop mirrors applyProtocolEdit (protocolEditOps.ts:367-393, READ-ONLY
 * precedent): fetch -> human lock (meta.contentSha) -> PURE rebuild -> deepEqual
 * no-op -> ONE atomic updateRecord(expectedSha) -> stale-409 stops with the
 * exact reload message and zero retries. The rebuild replaces ONLY
 * candidates[0].draft; every other XDR field must survive byte-for-byte.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../shared/api/errors'
import { apiClient } from '../../shared/api/client'
import {
  findSaidCandidate,
  findSemanticDraft,
  replaceDraftBody,
  saveSemanticDraftEdit,
} from './semanticDraft'

vi.mock('../../shared/api/client', () => ({
  apiClient: {
    getRecord: vi.fn(),
    updateRecord: vi.fn(),
  },
}))

const mockClient = apiClient as unknown as {
  getRecord: ReturnType<typeof vi.fn>
  updateRecord: ReturnType<typeof vi.fn>
}

const XDR_ID = 'XDR-semantic-demo0001'
const VPDF_ID = 'VPDF-ABCDEF012345'
const CAN_ID = 'CAN-w28-demo'

function xdrPayload(): Record<string, unknown> {
  return {
    kind: 'extraction-draft',
    recordId: XDR_ID,
    source_artifact: { kind: 'file', id: VPDF_ID, locator: 'zymo.pdf' },
    candidates: [
      {
        target_kind: 'protocol',
        draft: {
          kind: 'protocol',
          recordId: `PRT-${CAN_ID}-semantic`,
          title: 'ZymoBIOMICS — semantic family draft',
          steps: [
            {
              stepId: 'step-lyse',
              label: 'Lyse',
              ordinal: 1,
              kind: 'other',
              intent: {
                semanticVerb: { ref: { kind: 'record', type: 'verb-definition', id: 'verb-lyse' } },
                provenance: [
                  { kind: 'record', type: 'vendor-protocol-candidate', id: CAN_ID, pageStart: 2, label: 'Sample prep' },
                ],
              },
            },
          ],
        },
        confidence: 0.9,
        ambiguity_spans: [{ path: 'steps[0].intent', reason: 'anchor resolved from the section table' }],
      },
    ],
    status: 'pending_review',
    notes: 'review me',
    diagnostics: [{ severity: 'info', code: 'AXES_BOUND', message: '1 axis' }],
    extractor_profile: 'profile-x',
    createdAt: '2026-10-10T06:00:00.000Z',
  }
}

function xdrEnvelope(payload: Record<string, unknown> = xdrPayload()) {
  return {
    recordId: XDR_ID,
    schemaId: 'https://computable-lab.com/schema/computable-lab/workflow/extraction-draft.schema.yaml',
    payload,
    meta: { kind: 'extraction-draft', contentSha: 'sha-current' },
  }
}

beforeEach(() => {
  mockClient.getRecord.mockReset()
  mockClient.updateRecord.mockReset()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('findSemanticDraft (the M2 join)', () => {
  it('joins on source_artifact.id === the VPDF route id and takes candidates[0] (target_kind protocol)', () => {
    const view = findSemanticDraft([xdrEnvelope()], VPDF_ID)
    expect(view).not.toBeNull()
    expect(view!.xdr.recordId).toBe(XDR_ID)
    expect(view!.candidateIndex).toBe(0)
    expect((view!.draft as Record<string, unknown>).kind).toBe('protocol')
  })

  it('skips a promoted draft, a foreign source_artifact, and a non-protocol target', () => {
    const promoted = xdrPayload()
    promoted.status = 'promoted'
    const foreign = xdrPayload()
    ;(foreign.source_artifact as Record<string, unknown>).id = 'VPDF-OTHER'
    const otherTarget = xdrPayload()
    ;(otherTarget.candidates as Record<string, unknown>[])[0]!.target_kind = 'material-spec'
    expect(findSemanticDraft([promoted], VPDF_ID)).toBeNull()
    expect(findSemanticDraft([foreign], VPDF_ID)).toBeNull()
    expect(findSemanticDraft([otherTarget], VPDF_ID)).toBeNull()
  })
})

describe('findSaidCandidate (the SAID join)', () => {
  const saidEnvelope = () => ({
    recordId: CAN_ID,
    schemaId: 'vpc',
    payload: {
      kind: 'vendor-protocol-candidate',
      title: 'ZymoBIOMICS',
      source: { documentId: VPDF_ID, filename: 'zymo.pdf', pageCount: 31 },
    },
  })

  it('resolves the candidate whose source.documentId names the VPDF, preferring a CAN-* record id', () => {
    const found = findSaidCandidate([saidEnvelope()], VPDF_ID)
    expect(found?.recordId).toBe(CAN_ID)
  })

  it('returns null when no candidate names this document', () => {
    const other = saidEnvelope()
    ;(other.payload.source as Record<string, unknown>).documentId = 'VPDF-OTHER'
    expect(findSaidCandidate([other], VPDF_ID)).toBeNull()
  })
})

describe('replaceDraftBody (surgical rebuild — bait 2)', () => {
  it('replaces ONLY candidates[0].draft and preserves every other field byte-for-byte', () => {
    const before = xdrPayload()
    const after = replaceDraftBody(before, 0, { kind: 'protocol', recordId: 'PRT-x', title: 'EDITED title', steps: [] })

    // Untouched fields survive exactly.
    expect(after.source_artifact).toEqual(before.source_artifact)
    expect(after.status).toBe(before.status)
    expect(after.notes).toBe(before.notes)
    expect(after.diagnostics).toEqual(before.diagnostics)
    expect(after.extractor_profile).toBe(before.extractor_profile)
    expect(after.createdAt).toBe(before.createdAt)

    // The candidate envelope around the draft survives too (confidence, spans, status).
    const beforeCandidate = (before.candidates as Record<string, unknown>[])[0]!
    const afterCandidate = (after.candidates as Record<string, unknown>[])[0]!
    expect(afterCandidate.target_kind).toBe(beforeCandidate.target_kind)
    expect(afterCandidate.confidence).toBe(beforeCandidate.confidence)
    expect(afterCandidate.ambiguity_spans).toEqual(beforeCandidate.ambiguity_spans)

    // Only the draft body changed.
    expect((afterCandidate.draft as Record<string, unknown>).title).toBe('EDITED title')
  })

  it('never writes an undefined key into the rebuilt payload', () => {
    const after = replaceDraftBody(xdrPayload(), 0, { kind: 'protocol', recordId: 'PRT-x', title: 't', steps: [] })
    expect(JSON.stringify(after)).not.toContain('null')
    expect(Object.keys(after)).not.toContain('undefined')
  })
})

describe('saveSemanticDraftEdit (TapTab lock discipline — bait 6)', () => {
  const nextDraft = { kind: 'protocol', recordId: 'PRT-x', title: 'EDITED title', steps: [] }

  it('refuses with ZERO writes when the record carries no save token', async () => {
    mockClient.getRecord.mockResolvedValue({ recordId: XDR_ID, schemaId: 'x', payload: xdrPayload(), meta: {} })
    await expect(saveSemanticDraftEdit(XDR_ID, 0, nextDraft)).rejects.toThrow(/no save token/)
    expect(mockClient.updateRecord).not.toHaveBeenCalled()
  })

  it('a no-op save writes nothing (double-save idempotence)', async () => {
    mockClient.getRecord.mockResolvedValue(xdrEnvelope())
    const sameDraft = ((xdrPayload().candidates as Record<string, unknown>[])[0]!.draft as Record<string, unknown>)
    const outcome = await saveSemanticDraftEdit(XDR_ID, 0, sameDraft)
    expect(outcome.wrote).toBe(false)
    expect(mockClient.updateRecord).not.toHaveBeenCalled()
  })

  it('issues ONE atomic updateRecord(XDR, payload, {expectedSha}) with only candidates[0].draft changed', async () => {
    const before = xdrPayload()
    mockClient.getRecord.mockResolvedValue(xdrEnvelope(before))
    mockClient.updateRecord.mockResolvedValue({ record: xdrEnvelope(), validation: { valid: true }, lint: { valid: true } })

    const outcome = await saveSemanticDraftEdit(XDR_ID, 0, nextDraft)
    expect(outcome.wrote).toBe(true)
    expect(mockClient.updateRecord).toHaveBeenCalledTimes(1)
    const [id, payload, options] = mockClient.updateRecord.mock.calls[0]!
    expect(id).toBe(XDR_ID)
    expect(options).toEqual({ expectedSha: 'sha-current' })
    expect((payload as Record<string, unknown>).recordId).toBe(XDR_ID)
    const candidate = (payload as Record<string, unknown>).candidates as Record<string, unknown>[]
    expect((candidate[0]!.draft as Record<string, unknown>).title).toBe('EDITED title')
    expect(candidate[0]!.confidence).toBe(0.9)
    expect((payload as Record<string, unknown>).source_artifact).toEqual(before.source_artifact)
  })

  it('a stale 409 stops with the exact reload message and ZERO retries', async () => {
    mockClient.getRecord.mockResolvedValue(xdrEnvelope())
    mockClient.updateRecord.mockRejectedValue(
      new ApiError({ status: 409, code: 'CONFLICT', message: 'SHA mismatch: expected sha-current, found sha-newer' }),
    )
    await expect(saveSemanticDraftEdit(XDR_ID, 0, nextDraft)).rejects.toThrow(
      'Someone changed this protocol - reload and try again.',
    )
    expect(mockClient.updateRecord).toHaveBeenCalledTimes(1)
    expect(mockClient.getRecord).toHaveBeenCalledTimes(1)
  })

  it('a 405 (append-only wall) surfaces the server message verbatim, not the reload message', async () => {
    mockClient.getRecord.mockResolvedValue(xdrEnvelope())
    mockClient.updateRecord.mockRejectedValue(
      new ApiError({ status: 405, code: 'APPEND_ONLY', message: 'vendor-protocol-candidate is append-only' }),
    )
    await expect(saveSemanticDraftEdit(XDR_ID, 0, nextDraft)).rejects.toThrow('vendor-protocol-candidate is append-only')
  })
})
