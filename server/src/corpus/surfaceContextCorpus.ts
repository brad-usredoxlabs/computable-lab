/**
 * surfaceContextCorpus — build + locally capture SurfaceContext→accepted
 * corpus pairs (phase 5, Tasks 5.2 + 5.3).
 *
 * A corpus pair is: { prompt (incl. the SurfaceContext payload) → accepted
 * next-surface/action }. This module has NO networking — everything is a pure
 * builder + an opt-in local JSONL writer (so tests / a weekend smoke pass can
 * capture without depending on the cl-appliance corpus-service).
 *
 * The local capture is gated by an env toggle (CLA_CORPUS_LOCAL_PATH) so it
 * never fires during normal dev — explicitly opt-in, mirroring corpus.enabled.
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { buildCorpusEntry } from './CorpusClient.js';
import type { SurfaceContext } from '../surfaceContext/SurfaceContext.js';
import { toJson } from '../surfaceContext/serialization.js';

/** Resolve the opt-in local capture path ('' when unset → no local capture). */
export function resolveLocalCorpusPath(env = process.env): string {
  return env.CLA_CORPUS_LOCAL_PATH?.trim() ?? '';
}

export interface SurfaceContextCorpusInput {
  surfaceContext: SurfaceContext;
  /** The user/AI goal (may differ from ctx.prompt if a wrapper added framing). */
  goal?: string;
  acceptedGraph: Record<string, unknown>; // Record to avoid cloning
  confirmedBy?: 'accepted-EVG' | 'human-gold' | 'user';
}

/**
 * Build the anonymized corpus entry for a confirmed SurfaceContext round-trip.
 * The prompt embeds the deterministic YAML of the SurfaceContext so a small
 * model sees "surface × selection → accepted action" as one training example.
 */
export function buildSurfaceContextCorpusEntry(input: SurfaceContextCorpusInput): Record<string, unknown> {
  return buildCorpusEntry({
    source: 'Surface-context',
    sourceType: 'app',
    prompt: {
      user: input.goal ?? input.surfaceContext.prompt,
      surfaceContext: JSON.parse(toJson(input.surfaceContext)) as Record<string, unknown>,
    },
    acceptedGraph: input.acceptedGraph,
    confirmedBy: input.confirmedBy ?? 'accepted-EVG',
  });
}

/**
 * Best-effort local JSONL capture of a confirmed pair. No-op (returns false)
 * when the env toggle is unset. Returns true when a line was appended.
 */
export function captureSurfaceContextPairToLocal(input: SurfaceContextCorpusInput, pathOverride?: string): boolean {
  const resolved = pathOverride ?? resolveLocalCorpusPath();
  if (!resolved) return false;
  try {
    const entry = buildSurfaceContextCorpusEntry(input);
    const line = `${JSON.stringify(entry)}\n`;
    // ensure the parent dir exists (e.g. a temp dir on first write)
    mkdirSync(dirname(resolved), { recursive: true });
    appendFileSync(resolved, line, 'utf8');
    return true;
  } catch {
    return false;
  }
}