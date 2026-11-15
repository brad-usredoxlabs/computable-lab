/**
 * L2-P1-EMPTY-TURN-CARD-2 / u1emptycard — the empty-turn guard's NAMED-ABSENCE card.
 * Gate defect D1 of PROMPT1-GATE-20261114T192103Z (2nd occurrence): the prompt-1 manifest
 * utterance ended "No events generated." with zero records — it must ALSO carry a typed
 * clarificationRequest declaring the NAMED ABSENCE (no client change — anchor 5).
 * REDs first: `emptyTurnAbsenceRequests` does not exist yet.
 */
import { describe, expect, it } from 'vitest';
import {
  emptyTurnAbsenceRequests,
  extractEmptyTurnLabwarePhrases,
  normalizeClarificationKind,
} from './clarifications.js';

// The prompt-1 manifest utterance, verbatim (the corpus scenario this unit
// closes). The named plate is not in any store or deck.
const MANIFEST =
  'Place a Thermo Optical-Quality Imaging Plate, 384-well, black-walled, ' +
  'clear bottom (catalog number A58941) on the deck.';

// L2-P1-EMPTY-TURN-CARD-2 u3falseabsence: the stub now speaks the SHIPPED name
// tier (compiler/labwareLookup.ts:135 `name.includes(hint)`), not /phrase/i.
const HELD_RECORDS = ['Generic 96 Well Plate', 'Generic 12-Channel Reservoir', 'Cool Rack'];

/** Shipped name-tier direction: a record matches when its NAME contains the hint. */
function shippedLookup(records: string[] = HELD_RECORDS) {
  return async (hint: string): Promise<Array<{ recordId: string; title: string }>> => {
    const normalized = hint.trim().toLowerCase();
    return records
      .filter((name) => name.toLowerCase().includes(normalized))
      .map((name, index) => ({ recordId: `LAB-${index}`, title: name }));
  };
}

/** Stub lookup: a store holding ONE rack — the manifest's plate is absent. */
function stubLookup() {
  return shippedLookup(['Cool Rack']);
}

describe('L2-P1-EMPTY-TURN-CARD-2 u1emptycard - empty-turn named absence', () => {
  it('manifest sentence: the ZERO-match labware noun becomes the ONE absence request', async () => {
    const reqs = await emptyTurnAbsenceRequests(MANIFEST, stubLookup());
    expect(reqs).toHaveLength(1);
    const request = reqs[0]!;
    // The mention is the NAMED noun (original casing), naming the plate
    // phrase — or a prefix of it.
    expect(request.absence?.mention).toContain('Thermo Optical-Quality Imaging Plate');
    expect(request.absence?.reason).toBe(
      `Not in this lab's records: ${request.absence?.mention}`,
    );
    // The SAME absence vocabulary as clarificationRequestsFromAssurance
    // (clarifications.ts:257-259): server's words verbatim, options empty.
    expect(request.options).toEqual([]);
    expect(request.query).toBe(request.absence?.mention);
    expect(request.snippet).toBe(request.absence?.mention);
    // Kind normalized via normalizeClarificationKind — 'labware' (menu /l).
    expect(request.kind).toBe('labware');
    expect(request.menuProvider).toBe('/l');
  });

  it('the noun is PROBED (store/deck existence lookup only; resolution is not re-asked)', async () => {
    const calls: string[] = [];
    const lookup = async (hint: string) => {
      calls.push(hint);
      return [{ recordId: 'LAB-hit', title: 'Hit' }];
    };
    expect(await emptyTurnAbsenceRequests(MANIFEST, lookup)).toEqual([]);
    expect(calls).toContain('Thermo Optical-Quality Imaging Plate');
  });

  it('a sentence naming an EXISTING labware gets no new card (byte-unchanged)', async () => {
    const lookup = async (hint: string) =>
      /plate/i.test(hint) ? [{ recordId: 'LAB-plate-1', title: 'Plate' }] : [];
    expect(await emptyTurnAbsenceRequests('Place the Plate on the deck.', lookup)).toEqual([]);
  });

  it('every candidate matching, or none extractable, returns []', async () => {
    const allMatch = async () => [{ recordId: 'LAB-any', title: 'Any' }];
    expect(
      await emptyTurnAbsenceRequests(
        'Place a Thermo Optical-Quality Imaging Plate on the deck.',
        allMatch,
      ),
    ).toEqual([]);
    // Purely contentless (no labware noun at all): no card, no probe.
    const calls: string[] = [];
    const probing = async (hint: string) => {
      calls.push(hint);
      return [];
    };
    expect(await emptyTurnAbsenceRequests('Run it twice.', probing)).toEqual([]);
    expect(calls).toEqual([]);
  });

  it('FIX-4 (advc c1 defect 4): an UNKNOWN leading verb is never part of the mention', () => {
    // The known-verb strip only sees the sentence's first verb; "Take" leaked
    // into the mention at base ("Take the plate from the rack").
    const candidates = extractEmptyTurnLabwarePhrases(
      'Take the plate from the rack and put it on the deck.',
    );
    expect(candidates.length).toBeGreaterThanOrEqual(1);
    expect(candidates[0]).toMatch(/^plate\b/);
    expect(candidates.some((candidate) => /^Take\b/.test(candidate))).toBe(false);
    // Regression pin: the manifest sentence's candidate is byte-unchanged.
    expect(extractEmptyTurnLabwarePhrases(MANIFEST)).toEqual([
      'Thermo Optical-Quality Imaging Plate',
    ]);
  });

  it('the [Answered clarifications] trailer never leaks into a mention', async () => {
    const withAnswers = MANIFEST + '\n\n[Answered clarifications]\n- answer 1 for x: Thermo Optical-Quality Imaging Plate';
    const reqs = await emptyTurnAbsenceRequests(withAnswers, stubLookup());
    expect(reqs).toHaveLength(1);
    expect(reqs[0]!.absence?.mention).toBe('Thermo Optical-Quality Imaging Plate');
  });
});

