import { describe, it, expect } from 'vitest';
import { getReadoutDefinitionRegistry } from './ReadoutDefinitionRegistry.js';

describe('ReadoutDefinitionRegistry', () => {
  it('list() returns 7 entries', () => {
    const registry = getReadoutDefinitionRegistry();
    const entries = registry.list();

    expect(entries).toHaveLength(7);
  });

  it('RDEF-QPCR-FAM has correct properties', () => {
    const registry = getReadoutDefinitionRegistry();
    const entry = registry.get('RDEF-QPCR-FAM');

    expect(entry).toBeDefined();
    expect(entry!.name).toBe('qPCR FAM Channel');
    expect(entry!.instrument_type).toBe('qpcr');
    expect(entry!.mode).toBe('ct');
    expect(entry!.channel_label).toBe('FAM');
    expect(entry!.units).toBe('Ct');
  });

  it('RDEF-QPCR-HEX has correct properties', () => {
    const registry = getReadoutDefinitionRegistry();
    const entry = registry.get('RDEF-QPCR-HEX');

    expect(entry).toBeDefined();
    expect(entry!.name).toBe('qPCR HEX Channel');
    expect(entry!.instrument_type).toBe('qpcr');
    expect(entry!.mode).toBe('ct');
    expect(entry!.channel_label).toBe('HEX');
  });

  it('RDEF-QPCR-CY5 has correct properties', () => {
    const registry = getReadoutDefinitionRegistry();
    const entry = registry.get('RDEF-QPCR-CY5');

    expect(entry).toBeDefined();
    expect(entry!.name).toBe('qPCR Cy5 Channel');
    expect(entry!.instrument_type).toBe('qpcr');
    expect(entry!.mode).toBe('ct');
    expect(entry!.channel_label).toBe('Cy5');
  });

  it('RDEF-PLATE-FAR_RED-ROS has correct properties', () => {
    const registry = getReadoutDefinitionRegistry();
    const entry = registry.get('RDEF-PLATE-FAR_RED-ROS');

    expect(entry).toBeDefined();
    expect(entry!.name).toBe('Far-Red Fluorescence');
    expect(entry!.instrument_type).toBe('plate_reader');
    expect(entry!.mode).toBe('fluorescence');
    expect(entry!.excitation_nm).toBe(640);
    expect(entry!.emission_nm).toBe(665);
  });

  it('RDEF-GCMS-PEAK_AREA has correct properties', () => {
    const registry = getReadoutDefinitionRegistry();
    const entry = registry.get('RDEF-GCMS-PEAK_AREA');

    expect(entry).toBeDefined();
    expect(entry!.name).toBe('GC-MS Peak Area');
    expect(entry!.instrument_type).toBe('gc_ms');
    expect(entry!.mode).toBe('peak_area');
  });
});
