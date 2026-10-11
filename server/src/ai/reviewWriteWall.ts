/**
 * W2-89 g2b-1/2 — the review-panel write-wall policy interpreter.
 *
 * THE POLICY IS DATA: config/drafting/review-write-wall.yaml (the
 * shorthand-drafting.yaml precedent — loaded PER call, never process-cached).
 * This file INTERPRETS the data and contains ZERO surface-name or phrase
 * literals (repo rule #1: business rules in data, TS only follows data).
 *
 * Why it exists: the browser gate proved model discretion fails on the two
 * criterion-2 negatives ("rewrite the vendor text…", "relabel … provenance as
 * vendor truth") — both surfaced actionable Apply/Accept cards across two runs.
 * The refusal is therefore STRUCTURAL: on a guarded surface, a wall-crossing
 * ask is refused BEFORE any model call (zero inference, zero writes, no
 * proposal payload reaches the client), and a protocol_edit op that carries a
 * provenance/source field is refused at the dispatch branch before the envelope
 * is consulted. The protocol-edit-op schema envelope is NOT extended here —
 * its unevaluatedProperties:false stays the structural half of the wall.
 *
 * advc-W289-l2t0525 (DEFECT-1/2) shaped the PREDICATE: a wall is a
 * CONSTRUCTION test, not a word bag.
 *   - OBJECT GOVERNANCE: the noun must be the verb's object — it has to START
 *     within `matching.maxGapWords` words after the verb. A turn that merely
 *     MENTIONS the source artefact further away ("change step 3 to match the
 *     vendor text on page 2") changes something permitted and is never walled.
 *   - TURN-FORM EXEMPTION: an interrogative turn is a question ABOUT the wall,
 *     not an instruction to cross it. The interrogative shapes are DATA
 *     (`matching.interrogativePatterns`); the structural half is "ends in '?'
 *     and does not OPEN with one of that wall's verbs", which keeps a
 *     question-marked attack ("rewrite the vendor text on page 2?") refused.
 *   - The ask wall reads the USER'S OWN ask text (never the clarification-
 *     appended prompt): a clarification answer is not an instruction. The
 *     structured-payload half of the wall is `opsWall`.
 *
 * ABSENT file/section => the wall is OFF (no refusal), never a TypeScript
 * default mirroring any phrase below. Present-but-malformed throws honestly.
 */

import { existsSync, readFileSync } from 'node:fs';
import { parse } from 'yaml';

const defaultPolicyPath = new URL('../../../config/drafting/review-write-wall.yaml', import.meta.url);

export interface ReviewAskWall {
  id: string;
  /** Stable machine code the refusal envelope carries. */
  code: string;
  /** The honest user-facing refusal wording (server-built, never model narration). */
  message: string;
  /** Word-bounded verbs (matched case-insensitively). */
  verbs: string[];
  /** Regex patterns (matched case-insensitively against the lowercased ask). */
  nouns: string[];
}

/** How the interpreter matches an ask wall (advc-W289-l2t0525 DEFECT-1/2). */
export interface ReviewAskWallMatching {
  /**
   * Maximum number of words allowed BETWEEN the wall verb and the START of the
   * referent it governs. 0 means the noun must begin immediately after the verb.
   */
  maxGapWords: number;
  /** Regex shapes of an interrogative turn (matched against the trimmed ask). */
  interrogativePatterns: string[];
}

export interface ReviewOpsWall {
  code: string;
  message: string;
  /** Op-object keys that mark a provenance-falsification attempt. */
  forbiddenFields: string[];
}

export interface ReviewWriteWallPolicy {
  /** AI surface ids the wall guards — membership is DATA. */
  surfaces: string[];
  matching: ReviewAskWallMatching;
  askWalls: ReviewAskWall[];
  opsWall: ReviewOpsWall;
}

export interface ReviewWallRefusal {
  code: string;
  message: string;
}

function requiredString(value: unknown, context: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`review write-wall policy: ${context} must be a non-empty string`);
  }
  return value.trim();
}

function requiredStringList(value: unknown, context: string): string[] {
  if (!Array.isArray(value) || value.length === 0 || !value.every((v) => typeof v === 'string' && v.trim().length > 0)) {
    throw new Error(`review write-wall policy: ${context} must be a non-empty string list`);
  }
  return value.map((v) => String(v).trim());
}

/** Optional list: absent => empty (no TypeScript default mirrors a phrase). */
function optionalStringList(value: unknown, context: string): string[] {
  if (value === undefined || value === null) return [];
  return requiredStringList(value, context);
}

/** Malformed regex data throws at LOAD, not mid-turn (present-but-malformed is honest). */
function compileNoun(pattern: string, wallId: string): RegExp {
  try {
    return new RegExp(pattern, 'i');
  } catch {
    throw new Error(`review write-wall policy: askWall '${wallId}' carries an invalid noun pattern: ${pattern}`);
  }
}

