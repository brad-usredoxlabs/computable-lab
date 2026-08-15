/**
 * localProtocolSchema.fixtures — test harness for local-protocol schema validation.
 *
 * Loads the FULL schema set (every .schema.yaml under schema/, recursively —
 * via the same registry + Ajv harness the production server uses). The known
 * pitfall: `unevaluatedProperties`/`$ref` chains on local-protocol only
 * resolve when the entire registry is present (the FAIRCommon allOf, the Ref
 * datatype, etc.), so partial per-file loading gives false negatives.
 *
 * The validator is built once per test process (cached) — loading + compiling
 * 140+ schemas per test would be needlessly slow.
 */
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAllSchemas } from '../../schema/SchemaLoader.js';
import { createSchemaRegistry } from '../../schema/SchemaRegistry.js';
import { createValidator } from '../../validation/AjvValidator.js';
import type { ValidationResult } from '../../types/common.js';

export const LOCAL_PROTOCOL_SCHEMA_ID =
  'https://computable-lab.com/schema/computable-lab/local-protocol.schema.yaml';

/** Repo root (server/src/compiler/protocol → up 4 levels). */
const REPO_ROOT = join(fileURLToPath(new URL('../../../../', import.meta.url)));

let cachedValidator: ReturnType<typeof createValidator> | undefined;

async function getValidator(): Promise<ReturnType<typeof createValidator>> {
  if (!cachedValidator) {
    const registry = createSchemaRegistry();
    const validator = createValidator({ strict: false });
    const schemaRoot = join(REPO_ROOT, 'schema');
    const result = await loadAllSchemas({ basePath: schemaRoot, recursive: true });
    if (result.errors.length > 0) {
      throw new Error(
        `Schema loading errors (harness broken, not the payload): ${JSON.stringify(result.errors)}`,
      );
    }
    registry.addSchemas(result.entries);
    for (const id of registry.getTopologicalOrder()) {
      const entry = registry.getById(id);
      if (entry) validator.addSchema(entry.schema, entry.id);
    }
    cachedValidator = validator;
  }
  return cachedValidator;
}

/**
 * Validate a local-protocol payload against the full-schema registry.
 * Returns the validator's { valid, errors } shape directly.
 */
export async function validateLocalProtocolFixture(
  payload: unknown,
): Promise<ValidationResult> {
  const validator = await getValidator();
  return validator.validate(payload, LOCAL_PROTOCOL_SCHEMA_ID);
}
