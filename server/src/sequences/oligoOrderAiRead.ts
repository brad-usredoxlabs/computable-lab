/**
 * The AI READ producer for oligo vendor documents (the fallback path).
 *
 * The configured model is a second PRODUCER of the draft document the
 * deterministic pipeline defines: it is handed the extracted text plus the
 * draft contract (server/prompts/oligo-order-draft.md — prompt-as-DATA, loaded
 * via import.meta.url like sequenceIntent.ts) and must answer with an
 * `oligo-order-draft` JSON object. Ajv is the structural authority afterwards:
 * a draft that fails validation is re-asked ONCE with the real diagnostic
 * quoted, then reported honestly — never repaired silently, never a third
 * call. Valid rows are produced by oligoRowsFromDraft (oligoOrderDraft.ts),
 * the SAME lowering the regex extractor uses: one compiler, two producers.
 *
 * The WHEN of the fallback is DATA too (config/sequence-analysis/oligo-order.yaml
 * `aiFallback`): this module only evaluates the declared policy — TypeScript
 * holds zero trigger logic, mirroring the `config.ocr?.enabled` precedent.
 * No route, no job mutation, no server.ts wiring here (OLIGO-AI-3 owns those).
 */
import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { createValidator } from '../validation/AjvValidator.js';
import type { CompletionRequest } from '../ai/types.js';
import { oligoRowsFromDraft, type OligoOrderDraft } from './oligoOrderDraft.js';
import type { OligoRow } from './oligoOrder.js';

/** Pinned $id of the draft document contract (imported, never re-derived). */
export const OLIGO_DRAFT_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/sequence-analysis/oligo-order-draft.schema.yaml';

/**
 * Policy budgets as DATA in ONE exported constant, not scattered literals:
 * when the config declares no `aiFallback`, the behavior is OFF (absent data
 * means no behavior) and the producer's budgets default to the shipped values.
 */
export const OLIGO_AI_FALLBACK_DEFAULTS = {
  enabled: false,
  offerWhen: [] as string[],
  mode: 'manual',
  maxContextChars: 12000,
  maxTokens: 4000,
  responseFormat: 'json_object',
};

/** The injection point: whatever supplies `complete` (server.ts wires the
 *  configured inference client; tests inject a stub). Deliberately NOT
 *  ai/InferenceClient and NOT ../server.js (no circular import). */
export interface OligoAiReadClient {
  complete(req: CompletionRequest): Promise<{ choices?: Array<{ message?: { content?: string | null } }> }>;
}

export interface OligoAiReadResult {
  rows: OligoRow[];
  draft: OligoOrderDraft | null;
  /** Present ONLY on refusal after the single repair retry (never alongside partial rows). */
  error?: string;
}

export interface OligoReadSignals {
  rowCount: number;
  issueRowCount: number;
  declaredCount: number | null;
}

export interface AiFallbackPolicy {
  enabled: boolean;
  offerWhen: string[];
  mode: string;
  maxContextChars: number;
  maxTokens: number;
  responseFormat: string;
}

/** Read the declared policy from a sequence config. Missing `aiFallback`
 *  => disabled defaults: absent data means no behavior. */
export function readAiFallbackPolicy(config: Record<string, unknown>): AiFallbackPolicy {
  const raw = config.aiFallback as Record<string, unknown> | undefined;
  if (!raw) return { ...OLIGO_AI_FALLBACK_DEFAULTS };
  return {
    enabled: raw.enabled === true,
    offerWhen: Array.isArray(raw.offerWhen) ? raw.offerWhen.map((token) => String(token)) : [],
    mode: typeof raw.mode === 'string' ? raw.mode : OLIGO_AI_FALLBACK_DEFAULTS.mode,
    maxContextChars: Number.isFinite(raw.maxContextChars) ? Number(raw.maxContextChars) : OLIGO_AI_FALLBACK_DEFAULTS.maxContextChars,
    maxTokens: Number.isFinite(raw.maxTokens) ? Number(raw.maxTokens) : OLIGO_AI_FALLBACK_DEFAULTS.maxTokens,
    responseFormat: typeof raw.responseFormat === 'string' ? raw.responseFormat : OLIGO_AI_FALLBACK_DEFAULTS.responseFormat,
  };
}

