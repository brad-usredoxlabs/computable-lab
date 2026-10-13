/**
 * DOCINGEST-A A3/convergence site 2 — decodeVendorProtocolPdf routes by
 * format through the ONE dispatcher (OQ1: convergence by DELEGATION, not by
 * import-swapping).
 *
 * Pinned:
 *  - a .pdf buffer (with a .pdf filename) keeps the EXACT current layout call
 *    (extractPdfLayoutText from extract/PdfTextAdapter) — the spy proves the
 *    PDF bytes never touch the dispatcher's plain-text pdf arm, which would
 *    silently degrade vendor-PDF extraction (spec bait 1);
 *  - a .md buffer + filename returns its own text as one page (the dispatcher
 *    arm) and the layout extractor is NOT called;
 *  - an unknown extension routes through the dispatcher's utf8 fallback
 *    (still not the layout extractor).
 */
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const layoutSpy = vi.hoisted(() => vi.fn());

vi.mock('../../extract/PdfTextAdapter.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../extract/PdfTextAdapter.js')>();
  return {
    ...actual,
    extractPdfLayoutText: (...args: Parameters<typeof actual.extractPdfLayoutText>) => {
      layoutSpy(...args);
      return actual.extractPdfLayoutText(...args);
    },
  };
});

import { decodeVendorProtocolPdf } from './VendorProtocolPdf.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../../..');
const zymoPdfPath = resolve(repoRoot, 'resources/vendor_pdfs/_d4302_d4306_d4308_zymobiomics-96_magbead_dna_kit.pdf');

const MARKDOWN = '# Lysis protocol\n\nMaterials\n- Lysis buffer\n\nProcedure\n1. Add 500 uL of buffer.\n2. Incubate 10 min.\n';

beforeEach(() => {
  layoutSpy.mockClear();
});

describe('decodeVendorProtocolPdf — format dispatch through the ONE dispatcher', () => {
  it('a .md buffer decodes through the dispatcher (layout extractor never called)', async () => {
    const document = await decodeVendorProtocolPdf(Buffer.from(MARKDOWN), {
      filename: 'lab-protocol.md',
      documentId: 'vendor-protocol-lysis-md',
    });
    expect(layoutSpy, 'markdown bytes must never go through the PDF layout extractor').not.toHaveBeenCalled();
    expect(document.text).toContain('Lysis protocol');
    expect(document.source.filename).toBe('lab-protocol.md');
    expect(document.pages).toHaveLength(1);
    expect(document.source.pageCount).toBe(1);
    // The dispatcher's honest info diagnostic travels with the document.
    expect(document.diagnostics.some((d) => d.code === 'markdown_as_text')).toBe(true);
  });

  it('a .pdf buffer still goes through the layout extractor (arm frozen)', async () => {
    const buffer = await readFile(zymoPdfPath);
    const document = await decodeVendorProtocolPdf(buffer, {
      filename: '_d4302_d4306_d4308_zymobiomics-96_magbead_dna_kit.pdf',
      documentId: 'vendor-protocol-zymo-magbead',
    });
    expect(layoutSpy, 'PDF bytes must keep the exact current layout call').toHaveBeenCalledTimes(1);
    expect(document.source.title).toBe('ZymoBIOMICS 96 MagBead DNA Kit');
    expect(document.pages.length).toBeGreaterThanOrEqual(29);
  });

  it('an unknown extension routes through the dispatcher, not the layout extractor', async () => {
    const document = await decodeVendorProtocolPdf(Buffer.from('Add 500 uL of buffer.\n'), {
      filename: 'notes.unknownext',
    });
    expect(layoutSpy).not.toHaveBeenCalled();
    expect(document.text).toContain('Add 500 uL of buffer.');
  });
});
