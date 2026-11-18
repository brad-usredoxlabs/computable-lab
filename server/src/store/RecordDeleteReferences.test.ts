// @vitest-environment node
/**
 * L2-RECORD-DELETE-DEPENDENTS-1 — RED-first tests for reference-aware deletion.
 *
 * Pin 1: Deleting a referenced record refuses, naming every referrer, and leaves the target intact.
 * Pin 2: Deleting a record with an access-policy cascades — same commit, no orphan.
 * Pin 3: A declared cascade removes the dependent and reports it.
 * Pin 4 (negative): seed refusal, append-only refusal, SHA mismatch still work.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { statSync as _statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID, createHash } from 'node:crypto';

import { createRecordStore, RecordStoreImpl } from './RecordStoreImpl.js';
import { createLocalRepoAdapter } from '../repo/LocalRepoAdapter.js';
import { AjvValidator } from '../validation/AjvValidator.js';
import { LintEngine } from '../lint/LintEngine.js';
import type { RepoAdapter, RepoFile, FileOperationResult, CommitInfo } from '../repo/types.js';

/**
 * Test repo adapter that wraps LocalRepoAdapter and adds commitFiles.
 * LocalRepoAdapter lacks commitFiles (only GitRepoAdapter has it), so tests
 * need this wrapper to verify the atomic-delete path.
 */
class TestRepoAdapter implements RepoAdapter {
  private inner: ReturnType<typeof createLocalRepoAdapter>;
  private basePath: string;

  constructor(basePath: string) {
    this.inner = createLocalRepoAdapter({ basePath });
    this.basePath = basePath;
  }

  getFile(path: string): Promise<RepoFile | null> {
    return this.inner.getFile(path);
  }
  fileExists(path: string): Promise<boolean> {
    return this.inner.fileExists(path);
  }
  listFiles(options: { directory: string; pattern?: string; recursive?: boolean }): Promise<string[]> {
    return this.inner.listFiles(options);
  }
  createFile(options: { path: string; content: string; message: string; branch?: string; author?: string; email?: string }): Promise<FileOperationResult> {
    return this.inner.createFile(options);
  }
  updateFile(options: { path: string; content: string; message: string; sha: string; branch?: string; author?: string; email?: string }): Promise<FileOperationResult> {
    return this.inner.updateFile(options);
  }
  deleteFile(options: { path: string; sha: string; message: string; branch?: string }): Promise<FileOperationResult> {
    return this.inner.deleteFile(options);
  }
  getHistory(_options: { path: string; limit?: number; ref?: string }): Promise<CommitInfo[]> {
    return this.inner.getHistory(_options);
  }

