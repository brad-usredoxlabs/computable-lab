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
import { createEditorProjectionService } from './EditorProjectionService.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_ID =
  'https://computable-lab.com/schema/computable-lab/vendor-product.schema.yaml';

async function loadVendorProductSpec() {
  const loader = createUISpecLoader();
  const res = await loadAllUISpecs(loader, resolve(__dirname, '../../../schema'));
  return { res, spec: loader.get(SCHEMA_ID) };
}

describe('vendor-product ui spec (g1viewable)', () => {
  it('loads the real schema tree and registers the vendor-product spec', async () => {
    const { res, spec } = await loadVendorProductSpec();

    // The base sha already carries 8 unrelated specs whose widgets predate
    // VALID_WIDGET_TYPES (lab-state 'yaml', term 'list', ...). Pinning the
    // whole tree's errors would fail for those, not for this unit, so pin
    // THIS file: it must load with no validation error at all.
    expect(res.errors.filter((e) => e.path.endsWith('vendor-product.ui.yaml'))).toEqual([]);
    expect(spec).toBeDefined();
    expect(spec!.schemaId).toBe(SCHEMA_ID);
  });

  it('declares the attached documents and drafts as read-only rows', async () => {
    const { spec } = await loadVendorProductSpec();
    const fields = (spec!.form?.sections ?? []).flatMap((s) => s.fields);
    const paths = fields.map((f) => f.path);

    expect(paths).toContain('$.documents');
    expect(paths).toContain('$.composition_drafts');
    // The record page resolves a row's value with the dotted-only
    // getValueAtPath (app/src/shared/lib/formHelpers.ts:15-25), so a `[*]`
    // row renders its label with an EMPTY value — never rely on one here.
    expect(paths.filter((p) => p.includes('[*]'))).toEqual([]);
    // Context view, not an editor: no field may imply an editing affordance.
    expect(fields.filter((f) => !f.readonly)).toEqual([]);
    // Per-page method is the g1pagemethod unit's schema change; not this one.
    expect(paths.filter((p) => p.includes('extraction.pages'))).toEqual([]);
  });

  it('projects a finished intake into sections, not UI_SPEC_NOT_FOUND', async () => {
    const { spec } = await loadVendorProductSpec();
    const payload = {
      kind: 'vendor-product',
      id: 'VPR-acme-bioreagents-acm-hepes-1-han1',
      name: 'HEPES 1M',
      vendor: 'Acme Bioreagents',
      catalog_number: 'ACM-HEPES-1',
      status: 'proposed',
      documents: [
        {
          id: 'DOC-1',
          title: 'Acme HEPES product sheet',
          document_kind: 'product_sheet',
          file_ref: { file_name: 'sheet.pdf', media_type: 'application/pdf' },
          provenance: { source_type: 'upload', added_at: '2026-11-12T08:00:00Z' },
          extraction: { method: 'pdf_text', page_count: 2 },
        },
      ],
      composition_drafts: [
        {
          id: 'DRF-1',
          source_document_id: 'DOC-1',
          extraction_method: 'pdf_text',
          status: 'draft',
          created_at: '2026-11-12T08:00:01Z',
          items: [{ component_name: 'HEPES', role: 'buffer_component' }],
        },
      ],
    };
    const projection = createEditorProjectionService().project(
      spec!,
      payload,
      SCHEMA_ID,
      payload.id,
    );

    const labels = projection.blocks.map((b) => b.label);
    expect(labels).toEqual(['Identity', 'Documents', 'Composition drafts']);
    const docSlot = projection.slots.find((s) => s.path === '$.documents')!;
    // The client's read-only array rail prints each item's fields — this is
    // what makes documents[].extraction.method visible on the record page.
    expect(docSlot.widget).toBe('array');
    expect(docSlot.readOnly).toBe(true);
    expect(projection.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  });
});
