/**
 * PB-CH-6 fix1 F1 — WORKSTATE COMPOSE RULES block (policy in data).
 *
 * Acceptance (spec §Tests):
 *  1. Loader unit: listed surface -> block present; unlisted (workspace.deck /
 *     event-editor) -> absent; absent YAML section -> off, no throw; malformed
 *     section -> throws honestly. Per-call policy read (no process cache).
 *  2. Warm/real capture parity (PB-CH-10 idiom): buildPrefixRequest (warm) and
 *     run() (real) carry the IDENTICAL system message on a listed surface;
 *     membership arms: analysis/literature/protocol-builder get the block,
 *     workspace.deck does not.
 *  3. Push order pinned: instruction, forced, grounding, rules — the rules
 *     block is pushed LAST, adjacent to the forced-tool instruction.
 *  4. Vocabulary discipline: the rules md coins NO surface words — surface ids
 *     ride the registry-rendered menu only.
 */
import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAgentOrchestrator } from './AgentOrchestrator.js';
import {
  buildWorkstateRulesBlockForSurface,
  loadWorkstateRulesSection,
} from './workstateComposeRules.js';
import type { CompletionRequest, InferenceClient, ToolBridge } from './types.js';
import type { AiSurface } from './systemPrompt.js';
import type { RecordEnvelope, RecordFilter, RecordStore } from '../store/types.js';

// ---------------------------------------------------------------------------
// Policy data reader (config/drafting/workstate-composition.yaml `rules:`)
// ---------------------------------------------------------------------------

describe('loadWorkstateRulesSection — policy DATA', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'pbch6fix1-'));

  it('reads the real policy file: rules present with surfaces + file', () => {
    const rules = loadWorkstateRulesSection();
    expect(rules).not.toBeNull();
    expect(rules!.surfaces).toContain('analysis');
    expect(rules!.surfaces).toContain('literature');
    expect(rules!.surfaces).toContain('protocol-builder');
    // Deliberately EXCLUDED (decision): the deck prefix stays token-cheap.
    expect(rules!.surfaces).not.toContain('workspace.deck');
    expect(typeof rules!.file).toBe('string');
    expect(rules!.file.trim().length).toBeGreaterThan(0);
  });

  it('absent rules section => null (feature off, no throw)', () => {
    const p = join(tmp, 'no-rules.yaml');
    writeFileSync(p, 'somethingElse: [x]\n');
    expect(loadWorkstateRulesSection(p)).toBeNull();
  });

  it('rules present but surfaces absent/empty => null (no push, negative arm)', () => {
    const p1 = join(tmp, 'no-surfaces.yaml');
    writeFileSync(p1, 'rules:\n  file: prompts/workstate-compose-rules.md\n');
    expect(loadWorkstateRulesSection(p1)).toBeNull();
    const p2 = join(tmp, 'empty-surfaces.yaml');
    writeFileSync(p2, 'rules:\n  surfaces: []\n  file: prompts/workstate-compose-rules.md\n');
    expect(loadWorkstateRulesSection(p2)).toBeNull();
  });

  it('malformed rules (missing file, non-string surfaces, non-object) throws honestly', () => {
    const p1 = join(tmp, 'no-file.yaml');
    writeFileSync(p1, 'rules:\n  surfaces: [analysis]\n');
    expect(() => loadWorkstateRulesSection(p1)).toThrow();
    const p2 = join(tmp, 'bad-surfaces.yaml');
    writeFileSync(p2, 'rules:\n  surfaces: [42]\n  file: prompts/workstate-compose-rules.md\n');
    expect(() => loadWorkstateRulesSection(p2)).toThrow();
    const p3 = join(tmp, 'bad-rules.yaml');
    writeFileSync(p3, 'rules: "on"\n');
    expect(() => loadWorkstateRulesSection(p3)).toThrow();
  });

  it('per-call read: a surfaces edit between calls takes effect immediately (NO process cache)', () => {
    const p = join(tmp, 'flip.yaml');
    writeFileSync(p, 'rules:\n  surfaces: [analysis]\n  file: prompts/workstate-compose-rules.md\n');
    expect(loadWorkstateRulesSection(p)!.surfaces).toEqual(['analysis']);
    writeFileSync(p, 'rules:\n  surfaces: [literature]\n  file: prompts/workstate-compose-rules.md\n');
    expect(loadWorkstateRulesSection(p)!.surfaces).toEqual(['literature']);
  });
});

