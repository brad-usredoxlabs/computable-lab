// @vitest-environment node
/**
 * L2-SPEC-SHEET-INGEST-1 unit 1 — SpecSheetFieldMaps tests.
 *
 * Tests the loader that resolves recordKind → field map from YAML data files.
 * Also validates that every targetField in the shipped maps actually resolves
 * against the declared target schemas.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { getSpecSheetFieldMap, listSpecSheetFieldMaps, reload } from './SpecSheetFieldMaps.js';

/* ------------------------------------------------------------------ */
/* Helpers: walk a dotted path through a parsed YAML schema object    */
/* ------------------------------------------------------------------ */

function resolvePath(schema: Record<string, unknown>, dottedPath: string): boolean {
  const parts = dottedPath.split('.');
  let current: Record<string, unknown> = schema;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return false;
    const next = current[part];
    if (next === undefined) return false;
    current = next as Record<string, unknown>;
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* Load the target schemas for conformance checks                      */
/* ------------------------------------------------------------------ */

async function loadSchema(filePath: string): Promise<Record<string, unknown>> {
  const { parse: parseYaml } = await import('yaml');
  const { readFile } = await import('node:fs/promises');
  const raw = await readFile(filePath, 'utf-8');
  return parseYaml(raw) as Record<string, unknown>;
}

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */

describe('SpecSheetFieldMaps — vendor-product', () => {
  it('returns mappings that include vendor, catalog_number, and name', async () => {
    const map = await getSpecSheetFieldMap('vendor-product');
    expect(map.recordKind).toBe('vendor-product');
    const targets = map.fieldMappings.map(m => m.targetField);
    expect(targets).toContain('vendor');
    expect(targets).toContain('catalog_number');
    expect(targets).toContain('name');
  });
});

describe('SpecSheetFieldMaps — labware', () => {
  it('returns mappings for geometry and capacity paths', async () => {
    const map = await getSpecSheetFieldMap('labware');
    expect(map.recordKind).toBe('labware');
    const targets = map.fieldMappings.map(m => m.targetField);
    expect(targets).toContain('capacity.max_well_volume_uL');
    expect(targets).toContain('physical_geometry.well_length_mm');
    expect(targets).toContain('physical_geometry.well_width_mm');
    expect(targets).toContain('physical_geometry.well_depth_mm');
  });
});

describe('SpecSheetFieldMaps — unknown kind throws', () => {
  it('throws naming the unknown type', async () => {
    await expect(getSpecSheetFieldMap('equipment')).rejects.toThrow(
      '[spec-sheet] no field map for record type "equipment"',
    );
  });
});

describe('SpecSheetFieldMaps — listSpecSheetFieldMaps', () => {
  it('returns keys for all shipped maps', async () => {
    const keys = await listSpecSheetFieldMaps();
    expect(keys).toContain('vendor-product');
    expect(keys).toContain('labware');
  });
});

describe('SpecSheetFieldMaps — targetField conformance', () => {
  let vendorSchema: Record<string, unknown>;
  let labwareSchema: Record<string, unknown>;

  beforeAll(async () => {
    const { join, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const base = join(dirname(fileURLToPath(new URL('.', import.meta.url))), '../../schema');

    vendorSchema = await loadSchema(join(base, 'lab/vendor-product.schema.yaml'));
    labwareSchema = await loadSchema(join(base, 'workflow/labware-definition.schema.yaml'));
  });

  it('every vendor-product targetField resolves in vendor-product.schema.yaml', async () => {
    const map = await getSpecSheetFieldMap('vendor-product');
    for (const mapping of map.fieldMappings) {
      expect(
        resolvePath(vendorSchema.properties as Record<string, unknown>, mapping.targetField),
        `targetField "${mapping.targetField}" must exist in vendor-product schema`,
      ).toBe(true);
    }
  });

  it('every labware targetField resolves in labware-definition.schema.yaml', async () => {
    const map = await getSpecSheetFieldMap('labware');
    for (const mapping of map.fieldMappings) {
      expect(
        resolvePath(labwareSchema.properties as Record<string, unknown>, mapping.targetField),
        `targetField "${mapping.targetField}" must exist in labware-definition schema`,
      ).toBe(true);
    }
  });

  it('reload() re-reads the cache', async () => {
    const before = await getSpecSheetFieldMap('vendor-product');
    await reload();
    const after = await getSpecSheetFieldMap('vendor-product');
    expect(after.fieldMappings.length).toBe(before.fieldMappings.length);
  });
});
