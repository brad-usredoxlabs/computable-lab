import { describe, it, expect } from 'vitest';
import { getMeasurementPanelRegistry } from './MeasurementPanelRegistry.js';

describe('MeasurementPanelRegistry', () => {
  it('list() returns 1 entry', () => {
    const registry = getMeasurementPanelRegistry();
    const entries = registry.list();

    expect(entries).toHaveLength(1);
  });

  it('MP-QPCR-CUSTOM-PANEL has correct properties', () => {
    const registry = getMeasurementPanelRegistry();
    const entry = registry.get('MP-QPCR-CUSTOM-PANEL');

    expect(entry).toBeDefined();
    expect(entry!.name).toBe('qPCR Custom Panel');
    expect(entry!.readout_refs).toHaveLength(3);
    expect(entry!.readout_refs).toContain('RDEF-QPCR-FAM');
    expect(entry!.readout_refs).toContain('RDEF-QPCR-HEX');
    expect(entry!.readout_refs).toContain('RDEF-QPCR-CY5');
    expect(entry!.notes).toContain('Custom qPCR panel');
  });
});
