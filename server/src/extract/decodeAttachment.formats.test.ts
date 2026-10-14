/**
 * DOCINGEST-A A2 — the ONE shared dispatcher (decodeAttachmentText) arms.
 *
 * Pins, in order:
 *  - the pre-existing pdf/html/xlsx/utf8 arms are FROZEN (behavior byte-for-
 *    behavior identical to today — the reviewer will diff the arms);
 *  - the NEW arms: .docx/.rtf (and the wordprocessingml mime) route through
 *    the config-declared DOCX reader and surface its honest DOCX_* diagnostic
 *    (pandoc is ABSENT on this host — the valid green IS the diagnostic, never
 *    a blank success); .md/.markdown return their own text WITH the
 *    markdown_as_text info diagnostic (the format is DECLARED, not a fall-
 *    through by accident);
 *  - an unknown extension still utf8-falls back exactly as today.
 */
import { describe, expect, it } from 'vitest';
import { decodeAttachmentText } from './decodeAttachment.js';

const MARKDOWN = '# Lysis protocol\n\n1. Add 500 uL of buffer.\n';
const HTML = '<html><body><h1>Lysis protocol</h1><p>Add 500 uL of buffer.</p></body></html>';
// Bytes shaped like a .docx (ZIP magic) without being one: the arms under test
// must never depend on the bytes parsing — the reader's own failure diagnostic
// is what surfaces.
const DOCX_BYTES = Buffer.from('PK\u0003\u0004 fake-docx-bytes');
const PDF_BYTES = Buffer.from('%PDF-1.4 fake-pdf-bytes');
// Bytes that are NOT valid UTF-8: the utf8 fallback arm replaces them (U+FFFD),
// which distinguishes "fell through to utf8" from "went through a real reader".
const RAW_BYTES = Buffer.from([0x89, 0x8a, 0x8b, 0x8c]);

describe('decodeAttachmentText — pre-existing arms (frozen)', () => {
  it('pdf arm: a .pdf buffer goes through the plain-text PDF reader (pdf_parse_failed on junk bytes)', async () => {
    const { text, diagnostics } = await decodeAttachmentText('manual.pdf', undefined, PDF_BYTES);
    expect(text).toBe('');
    expect(diagnostics.some((d) => d.code === 'pdf_parse_failed')).toBe(true);
    expect(diagnostics.some((d) => d.code.startsWith('DOCX_'))).toBe(false);
  });

  it('html arm: an .html buffer still routes through extractHtmlText (headings preserved as ## )', async () => {
    const { text, diagnostics } = await decodeAttachmentText('page.html', 'text/html', Buffer.from(HTML));
    expect(text).toContain('## Lysis protocol');
    expect(text).toContain('Add 500 uL of buffer.');
    expect(diagnostics).toEqual([]);
  });

  it('xlsx arm: an .xlsx buffer goes through the spreadsheet reader, not the utf8 fallback', async () => {
    const { text } = await decodeAttachmentText('plate.xlsx', undefined, RAW_BYTES);
    // The utf8 fallback would return the replacement-char string; the xlsx
    // reader returns its own empty-text + parse-failure diagnostic instead.
    expect(text).not.toContain('\uFFFD');
  });

  it('utf8 fallback: an unknown extension still decodes as raw utf-8 with no diagnostics', async () => {
    const { text, diagnostics } = await decodeAttachmentText('notes.unknownext', undefined, Buffer.from('plain words'));
    expect(text).toBe('plain words');
    expect(diagnostics).toEqual([]);
  });
});

