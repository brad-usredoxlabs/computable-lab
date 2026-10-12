import { describe, expect, it } from 'vitest';
import { coerceToAgentIntentArgs, inferAgentIntent } from './coerceAgentIntent.js';

/** Brad's live payload: a perfect draft returned as prose, no tool call. */
const proseDraft = {
  intent: 'event_graph',
  events: [
    {
      verb: 'add_material',
      labwareId: 'req:CL:96_well_plate:mu9azzva:if7jwo',
      wells: ['A6', 'A7'],
      materials: [{ slot: 'reagent', role: 'cells', count: 10000, ref: { curie: 'mesh:D056945' } }],
      notes: 'Dispensing 10,000 HepG2 cells.',
    },
  ],
};

describe('a draft returned as prose is still a draft', () => {
  it('keeps a valid intent untouched', () => {
    expect(coerceToAgentIntentArgs(proseDraft)).toEqual(proseDraft);
  });

  it('infers event_graph from the keys alone', () => {
    const { intent, ...withoutIntent } = proseDraft;
    expect(intent).toBe('event_graph');
    expect(inferAgentIntent(withoutIntent)).toBe('event_graph');
    expect(coerceToAgentIntentArgs(withoutIntent)).toMatchObject({ intent: 'event_graph' });
  });

  it('infers create_record and deck_layout', () => {
    expect(inferAgentIntent({ records: [{ kind: 'equipment', name: 'water bath' }] })).toBe('create_record');
    expect(inferAgentIntent({ variantId: 'manual_freeform' })).toBe('deck_layout');
    // A variantId wins: that turn is a deck change, whatever else rode along.
    expect(inferAgentIntent({ variantId: 'manual_freeform', events: [] })).toBe('deck_layout');
  });

  it('refuses to guess when the args are ambiguous or unrecognisable', () => {
    expect(inferAgentIntent({ notes: 'hello' })).toBeNull();
    expect(coerceToAgentIntentArgs({ notes: 'hello' })).toBeNull();
    expect(inferAgentIntent({})).toBeNull();
  });

  it('does not overwrite a bogus intent with an inferred one silently', () => {
    // An explicitly WRONG discriminator is not "recovered" — the caller keeps its
    // retry path rather than being handed args it cannot honour.
    expect(coerceToAgentIntentArgs({ intent: 'teleport', events: [] })).toMatchObject({
      intent: 'event_graph',
    });
  });
});

/** PROTO-AI-9 recovery: the live appliance envelope, recovered from a stop turn. */
const protocolEditDraft = {
  intent: 'protocol_edit',
  ops: [
    // PROTO-AI-9 payload contract: a wash insert carries its full payload.
    {
      op: 'step_insert', label: 'Wash', kind: 'wash', afterStepId: 'step-3',
      target: { labwareRole: 'plate' }, wells: { kind: 'all' }, cycles: 3,
    },
    { op: 'step_delete', stepId: 'step-6' },
  ],
};

describe('a recovered protocol_edit envelope is an agent_intent too (PROTO-AI-9)', () => {
  it('keeps intent protocol_edit untouched', () => {
    expect(coerceToAgentIntentArgs(protocolEditDraft)).toEqual(protocolEditDraft);
  });

  it('infers protocol_edit from a bare ops envelope', () => {
    const { intent, ...withoutIntent } = protocolEditDraft;
    expect(intent).toBe('protocol_edit');
    expect(inferAgentIntent(withoutIntent)).toBe('protocol_edit');
    expect(coerceToAgentIntentArgs(withoutIntent)).toMatchObject({ intent: 'protocol_edit' });
  });

  it('stays ambiguous when ops are absent and nothing else matches', () => {
    expect(inferAgentIntent({ protocolId: 'PRT-000123' })).toBeNull();
    expect(coerceToAgentIntentArgs({ protocolId: 'PRT-000123' })).toBeNull();
  });

  it('the three existing intents regress unchanged beside the new one', () => {
    expect(inferAgentIntent({ events: [] })).toBe('event_graph');
    expect(inferAgentIntent({ records: [] })).toBe('create_record');
    expect(inferAgentIntent({ variantId: 'manual_freeform' })).toBe('deck_layout');
    // variantId still wins the tie — the deck rule is unchanged by the new key.
    expect(inferAgentIntent({ variantId: 'manual_freeform', ops: [] })).toBe('deck_layout');
  });
});
