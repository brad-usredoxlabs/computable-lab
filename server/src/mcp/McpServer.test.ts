/**
 * Integration tests for MCP server layer.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { initializeApp, type AppContext } from '../server.js';
import { createMcpServer } from './McpServerFactory.js';
import { jsonResult, errorResult, textResult } from './helpers.js';

// Test fixtures
const TEST_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://computable-lab.com/schema/test/sample.schema.yaml',
  type: 'object',
  properties: {
    recordId: { type: 'string' },
    kind: { type: 'string', const: 'sample' },
    title: { type: 'string' },
    status: { type: 'string' },
  },
  required: ['recordId', 'kind', 'title'],
};

describe('MCP Server', () => {
  let ctx: AppContext;
  let server: McpServer;
  let testDir: string;

  beforeAll(async () => {
    testDir = join(tmpdir(), `mcp-test-${randomUUID()}`);
    await mkdir(testDir, { recursive: true });

    // Create schema directory with a test schema
    const schemaDir = join(testDir, 'schema', 'test');
    await mkdir(schemaDir, { recursive: true });

    // Write schema as JSON (the loader supports YAML too, but JSON is simpler for tests)
    const { stringify } = await import('yaml');
    await writeFile(
      join(schemaDir, 'sample.schema.yaml'),
      stringify(TEST_SCHEMA)
    );

    // Create records directory
    await mkdir(join(testDir, 'records'), { recursive: true });

    // Initialize app context
    ctx = await initializeApp(testDir);
    server = createMcpServer(ctx);
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('createMcpServer', () => {
    it('creates an McpServer instance', () => {
      expect(server).toBeInstanceOf(McpServer);
    });
  });

  describe('helpers', () => {
    it('textResult creates text content', () => {
      const result = textResult('hello');
      expect(result.content).toEqual([{ type: 'text', text: 'hello' }]);
    });

    it('jsonResult creates JSON text content', () => {
      const result = jsonResult({ foo: 1 });
      expect(result.content).toEqual([{ type: 'text', text: '{\n  "foo": 1\n}' }]);
    });

    it('errorResult creates error content', () => {
      const result = errorResult('bad');
      expect(result.content).toEqual([{ type: 'text', text: 'bad' }]);
      expect(result.isError).toBe(true);
    });
  });

  describe('schema tools', () => {
    it('schema_list returns loaded schemas', async () => {
      const entries = ctx.schemaRegistry.getAll();
      expect(entries.length).toBeGreaterThan(0);

      // Verify the test schema was loaded
      const ids = entries.map((e) => e.id);
      expect(ids).toContain(TEST_SCHEMA.$id);
    });

    it('schema_get returns a specific schema', () => {
      const entry = ctx.schemaRegistry.getById(TEST_SCHEMA.$id);
      expect(entry).toBeDefined();
      expect(entry!.schema).toMatchObject({
        type: 'object',
        properties: expect.objectContaining({
          recordId: { type: 'string' },
        }),
      });
    });
  });

  describe('record tools (via store)', () => {
    it('record_create and record_get round-trip', async () => {
      const envelope = {
        recordId: 'MCPT-001',
        schemaId: TEST_SCHEMA.$id,
        payload: {
          recordId: 'MCPT-001',
          kind: 'sample',
          title: 'MCP Test Record',
        },
      };

      const createResult = await ctx.store.create({ envelope });
      expect(createResult.success).toBe(true);

      const fetched = await ctx.store.get('MCPT-001');
      expect(fetched).not.toBeNull();
      expect(fetched!.recordId).toBe('MCPT-001');
      expect((fetched!.payload as Record<string, unknown>).title).toBe('MCP Test Record');
    });

    it('record_update modifies a record', async () => {
      const existing = await ctx.store.get('MCPT-001');
      expect(existing).not.toBeNull();

      const updateResult = await ctx.store.update({
        envelope: {
          ...existing!,
          payload: {
            ...(existing!.payload as Record<string, unknown>),
            title: 'Updated MCP Test Record',
          },
        },
      });
      expect(updateResult.success).toBe(true);

      const fetched = await ctx.store.get('MCPT-001');
      expect((fetched!.payload as Record<string, unknown>).title).toBe('Updated MCP Test Record');
    });

    it('record_search finds records', async () => {
      // Rebuild index to include our test record
      await ctx.indexManager.rebuild();

      const results = await ctx.indexManager.search('MCP', 10);
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.recordId === 'MCPT-001')).toBe(true);
    });

    it('record_delete removes a record', async () => {
      const deleteResult = await ctx.store.delete({ recordId: 'MCPT-001' });
      expect(deleteResult.success).toBe(true);

      const fetched = await ctx.store.get('MCPT-001');
      expect(fetched).toBeNull();
    });
  });

  describe('validation tools (via validator)', () => {
    it('validate_payload passes valid data', () => {
      const result = ctx.validator.validate(
        { recordId: 'X-001', kind: 'sample', title: 'Test' },
        TEST_SCHEMA.$id
      );
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('validate_payload fails invalid data', () => {
      const result = ctx.validator.validate(
        { recordId: 'X-001' },
        TEST_SCHEMA.$id
      );
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('tree tools (via indexManager)', () => {
    it('tree_studies returns study hierarchy', async () => {
      const studies = await ctx.indexManager.getStudyTree();
      expect(Array.isArray(studies)).toBe(true);
    });

    it('tree_inbox returns inbox records', async () => {
      const inbox = await ctx.indexManager.getInbox();
      expect(Array.isArray(inbox)).toBe(true);
    });
  });

  describe('git tools (via repoAdapter)', () => {
    it('git_history returns history', async () => {
      // LocalRepoAdapter may return empty history, but shouldn't throw
      const history = await ctx.repoAdapter.getHistory({ path: '.', limit: 5 });
      expect(Array.isArray(history)).toBe(true);
    });
  });
});
