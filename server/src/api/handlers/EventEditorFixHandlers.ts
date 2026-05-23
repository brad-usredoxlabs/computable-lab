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
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
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
import { evaluateProgress, runFixtureVerification } from '../../foundry/FixItProgressGate.js';
import type { FixtureVerification } from '../../foundry/FixItProgressGate.js';
import { EventEditorFixItJobManager } from '../../foundry/EventEditorFixItJobManager.js';
import type {
  EventEditorFixItJobEvent,
  EventEditorFixItJobRecord,
  EventEditorFixItJobStatus,
  EventEditorFixItSessionSnapshot,
} from '../../foundry/EventEditorFixItJobManager.js';
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
  /** Frontend Fix-it conversation id that produced this apply attempt. */
  fixItSessionId?: string;
  /** Frontend Fix-it state snapshot for restoring this job after reload. */
  sessionSnapshot?: EventEditorFixItSessionSnapshot;
}

export interface ApplyFixJobSummary {
  id: string;
  worktreePath?: string;
  artifactRoot: string;
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
        job?: ApplyFixJobSummary;
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

export interface FixItJobsResponse {
  jobs: EventEditorFixItJobRecord[];
}

export interface FixItJobDetailResponse {
  job: EventEditorFixItJobRecord;
  events: EventEditorFixItJobEvent[];
  sessionSnapshot?: EventEditorFixItSessionSnapshot;
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
  startApplyFixJob(
    request: FastifyRequest<{ Body: ApplyFixBody }>,
    reply: FastifyReply,
  ): Promise<FixItJobDetailResponse | { error: string; message: string }>;
  health(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<FixItHealthResponse>;
  listJobs(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<FixItJobsResponse>;
  getJob(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ): Promise<FixItJobDetailResponse | { error: string; message: string }>;
  streamJobEvents(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ): Promise<void>;
  completeJob(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ): Promise<FixItJobDetailResponse | { error: string; message: string }>;
  getJobSpec(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ): Promise<
    | { specId: string; specYaml: string; fixtureYaml: string; fixturePath: string }
    | { error: string; message: string }
  >;
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
  // Architect is collapsed onto the worker: the ralph loop runs senior on the
  // worker and the critic was dropped, so nothing in fix-it actually calls a
  // separate architect endpoint. The `health` handler still reports an
  // `architect` field for the FixItPanel banner; point it at the same worker
  // so the banner reflects the single live endpoint instead of pinging a host
  // that no longer exists. Explicit PI_ARCHITECT_BASE_URL still wins.
  if (process.env['PI_ARCHITECT_BASE_URL']) {
    const baseUrl = process.env['PI_ARCHITECT_BASE_URL']!;
    const model =
      process.env['PI_ARCHITECT_MODEL']
      ?? process.env['OPENAI_MODEL']
      ?? 'Qwen/Qwen3.6-27B-FP8';
    const apiKey = process.env['PI_ARCHITECT_API_KEY'];
    return { baseUrl, model, ...(apiKey ? { apiKey } : {}) };
  }
  return resolveWorkerConfig();
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

You have the compiler trace, NOT the source code. Be definitive about what the
trace proves (which stage failed, where data is dropped, the fix class). Be
explicitly tentative about any code-level mechanism or fix — you cannot see the
code, so you are guessing how it is implemented. The coder will read the source
and confirm. Use only the supplied trace, draft, skips, and deck context; do
not invent trace values.

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
specific trace fields. State the symptom and where in the pipeline the data is
dropped — not how the code is implemented.
Evidence: 3-5 bullets with exact trace values.
Fix class: one of input-boundary, verb-map, noun-resolution, parameter-grammar,
placement-emission, deck-layout, frontend-validation, mixed.
Where to look first: the suspect pass/file/registry to read first, inferred
from the trace (e.g. the pass that should have emitted the missing output). Name
the area; do not assert what the code does.
Candidate mechanisms (unverified): 1-3 plausible code-level causes, each phrased
as a hypothesis the coder MUST confirm against the source before editing
(e.g. "the clause may be mis-classified rather than not parsed"). Do not present
any as the established cause.
Anti-diagnosis: tempting but false diagnoses ruled out by the evidence. Only
rule out a fix class the TRACE actually refutes — do not rule out a layer just
because an adjacent step (e.g. registry lookup) succeeded.

Be terse. No emoji. Be definitive about evidence; hedge mechanism explicitly.`;

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

The diagnosis was written from the compiler trace WITHOUT source access. So the
spec's CONTRACT is its acceptance criteria — concrete, verifiable outcomes (the
coder reads the code and makes them true). The title and rationale describe the
goal and a lead; they must NOT prescribe a code mechanism as the objective (the
coder confirms the mechanism in the source).

The spec must be narrow enough for one local coder session, match the fix class
that the diagnosis concluded (do not flip a code-fix diagnosis into a registry
fix or vice versa), and include:
  - title: one sentence describing the OUTCOME the fix must achieve (the symptom
    to eliminate), NOT a prescribed code mechanism. Good: "Both coordinated
    placements ('X on B1 and Y on B2') must reach the deck layout, not just the
    first." Bad: "Add a loop over conjunction clauses in
    DeterministicPrecompilePass" (prescribes an unverified mechanism).
  - fixClass: one of "data-only" | "registry" | "compiler" | "mixed"
  - diagnosisLabel: free-form short kebab-case string naming the bug sub-class
    so the coder's skill-triage rubric can route the run. Pick the most
    specific label justified by the trace; if uncertain, leave empty. Common
    values: "noun-resolution", "clause-structure", "verb-or-preposition",
    "wrong-recordId", "alias-map-divergence", "missing-record",
    "parameter-assembly", "well-address-grammar", "wrong-event-order",
    "state-ref-wrong", "wrong-state-delta". This is a SOFT HINT — the coder
    will still self-triage from the verify symptom; it should not be a guess
    you can't justify from the trace.
  - rationale: short paragraph that SEPARATES what the trace proves (the
    symptom and where output is dropped — state as fact) from the suspected
    code mechanism (state as a hypothesis the coder must confirm in the source
    before editing; the diagnosis was written without code access). Do not
    present the mechanism as established fact.
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
  diagnosisLabel?: string;
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

  const diagnosisLabel = typeof parsed.spec.diagnosisLabel === 'string'
    ? parsed.spec.diagnosisLabel.trim()
    : '';
  const specObj: Record<string, unknown> = {
    kind: 'protocol-foundry-patch-spec',
    id: specId,
    source: 'event-editor-fixit',
    generated_at: new Date().toISOString(),
    fixClass: parsed.spec.fixClass ?? 'mixed',
    ...(diagnosisLabel ? { diagnosisLabel } : {}),
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
   * Copy approved file changes from an isolated worktree into the main
   * checkout, then stage and commit them. Used by the Phase 3 Fix-it job
   * path; tests can keep stubbing `commit` for the legacy path.
   */
  commitFromWorktree?(worktreeRoot: string, files: string[], title: string): Promise<string | undefined>;
  /**
   * Roll back the working-tree state of the given files. Tracked files are
   * restored to HEAD; untracked files are deleted.
   */
  reset(files: string[]): Promise<void>;
  /**
   * Like `reset`, but inside an isolated worktree — so a STUCK round's
   * uncommitted edits are discarded and the next round starts clean from the
   * worktree's last commit (committed progress is preserved).
   */
  resetWorktree?(worktreeRoot: string, files: string[]): Promise<void>;
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
    async commitFromWorktree(worktreeRoot, files, title) {
      if (files.length === 0) return undefined;
      for (const file of files) {
        const src = resolve(worktreeRoot, file);
        const dest = resolve(repoRoot, file);
        if (existsSync(src)) {
          await mkdir(dirname(dest), { recursive: true });
          await copyFile(src, dest);
        } else {
          await unlink(dest).catch(() => {});
        }
      }
      return this.commit(files, title);
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
    async resetWorktree(worktreeRoot, files) {
      for (const file of files) {
        const tracked = await execFileAsync('git', ['-C', worktreeRoot, 'ls-files', '--error-unmatch', '--', file])
          .then(() => true)
          .catch(() => false);
        if (tracked) {
          await execFileAsync('git', ['-C', worktreeRoot, 'checkout', '--', file]).catch(() => {});
        } else {
          await unlink(resolve(worktreeRoot, file)).catch(() => {});
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
  /**
   * Override for Phase 3 durable job/worktree management. When omitted, the
   * handler creates one automatically only when workspaceRoot is a git repo.
   */
  fixItJobManager?: EventEditorFixItJobManager | null;
  /**
   * Skip the startup zombie-job sweep. Tests set this so they don't fire
   * background work during construction.
   */
  skipStartupSweep?: boolean;
  /**
   * Override for the deterministic fixture verification (incremental-landing
   * gate). Tests stub this to drive PASS/PROGRESS/STUCK without running the
   * worktree harness.
   */
  verifyFixtures?: typeof runFixtureVerification;
  /**
   * Override for the server-side initial probe of the failing prompt. Tests
   * stub this to skip the npx-tsx spawn (which adds ~1s and can push deadline
   * tests past their bound).
   */
  probeFailingPrompt?: typeof probeFailingPromptForCoder;
  /** Max incremental rounds per apply (fix → commit → re-run). Defaults to 3. */
  maxRounds?: number;
}

// --- Fix-it driver loop --------------------------------------------------------

interface RunFixItDriverOpts {
  body: ApplyFixBody;
  workspaceRoot: string;
  artifactRoot: string;
  /** Mutable reference for activeJob – callers inspect after driver completes */
  activeJobRef: { value?: ApplyFixJobSummary | undefined };
  /** Mutable references for execution roots */
  executionRootRef: { value: string };
  executionArtifactRootRef: { value: string };
  /** Mutable reference to capture the job ID when it's created */
  jobIdRef: { value?: string | undefined };
  /** Mutable reference for touched files set */
  touchedFileSetRef: { value: Set<string> };
  fixItJobManager?: EventEditorFixItJobManager | null;
  gitOps: GitOps;
  coderPatchRunner: typeof runFoundryCoderPatch;
  criticRunner: typeof runFoundryPatchCritic;
  verifyFixtures: typeof runFixtureVerification;
  probeFailingPrompt: typeof probeFailingPromptForCoder;
  maxRounds: number;
  request: FastifyRequest;
  onProgress: (event: { source: 'server' | 'coder' | 'critic'; phase: string; message: string; details?: Record<string, unknown> }) => void;
  /** SSE stage / done / heartbeat emitter (no-op safe) */
  onEvent: (event: ApplyFixEvent) => void;
  /** Abort-check callback (no-op safe; called before coder/critic) */
  checkAbort: () => void;
}

interface RunFixItDriverResult {
  status: ApplyFixResultStatus;
  message: string;
  touchedFiles: string[];
  commit?: string | undefined;
  criticSummary?: ApplyFixCriticSummary | undefined;
  seniorRetryRan: boolean;
  jobId?: string;
}

// Server-side probe of the failing prompt, run once at job start. Returns
// TWO things in one block so the coder arrives with both the baseline
// symptom AND the intermediate pipeline state for the most-diagnostic
// passes in hand — instead of spending its first 10 turns rediscovering
// them via the same harness. The skill prompt instructs the model to
// PROBE VARIATIONS from this baseline; we just supply the starting point.
// Returns undefined on any failure (loop proceeds without it).
const INITIAL_KEY_PASSES = ['deterministic_precompile', 'resolve_labware'] as const;

async function fetchProbeOutput(
  executionRoot: string,
  failingPrompt: string,
): Promise<{ outcome?: string; fields?: string[]; data?: Record<string, unknown> }> {
  const { stdout } = await execFileAsync(
    'npx',
    ['tsx', 'src/compiler/pipeline/fixtures/probeCompile.ts', '--prompt', failingPrompt],
    { cwd: join(executionRoot, 'server'), timeout: 60_000, maxBuffer: 8 * 1024 * 1024 },
  );
  const line = stdout.trim().split('\n').filter(Boolean).at(-1) ?? '{}';
  return JSON.parse(line);
}

async function fetchProbePassOutput(
  executionRoot: string,
  failingPrompt: string,
  passName: string,
): Promise<{ exists?: boolean; output?: unknown }> {
  const { stdout } = await execFileAsync(
    'npx',
    ['tsx', 'src/compiler/pipeline/fixtures/probePass.ts', '--prompt', failingPrompt, '--pass', passName],
    { cwd: join(executionRoot, 'server'), timeout: 60_000, maxBuffer: 8 * 1024 * 1024 },
  );
  const line = stdout.trim().split('\n').filter(Boolean).at(-1) ?? '{}';
  return JSON.parse(line);
}

function renderProbeFieldsBlock(parsed: { outcome?: string; fields?: string[]; data?: Record<string, unknown> }, failingPrompt: string): string {
  const data = parsed.data ?? {};
  const populated = (parsed.fields ?? [])
    .filter((f) => {
      const v = data[f];
      if (v === undefined || v === null) return false;
      if (Array.isArray(v) && v.length === 0) return false;
      if (typeof v === 'object' && Object.keys(v as object).length === 0) return false;
      return true;
    })
    .map((f) => {
      const json = JSON.stringify(data[f], null, 2);
      const clipped = json.length > 1500 ? `${json.slice(0, 1500)}\n… [clipped]` : json;
      return `=== ${f} ===\n${clipped}`;
    })
    .join('\n\n');
  return [
    '## Initial probe of the failing prompt',
    `What the compiler currently emits for ${JSON.stringify(failingPrompt)} (outcome: ${parsed.outcome ?? '?'}):`,
    '',
    populated || '(no fields populated)',
  ].join('\n');
}

function renderProbePassBlock(passOutputs: Array<{ passName: string; output: unknown }>): string {
  if (passOutputs.length === 0) return '';
  const blocks = passOutputs.map(({ passName, output }) => {
    const json = JSON.stringify(output, null, 2);
    const clipped = json.length > 2500 ? `${json.slice(0, 2500)}\n… [clipped]` : json;
    return `=== probe_pass "${passName}" ===\n${clipped}`;
  });
  return [
    '## Intermediate pipeline state (most-diagnostic passes for the failing prompt)',
    'If the diverging value is already wrong HERE, the bug lives in this pass or upstream of it.',
    'If a field looks right here but wrong in the final TerminalArtifacts above, walk downstream with `probe_pass(prompt, "<pass>")`.',
    '',
    blocks.join('\n\n'),
  ].join('\n');
}

async function probeFailingPromptForCoder(
  executionRoot: string,
  failingPrompt: string,
  log: { warn: (obj: Record<string, unknown>, msg: string) => void },
): Promise<string | undefined> {
  let probeBlock = '';
  try {
    probeBlock = renderProbeFieldsBlock(await fetchProbeOutput(executionRoot, failingPrompt), failingPrompt);
  } catch (err) {
    log.warn({ err }, 'fix-it: initial probe failed; continuing without it');
    return undefined;
  }

  // Pass probes are best-effort — a failure on any one is skipped, not fatal.
  const passOutputs: Array<{ passName: string; output: unknown }> = [];
  for (const passName of INITIAL_KEY_PASSES) {
    try {
      const r = await fetchProbePassOutput(executionRoot, failingPrompt, passName);
      if (r.exists !== false && r.output !== undefined && r.output !== null) {
        passOutputs.push({ passName, output: r.output });
      }
    } catch (err) {
      log.warn({ err, passName }, 'fix-it: initial probe_pass failed; skipping pass');
    }
  }
  const passBlock = renderProbePassBlock(passOutputs);

  return [
    probeBlock,
    passBlock,
    '',
    'Now use `probe` to compare VARIATIONS of the prompt (single-clause, reversed order,',
    'modifier removed, verb/preposition swapped). The variation that flips a field names the',
    'pipeline stage that owns the bug. Skill triage in the system prompt routes you to a method.',
  ].filter(Boolean).join('\n\n');
}

async function runFixItDriver(opts: RunFixItDriverOpts): Promise<RunFixItDriverResult> {
  const {
    body, workspaceRoot, artifactRoot,
    activeJobRef, executionRootRef, executionArtifactRootRef, jobIdRef, touchedFileSetRef,
    fixItJobManager, gitOps,
    coderPatchRunner,
    verifyFixtures, probeFailingPrompt, maxRounds,
    request,
    onProgress,
    onEvent,
    checkAbort,
  } = opts;

  const touchedFileSet = touchedFileSetRef.value;
  let executionRoot = workspaceRoot;
  let executionArtifactRoot = artifactRoot;

  // 1) Validate fixture path and write fixture + spec to disk.
  const fixturesDir = 'server/src/compiler/pipeline/fixtures/';
  if (!body.fixturePath.startsWith(fixturesDir)) {
    throw new Error(`fixturePath must start with ${fixturesDir}`);
  }
  const specParsed = parseSpecForTitle(body.specYaml);
  const specTitle = specParsed.title ?? body.specId;

  if (fixItJobManager) {
    const fixturePrompt = parseFixturePrompt(body.fixtureYaml);
    const queuedJob = await fixItJobManager.enqueue({
      specId: body.specId,
      title: specTitle,
      specYaml: body.specYaml,
      fixtureYaml: body.fixtureYaml,
      ...(fixturePrompt ? { prompt: fixturePrompt } : {}),
      ...(body.fixItSessionId ? { fixItSessionId: body.fixItSessionId } : {}),
      ...(body.sessionSnapshot ? { sessionSnapshot: body.sessionSnapshot } : {}),
    });
    const runningJob = await fixItJobManager.startJob(queuedJob.id);
    executionRoot = runningJob.worktreePath ?? workspaceRoot;
    executionArtifactRoot = join(runningJob.jobRoot, 'artifacts');
    activeJobRef.value = {
      id: runningJob.id,
      ...(runningJob.worktreePath ? { worktreePath: runningJob.worktreePath } : {}),
      artifactRoot: executionArtifactRoot,
    };
    jobIdRef.value = runningJob.id;
    onProgress({
      source: 'server',
      phase: 'job_started',
      message: `Started isolated Fix-it job ${runningJob.id}`,
      details: activeJobRef.value as unknown as Record<string, unknown>,
    });
  }

  onEvent({ type: 'stage', stage: 'writing_fixture' });
  onProgress({
    source: 'server',
    phase: 'writing_fixture',
    message: `Writing regression fixture ${body.fixturePath}`,
  });
  const absoluteFixturePath = resolve(executionRoot, body.fixturePath);
  await mkdir(dirname(absoluteFixturePath), { recursive: true });
  await writeFile(absoluteFixturePath, body.fixtureYaml, 'utf-8');

  onEvent({ type: 'stage', stage: 'writing_spec' });
  const protocolId = 'event-editor-fixit';
  const variant = 'manual_tubes' as const;
  const patchSpecDir = join(executionArtifactRoot, 'patch-specs', protocolId, variant);
  await mkdir(patchSpecDir, { recursive: true });
  const patchSpecPath = join(patchSpecDir, `${body.specId}.yaml`);
  onProgress({
    source: 'server',
    phase: 'writing_spec',
    message: `Writing patch spec ${body.specId}`,
    details: { patchSpecPath },
  });
  await writeFile(patchSpecPath, body.specYaml, 'utf-8');

  checkAbort();

  // Step 9: run probe(failingPrompt) once at job start so the coder arrives
  // with the baseline symptom in hand. The block is prepended to every round's
  // revisionFeedback so it remains visible after the per-round handoff is
  // appended. Failure here is non-fatal — degraded but not broken.
  const failingPromptForProbe = parseFixturePrompt(body.fixtureYaml);
  const initialProbeBlock = failingPromptForProbe
    ? await probeFailingPrompt(executionRoot, failingPromptForProbe, request.log)
    : undefined;
  if (initialProbeBlock) {
    onProgress({
      source: 'server',
      phase: 'initial_probe',
      message: 'Captured initial probe of the failing prompt',
      details: { chars: initialProbeBlock.length },
    });
  }

  // ── Ralph-style incremental round loop ──────────────────────────────────
  // Each round is ONE coder crack, gated by the deterministic fixture-diff gate
  // (the sole authority — no critic). PASS → commit, done. PROGRESS (strictly
  // more of the fixture satisfied, no regression) → commit the partial fix and
  // re-run to surface the next bug. STUCK → roll back this round's edits and
  // retry the junior; after SENIOR_AFTER consecutive stuck rounds, escalate to
  // a senior crack (same big-context worker model, higher turn cap, all
  // accumulated feedback). A stuck senior round ends the job (human).
  const SENIOR_AFTER = 2;
  const SENIOR_MAX_TURNS = 100;
  let seniorRetryRan = false;
  let commit: string | undefined;
  let landedCommits = 0;
  let stuckStreak = 0;
  let lastVerdict: 'pass' | 'progress' | 'stuck' | undefined;
  let lastMissing: string[] = [];
  let lastMatched: string[] = [];
  let coderResult!: Awaited<ReturnType<typeof coderPatchRunner>>;
  let carryForward: string | undefined;

  for (let round = 1; round <= maxRounds; round += 1) {
    checkAbort();
    const role: 'junior' | 'senior' = stuckStreak >= SENIOR_AFTER ? 'senior' : 'junior';
    if (role === 'senior') seniorRetryRan = true;

    // Baseline: what the fixtures already satisfy before this round's edits.
    let baseline: FixtureVerification | null = null;
    try {
      baseline = await verifyFixtures(executionRoot, body.specId);
    } catch (err) {
      request.log.warn({ err }, 'fix-it: baseline fixture verification unavailable');
    }

    // Coder crack.
    onEvent({ type: 'stage', stage: role === 'senior' ? 'senior_retry' : 'coder_running' });
    onProgress({
      source: 'server',
      phase: role === 'senior' ? 'senior_started' : 'junior_started',
      message: `Starting ${role} coder (round ${round}/${maxRounds})`,
      details: { round, role },
    });
    const revisionFeedback = [initialProbeBlock, carryForward].filter(Boolean).join('\n\n') || undefined;
    coderResult = await coderPatchRunner({
      artifactRoot: executionArtifactRoot,
      repoRoot: executionRoot,
      protocolId,
      variant,
      forcedSpecPath: patchSpecPath,
      coderRole: role,
      coderEngine: 'tool-agent',
      autoCommit: false,
      ...(role === 'senior' ? { seniorEndpoint: 'worker' as const, maxTurns: SENIOR_MAX_TURNS } : {}),
      ...(revisionFeedback ? { revisionFeedback } : {}),
      ...(round > 1 ? { attempt: round } : {}),
      onProgress: (event) => onProgress(event),
    });
    onProgress({
      source: 'server',
      phase: role === 'senior' ? 'senior_finished' : 'junior_finished',
      message: `${role} coder finished with status ${coderResult.status}`,
      details: { status: coderResult.status, touchedFiles: coderResult.touchedFiles, round, role },
    });
    const roundTouched = new Set<string>(coderResult.touchedFiles);
    for (const f of coderResult.touchedFiles) touchedFileSet.add(f);
    checkAbort();

    // Gate (sole authority): verify the worktree against the fixtures.
    let post: FixtureVerification | null = null;
    try {
      post = await verifyFixtures(executionRoot, body.specId);
    } catch (err) {
      request.log.warn({ err }, 'fix-it: post-round fixture verification unavailable');
    }
    const verdict: 'pass' | 'progress' | 'stuck' = baseline && post ? evaluateProgress(baseline, post) : 'stuck';
    lastVerdict = verdict;
    lastMissing = post?.target?.missing ?? lastMissing;
    lastMatched = post?.target?.matched ?? lastMatched;
    onProgress({
      source: 'server',
      phase: 'progress_gate',
      message: `Round ${round} (${role}) gate verdict: ${verdict}`,
      details: { verdict, round, role, ...(post?.target ? { missing: post.target.missing } : {}) },
    });

    const roundFiles = Array.from(roundTouched);
    if (verdict === 'pass' || verdict === 'progress') {
      if (roundFiles.length > 0) {
        try {
          onProgress({
            source: 'server',
            phase: 'committing',
            message: activeJobRef.value
              ? `Landing ${roundFiles.length} file(s) from job worktree (round ${round}, ${verdict})`
              : `Committing ${roundFiles.length} file(s) (round ${round}, ${verdict})`,
            details: { touchedFiles: roundFiles, round, verdict, ...(activeJobRef.value ? { job: activeJobRef.value } : {}) },
          });
          const title = verdict === 'progress' ? `${specTitle} (round ${round})` : specTitle;
          const roundCommit = activeJobRef.value?.worktreePath && gitOps.commitFromWorktree
            ? await gitOps.commitFromWorktree(activeJobRef.value.worktreePath, roundFiles, title)
            : await gitOps.commit(roundFiles, title);
          if (roundCommit) {
            commit = roundCommit;
            landedCommits += 1;
          }
          onProgress({ source: 'server', phase: 'committed', message: `Committed fix ${roundCommit}`, details: { commit: roundCommit, round } });
        } catch (gitErr) {
          request.log.error({ err: gitErr }, 'fix-it commit failed; leaving changes uncommitted');
        }
      }
      if (verdict === 'pass') break;
      // PROGRESS → reset the stuck streak and carry the verified state forward.
      stuckStreak = 0;
      carryForward = [
        'A previous round landed a partial fix (already committed in the working tree); the fixture still fails on a different cause.',
        lastMissing.length ? `Remaining unsatisfied expected paths: ${lastMissing.slice(0, 12).join(', ')}` : '',
        coderResult.finalText
          ? `Previous round's analysis (a lead — verify against the failing fixture, do not assume it is correct):\n${coderResult.finalText}`
          : '',
        'Continue from the committed state: find and fix the NEXT cause, then run the verification command.',
      ].filter(Boolean).join('\n\n');
      continue;
    }

