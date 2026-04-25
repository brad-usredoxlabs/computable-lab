import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getPipetteCapabilityRegistry } from './PipetteCapabilityRegistry.js';

describe('PipetteCapabilityRegistry', () => {
  it('list() returns at least 2 entries', () => {
    const registry = getPipetteCapabilityRegistry();
    const entries = registry.list();
    expect(entries.length).toBeGreaterThanOrEqual(2);
  });

  it('p20-multi-8 has feasibility_floor_uL: 1', () => {
    const registry = getPipetteCapabilityRegistry();
    const entry = registry.get('p20-multi-8');
    expect(entry).toBeDefined();
    expect(entry!.display_name).toBe('P20 Multi 8-channel');
    expect(entry!.channels_supported).toEqual([1, 8]);
    expect(entry!.volume_families[0].feasibility_floor_uL).toBe(1);
    expect(entry!.volume_families[0].volume_max_uL).toBe(20);
  });

  it('p1000-single has feasibility_floor_uL: 100', () => {
    const registry = getPipetteCapabilityRegistry();
    const entry = registry.get('p1000-single');
    expect(entry).toBeDefined();
    expect(entry!.display_name).toBe('P1000 Single');
    expect(entry!.channels_supported).toEqual([1]);
    expect(entry!.volume_families[0].feasibility_floor_uL).toBe(100);
    expect(entry!.volume_families[0].volume_max_uL).toBe(1000);
  });

  it('get returns undefined for unknown id', () => {
    const registry = getPipetteCapabilityRegistry();
    const entry = registry.get('nonexistent-pipette');
    expect(entry).toBeUndefined();
  });
});
