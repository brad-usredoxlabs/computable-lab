/**
 * Intent-compile-from-prompt handlers — the CHAT-FIRST one-shot localization
 * entry point.
 *
 * Endpoint:
 * - POST /intent/compile-from-prompt — drive the whole small-model one-shot:
 *     1. (optional) extract high-level branch questions via `emit_branch_questions`
 *     2. (when answers present) emit the scientist-intent local macro via
 *        `compileFromSmallLlm` (tool-call, verb-lifted)
 *     3. deterministic compile → TerminalArtifacts
 *
 * Two body shapes (the ask-vs-answer round-trip, matching resolve-or-confirm):
 *   { protocolText }                          → { axes, needsAnswers: true }
 *   { protocolText, answers: { <axisId>: <value> } }
 *                                              → { outcome, terminalArtifacts,
 *                                                  localMacro, axes }
 *
 * The `localMacro` is the parsed scientist-intent (the ONE-SHOT LOCAL MACRO
 * PROTOCOL). The frontend holds it and folds human refinements into it before
 * Accept, so the corpus trains to the FINAL macro (Q6).
 *
 * SPINE-5 response contract (headless, machine-readable; status + stable code):
 *   200  outcome 'complete'                  → success body (unchanged shape)
 *   200  outcome 'gap'                       → success body; `clarifications`
 *        attached ONLY when the compile result carries them (additive, OQ2)
 *   422  outcome 'needs-clarification'       → { error:'NEEDS_CLARIFICATION',
 *        outcome, clarifications (verbatim ScientistIntentUnresolvedFact[]),
 *        localMacro (OQ4: hold-the-macro), terminalArtifacts (zero-artifact on
 *        the bar per SPINE-4 OQ3(a)) } — the repo's validation-failed convention
 *   502  ScientistIntentValidationError from the model driver → { error:
 *        'MALFORMED_MODEL_OUTPUT', message } — upstream model-endpoint fault
 *        (OQ1); NO outcome/clarifications/localMacro keys (distinguishable from
 *        resolution uncertainty at BODY level, not just status)
 *   500  outcome 'error' after a PARSED intent → { error:'INTENT_COMPILE_FAILED',
 *        message } — the compile's fault; distinct from the catch-all
 *        INTENT_COMPILE_PROMPT_FAILED (kept for the ask-branch and unforeseen
 *        throws)
 * Classification is ORIGIN-based (thrown-from-driver vs compile RESULT object),
 * never message-substring based. The ask/answer round-trip stays on its own
 * 200 channel: needsAnswers is NOT needs-clarification.
 * The route is WRITE-FREE: its only store use is loadLabInventory's read-only
 * store.list; it never executes a run and never accepts a proposal.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createLabwareLookup } from '../../ai/compiler/labwareLookup.js';
import { createInferenceClient } from '../../ai/InferenceClient.js';
import { resolveAiProfile } from '../../config/types.js';
import { createResolveSpineFromContext } from '../../resolve/index.js';
import type { AppContext } from '../../server.js';
import type { RecordStore } from '../../store/types.js';
import { ScientistIntentValidationError } from '../../compiler/scientistIntent/parseScientistIntent.js';
import type { ScientistIntent, ScientistIntentUnresolvedFact } from '../../compiler/scientistIntent/types.js';
import type { TerminalArtifacts } from '../../compiler/pipeline/CompileContracts.js';
import {
  compileFromSmallLlm,
  extractBranchQuestionsFromSmallLlm,
  type BranchQuestionsResult,
  type LabInventory,
} from '../../compiler/scientistIntent/intentCompile.js';

interface CompileFromPromptDeps {
  store?: RecordStore;
  /** Small-model endpoint (defaults to config ai.inference). */
  baseUrl?: string;
  model?: string;
  /** Injected scientist-intent LLM client (tests). Defaults to config-built. */
  llmClient?: import('../../compiler/scientistIntent/intentCompile.js').ScientistIntentLlmClient;
}

function toInferenceConfig(deps: CompileFromPromptDeps, ctx: AppContext): { baseUrl: string; model: string; provider: 'openai-compatible'; enableThinking: false; temperature: 0 } {
  // The one-shot localization path follows the ACTIVE AI profile (default:
  // Ornith on appliance-2), so the compiler grounds against the lab's current
  // model. An explicit `smallModel` config override (or deps baseUrl/model for
  // tests) wins; otherwise fall back to the active profile's inference config,
  // then to the historical local small model as a last resort.
  const ai = ctx.appConfig?.ai as Record<string, unknown> | undefined;
  const small = ai?.['smallModel'] as
    | { baseUrl?: string; model?: string }
    | undefined;
  const activeInference = ctx.appConfig?.ai
    ? resolveAiProfile(ctx.appConfig.ai).inference
    : undefined;
  return {
    provider: 'openai-compatible',
    baseUrl: deps.baseUrl
      ?? small?.baseUrl
      ?? activeInference?.baseUrl
      ?? 'http://127.0.0.1:8899/v1',
    model: deps.model
      ?? small?.model
      ?? activeInference?.model
      ?? 'lfm2.5-2.6b',
    enableThinking: false,
    temperature: 0,
  };
}

