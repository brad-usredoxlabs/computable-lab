/**
 * REVISE-GHOST-1 — the answered-binding reuse leg at the ai/ seam (RED-first).
 *
 * The defect (spec §5 discriminator, pinned in
 * .hermes/plans/REVISE-GHOST-1-discriminator-artifact.md): a revise turn on a
 * proposal whose labels the scientist ALREADY answered re-extracts a fresh
 * shorthand, the spine re-resolves from scratch, `ambiguous-noun` fires again
 * on the already-bound labels, and the needs-clarification arm of
 * shorthandResultFromCompile (shorthandChat.ts:660-671) returns
 * `{success:true, events:[], clarificationRequests:[...]}` — zero mountable
 * events under a success, ghosts never remount.
 *
 * The fix (OQ-1 ruling): the conversation's accepted label->ref bindings,
 * recorded when a clarification answer folds, ride the NEXT compile on a
 * revise turn as an EXACT-MATCH reuse hint applied at the ai/ seam BEFORE
 * resolution (ShorthandCompileDeps.reuseBindings -> the existing
 * compileScientistIntent answeredSlots door). Bindings never cross a proposal
 * boundary: a fresh-start turn (no draftRevision context) clears them.
 *
 * Planes (spec §7 Plane 1): the REAL orchestrator.run + the REAL deterministic
 * compile through the chat seam; mocked inference only (canned tool_call
 * frames). No handler mocks.
 *
 * Test seeds only (repo rip-out rule: no reagent nouns in src product code —
 * fixtures/tests carry the labels).
 */
import { describe, expect, it, vi } from 'vitest';
import { createAgentOrchestrator } from './AgentOrchestrator.js';
import { AGENT_INTENT_TOOL_NAME } from './submitSuggestionTool.js';
import { createResolveSpineFromContext } from '../resolve/index.js';
import { createLabwareLookup } from './compiler/labwareLookup.js';
import * as runChatbotCompileModule from './runChatbotCompile.js';
import type { AgentEvent, AgentResult, CompletionRequest, CompletionResponse } from './types.js';

/** Seeds: the plate, and TWO records carrying the SAME synonym — the
 *  steady-state near-duplicate that makes 'test reagent' ambiguous-noun.
 *  The chosen record's NAME is distinctive so the answer fold's recompile of
 *  the chosen label binds cleanly; only the synonym is shared. */
const SEED_RECORDS = [
  {
    recordId: 'LAB-plate-1',
    schemaId: 'https://computable-lab.com/schema/computable-lab/labware.schema.yaml',
    payload: { kind: 'labware', name: 'Plate', title: 'Plate', synonyms: ['plate'] },
  },
  {
    recordId: 'MAT-test-a',
    schemaId: 'https://computable-lab.com/schema/computable-lab/material.schema.yaml',
    payload: { kind: 'material', name: 'Alpha Reagent', title: 'Alpha Reagent', synonyms: ['test reagent'] },
  },
  {
    recordId: 'MAT-test-b',
    schemaId: 'https://computable-lab.com/schema/computable-lab/material.schema.yaml',
    payload: { kind: 'material', name: 'Beta Reagent', title: 'Beta Reagent', synonyms: ['test reagent'] },
  },
  {
    recordId: 'MAT-other-a',
    schemaId: 'https://computable-lab.com/schema/computable-lab/material.schema.yaml',
    payload: { kind: 'material', name: 'Gamma Reagent', title: 'Gamma Reagent', synonyms: ['other reagent'] },
  },
  {
    recordId: 'MAT-other-b',
    schemaId: 'https://computable-lab.com/schema/computable-lab/material.schema.yaml',
    payload: { kind: 'material', name: 'Delta Reagent', title: 'Delta Reagent', synonyms: ['other reagent'] },
  },
];

