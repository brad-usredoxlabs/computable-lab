import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getLabwareDefinitionRegistry } from './LabwareDefinitionRegistry.js';

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
});
