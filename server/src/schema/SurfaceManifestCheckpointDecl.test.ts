// @vitest-environment node
// cpdeclare (L2-JOURNEY-CHECKPOINT-1, unit 5): a surface declares, in data, what it
// exports into a checkpoint's restoration_state and what it reads back to restore.
// Ajv is the single validation authority; this test asserts symmetry, shape and the
// committed declarations (drift pins) — it never carries a legal field-name list as
// a rule source (the pattern below is a shape drift-check against the schema).

import { describe, expect, it, beforeEach } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { createSchemaRegistry } from './SchemaRegistry.js';
import { loadSchemasFromContent } from './SchemaLoader.js';
import { createValidator } from '../validation/AjvValidator.js';

const SURFACE_MANIFEST_ID = 'https://computable-lab.com/schema/ui/surface-manifest.schema.yaml';
const NAME_SHAPE = /^[a-z][a-z0-9_]*$/;

describe('Surface manifest checkpoint declaration (cpdeclare)', () => {
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

  it('validates the committed manifest and pins the run-workspace + event-editor checkpoint declarations', () => {
    const result = validator.validate(manifest, SURFACE_MANIFEST_ID);
    expect(result.errors, 'committed manifest must validate').toEqual([]);
    for (const id of ['run-workspace', 'event-editor']) {
      const surface = manifest.surfaces.find((s: any) => s.id === id);
      expect(surface?.checkpoint?.exports, `${id} must declare checkpoint.exports in config/ui/surfaces.yaml`).toEqual(['selected_wells']);
      expect(surface?.checkpoint?.restores, `${id} must declare checkpoint.restores in config/ui/surfaces.yaml`).toEqual(['selected_wells']);
    }
  });

  it('restores exactly what it exports: sorted exports == sorted restores, names unique and well-formed', () => {
    for (const surface of manifest.surfaces) {
      if (!surface.checkpoint) continue;
      const { exports, restores } = surface.checkpoint;
      expect([...exports].sort(), `${surface.id} restores exactly what it exports`).toEqual([...restores].sort());
      for (const name of [...exports, ...restores]) {
        expect([...exports].filter((n: any) => n === name).length, `${surface.id} exports declares "${name}" once`).toBe(1);
        expect([...restores].filter((n: any) => n === name).length, `${surface.id} restores declares "${name}" once`).toBe(1);
        expect(name, `${surface.id} name "${name}" matches the schema's ^[a-z][a-z0-9_]*$ shape`).toMatch(NAME_SHAPE);
      }
    }
  });

  it('declares no other surface a checkpoint (the declaration is opt-in)', () => {
    const declared = manifest.surfaces.filter((s: any) => s.checkpoint).map((s: any) => s.id);
    expect(declared, 'only the two journey surfaces declare a checkpoint').toEqual(['run-workspace', 'event-editor']);
  });

  it('keeps a surface without any checkpoint declaration valid', () => {
    const noDecl = structuredClone(manifest);
    for (const surface of noDecl.surfaces) delete surface.checkpoint;
    const result = validator.validate(noDecl, SURFACE_MANIFEST_ID);
    expect(result.errors, 'a manifest with no checkpoint declarations still validates').toEqual([]);
  });

  it('rejects a surface that exports state but restores nothing (asymmetry)', () => {
    const broken = structuredClone(manifest);
    const target = broken.surfaces.find((s: any) => s.id === 'run-workspace');
    if (target.checkpoint) {
      target.checkpoint.exports = ['selected_wells'];
      target.checkpoint.restores = [];
    } else {
      target.checkpoint = { exports: ['selected_wells'], restores: [] };
    }
    const result = validator.validate(broken, SURFACE_MANIFEST_ID);
    const symmetric =
      [...target.checkpoint.exports].sort().join(',') === [...target.checkpoint.restores].sort().join(',');
    expect(
      result.valid || symmetric,
      'an asymmetric checkpoint declaration must be rejected by Ajv validation or the symmetry assertion',
    ).toBe(false);
  });
});
