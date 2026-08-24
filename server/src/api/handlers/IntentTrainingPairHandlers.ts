/**
 * Intent-training-pair handlers — capture the WHOLE accepted localization flow
 * as a training pair for the cl-appliance corpus (THE MOAT).
 *
 * The corpus should train the small model to output CORRECT MACROS (Q6, the
 * goal stated by Brad: get the 2.6B to emit the right macros, the compiler takes
 * it from there). So this endpoint posts:
 *   - prompt: the user's original localization request + the FULL THREAD +
 *     the FINAL (refinement-folded) local macro — the model must learn to emit
 *     the macro the human accepted.
 *   - acceptedGraph: the compiled event graph of the accepted local protocol.
 *   - goldModel: the larger model that re-verified the canonical pair (D3).
 *
 * Everything is best-effort (never blocks/fails the app — corpus.disabled etc.),
 * mirroring the existing CorpusHandlers bridge.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { AppContext } from '../../server.js';
import {
  postCorpusEntry,
  resolveCorpusConfig,
  type CorpusEntryInput,
} from '../../corpus/CorpusClient.js';
import type { ScientistIntentActionValue } from '../../compiler/scientistIntent/types.js';

/** The gold model that re-verifies canonical pairs (Q4: deepseek-v4-flash-0731). */
export const GOLD_MODEL = 'deepseek-v4-flash-0731';

interface TrainingPairBody {
  /** The user's original localization instruction(s) / thread. */
  thread?: Array<{ role: string; content: string }>;
  userPrompt?: string;
  /** The FINAL (refinement-folded) local macro the human accepted. */
  localMacro?: { intentId?: string; actions?: ScientistIntentActionValue[]; [key: string]: unknown };
  /** The accepted local-protocol recordId + source universal protocol id. */
  sourceProtocolId?: string;
  acceptedProtocolId?: string;
  acceptedProtocolResult?: string;
  /** Compiled event graph of the accepted protocol (already-accepted events). */
  acceptedGraph?: Record<string, unknown>;
  confirmedAt?: string;
}

export function createIntentTrainingPairHandlers(ctx: AppContext) {
  const getAppConfig = () => ctx.appConfig;

  return {
    async saveTrainingPair(
      request: FastifyRequest<{ Body: unknown }>,
      reply: FastifyReply,
    ): Promise<void> {
      const body = request.body as TrainingPairBody | undefined;

      // Build the prompt that should train the small model: user request + the
      // full conversational corrections + the FINAL accepted macro (so the model
      // learns that the accepted macro is the target output).
      const userLines: string[] = [];
      if (body?.userPrompt) userLines.push(body.userPrompt);
      const corrections = (body?.thread ?? [])
        .filter((m) => m && typeof m.content === 'string' && m.content.trim())
        .map((m) => `[${m.role}] ${m.content}`);
      if (corrections.length > 0) userLines.push(...corrections);
      const macroJson = JSON.stringify(body?.localMacro ?? {});
      const user = [
        ...userLines,
        '',
        'ACCEPTED MACRO (target output):',
        macroJson,
      ].join('\n');

      const entry: CorpusEntryInput = {
        source: 'protocol-loop',
        sourceType: 'app',
        prompt: {
          user,
          step_context: {
            sourceProtocolId: body?.sourceProtocolId,
            acceptedProtocolId: body?.acceptedProtocolId,
            acceptedProtocolResult: body?.acceptedProtocolResult ?? null,
            localMacro: body?.localMacro,
          },
        },
        acceptedGraph: body?.acceptedGraph ?? {},
        confirmedBy: 'user',
        ...(body?.confirmedAt ? { confirmedAt: body.confirmedAt } : {}),
        // The gold model re-verifies canonical quality (Q4). The corpus trains
        // to macros; the interactive loop stays on the 2.6B.
        goldModel: GOLD_MODEL,
      };

      // Best-effort; never throw to the client (corpus may be disabled/off-box).
      try {
        const config = resolveCorpusConfig(getAppConfig()?.corpus);
        const result = await postCorpusEntry(entry, config);
        return reply.send(result);
      } catch (err) {
        request.log.error({ err }, 'Failed to post intent training pair to corpus');
        return reply.send({ ok: false, error: 'corpus.post-failed' });
      }
    },
  };
}

export function registerIntentTrainingPairRoutes(instance: FastifyInstance, ctx: AppContext): void {
  const h = createIntentTrainingPairHandlers(ctx);
  instance.post('/intent/training-pair', h.saveTrainingPair.bind(h));
}