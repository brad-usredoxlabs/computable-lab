import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'js-yaml';

const here = fileURLToPath(import.meta.url);
const repoRoot = resolve(here, '..', '..', '..', '..');
const protocolsDir = resolve(repoRoot, 'records', 'seed', 'protocols');
const componentsDir = resolve(repoRoot, 'records', 'seed', 'graph-components');

describe('seed protocol records', () => {
  const files = readdirSync(protocolsDir).filter((f) => f.endsWith('.yaml'));
  it('has at least 5 protocols', () => expect(files.length).toBeGreaterThanOrEqual(5));
  for (const file of files) {
    it(`parses ${file}`, () => {
      const parsed = load(readFileSync(resolve(protocolsDir, file), 'utf8')) as Record<string, unknown>;
      expect(parsed.kind).toBe('protocol');
      expect(parsed.recordId as string).toMatch(/^prt-seed-/);
      expect(typeof parsed.title).toBe('string');
      expect(Array.isArray(parsed.steps)).toBe(true);
      expect((parsed.steps as unknown[]).length).toBeGreaterThanOrEqual(1);
    });
  }
});

describe('seed graph-component records', () => {
  const files = readdirSync(componentsDir).filter((f) => f.endsWith('.yaml'));
  it('has at least 2 graph-components', () => expect(files.length).toBeGreaterThanOrEqual(2));
  for (const file of files) {
    it(`parses ${file}`, () => {
      const parsed = load(readFileSync(resolve(componentsDir, file), 'utf8')) as Record<string, unknown>;
      expect(parsed.kind).toBe('graph-component');
      expect(parsed.recordId as string).toMatch(/^gc-seed-/);
    });
  }
});

describe('at least one seed protocol uses a tube rack', () => {
  it('finds a protocol with allowedTypes including a tubeset type', () => {
    const files = readdirSync(protocolsDir).filter((f) => f.endsWith('.yaml'));
    let found = false;
    for (const file of files) {
      const raw = readFileSync(resolve(protocolsDir, file), 'utf8');
      if (/tubeset_/.test(raw)) { found = true; break; }
    }
    expect(found).toBe(true);
  });
});
