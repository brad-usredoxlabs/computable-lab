/**
 * Streaming handlers for the event-editor "Fix-it" side chat.
 *
 * Phase 1 surface: a single streaming chat endpoint that talks to the worker
 * Qwen on thunderbeast:8001 (PI_WORKER_BASE_URL / PI_WORKER_MODEL) and helps
 * the user diagnose why a draft preview looks wrong. No spec synthesis or
 * coder application yet — those land in Phase 2.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import { stringify as stringifyYaml, parse as parseYaml } from 'yaml';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createInferenceClient, listInferenceModels } from '../../ai/InferenceClient.js';
import type { ChatMessage, InferenceClient } from '../../ai/types.js';
import { createDeterministicPrecompilePass } from '../../compiler/pipeline/passes/DeterministicPrecompilePass.js';
import {
  createDeterministicPlanConsolidationPass,
  createLabwareResolvePass,
  createPlanDeckLayoutPass,
} from '../../compiler/pipeline/passes/ChatbotCompilePasses.js';
import { runFoundryCoderPatch } from '../../foundry/FoundryCoderPatch.js';
import { runFoundryPatchCritic } from '../../foundry/FoundryCritic.js';
import type { FoundryCriticResult } from '../../foundry/FoundryCritic.js';
import { getCompoundClassRegistry } from '../../registry/CompoundClassRegistry.js';
import {
  getLabwareDefinitionRegistry,
  type LabwareDefinitionRecord,
} from '../../registry/LabwareDefinitionRegistry.js';
import { getOntologyTermRegistry } from '../../registry/OntologyTermRegistry.js';
import { getVerbActionMap } from '../../registry/VerbActionMapRegistry.js';
import { fuzzyFindByName } from '../../registry/fuzzyMatch.js';

const execFileAsync = promisify(execFile);

/**
 * Thrown internally when the client closes the SSE connection mid-flight.
 * Caught in `applyFixStream` to drive a clean rollback before exiting.
 */
class FixItAbortedError extends Error {
  constructor() {
    super('fix-it apply aborted by client');
    this.name = 'FixItAbortedError';
  }
}

// --- Wire shape ---------------------------------------------------------------

export interface FixItChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Snapshot of the editor state at the moment the user opened the Fix-it
 * panel. Sent over the wire so the assistant has a stable referent for the
 * whole conversation.
 */
export interface FixItSeed {
  prompt: string;
  draft: {
    events: unknown[];
    placements: Array<{
      placementId: string;
      labwareId: string;
      location:
        | { kind: 'slot'; slotId: string }
        | { kind: 'lawn'; xMm: number; yMm: number };
      orientation: 'portrait' | 'landscape';
    }>;
    labwares: Record<string, { labwareId: string; name: string; labwareType: string }>;
    skips: string[];
  };
  deckContext: {
    platformId: string;
    platformLabel: string | null;
    variantId: string;
    variantTitle: string | null;
    committedPlacements: Array<{
      slotId: string | null;
      lawn: { xMm: number; yMm: number } | null;
      labwareName: string;
      labwareType: string;
    }>;
  };
  fixItSessionId: string;
}

export interface FixChatBody {
  seed: FixItSeed;
  history: FixItChatMessage[];
  userMessage: string;
}

export interface SynthesizeSpecBody {
  seed: FixItSeed;
  history: FixItChatMessage[];
}

export interface SynthesizeSpecResponse {
  /** Spec YAML — the patch-spec the coder agent will be handed. */
  specYaml: string;
  /** Fixture YAML — the failing-prompt regression test. */
  fixtureYaml: string;
  /** Server-assigned id; the fixture & spec both already include it. */
  specId: string;
  /** Path the fixture WILL be written to (server-side relative). */
  fixturePath: string;
}

// --- Server-sent event shape (mirrors what the dock parses) -------------------

type FixChatEvent =
  | { type: 'text_delta'; delta: string }
  | { type: 'reasoning_delta'; delta: string }
  | { type: 'done' }
  | { type: 'error'; message: string };

export interface ApplyFixBody {
  /** Spec YAML as a string (server writes it to the patch-specs queue). */
  specYaml: string;
  /** Fixture YAML to write into server/src/compiler/pipeline/fixtures/. */
  fixtureYaml: string;
  /** Server-assigned spec id (matches the fixture name and file stem). */
  specId: string;
  /** Repo-relative path the fixture YAML will be written to. */
  fixturePath: string;
}

export type ApplyFixStageName =
  | 'writing_fixture'
  | 'writing_spec'
  | 'coder_running'
  | 'critic_running'
  | 'senior_retry';

export interface ApplyFixCriticSummary {
  verdict: 'pass' | 'block' | 'revision';
  message: string;
  criteriaMet: string[];
  criteriaFailed: string[];
  revisionFeedback?: string;
  /** True when the second pass (senior coder) was the one that finished. */
  seniorRetryRan: boolean;
}

type ApplyFixResultStatus =
  | 'applied'
  | 'blocked'
  | 'failed'
  | 'skipped'
  | 'stale'
  | 'needs-human'
  | 'needs-revision';

export type ApplyFixEvent =
  | { type: 'stage'; stage: ApplyFixStageName }
  | {
      type: 'progress';
      source: 'server' | 'coder' | 'critic';
      phase: string;
      message: string;
      details?: Record<string, unknown>;
    }
  | {
      type: 'done';
      result: {
        status: ApplyFixResultStatus;
        message: string;
        touchedFiles: string[];
        commit?: string;
        critic?: ApplyFixCriticSummary;
      };
    }
  | { type: 'error'; message: string };

export interface FixItHealthEndpoint {
  reachable: boolean;
  baseUrl: string;
  model: string;
  models?: string[];
  error?: string;
}

export interface FixItHealthResponse {
  worker: FixItHealthEndpoint;
  architect: FixItHealthEndpoint;
}

