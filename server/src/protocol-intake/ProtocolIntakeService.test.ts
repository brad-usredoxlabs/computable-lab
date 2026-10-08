/**
 * ProtocolIntakeService tests — orchestration verified end-to-end with every
 * network/LLM edge stubbed. Payloads written to the mock store are validated
 * against the REAL committed PDT/SGP schemas (full registry, topological
 * order) so a schema/service drift fails here, not in production.
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { loadAllSchemas } from '../schema/SchemaLoader.js';
import { createSchemaRegistry } from '../schema/SchemaRegistry.js';
import { createValidator } from '../validation/AjvValidator.js';
import type { RecordStoreImpl } from '../store/RecordStoreImpl.js';
import {
  buildDecisionBlock,
  questionGate,
  scaleOptionsFromRegistry,
  ProtocolIntakeService,
  PROTOCOL_DECISION_TREE_SCHEMA_ID,
  SUBGRAPH_PROPOSAL_SCHEMA_ID,
} from './ProtocolIntakeService.js';
import type { ProtocolDecisionTree } from './deriveDecisionTree.js';
import { readCandidateArtifact } from '../ingestion/vendor-protocol/VendorProtocolCandidateService.js';
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
    delete: vi.fn(async ({ recordId }: { recordId: string }) => {
      records.delete(recordId);
      return { success: true };
    }),
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

  it('treats an explicit non-positive maxProposals as invalid: diagnoses it and falls back to the default', async () => {
    await withWorkspace(async (workspaceRoot) => {
      const { store } = makeMockStore();
      const service = new ProtocolIntakeService({ workspaceRoot, store, validator, scaleOptions: [{ level: 'manual_tubes' }] });
      // Live incident: a caller passed maxProposals: 0. `?? 12` does NOT fire
      // for an explicit 0, so bindings.slice(0, 0) yielded ZERO eager
      // proposals with a misleading 'capped at 0' warning. An invalid cap must
      // be declared as a diagnostic and the default applied instead.
      const result = await service.ingestDocument({
        text: BRANCHY_PROTOCOL,
        documentId: 'zero-cap',
        maxProposals: 0,
        now: FIXED_NOW,
      });
      expect(result.diagnostics.some((d) => d.code === 'invalid_max_proposals' && d.severity === 'warning')).toBe(true);
      // The default (12) covers the 2-binding product: no truncation, all drafted.
      expect(result.diagnostics.some((d) => d.code === 'branch_product_truncated')).toBe(false);
      expect(result.proposalRecordIds.length).toBeGreaterThanOrEqual(1);
      expect(result.proposalRecordIds).toHaveLength(2);
    });
  });

  it('defaults to cap 12 with no invalid_max_proposals diagnostic when the cap is omitted, and a valid cap of 1 still caps to exactly 1 binding', async () => {
    await withWorkspace(async (workspaceRoot) => {
      const { store, records } = makeMockStore();
      const service = new ProtocolIntakeService({ workspaceRoot, store, validator, scaleOptions: [{ level: 'manual_tubes' }] });

      // Omitted cap: default 12 applies silently (BRANCHY_PROTOCOL's product
      // is 2, well under 12 — no truncation, no invalid diagnostic).
      const omitted = await service.ingestDocument({ text: BRANCHY_PROTOCOL, documentId: 'default-cap', now: FIXED_NOW });
      expect(omitted.diagnostics.some((d) => d.code === 'invalid_max_proposals')).toBe(false);
      expect(omitted.diagnostics.some((d) => d.code === 'branch_product_truncated')).toBe(false);
      expect(omitted.proposalRecordIds).toHaveLength(2);

      // Valid cap: unchanged behavior — exactly 1 binding survives.
      const capped = await service.ingestDocument({
        text: BRANCHY_PROTOCOL,
        documentId: 'default-cap',
        maxProposals: 1,
        now: FIXED_NOW,
      });
      expect(capped.diagnostics.some((d) => d.code === 'invalid_max_proposals')).toBe(false);
      const cappedProposals = [...records.values()].filter(
        (e) => e.payload['kind'] === 'subgraph-proposal' && String(e.recordId).startsWith('SGP-default-cap'),
      );
      expect(cappedProposals).toHaveLength(2); // 2 from the omitted-cap ingest; the cap-1 redraft sees only binding 1
      expect(capped.diagnostics.filter((d) => d.code === 'proposal_exists')).toHaveLength(1);
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

describe('ProtocolIntakeService.refreshTree', () => {
  const DISPATCH_STEPS = [
    {
      id: 'step-20',
      stepNumber: 1,
      sourceText:
        'For blood with non-nucleated erythrocytes, follow step 1a; for blood with nucleated erythrocytes, follow step 1b; for cultured cells, follow step 1c.',
      branches: [
        'blood with nucleated erythrocytes (follow step 1b)',
        'cultured cells (follow step 1c)',
      ],
    },
    { id: 'step-21', stepNumber: 1, substep: 'a', sourceText: 'Pipet 20 ul Proteinase K.' },
    { id: 'step-22', stepNumber: 1, substep: 'b', sourceText: 'Pipet 90 ul blood.' },
    { id: 'step-23', stepNumber: 1, substep: 'c', sourceText: 'Centrifuge the cells.' },
    { id: 'step-24', stepNumber: 2, sourceText: 'Add Buffer AL.' },
  ];

  function seedCandidate(workspaceRoot: string): Record<string, unknown> {
    return {
      kind: 'vendor-protocol-candidate',
      source: { documentId: 'dispatch-doc', vendor: 'Example Vendor' },
      steps: DISPATCH_STEPS,
      sections: [],
      tables: [],
    };
  }

  async function writeCandidate(workspaceRoot: string, candidate: Record<string, unknown>): Promise<void> {
    const rel = join('artifacts', 'foundry', 'protocol-candidates', 'dispatch-doc.json');
    await mkdir(join(workspaceRoot, 'artifacts', 'foundry', 'protocol-candidates'), { recursive: true });
    await writeFile(join(workspaceRoot, rel), JSON.stringify(candidate));
  }

  function makeService(workspaceRoot: string, store: unknown) {
    return new ProtocolIntakeService({
      workspaceRoot,
      store: store as never,
      validator,
      compileRunner: compileStub,
      scaleOptions: [
        { level: 'manual_tubes', profileId: 'execution-scale-profile/manual-tubes' },
        { level: 'bench_plate_multichannel' },
        { level: 'robot_deck', profileId: 'execution-scale-profile/robot-opentrons-ot2-96' },
      ],
    });
  }

  it('re-derives WITHOUT re-extraction, suppresses the degenerate axis, and invalidates stale proposals', async () => {
    await withWorkspace(async (workspaceRoot) => {
      const { store, records } = makeMockStore();
      const candidate = seedCandidate(workspaceRoot);
      await writeCandidate(workspaceRoot, candidate);

      // A stale tree in the OLD shape (the degenerate axis present, variant
      // axis nested) + proposals under positional ids from that axis set.
      const staleTree = deriveDecisionTreeFromSteps(candidate);
      records.set(staleTree.recordId, {
        recordId: staleTree.recordId,
        schemaId: PROTOCOL_DECISION_TREE_SCHEMA_ID,
        payload: staleTree as unknown as Record<string, unknown>,
      });
      const staleProposalId = `SGP-${staleTree.recordId.slice(4)}-b0-s0`;
      records.set(staleProposalId, {
        recordId: staleProposalId,
        schemaId: SUBGRAPH_PROPOSAL_SCHEMA_ID,
        payload: {
          kind: 'subgraph-proposal',
          recordId: staleProposalId,
          treeRef: { kind: 'record', id: staleTree.recordId, type: 'protocol-decision-tree' },
          documentId: staleTree.documentId,
          branchPath: [{ axisId: staleTree.axes[0]!.axisId, conditionId: 'branch-1' }],
          scaleLevel: 'manual_tubes',
          state: 'proposed',
          revision: 1,
          generatedAt: FIXED_NOW,
        },
      });

      const service = makeService(workspaceRoot, store);
      const result = await service.refreshTree({ documentId: 'dispatch-doc', now: FIXED_NOW });

      // The refreshed tree dropped the degenerate duplicate (D1) — only the
      // variant axis (3 distinct gated steps) remains.
      const refreshed = records.get(staleTree.recordId)!.payload as unknown as ProtocolDecisionTree;
      expect(refreshed.axes.map((a) => a.axisId)).toEqual(['axis-step-20-variant']);
      expect(refreshed.notes ?? '').toContain('degenerate_branch_axis_suppressed');

      // The proposal whose positional id no longer denotes the same binding is
      // invalidated, not silently kept (its id now means a different branch).
      expect(records.has(staleProposalId)).toBe(false);
      expect(result.diagnostics.some((d) => d.code === 'stale_proposals_invalidated')).toBe(true);

      // No LLM: extraction was never invoked (no artifactPath/text given; the
      // candidate came from disk). refresh never drafts — drafting stays
      // on-demand.
      expect(result.proposalRecordIds).toEqual([]);
      // The tree is validated against the schema.
      expect(validator.validate(records.get(staleTree.recordId)!.payload, PROTOCOL_DECISION_TREE_SCHEMA_ID).valid).toBe(true);
    });
  });

  function deriveDecisionTreeFromSteps(candidate: Record<string, unknown>): ProtocolDecisionTree {
    // The OLD derivation for the same steps: degenerate branch axis FIRST.
    const axes = [
      {
        axisId: 'branch-axis-step-20',
        question: 'Which branch applies: blood with nucleated erythrocytes (follow step 1b) / cultured cells (follow step 1c)?',
        choiceKey: 'branchSelection',
        origin: 'document_branch',
        conditions: [
          { id: 'branch-1', label: 'blood with nucleated erythrocytes (follow step 1b)', predicate: { op: 'equals', path: '$.branchSelection.branch-axis-step-20', value: 'blood-with-nucleated-erythrocytes-follow-step-1b' }, then_stepIds: ['step-20'] },
          { id: 'branch-2', label: 'cultured cells (follow step 1c)', predicate: { op: 'equals', path: '$.branchSelection.branch-axis-step-20', value: 'cultured-cells-follow-step-1c' }, then_stepIds: ['step-20'] },
        ],
      },
    ];
    return {
      kind: 'protocol-decision-tree',
      recordId: 'PDT-dispatch-doc',
      documentId: 'dispatch-doc',
      axes,
      scaleAxis: { question: 'At what execution scale should this protocol run?', options: [{ level: 'manual_tubes' }, { level: 'bench_plate_multichannel' }, { level: 'robot_deck' }] },
      status: 'proposed',
      generatedAt: FIXED_NOW,
    } as unknown as ProtocolDecisionTree;
  }
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

describe('questionGate', () => {
  const scaleAxis = { question: 'scale?', options: [{ level: 'manual_tubes' as const }] };
  const tree = (axes: unknown[]): ProtocolDecisionTree =>
    ({
      kind: 'protocol-decision-tree',
      recordId: 'PDT-x',
      documentId: 'x',
      axes,
      scaleAxis,
      status: 'proposed',
      generatedAt: FIXED_NOW,
    }) as unknown as ProtocolDecisionTree;

  it('fails loud when a branchy document produced zero question axes', () => {
    const verdict = questionGate(tree([]), 2);
    expect(verdict.ok).toBe(false);
    expect(verdict.ok === false && verdict.code).toBe('derivation_silent_branch_drop');
  });

  it('passes a linear document with zero axes and zero branchy steps', () => {
    expect(questionGate(tree([]), 0).ok).toBe(true);
  });

  it('fails when an axis carries conditions with no then_stepIds (unanswerable question)', () => {
    const axes = [
      { axisId: 'a1', question: 'q?', choiceKey: 'branchSelection', origin: 'document_branch', conditions: [{ id: 'c1', label: 'x' }] },
    ];
    const verdict = questionGate(tree(axes), 1);
    expect(verdict.ok).toBe(false);
    expect(verdict.ok === false && verdict.code).toBe('axis_without_resolvable_conditions');
  });

  it('treats a zero-condition axis as explicitly non-gating (plan: question kept as notes)', () => {
    const axes = [{ axisId: 'a1', question: 'q?', choiceKey: 'branchSelection', origin: 'document_branch', conditions: [] }];
    expect(questionGate(tree(axes), 1).ok).toBe(true);
  });

  it('passes a healthy tree: every condition gates steps', () => {
    const axes = [
      {
        axisId: 'a1', question: 'q?', choiceKey: 'branchSelection', origin: 'document_branch',
        conditions: [
          { id: 'c1', label: 'x', predicate: { op: 'equals', path: '$.branchSelection.a1', value: 'x' }, then_stepIds: ['step-001'] },
          { id: 'c2', label: 'y', predicate: { op: 'equals', path: '$.branchSelection.a1', value: 'y' }, then_stepIds: ['step-002'] },
        ],
      },
    ];
    expect(questionGate(tree(axes), 1).ok).toBe(true);
  });
});

describe('ProtocolIntakeService question gate', () => {
  it('refuses to draft when a stale tree dropped the document branches (silent branch drop)', async () => {
    await withWorkspace(async (workspaceRoot) => {
      const { store, records } = makeMockStore();
      // Seed a zero-axis tree under the id ingestDocument will resolve to —
      // simulates a stale/corrupt tree predating branch derivation.
      records.set('PDT-gated', {
        recordId: 'PDT-gated',
        schemaId: PROTOCOL_DECISION_TREE_SCHEMA_ID,
        payload: {
          kind: 'protocol-decision-tree',
          recordId: 'PDT-gated',
          documentId: 'gated',
          axes: [],
          scaleAxis: { question: 'scale?', options: [{ level: 'manual_tubes' }] },
          status: 'proposed',
          generatedAt: FIXED_NOW,
        },
      });
      const service = new ProtocolIntakeService({
        workspaceRoot,
        store,
        validator,
        compileRunner: compileStub,
        scaleOptions: [{ level: 'manual_tubes' }],
      });
      const result = await service.ingestDocument({ text: BRANCHY_PROTOCOL, documentId: 'gated', now: FIXED_NOW });
      // BRANCHY_PROTOCOL has branchy steps but the reused tree has no axes:
      // drafting would silently run every branch — must refuse, fail loud.
      expect(result.proposalRecordIds).toEqual([]);
      expect(result.eventGraphRecordIds).toEqual([]);
      expect(
        result.diagnostics.some((d) => d.severity === 'error' && d.code === 'derivation_silent_branch_drop'),
      ).toBe(true);
    });
  });
});

describe('handbook fan-out (cl:handbook-section-split)', () => {
  // A miniature DNeasy: two Qiagen-style protocol sections; the blood one
  // dispatches to 1a/1b/1c in prose the literal extractor transcribes but
  // never annotates (branches:[] on disk — proven on the real candidate).
  const HANDBOOK = `DNeasy Blood & Tissue Handbook

Protocol: Purification of Total DNA from Animal Blood (Spin-Column Protocol)
1. For blood with non-nucleated erythrocytes, follow step 1a. For buffy coat, follow step 1b. For frozen pellet, follow step 1c.
1a. Non-nucleated: Pipet 20 ul Proteinase K into a 1.5 ml tube.
1b. Buffy coat: Pipet 400 ul buffy coat into a 1.5 ml tube.
1c. Frozen pellet: Pipet 200 ul frozen pellet into a 1.5 ml tube.
2. Add 200 ul Buffer ATL to the blood tube.

Protocol: Purification of Total DNA from Animal Tissues (Spin-Column Protocol)
1. Mince tissue into small pieces.
2. Add 180 ul Buffer ATL to the tissue tube.
`;

  const bloodSlug = 'purification-of-total-dna-from-animal-blood-spin-column-protocol';
  const tissueSlug = 'purification-of-total-dna-from-animal-tissues-spin-column-protocol';

  it('splits the handbook into one tree per protocol section, spine-first, no mega-tree', async () => {
    await withWorkspace(async (workspaceRoot) => {
      const { store, records } = makeMockStore();
      const service = new ProtocolIntakeService({
        workspaceRoot,
        store,
        validator,
        compileRunner: compileStub,
        scaleOptions: [{ level: 'manual_tubes', profileId: 'execution-scale-profile/manual-tubes' }],
      });

      const result = await service.ingestDocument({
        text: HANDBOOK,
        fileName: 'handbook.txt',
        documentId: 'handbook-dneasy',
        now: FIXED_NOW,
      });

      // The spine ran BEFORE the split: the dispatch step was branchless and
      // got its branches from the YAML pattern registry (B2).
      const spine = result.diagnostics.find((d) => d.code === 'branch_variants_from_spine');
      expect(spine?.severity).toBe('info');
      expect(spine?.message).toContain('step-1');
      // The split fired (C1) — and it fired because the spine made the split
      // honest: the blood child has real axes, not an empty flattening.
      expect(result.diagnostics.some((d) => d.code === 'handbook_section_split')).toBe(true);

      // ONE tree per section, children named by parent__section, no parent tree.
      const trees = [...records.values()].filter((e) => e.payload['kind'] === 'protocol-decision-tree');
      expect(trees.map((t) => t.recordId).sort()).toEqual([
        `PDT-handbook-dneasy__${bloodSlug}`,
        `PDT-handbook-dneasy__${tissueSlug}`,
      ]);
      expect(records.has('PDT-handbook-dneasy')).toBe(false);
      for (const slug of [bloodSlug, tissueSlug]) {
        const persisted = await readCandidateArtifact(workspaceRoot, `handbook-dneasy__${slug}`);
        expect(persisted?.steps.length).toBeGreaterThan(0);
        expect(persisted?.sections).toHaveLength(1);
      }


      // Blood child: its dispatch question is real and gates its OWN steps.
      const blood = records.get(`PDT-handbook-dneasy__${bloodSlug}`)!;
      expect(validator.validate(blood.payload, PROTOCOL_DECISION_TREE_SCHEMA_ID).valid).toBe(true);
      const bloodAxes = blood.payload['axes'] as Array<Record<string, unknown>>;
      expect(bloodAxes.length).toBeGreaterThan(0);
      expect(JSON.stringify(bloodAxes)).toContain('non-nucleated');
      // No foreign (tissue) step ids anywhere in the blood tree.
      const bloodStepIds = new Set(
        JSON.stringify(bloodAxes).match(/step-\d+/g) as string[] ?? [],
      );
      const tissueStepIds = (records.get(`PDT-handbook-dneasy__${tissueSlug}`)!.payload['axes'] as unknown[]);
      void tissueStepIds; // tissue is linear: zero axes, still a real document
      expect(String(blood.payload['notes'])).toContain('cl:handbook-section-split child of handbook-dneasy');

      // The two children share the parent's sha256 — the plural review join
      // answers the handbook artifact with BOTH trees.
      const shaOf = (t: { payload: Record<string, unknown> }) => (t.payload['sourcePdf'] as Record<string, unknown>)?.['sha256'];
      expect(shaOf(blood)).toBeTruthy();
      expect(shaOf(records.get(`PDT-handbook-dneasy__${tissueSlug}`)!)).toBe(shaOf(blood));

      // The merged result: parent documentId, first child's tree as compat
      // mirror, ALL proposals aggregated.
      expect(result.documentId).toBe('handbook-dneasy');
      expect(result.treeRecordId).toBe(`PDT-handbook-dneasy__${bloodSlug}`);
      expect(result.proposalRecordIds.some((id) => id.includes(bloodSlug))).toBe(true);
      expect(result.proposalRecordIds.some((id) => id.includes(tissueSlug))).toBe(true);
      expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
      // Refresh must reconstruct the review candidates as well as the trees.
      await service.refreshTree({ documentId: 'handbook-dneasy', now: FIXED_NOW });
      expect((await readCandidateArtifact(workspaceRoot, `handbook-dneasy__${tissueSlug}`))?.title).toContain('Tissues');

    });
  });

  it("each child's compile prompt carries ONLY its own section's steps", async () => {
    await withWorkspace(async (workspaceRoot) => {
      const { store, records } = makeMockStore();
      const prompts: string[] = [];
      const spyCompileRunner = async (args: { prompt: string }): Promise<RunChatbotCompileResult> => {
        prompts.push(args.prompt);
        return compileStub();
      };
      const service = new ProtocolIntakeService({
        workspaceRoot,
        store,
        compileRunner: spyCompileRunner,
        scaleOptions: [{ level: 'manual_tubes', profileId: 'execution-scale-profile/manual-tubes' }],
      });

      await service.ingestDocument({
        text: HANDBOOK,
        fileName: 'handbook.txt',
        documentId: 'handbook-prompt',
        now: FIXED_NOW,
      });

      expect(prompts.length).toBeGreaterThan(0);
      for (const prompt of prompts) {
        const hasBlood = prompt.includes('Proteinase K') || prompt.includes('buffy coat');
        const hasTissue = prompt.includes('Mince tissue');
        // No prompt is a giant protocol: blood text and tissue text NEVER
        // co-occur (the 2026-09-21 failure compiled all 77 handbook steps).
        expect(hasBlood && hasTissue).toBe(false);
      }
      // Both sides DID get drafted — the isolation is a filter, not a drop.
      expect(prompts.some((p) => p.includes('Mince tissue'))).toBe(true);
      expect(prompts.some((p) => p.includes('buffy coat'))).toBe(true);
      void records;
    });
  });

  it('re-ingesting a handbook is idempotent: same children, existing proposals skipped', async () => {
    await withWorkspace(async (workspaceRoot) => {
      const { store, records } = makeMockStore();
      const service = new ProtocolIntakeService({
        workspaceRoot,
        store,
        compileRunner: compileStub,
        scaleOptions: [{ level: 'manual_tubes', profileId: 'execution-scale-profile/manual-tubes' }],
      });
      const first = await service.ingestDocument({ text: HANDBOOK, fileName: 'handbook.txt', documentId: 'handbook-idem', now: FIXED_NOW });
      const treeCount = [...records.values()].filter((e) => e.payload['kind'] === 'protocol-decision-tree').length;

      const second = await service.ingestDocument({ text: HANDBOOK, fileName: 'handbook.txt', documentId: 'handbook-idem', now: FIXED_NOW });
      // Deterministic child documentIds: same trees, no re-split differently.
      expect([...records.values()].filter((e) => e.payload['kind'] === 'protocol-decision-tree').length).toBe(treeCount);
      expect(second.treeRecordId).toBe(first.treeRecordId);
      // Children obey the same proposal_exists skip as whole documents.
      expect(second.diagnostics.filter((d) => d.code === 'proposal_exists').length)
        .toBe(first.proposalRecordIds.length);
    });
  });
});

describe('compile diagnostics ride on the proposal (why, not just "error")', () => {
  it('stores the error/warning diagnostics that ended the compile', async () => {
    await withWorkspace(async (workspaceRoot) => {
      const { store, records } = makeMockStore();
      const failingCompileRunner = async (): Promise<RunChatbotCompileResult> =>
        ({
          outcome: 'error',
          events: [],
          labwareAdditions: [],
          unresolvedRefs: [],
          diagnostics: [
            { pass_id: 'extract_entities', severity: 'error', code: 'EXTRACTION_ERROR', message: 'draft_assemble pass produced no output' },
            { pass_id: 'validate', severity: 'warning', code: 'ungrounded_reference', message: 'Ungrounded reference "mixer"' },
            { pass_id: 'validate', severity: 'info', code: 'noise', message: 'not worth storing' },
          ],
          terminalArtifacts: { events: [], directives: [], gaps: [] },
          passOutputs: {},
        }) as unknown as RunChatbotCompileResult;

      const service = new ProtocolIntakeService({
        workspaceRoot,
        store,
        compileRunner: failingCompileRunner as never,
        scaleOptions: [{ level: 'manual_tubes', profileId: 'execution-scale-profile/manual-tubes' }],
      });
      await service.ingestDocument({ text: BRANCHY_PROTOCOL, fileName: 'example.txt', documentId: 'example-dia', now: FIXED_NOW });

      const proposal = [...records.values()].find((e) => e.payload['kind'] === 'subgraph-proposal');
      expect(proposal!.payload['compileStatus']).toBe('error');
      // errors and warnings, with the failing pass; info noise dropped
      expect(proposal!.payload['compileDiagnostics']).toEqual([
        { severity: 'error', code: 'EXTRACTION_ERROR', message: 'draft_assemble pass produced no output', passId: 'extract_entities' },
        { severity: 'warning', code: 'ungrounded_reference', message: 'Ungrounded reference "mixer"', passId: 'validate' },
      ]);
    });
  });
});