    // STUCK → discard this round's uncommitted edits (start the next crack
    // clean from the last commit) and retry, escalating after SENIOR_AFTER.
    try {
      onProgress({
        source: 'server',
        phase: 'rolling_back',
        message: `Round ${round} (${role}) made no safe progress; discarding its uncommitted edits`,
        details: { touchedFiles: roundFiles, round, role, ...(activeJobRef.value ? { job: activeJobRef.value } : {}) },
      });
      if (roundFiles.length > 0) {
        if (activeJobRef.value?.worktreePath && gitOps.resetWorktree) {
          await gitOps.resetWorktree(activeJobRef.value.worktreePath, roundFiles);
        } else if (!activeJobRef.value) {
          await gitOps.reset(roundFiles);
        }
      }
    } catch (gitErr) {
      request.log.error({ err: gitErr }, 'fix-it reset failed; working tree may be dirty');
    }

    if (role === 'senior') break; // senior also stuck → escalate to human
    stuckStreak += 1;
    carryForward = [
      'The previous attempt made NO measurable progress on the fixture. Do not repeat the same approach — form a different hypothesis.',
      lastMissing.length ? `Still-unsatisfied expected paths: ${lastMissing.slice(0, 12).join(', ')}` : '',
      coderResult.finalText ? `Previous attempt's notes:\n${coderResult.finalText}` : '',
    ].filter(Boolean).join('\n\n');
  }
  // ── end round loop ──────────────────────────────────────────────────────

