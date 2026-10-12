/**
 * W2-6-SEMANTIC-PASS — the service (spec §3-W1).
 *
 * One LLM call per pass over the FULL vendor-protocol-candidate record:
 * the user content is literally JSON.stringify(whole candidate) plus the
 * step/section/table ID INDEX the prompt asks the model to anchor against —
 * NO filtering, NO field-dropping, NO step-filter concept (D4's inversion;
 * the legacy filtered drafting route is NOT imported here — semanticPassGuards.ts
 * is the only guard home and it imports the derive* axis machinery only).
 *
 * Model/host/thinking are CONFIG ONLY (D7): the single resolution seam is
 * resolveSemanticPassInference() below — an OPTIONAL ai.semanticPass block
 * (model/baseUrl/thinking optional; MISSING => fallback to the active profile's
 * inference, the shadowRouter optional-block precedent, config/types.ts
 * ShadowRouterConfig) merged over resolveAiProfile(appConfig.ai).inference.
 * Zero model/host literals in this file.
 *
 * Parse follows the extractor convention: the extractJsonObject walker is
 * imported from OpenAICompatibleExtractor.ts (:42, exported); finish_reason
 * 'length' yields SEMANTIC_PASS_TRUNCATED naming the maxTokens knob, never a
 * partial draft. The service itself makes EXACTLY ONE complete() call and
 * never loops/retries/re-asks (client-internal transient retries belong to
 * the client, InferenceClient.ts:136-161).
 *
 * Landing: buildExtractionDraft -> store.create an XDR whose candidates[0] =
 * { target_kind:'protocol', draft: <intent-step protocol payload>, confidence,
 * ambiguity_spans }. Review + promotion ride W2-5's existing endpoints; W2-6
 * mints NO protocol record itself and NEVER mutates the candidate (store.get
 * only — the SAID is append-only per W2-5's merged wall).
 */

import { createHash } from 'node:crypto';
import { randomUUID } from 'node:crypto';

import type { AIConfig, InferenceConfig } from '../../config/types.js';
import { resolveAiProfile } from '../../config/types.js';
import type { CompletionRequest, InferenceClient } from '../../ai/types.js';
import { resolveThinkingLevel } from '../../ai/thinkingLevels.js';
import { extractJsonObject } from '../../extract/OpenAICompatibleExtractor.js';
import { loadExtractionPrompt } from '../../extract/prompts/loader.js';
import { buildExtractionDraft } from '../../extract/ExtractionDraftBuilder.js';
import type { RecordStore } from '../../store/types.js';

import {
  resolveAnchorRefs,
  assertStepCoverage,
  bindFamilyAxes,
  SEMANTIC_PASS_STEP_COVERAGE,
  type GuardSpan,
} from './semanticPassGuards.js';

export const SEMANTIC_PASS_NO_CANDIDATE = 'SEMANTIC_PASS_NO_CANDIDATE';
export const SEMANTIC_PASS_TRUNCATED = 'SEMANTIC_PASS_TRUNCATED';
export const SEMANTIC_PASS_PARSE_FAILED = 'SEMANTIC_PASS_PARSE_FAILED';
export const SEMANTIC_PASS_UNKNOWN_THINKING_LEVEL = 'SEMANTIC_PASS_UNKNOWN_THINKING_LEVEL';

const XDR_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/workflow/extraction-draft.schema.yaml';
const PROMPT_KIND = 'semantic-family-draft';

// ---------------------------------------------------------------------------
// THE ONE resolution seam (P2 ruling: optional ai.semanticPass block,
// shadowRouter optional-block precedent; MISSING block => active profile).
// ---------------------------------------------------------------------------