// ---------------------------------------------------------------------------
// Block builder: membership is DATA, zero surface literals in TS
// ---------------------------------------------------------------------------

describe('buildWorkstateRulesBlockForSurface — membership arms', () => {
  it('listed surface (analysis) => block carries the rule text', () => {
    const block = buildWorkstateRulesBlockForSurface('analysis');
    expect(block).not.toBeNull();
    expect(block!).toContain('WORKSTATE COMPOSE RULES');
    expect(block!).toContain('EVERY workstate tab');
    expect(block!).toContain('never a target');
    // One worked example of the FULL tool envelope (PB-CH-10 md shape).
    expect(block!).toContain('"intent":"compose_workstate"');
    expect(block!).toContain('"operation":"compose-workstate"');
  });

  it('unlisted surfaces (workspace.deck, event-editor) => null', () => {
    expect(buildWorkstateRulesBlockForSurface('workspace.deck')).toBeNull();
    expect(buildWorkstateRulesBlockForSurface('event-editor')).toBeNull();
  });

  it('undefined surface => null', () => {
    expect(buildWorkstateRulesBlockForSurface(undefined)).toBeNull();
  });

  it('rules md coins NO surface words — ids ride the registry-rendered menu only', () => {
    const block = buildWorkstateRulesBlockForSurface('analysis');
    expect(block).not.toBeNull();
    for (const surfaceWord of ['workspace.deck', 'protocol-builder', 'run-design', 'literature', 'event-editor']) {
      expect(block!).not.toContain(surfaceWord);
    }
  });
});

// ---------------------------------------------------------------------------
// Outbound-request capture (mirrors analysisReferenceGrounding.test.ts)
// ---------------------------------------------------------------------------

function captureClient(): { client: InferenceClient; captured: () => CompletionRequest | null } {
  let captured: CompletionRequest | null = null;
  const completeStream = vi.fn(async function* (request: CompletionRequest) {
    captured = request;
    yield {
      id: 'resp-1',
      choices: [{
        index: 0,
        delta: { role: 'assistant', content: '{"events":[],"notes":[]}' },
        finish_reason: 'stop' as const,
      }],
    };
  });
  return { client: { complete: vi.fn(), completeStream }, captured: () => captured };
}

const toolBridge: ToolBridge = {
  getToolDefinitions: () => [],
  executeTool: vi.fn(),
};

const baseContext = {
  labwares: [],
  eventSummary: 'No events yet.',
  vocabPackId: 'liquid-handling/v1',
  availableVerbs: ['transfer'],
};

function stubStore(records: RecordEnvelope[]): { store: RecordStore; listCalls: RecordFilter[] } {
  const listCalls: RecordFilter[] = [];
  const store = {
    list: vi.fn(async (filter?: RecordFilter) => {
      listCalls.push(filter ?? {});
      const kind = filter?.kind;
      return records.filter((r) => (r.payload as Record<string, unknown>).kind === kind);
    }),
  } as unknown as RecordStore;
  return { store, listCalls };
}

const GROUNDING_RECORDS: RecordEnvelope[] = [
  { recordId: 'ANREV-000001', schemaId: 's', payload: { kind: 'analysis-revision', name: 'Mitochondrial ROS assay v1' }, meta: { kind: 'analysis-revision' } },
];

