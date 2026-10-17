/**
 * SH-QA-3 — golden-level replay WITHOUT a bless (spec File 3).
 *
 * An IN-TEST GoldenFixture object through the exported runGolden
 * (replayKernel :190/:198 — the idiom exported precisely for this): the canned
 * modelOutput is the paste-#5 redundant-material doc (prose sentence AND
 * params.composition). With the redundancy strip the payload is outcome-
 * complete-shaped 200 with the SAME events as the composition-only canned
 * output (the paste-#3 good path), `clarifications` ABSENT, `writeCalls === 0`.
 *
 * NO MANIFEST entry is added (fixtures stay hash-pinned; manifestHashMismatches
 * must return [] — bait B4: the MANIFEST must not move).
 */
import { describe, expect, it } from 'vitest';
import {
  loadManifest,
  manifestHashMismatches,
  runGolden,
  stableStringify,
  type GoldenFixture,
} from './replayKernel.js';

const COMPONENTS = [
  { material: 'Thermo trypsin-EDTA', role: 'solvent', fraction: '50%' },
  { material: 'Thermo DMEM', role: 'buffer_component', fraction: '50%' },
  { material: 'Thermo FBS', role: 'additive', fraction: '10%' },
  { material: 'HepG2 cells', role: 'cells', count: 10000, counterDensity: { value: 200, unit: 'cells/uL' } },
];

const STORE_RECORDS = [
  { recordId: 'MAT-shqa3-trypsin', payload: { kind: 'material', title: 'Thermo trypsin-EDTA', synonyms: ['thermo trypsin-edta', 'trypsin-edta'] } },
  { recordId: 'MAT-shqa3-dmem', payload: { kind: 'material', title: 'Thermo DMEM', synonyms: ['thermo dmem', 'dmem'] } },
  { recordId: 'MAT-shqa3-fbs', payload: { kind: 'material', title: 'Thermo FBS', synonyms: ['thermo fbs', 'fbs'] } },
  { recordId: 'MAT-shqa3-hepg2', payload: { kind: 'material', title: 'HepG2 cells', synonyms: ['hepg2 cells', 'hepg2'] } },
];

function fixture(name: string, modelOutput: Record<string, unknown>): GoldenFixture {
  return {
    name,
    request: {
      protocolText: 'Add the mixture to well A1.',
      answers: { sample_type: 'bacterial' },
    },
    store: { records: STORE_RECORDS },
    modelOutput,
  };
}

const REDUNDANT_OUTPUT = {
  kind: 'scientist-intent',
  version: '0.1.0',
  intentId: 'shqa3-golden-redundant',
  actions: [{
    action: 'add_material',
    material: '50/50 Trypsin-EDTA/DMEM + 10% FBS with HepG2 cells',
    volumeUl: 50,
    targetWells: ['A1'],
    params: { composition: COMPONENTS },
  }],
  unresolved: [],
};

const COMPOSITION_ONLY_OUTPUT = {
  kind: 'scientist-intent',
  version: '0.1.0',
  intentId: 'shqa3-golden-redundant',
  actions: [{
    action: 'add_material',
    volumeUl: 50,
    targetWells: ['A1'],
    params: { composition: COMPONENTS },
  }],
  unresolved: [],
};

describe('SH-QA-3 golden replay (in-test fixture, NO bless): the redundant-material doc compiles like the good path', () => {
  it('payload is 200 complete-shaped, clarifications ABSENT, zero writes', async () => {
    const run = await runGolden(fixture('shqa3.prose-blob-strip', REDUNDANT_OUTPUT));
    expect(run.status, JSON.stringify(run.payload)).toBe(200);
    const payload = run.payload;
    expect(payload['outcome']).toBe('complete');
    expect(Object.keys(payload)).not.toContain('clarifications');
    const terminal = payload['terminalArtifacts'] as Record<string, unknown>;
    expect(Array.isArray(terminal['events'])).toBe(true);
    expect((terminal['events'] as unknown[]).length).toBeGreaterThan(0);
    expect(run.spies.writeCalls).toBe(0);
  });

  it('the stripped compile emits the SAME events as the composition-only canned output (the paste-#3 good path)', async () => {
    const stripped = await runGolden(fixture('shqa3.prose-blob-strip', REDUNDANT_OUTPUT));
    const good = await runGolden(fixture('shqa3.composition-only', COMPOSITION_ONLY_OUTPUT));
    const stripEventIds = (payload: Record<string, unknown>): string => {
      const events = ((payload['terminalArtifacts'] as Record<string, unknown>)['events'] ?? []) as Array<Record<string, unknown>>;
      return stableStringify(events.map((ev) => ({ ...ev, eventId: undefined })));
    };
    expect(stripEventIds(stripped.payload)).toBe(stripEventIds(good.payload));
    // The mixture label is the DERIVED component join, never the sentence.
    const events = ((stripped.payload['terminalArtifacts'] as Record<string, unknown>)['events'] ?? []) as Array<Record<string, unknown>>;
    const blobLabel = '50/50 Trypsin-EDTA/DMEM + 10% FBS with HepG2 cells';
    expect(JSON.stringify(events)).not.toContain(blobLabel);
    expect(JSON.stringify(events)).toContain('Thermo trypsin-EDTA + Thermo DMEM + Thermo FBS + HepG2 cells');
  });

  it('the MANIFEST did not move: manifestHashMismatches is empty (B4)', () => {
    expect(manifestHashMismatches(loadManifest())).toEqual([]);
  });
});