export function resolveSemanticPassInference(ai: AIConfig): InferenceConfig {
  const profile = resolveAiProfile(ai).inference;
  const sp = ai.semanticPass;
  if (!sp) return profile;
  return {
    ...profile,
    ...(sp.baseUrl !== undefined ? { baseUrl: sp.baseUrl } : {}),
    ...(sp.model !== undefined ? { model: sp.model } : {}),
    ...(sp.apiKey !== undefined ? { apiKey: sp.apiKey } : {}),
    ...(sp.maxTokens !== undefined ? { maxTokens: sp.maxTokens } : {}),
    ...(sp.temperature !== undefined ? { temperature: sp.temperature } : {}),
    ...(sp.enableThinking !== undefined ? { enableThinking: sp.enableThinking } : {}),
    ...(sp.thinkingLevels !== undefined ? { thinkingLevels: sp.thinkingLevels } : {}),
    ...(sp.defaultThinkingLevel !== undefined ? { defaultThinkingLevel: sp.defaultThinkingLevel } : {}),
  };
}

// ---------------------------------------------------------------------------
// Prompt builder (the FULL candidate, no shaping beyond the ID INDEX)
// ---------------------------------------------------------------------------

export interface BuiltPrompt {
  system: string;
  user: string;
}

export function buildSemanticFamilyPrompt(
  candidate: Record<string, unknown>,
  candidateRecordId: string,
): BuiltPrompt {
  // Prompt md is DATA loaded per invocation (loader.ts readFileSync :102 —
  // read-per-call, so prompt edits need no restart).
  const loaded = loadExtractionPrompt(PROMPT_KIND);
  const steps = Array.isArray(candidate.steps) ? candidate.steps : [];
  const sections = Array.isArray(candidate.sections) ? candidate.sections : [];
  const tables = Array.isArray(candidate.tables) ? candidate.tables : [];
  const idOf = (entry: unknown): string => {
    const id = (entry as Record<string, unknown>)?.id;
    return typeof id === 'string' ? id : String(entry);
  };
  const index = [
    'ID INDEX',
    `Candidate record id: ${candidateRecordId}`,
    `Step ids: ${steps.map(idOf).join(', ')}`,
    `Section ids: ${sections.map(idOf).join(', ')}`,
    `Table ids: ${tables.map(idOf).join(', ')}`,
  ].join('\n');
  return {
    system: loaded.body,
    // The whole-document rule (D4's inversion): the serializer is literally
    // JSON.stringify(candidate) — the ONLY allowed shaping is appending the
    // ID INDEX the prompt asks the model to anchor against.
    user: `${JSON.stringify(candidate)}\n\n${index}`,
  };
}

// ---------------------------------------------------------------------------
// The pass
// ---------------------------------------------------------------------------

export interface SemanticPassDeps {
  store: Pick<RecordStore, 'get' | 'create'>;
  client: InferenceClient;
  inference: InferenceConfig;
}

export interface SemanticPassDiagnostics {
  candidateRecordId: string;
  axesCount: number;
  spans: GuardSpan[];
  model: string;
  thinkingLevel: string;
}

export type SemanticPassResult =
  | { ok: true; recordId: string; diagnostics: SemanticPassDiagnostics }
  | { ok: false; error: string; message: string; details?: Record<string, unknown> };

/** The wiring seam the extract handler calls (deps pre-bound at server.ts). */
export type SemanticPassRunner = (input: { candidateRecordId: string }) => Promise<SemanticPassResult>;

/** CompletionRequest plus the thinking-level DATA params (thinkingLevels.ts
 *  :29 reasoning_effort) which InferenceClient.normalizeRequest forwards
 *  verbatim in `...rest` (InferenceClient.ts:82-92). */
type SemanticCompletionRequest = CompletionRequest & { reasoning_effort?: string };

