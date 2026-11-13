/**
 * L2-JOURNEY-CHECKPOINT-1 (unit cpschema2): every case asserts the diagnostic
 * CODE; the drift test refuses schema/TS enum divergence.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { validateCheckpoint, validateContextDelta, CHECKPOINT_STATUSES, EPISTEMIC_STATUSES, EXPECTED_RETURN_TYPES } from './checkpointContract.js';

const SCHEMA_DIR = join(fileURLToPath(new URL('.', import.meta.url)), '../../../../schema/workflow');
const load = (n: string) => parse(readFileSync(join(SCHEMA_DIR, n), 'utf8')) as Record<string, any>;
const cp = () => ({
  checkpoint_id: 'cp-1', journey_ref: 'jn-1', revision: 'r1', thread_ref: 'thr-1',
  request_anchor: { message_id: 'msg-1', verbatim_text: 'sequence the ROS panel on plate 3' },
  pending_intent: { intent_id: 'intent-1', intent_revision: 'r2' },
  unresolved_slots: [{ name: 'material', semantic_type: 'MaterialReference' }],
  origin: { surface: 'workbench', route: '/workbench', active_tab: 'plates', record_revisions: [{ record_id: 'rec-1', revision: '7' }] },
  restoration_state: { scroll: { x: 0, y: 120 } },
  expected_return_type: 'CommittedRecordReference', status: 'pending', concurrency_version: 1,
});
const entry = () => ({
  kind: 'unresolved-slot', canonical_value: 'mat-42', semantic_type: 'MaterialReference',
  source_records: [{ record_id: 'rec-9', revision: '3' }], source_journey_ref: 'jn-2', source_step_id: 's2',
  evidence: [], epistemic_status: 'observed', accepted_by: { actor: 'brad', at: '2026-11-13T06:00:00Z' },
});
const codes = (r: { valid: boolean; diagnostics?: Array<{ code: string; path: string }> }) => (r.diagnostics ?? []).map((d) => d.code);

describe('checkpointContract', () => {
  it('accepts a valid minimal checkpoint', () => {
    const r = validateCheckpoint(cp());
    expect(r.valid).toBe(true);
    if (r.valid) expect(r.checkpoint.request_anchor.verbatim_text).toBe('sequence the ROS panel on plate 3');
  });
  it("rejects empty verbatim_text with anchor-missing", () => {
    const d = cp(); d.request_anchor.verbatim_text = '';
    expect(codes(validateCheckpoint(d) as never)).toContain('anchor-missing');
  });
  it('rejects mismatched opts.messageText with anchor-not-verbatim (absent opts is NOT a failure)', () => {
    expect(validateCheckpoint(cp()).valid).toBe(true);
    const r = validateCheckpoint(cp(), { messageText: 'sequence the ROS panel on plate 4' });
    expect(codes(r as never)).toContain('anchor-not-verbatim');
    if (!r.valid) expect(r.diagnostics.find((x) => x.code === 'anchor-not-verbatim')?.path).toBe('/request_anchor/verbatim_text');
  });
  it("rejects status 'parked' with status-invalid", () => {
    const d = cp() as Record<string, unknown>; d.status = 'parked';
    expect(codes(validateCheckpoint(d) as never)).toContain('status-invalid');
  });
  it('rejects an unknown property, surfacing its instancePath in path', () => {
    const d = cp() as Record<string, unknown>; d.side_note = 'free text the schema refuses';
    const r = validateCheckpoint(d);
    expect(r.valid).toBe(false);
    if (!r.valid) { expect(codes(r)).toContain('unknown-property'); expect(r.diagnostics.find((x) => x.code === 'unknown-property')?.path).toBe('/'); }
  });
  it('rejects delta entry variants: missing epistemic_status, empty source_records, absent accepted_by, invented label', () => {
    const e1 = entry(); delete (e1 as Record<string, unknown>).epistemic_status;
    expect(codes(validateContextDelta({ delta_id: 'd', entries: [e1] }) as never)).toContain('delta-entry-incomplete');
    const e2 = entry(); e2.source_records = [];
    expect(codes(validateContextDelta({ delta_id: 'd', entries: [e2] }) as never)).toContain('source-records-empty');
    const e3 = entry(); delete (e3 as Record<string, unknown>).accepted_by;
    expect(codes(validateContextDelta({ delta_id: 'd', entries: [e3] }) as never)).toContain('delta-entry-incomplete');
    const e4 = entry() as Record<string, unknown>; e4.epistemic_status = 'vibes';
    expect(codes(validateContextDelta({ delta_id: 'd', entries: [e4] }) as never)).toContain('epistemic-status-invalid');
    expect(validateContextDelta({ delta_id: 'd', entries: [entry()] }).valid).toBe(true);
  });
  it('schema enums agree with the TS unions and the port $defs (drift fails here)', () => {
    expect(load('pending-intent-checkpoint.schema.yaml').properties.status.enum).toEqual([...CHECKPOINT_STATUSES]);
    expect(load('context-delta.schema.yaml').properties.entries.items.properties.epistemic_status.enum).toEqual([...EPISTEMIC_STATUSES]);
    const portDefs = Object.keys(load('journey-port.schema.yaml').$defs);
    expect(load('pending-intent-checkpoint.schema.yaml').properties.expected_return_type.enum).toEqual([...EXPECTED_RETURN_TYPES]);
    expect(EXPECTED_RETURN_TYPES).toEqual(portDefs);
  });
});
