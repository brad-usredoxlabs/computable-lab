import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from '../../../shared/api/client'
import { ApiError } from '../../../shared/api/errors'
import {
  STALE_PROTOCOL_WRITE_MESSAGE,
  applyOps,
  applyProtocolEdit,
  type ProtocolEditOp,
} from './protocolEditOps'

vi.mock('../../../shared/api/client', () => ({ apiClient: { getRecord: vi.fn(), updateRecord: vi.fn() } }))

/**
 * Fixture protocol: draft, editable, three steps (one executed), declared
 * roles, and declared membership lists (variants/branch_axes/source) so the
 * applier's membership discipline is observable. `source` must stay untouched.
 * Kinds are legal ProtocolStep kinds (protocol.schema.yaml:773).
 */
const basePayload = () => ({
  kind: 'protocol',
  title: 'Zymo MagBead',
  state: 'draft',
  steps: [
    { stepId: 's1', ordinal: 1, kind: 'add_material', label: 'Lyse', phaseId: 'lysis',
      description: 'Add buffer.', settings: [{ settingId: 'volume', label: 'Volume', type: 'volume', unit: 'uL' }] },
    { stepId: 's2', ordinal: 2, kind: 'wash', label: 'Wash', phaseId: 'wash',
      executionMeta: { startedAt: '2026-01-01T00:00:00.000Z' } },
    { stepId: 's3', ordinal: 3, kind: 'harvest', label: 'Elute' },
  ],
  roles: {
    labwareRoles: [{ roleId: 'plate', description: '96-well plate' }, { roleId: 'trough' }],
    instrumentRoles: [{ roleId: 'plate_reader' }, { roleId: 'centrifuge' }],
    materialRoles: [{ roleId: 'lysis-buffer' }],
  },
  variants: [{ variantId: 'soil', stepIds: ['s1', 's2', 's3'] }],
  branch_axes: [{ axisId: 'sample', shared_stepIds: ['s2'], conditions: [
    { id: 'soil', then_stepIds: ['s1'], else_stepIds: ['s3'] },
  ] }],
  source: { ingestion: { stepIds: ['s1', 's2', 's3'] } },
})

const record = (payload: Record<string, unknown>, sha = 'sha-1') => ({
  recordId: 'PRT-1', schemaId: 'protocol', meta: { contentSha: sha }, payload,
})

/** Deterministic mint so results are assertable; the applier takes it as a seam. */
const mint = () => 'step-0123456789abcdef01234567'

const stepsOf = (payload: Record<string, unknown>) => payload.steps as Array<Record<string, unknown>>
const rolesOf = (payload: Record<string, unknown>) => (payload.roles ?? {}) as Record<string, unknown>

