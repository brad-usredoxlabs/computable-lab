import { describe, expect, it } from 'vitest';
import {
  aliasToAppend,
  editDistance,
  normalizeTermName,
  pickExistingTerm,
  suggestExistingTerms,
} from './termReconciliation.js';

/** Brad's canonical failure: one organism, four spellings. */
const terms = [
  { id: 'TERM-fpraus-9z8y', preferredLabel: 'F prausnitzii', aliases: ['FPRAUS', 'F praus'] },
  { id: 'TERM-ethanol-1a2b', preferredLabel: 'ethanol', aliases: ['EtOH', 'ethyl alcohol'] },
];

describe('term reconciliation: link on a match, SUGGEST on a near miss', () => {
  it('normalizes spelling variants', () => {
    expect(normalizeTermName('  Ethanol ')).toBe('ethanol');
    expect(normalizeTermName('ETHYL  ALCOHOL')).toBe('ethyl alcohol');
  });

  it('links an exact preferred-label or alias match', () => {
    expect(pickExistingTerm('F Prausnitzii', terms)?.id).toBe('TERM-fpraus-9z8y');
    expect(pickExistingTerm('fpraus', terms)?.id).toBe('TERM-fpraus-9z8y');
    expect(pickExistingTerm('EtOH', terms)?.id).toBe('TERM-ethanol-1a2b');
    expect(pickExistingTerm('unobtainium', terms)).toBeNull();
    expect(pickExistingTerm('', terms)).toBeNull();
  });

  it('SUGGESTS the existing term for the typo the normalizer cannot fold', () => {
    // "f pruas" is one edit from the alias "F praus" — the whole reason the
    // decision belongs to the biologist in the review dialogue.
    const suggestions = suggestExistingTerms('f pruas', terms);
    expect(suggestions.map((s) => s.term.id)).toContain('TERM-fpraus-9z8y');
    expect(suggestions[0]!.distance).toBeLessThanOrEqual(2);
    expect(suggestions[0]!.matchedOn).toBe('F praus');
  });

  it('suggests nothing for an unrelated name', () => {
    expect(suggestExistingTerms('DMEM', terms)).toEqual([]);
    expect(suggestExistingTerms('', terms)).toEqual([]);
  });

  it('does not suggest a term for its own exact spelling (that is a link, not a suggestion)', () => {
    expect(suggestExistingTerms('FPRAUS', terms)).toEqual([]);
  });

  it('measures edits boundedly', () => {
    expect(editDistance('praus', 'pruas', 2)).toBe(2);
    expect(editDistance('far', 'away', 2)).toBeGreaterThan(2);
  });

  it('adds the confirmed spelling to aliases, and only when it is new', () => {
    expect(aliasToAppend(terms[0]!, 'f pruas')).toBe('f pruas');        // the draft's typo
    expect(aliasToAppend(terms[0]!, 'F praus')).toBeNull();             // already an alias
    expect(aliasToAppend(terms[0]!, 'FPRAUS')).toBeNull();              // already an alias
    expect(aliasToAppend(terms[0]!, '  f prausnitzii ')).toBeNull();    // is the label
    expect(aliasToAppend(terms[0]!, '   ')).toBeNull();
  });

  it('the four spellings converge on ONE term after confirmation', () => {
    // Simulate the review dialogue answering for each spelling in turn.
    let term = terms[0]!;
    for (const spelling of ['FPRAUS', 'F praus', 'f pruas']) {
      const linked = pickExistingTerm(spelling, [term]);
      if (linked) continue;                       // exact/alias → nothing to add
      const suggestion = suggestExistingTerms(spelling, [term])[0];
      expect(suggestion?.term.id).toBe(term.id);
      const alias = aliasToAppend(term, spelling); // the biologist chose "use existing"
      if (alias) term = { ...term, aliases: [...(term.aliases ?? []), alias] };
    }
    expect(term.id).toBe('TERM-fpraus-9z8y');
    expect(term.aliases).toEqual(['FPRAUS', 'F praus', 'f pruas']);
    // …and the next occurrence links with no dialogue at all
    expect(pickExistingTerm('f pruas', [term])?.id).toBe('TERM-fpraus-9z8y');
  });
});