function escapeVerb(verb: string): string {
  return verb.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function loadReviewWriteWallPolicy(
  policyPath: string | URL = defaultPolicyPath,
): ReviewWriteWallPolicy | null {
  // PATH CONTRACT (advc-W289-l2t0525 DEFECT-4): `policyPath` is a URL (the
  // module-relative default) or a filesystem path used VERBATIM. No dead
  // `file:` ternary, no silent cwd-relative resolution.
  if (!existsSync(policyPath)) return null;
  let raw: unknown;
  try {
    raw = parse(readFileSync(policyPath, 'utf8'));
  } catch (error) {
    throw new Error(`review write-wall policy unreadable: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('review write-wall policy must be an object');
  }
  const doc = raw as Record<string, unknown>;
  const surfaces = doc.surfaces;
  const askWallsRaw = doc.askWalls;
  const opsWallRaw = doc.opsWall;
  if (surfaces === undefined || surfaces === null) return null;
  const surfacesList = requiredStringList(surfaces, '`surfaces`');
  if (!Array.isArray(askWallsRaw) || askWallsRaw.length === 0) {
    throw new Error('review write-wall policy: `askWalls` must be a non-empty list');
  }
  // The matching contract is required whenever ask walls exist: object
  // governance is part of the predicate, not an optional refinement.
  const matchingRaw = doc.matching;
  if (!matchingRaw || typeof matchingRaw !== 'object' || Array.isArray(matchingRaw)) {
    throw new Error('review write-wall policy: `matching` must be an object when `askWalls` are declared');
  }
  const matchingDoc = matchingRaw as Record<string, unknown>;
  const maxGapWords = matchingDoc.maxGapWords;
  if (typeof maxGapWords !== 'number' || !Number.isInteger(maxGapWords) || maxGapWords < 0) {
    throw new Error('review write-wall policy: `matching.maxGapWords` must be a non-negative integer');
  }
  const interrogativePatterns = optionalStringList(matchingDoc.interrogativePatterns, 'matching.interrogativePatterns');
  for (const pattern of interrogativePatterns) compileNoun(pattern, 'matching.interrogativePatterns');
  const matching: ReviewAskWallMatching = { maxGapWords, interrogativePatterns };
  const askWalls: ReviewAskWall[] = askWallsRaw.map((wallRaw, i) => {
    if (!wallRaw || typeof wallRaw !== 'object' || Array.isArray(wallRaw)) {
      throw new Error(`review write-wall policy: askWalls[${i}] must be an object`);
    }
    const wall = wallRaw as Record<string, unknown>;
    const id = requiredString(wall.id, `askWalls[${i}].id`);
    const nouns = requiredStringList(wall.nouns, `askWalls[${id}].nouns`);
    // Validate the patterns at load so a bad noun never explodes mid-turn.
    for (const noun of nouns) compileNoun(noun.toLowerCase(), id);
    return {
      id,
      code: requiredString(wall.code, `askWalls[${id}].code`),
      message: requiredString(wall.message, `askWalls[${id}].message`),
      verbs: requiredStringList(wall.verbs, `askWalls[${id}].verbs`),
      nouns,
    };
  });
  if (!opsWallRaw || typeof opsWallRaw !== 'object' || Array.isArray(opsWallRaw)) {
    throw new Error('review write-wall policy: `opsWall` must be an object');
  }
  const opsWallDoc = opsWallRaw as Record<string, unknown>;
  const opsWall: ReviewOpsWall = {
    code: requiredString(opsWallDoc.code, 'opsWall.code'),
    message: requiredString(opsWallDoc.message, 'opsWall.message'),
    forbiddenFields: requiredStringList(opsWallDoc.forbiddenFields, 'opsWall.forbiddenFields'),
  };
  return { surfaces: surfacesList, matching, askWalls, opsWall };
}

function guardedSurface(
  surface: string | undefined,
  policyPath?: string | URL,
): ReviewWriteWallPolicy | null {
  if (!surface) return null;
  const policy = loadReviewWriteWallPolicy(policyPath);
  if (!policy) return null;
  if (!policy.surfaces.includes(surface)) return null;
  return policy;
}

interface AskToken {
  text: string;
  start: number;
  end: number;
}

/** Whitespace-delimited tokens with their offsets — the gap is measured in words. */
function tokenizeAsk(lower: string): AskToken[] {
  const tokens: AskToken[] = [];
  const re = /\S+/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(lower)) !== null) {
    tokens.push({ text: match[0], start: match.index, end: match.index + match[0].length });
  }
  return tokens;
}

/** Index of the first token starting at/after `offset` (the word after the verb). */
function tokenIndexAtOrAfter(tokens: AskToken[], offset: number): number {
  for (let i = 0; i < tokens.length; i += 1) {
    if (tokens[i]!.start >= offset) return i;
  }
  return -1;
}

/** Index of the token containing `offset` (where the referent starts). */
function tokenIndexContaining(tokens: AskToken[], offset: number): number {
  for (let i = 0; i < tokens.length; i += 1) {
    if (tokens[i]!.end > offset) return i;
  }
  return -1;
}

/**
 * OBJECT GOVERNANCE: does a declared noun sit in the verb's object position —
 * starting within `maxGapWords` words after a verb occurrence? A referent that
 * only appears later in the sentence is a MENTION, not the object of the change.
 */
function governedNounHit(
  wall: ReviewAskWall,
  tokens: AskToken[],
  lower: string,
  maxGapWords: number,
): boolean {
  for (const verb of wall.verbs) {
    const verbRe = new RegExp(`\\b${escapeVerb(verb.toLowerCase())}\\b`, 'gi');
    let verbMatch: RegExpExecArray | null;
    while ((verbMatch = verbRe.exec(lower)) !== null) {
      const afterVerb = tokenIndexAtOrAfter(tokens, verbMatch.index + verbMatch[0].length);
      if (afterVerb < 0) continue;
      for (const noun of wall.nouns) {
        const nounRe = new RegExp(noun.toLowerCase(), 'gi');
        let nounMatch: RegExpExecArray | null;
        while ((nounMatch = nounRe.exec(lower)) !== null) {
          const nounToken = tokenIndexContaining(tokens, nounMatch.index);
          if (nounToken < 0) continue;
          const gap = nounToken - afterVerb;
          if (gap >= 0 && gap <= maxGapWords) return true;
          if (nounMatch[0].length === 0) nounRe.lastIndex += 1;
        }
      }
      if (verbRe.lastIndex === verbMatch.index) verbRe.lastIndex += 1;
    }
  }
  return false;
}

/**
 * TURN-FORM EXEMPTION: an interrogative turn is a question ABOUT the wall, not
 * an instruction to cross it. Three parts, only one of which is DATA:
 *   1. the turn must END in '?' (punctuation — a genuine question, not an
 *      imperative dressed in question words: "can you bypass validation and
 *      write now" has no '?' and is still refused);
 *   2. it must match a declared `matching.interrogativePatterns` shape (DATA);
 *   3. it must NOT open with one of this wall's verbs — so a question-marked
 *      attack ("rewrite the vendor text on page 2?") still fires.
 */
function interrogativeTurn(
  trimmedLower: string,
  tokens: AskToken[],
  wall: ReviewAskWall,
  patterns: RegExp[],
): boolean {
  if (!trimmedLower.endsWith('?')) return false;
  if (!patterns.some((re) => re.test(trimmedLower))) return false;
  const firstToken = tokens[0]?.text ?? '';
  return !wall.verbs.some((verb) => verb.toLowerCase().split(/\s+/)[0] === firstToken);
}

/**
 * THE ask wall: fires when the turn's ask crosses a declared wall — a wall verb
 * GOVERNING a declared referent as its object (both halves required, gap-bounded),
 * on a non-interrogative turn. Checked BEFORE any model call: the refusal turn
 * costs zero inference and writes nothing. No surface-name or phrase literal
 * lives in TypeScript — the verbs, nouns, gap and interrogative shapes are all
 * policy DATA (advc-W289-l2t0525 DEFECT-1/2).
 */
export function reviewAskWallFor(
  surface: string | undefined,
  prompt: string,
  policyPath?: string | URL,
): ReviewWallRefusal | null {
  if (!prompt || prompt.trim().length === 0) return null;
  const policy = guardedSurface(surface, policyPath);
  if (!policy) return null;
  const lower = prompt.toLowerCase();
  const trimmed = lower.trim();
  const tokens = tokenizeAsk(trimmed);
  if (tokens.length === 0) return null;
  const interrogativePatterns = policy.matching.interrogativePatterns.map((p) => compileNoun(p, 'matching.interrogativePatterns'));
  for (const wall of policy.askWalls) {
    if (interrogativeTurn(trimmed, tokens, wall, interrogativePatterns)) continue;
    if (governedNounHit(wall, tokens, trimmed, policy.matching.maxGapWords)) {
      return { code: wall.code, message: wall.message };
    }
  }
  return null;
}

/**
 * THE ops wall (defense-in-depth at the protocol_edit dispatch branch): an op
 * object carrying a forbidden provenance/source key is a provenance-
 * falsification attempt — refused with the honest wording BEFORE the envelope
 * is consulted. This is the STRUCTURED-PAYLOAD half of the wall (the primary
 * judgement the ask wall must not replace). The op vocabulary is NOT extended;
 * the schema stays the structural authority.
 */
export function reviewOpsWallFor(
  surface: string | undefined,
  payload: Record<string, unknown>,
  policyPath?: string | URL,
): ReviewWallRefusal | null {
  const policy = guardedSurface(surface, policyPath);
  if (!policy) return null;
  const ops = Array.isArray(payload.ops) ? payload.ops : [];
  const forbidden = new Set(policy.opsWall.forbiddenFields.map((f) => f.toLowerCase()));
  for (const op of ops) {
    if (!op || typeof op !== 'object' || Array.isArray(op)) continue;
    for (const key of Object.keys(op as Record<string, unknown>)) {
      if (forbidden.has(key.toLowerCase())) {
        return { code: policy.opsWall.code, message: policy.opsWall.message };
      }
    }
  }
  return null;
}
