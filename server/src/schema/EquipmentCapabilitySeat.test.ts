/**
 * EquipmentCapabilitySeat — a capability declares WHAT it can take, by physical
 * class, plus the seat (pose) it takes it in. Brad's D2 rev 2 rulings
 * (2026-09-19): acceptance is a match on physical facts (SBS footprint, height
 * class, well counts, plate design family, tube size), never a list of
 * labware-definition ids; and equipment may have seat ADDRESSES (a heat block's
 * tube positions) which are not wells.
 *
 * These pin the schema contract so a capability record cannot be authored with an
 * unreadable acceptance (e.g. `by_class` with nothing to match on, or a seat that
 * is not one of the four poses).
 */
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { loadSchemasFromContent } from './SchemaLoader.js';
import { createSchemaRegistry } from './SchemaRegistry.js';
import { createValidator } from '../validation/AjvValidator.js';

const SCHEMA_PATHS = [
  'core/common.schema.yaml',
  'core/datatypes/ref.schema.yaml',
  'workflow/equipment-capability.schema.yaml',
  'workflow/verb-definition.schema.yaml',
] as const;

const CAPABILITY_SCHEMA = 'https://computable-lab.com/schema/computable-lab/equipment-capability.schema.yaml';

async function loadCapabilitySchemas() {
  const schemaRoot = join(process.cwd(), 'schema');
  const contents = new Map<string, string>();
  for (const path of SCHEMA_PATHS) {
    contents.set(path, await readFile(join(schemaRoot, path), 'utf8'));
  }
  const result = await loadSchemasFromContent(contents);
  const validator = createValidator({ strict: false });
  for (const entry of result.entries) validator.addSchema(entry.schema, entry.id);
  return { validator, registry: createSchemaRegistry(result.entries) };
}

function record(constraints: Record<string, unknown>): Record<string, unknown> {
  return {
    kind: 'equipment-capability',
    id: 'ECP-TEST-SEAT',
    status: 'active',
    equipmentClassRef: { kind: 'record', type: 'equipment-class', id: 'EQC-TEST' },
    capabilities: [
      {
        verbRef: { kind: 'record', type: 'verb-definition', id: 'VERB-HEAT' },
        constraints,
      },
    ],
  };
}

describe('equipment-capability acceptance constraints', () => {
  it('loads the capability schema (no $ref resolution error)', async () => {
    const { validator } = await loadCapabilitySchemas();
    expect(validator).toBeDefined();
  });

  it('accepts an open flat platform (orbital shaker: anything that fits)', async () => {
    const { validator } = await loadCapabilitySchemas();
    const out = validator.validate(
      record({ seat: 'platform', capacity: 'unbounded', accepts: { mode: 'open' } }),
      CAPABILITY_SCHEMA,
    );
    expect(out.valid).toBe(true);
  });

  it('accepts the clamshell: bay, 4 seats, SBS, standard or deepwell', async () => {
    const { validator } = await loadCapabilitySchemas();
    const out = validator.validate(
      record({
        seat: 'bay',
        capacity: 4,
        accepts: { mode: 'by_class', footprint: 'sbs', height_class: ['standard', 'deepwell'] },
        heat: { from: ['top', 'bottom'] },
      }),
      CAPABILITY_SCHEMA,
    );
    expect(out.valid).toBe(true);
  });

  it('accepts a tube-only addressed seat (heat block: slots, no labware facts)', async () => {
    const { validator } = await loadCapabilitySchemas();
    const out = validator.validate(
      record({ seat: 'slots', addressing: 'grid', accepts: { mode: 'by_class', tube_size_class: 'any' } }),
      CAPABILITY_SCHEMA,
    );
    expect(out.valid).toBe(true);
  });

  it('accepts a keyed design family (QuantStudio: only the Thermo 384 design)', async () => {
    const { validator } = await loadCapabilitySchemas();
    const out = validator.validate(
      record({
        seat: 'bay',
        capacity: 1,
        accepts: { mode: 'by_class', well_counts: [384], design_family: 'CL:thermo_384_pcr_design' },
      }),
      CAPABILITY_SCHEMA,
    );
    expect(out.valid).toBe(true);
  });

  it('rejects an unknown seat pose', async () => {
    const { validator } = await loadCapabilitySchemas();
    const out = validator.validate(record({ seat: 'in_the_water' }), CAPABILITY_SCHEMA);
    expect(out.valid).toBe(false);
  });

  it('rejects an unknown addressing scheme', async () => {
    const { validator } = await loadCapabilitySchemas();
    const out = validator.validate(record({ seat: 'slots', addressing: 'hexagonal' }), CAPABILITY_SCHEMA);
    expect(out.valid).toBe(false);
  });

  it('rejects a capacity that is neither a positive integer nor `unbounded`', async () => {
    const { validator } = await loadCapabilitySchemas();
    expect(validator.validate(record({ seat: 'bay', capacity: 0 }), CAPABILITY_SCHEMA).valid).toBe(false);
    expect(validator.validate(record({ seat: 'bay', capacity: 'four' }), CAPABILITY_SCHEMA).valid).toBe(false);
  });

  it('requires an acceptance mode, and rejects an unknown one', async () => {
    const { validator } = await loadCapabilitySchemas();
    expect(validator.validate(record({ accepts: { footprint: 'sbs' } }), CAPABILITY_SCHEMA).valid).toBe(false);
    expect(validator.validate(record({ accepts: { mode: 'listed' } }), CAPABILITY_SCHEMA).valid).toBe(false);
  });

  it('lets a machine limit sit beside the acceptance keys (vendor facts stay open)', async () => {
    const { validator } = await loadCapabilitySchemas();
    const out = validator.validate(
      // `rpmMax` is a fact about this instrument; recording it must not require a
      // schema change, while the acceptance keys beside it stay strict.
      record({ seat: 'platform', capacity: 'unbounded', accepts: { mode: 'open' }, rpmMax: 1200 }),
      CAPABILITY_SCHEMA,
    );
    expect(out.valid).toBe(true);
  });

  it('still rejects a malformed DECLARED key (openness is not laxity)', async () => {
    const { validator } = await loadCapabilitySchemas();
    expect(validator.validate(record({ seat: 5 }), CAPABILITY_SCHEMA).valid).toBe(false);
    expect(validator.validate(record({ capacity: -1 }), CAPABILITY_SCHEMA).valid).toBe(false);
    expect(validator.validate(record({ accepts: { mode: 'open', height_class: ['whopper'] } }), CAPABILITY_SCHEMA).valid).toBe(false);
  });
});
