/**
 * CorpusClient — posts anonymized (prompt → accepted/confirmed event graph)
 * pairs to the cl-appliance Corpus Service (THE MOAT).
 *
 * This module is SELF-CONTAINED and additive: it adds a new file and does not
 * touch existing modules, so it does not conflict with in-flight work.
 *
 * The caller decides WHEN to post (accept seam: `persistAcceptedEventGraph` in
 * the frontend, or the AI-thread promote path in the server). This client only
 * builds the anonymized payload and POSTs it. Everything is best-effort: a
 * failure logs a warning and never blocks the caller.
 *
 * Config (config.yaml → `corpus:`):
 *   corpus:
 *     enabled: true
 *     serviceBaseUrl: http://127.0.0.1:8790   # cl-appliance corpus-service
 *     # (optional) anonymize: true             # strip internal IDs (default true)
 */
import { randomUUID } from 'node:crypto';

export interface CorpusPrompt {
  system?: string;
  user: string;
  deck?: string;
  bindings?: string[];
  step_context?: Record<string, unknown>;
  /**
   * A SurfaceContext (surface × selection × prompt) — the deterministic
   * "where am I" payload (phase 5). Carried as a JSON object, anonymized on
   * the wire by buildCorpusEntry (internal record/selected-well ids stripped).
   */
  surfaceContext?: Record<string, unknown>;
}

export interface CorpusEntryInput {
  source: 'protocol-loop' | 'event-editor' | 'benchmark' | 'ingestion' | 'Surface-context';
  sourceType: 'app' | 'harness';
  prompt: CorpusPrompt;
  acceptedGraph: Record<string, unknown>;
  confirmedBy: 'user' | 'human-gold' | 'accepted-EVG';
  confirmedAt?: string;
  goldModel?: string;
  corrections?: Array<Record<string, unknown>>;
  modelMetadata?: Record<string, unknown>;
}

export interface CorpusConfig {
  enabled: boolean;
  serviceBaseUrl: string;
}

export const DEFAULT_CORPUS_CONFIG: CorpusConfig = {
  enabled: false,           // opt-in; won't spam during dev
  serviceBaseUrl: 'http://127.0.0.1:8790',
};

/**
 * Resolve corpus config from process env + optional partial override.
 * Env wins so deploy can enable/disable without a config edit.
 */
export function resolveCorpusConfig(override?: Partial<CorpusConfig>): CorpusConfig {
  const out = { ...DEFAULT_CORPUS_CONFIG, ...(override ?? {}) };
  if (process.env.CLA_CORPUS_ENABLED !== undefined) {
    out.enabled = process.env.CLA_CORPUS_ENABLED === 'true' || process.env.CLA_CORPUS_ENABLED === '1';
  }
  if (process.env.CLA_CORPUS_URL !== undefined) {
    out.serviceBaseUrl = process.env.CLA_CORPUS_URL;
  }
  return out;
}

/**
 * Heuristic anonymizer: replace computable-lab-internal ID patterns (MSP-###,
 * EVG-###, MAT-###, ALQ-###, run ids) with neutral placeholders so the moat
 * store carries de-identified pairs. Best-effort; safe to leave untouched.
 */
export function anonymizeGraph(graph: unknown): unknown {
  if (!graph || typeof graph !== 'object') return graph;
  if (Array.isArray(graph)) return graph.map(anonymizeGraph);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(graph as Record<string, unknown>)) {
    let nv = v;
    if (typeof v === 'string') {
      nv = v
        .replace(/\b(MSP|EVG|MAT|ALQ|PRT|PLR)-\d+\b/g, '$1-###')
        .replace(/[A-Za-z0-9]{36}/g, 'ID');
    } else {
      nv = anonymizeGraph(v);
    }
    out[k] = nv;
  }
  return out;
}

/**
 * Anonymize the SurfaceContext "where am I" payload: strip internal record
 * ids, selected well/cell ids, and random UUIDs so the moat store carries a
 * de-identified surface×selection description. Reuses anonymizeGraph for the
 * general body, then specifically scrubs selection ref ids (well:/cell:/*-###).
 */
