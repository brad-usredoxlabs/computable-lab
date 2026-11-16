import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'js-yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// GC bundle gate r1 finding T2-4 (L2-GC-PEAK-NAMING-1): every compoundId the
// fame-medium-chain class declares must resolve to a FAME-LOCAL ontology term
// in fame-local.yaml. This test asserts the class file and the ontology-term
// registry stay in lockstep — no candidate may point at an identity that does
// not exist in the registry.
describe('fame-medium-chain resolvability against fame-local ontology terms', () => {
  it('every fame-medium-chain candidate resolves to a FAME-LOCAL ontology term', () => {
    const classPath = resolve(
      __dirname,
      '..',
      '..',
      '..',
      'schema',
      'registry',
      'compound-classes',
      'fame-medium-chain.yaml',
    );
    const termsPath = resolve(
      __dirname,
      '..',
      '..',
      '..',
      'schema',
      'registry',
      'ontology-terms',
      'fame-local.yaml',
    );

    const classFile = load(readFileSync(classPath, 'utf8')) as {
      candidates: { compoundId: string }[];
    };
    const termsFile = load(readFileSync(termsPath, 'utf8')) as {
      terms?: { id: string }[];
      [key: string]: unknown;
    };

    const termIds = new Set<string>();
    const collect = (node: unknown): void => {
      if (Array.isArray(node)) {
        for (const item of node) collect(item);
      } else if (node !== null && typeof node === 'object') {
        const obj = node as { id?: unknown; kind?: unknown };
        if (obj.kind === 'ontology-term' && typeof obj.id === 'string') {
          termIds.add(obj.id);
        }
        for (const value of Object.values(obj)) collect(value);
      }
    };
    collect(termsFile);

    const missing = classFile.candidates
      .map((c) => c.compoundId)
      .filter((id) => !termIds.has(id));

    expect(
      missing,
      `fame-medium-chain candidates with no FAME-LOCAL term in fame-local.yaml: ${missing.join(', ')}`,
    ).toEqual([]);
  });
});
