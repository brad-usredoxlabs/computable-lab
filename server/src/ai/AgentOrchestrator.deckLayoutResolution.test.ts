/**
 * L2-SUITE-A-uifix2 FIX2 (D1) — the deck_layout model-output gap, handled
 * HONESTLY (gate re-gate-3 defect 1, BLOCKER).
 *
 * THE DEFECT: the P1 turn ("Navigate to the freeform manual deck") made the
 * model emit a deck_layout intent WITHOUT a variantId. The harness answered
 * with the RAW VALIDATOR STRING ('deck_layout intent requires a variantId
 * (e.g. "manual_freeform" = the freeform bench).') — implementation jargon
 * in the scientist chat (hard rule: no implementation vocabulary in
 * scientist chat) — and the bench never mounted.
 *
 * THE CONTRACT (this file pins it):
 *  1. A variantId-less deck_layout whose TEXT names a declared layout title
 *     (config/platforms/*.yaml — DATA) RESOLVES to that variant: the turn
 *     returns the ordinary success shape {deckLayout:{platformId, variantId}}
 *     so the client's native mount path (setPlatform+setVariant) runs.
 *  2. A variantId-less deck_layout naming NO declared layout degrades to a
 *     PLAIN-LANGUAGE wall that offers the platform's declared layout titles —
 *     ZERO implementation vocabulary: no 'variantId', no 'deck_layout', no
 *     'intent', no 'validator', no underscored variant ids.
 *  3. The raw validator string is RETIRED: it appears nowhere in any
 *     deck_layout outcome.
 *
 * Manifest data: the REAL config/platforms YAML (loaded through
 * loadPlatformRegistry from the repo root, asserted source === 'yaml' —
 * no synthetic vocabulary; the suite DIES if the YAML is unreadable instead
 * of silently grading the DEFAULT_PLATFORM_MANIFESTS fallback).
 */
import { describe, expect, it, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAgentOrchestrator } from './AgentOrchestrator.js';
import { AGENT_INTENT_TOOL_NAME } from './submitSuggestionTool.js';
import type { AgentEvent, CompletionRequest, InferenceClient } from './types.js';
import { loadPlatformRegistry } from '../platform-registry/YamlPlatformRegistryLoader.js';
import type { PlatformRegistry } from '../platform-registry/PlatformRegistry.js';
import * as runChatbotCompileModule from './runChatbotCompile.js';
import {
  resolveDeckVariantFromText,
  deckLayoutChoiceWall,
} from './deckLayoutResolution.js';

// L2-SUITE-A-uifix2 FIX3 (advc1 defect 2): the repo root, NOT the server/
// directory. This file lives at server/src/ai/, so the repo root is THREE
// levels up — '..','..' resolved to server/ and loadPlatformRegistry silently
// fell back to DEFAULT_PLATFORM_MANIFESTS (the "data-driven from YAML" claim
// was pinned nowhere: moving config/platforms/manual.yaml away left this
// suite 8/8 green). The existing idiom is loadPlatformRegistry('..') from
// server/src/platform-registry/ (defaultManifests.test.ts).
const REPO_ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..');

let registry: PlatformRegistry;
let registrySource: 'yaml' | 'fallback';

const JARGON_PATTERNS: RegExp[] = [
  /variantId/i,
  /deck_layout/i,
  /\bintent\b/i,
  /validator/i,
  /manual_freeform/,
  /manual_single_plate/,
  /manual_collapsed/,
];

function hasJargon(text: string): boolean {
  return JARGON_PATTERNS.some((re) => re.test(text));
}

beforeAll(async () => {
  ({ registry, source: registrySource } = await loadPlatformRegistry(REPO_ROOT));
  // L2-SUITE-A-uifix2 FIX3 (advc1 defect 2): pin that this suite grades the
  // REAL config/platforms YAML. If the YAML were unreadable, loadPlatformRegistry
  // would SILENTLY fall back to DEFAULT_PLATFORM_MANIFESTS and every leg below
  // would keep grading the duplicated TS vocabulary (moving manual.yaml away
  // used to leave the suite 8/8 green). The test dies here instead.
  expect(registrySource).toBe('yaml');
});

/** A fake model that answers with exactly one agent_intent tool call. */
function intentClient(args: unknown): InferenceClient {
  const completeStream = vi.fn(async function* (_request: CompletionRequest) {
    yield {
      id: 'resp-dl',
      choices: [{
        index: 0,
        delta: {
          role: 'assistant',
          tool_calls: [{
            index: 0,
            id: 'call-dl',
            type: 'function',
            function: {
              name: AGENT_INTENT_TOOL_NAME,
              arguments: JSON.stringify(args),
            },
          }],
        },
        finish_reason: 'tool_calls',
      }],
    };
  });
  return { complete: vi.fn(), completeStream } as unknown as InferenceClient;
}

/** A store whose every write side is a tripwire. */
function mutationTripwire() {
  return {
    get: vi.fn(async () => null),
    list: vi.fn(async () => []),
    exists: vi.fn(async () => false),
    create: vi.fn(async () => { throw new Error('deck_layout must NEVER write'); }),
    update: vi.fn(async () => { throw new Error('deck_layout must NEVER write'); }),
    delete: vi.fn(async () => { throw new Error('deck_layout must NEVER write'); }),
    validate: vi.fn(),
    lint: vi.fn(),
    getByPath: vi.fn(),
    getWithValidation: vi.fn(),
  };
}

