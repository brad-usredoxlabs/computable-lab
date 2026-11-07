// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { UISpecLoader } from './UISpecLoader.js';

const MANIFEST_SCHEMA_ID = 'https://computable-lab.com/schema/ui/surface-manifest.schema.yaml';

/** Tiny JSONPath resolver: handles $, .field, .field[0], and [*] */
function resolvePath(doc: unknown, path: string): unknown {
  if (path === '$') return doc;
  const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
  let current: unknown = doc;
  for (const part of parts) {
    if (part === '*') {
      if (!Array.isArray(current)) return undefined;
      return current;
    }
    if (current === null || current === undefined || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

describe('Surface manifest UI spec', () => {
  it('loads through UISpecLoader and resolves all declared JSONPaths on the real manifest', async () => {
    const loader = new UISpecLoader();
    const uiPath = join(process.cwd(), '..', 'schema', 'ui', 'surface-manifest.ui.yaml');
    const content = await readFile(uiPath, 'utf8');

    const result = loader.load(content, uiPath);
    expect(result.success).toBe(true);
    expect(result.spec).toBeDefined();
    expect(result.spec!.schemaId).toBe(MANIFEST_SCHEMA_ID);

    const manifest = parseYaml(
      await readFile(join(process.cwd(), '..', 'config', 'ui', 'surfaces.yaml'), 'utf8')
    );

    const spec = result.spec!;

    // Every display path must resolve on the manifest
    if (spec.display) {
      if (spec.display.titleField) {
        const val = resolvePath(manifest, spec.display.titleField);
        expect(val, `display.titleField ${spec.display.titleField}`).not.toBeUndefined();
      }
      if (spec.display.subtitleField) {
        const val = resolvePath(manifest, spec.display.subtitleField);
        expect(val, `display.subtitleField ${spec.display.subtitleField}`).not.toBeUndefined();
      }
    }

    // Every list column path must resolve on the manifest
    expect(spec.list).toBeDefined();
    expect(Array.isArray(spec.list!.columns)).toBe(true);
    expect(spec.list!.columns!.length).toBeGreaterThan(0, 'list.columns must not be empty');
    for (const col of spec.list!.columns!) {
      const val = resolvePath(manifest, col.path);
      expect(val, `list column ${col.path}`).not.toBeUndefined();
    }

    // Form sections: every field path must resolve
    if (spec.form && spec.form.sections) {
      for (const section of spec.form.sections) {
        for (const field of section.fields) {
          const val = resolvePath(manifest, field.path);
          expect(val, `form field ${field.path}`).not.toBeUndefined();
        }
      }
    }

    // Non-vacuity: at least one display and one list entry
    expect(spec.display).toBeDefined();
    expect(Object.keys(spec.display).length).toBeGreaterThan(0, 'display must not be empty');
  });
});