  const touchedFiles = Array.from(touchedFileSet);
  const effectiveStatus: ApplyFixResultStatus =
    lastVerdict === 'pass'
      ? 'applied'
      : landedCommits > 0
        ? 'needs-revision'   // landed partial progress; more bugs remain
        // No verified progress. A coder that "applied" edits the gate rejected
        // still needs a human; otherwise pass through the coder's terminal
        // status (blocked / failed / needs-human).
        : coderResult.status === 'applied'
          ? 'needs-human'
          : coderResult.status;
  const effectiveMessage =
    lastVerdict === 'pass'
      ? 'Patch accepted and committed.'
      : landedCommits > 0
        ? `Landed ${landedCommits} incremental fix(es); the fixture still fails, so more work remains. Re-run to continue.`
        : lastMissing.length > 0
          ? `No fix landed; ${lastMissing.length} expected fixture path(s) still unsatisfied.`
          : coderResult.message;

  // Synthesize a critic-shaped summary from the gate so the UI/job record still
  // shows verdict + which fixture paths are met/failing (the critic is gone).
  const gateSummary: ApplyFixCriticSummary = {
    verdict: lastVerdict === 'pass' ? 'pass' : 'revision',
    message: effectiveMessage,
    criteriaMet: lastMatched,
    criteriaFailed: lastMissing,
    seniorRetryRan,
  };

