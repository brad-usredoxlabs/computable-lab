/**
 * SHORTHAND-CHAT — shorthand drafting policy (product-side).
 *
 * Which chat surfaces draft events via the scientist-intent shorthand path is
 * DATA: the `surfaces:` list of config/drafting/shorthand-drafting.yaml (the
 * analysis-composition.yaml / workstate-composition.yaml precedent — loaded
 * PER call, never process-cached). The orchestrator gates the raw-events
 * refusal and the deterministic answer-fold on surface MEMBERSHIP read from
 * this file — zero surface-name literals in TypeScript (repo rule #1).
 *
 * ABSENT file/section ⇒ null ⇒ the shorthand path is off everywhere (the
 * legacy event_graph drafting stays). Present-but-malformed throws honestly.
 */

import { existsSync, readFileSync } from 'node:fs';
import { parse } from 'yaml';

const defaultPolicyPath = new URL('../../../config/drafting/shorthand-drafting.yaml', import.meta.url);

export interface ShorthandDraftingPolicy {
  /** Surface ids whose event drafting is shorthand-only — membership is DATA. */
  surfaces: string[];
}

export function loadShorthandDraftingPolicy(
  policyPath: string | URL = defaultPolicyPath,
): ShorthandDraftingPolicy | null {
  const abs = typeof policyPath === 'string' && !policyPath.startsWith('file:')
    ? policyPath
    : policyPath;
  if (!existsSync(abs)) return null;
  let raw: unknown;
  try {
    raw = parse(readFileSync(abs, 'utf8'));
  } catch (error) {
    throw new Error(`shorthand drafting policy unreadable: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('shorthand drafting policy must be an object');
  }
  const surfaces = (raw as Record<string, unknown>).surfaces;
  if (surfaces === undefined || surfaces === null) return null;
  if (!Array.isArray(surfaces) || surfaces.length === 0 || !surfaces.every((s) => typeof s === 'string' && s.trim().length > 0)) {
    throw new Error('shorthand drafting policy: `surfaces` must be a non-empty string list');
  }
  return { surfaces: surfaces.map((s) => String(s).trim()) };
}

/** Membership gate the orchestrator calls — no branch on a surface literal. */
export function surfaceDraftsShorthand(
  surface: string | undefined,
  policyPath?: string | URL,
): boolean {
  if (!surface) return false;
  const policy = loadShorthandDraftingPolicy(policyPath);
  if (!policy) return false;
  return policy.surfaces.includes(surface);
}
