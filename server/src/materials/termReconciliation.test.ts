import { describe, expect, it } from 'vitest';
import { aliasToAppend, editDistance, normalizeTermName, suggestExistingTerms } from './termReconciliation.js';

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

  it('offers nothing when the spelling already matches exactly — the spine links that', () => {
    expect(suggestExistingTerms('F Prausnitzii', terms)).toEqual([]);
    expect(suggestExistingTerms('fpraus', terms)).toEqual([]);
    expect(suggestExistingTerms('EtOH', terms)).toEqual([]);
    expect(suggestExistingTerms('unobtainium', terms)).toEqual([]);
    expect(suggestExistingTerms('', terms)).toEqual([]);
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

  it('the typo converges on ONE term once the biologist confirms it', () => {
    // The spine resolves FPRAUS and F praus (they are aliases). Only the typo
    // reaches the dialogue, and confirming it appends the spelling.
    let term = terms[0]!;
    expect(suggestExistingTerms('f pruas', [term])[0]!.term.id).toBe(term.id);
    const alias = aliasToAppend(term, 'f pruas');
    expect(alias).toBe('f pruas');
    term = { ...term, aliases: [...(term.aliases ?? []), alias!] };
    expect(term.aliases).toEqual(['FPRAUS', 'F praus', 'f pruas']);
    // …and with the alias recorded, nothing is suggested (the spine now has it).
    expect(suggestExistingTerms('f pruas', [term])).toEqual([]);
  });
});
