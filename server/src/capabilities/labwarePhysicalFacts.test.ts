/**
 * labware → facts → verdict, using the REAL labware definitions. This is the
 * chain that has to hold for the data model to mean anything on the bench: a
 * vessel's definition supplies its physical facts, the equipment's capability
 * record supplies the seat, and the predicate decides.
 *
 * Note the deliberate negative: the generic 384-well PCR plate declares no design
 * family, so a QuantStudio 5 rejects it with "not recorded" rather than waving it
 * through. That is the data gap speaking, not a bug — a real Thermo plate
 * definition is what closes it.
 */
import { describe, expect, it } from 'vitest';
import { labwarePhysicalFacts } from './labwarePhysicalFacts.js';
import { EquipmentAcceptanceService } from './EquipmentAcceptanceService.js';
import { EquipmentCapabilityService } from './EquipmentCapabilityService.js';
import type { RecordEnvelope } from '../types/RecordEnvelope.js';
import type { RecordStore } from '../store/types.js';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED_ROOT = resolve(__dirname, '../../../records/seed');

function seedRecords(): RecordEnvelope[] {
  const out: RecordEnvelope[] = [];
  for (const dir of ['equipment', 'equipment-class', 'equipment-capability', 'verb-definition']) {
    for (const name of readdirSync(join(SEED_ROOT, dir))) {
      if (!name.endsWith('.yaml')) continue;
      const payload = parseYaml(readFileSync(join(SEED_ROOT, dir, name), 'utf8')) as { id: string; kind: string };
      out.push({ recordId: payload.id, schemaId: `schema://${payload.kind}`, payload, meta: { kind: payload.kind } } as RecordEnvelope);
    }
  }
  return out;
}

function createStore(records: RecordEnvelope[]): Pick<RecordStore, 'list'> {
  return {
    async list(filter) {
      return records.filter((record) => {
        if (!filter?.kind) return true;
        return (record.payload as { kind?: string }).kind === filter.kind;
      });
    },
  };
}

const acceptance = new EquipmentAcceptanceService(new EquipmentCapabilityService(createStore(seedRecords())));

describe('labwarePhysicalFacts', () => {
  it('reads footprint, height class and well count off a definition', () => {
    const facts = labwarePhysicalFacts({
      labwareId: 'deep1',
      name: '96-well deepwell plate',
      definitionId: '96-well-deepwell-plate',
      addressing: { type: 'grid', rows: 8, columns: 12 },
      physicalFootprintMm: { length: 127, width: 85 },
    });
    expect(facts).toMatchObject({
      itemKind: 'labware',
      footprint: 'sbs',
      heightClass: 'deepwell',
      wellCounts: 96,
      label: '96-well deepwell plate',
    });
  });

  it('leaves a fact ABSENT when no data carries it (a gap must not read as a fit)', () => {
    const facts = labwarePhysicalFacts({
      labwareId: 'mystery1',
      name: 'Unknown vessel',
      addressing: { type: 'grid', rows: 4, columns: 6 },
    });
    expect(facts.footprint).toBeUndefined();
    expect(facts.heightClass).toBeUndefined();
    expect(facts.designFamily).toBeUndefined();
    expect(facts.wellCounts).toBe(24);
  });

  it('reports a non-SBS vessel by its actual dimensions, not as an SBS plate', () => {
    const facts = labwarePhysicalFacts({
      labwareId: 'rack1',
      name: '220mm rack',
      definitionId: '80x2ml-tube-rack',
      addressing: { type: 'linear', linear_count: 80 },
      physicalFootprintMm: { length: 220, width: 77 },
    });
    expect(facts.footprint).toBe('220x77');
    expect(facts.wellCounts).toBe(80);
  });
});

describe('the full chain: labware → facts → verdict', () => {
  it('the clamshell takes a 96-well deepwell plate (height class from the definition)', async () => {
    const item = labwarePhysicalFacts({
      labwareId: 'deep1',
      name: '96-well deepwell plate',
      definitionId: '96-well-deepwell-plate',
      addressing: { type: 'grid', rows: 8, columns: 12 },
      physicalFootprintMm: { length: 127, width: 85 },
    });
    const result = await acceptance.evaluate({ equipmentId: 'EQP-CLAMSHELL-HEATER-SHAKER', verbId: 'VERB-HEAT', item });
    expect(result.verdict, result.reason).toBe('accepted');
    expect(result.seat).toBe('bay');
  });

  it('a vessel with no recorded height is rejected with "not recorded", not accepted', async () => {
    const item = labwarePhysicalFacts({
      labwareId: 'tall1',
      name: 'unrecorded vessel',
      addressing: { type: 'grid', rows: 8, columns: 12 },
      physicalFootprintMm: { length: 127, width: 85 },
    });
    const result = await acceptance.evaluate({ equipmentId: 'EQP-CLAMSHELL-HEATER-SHAKER', verbId: 'VERB-HEAT', item });
    expect(result.verdict).toBe('rejected');
    expect(result.reason).toMatch(/not recorded/i);
  });

  it('a tube accepts on the heat block and a plate does not', async () => {
    const tube = labwarePhysicalFacts({ labwareId: 't1', name: '1.5ml tube', labwareType: 'tube' });
    expect((await acceptance.evaluate({ equipmentId: 'EQP-HEAT-BLOCK', verbId: 'VERB-HEAT', item: tube })).verdict).toBe('accepted');
    const plate = labwarePhysicalFacts({
      labwareId: 'p1',
      name: '96-well plate',
      definitionId: '96-well-plate',
      addressing: { type: 'grid', rows: 8, columns: 12 },
      physicalFootprintMm: { length: 127, width: 85 },
    });
    const rejected = await acceptance.evaluate({ equipmentId: 'EQP-HEAT-BLOCK', verbId: 'VERB-HEAT', item: plate });
    expect(rejected.verdict).toBe('rejected');
    expect(rejected.reason).toMatch(/tubes only/i);
  });

  it('the QuantStudio 5 rejects the generic 384 plate because its DESIGN FAMILY is unrecorded', async () => {
    const item = labwarePhysicalFacts({
      labwareId: 'p384',
      name: 'Generic 384-Well PCR Plate',
      definitionId: '384-well-pcr-plate',
      addressing: { type: 'grid', rows: 16, columns: 24 },
    });
    expect(item.wellCounts).toBe(384);
    expect(item.heightClass).toBe('standard');
    const result = await acceptance.evaluate({ equipmentId: 'EQP-QUANTSTUDIO5', verbId: 'VERB-READ', item });
    expect(result.verdict).toBe('rejected');
    expect(result.reason).toMatch(/design family CL:thermo_384_pcr_design/i);
  });
});
