import { describe, expect, it } from 'vitest';
import {
  clarificationRequestsFromAssurance,
  clarificationRequestsFromGaps,
  parseClarificationAnswers,
  parseClarificationRequests,
} from './clarifications.js';


describe('clarification request helpers', () => {
  it('maps unresolved material gaps to /m clarification requests', () => {
    const requests = clarificationRequestsFromGaps([
      {
        kind: 'unresolved_ref',
        message: 'Which HepG2 cells should be used?',
        details: { kind: 'material', query: 'HepG2', reason: 'ambiguous local and ontology candidates' },
      },
    ]);

    expect(requests).toEqual([
      expect.objectContaining({
        id: 'gap-1',
        kind: 'material',
        menuProvider: '/m',
        query: 'HepG2',
      }),
    ]);
  });

  it('splits compound choice clarifications and drops unsolicited inventory-source questions', () => {
    const requests = parseClarificationRequests([
      {
        id: 'general',
        kind: 'general',
        menuProvider: 'choice',
        prompt: 'Please clarify: 1. Did you mean 10% FBS in DMEM or 10% DMSO in DMEM? 2. Do you want all 96 wells of bob or a specific subset? 3. Should I search for an available HepG2 cell aliquot in inventory?',
        options: [
          { id: 'fbs', label: '10% FBS in DMEM' },
          { id: 'dmso', label: '10% DMSO in DMEM' },
          { id: 'all', label: 'All 96 wells of bob' },
          { id: 'subset', label: 'Specific subset of wells' },
        ],
      },
    ]);

    expect(requests.map((request) => request.kind)).toEqual(['parameter', 'well-selection']);
    expect(requests[0]?.options.map((option) => option.id)).toEqual(['fbs', 'dmso']);
    expect(requests[1]?.options.map((option) => option.id)).toEqual(['all', 'subset']);
  });

  it('parses answer payloads defensively', () => {
    expect(parseClarificationAnswers([
      { requestId: 'cells', optionId: 'MAT-HEPG2', label: 'HepG2 working culture', mentionToken: '[[material:MAT-HEPG2|HepG2 working culture]]' },
      { optionId: 'missing-request' },
    ])).toEqual([
      expect.objectContaining({ requestId: 'cells', optionId: 'MAT-HEPG2' }),
    ]);
  });

  // L2-P1-CREATE-DOOR-1 (unit absdoor): a binding blocker with NO candidates is
  // a NAMED unresolved slot — the request declares the absence (the blocker's
  // mention + one server-side reason), never an empty option list read as
  // "nothing to see". The reason wording is the shipped slash-menu diagnostic
  // (resolvers.ts:568, "Not in this lab's records") — one source, server-side.
  it('declares a named absence for an un-bindable noun (no candidates)', () => {
    const blocker = {
      code: 'AMBIGUOUS_BINDING',
      mention: 'a-noun-the-lab-does-not-hold',
      message: 'This lab has no such record; choose what it is.',
      candidateIds: [] as string[],
    };
    const [request] = clarificationRequestsFromAssurance([blocker]);
    expect(request).toBeTruthy();
    // The options stay empty (nothing bindable) — the miss is declared, not
    // papered over with a fake candidate (identity-by-name trap).
    expect(request!.options).toEqual([]);
    // The absence is NAMED after the blocker's mention, with a server-supplied
    // reason — not an absence:undefined hole, not a client-composed sentence.
    expect(request!.absence).toBeDefined();
    expect(request!.absence!.mention).toBe(blocker.mention);
    expect(request!.absence!.reason.length).toBeGreaterThan(0);
    expect(request!.absence!.reason).toBe(`Not in this lab's records: ${blocker.mention}`);
    // The request still carries the prompt (the blocker's message).
    expect(request!.prompt).toBe(blocker.message);
  });
});
