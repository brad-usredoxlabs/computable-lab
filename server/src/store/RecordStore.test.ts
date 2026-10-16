/**
 * Tests for Record Store module.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash, randomUUID } from 'node:crypto';

import {
  parseRecord,
  serializeRecord,
  extractRecordIdFromYaml,
  extractKindFromYaml,
  extractSchemaId,
  updateFields,
  isValidYaml,
  getYamlErrors,
} from './RecordParser.js';

import { createRecordStore, RecordStoreImpl } from './RecordStoreImpl.js';
import { createLocalRepoAdapter, LocalRepoAdapter } from '../repo/LocalRepoAdapter.js';
import { AjvValidator } from '../validation/AjvValidator.js';
import { LintEngine } from '../lint/LintEngine.js';

describe('RecordParser', () => {
  describe('parseRecord', () => {
    it('parses valid YAML record', () => {
      const yaml = `
recordId: STU-000001
$schema: https://example.com/study.schema.yaml
kind: study
title: Test Study
`;
      const result = parseRecord(yaml);
      
      expect(result.success).toBe(true);
      expect(result.envelope).toBeDefined();
      expect(result.envelope?.recordId).toBe('STU-000001');
      expect(result.envelope?.schemaId).toBe('https://example.com/study.schema.yaml');
      expect(result.envelope?.meta?.kind).toBe('study');
    });
    
    it('extracts id field as recordId fallback', () => {
      const yaml = `
id: MAT-001
$schema: https://example.com/material.schema.yaml
name: Sodium Chloride
`;
      const result = parseRecord(yaml);
      
      expect(result.success).toBe(true);
      expect(result.envelope?.recordId).toBe('MAT-001');
    });

    it('strips storage wrapper fields for id-based payloads', () => {
      const yaml = `
recordId: ING-001
$schema: https://example.com/ingestion-job.schema.yaml
kind: ingestion-job
id: ING-001
name: Cayman library upload
`;
      const result = parseRecord(yaml);

      expect(result.success).toBe(true);
      expect(result.envelope?.recordId).toBe('ING-001');
      expect(result.envelope?.payload).toMatchObject({
        kind: 'ingestion-job',
        id: 'ING-001',
        name: 'Cayman library upload',
      });
      expect(result.envelope?.payload).not.toHaveProperty('$schema');
      expect(result.envelope?.payload).not.toHaveProperty('recordId');
    });
    
    it('fails on missing recordId', () => {
      const yaml = `
$schema: https://example.com/test.schema.yaml
title: No ID
`;
      const result = parseRecord(yaml);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('recordId');
    });
    
    it('fails on missing schema', () => {
      const yaml = `
recordId: TEST-001
title: No Schema
`;
      const result = parseRecord(yaml);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('schema');
    });
    
    it('fails on invalid YAML', () => {
      const yaml = `
invalid: yaml: content:
  - not: properly: indented
`;
      const result = parseRecord(yaml);
      
      expect(result.success).toBe(false);
    });
    
    it('fails on empty content', () => {
      const result = parseRecord('');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Empty');
    });
    
    it('fails on non-object YAML', () => {
      const result = parseRecord('just a string');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('object');
    });
    
    it('includes file path in meta', () => {
      const yaml = `
recordId: STU-001
$schema: https://example.com/test.schema.yaml
`;
      const result = parseRecord(yaml, 'records/study/STU-001__test.yaml');
      
      expect(result.envelope?.meta?.path).toBe('records/study/STU-001__test.yaml');
    });
  });
  
  describe('serializeRecord', () => {
    it('serializes envelope to YAML', () => {
      const envelope = {
        recordId: 'STU-001',
        schemaId: 'https://example.com/test.schema.yaml',
        payload: {
          recordId: 'STU-001',
          $schema: 'https://example.com/test.schema.yaml',
          kind: 'study',
          title: 'Test',
        },
      };
      
      const yaml = serializeRecord(envelope);
      
      expect(yaml).toContain('recordId: STU-001');
      expect(yaml).toContain('title: Test');
    });
    
    it('includes meta comments when requested', () => {
      const envelope = {
        recordId: 'STU-001',
        schemaId: 'test',
        payload: { recordId: 'STU-001', $schema: 'test' },
        meta: {
          path: 'records/test.yaml',
          commitSha: 'abc123',
        },
      };
      
      const yaml = serializeRecord(envelope, { includeMetaComments: true });
      
      expect(yaml).toContain('# Path: records/test.yaml');
      expect(yaml).toContain('# Commit: abc123');
    });
  });
  
  describe('extraction functions', () => {
    it('extractRecordIdFromYaml extracts recordId', () => {
      const yaml = `recordId: STU-001\ntitle: Test`;
      expect(extractRecordIdFromYaml(yaml)).toBe('STU-001');
    });
    
    it('extractRecordIdFromYaml returns null for invalid', () => {
      expect(extractRecordIdFromYaml('invalid: yaml: :')).toBeNull();
    });
    
    it('extractKindFromYaml extracts kind', () => {
      const yaml = `kind: study\ntitle: Test`;
      expect(extractKindFromYaml(yaml)).toBe('study');
    });
    
    it('extractSchemaId extracts $schema', () => {
      const yaml = `$schema: https://example.com/test.yaml\ntitle: Test`;
      expect(extractSchemaId(yaml)).toBe('https://example.com/test.yaml');
    });
  });
  
  describe('updateFields', () => {
    it('updates existing fields', () => {
      const yaml = `title: Old Title\ncount: 1`;
      const updated = updateFields(yaml, { title: 'New Title' });
      
      expect(updated).toContain('New Title');
      expect(updated).toContain('count: 1');
    });
    
    it('adds new fields', () => {
      const yaml = `title: Test`;
      const updated = updateFields(yaml, { newField: 'value' });
      
      expect(updated).toContain('newField: value');
    });
  });
  
  describe('isValidYaml', () => {
    it('returns true for valid YAML', () => {
      expect(isValidYaml('key: value')).toBe(true);
    });
    
    it('returns false for invalid YAML', () => {
      expect(isValidYaml('key: value: invalid')).toBe(false);
    });
  });
  
  describe('getYamlErrors', () => {
    it('returns empty array for valid YAML', () => {
      expect(getYamlErrors('key: value')).toEqual([]);
    });
    
    it('returns errors for invalid YAML', () => {
      const errors = getYamlErrors('key: value: invalid');
      expect(errors.length).toBeGreaterThan(0);
    });
  });
});

describe('RecordStoreImpl', () => {
  let store: RecordStoreImpl;
  let repo: LocalRepoAdapter;
  let testDir: string;
  let validator: AjvValidator;
  let lintEngine: LintEngine;
  
  // Test schema
  const testSchema = {
    $id: 'https://test.com/test.schema.yaml',
    type: 'object',
    properties: {
      recordId: { type: 'string' },
      $schema: { type: 'string' },
      kind: { type: 'string' },
      title: { type: 'string' },
    },
    required: ['recordId', '$schema', 'kind'],
  };
  
  beforeEach(async () => {
    // Create temp directory
    testDir = join(tmpdir(), `store-test-${randomUUID()}`);
    await mkdir(testDir, { recursive: true });
    
    // Create repo adapter
    repo = createLocalRepoAdapter({ basePath: testDir });
    
    // Create validator with test schema
    validator = new AjvValidator();
    validator.addSchema(testSchema);
    
    // Create lint engine (empty rules for testing)
    lintEngine = new LintEngine();
    
    // Create store
    store = createRecordStore(repo, validator, lintEngine);
  });
  
  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });
  
  describe('create', () => {
    it('creates a new record', async () => {
      const envelope = {
        recordId: 'STU-001',
        schemaId: 'https://test.com/test.schema.yaml',
        payload: {
          recordId: 'STU-001',
          $schema: 'https://test.com/test.schema.yaml',
          kind: 'study',
          title: 'Test Study',
        },
      };
      
      const result = await store.create({
        envelope,
        skipValidation: true,
        skipLint: true,
      });
      
      expect(result.success).toBe(true);
      expect(result.envelope?.meta?.path).toContain('STU-001');
    });
    
    it('fails if record already exists', async () => {
      const envelope = {
        recordId: 'STU-002',
        schemaId: 'https://test.com/test.schema.yaml',
        payload: {
          recordId: 'STU-002',
          $schema: 'https://test.com/test.schema.yaml',
          kind: 'study',
        },
      };
      
      // Create first time
      await store.create({ envelope, skipValidation: true, skipLint: true });
      
      // Try to create again
      const result = await store.create({
        envelope,
        skipValidation: true,
        skipLint: true,
      });
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('already exists');
    });
  });
  
  describe('get', () => {
    it('returns null for non-existent record', async () => {
      const result = await store.get('NOPE-001');
      expect(result).toBeNull();
    });
    
    it('gets existing record', async () => {
      // Create record first
      const envelope = {
        recordId: 'STU-003',
        schemaId: 'https://test.com/test.schema.yaml',
        payload: {
          recordId: 'STU-003',
          $schema: 'https://test.com/test.schema.yaml',
          kind: 'study',
          title: 'Fetch Test',
        },
      };
      
      await store.create({ envelope, skipValidation: true, skipLint: true });
      
      const result = await store.get('STU-003');
      
      expect(result).not.toBeNull();
      expect(result?.recordId).toBe('STU-003');
      expect((result?.payload as Record<string, unknown>).title).toBe('Fetch Test');
    });

    it('gets seed records by id when they are not present in the connected repo', async () => {
      const seedDir = join(testDir, 'seed-records');
      await mkdir(join(seedDir, 'labware'), { recursive: true });
      await writeFile(join(seedDir, 'labware', 'lbw-seed-plate-96-flat.yaml'), `
recordId: lbw-seed-plate-96-flat
$schema: https://test.com/test.schema.yaml
kind: labware
title: Generic 96 Well Plate, Flat Bottom (seed)
`);

      store = createRecordStore(repo, validator, lintEngine, { seedDir });

      const result = await store.get('lbw-seed-plate-96-flat');

      expect(result).not.toBeNull();
      expect(result?.recordId).toBe('lbw-seed-plate-96-flat');
      expect((result?.payload as Record<string, unknown>).title).toBe('Generic 96 Well Plate, Flat Bottom (seed)');
      expect(result?.meta?.path).toContain('seed-records');
      expect(result?.meta?.commitSha).toBe('seed');
    });

    it('validates seed records through getWithValidation', async () => {
      const seedDir = join(testDir, 'seed-records');
      await mkdir(join(seedDir, 'labware'), { recursive: true });
      await writeFile(join(seedDir, 'labware', 'lbw-seed-plate-96-flat.yaml'), `
recordId: lbw-seed-plate-96-flat
$schema: https://test.com/test.schema.yaml
kind: labware
title: Generic 96 Well Plate, Flat Bottom (seed)
`);

      store = createRecordStore(repo, validator, lintEngine, { seedDir });

      const result = await store.getWithValidation({
        recordId: 'lbw-seed-plate-96-flat',
        validate: true,
      });

      expect(result.success).toBe(true);
      expect(result.envelope?.recordId).toBe('lbw-seed-plate-96-flat');
      expect(result.validation).toBeDefined();
    });
  });
  
  describe('update', () => {
    it('updates existing record', async () => {
      // Create record first
      const envelope = {
        recordId: 'STU-004',
        schemaId: 'https://test.com/test.schema.yaml',
        payload: {
          recordId: 'STU-004',
          $schema: 'https://test.com/test.schema.yaml',
          kind: 'study',
          title: 'Original',
        },
      };
      
      await store.create({ envelope, skipValidation: true, skipLint: true });
      
      // Update
      const updated = {
        ...envelope,
        payload: {
          ...envelope.payload,
          title: 'Updated',
        },
      };
      
      const result = await store.update({
        envelope: updated,
        skipValidation: true,
        skipLint: true,
      });
      
      expect(result.success).toBe(true);
      
      // Verify update
      const fetched = await store.get('STU-004');
      expect((fetched?.payload as Record<string, unknown>).title).toBe('Updated');
    });
    
    it('fails for non-existent record', async () => {
      const envelope = {
        recordId: 'NOPE-001',
        schemaId: 'https://test.com/test.schema.yaml',
        payload: { recordId: 'NOPE-001', $schema: 'test', kind: 'test' },
      };
      
      const result = await store.update({
        envelope,
        skipValidation: true,
        skipLint: true,
      });
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });
  
  describe('delete', () => {
    it('deletes existing record', async () => {
      // Create record first
      const envelope = {
        recordId: 'STU-005',
        schemaId: 'https://test.com/test.schema.yaml',
        payload: {
          recordId: 'STU-005',
          $schema: 'https://test.com/test.schema.yaml',
          kind: 'study',
        },
      };
      
      await store.create({ envelope, skipValidation: true, skipLint: true });
      
      // Delete
      const result = await store.delete({ recordId: 'STU-005' });
      
      expect(result.success).toBe(true);
      
      // Verify deleted
      expect(await store.exists('STU-005')).toBe(false);
    });
    
    it('fails for non-existent record', async () => {
      const result = await store.delete({ recordId: 'NOPE-002' });
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  // ==========================================================================
  // QMS7-2 — seed copy-on-write promotion (RED-first).
  //
  // Reads (get/list/search) resolve seed records; writes must agree. The
  // first AUTHORIZED, VALID update of a seed-resolved record promotes the
  // seed content into the working data dir via the normal write path,
  // applies the update there, and surfaces a typed provenance marker.
  // Validation/walls run BEFORE any durable promotion; refused writes leave
  // zero residue. The seed dir is NEVER written.
  //
  // Harness mirrors the existing seed-get tests (:352-390): LocalRepoAdapter
  // + tmpdir seedDir + labware-shaped fixture. No production kind names or
  // record ids appear here beyond test fixtures.
  // ==========================================================================
  describe('seed copy-on-write promotion (QMS7-2)', () => {
    const SEED_ID = 'lbw-cow-plate-96';
    const SEED_TITLE = 'Seed Plate 96';

    const seedFileContent = `
recordId: ${SEED_ID}
$schema: https://test.com/test.schema.yaml
kind: labware
title: ${SEED_TITLE}
`;

    /** Adapter fingerprint convention: sha256 hex, first 40 chars. */
    const sha40 = (content: string): string =>
      createHash('sha256').update(content).digest('hex').slice(0, 40);

    async function makeSeedStore(
      seedDirName: string,
      seedFileName: string,
      content: string,
      extraConfig: { appendOnlyKinds?: string[] } = {},
    ): Promise<{ seedStore: RecordStoreImpl; seedDir: string; seedFilePath: string }> {
      const seedDir = join(testDir, seedDirName);
      const kindDir = join(seedDir, 'labware');
      await mkdir(kindDir, { recursive: true });
      const seedFilePath = join(kindDir, seedFileName);
      await writeFile(seedFilePath, content);
      const seedStore = createRecordStore(repo, validator, lintEngine, {
        seedDir,
        ...(extraConfig.appendOnlyKinds !== undefined ? { appendOnlyKinds: extraConfig.appendOnlyKinds } : {}),
      });
      return { seedStore, seedDir, seedFilePath };
    }

    const updatedEnvelope = (title: string) => ({
      recordId: SEED_ID,
      schemaId: 'https://test.com/test.schema.yaml',
      payload: {
        recordId: SEED_ID,
        $schema: 'https://test.com/test.schema.yaml',
        kind: 'labware',
        title,
      },
    });

    const dataDirFiles = () =>
      repo.listFiles({ directory: 'records', pattern: '*.yaml', recursive: true });

    // R1 — the core bug: get() resolves the seed record, update() must too.
    it('R1: first valid update of a seed-resolved record promotes it into the data dir with a provenance marker', async () => {
      const { seedStore, seedFilePath } = await makeSeedStore('seed-cow-r1', 'lbw-cow-plate-96.yaml', seedFileContent);

      // Read path already sees the seed (existing behavior, pinned).
      const seedRead = await seedStore.get(SEED_ID);
      expect(seedRead).not.toBeNull();
      expect(seedRead?.meta?.commitSha).toBe('seed');

      const result = await seedStore.update({ envelope: updatedEnvelope(`${SEED_TITLE} (edited)`) });

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();

      // Typed promotion marker with seed provenance.
      expect(result.promotion).toBeDefined();
      expect(result.promotion?.seedPath).toBe(seedFilePath);
      expect(result.promotion?.seedContentSha).toBe(sha40(seedFileContent));

      // Working copy lands at the {recordId}__{slug}.yaml convention so the
      // fast path-scan resolves it.
      const promotedPath = result.envelope?.meta?.path;
      expect(promotedPath).toBeDefined();
      expect(promotedPath!.startsWith('records/labware/')).toBe(true);
      expect(promotedPath!.includes(`${SEED_ID}__`)).toBe(true);
      expect(await repo.fileExists(promotedPath!)).toBe(true);

      // The working copy carries the EDITED content and real repo meta.
      const fetched = await seedStore.get(SEED_ID);
      expect((fetched?.payload as Record<string, unknown>).title).toBe(`${SEED_TITLE} (edited)`);
      expect(fetched?.meta?.path).toBe(promotedPath);
      expect(fetched?.meta?.commitSha).not.toBe('seed');
      expect(fetched?.meta?.contentSha).toBeDefined();

      // Seed file untouched.
      expect(readFileSync(seedFilePath, 'utf-8')).toBe(seedFileContent);
    });

    // OQ3 ruling: the seed read path stamps commitSha 'seed' (no contentSha),
    // so a handler-echoed token arrives as the literal 'seed' — accept it.
    it('OQ3: expectedSha === "seed" matches the seed fingerprint; a foreign sha is refused', async () => {
      const { seedStore } = await makeSeedStore('seed-cow-oq3', 'lbw-cow-plate-96.yaml', seedFileContent);

      // Foreign sha first: the seed fingerprint is the stored content here.
      const foreign = await seedStore.update({
        envelope: updatedEnvelope(`${SEED_TITLE} (foreign)`),
        expectedSha: 'f'.repeat(40),
      });
      expect(foreign.success).toBe(false);
      expect(foreign.error).toBe(
        `SHA mismatch: expected ${'f'.repeat(40)}, got ${sha40(seedFileContent)}`,
      );

      // The literal 'seed' token the read path stamps is accepted.
      const ok = await seedStore.update({
        envelope: updatedEnvelope(`${SEED_TITLE} (token)`),
        expectedSha: 'seed',
      });
      expect(ok.success).toBe(true);
      expect(ok.promotion?.seedContentSha).toBe(sha40(seedFileContent));
    });

    // R3 — exactly once after promotion: list suppression (:349) and get
    // preferring the working copy (:247) already exist; pin them.
    it('R3: after promotion, list({kind}) returns the record exactly once and get() returns the working copy', async () => {
      const { seedStore } = await makeSeedStore('seed-cow-r3', 'lbw-cow-plate-96.yaml', seedFileContent);

      const promoted = await seedStore.update({ envelope: updatedEnvelope(`${SEED_TITLE} (edited)`) });
      expect(promoted.success).toBe(true);

      const labware = await seedStore.list({ kind: 'labware' });
      const matches = labware.filter((e) => e.recordId === SEED_ID);
      expect(matches.length).toBe(1);
      expect(matches[0]?.meta?.path).toBe(promoted.envelope?.meta?.path);
      expect(matches[0]?.meta?.commitSha).not.toBe('seed');

      const byId = await seedStore.get(SEED_ID);
      expect(byId?.meta?.path).toBe(promoted.envelope?.meta?.path);
      expect(byId?.meta?.path?.startsWith('records/')).toBe(true);
    });

    // R4 — residue freedom: every refused promotion leaves the data dir
    // byte-identical and the seed file untouched.
    it('R4a: invalid payload (validation fails) refuses with zero residue', async () => {
      const { seedStore, seedFilePath } = await makeSeedStore('seed-cow-r4a', 'lbw-cow-plate-96.yaml', seedFileContent);
      const before = await dataDirFiles();

      const result = await seedStore.update({
        envelope: {
          recordId: SEED_ID,
          schemaId: 'https://test.com/test.schema.yaml',
          // Missing required 'kind' → Ajv validation failure.
          payload: { recordId: SEED_ID, $schema: 'https://test.com/test.schema.yaml' },
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Validation failed');
      expect(result.validation?.valid).toBe(false);
      expect(await dataDirFiles()).toEqual(before);
      expect(readFileSync(seedFilePath, 'utf-8')).toBe(seedFileContent);
    });

    it('R4b: append-only-kind seed (config-injected kind) is refused with zero residue', async () => {
      const appendOnlyKind = 'test-immutable-kind';
      const content = `
recordId: ${SEED_ID}
$schema: https://test.com/test.schema.yaml
kind: ${appendOnlyKind}
title: ${SEED_TITLE}
`;
      const { seedStore, seedFilePath } = await makeSeedStore(
        'seed-cow-r4b',
        'lbw-cow-plate-96.yaml',
        content,
        { appendOnlyKinds: [appendOnlyKind] },
      );
      const before = await dataDirFiles();

      const result = await seedStore.update({ envelope: updatedEnvelope(`${SEED_TITLE} (edited)`) });

      expect(result.success).toBe(false);
      expect(result.error).toBe('APPEND_ONLY: immutable records cannot be updated');
      expect(await dataDirFiles()).toEqual(before);
      expect(readFileSync(seedFilePath, 'utf-8')).toBe(content);
    });

    it('R4c: content-locked seed (approved lifecycle state + controlled content change) is refused with zero residue', async () => {
      const content = `
recordId: ${SEED_ID}
$schema: https://test.com/test.schema.yaml
kind: labware
title: ${SEED_TITLE}
lifecycleId: test-controlled-lifecycle
state: approved
`;
      const { seedStore, seedFilePath } = await makeSeedStore('seed-cow-r4c', 'lbw-cow-plate-96.yaml', content);
      const before = await dataDirFiles();

      const result = await seedStore.update({ envelope: updatedEnvelope(`${SEED_TITLE} (tampered)`) });

      expect(result.success).toBe(false);
      expect(result.error).toContain('CONTROLLED_RECORD_LOCKED');
      expect(await dataDirFiles()).toEqual(before);
      expect(readFileSync(seedFilePath, 'utf-8')).toBe(content);
    });

    it('R4d: wrong expectedSha refuses with SHA mismatch and zero residue', async () => {
      const { seedStore, seedFilePath } = await makeSeedStore('seed-cow-r4d', 'lbw-cow-plate-96.yaml', seedFileContent);
      const before = await dataDirFiles();

      const result = await seedStore.update({
        envelope: updatedEnvelope(`${SEED_TITLE} (edited)`),
        expectedSha: 'a'.repeat(40),
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('SHA mismatch');
      expect(await dataDirFiles()).toEqual(before);
      expect(readFileSync(seedFilePath, 'utf-8')).toBe(seedFileContent);
    });

    // R5 — promotion happens inside the per-record write lock
    // (withRecordLock, 'write:' + recordId): two concurrent updates
    // serialize; exactly one working file results.
    it('R5: two concurrent updates of the same seed id serialize to exactly one working file', async () => {
      const { seedStore } = await makeSeedStore('seed-cow-r5', 'lbw-cow-plate-96.yaml', seedFileContent);

      const first = seedStore.update({ envelope: updatedEnvelope(`${SEED_TITLE} (writer A)`) });
      const second = seedStore.update({ envelope: updatedEnvelope(`${SEED_TITLE} (writer B)`) });
      const [r1, r2] = await Promise.all([first, second]);

      expect(r1.success).toBe(true);
      expect(r2.success).toBe(true);
      // Exactly one promotion happened; the other applied normally on top.
      const promotions = [r1, r2].filter((r) => r.promotion !== undefined);
      expect(promotions.length).toBe(1);

      const files = await dataDirFiles();
      expect(files.filter((f) => f.includes(SEED_ID)).length).toBe(1);

      const final = await seedStore.get(SEED_ID);
      const finalTitle = (final?.payload as Record<string, unknown>).title;
      expect([`${SEED_TITLE} (writer A)`, `${SEED_TITLE} (writer B)`]).toContain(finalTitle);
    });

    // R6 — genuinely nonexistent ids keep refusing (no create-on-update).
    it('R6: update for an id in neither dir still fails with Record not found', async () => {
      const { seedStore } = await makeSeedStore('seed-cow-r6', 'lbw-cow-plate-96.yaml', seedFileContent);
      const before = await dataDirFiles();

      const result = await seedStore.update({
        envelope: {
          recordId: 'NOPE-COW-001',
          schemaId: 'https://test.com/test.schema.yaml',
          payload: { recordId: 'NOPE-COW-001', $schema: 'https://test.com/test.schema.yaml', kind: 'labware' },
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Record not found: NOPE-COW-001');
      expect(result.promotion).toBeUndefined();
      expect(await dataDirFiles()).toEqual(before);
    });

    // OQ1 ruling: delete() stays seed-refused; message-only clarification.
    it('OQ1: delete on a seed-resolved record refuses with the seed-specific message and zero residue', async () => {
      const { seedStore, seedFilePath } = await makeSeedStore('seed-cow-oq1', 'lbw-cow-plate-96.yaml', seedFileContent);
      const before = await dataDirFiles();

      const result = await seedStore.delete({ recordId: SEED_ID });

      expect(result.success).toBe(false);
      expect(result.error).toBe(
        `Record ${SEED_ID} resolves from seed; seed records cannot be deleted`,
      );
      expect(await dataDirFiles()).toEqual(before);
      expect(readFileSync(seedFilePath, 'utf-8')).toBe(seedFileContent);
      // The seed record still reads back.
      expect(await seedStore.get(SEED_ID)).not.toBeNull();
    });

    // Promotion must not leak into unrelated stores: no seedDir configured →
    // update() keeps the plain 'Record not found' refusal (already covered
    // by the existing 'fails for non-existent record' test; pinned here for
    // the seedDir-configured store too via R6).
    it('promotion marker is absent on ordinary working-copy updates', async () => {
      const { seedStore } = await makeSeedStore('seed-cow-plain', 'lbw-cow-plate-96.yaml', seedFileContent);

      const promoted = await seedStore.update({ envelope: updatedEnvelope(`${SEED_TITLE} (edited)`) });
      expect(promoted.success).toBe(true);
      expect(promoted.promotion).toBeDefined();

      const again = await seedStore.update({ envelope: updatedEnvelope(`${SEED_TITLE} (second edit)`) });
      expect(again.success).toBe(true);
      expect(again.promotion).toBeUndefined();
    });
  });

  describe('list', () => {
    it('lists all records', async () => {
      // Create some records
      for (const id of ['STU-010', 'STU-011', 'STU-012']) {
        await store.create({
          envelope: {
            recordId: id,
            schemaId: 'https://test.com/test.schema.yaml',
            payload: {
              recordId: id,
              $schema: 'https://test.com/test.schema.yaml',
              kind: 'study',
            },
          },
          skipValidation: true,
          skipLint: true,
        });
      }
      
      const all = await store.list();
      
      expect(all.length).toBe(3);
    });
    
    it('filters by kind', async () => {
      // Create records with different kinds
      await store.create({
        envelope: {
          recordId: 'STU-020',
          schemaId: 'https://test.com/test.schema.yaml',
          payload: {
            recordId: 'STU-020',
            $schema: 'https://test.com/test.schema.yaml',
            kind: 'study',
          },
        },
        skipValidation: true,
        skipLint: true,
      });
      
      await store.create({
        envelope: {
          recordId: 'EXP-020',
          schemaId: 'https://test.com/test.schema.yaml',
          payload: {
            recordId: 'EXP-020',
            $schema: 'https://test.com/test.schema.yaml',
            kind: 'experiment',
          },
        },
        skipValidation: true,
        skipLint: true,
      });
      
      const studies = await store.list({ kind: 'study' });
      
      expect(studies.length).toBe(1);
      expect(studies[0].recordId).toBe('STU-020');
    });
  });
  
  describe('exists', () => {
    it('returns false for non-existent', async () => {
      expect(await store.exists('NOPE-999')).toBe(false);
    });
    
    it('returns true for existing', async () => {
      await store.create({
        envelope: {
          recordId: 'STU-030',
          schemaId: 'https://test.com/test.schema.yaml',
          payload: {
            recordId: 'STU-030',
            $schema: 'https://test.com/test.schema.yaml',
            kind: 'study',
          },
        },
        skipValidation: true,
        skipLint: true,
      });
      
      expect(await store.exists('STU-030')).toBe(true);
    });
  });
  
  describe('validate', () => {
    it('validates against schema', async () => {
      const envelope = {
        recordId: 'STU-040',
        schemaId: 'https://test.com/test.schema.yaml',
        payload: {
          recordId: 'STU-040',
          $schema: 'https://test.com/test.schema.yaml',
          kind: 'study',
          title: 'Valid',
        },
      };
      
      const result = await store.validate(envelope);
      
      expect(result.valid).toBe(true);
    });
    
    it('reports missing required fields', async () => {
      const envelope = {
        recordId: 'STU-041',
        schemaId: 'https://test.com/test.schema.yaml',
        payload: {
          recordId: 'STU-041',
          $schema: 'https://test.com/test.schema.yaml',
          // Missing kind
        },
      };
      
      const result = await store.validate(envelope);
      
      expect(result.valid).toBe(false);
      expect(result.errors?.length).toBeGreaterThan(0);
    });
    
    it('reports unknown schema', async () => {
      const envelope = {
        recordId: 'STU-042',
        schemaId: 'https://unknown.com/schema.yaml',
        payload: { recordId: 'STU-042', $schema: 'test' },
      };
      
      const result = await store.validate(envelope);
      
      expect(result.valid).toBe(false);
      expect(result.errors?.[0].message).toContain('Schema not found');
    });
  });
});