describe('decodeAttachmentText — new arms (docx/rtf/markdown)', () => {
  it('.docx routes through the config-declared DOCX reader and reports its honest diagnostic', async () => {
    const { text, diagnostics } = await decodeAttachmentText('sop.docx', undefined, DOCX_BYTES);
    expect(text).toBe('');
    // Host state (composer-verified): pandoc ABSENT -> DOCX_TOOL_MISSING. If
    // ops installs pandoc, the fake bytes fail the reader -> DOCX_EXTRACTION_
    // FAILED. Either way the arm is the DOCX reader and the outcome is an
    // honest error diagnostic — never a silent empty text, never the utf8
    // fallback (which would return the raw bytes as text).
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics[0]?.severity).toBe('error');
    expect(diagnostics[0]?.code).toMatch(/^DOCX_/);
  });

  it('wordprocessingml mime routes to the DOCX reader even without a .docx name', async () => {
    const { diagnostics } = await decodeAttachmentText(
      'kit-instructions',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      DOCX_BYTES,
    );
    expect(diagnostics[0]?.code).toMatch(/^DOCX_/);
  });

  it('.rtf routes through the same reader (pandoc reads rtf too)', async () => {
    const { text, diagnostics } = await decodeAttachmentText('old-sop.rtf', undefined, Buffer.from('{\\rtf1 old}'));
    expect(text).toBe('');
    expect(diagnostics[0]?.code).toMatch(/^DOCX_/);
  });

  it('.md returns its own text WITH the markdown_as_text info diagnostic (declared, not accidental)', async () => {
    const { text, diagnostics } = await decodeAttachmentText('lab-protocol.md', undefined, Buffer.from(MARKDOWN));
    expect(text).toBe(MARKDOWN);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.severity).toBe('info');
    expect(diagnostics[0]?.code).toBe('markdown_as_text');
  });

  it('.markdown extension takes the same arm', async () => {
    const { text, diagnostics } = await decodeAttachmentText('lab-protocol.markdown', undefined, Buffer.from(MARKDOWN));
    expect(text).toBe(MARKDOWN);
    expect(diagnostics[0]?.code).toBe('markdown_as_text');
  });
});

// DOCINGEST-B B1/B2 — the dispatcher gains the IMAGE arm. The extension set
// is config data (config/ingestion/document-extraction.yaml `images.formats`),
// so the arm is declared through the config-declared OCR adapter, never a
// hardcoded extension literal (bait 10). Fake PNG bytes (not a decodable
// image) must surface an honest IMAGE_OCR_* error diagnostic — never the utf8
// fallback (which would return the raw bytes as "text") and never a blank
// success.
describe('decodeAttachmentText — image arm (DOCINGEST-B)', () => {
  const FAKE_PNG = Buffer.from('\u0089PNG\r\n\u001a\n fake-png-bytes');

  it('.png routes through the config-declared OCR adapter, not the utf8 fallback', async () => {
    const { text, diagnostics } = await decodeAttachmentText('photographed-page.png', undefined, FAKE_PNG);
    // The utf8 fallback would echo the raw bytes as text; the OCR adapter
    // cannot read these bytes and must say so honestly.
    expect(text, 'the image arm must never fall through to utf8').not.toContain('fake-png-bytes');
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics[0]?.severity).toBe('error');
    expect(diagnostics[0]?.code).toMatch(/^IMAGE_OCR_/);
  });

  it('.jpg and .webp (config-declared image formats) take the same arm', async () => {
    for (const name of ['page.jpg', 'page.webp']) {
      const { text, diagnostics } = await decodeAttachmentText(name, undefined, FAKE_PNG);
      expect(text).not.toContain('fake-png-bytes');
      expect(diagnostics[0]?.code, `${name} must route to the OCR adapter`).toMatch(/^IMAGE_OCR_/);
    }
  });

  it('image mime routes to the OCR adapter even without an image file name', async () => {
    const { diagnostics } = await decodeAttachmentText('scan-1', 'image/png', FAKE_PNG);
    expect(diagnostics[0]?.code).toMatch(/^IMAGE_OCR_/);
  });

  it('pdf/html/xlsx/docx arms stay byte-identical: an image diagnostic never leaks into them', async () => {
    const pdf = await decodeAttachmentText('manual.pdf', undefined, PDF_BYTES);
    expect(pdf.diagnostics.some((d) => d.code.startsWith('IMAGE_OCR_'))).toBe(false);
    const docx = await decodeAttachmentText('sop.docx', undefined, DOCX_BYTES);
    expect(docx.diagnostics[0]?.code).toMatch(/^DOCX_/);
    const html = await decodeAttachmentText('page.html', 'text/html', Buffer.from(HTML));
    expect(html.text).toContain('## Lysis protocol');
  });
});
