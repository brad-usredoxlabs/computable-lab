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

export interface ReviewOpsWall {
  code: string;
  message: string;
  /** Op-object keys that mark a provenance-falsification attempt. */
  forbiddenFields: string[];
}

export interface ReviewWriteWallPolicy {
  /** AI surface ids the wall guards — membership is DATA. */
  surfaces: string[];
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
  const abs = typeof policyPath === 'string' && !policyPath.startsWith('file:')
    ? policyPath
    : policyPath;
  if (!existsSync(abs)) return null;
  let raw: unknown;
  try {
    raw = parse(readFileSync(abs, 'utf8'));
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
  return { surfaces: surfacesList, askWalls, opsWall };
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

/**
 * THE ask wall: fires when the turn's ask matches a wall's verb AND noun
 * (both halves required — a legitimate MEANT-only ask never trips). Checked
 * BEFORE any model call: the refusal turn costs zero inference and writes
 * nothing. No surface-name or phrase literal lives in TypeScript.
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
  for (const wall of policy.askWalls) {
    const verbHit = wall.verbs.some((verb) =>
      new RegExp(`\\b${escapeVerb(verb.toLowerCase())}\\b`, 'i').test(lower),
    );
    if (!verbHit) continue;
    const nounHit = wall.nouns.some((noun) => compileNoun(noun.toLowerCase(), wall.id).test(lower));
    if (nounHit) return { code: wall.code, message: wall.message };
  }
  return null;
}

/**
 * THE ops wall (defense-in-depth at the protocol_edit dispatch branch): an op
 * object carrying a forbidden provenance/source key is a provenance-
 * falsification attempt — refused with the honest wording BEFORE the envelope
 * is consulted. The op vocabulary is NOT extended; the schema stays the
 * structural authority.
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
