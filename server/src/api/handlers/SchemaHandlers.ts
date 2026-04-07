/**
 * SchemaHandlers — HTTP handlers for schema introspection.
 * 
 * These handlers provide read-only access to the schema registry.
 * They contain NO schema-specific logic or business rules.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { SchemaRegistry } from '../../schema/SchemaRegistry.js';
import type {
  SchemaResponse,
  SchemaSummary,
  ListSchemasResponse,
  ApiError,
} from '../types.js';
import type { JSONSchema } from '../../schema/json-schema.js';

/**
 * Create schema handlers bound to a SchemaRegistry.
 */
export function createSchemaHandlers(registry: SchemaRegistry) {
  return {
    /**
     * GET /schemas
     * List all schemas.
     */
    async listSchemas(
      _request: FastifyRequest,
      _reply: FastifyReply
    ): Promise<ListSchemasResponse> {
      const entries = registry.getAll();
      
      const schemas: SchemaSummary[] = entries.map(entry => {
        const schema = entry.schema as JSONSchema;
        return {
          id: entry.id,
          path: entry.path,
          dependencyCount: entry.dependencies.length,
          ...(schema.title !== undefined ? { title: schema.title } : {}),
          ...(schema.description !== undefined ? { description: schema.description } : {}),
        };
      });
      
      return {
        schemas,
        total: schemas.length,
      };
    },
    
    /**
     * GET /schemas/:id
     * Get a single schema by $id.
     * 
     * Note: The id parameter is URL-encoded since schema $ids are URIs.
     */
    async getSchema(
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ): Promise<SchemaResponse | ApiError> {
      const { id } = request.params;
      
      // Decode the URI parameter
      const schemaId = decodeURIComponent(id);
      
      const entry = registry.getById(schemaId);
      
      if (!entry) {
        reply.status(404);
        return {
          error: 'NOT_FOUND',
          message: `Schema not found: ${schemaId}`,
        };
      }
      
      // Get dependencies and dependents
      const dependencies = registry.getDependencies(schemaId);
      const dependents = registry.getDependents(schemaId);
      
      return {
        id: entry.id,
        path: entry.path,
        schema: entry.schema,
        dependencies,
        dependents,
      };
    },
    
    /**
     * GET /schemas/by-path/:path
     * Get a schema by its file path.
     */
    async getSchemaByPath(
      request: FastifyRequest<{ Params: { path: string } }>,
      reply: FastifyReply
    ): Promise<SchemaResponse | ApiError> {
      const { path } = request.params;
      
      // Decode the path parameter
      const schemaPath = decodeURIComponent(path);
      
      const entry = registry.getByPath(schemaPath);
      
      if (!entry) {
        reply.status(404);
        return {
          error: 'NOT_FOUND',
          message: `Schema not found at path: ${schemaPath}`,
        };
      }
      
      // Get dependencies and dependents
      const dependencies = registry.getDependencies(entry.id);
      const dependents = registry.getDependents(entry.id);
      
      return {
        id: entry.id,
        path: entry.path,
        schema: entry.schema,
        dependencies,
        dependents,
      };
    },
  };
}

export type SchemaHandlers = ReturnType<typeof createSchemaHandlers>;
