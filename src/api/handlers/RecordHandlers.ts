/**
 * RecordHandlers — HTTP handlers for record CRUD operations.
 * 
 * These handlers are thin wrappers around RecordStore.
 * They contain NO schema-specific logic or business rules.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { RecordStore } from '../../store/types.js';
import type { IndexManager } from '../../index/IndexManager.js';
import { createEnvelope, extractRecordId } from '../../types/RecordEnvelope.js';
import type {
  CreateRecordRequest,
  UpdateRecordRequest,
  ListRecordsQuery,
  RecordResponse,
  RecordMutationResponse,
  ListRecordsResponse,
  ApiError,
} from '../types.js';

/**
 * Create record handlers bound to a RecordStore and optional IndexManager.
 */
export function createRecordHandlers(store: RecordStore, indexManager?: IndexManager) {
  return {
    /**
     * GET /records
     * List records with optional filtering.
     */
    async listRecords(
      request: FastifyRequest<{ Querystring: ListRecordsQuery }>,
      reply: FastifyReply
    ): Promise<ListRecordsResponse | ApiError> {
      try {
        const { kind, schemaId, idPrefix, limit, offset } = request.query;
        
        const records = await store.list({
          ...(kind !== undefined ? { kind } : {}),
          ...(schemaId !== undefined ? { schemaId } : {}),
          ...(idPrefix !== undefined ? { idPrefix } : {}),
          ...(limit !== undefined ? { limit: Number(limit) } : {}),
          ...(offset !== undefined ? { offset: Number(offset) } : {}),
        });
        
        return {
          records,
          total: records.length, // Note: This is the returned count, not total available
          ...(limit !== undefined ? { limit: Number(limit) } : {}),
          ...(offset !== undefined ? { offset: Number(offset) } : {}),
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: `Failed to list records: ${message}`,
        };
      }
    },
    
    /**
     * GET /records/:id
     * Get a single record by ID.
     */
    async getRecord(
      request: FastifyRequest<{
        Params: { id: string };
        Querystring: { validate?: string; lint?: string };
      }>,
      reply: FastifyReply
    ): Promise<RecordResponse | ApiError> {
      try {
        const { id } = request.params;
        const validate = request.query.validate === 'true';
        const lint = request.query.lint === 'true';
        
        if (validate || lint) {
          const result = await store.getWithValidation({
            recordId: id,
            validate,
            lint,
          });
          
          if (!result.success || !result.envelope) {
            reply.status(404);
            return {
              error: 'NOT_FOUND',
              message: result.error || `Record not found: ${id}`,
            };
          }
          
          return {
            record: result.envelope,
            ...(result.validation !== undefined ? { validation: result.validation } : {}),
            ...(result.lint !== undefined ? { lint: result.lint } : {}),
          };
        }
        
        const record = await store.get(id);
        
        if (!record) {
          reply.status(404);
          return {
            error: 'NOT_FOUND',
            message: `Record not found: ${id}`,
          };
        }
        
        return { record };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: `Failed to get record: ${message}`,
        };
      }
    },
    
    /**
     * POST /records
     * Create a new record.
     */
    async createRecord(
      request: FastifyRequest<{ Body: CreateRecordRequest }>,
      reply: FastifyReply
    ): Promise<RecordMutationResponse | ApiError> {
      try {
        const { schemaId, payload, message } = request.body;
        
        // Validate request
        if (!schemaId) {
          reply.status(400);
          return {
            error: 'BAD_REQUEST',
            message: 'schemaId is required',
          };
        }
        
        if (!payload) {
          reply.status(400);
          return {
            error: 'BAD_REQUEST',
            message: 'payload is required',
          };
        }
        
        // Extract recordId from payload
        const recordId = extractRecordId(payload);
        if (!recordId) {
          reply.status(400);
          return {
            error: 'BAD_REQUEST',
            message: 'payload must contain recordId or id field',
          };
        }
        
        // Create envelope
        const envelope = createEnvelope(payload, schemaId);
        if (!envelope) {
          reply.status(400);
          return {
            error: 'BAD_REQUEST',
            message: 'Failed to create envelope from payload',
          };
        }
        
        // Create record
        const result = await store.create({
          envelope,
          ...(message !== undefined ? { message } : {}),
        });
        
        if (!result.success) {
          // Check for validation/lint failures
          if (result.validation && !result.validation.valid) {
            reply.status(422);
            return {
              success: false,
              validation: result.validation,
              error: 'Validation failed',
            };
          }
          
          if (result.lint && !result.lint.valid) {
            reply.status(422);
            return {
              success: false,
              lint: result.lint,
              error: 'Lint failed',
            };
          }
          
          // Check for duplicate
          if (result.error?.includes('already exists')) {
            reply.status(409);
            return {
              success: false,
              error: result.error,
            };
          }
          
          reply.status(400);
          return {
            success: false,
            error: result.error || 'Failed to create record',
          };
        }
        
        reply.status(201);
        
        // Update index after successful create
        if (indexManager && result.envelope) {
          try {
            // Path is available in result.envelope.meta?.path if needed
            await indexManager.rebuild(); // For now, rebuild to ensure consistency
          } catch (indexErr) {
            console.error('Failed to update index after create:', indexErr);
          }
        }
        
        // Build response with conditional properties (exactOptionalPropertyTypes)
        const response: RecordMutationResponse = {
          success: true,
          ...(result.envelope !== undefined ? { record: result.envelope } : {}),
          ...(result.validation !== undefined ? { validation: result.validation } : {}),
          ...(result.lint !== undefined ? { lint: result.lint } : {}),
          ...(result.commit !== undefined ? { commit: result.commit } : {}),
        };
        return response;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const stack = err instanceof Error ? err.stack : undefined;
        console.error('CREATE RECORD ERROR:', message);
        console.error('Stack:', stack);
        console.error('Request body:', JSON.stringify(request.body, null, 2));
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: `Failed to create record: ${message}`,
        };
      }
    },
    
    /**
     * PUT /records/:id
     * Update an existing record.
     */
    async updateRecord(
      request: FastifyRequest<{
        Params: { id: string };
        Body: UpdateRecordRequest;
      }>,
      reply: FastifyReply
    ): Promise<RecordMutationResponse | ApiError> {
      try {
        const { id } = request.params;
        const { payload, expectedSha, message } = request.body;
        
        // Validate request
        if (!payload) {
          reply.status(400);
          return {
            error: 'BAD_REQUEST',
            message: 'payload is required',
          };
        }
        
        // Get existing record to get schemaId
        const existing = await store.get(id);
        if (!existing) {
          reply.status(404);
          return {
            error: 'NOT_FOUND',
            message: `Record not found: ${id}`,
          };
        }
        
        // Create updated envelope (handle meta per exactOptionalPropertyTypes)
        const envelope = {
          recordId: id,
          schemaId: existing.schemaId,
          payload,
          ...(existing.meta !== undefined ? { meta: existing.meta } : {}),
        };
        
        // Update record
        const result = await store.update({
          envelope,
          ...(expectedSha !== undefined ? { expectedSha } : {}),
          ...(message !== undefined ? { message } : {}),
        });
        
        if (!result.success) {
          // Check for validation/lint failures
          if (result.validation && !result.validation.valid) {
            reply.status(422);
            return {
              success: false,
              validation: result.validation,
              error: 'Validation failed',
            };
          }
          
          if (result.lint && !result.lint.valid) {
            reply.status(422);
            return {
              success: false,
              lint: result.lint,
              error: 'Lint failed',
            };
          }
          
          // Check for SHA mismatch
          if (result.error?.includes('SHA mismatch')) {
            reply.status(409);
            return {
              success: false,
              error: result.error,
            };
          }
          
          reply.status(400);
          return {
            success: false,
            error: result.error || 'Failed to update record',
          };
        }
        
        // Update index after successful update
        if (indexManager && result.envelope) {
          try {
            await indexManager.rebuild(); // For now, rebuild to ensure consistency
          } catch (indexErr) {
            console.error('Failed to update index after update:', indexErr);
          }
        }
        
        // Build response with conditional properties (exactOptionalPropertyTypes)
        const response: RecordMutationResponse = {
          success: true,
          ...(result.envelope !== undefined ? { record: result.envelope } : {}),
          ...(result.validation !== undefined ? { validation: result.validation } : {}),
          ...(result.lint !== undefined ? { lint: result.lint } : {}),
          ...(result.commit !== undefined ? { commit: result.commit } : {}),
        };
        return response;
      } catch (err) {
        const errMessage = err instanceof Error ? err.message : String(err);
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: `Failed to update record: ${errMessage}`,
        };
      }
    },
    
    /**
     * DELETE /records/:id
     * Delete a record.
     */
    async deleteRecord(
      request: FastifyRequest<{
        Params: { id: string };
        Querystring: { expectedSha?: string };
      }>,
      reply: FastifyReply
    ): Promise<RecordMutationResponse | ApiError> {
      try {
        const { id } = request.params;
        const { expectedSha } = request.query;
        
        // Check if record exists
        const exists = await store.exists(id);
        if (!exists) {
          reply.status(404);
          return {
            error: 'NOT_FOUND',
            message: `Record not found: ${id}`,
          };
        }
        
        // Delete record
        const result = await store.delete({
          recordId: id,
          ...(expectedSha !== undefined ? { expectedSha } : {}),
        });
        
        if (!result.success) {
          // Check for SHA mismatch
          if (result.error?.includes('SHA mismatch')) {
            reply.status(409);
            return {
              success: false,
              error: result.error,
            };
          }
          
          reply.status(400);
          return {
            success: false,
            error: result.error || 'Failed to delete record',
          };
        }
        
        // Update index after successful delete
        if (indexManager) {
          try {
            await indexManager.rebuild(); // For now, rebuild to ensure consistency
          } catch (indexErr) {
            console.error('Failed to update index after delete:', indexErr);
          }
        }
        
        return {
          success: true,
          ...(result.commit !== undefined ? { commit: result.commit } : {}),
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: `Failed to delete record: ${message}`,
        };
      }
    },
  };
}

export type RecordHandlers = ReturnType<typeof createRecordHandlers>;