interface CompileFromPromptBody {
  protocolText?: string;
  sourceProtocolId?: string;
  answers?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// SPINE-5 response contract (exported from THIS handler file — the payload
// type IS ScientistIntentUnresolvedFact, consumed verbatim; no second schema
// home, no YAML envelope). exactOptionalPropertyTypes: presence is expressed
// with conditional spreads at the send sites, never `x: undefined`.
// ---------------------------------------------------------------------------

/** 200 — outcome 'complete' (and 'gap', additively with `clarifications`). */
export interface CompileFromPromptSuccessResponse {
  outcome: 'complete' | 'gap';
  terminalArtifacts: TerminalArtifacts;
  localMacro: ScientistIntent;
  axes: Record<string, string>;
  /** Additive ONLY on a 'gap' that carries structured clarifications (OQ2). */
  clarifications?: ScientistIntentUnresolvedFact[];
}

/** 422 — the SPINE-4 bar: the scientist must answer before any artifact exists. */
export interface CompileFromPromptNeedsClarificationResponse {
  error: 'NEEDS_CLARIFICATION';
  outcome: 'needs-clarification';
  clarifications: ScientistIntentUnresolvedFact[];
  /** OQ4(a): the parseable macro with unresolved slots is held for the answer round-trip. */
  localMacro: ScientistIntent;
  terminalArtifacts: TerminalArtifacts;
}

/** 502 — upstream model-endpoint fault (OQ1(a)). NO outcome/clarifications. */
export interface CompileFromPromptMalformedModelOutputResponse {
  error: 'MALFORMED_MODEL_OUTPUT';
  message: string;
}

/** 500 — compile machinery broke after a PARSED intent. */
export interface CompileFromPromptCompileFailedResponse {
  error: 'INTENT_COMPILE_FAILED';
  message: string;
}

export function createIntentCompileFromPromptHandlers(ctx: AppContext, deps: CompileFromPromptDeps = {}) {
  const store: RecordStore = deps.store ?? ctx.store;
  const searchLabwareByHint = createLabwareLookup(store);
  // SPINE-4 fix1/D1 (spec §3): the one-shot compile route injects the SAME
  // store-backed spine the resolve tools build (createResolveSpineFromContext,
  // server.ts:733 — live config accessor so PATCH /api/config takes effect
  // without a restart). compileFromSmallLlm threads it into
  // compileScientistIntent's deps; without it resolve_nouns sees no local
  // tiers and FALSE-BARS store-resolvable nouns (e.g. add_material.material,
  // seed.material — resolvable, NO hintEligible). compileScientistIntent
  // throws LOUD when deps.spine is absent — injection, not a silent floor.
  const spine = createResolveSpineFromContext({
    store,
    ...(ctx.appConfig !== undefined ? { appConfig: ctx.appConfig } : {}),
    getAppConfig: () => ctx.appConfig,
  });

  // Lab-inventory snapshot for the one-shot localizer: the lab-GLOBAL names of
  // instruments/equipment, labware, and materials. Kept separate per kind so
  // the small model can ground symbolic labels in what this lab actually owns.
  async function loadLabInventory(): Promise<LabInventory> {
    const names = async (kind: string, ...fields: string[]): Promise<string[]> => {
      const out: string[] = [];
      let records;
      try {
        records = await store.list({ kind, limit: 500 });
      } catch {
        return out;
      }
      for (const env of records) {
        const p = env && typeof env.payload === 'object' && !Array.isArray(env.payload)
          ? env.payload as Record<string, unknown>
          : {};
        for (const f of fields) {
          const v = p[f];
          if (typeof v === 'string' && v.trim()) { out.push(v.trim()); break; }
        }
      }
      // Dedup, keep order.
      return [...new Set(out)];
    };
    const [labware] = await Promise.all([
      names('labware', 'name', 'display_name', 'title'),
    ]);
    // equipment records may use kind 'equipment' (LabInventoryPanel lists 'equipment')
    let equipment = await names('equipment', 'name', 'displayName', 'title');
    const instruments2 = await names('instrument-definition', 'name', 'title');
    equipment = [...equipment, ...instruments2];
    const materials = await names('material', 'name', 'title');
    return {
      ...(equipment.length ? { instruments: [...new Set(equipment)] } : {}),
      ...(labware.length ? { labware } : {}),
      ...(materials.length ? { materials } : {}),
    };
  }

  return {
    async compileFromPrompt(
      request: FastifyRequest<{ Body: unknown }>,
      reply: FastifyReply,
    ): Promise<void> {
      const body = request.body as CompileFromPromptBody | undefined;
      const protocolText = typeof body?.protocolText === 'string' ? body.protocolText.trim() : '';
      if (!protocolText) {
        return reply.status(400).send({
          error: 'PROTOCOL_TEXT_REQUIRED',
          message: 'Body must provide a non-empty `protocolText` string.',
        });
      }

      const llmClient = deps.llmClient
        ?? createInferenceClient(toInferenceConfig(deps, ctx)) as never;

      // Ask-vs-answer round-trip: if no answers yet, extract the branch questions.
      const answers = body?.answers;
      if (!answers || Object.keys(answers).length === 0) {
        let axes: BranchQuestionsResult['axes'] = [];
        try {
          const result = await extractBranchQuestionsFromSmallLlm({
            protocolText,
            llmClient: llmClient as never,
            model: toInferenceConfig(deps, ctx).model,
          });
          axes = result.axes;
        } catch (err) {
          request.log.error({ err }, 'Failed to extract branch questions');
          // Non-fatal — proceed to one-shot even without branch extraction.
        }
        return reply.send({
          needsAnswers: true,
          axes,
          ...(body?.sourceProtocolId ? { sourceProtocolId: body.sourceProtocolId } : {}),
        });
      }

      // Answers present: emit the macro + deterministic compile.
      // CLASSIFICATION SEAM (origin-based, never message-substring): a
      // ScientistIntentValidationError escaping the compileFromSmallLlm CALL
      // SITE is MODEL output (502); anything surfacing from the compile RESULT
      // object is the compile's (422/500 per the contract table).
      let emitted: { intent: ScientistIntent; compile: Awaited<ReturnType<typeof compileFromSmallLlm>>['compile'] };
      try {
        const labInventory = await loadLabInventory();
        emitted = await compileFromSmallLlm({
          prompt: protocolText,
          llmClient: llmClient as never,
          model: toInferenceConfig(deps, ctx).model,
          deps: { searchLabwareByHint, spine },
          labInventory,
        });
      } catch (err) {
        if (err instanceof ScientistIntentValidationError) {
          // Malformed model output: an upstream model-endpoint fault, NOT a
          // client-input failure and NOT resolution uncertainty. The body
          // carries NO outcome/clarifications/localMacro keys — distinguishable
          // from the 422 bar at body level, not just status.
          request.log.error({ err }, 'Model emitted no usable scientist-intent');
          return reply.status(502).send({
            error: 'MALFORMED_MODEL_OUTPUT',
            message: err.message,
          } satisfies CompileFromPromptMalformedModelOutputResponse);
        }
        request.log.error({ err }, 'Failed to compile-from-prompt one-shot');
        return reply.status(500).send({
          error: 'INTENT_COMPILE_PROMPT_FAILED',
          message: err instanceof Error ? err.message : String(err),
        });
      }

      const { intent, compile } = emitted;

      if (compile.outcome === 'needs-clarification') {
        // The SPINE-4 bar: 422 on the repo's validation-failed convention.
        // Clarifications travel VERBATIM from the compile result — the route
        // mints no labels, candidates, confidences, or ids. terminalArtifacts
        // is the bar's zero-artifact bundle (SPINE-4 OQ3(a)); localMacro is
        // held (OQ4(a)) so the client folds answers into the parseable macro.
        // axes stay on the ask channel (bait §7.1).
        return reply.status(422).send({
          error: 'NEEDS_CLARIFICATION',
          outcome: compile.outcome,
          clarifications: compile.clarifications,
          localMacro: intent,
          terminalArtifacts: compile.terminalArtifacts,
        } satisfies CompileFromPromptNeedsClarificationResponse);
      }

      if (compile.outcome === 'error') {
        // Compile machinery broke AFTER a parsed intent: the compile's fault.
        return reply.status(500).send({
          error: 'INTENT_COMPILE_FAILED',
          message: compile.diagnostics
            .filter((d) => d.severity === 'error')
            .map((d) => d.message)
            .join('; ') || 'scientist-intent compile reported outcome error',
        } satisfies CompileFromPromptCompileFailedResponse);
      }

      // 'complete' | 'gap' — today's success shape, unchanged. On a 'gap' the
      // structured clarifications (when the compile result carries any) are
      // ATTACHED additively (OQ2); on 'complete' the key is ABSENT, not
      // undefined (exactOptionalPropertyTypes conditional-spread idiom).
      return reply.send({
        outcome: compile.outcome,
        terminalArtifacts: compile.terminalArtifacts,
        localMacro: intent,
        axes: body.answers ?? {},
        ...(compile.outcome === 'gap' && compile.clarifications.length > 0
          ? { clarifications: compile.clarifications }
          : {}),
      } satisfies CompileFromPromptSuccessResponse);
    },
  };
}

export function registerIntentCompileFromPromptRoutes(instance: FastifyInstance, ctx: AppContext): void {
  const h = createIntentCompileFromPromptHandlers(ctx);
  instance.post('/intent/compile-from-prompt', h.compileFromPrompt.bind(h));
}