describe('applyOps — every op kind applies', () => {
  it('applies a mixed batch through the human gates in listed order', () => {
    const payload = basePayload()
    const ops: ProtocolEditOp[] = [
      { op: 'step_update', stepId: 's1', label: 'Lyse cells', description: 'Add 20 uL buffer.\n\nIncubate 5 min.',
        notes: 'Keep on ice.', kind: 'transfer',
        settings: [{ settingId: 'volume', label: 'Volume', type: 'volume', unit: 'uL', defaultValue: 20 }] },
      { op: 'step_delete', stepId: 's3' },
      { op: 'step_insert', afterStepId: 's1', label: 'Bind', kind: 'transfer', description: 'Bind DNA.' },
      { op: 'labware_add', roleId: 'reservoir', description: 'reservoir', expectedLabwareKinds: ['trough-1'] },
      { op: 'labware_update', roleId: 'plate', description: 'deep-well plate' },
      { op: 'labware_delete', roleId: 'trough' },
      { op: 'equipment_add', roleId: 'bead_beater', allowedInstrumentIds: ['bead-beater-1'] },
      { op: 'equipment_update', roleId: 'plate_reader', description: 'plate reader' },
      { op: 'equipment_delete', roleId: 'centrifuge' },
    ]
    const result = applyOps(payload, ops, { mint })
    const steps = stepsOf(result)
    expect(steps.map(s => s.stepId)).toEqual(['s1', 'step-0123456789abcdef01234567', 's2'])
    expect(steps.map(s => s.ordinal)).toEqual([1, 2, 3])
    expect(steps[0]).toMatchObject({
      label: 'Lyse cells', kind: 'transfer', notes: 'Keep on ice.', phaseId: 'lysis',
      description: 'Add 20 uL buffer.\n\nIncubate 5 min.',
      settings: [{ settingId: 'volume', label: 'Volume', type: 'volume', unit: 'uL', defaultValue: 20 }],
    })
    // Rich-text ruling: a description change DERIVES a consistent
    // descriptionRichText, in the SAME shape the human editor persists
    // (ProtocolStepEditModal plainTextDocument: blank-line-separated paragraphs).
    expect(steps[0]!.descriptionRichText).toEqual({
      plainText: 'Add 20 uL buffer.\n\nIncubate 5 min.',
      document: { type: 'doc', content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Add 20 uL buffer.' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Incubate 5 min.' }] },
      ] },
    })
    const inserted = steps[1]!
    expect(inserted).toMatchObject({ stepId: mint(), label: 'Bind', kind: 'transfer', description: 'Bind DNA.',
      phaseId: 'lysis', ordinal: 2 })
    expect(inserted.descriptionRichText).toEqual({
      plainText: 'Bind DNA.',
      document: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Bind DNA.' }] }] },
    })
    // Membership lists stay in sync (only declared lists are touched):
    // s3 leaves else_stepIds, the minted step joins then_stepIds after s1.
    expect(result.variants).toEqual([{ variantId: 'soil', stepIds: ['s1', mint(), 's2'] }])
    expect((result.branch_axes as Array<Record<string, unknown>>)[0]!.shared_stepIds).toEqual(['s2'])
    expect((result.branch_axes as Array<Record<string, unknown>>)[0]!.conditions).toEqual([
      { id: 'soil', then_stepIds: ['s1', mint()], else_stepIds: [] },
    ])
    expect(result.source).toEqual(basePayload().source)
    // Role ops: add appends, update changes only listed fields, delete removes;
    // sibling role lists are untouched.
    expect(rolesOf(result).labwareRoles).toEqual([
      { roleId: 'plate', description: 'deep-well plate' },
      { roleId: 'reservoir', description: 'reservoir', expectedLabwareKinds: ['trough-1'] },
    ])
    expect(rolesOf(result).instrumentRoles).toEqual([
      { roleId: 'plate_reader', description: 'plate reader' },
      { roleId: 'bead_beater', allowedInstrumentIds: ['bead-beater-1'] },
    ])
    expect(rolesOf(result).materialRoles).toEqual([{ roleId: 'lysis-buffer' }])
    // The applier is pure: the input payload is not mutated.
    expect(payload).toEqual(basePayload())
  })

  it('mints step ids in the human editor shape (step- + 24 lowercase hex)', () => {
    const result = applyOps(basePayload(), [{ op: 'step_insert', beforeStepId: 's1', label: 'Prep', kind: 'other' }])
    const inserted = stepsOf(result)[0]!
    expect(String(inserted.stepId)).toMatch(/^step-[a-f0-9]{24}$/)
    expect(inserted.label).toBe('Prep')
  })

  it('PROTO-AI-9: copies step_insert payload fields through EXPLICITLY onto the minted step — and never leaks op/anchor keys', () => {
    const washInsert = {
      op: 'step_insert', afterStepId: 's1', label: 'Wash beads', kind: 'wash',
      description: 'Three washes.',
      target: { labwareRole: 'plate' }, wells: { kind: 'all' }, cycles: 3, washVolume_uL: 200,
    } satisfies ProtocolEditOp
    const result = applyOps(basePayload(), [washInsert], { mint })
    const inserted = stepsOf(result).find(s => s.stepId === mint())!
    // Payload rides the record step: the envelope-validated insert is appliable
    // (this is exactly the wash step the server 422ed before the fix).
    expect(inserted).toMatchObject({
      stepId: mint(), label: 'Wash beads', kind: 'wash',
      description: 'Three washes.',
      target: { labwareRole: 'plate' }, wells: { kind: 'all' }, cycles: 3, washVolume_uL: 200,
    })
    expect(inserted.descriptionRichText).toEqual({
      plainText: 'Three washes.',
      document: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Three washes.' }] }] },
    })
    // Explicit picks, never a spread of the op: op/anchor keys cannot leak.
    for (const leaked of ['op', 'afterStepId', 'beforeStepId']) {
      expect(inserted).not.toHaveProperty(leaked)
    }
  })

  it('PROTO-AI-9: an insert WITHOUT a payload field copies exactly the fields present (absent fields are not invented)', () => {
    const mixInsert = {
      op: 'step_insert', afterStepId: 's1', label: 'Mix', kind: 'mix',
      target: { labwareRole: 'plate' }, wells: { kind: 'explicit', wells: ['A1'] },
    } satisfies ProtocolEditOp
    const result = applyOps(basePayload(), [mixInsert], { mint })
    const inserted = stepsOf(result).find(s => s.stepId === mint())!
    expect(inserted).toMatchObject({ kind: 'mix', target: { labwareRole: 'plate' }, wells: { kind: 'explicit', wells: ['A1'] } })
    // Absent OR value, never undefined (exactOptionalPropertyTypes discipline):
    expect(Object.prototype.hasOwnProperty.call(inserted, 'cycles')).toBe(false)
    expect(Object.prototype.hasOwnProperty.call(inserted, 'description')).toBe(false)
  })

  it('renumbers ordinals contiguously 1..N, matching the server rebuild on both live and stored ordinals', () => {
    const result = applyOps(basePayload(), [
      { op: 'step_delete', stepId: 's1' },
      { op: 'step_insert', afterStepId: 's3', label: 'Read', kind: 'read' },
    ], { mint })
    const steps = stepsOf(result)
    expect(steps.map(s => s.stepId)).toEqual(['s2', 's3', mint()])
    // Server rebuildOrdinals (protocol-steps.ts:151-156): sort by ordinal
    // ascending, re-number 1..N. The applier's output must survive it unchanged.
    const rebuilt = [...steps].sort((a, b) => Number(a.ordinal) - Number(b.ordinal)).map((s, i) => ({ ...s, ordinal: i + 1 }))
    expect(rebuilt).toEqual(steps)
    expect(steps.map(s => s.ordinal)).toEqual([1, 2, 3])
  })

  it('rejects an op object that does not name a known op, naming the op index', () => {
    expect(() => applyOps(basePayload(), [{ stepId: 's1' } as unknown as ProtocolEditOp], { mint }))
      .toThrow(/op 0/)
  })
})

