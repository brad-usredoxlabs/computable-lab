/**
 * Route configuration for the API.
 * 
 * This module registers all API routes on a Fastify instance.
 * Route handlers are thin wrappers with no schema-specific logic.
 */

import type { FastifyInstance } from 'fastify';
import type { RecordHandlers } from './handlers/RecordHandlers.js';
import type { SchemaHandlers } from './handlers/SchemaHandlers.js';
import type { ValidationHandlers } from './handlers/ValidationHandlers.js';
import type { UIHandlers } from './handlers/UIHandlers.js';
import type { HealthResponse } from './types.js';

/**
 * Options for registering routes.
 */
export interface RouteOptions {
  recordHandlers: RecordHandlers;
  schemaHandlers: SchemaHandlers;
  validationHandlers: ValidationHandlers;
  uiHandlers?: UIHandlers;
  schemaCount: () => number;
  ruleCount: () => number;
  uiSpecCount?: () => number;
}

/**
 * Register all API routes on a Fastify instance.
 */
export function registerRoutes(
  fastify: FastifyInstance,
  options: RouteOptions
): void {
  const {
    recordHandlers,
    schemaHandlers,
    validationHandlers,
    schemaCount,
    ruleCount,
  } = options;
  
  // ============================================================================
  // Health Check
  // ============================================================================
  
  fastify.get('/health', async (): Promise<HealthResponse> => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      components: {
        schemas: { loaded: schemaCount() },
        lintRules: { loaded: ruleCount() },
      },
    };
  });
  
  // ============================================================================
  // Record Routes
  // ============================================================================
  
  // List records
  fastify.get('/records', recordHandlers.listRecords.bind(recordHandlers));
  
  // Get single record
  fastify.get('/records/:id', recordHandlers.getRecord.bind(recordHandlers));
  
  // Create record
  fastify.post('/records', recordHandlers.createRecord.bind(recordHandlers));
  
  // Update record
  fastify.put('/records/:id', recordHandlers.updateRecord.bind(recordHandlers));
  
  // Delete record
  fastify.delete('/records/:id', recordHandlers.deleteRecord.bind(recordHandlers));
  
  // ============================================================================
  // Schema Routes
  // ============================================================================
  
  // List schemas
  fastify.get('/schemas', schemaHandlers.listSchemas.bind(schemaHandlers));
  
  // Get schema by $id (URL-encoded)
  fastify.get('/schemas/:id', schemaHandlers.getSchema.bind(schemaHandlers));
  
  // Get schema by file path (URL-encoded)
  fastify.get('/schemas/by-path/:path', schemaHandlers.getSchemaByPath.bind(schemaHandlers));
  
  // ============================================================================
  // Validation Routes
  // ============================================================================
  
  // Validate payload against schema
  fastify.post('/validate', validationHandlers.validate.bind(validationHandlers));
  
  // Lint payload
  fastify.post('/lint', validationHandlers.lint.bind(validationHandlers));
  
  // Full validation (validate + lint)
  fastify.post('/validate-full', validationHandlers.validateFull.bind(validationHandlers));
  
  // ============================================================================
  // UI Routes (optional - requires uiHandlers)
  // ============================================================================
  
  const { uiHandlers } = options;
  
  if (uiHandlers) {
    // List UI specs
    fastify.get('/ui/specs', uiHandlers.listUISpecs.bind(uiHandlers));
    
    // Get UI spec for a schema
    fastify.get('/ui/schema/:schemaId', uiHandlers.getUISpecForSchema.bind(uiHandlers));
    
    // Get record with UI spec (for rendering)
    fastify.get('/ui/record/:recordId', uiHandlers.getRecordWithUI.bind(uiHandlers));
  }
}