/**
 * The generic evaluator: returns the offerWhen TOKENS that fired for these
 * signals. The predicate itself (which tokens the lab wants) lives in the YAML;
 * this function only knows the token semantics:
 *   'no-rows'                  rowCount === 0
 *   'any-issue'                issueRowCount > 0
 *   'declared-count-mismatch'  declaredCount !== null && rowCount < declaredCount
 * policy.enabled === false => [] (the file-level flip needs zero code change).
 */
export function aiReadTriggered(policy: AiFallbackPolicy, signals: OligoReadSignals): string[] {
  if (!policy.enabled) return [];
  const fired: string[] = [];
  for (const token of policy.offerWhen) {
    if (token === 'no-rows' && signals.rowCount === 0) fired.push(token);
    else if (token === 'any-issue' && signals.issueRowCount > 0) fired.push(token);
    else if (token === 'declared-count-mismatch' && signals.declaredCount !== null && signals.rowCount < signals.declaredCount) fired.push(token);
  }
  return fired;
}

// Loaded via import.meta.url (sequenceIntent.ts:3 precedent): a cwd-relative
// existsSync fallback is a silent-empty-prompt + worktree-portability trap.
// A missing prompt or schema throws loudly at module load.
const draftPrompt = readFileSync(new URL('../../prompts/oligo-order-draft.md', import.meta.url), 'utf8');
const draftSchema = parseYaml(readFileSync(new URL('../../../schema/sequence-analysis/oligo-order-draft.schema.yaml', import.meta.url), 'utf8')) as Record<string, unknown>;

/** Ask the configured model to read `text` as an oligo-order-draft.
 *  Exactly ONE repair retry: the client is called at most twice, the repair
 *  prompt QUOTES the last Ajv/parse diagnostic, and after the retry Ajv is
 *  still the authority — an invalid draft is refused honestly. */
export async function readOligoOrderWithAi(
  text: string,
  options: {
    llmClient: OligoAiReadClient;
    model: string;
    maxContextChars?: number;
    maxTokens?: number;
    responseFormat?: string;
  },
): Promise<OligoAiReadResult> {
  const maxContextChars = options.maxContextChars ?? OLIGO_AI_FALLBACK_DEFAULTS.maxContextChars;
  const maxTokens = options.maxTokens ?? OLIGO_AI_FALLBACK_DEFAULTS.maxTokens;
  const responseFormat = options.responseFormat ?? OLIGO_AI_FALLBACK_DEFAULTS.responseFormat;
  const excerpt = text.length > maxContextChars ? text.slice(0, maxContextChars) : text;
  const messages: CompletionRequest['messages'] = [
    { role: 'system', content: draftPrompt },
    { role: 'user', content: `VENDOR DOCUMENT TEXT:\n\n${excerpt}\n\nReturn the oligo-order-draft JSON object.` },
  ];
  const validator = createValidator({ strict: false });
  validator.addSchema(draftSchema as never, OLIGO_DRAFT_SCHEMA_ID);
  const ask = (extra: CompletionRequest['messages']) => options.llmClient.complete({
    model: options.model, // forwarded verbatim — no default, no hardcoded model id
    messages: [...messages, ...extra],
    temperature: 0,
    max_tokens: maxTokens,
    // json_object is the house-proven call form (OQ1); json_schema is
    // reserved in config for an endpoint proven to honor it. Ajv validates
    // either way.
    ...(responseFormat === 'json_schema'
      ? { response_format: { type: 'json_schema' as const, json_schema: { name: 'oligo-order-draft', schema: draftSchema, strict: true } } }
      : { response_format: { type: 'json_object' as const } }),
  });
  let lastError = '';
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await ask(attempt === 0 ? [] : [{ role: 'user', content: `Your previous answer was rejected: ${lastError}\nRe-emit the complete oligo-order-draft JSON object.` }]);
    const content = response.choices?.[0]?.message?.content ?? '';
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch (err) {
      lastError = `not JSON: ${(err as Error).message}`;
      continue;
    }
    const result = validator.validate(parsed, OLIGO_DRAFT_SCHEMA_ID);
    if (result.valid) {
      const draft = parsed as OligoOrderDraft;
      // One compiler, two producers: rows come from the deterministic lowerer.
      return { rows: await oligoRowsFromDraft(draft), draft };
    }
    lastError = result.errors.slice(0, 6).map((e) => `${e.path || '/'}: ${e.message}`).join('; ');
  }
  return { rows: [], draft: null, error: `The AI read did not produce a valid oligo-order-draft: ${lastError}` };
}
