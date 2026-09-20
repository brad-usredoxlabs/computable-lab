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
