/**
 * canonicalLabelPolicy.ts — the D3 canonical-label POLICY (CARD1-D3 ruling
 * l2t1430, §3 "WHERE THE VALUE LIVES / Policy home").
 *
 * The unbound acceptance entity's canonical label is a TWO-STAGE source owned
 * by the local-term RECORD (data in the store), never by the model, the spine,
 * or a code constant. This module carries ONLY the small POLICY that decides
 * how that source is DISPLAYED at each stage — it holds no label VALUE (that
 * would be a second vocabulary; the record stays the single vocabulary).
 *
 * Policy home, smallest justified data: ONE `canonicalLabel:` block in the
 * scientist-intent VOCABULARY data (schema/scientist-intent/
 * scientist-intent-vocabulary.yaml), under the material domain:
 *   preMintDisplay:  identity-case                     (STAGE B)
 *   mintedDisplay:   record-title                      (STAGE A)
 *   titleAdoption:   scientist-phrasing-when-key-equal (STAGE C)
 *
 * LOADED PER CALL, never process-cached (the nounShape/assumedValues law the
 * ruling names) — a data edit needs no stack restart. The cached vocabulary
 * SINGLETON (vocabulary.ts, the verb machinery) is deliberately NOT the policy
 * source: the ruling forbids a hardcoded FALLBACK policy, so an absent or
 * malformed block THROWS naming the path instead of limping on a default.
 * Zero label literals in TypeScript: the TS knows only "this value is one of
 * the declared policy tokens"; the values themselves are DATA.
 */
import { existsSync, readFileSync } from 'node:fs';
import { parse } from 'yaml';

/** The canonical-label policy for one unresolved fact's DISPLAY. Every value
 *  is a declared DATA token (the meta-schema enum is the structural authority;
 *  these are the loader's fail-loud membership set, mirroring the nounShape
 *  "TS knows only the shape" discipline — the VALUE comes from the data). */
export interface CanonicalLabelPolicy {
  /** STAGE B (pre-mint, no record exists): display the label's IDENTITY FORM
   *  (`canonicalLabelKey(fact.label)` — trimmed, whitespace-collapsed,
   *  ASCII-lowercased) and nothing else. The one-char-case model re-roll is
   *  not one canonical case to pretend at. */
  preMintDisplay: string;
  /** STAGE A (grounded, a record exists): display the record's TITLE, full
   *  stop. The identity is `recordId = localMaterialIdForLabel(fact.label)`;
   *  the ask-time lookup replaces the raw label everywhere it surfaces. */
  mintedDisplay: string;
  /** STAGE C (the transition, someone names it): the minted record's title is
   *  adopted from the SCIENTIST's own phrasing at the naming moment IF that
   *  phrasing normalizes to the same identity key; otherwise the title stays
   *  the identity form. From then on every surface reads STAGE A's title. */
  titleAdoption: string;
}

/** The declared policy tokens — the membership set the loader validates the
 *  DATA against (fail-loud). These are the legal VALUES, not a fallback: the
 *  actual policy is whatever the DATA declares, and a value outside this set
 *  (or an absent block) is an ERROR, never a silent default. */
export const CANONICAL_LABEL_POLICY_TOKENS = {
  preMintDisplay: ['identity-case'],
  mintedDisplay: ['record-title'],
  titleAdoption: ['scientist-phrasing-when-key-equal'],
} as const;

/** Default policy source: the shipped scientist-intent VOCABULARY data
 *  (module-relative, cwd-independent — the nounShape `import.meta.url`
 *  idiom). The `canonicalLabel:` block lives there, under the material
 *  domain. A distinct path (fixture injection) reads that copy's block. */
const CANONICAL_LABEL_POLICY_PATH = new URL(
  '../../../../schema/scientist-intent/scientist-intent-vocabulary.yaml',
  import.meta.url,
);

function requireToken(
  raw: unknown,
  key: string,
  allowed: readonly string[],
  displayPath: string,
): string {
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new Error(
      `canonical-label policy (${displayPath}): \`${key}\` must be a non-empty string`,
    );
  }
  if (!allowed.includes(raw)) {
    throw new Error(
      `canonical-label policy (${displayPath}): \`${key}\` is "${raw}" — ` +
        `not a declared token (allowed: ${allowed.join(', ')}); ` +
        `there is no hardcoded fallback policy`,
    );
  }
  return raw;
}

/** Load + validate the `canonicalLabel:` policy block PER call (never
 *  process-cached). Reads the vocabulary DATA fresh each call. A present-but-
 *  malformed block THROWS naming the path (an invalid policy is not an
 *  off-state); an ABSENT block also THROWS — the ruling forbids a hardcoded
 *  fallback policy, so the render path cannot limp on a default. Zero label
 *  literals in TypeScript: only the declared shape is known here. */
export function loadCanonicalLabelPolicy(
  path: URL | string = CANONICAL_LABEL_POLICY_PATH,
): CanonicalLabelPolicy {
  const displayPath = String(path);
  if (!existsSync(path)) {
    throw new Error(
      `canonical-label policy data not found: ${displayPath} — ` +
        `the scientist-intent vocabulary is required; there is no default policy`,
    );
  }
  let raw: unknown;
  try {
    raw = parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(
      `canonical-label policy data unreadable: ${error instanceof Error ? error.message : String(error)} (${displayPath})`,
    );
  }
  if (raw === undefined || raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(
      `canonical-label policy (${displayPath}): the vocabulary document must be an object`,
    );
  }
  const section = (raw as Record<string, unknown>)['canonicalLabel'];
  if (section === undefined || section === null) {
    throw new Error(
      `canonical-label policy (${displayPath}): the \`${ 'canonicalLabel' }\` block is ABSENT — ` +
        `the D3 ruling forbids a hardcoded fallback policy; declare it in the vocabulary data`,
    );
  }
  if (typeof section !== 'object' || Array.isArray(section)) {
    throw new Error(
      `canonical-label policy (${displayPath}): \`${ 'canonicalLabel' }\` must be an object`,
    );
  }
  const block = section as Record<string, unknown>;
  return {
    preMintDisplay: requireToken(block['preMintDisplay'], 'preMintDisplay', CANONICAL_LABEL_POLICY_TOKENS.preMintDisplay, displayPath),
    mintedDisplay: requireToken(block['mintedDisplay'], 'mintedDisplay', CANONICAL_LABEL_POLICY_TOKENS.mintedDisplay, displayPath),
    titleAdoption: requireToken(block['titleAdoption'], 'titleAdoption', CANONICAL_LABEL_POLICY_TOKENS.titleAdoption, displayPath),
  };
}
