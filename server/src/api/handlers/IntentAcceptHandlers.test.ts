import { describe, expect, it, vi } from 'vitest';
import { createIntentAcceptHandlers } from './IntentAcceptHandlers.js';
import { slugifyRecordLabel } from '../../compiler/material/MaterialCompiler.js';
import type { RecordEnvelope } from '../../types/RecordEnvelope.js';
import type { CreateRecordOptions } from '../../store/types.js';

/** The axisId constraint from schema/workflow/local-protocol.schema.yaml:96-98. */
const AXIS_ID_PATTERN = /^[a-z][a-z0-9-]*$/;

const created: RecordEnvelope[] = [];
const mockStore = {
  get: vi.fn(async () => null),
  getRecord: vi.fn(async () => null),
  list: vi.fn(async () => []),
  create: vi.fn(async (opts: CreateRecordOptions) => {
    created.push(opts.envelope);
    return { success: true, recordId: opts.envelope.recordId };
  }),
};

const ctx = { store: mockStore } as never;

function mockRequest(body: unknown) {
  return { body, log: { error: vi.fn() } };
}
function send() {
  const calls: Array<{ status?: number; payload?: unknown }> = [];
  let s: number | undefined;
  const r = {
    status(code: number) {
      s = code;
      return r;
    },
    send(payload: unknown) {
      calls.push({ status: s, payload });
      return r;
    },
  };
  return { r, calls };
}

const VALID = {
  sourceProtocolId: 'prt-zymo-magbead',
  sourceTitle: 'Zymo MagBead',
  title: 'Zymo MagBead for lab 7',
  localMacro: {
    intentId: 'zymo-local',
    actions: [
      { action: 'spin', rpm: 4000, duration: '5 min' },
      { action: 'add_material', source: 'MagBinding Buffer', target: 'block', volumeUl: 600 },
      { action: 'transfer', source: 'block', target: 'magstand', volumeUl: 200 },
    ],
  },
  answers: { sample_type: 'bacterial', module_type: 'rack' },
};

