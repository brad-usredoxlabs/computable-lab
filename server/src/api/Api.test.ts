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

    const eventGraphSchema = `
$schema: https://json-schema.org/draft/2020-12/schema
$id: https://computable-lab.com/schema/computable-lab/event-graph.schema.yaml
title: EventGraph
type: object
required: [kind, id]
properties:
  kind: { const: event-graph }
  id: { type: string }
  name: { type: string }
  events:
    type: array
    items: { type: object }
  labwares:
    type: array
    items: { type: object }
additionalProperties: true
`;
    await writeFile(resolve(testDir, 'schema/event-graph.schema.yaml'), eventGraphSchema);

    const materialSpecSchema = `
$schema: https://json-schema.org/draft/2020-12/schema
$id: https://computable-lab.com/schema/computable-lab/material-spec.schema.yaml
title: MaterialSpec
type: object
required: [kind, id, name, material_ref]
properties:
  kind: { const: material-spec }
  id: { type: string }
  name: { type: string }
  material_ref:
    type: object
    required: [kind, id, type]
    properties:
      kind: { const: record }
      id: { type: string }
      type: { type: string }
      label: { type: string }
    additionalProperties: true
additionalProperties: true
`;
    await writeFile(resolve(testDir, 'schema/material-spec.schema.yaml'), materialSpecSchema);

    const aliquotSchema = `
$schema: https://json-schema.org/draft/2020-12/schema
$id: https://computable-lab.com/schema/computable-lab/aliquot.schema.yaml
title: Aliquot
type: object
required: [kind, id, material_spec_ref]
properties:
  kind: { const: aliquot }
  id: { type: string }
  name: { type: string }
  description: { type: string }
  material_spec_ref:
    type: object
    required: [kind, id, type]
    properties:
      kind: { const: record }
      id: { type: string }
      type: { type: string }
      label: { type: string }
    additionalProperties: true
  volume:
    type: object
    properties:
      value: { type: number }
      unit: { type: string }
    additionalProperties: true
  concentration:
    type: object
    properties:
      value: { type: number }
      unit: { type: string }
    additionalProperties: true
  tags:
    type: array
    items: { type: string }
additionalProperties: true
`;
    await writeFile(resolve(testDir, 'schema/aliquot.schema.yaml'), aliquotSchema);
    
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
        url: '/api/health',
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
        url: '/api/schemas',
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
        url: `/api/schemas/${schemaId}`,
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
        url: `/api/schemas/${schemaId}`,
      });
      
      expect(response.statusCode).toBe(404);
    });
  });
  
  describe('Validation Routes', () => {
    it('should validate a valid payload', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/validate',
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
        url: '/api/validate',
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
        url: '/api/validate',
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
        url: '/api/records',
      });
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.records).toBeInstanceOf(Array);
    });
    
    it('should create a record', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/records',
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
        url: '/api/records/TEST-001',
      });
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.record.recordId).toBe('TEST-001');
      expect(body.record.payload.name).toBe('My Test Record');
    });
    
    it('should update a record', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/records/TEST-001',
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

    it('should mint and attach an implicit aliquot when saving add_material with a material-spec ref', async () => {
      const seedSpec = await app.inject({
        method: 'POST',
        url: '/api/records',
        payload: {
          schemaId: 'https://computable-lab.com/schema/computable-lab/material-spec.schema.yaml',
          payload: {
            kind: 'material-spec',
            id: 'MSP-001',
            name: '1 mM Clofibrate in DMSO',
            material_ref: { kind: 'record', id: 'MAT-001', type: 'material', label: 'Clofibrate' },
          },
        },
      });
      expect(seedSpec.statusCode).toBe(201);

      const response = await app.inject({
        method: 'POST',
        url: '/api/records',
        payload: {
          schemaId: 'https://computable-lab.com/schema/computable-lab/event-graph.schema.yaml',
          payload: {
            kind: 'event-graph',
            id: 'EVG-001',
            name: 'Spec-first add material',
            labwares: [],
            events: [
              {
                eventId: 'evt-001',
                event_type: 'add_material',
                details: {
                  wells: ['A1'],
                  labwareId: 'plate-1',
                  material_spec_ref: { kind: 'record', id: 'MSP-001', type: 'material-spec', label: '1 mM Clofibrate in DMSO' },
                  volume: { value: 10, unit: 'uL' },
                },
              },
            ],
          },
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.payload);
      expect(body.record?.payload?.events?.[0]?.details?.aliquot_ref?.id).toBe('ALQ-IMPLICIT-EVG_001_EVT_001');

      const aliquot = await app.inject({
        method: 'GET',
        url: '/api/records/ALQ-IMPLICIT-EVG_001_EVT_001',
      });
      expect(aliquot.statusCode).toBe(200);
      const aliquotBody = JSON.parse(aliquot.payload);
      expect(aliquotBody.record.payload.material_spec_ref.id).toBe('MSP-001');
      expect(aliquotBody.record.payload.tags).toContain('implicit');
    });
    
    it('should reject duplicate record creation', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/records',
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
        url: '/api/records/TEST-999',
      });
      
      expect(response.statusCode).toBe(404);
    });
    
    it('should delete a record', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/records/TEST-001',
      });
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
    });
    
    it('should return 404 after deletion', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/records/TEST-001',
      });
      
      expect(response.statusCode).toBe(404);
    });
  });
  
  describe('Lint Routes', () => {
    it('should lint a payload', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/lint',
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
