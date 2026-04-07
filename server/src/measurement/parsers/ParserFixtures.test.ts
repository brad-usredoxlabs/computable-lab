import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ParserRegistry } from './ParserRegistry.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(here, 'fixtures');

function fixture(name: string): string {
  return readFileSync(join(fixtureDir, name), 'utf-8');
}

describe('Parser fixtures', () => {
  it('parses gemini fixture', () => {
    const registry = new ParserRegistry();
    const result = registry.resolve('gemini_csv').parse(fixture('gemini_sample.csv'));
    expect(result.data.length).toBe(2);
    expect(result.assayType).toBe('plate_reader');
  });

  it('parses abi7500 fixture', () => {
    const registry = new ParserRegistry();
    const result = registry.resolve('abi7500_csv').parse(fixture('abi7500_sample.csv'));
    expect(result.data.length).toBe(2);
    expect(result.assayType).toBe('qpcr');
  });

  it('parses gc/ic stub fixtures', () => {
    const registry = new ParserRegistry();
    const gc = registry.resolve('agilent6890_csv_stub').parse(fixture('agilent6890_stub_sample.csv'));
    const ic = registry.resolve('metrohm761_csv_stub').parse(fixture('metrohm761_stub_sample.csv'));
    expect(gc.data.length).toBeGreaterThan(0);
    expect(ic.data.length).toBeGreaterThan(0);
  });
});