function mockStore() {
  return {
    get: vi.fn(async () => null),
    getRecord: vi.fn(async (id: string) => SEED_RECORDS.find((r) => r.recordId === id) ?? null),
    list: vi.fn(async (filter?: { kind?: string }) =>
      SEED_RECORDS.filter((r) => !filter?.kind || r.payload.kind === filter.kind),
    ),
  };
}

function orchestratorDeps() {
  const store = mockStore();
  return {
    store: store as never,
    resolveSpine: createResolveSpineFromContext({ store: store as never }) as never,
    searchLabwareByHint: createLabwareLookup(store as never) as never,
  };
}

/** Scripted stub: one queued assistant turn per completeStream call (the
 *  shorthandChat suite's harness — mocked inference ONLY). */
function stubModel(responses: Array<Record<string, unknown>>) {
  let call = 0;
  const completeStream = vi.fn(async function* (request: CompletionRequest) {
    void request;
    const spec = responses[Math.min(call, responses.length - 1)]!;
    call += 1;
    const delta: Record<string, unknown> = { role: 'assistant' };
    if (Array.isArray(spec.toolCalls)) {
      delta.tool_calls = spec.toolCalls.map((tc, i) => ({
        index: i,
        id: `call-${call}-${i}`,
        type: 'function',
        function: { name: tc.name, arguments: JSON.stringify(tc.args) },
      }));
    }
    yield {
      id: `resp-${call}`,
      choices: [{ index: 0, delta, finish_reason: Array.isArray(spec.toolCalls) ? 'tool_calls' : 'stop' }],
    } as unknown as CompletionResponse;
  });
  return { client: { complete: vi.fn(), completeStream } };
}

function shorthandCall(yaml: string) {
  return { name: AGENT_INTENT_TOOL_NAME, args: { intent: 'event_shorthand', shorthand: yaml } };
}

/** Turn 1: 'test reagent' matches TWO seeded records -> ambiguous-noun bar. */
const DRAFT_YAML = `intentId: revise-reuse-draft
actions:
  - action: add_material
    labware: Plate
    material: test reagent
    volumeUl: 50
    targetWells: [A1]
`;

/** Turn 3 (revise): the model re-extracts BARE PROSE labels — the replay's
 *  exact mechanism (the revise turn re-emits the scientist's phrasing, not the
 *  record it was shown). The wells widen (the replay's "make it 32 wells"). */
const REVISED_YAML = `intentId: revise-reuse-draft
actions:
  - action: add_material
    labware: Plate
    material: test reagent
    volumeUl: 50
    targetWells: [A1:A4]
`;

/** Turn 3 variant: the already-answered label PLUS a genuinely NEW ambiguous
 *  label (the legitimate hold keeps its cards). */
const REVISED_NEW_LABEL_YAML = `intentId: revise-reuse-new
actions:
  - action: add_material
    labware: Plate
    material: test reagent
    volumeUl: 50
    targetWells: [A1:A4]
  - action: add_material
    labware: Plate
    material: other reagent
    volumeUl: 20
    targetWells: [B1]
`;

const BASE_CONTEXT = {
  labwares: [{ labwareId: 'LAB-plate-1', labwareType: 'plate', name: 'Plate' }],
  eventSummary: 'No events yet.',
  vocabPackId: 'liquid-handling/v1',
  availableVerbs: ['add_material'],
  eventGraphId: 'EVG-revise-reuse',
};

/** The mounted-preview marker a revise turn carries (AiTabPanel draftRevision). */
const DRAFT_REVISION_CONTEXT = {
  currentPreviewDraft: { events: [], labwareRequirements: [], labwareAdditions: [] },
  revisionHistory: [{ prompt: 'add 50 uL of test reagent to A1', createdAt: '2026-10-22T00:00:00.000Z' }],
};

