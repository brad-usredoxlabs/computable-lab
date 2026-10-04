/**
 * PROTO-AI-7 — validation of a `protocol_edit` proposal against the
 * REGISTERED op-envelope schema.
 *
 * The single contract for a protocol_edit payload is the PROTO-AI-2 envelope
 * `schema/workflow/protocol-edit-op.schema.yaml` ($id
 * `https://computable-lab.com/schema/computable-lab/protocol-edit-op.schema.yaml`).
 * This module validates the model's payload with that file through the repo's
 * OWN registration pipeline (SchemaLoader → SchemaRegistry → AjvValidator, the
 * same order server.ts uses at boot) — never a hand-rolled TypeScript shape,
 * so the op vocabulary stays DATA. The envelope's only external dependency is
 * `./setting.schema.yaml`, which the recursive load picks up beside it.
 *
 * The validator is built lazily once per process (the schema files are static)
 * and reused for every proposal. A load/compile failure is reported as a
 * validation failure with the cause — never silently treated as "valid".
 */

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSchemasFromContent } from '../schema/SchemaLoader.js';
import { createSchemaRegistry } from '../schema/SchemaRegistry.js';
import { createValidator } from '../validation/AjvValidator.js';
import type { ValidationResult } from '../types/common.js';

/** The envelope's registered $id (PROTO-AI-2). */
export const PROTOCOL_EDIT_OP_SCHEMA_ID =
  'https://computable-lab.com/schema/computable-lab/protocol-edit-op.schema.yaml';

/** Schema files the envelope needs, relative to the schema root. The envelope
 *  is the contract; `setting.schema.yaml` is its one declared $ref dependency. */
const ENVELOPE_FILES = [
  'workflow/protocol-edit-op.schema.yaml',
  'workflow/setting.schema.yaml',
] as const;

/** Candidate schema roots, in trust order: the deployed base path, the repo
 *  layout under a server/ cwd (dev + vitest), then this module's own position
 *  in source and in a flattened dist. */
function candidateSchemaRoots(): string[] {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    ...(process.env.APP_BASE_PATH ? [join(process.env.APP_BASE_PATH, 'schema')] : []),
    join(process.cwd(), 'schema'),
    join(process.cwd(), '..', 'schema'),
    resolve(here, '../../../schema'),
    resolve(here, '../../schema'),
  ];
  return [...new Set(candidates)];
}

let validatorPromise: Promise<{ validate: (data: unknown) => ValidationResult } | { loadError: string }> | null = null;

async function buildEnvelopeValidator() {
  const schemaRoot = candidateSchemaRoots().find((dir) =>
    existsSync(join(dir, ENVELOPE_FILES[0]!)),
  );
  if (!schemaRoot) {
    return {
      loadError:
        `protocol-edit-op.schema.yaml not found under any of: ${candidateSchemaRoots().join(', ')}`,
    } as const;
  }
  try {
    const contents = new Map<string, string>();
    for (const rel of ENVELOPE_FILES) {
      contents.set(rel, await readFile(join(schemaRoot, rel), 'utf8'));
    }
    const loaded = loadSchemasFromContent(contents);
    if (loaded.errors.length > 0) {
      return {
        loadError: `protocol-edit schema load failed: ${loaded.errors.map((e) => `${e.path}: ${e.error}`).join('; ')}`,
      } as const;
    }
    const registry = createSchemaRegistry();
    registry.addSchemas(loaded.entries);
    // Same construction order as server.ts boot: registry first, then Ajv in
    // topological (dependency-first) order. Ajv is configured ONCE here.
    const validator = createValidator();
    for (const id of registry.getTopologicalOrder()) {
      const entry = registry.getById(id);
      if (entry) validator.addSchema(entry.schema as never, entry.id);
    }
    return { validate: (data: unknown) => validator.validate(data, PROTOCOL_EDIT_OP_SCHEMA_ID) } as const;
  } catch (err) {
    return { loadError: `protocol-edit schema validator failed to build: ${err instanceof Error ? err.message : String(err)}` } as const;
  }
}

function getEnvelopeValidator() {
  if (!validatorPromise) validatorPromise = buildEnvelopeValidator();
  return validatorPromise;
}

/** Format Ajv errors the way the corrective loop needs: path, message, and the
 *  teaching suggestion AjvValidator already derives (closest enum, etc.). */
export function formatProtocolEditErrors(result: ValidationResult, max = 6): string {
  const errors = result.errors ?? [];
  const shown = errors.slice(0, max).map((e) => {
    const suggestion = e.suggestion ? ` (${e.suggestion})` : '';
    return `${e.path || '/'}: ${e.message}${suggestion}`;
  });
  const more = errors.length > max ? `; +${errors.length - max} more` : '';
  return `${shown.join('; ')}${more}`;
}

/**
 * Validate a protocol_edit payload (`{ protocolId?, ops: [...] }`) against the
 * registered envelope. The envelope itself decides required-ness and vocabulary
 * — this module adds no rules of its own.
 */
export async function validateProtocolEditPayload(
  payload: Record<string, unknown>,
): Promise<ValidationResult> {
  const built = await getEnvelopeValidator();
  if ('loadError' in built) {
    return {
      valid: false,
      errors: [{ path: '/', message: built.loadError, keyword: 'schema' }],
    };
  }
  return built.validate(payload);
}

/** Reset the lazily built validator (test seam for schema-root experiments). */
export function resetProtocolEditValidatorForTests(): void {
  validatorPromise = null;
}
