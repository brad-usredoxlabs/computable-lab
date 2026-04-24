import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseFixture } from './FixtureTypes.js';
import { runFixture } from './FixtureRunner.js';
import { diffFixture } from './FixtureDiff.js';

const FIXTURE_PATH = resolve(__dirname, 'prompt-01-mint-samples.yaml');

describe('Prompt 01 - mint samples', () => {
  it('produces 1 create_container + 96 add_material events', async () => {
    const fixture = parseFixture(readFileSync(FIXTURE_PATH, 'utf8'));
    const actual = await runFixture(fixture);
    expect(actual.outcome).toBe('complete');
    const events = actual.terminalArtifacts.events;
    expect(events.length).toBe(97);
    const createContainers = events.filter(e => e.event_type === 'create_container');
    const addMaterials = events.filter(e => e.event_type === 'add_material');
    expect(createContainers.length).toBe(1);
    expect(addMaterials.length).toBe(96);
    const matIds = new Set(
      addMaterials.map(e => (e.details as {material?: {materialId?: string}})?.material?.materialId),
    );
    for (let n = 1; n <= 96; n++) {
      expect(matIds.has(`FS_${n}`)).toBe(true);
    }
  });

  it('reports deckLayoutPlan pinned at target', async () => {
    const fixture = parseFixture(readFileSync(FIXTURE_PATH, 'utf8'));
    const actual = await runFixture(fixture);
    expect(actual.terminalArtifacts.deckLayoutPlan?.pinned).toEqual([
      { slot: 'target', labwareHint: '96-well-deepwell-plate' },
    ]);
  });

  it('labStateDelta reflects 96 materials and 1 labware', async () => {
    const fixture = parseFixture(readFileSync(FIXTURE_PATH, 'utf8'));
    const actual = await runFixture(fixture);
    const snap = actual.terminalArtifacts.labStateDelta?.snapshotAfter;
    expect(snap).toBeDefined();
    expect(Object.keys(snap!.labware).length).toBe(1);
    const labware = Object.values(snap!.labware)[0];
    const totalMaterials = Object.values(labware.wells).flat().length;
    expect(totalMaterials).toBe(96);
  });

  it('fixture diff has zero missing fields', async () => {
    const fixture = parseFixture(readFileSync(FIXTURE_PATH, 'utf8'));
    const actual = await runFixture(fixture);
    const diff = diffFixture(actual, fixture.expected);
    expect(diff.missing).toEqual([]);
  });
});
