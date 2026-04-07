/**
 * ValidationHandlers — HTTP handlers for validation and linting.
 * 
 * These handlers allow validating/linting payloads without persisting them.
 * They contain NO schema-specific logic or business rules.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { AjvValidator } from '../../validation/AjvValidator.js';
import type { LintEngine } from '../../lint/LintEngine.js';
import type {
  ValidateRequest,
  ValidateResponse,
  LintRequest,
  LintResponse,
  ApiError,
} from '../types.js';

/**
 * Create validation handlers bound to an AjvValidator and LintEngine.
 */
export function createValidationHandlers(
  validator: AjvValidator,
  lintEngine: LintEngine
) {
  return {
    /**
     * POST /validate
     * Validate a payload against a schema.
     */
    async validate(
      request: FastifyRequest<{ Body: ValidateRequest }>,
      reply: FastifyReply
    ): Promise<ValidateResponse | ApiError> {
      try {
        const { schemaId, payload } = request.body;
        
        // Validate request
        if (!schemaId) {
          reply.status(400);
          return {
            error: 'BAD_REQUEST',
            message: 'schemaId is required',
          };
        }
        
        if (payload === undefined) {
          reply.status(400);
          return {
            error: 'BAD_REQUEST',
            message: 'payload is required',
          };
        }
        
        // Check if schema exists
        if (!validator.hasSchema(schemaId)) {
          reply.status(404);
          return {
            error: 'NOT_FOUND',
            message: `Schema not found: ${schemaId}`,
          };
        }
        
        // Validate
        const result = validator.validate(payload, schemaId);
        
        return {
          schemaId,
          valid: result.valid,
          errors: result.errors,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: `Validation failed: ${message}`,
        };
      }
    },
    
    /**
     * POST /lint
     * Lint a payload against rules.
     */
    async lint(
      request: FastifyRequest<{ Body: LintRequest }>,
      reply: FastifyReply
    ): Promise<LintResponse | ApiError> {
      try {
        const { schemaId, payload } = request.body;
        
        // Validate request
        if (payload === undefined) {
          reply.status(400);
          return {
            error: 'BAD_REQUEST',
            message: 'payload is required',
          };
        }
        
        // Lint
        const result = lintEngine.lint(payload, schemaId);
        
        return {
          valid: result.valid,
          violations: result.violations,
          ...(result.summary !== undefined ? { summary: result.summary } : {}),
          ...(schemaId !== undefined ? { schemaId } : {}),
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: `Linting failed: ${message}`,
        };
      }
    },
    
    /**
     * POST /validate-full
     * Validate and lint a payload in one request.
     */
    async validateFull(
      request: FastifyRequest<{ Body: ValidateRequest }>,
      reply: FastifyReply
    ): Promise<{ validation: ValidateResponse; lint: LintResponse } | ApiError> {
      try {
        const { schemaId, payload } = request.body;
        
        // Validate request
        if (!schemaId) {
          reply.status(400);
          return {
            error: 'BAD_REQUEST',
            message: 'schemaId is required',
          };
        }
        
        if (payload === undefined) {
          reply.status(400);
          return {
            error: 'BAD_REQUEST',
            message: 'payload is required',
          };
        }
        
        // Check if schema exists
        if (!validator.hasSchema(schemaId)) {
          reply.status(404);
          return {
            error: 'NOT_FOUND',
            message: `Schema not found: ${schemaId}`,
          };
        }
        
        // Validate
        const validationResult = validator.validate(payload, schemaId);
        
        // Lint
        const lintResult = lintEngine.lint(payload, schemaId);
        
        return {
          validation: {
            schemaId,
            valid: validationResult.valid,
            errors: validationResult.errors,
          },
          lint: {
            valid: lintResult.valid,
            violations: lintResult.violations,
            ...(lintResult.summary !== undefined ? { summary: lintResult.summary } : {}),
            schemaId,
          },
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: `Full validation failed: ${message}`,
        };
      }
    },
  };
}

export type ValidationHandlers = ReturnType<typeof createValidationHandlers>;
