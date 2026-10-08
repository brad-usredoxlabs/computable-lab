/**
 * PB-CH-10 — analysis draft-args grounding (product-side).
 *
 * Acceptance (spec §Verification commands):
 *  1. buildAnalysisReferenceBlock renders block content per kind from a stub
 *     store; the per-kind cap comes from DATA; an absent `grounding:` section
 *     yields null (no block); an absent/empty surfaces list yields no push and
 *     NO store scan; output is deterministic (sorted by recordId).
 *  2. Outbound-request capture (mirrors the attachedProtocol.test.ts harness):
 *     the system message for surface `analysis` AND surface `workspace.deck`
 *     contains the grounded reference block with real ids + the never-a-raw-id
 *     rule; a surface NOT in grounding.surfaces lacks the block entirely.
 *  3. Warm/real parity: buildPrefixRequest (the warm render path) carries the
 *     SAME block the real run() request carries.
 *
 * Vocabulary discipline under test (spec bait): a recordId is never called a
 * "term" in the rendered block; the rule text says the opposite.
 */
import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAgentOrchestrator } from './AgentOrchestrator.js';
import {
  buildAnalysisGroundingBlockForSurface,
  buildAnalysisReferenceBlock,
  loadAnalysisGroundingSection,
  type AnalysisGroundingPolicy,
  type AnalysisReferenceScanPolicy,
} from './analysisReferenceGrounding.js';
import type { CompletionRequest, InferenceClient, ToolBridge } from './types.js';
import type { AiSurface } from './systemPrompt.js';
import type { RecordEnvelope, RecordFilter, RecordStore } from '../store/types.js';

// ---------------------------------------------------------------------------
// Stub store
// ---------------------------------------------------------------------------

function envelope(recordId: string, kind: string, labelField: 'name' | 'title' | 'label', label: string): RecordEnvelope {
  return {
    recordId,
    schemaId: `https://computable-lab.com/schema/computable-lab/${kind}.schema.yaml`,
    payload: { kind, [labelField]: label },
    meta: { kind },
  };
}

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

// The kinds mirror config/drafting/analysis-composition.yaml referenceKinds;
// the ids mirror real lane-store records (ANREV-000001, ANR-000001,
// DREF-L2PBCH5-RCPT1 exist in the lane workspace index).
const KINDS = ['analysis-revision', 'analysis-run', 'data-reference', 'analysis-output-artifact'];
const GROUNDING: AnalysisGroundingPolicy = {
  surfaces: ['analysis', 'workspace.deck'],
  maxPerKind: 6,
  title: 'ANALYSIS REFERENCES (the ONLY records compose_analysis may target):',
};
const SCAN: AnalysisReferenceScanPolicy = { referenceKinds: KINDS, grounding: GROUNDING };

const GROUNDING_RECORDS = [
  envelope('ANREV-000001', 'analysis-revision', 'name', 'Mitochondrial ROS assay v1'),
  envelope('ANR-000001', 'analysis-run', 'title', 'ROS quantitation run'),
  envelope('DREF-L2PBCH5-RCPT1', 'data-reference', 'name', 'Gate receipt plate data'),
  envelope('AOA-000001', 'analysis-output-artifact', 'label', 'ROS fold-change artifact'),
];

