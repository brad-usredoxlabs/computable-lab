import { describe, it, expect } from 'vitest';
import { getInstrumentRegistry } from './InstrumentRegistry.js';

describe('InstrumentRegistry', () => {
  it('list() returns 3 entries', () => {
    const registry = getInstrumentRegistry();
    const entries = registry.list();

    expect(entries).toHaveLength(3);
  });

  it('INSTDEF-GENERIC-PLATE_READER has instrument_type plate_reader', () => {
    const registry = getInstrumentRegistry();
    const entry = registry.get('INSTDEF-GENERIC-PLATE_READER');

    expect(entry).toBeDefined();
    expect(entry!.instrument_type).toBe('plate_reader');
    expect(entry!.name).toBe('Generic Plate Reader');
    expect(entry!.supported_readout_def_refs).toHaveLength(3);
  });

  it('INSTDEF-GENERIC-QPCR has instrument_type qpcr', () => {
    const registry = getInstrumentRegistry();
    const entry = registry.get('INSTDEF-GENERIC-QPCR');

    expect(entry).toBeDefined();
    expect(entry!.instrument_type).toBe('qpcr');
    expect(entry!.name).toBe('Generic qPCR Instrument');
    expect(entry!.supported_readout_def_refs).toHaveLength(3);
  });

  it('INSTDEF-GENERIC-GCMS has instrument_type gc_ms', () => {
    const registry = getInstrumentRegistry();
    const entry = registry.get('INSTDEF-GENERIC-GCMS');

    expect(entry).toBeDefined();
    expect(entry!.instrument_type).toBe('gc_ms');
    expect(entry!.name).toBe('Generic GC-MS');
    expect(entry!.supported_readout_def_refs).toHaveLength(1);
  });
});