export interface EventEditorFixHandlers {
  chatStream(
    request: FastifyRequest<{ Body: FixChatBody }>,
    reply: FastifyReply,
  ): Promise<void>;
  synthesizeSpec(
    request: FastifyRequest<{ Body: SynthesizeSpecBody }>,
    reply: FastifyReply,
  ): Promise<SynthesizeSpecResponse | { error: string; message: string }>;
  applyFixStream(
    request: FastifyRequest<{ Body: ApplyFixBody }>,
    reply: FastifyReply,
  ): Promise<void>;
  health(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<FixItHealthResponse>;
}

// --- Worker-LLM config --------------------------------------------------------

interface WorkerInferenceConfig {
  baseUrl: string;
  model: string;
  apiKey?: string;
}

function resolveWorkerConfig(): WorkerInferenceConfig {
  // Matches the FoundryCoderPatch worker lane so anyone who's already pointed
  // PI_WORKER_BASE_URL/_MODEL gets reused here without further config.
  const baseUrl =
    process.env['PI_WORKER_BASE_URL'] ?? 'http://thunderbeast:8001/v1';
  const model =
    process.env['PI_WORKER_MODEL'] ?? 'Qwen/Qwen3.6-35B-A3B-FP8';
  const apiKey = process.env['PI_WORKER_API_KEY'];
  return { baseUrl, model, ...(apiKey ? { apiKey } : {}) };
}

function resolveArchitectConfig(): WorkerInferenceConfig {
  // The senior coder + critic both run on the architect endpoint.
  const baseUrl =
    process.env['PI_ARCHITECT_BASE_URL']
    ?? process.env['OPENAI_BASE_URL']
    ?? 'http://thunderbeast:8000/v1';
  const model =
    process.env['PI_ARCHITECT_MODEL']
    ?? process.env['OPENAI_MODEL']
    ?? 'Qwen/Qwen3.6-27B-FP8';
  const apiKey = process.env['PI_ARCHITECT_API_KEY'];
  return { baseUrl, model, ...(apiKey ? { apiKey } : {}) };
}

// --- System prompt ------------------------------------------------------------

const SYSTEM_PROMPT = `You are a deterministic compiler failure analyst for the
event editor. The user typed a natural-language prompt and the editor produced
a draft event graph or deck preview that they believe is wrong.

You will be given:
  - the captured user prompt
  - the frontend draft/preview snapshot and preview skips
  - deck/platform context
  - a server-computed compiler trace with real pass outputs

Do not guess. Use only the supplied trace, draft, skips, and deck context.

Core rule:
Never claim a missing registry definition if any trace field shows the noun
resolved to a labware definition or record. If the object resolved but placement
failed, classify the failure downstream of noun resolution.

Decision order:

1. Input boundary
Check whether the captured prompt is empty, stale, truncated, or includes
meta-commentary. If so, classify as input-boundary.

2. Verb
Check deterministic_precompile.compileIr.actions/actionFrames. If no verb
matched, classify as verb-map/synonym coverage. If the wrong verb matched,
classify as verb semantics.

3. Noun resolution
Check actionFrames[].nouns plus registry_lookup. If the needed noun has a
registry hit or resolved recordId, it is not a missing definition. If no hit,
classify as registry/synonym/noun-phrase issue. If the phrase was chunked
incorrectly, classify as noun phrase extraction.

4. Parameter grammar
Check actionFrames[].parameters and candidateEvents. Look for deck coordinates,
well addresses, counts, volumes, and durations. If a deck coordinate such as B2
appears under wells/target_wells instead of candidateLabwares[].deckSlot or
labwareAdditions[].deckSlot, classify as location grammar. If 96 from
"96-well" appears as a count, mention it only if it changed behavior.

5. Placement candidate
Check deterministic_precompile.candidateLabwares, ai_precompile.candidateLabwares,
resolve_labware.labwareAdditions, and plan_deck_layout.
  - candidateLabwares present + no deckSlot means the parser recognized labware
    but failed to infer placement.
  - labwareAdditions present + deckSlot means backend placement handoff
    succeeded.
  - labwareAdditions absent after a resolved candidate usually means no
    placement slot was requested/emitted.
  - When the prompt shape is "put/place/add <labware noun> on/onto/at <deck
    token>", and the noun is resolved labware, treat the deck token as a
    placement target unless the surrounding words explicitly say well, wells,
    row, column, sample location, or another intra-labware address.

6. Deck/layout/UI validation
Check plan_deck_layout and frontend_preview.skips. If pinned layout exists but
preview skipped it, classify as platform/slot validation. If there is a conflict,
classify as occupied/conflicting slot. If no pinned layout exists, stay upstream.

Fix guidance:
Do not jump from "the matched verb is add_material" to "change the verb mapping".
For put/place/add-style prompts, first ask whether the noun is labware and
whether the locative phrase should have produced a labware placement candidate.
Prefer a grammar/lowering fix that emits deckSlot on the labware candidate and
prevents that token from also becoming parameters.wells. In spec language, this
means "emit a labware placement candidate with deckSlot". Only recommend a verb
map change when the trace shows the verb itself is missing or semantically wrong
after location grammar is accounted for.

Output exactly these sections:
Diagnosis: one concise paragraph naming the first failed stage and citing
specific trace fields.
Evidence: 3-5 bullets with exact trace values.
Fix class: one of input-boundary, verb-map, noun-resolution, parameter-grammar,
placement-emission, deck-layout, frontend-validation, mixed.
Proposed fix: smallest code/data area to inspect, without writing the patch.
Anti-diagnosis: explicitly state any tempting but false diagnosis ruled out by
the evidence.

Be terse. No emoji. No "I think".`;

async function describeSeed(seed: FixItSeed): Promise<string> {
  const draftSummary = [
    `events: ${seed.draft.events.length}`,
    `placements: ${seed.draft.placements
      .map((p) =>
        p.location.kind === 'slot'
          ? `${p.labwareId}@${p.location.slotId}`
          : `${p.labwareId}@lawn(${p.location.xMm},${p.location.yMm})`,
      )
      .join(', ') || 'none'}`,
    `skips: ${seed.draft.skips.join(' | ') || 'none'}`,
  ].join('\n');

  const deck = `${seed.deckContext.platformLabel ?? seed.deckContext.platformId} / ${
    seed.deckContext.variantTitle ?? seed.deckContext.variantId
  }`;

  const committed =
    seed.deckContext.committedPlacements.length === 0
      ? 'empty deck'
      : seed.deckContext.committedPlacements
          .map((p) =>
            p.slotId
              ? `${p.labwareName} (${p.labwareType}) @ slot ${p.slotId}`
              : `${p.labwareName} (${p.labwareType}) @ lawn`,
          )
          .join('; ');

  return [
    `# Seed`,
    `Prompt: ${JSON.stringify(seed.prompt)}`,
    ``,
    `Draft produced:`,
    draftSummary,
    ``,
    `Deck: ${deck}`,
    `Committed: ${committed}`,
    ``,
    await buildDiagnosticBlock(seed),
  ].join('\n');
}

// --- Ground-truth diagnostic block -------------------------------------------

function makeTraceState(seed: FixItSeed, outputs = new Map<string, unknown>()) {
  return {
    input: { prompt: seed.prompt },
    context: {},
    meta: {},
    outputs,
    diagnostics: [],
  };
}

function labwareKeys(entry: LabwareDefinitionRecord): string[] {
  return [
    entry.id,
    entry.display_name,
    ...(entry.platform_aliases?.map((alias) => alias.alias) ?? []),
  ];
}

function findLabwareByName(query: string) {
  const hit = fuzzyFindByName({
    entries: getLabwareDefinitionRegistry().list(),
    query,
    getKeys: labwareKeys,
  });
  return hit
    ? {
        recordId: hit.match.recordId,
        registryMatch: {
          distance: hit.distance,
          matchedKey: hit.matchedKey,
          matchKind: hit.matchKind,
        },
      }
    : undefined;
}

function findCompoundByName(query: string) {
  const hit = fuzzyFindByName({
    entries: getCompoundClassRegistry().list(),
    query,
    getKeys: (compound) => [compound.id, compound.name],
  });
  return hit
    ? {
        recordId: hit.match.id,
        registryMatch: {
          distance: hit.distance,
          matchedKey: hit.matchedKey,
          matchKind: hit.matchKind,
        },
      }
    : undefined;
}

function promptScan(prompt: string): Record<string, unknown> {
  const strictSlotRegex = /\b(?:deck\s+)?slot\s+([A-D][1-4])\b/gi;
  const strictSlotPhrases: string[] = [];
  for (const match of prompt.matchAll(strictSlotRegex)) {
    strictSlotPhrases.push(match[0]);
  }

  const deckLikeTokens: Array<{ token: string; context: string }> = [];
  const deckLikeRegex = /\b([A-D][1-4])\b/g;
  for (const match of prompt.matchAll(deckLikeRegex)) {
    const index = match.index ?? 0;
    deckLikeTokens.push({
      token: match[1]!.toUpperCase(),
      context: prompt.slice(Math.max(0, index - 24), Math.min(prompt.length, index + match[0].length + 24)),
    });
  }

  return {
    strictSlotPhrases,
    deckLikeTokens,
  };
}

function registryLookup(prompt: string): Record<string, unknown> {
  const STOPWORDS = /^(?:a|an|the|to|on|onto|at|in|into|from|with|of|for|and|then|please|let|me|us|that|this|new)$/i;
  const VERBS_AT_FRONT = /^(?:place|put|set|add|load|move|stage|store|drop|aliquot|transfer|stamp|spread|inoculate|incubate|mix|wash|harvest|read|measure)\s+/i;
  const chunks = prompt
    .split(/\b(?:on|onto|at|in|into|to|from|with|of|for|and|then)\b|[,;]/i)
    .map((value) => value.trim())
    .filter((value) => value.length >= 2 && !/^\d+$/.test(value) && !/^[A-D][1-4]$/i.test(value))
    .map((value) => value.replace(VERBS_AT_FRONT, '').trim())
    .map((value) => value.replace(/^(?:a|an|the)\s+/i, '').trim())
    .filter((value) => value.length >= 2 && !STOPWORDS.test(value));

  const seen = new Set<string>();
  const phrases = chunks.filter((chunk) => {
    const key = chunk.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const labwareEntries = getLabwareDefinitionRegistry().list();
  return {
    labware: phrases.map((phrase) => {
      const hit = fuzzyFindByName({
        entries: labwareEntries,
        query: phrase,
        getKeys: labwareKeys,
      });
      return hit
        ? {
            phrase,
            hit: true,
            id: hit.match.id,
            recordId: hit.match.recordId,
            displayName: hit.match.display_name,
            matchedKey: hit.matchedKey,
            matchKind: hit.matchKind,
          }
        : { phrase, hit: false };
    }),
  };
}

function sampleArray<T>(values: T[] | undefined, limit = 12): T[] {
  return Array.isArray(values) ? values.slice(0, limit) : [];
}

/**
 * Server-side trace computed from the failing prompt. This intentionally
 * exposes pass outputs instead of pre-deciding the answer for the chat model.
 */
export async function buildDiagnosticBlock(seed: FixItSeed): Promise<string> {
  try {
    const deterministicPass = createDeterministicPrecompilePass({
      verbActionMapRegistry: getVerbActionMap(),
      labwareDefinitionRegistry: { findByName: findLabwareByName },
      compoundClassRegistry: { findByName: findCompoundByName },
      ontologyTermRegistry: {
        searchLabel: (query) => {
          const needle = query.toLowerCase();
          return getOntologyTermRegistry().list()
            .filter((term) => term.label.toLowerCase().includes(needle))
            .map((term) => ({ id: term.id, label: term.label, source: term.source }));
        },
      },
      labwareInstanceLookup: async () => [],
    });

    const deterministicResult = await deterministicPass.run({
      pass_id: 'deterministic_precompile',
      state: makeTraceState(seed),
    });
    const deterministicOutput = deterministicResult.output as Record<string, unknown>;

    const consolidationResult = await createDeterministicPlanConsolidationPass().run({
      pass_id: 'deterministic_plan_consolidation',
      state: makeTraceState(seed, new Map([['deterministic_precompile', deterministicOutput]])),
    });
    const consolidationOutput = consolidationResult.output as Record<string, unknown>;
    const aiPrecompile =
      (consolidationResult.secondaryOutputs?.ai_precompile as Record<string, unknown> | undefined)
      ?? {
        candidateEvents: deterministicOutput.candidateEvents,
        candidateLabwares: deterministicOutput.candidateLabwares,
        unresolvedRefs: deterministicOutput.unresolvedRefs,
      };

    const resolveLabwareResult = await createLabwareResolvePass({
      searchLabwareByHint: async (hint) => {
        const hit = fuzzyFindByName({
          entries: getLabwareDefinitionRegistry().list(),
          query: hint,
          getKeys: labwareKeys,
        });
        return hit
          ? [{ recordId: hit.match.recordId, title: hit.match.display_name }]
          : [];
      },
    }).run({
      pass_id: 'resolve_labware',
      state: makeTraceState(seed, new Map([['ai_precompile', aiPrecompile]])),
    });
    const resolveLabwareOutput = resolveLabwareResult.output as Record<string, unknown>;

    const deckLayoutResult = await createPlanDeckLayoutPass().run({
      pass_id: 'plan_deck_layout',
      state: makeTraceState(seed, new Map([['resolve_labware', resolveLabwareOutput]])),
    });
    const deckLayoutOutput = deckLayoutResult.output as Record<string, unknown>;

    const compileIr = deterministicOutput.compileIr as
      | { actions?: unknown[]; actionFrames?: unknown[] }
      | undefined;
    const trace = {
      prompt_scan: promptScan(seed.prompt),
      registry_lookup: registryLookup(seed.prompt),
      deterministic_precompile: {
        deterministicCompleteness: deterministicOutput.deterministicCompleteness,
        residualClauses: deterministicOutput.residualClauses,
        candidateLabwares: deterministicOutput.candidateLabwares,
        candidateEvents: sampleArray(deterministicOutput.candidateEvents as unknown[] | undefined),
        compileIr: {
          actions: sampleArray(compileIr?.actions),
          actionFrames: sampleArray(compileIr?.actionFrames),
        },
        diagnostics: deterministicResult.diagnostics ?? [],
      },
      deterministic_plan_consolidation: {
        protocolPlan: consolidationOutput.protocolPlan,
        aiPrecompile: {
          candidateLabwares: aiPrecompile.candidateLabwares,
          candidateEvents: sampleArray(aiPrecompile.candidateEvents as unknown[] | undefined),
          unresolvedRefs: aiPrecompile.unresolvedRefs,
        },
        diagnostics: consolidationResult.diagnostics ?? [],
      },
      resolve_labware: {
        output: resolveLabwareOutput,
        diagnostics: resolveLabwareResult.diagnostics ?? [],
      },
      plan_deck_layout: {
        output: deckLayoutOutput,
        diagnostics: deckLayoutResult.diagnostics ?? [],
      },
      frontend_preview: {
        draftEventsCount: seed.draft.events.length,
        draftPlacements: seed.draft.placements,
        draftLabwares: seed.draft.labwares,
        skips: seed.draft.skips,
      },
    };

    return [
      'Compiler trace (server-computed pass outputs — do not contradict):',
      stringifyYaml(trace).trimEnd(),
    ].join('\n');
  } catch (err) {
    return [
      'Compiler trace (server-computed pass outputs — trace failed):',
      stringifyYaml({
        error: err instanceof Error ? err.message : String(err),
      }).trimEnd(),
    ].join('\n');
  }
}

// --- Spec synthesis -----------------------------------------------------------

const SYNTHESIZE_SYSTEM_PROMPT = `You are now synthesizing a narrow implementation
spec for a coder agent. The user and a diagnosis assistant have already discussed
why a deterministic-precompile output looked wrong. Your job is to emit JSON with
two pieces:

  1. "spec" — a YAML-shaped patch spec the coder will follow
  2. "fixture" — a YAML-shaped regression test that captures the failing prompt
     and the expected outcome AFTER the fix

The spec must be narrow enough for one local coder session, match the fix class
that the diagnosis concluded (do not flip a code-fix diagnosis into a registry
fix or vice versa), and include:
  - title (one sentence)
  - fixClass: one of "data-only" | "registry" | "compiler" | "mixed"
  - rationale: short paragraph
  - ownedFiles: array of relative paths the coder may touch. Scope is the
    deterministic precompile + its registries. Pick from these unless absolutely
    necessary:
      - "server/src/compiler/pipeline/passes/DeterministicPrecompilePass.ts"
      - "server/src/compiler/precompile/NounPhraseResolver.ts"
      - "server/src/compiler/precompile/PromptTagger.ts"
      - "server/src/registry/VerbActionMapRegistry.ts"
      - "server/src/registry/LabwareDefinitionRegistry.ts"
      - "schema/registry/verb-action-map.yaml"
      - "schema/registry/labware-definitions/<file>.yaml"
      - "schema/registry/ontology-terms/<file>.yaml"
  - acceptance: bullet criteria — what the fix must make true. Be concrete.

Diagnosis-to-spec mapping:
  - Diagnosis labels like parameter-grammar, location grammar, and
    placement-emission are compiler fixes. Emit spec.fixClass = "compiler".
  - If the trace proves the noun resolved to a recordId, do not emit a registry
    or data-only spec for that noun.
  - Do not write an acceptance criterion that merely changes the verb map for a
    put/place/add synonym unless the trace shows verb lookup failed. When the
    trace shows a resolved labware noun and a deck-like token misrouted into
    wells, target deterministic grammar/lowering: emit a labware placement
    candidate with deckSlot and do not also treat that token as a well.
  - Include one guardrail acceptance criterion for the opposite case: prompts
    that explicitly refer to wells, target wells, source wells, rows, columns,
    or intra-labware locations must still parse deck-like tokens as well
    addresses when that is what the language says.

The fixture is a Fixture YAML (deterministicOnly mode) shaped exactly like:
  name: <auto — leave blank; server will fill>
  description: <one line>
  deterministicOnly: true
  input:
    prompt: <the EXACT failing prompt from the seed, unchanged>
  expected:
    outcome: complete
    terminalArtifacts:
      <only fields exposed by TerminalArtifacts>

Fixture schema discipline:
  - The compiler trace includes internal pass outputs. Use those in rationale
    and acceptance criteria, but do not copy internal pass fields into
    expected.terminalArtifacts unless TerminalArtifacts exposes them.
  - Current useful TerminalArtifacts fields include events, gaps,
    labStateDelta, deckLayoutPlan, resolvedRefs, resolvedLabwareRefs,
    resourceManifest, deterministicProtocolPlan, protocolIntent, and
    validationReport.
  - labwareAdditions is an internal resolve_labware pass output, not a
    TerminalArtifacts field. Mention it in acceptance if useful; do not put it
    under fixture.expected.terminalArtifacts.
  - terminalArtifacts.events contains executable protocol primitives such as
    liquid handling, incubation, reads, and similar actions. Deck setup is not
    represented as a made-up place_labware event unless the trace or existing
    event schema proves such an event is emitted.
  - For a pure deck-placement fix, prefer asserting deckLayoutPlan.pinned. If
    you also assert events, use events: [] only when the expected behavior is
    no liquid-handling primitive. Do not invent event fields like type,
    labwareHint, or deckSlot under terminalArtifacts.events.
  - For deck placement assertions, use terminalArtifacts.deckLayoutPlan.pinned
    with this shape:
      pinned:
        - slot: B2
          labwareHint: lbw-def-generic-96-well-plate
    Do not invent labwareId/deckSlot keys under deckLayoutPlan.pinned.
  - When adding guardrail prompts in acceptance, use fully resolvable nouns
    instead of vague placeholders like "plate" unless the point of the test is
    noun resolution.

Respond ONLY with JSON of shape:
  { "spec": { ...keys above... }, "fixture": { ...keys above... } }

No prose, no markdown fences. Just JSON. The user's failing prompt and the
prior diagnosis are in the messages below.`;

interface SynthesizedSpec {
  title?: string;
  fixClass?: string;
  rationale?: string;
  ownedFiles?: string[];
  acceptance?: string[];
  tests?: string[];
  [key: string]: unknown;
}

interface SynthesizedFixture {
  name?: string;
  description?: string;
  deterministicOnly?: boolean;
  input?: { prompt?: string };
  expected?: Record<string, unknown>;
  [key: string]: unknown;
}

function generateSpecId(): string {
  const stamp = new Date().toISOString().slice(0, 10);
  const rand = Math.random().toString(36).slice(2, 7);
  return `spec-fix-${stamp}-${rand}`;
}

/**
 * Salvage a JSON object out of an LLM response. Models sometimes wrap the
 * payload in markdown fences or add trailing commentary; lift the outermost
 * `{ ... }` and parse that.
 */
function extractJson(text: string): unknown {
  const trimmed = text.trim();
  // Direct parse — happy path.
  try {
    return JSON.parse(trimmed);
  } catch {
    /* fall through */
  }
  // Strip ```json fences if present.
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fence) {
    try {
      return JSON.parse(fence[1]!);
    } catch {
      /* fall through */
    }
  }
  // Slice between the first { and the last }.
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first !== -1 && last > first) {
    try {
      return JSON.parse(trimmed.slice(first, last + 1));
    } catch {
      /* fall through */
    }
  }
  throw new Error('Spec synthesizer response was not valid JSON');
}

/**
 * Run the worker LLM to produce a spec + fixture pair. Returns YAML strings
 * for both, plus the server-assigned spec id and the fixture's intended
 * on-disk path so the caller can preview/edit them before applying.
 */
async function synthesizeSpecAndFixture(args: {
  client: InferenceClient;
  model: string;
  seed: FixItSeed;
  history: FixItChatMessage[];
}): Promise<SynthesizeSpecResponse> {
  const seedDescription = await describeSeed(args.seed);
  // Single leading system message — vLLM rejects multiple system turns.
  const messages: ChatMessage[] = [
    { role: 'system', content: `${SYNTHESIZE_SYSTEM_PROMPT}\n\n${seedDescription}` },
    ...args.history.map((m) => ({ role: m.role, content: m.content } as ChatMessage)),
    {
      role: 'user',
      content:
        'Now produce the JSON with "spec" and "fixture" keys as instructed. ' +
        'Include the exact failing prompt verbatim in fixture.input.prompt.',
    },
  ];

  const response = await args.client.complete({
    model: args.model,
    messages,
    temperature: 0.1,
    max_tokens: 2048,
  });
  const raw = response.choices?.[0]?.message?.content ?? '';
  const parsed = extractJson(raw) as { spec?: SynthesizedSpec; fixture?: SynthesizedFixture };
  if (!parsed || typeof parsed !== 'object' || !parsed.spec || !parsed.fixture) {
    throw new Error('Spec synthesizer response missing spec/fixture keys');
  }

  const specId = generateSpecId();
  const fixturePath = `server/src/compiler/pipeline/fixtures/${specId}.yaml`;
  const vitestCommand =
    `cd server && npx vitest run src/compiler/pipeline/fixtures/FixItFixtures.test.ts -t '${specId}'`;

  // Post-process: make the spec self-contained and TDD-shaped. The coder
  // can't commit unless the new fixture passes, so the fixture path is in
  // ownedFiles and the vitest command is in tests[].
  const ownedFiles = Array.from(
    new Set([...(parsed.spec.ownedFiles ?? []), fixturePath]),
  );
  const tests = Array.from(
    new Set([...(parsed.spec.tests ?? []), vitestCommand]),
  );

  const specObj: Record<string, unknown> = {
    kind: 'protocol-foundry-patch-spec',
    id: specId,
    source: 'event-editor-fixit',
    generated_at: new Date().toISOString(),
    fixClass: parsed.spec.fixClass ?? 'mixed',
    title: parsed.spec.title ?? 'Event-editor fix-it (untitled)',
    rationale: parsed.spec.rationale ?? '',
    ownedFiles,
    acceptance: parsed.spec.acceptance ?? [],
    tests,
    failingPrompt: args.seed.prompt,
  };

  const fixtureObj: Record<string, unknown> = {
    name: specId,
    description: parsed.fixture.description ?? parsed.spec.title ?? '',
    deterministicOnly: true,
    input: { prompt: parsed.fixture.input?.prompt ?? args.seed.prompt },
    expected: parsed.fixture.expected ?? {},
  };

  return {
    specYaml: stringifyYaml(specObj),
    fixtureYaml: stringifyYaml(fixtureObj),
    specId,
    fixturePath,
  };
}

// --- Git ops (defer-commit) ---------------------------------------------------

/**
 * Narrow git surface used by applyFixStream so the coder can run with
 * `autoCommit: false` and the handler decides whether to commit or roll back
 * once the critic has weighed in.
 */
export interface GitOps {
  /**
   * Stage the given files and create a single commit. Returns the resulting
   * commit SHA, or `undefined` if there was nothing to commit.
   */
  commit(files: string[], title: string): Promise<string | undefined>;
  /**
   * Roll back the working-tree state of the given files. Tracked files are
   * restored to HEAD; untracked files are deleted.
   */
  reset(files: string[]): Promise<void>;
}

function createGitOps(repoRoot: string): GitOps {
  async function runGit(args: string[]): Promise<{ stdout: string; stderr: string }> {
    return execFileAsync('git', args, { cwd: repoRoot, maxBuffer: 8 * 1024 * 1024 });
  }
  return {
    async commit(files, title) {
      if (files.length === 0) return undefined;
      await runGit(['add', '--', ...files]);
      const staged = await runGit(['diff', '--cached', '--name-only']);
      if (!staged.stdout.trim()) return undefined;
      const msg = `Event-editor fix-it: ${title.slice(0, 60)}`.trim();
      await runGit(['commit', '-m', msg]);
      const sha = (await runGit(['rev-parse', 'HEAD'])).stdout.trim();
      return sha || undefined;
    },
    async reset(files) {
      for (const file of files) {
        const tracked = await runGit(['ls-files', '--error-unmatch', '--', file])
          .then(() => true)
          .catch(() => false);
        if (tracked) {
          await runGit(['checkout', '--', file]).catch(() => {});
        } else {
          await unlink(resolve(repoRoot, file)).catch(() => {});
        }
      }
    },
  };
}

// --- Factory ------------------------------------------------------------------

export interface CreateEventEditorFixHandlersDeps {
  /** Override for tests — defaults to the worker config from env. */
  clientFactory?: () => InferenceClient;
  /**
   * Absolute path to the workspace root (where the repo lives). Required for
   * applyFixStream so the coder can write into it and commit. When omitted
   * (e.g., in tests), applyFixStream falls back to `process.cwd()`.
   */
  workspaceRoot?: string;
  /**
   * Override for the FoundryCoderPatch runner — tests can stub this to
   * avoid invoking the LLM or writing to disk.
   */
  runCoderPatch?: typeof runFoundryCoderPatch;
  /**
   * Override for the FoundryCritic runner. Tests stub this to skip the
   * LLM-backed review pass.
   */
  runPatchCritic?: typeof runFoundryPatchCritic;
  /**
   * Override for the git ops used by defer-commit. Tests stub this to assert
   * commit / reset behavior without touching a real repo.
   */
  gitOps?: GitOps;
}

export function createEventEditorFixHandlers(
  deps: CreateEventEditorFixHandlersDeps = {},
): EventEditorFixHandlers {
  const buildClient = deps.clientFactory
    ?? (() => {
      const cfg = resolveWorkerConfig();
      return createInferenceClient({
        baseUrl: cfg.baseUrl,
        // Required by InferenceConfig but overridden per-request below.
        model: cfg.model,
        ...(cfg.apiKey ? { apiKey: cfg.apiKey } : {}),
        timeoutMs: 120_000,
        enableThinking: false,
      });
    });

  const coderPatchRunner = deps.runCoderPatch ?? runFoundryCoderPatch;
  const criticRunner = deps.runPatchCritic ?? runFoundryPatchCritic;
  const workspaceRoot = deps.workspaceRoot ?? process.cwd();
  const artifactRoot = resolve(workspaceRoot, 'artifacts', 'event-editor-fixit');
  const gitOps = deps.gitOps ?? createGitOps(workspaceRoot);

  return {
    async chatStream(request, reply) {
      const body = request.body;
      if (!body?.seed || !body?.userMessage || typeof body.userMessage !== 'string') {
        reply.status(400);
        await reply.send({ error: 'INVALID_REQUEST', message: 'seed and userMessage required' });
        return;
      }

      const origin = typeof request.headers.origin === 'string' ? request.headers.origin : '*';
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
        'Access-Control-Allow-Origin': origin,
        'Vary': 'Origin',
      });
      // Disable Nagle so each event flushes immediately to the client.
      // Without this, sparse SSE events sit in the TCP buffer for minutes.
      reply.raw.flushHeaders?.();
      reply.raw.socket?.setNoDelay?.(true);
      // Prime the stream so the client immediately knows the connection is live.
      reply.raw.write(`: connected\n\n`);
      const send = (event: FixChatEvent) => {
        reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
      };

      const client = buildClient();
      const cfg = resolveWorkerConfig();

      const seedDescription = await describeSeed(body.seed);
      // vLLM only accepts a single leading system message, so the prompt
      // and the seed description go in together. Anything after the first
      // system message must be user/assistant.
      const messages: ChatMessage[] = [
        { role: 'system', content: `${SYSTEM_PROMPT}\n\n${seedDescription}` },
        ...body.history.map((m) => ({ role: m.role, content: m.content } as ChatMessage)),
        { role: 'user', content: body.userMessage },
      ];

      try {
        for await (const chunk of client.completeStream({
          model: cfg.model,
          messages,
          temperature: 0.2,
          max_tokens: 2048,
        })) {
          const rawDelta = chunk.choices?.[0]?.delta as Record<string, unknown> | undefined;
          if (!rawDelta) continue;

          // Forward reasoning_content / reasoning as a distinct event.
          const reasoningDelta =
            typeof rawDelta['reasoning'] === 'string' ? rawDelta['reasoning']
            : typeof rawDelta['reasoning_content'] === 'string' ? rawDelta['reasoning_content']
            : undefined;
          if (reasoningDelta && reasoningDelta.length > 0) {
            send({ type: 'reasoning_delta', delta: reasoningDelta });
          }

          // Forward content as text_delta, skipping when it is just a
          // duplicate of the reasoning delta (some providers echo both).
          const contentDelta = rawDelta['content'];
          if (typeof contentDelta === 'string' && contentDelta.length > 0) {
            if (!reasoningDelta || contentDelta !== reasoningDelta) {
              send({ type: 'text_delta', delta: contentDelta });
            }
          }
        }
        send({ type: 'done' });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        request.log.error({ err }, 'fix-it chat stream failed');
        send({ type: 'error', message });
      } finally {
        reply.raw.end();
      }
    },