describe('buildAnalysisReferenceBlock — store scan + rendering', () => {
  it('renders one line per record: kind | recordId | label, one list() per referenceKind', async () => {
    const { store, listCalls } = stubStore(GROUNDING_RECORDS);
    const block = await buildAnalysisReferenceBlock(store, SCAN);
    expect(block).not.toBeNull();
    expect(block!).toContain('ANALYSIS REFERENCES');
    expect(block!).toContain('- analysis-revision | ANREV-000001 | Mitochondrial ROS assay v1');
    expect(block!).toContain('- analysis-run | ANR-000001 | ROS quantitation run');
    expect(block!).toContain('- data-reference | DREF-L2PBCH5-RCPT1 | Gate receipt plate data');
    expect(block!).toContain('- analysis-output-artifact | AOA-000001 | ROS fold-change artifact');
    expect(listCalls).toHaveLength(KINDS.length);
    for (const kind of KINDS) expect(listCalls.some((c) => c.kind === kind)).toBe(true);
  });

  it('honors maxPerKind from DATA: only the first N recordId-sorted records render', async () => {
    const many = [
      envelope('ANREV-000003', 'analysis-revision', 'name', 'Third revision'),
      envelope('ANREV-000001', 'analysis-revision', 'name', 'First revision'),
      envelope('ANREV-000002', 'analysis-revision', 'name', 'Second revision'),
    ];
    const { store } = stubStore(many);
    const block = await buildAnalysisReferenceBlock(store, {
      referenceKinds: ['analysis-revision'],
      grounding: { ...GROUNDING, maxPerKind: 2 },
    });
    expect(block).not.toBeNull();
    expect(block!).toContain('ANREV-000001');
    expect(block!).toContain('ANREV-000002');
    expect(block!).not.toContain('ANREV-000003');
  });

  it('absent grounding section => null and NO store scan', async () => {
    const { store, listCalls } = stubStore(GROUNDING_RECORDS);
    const block = await buildAnalysisReferenceBlock(store, { referenceKinds: KINDS, grounding: null });
    expect(block).toBeNull();
    expect(listCalls).toHaveLength(0);
  });

  it('no records for any kind => null (no empty block)', async () => {
    const { store } = stubStore([]);
    const block = await buildAnalysisReferenceBlock(store, SCAN);
    expect(block).toBeNull();
  });

  it('determinism: shuffled store order yields byte-identical blocks, recordId-sorted WITHIN each kind group', async () => {
    const withSecond = [...GROUNDING_RECORDS, envelope('ANREV-000002', 'analysis-revision', 'name', 'Second revision')];
    const a = await buildAnalysisReferenceBlock(stubStore(withSecond).store, SCAN);
    const b = await buildAnalysisReferenceBlock(stubStore([...withSecond].reverse()).store, SCAN);
    expect(a).not.toBeNull();
    expect(a).toBe(b);
    const idLines = a!.split('\n').filter((l: string) => /^- [^|]+ \| [^|]+ \| /.test(l));
    const ids = idLines.map((l: string) => l.split('|')[1]!.trim());
    // Kind groups follow the policy's referenceKinds order; inside each group
    // the ids are recordId-sorted (the determinism the warm/real parity needs).
    expect(ids).toEqual([
      'ANREV-000001',
      'ANREV-000002',
      'ANR-000001',
      'DREF-L2PBCH5-RCPT1',
      'AOA-000001',
    ]);
  });

  it('label falls back to recordId when the payload carries no name/title/label', async () => {
    const { store } = stubStore([{ recordId: 'ANREV-000009', schemaId: 's', payload: { kind: 'analysis-revision' } }]);
    const block = await buildAnalysisReferenceBlock(store, { referenceKinds: ['analysis-revision'], grounding: GROUNDING });
    expect(block).toContain('- analysis-revision | ANREV-000009 | ANREV-000009');
  });
});

// ---------------------------------------------------------------------------
// Policy data reader (config/drafting/analysis-composition.yaml `grounding:`)
// ---------------------------------------------------------------------------

