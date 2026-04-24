/**
 * Tests that the schema entrypoint enum and VALID_ENTRYPOINTS are in sync.
 *
 * Guards against future drift between the hand-authored schema file and the
 * code-level constant.  See spec-002-pipeline-schema-alignment.
 */

import { describe, it, expect } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VALID_ENTRYPOINTS } from './PipelineLoader.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Path to the compile-pipeline schema YAML file.
 */
const SCHEMA_PATH = join(
  __dirname,
  '../../../../schema/registry/compile-pipelines/compile-pipeline.schema.yaml',
);

describe('schemaEntrypointAlignment', () => {
  it('schema entrypoint enum matches VALID_ENTRYPOINTS', () => {
    const raw = readFileSync(SCHEMA_PATH, 'utf-8');
    const schema = parseYaml(raw) as Record<string, unknown>;
    const properties = schema.properties as Record<string, unknown>;
    const entrypointDef = properties.entrypoint as Record<string, unknown>;
    const schemaEnum = entrypointDef.enum as string[];

    const schemaSet = new Set(schemaEnum);
    const codeSet = new Set(VALID_ENTRYPOINTS);

    expect(schemaSet.size).toBe(codeSet.size);
    expect(schemaSet).toEqual(codeSet);
  });
});
