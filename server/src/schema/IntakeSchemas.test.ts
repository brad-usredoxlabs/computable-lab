/**
 * IntakeSchemas — contracts for the corpus-intake record pair.
 *
 * protocol-decision-tree: the complete if/then question set of one source
 * protocol document (logical branch axes + execution-scale axis).
 * subgraph-proposal: one deterministic branch-realization (branch path ×
 * scale level) pointing at a draft event graph pending deck-editor review.
 *
 * Ajv is the single validation authority; these tests pin the shapes the
 * intake pipeline (server/src/protocol-intake/) writes.
 */
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { loadSchemasFromContent } from './SchemaLoader.js';
import { createValidator } from '../validation/AjvValidator.js';

const SCHEMA_PATHS = [
  'core/datatypes/ref.schema.yaml',
  'core/datatypes/condition.schema.yaml',
  'workflow/protocol-decision-tree.schema.yaml',
  'workflow/subgraph-proposal.schema.yaml',
] as const;

const TREE_SCHEMA = 'https://computable-lab.com/schema/computable-lab/workflow/protocol-decision-tree.schema.yaml';
const PROPOSAL_SCHEMA = 'https://computable-lab.com/schema/computable-lab/workflow/subgraph-proposal.schema.yaml';

async function loadIntakeSchemas() {
  const schemaRoot = join(process.cwd(), 'schema');
  const contents = new Map<string, string>();
  for (const path of SCHEMA_PATHS) {
    contents.set(path, await readFile(join(schemaRoot, path), 'utf8'));
  }
  return loadSchemasFromContent(contents);
}

async function intakeValidator() {
  const result = await loadIntakeSchemas();
  const validator = createValidator({ strict: false });
  for (const entry of result.entries) validator.addSchema(entry.schema, entry.id);
  return validator;
}

const minimalTree = {
  kind: 'protocol-decision-tree',
  recordId: 'PDT-TEST-1',
  documentId: 'doc-1',
  sourcePdf: { artifactPath: 'artifacts/foundry/pdfs/doc-1.pdf', sha256: 'ab12', url: 'https://example.com/doc-1.pdf', title: 'Doc 1', vendor: 'example.com' },
  axes: [
    {
      axisId: 'branch-axis-step-001',
      question: 'What is the DNA source?',
      choiceKey: 'branchSelection',
      origin: 'document_branch',
      evidence: [{ quote: 'For bacterial DNA…', page: 3, stepNumber: 1 }],
      conditions: [
        {
          id: 'branch-1',
          label: 'Bacterial DNA',
          predicate: { op: 'equals', path: '$.branchSelection.branch-axis-step-001', value: 'bacterial-dna' },
          then_stepIds: ['step-001'],
        },
      ],
    },
  ],
  scaleAxis: {
    question: 'At what execution scale should this protocol run?',
    options: [
      { level: 'manual_tubes' },
      { level: 'bench_plate_multichannel' },
      { level: 'robot_deck', profileId: 'execution-scale-profile/robot-opentrons-ot2-96' },
    ],
  },
  status: 'proposed',
  generatedAt: '2026-09-18T00:00:00.000Z',
};

const minimalProposal = {
  kind: 'subgraph-proposal',
  recordId: 'SGP-TEST-1',
  treeRef: { kind: 'record', id: 'PDT-TEST-1', type: 'protocol-decision-tree' },
  documentId: 'doc-1',
  branchPath: [{ axisId: 'branch-axis-step-001', conditionId: 'branch-1', label: 'Bacterial DNA' }],
  scaleLevel: 'manual_tubes',
  deckProfileRef: { kind: 'record', id: 'execution-scale-profile/manual-tubes', type: 'execution-scale-profile' },
  choices: { branchSelection: { 'branch-axis-step-001': 'bacterial-dna' } },
  activeStepIds: ['step-001'],
  eventGraphRef: { kind: 'record', id: 'EVG-TEST-1', type: 'event-graph' },
  compileStatus: 'not_run',
  state: 'proposed',
  revision: 1,
  generatedAt: '2026-09-18T00:00:00.000Z',
};

