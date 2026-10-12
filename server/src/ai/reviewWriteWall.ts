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
 * CONSTRUCTION test, not a word bag. The W2-89 cycle-3 authority decision
 * (W2-89-write-wall-authority-decision-l2t0810, FIX-2) restructured it from
 * distance-governance to STRUCTURAL governance — two triggers, both requiring
 * verb AND noun:
 *   - ADJACENCY (OBJECT GOVERNANCE): the noun must be the verb's object — it
 *     has to START within `matching.maxGapWords` words after the verb. A turn
 *     that merely MENTIONS the source artefact further away ("change step 3 to
 *     match the vendor text on page 2") changes something permitted.
 *   - LEADING-VERB GOVERNANCE (advc-W289-c2 DEFECT-1/2): when the turn's first
 *     token — after stripping `matching.interrogativeStripPatterns` prefixes
 *     and a single trailing '?' — is one of the wall's verbs, that verb
 *     governs any declared referent that follows ANYWHERE in the turn:
 *     distance cannot be an evasion. The referent is UNREACHABLE when a
 *     `matching.leadingVerb.blockerWords` token sits between the verb and the
 *     noun match (a competing clause "rewrite the step so it reflects the
 *     vendor document" is a MENTION, not the object).
 *   - INTERROGATIVE EXEMPTION on the STRIPPED REMAINDER (replaces the old
 *     ends-in-'?' + interrogative-pattern-list + not-opening-with-verb test): a
 *     remainder OPENING with a `matching.negationTokens` word is a question
 *     ABOUT the wall and is exempt ("why can you not rewrite…" → stripped
 *     remainder opens with the negation), while a modal-prefixed imperative
 *     ("can you rewrite the vendor text on page 2?") is stripped down to its
 *     leading wall verb and FIRES.
 *   - The ask wall reads the user's ask AND the clarification-appended prompt
 *     (advc-W289-c2 DEFECT-3 closed by FIX-3): after structural governance the
 *     predicate only fires on wall-crossing CONSTRUCTIONS, so an honest picker
 *     answer cannot trip it, while an answer that IS an imperative carrying a
 *     referent is the attack and is refused. The structured-payload half of
 *     the wall is `opsWall`, whose `targetIdRules` refuse a proposal whose
 *     `protocolId` override names a SAID (CAN-) candidate record.
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

/** Leading-verb governance shape (W2-89 cycle-3 FIX-1/FIX-2). */
export interface ReviewLeadingVerbGovernance {
  /**
   * Words that BREAK the verb's governance over a later referent: a blocker
   * token between the leading verb and the noun match makes the referent a
   * MENTION (a competing clause), not the object of the change.
   */
  blockerWords: string[];
}

/** How the interpreter matches an ask wall (advc-W289-l2t0525 DEFECT-1/2, restructured by the W2-89 cycle-3 decision FIX-2). */
export interface ReviewAskWallMatching {
  /**
   * Maximum number of words allowed BETWEEN the wall verb and the START of the
   * referent it governs. 0 means the noun must begin immediately after the verb.
   * Adjacency REMAINS a trigger alongside leading-verb governance.
   */
  maxGapWords: number;
  /** Leading-verb governance (blocker words); absent => no blocker list. */
  leadingVerb?: ReviewLeadingVerbGovernance;
  /** Prefix shapes stripped (repeatedly) from the front before the leading-verb test. */
  interrogativeStripPatterns: string[];
  /** A stripped remainder OPENING with one of these is a question ABOUT the wall. */
  negationTokens: string[];
}

/** A payload-side target rule: a `protocolId` matching `pattern` is refused (FIX-4). */
export interface ReviewOpsTargetIdRule {
  /** Regex the payload's `protocolId` is tested against (compiled at load). */
  pattern: string;
  code: string;
  message: string;
}

export interface ReviewOpsWall {
  code: string;
  message: string;
  /** Op-object keys that mark a provenance-falsification attempt. */
  forbiddenFields: string[];
  /** Absent => no target rule (absent = OFF, the standing contract). */
  targetIdRules?: ReviewOpsTargetIdRule[];
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
  // Leading-verb governance (FIX-1/FIX-2): blocker words are DATA; absent =>
  // no blocker list (the trigger then has no unreachable-referent escape).
  const leadingVerbRaw = matchingDoc.leadingVerb;
  let leadingVerb: ReviewLeadingVerbGovernance | undefined;
  if (leadingVerbRaw !== undefined && leadingVerbRaw !== null) {
    if (typeof leadingVerbRaw !== 'object' || Array.isArray(leadingVerbRaw)) {
      throw new Error('review write-wall policy: `matching.leadingVerb` must be an object');
    }
    leadingVerb = {
      blockerWords: optionalStringList(
        (leadingVerbRaw as Record<string, unknown>).blockerWords,
        'matching.leadingVerb.blockerWords',
      ),
    };
  }
  // Strip prefixes and negation tokens are DATA too (absent => empty: no
  // stripping, no negation exemption — never a TypeScript default mirroring a phrase).
  const interrogativeStripPatterns = optionalStringList(matchingDoc.interrogativeStripPatterns, 'matching.interrogativeStripPatterns');
  for (const pattern of interrogativeStripPatterns) compileNoun(pattern, 'matching.interrogativeStripPatterns');
  const negationTokens = optionalStringList(matchingDoc.negationTokens, 'matching.negationTokens');
  const matching: ReviewAskWallMatching = {
    maxGapWords,
    interrogativeStripPatterns,
    negationTokens,
    ...(leadingVerb !== undefined ? { leadingVerb } : {}),
  };
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
  // Target-id rules (FIX-4): absent => no target rule (absent = OFF). Patterns
  // compile at LOAD so a malformed one throws honestly, not mid-turn.
  const targetIdRulesRaw = opsWallDoc.targetIdRules;
  let targetIdRules: ReviewOpsTargetIdRule[] | undefined;
  if (targetIdRulesRaw !== undefined && targetIdRulesRaw !== null) {
    if (!Array.isArray(targetIdRulesRaw) || targetIdRulesRaw.length === 0) {
      throw new Error('review write-wall policy: `opsWall.targetIdRules` must be a non-empty list');
    }
    targetIdRules = targetIdRulesRaw.map((ruleRaw, i) => {
      if (!ruleRaw || typeof ruleRaw !== 'object' || Array.isArray(ruleRaw)) {
        throw new Error(`review write-wall policy: opsWall.targetIdRules[${i}] must be an object`);
      }
      const rule = ruleRaw as Record<string, unknown>;
      const pattern = requiredString(rule.pattern, `opsWall.targetIdRules[${i}].pattern`);
      try {
        new RegExp(pattern);
      } catch {
        throw new Error(`review write-wall policy: opsWall.targetIdRules[${i}] carries an invalid pattern: ${pattern}`);
      }
      return {
        pattern,
        code: requiredString(rule.code, `opsWall.targetIdRules[${i}].code`),
        message: requiredString(rule.message, `opsWall.targetIdRules[${i}].message`),
      };
    });
  }
  const opsWall: ReviewOpsWall = {
    code: requiredString(opsWallDoc.code, 'opsWall.code'),
    message: requiredString(opsWallDoc.message, 'opsWall.message'),
    forbiddenFields: requiredStringList(opsWallDoc.forbiddenFields, 'opsWall.forbiddenFields'),
    ...(targetIdRules !== undefined ? { targetIdRules } : {}),
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
 * Strip `matching.interrogativeStripPatterns` prefixes (DATA: polite/modal
 * shapes) repeatedly from the front of the remainder. "can you rewrite…" is an
 * imperative in question dress — the strip exposes the leading verb.
 */
function stripInterrogativePrefixes(remainder: string, stripPatterns: RegExp[]): string {
  let rest = remainder;
  for (;;) {
    let stripped = false;
    for (const re of stripPatterns) {
      re.lastIndex = 0;
      const match = re.exec(rest);
      if (match && match[0].length > 0) {
        rest = rest.slice(match[0].length).replace(/^\s+/, '');
        stripped = true;
        break;
      }
    }
    if (!stripped || rest.length === 0) return rest;
  }
}

/** A stripped remainder OPENING with a negation token is a question ABOUT the wall. */
function opensWithNegation(firstToken: string, negationTokens: string[]): boolean {
  return negationTokens.some((token) => token.toLowerCase() === firstToken);
}

/**
 * LEADING-VERB GOVERNANCE (advc-W289-c2 DEFECT-1/2, decision FIX-2 step 4):
 * when the stripped remainder OPENS with a wall verb (word-bounded,
 * case-insensitive), that verb governs any declared referent that follows
 * ANYWHERE in the remainder — distance cannot be an evasion. The referent is
 * UNREACHABLE when a `matching.leadingVerb.blockerWords` token sits between
 * the verb and the noun match (a competing clause "rewrite the step so it
 * reflects the vendor document" is a MENTION, not the object).
 */
function leadingVerbHit(
  wall: ReviewAskWall,
  remainder: string,
  remainderTokens: AskToken[],
  blockerWords: string[],
): boolean {
  const blockers = new Set(blockerWords.map((w) => w.toLowerCase()));
  for (const verb of wall.verbs) {
    const verbRe = new RegExp(`^${escapeVerb(verb.toLowerCase())}\\b`, 'i');
    const verbMatch = verbRe.exec(remainder);
    if (!verbMatch) continue;
    const afterVerb = tokenIndexAtOrAfter(remainderTokens, verbMatch.index + verbMatch[0].length);
    if (afterVerb < 0) continue;
    for (const noun of wall.nouns) {
      const nounRe = new RegExp(noun.toLowerCase(), 'gi');
      let nounMatch: RegExpExecArray | null;
      while ((nounMatch = nounRe.exec(remainder)) !== null) {
        const nounToken = tokenIndexContaining(remainderTokens, nounMatch.index);
        if (nounToken >= 0 && nounToken >= afterVerb) {
          let blocked = false;
          for (let i = afterVerb; i < nounToken; i += 1) {
            if (blockers.has(remainderTokens[i]!.text)) {
              blocked = true;
              break;
            }
          }
          if (!blocked) return true;
        }
        if (nounMatch[0].length === 0) nounRe.lastIndex += 1;
      }
    }
  }
  return false;
}

/**
 * THE ask wall (decision FIX-2 step order): lower/trim/tokenize; drop a single
 * trailing '?' (punctuation, not a phrase); strip `interrogativeStripPatterns`
 * repeatedly → R; a negation-opening R exempts the wall; then TWO governance
 * triggers, each requiring verb AND noun: LEADING-VERB (R opens with a wall
 * verb governing a declared referent with no blocker between) and ADJACENCY
 * (`governedNounHit`, `maxGapWords`). The old ends-in-'?' interrogative
 * exemption is REMOVED — subsumed by the strip/negation handling on R. Checked
 * BEFORE any model call: the refusal turn costs zero inference and writes
 * nothing. No surface-name or phrase literal lives in TypeScript — the verbs,
 * nouns, gap, blocker words, strip shapes and negation tokens are all policy
 * DATA (advc-W289-l2t0525 DEFECT-1/2; advc-W289-c2 DEFECT-1/2).
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
  // Step 1: a single trailing '?' is punctuation — drop it before the
  // leading-verb test; adjacency still measures the full turn.
  const asked = trimmed.endsWith('?') ? trimmed.slice(0, -1).trimEnd() : trimmed;
  // Step 2: strip interrogative/polite prefixes (DATA) repeatedly → R.
  const stripPatterns = policy.matching.interrogativeStripPatterns.map((p) => compileNoun(p, 'matching.interrogativeStripPatterns'));
  const remainder = stripInterrogativePrefixes(asked, stripPatterns);
  const remainderTokens = tokenizeAsk(remainder);
  const firstToken = remainderTokens[0]?.text ?? '';
  const blockerWords = policy.matching.leadingVerb?.blockerWords ?? [];
  for (const wall of policy.askWalls) {
    // Step 3: a remainder OPENING with a negation is a question ABOUT the wall.
    if (firstToken.length > 0 && opensWithNegation(firstToken, policy.matching.negationTokens)) continue;
    // Step 4: LEADING-VERB TRIGGER (new).
    if (remainderTokens.length > 0 && leadingVerbHit(wall, remainder, remainderTokens, blockerWords)) {
      return { code: wall.code, message: wall.message };
    }
    // Step 5: ADJACENCY TRIGGER (existing, unchanged).
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
 * is consulted. This is the STRUCTURED-PAYLOAD half of the wall. The op
 * vocabulary is NOT extended; the schema stays the structural authority.
 *
 * FIX-4 backstop (decision l2t0810): after the forbiddenFields loop, a payload
 * whose `protocolId` override matches a declared `opsWall.targetIdRules[].pattern`
 * targets a SAID record (the CAN- candidate shape) and is refused with that
 * rule's code/message. Absent `targetIdRules` => no target rule (absent = OFF).
 * This is the ONLY expressible payload-side rule — it discriminates by target
 * ID shape, never by sniffing proposal wording against the SAID.
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
  const targetRules = policy.opsWall.targetIdRules;
  if (targetRules && typeof payload.protocolId === 'string') {
    for (const rule of targetRules) {
      // Patterns compile at LOAD (malformed => honest throw there); recompile
      // per call mirrors the load-per-call contract, never a cached default.
      if (new RegExp(rule.pattern).test(payload.protocolId)) {
        return { code: rule.code, message: rule.message };
      }
    }
  }
  return null;
}
