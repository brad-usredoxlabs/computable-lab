import { describe, expect, it } from 'vitest';
import {
  editDistance,
  labelIsTraceable,
  nearestUserPhrase,
  repairMintedLabelsAgainstUserWords,
} from './mintLabelFidelity.js';

/** The exact report: "add 100,000 HepG2 cells to each well" → minted "HepG23". */
const USER = 'add 100,000 HepG2 cells to each well';

function minted(label: string) {
  return [{ event_type: 'add_material', details: { wells: ['A2'], material_ref: { mint: { label } } } }];
}

describe('minted labels must come from the user, not the model', () => {
  it('replaces an off-by-a-character label with the user’s own words', () => {
    const { events, notes } = repairMintedLabelsAgainstUserWords(minted('HepG23'), [USER]);
    const ref = (events[0]!.details as Record<string, unknown>).material_ref as Record<string, unknown>;
    expect((ref.mint as Record<string, unknown>).label).toBe('HepG2');
    expect(notes).toHaveLength(1);
    expect(notes[0]).toContain('HepG2');
    expect(notes[0]).toContain('HepG23');
    expect(notes[0]).toContain('did not appear in your message');
  });

  it('leaves a label the user actually wrote exactly as minted', () => {
    const { events, notes } = repairMintedLabelsAgainstUserWords(minted('HepG2 cells'), [USER]);
    const ref = (events[0]!.details as Record<string, unknown>).material_ref as Record<string, unknown>;
    expect((ref.mint as Record<string, unknown>).label).toBe('HepG2 cells');
    expect(notes).toEqual([]);
    // and it is the same object — untouched events are not rewritten
    expect(events[0]!.details).toBe(events[0]!.details);
  });

  it('never guesses when the label is far from anything the user said', () => {
    const { events, notes } = repairMintedLabelsAgainstUserWords(minted('unobtainium'), [USER]);
    const ref = (events[0]!.details as Record<string, unknown>).material_ref as Record<string, unknown>;
    expect((ref.mint as Record<string, unknown>).label).toBe('unobtainium');
    expect(notes).toEqual([]);
  });

  it('refuses an ambiguous near-match (two equally close candidates)', () => {
    // Both "HepG2" and "HepG3" are one edit from "HepG23": picking either would
    // be inventing the biologist's material.
    expect(nearestUserPhrase('HepG23', 'we have HepG2 and HepG3 stocks')).toBeNull();
  });

  it('handles the `mint:<label>` id form too', () => {
    const events = [{ event_type: 'add_material', details: { wells: ['A2'], material_ref: { kind: 'draft', id: 'mint:HepG23', label: 'HepG23' } } }];
    const { events: fixed } = repairMintedLabelsAgainstUserWords(events, [USER]);
    const ref = (fixed[0]!.details as Record<string, unknown>).material_ref as Record<string, unknown>;
    expect(ref.label).toBe('HepG2');
  });

  it('checks traceability case- and punctuation-insensitively', () => {
    expect(labelIsTraceable('hepg2', ['Add 100,000 HepG2 cells'])).toBe(true);
    expect(labelIsTraceable('HepG2 cells', ['Add 100,000 HepG2 cells.'])).toBe(true);
    expect(labelIsTraceable('HepG23', ['Add 100,000 HepG2 cells'])).toBe(false);
  });

  it('measures edits boundedly', () => {
    expect(editDistance('hepg2', 'hepg23', 2)).toBe(1);
    expect(editDistance('far', 'away', 1)).toBeGreaterThan(1);
  });

  it('is a no-op for events with no material refs at all', () => {
    const events = [{ event_type: 'mix', details: { wells: ['A1'] } }];
    const { events: out, notes } = repairMintedLabelsAgainstUserWords(events, [USER]);
    expect(out).toEqual(events);
    expect(notes).toEqual([]);
  });
});
