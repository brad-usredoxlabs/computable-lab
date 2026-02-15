/**
 * MCP tools for structural validation and linting.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AppContext } from '../../server.js';
import type { ToolRegistry } from '../../ai/ToolRegistry.js';
import { dualRegister } from './dualRegister.js';
import { jsonResult, errorResult } from '../helpers.js';

export function registerValidationTools(server: McpServer, ctx: AppContext, registry?: ToolRegistry): void {
  // validate_payload — Structural validation only
  dualRegister(server, registry,
    'validate_payload',
    'Validate a payload against a JSON Schema. Returns validation errors if any.',
    {
      schemaId: z.string().describe('Schema ID to validate against'),
      payload: z.record(z.string(), z.unknown()).describe('Payload to validate'),
    },
    async (args) => {
      try {
        const result = ctx.validator.validate(args.payload, args.schemaId);
        return jsonResult(result);
      } catch (err) {
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );

  // lint_payload — Business rule linting only
  dualRegister(server, registry,
    'lint_payload',
    'Lint a payload against business rules defined in lint specs. Returns violations if any.',
    {
      payload: z.record(z.string(), z.unknown()).describe('Payload to lint'),
      schemaId: z.string().optional().describe('Schema ID for scoped lint rules (optional)'),
    },
    async (args) => {
      try {
        const result = ctx.lintEngine.lint(args.payload, args.schemaId);
        return jsonResult(result);
      } catch (err) {
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );

  // validate_full — Both structural validation and lint
  dualRegister(server, registry,
    'validate_full',
    'Run both structural validation and lint rules against a payload. Returns combined results.',
    {
      schemaId: z.string().describe('Schema ID to validate against'),
      payload: z.record(z.string(), z.unknown()).describe('Payload to validate and lint'),
    },
    async (args) => {
      try {
        const validation = ctx.validator.validate(args.payload, args.schemaId);
        const lint = ctx.lintEngine.lint(args.payload, args.schemaId);
        return jsonResult({
          valid: validation.valid && lint.valid,
          validation,
          lint,
        });
      } catch (err) {
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );
}