describe('applyOps — gate rejections name the op index', () => {
  it('last-step delete throws naming the op index', () => {
    // Un-executed fixture so the ≥1-step gate (not executedness) is what trips.
    const fresh: ReturnType<typeof basePayload> = structuredClone(basePayload())
    fresh.steps = fresh.steps.map(step => { const { executionMeta: _executionMeta, ...rest } = step as Record<string, unknown>; return rest }) as unknown as typeof fresh.steps
    expect(() => applyOps(fresh, [
      { op: 'step_delete', stepId: 's1' },
      { op: 'step_delete', stepId: 's2' },
      { op: 'step_delete', stepId: 's3' },
    ], { mint })).toThrow(/op 2.*at least one step/s)
  })

  it('executed-step delete throws naming the op index', () => {
    expect(() => applyOps(basePayload(), [
      { op: 'step_update', stepId: 's1', label: 'Lyse cells' },
      { op: 'step_delete', stepId: 's2' },
    ], { mint })).toThrow(/op 1.*executed/s)
  })

  it('content-locked protocol throws naming the op index', () => {
    const locked = { ...basePayload(), lifecycleId: 'document-controlled-signing', state: 'effective' }
    // The lock trips on the FIRST gated op — op 0 — and the throw names it.
    expect(() => applyOps(locked, [
      { op: 'step_update', stepId: 's1', label: 'x' },
      { op: 'step_insert', afterStepId: 's1', label: 'y', kind: 'other' },
    ], { mint })).toThrow(/op 0.*locked/s)
  })

  it('duplicate stepId on insert throws naming the op index (mint collision)', () => {
    expect(() => applyOps(basePayload(), [
      { op: 'step_delete', stepId: 's3' },
      { op: 'step_insert', afterStepId: 's1', label: 'Dup', kind: 'other' },
    ], { mint: () => 's2' })).toThrow(/op 1.*already exists/s)
  })

  it('role id collision throws naming the op index', () => {
    expect(() => applyOps(basePayload(), [{ op: 'labware_add', roleId: 'plate' }], { mint }))
      .toThrow(/op 0.*already exists/s)
  })

  it('deleting a role that was never declared throws naming the op index', () => {
    expect(() => applyOps(basePayload(), [
      { op: 'step_update', stepId: 's1', label: 'ok' },
      { op: 'equipment_delete', roleId: 'ghost' },
    ], { mint })).toThrow(/op 1/)
  })

  it('inserting against a missing anchor throws naming the op index', () => {
    expect(() => applyOps(basePayload(), [
      { op: 'step_insert', beforeStepId: 'gone', label: 'x', kind: 'other' },
    ], { mint })).toThrow(/op 0.*no longer exists/s)
  })
})

