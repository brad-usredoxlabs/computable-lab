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
import { createResolveSpineFromContext } from '../../resolve/index.js';
import type { AppConfig } from '../../config/types.js';
import type { RecordStore } from '../../store/types.js';
import { parseScientistIntent, ScientistIntentValidationError } from '../../compiler/scientistIntent/parseScientistIntent.js';
import { compileScientistIntent } from '../../compiler/scientistIntent/compileScientistIntent.js';

interface IntentCompileDeps {
  store: RecordStore;
  /** SPINE-4 fix1/D1: live config accessor (server.ts:733 pattern) so the
   *  store-backed spine's OAK/vendor tiers read the same app config the
   *  resolve tools use — one resolution path, one answer. */
  getAppConfig?: () => AppConfig | undefined;
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
  // SPINE-4 fix1/D1 (spec §3): production callers inject a store-backed
  // spine. This is the SAME createResolveSpineFromContext composition the
  // resolve tools build (server.ts:733). Without it resolve_nouns sees no
  // local tiers and FALSE-BARS every store-resolvable noun the hint lookup
  // is not eligible for (e.g. seed.material — vocabulary-declared resolvable,
  // domain material, NO hintEligible). compileScientistIntent now throws
  // LOUD when deps.spine is absent — this injection is what keeps the route
  // compiling, not a silent floor.
  const spine = createResolveSpineFromContext({
    store: deps.store,
    ...(deps.getAppConfig ? { getAppConfig: deps.getAppConfig } : {}),
  });

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
        const result = await compileScientistIntent(doc, { searchLabwareByHint, spine });
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

export function registerIntentCompileRoutes(instance: FastifyInstance, ctx: { store: RecordStore; appConfig?: AppConfig | undefined }): void {
  const h = createIntentCompileHandlers({
    store: ctx.store,
    // Live accessor (server.ts:733 pattern): ctx.appConfig is reassigned at
    // runtime (PATCH /api/config), so the spine resolves config per call.
    getAppConfig: () => ctx.appConfig,
  });
  instance.post('/intent/compile', h.compile.bind(h));
}