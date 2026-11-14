/**
 * L2-PROTOCOL-ADOPT-INTAKE-1 u1docintake — the PDF arm of
 * decodeVendorProtocolPdf records the extraction METHOD PER PAGE through the
 * shared intake seam (extractDocumentPages).
 *
 * RED before the routing lands (today's return type carries NO per-page
 * method, so the sidecar assertions below fail on absence):
 *  - the returned document carries exactly ONE method value PER PAGE (a
 *    sidecar `pageMethods` array aligned with `pages`) — a whole-document
 *    "method" would be a lie the moment a page has no text layer;
 *  - the method is `pdf_text` for every text-layer page (per page, not per
 *    document);
 *  - the page TEXT the step logic sees stays what pdftotext -layout produced
 *    (byte-identical), so the golden candidate is untouched.
 *
 * The method rides the vendor document's OWN shape (a sidecar array), never a
 * `method` key on `pages[]`, so a deep-equality assertion on `pages` cannot
 * start seeing a new key (SCOPE).
 */
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { decodeVendorProtocolPdf } from './VendorProtocolPdf.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../../..');
const zymoPdfPath = resolve(
  repoRoot,
  'resources/vendor_pdfs/_d4302_d4306_d4308_zymobiomics-96_magbead_dna_kit.pdf',
);
const ZYMO_FILENAME = '_d4302_d4306_d4308_zymobiomics-96_magbead_dna_kit.pdf';

const METHODS = ['pdf_text', 'ocr', 'plain_text'] as const;

async function decodeZymo() {
  const buffer = await readFile(zymoPdfPath);
  return (await decodeVendorProtocolPdf(buffer, {
    filename: ZYMO_FILENAME,
    documentId: 'vendor-protocol-zymo-magbead',
  })) as unknown as {
    pages: Array<{ pageNumber: number; text: string }>;
    pageMethods?: Array<string>;
  };
}

describe('decodeVendorProtocolPdf — per-page method via the shared intake seam', () => {
  it('carries exactly one method value PER PAGE (sidecar aligned with pages)', async () => {
    const document = await decodeZymo();
    expect(document.pageMethods, 'the document must record the extraction method per page').toBeDefined();
    const methods = document.pageMethods as Array<string>;
    expect(methods.length, 'exactly ONE method value PER PAGE — not one document-level value').toBe(
      document.pages.length,
    );
    methods.forEach((method) => {
      expect(METHODS, `method "${method}" is a known DocumentPageMethod`).toContain(method);
    });
  });

  it('records pdf_text for every text-layer page (the method is per page, not per document)', async () => {
    const document = await decodeZymo();
    const methods = document.pageMethods as Array<string>;
    let textLayerPages = 0;
    document.pages.forEach((page, index) => {
      if (page.text.trim().length > 0) {
        textLayerPages += 1;
        expect(methods[index], `page ${page.pageNumber} has a text layer -> pdf_text`).toBe('pdf_text');
      }
    });
    // The Zymo kit PDF has a text layer on every one of its 31 pages.
    expect(textLayerPages).toBe(document.pages.length);
  });

  it('keeps the page TEXT exactly what pdftotext -layout produces (byte-identity gate)', async () => {
    const document = await decodeZymo();
    // The golden decode (pdftotext -layout) yields 31 non-empty pages with
    // this exact text; a silent layout change would break these byte-for-byte
    // tokens and the three golden suites.
    expect(document.pages.length).toBe(31);
    expect(document.pages[0].text.startsWith('ZymoBIOMICS\u2122 96 MagBead DNA Kit')).toBe(true);
    expect(document.pages[30].text).toContain('100% satisfaction guarantee on all Zymo Research products');
  });
});