function makeOrchestrator(responses: Array<Record<string, unknown>>) {
  const model = stubModel(responses);
  // The legacy raw-events compile must never run on this surface — spy it so a
  // wrong-leg turn is visible as a test failure (the shorthandChat suite idiom).
  const compileSpy = vi.spyOn(runChatbotCompileModule, 'runChatbotCompile').mockResolvedValue({
    events: [], labwareAdditions: [], unresolvedRefs: [], diagnostics: [],
    terminalArtifacts: { events: [], directives: [], gaps: [] }, outcome: 'error',
  });
  const orchestrator = createAgentOrchestrator(
    model.client,
    { getToolDefinitions: () => [], executeTool: vi.fn() },
    { model: 'test-model', temperature: 0.1, maxTokens: 512 },
    { maxTurns: 2 },
    orchestratorDeps(),
  );
  return { orchestrator, compileSpy };
}

describe('REVISE-GHOST-1 — answered-binding reuse on the revise turn (real handler, no handler mocks)', () => {
  it('reuse case: draft bars -> answer folds -> revise turn with draftRevision compiles events (no re-ask of the answered label)', async () => {
    const { orchestrator, compileSpy } = makeOrchestrator([
      { toolCalls: [shorthandCall(DRAFT_YAML)] },
      { toolCalls: [shorthandCall(REVISED_YAML)] },
    ]);
    const events: AgentEvent[] = [];
    const onEvent = (e: AgentEvent) => events.push(e);

    // Turn 1 — the draft bars on the ambiguous label (the legitimate hold).
    const draft = await orchestrator.run({
      prompt: 'add 50 uL of test reagent to A1',
      surface: 'workspace.deck',
      forceDraftTool: true,
      context: BASE_CONTEXT,
      history: [],
      onEvent,
    } as never) as AgentResult;
    expect(draft.success).toBe(true);
    expect(draft.events?.length ?? 0).toBe(0);
    expect(draft.clarificationRequests?.length ?? 0).toBeGreaterThan(0);
    const card = draft.clarificationRequests![0]!;

    // Turn 2 — the scientist answers the card (the deterministic fold; zero
    // model calls). The answer carries the chosen record's ref.
    const answered = await orchestrator.run({
      prompt: 'Use Test Reagent A for material.',
      surface: 'workspace.deck',
      forceDraftTool: true,
      context: BASE_CONTEXT,
      history: [
        { role: 'user', content: 'add 50 uL of test reagent to A1' },
        { role: 'assistant', content: 'Draft compiled deterministically from the scientist-intent shorthand.' },
      ],
      clarificationAnswers: [{
        requestId: card.id,
        label: 'Alpha Reagent',
        mentionToken: '[[material:MAT-test-a|Alpha Reagent]]',
        ref: { kind: 'record', id: 'MAT-test-a', type: 'material', label: 'Alpha Reagent' },
      }],
      onEvent,
    } as never) as AgentResult;
    expect(answered.success).toBe(true);
    expect(answered.events?.length ?? 0).toBeGreaterThan(0);

    // Turn 3 — the REVISE turn: no clarificationAnswers, the mounted-preview
    // draftRevision context, the chosen label re-emitted by the model.
    // ACCEPTANCE (spec 4B.2): the done result's events are NON-EMPTY — the
    // already-answered label compiles without re-asking, ghosts remount.
    const revised = await orchestrator.run({
      prompt: 'Actually make it four wells instead, keep the rest the same.',
      surface: 'workspace.deck',
      forceDraftTool: true,
      context: { ...BASE_CONTEXT, draftRevision: DRAFT_REVISION_CONTEXT },
      history: [
        { role: 'user', content: 'add 50 uL of test reagent to A1' },
        { role: 'assistant', content: 'Draft compiled deterministically from the scientist-intent shorthand.' },
      ],
      onEvent,
    } as never) as AgentResult;
    expect(revised.success).toBe(true);
    expect(revised.clarificationRequests?.length ?? 0).toBe(0);
    expect(revised.events?.length ?? 0).toBeGreaterThan(0);
    expect(compileSpy).not.toHaveBeenCalled();
  });

  it('legitimate hold case: a genuinely NEW unbound label on the revise turn STILL holds with cards (events empty, clarificationRequests non-empty)', async () => {
    const { orchestrator } = makeOrchestrator([
      { toolCalls: [shorthandCall(DRAFT_YAML)] },
      { toolCalls: [shorthandCall(REVISED_NEW_LABEL_YAML)] },
    ]);
    const draft = await orchestrator.run({
      prompt: 'add 50 uL of test reagent to A1',
      surface: 'workspace.deck',
      forceDraftTool: true,
      context: BASE_CONTEXT,
      history: [],
    } as never) as AgentResult;
    const card = draft.clarificationRequests![0]!;
    await orchestrator.run({
      prompt: 'Use Test Reagent A for material.',
      surface: 'workspace.deck',
      forceDraftTool: true,
      context: BASE_CONTEXT,
      history: [],
      clarificationAnswers: [{
        requestId: card.id,
        label: 'Alpha Reagent',
        mentionToken: '[[material:MAT-test-a|Alpha Reagent]]',
        ref: { kind: 'record', id: 'MAT-test-a', type: 'material', label: 'Alpha Reagent' },
      }],
    } as never);

    const revised = await orchestrator.run({
      prompt: 'Also add 20 uL of other reagent to B1.',
      surface: 'workspace.deck',
      forceDraftTool: true,
      context: { ...BASE_CONTEXT, draftRevision: DRAFT_REVISION_CONTEXT },
      history: [],
    } as never) as AgentResult;
    // The hold doctrine is UNTOUCHED: an un-answered ambiguous label bars the
    // whole draft WITH its cards (spec bait 6 — the fix removes spurious
    // re-asks, not holds).
    expect(revised.success).toBe(true);
    expect(revised.events?.length ?? 0).toBe(0);
    expect(revised.clarificationRequests?.length ?? 0).toBeGreaterThan(0);
    expect(revised.clarificationRequests!.some((r) => r.query === 'other reagent')).toBe(true);
  });

  it('leak discipline: bindings do NOT cross a proposal boundary — a fresh-start turn (no draftRevision) re-asks the label the previous proposal answered', async () => {
    const { orchestrator } = makeOrchestrator([
      { toolCalls: [shorthandCall(DRAFT_YAML)] },
      { toolCalls: [shorthandCall(REVISED_YAML)] },
    ]);
    const draft = await orchestrator.run({
      prompt: 'add 50 uL of test reagent to A1',
      surface: 'workspace.deck',
      forceDraftTool: true,
      context: BASE_CONTEXT,
      history: [],
    } as never) as AgentResult;
    const card = draft.clarificationRequests![0]!;
    await orchestrator.run({
      prompt: 'Use Test Reagent A for material.',
      surface: 'workspace.deck',
      forceDraftTool: true,
      context: BASE_CONTEXT,
      history: [],
      clarificationAnswers: [{
        requestId: card.id,
        label: 'Alpha Reagent',
        mentionToken: '[[material:MAT-test-a|Alpha Reagent]]',
        ref: { kind: 'record', id: 'MAT-test-a', type: 'material', label: 'Alpha Reagent' },
      }],
    } as never);

    // A FRESH proposal on the same conversation (no mounted preview => no
    // draftRevision): the accepted bindings are dead — the spine re-resolves
    // and the ambiguous label bars again with its cards.
    const fresh = await orchestrator.run({
      prompt: 'add 50 uL of Test Reagent A to A1',
      surface: 'workspace.deck',
      forceDraftTool: true,
      context: BASE_CONTEXT,
      history: [],
    } as never) as AgentResult;
    expect(fresh.success).toBe(true);
    expect(fresh.events?.length ?? 0).toBe(0);
    expect(fresh.clarificationRequests?.length ?? 0).toBeGreaterThan(0);
  });
});