// ---------------------------------------------------------------------------
// L2-P1-EMPTY-TURN-CARD-2 u2mentionfix — adversarial c1 defects 1-4 (FIX-1,
// FIX-2, FIX-4; FIX-3 lives beside the arm it pins, in
// AgentOrchestrator.finalAnswerEmpty.test.ts). Each leg was RED at base
// 3d2fe2bb9 (measured: candidates=[] / kind='general' / mention 'Take …').
// ---------------------------------------------------------------------------

describe('L2-P1-EMPTY-TURN-CARD-2 u2mentionfix — the phrase extractor keeps the noun', () => {
  // [sentence, the labware noun the sentence names]
  const LOCATION_PHRASES: Array<[string, string]> = [
    ['Add 10 uL to the reservoir.', 'reservoir'],
    ['Put the sample into the 96-well plate.', 'plate'],
    ['Place it in the plate.', 'plate'],
  ];

  for (const [sentence, noun] of LOCATION_PHRASES) {
    it(`FIX-1: a trailing location phrase never deletes the noun — ${sentence}`, async () => {
      // RED at base: the location strip deleted the ONLY noun → candidates=[].
      const candidates = extractEmptyTurnLabwarePhrases(sentence);
      expect(candidates.length).toBeGreaterThanOrEqual(1);
      expect(candidates[0]).toContain(noun);
      // …and the card built from it names that noun as a LABWARE ask.
      const reqs = await emptyTurnAbsenceRequests(sentence, async () => []);
      expect(reqs).toHaveLength(1);
      expect(reqs[0]!.kind).toBe('labware');
      expect(reqs[0]!.menuProvider).toBe('/l');
      expect(reqs[0]!.absence?.mention).toContain(noun);
    });
  }

  it('FIX-2: rack/vial name LABWARE records — the request is not the free-text arm', async () => {
    for (const sentence of ['Place a rack on the deck.', 'Place a vial on the deck.']) {
      // RED at base: kind='general' / menuProvider='choice' (the free-text arm,
      // which cannot bind a labware ref).
      const reqs = await emptyTurnAbsenceRequests(sentence, async () => []);
      expect(reqs).toHaveLength(1);
      expect(reqs[0]!.kind).toBe('labware');
      expect(reqs[0]!.menuProvider).toBe('/l');
      expect(reqs[0]!.entityType).toBe('labware');
    }
    // FIX-2b: the ONE shared kind mapper carries them (no parallel local list).
    expect(normalizeClarificationKind('rack')).toBe('labware');
    expect(normalizeClarificationKind('vial')).toBe('labware');
    expect(normalizeClarificationKind('cryobox')).toBe('labware');
    // 'well' is UNCHANGED: an address inside a labware record, not a record.
    expect(normalizeClarificationKind('well')).toBe('well-selection');
  });
});

// ---------------------------------------------------------------------------
// L2-P1-EMPTY-TURN-CARD-2 u3falseabsence — cycle-2 DEFECT 1: the kept-whole
// CLAUSE was probed against the SHIPPED name tier (labwareLookup.ts:135
// `name.includes(hint)`); a clause is longer than any record name, so a HELD
// labware was falsely declared absent. shippedLookup() stubs that direction.
// ---------------------------------------------------------------------------

describe('L2-P1-EMPTY-TURN-CARD-2 u3falseabsence — cycle-2 DEFECT 1: a held record is never falsely declared absent', () => {
  const HELD_TURNS = [
    'Put the sample into the 96-well plate.',
    'Add 10 uL to the reservoir.',
    'Place it in the plate.',
    'Take the plate from the rack and put it on the deck.',
  ];

  for (const sentence of HELD_TURNS) {
    it(`a turn naming HELD labware gets no card — ${sentence}`, async () => {
      // RED at 98dbc2f18: the clause hint never matches a record name → false card.
      expect(await emptyTurnAbsenceRequests(sentence, shippedLookup())).toEqual([]);
    });
  }

  it('a genuinely ABSENT labware still gets exactly one absence request', async () => {
    const reqs = await emptyTurnAbsenceRequests('Put it in the cryobox.', shippedLookup());
    expect(reqs).toHaveLength(1);
    expect(reqs[0]!.kind).toBe('labware');
    // The mention contract is UNCHANGED: the full candidate, original casing.
    expect(reqs[0]!.absence?.mention).toBe('it in the cryobox');
  });
});
