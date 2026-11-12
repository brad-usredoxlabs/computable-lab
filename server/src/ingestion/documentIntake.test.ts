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
import { access, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Scratches the acquisition seam's OWN temp dir (prefix `cl-doc-intake-`, never
 * the fixture prefix `cl-doc-intake-test-`) and records it, so the cleanup and
 * scratch-naming pins can observe the real path without a production seam that
 * exists only for tests. Every other fs function stays the real one.
 */
const fsProbe = vi.hoisted(() => ({
  scratchDirs: [] as string[],
  rmCalls: [] as string[],
  writtenPaths: [] as string[],
}));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  const isIntakeScratch = (target: unknown): target is string =>
    typeof target === 'string' &&
    target.startsWith(join(tmpdir(), 'cl-doc-intake-')) &&
    !target.includes('-test-');
  return {
    ...actual,
    mkdtemp: async (prefix: string): Promise<string> => {
      const dir = await actual.mkdtemp(prefix);
      if (prefix === join(tmpdir(), 'cl-doc-intake-')) fsProbe.scratchDirs.push(dir);
      return dir;
    },
    rm: (async (target: unknown, options?: object) => {
      if (isIntakeScratch(target)) fsProbe.rmCalls.push(target);
      return (actual.rm as (p: string, o?: object) => Promise<void>)(target as string, options);
    }) as typeof actual.rm,
    writeFile: (async (target: unknown, data: string | Buffer) => {
      if (isIntakeScratch(target)) fsProbe.writtenPaths.push(target);
      return actual.writeFile(target as string, data);
    }) as typeof actual.writeFile,
  };
});
import {
  DOCUMENT_INTAKE_DIAGNOSTIC_CODES,
  extractDocumentPages,
  intakeDocument,
} from './documentIntake.js';
import { IMAGE_DIAGNOSTIC_CODES, LOCAL_OCR_REVIEW_MESSAGE, type ImageOcrConfig } from '../extract/ImageTextAdapter.js';
import { PDF_DIAGNOSTIC_CODES } from '../extract/PdfTextAdapter.js';

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
  fsProbe.scratchDirs.length = 0;
  fsProbe.rmCalls.length = 0;
  fsProbe.writtenPaths.length = 0;
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
          // 53 chars: the whole-document heuristic (> 40) would fire here and
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

  it('(e) flags an empty OCR result — a blank page is never a silent success', async () => {
    const result = await extractDocumentPages(join(scratch, 'blank.pdf'), {
      readPageTexts: async () => ({ pages: [{ page: 1, text: '' }], diagnostics: [] }),
      loadOcrConfig: async () => OCR_CONFIG,
      probeTool: async () => true,
      ocrPage: async () => ({ text: '', diagnostics: [] }),
    });

    expect(result.pages).toEqual([{ page: 1, text: '', method: 'ocr' }]);
    const noText = result.diagnostics.find(
      (diagnostic) => diagnostic.code === PDF_DIAGNOSTIC_CODES.PDF_NO_TEXT_LAYER,
    );
    expect(noText?.severity).toBe('warning');
    expect(noText?.details).toEqual({ page: 1 });
    expect(noText?.message).toContain('OCR returned no text');
    // Nothing was transcribed, so the page must not claim a local-OCR read
    // happened (adversarial c2 D7); only the blank-page warning above speaks.
    expect(
      result.diagnostics.some((diagnostic) => diagnostic.code === 'LOCAL_OCR_REVIEW'),
      'a zero-text OCR arm must not carry the "Transcribed using local OCR" caution',
    ).toBe(false);
  });

  it('(e2) attaches the LOCAL_OCR_REVIEW caution when the OCR arm really transcribed text', async () => {
    const result = await extractDocumentPages(join(scratch, 'scan-text.pdf'), {
      readPageTexts: async () => ({ pages: [{ page: 1, text: '' }], diagnostics: [] }),
      loadOcrConfig: async () => OCR_CONFIG,
      probeTool: async () => true,
      ocrPage: async () => ({ text: '10 g NaCl in 100 mL', diagnostics: [] }),
    });

    expect(result.pages).toEqual([{ page: 1, text: '10 g NaCl in 100 mL', method: 'ocr' }]);
    const caution = result.diagnostics.find((diagnostic) => diagnostic.code === 'LOCAL_OCR_REVIEW');
    expect(caution?.severity).toBe('warning');
    expect(caution?.details).toEqual({ page: 1 });
    expect(caution?.message).toContain('Transcribed using local OCR');
    expect(
      result.diagnostics.some((diagnostic) => diagnostic.code === PDF_DIAGNOSTIC_CODES.PDF_NO_TEXT_LAYER),
    ).toBe(false);
  });

  it('(f) does NOT attach the LOCAL_OCR_REVIEW caution to a failed OCR arm', async () => {
    const result = await extractDocumentPages(join(scratch, 'broken.pdf'), {
      readPageTexts: async () => ({ pages: [{ page: 1, text: '' }], diagnostics: [] }),
      loadOcrConfig: async () => OCR_CONFIG,
      probeTool: async () => true,
      ocrPage: async () => ({
        text: '',
        diagnostics: [
          {
            severity: 'error',
            code: IMAGE_DIAGNOSTIC_CODES.IMAGE_OCR_FAILED,
            message: 'Image OCR failed: exit 1',
          },
        ],
      }),
    });

    const codes = result.diagnostics.map((diagnostic) => diagnostic.code);
    expect(codes).toContain(IMAGE_DIAGNOSTIC_CODES.IMAGE_OCR_FAILED);
    expect(codes, 'a page that was never transcribed must not claim it was').not.toContain(
      'LOCAL_OCR_REVIEW',
    );
  });

  it('(g) stops the OCR arm at config.maxPages and names the skipped pages', async () => {
    const ocrPage = vi.fn(async (_file: string, page: number) => ({
      text: `OCR of page ${page}`,
      diagnostics: [],
    }));
    const result = await extractDocumentPages(join(scratch, 'long-scan.pdf'), {
      readPageTexts: async () => ({
        pages: [1, 2, 3].map((page) => ({ page, text: '' })),
        diagnostics: [],
      }),
      loadOcrConfig: async () => ({ ...OCR_CONFIG, maxPages: 1 }),
      probeTool: async () => true,
      ocrPage,
    });

    expect(ocrPage, 'the declared page cap is load-bearing').toHaveBeenCalledTimes(1);
    expect(result.pages.map((page) => page.text)).toEqual(['OCR of page 1', '', '']);
    const limit = result.diagnostics.find((diagnostic) => diagnostic.code === 'LOCAL_OCR_PAGE_LIMIT');
    expect(limit?.severity).toBe('warning');
    expect(limit?.message).toContain('page(s) 2, 3');
    expect(result.diagnostics.filter((diagnostic) => diagnostic.code === 'LOCAL_OCR_REVIEW')).toHaveLength(1);
  });

  it('(h) takes the readable text formats from the config formats map, not a literal list', async () => {
    const htmlPath = join(scratch, 'label.html');
    await writeFile(htmlPath, '<p>M13 forward primer</p>', 'utf-8');

    const html = await extractDocumentPages(htmlPath);
    expect(html.pages).toEqual([{ page: 1, text: '<p>M13 forward primer</p>', method: 'plain_text' }]);

    // .tsv is declared NOWHERE in the config formats map: refused, not guessed.
    const undeclared = await extractDocumentPages(join(scratch, 'sheet.tsv'));
    expect(undeclared.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      DOCUMENT_INTAKE_DIAGNOSTIC_CODES.UNSUPPORTED_FORMAT,
    );
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

/**
 * Unit intakedoc — the acquisition half: store the uploaded bytes, then read the
 * pages from the in-hand buffer. The store is an injected structural seam (the
 * production `ArtifactBlobStore` satisfies it unchanged), so no storage device,
 * network or real PDF is needed here.
 */
describe('intakeDocument', () => {
  const SHA256 = '4a5b6c7d8e9f0a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293';
  const STORED = {
    storedPath: 'ingestion-artifacts/DOC-1/label.pdf',
    sha256: SHA256,
    sizeBytes: 42,
    drefId: 'DREF-000042',
  };
  const CONTENT = Buffer.from('%PDF-1.4 fixture bytes').toString('base64');

  it('stores once, then returns the STORE identity plus the extracted pages', async () => {
    const save = vi.fn(async () => STORED);
    const result = await intakeDocument(
      { artifactId: 'DOC-1', fileName: 'label.pdf', contentBase64: CONTENT },
      { save },
      {
        readPageTexts: async () => ({
          pages: [{ page: 1, text: 'M13 Forward Primer 10 uM in TE buffer' }],
          diagnostics: [],
        }),
      },
    );

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({
      artifactId: 'DOC-1',
      fileName: 'label.pdf',
      contentBase64: CONTENT,
    });
    expect(result).toMatchObject({
      drefId: 'DREF-000042',
      sha256: SHA256,
      sizeBytes: 42,
      storedPath: 'ingestion-artifacts/DOC-1/label.pdf',
      pages: [{ page: 1, text: 'M13 Forward Primer 10 uM in TE buffer', method: 'pdf_text' }],
      diagnostics: [],
    });
  });

  it('resolves with a typed STORAGE_FAILED diagnostic when the store rejects (never throws, never empty-success)', async () => {
    const save = vi.fn(async () => {
      throw new Error('MISSING_CONFIG: no storage device configured');
    });

    const result = await intakeDocument(
      { artifactId: 'DOC-2', fileName: 'label.pdf', contentBase64: CONTENT },
      { save },
      { readPageTexts: async () => ({ pages: [{ page: 1, text: 'unused' }], diagnostics: [] }) },
    );

    expect(result.pages).toEqual([]);
    expect(result.storedPath).toBe('');
    expect(result.drefId).toBe('');
    const diagnostic = result.diagnostics.find(
      (entry) => entry.code === DOCUMENT_INTAKE_DIAGNOSTIC_CODES.STORAGE_FAILED,
    );
    expect(diagnostic?.severity).toBe('error');
    expect(diagnostic?.message).toContain('MISSING_CONFIG');
  });

  it('names the scratch file from the declared extension (not a hardcoded .pdf) and survives an extensionless name', async () => {
    const save = vi.fn(async () => ({ ...STORED, storedPath: 'ingestion-artifacts/DOC-3/notes.txt' }));
    const text = 'Incubate 30 min at 37 C.\n';
    const plain = await intakeDocument(
      { artifactId: 'DOC-3', fileName: 'notes.txt', contentBase64: Buffer.from(text).toString('base64') },
      { save },
    );
    expect(plain.pages).toEqual([{ page: 1, text, method: 'plain_text' }]);

    // No extension to derive: the format gate answers with its own typed
    // diagnostic instead of a throw or a fabricated page.
    const extensionless = await intakeDocument(
      { artifactId: 'DOC-4', fileName: 'rawdoc', contentBase64: CONTENT },
      { save },
    );
    expect(extensionless.pages).toEqual([]);
    expect(extensionless.diagnostics.map((entry) => entry.code)).toContain(
      DOCUMENT_INTAKE_DIAGNOSTIC_CODES.UNSUPPORTED_FORMAT,
    );
  });

  /**
   * Adversarial c1 D3: the acquisition order is STORE then EXTRACT. The store
   * spy and the injected page reader share one log, so a reorder (extraction
   * before the bytes are stored) flips the log and fails here even though every
   * other assertion about the result still holds.
   */
  it('D3: stores the bytes BEFORE extracting pages (ordering pin, not just both-happened)', async () => {
    const order: string[] = [];
    const save = vi.fn(async () => {
      order.push('save');
      return STORED;
    });
    const result = await intakeDocument(
      { artifactId: 'DOC-5', fileName: 'label.pdf', contentBase64: CONTENT },
      { save },
      {
        readPageTexts: async () => {
          order.push('extract');
          return { pages: [{ page: 1, text: 'M13 Forward Primer 10 uM' }], diagnostics: [] as [] };
        },
      },
    );

    expect(result.pages).toHaveLength(1);
    expect(order).toEqual(['save', 'extract']);
  });

  /**
   * Adversarial c1 D1: the scratch dir is transient — after a successful run
   * the directory this seam created no longer exists, and it is removed exactly
   * once. Deleting the `finally` rm keeps the pages green but leaves the dir.
   */
  it('D1: removes the scratch directory it created before returning', async () => {
    const save = vi.fn(async () => STORED);
    await intakeDocument(
      { artifactId: 'DOC-6', fileName: 'notes.txt', contentBase64: Buffer.from('Incubate 30 min.\n').toString('base64') },
      { save },
    );

    expect(fsProbe.scratchDirs).toHaveLength(1);
    const dir = fsProbe.scratchDirs[0] ?? '';
    expect(dir).not.toBe('');
    expect(fsProbe.rmCalls.filter((removed) => removed === dir)).toHaveLength(1);
    const gone = await access(dir).then(
      () => 'present',
      () => 'gone',
    );
    expect(gone).toBe('gone');
  });

  /**
   * Adversarial c1 D2: the declared fileName's extension is what reaches
   * extraction (the scratch file is `document.<ext>`, so a `.md` upload is read
   * as plain text). An EXTENSIONLESS name still cannot be sniffed — that is
   * pinned honestly as a typed UNSUPPORTED_FORMAT with no inferred format, and
   * the scratch file is the bare `document` (named limitation: content sniffing
   * is a u3 follow-up, not bolted on here).
   */
  it('D2: passes the declared extension to extraction; an extensionless name stays an honest UNSUPPORTED_FORMAT', async () => {
    const save = vi.fn(async () => STORED);
    const markdown = await intakeDocument(
      { artifactId: 'DOC-7', fileName: 'notes.md', contentBase64: Buffer.from('# Notes\n').toString('base64') },
      { save },
    );
    expect(markdown.pages).toEqual([{ page: 1, text: '# Notes\n', method: 'plain_text' }]);
    const mdScratch = fsProbe.writtenPaths[fsProbe.writtenPaths.length - 1] ?? '';
    expect(mdScratch.endsWith('/document.md')).toBe(true);

    const extensionless = await intakeDocument(
      { artifactId: 'DOC-8', fileName: 'rawdoc', contentBase64: Buffer.from('{"wells":3}').toString('base64') },
      { save },
    );
    const rawScratch = fsProbe.writtenPaths[fsProbe.writtenPaths.length - 1] ?? '';
    expect(rawScratch.endsWith('/document')).toBe(true);
    expect(extensionless.pages).toEqual([]);
    const diagnostic = extensionless.diagnostics.find(
      (entry) => entry.code === DOCUMENT_INTAKE_DIAGNOSTIC_CODES.UNSUPPORTED_FORMAT,
    );
    expect(diagnostic?.message).toContain('(none)');
    // The store still owns the bytes: no page was fabricated, no identity lost.
    expect(extensionless.drefId).toBe(STORED.drefId);
  });
});
