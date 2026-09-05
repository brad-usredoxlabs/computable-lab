/**
 * Lab Profile registry — declarative lab identity (phase 1, Task 1.1).
 * Tests the loader normalize + validate + mergeNamespace precedence.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadDefaultLabProfile, mergeNamespace, type LabProfile } from './labProfile.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_DIR = resolve(__dirname, '../../../schema');

describe('LabProfile loader', () => {
  it('loads the registry with a label, namespace, and >=2 instruments', () => {
    const profile = loadDefaultLabProfile(SCHEMA_DIR);
    expect(profile.version).toBe(1);
    expect(profile.profile.label.length).toBeGreaterThan(0);
    // default registry namespace (config override tested separately)
    expect(profile.profile.namespace.prefix).toBe('example');
    expect(profile.profile.namespace.baseUri).toContain('example.org');
    expect(profile.profile.instruments.length).toBeGreaterThanOrEqual(2);
  });

  it('every instrument/protocol/reagent ref carries {kind, id, type}', () => {
    const profile = loadDefaultLabProfile(SCHEMA_DIR);
    const refs = [
      ...profile.profile.instruments,
      ...profile.profile.protocols,
      ...profile.profile.reagents,
    ].map((x) => x.ref);
    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) {
      expect(ref.kind).toBe('record');
      expect(typeof ref.id).toBe('string');
      expect(ref.id.length).toBeGreaterThan(0);
      expect(typeof ref.type).toBe('string');
    }
  });

  it('exposes the ontologyNamespace CURIE prefix', () => {
    const profile = loadDefaultLabProfile(SCHEMA_DIR);
    expect(profile.profile.ontologyNamespace).toBe('cf');
  });
});

describe('mergeNamespace (config wins — Task 1.2 pure helper)', () => {
  it('prefers live repo config namespace over registry defaults', () => {
    const profile = loadDefaultLabProfile(SCHEMA_DIR);
    const merged = mergeNamespace(profile, {
      baseUri: 'http://usredoxlabs.com/records/',
      prefix: 'redoxlabs',
    });
    expect(merged.profile.namespace.prefix).toBe('redoxlabs');
    expect(merged.profile.namespace.baseUri).toBe('http://usredoxlabs.com/records/');
  });

  it('keeps registry namespace intact when no config override is given', () => {
    const profile = loadDefaultLabProfile(SCHEMA_DIR);
    const merged = mergeNamespace(profile, null);
    expect(merged.profile.namespace.prefix).toBe('example');
  });

  it('does not mutate the input profile (pure)', () => {
    const profile = loadDefaultLabProfile(SCHEMA_DIR);
    const before = JSON.stringify(profile);
    mergeNamespace(profile, { baseUri: 'http://x/', prefix: 'x' });
    expect(JSON.stringify(profile)).toBe(before);
  });
});

/** Helper to construct a minimal in-memory LabProfile for callers. */
export function stubProfile(): LabProfile {
  return loadDefaultLabProfile(SCHEMA_DIR);
}