/**
 * E2E tests for the HTTP API.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resolve } from 'node:path';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import type { FastifyInstance } from 'fastify';
import { initializeApp, createServer } from '../server.js';
import type { AppContext } from '../server.js';

describe('API E2E Tests', () => {
  let app: FastifyInstance;
  let ctx: AppContext;
  const testDir = resolve(process.cwd(), 'tmp/api-test');
  
  beforeAll(async () => {
    // Create test directory structure
    await mkdir(resolve(testDir, 'schema'), { recursive: true });
    await mkdir(resolve(testDir, 'records'), { recursive: true });
    
    // Create a minimal test schema
    const testSchema = `
$schema: https://json-schema.org/draft/2020-12/schema
$id: https://test.com/schema/test-record.schema.yaml
title: TestRecord
type: object
required:
  - kind
  - recordId
  - name
properties:
  kind:
    type: string
    const: test
  recordId:
    type: string
    pattern: "^TEST-[0-9]+$"
  name:
    type: string
`;
    await writeFile(resolve(testDir, 'schema/test-record.schema.yaml'), testSchema);
    
    // Initialize app with test directory
    ctx = await initializeApp(testDir, {
      schemaDir: 'schema',
      recordsDir: 'records',
      logLevel: 'silent',
    });
    
    // Create server
    app = await createServer(ctx, {
      logLevel: 'silent',
    });
    
    await app.ready();
  });
  
  afterAll(async () => {
    await app.close();
    // Cleanup test directory
    await rm(testDir, { recursive: true, force: true });
  });
  
  describe('Health Check', () => {
    it('should return health status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.status).toBe('ok');
      expect(body.timestamp).toBeDefined();
      expect(body.components?.schemas?.loaded).toBeGreaterThanOrEqual(1);
    });
  });
  
  describe('Schema Routes', () => {
    it('should list schemas', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/schemas',
      });
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.schemas).toBeInstanceOf(Array);
      expect(body.total).toBeGreaterThanOrEqual(1);
    });
    
    it('should get a schema by ID', async () => {
      const schemaId = encodeURIComponent('https://test.com/schema/test-record.schema.yaml');
      const response = await app.inject({
        method: 'GET',
        url: `/schemas/${schemaId}`,
      });
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.id).toBe('https://test.com/schema/test-record.schema.yaml');
      expect(body.schema).toBeDefined();
    });
    
    it('should return 404 for non-existent schema', async () => {
      const schemaId = encodeURIComponent('https://test.com/schema/nonexistent.schema.yaml');
      const response = await app.inject({
        method: 'GET',
        url: `/schemas/${schemaId}`,
      });
      
      expect(response.statusCode).toBe(404);
    });
  });
  
  describe('Validation Routes', () => {
    it('should validate a valid payload', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/validate',
        payload: {
          schemaId: 'https://test.com/schema/test-record.schema.yaml',
          payload: {
            kind: 'test',
            recordId: 'TEST-001',
            name: 'Test Record',
          },
        },
      });
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.valid).toBe(true);
      expect(body.errors).toEqual([]);
    });
    
    it('should reject an invalid payload', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/validate',
        payload: {
          schemaId: 'https://test.com/schema/test-record.schema.yaml',
          payload: {
            kind: 'test',
            // missing recordId and name
          },
        },
      });
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.valid).toBe(false);
      expect(body.errors.length).toBeGreaterThan(0);
    });
    
    it('should return 404 for non-existent schema', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/validate',
        payload: {
          schemaId: 'https://test.com/schema/nonexistent.schema.yaml',
          payload: {},
        },
      });
      
      expect(response.statusCode).toBe(404);
    });
  });
  
  describe('Record Routes', () => {
    it('should list records (initially empty)', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/records',
      });
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.records).toBeInstanceOf(Array);
    });
    
    it('should create a record', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/records',
        payload: {
          schemaId: 'https://test.com/schema/test-record.schema.yaml',
          payload: {
            kind: 'test',
            recordId: 'TEST-001',
            name: 'My Test Record',
          },
        },
      });
      
      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.record?.recordId).toBe('TEST-001');
    });
    
    it('should get a record by ID', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/records/TEST-001',
      });
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.record.recordId).toBe('TEST-001');
      expect(body.record.payload.name).toBe('My Test Record');
    });
    
    it('should update a record', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/records/TEST-001',
        payload: {
          payload: {
            kind: 'test',
            recordId: 'TEST-001',
            name: 'Updated Test Record',
          },
        },
      });
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.record?.payload.name).toBe('Updated Test Record');
    });
    
    it('should reject duplicate record creation', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/records',
        payload: {
          schemaId: 'https://test.com/schema/test-record.schema.yaml',
          payload: {
            kind: 'test',
            recordId: 'TEST-001',
            name: 'Duplicate',
          },
        },
      });
      
      expect(response.statusCode).toBe(409);
      const body = JSON.parse(response.payload);
      expect(body.error).toContain('already exists');
    });
    
    it('should return 404 for non-existent record', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/records/TEST-999',
      });
      
      expect(response.statusCode).toBe(404);
    });
    
    it('should delete a record', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/records/TEST-001',
      });
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
    });
    
    it('should return 404 after deletion', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/records/TEST-001',
      });
      
      expect(response.statusCode).toBe(404);
    });
  });
  
  describe('Lint Routes', () => {
    it('should lint a payload', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/lint',
        payload: {
          payload: {
            kind: 'test',
            recordId: 'TEST-002',
            name: 'Test for linting',
          },
        },
      });
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.valid).toBe(true);
      expect(body.violations).toBeInstanceOf(Array);
    });
  });
});
