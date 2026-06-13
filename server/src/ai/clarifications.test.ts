import { describe, expect, it } from 'vitest';
import { clarificationRequestsFromGaps, parseClarificationAnswers } from './clarifications.js';


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

  it('parses answer payloads defensively', () => {
    expect(parseClarificationAnswers([
      { requestId: 'cells', optionId: 'MAT-HEPG2', label: 'HepG2 working culture', mentionToken: '[[material:MAT-HEPG2|HepG2 working culture]]' },
      { optionId: 'missing-request' },
    ])).toEqual([
      expect.objectContaining({ requestId: 'cells', optionId: 'MAT-HEPG2' }),
    ]);
  });
});