export function anonymizeSurfaceContext(sc: Record<string, unknown>): Record<string, unknown> {
  const out = anonymizeGraph(sc) as Record<string, unknown>;
  const selection = out.selection;
  if (!Array.isArray(selection)) return out;
  const scrubbed = selection.map((item) => {
    if (!item || typeof item !== 'object') return item;
    const entry = item as Record<string, unknown>;
    const ref = entry.ref as Record<string, unknown> | undefined;
    if (!ref || typeof ref.id !== 'string') return entry;
    const id = ref.id
      .replace(/^(well|cell|plate):?.{1,18}$/i, '$1:###')
      .replace(/\b(MSP|EVG|MAT|ALQ|PRT|PLR)-\d+\b/g, '$1-###');
    return { ...entry, ref: { ...ref, id } };
  });
  return { ...out, selection: scrubbed };
}

/**
 * Build a self-attesting, dedupe-friendly entry body.
 * `promptKey` is used by the service's content-addressed dedup — include the
 * user prompt text so identical prompts collapse into one entry.
 */
export function buildCorpusEntry(input: CorpusEntryInput): Record<string, unknown> {
  const prompt =
    input.prompt.surfaceContext !== undefined
      ? {
          ...input.prompt,
          // Anonymize the surface selection too: strip internal record ids +
          // selected well/cell ids from the "where am I" payload.
          surfaceContext: anonymizeSurfaceContext(input.prompt.surfaceContext),
        }
      : input.prompt;
  return {
    source: input.source,
    sourceType: input.sourceType,
    prompt,
    acceptedGraph: anonymizeGraph(input.acceptedGraph),
    confirmedBy: input.confirmedBy,
    ...(input.confirmedAt ? { confirmedAt: input.confirmedAt } : {}),
    ...(input.goldModel ? { goldModel: input.goldModel } : {}),
    corrections: input.corrections ?? [],
    modelMetadata: input.modelMetadata ?? {},
  };
}

/**
 * POST one entry to the cl-appliance corpus-service. Best-effort: returns
 * { ok, entryId?, error? } and never throws to the caller.
 */
export async function postCorpusEntry(
  input: CorpusEntryInput,
  config: CorpusConfig = resolveCorpusConfig(),
  fetchFn: typeof fetch = fetch,
): Promise<{ ok: boolean; entryId?: string; deduped?: boolean; error?: string }> {
  if (!config.enabled) {
    return { ok: false, error: 'corpus.disabled' };
  }
  const body = buildCorpusEntry(input);
  try {
    const resp = await fetchFn(`${config.serviceBaseUrl}/corpus/entries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      // No auth — appliance-internal service. Add a token if exposed beyond the box.
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) {
      return { ok: false, error: `http_${resp.status}` };
    }
    const data = (await resp.json()) as { entryId?: string; deduped?: boolean };
    return {
      ok: true,
      ...(data.entryId !== undefined ? { entryId: data.entryId } : {}),
      ...(data.deduped !== undefined ? { deduped: data.deduped } : {}),
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Convenience builder for the most common app case: an event-editor accepted
 * graph + the AI-thread user message that prompted it.
 */
export function eventEditorCorpusEntry(opts: {
  userPrompt: string;
  systemPrompt?: string;
  acceptedGraph: Record<string, unknown>;
  runId?: string;
  model?: string;
  confirmedBy?: CorpusEntryInput['confirmedBy'];
}): CorpusEntryInput {
  return {
    source: 'event-editor',
    sourceType: 'app',
    prompt: {
      user: opts.userPrompt,
      ...(opts.systemPrompt ? { system: opts.systemPrompt } : {}),
    },
    acceptedGraph: opts.acceptedGraph,
    confirmedBy: opts.confirmedBy ?? 'accepted-EVG',
    ...(opts.model ? { goldModel: opts.model } : {}),
    modelMetadata: {
      ...(opts.model ? { model: opts.model } : {}),
      ...(opts.runId ? { runKey: randomUUID() } : {}), // never a real internal id
    },
  };
}