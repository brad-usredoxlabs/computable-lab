/**
 * Intent-compile handlers.
 *
 * Endpoints:
 * - POST /intent/compile — compile a portable scientist-intent YAML document
 *   into the canonical TerminalArtifacts bundle (events, gaps, deck, resources).
 *   Accepts either a `{ intent: <yaml string> }` body or a bare JSON document
 *   carrying `intentId` + `actions`.
 *
 * This is the SMALL-LLM entry surface: a small model writes the low-entropy
 * scientist-intent YAML; the deterministic compiler (reusing the entire
 * protocolIntent downstream stack) owns the low-level event graph expansion and
 * platform-specific lowering.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createLabwareLookup } from '../../ai/compiler/labwareLookup.js';
import type { RecordStore } from '../../store/types.js';
import { parseScientistIntent, ScientistIntentValidationError } from '../../compiler/scientistIntent/parseScientistIntent.js';
import { compileScientistIntent } from '../../compiler/scientistIntent/compileScientistIntent.js';

interface IntentCompileDeps {
  store: RecordStore;
}

interface IntentCompileBody {
  intent?: string;
  actions?: unknown[];
  intentId?: string;
  [key: string]: unknown;
}

function asYamlDocument(body: unknown): string {
  const rec = body as IntentCompileBody | undefined;
  // Prefer an explicit YAML/JSON string payload.
  if (typeof rec?.intent === 'string') return rec.intent;
  // Otherwise accept a JSON object shaped like a scientist-intent document.
  if (rec && typeof rec === 'object' && Array.isArray(rec.actions)) {
    return JSON.stringify(rec);
  }
  return '';
}

export function createIntentCompileHandlers(deps: IntentCompileDeps) {
  const searchLabwareByHint = createLabwareLookup(deps.store);

  return {
    async compile(
      request: FastifyRequest<{ Body: unknown }>,
      reply: FastifyReply,
    ): Promise<void> {
      const yamlText = asYamlDocument(request.body);
      if (!yamlText.trim()) {
        return reply.status(400).send({
          error: 'INVALID_INTENT',
          message: "Body must provide an 'intent' YAML string, or a JSON object with intentId+actions.",
        });
      }

      let doc;
      try {
        doc = parseScientistIntent(yamlText);
      } catch (err) {
        if (err instanceof ScientistIntentValidationError) {
          return reply.status(422).send({
            error: 'SCIENTIST_INTENT_VALIDATION',
            message: err.message,
            errors: err.errors,
          });
        }
        request.log.error({ err }, 'Failed to parse scientist-intent');
        return reply.status(400).send({
          error: 'INVALID_INTENT',
          message: err instanceof Error ? err.message : String(err),
        });
      }

      try {
        const result = await compileScientistIntent(doc, { searchLabwareByHint });
        return reply.send({
          outcome: result.outcome,
          terminalArtifacts: result.terminalArtifacts,
        });
      } catch (err) {
        request.log.error({ err }, 'Failed to compile scientist-intent');
        return reply.status(500).send({
          error: 'INTENT_COMPILE_FAILED',
          message: err instanceof Error ? err.message : String(err),
        });
      }
    },
  };
}

export function registerIntentCompileRoutes(instance: FastifyInstance, ctx: { store: RecordStore }): void {
  const h = createIntentCompileHandlers({ store: ctx.store });
  instance.post('/intent/compile', h.compile.bind(h));
}