/**
 * The acceptance data is the answer to "do we have a concept of: this equipment
 * accepts these labwares?" — so it must (a) validate against its schemas and
 * (b) mean what the lab means. Every seed verb-definition / equipment-capability
 * record is validated here, and the semantic pins below are Brad's own statements
 * (2026-09-19), not inferred facts:
 *
 *   - a water bath takes tubes/bottles/floats — anything that fits → `open`, seat
 *     `immerse`, capacity `unbounded` (NOT "accepts nothing", which is what the old
 *     flat `acceptsLabware: []` said);
 *   - a heat block is a tube seat (`slots`) and takes no labware;
 *   - a flat orbital platform takes any combination that fits → `open`, `platform`;
 *   - the clamshell heater-shaker takes up to 4 SBS plates (normal or deepwell) and
 *     heats from top AND bottom;
 *   - the QuantStudio 5 takes a 384-well PCR plate of the Thermo design family.
 *
 * Referential integrity is pinned too: a capability must not name a verb that does
 * not exist, or a class record that does not exist.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { loadSchemasFromContent } from './SchemaLoader.js';
import { createValidator } from '../validation/AjvValidator.js';

// Resolved from THIS file so the test does not depend on the cwd vitest runs with.
const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_ROOT = resolve(__dirname, '../../../schema');
const RECORDS_ROOT = resolve(__dirname, '../../../records', 'seed');

const SCHEMA_FILES = [
  'core/common.schema.yaml',
  'core/datatypes/ref.schema.yaml',
  'workflow/verb-definition.schema.yaml',
  'workflow/equipment-capability.schema.yaml',
  'lab/equipment-class.schema.yaml',
] as const;

const SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab';

interface CapabilityConstraint {
  seat?: string;
  addressing?: string;
  capacity?: number | string;
  accepts?: Record<string, unknown>;
  heat?: { from?: string[] };
}

interface Capability {
  verbRef: { id: string };
  constraints?: CapabilityConstraint;
  notes?: string;
}

interface CapabilityRecord {
  kind: 'equipment-capability';
  id: string;
  status: string;
  equipmentClassRef: { kind: string; id: string; type?: string };
  capabilities: Capability[];
}

async function buildValidator() {
  const contents = new Map<string, string>();
  for (const path of SCHEMA_FILES) {
    contents.set(path, readFileSync(join(SCHEMA_ROOT, path), 'utf8'));
  }
  const loaded = await loadSchemasFromContent(contents);
  const validator = createValidator({ strict: false });
  for (const entry of loaded.entries) validator.addSchema(entry.schema, entry.id);
  return validator;
}

/**
 * `$schema` is a file-level pointer the record parser handles separately
 * (RecordParser), not part of the record payload — the schemas rightly reject it
 * as an unevaluated property.
 */
function withoutSchemaRef(payload: Record<string, unknown>): Record<string, unknown> {
  const { $schema: _ignored, ...rest } = payload;
  return rest;
}

function readRecords(dir: string): Array<{ file: string; payload: Record<string, unknown> }> {
  const abs = join(RECORDS_ROOT, dir);
  return readdirSync(abs)
    .filter((name) => name.endsWith('.yaml'))
    .map((name) => ({
      file: `${dir}/${name}`,
      payload: parseYaml(readFileSync(join(abs, name), 'utf8')) as Record<string, unknown>,
    }));
}

const capabilityRecords = readRecords('equipment-capability');
const verbRecords = readRecords('verb-definition');
const classRecords = [
  ...readRecords('equipment-class'),
  ...readRecords('equipment'),
];

function capability(id: string): CapabilityRecord {
  const found = capabilityRecords.find((record) => record.payload.id === id);
  if (!found) throw new Error(`no capability record ${id}`);
  return found.payload as unknown as CapabilityRecord;
}

function constraint(record: CapabilityRecord, verbId: string): CapabilityConstraint {
  const cap = record.capabilities.find((entry) => entry.verbRef.id === verbId);
  if (!cap) throw new Error(`${record.id} has no ${verbId} capability`);
  return cap.constraints ?? {};
}

describe('verb-definition seed records', () => {
  it('has records for the lab vocabulary (verbs are data, ids are VERB-)', () => {
    const ids = verbRecords.map((record) => record.payload.id);
    expect(ids).toEqual(expect.arrayContaining([
      'VERB-HEAT', 'VERB-INCUBATE', 'VERB-SHAKE', 'VERB-ROCK',
      'VERB-STIR', 'VERB-SONICATE', 'VERB-MICROWAVE', 'VERB-AUTOCLAVE',
      'VERB-READ', 'VERB-SET',
    ]));
  });

  it('every record validates against verb-definition.schema.yaml', async () => {
    const validator = await buildValidator();
    for (const record of verbRecords) {
      const result = validator.validate(withoutSchemaRef(record.payload), `${SCHEMA_ID}/verb-definition.schema.yaml`);
      expect(result.errors, record.file).toEqual([]);
    }
  });

  it('keeps `set` as the settings-change verb (the lab says "Set the heater shaker to 70C")', () => {
    const set = verbRecords.find((record) => record.payload.id === 'VERB-SET');
    expect(set?.payload.canonical).toBe('set');
    expect(String(set?.payload.notes)).toMatch(/own event|snapshot|not rewrite history/i);
  });
});