  if (activeJobRef.value && fixItJobManager) {
    const releaseWorktree = effectiveStatus !== 'needs-revision';
    await fixItJobManager.completeJob(activeJobRef.value.id, {
      status: effectiveStatus === 'applied' ? 'accepted' : effectiveStatus === 'needs-revision' ? 'needs-feedback' : 'failed',
      message: effectiveMessage,
      result: {
        status: effectiveStatus,
        touchedFiles,
        ...(commit ? { commit } : {}),
        critic: gateSummary,
      },
      releaseWorktree,
    });
  }

  onEvent({
    type: 'done',
    result: {
      status: effectiveStatus,
      message: effectiveMessage,
      touchedFiles,
      ...(activeJobRef.value ? { job: activeJobRef.value } : {}),
      ...(commit ? { commit } : {}),
      critic: gateSummary,
    },
  });

  executionRootRef.value = executionRoot;
  executionArtifactRootRef.value = executionArtifactRoot;

  const result: RunFixItDriverResult = {
    status: effectiveStatus,
    message: effectiveMessage,
    touchedFiles,
    seniorRetryRan,
    criticSummary: gateSummary,
  };
  if (commit !== undefined) result.commit = commit;
  if (jobIdRef.value !== undefined) result.jobId = jobIdRef.value;
  return result;
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
  const verifyFixtures = deps.verifyFixtures ?? runFixtureVerification;
  const probeFailingPrompt = deps.probeFailingPrompt ?? probeFailingPromptForCoder;
  const maxRounds = deps.maxRounds ?? 3;
  const workspaceRoot = deps.workspaceRoot ?? process.cwd();
  const artifactRoot = resolve(workspaceRoot, 'artifacts', 'event-editor-fixit');
  const gitOps = deps.gitOps ?? createGitOps(workspaceRoot);
  const fixItJobManager = deps.fixItJobManager === undefined
    ? (existsSync(resolve(workspaceRoot, '.git'))
        ? new EventEditorFixItJobManager({
            repoRoot: workspaceRoot,
            artifactRoot: resolve(workspaceRoot, 'artifacts'),
          })
        : null)
    : deps.fixItJobManager;