export async function runSemanticFamilyPass(
  deps: SemanticPassDeps,
  input: { candidateRecordId: string },
): Promise<SemanticPassResult> {
  const { store, client, inference } = deps;
  const candidateRecordId = input.candidateRecordId;

  // 1. Read the candidate (READ ONLY — the SAID is never mutated; W2-5's
  //    appendOnlyKinds wall makes even an attempted write a 405).
  const envelope = await store.get(candidateRecordId);
  if (!envelope) {
    return { ok: false, error: SEMANTIC_PASS_NO_CANDIDATE, message: `No record ${candidateRecordId}` };
  }
  const candidate = envelope.payload as Record<string, unknown>;
  if (candidate.kind !== 'vendor-protocol-candidate') {
    return {
      ok: false,
      error: SEMANTIC_PASS_NO_CANDIDATE,
      message: `Record ${candidateRecordId} is kind '${String(candidate.kind)}', not vendor-protocol-candidate`,
    };
  }

  // 2. Thinking level from CONFIG; an unknown level is REFUSED, never
  //    downgraded (thinkingLevels.ts convention).
  const level = resolveThinkingLevel(inference.thinkingLevels, undefined, inference.defaultThinkingLevel);
  if (!level.ok) {
    return {
      ok: false,
      error: SEMANTIC_PASS_UNKNOWN_THINKING_LEVEL,
      message: level.error,
      details: { available: level.available },
    };
  }
  const levelParams = level.resolved.params;
  const enableThinking = typeof levelParams.enableThinking === 'boolean' ? levelParams.enableThinking : undefined;
  const chatTemplateKwargs =
    typeof levelParams.chat_template_kwargs === 'object' && levelParams.chat_template_kwargs !== null
      ? (levelParams.chat_template_kwargs as Record<string, unknown>)
      : undefined;
  const reasoningEffort = typeof levelParams.reasoning_effort === 'string' ? levelParams.reasoning_effort : undefined;

  // 3. ONE call over the FULL candidate. No loop, no re-ask, no second call.
  const prompt = buildSemanticFamilyPrompt(candidate, candidateRecordId);
  const request: SemanticCompletionRequest = {
    model: inference.model,
    messages: [
      { role: 'system', content: prompt.system },
      { role: 'user', content: prompt.user },
    ],
    response_format: { type: 'json_object' },
    ...(inference.maxTokens !== undefined ? { max_tokens: inference.maxTokens } : {}),
    ...(inference.temperature !== undefined ? { temperature: inference.temperature } : {}),
    ...(enableThinking !== undefined ? { enableThinking } : {}),
    ...(chatTemplateKwargs !== undefined ? { chat_template_kwargs: chatTemplateKwargs } : {}),
    ...(reasoningEffort !== undefined ? { reasoning_effort: reasoningEffort } : {}),
  };
  const response = await client.complete(request);
  const choice = response.choices?.[0];

  // 4. Truncation before parse (extractor convention §0.3): a truncated
  //    answer reads as "raise maxTokens", never as garbage, never a draft.
  if (choice?.finish_reason === 'length') {
    return {
      ok: false,
      error: SEMANTIC_PASS_TRUNCATED,
      message:
        `Semantic pass answer was truncated (finish_reason 'length'). Raise the configured maxTokens ` +
        `(ai.semanticPass.maxTokens or the active profile's ai.inference.maxTokens; current: ` +
        `${String(inference.maxTokens ?? 'unset')}) and re-run the pass.`,
    };
  }

  const content = typeof choice?.message?.content === 'string' ? choice.message.content : '';
  const jsonSource = extractJsonObject(content);
  if (jsonSource === null) {
    return {
      ok: false,
      error: SEMANTIC_PASS_PARSE_FAILED,
      message: 'Semantic pass answer contains no JSON object; zero writes performed.',
    };
  }
  let answer: Record<string, unknown>;
  try {
    const parsed = JSON.parse(jsonSource) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { ok: false, error: SEMANTIC_PASS_PARSE_FAILED, message: 'Semantic pass answer is not a JSON object; zero writes performed.' };
    }
    answer = parsed as Record<string, unknown>;
  } catch {
    return { ok: false, error: SEMANTIC_PASS_PARSE_FAILED, message: 'Semantic pass answer is not parseable JSON; zero writes performed.' };
  }

  if (!Array.isArray(answer.steps)) {
    return {
      ok: false,
      error: SEMANTIC_PASS_PARSE_FAILED,
      message: "Semantic pass answer has no 'steps' array; zero writes performed.",
    };
  }

  // 5. Guards (§2.2): axes discarded + deterministic binding, then anchor
  //    drop-not-rewrite, then step coverage. All BEFORE any write.
  const candidateShape = candidate as unknown as Parameters<typeof bindFamilyAxes>[1];
  const axesBinding = bindFamilyAxes(answer as never, candidateShape);
  const anchorResolution = resolveAnchorRefs(
    axesBinding.draft,
    candidateShape,
    candidateRecordId,
  );
  const coverage = assertStepCoverage(
    anchorResolution.draft,
    candidateShape,
    axesBinding.axes as Array<{ conditions?: Array<{ then_stepIds?: string[] }> }>,
  );
  if (!coverage.ok) {
    // OQ2 ruling (a): refuse the pass with ZERO writes — a silently-partial
    // family is THE anti-D4 failure. The code names the missing step ids.
    return {
      ok: false,
      error: SEMANTIC_PASS_STEP_COVERAGE,
      message: `Semantic pass dropped candidate step(s): ${coverage.missingStepIds.join(', ')}. Refusing with zero writes (a half-family is the inversion the pass exists to reverse).`,
      details: { missingStepIds: coverage.missingStepIds },
    };
  }

  const spans = [...axesBinding.spans, ...anchorResolution.spans];
  // The draft schema closes ambiguity_spans items to {path, reason}
  // (additionalProperties:false) — the guard's machine-readable code rides in
  // `reason`, its diagnostic detail folded in after it.
  const draftSpans = spans.map((s) => ({
    path: s.path,
    reason: s.detail ? `${s.reason}: ${s.detail}` : s.reason,
  }));

  // 6. Land as a W2-5 extraction-draft (the ONLY minting W2-6 does). The
  //    draft payload is NOT privately validated here (bait 11): the schema +
  //    lint wall fires at the store write and at W2-5 promotion.
  const protocolDraftPayload = {
    kind: 'protocol',
    recordId: `PRT-${candidateRecordId}-semantic`,
    title: `${String(candidate.title ?? candidateRecordId)} — semantic family draft`,
    steps: anchorResolution.draft.steps,
    ...(axesBinding.axes.length > 0 ? { branch_axes: axesBinding.axes } : {}),
  };

  const xdrRecordId = `XDR-semantic-${createHash('sha256').update(`${candidateRecordId}|${randomUUID()}`).digest('hex').slice(0, 16)}`;
  const draftBody = buildExtractionDraft({
    recordId: xdrRecordId,
    source_artifact: {
      kind: 'file',
      id: String((candidate.source as Record<string, unknown>).documentId ?? candidateRecordId),
      locator: String((candidate.source as Record<string, unknown>).filename ?? ''),
    },
    candidates: [
      {
        target_kind: 'protocol',
        draft: protocolDraftPayload,
        confidence: 0.9,
      },
    ],
    ambiguity_spans_by_candidate: [draftSpans],
  });

  // Merge-adapter against the MERGED extraction-draft schema (recorded drift,
  // not fixed at the builder): the schema is unevaluatedProperties:false over
  // FAIRCommon, which declares createdAt (camelCase) and NOT the builder's
  // snake_case created_at — the store wall rejects created_at (probe-verified;
  // W2-5's own seedDraft omitted it for the same reason). The creation time
  // rides the schema's declared createdAt; the envelope meta carries it too.
  const { created_at: builderCreatedAt, ...draftRest } = draftBody;
  const draftPayload = { ...draftRest, createdAt: builderCreatedAt } as unknown as Record<string, unknown>;

  const created = await store.create({
    envelope: { recordId: xdrRecordId, schemaId: XDR_SCHEMA_ID, payload: draftPayload },
    message: `W2-6 semantic family draft from candidate ${candidateRecordId}`,
  });
  if (!created.success) {
    return {
      ok: false,
      error: 'SEMANTIC_PASS_DRAFT_WRITE_FAILED',
      message: `Extraction-draft write failed: ${created.error ?? 'unknown store error'}`,
    };
  }

  return {
    ok: true,
    recordId: xdrRecordId,
    diagnostics: {
      candidateRecordId,
      axesCount: axesBinding.axes.length,
      spans,
      model: inference.model,
      thinkingLevel: level.resolved.level,
    },
  };
}
