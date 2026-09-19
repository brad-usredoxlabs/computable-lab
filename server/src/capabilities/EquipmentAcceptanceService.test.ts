/**
 * Acceptance verdicts, driven by the REAL seed data (records/seed/*) — no
 * fixtures describing acceptance, so the test fails if the authored capability
 * data stops meaning what the lab means:
 *
 *   - a water bath takes a tube or a bottle (immerse + open);
 *   - a clamshell heater-shaker takes up to 4 SBS plates, standard or deepwell;
 *   - a heat block takes tubes in its addressed positions and NOT labware;
 *   - a qPCR machine takes a 96-well plate in its bay;
 *   - a QuantStudio 5 takes a 384-well plate of the THERMO design family;
 *   - an orbital shaker shakes but cannot heat (rocker rocks, doesn't shake);
 *   - and an equipment with no capability data is `unknown` — flagged, never
 *     silently accepted.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import type { RecordEnvelope } from '../types/RecordEnvelope.js';
import type { RecordStore } from '../store/types.js';
import { EquipmentCapabilityService } from './EquipmentCapabilityService.js';
import { EquipmentAcceptanceService, type ItemPhysicalFacts } from './EquipmentAcceptanceService.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED_ROOT = resolve(__dirname, '../../../records/seed');
const SEED_DIRS = ['equipment', 'equipment-class', 'equipment-capability', 'verb-definition'] as const;

function seedRecords(): RecordEnvelope[] {
  const out: RecordEnvelope[] = [];
  for (const dir of SEED_DIRS) {
    for (const name of readdirSync(join(SEED_ROOT, dir))) {
      if (!name.endsWith('.yaml')) continue;
      const payload = parseYaml(readFileSync(join(SEED_ROOT, dir, name), 'utf8')) as {
        id: string;
        kind: string;
      };
      out.push({
        recordId: payload.id,
        schemaId: `schema://${payload.kind}`,
        payload,
        meta: { kind: payload.kind },
      } as RecordEnvelope);
    }
  }
  return out;
}

/** An extra in-memory instance, e.g. one whose class is a generic CL: kind. */
function instanceSeed(records: RecordEnvelope[], id: string, name: string, classRef: unknown): RecordEnvelope[] {
  // PREPENDED: an explicit fixture must win over a same-id seed record.
  return [
    {
      recordId: id,
      schemaId: 'schema://equipment',
      payload: { kind: 'equipment', id, name, status: 'active', equipmentClassRef: classRef },
      meta: { kind: 'equipment' },
    } as RecordEnvelope,
    ...records,
  ];
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

const baseRecords = seedRecords();
const records = [
  ...instanceSeed(
    baseRecords,
    'EQP-TEST-ROCKER',
    'Rocker',
    { kind: 'ontology', id: 'CL:rocker', namespace: 'CL' },
  ),
  ...instanceSeed(
    baseRecords,
    'EQP-QUANTSTUDIO5',
    'QuantStudio 5',
    { kind: 'record', type: 'equipment-class', id: 'EQC-QUANTSTUDIO5' },
  ),
  ...instanceSeed(baseRecords, 'EQP-MYSTERY', 'Mystery box', undefined),
];

const acceptance = new EquipmentAcceptanceService(
  new EquipmentCapabilityService(createStore(records)),
);

const SBS_STANDARD: ItemPhysicalFacts = { itemKind: 'labware', footprint: 'sbs', heightClass: 'standard', wellCounts: 96, label: '96-well plate' };
const SBS_DEEPWELL: ItemPhysicalFacts = { itemKind: 'labware', footprint: 'sbs', heightClass: 'deepwell', wellCounts: 96, label: '96-well deepwell plate' };
const TUBE_15: ItemPhysicalFacts = { itemKind: 'tube', tubeSizeClass: '1.5ml', label: '1.5ml tube' };
const BOTTLE: ItemPhysicalFacts = { itemKind: 'other', label: 'reagent bottle' };

async function verdict(equipmentId: string, verbId: string, item: ItemPhysicalFacts) {
  return acceptance.evaluate({ equipmentId, verbId, item });
}

describe('equipment acceptance (data-driven)', () => {
  it('a water bath takes a tube, a bottle, anything that fits — seat `immerse`', async () => {
    const tube = await verdict('EQP-WATER-BATH', 'VERB-HEAT', TUBE_15);
    expect(tube.verdict).toBe('accepted');
    expect(tube.seat).toBe('immerse');
    expect(tube.reason).toMatch(/open/i);
    expect((await verdict('EQP-WATER-BATH', 'VERB-HEAT', BOTTLE)).verdict).toBe('accepted');
    expect((await verdict('EQP-WATER-BATH', 'VERB-INCUBATE', TUBE_15)).verdict).toBe('accepted');
  });

  it('a water bath cannot read (it has no read capability)', async () => {
    const result = await verdict('EQP-WATER-BATH', 'VERB-READ', TUBE_15);
    expect(result.verdict).toBe('rejected');
    expect(result.reason).toMatch(/cannot read/i);
    expect(result.reason).toMatch(/heat/i);
  });

  it('the clamshell takes up to 4 SBS plates, standard or deepwell', async () => {
    expect((await verdict('EQP-CLAMSHELL-HEATER-SHAKER', 'VERB-HEAT', SBS_STANDARD)).verdict).toBe('accepted');
    expect((await verdict('EQP-CLAMSHELL-HEATER-SHAKER', 'VERB-HEAT', SBS_DEEPWELL)).verdict).toBe('accepted');
    expect((await verdict('EQP-CLAMSHELL-HEATER-SHAKER', 'VERB-SHAKE', SBS_DEEPWELL)).verdict).toBe('accepted');
    const tall = await verdict('EQP-CLAMSHELL-HEATER-SHAKER', 'VERB-HEAT', { itemKind: 'labware', footprint: 'sbs', heightClass: 'tall', label: 'tall plate' });
    expect(tall.verdict).toBe('rejected');
    expect(tall.reason).toMatch(/standard\/deepwell/);
  });

  it('the clamshell records that it heats from TOP and BOTTOM', async () => {
    const service = new EquipmentCapabilityService(createStore(records));
    const inventory = await service.inventoryEquipmentCapabilities('EQP-CLAMSHELL-HEATER-SHAKER');
    const heat = inventory.entries.find((entry) => entry.verbId === 'VERB-HEAT');
    expect((heat?.constraints as { heat?: { from?: string[] } })?.heat?.from).toEqual(['top', 'bottom']);
  });

  it('a heat block takes tubes in addressed slots and NOT labware', async () => {
    const tube = await verdict('EQP-HEAT-BLOCK', 'VERB-HEAT', TUBE_15);
    expect(tube.verdict, tube.reason).toBe('accepted');
    expect(tube.seat).toBe('slots');
    const plate = await verdict('EQP-HEAT-BLOCK', 'VERB-HEAT', SBS_STANDARD);
    expect(plate.verdict).toBe('rejected');
    expect(plate.reason).toMatch(/tubes only/i);
  });

  it('a qPCR machine takes a 96-well plate in its bay, not a 384', async () => {
    expect((await verdict('EQP-QPCR', 'VERB-READ', SBS_STANDARD)).verdict).toBe('accepted');
    const wide = await verdict('EQP-QPCR', 'VERB-READ', { itemKind: 'labware', footprint: 'sbs', wellCounts: 384, label: '384-well plate' });
    expect(wide.verdict).toBe('rejected');
    expect(wide.reason).toMatch(/96-well plates, not 384-well/);
  });

  it('the QuantStudio 5 takes a 384-well plate of the THERMO design family only', async () => {
    const thermo: ItemPhysicalFacts = {
      itemKind: 'labware',
      footprint: 'sbs',
      wellCounts: 384,
      designFamily: 'CL:thermo_384_pcr_design',
      label: 'Thermo 384-well PCR plate',
    };
    const ok = await verdict('EQP-QUANTSTUDIO5', 'VERB-READ', thermo);
    expect(ok.verdict).toBe('accepted');
    expect(ok.seat).toBe('bay');

    const otherDesign = await verdict('EQP-QUANTSTUDIO5', 'VERB-READ', {
      ...thermo,
      designFamily: 'CL:other_384_pcr_design',
      label: 'other 384-well PCR plate',
    });
    expect(otherDesign.verdict).toBe('rejected');
    expect(otherDesign.reason).toMatch(/design family/i);

    const unrecordedDesign = await verdict('EQP-QUANTSTUDIO5', 'VERB-READ', {
      itemKind: 'labware',
      footprint: 'sbs',
      wellCounts: 384,
      label: '384-well plate (design unknown)',
    });
    expect(unrecordedDesign.verdict).toBe('rejected');
    expect(unrecordedDesign.reason).toMatch(/not recorded/i);
  });

  it('an orbital shaker shakes (open platform) but cannot heat', async () => {
    const shake = await verdict('EQP-PLATE-SHAKER', 'VERB-SHAKE', { itemKind: 'other', isFlask: true, label: 'flask' });
    expect(shake.verdict).toBe('accepted');
    expect(shake.seat).toBe('platform');
    const heat = await verdict('EQP-PLATE-SHAKER', 'VERB-HEAT', SBS_STANDARD);
    expect(heat.verdict).toBe('rejected');
    expect(heat.reason).toMatch(/cannot heat/i);
  });

  it('a rocker rocks and does NOT shake (mixing family, different motion)', async () => {
    expect((await verdict('EQP-TEST-ROCKER', 'VERB-ROCK', SBS_STANDARD)).verdict).toBe('accepted');
    const shake = await verdict('EQP-TEST-ROCKER', 'VERB-SHAKE', SBS_STANDARD);
    expect(shake.verdict).toBe('rejected');
    expect(shake.reason).toMatch(/cannot shake/i);
  });

  it('the Opentrons heater-shaker takes an SBS plate for heat and shake', async () => {
    expect((await verdict('EQP-HEATER-SHAKER', 'VERB-HEAT', SBS_DEEPWELL)).verdict).toBe('accepted');
    expect((await verdict('EQP-HEATER-SHAKER', 'VERB-SHAKE', SBS_DEEPWELL)).verdict).toBe('accepted');
  });

  it('equipment with NO capability data is `unknown` — flagged, never assumed', async () => {
    const result = await verdict('EQP-MYSTERY', 'VERB-HEAT', SBS_STANDARD);
    expect(result.verdict).toBe('unknown');
    expect(result.reason).toMatch(/no capability data/i);
    expect(result.reason).toMatch(/flagged/i);
  });

  it('an equipment id that does not exist is `unknown`, not a rejection of the item', async () => {
    const result = await verdict('EQP-NOT-A-RECORD', 'VERB-HEAT', SBS_STANDARD);
    expect(result.verdict).toBe('unknown');
    expect(result.reason).toMatch(/no equipment record/i);
  });
});
