import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getLabwareDefinitionRegistry } from './LabwareDefinitionRegistry.js';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load as yamlLoad } from 'js-yaml';

// server/src/registry/ -> server/src -> server -> repoRoot (same idiom as
// server/src/seeds/labwareDefinition.absence.test.ts)
const storeDefsDir = resolve(fileURLToPath(import.meta.url), '..', '..', '..', '..', 'records', 'seed', 'labware-definition');

describe('LabwareDefinitionRegistry', () => {
  it('list() returns at least 5 entries', () => {
    const registry = getLabwareDefinitionRegistry();
    const entries = registry.list();
    expect(entries.length).toBeGreaterThanOrEqual(5);
  });

  it('96-well-plate has rows=8, columns=12', () => {
    const registry = getLabwareDefinitionRegistry();
    const entry = registry.get('96-well-plate');
    expect(entry).toBeDefined();
    expect(entry!.topology.rows).toBe(8);
    expect(entry!.topology.columns).toBe(12);
  });

  it('96-well-deepwell-plate has rows=8, columns=12', () => {
    const registry = getLabwareDefinitionRegistry();
    const entry = registry.get('96-well-deepwell-plate');
    expect(entry).toBeDefined();
    expect(entry!.topology.rows).toBe(8);
    expect(entry!.topology.columns).toBe(12);
  });

  it('384-well-pcr-plate has rows=16, columns=24', () => {
    const registry = getLabwareDefinitionRegistry();
    const entry = registry.get('384-well-pcr-plate');
    expect(entry).toBeDefined();
    expect(entry!.topology.rows).toBe(16);
    expect(entry!.topology.columns).toBe(24);
  });

  it('12-well-reservoir has rows=1, columns=12', () => {
    const registry = getLabwareDefinitionRegistry();
    const entry = registry.get('12-well-reservoir');
    expect(entry).toBeDefined();
    expect(entry!.topology.rows).toBe(1);
    expect(entry!.topology.columns).toBe(12);
  });

  it('8-well-reservoir has rows=1, columns=8', () => {
    const registry = getLabwareDefinitionRegistry();
    const entry = registry.get('8-well-reservoir');
    expect(entry).toBeDefined();
    expect(entry!.topology.rows).toBe(1);
    expect(entry!.topology.columns).toBe(8);
    const aliased = registry.getByAlias('reservoir_8');
    expect(aliased).toBeDefined();
    expect(aliased!.id).toBe('8-well-reservoir');
    const geom = entry!.physical_geometry as { overall_dimensions_mm: { length: number; width: number } };
    expect(geom.overall_dimensions_mm).toEqual({ length: 127, width: 85 });
  });

  it('includes generic beaker definitions for protocol labware search', () => {
    const registry = getLabwareDefinitionRegistry();
    const entry = registry.get('beaker_250ml');
    expect(entry).toBeDefined();
    expect(entry!.display_name).toBe('250 mL Beaker');
    expect(entry!.topology.addressing).toBe('single');
    expect(entry!.capacity.max_well_volume_uL).toBe(250000);
  });

  it('includes generic flask definitions for protocol labware search', () => {
    const registry = getLabwareDefinitionRegistry();
    const entry = registry.get('flask_1000ml');
    expect(entry).toBeDefined();
    expect(entry!.display_name).toBe('1 L Flask');
    expect(entry!.topology.addressing).toBe('single');
    expect(entry!.capacity.max_well_volume_uL).toBe(1000000);
  });

  it('getByAlias finds by platform alias', () => {
    const registry = getLabwareDefinitionRegistry();
    const entry = registry.getByAlias('plate_96');
    expect(entry).toBeDefined();
    expect(entry!.id).toBe('96-well-plate');
  });

  it('getByAlias returns undefined for unknown alias', () => {
    const registry = getLabwareDefinitionRegistry();
    const entry = registry.getByAlias('nonexistent-alias');
    expect(entry).toBeUndefined();
  });

  it('get returns undefined for unknown id', () => {
    const registry = getLabwareDefinitionRegistry();
    const entry = registry.get('nonexistent-labware');
    expect(entry).toBeUndefined();
  });

  it('flask_t25 is defined with correct topology, capacity, and legacy type', () => {
    const registry = getLabwareDefinitionRegistry();
    const entry = registry.get('flask_t25');
    expect(entry).toBeDefined();
    expect(entry!.topology.addressing).toBe('single');
    expect(entry!.capacity.max_well_volume_uL).toBe(25000);
    expect(entry!.legacy_labware_types).toContain('flask_t25');
  });

  it('flask_t75 is defined with correct topology, capacity, and legacy type', () => {
    const registry = getLabwareDefinitionRegistry();
    const entry = registry.get('flask_t75');
    expect(entry).toBeDefined();
    expect(entry!.topology.addressing).toBe('single');
    expect(entry!.capacity.max_well_volume_uL).toBe(75000);
    expect(entry!.legacy_labware_types).toContain('flask_t75');
  });

  it('reservoir_25ml_single resolves with single addressing, 25000 uL capacity, aspiration hint, and no physical_geometry', () => {
    const registry = getLabwareDefinitionRegistry();
    const entry = registry.get('reservoir_25ml_single');
    expect(entry).toBeDefined();
    expect(entry!.topology.addressing).toBe('single');
    expect(entry!.capacity.max_well_volume_uL).toBe(25000);
    expect(entry!.aspiration_hints.single_well_multichannel_source).toBe(true);
    expect(entry!.physical_geometry).toBeUndefined();
  });

  it('reservoir_25ml_single resolves by alias', () => {
    const registry = getLabwareDefinitionRegistry();
    const entry = registry.getByAlias('reservoir_25ml_single');
    expect(entry).toBeDefined();
    expect(entry!.id).toBe('reservoir_25ml_single');
  });

  it('getByAlias is exact-match: the family word "reservoir" does not resolve', () => {
    const registry = getLabwareDefinitionRegistry();
    expect(registry.getByAlias('reservoir')).toBeUndefined();
  });

  // L2-P1-SEED-ENTRY-1 (unit regguard) — amendment c7c1d8f4, point 1:
  // "Offered means it exists." The loader must SURFACE the declared flag
  // (zod strips unknown keys), and the pin is two-directional and
  // non-vacuous: offerable ⇔ store-backed, in both directions.
  it('surfaces the declared offerable flag (24-well-plate is offerable)', () => {
    const registry = getLabwareDefinitionRegistry();
    expect(registry.get('24-well-plate')!.offerable, 'flag must survive the loader').toBe(true);
  });

  it('offerable entries are exactly the store-backed registry entries (both directions)', () => {
    const registry = getLabwareDefinitionRegistry();
    const registryIds = new Set(registry.list().map((e) => e.recordId));
    const offerableIds = registry
      .list()
      .filter((e) => e.offerable === true)
      .map((e) => e.recordId)
      .sort();
    const storeIds = readdirSync(storeDefsDir)
      .filter((f) => f.endsWith('.yaml'))
      .map(
        (f) =>
          (yamlLoad(readFileSync(resolve(storeDefsDir, f), 'utf8')) as { recordId: string })
            .recordId,
      );
    const storeBackedRegistryIds = storeIds.filter((id) => registryIds.has(id)).sort();
    expect(offerableIds.length, 'non-vacuity: the flag must survive the loader').toBeGreaterThan(0);
    expect(offerableIds, 'offerable set must equal the store-backed registry set').toEqual(storeBackedRegistryIds);
  });

  it('a catalogue-only entry is not offerable (96-well-deepwell-plate)', () => {
    const registry = getLabwareDefinitionRegistry();
    expect(registry.get('96-well-deepwell-plate')!.offerable, 'no store record: absent, never true').not.toBe(true);
  });
});