  // Startup reconciliation: any job left in `running` or `critic` from a
  // previous server process is a zombie — there's no live coder/critic
  // driving it. Mark each one interrupted so the UI can offer a Resume
  // button and the worktree is restored to a clean state.
  if (fixItJobManager && deps.skipStartupSweep !== true) {
    void fixItJobManager.sweepInterrupted().then((interrupted) => {
      if (interrupted.length > 0) {
        console.log(`[event-editor-fixit] Marked ${interrupted.length} orphaned job(s) interrupted on startup`);
      }
    }).catch((err) => {
      console.warn('[event-editor-fixit] Startup sweep failed:', err);
    });
  }

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
      let activeJob: ApplyFixJobSummary | undefined;
      const activeJobRef = { value: activeJob };
      let durableProgressWrite: Promise<void> = Promise.resolve();
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
        const jobId = activeJobRef.value?.id;
        if (jobId && fixItJobManager) {
          durableProgressWrite = durableProgressWrite.then(() => fixItJobManager.appendEvent(jobId, event)).catch((err) => {
            request.log.warn({ err }, 'fix-it apply: failed to append durable progress event');
          });
        }
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
      const executionRootRef = { value: workspaceRoot };
      const executionArtifactRootRef = { value: artifactRoot };
      const jobIdRef = { value: undefined as string | undefined };
      const touchedFileSetRef = { value: new Set<string>() };

