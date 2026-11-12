// @vitest-environment node
/**
 * L2-DOC-INTAKE-1 g1viewable: the vendor-product record page must be a
 * DECLARED surface. This pin loads the real schema/ tree through the same
 * loader the server boots with (server.ts:573-574), so a missing or
 * mis-keyed *.ui.yaml fails here the way UIHandlers.getRecordEditorProjection
 * fails with UI_SPEC_NOT_FOUND at runtime.
 */
import { describe, expect, it } from 'vitest';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createUISpecLoader, loadAllUISpecs } from './UISpecLoader.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_ID =
  'https://computable-lab.com/schema/computable-lab/vendor-product.schema.yaml';

describe('vendor-product ui spec (g1viewable)', () => {
  it('loads the real schema tree and registers the vendor-product spec', async () => {
    const loader = createUISpecLoader();
    const res = await loadAllUISpecs(loader, resolve(__dirname, '../../../schema'));

    // Base sha already carries 8 unrelated specs whose widgets predate
    // VALID_WIDGET_TYPES (lab-state 'yaml', term 'list', ...). Pinning the
    // whole tree's errors would fail for those, not for this unit, so pin
    // THIS file: it must load with no validation error at all.
    expect(res.errors.filter((e) => e.path.endsWith('vendor-product.ui.yaml'))).toEqual([]);
    expect(loader.get(SCHEMA_ID)).toBeDefined();
  });

  it('exposes every attached document with its recorded extraction method, read-only', async () => {
    const loader = createUISpecLoader();
    await loadAllUISpecs(loader, resolve(__dirname, '../../../schema'));
    const spec = loader.get(SCHEMA_ID)!;
    const fields = (spec.form?.sections ?? []).flatMap((s) => s.fields);
    const paths = fields.map((f) => f.path);

    expect(paths).toContain('$.documents[*].extraction.method');
    expect(paths).toContain('$.documents[*].title');
    expect(paths).toContain('$.documents[*].file_ref.media_type');
    expect(paths).toContain('$.composition_drafts[*].status');
    // The view is a context view: no field may imply an editing affordance.
    expect(fields.filter((f) => !f.readonly)).toEqual([]);
    // Per-page method is the g1pagemethod unit's schema change; not this one.
    expect(paths.filter((p) => p.includes('extraction.pages'))).toEqual([]);
  });
});