describe('protocol-decision-tree schema contract', () => {
  it('validates a minimal decision tree', async () => {
    const validator = await intakeValidator();
    const out = validator.validate(minimalTree, TREE_SCHEMA);
    expect(out.errors ?? []).toEqual([]);
    expect(out.valid).toBe(true);
  });

  it('rejects an unknown scale level', async () => {
    const validator = await intakeValidator();
    const bad = {
      ...minimalTree,
      scaleAxis: { question: 'Scale?', options: [{ level: 'space_station' }] },
    };
    const out = validator.validate(bad, TREE_SCHEMA);
    expect(out.valid).toBe(false);
  });

  it('carries the source manual version (kit provenance; the intake service emits it)', async () => {
    // Nightly regression: vendor manuals carry a version (e.g. '1.4.1');
    // the service copies candidate.source.version onto the tree. If the
    // schema rejects it, tree persist fails and the whole document yields
    // zero proposals (observed live on Zymo D6110/D6010/D4303).
    const validator = await intakeValidator();
    const out = validator.validate(
      { ...minimalTree, sourcePdf: { ...minimalTree.sourcePdf, version: '1.4.1' } },
      TREE_SCHEMA,
    );
    expect(out.errors ?? []).toEqual([]);
    expect(out.valid).toBe(true);
  });
it('accepts a document_table axis (Phase 3b: the kit sample table is a question)', async () => {
    const validator = await intakeValidator();
    const tableAxisTree = {
      ...minimalTree,
      axes: [
        ...minimalTree.axes,
        {
          axisId: 'axis-sample-type',
          question: 'Which Sample Type?',
          choiceKey: 'branchSelection',
          origin: 'document_table',
          evidence: [{ quote: 'Sample type maximum input | Sample Type\tMaximum Input', page: 2, stepNumber: 1 }],
          conditions: [
            {
              id: 'option-1',
              label: 'Feces',
              predicate: { op: 'equals', path: '$.branchSelection.axis-sample-type', value: 'feces' },
              then_stepIds: ['step-001'],
            },
            {
              id: 'option-2',
              label: 'Soil',
              predicate: { op: 'equals', path: '$.branchSelection.axis-sample-type', value: 'soil' },
              then_stepIds: ['step-001'],
            },
          ],
        },
      ],
    };
    const out = validator.validate(tableAxisTree, TREE_SCHEMA);
    expect(out.errors ?? []).toEqual([]);
    expect(out.valid).toBe(true);
  });

  it('rejects an axis origin that is not grounded in the document or the AI pass', async () => {
    const validator = await intakeValidator();
    const bad = {
      ...minimalTree,
      axes: [{ ...minimalTree.axes[0], axisId: 'axis-guessed', origin: 'model_guess' }],
    };
    const out = validator.validate(bad, TREE_SCHEMA);
    expect(out.valid).toBe(false);
  });
});

describe('subgraph-proposal schema contract', () => {
  it('validates a minimal proposal', async () => {
    const validator = await intakeValidator();
    const out = validator.validate(minimalProposal, PROPOSAL_SCHEMA);
    expect(out.errors ?? []).toEqual([]);
    expect(out.valid).toBe(true);
  });

  it('rejects an invalid scale level', async () => {
    const validator = await intakeValidator();
    const out = validator.validate({ ...minimalProposal, scaleLevel: 'space_station' }, PROPOSAL_SCHEMA);
    expect(out.valid).toBe(false);
  });

  it('rejects a treeRef pointing at a non-PDT record', async () => {
    const validator = await intakeValidator();
    const out = validator.validate(
      { ...minimalProposal, treeRef: { kind: 'record', id: 'XDR-1', type: 'protocol-decision-tree' } },
      PROPOSAL_SCHEMA,
    );
    expect(out.valid).toBe(false);
  });
});

describe('subgraph-proposal compile diagnostics', () => {
  it('accepts the error/warning diagnostics that explain a failed compile', async () => {
    const validator = await intakeValidator();
    const out = validator.validate(
      {
        ...minimalProposal,
        compileStatus: 'error',
        compileDiagnostics: [
          { severity: 'error', code: 'EXTRACTION_ERROR', message: 'draft_assemble pass produced no output', passId: 'extract_entities' },
          { severity: 'warning', code: 'ungrounded_reference', message: 'Ungrounded reference "mixer"' },
        ],
      },
      PROPOSAL_SCHEMA,
    );
    expect(out.errors ?? []).toEqual([]);
    expect(out.valid).toBe(true);
  });

  it('rejects a diagnostic with no message (an unexplained failure)', async () => {
    const validator = await intakeValidator();
    const out = validator.validate(
      { ...minimalProposal, compileDiagnostics: [{ severity: 'error', code: 'X' }] },
      PROPOSAL_SCHEMA,
    );
    expect(out.valid).toBe(false);
  });
});
