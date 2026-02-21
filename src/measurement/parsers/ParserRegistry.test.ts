import { describe, expect, it } from 'vitest';
import { ParserRegistry } from './ParserRegistry.js';

describe('ParserRegistry', () => {
  it('resolves parser aliases', () => {
    const registry = new ParserRegistry();
    const parser = registry.resolve('abi7500');
    expect(parser.parserId).toBe('abi7500_csv');
  });

  it('parses gemini-style CSV with RFU extraction', () => {
    const registry = new ParserRegistry();
    const parser = registry.resolve('gemini_csv');
    const result = parser.parse([
      'Well,RFU,Wavelength',
      'A1,1234.5,485',
      'B1,987.2,485',
      '',
    ].join('\n'));
    expect(result.assayType).toBe('plate_reader');
    expect(result.data.length).toBe(2);
    expect(result.data[0]?.metric).toContain('RFU');
  });

  it('parses ABI7500 CSV and emits Ct rows', () => {
    const registry = new ParserRegistry();
    const parser = registry.resolve('abi7500_csv');
    const result = parser.parse([
      'Well Position,Target Name,Reporter,Ct',
      'A1,GAPDH,FAM,21.34',
      'A2,ACTB,VIC,19.02',
      '',
    ].join('\n'));
    expect(result.assayType).toBe('qpcr');
    expect(result.channels.includes('FAM')).toBe(true);
    expect(result.data[0]?.metric).toBe('CT');
  });

  it('exposes GC/IC stub parsers and clear error for wrong shape', () => {
    const registry = new ParserRegistry();
    expect(() => registry.resolve('agilent6890').parse('well,value\nA1,10\n')).toThrow(/expects columns/i);
    expect(() => registry.resolve('metrohm761').parse('well,value\nA1,10\n')).toThrow(/expects columns/i);
  });
});
