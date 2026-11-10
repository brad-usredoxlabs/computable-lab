import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';
import { createRegistryLoader } from './RegistryLoader.js';

// ---------------------------------------------------------------------------
// Minimal spec shape used across all tests
// ---------------------------------------------------------------------------

interface TestSpec {
  id: string;
  name: string;
  platform_aliases?: Array<{ platform: string; alias: string }>;
  legacy_labware_types?: string[];
}

const testSchema = z.object({
  id: z.string(),
  name: z.string(),
  platform_aliases: z
    .array(z.object({ platform: z.string(), alias: z.string() }))
    .optional(),
  legacy_labware_types: z.array(z.string()).optional(),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'registry-loader-test-'));
}

function writeYamlFile(dir: string, filename: string, content: string): void {
  writeFileSync(join(dir, filename), content, 'utf8');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RegistryLoader', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTempDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // -- Happy path: two valid YAMLs ------------------------------------------

  it('loads two valid YAML files and returns them sorted by id', () => {
    writeYamlFile(tmpDir, 'alpha.yaml', 'id: alpha\nname: Alpha entry\n');
    writeYamlFile(tmpDir, 'beta.yaml', 'id: beta\nname: Beta entry\n');

    const loader = createRegistryLoader<TestSpec>({
      kind: 'test',
      directory: tmpDir,
      schema: testSchema,
    });

    const list = loader.list();
    expect(list).toHaveLength(2);
    expect(list[0].id).toBe('alpha');
    expect(list[1].id).toBe('beta');
  });

  it('list() returns a copy so mutating it does not affect the cache', () => {
    writeYamlFile(tmpDir, 'a.yaml', 'id: a\nname: A\n');
    const loader = createRegistryLoader<TestSpec>({
      kind: 'test',
      directory: tmpDir,
      schema: testSchema,
    });

    const first = loader.list();
    first.push({ id: 'fake', name: 'fake' } as TestSpec);
    expect(loader.list()).toHaveLength(1);
  });

  // -- get(id) --------------------------------------------------------------

  it('get returns the matching entry by id', () => {
    writeYamlFile(tmpDir, 'foo.yaml', 'id: foo\nname: Foo\n');
    writeYamlFile(tmpDir, 'bar.yaml', 'id: bar\nname: Bar\n');

    const loader = createRegistryLoader<TestSpec>({
      kind: 'test',
      directory: tmpDir,
      schema: testSchema,
    });

    expect(loader.get('foo')).toEqual({ id: 'foo', name: 'Foo' });
    expect(loader.get('bar')).toEqual({ id: 'bar', name: 'Bar' });
    expect(loader.get('missing')).toBeUndefined();
  });

  // -- Invalid file throws with useful message ------------------------------

  it('throws when a YAML file fails zod validation, including filename', () => {
    writeYamlFile(tmpDir, 'good.yaml', 'id: good\nname: Good\n');
    writeYamlFile(tmpDir, 'bad.yaml', 'name: Missing id field\n');

    const loader = createRegistryLoader<TestSpec>({
      kind: 'test',
      directory: tmpDir,
      schema: testSchema,
    });

    expect(() => loader.list()).toThrow(/bad\.yaml/);
  });

  // -- reload() -------------------------------------------------------------

  it('reload() re-reads the directory and picks up changes', () => {
    writeYamlFile(tmpDir, 'one.yaml', 'id: one\nname: One\n');

    const loader = createRegistryLoader<TestSpec>({
      kind: 'test',
      directory: tmpDir,
      schema: testSchema,
    });

    expect(loader.list()).toHaveLength(1);

    // Add a second file after initial load
    writeYamlFile(tmpDir, 'two.yaml', 'id: two\nname: Two\n');
    loader.reload();

    expect(loader.list()).toHaveLength(2);
    expect(loader.list()[1].id).toBe('two');
  });

  it('reload() picks up a file that was removed', () => {
    writeYamlFile(tmpDir, 'one.yaml', 'id: one\nname: One\n');
    writeYamlFile(tmpDir, 'two.yaml', 'id: two\nname: Two\n');

    const loader = createRegistryLoader<TestSpec>({
      kind: 'test',
      directory: tmpDir,
      schema: testSchema,
    });

    expect(loader.list()).toHaveLength(2);

    // Remove a file
    rmSync(join(tmpDir, 'two.yaml'), { force: true });
    loader.reload();

    expect(loader.list()).toHaveLength(1);
  });

  // -- fileFilter -----------------------------------------------------------

  // -- getByAlias: exact match across both declared key sources -------------

  it('getByAlias throws a named ambiguity error when two entries claim the same alias', () => {
    writeYamlFile(
      tmpDir,
      'first.yaml',
      'id: shared_a\nname: A\nplatform_aliases:\n  - platform: generic\n    alias: shared_key\n',
    );
    writeYamlFile(
      tmpDir,
      'second.yaml',
      'id: shared_b\nname: B\nplatform_aliases:\n  - platform: generic\n    alias: shared_key\n',
    );

    const loader = createRegistryLoader<TestSpec>({
      kind: 'test',
      directory: tmpDir,
      schema: testSchema,
    });

    let caught: unknown;
    try {
      loader.getByAlias('shared_key');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    const message = (caught as Error).message;
    expect(message).toContain('shared_key');
    expect(message).toContain('shared_a');
    expect(message).toContain('shared_b');
  });

  it('getByAlias finds keys declared only in legacy_labware_types (exact match)', () => {
    writeYamlFile(
      tmpDir,
      'legacy.yaml',
      'id: legacy_entry\nname: Legacy\nlegacy_labware_types:\n  - old_plate_name\n',
    );

    const loader = createRegistryLoader<TestSpec>({
      kind: 'test',
      directory: tmpDir,
      schema: testSchema,
    });

    expect(loader.getByAlias('old_plate_name')?.id).toBe('legacy_entry');
    expect(loader.getByAlias('old_plate')).toBeUndefined();
  });

  it('respects a custom fileFilter', () => {
    writeYamlFile(tmpDir, 'keep.yaml', 'id: keep\nname: Keep\n');
    writeYamlFile(tmpDir, 'skip.yml', 'id: skip\nname: Skip\n');

    const loader = createRegistryLoader<TestSpec>({
      kind: 'test',
      directory: tmpDir,
      schema: testSchema,
      fileFilter: (f) => f.endsWith('.yaml'),
    });

    expect(loader.list()).toHaveLength(1);
    expect(loader.list()[0].id).toBe('keep');
  });
});
