import { describe, expect, it } from 'vitest';
import { clarificationRequestsFromGaps, parseClarificationAnswers, parseClarificationRequests } from './clarifications.js';


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
});