describe('loadAnalysisGroundingSection — policy DATA', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'pbch10-'));

  it('reads the real policy file: grounding present with surfaces, maxPerKind, title', () => {
    const grounding = loadAnalysisGroundingSection();
    expect(grounding).not.toBeNull();
    expect(grounding!.surfaces).toContain('analysis');
    expect(grounding!.surfaces).toContain('workspace.deck');
    expect(Number.isInteger(grounding!.maxPerKind)).toBe(true);
    expect(grounding!.maxPerKind).toBeGreaterThan(0);
    expect(grounding!.title.trim().length).toBeGreaterThan(0);
  });

  it('absent grounding section => null', () => {
    const p = join(tmp, 'no-grounding.yaml');
    writeFileSync(p, 'revisionKinds: [analysis-revision]\nrunKinds: [analysis-run]\n');
    expect(loadAnalysisGroundingSection(p)).toBeNull();
  });

  it('grounding present but surfaces absent/empty => null (no push, negative arm)', () => {
    const p1 = join(tmp, 'no-surfaces.yaml');
    writeFileSync(p1, 'grounding:\n  maxPerKind: 6\n  title: "X"\n');
    expect(loadAnalysisGroundingSection(p1)).toBeNull();
    const p2 = join(tmp, 'empty-surfaces.yaml');
    writeFileSync(p2, 'grounding:\n  surfaces: []\n  maxPerKind: 6\n  title: "X"\n');
    expect(loadAnalysisGroundingSection(p2)).toBeNull();
  });

  it('malformed grounding (missing cap/title, non-string surfaces) throws honestly', () => {
    const p = join(tmp, 'malformed.yaml');
    writeFileSync(p, 'grounding:\n  surfaces: [analysis]\n');
    expect(() => loadAnalysisGroundingSection(p)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Outbound-request capture (mirrors attachedProtocol.test.ts:151-221)
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
    prompt: 'Analyze the run I just opened.',
    surface,
    context: baseContext,
  });
  const request = captured();
  expect(request).not.toBeNull();
  const system = request!.messages.find((m) => m.role === 'system');
  expect(system).toBeDefined();
  return system!.content ?? '';
}

describe('outbound request capture — grounded analysis reference block (PB-CH-10)', () => {
  it('surface=analysis: system message carries the block with real ids + the never-a-raw-id-in-term rule', async () => {
    const { store } = stubStore(GROUNDING_RECORDS);
    const system = await runCapture('analysis', store);
    expect(system).toContain('ANALYSIS REFERENCES');
    expect(system).toContain('ANREV-000001');
    expect(system).toContain('ANR-000001');
    expect(system).toContain('DREF-L2PBCH5-RCPT1');
    expect(system).toContain('AOA-000001');
    // Rule text (data, server/prompts/analysis-reference-grounding.md)
    expect(system).toContain('NEVER put a raw record id');
    expect(system).toContain('is NOT an analysis target');
    // Vocabulary discipline: the block never calls a recordId a term —
    // it says a term is knowledge-layer language instead.
    expect(system).toContain('biologist/knowledge-layer language');
  });

  it('surface=workspace.deck (the surface the PB-CH-5 gate actually sends on): same block', async () => {
    const { store } = stubStore(GROUNDING_RECORDS);
    const system = await runCapture('workspace.deck', store);
    expect(system).toContain('ANALYSIS REFERENCES');
    expect(system).toContain('ANREV-000001');
    expect(system).toContain('ANR-000001');
    expect(system).toContain('DREF-L2PBCH5-RCPT1');
    expect(system).toContain('NEVER put a raw record id');
  });

  it('surface NOT in grounding.surfaces: block absent AND zero store scans', async () => {
    const { store, listCalls } = stubStore(GROUNDING_RECORDS);
    const system = await runCapture('event-editor', store);
    expect(system).not.toContain('ANALYSIS REFERENCES');
    expect(system).not.toContain('ANREV-000001');
    expect(listCalls).toHaveLength(0);
  });

  it('warm/real parity: buildPrefixRequest (warm path) carries the identical block', async () => {
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
    expect(system?.content ?? '').toContain('ANALYSIS REFERENCES');
    expect(system?.content ?? '').toContain('ANREV-000001');
    // And the real run() render for the same (surface, store) is byte-identical
    // in its system message.
    const realSystem = await runCapture('analysis', store);
    expect(system?.content).toBe(realSystem);
  });

  it('determinism at capture level: two runs on the same surface render identical system messages', async () => {
    const first = await runCapture('analysis', stubStore(GROUNDING_RECORDS).store);
    const second = await runCapture('analysis', stubStore([...GROUNDING_RECORDS].reverse()).store);
    expect(first).toBe(second);
  });
});

