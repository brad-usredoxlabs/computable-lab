// @vitest-environment node

import { describe, expect, it, beforeEach } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { createSchemaRegistry } from './SchemaRegistry.js';
import { loadSchemasFromContent } from './SchemaLoader.js';
import { createValidator } from '../validation/AjvValidator.js';

const SURFACE_MANIFEST_ID = 'https://computable-lab.com/schema/ui/surface-manifest.schema.yaml';

describe('Surface manifest schema', () => {
  let validator: ReturnType<typeof createValidator>;
  let manifest: any;

  beforeEach(async () => {
    const registry = createSchemaRegistry();
    validator = createValidator({ strict: false });
    const schemaRoot = join(process.cwd(), '..', 'schema');
    const schemaContent = await readFile(join(schemaRoot, 'ui/surface-manifest.schema.yaml'), 'utf8');
    const loadResult = loadSchemasFromContent(new Map([['ui/surface-manifest.schema.yaml', schemaContent]]));
    expect(loadResult.errors).toEqual([]);
    registry.addSchemas(loadResult.entries);
    for (const id of registry.getTopologicalOrder()) {
      const entry = registry.getById(id);
      if (entry) validator.addSchema(entry.schema, entry.id);
    }
    manifest = parseYaml(await readFile(join(process.cwd(), '..', 'config/ui/surfaces.yaml'), 'utf8'));
  });

  it('validates the committed manifest and pins surface + pane sets', () => {
    const result = validator.validate(manifest, SURFACE_MANIFEST_ID);
    expect(result.valid).toBe(true);
    expect(manifest.surfaces.map((s: any) => s.id)).toEqual([
      'run-workspace',
      'event-editor',
      'analysis',
      'project-deck-tab',
      'record-host',
      'artifact-host',
      'registry-host',
      'claims-collection',
      'graph-search',
      'lab-collection',
      'literature-list',
      'projects-collection',
      'runs-collection',
      'sequences-list',
      'settings',
      'splash',
      'deck-host',
      'project-event-graph',
      'record-create',
    ]);
    expect(manifest.paneVocabulary).toEqual([
      'ai-chat',
      'event-editor',
      'deck',
      'project-tabs',
      'collection-list',
    ]);
  });

  it('rejects a duplicated surface entry (uniqueItems)', () => {
    const dup = structuredClone(manifest);
    const lastSurface = dup.surfaces[dup.surfaces.length - 1];
    dup.surfaces.push(lastSurface);
    const result = validator.validate(dup, SURFACE_MANIFEST_ID);
    expect(result.valid).toBe(false);
    expect(result.errors?.some((e: any) => e.keyword === 'uniqueItems')).toBe(true);
  });

  it('rejects an unknown surface field (additionalProperties)', () => {
    const invalid = structuredClone(manifest);
    (invalid.surfaces[0] as any).gatee = 'unknown';
    const result = validator.validate(invalid, SURFACE_MANIFEST_ID);
    expect(result.valid).toBe(false);
    expect(result.errors?.some((e: any) => e.keyword === 'additionalProperties')).toBe(true);
  });

  it('rejects an invalid scope_source enum value', () => {
    const invalid = structuredClone(manifest);
    if ((invalid.surfaces[0] as any).context) {
      (invalid.surfaces[0] as any).context.scope_source = 'timing-based';
    } else {
      (invalid.surfaces[0] as any).context = { scope_source: 'timing-based' };
    }
    const result = validator.validate(invalid, SURFACE_MANIFEST_ID);
    expect(result.valid).toBe(false);
    expect(result.errors?.some((e: any) => e.keyword === 'enum')).toBe(true);
  });
});
