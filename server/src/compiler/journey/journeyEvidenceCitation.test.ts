// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  CITATION_SCHEME_PREFIX,
  RULE_CITATION_EMPTY,
  RULE_CITATION_JOURNEY_ID_MISSING,
  RULE_CITATION_REVISION_INVALID,
  RULE_CITATION_SCHEME_MISSING,
  RULE_CITATION_SEPARATOR_MISSING,
  formatJourneyEvidenceCitation,
  parseJourneyEvidenceCitation,
} from './journeyEvidenceCitation.js';

describe('formatJourneyEvidenceCitation', () => {
  it('pins the exact handoff string', () => {
    expect(formatJourneyEvidenceCitation({ journey_id: 'journey-a', revision: 3 }))
      .toBe('journey-evidence:journey-a@r3');
  });

  it('keeps the scheme prefix as the declared constant', () => {
    expect(CITATION_SCHEME_PREFIX).toBe('journey-evidence:');
    expect(formatJourneyEvidenceCitation({ journey_id: 'journey-a', revision: 3 }))
      .toBe(`${CITATION_SCHEME_PREFIX}journey-a@r3`);
  });
});

describe('parseJourneyEvidenceCitation round-trip', () => {
  it('round-trips a plain journey id', () => {
    const bundle = { journey_id: 'journey-a', revision: 3 };
    expect(parseJourneyEvidenceCitation(formatJourneyEvidenceCitation(bundle)))
      .toEqual({ ok: true, journey_id: 'journey-a', revision: 3 });
  });

  it('round-trips a hostile journey id verbatim', () => {
    const journey_id = 'A@b:c/d e\u00e9\u4e2d';
    const parsed = parseJourneyEvidenceCitation(
      formatJourneyEvidenceCitation({ journey_id, revision: 42 }),
    );
    expect(parsed).toEqual({ ok: true, journey_id, revision: 42 });
  });

  it('round-trips a journey id that itself ends in an @rN marker', () => {
    const journey_id = 'scope@r7';
    const parsed = parseJourneyEvidenceCitation(
      formatJourneyEvidenceCitation({ journey_id, revision: 1 }),
    );
    expect(parsed).toEqual({ ok: true, journey_id, revision: 1 });
  });

  it('accepts large revisions without numeric conversion drift', () => {
    const parsed = parseJourneyEvidenceCitation('journey-evidence:journey-a@r1000000');
    expect(parsed).toEqual({ ok: true, journey_id: 'journey-a', revision: 1000000 });
  });
});

describe('parseJourneyEvidenceCitation refusals', () => {
  const cases: Array<{ text: string; rule: string }> = [
    { text: '', rule: RULE_CITATION_EMPTY },
    { text: 'journey-evidence:journey-a', rule: RULE_CITATION_SEPARATOR_MISSING },
    { text: 'journey-evidence:journey-a@r0', rule: RULE_CITATION_REVISION_INVALID },
    { text: 'journey-evidence:journey-a@r01', rule: RULE_CITATION_REVISION_INVALID },
    { text: 'journey-evidence:journey-a@r1.5', rule: RULE_CITATION_REVISION_INVALID },
    { text: 'journey-evidence:journey-a@r-1', rule: RULE_CITATION_REVISION_INVALID },
    { text: 'journey-evidence:@r3', rule: RULE_CITATION_JOURNEY_ID_MISSING },
    { text: 'journey:journey-a@r3', rule: RULE_CITATION_SCHEME_MISSING },
  ];

  for (const { text, rule } of cases) {
    it(`refuses ${JSON.stringify(text)} with ${rule}`, () => {
      expect(() => parseJourneyEvidenceCitation(text)).not.toThrow();
      const parsed = parseJourneyEvidenceCitation(text);
      expect(parsed).toEqual({ ok: false, rule });
      expect(parsed.ok).toBe(false);
      if (!parsed.ok) expect(parsed.rule).toMatch(/^journey_evidence_citation_/);
    });
  }
});
