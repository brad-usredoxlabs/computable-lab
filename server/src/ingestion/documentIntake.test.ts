// @vitest-environment node
/**
 * L2-DOC-INTAKE-1 (unit dintakeu3) — the ONE page-level document-intake seam.
 *
 * Pins the four behaviours the item's verified-by names:
 *   (a) a text-layer page reports method 'pdf_text' and its text;
 *   (b) a page with no text layer reports method 'ocr' AND carries the
 *       LOCAL_OCR_REVIEW caution (the caution is asserted, not just the method);
 *   (c) an unresolvable OCR tool returns a TYPED diagnostic (never a throw,
 *       never a blank page presented as success) with per-tool toolsAvailable;
 *   (d) the method decision is PER PAGE — a two-page source with a text-bearing
 *       page 1 and an empty page 2 returns ['pdf_text', 'ocr']. This is the pin
 *       that fails if the removed `> 40` whole-document heuristic
 *       (vendor-documents/service.ts:169) is ported instead of the per-page rule.
 *
 * All file I/O is the injected seam or a tmpdir fixture — no real binary is
 * invoked and no PDF/blob fixture is committed (bait: fixtures stay out of git).
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DOCUMENT_INTAKE_DIAGNOSTIC_CODES, extractDocumentPages } from './documentIntake.js';
import { IMAGE_DIAGNOSTIC_CODES, LOCAL_OCR_REVIEW_MESSAGE, type ImageOcrConfig } from '../extract/ImageTextAdapter.js';

/** Config-shaped fixture; the names are data, not binaries this host must have. */
const OCR_CONFIG: ImageOcrConfig = {
  executable: 'page-reader',
  language: 'eng',
  timeoutSeconds: 5,
  rasterizer: 'page-renderer',
  dpi: 150,
  maxPages: 10,
};

let scratch: string;

beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), 'cl-doc-intake-test-'));
});

afterEach(async () => {
  await rm(scratch, { recursive: true, force: true });
});

describe('extractDocumentPages', () => {
  it('(a) returns a text-layer page as pdf_text with its text', async () => {
    const result = await extractDocumentPages(join(scratch, 'label.pdf'), {
      readPageTexts: async () => ({
        pages: [{ page: 1, text: 'M13 Forward Primer 10 uM in TE buffer' }],
        diagnostics: [],
      }),
    });

    expect(result.pages).toEqual([
      { page: 1, text: 'M13 Forward Primer 10 uM in TE buffer', method: 'pdf_text' },
    ]);
    expect(result.diagnostics).toEqual([]);
  });

  it('(b) marks an empty text layer as ocr AND carries the LOCAL_OCR_REVIEW caution', async () => {
    const result = await extractDocumentPages(join(scratch, 'scan.pdf'), {
      readPageTexts: async () => ({ pages: [{ page: 1, text: '   ' }], diagnostics: [] }),
      loadOcrConfig: async () => OCR_CONFIG,
      probeTool: async () => true,
      ocrPage: async () => ({ text: 'Handwritten: 10 mL glycerol, 37 C', diagnostics: [] }),
    });

    expect(result.pages[0]).toEqual({ page: 1, text: 'Handwritten: 10 mL glycerol, 37 C', method: 'ocr' });
    const caution = result.diagnostics.find((diagnostic) => diagnostic.code === 'LOCAL_OCR_REVIEW');
    expect(caution?.message).toBe(LOCAL_OCR_REVIEW_MESSAGE);
    expect(caution?.details).toEqual({ page: 1 });
  });

  it('(c) returns a typed missing-tool diagnostic with per-tool availability when OCR is unresolvable', async () => {
    const ocrPage = vi.fn(async () => ({ text: 'should never run', diagnostics: [] }));

    await expect(
      extractDocumentPages(join(scratch, 'scan.pdf'), {
        readPageTexts: async () => ({ pages: [{ page: 1, text: '' }], diagnostics: [] }),
        loadOcrConfig: async () => OCR_CONFIG,
        probeTool: async (tool) => tool !== OCR_CONFIG.executable,
        ocrPage,
      }),
    ).resolves.toMatchObject({
      pages: [{ page: 1, text: '', method: 'ocr' }],
      toolsAvailable: { 'page-renderer': true, 'page-reader': false },
    });

    const result = await extractDocumentPages(join(scratch, 'scan.pdf'), {
      readPageTexts: async () => ({ pages: [{ page: 1, text: '' }], diagnostics: [] }),
      loadOcrConfig: async () => OCR_CONFIG,
      probeTool: async (tool) => tool !== OCR_CONFIG.executable,
      ocrPage,
    });

    expect(ocrPage).not.toHaveBeenCalled();
    const missing = result.diagnostics.find(
      (diagnostic) => diagnostic.code === IMAGE_DIAGNOSTIC_CODES.IMAGE_OCR_TOOL_MISSING,
    );
    expect(missing?.severity).toBe('error');
    expect(missing?.message).toContain(OCR_CONFIG.executable);
  });

  it('(d) decides per page: text page 1 + empty page 2 returns [pdf_text, ocr]', async () => {
    const result = await extractDocumentPages(join(scratch, 'mixed.pdf'), {
      readPageTexts: async () => ({
        pages: [
          // 58 chars: the whole-document heuristic (> 40) would fire here and
          // mark the empty page 2 'pdf_text' — the fixture must exceed it.
          { page: 1, text: 'Section 1. Reagent preparation: 10 g in 100 mL buffer' },
          { page: 2, text: '' },
        ],
        diagnostics: [],
      }),
      loadOcrConfig: async () => OCR_CONFIG,
      probeTool: async () => true,
      ocrPage: async (_file, page) => ({ text: `OCR of page ${page}`, diagnostics: [] }),
    });

    expect(result.pages.map((page) => page.method)).toEqual(['pdf_text', 'ocr']);
    expect(result.pages.map((page) => page.text)).toEqual([
      'Section 1. Reagent preparation: 10 g in 100 mL buffer',
      'OCR of page 2',
    ]);
  });

  it('reads a plain-text source as one plain_text page and never throws on a missing file', async () => {
    const textPath = join(scratch, 'protocol.txt');
    await writeFile(textPath, 'Incubate 30 min at 37 C.\n', 'utf-8');

    const plain = await extractDocumentPages(textPath);
    expect(plain.pages).toEqual([
      { page: 1, text: 'Incubate 30 min at 37 C.\n', method: 'plain_text' },
    ]);
    expect(plain.toolsAvailable).toEqual({});

    const missing = await extractDocumentPages(join(scratch, 'absent.txt'));
    expect(missing.pages).toEqual([]);
    expect(
      missing.diagnostics.some(
        (diagnostic) => diagnostic.code === DOCUMENT_INTAKE_DIAGNOSTIC_CODES.READ_FAILED,
      ),
    ).toBe(true);
  });
});
