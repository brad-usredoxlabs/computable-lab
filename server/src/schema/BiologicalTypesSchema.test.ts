/**
 * Biological Types & Culture Systems — schema contracts.
 *
 * Phase A + C + E additive schema surface, verified at the load/registry level
 * (cross-schema $ref resolution is a known test limitation; we assert on the
 * loaded schema structure, matching the repo's schema-test convention):
 *   A2  — concentration datatype gains microbial/organism count units.
 *   D2  — term schema gains strain_of / strain (species→strain organism spine).
 *   E1  — add-material detail schema carries biological_type / strain_ref /
 *         count_estimate / condition_refs / counter_density.
 *   D2  — material-instance.biological_state gains strain_ref / conditions.
 */
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { loadSchemasFromContent } from './SchemaLoader.js';
import { createSchemaRegistry } from './SchemaRegistry.js';
import { createValidator } from '../validation/AjvValidator.js';
import { readFile } from 'node:fs/promises';

const SCHEMA_PATHS = [
  'core/common.schema.yaml',
  'core/datatypes/ref.schema.yaml',
  'core/datatypes/concentration.schema.yaml',
  'core/datatypes/amount.schema.yaml',
  'core/datatypes/composition-entry.schema.yaml',
  'core/term.schema.yaml',
  'core/record.schema.yaml',
  'workflow/events/plate-event.add-material.schema.yaml',
  'workflow/events/plate-event.read.schema.yaml',
  'workflow/event-graph.schema.yaml',
  'lab/material-instance.schema.yaml',
  'lab/material-derivation.schema.yaml',
] as const;

async function loadBioschemas() {
  const schemaRoot = join(process.cwd(), 'schema');
  const contents = new Map<string, string>();
  for (const path of SCHEMA_PATHS) {
    contents.set(path, await readFile(join(schemaRoot, path), 'utf8'));
  }
  return loadSchemasFromContent(contents);
}

function propsOf(id: string, schema: Record<string, unknown>): Record<string, unknown> {
  return (schema.properties ?? {}) as Record<string, unknown>;
}

describe('biological types & culture systems — schema contracts', () => {
  it('term schema declares strain_of + strain (species→strain spine, D2)', async () => {
    const result = await loadBioschemas();
    const term = result.entries.find((e) => e.id.endsWith('/term.schema.yaml'))!;
    const props = propsOf('term', term.schema as Record<string, unknown>);
    expect(props).toHaveProperty('strain_of');
    expect(props).toHaveProperty('strain');
    const strainOf = props.strain_of as { $ref?: string };
    expect(typeof strainOf.$ref).toBe('string');
  });

  it('concentration datatype accepts microbial/organism count units (A2)', async () => {
    const result = await loadBioschemas();
    const conc = result.entries.find((e) => e.id.endsWith('/concentration.schema.yaml'))!;
    const unit = propsOf('conc', conc.schema as Record<string, unknown>).unit as { enum?: string[] };
    // additive over the existing cells/mL|uL
    expect(unit.enum).toEqual(expect.arrayContaining(['CFU/mL', 'CFU/uL', 'organisms/mL', 'worms/mL', 'worms/uL']));
    expect(unit.enum).toEqual(expect.arrayContaining(['cells/mL', 'cells/uL'])); // unchanged baseline
  });

  it('add-material detail schema carries biological_type/count_estimate/condition_refs (C/E)', async () => {
    const result = await loadBioschemas();
    const add = result.entries.find((e) => e.id.endsWith('/plate-event.add-material.schema.yaml'))!;
    const props = propsOf('add-material', add.schema as Record<string, unknown>);
    expect(props).toHaveProperty('biological_type');
    expect(props).toHaveProperty('strain_ref');
    expect(props).toHaveProperty('count_estimate');
    expect(props).toHaveProperty('condition_refs');
    expect(props).toHaveProperty('counter_density');

    const countEst = props.count_estimate as { properties?: Record<string, unknown> };
    const ceProps = countEst.properties ?? {};
    expect(ceProps.measuredBy).toBeDefined();
    expect((ceProps.measuredBy as { enum?: string[] }).enum).toEqual(
      expect.arrayContaining(['cell_counter', 'hemocytometer', 'od600', 'total_protein', 'hoechst_nuclei', 'manual']),
    );
    expect(ceProps.isEstimate).toBeDefined();
    expect(ceProps.tolerancePct).toBeDefined();

    const condRefs = props.condition_refs as { items?: Record<string, unknown> };
    expect(condRefs.items).toHaveProperty('$ref');
  });

  it('material-instance.biological_state gains strain_ref + conditions (D2/E)', async () => {
    const result = await loadBioschemas();
    const inst = result.entries.find((e) => e.id.endsWith('/material-instance.schema.yaml'))!;
    const props = propsOf('instance', inst.schema as Record<string, unknown>);
    const bioState = props.biological_state as { properties?: Record<string, unknown> };
    expect(bioState.properties).toHaveProperty('strain_ref');
    expect(bioState.properties).toHaveProperty('conditions');
  });

  it('a seeded organism strain term with strain_of validates (full Ajv subset)', async () => {
    const result = await loadBioschemas();
    const validator = createValidator({ strict: false });
    for (const entry of result.entries) validator.addSchema(entry.schema, entry.id);

    const strainTerm = {
      kind: 'organism',
      id: 'TERM-celegans-strainn2-a1b2',
      preferredLabel: 'C. elegans N2',
      aliases: ['N2', 'wild-type N2'],
      status: 'proposed',
      lifecycleId: 'lab-vocabulary-control',
      strain: 'N2',
      strain_of: { kind: 'record', id: 'TERM-celegans-4x2p', type: 'term', label: 'Caenorhabditis elegans' },
    };
    const out = validator.validate(strainTerm, 'https://computable-lab.com/schema/computable-lab/term.schema.yaml');
    expect(out.valid).toBe(true);
  });

  it('an add-material event payload with count_estimate/condition_refs validates (full Ajv subset)', async () => {
    const result = await loadBioschemas();
    const validator = createValidator({ strict: false });
    for (const entry of result.entries) validator.addSchema(entry.schema, entry.id);

    const event = {
      eventId: 'evt-seed',
      event_type: 'add_material',
      t_offset: 'PT0M',
      details: {
        wells: ['A1'],
        material_ref: { kind: 'record', id: 'MINST-000001', type: 'material-instance', label: 'HepaRG P23' },
        volume: { value: 100, unit: 'uL' },
        count: 50000,
        count_estimate: { measuredBy: 'hemocytometer', isEstimate: true, tolerancePct: 15 },
        biological_type: { kind: 'record', id: 'TERM-heparg-4abc', type: 'term', label: 'HepaRG' },
        condition_refs: [
          { kind: 'record', id: 'TERM-anoxic-1a2b', type: 'term', label: 'anoxic' },
        ],
        counter_density: { value: 2500, unit: 'cells/uL', basis: 'count_per_volume' },
      },
    };
    // Note: the add-material detail schema ROOT is the details payload (like the
    // term schema root is the term object), so validate event.details against it.
    const out = validator.validate(event.details, 'https://computable-lab.com/schema/computable-lab/workflow/events/plate-event.add-material.schema.yaml');
    expect(out.valid).toBe(true);
  });
});