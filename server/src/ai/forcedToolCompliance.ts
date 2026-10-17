/**
 * SH-QC-1S R1 — the forced-tool compliance policy (product-side DATA).
 *
 * Which forced-tool surfaces get the bounded zero-tool-call retry, the retry
 * budget, and the nudge text is DECLARED in config/drafting/forced-tool-
 * compliance.yaml (the shorthand-drafting.yaml / review-write-wall.yaml
 * precedent — loaded PER call, never process-cached, so a data edit needs no
 * stack restart). The orchestrator gates the compliance arm on policy
 * MEMBERSHIP read from this file — zero surface-name literals in TypeScript
 * (repo rule #1).
 *
 * ABSENT file/section/entry ⇒ null ⇒ NO retry (silent-off, disclosed — the
 * pre-fix behavior for unlisted surfaces). Present-but-malformed throws
 * honestly, naming the path (cue-loader parity).
 */

import { existsSync, readFileSync } from 'node:fs';
import { parse } from 'yaml';

const defaultPolicyPath = new URL('../../../config/drafting/forced-tool-compliance.yaml', import.meta.url);
/** Exported so the orchestrator can pass an explicit override or fall back to
 *  the shipped DATA file (the shorthandDrafting.ts path convention). */
export const defaultForcedToolCompliancePolicyPath = defaultPolicyPath;

export interface ForcedToolComplianceEntry {
  /** The AI surface id this compliance entry governs — membership is DATA. */
  surface: string;
  /** Bounded retry count for a zero-tool-call forced turn (keep 1). */
  maxRetries: number;
  /** The nudge text the model receives on the retry — rides here VERBATIM. */
  nudge: string;
  /** The user-visible status line emitted when the retry is requested. */
  retryStatus: string;
}

export interface ForcedToolCompliancePolicy {
  entries: ForcedToolComplianceEntry[];
  /**
   * SH-QC-1S R1: the anti-echo/anti-claim clause carried INSIDE the coerce
   * slow-path prompt (buildForcedDraftJsonPrompt) so the second call stops
   * pattern-completing on the echo. Absent ⇒ no clause (silent-off).
   */
  coerceAntiEcho?: string;
}

export function loadForcedToolCompliancePolicy(
  policyPath: string | URL = defaultPolicyPath,
): ForcedToolCompliancePolicy | null {
  const abs = typeof policyPath === 'string' && !policyPath.startsWith('file:')
    ? policyPath
    : policyPath;
  if (!existsSync(abs)) return null;
  let raw: unknown;
  try {
    raw = parse(readFileSync(abs, 'utf8'));
  } catch (error) {
    throw new Error(`forced-tool compliance policy unreadable: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`forced-tool compliance policy must be an object: ${String(abs)}`);
  }
  const record = raw as Record<string, unknown>;
  const coerceAntiEcho = record.coerceAntiEcho;
  if (coerceAntiEcho !== undefined && coerceAntiEcho !== null && typeof coerceAntiEcho !== 'string') {
    throw new Error(`forced-tool compliance policy: \`coerceAntiEcho\` must be a string: ${String(abs)}`);
  }
  const surfaces = record.surfaces;
  if (surfaces === undefined || surfaces === null) return null;
  if (!Array.isArray(surfaces)) {
    throw new Error(`forced-tool compliance policy: \`surfaces\` must be a list of per-surface entries: ${String(abs)}`);
  }
  if (surfaces.length === 0) return null;
  const entries: ForcedToolComplianceEntry[] = [];
  for (const item of surfaces) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      throw new Error(`forced-tool compliance policy: every \`surfaces\` entry must be an object: ${String(abs)}`);
    }
    const entry = item as Record<string, unknown>;
    const surface = entry.surface;
    if (typeof surface !== 'string' || surface.trim().length === 0) {
      throw new Error(`forced-tool compliance policy: entry \`surface\` must be a non-empty string: ${String(abs)}`);
    }
    const maxRetries = entry.maxRetries;
    if (typeof maxRetries !== 'number' || !Number.isInteger(maxRetries) || maxRetries < 0) {
      throw new Error(`forced-tool compliance policy: entry \`maxRetries\` must be a non-negative integer: ${String(abs)}`);
    }
    const nudge = entry.nudge;
    if (typeof nudge !== 'string' || nudge.trim().length === 0) {
      throw new Error(`forced-tool compliance policy: entry \`nudge\` must be a non-empty string: ${String(abs)}`);
    }
    const retryStatus = entry.retryStatus;
    if (typeof retryStatus !== 'string' || retryStatus.trim().length === 0) {
      throw new Error(`forced-tool compliance policy: entry \`retryStatus\` must be a non-empty string: ${String(abs)}`);
    }
    entries.push({ surface: surface.trim(), maxRetries, nudge, retryStatus });
  }
  return {
    entries,
    ...(typeof coerceAntiEcho === 'string' ? { coerceAntiEcho } : {}),
  };
}

/** Membership gate the orchestrator calls — no branch on a surface literal. */
export function forcedToolComplianceEntry(
  policy: ForcedToolCompliancePolicy | null,
  surface: string,
): ForcedToolComplianceEntry | null {
  if (!policy) return null;
  return policy.entries.find((entry) => entry.surface === surface) ?? null;
}
