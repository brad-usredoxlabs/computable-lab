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
// SH-QB-1 (OQ1/OQ2): the deck-context composition + deck binding are the
// SAME imported helpers the chat seam uses (shorthandChat.ts:112-123,
// :138-238) — IMPORT ONLY, never a re-implementation (a hand-rolled
// name-match here would be a divergent second grammar of the exact-one the
// deck-fold ruling forbids). shorthandChat is another item's live file.
import {
  bindShorthandEventsToDeck,
  composeLabwareHintLookupWithDeck,
  type DeckLabwareSummary,
} from '../../ai/shorthandChat.js';

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
  /**
   * SH-QB-1 (OQ1, orchestrator-adopted): the editor's DECK plates — the
   * exact DeckLabwareSummary mirror of the chat request's `context.labwares`
   * element shape. Deck plates are editor state, not store records: without
   * them a document naming the plate the scientist is looking at ("plate1")
   * false-bars as unknown-noun on every recompile (the chat path composes
   * the same context at AgentOrchestrator.ts:1213-1222). ADDITIVE and
   * optional — absent ⇒ today's store-only behavior byte-identical (the
   * goldens replay this route with no deck; the roundTrip T3 pin guards it).
   */
  deckLabwares?: readonly DeckLabwareSummary[];
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

/** SH-QB-1: the deck plates ONLY when the body actually carries a non-empty
 *  array (an empty/absent deck ⇒ undefined ⇒ both deck passes skipped ⇒
 *  byte-identical store-only behavior — the T3 additive-contract pin). */
function deckFromBody(body: unknown): readonly DeckLabwareSummary[] | undefined {
  const rec = body as IntentCompileBody | undefined;
  const deck = rec?.deckLabwares;
  return Array.isArray(deck) && deck.length > 0 ? deck : undefined;
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
        // SH-QB-1 (fix 1, OQ1): when the editor threads its deck plates, the
        // compile sees the SAME resolution context the chat path saw — the
        // store-backed hint lookup composed deck-first with the IMPORTED
        // shorthandChat composition (exact-name match wins, store falls
        // through byte-identically). No deck ⇒ the store-only lookup, exactly
        // as before.
        const deck = deckFromBody(request.body);
        const searchLabware = deck
          ? composeLabwareHintLookupWithDeck(deck, searchLabwareByHint)
          : searchLabwareByHint;
        // exactOptionalPropertyTypes: the lookup key rides only when defined
        // (the store lookup is always defined today; the conditional spread
        // keeps the deps object honest regardless).
        const result = await compileScientistIntent(doc, {
          ...(searchLabware ? { searchLabwareByHint: searchLabware } : {}),
          spine,
        });
        // SH-QB-1 (fix 1, B5): the SAME post-pass the chat result applies
        // (shorthandChat.ts:570) — a no-edit round-trip's events equal the
        // chat path's proposals field-for-field INCLUDING details.labwareId.
        // Store-only calls skip the pass (zero behavior change).
        const terminalArtifacts = deck
          ? { ...result.terminalArtifacts, events: bindShorthandEventsToDeck(result.terminalArtifacts.events, deck) }
          : result.terminalArtifacts;
        // SH-QB-1 (fix 2, the dropped-reason channel): the bar arm's
        // structured clarifications (compileScientistIntent.ts:253-272) used
        // to be dropped on the floor — 200 + empty events + empty gaps + no
        // reason = the silent zero-ghost (findings 4). They now ride VERBATIM
        // (ScientistIntentUnresolvedFact[], no new type, no new reason code),
        // non-empty-only conditional spread (exactOptionalPropertyTypes).
        // The 422/needs-clarification conventions of the FROM-PROMPT route
        // stay untouched (different route, B4).
        return reply.send({
          outcome: result.outcome,
          terminalArtifacts,
          ...(result.clarifications.length > 0 ? { clarifications: result.clarifications } : {}),
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