import { describe, it, expect } from 'vitest';
import { getAssayDefinitionRegistry } from './AssayDefinitionRegistry.js';

describe('AssayDefinitionRegistry', () => {
  it('list() returns 4 entries', () => {
    const registry = getAssayDefinitionRegistry();
    const entries = registry.list();

    expect(entries).toHaveLength(4);
  });

  it('ASSAY-QPCR-CUSTOM_PANEL has correct properties', () => {
    const registry = getAssayDefinitionRegistry();
    const entry = registry.get('ASSAY-QPCR-CUSTOM_PANEL');

    expect(entry).toBeDefined();
    expect(entry!.name).toBe('qPCR Custom Panel');
    expect(entry!.assay_type).toBe('qpcr_panel');
    expect(entry!.instrument_type).toBe('qpcr');
    expect(entry!.readout_def_refs).toHaveLength(3);
    expect(entry!.panel_targets).toHaveLength(3);
    expect(entry!.expected_role_types).toContain('positive_control');
  });

  it('ASSAY-ROS-PLATE_READER has correct properties', () => {
    const registry = getAssayDefinitionRegistry();
    const entry = registry.get('ASSAY-ROS-PLATE_READER');

    expect(entry).toBeDefined();
    expect(entry!.name).toBe('ROS Assay');
    expect(entry!.assay_type).toBe('ros');
    expect(entry!.instrument_type).toBe('plate_reader');
    expect(entry!.notes).toBe('Reactive oxygen species readout with far-red fluorescence.');
  });

  it('ASSAY-MMP-PLATE_READER has correct properties', () => {
    const registry = getAssayDefinitionRegistry();
    const entry = registry.get('ASSAY-MMP-PLATE_READER');

    expect(entry).toBeDefined();
    expect(entry!.name).toBe('MMP Assay');
    expect(entry!.assay_type).toBe('mmp');
    expect(entry!.instrument_type).toBe('plate_reader');
  });

  it('ASSAY-GCMS-STANDARDS has correct properties', () => {
    const registry = getAssayDefinitionRegistry();
    const entry = registry.get('ASSAY-GCMS-STANDARDS');

    expect(entry).toBeDefined();
    expect(entry!.name).toBe('GC Standards Panel');
    expect(entry!.assay_type).toBe('metabolomics_gc');
    expect(entry!.instrument_type).toBe('gc_ms');
  });
});