async function runCapture(surface: AiSurface, store: RecordStore): Promise<string> {
  const { client, captured } = captureClient();
  const orchestrator = createAgentOrchestrator(
    client,
    toolBridge,
    { baseUrl: 'http://fake', model: 'test-model', temperature: 0.1, maxTokens: 512 },
    { maxTurns: 1, draftFlowMode: 'forced-tool' },
    { store },
  );
  await orchestrator.run({
    prompt: 'Open the run in a new tab.',
    surface,
    context: baseContext,
  });
  const request = captured();
  expect(request).not.toBeNull();
  const system = request!.messages.find((m) => m.role === 'system');
  expect(system).toBeDefined();
  return system!.content ?? '';
}

describe('outbound request capture — WORKSTATE COMPOSE RULES block (PB-CH-6 fix1 F1)', () => {
  it('surface=analysis: system message carries the rules block', async () => {
    const { store } = stubStore(GROUNDING_RECORDS);
    const system = await runCapture('analysis', store);
    expect(system).toContain('WORKSTATE COMPOSE RULES');
    expect(system).toContain('EVERY workstate tab');
    expect(system).toContain('"intent":"compose_workstate"');
  });

  it('surface=literature and surface=protocol-builder (the mounted accept-leg surfaces): block present', async () => {
    const { store } = stubStore(GROUNDING_RECORDS);
    expect(await runCapture('literature', store)).toContain('WORKSTATE COMPOSE RULES');
    expect(await runCapture('protocol-builder', store)).toContain('WORKSTATE COMPOSE RULES');
  });

  it('membership arm: workspace.deck does NOT get the rules block (deck prefix stays token-cheap) but keeps its grounding block', async () => {
    const { store } = stubStore(GROUNDING_RECORDS);
    const system = await runCapture('workspace.deck', store);
    expect(system).not.toContain('WORKSTATE COMPOSE RULES');
    expect(system).toContain('ANALYSIS REFERENCES');
  });

  it('surface NOT in rules.surfaces (event-editor): block absent', async () => {
    const { store } = stubStore(GROUNDING_RECORDS);
    const system = await runCapture('event-editor', store);
    expect(system).not.toContain('WORKSTATE COMPOSE RULES');
  });

  it('push order pinned: instruction, forced, grounding, rules (rules LAST, adjacent to the forced-tool instruction)', async () => {
    const { store } = stubStore(GROUNDING_RECORDS);
    const system = await runCapture('analysis', store);
    const iInstruction = system.indexOf('FINALIZING YOUR ANSWER');
    const iForced = system.indexOf('EVENT-EDITOR DRAFT MODE');
    const iGrounding = system.indexOf('ANALYSIS REFERENCES');
    const iRules = system.indexOf('WORKSTATE COMPOSE RULES');
    expect(iInstruction).toBeGreaterThanOrEqual(0);
    expect(iForced).toBeGreaterThan(iInstruction);
    expect(iGrounding).toBeGreaterThan(iForced);
    expect(iRules).toBeGreaterThan(iGrounding);
  });

  it('warm/real parity: buildPrefixRequest (warm path) carries the identical system message the real run() renders', async () => {
    const { store } = stubStore(GROUNDING_RECORDS);
    const { client } = captureClient();
    const orchestrator = createAgentOrchestrator(
      client,
      toolBridge,
      { baseUrl: 'http://fake', model: 'test-model', temperature: 0.1, maxTokens: 512 },
      { maxTurns: 1, draftFlowMode: 'forced-tool' },
      { store },
    );
    const prefix = await orchestrator.buildPrefixRequest!({
      context: baseContext,
      surface: 'analysis',
      forceDraftTool: true,
    });
    const system = prefix.messages.find((m) => m.role === 'system');
    expect(system?.content ?? '').toContain('WORKSTATE COMPOSE RULES');
    const realSystem = await runCapture('analysis', store);
    expect(system?.content).toBe(realSystem);
  });
});
