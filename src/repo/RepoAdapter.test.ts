/**
 * Tests for Repository Adapter module.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

import {
  generatePath,
  parseRecordPath,
  isValidPath,
  extractRecordIdFromPath,
  extractKindFromPath,
  isValidRecordId,
  getKindDirectory,
  slugify,
  kindFilter,
  prefixFilter,
} from './PathConvention.js';

import { createLocalRepoAdapter, LocalRepoAdapter } from './LocalRepoAdapter.js';

describe('PathConvention', () => {
  describe('slugify', () => {
    it('converts to lowercase', () => {
      expect(slugify('Hello World')).toBe('hello-world');
    });
    
    it('replaces spaces with dashes', () => {
      expect(slugify('my test study')).toBe('my-test-study');
    });
    
    it('removes special characters', () => {
      expect(slugify('test@123!#$')).toBe('test123');
    });
    
    it('collapses multiple dashes', () => {
      expect(slugify('test--study')).toBe('test-study');
    });
    
    it('trims leading/trailing dashes', () => {
      expect(slugify('--test--')).toBe('test');
    });
  });
  
  describe('generatePath', () => {
    it('generates standard path', () => {
      const path = generatePath({
        recordId: 'STU-000001',
        kind: 'study',
        slug: 'my-study',
      });
      expect(path).toBe('records/study/STU-000001__my-study.yaml');
    });
    
    it('uses custom extension', () => {
      const path = generatePath({
        recordId: 'STU-000001',
        kind: 'study',
        slug: 'test',
        extension: 'json',
      });
      expect(path).toBe('records/study/STU-000001__test.json');
    });
    
    it('uses custom base directory', () => {
      const path = generatePath({
        recordId: 'STU-000001',
        kind: 'study',
        slug: 'test',
        baseDir: 'data',
      });
      expect(path).toBe('data/study/STU-000001__test.yaml');
    });
    
    it('slugifies the slug', () => {
      const path = generatePath({
        recordId: 'STU-000001',
        kind: 'study',
        slug: 'My Study Title',
      });
      expect(path).toBe('records/study/STU-000001__my-study-title.yaml');
    });
    
    it('uses untitled when no slug', () => {
      const path = generatePath({
        recordId: 'STU-000001',
        kind: 'study',
      });
      expect(path).toBe('records/study/STU-000001__untitled.yaml');
    });
    
    it('throws on empty recordId', () => {
      expect(() => generatePath({ recordId: '', kind: 'study' }))
        .toThrow('recordId is required');
    });
    
    it('throws on empty kind', () => {
      expect(() => generatePath({ recordId: 'STU-001', kind: '' }))
        .toThrow('kind is required');
    });
  });
  
  describe('parseRecordPath', () => {
    it('parses standard path', () => {
      const parsed = parseRecordPath('records/study/STU-000001__my-study.yaml');
      expect(parsed).toEqual({
        recordId: 'STU-000001',
        kind: 'study',
        slug: 'my-study',
        path: 'records/study/STU-000001__my-study.yaml',
        extension: 'yaml',
      });
    });
    
    it('parses path with json extension', () => {
      const parsed = parseRecordPath('records/material/MAT-001__sodium-chloride.json');
      expect(parsed?.extension).toBe('json');
    });
    
    it('handles Windows-style paths', () => {
      const parsed = parseRecordPath('records\\study\\STU-001__test.yaml');
      expect(parsed?.recordId).toBe('STU-001');
      expect(parsed?.path).toBe('records/study/STU-001__test.yaml');
    });
    
    it('returns null for non-matching path', () => {
      expect(parseRecordPath('records/study/invalid-filename.yaml')).toBeNull();
    });
    
    it('returns null for path without extension', () => {
      expect(parseRecordPath('records/study/STU-001__test')).toBeNull();
    });
    
    it('returns null for empty path', () => {
      expect(parseRecordPath('')).toBeNull();
    });
  });
  
  describe('isValidPath', () => {
    it('returns true for valid path', () => {
      expect(isValidPath('records/study/STU-001__test.yaml')).toBe(true);
    });
    
    it('returns false for invalid path', () => {
      expect(isValidPath('records/study/invalid.yaml')).toBe(false);
    });
  });
  
  describe('extractRecordIdFromPath', () => {
    it('extracts record ID', () => {
      expect(extractRecordIdFromPath('records/study/STU-001__test.yaml')).toBe('STU-001');
    });
    
    it('returns null for invalid path', () => {
      expect(extractRecordIdFromPath('invalid.yaml')).toBeNull();
    });
  });
  
  describe('extractKindFromPath', () => {
    it('extracts kind', () => {
      expect(extractKindFromPath('records/study/STU-001__test.yaml')).toBe('study');
    });
    
    it('returns null for invalid path', () => {
      expect(extractKindFromPath('invalid.yaml')).toBeNull();
    });
  });
  
  describe('isValidRecordId', () => {
    it('validates study IDs', () => {
      expect(isValidRecordId('STU-000123')).toBe(true);
    });
    
    it('validates experiment IDs', () => {
      expect(isValidRecordId('EXP-001')).toBe(true);
    });
    
    it('validates material IDs', () => {
      expect(isValidRecordId('MAT-sodium-chloride')).toBe(true);
    });
    
    it('rejects invalid IDs', () => {
      expect(isValidRecordId('invalid')).toBe(false);
    });
  });
  
  describe('getKindDirectory', () => {
    it('returns standard directory', () => {
      expect(getKindDirectory('study')).toBe('records/study');
    });
    
    it('uses custom base', () => {
      expect(getKindDirectory('study', 'data')).toBe('data/study');
    });
  });
  
  describe('filter functions', () => {
    it('kindFilter filters by kind', () => {
      const filter = kindFilter('study');
      expect(filter('records/study/STU-001__test.yaml')).toBe(true);
      expect(filter('records/material/MAT-001__test.yaml')).toBe(false);
    });
    
    it('prefixFilter filters by prefix', () => {
      const filter = prefixFilter('STU-');
      expect(filter('records/study/STU-001__test.yaml')).toBe(true);
      expect(filter('records/study/EXP-001__test.yaml')).toBe(false);
    });
  });
});

describe('LocalRepoAdapter', () => {
  let adapter: LocalRepoAdapter;
  let testDir: string;
  
  beforeEach(async () => {
    // Create a unique temp directory for each test
    testDir = join(tmpdir(), `repo-test-${randomUUID()}`);
    await mkdir(testDir, { recursive: true });
    adapter = createLocalRepoAdapter({ basePath: testDir });
  });
  
  afterEach(async () => {
    // Clean up
    await rm(testDir, { recursive: true, force: true });
  });
  
  describe('getFile', () => {
    it('returns null for non-existent file', async () => {
      const result = await adapter.getFile('does-not-exist.yaml');
      expect(result).toBeNull();
    });
    
    it('reads existing file', async () => {
      const content = 'hello: world\n';
      await mkdir(join(testDir, 'records'), { recursive: true });
      await writeFile(join(testDir, 'records', 'test.yaml'), content);
      
      const result = await adapter.getFile('records/test.yaml');
      
      expect(result).not.toBeNull();
      expect(result?.content).toBe(content);
      expect(result?.path).toBe('records/test.yaml');
      expect(result?.sha).toBeTruthy();
    });
  });
  
  describe('fileExists', () => {
    it('returns false for non-existent file', async () => {
      expect(await adapter.fileExists('nope.yaml')).toBe(false);
    });
    
    it('returns true for existing file', async () => {
      await writeFile(join(testDir, 'exists.yaml'), 'test');
      expect(await adapter.fileExists('exists.yaml')).toBe(true);
    });
  });
  
  describe('listFiles', () => {
    it('returns empty array for non-existent directory', async () => {
      const files = await adapter.listFiles({ directory: 'nope' });
      expect(files).toEqual([]);
    });
    
    it('lists files in directory', async () => {
      await mkdir(join(testDir, 'records'), { recursive: true });
      await writeFile(join(testDir, 'records', 'a.yaml'), 'a');
      await writeFile(join(testDir, 'records', 'b.yaml'), 'b');
      
      const files = await adapter.listFiles({ directory: 'records' });
      
      expect(files.sort()).toEqual(['records/a.yaml', 'records/b.yaml']);
    });
    
    it('filters by pattern', async () => {
      await mkdir(join(testDir, 'records'), { recursive: true });
      await writeFile(join(testDir, 'records', 'a.yaml'), 'a');
      await writeFile(join(testDir, 'records', 'b.json'), 'b');
      
      const files = await adapter.listFiles({ 
        directory: 'records',
        pattern: '*.yaml',
      });
      
      expect(files).toEqual(['records/a.yaml']);
    });
    
    it('lists recursively', async () => {
      await mkdir(join(testDir, 'records', 'study'), { recursive: true });
      await writeFile(join(testDir, 'records', 'a.yaml'), 'a');
      await writeFile(join(testDir, 'records', 'study', 'b.yaml'), 'b');
      
      const files = await adapter.listFiles({ 
        directory: 'records',
        recursive: true,
      });
      
      expect(files.sort()).toEqual(['records/a.yaml', 'records/study/b.yaml']);
    });
  });
  
  describe('createFile', () => {
    it('creates new file', async () => {
      const result = await adapter.createFile({
        path: 'records/test.yaml',
        content: 'hello: world\n',
        message: 'Create test file',
      });
      
      expect(result.success).toBe(true);
      expect(result.commit).toBeTruthy();
      expect(result.commit?.message).toBe('Create test file');
      
      // Verify file was created
      const file = await adapter.getFile('records/test.yaml');
      expect(file?.content).toBe('hello: world\n');
    });
    
    it('fails if file already exists', async () => {
      await mkdir(join(testDir, 'records'), { recursive: true });
      await writeFile(join(testDir, 'records', 'exists.yaml'), 'existing');
      
      const result = await adapter.createFile({
        path: 'records/exists.yaml',
        content: 'new content',
        message: 'Should fail',
      });
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('already exists');
    });
    
    it('creates parent directories', async () => {
      const result = await adapter.createFile({
        path: 'deep/nested/path/test.yaml',
        content: 'test',
        message: 'Create nested',
      });
      
      expect(result.success).toBe(true);
    });
  });
  
  describe('updateFile', () => {
    it('updates existing file', async () => {
      // Create file first
      await adapter.createFile({
        path: 'records/test.yaml',
        content: 'original',
        message: 'Create',
      });
      
      const file = await adapter.getFile('records/test.yaml');
      
      const result = await adapter.updateFile({
        path: 'records/test.yaml',
        content: 'updated',
        message: 'Update test',
        sha: file!.sha,
      });
      
      expect(result.success).toBe(true);
      
      const updated = await adapter.getFile('records/test.yaml');
      expect(updated?.content).toBe('updated');
    });
    
    it('fails if file does not exist', async () => {
      const result = await adapter.updateFile({
        path: 'nope.yaml',
        content: 'test',
        message: 'Update',
        sha: 'abcd1234',
      });
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
    
    it('fails on SHA mismatch', async () => {
      await adapter.createFile({
        path: 'records/test.yaml',
        content: 'original',
        message: 'Create',
      });
      
      const result = await adapter.updateFile({
        path: 'records/test.yaml',
        content: 'updated',
        message: 'Update',
        sha: 'wrong-sha',
      });
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('SHA mismatch');
    });
  });
  
  describe('deleteFile', () => {
    it('deletes existing file', async () => {
      await adapter.createFile({
        path: 'records/test.yaml',
        content: 'test',
        message: 'Create',
      });
      
      const file = await adapter.getFile('records/test.yaml');
      
      const result = await adapter.deleteFile({
        path: 'records/test.yaml',
        sha: file!.sha,
        message: 'Delete test',
      });
      
      expect(result.success).toBe(true);
      
      // Verify file is gone
      expect(await adapter.fileExists('records/test.yaml')).toBe(false);
    });
    
    it('fails if file does not exist', async () => {
      const result = await adapter.deleteFile({
        path: 'nope.yaml',
        sha: 'abcd',
        message: 'Delete',
      });
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
    
    it('fails on SHA mismatch', async () => {
      await adapter.createFile({
        path: 'records/test.yaml',
        content: 'test',
        message: 'Create',
      });
      
      const result = await adapter.deleteFile({
        path: 'records/test.yaml',
        sha: 'wrong-sha',
        message: 'Delete',
      });
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('SHA mismatch');
    });
  });
  
  describe('getHistory', () => {
    it('returns empty array (no git history in local adapter)', async () => {
      const history = await adapter.getHistory({ path: 'test.yaml' });
      expect(history).toEqual([]);
    });
  });
});
