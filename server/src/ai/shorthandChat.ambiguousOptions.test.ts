/**
 * L2-P1-AMBIGUOUS-OPTIONS-1 (u1opts) — gate r10 DEFECT 1 (prompt-1,
 * "Place a 96-well plate on the deck."): the engine's ambiguous-noun
 * clarification card rendered with `options: []` even though
 * `unresolvedFact.candidates` carried the engine-ordered candidate records.
 *
 * W28-OPTIONBIND-1 (ruling, scientistIntent/types.ts:119-127): a candidate
 * `ref` is the engine's STORE-BACKED record id (tier<=1 CURIE naming a
 * record; mint affordances and tier>1 hits carry none). The display mapper
 * must offer the ref-carrying candidates AS the selectable options —
 * option id = the candidate ref, option label = the candidate label, in
 * candidate order. Candidates WITHOUT a string ref render NO option
 * (anti-fabrication — pin: resolutionEngine.optionRef.test.ts:7 "an option
 * button on an engine ambiguous-noun card has no record identity to…").
 *
 * The readings arm stays byte-identical (pinned by the sameNounDedupe
 * suites); facts with no candidates keep `options: []`.
 */
import { describe, expect, it } from 'vitest';
import { clarificationsFromUnresolvedFacts } from './shorthandChat.js';
import type { ScientistIntentUnresolvedFact } from '../compiler/scientistIntent/types.js';

const LABEL = '96-well plate';

function ambiguousFact(
  candidates: Array<{ label: string; confidence?: number; ref?: string }>,
  action = 'shake',
  argument = 'labware',
): ScientistIntentUnresolvedFact {
  return {
    label: LABEL,
    reason: 'ambiguous-noun',
    candidates,
    actionLocation: { actionIndex: 0, action, argument },
  };
}

describe('clarificationsFromUnresolvedFacts — engine ambiguous-noun candidates become options', () => {
  it('the r10 shape: three ref-carrying candidates map to three options, id = ref, label = label, in candidate order', () => {
    const candidates = [
      { label: 'Generic 96-Well Plate', ref: 'lbw-def-generic-96-well-plate', tier: 1 } as never,
      { label: 'NEST 96 Well Plate 200 µL Flat', ref: 'lbw-def-opentrons-nest-96-wellplate-200ul-flat-v1', tier: 1 } as never,
      { label: 'Generic 96 Well Plate, Flat Bottom (seed)', ref: 'lbw-seed-plate-96-flat', tier: 1 } as never,
    ];
    const [card] = clarificationsFromUnresolvedFacts([ambiguousFact(candidates)]);
    expect(card.options).toHaveLength(3);
    expect(card.options.map((o) => o.id)).toEqual([
      'lbw-def-generic-96-well-plate',
      'lbw-def-opentrons-nest-96-wellplate-200ul-flat-v1',
      'lbw-seed-plate-96-flat',
    ]);
    expect(card.options.map((o) => o.label)).toEqual([
      'Generic 96-Well Plate',
      'NEST 96 Well Plate 200 µL Flat',
      'Generic 96 Well Plate, Flat Bottom (seed)',
    ]);
    // The domain-map menuProvider stays ('/l' — the search menu is still
    // offered next to the buttons) and the raw candidates ride untouched.
    expect(card.menuProvider).toBe('/l');
    expect(card.kind).toBe('labware');
    expect(card.unresolvedFact?.candidates).toEqual(candidates);
  });

  it('candidates without a string ref render NO option (anti-fabrication — no invented id)', () => {
    const candidates = [
      { label: 'Has a real ref', ref: 'lbw-seed-plate-96-flat' },
      { label: 'Tier-3 ontology hit, no ref' },
      { label: 'Mint affordance, no ref' },
      { label: 'Non-string ref', ref: 42 } as never,
    ];
    const [card] = clarificationsFromUnresolvedFacts([ambiguousFact(candidates)]);
    expect(card.options).toEqual([{ id: 'lbw-seed-plate-96-flat', label: 'Has a real ref' }]);
  });

  it('a fact with no candidates keeps options: [] and the domain menuProvider (byte-identical)', () => {
    const [card] = clarificationsFromUnresolvedFacts([
      { label: 'Enigma Broth', reason: 'ambiguous-noun', actionLocation: { actionIndex: 0, action: 'add_material', argument: 'material' } },
    ]);
    expect(card.options).toEqual([]);
    expect(card.menuProvider).toBe('/m');
    expect(card.kind).toBe('material');
  });
});
