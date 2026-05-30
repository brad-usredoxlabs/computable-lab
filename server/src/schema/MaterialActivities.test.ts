/**
 * Phase 5 (#9 / role-mechanism): the material schema carries an additive
 * activities[] field — "what a material DOES" (agonist-of PPARα), distinct from
 * class[] ("what it IS"). Verified at the load/registry level (cross-schema
 * $ref resolution is a known test limitation, so we don't run Ajv here).
 */
import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { loadAllSchemas } from './SchemaLoader.js';

describe('material.activities schema', () => {
  const schemaDir = join(process.cwd(), 'schema');

  it('loads the full schema set with material carrying activities[]', async () => {
    const result = await loadAllSchemas({ basePath: schemaDir });
    const material = result.entries.find((e) => e.id.endsWith('/material.schema.yaml'));
    expect(material).toBeDefined();

    const schema = material!.schema as Record<string, unknown>;
    const props = schema.properties as Record<string, unknown>;
    expect(props).toHaveProperty('activities');

    const activities = props.activities as Record<string, unknown>;
    expect(activities.type).toBe('array');

    const items = activities.items as Record<string, unknown>;
    expect(items.required).toEqual(expect.arrayContaining(['relation', 'term']));

    const relation = (items.properties as Record<string, unknown>).relation as Record<string, unknown>;
    expect(relation.enum).toEqual(
      expect.arrayContaining(['agonist-of', 'antagonist-of', 'inhibits', 'targets']),
    );
  });

  it('keeps class[] alongside activities[] (IS vs DOES are separate)', async () => {
    const result = await loadAllSchemas({ basePath: schemaDir });
    const material = result.entries.find((e) => e.id.endsWith('/material.schema.yaml'))!;
    const props = (material.schema as Record<string, unknown>).properties as Record<string, unknown>;
    expect(props).toHaveProperty('class');
    expect(props).toHaveProperty('activities');
  });
});
