/**
 * L2-P1-EMPTY-TURN-CARD-2 / u1emptycard — the empty-turn guard's NAMED-ABSENCE card.
 * Gate defect D1 of PROMPT1-GATE-20261114T192103Z (2nd occurrence): the prompt-1 manifest
 * utterance ended "No events generated." with zero records — it must ALSO carry a typed
 * clarificationRequest declaring the NAMED ABSENCE (no client change — anchor 5).
 * REDs first: `emptyTurnAbsenceRequests` does not exist yet.
 */
import { describe, expect, it } from 'vitest';
import { emptyTurnAbsenceRequests } from './clarifications.js';

// The prompt-1 manifest utterance, verbatim (the corpus scenario this unit
// closes). The named plate is not in any store or deck.
const MANIFEST =
  'Place a Thermo Optical-Quality Imaging Plate, 384-well, black-walled, ' +
  'clear bottom (catalog number A58941) on the deck.';

/** Stub lookup: the named plate phrase resolves to nothing, nothing else. */
function stubLookup() {
  return async (hint: string): Promise<Array<{ recordId: string; title: string }>> =>
    /Thermo Optical-Quality Imaging Plate/i.test(hint) ? [] : [{ recordId: 'LAB-x', title: 'X' }];
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

  it('the [Answered clarifications] trailer never leaks into a mention', async () => {
    const withAnswers = MANIFEST + '\n\n[Answered clarifications]\n- answer 1 for x: Thermo Optical-Quality Imaging Plate';
    const reqs = await emptyTurnAbsenceRequests(withAnswers, stubLookup());
    expect(reqs).toHaveLength(1);
    expect(reqs[0]!.absence?.mention).toBe('Thermo Optical-Quality Imaging Plate');
  });
});