describe('createIntentAcceptHandlers', () => {
  it('requires sourceProtocolId + localMacro.actions', async () => {
    const h = createIntentAcceptHandlers(ctx);
    const reply = send();
    await h.accept(mockRequest({ sourceProtocolId: 'x' }) as never, reply.r as never);
    expect(reply.calls[0].status).toBe(400);
  });

  it('persists a local-protocol with inherits_from + overrides.parameters + branch_resolution', async () => {
    created.length = 0;
    const h = createIntentAcceptHandlers(ctx);
    const reply = send();
    await h.accept(mockRequest(VALID) as never, reply.r as never);

    const payload = reply.calls[0].payload as any;
    expect(payload.ok).toBe(true);
    expect(payload.localProtocol.kind).toBe('local-protocol');
    expect(payload.localProtocol.inherits_from).toMatchObject({ id: 'prt-zymo-magbead', type: 'protocol' });
    expect(payload.localProtocol.status).toBe('active');

    // overrides.parameters preserves the macro actions verbatim (Q6 training shape)
    const params = payload.localProtocol.overrides.parameters;
    expect(params).toHaveLength(3);
    expect(params[0]).toMatchObject({ action: 'spin', rpm: 4000 });
    expect(params[2]).toMatchObject({ action: 'transfer', target: 'magstand' });

    // branch_resolution from answers (W28-AXISSLUG-1 golden change: answer keys are
    // slugged on the write path, so the mock-store envelope now records hyphenated axisIds)
    expect(payload.localProtocol.branch_resolution).toHaveLength(2);
    expect(payload.localProtocol.branch_resolution[0]).toMatchObject({ axisId: 'sample-type', branchIds: ['bacterial'] });
    expect(payload.localProtocol.branch_resolution[1]).toMatchObject({ axisId: 'module-type', branchIds: ['rack'] });
    expect(payload.localProtocol.branch_resolution[0].choices).toEqual({ 'sample-type': 'bacterial' });
    expect(payload.localProtocol.branch_resolution[1].choices).toEqual({ 'module-type': 'rack' });

    // store got a valid envelope with the LPR- prefix
    expect(created).toHaveLength(1);
    expect(created[0].recordId).toMatch(/^LPR-/);
  });

  // ---- W28-AXISSLUG-1: answer-key axisIds are normalized on the accept assembly path ----

  it('DEFECT-1: slugs a model-emitted underscore answer key into a schema-valid axisId', async () => {
    created.length = 0;
    const h = createIntentAcceptHandlers(ctx);
    const reply = send();
    // Exact gate r4 request shape (receipts/W28-A5D-R3/2026-10-19_1208-r4): lysis-method first,
    // model-derived lyse_variant second -> branch_resolution[1] was the 409'ing row.
    await h.accept(mockRequest({
      ...VALID,
      answers: { 'lysis-method': 'bead-beater', 'lyse_variant': 'variant_a' },
    }) as never, reply.r as never);

    expect(created).toHaveLength(1);
    const br = (created[0].payload as any).branch_resolution;
    expect(br).toHaveLength(2);

    // row 1: the malformed model-derived key is slugged for BOTH axisId and the choices key
    expect(br[1].axisId).toBe('lyse-variant');
    expect(br[1].axisId).toMatch(AXIS_ID_PATTERN);
    expect(br[1].choices).toEqual({ 'lyse-variant': 'variant_a' });

    // row 0: an already-conforming key is byte-stable
    expect(br[0].axisId).toBe('lysis-method');
    expect(br[0].choices).toEqual({ 'lysis-method': 'bead-beater' });

    // chosen values are NEVER rewritten — branchIds stay verbatim
    expect(br[1].branchIds).toEqual(['variant_a']);
    expect(br[0].branchIds).toEqual(['bead-beater']);
    expect(br[1].matched).toBe(true);
  });

  // ---- W28-AXISSLUG-1 fix cycle 1 (advc-AXISSLUG1-c1 DEFECT): slugifyRecordLabel does
  // not guarantee a leading [a-z]. '4c_variant' -> '4c-variant' is schema-INVALID against
  // the LPR axisId pattern ^[a-z][a-z0-9-]*$ — the exact 409 this ticket targets. The
  // call-site guard must prefix a digit-leading slug with 'axis-'. ----

  it('fix1: a digit-leading answer key gets the axis- prefix so axisId matches the pattern', async () => {
    created.length = 0;
    const h = createIntentAcceptHandlers(ctx);
    const reply = send();
    await h.accept(mockRequest({
      ...VALID,
      answers: { '4c_variant': 'variant_a', '96-well_plate': 'plate_96' },
    }) as never, reply.r as never);

    expect(created).toHaveLength(1);
    const br = (created[0].payload as any).branch_resolution;
    expect(br).toHaveLength(2);

    // real-helper probes: slugifyRecordLabel('4c_variant') === '4c-variant' (invalid),
    // slugifyRecordLabel('96-well_plate') === '96-well-plate' (invalid)
    expect(slugifyRecordLabel('4c_variant')).toBe('4c-variant');
    expect(slugifyRecordLabel('96-well_plate')).toBe('96-well-plate');

    // guard fires: BOTH axisId and the choices key carry the prefixed id
    expect(br[0].axisId).toBe('axis-4c-variant');
    expect(br[0].axisId).toMatch(AXIS_ID_PATTERN);
    expect(br[0].choices).toEqual({ 'axis-4c-variant': 'variant_a' });

    expect(br[1].axisId).toBe('axis-96-well-plate');
    expect(br[1].axisId).toMatch(AXIS_ID_PATTERN);
    expect(br[1].choices).toEqual({ 'axis-96-well-plate': 'plate_96' });

    // chosen values remain byte-verbatim
    expect(br[0].branchIds).toEqual(['variant_a']);
    expect(br[1].branchIds).toEqual(['plate_96']);

    // the guard does NOT touch an already-valid key: no 'axis-' prefix on 'lysis-method'
    created.length = 0;
    const reply2 = send();
    await h.accept(mockRequest({ ...VALID, answers: { 'lysis-method': 'bead-beater' } }) as never, reply2.r as never);
    const br2 = (created[0].payload as any).branch_resolution;
    expect(br2[0].axisId).toBe('lysis-method');
    expect(br2[0].choices).toEqual({ 'lysis-method': 'bead-beater' });
  });

  it('idempotence: an already-conforming key is unchanged by the slug', () => {
    expect(slugifyRecordLabel('lysis-method')).toBe('lysis-method');
    expect(slugifyRecordLabel('sample-type')).toBe('sample-type');
  });

  it('pathological keys slug to schema-valid ids (never invalid, never throws)', async () => {
    created.length = 0;
    const h = createIntentAcceptHandlers(ctx);
    const reply = send();
    await h.accept(mockRequest({
      ...VALID,
      answers: { 'Variant B!!': 'variant_b', '!!!': 'bead-beater' },
    }) as never, reply.r as never);

    expect(created).toHaveLength(1);
    const br = (created[0].payload as any).branch_resolution;
    expect(br).toHaveLength(2);

    expect(br[0].axisId).toBe('variant-b');
    expect(br[0].choices).toEqual({ 'variant-b': 'variant_b' });

    // helper's 'unknown' fallback for a key with no alnum content
    expect(br[1].axisId).toBe('unknown');
    expect(br[1].choices).toEqual({ unknown: 'bead-beater' });

    // every emitted axisId satisfies the schema pattern directly
    for (const row of br) {
      expect(row.axisId).toMatch(AXIS_ID_PATTERN);
    }
    // chosen values still verbatim
    expect(br[0].branchIds).toEqual(['variant_b']);
    expect(br[1].branchIds).toEqual(['bead-beater']);
  });

  it('entries stay in Object.entries order and colliding slugs get their own row (no de-dup, no suffixing)', async () => {
    created.length = 0;
    const h = createIntentAcceptHandlers(ctx);
    const reply = send();
    await h.accept(mockRequest({
      ...VALID,
      answers: { 'lyse_variant': 'variant_a', 'lysis-method': 'bead-beater' },
    }) as never, reply.r as never);

    const br = (created[0].payload as any).branch_resolution;
    // order-preserving: the map's own key order drives row order
    expect(br.map((r: any) => r.axisId)).toEqual(['lyse-variant', 'lysis-method']);

    created.length = 0;
    const reply2 = send();
    await h.accept(mockRequest({
      ...VALID,
      answers: { 'lyse_variant': 'variant_a', 'Lyse Variant': 'variant_b' },
    }) as never, reply2.r as never);

    const br2 = (created[0].payload as any).branch_resolution;
    // two distinct keys that slug to the same axisId: per-row provenance, NO de-dup, NO suffix
    expect(br2).toHaveLength(2);
    expect(br2.map((r: any) => r.axisId)).toEqual(['lyse-variant', 'lyse-variant']);
    expect(br2[0].choices).toEqual({ 'lyse-variant': 'variant_a' });
    expect(br2[1].choices).toEqual({ 'lyse-variant': 'variant_b' });
    expect(br2[0].branchIds).toEqual(['variant_a']);
    expect(br2[1].branchIds).toEqual(['variant_b']);
  });

  it('no answers -> no branch_resolution key at all (regression pin)', async () => {
    created.length = 0;
    const h = createIntentAcceptHandlers(ctx);
    const reply = send();
    await h.accept(mockRequest({
      ...VALID,
      answers: undefined,
    }) as never, reply.r as never);

    expect(created).toHaveLength(1);
    expect('branch_resolution' in (created[0].payload as object)).toBe(false);

    created.length = 0;
    const reply2 = send();
    await h.accept(mockRequest({ ...VALID, answers: {} }) as never, reply2.r as never);
    expect(created).toHaveLength(1);
    expect('branch_resolution' in (created[0].payload as object)).toBe(false);
  });
});