async function runDeckLayoutTurn(args: unknown, prompt: string) {
  const executeTool = vi.fn(async () => {
    throw new Error('deck_layout must NEVER execute a tool');
  });
  const events: AgentEvent[] = [];
  const orchestrator = createAgentOrchestrator(
    intentClient(args),
    { getToolDefinitions: () => [], executeTool },
    { model: 'test-model', temperature: 0.1, maxTokens: 512 } as never,
    { maxTurns: 2, draftFlowMode: 'preflight-llm' },
    {
      store: mutationTripwire() as never,
      platformRegistry: registry,
    },
  );
  const result = await orchestrator.run({
    prompt,
    forceDraftTool: true,
    onEvent: (event) => events.push(event),
    context: {
      labwares: [],
      eventSummary: 'No events yet.',
      vocabPackId: 'liquid-handling/v1',
      availableVerbs: ['add_material'],
      activeDeckScope: {
        platformId: 'manual',
        variantId: 'manual_single_plate',
        allowedSurfaces: ['slot'],
        allowedSlots: ['PLATE'],
        allowedLabwareIds: [],
      },
    },
  });
  return { result, events };
}

describe('deckLayoutResolution — the data-driven resolver (pure)', () => {
  it('resolves the freeform bench from its declared TITLE words (real manifest)', () => {
    expect(resolveDeckVariantFromText(registry, 'manual', 'Navigate to the freeform manual deck')).toBe(
      'manual_freeform',
    );
    expect(resolveDeckVariantFromText(registry, 'manual', 'Put me on the Manual Bench, the freeform one')).toBe(
      'manual_freeform',
    );
  });

  it('does not invent a variant from text that names no declared layout', () => {
    expect(resolveDeckVariantFromText(registry, 'manual', 'show me something entirely different')).toBeNull();
  });

  it('the choice wall offers the declared titles with ZERO implementation vocabulary (real manifest)', () => {
    const wall = deckLayoutChoiceWall(registry, 'manual');
    expect(wall).toBeTruthy();
    expect(wall).toContain('Manual Bench (freeform)');
    expect(wall).toContain('Single SBS Plate');
    expect(hasJargon(wall as string)).toBe(false);
  });

  it('the wall is honest for an unknown platform (no invented menu, no jargon)', () => {
    expect(deckLayoutChoiceWall(registry, 'no_such_platform')).toBeNull();
  });
});

describe('AgentOrchestrator — the deck_layout model-output gap (D1 contract)', () => {
  beforeEach(() => {
    vi.spyOn(runChatbotCompileModule, 'runChatbotCompile').mockResolvedValue({
      events: [],
      labwareAdditions: [],
      unresolvedRefs: [],
      diagnostics: [],
      terminalArtifacts: { events: [], directives: [], gaps: [] },
      outcome: 'complete',
    } as never);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('P1 verbatim: variantId-less deck_layout naming the freeform bench MOUNTS it (success shape, no jargon)', async () => {
    const { result, events } = await runDeckLayoutTurn(
      { intent: 'deck_layout' }, // the model's real gap: NO variantId
      'Navigate to the freeform manual deck',
    );
    expect(result.success).toBe(true);
    expect(result.deckLayout).toEqual({ platformId: 'manual', variantId: 'manual_freeform' });
    // The success shape is what the client's native mount path consumes
    // (DeckSurfaceChat.onDeckLayout: getVariantManifest + setVariant).
    const toolResults = events.filter((e) => e.type === 'tool_result');
    expect(toolResults.some((e) => e.success)).toBe(true);
    // No jargon in the SCIENTIST-FACING channels (status + tool_result
    // messages + the result's prose). The tool_call frame is the MODEL's own
    // argument envelope (internal), not a rendered message — it is excluded
    // (its "intent"/"deck_layout" discriminators are the model contract).
    const scientistFacing = (JSON.stringify(
      events.filter((e) => e.type === 'status' || e.type === 'tool_result'),
    ) + JSON.stringify(result))
      .replace(/"deckLayout":\{[^}]*\}/g, '')
      .replace(/"variantId":\s*"[^"]*"/g, '');
    expect(hasJargon(scientistFacing)).toBe(false);
  });

  it('variantId-less deck_layout naming NO declared layout: plain-language wall, no jargon, no raw validator string', async () => {
    const { result } = await runDeckLayoutTurn(
      { intent: 'deck_layout' },
      'switch the deck to something I will describe later',
    );
    // Honest outcome: no phantom mount, a wall the scientist can ACT ON
    // (offers the declared titles).
    expect(result.deckLayout).toBeUndefined();
    expect(result.success).toBe(false);
    const message: string = result.error ?? '';
    expect(message.length).toBeGreaterThan(0);
    expect(message).toContain('Manual Bench (freeform)');
    expect(message).toContain('Single SBS Plate');
    expect(hasJargon(message)).toBe(false);
    expect(message).not.toContain('requires a variantId');
  });

  it("a variantId-carrying deck_layout still delivers the model's choice (unchanged success path)", async () => {
    const { result } = await runDeckLayoutTurn(
      { intent: 'deck_layout', platformId: 'manual', variantId: 'manual_collapsed' },
      'switch to the technician mode',
    );
    expect(result.success).toBe(true);
    expect(result.deckLayout).toEqual({ platformId: 'manual', variantId: 'manual_collapsed' });
  });

  it('a variantId the manifest does not declare is refused with the plain-language wall (no jargon, no raw validator string)', async () => {
    const { result } = await runDeckLayoutTurn(
      { intent: 'deck_layout', platformId: 'manual', variantId: 'manual__does_not_exist' },
      'switch to the technician mode',
    );
    expect(result.success).toBe(false);
    expect(result.deckLayout).toBeUndefined();
    const message: string = result.error ?? '';
    expect(message).toContain('Manual Bench (freeform)');
    expect(hasJargon(message)).toBe(false);
    expect(message).not.toContain('requires a variantId');
  });
});