describe('equipment-capability seed records', () => {
  it('every record validates against equipment-capability.schema.yaml', async () => {
    const validator = await buildValidator();
    for (const record of capabilityRecords) {
      const result = validator.validate(withoutSchemaRef(record.payload), `${SCHEMA_ID}/equipment-capability.schema.yaml`);
      expect(result.errors, record.file).toEqual([]);
    }
  });

  it('every referenced verb and class exists (referential integrity)', () => {
    const verbIds = new Set(verbRecords.map((record) => record.payload.id));
    const classIds = new Set(classRecords.map((record) => record.payload.id));
    for (const record of capabilityRecords) {
      const payload = record.payload as unknown as CapabilityRecord;
      expect(payload.status).toBe('active');
      for (const cap of payload.capabilities) {
        expect(verbIds.has(cap.verbRef.id), `${payload.id} → ${cap.verbRef.id}`).toBe(true);
      }
      const classRef = payload.equipmentClassRef;
      if (classRef.kind === 'record') {
        expect(classIds.has(classRef.id), `${payload.id} → ${classRef.id}`).toBe(true);
      } else {
        // Generic physical kinds are CURIEs, not records (namespace ruling).
        expect(classRef.id).toMatch(/^CL:/);
      }
    }
  });

  it('a water bath accepts anything that fits — an IMMERSE seat, not "accepts nothing"', () => {
    const heat = constraint(capability('ECP-WATER-BATH'), 'VERB-HEAT');
    expect(heat.seat).toBe('immerse');
    expect(heat.capacity).toBe('unbounded');
    expect(heat.accepts).toEqual({ mode: 'open' });
    // The old flat list said `[]`, which means "accepts none" — the opposite.
    expect(heat.accepts).not.toEqual([]);
  });

  it('a heat block is a TUBE seat with addressed positions and no labware facts', () => {
    const heat = constraint(capability('ECP-HEAT-BLOCK'), 'VERB-HEAT');
    expect(heat.seat).toBe('slots');
    expect(heat.addressing).toBe('grid');
    expect(heat.accepts).toEqual({ mode: 'by_class', tube_size_class: 'any' });
    expect(heat.accepts).not.toHaveProperty('footprint');
    expect(heat.accepts).not.toHaveProperty('well_counts');
  });

  it('a flat orbital platform takes any combination that fits', () => {
    const shake = constraint(capability('ECP-ORBITAL-SHAKER'), 'VERB-SHAKE');
    expect(shake.seat).toBe('platform');
    expect(shake.capacity).toBe('unbounded');
    expect(shake.accepts).toEqual({ mode: 'open' });
  });

  it('a rocker rocks without heating (mixing family, different motion)', () => {
    const record = capability('ECP-ROCKER');
    expect(record.capabilities.map((cap) => cap.verbRef.id)).toEqual(['VERB-ROCK']);
    expect(record.capabilities.map((cap) => cap.verbRef.id)).not.toContain('VERB-HEAT');
  });

  it('the clamshell takes up to 4 SBS plates, normal or deepwell, and heats top+bottom', () => {
    const record = capability('ECP-CLAMSHELL-HEATER-SHAKER');
    const heat = constraint(record, 'VERB-HEAT');
    expect(heat.seat).toBe('bay');
    expect(heat.capacity).toBe(4);
    expect(heat.accepts).toMatchObject({
      mode: 'by_class',
      footprint: 'sbs',
      height_class: ['standard', 'deepwell'],
    });
    expect(heat.heat).toEqual({ from: ['top', 'bottom'] });
    // It both heats and shakes.
    expect(constraint(record, 'VERB-SHAKE').capacity).toBe(4);
  });

  it('the QuantStudio 5 takes a 384-well plate of the THERMO design family', () => {
    const read = constraint(capability('ECP-QUANTSTUDIO5'), 'VERB-READ');
    expect(read.seat).toBe('bay');
    expect(read.capacity).toBe(1);
    expect(read.accepts).toEqual({
      mode: 'by_class',
      well_counts: [384],
      design_family: 'CL:thermo_384_pcr_design',
    });
  });

  it('the Opentrons heater-shaker is 1:n by adapter, with no invented adapter names', () => {
    const record = capability('ECP-HEATER-SHAKER');
    expect(record.equipmentClassRef).toMatchObject({ kind: 'record', id: 'EQC-HEATER-SHAKER' });
    expect(record.capabilities.map((cap) => cap.verbRef.id).sort()).toEqual(['VERB-HEAT', 'VERB-SHAKE']);
    const notes = record.capabilities.map((cap) => cap.notes ?? '').join(' ');
    expect(notes).toMatch(/adapter|top/i);
    // No vendor part numbers were invented.
    expect(notes).not.toMatch(/\b(?:191|195)-\d{3,}\b/);
  });

  it('never asserts an acceptance that the editor cannot express', () => {
    for (const record of capabilityRecords) {
      const payload = record.payload as unknown as CapabilityRecord;
      for (const cap of payload.capabilities) {
        const accepts = cap.constraints?.accepts;
        if (!accepts) continue;
        expect(['none', 'open', 'by_class']).toContain(accepts.mode);
        // `open` must not carry class facts it would contradict.
        if (accepts.mode === 'open') {
          expect(Object.keys(accepts).filter((key) => key !== 'mode')).toEqual([]);
        }
      }
    }
  });
});
