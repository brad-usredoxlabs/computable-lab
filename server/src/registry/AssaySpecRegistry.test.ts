import { describe, it, expect } from 'vitest';
import { getAssaySpecRegistry } from './AssaySpecRegistry.js';

describe('AssaySpecRegistry', () => {
  it('list() returns 2 entries', () => {
    const registry = getAssaySpecRegistry();
    const entries = registry.list();

    expect(entries).toHaveLength(2);
  });

  it('FIRE-cellular-redox has edgeExclusion === true', () => {
    const registry = getAssaySpecRegistry();
    const entry = registry.get('FIRE-cellular-redox');

    expect(entry).toBeDefined();
    expect(entry!.panelConstraints.edgeExclusion).toBe(true);
  });

  it('16S-qPCR-panel has channelMaps.A2.FAM === "F.prausnitzii"', () => {
    const registry = getAssaySpecRegistry();
    const entry = registry.get('16S-qPCR-panel');

    expect(entry).toBeDefined();
    expect(entry!.channelMaps!.A2.FAM).toBe('F.prausnitzii');
  });
});