      try {
        await runFixItDriver({
          body,
          workspaceRoot,
          artifactRoot,
          activeJobRef,
          touchedFileSetRef,
          executionRootRef,
          executionArtifactRootRef,
          jobIdRef,
          fixItJobManager,
          gitOps,
          coderPatchRunner,
          criticRunner,
          verifyFixtures,
          probeFailingPrompt,
          maxRounds,
          request,
          onProgress: sendProgress,
          onEvent: send,
          checkAbort,
        });
      } catch (err) {
        if (err instanceof FixItAbortedError) {
          // Client disconnected — roll back any uncommitted edits so the
          // working tree is clean. No outgoing event (the stream is gone).
          request.log.warn('fix-it apply aborted by client');
          const files = Array.from(touchedFileSetRef.value);
          if (files.length > 0) {
            if (!activeJobRef.value) await gitOps.reset(files).catch((gitErr) => {
              request.log.error(
                { err: gitErr },
                'fix-it apply: reset after abort failed; working tree may be dirty',
              );
            });
          }
          if (activeJobRef.value && fixItJobManager) {
            await fixItJobManager.completeJob(activeJobRef.value.id, {
              status: 'interrupted',
              message: 'Fix-it apply aborted by client',
            }).catch((jobErr) => {
              request.log.error({ err: jobErr }, 'fix-it apply: job cleanup after abort failed');
            });
          }
        } else {
          const message = err instanceof Error ? err.message : String(err);
          request.log.error({ err }, 'fix-it apply stream failed');
          if (activeJobRef.value && fixItJobManager) {
            await fixItJobManager.completeJob(activeJobRef.value.id, {
              status: 'failed',
              message,
            }).catch((jobErr) => {
              request.log.error({ err: jobErr }, 'fix-it apply: job cleanup after failure failed');
            });
          }
          send({ type: 'error', message });
        }
      } finally {
        await durableProgressWrite.catch((err) => {
          request.log.warn({ err }, 'fix-it apply: failed to flush durable progress events');
        });
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

    async listJobs(_request, _reply) {
      if (!fixItJobManager) return { jobs: [] };
      return { jobs: await fixItJobManager.listJobs() };
    },

    async getJob(request, reply) {
      if (!fixItJobManager) {
        reply.status(404);
        return { error: 'FIXIT_JOBS_DISABLED', message: 'Fix-it job manager is not available.' };
      }
      const job = await fixItJobManager.getJob(request.params.id);
      if (!job) {
        reply.status(404);
        return { error: 'FIXIT_JOB_NOT_FOUND', message: `Fix-it job not found: ${request.params.id}` };
      }
      const events = await fixItJobManager.readEvents(job.id);
      const sessionSnapshot = restoreJobSessionSnapshot(
        await fixItJobManager.readSessionSnapshot(job.id),
        job,
        events,
      );
      return {
        job,
        events,
        ...(sessionSnapshot ? { sessionSnapshot } : {}),
      };
    },

    async streamJobEvents(request, reply) {
      if (!fixItJobManager) {
        reply.status(404);
        await reply.send({ error: 'FIXIT_JOBS_DISABLED', message: 'Fix-it job manager is not available.' });
        return;
      }
      const jobId = request.params.id;
      const initialJob = await fixItJobManager.getJob(jobId);
      if (!initialJob) {
        reply.status(404);
        await reply.send({ error: 'FIXIT_JOB_NOT_FOUND', message: `Fix-it job not found: ${jobId}` });
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
      reply.raw.flushHeaders?.();
      reply.raw.socket?.setNoDelay?.(true);
      reply.raw.write(`: connected (job-events-v1)\n\n`);
      const send = (event: unknown) => {
        reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
      };

      let closed = false;
      const onClose = () => {
        closed = true;
      };
      reply.raw.on?.('close', onClose);
      const heartbeat = setInterval(() => {
        try {
          reply.raw.write(`: heartbeat ${Date.now()}\n\n`);
        } catch {
          /* connection closed; cleared in finally */
        }
      }, 1500);

      const isTerminal = (status: EventEditorFixItJobStatus): boolean =>
        status !== 'queued' && status !== 'running' && status !== 'critic';

      try {
        const events0 = await fixItJobManager.readEvents(jobId).catch(() => []);
        const snapshot0 = await fixItJobManager.readSessionSnapshot(jobId).catch(() => undefined);
        send({
          type: 'snapshot',
          job: initialJob,
          events: events0,
          ...(snapshot0 ? { sessionSnapshot: snapshot0 } : {}),
        });
        let sentCount = events0.length;
        let lastStatus: EventEditorFixItJobStatus = initialJob.status;

        if (!isTerminal(initialJob.status)) {
          // Tail the job's durable event log + status until it reaches a
          // terminal state or the client disconnects. A 30-minute ceiling
          // guards against a wedged coder leaving the connection open forever.
          const MAX_MS = 30 * 60 * 1000;
          const startedAt = Date.now();
          while (!closed && Date.now() - startedAt < MAX_MS) {
            await new Promise((resolve) => setTimeout(resolve, 500));
            if (closed) break;
            const events = await fixItJobManager.readEvents(jobId).catch(() => []);
            for (let i = sentCount; i < events.length; i += 1) {
              send({ type: 'event', event: events[i] });
            }
            sentCount = Math.max(sentCount, events.length);
            const job = await fixItJobManager.getJob(jobId).catch(() => undefined);
            if (job && job.status !== lastStatus) {
              lastStatus = job.status;
              send({ type: 'job', job });
            }
            if (job && isTerminal(job.status)) break;
          }
        }

        if (!closed) send({ type: 'done' });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        request.log.error({ err }, 'fix-it job event stream failed');
        try {
          send({ type: 'error', message });
        } catch {
          /* connection already gone */
        }
      } finally {
        clearInterval(heartbeat);
        reply.raw.off?.('close', onClose);
        reply.raw.end();
      }
    },

    async getJobSpec(request, reply) {
      if (!fixItJobManager) {
        reply.status(404);
        return { error: 'FIXIT_JOBS_DISABLED', message: 'Fix-it job manager is not available.' };
      }
      const job = await fixItJobManager.getJob(request.params.id);
      if (!job) {
        reply.status(404);
        return { error: 'FIXIT_JOB_NOT_FOUND', message: `Fix-it job not found: ${request.params.id}` };
      }
      if (!job.specPath || !job.fixturePath || !job.specId) {
        reply.status(409);
        return { error: 'FIXIT_JOB_HAS_NO_SPEC', message: 'This job does not have a saved spec to resume from.' };
      }
      try {
        const [specYaml, fixtureYaml] = await Promise.all([
          readFile(job.specPath, 'utf-8'),
          readFile(job.fixturePath, 'utf-8'),
        ]);
        // `job.fixturePath` is the manager's INTERNAL copy under the job
        // root (artifacts/.../jobs/<id>/fixture.yaml). The apply driver
        // validates `fixturePath` against the source tree, so resuming
        // with the internal path throws "must start with
        // server/src/compiler/pipeline/fixtures/". Return the canonical
        // source-tree path derived from specId — the same convention
        // `synthesizeSpec` uses when it first generates the fixture.
        return {
          specId: job.specId,
          fixturePath: `server/src/compiler/pipeline/fixtures/${job.specId}.yaml`,
          specYaml,
          fixtureYaml,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        reply.status(500);
        return { error: 'FIXIT_JOB_SPEC_READ_FAILED', message };
      }
    },

    async completeJob(request, reply) {
      if (!fixItJobManager) {
        reply.status(404);
        return { error: 'FIXIT_JOBS_DISABLED', message: 'Fix-it job manager is not available.' };
      }
      try {
        const job = await fixItJobManager.markComplete(request.params.id);
        const events = await fixItJobManager.readEvents(job.id);
        const sessionSnapshot = restoreJobSessionSnapshot(
          await fixItJobManager.readSessionSnapshot(job.id),
          job,
          events,
        );
        return {
          job,
          events,
          ...(sessionSnapshot ? { sessionSnapshot } : {}),
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        reply.status(message.includes('not found') ? 404 : 409);
        return { error: 'FIXIT_JOB_COMPLETE_FAILED', message };
      }
    },
    async startApplyFixJob(request, reply) {
      const body = request.body;
      if (!body?.specYaml || !body?.fixtureYaml || !body?.specId || !body?.fixturePath) {
        return { error: 'INVALID_REQUEST', message: 'specYaml, fixtureYaml, specId, and fixturePath required' };
      }

      if (!fixItJobManager) {
        reply.status(503);
        return { error: 'SERVICE_UNAVAILABLE', message: 'Fix-it job manager not configured' };
      }

      const executionRootRef = { value: workspaceRoot };
      const executionArtifactRootRef = { value: artifactRoot };
      const jobIdRef = { value: undefined as string | undefined };
      const touchedFileSetRef = { value: new Set<string>() };
      const activeJobRef = { value: undefined as ApplyFixJobSummary | undefined };

      // Persist every coder/critic/server progress event to the job's durable
      // event log. The frontend tails that log via streamJobEvents, so this is
      // the ONLY channel for live feedback. Without it the job appears frozen
      // after "Created worktree" — the symptom this handler used to produce
      // with no-op onProgress.
      let durableProgressWrite: Promise<void> = Promise.resolve();
      const persistProgress = (event: {
        source: 'server' | 'coder' | 'critic';
        phase: string;
        message: string;
        details?: Record<string, unknown>;
      }) => {
        const jobId = jobIdRef.value;
        if (!jobId) return;
        durableProgressWrite = durableProgressWrite
          .then(() => fixItJobManager.appendEvent(jobId, event))
          .catch((err) => {
            request.log.warn({ err }, 'fix-it apply job: failed to append durable progress event');
          });
      };

      // Resolve the moment the job is enqueued + worktree-ready (its id is
      // known). The HTTP response returns then; the coder keeps running in the
      // background. This request must NOT block for the whole job — the old
      // version did, which is why the frontend never started tailing events.
      let resolveJobStarted!: () => void;
      const jobStarted = new Promise<void>((res) => {
        resolveJobStarted = res;
      });
      let startupError: string | undefined;

      const onProgress = (event: {
        source: 'server' | 'coder' | 'critic';
        phase: string;
        message: string;
        details?: Record<string, unknown>;
      }) => {
        persistProgress(event);
        if (event.phase === 'job_started') resolveJobStarted();
      };

      // Fire-and-forget. We intentionally do not await this before responding.
      void runFixItDriver({
        body,
        workspaceRoot,
        artifactRoot,
        activeJobRef,
        touchedFileSetRef,
        executionRootRef,
        executionArtifactRootRef,
        jobIdRef,
        fixItJobManager,
        gitOps,
        coderPatchRunner,
        criticRunner,
        verifyFixtures,
        probeFailingPrompt,
        maxRounds,
        request,
        onProgress,
        onEvent: () => {},
        checkAbort: () => {},
      }).then(
        async () => {
          await durableProgressWrite.catch(() => {});
        },
        async (err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          request.log.error({ err }, 'fix-it apply job driver failed');
          const jobId = jobIdRef.value;
          if (jobId) {
            // Surface the failure on the live event stream, then mark the job
            // failed so its worktree is released and the UI leaves the
            // "running" state.
            await fixItJobManager
              .appendEvent(jobId, { source: 'server', phase: 'error', message })
              .catch(() => {});
            await fixItJobManager
              .completeJob(jobId, { status: 'failed', message })
              .catch((jobErr) => {
                request.log.error({ err: jobErr }, 'fix-it apply job: cleanup after failure failed');
              });
          } else {
            // Driver threw before the job was even registered (e.g. fixturePath
            // validation). Report it synchronously on the start response.
            startupError = message;
          }
          await durableProgressWrite.catch(() => {});
          resolveJobStarted();
        },
      );

      // Wait only until the job exists (or fails before starting).
      await jobStarted;

      if (startupError) {
        reply.status(500);
        return { error: 'FIXIT_JOB_START_FAILED', message: startupError };
      }
      const jobId = jobIdRef.value;
      if (!jobId) {
        reply.status(500);
        return { error: 'FIXIT_JOB_START_FAILED', message: 'Job failed to start before producing a job id.' };
      }
      const job = await fixItJobManager.getJob(jobId).catch(() => undefined);
      if (!job) {
        reply.status(500);
        return { error: 'JOB_NOT_FOUND', message: 'Could not retrieve job after start.' };
      }
      const events = await fixItJobManager.readEvents(jobId).catch(() => []);
      const sessionSnapshot = await fixItJobManager.readSessionSnapshot(jobId).catch(() => undefined);
      return { job, events, ...(sessionSnapshot ? { sessionSnapshot } : {}) };
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

function parseFixturePrompt(fixtureYaml: string): string | undefined {
  try {
    const parsed = parseYaml(fixtureYaml) as Record<string, unknown> | null;
    const input = parsed?.['input'];
    if (input && typeof input === 'object' && !Array.isArray(input)) {
      const prompt = (input as Record<string, unknown>)['prompt'];
      if (typeof prompt === 'string') return prompt;
    }
  } catch {
    /* malformed YAML — job metadata can omit prompt */
  }
  return undefined;
}

function restoreJobSessionSnapshot(
  stored: EventEditorFixItSessionSnapshot | undefined,
  job: EventEditorFixItJobRecord,
  events: EventEditorFixItJobEvent[],
): EventEditorFixItSessionSnapshot | undefined {
  if (!stored) return undefined;
  const applyProgress = events
    .filter((event) => event.source === 'server' || event.source === 'coder' || event.source === 'critic')
    .map((event) => ({
      source: event.source,
      phase: event.phase,
      message: event.message,
      ...(event.details ? { details: event.details } : {}),
      ts: event.ts ?? job.updatedAt,
    }));
  const applyResult = buildApplyResultFromJob(job);
  const completedStatus = lastCompletedStatus(events);
  const interrupted = completedStatus === 'interrupted'
    || job.status === 'interrupted'
    || /aborted by client/i.test(job.message ?? '');
  const failedWithoutResult = !applyResult
    && (interrupted || completedStatus === 'failed' || job.status === 'failed');
  const stage = applyResult
    ? applyResult.status === 'applied'
      ? 'done'
      : 'failed'
    : job.status === 'queued' || job.status === 'running' || job.status === 'critic'
      ? 'applying'
      : failedWithoutResult
        ? 'failed'
        : stored['stage'] ?? 'chatting';
  return {
    ...stored,
    stage,
    error: failedWithoutResult ? job.message ?? 'Fix-it job stopped before producing a result.' : null,
    applyProgress,
    applyReasoning: stored['applyReasoning'] ?? '',
    applyResult: applyResult ?? stored['applyResult'] ?? null,
    applyStage: applyResult
      ? null
      : job.status === 'critic'
        ? 'critic_running'
        : job.status === 'queued' || job.status === 'running'
          ? stored['applyStage'] ?? 'coder_running'
          : null,
  };
}

function lastCompletedStatus(events: EventEditorFixItJobEvent[]): string | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event?.phase !== 'completed') continue;
    const status = event.details?.['status'];
    if (typeof status === 'string') return status;
  }
  return undefined;
}

function buildApplyResultFromJob(job: EventEditorFixItJobRecord): Record<string, unknown> | undefined {
  const result = job.result;
  if (!result) return undefined;
  const status = typeof result['status'] === 'string' ? result['status'] : job.status;
  const touchedFiles = Array.isArray(result['touchedFiles'])
    ? result['touchedFiles'].filter((item): item is string => typeof item === 'string')
    : [];
  return {
    status,
    message: typeof result['message'] === 'string'
      ? result['message']
      : job.message ?? '',
    touchedFiles,
    job: {
      id: job.id,
      ...(job.worktreePath ? { worktreePath: job.worktreePath } : {}),
      artifactRoot: join(job.jobRoot, 'artifacts'),
    },
    ...(typeof result['commit'] === 'string' ? { commit: result['commit'] } : {}),
    ...(result['critic'] && typeof result['critic'] === 'object' ? { critic: result['critic'] } : {}),
  };
}

