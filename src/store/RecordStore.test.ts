/**
 * Tests for Record Store module.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

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
