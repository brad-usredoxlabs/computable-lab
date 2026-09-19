/**
 * ProtocolIntakeService tests — orchestration verified end-to-end with every
 * network/LLM edge stubbed. Payloads written to the mock store are validated
 * against the REAL committed PDT/SGP schemas (full registry, topological
 * order) so a schema/service drift fails here, not in production.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { loadAllSchemas } from '../schema/SchemaLoader.js';
import { createSchemaRegistry } from '../schema/SchemaRegistry.js';
import { createValidator } from '../validation/AjvValidator.js';
import type { RecordStoreImpl } from '../store/RecordStoreImpl.js';
import {
  buildDecisionBlock,
  scaleOptionsFromRegistry,
  ProtocolIntakeService,
  PROTOCOL_DECISION_TREE_SCHEMA_ID,
  SUBGRAPH_PROPOSAL_SCHEMA_ID,
} from './ProtocolIntakeService.js';
import type { ProtocolCandidate } from '../ingestion/vendor-protocol/types.js';
import type { RunChatbotCompileResult } from '../ai/runChatbotCompile.js';

// One branchy step (a./b.) -> one question axis x two answers; a second
// branch-free step exercises the shared-path inclusion.
const BRANCHY_PROTOCOL = `
Example DNA Extraction Protocol

Protocol
1. Add Binding Buffer to the deep-well block.
   a. For bacterial DNA add 200 ul.
   b. For mammalian cell culture add 50 ul.
2. Mix for 5 minutes at room temperature.
3. Place the plate on a magnetic stand for 3 minutes.
`;

let validator: ReturnType<typeof createValidator>;

beforeAll(async () => {
  const result = await loadAllSchemas({ basePath: join(process.cwd(), 'schema') });
  expect(result.errors).toEqual([]);
  const registry = createSchemaRegistry();
  registry.addSchemas(result.entries);
  validator = createValidator({ strict: false });
  for (const id of registry.getTopologicalOrder()) {
    const entry = registry.getById(id);
    if (entry) validator.addSchema(entry.schema, entry.id);
  }
});

interface MockEnvelope { recordId: string; schemaId: string; payload: Record<string, unknown> }

function makeMockStore() {
  const records = new Map<string, MockEnvelope>();
  const store = {
    get: vi.fn(async (recordId: string) => records.get(recordId) ?? null),
    create: vi.fn(async ({ envelope }: { envelope: MockEnvelope }) => {
      if (records.has(envelope.recordId)) {
        return { success: false, error: `Record already exists: ${envelope.recordId}` };
      }
      records.set(envelope.recordId, envelope);
      return { success: true, envelope };
    }),
    update: vi.fn(async ({ envelope }: { envelope: MockEnvelope }) => {
      records.set(envelope.recordId, envelope);
      return { success: true, envelope };
    }),
    list: vi.fn(async () => [...records.values()]),
  };
  return { store: store as unknown as RecordStoreImpl, records };
}

const compileStub = async (): Promise<RunChatbotCompileResult> => ({
  outcome: 'complete',
  events: [{ eventId: 'evt-add-1', event_type: 'add_material', details: { material: 'Binding Buffer', volume: '100 ul' } }],
  labwareAdditions: [{ recordId: 'lbw-def-generic-96-well-plate', reason: 'compiled from vendor protocol', deckSlot: 'B2' }],
  unresolvedRefs: [],
  diagnostics: [],
  terminalArtifacts: { events: [], directives: [], gaps: [] },
  passOutputs: {},
}) as RunChatbotCompileResult;

const FIXED_NOW = '2026-09-18T00:00:00.000Z';

async function withWorkspace<T>(fn: (workspaceRoot: string) => Promise<T>): Promise<T> {
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'protocol-intake-'));
  try {
    return await fn(workspaceRoot);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
}

describe('ProtocolIntakeService.ingestDocument', () => {
  it('writes one validated decision tree + validated proposals per branch x scale', async () => {
    await withWorkspace(async (workspaceRoot) => {
      const { store, records } = makeMockStore();
      const service = new ProtocolIntakeService({
        workspaceRoot,
        store,
        validator,
        compileRunner: compileStub,
        scaleOptions: [
          { level: 'manual_tubes', profileId: 'execution-scale-profile/manual-tubes' },
          { level: 'bench_plate_multichannel' },
          { level: 'robot_deck', profileId: 'execution-scale-profile/robot-opentrons-ot2-96' },
        ],
      });

      const result = await service.ingestDocument({
        text: BRANCHY_PROTOCOL,
        fileName: 'example.txt',
        documentId: 'example-dna',
        vendor: 'Example Vendor',
        now: FIXED_NOW,
      });

      // 1 branchy step -> 2 bindings; x3 scale levels = 6 proposals.
      expect(result.treeRecordId).toBe('PDT-example-dna');
      expect(result.proposalRecordIds).toHaveLength(6);
      expect(result.eventGraphRecordIds).toHaveLength(6);

      const tree = records.get('PDT-example-dna');
      expect(tree).toBeDefined();
      expect(validator.validate(tree!.payload, PROTOCOL_DECISION_TREE_SCHEMA_ID).valid).toBe(true);

      const axes = (tree!.payload.axes as Array<Record<string, unknown>>);
      expect(axes).toHaveLength(1);
      expect(String(axes[0]!.question)).toContain('bacterial DNA');
      expect(axes[0]!.origin).toBe('document_branch');

      // Every proposal validates AND carries its full decision trail.
      let checked = 0;
      for (const envelope of records.values()) {
        if (envelope.payload['kind'] !== 'subgraph-proposal') continue;
        const check = validator.validate(envelope.payload, SUBGRAPH_PROPOSAL_SCHEMA_ID);
        expect(check.errors ?? []).toEqual([]);
        expect(envelope.payload['state']).toBe('proposed');
        expect(envelope.payload['revision']).toBe(1);
        expect(String(envelope.payload['notes'])).toContain('Resolved branch decisions');
        expect(String(envelope.payload['notes'])).toContain('Execution scale:');
        checked += 1;
      }
      expect(checked).toBe(6);

      // Compile ran (compileRunner provided) and status landed on proposals.
      const anyProposal = [...records.values()].find((e) => e.payload['kind'] === 'subgraph-proposal');
      expect(anyProposal!.payload['compileStatus']).toBe('complete');

      // Intake report artifact exists.
      expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    });
  });

  it('is idempotent: a second ingest reuses the tree and skips existing proposals', async () => {
    await withWorkspace(async (workspaceRoot) => {
      const { store } = makeMockStore();
      const service = new ProtocolIntakeService({
        workspaceRoot,
        store,
        validator,
        scaleOptions: [{ level: 'manual_tubes' }],
      });
      const first = await service.ingestDocument({ text: BRANCHY_PROTOCOL, documentId: 'idem', now: FIXED_NOW });
      const second = await service.ingestDocument({ text: BRANCHY_PROTOCOL, documentId: 'idem', now: FIXED_NOW });

      expect(first.proposalRecordIds).toHaveLength(2);
      expect(second.diagnostics.some((d) => d.code === 'tree_exists')).toBe(true);
      expect(second.diagnostics.filter((d) => d.code === 'proposal_exists')).toHaveLength(2);
      expect(second.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    });
  });

  it('derives the scale axis from the execution-scale-profile registry when not pinned', async () => {
    const options = scaleOptionsFromRegistry();
    expect([...new Set(options.map((o) => o.level))].sort()).toEqual(
      ['bench_plate_multichannel', 'manual_tubes', 'robot_deck'],
    );
    // Deck profile refs come from registry records, never hardcoded.
    expect(options.every((o) => typeof o.profileId === 'string' && o.profileId.startsWith('execution-scale-profile/'))).toBe(true);
  });

  it('reports truncation honestly when maxProposals caps the product', async () => {
    await withWorkspace(async (workspaceRoot) => {
      const { store } = makeMockStore();
      const service = new ProtocolIntakeService({ workspaceRoot, store, validator, scaleOptions: [{ level: 'manual_tubes' }] });
      const result = await service.ingestDocument({
        text: BRANCHY_PROTOCOL,
        documentId: 'capped',
        maxProposals: 1,
        now: FIXED_NOW,
      });
      expect(result.proposalRecordIds).toHaveLength(1);
      expect(result.diagnostics.some((d) => d.code === 'branch_product_truncated' && d.severity === 'warning')).toBe(true);
    });
  });

  it('never fabricates a scale axis when the registry is empty', async () => {
    await withWorkspace(async (workspaceRoot) => {
      const { store } = makeMockStore();
      const service = new ProtocolIntakeService({ workspaceRoot, store, validator, scaleOptions: [] });
      const result = await service.ingestDocument({ text: BRANCHY_PROTOCOL, documentId: 'no-scales', now: FIXED_NOW });
      expect(result.proposalRecordIds).toEqual([]);
      expect(result.diagnostics.some((d) => d.code === 'scale_registry_empty' && d.severity === 'error')).toBe(true);
    });
  });
});

describe('buildDecisionBlock', () => {
  it('renders question => answer per axis plus scale and redraft instruction', async () => {
    const { deriveDecisionTree } = await import('./deriveDecisionTree.js');
    const tree = deriveDecisionTree({
      documentId: 'd',
      steps: [{ stepNumber: 1, stepId: 'step-001', branches: ['Bacterial DNA', 'Mammalian cell culture'] }],
      scaleOptions: [{ level: 'manual_tubes', profileId: 'execution-scale-profile/manual-tubes' }],
    });
    const axis = tree.axes[0]!;
    const condition = axis.conditions![0]!;
    const block = buildDecisionBlock(
      tree,
      {
        branchPath: [{ axisId: axis.axisId, conditionId: condition.id, label: condition.label }],
        choices: { branchSelection: { [axis.axisId]: 'bacterial-dna' } },
      },
      { level: 'manual_tubes', profileId: 'execution-scale-profile/manual-tubes' },
      'use a deeper well plate',
    );
    expect(block).toContain(`- ${axis.question} => Bacterial DNA (axis ${axis.axisId})`);
    expect(block).toContain('(deck profile: execution-scale-profile/manual-tubes)');
    expect(block).toContain('- Redraft instruction: use a deeper well plate');
  });
});

describe('ProtocolIntakeService.redraftProposal', () => {
  it('refuses to redraft when the tree carries no re-extractable source artifact', async () => {
    await withWorkspace(async (workspaceRoot) => {
      const { store, records } = makeMockStore();
      const service = new ProtocolIntakeService({ workspaceRoot, store, validator, scaleOptions: [{ level: 'manual_tubes' }] });
      await service.ingestDocument({ text: BRANCHY_PROTOCOL, documentId: 'rd', now: FIXED_NOW });

      const sgp = [...records.values()].find((e) => e.payload['kind'] === 'subgraph-proposal')!;
      // Simulate the prompt->needs_prompt transition.
      records.set(sgp.recordId, {
        ...sgp,
        payload: { ...sgp.payload, state: 'needs_prompt', reviewPrompt: 'reduce elution volume to 30 ul' },
      });

      const result = await service.redraftProposal({ proposalRecordId: sgp.recordId, now: FIXED_NOW });
      expect(result.proposalRecordIds).toEqual([]);
      expect(result.diagnostics.some((d) => d.code === 'candidate_source_unavailable' && d.severity === 'error')).toBe(true);
    });
  });
});
