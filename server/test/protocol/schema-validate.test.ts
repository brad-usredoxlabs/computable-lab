/**
 * Protocol schema — long-form human-readable text (`humanStepsText`).
 * Kept alongside the concise machine-executable `steps[]`. Verified at the
 * load/registry level (cross-schema $ref resolution is a known test
 * limitation, so we don't run Ajv here).
 */
import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { loadAllSchemas } from '../../src/schema/SchemaLoader.js';

describe('protocol.humanStepsText schema', () => {
  const schemaDir = join(process.cwd(), 'schema');

  it('declares humanStepsText as an optional string', async () => {
    const result = await loadAllSchemas({ basePath: schemaDir });
    const protocol = result.entries.find((e) => e.id.endsWith('/protocol.schema.yaml'));
    expect(protocol).toBeDefined();

    const schema = protocol!.schema as Record<string, unknown>;
    const props = schema.properties as Record<string, unknown>;
    expect(props).toHaveProperty('humanStepsText');

    const field = props.humanStepsText as Record<string, unknown>;
    expect(field.type).toBe('string');
  });

  it('does not make humanStepsText required (concise steps[] stay the required form)', async () => {
    const result = await loadAllSchemas({ basePath: schemaDir });
    const protocol = result.entries.find((e) => e.id.endsWith('/protocol.schema.yaml'))!;
    const schema = protocol.schema as Record<string, unknown>;
    const required = schema.required as string[];
    expect(required).not.toContain('humanStepsText');
  });
});
