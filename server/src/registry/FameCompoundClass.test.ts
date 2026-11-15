import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'js-yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// The FAME medium-chain compound class is the knowledge-layer registry entry
// that names the methyl-ester standards (rulings fa9e28cd0 / 72c48ff82: peak
// names live in the knowledge layer). The GC-2 F method standard set spans
// the full eight methyl esters 6:0 through 20:0; this test pins that the
// registry declares every one of them.
const EIGHT_METHYL_ESTERS = [
  'FAME-LOCAL:methyl-hexanoate-n6',
  'FAME-LOCAL:methyl-octanoate-n8',
  'FAME-LOCAL:methyl-decanoate-n10',
  'FAME-LOCAL:methyl-myristate-n14',
  'FAME-LOCAL:methyl-pentadecanoate-n15',
  'FAME-LOCAL:methyl-palmitate-n16',
  'FAME-LOCAL:methyl-heptadecanoate-n17',
  'FAME-LOCAL:methyl-arachidate-n20',
];

describe('fame-medium-chain compound class registry', () => {
  const registryPath = resolve(
    __dirname,
    '..',
    '..',
    '..',
    'schema',
    'registry',
    'compound-classes',
    'fame-medium-chain.yaml',
  );
  const registry = load(readFileSync(registryPath, 'utf8')) as {
    id: string;
    candidates?: Array<{ compoundId: string; name: string }>;
  };

  it('declares the fame-medium-chain class', () => {
    expect(registry.id).toBe('fame-medium-chain');
  });

  it('declares all eight methyl-ester candidates (6:0-20:0)', () => {
    expect(registry.candidates).toBeDefined();
    expect(registry.candidates!.length).toBeGreaterThanOrEqual(8);
    const compoundIds = registry.candidates!.map((c) => c.compoundId);
    for (const id of EIGHT_METHYL_ESTERS) {
      expect(compoundIds, `missing candidate ${id}`).toContain(id);
    }
  });

  it('names each candidate as a methyl ester (not a free fatty acid)', () => {
    for (const c of registry.candidates!) {
      expect(c.name).toMatch(/^Methyl .* \(FAME/);
    }
  });
});