  /** commitFiles — atomic multi-file commit for tests. */
  async commitFiles(options: {
    files: Array<{ path: string; content?: string; operation: 'create' | 'update' | 'delete' }>;
    message: string;
    push?: boolean;
  }): Promise<FileOperationResult> {
    const { unlink, mkdir: nodeMkdir, writeFile: nodeWriteFile } = await import('node:fs/promises');
    const { dirname } = await import('node:path');

    const timestamp = new Date().toISOString();
    for (const file of options.files) {
      const fullPath = join(this.basePath, file.path);
      if (file.operation === 'delete') {
        try {
          _statSync(fullPath);
          await unlink(fullPath);
        } catch {
          // File already gone
        }
      } else {
        await nodeMkdir(dirname(fullPath), { recursive: true });
        await nodeWriteFile(fullPath, file.content ?? '', 'utf-8');
      }
    }

    const sha = createHash('sha256').update(options.message + options.files.map(f => f.path).join(',')).digest('hex').slice(0, 40);
    return {
      success: true,
      commit: { sha, message: options.message, author: 'test', email: 'test@test', timestamp },
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const testSchema = {
  $id: 'https://test.com/test.schema.yaml',
  type: 'object',
  properties: {
    recordId: { type: 'string' },
    $schema: { type: 'string' },
    kind: { type: 'string' },
    title: { type: 'string' },
    resourceRef: { type: 'object' },
    links: { type: 'object' },
    grants: { type: 'array' },
    ownerUserId: { type: 'string' },
    visibility: { type: 'string' },
  },
  required: ['recordId', '$schema', 'kind'],
};

async function createStore(testDir: string, cascadeYamlPath: string) {
  const repo = new TestRepoAdapter(testDir);
  const validator = new AjvValidator();
  validator.addSchema(testSchema);
  const lintEngine = new LintEngine();
  return createRecordStore(repo, validator, lintEngine, {
    cascadePolicyPath: cascadeYamlPath,
  });
}

function createEnvelope(recordId: string, kind: string, extras: Record<string, unknown> = {}) {
  return {
    recordId,
    schemaId: 'https://test.com/test.schema.yaml',
    payload: { recordId, $schema: 'https://test.com/test.schema.yaml', kind, ...extras },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('L2-RECORD-DELETE-DEPENDENTS-1 — reference-aware deletion', () => {
  let testDir: string;
  let cascadeYamlPath: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `delrefs-test-${randomUUID()}`);
    await mkdir(testDir, { recursive: true });
    cascadeYamlPath = join(testDir, 'reference-cascade.yaml');
    await writeFile(cascadeYamlPath, `rules:\n  - referrerKind: test-record\n    pointers:\n      materialRef: cascade\n  - referrerKind: access-policy\n    pointers:\n      resourceRef: cascade\n`);
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('pin 1: refusing delete names every referrer and leaves target intact', async () => {
    const store = await createStore(testDir, cascadeYamlPath);

    await store.create({
      envelope: createEnvelope('REC-A', 'study', { title: 'Study A' }),
      skipValidation: true,
      skipLint: true,
    });

    await store.create({
      envelope: createEnvelope('REC-B', 'experiment', {
        title: 'Experiment B',
        materialRef: { kind: 'record', id: 'REC-A' },
      }),
      skipValidation: true,
      skipLint: true,
    });

    const result = await store.delete({ recordId: 'REC-A' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('HAS_DEPENDENTS');
    // referrers is attached conditionally (exactOptionalPropertyTypes)
    const anyResult = result as Record<string, unknown>;
    expect(Array.isArray(anyResult.referrers)).toBe(true);
    expect((anyResult.referrers as string[])).toContain('REC-B');

    // A still exists — nothing written
    expect(await store.exists('REC-A')).toBe(true);
  });

  it('pin 2: deleting a record cascades its access-policy in the same commit', async () => {
    const store = await createStore(testDir, cascadeYamlPath);

    await store.create({
      envelope: createEnvelope('REC-A', 'study', { title: 'Study A' }),
      skipValidation: true,
      skipLint: true,
    });

    await store.create({
      envelope: createEnvelope('ACL-REC-A', 'access-policy', {
        title: 'ACL for A',
        resourceRef: { kind: 'record', id: 'REC-A' },
        ownerUserId: 'USR-ADMIN',
        visibility: 'private',
        grants: [],
      }),
      skipValidation: true,
      skipLint: true,
    });

    const result = await store.delete({ recordId: 'REC-A' });

    expect(result.success).toBe(true);
    expect(result.commit).toBeDefined();
    expect(result.commit?.sha).toBeDefined();

    // Both records should be gone
    expect(await store.exists('REC-A')).toBe(false);
    expect(await store.exists('ACL-REC-A')).toBe(false);

    // The cascaded array should name the ACL
    const anyResult = result as Record<string, unknown>;
    expect(Array.isArray(anyResult.cascaded)).toBe(true);
    expect((anyResult.cascaded as string[])).toContain('ACL-REC-A');
  });

  it('pin 3: declared cascade removes dependent and reports it', async () => {
    const store = await createStore(testDir, cascadeYamlPath);

    await store.create({
      envelope: createEnvelope('REC-A', 'material', { title: 'Material A' }),
      skipValidation: true,
      skipLint: true,
    });

    await store.create({
      envelope: createEnvelope('REC-B', 'test-record', {
        title: 'Test B',
        materialRef: { kind: 'record', id: 'REC-A' },
      }),
      skipValidation: true,
      skipLint: true,
    });

    const result = await store.delete({ recordId: 'REC-A' });

    expect(result.success).toBe(true);
    expect(result.commit).toBeDefined();

    expect(await store.exists('REC-A')).toBe(false);
    expect(await store.exists('REC-B')).toBe(false);

    const anyResult = result as Record<string, unknown>;
    expect(Array.isArray(anyResult.cascaded)).toBe(true);
    expect((anyResult.cascaded as string[])).toContain('REC-B');
  });

  it('pin 4 (negative): seed/append-only/SHA refusals still work', async () => {
    const seedDir = join(testDir, 'seed-records');
    await mkdir(join(seedDir, 'study'), { recursive: true });
    await writeFile(join(seedDir, 'study', 'STU-SEED.yaml'),
      'recordId: STU-SEED\n$schema: https://test.com/test.schema.yaml\nkind: study\ntitle: Seed Study\n');

    const store = await createStore(testDir, cascadeYamlPath);
    // Override config to include seedDir
    (store as any).config = { ...(store as any).config, seedDir };

    // Seed record refusal
    const seedResult = await store.delete({ recordId: 'STU-SEED' });
    expect(seedResult.success).toBe(false);
    expect(seedResult.error).toContain('seed');

    // Append-only refusal
    await store.create({
      envelope: createEnvelope('AUD-001', 'audit-event', { title: 'Audit' }),
      skipValidation: true,
      skipLint: true,
    });
    const auditResult = await store.delete({ recordId: 'AUD-001' });
    expect(auditResult.success).toBe(false);
    expect(auditResult.error).toContain('APPEND_ONLY');

    // SHA mismatch
    await store.create({
      envelope: createEnvelope('REC-X', 'study', { title: 'X' }),
      skipValidation: true,
      skipLint: true,
    });
    const shaResult = await store.delete({
      recordId: 'REC-X',
      expectedSha: 'deadbeef'.repeat(5).slice(0, 40),
    });
    expect(shaResult.success).toBe(false);
    expect(shaResult.error).toContain('SHA mismatch');
  });

  // ---------------------------------------------------------------------------
  // c3-defect1: loadCascadePolicy ENOENT → empty Map, malformed → throws
  // ---------------------------------------------------------------------------
  describe('loadCascadePolicy — absent vs malformed', () => {
    it('absent path returns empty Map (default-refuse)', async () => {
      const { loadCascadePolicy } = await import('./referenceCascade.js');
      const policy = loadCascadePolicy('/nonexistent/cascade-policy.yaml');
      expect(policy).toBeInstanceOf(Map);
      expect(policy.size).toBe(0);
    });

    it('malformed YAML file throws', async () => {
      const { loadCascadePolicy } = await import('./referenceCascade.js');
      const tmpPath = join(testDir, 'malformed.yaml');
      await writeFile(tmpPath, 'hello: [unclosed');
      expect(() => loadCascadePolicy(tmpPath)).toThrow('YAML parse error');
    });

    // c3-strict (advc c2 D6): mis-declared rules must throw, never silently degrade
    it('unknown onDelete action throws naming the offending value', async () => {
      const { loadCascadePolicy } = await import('./referenceCascade.js');
      const tmpPath = join(testDir, 'typo-action.yaml');
      await writeFile(tmpPath, 'rules:\n  - referrerKind: experiment\n    pointers:\n      materialRef: cascde\n');
      expect(() => loadCascadePolicy(tmpPath)).toThrow('cascde');
    });

    it('rule missing referrerKind throws naming the rule index', async () => {
      const { loadCascadePolicy } = await import('./referenceCascade.js');
      const tmpPath = join(testDir, 'no-referrer-kind.yaml');
      await writeFile(tmpPath, 'rules:\n  - pointers:\n      materialRef: refuse\n');
      expect(() => loadCascadePolicy(tmpPath)).toThrow(/rule\[0\].*referrerKind/);
    });

    it('rule missing pointers throws naming pointers', async () => {
      const { loadCascadePolicy } = await import('./referenceCascade.js');
      const tmpPath = join(testDir, 'no-pointers.yaml');
      await writeFile(tmpPath, 'rules:\n  - referrerKind: experiment\n');
      expect(() => loadCascadePolicy(tmpPath)).toThrow(/rule\[0\].*pointers/);
    });

    it('non-array rules key throws instead of coercing to empty policy', async () => {
      const { loadCascadePolicy } = await import('./referenceCascade.js');
      const tmpPath = join(testDir, 'rules-not-a-list.yaml');
      await writeFile(tmpPath, 'rules: "not-a-list"\n');
      expect(() => loadCascadePolicy(tmpPath)).toThrow(/rules/i);
    });
  });
});