describe('applyProtocolEdit — one atomic write under the human lock', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('persists the whole record in ONE updateRecord call under expectedSha', async () => {
    const payload = basePayload()
    vi.mocked(apiClient.getRecord).mockResolvedValue(record(payload) as never)
    vi.mocked(apiClient.updateRecord).mockResolvedValue({ record: record(payload, 'sha-2') } as never)
    const ops: ProtocolEditOp[] = [
      { op: 'step_delete', stepId: 's3' },
      { op: 'labware_add', roleId: 'reservoir' },
    ]
    const outcome = await applyProtocolEdit('PRT-1', ops)
    expect(apiClient.updateRecord).toHaveBeenCalledTimes(1)
    const [id, written, options] = vi.mocked(apiClient.updateRecord).mock.calls[0]!
    expect(id).toBe('PRT-1')
    expect(options).toEqual({ expectedSha: 'sha-1' })
    expect(stepsOf(written).map(s => s.stepId)).toEqual(['s1', 's2'])
    expect(rolesOf(written).labwareRoles).toEqual([
      { roleId: 'plate', description: '96-well plate' }, { roleId: 'trough' }, { roleId: 'reservoir' },
    ])
    expect(outcome.wrote).toBe(true)
  })

  it('double-accept of an update-only proposal is a no-op: zero further writes, no double mutation', async () => {
    let current = record(basePayload())
    vi.mocked(apiClient.getRecord).mockImplementation(async () => structuredClone(current) as never)
    vi.mocked(apiClient.updateRecord).mockImplementation(async (_id, written, opts) => {
      expect(opts).toEqual({ expectedSha: 'sha-1' })
      current = record(structuredClone(written), 'sha-2')
      return { record: current } as never
    })
    const ops: ProtocolEditOp[] = [
      { op: 'step_update', stepId: 's1', description: 'Add 20 uL buffer.' },
      { op: 'equipment_update', roleId: 'plate_reader', description: 'plate reader' },
    ]
    const first = await applyProtocolEdit('PRT-1', ops)
    expect(first.wrote).toBe(true)
    expect(apiClient.updateRecord).toHaveBeenCalledTimes(1)
    const second = await applyProtocolEdit('PRT-1', ops)
    expect(second.wrote).toBe(false)
    // STILL exactly one write — the second accept changed nothing.
    expect(apiClient.updateRecord).toHaveBeenCalledTimes(1)
    expect(stepsOf(second.payload)[0]).toMatchObject({ description: 'Add 20 uL buffer.' })
  })

  it('double-accept of a structural proposal is a conflict with zero writes, never a double mutation', async () => {
    // The first accept already landed: s3 deleted, Bind inserted, reservoir added.
    const seed = basePayload()
    const landed: Record<string, unknown> = structuredClone(seed)
    landed.steps = [
      { ...seed.steps[0], description: 'Add 20 uL buffer.' },
      { stepId: 'step-0123456789abcdef01234567', kind: 'transfer', label: 'Bind', phaseId: 'lysis', description: 'Bind DNA.' },
      { ...seed.steps[1] },
    ].map((s, i) => ({ ...s, ordinal: i + 1 }))
    landed.roles = { ...seed.roles, labwareRoles: [...seed.roles.labwareRoles, { roleId: 'reservoir', description: 'reservoir' }] }
    landed.variants = [{ variantId: 'soil', stepIds: ['s1', 'step-0123456789abcdef01234567', 's2'] }]
    vi.mocked(apiClient.getRecord).mockResolvedValue(record(landed, 'sha-2') as never)
    const ops: ProtocolEditOp[] = [
      { op: 'step_update', stepId: 's1', description: 'Add 20 uL buffer.' },
      { op: 'step_delete', stepId: 's3' },
      { op: 'step_insert', afterStepId: 's1', label: 'Bind', kind: 'transfer', description: 'Bind DNA.' },
      { op: 'labware_add', roleId: 'reservoir', description: 'reservoir' },
    ]
    await expect(applyProtocolEdit('PRT-1', ops, { mint })).rejects.toThrow(/op 1/)
    // Conflict: NOTHING written, payload untouched — never a double mutation.
    expect(apiClient.updateRecord).not.toHaveBeenCalled()
  })

  it('sha-conflict: surfaces the exact reload message with ZERO writes persisted', async () => {
    vi.mocked(apiClient.getRecord).mockResolvedValue(record(basePayload()) as never)
    vi.mocked(apiClient.updateRecord).mockRejectedValue(new ApiError({
      status: 409, code: 'HTTP_409',
      message: 'SHA mismatch: expected sha-1, got 9f86d081884c7d65',
    }))
    await expect(applyProtocolEdit('PRT-1', [{ op: 'step_update', stepId: 's1', label: 'Lyse cells' }]))
      .rejects.toThrowError(new Error(STALE_PROTOCOL_WRITE_MESSAGE))
    // D4: exactly one PUT was attempted and it conflicted — nothing is
    // re-queued, re-read, or retried (no auto re-propose).
    expect(apiClient.updateRecord).toHaveBeenCalledTimes(1)
    expect(apiClient.getRecord).toHaveBeenCalledTimes(1)
    expect(STALE_PROTOCOL_WRITE_MESSAGE).toBe('Someone changed this protocol - reload and try again.')
  })

  it('a gate rejection queues zero writes', async () => {
    vi.mocked(apiClient.getRecord).mockResolvedValue(record(basePayload()) as never)
    await expect(applyProtocolEdit('PRT-1', [{ op: 'step_delete', stepId: 's2' }])).rejects.toThrow(/op 0.*executed/s)
    expect(apiClient.updateRecord).not.toHaveBeenCalled()
  })
})
