/**
 * W2-9 g2d FINAL CYCLE (architect ruling
 * W29-g2d-wall-mechanism-decision-l2t1040) — the STRUCTURAL RETARGET GATE.
 *
 * The invariant the g2d leg actually guards is payload-side: a protocol-review
 * turn must not end with a workspace focus/open or a protocol-edit proposal
 * bound to a protocol record OTHER than the one under review. That is
 * decidable on the payload at the dispatch branches — it needs no grammar,
 * cannot be quoted around, and respects "things that can be data": the refusal
 * wording and the id-shape pattern live in
 * config/drafting/review-write-wall.yaml (`opsWall.attachedMismatchRule`);
 * this module INTERPRETS the data and contains ZERO surface-name or phrase
 * literals (repo rule #1). The interpreter compares an id against the attached
 * context id and makes no policy decision.
 *
 * The rule rides the SAME data-declared-list validation pattern as
 * `opsWall.targetIdRules` (the W2-89 cycle-3 FIX-4 precedent,
 * reviewWriteWall.ts:245-270): a present rule object is validated at LOAD —
 * required strings, the pattern COMPILES at load so a malformed one throws
 * honestly, never mid-turn. ABSENT `attachedMismatchRule` => the gate is OFF
 * (no refusal), never a TypeScript default mirroring any phrase. Absent file
 * => OFF. Present-but-malformed throws honestly.
 *
 * WHY THIS MODULE EXISTS BESIDE THE FROZEN INTERPRETER:
 * reviewWriteWall.ts is byte-frozen (the W2-89 c4 freeze, proven by the empty
 * diff vs e1b62bd6), so the new opsWall section gets its own loader here,
 * following the shorthandDrafting.ts / analysisReferenceGrounding.ts house
 * pattern (load PER call, never process-cached). The ask-wall predicate and
 * the ops-wall predicate in the frozen file are UNTOUCHED; the prose wall
 * stays exactly where its evidence puts it — a FRICTION layer that answers
 * honest phrasings kindly before the model at zero inference cost — while
 * this gate carries the enforced invariant.
 */

import { existsSync, readFileSync } from 'node:fs';
import { parse } from 'yaml';

const defaultPolicyPath = new URL('../../../config/drafting/review-write-wall.yaml', import.meta.url);

export interface AttachedMismatchRule {
  /** Regex the payload/target id is tested against (compiled at load). */
  protocolIdPattern: string;
  /** Stable machine code the refusal envelope carries. */
  code: string;
  /** The honest user-facing refusal wording (server-built, never model narration). */
  message: string;
}

export interface AttachedMismatchPolicy {
  /** AI surface ids the gate guards — membership is DATA (the wall's `surfaces`). */
  surfaces: string[];
  /** Absent => the gate is OFF (absent = OFF, the standing contract). */
  attachedMismatchRule?: AttachedMismatchRule;
}

export interface AttachedMismatchRefusal {
  code: string;
  message: string;
}

function requiredString(value: unknown, context: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`attached-protocol retarget gate policy: ${context} must be a non-empty string`);
  }
  return value.trim();
}

export function loadAttachedMismatchPolicy(
  policyPath: string | URL = defaultPolicyPath,
): AttachedMismatchPolicy | null {
  // PATH CONTRACT (the reviewWriteWall precedent): `policyPath` is a URL (the
  // module-relative default) or a filesystem path used VERBATIM.
  if (!existsSync(policyPath)) return null;
  let raw: unknown;
  try {
    raw = parse(readFileSync(policyPath, 'utf8'));
  } catch (error) {
    throw new Error(`attached-protocol retarget gate policy unreadable: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('attached-protocol retarget gate policy must be an object');
  }
  const doc = raw as Record<string, unknown>;
  const surfaces = doc.surfaces;
  if (surfaces === undefined || surfaces === null) return null;
  if (!Array.isArray(surfaces) || surfaces.length === 0 || !surfaces.every((s) => typeof s === 'string' && s.trim().length > 0)) {
    throw new Error('attached-protocol retarget gate policy: `surfaces` must be a non-empty string list');
  }
  const opsWallRaw = doc.opsWall;
  if (opsWallRaw === undefined || opsWallRaw === null) {
    return { surfaces: surfaces.map((s) => String(s).trim()) };
  }
  if (typeof opsWallRaw !== 'object' || Array.isArray(opsWallRaw)) {
    throw new Error('attached-protocol retarget gate policy: `opsWall` must be an object');
  }
  // The gate rule (ruling l2t1040): absent => OFF, same contract as
  // `opsWall.targetIdRules`. The pattern compiles at LOAD so a malformed one
  // throws honestly, not mid-turn.
  const ruleRaw = (opsWallRaw as Record<string, unknown>).attachedMismatchRule;
  if (ruleRaw === undefined || ruleRaw === null) {
    return { surfaces: surfaces.map((s) => String(s).trim()) };
  }
  if (typeof ruleRaw !== 'object' || Array.isArray(ruleRaw)) {
    throw new Error('attached-protocol retarget gate policy: `opsWall.attachedMismatchRule` must be an object');
  }
  const rule = ruleRaw as Record<string, unknown>;
  const pattern = requiredString(rule.protocolIdPattern, 'opsWall.attachedMismatchRule.protocolIdPattern');
  try {
    new RegExp(pattern);
  } catch {
    throw new Error(`attached-protocol retarget gate policy: opsWall.attachedMismatchRule carries an invalid protocolIdPattern: ${pattern}`);
  }
  return {
    surfaces: surfaces.map((s) => String(s).trim()),
    attachedMismatchRule: {
      protocolIdPattern: pattern,
      code: requiredString(rule.code, 'opsWall.attachedMismatchRule.code'),
      message: requiredString(rule.message, 'opsWall.attachedMismatchRule.message'),
    },
  };
}

/**
 * THE gate predicate: on a guarded surface, with an attached protocol id and a
 * DEFINED candidate id, refuse when the candidate MATCHES the declared
 * protocol-id pattern AND differs from the attached id. A candidate that does
 * not match the pattern (a draft id, a material id, an ontology CURIE) is not
 * a protocol retarget and passes — the gate discriminates by target ID shape,
 * never by sniffing wording (the targetIdRules precedent). Equal ids pass:
 * the model's explicit override of the ATTACHED protocol stays legal
 * (binding semantics unchanged, types.ts protocolEdit docs).
 */
export function attachedMismatchGateFor(
  surface: string | undefined,
  attachedProtocolId: string | undefined,
  candidateProtocolId: string | undefined,
  policyPath?: string | URL,
): AttachedMismatchRefusal | null {
  if (!surface) return null;
  if (attachedProtocolId === undefined || candidateProtocolId === undefined) return null;
  const policy = loadAttachedMismatchPolicy(policyPath);
  if (!policy) return null;
  if (!policy.surfaces.includes(surface)) return null;
  const rule = policy.attachedMismatchRule;
  if (!rule) return null;
  // Patterns compile at LOAD (malformed => honest throw there); recompile per
  // call mirrors the load-per-call contract, never a cached default.
  if (!new RegExp(rule.protocolIdPattern).test(candidateProtocolId)) return null;
  if (candidateProtocolId === attachedProtocolId) return null;
  return { code: rule.code, message: rule.message };
}
