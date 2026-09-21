import { describe, expect, it } from 'vitest';
import { demandedAmounts, filterForbiddenAmountQuestions, isMaterialIdentityQuestion } from './filterModelClarifications.js';
import type { AgentClarificationRequest } from './types.js';

function request(prompt: string, over: Partial<AgentClarificationRequest> = {}): AgentClarificationRequest {
  return {
    id: 'material-1',
    kind: 'parameter',
    prompt,
    entityType: 'parameter',
    menuProvider: 'choice',
    options: [],
    ...over,
  };
}

/** The exact card Brad reported (2026-09-20). */
const seedingQuestion = request(
  'What is the desired final volume per well and the cell suspension concentration (cells/uL) for this seeding step?',
);

describe('a model-authored question may not demand what the type does not owe', () => {
  it('drops the reported seeding question for a CELL line (which owes only a count)', () => {
    const { requests, notes } = filterForbiddenAmountQuestions([seedingQuestion], ['count']);
    expect(requests).toHaveLength(0);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toContain('volume');
    expect(notes[0]).toContain('concentration');
    expect(notes[0]).toContain('count');
  });

  it('keeps the same question for a CHEMICAL, which does owe both', () => {
    const chemicallyFine = request('What concentration and volume of clofibrate should be added?');
    const { requests, notes } = filterForbiddenAmountQuestions([chemicallyFine], ['concentration', 'volume']);
    expect(requests).toHaveLength(1);
    expect(notes).toEqual([]);
  });

  it('keeps a question about the count for a cell line', () => {
    const { requests } = filterForbiddenAmountQuestions([request('How many HepG2 Cell per well?')], ['count']);
    expect(requests).toHaveLength(1);
  });

  it('never touches a question about something other than amounts', () => {
    // "which preparation / lot / plate" are the ambiguities the model MAY raise.
    const others = [
      request('Which preparation or lot of "HepG2 Cell" should this run use?'),
      request('Which plate should receive these cells?'),
    ];
    const { requests, notes } = filterForbiddenAmountQuestions(others, ['count']);
    expect(requests).toHaveLength(2);
    expect(notes).toEqual([]);
  });

  it('reads the amounts a question asks for', () => {
    expect(demandedAmounts('What is the desired final volume?')).toEqual(['volume']);
    expect(demandedAmounts('cells/uL of the suspension?')).toEqual(['concentration']);
    expect(demandedAmounts('How many cells per well?')).toEqual(['count']);
    expect(demandedAmounts('Which plate?')).toEqual([]);
  });

  it('without a declared type table, nothing is filtered (no guessing)', () => {
    const { requests, notes } = filterForbiddenAmountQuestions([seedingQuestion], null);
    expect(requests).toHaveLength(1);
    expect(notes).toEqual([]);
  });

  it('is a no-op for no requests', () => {
    expect(filterForbiddenAmountQuestions(undefined, ['count']).requests).toEqual([]);
    expect(filterForbiddenAmountQuestions([], ['count']).requests).toEqual([]);
  });
});

describe('the model may not author the material-identity question (the 2026-09-20 loop)', () => {
  /**
   * The transcript: after the biologist answered with
   * [[material:MAT-MESH-D056945|HepG2 Cell]], the SAME card came back —
   * "Which material is \"HepG2 Cell\"? Pick an ontology term or create a local
   * record." — authored by the model, copying the harness's own wording.
   */
  const identityCard = request('Which material is "HepG2 Cell"? Pick an ontology term or create a local record.', {
    kind: 'material',
    menuProvider: '/m',
  });

  it('drops it — the harness asks that question itself, exactly once', () => {
    const { requests, notes } = filterForbiddenAmountQuestions([identityCard], null);
    expect(requests).toHaveLength(0);
    expect(notes[0]).toContain('which material');
    expect(notes[0]).toContain('ungrounded');
  });

  it('drops it even when the type table is unknown (the rule is not type-dependent)', () => {
    expect(filterForbiddenAmountQuestions([identityCard], null).requests).toHaveLength(0);
    expect(filterForbiddenAmountQuestions([identityCard], ['count']).requests).toHaveLength(0);
  });

  it('KEEPS a question about which preparation/lot/aliquot — a different, allowed ask', () => {
    const narrowing = request('Which preparation or lot of "HepG2 Cell" should this run use?', { kind: 'material', menuProvider: '/m' });
    const { requests } = filterForbiddenAmountQuestions([narrowing], null);
    expect(requests).toHaveLength(1);
  });

  it('classifies the phrasing', () => {
    expect(isMaterialIdentityQuestion('Which material is "X"? Pick an ontology term or create a local record.')).toBe(true);
    expect(isMaterialIdentityQuestion('Which preparation or lot of "X" should this run use?')).toBe(false);
    expect(isMaterialIdentityQuestion('How many "X" per well?')).toBe(false);
  });
});

describe('the filter never deletes the HARNESS\'s own question', () => {
  // The gate merges its cards into clarificationRequests and the filter runs on
  // that merged list, so a pattern-matched rule deleted the very question the
  // system had just asked: the draft was held, nothing rendered, and the note
  // claimed "the system asks that itself". Observed live 2026-09-20 as
  // "success=true events=0" with no ghosted proposal and no card.
  const harness = (prompt: string) => ({
    id: 'material-1',
    kind: 'material' as const,
    prompt,
    menuProvider: '/m' as const,
    options: [],
    origin: 'harness' as const,
  });

  it('keeps the harness identity question, with no note', () => {
    const out = filterForbiddenAmountQuestions(
      [harness('Which material is "HepG2 cells"? Pick an ontology term or create a local record. (A2–H5 (32 wells))')],
      ['count'],
    );
    expect(out.requests).toHaveLength(1);
    expect(out.notes).toEqual([]);
  });

  it('keeps a harness amount question even when the type does not owe it', () => {
    const out = filterForbiddenAmountQuestions([harness('I still need volume for HepG2 Cell (A2).')], ['count']);
    expect(out.requests).toHaveLength(1);
    expect(out.notes).toEqual([]);
  });

  it('still drops the MODEL\'s copy, which is the duplicate that looped', () => {
    const out = filterForbiddenAmountQuestions(
      [{ ...harness('Which material is "HepG2 cells"? Pick an ontology term or create a local record.'), origin: 'model' as const }],
      ['count'],
    );
    expect(out.requests).toEqual([]);
    expect(out.notes).toHaveLength(1);
  });
});
