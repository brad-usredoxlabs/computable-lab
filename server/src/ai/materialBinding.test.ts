import { describe, it, expect } from 'vitest';
import { bindMaterialAnswersToEvents, refFromMentionToken } from './materialBinding.js';
import { forceMaterialClarifications } from './forceMaterialClarifications.js';
import type { AgentClarificationAnswer } from './types.js';

/** The exact draft shape lfm-local emitted when it looped. */
function mintedDraft() {
  return {
    event_type: 'add_material',
    details: {
      labwareId: 'req:CL:96_well_plate:mu9azzva:if7jwo',
      wells: ['A1'],
      material_ref: { mint: { label: 'clofibrate', domain: 'chemical' } },
      note: '1 mM Clofibrate in DMSO',
    },
  };
}

/** The exact answer shape the picker emits for the user's message. */
const PICK: AgentClarificationAnswer = {
  requestId: 'material-1',
  label: '1 mM Clofibrate in DMSO',
  mentionToken: '[[material-spec:MSP-API-mu50x5z7|1 mM Clofibrate in DMSO]]',
  ref: {
    kind: 'record',
    id: 'MSP-API-mu50x5z7',
    type: 'material-spec',
    label: '1 mM Clofibrate in DMSO',
  },
};

describe('bindMaterialAnswersToEvents — the pick is bound, not transmitted', () => {
  it('binds the observed loop case: a material-spec answer replaces a minted ref', () => {
    const { events, bound, unbound } = bindMaterialAnswersToEvents([mintedDraft()], [PICK]);
    expect(unbound).toHaveLength(0);
    expect(bound).toHaveLength(1);
    expect(bound[0]).toMatchObject({ eventIndex: 0, field: 'material_spec_ref', source: 'ref' });
    const details = events[0]!.details as Record<string, unknown>;
    expect(details.material_spec_ref).toMatchObject({ kind: 'record', id: 'MSP-API-mu50x5z7', type: 'material-spec' });
    // exactly one authoritative claim: the minted material_ref is gone
    expect(details.material_ref).toBeUndefined();
  });

  it('and the bound event then passes the gate with no clarification at all', () => {
    // The end-to-end property: bind, then ask the net — it must not re-ask.
    const { events } = bindMaterialAnswersToEvents([mintedDraft()], [PICK]);
    const net = forceMaterialClarifications(events as unknown as Record<string, unknown>[]);
    expect(net.clarificationRequests).toHaveLength(0);
    expect(net.events).toHaveLength(1);
  });

  it('uses the request id as the join: material-2 binds the SECOND material, not the first', () => {
    // Two DIFFERENT materials, so the join is provable: the request id decides
    // which event the answer belongs to (the range fan-out only ever extends
    // within one draft material — see materialRangeClarification.test.ts).
    const events = [
      { ...mintedDraft(), details: { ...mintedDraft().details, material_ref: { mint: { label: 'rotenone' } } } },
      { ...mintedDraft(), details: { ...mintedDraft().details, material_ref: { mint: { label: 'fenofibrate' } } } },
    ];
    const { events: bound, bound: bindings } = bindMaterialAnswersToEvents(events, [
      { ...PICK, requestId: 'material-2', label: 'fenofibrate', mentionToken: '[[material-spec:MSP-fff|fenofibrate]]', ref: { kind: 'record', id: 'MSP-fff', type: 'material-spec', label: 'fenofibrate' } },
    ]);
    expect(bindings[0]!.eventIndex).toBe(1);
    expect((bound[1]!.details as Record<string, unknown>).material_spec_ref).toMatchObject({ id: 'MSP-fff' });
    expect((bound[0]!.details as Record<string, unknown>).material_ref).toBeDefined(); // untouched
  });

  it('still binds an answer that carries only a mention token (no structured ref)', () => {
    const { events, bound } = bindMaterialAnswersToEvents([mintedDraft()], [
      { requestId: 'material-1', mentionToken: '[[material-spec:MSP-API-mu50x5z7|1 mM Clofibrate in DMSO]]' },
    ]);
    expect(bound[0]).toMatchObject({ field: 'material_spec_ref', source: 'mention-token' });
    expect((events[0]!.details as Record<string, unknown>).material_spec_ref).toMatchObject({ id: 'MSP-API-mu50x5z7' });
  });

  it('writes a bare concept pick into material_ref, and never guesses between two events', () => {
    const concept: AgentClarificationAnswer = {
      requestId: 'material-1',
      mentionToken: '[[material:MAT-clofibrate-wzj2|clofibrate]]',
    };
    const single = bindMaterialAnswersToEvents([mintedDraft()], [concept]);
    expect((single.events[0]!.details as Record<string, unknown>).material_ref).toMatchObject({ id: 'MAT-clofibrate-wzj2' });

    // Two material events + an unplaceable request id + no label → UNBOUND.
    const ambiguous = bindMaterialAnswersToEvents([mintedDraft(), mintedDraft()], [
      { requestId: 'material-99', ref: { kind: 'record', id: 'MSP-x', type: 'material-spec' } },
    ]);
    expect(ambiguous.bound).toHaveLength(0);
    expect(ambiguous.unbound).toHaveLength(1);
    // …and nothing was written anywhere.
    for (const e of ambiguous.events) {
      expect((e.details as Record<string, unknown>).material_spec_ref).toBeUndefined();
    }
  });

  it('never writes a material onto a non-material event', () => {
    const events = [
      { event_type: 'move_labware', details: { labwareId: 'lw-1', to: 'bench-2' } },
      mintedDraft(),
    ];
    const { bound } = bindMaterialAnswersToEvents(events, [
      { requestId: 'material-1', ref: { kind: 'record', id: 'MSP-x', type: 'material-spec' } },
    ]);
    expect(bound[0]!.eventIndex).toBe(1);
    expect((events[0]!.details as Record<string, unknown>).material_spec_ref).toBeUndefined();
  });

  it('parses the mention token grammar the picker emits', () => {
    expect(refFromMentionToken('[[material-spec:MSP-1|1 mM Clofibrate in DMSO]]')).toEqual({
      kind: 'record', id: 'MSP-1', type: 'material-spec', label: '1 mM Clofibrate in DMSO',
    });
    expect(refFromMentionToken('[[aliquot:ALQ-9]]')).toEqual({ kind: 'record', id: 'ALQ-9', type: 'aliquot' });
    expect(refFromMentionToken('not a token')).toBeNull();
  });

  it('is a no-op without answers', () => {
    const events = [mintedDraft()];
    const { events: out, bound } = bindMaterialAnswersToEvents(events, undefined);
    expect(bound).toHaveLength(0);
    expect(out).toEqual(events);
  });
});
