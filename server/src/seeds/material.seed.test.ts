import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'js-yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('seed material records', () => {
  const seedDir = resolve(__dirname, '..', '..', '..', 'records', 'seed', 'materials');
  const files = readdirSync(seedDir).filter((f) => f.endsWith('.yaml'));

  it('has at least 8 files', () => {
    expect(files.length).toBeGreaterThanOrEqual(8);
  });

  for (const file of files) {
    it(`parses ${file} as a material record`, () => {
      const raw = readFileSync(resolve(seedDir, file), 'utf8');
      const parsed = load(raw) as Record<string, unknown>;
      expect(parsed.kind).toBe('material');
      expect(typeof parsed.recordId).toBe('string');
      expect(parsed.recordId as string).toMatch(/^mat-seed-/);
      expect(typeof parsed.name).toBe('string');
      expect((parsed.name as string).endsWith(' (seed)')).toBe(true);
    });
  }
});
