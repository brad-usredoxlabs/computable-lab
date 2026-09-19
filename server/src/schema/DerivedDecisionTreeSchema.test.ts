/**
 * Every derived axis must satisfy the schema Ajv enforces on the stored tree.
 *
 * The hand-written fixtures in IntakeSchemas.test.ts pin the schema; these
 * tests run the DERIVERS and validate what they produce, because a deriver and
 * a schema can disagree silently. `datatypes/condition.schema.yaml` closes
 * BranchCondition (`additionalProperties: false`) around the key
 * `then_stepIds`, so a condition emitted under any other spelling — or without
 * a step list — is rejected by Ajv with "Unknown property" plus "Missing
 * required property". Hand-written fixtures cannot catch that difference
 * between a deriver and the schema; only the derivers can.
 *
 * The DNeasy Blood & Tissue handbook is the fixture: eight protocols (blood or
 * cells / tissues × spin column / DNeasy 96, plus pretreatments), each with its
 * own steps, and a first protocol whose step 1 dispatches to variants 1a/1b/1c.
 */

import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { loadSchemasFromContent } from './SchemaLoader.js';
import { createValidator } from '../validation/AjvValidator.js';
import { deriveDecisionTree } from '../protocol-intake/deriveDecisionTree.js';

const SCHEMA_PATHS = [
  'core/datatypes/ref.schema.yaml',
  'core/datatypes/condition.schema.yaml',
  'workflow/protocol-decision-tree.schema.yaml',
  'workflow/subgraph-proposal.schema.yaml',
] as const;

const TREE_SCHEMA = 'https://computable-lab.com/schema/computable-lab/workflow/protocol-decision-tree.schema.yaml';

async function intakeValidator() {
  const schemaRoot = join(process.cwd(), 'schema');
  const contents = new Map<string, string>();
  for (const path of SCHEMA_PATHS) {
    contents.set(path, await readFile(join(schemaRoot, path), 'utf8'));
  }
  const result = await loadSchemasFromContent(contents);
  const validator = createValidator({ strict: false });
  for (const entry of result.entries) validator.addSchema(entry.schema, entry.id);
  return validator;
}

const SPIN_COLUMN = 'section-purification-of-total-dna-from-animal-blood-or-cells-spin-column-protocol';
const TISSUES_96 = 'section-purification-of-total-dna-from-animal-tissues-dneasy-96-protocol';

const PROTOCOL_SECTIONS = [
  {
    id: SPIN_COLUMN,
    kind: 'protocol',
    title: 'Purification of Total DNA from Animal Blood or Cells (Spin-Column Protocol)',
  },
  {
    id: 'section-purification-of-total-dna-from-animal-tissues-spin-column-protocol',
    kind: 'protocol',
    title: 'Purification of Total DNA from Animal Tissues (Spin-Column Protocol)',
  },
  {
    id: TISSUES_96,
    kind: 'protocol',
    title: 'Purification of Total DNA from Animal Tissues (DNeasy 96 Protocol)',
  },
];

/** The handbook's own step list, trimmed to what the derivers read. */
const STEPS = [
  {
    id: 'step-1',
    stepNumber: 1,
    sectionId: SPIN_COLUMN,
    sourceText:
      'For blood with non-nucleated erythrocytes, follow step 1a; for blood with nucleated erythrocytes, follow step 1b; for cultured cells, follow step 1c.',
  },
  { id: 'step-2', stepNumber: 1, substep: 'a', sectionId: SPIN_COLUMN, sourceText: 'Non-nucleated: Pipet 20 µl Proteinase K into a tube.' },
  { id: 'step-3', stepNumber: 1, substep: 'b', sectionId: SPIN_COLUMN, sourceText: 'Nucleated: Pipet 20 µl Proteinase K and add blood.' },
  { id: 'step-4', stepNumber: 1, substep: 'c', sectionId: SPIN_COLUMN, sourceText: 'Cultured cells: Centrifuge the cells.' },
  {
    id: 'step-5',
    stepNumber: 1,
    sectionId: 'section-purification-of-total-dna-from-animal-tissues-spin-column-protocol',
    sourceText: 'Cut up to 25 mg tissue and add 180 µl Buffer ATL.',
  },
  {
    id: 'step-6',
    stepNumber: 1,
    sectionId: TISSUES_96,
    sourceText: 'Add sample to the DNeasy 96 plate using the table below: for the maximum input.',
  },
];

const SAMPLE_TABLE = {
  id: 'table-sample-type',
  title: 'Sample type maximum input',
  headers: ['Sample type', 'Maximum input'],
  rows: [
    ['Feces', '200 mg'],
    ['Soil', '250 mg'],
  ],
  sourceText: 'Sample type maximum input',
};

describe('the derived tree satisfies the tree schema', () => {
  it('validates a tree derived from a handbook with several protocols', async () => {
    const validator = await intakeValidator();
    const tree = deriveDecisionTree({
      documentId: 'vendor-protocol-dneasy-blood-and-tissue',
      steps: STEPS,
      tables: [SAMPLE_TABLE],
      protocolSections: PROTOCOL_SECTIONS,
      scaleOptions: [{ level: 'manual_tubes' }, { level: 'bench_plate_multichannel' }],
      now: '2026-09-19T00:00:00.000Z',
    });

    expect(tree.axes.map((axis) => axis.axisId)).toContain('axis-protocol-choice');
    // The dispatch sentence in step 1 is the document's own if/then logic.
    expect(tree.axes.map((axis) => axis.axisId)).toContain('axis-step-1-variant');
    const out = validator.validate(tree, TREE_SCHEMA);
    expect(out.errors ?? []).toEqual([]);
    expect(out.valid).toBe(true);
  });

  it('gives the protocol choice one condition per protocol, each naming its steps', async () => {
    const tree = deriveDecisionTree({
      documentId: 'vendor-protocol-dneasy-blood-and-tissue',
      steps: STEPS,
      tables: [],
      protocolSections: PROTOCOL_SECTIONS,
      scaleOptions: [{ level: 'manual_tubes' }],
      now: '2026-09-19T00:00:00.000Z',
    });
    const choice = tree.axes.find((axis) => axis.axisId === 'axis-protocol-choice');

    expect(choice?.origin).toBe('document_section');
    expect(choice?.question).toBe('Which protocol applies?');
    expect(choice?.conditions.map((condition) => condition.label)).toEqual(
      PROTOCOL_SECTIONS.map((section) => section.title),
    );
    expect(choice?.conditions[0]?.then_stepIds).toEqual(['step-1', 'step-2', 'step-3', 'step-4']);
    expect(choice?.conditions[1]?.then_stepIds).toEqual(['step-5']);
    expect(choice?.conditions[2]?.then_stepIds).toEqual(['step-6']);
  });

  it('records a refusal instead of inventing a protocol axis when steps are unattributed', () => {
    const tree = deriveDecisionTree({
      documentId: 'vendor-protocol-unknown',
      steps: STEPS.map(({ sectionId, ...rest }) => {
        void sectionId;
        return rest;
      }),
      protocolSections: PROTOCOL_SECTIONS,
      scaleOptions: [{ level: 'manual_tubes' }],
      now: '2026-09-19T00:00:00.000Z',
    });

    expect(tree.axes.some((axis) => axis.axisId === 'axis-protocol-choice')).toBe(false);
    expect(tree.notes).toContain('protocol_choice_axis_not_derived: steps_not_attributed');
  });
});
