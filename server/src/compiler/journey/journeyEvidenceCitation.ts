import type { JourneyEvidenceBundle } from './journeyEvidenceBundle.js';

export const CITATION_SCHEME_PREFIX = 'journey-evidence:';

export const RULE_CITATION_EMPTY = 'journey_evidence_citation_empty';
export const RULE_CITATION_SCHEME_MISSING = 'journey_evidence_citation_scheme_missing';
export const RULE_CITATION_SEPARATOR_MISSING = 'journey_evidence_citation_separator_missing';
export const RULE_CITATION_REVISION_INVALID = 'journey_evidence_citation_revision_invalid';
export const RULE_CITATION_JOURNEY_ID_MISSING = 'journey_evidence_citation_journey_id_missing';

export type JourneyEvidenceCitation =
  | { ok: true; journey_id: string; revision: number }
  | { ok: false; rule: string };

const REVISION_TOKEN = /^r[1-9][0-9]*$/;

/**
 * Renders the handoff citation for a journey-evidence bundle as
 * `journey-evidence:<journey_id>@r<revision>`. The journey id is emitted
 * verbatim; no sanitising or escaping is applied here.
 */
export function formatJourneyEvidenceCitation(
  bundle: Pick<JourneyEvidenceBundle, 'journey_id' | 'revision'>,
): string {
  return `${CITATION_SCHEME_PREFIX}${bundle.journey_id}@r${bundle.revision}`;
}

/**
 * Reads a handoff citation back into its bundle identity. The journey id may
 * legally contain `@`, so the split point is the LAST `@` whose suffix is a
 * revision token (`r` followed by a positive integer without leading zeros).
 * Everything before that `@` is the journey id, verbatim.
 */
export function parseJourneyEvidenceCitation(text: string): JourneyEvidenceCitation {
  if (text.length === 0) return { ok: false, rule: RULE_CITATION_EMPTY };
  if (!text.startsWith(CITATION_SCHEME_PREFIX)) {
    return { ok: false, rule: RULE_CITATION_SCHEME_MISSING };
  }

  const body = text.slice(CITATION_SCHEME_PREFIX.length);
  const parts = body.split('@');

  for (let index = parts.length - 1; index >= 1; index -= 1) {
    const token = parts[index];
    if (token === undefined || !REVISION_TOKEN.test(token)) continue;
    const journeyId = parts.slice(0, index).join('@');
    if (journeyId.length === 0) return { ok: false, rule: RULE_CITATION_JOURNEY_ID_MISSING };
    return { ok: true, journey_id: journeyId, revision: Number(token.slice(1)) };
  }

  if (parts.length < 2) return { ok: false, rule: RULE_CITATION_SEPARATOR_MISSING };
  return { ok: false, rule: RULE_CITATION_REVISION_INVALID };
}
