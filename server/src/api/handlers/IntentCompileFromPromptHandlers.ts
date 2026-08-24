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
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createLabwareLookup } from '../../ai/compiler/labwareLookup.js';
import { createInferenceClient } from '../../ai/InferenceClient.js';
import type { AppContext } from '../../server.js';
import type { RecordStore } from '../../store/types.js';
import {
  compileFromSmallLlm,
  extractBranchQuestionsFromSmallLlm,
  type BranchQuestionsResult,
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
  const infer = ctx.appConfig?.ai?.inference;
  return {
    provider: 'openai-compatible',
    baseUrl: deps.baseUrl ?? infer?.baseUrl ?? 'http://127.0.0.1:8899/v1',
    model: deps.model ?? infer?.model ?? 'lfm2.5-2.6b',
    enableThinking: false,
    temperature: 0,
  };
}

interface CompileFromPromptBody {
  protocolText?: string;
  sourceProtocolId?: string;
  answers?: Record<string, string>;
}

export function createIntentCompileFromPromptHandlers(ctx: AppContext, deps: CompileFromPromptDeps = {}) {
  const store: RecordStore = deps.store ?? ctx.store;
  const searchLabwareByHint = createLabwareLookup(store);

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
      try {
        const { intent, compile } = await compileFromSmallLlm({
          prompt: protocolText,
          llmClient: llmClient as never,
          model: toInferenceConfig(deps, ctx).model,
          deps: { searchLabwareByHint },
        });
        return reply.send({
          outcome: compile.outcome,
          terminalArtifacts: compile.terminalArtifacts,
          localMacro: intent,
          axes: body.answers ?? {},
        });
      } catch (err) {
        request.log.error({ err }, 'Failed to compile-from-prompt one-shot');
        return reply.status(500).send({
          error: 'INTENT_COMPILE_PROMPT_FAILED',
          message: err instanceof Error ? err.message : String(err),
        });
      }
    },
  };
}

export function registerIntentCompileFromPromptRoutes(instance: FastifyInstance, ctx: AppContext): void {
  const h = createIntentCompileFromPromptHandlers(ctx);
  instance.post('/intent/compile-from-prompt', h.compileFromPrompt.bind(h));
}