// ---------------------------------------------------------------------------
// Scan-failure degradation (adversarial review PB-CH-10 DEFECT 1)
// A store error on the grounding path must degrade to "no block, chat turn
// proceeds" — loudly (console.warn naming the failing kind), never a crash.
// ---------------------------------------------------------------------------

/** Store whose list() throws — `boomKind: null` fails every kind, a named
 * kind fails only that one (the partial-scan arm). */
function failingStore(boomKind: string | null): { store: RecordStore; listCalls: RecordFilter[] } {
  const listCalls: RecordFilter[] = [];
  const store = {
    list: vi.fn(async (filter?: RecordFilter) => {
      listCalls.push(filter ?? {});
      if (boomKind === null || filter?.kind === boomKind) {
        throw new Error(`REVIEW-STORE-BOOM: repo read failed for ${filter?.kind ?? '(no kind)'}`);
      }
      const kind = filter?.kind;
      return GROUNDING_RECORDS.filter((r) => (r.payload as Record<string, unknown>).kind === kind);
    }),
  } as unknown as RecordStore;
  return { store, listCalls };
}

const groundingWarns = (calls: unknown[][]) =>
  calls.filter((c) => String(c[0]).includes('analysis-grounding'));

describe('scan-failure degradation — store error must not sink the chat turn (DEFECT 1)', () => {
  it('store.list throwing on the first kind => buildAnalysisReferenceBlock RESOLVES null (no block), not a rejection; console.warn names the failing kind', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { store } = failingStore(null);
      await expect(buildAnalysisReferenceBlock(store, SCAN)).resolves.toBeNull();
      const loud = groundingWarns(warn.mock.calls);
      expect(loud.length).toBeGreaterThan(0);
      // The warn is diagnosable: it carries the failing kind (a DATA value,
      // first in referenceKinds order) and the store's own error text.
      expect(String(loud[0]![0])).toContain('analysis-revision');
      expect(String(loud[0]![0])).toContain('REVIEW-STORE-BOOM');
    } finally {
      warn.mockRestore();
    }
  });

  it('partial failure (one kind throws, others fine) => still null: a partial candidate list is worse than none', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { store } = failingStore('analysis-run');
      await expect(buildAnalysisReferenceBlock(store, SCAN)).resolves.toBeNull();
      expect(groundingWarns(warn.mock.calls).length).toBeGreaterThan(0);
    } finally {
      warn.mockRestore();
    }
  });

  it('buildAnalysisGroundingBlockForSurface (the orchestrator entry point) degrades to null, never rejects', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { store } = failingStore(null);
      await expect(buildAnalysisGroundingBlockForSurface(store, 'analysis')).resolves.toBeNull();
    } finally {
      warn.mockRestore();
    }
  });

  it('capture: a store whose list() throws => the chat turn PROCEEDS (outbound request still sent) and its system message carries NO block', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { store } = failingStore(null);
      // runCapture asserts the outbound request WAS captured — i.e. the model
      // call happened and the turn completed instead of erroring out.
      const system = await runCapture('analysis', store);
      expect(system).not.toContain('ANALYSIS REFERENCES');
      expect(system).not.toContain('ANREV-000001');
      expect(groundingWarns(warn.mock.calls).length).toBeGreaterThan(0);
    } finally {
      warn.mockRestore();
    }
  });

  it('capture: a non-listed surface with a throwing store still costs ZERO scans (degradation is not a blanket try/catch)', async () => {
    const { store, listCalls } = failingStore(null);
    const system = await runCapture('event-editor', store);
    expect(system).not.toContain('ANALYSIS REFERENCES');
    expect(listCalls).toHaveLength(0);
  });
});