    async synthesizeSpec(request, reply) {
      const body = request.body;
      if (!body?.seed) {
        reply.status(400);
        return { error: 'INVALID_REQUEST', message: 'seed required' };
      }
      try {
        const cfg = resolveWorkerConfig();
        const result = await synthesizeSpecAndFixture({
          client: buildClient(),
          model: cfg.model,
          seed: body.seed,
          history: body.history ?? [],
        });
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        request.log.error({ err }, 'fix-it spec synthesis failed');
        reply.status(500);
        return { error: 'SYNTHESIZE_FAILED', message };
      }
    },

    async applyFixStream(request, reply) {
      const body = request.body;
      if (!body?.specYaml || !body?.fixtureYaml || !body?.specId || !body?.fixturePath) {
        reply.status(400);
        await reply.send({
          error: 'INVALID_REQUEST',
          message: 'specYaml, fixtureYaml, specId, and fixturePath required',
        });
        return;
      }

      const origin = typeof request.headers.origin === 'string' ? request.headers.origin : '*';
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
        'Access-Control-Allow-Origin': origin,
        'Vary': 'Origin',
      });
      // Disable Nagle so each progress event flushes immediately. Without
      // this, the coder's reasoning + worklog deltas sit in the kernel
      // buffer for minutes — the user just sees "writing spec" and stalls.
      reply.raw.flushHeaders?.();
      reply.raw.socket?.setNoDelay?.(true);
      reply.raw.write(`: connected (apply-stream-v2)\n\n`);
      const send = (event: ApplyFixEvent) => {
        reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
      };
      const sendProgress = (event: {
        source: 'server' | 'coder' | 'critic';
        phase: string;
        message: string;
        details?: Record<string, unknown>;
      }) => {
        send({ type: 'progress', ...event });
      };
      // Periodic SSE heartbeat. Belt-and-suspenders against any buffering
      // layer in the path (Node, Vite dev proxy, etc.) — writing bytes
      // every 1.5s reliably forces a flush even when no real events are
      // being emitted (e.g., during a slow LLM call that hasn't started
      // streaming back yet).
      const heartbeat = setInterval(() => {
        try {
          reply.raw.write(`: heartbeat ${Date.now()}\n\n`);
        } catch {
          /* connection closed; clearInterval below will catch it */
        }
      }, 1500);

      // Abort detection. The frontend stops the SSE stream by aborting its
      // fetch; that surfaces here as a premature close on the response stream.
      // Do NOT listen on request.raw: for POST+SSE it can close after the
      // request body is consumed, before the coder starts, which looks exactly
      // like a mysterious hang after "writing spec".
      // We can't actually cancel an in-flight LLM call (InferenceClient
      // doesn't accept an external AbortSignal), but we CAN check the flag
      // between awaits, skip the commit, and roll back any uncommitted
      // edits so the user lands in a clean state.
      let aborted = false;
      const onResponseClose = () => {
        if (!reply.raw.writableEnded) aborted = true;
      };
      reply.raw.on?.('close', onResponseClose);
      const checkAbort = () => {
        if (aborted) throw new FixItAbortedError();
      };

      // Hoisted so the abort/error handler can roll the working tree back.
      const touchedFileSet = new Set<string>();

      try {
        // 1) Write the fixture YAML into the source tree so the coder's
        //    test run sees it. We resolve relative to workspaceRoot, then
        //    sanity-check that the path is INSIDE the fixtures dir to
        //    prevent the LLM from suggesting some arbitrary location.
        const fixturesDir = 'server/src/compiler/pipeline/fixtures/';
        if (!body.fixturePath.startsWith(fixturesDir)) {
          throw new Error(`fixturePath must start with ${fixturesDir}`);
        }
        send({ type: 'stage', stage: 'writing_fixture' });
        sendProgress({
          source: 'server',
          phase: 'writing_fixture',
          message: `Writing regression fixture ${body.fixturePath}`,
        });
        const absoluteFixturePath = resolve(workspaceRoot, body.fixturePath);
        await mkdir(dirname(absoluteFixturePath), { recursive: true });
        await writeFile(absoluteFixturePath, body.fixtureYaml, 'utf-8');

        // 2) Write the spec YAML to the patch-specs queue layout the coder
        //    scans. Use 'manual_tubes' as the variant (the coder's variant
        //    is purely a folder name here — fix-it isn't deck-variant
        //    specific).
        send({ type: 'stage', stage: 'writing_spec' });
        const protocolId = 'event-editor-fixit';
        const variant = 'manual_tubes' as const;
        const patchSpecDir = join(artifactRoot, 'patch-specs', protocolId, variant);
        await mkdir(patchSpecDir, { recursive: true });
        const patchSpecPath = join(patchSpecDir, `${body.specId}.yaml`);
        sendProgress({
          source: 'server',
          phase: 'writing_spec',
          message: `Writing patch spec ${body.specId}`,
          details: { patchSpecPath },
        });
        await writeFile(patchSpecPath, body.specYaml, 'utf-8');

        // Title from the spec is used as the eventual commit message when
        // the critic passes the patch.
        const specParsed = parseSpecForTitle(body.specYaml);
        const specTitle = specParsed.title ?? body.specId;

        checkAbort();

        // 3) Hand the spec to the junior coder. forcedSpecPath bypasses
        //    the already-applied filter so retries / iterations work.
        //    autoCommit is OFF — the handler defers the commit (or rollback)
        //    until after the critic has weighed in.
        send({ type: 'stage', stage: 'coder_running' });
        sendProgress({ source: 'server', phase: 'junior_started', message: 'Starting junior coder' });
        let coderResult = await coderPatchRunner({
          artifactRoot,
          repoRoot: workspaceRoot,
          protocolId,
          variant,
          forcedSpecPath: patchSpecPath,
          coderRole: 'junior',
          coderEngine: 'tool-agent',
          autoCommit: false,
          onProgress: (event) => sendProgress(event),
        });
        sendProgress({
          source: 'server',
          phase: 'junior_finished',
          message: `Junior coder finished with status ${coderResult.status}`,
          details: { status: coderResult.status, touchedFiles: coderResult.touchedFiles },
        });
        for (const f of coderResult.touchedFiles) touchedFileSet.add(f);
        checkAbort();

        // 4) If the junior actually applied a patch, run the critic. The
        //    critic reads the coder's result.yaml from disk, so it must run
        //    AFTER the coder finishes. If the junior tool-agent times out
        //    before producing an applied patch, escalate directly to the
        //    senior coder with the junior outcome as revision feedback.
        let criticSummary: ApplyFixCriticSummary | undefined;
        let seniorRetryRan = false;
        let finalCriticVerdict: FoundryCriticResult['verdict'] | undefined;
        let seniorRevisionFeedback: string | undefined;
        if (coderResult.status === 'applied') {
          send({ type: 'stage', stage: 'critic_running' });
          sendProgress({ source: 'server', phase: 'critic_started', message: 'Starting critic review' });
          const critic1 = await criticRunner({
            artifactRoot,
            protocolId,
            variant,
            repoRoot: workspaceRoot,
            onProgress: (event) => sendProgress(event),
          });
          criticSummary = summarizeCritic(critic1, false);
          finalCriticVerdict = critic1.verdict;
          sendProgress({
            source: 'server',
            phase: 'critic_finished',
            message: `Critic verdict: ${critic1.verdict}`,
            details: {
              verdict: critic1.verdict,
              criteriaMet: critic1.specVerification?.criteriaMet ?? [],
              criteriaFailed: critic1.specVerification?.criteriaFailed ?? [],
            },
          });
          checkAbort();

          if (critic1.verdict === 'revision') {
            seniorRevisionFeedback = critic1.revisionFeedback ?? critic1.message;
          }
        } else if (coderResult.status === 'needs-human') {
          seniorRevisionFeedback = [
            'Junior coder did not produce an accepted patch.',
            `Junior status: ${coderResult.status}`,
            `Junior message: ${coderResult.message}`,
            'Continue from the same patch spec. Inspect the failing fixture and make a concrete fix.',
          ].join('\n');
        }

        // 5) Senior escalation: critic asked for a revision, or the junior
        //    tool-agent stopped before producing an applied patch. We do this
        //    exactly once — if the senior also fails, surface that result.
        if (seniorRevisionFeedback) {
          send({ type: 'stage', stage: 'senior_retry' });
          sendProgress({
            source: 'server',
            phase: 'senior_started',
            message: finalCriticVerdict === 'revision'
              ? 'Critic requested a revision; starting senior coder'
              : 'Junior coder did not complete; starting senior coder',
            details: { revisionFeedback: seniorRevisionFeedback },
          });
          seniorRetryRan = true;
          coderResult = await coderPatchRunner({
            artifactRoot,
            repoRoot: workspaceRoot,
            protocolId,
            variant,
            forcedSpecPath: patchSpecPath,
            coderRole: 'senior',
            coderEngine: 'tool-agent',
            autoCommit: false,
            attempt: 2,
            revisionFeedback: seniorRevisionFeedback,
            onProgress: (event) => sendProgress(event),
          });
          sendProgress({
            source: 'server',
            phase: 'senior_finished',
            message: `Senior coder finished with status ${coderResult.status}`,
            details: { status: coderResult.status, touchedFiles: coderResult.touchedFiles },
          });
          for (const f of coderResult.touchedFiles) touchedFileSet.add(f);
          checkAbort();
          if (coderResult.status === 'applied') {
            send({ type: 'stage', stage: 'critic_running' });
            sendProgress({
              source: 'server',
              phase: 'critic_started',
              message: 'Starting critic review for senior patch',
            });
            const critic2 = await criticRunner({
              artifactRoot,
              protocolId,
              variant,
              repoRoot: workspaceRoot,
              onProgress: (event) => sendProgress(event),
            });
            criticSummary = summarizeCritic(critic2, true);
            finalCriticVerdict = critic2.verdict;
            sendProgress({
              source: 'server',
              phase: 'critic_finished',
              message: `Critic verdict: ${critic2.verdict}`,
              details: {
                verdict: critic2.verdict,
                criteriaMet: critic2.specVerification?.criteriaMet ?? [],
                criteriaFailed: critic2.specVerification?.criteriaFailed ?? [],
              },
            });
            checkAbort();
          } else {
            // Senior produced no patch. If junior had a revision verdict,
            // preserve it so uncommitted junior edits are still rolled back.
            if (finalCriticVerdict !== 'revision') {
              criticSummary = undefined;
            }
          }
        }

        // 6) Defer-commit decision: commit on pass, reset on
        //    block/revision, leave it alone if the coder never applied.
        const touchedFiles = Array.from(touchedFileSet);
        let commit: string | undefined;
        if (coderResult.status === 'applied' && touchedFiles.length > 0) {
          if (finalCriticVerdict === 'pass') {
            try {
              sendProgress({
                source: 'server',
                phase: 'committing',
                message: `Committing ${touchedFiles.length} touched file(s)`,
                details: { touchedFiles },
              });
              commit = await gitOps.commit(touchedFiles, specTitle);
              sendProgress({
                source: 'server',
                phase: 'committed',
                message: `Committed fix ${commit}`,
                details: { commit },
              });
            } catch (gitErr) {
              request.log.error({ err: gitErr }, 'fix-it commit failed; leaving changes uncommitted');
            }
          } else if (finalCriticVerdict === 'block' || finalCriticVerdict === 'revision') {
            try {
              sendProgress({
                source: 'server',
                phase: 'rolling_back',
                message: `Critic verdict ${finalCriticVerdict}; rolling back uncommitted edits`,
                details: { touchedFiles },
              });
              await gitOps.reset(touchedFiles);
            } catch (gitErr) {
              request.log.error({ err: gitErr }, 'fix-it reset failed; working tree may be dirty');
            }
          }
          // If finalCriticVerdict is undefined (critic never ran), the patch
          // sits uncommitted by design — coderResult.status will surface the
          // problem and the user can inspect manually.
        }

        const effectiveStatus: ApplyFixResultStatus =
          coderResult.status === 'applied' && finalCriticVerdict === 'revision'
            ? 'needs-revision'
            : coderResult.status === 'applied' && finalCriticVerdict === 'block'
              ? 'blocked'
              : coderResult.status;
        const effectiveMessage =
          finalCriticVerdict === 'revision'
            ? criticSummary?.message ?? 'Critic requested revision; patch was not accepted.'
            : finalCriticVerdict === 'block'
              ? criticSummary?.message ?? 'Critic blocked the patch; patch was not accepted.'
              : commit
                ? `Patch accepted and committed.`
                : coderResult.message;

        send({
          type: 'done',
          result: {
            status: effectiveStatus,
            message: effectiveMessage,
            touchedFiles,
            ...(commit ? { commit } : {}),
            ...(criticSummary ? { critic: { ...criticSummary, seniorRetryRan } } : {}),
          },
        });
      } catch (err) {
        if (err instanceof FixItAbortedError) {
          // Client disconnected — roll back any uncommitted edits so the
          // working tree is clean. No outgoing event (the stream is gone).
          request.log.warn('fix-it apply aborted by client');
          if (touchedFileSet.size > 0) {
            await gitOps.reset(Array.from(touchedFileSet)).catch((gitErr) => {
              request.log.error(
                { err: gitErr },
                'fix-it apply: reset after abort failed; working tree may be dirty',
              );
            });
          }
        } else {
          const message = err instanceof Error ? err.message : String(err);
          request.log.error({ err }, 'fix-it apply stream failed');
          send({ type: 'error', message });
        }
      } finally {
        clearInterval(heartbeat);
        reply.raw.off?.('close', onResponseClose);
        reply.raw.end();
      }
    },

    async health(_request, _reply) {
      const workerCfg = resolveWorkerConfig();
      const archCfg = resolveArchitectConfig();
      const [worker, architect] = await Promise.all([
        listInferenceModels(workerCfg.baseUrl, workerCfg.apiKey),
        listInferenceModels(archCfg.baseUrl, archCfg.apiKey),
      ]);
      return {
        worker: {
          reachable: worker.available,
          baseUrl: workerCfg.baseUrl,
          model: workerCfg.model,
          ...(worker.models.length > 0 ? { models: worker.models } : {}),
          ...(worker.error ? { error: worker.error } : {}),
        },
        architect: {
          reachable: architect.available,
          baseUrl: archCfg.baseUrl,
          model: archCfg.model,
          ...(architect.models.length > 0 ? { models: architect.models } : {}),
          ...(architect.error ? { error: architect.error } : {}),
        },
      };
    },
  };
}

function parseSpecForTitle(specYaml: string): { title?: string } {
  try {
    const parsed = parseYaml(specYaml) as Record<string, unknown> | null;
    if (parsed && typeof parsed['title'] === 'string') {
      return { title: parsed['title'] };
    }
  } catch {
    /* malformed YAML — fall back to specId */
  }
  return {};
}

function summarizeCritic(
  critic: FoundryCriticResult,
  seniorRetryRan: boolean,
): ApplyFixCriticSummary {
  return {
    verdict: critic.verdict,
    message: critic.message,
    criteriaMet: critic.specVerification?.criteriaMet ?? [],
    criteriaFailed: critic.specVerification?.criteriaFailed ?? [],
    ...(critic.revisionFeedback ? { revisionFeedback: critic.revisionFeedback } : {}),
    seniorRetryRan,
  };
}
