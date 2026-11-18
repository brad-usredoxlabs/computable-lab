// @vitest-environment node
/**
 * L2-JOURNEY-CHECKPOINT-1 (unit cpclassify): the RETURN-PAYLOAD CLASSIFICATION
 * seam. The negative (AC2) is the point: a declared request_revision forbids
 * injecting the WHOLE delta — even a perfectly good entry is not injected.
 */
import { describe, expect, it } from 'vitest';
import { classifyReturnPayload, INJECTION_REFUSALS, RETURN_DISPOSITIONS } from './returnPayloadClassification.js';
import type { ContextDelta, PendingIntentCheckpoint } from './checkpointContract.js';

type Entry = ContextDelta['entries'][number];

const checkpoint = (): PendingIntentCheckpoint => ({
  checkpoint_id: 'cp-1', journey_ref: 'jn-1', revision: 'r1', thread_ref: 'thr-1',
  request_anchor: { message_id: 'msg-1', verbatim_text: 'sequence the ROS panel on plate 3' },
  pending_intent: { intent_id: 'intent-1', intent_revision: 'r2' },
  unresolved_slots: [{ name: 'material', semantic_type: 'MaterialReference' }],
  origin: { surface: 'workbench', route: '/workbench', active_tab: 'plates', record_revisions: [{ record_id: 'rec-1', revision: '7' }] },
  restoration_state: {}, expected_return_type: 'CommittedRecordReference', status: 'pending', concurrency_version: 1,
});
const slotEntry = (semanticType: string): Entry => ({
  kind: 'unresolved-slot', canonical_value: 'mat-42', semantic_type: semanticType,
  source_records: [{ record_id: 'rec-9', revision: '3' }], source_journey_ref: 'jn-2', source_step_id: 's2',
  evidence: ['well C4 reads positive on the ROS channel'], epistemic_status: 'observed', accepted_by: { actor: 'brad', at: '2026-11-13T06:00:00Z' },
});
const additionEntry = (semanticType: string): Entry => ({ ...slotEntry(semanticType), kind: 'proposed-addition' });
const delta = (entries: Entry[], revision?: ContextDelta['request_revision']): ContextDelta =>
  ({ delta_id: 'd-1', entries, ...(revision !== undefined ? { request_revision: revision } : {}) });

describe('classifyReturnPayload (cpclassify u7)', () => {
  it('exposes exactly the two dispositions and three refusal codes', () => {
    expect(RETURN_DISPOSITIONS).toEqual(['inject', 'request_revision']);
    expect(INJECTION_REFUSALS).toEqual(['request-revision-declared', 'slot-already-set', 'slot-undetermined']);
  });
  it('AC2: declared request_revision (changed_fields [quantity]) + one good entry refuses the WHOLE delta', () => {
    const r = classifyReturnPayload(delta([slotEntry('MaterialReference')], { changed_fields: ['quantity'], reason: 'the plate count changed' }), checkpoint());
    expect(r.disposition).toBe('request_revision');
    expect(r.code).toBe('request-revision-declared');
    expect(r.refusedEntryIndexes).toEqual([]);
  });
  it('AC2: an unresolved-slot entry matching NO declared slot is slot-already-set and names its index', () => {
    const r = classifyReturnPayload(delta([slotEntry('MaterialReference'), slotEntry('AssayReference')]), checkpoint());
    expect(r.disposition).toBe('request_revision');
    expect(r.code).toBe('slot-already-set');
    expect(r.refusedEntryIndexes).toEqual([1]);
  });
  it('an entry matching exactly ONE declared slot injects, with code ABSENT', () => {
    const r = classifyReturnPayload(delta([slotEntry('MaterialReference')]), checkpoint());
    expect(r.disposition).toBe('inject');
    expect('code' in r).toBe(false);
    expect(r.refusedEntryIndexes).toEqual([]);
  });
  it('a slot name matching TWO declared slots is slot-undetermined (never guess which slot)', () => {
    const cp = checkpoint();
    cp.unresolved_slots.push({ name: 'co-material', semantic_type: 'MaterialReference' });
    const r = classifyReturnPayload(delta([slotEntry('MaterialReference')]), cp);
    expect(r.disposition).toBe('request_revision');
    expect(r.code).toBe('slot-undetermined');
    expect(r.refusedEntryIndexes).toEqual([0]);
  });
  it('a proposed-addition injects beside the request, and a bad slot among good ones names only the bad index', () => {
    const good = classifyReturnPayload(delta([additionEntry('MaterialReference')]), checkpoint());
    expect(good.disposition).toBe('inject');
    expect(good.refusedEntryIndexes).toEqual([]);
    const mixed = classifyReturnPayload(delta([slotEntry('MaterialReference'), additionEntry('AssayReference'), slotEntry('AssayReference')]), checkpoint());
    expect(mixed.disposition).toBe('request_revision');
    expect(mixed.code).toBe('slot-already-set');
    expect(mixed.refusedEntryIndexes).toEqual([2]);
  });
  it('purity: the same two documents classify identically on every call', () => {
    const d = delta([slotEntry('MaterialReference')], { changed_fields: ['targets'], reason: 'the panel changed' });
    const cp = checkpoint();
    expect(classifyReturnPayload(d, cp)).toEqual(classifyReturnPayload(d, cp));
  });
});
