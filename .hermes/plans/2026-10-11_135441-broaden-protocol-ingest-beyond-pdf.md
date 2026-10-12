# Plan: broaden `/ingestion/vendor-pdf` into a lab-document ingestor (.docx, .md, .txt, .html, .xlsx, scanned/written pages)

Plan file: `.hermes/plans/2026-10-11_135441-broaden-protocol-ingest-beyond-pdf.md`
Target repo/worktree: a NEW worktree off **`main`** — `/mnt/vast/home/brad/git/wt/DOC-INGEST-<TS>`
Surface: `http://computable:5174/ingestion/vendor-pdf` (main's stack). Brad pointed at `:5192` because that lane's stack was up; the code is identical on main and both lanes, so **target main** (the lanes are behind and mid-campaign — see Current context).
Cross-cutting: this and `.hermes/plans/2026-10-11_133742-oligo-order-ai-read-fallback.md` share the SAME choke point (`server/src/extract/decodeAttachment.ts`). Read that plan's Task 3 before adding a second text-acquisition path — do not build two dispatchers.

---

## Goal (one sentence)

The protocol ingestor accepts what a lab actually has — vendor PDFs **and** lab-written `.docx`/`.md`/`.txt`/`.html`/`.xlsx` files **and** scanned or photographed pages (including notebook pages) — routing every source through ONE text-acquisition dispatcher, previewing whatever the source really is in the review pane, and leaving candidate extraction/promotion unchanged.

## Current context / assumptions (verified first-hand at `main` @ 455232cf)

### The chain today is PDF-shaped at every hop

| Hop | Where | PDF-specific fact |
|---|---|---|
| UI tab | `app/src/ingestion/IngestionPage.tsx:28-31` | tab id `vendor-pdf`, label `'Vendor PDFs'` |
| Upload input | `app/src/event-editor/right-pane/search/VendorPdfSearchSection.tsx:306-307` | `accept=".pdf,application/pdf"` — nothing else can be chosen |
| Client | `app/src/shared/api/client.ts:2627` `uploadGraphLemurVendorPdf` | `POST /vendors/graph-lemur/pdfs/upload` (base64 body); `:2617` is the ingest-by-URL twin |
| Routes | `server/src/api/routes.ts:503-505` | `…/pdfs` search/ingest/upload |
| Handler | `server/src/api/handlers/VendorSearchHandlers.ts` (`ingestGraphLemurPdfUpload`) | builds the `vendor-pdf` payload (`:1118`, `:1274`) and writes it with `…/vendor-pdf.schema.yaml` (`:1140`, `:1317`) |
| Text acquisition | `server/src/vendor-documents/pdfAcquisition.ts` — `extractVendorPdfText()` | `:158` calls `extractPdfLayoutText(buffer, fileName)` with a `fallbackLayoutExtraction`; `downloadVendorPdf` fetches by URL (browser UA, 50 MB cap, 20 s timeout) |
| Record schema | `schema/lab/vendor-pdf.schema.yaml` | `source.engine: const "exa"`, `source` requires `engine,url,ingestedAt` (`url` is `format: uri`), `file: datatypes/file-ref.schema.yaml`, `extractedText: [{pageNumber, text}]` — **page-oriented**, `recordId: ^VPDF-` |
| Candidate extraction | route `routes.ts:875` `POST /extraction/vendor-pdfs/:vendorPdfId/draft` → `server/src/ingestion/vendor-protocol/VendorProtocolPdf.ts:351` | `extractPdfLayoutText(buffer)` again (a SECOND direct call) |
| Review pane | `app/src/ingestion/VendorPdfReviewPage.tsx:4-5,15-17` | left pane renders the stored PDF with **pdfjs-dist canvas pages** ("plain-text fallback when the blob is unavailable"); blob served by `GET /vendor-pdfs/:recordId/pdf` (`server/src/api/handlers/VendorPdfBlobHandlers.ts`; client URL at `client.ts:4993`) |

### The multi-format capability ALREADY EXISTS — the vendor-pdf path just doesn't use it

`server/src/extract/decodeAttachment.ts` exports `decodeAttachmentText(name, mimeType, content)` and dispatches to `PdfTextAdapter` / `HtmlTextAdapter` / `XlsxTextAdapter`, with a **plain-`utf-8` fallback** — which already covers `.md` and `.txt` for free. Its only caller today is the chat attachment path (`server/src/ai/AgentOrchestrator.ts:1265`). Direct `extractPdfLayoutText` calls that bypass it (the four sites to converge):
1. `server/src/vendor-documents/pdfAcquisition.ts:158`
2. `server/src/ingestion/vendor-protocol/VendorProtocolPdf.ts:351`
3. `server/src/protocol/ProtocolImportService.ts:236`
4. `server/src/api/handlers/AiIngestionHandlers.ts:94`

**So "broaden the ingestor" is mostly: make the vendor-pdf path use the shared dispatcher, add the two missing adapters (DOCX), widen one schema, and teach the review pane that the source is not always a PDF.**

### Dependencies (server/package.json)

Present: `pdf-parse`, `xlsx`, `yaml`, `ajv`, `zod`, `@fastify/multipart`. **Absent: any docx/zip reader, any markdown parser.** Node's stdlib has no ZIP reader, and a `.docx` is a ZIP. The repo already has a blessed pattern for this: declare an external binary in CONFIG and invoke it with a timeout — `config/sequence-analysis/oligo-order.yaml`'s `ocr: { rasterizer: pdftoppm, executable: tesseract, … }`. Use the same pattern for DOCX (`pandoc`, which reads `.docx`/`.odt`/`.rtf`/`.html` → text) and for images (`tesseract`). **A missing tool must produce a diagnostic, never an empty document.**

### Uncommitted state in main's working tree

Only the oligo hardening is dirty (`config/sequence-analysis/oligo-order.yaml`, `server/src/sequences/oligoOrder.ts`, `…test.ts`) — untouched by this plan. `app/tmp-vp-probe.mjs` is an untracked pdfjs-geometry scratch probe (page rotation), unrelated. Do not commit in `/mnt/vast/home/brad/git/computable-lab`; work in the worktree.

## Architecture / proposed approach

One text-acquisition module with per-format adapters (existing PDF/HTML/XLSX + new DOCX + new IMAGE/OCR) that every ingest caller goes through, returning `{ mediaKind, pages[], text, images[], diagnostics[] }`; the vendor-pdf record keeps its identity but its schema stops assuming Exa+PDF (widen `source.engine`, make `url` optional for uploads, add `mediaKind`); and the review pane switches on `mediaKind` — pdfjs canvases for PDFs (unchanged), page images for scans, selectable extracted text for text sources. Candidate extraction and promotion never learn what the source format was.

---

## Stage A — text documents (.md, .txt, .html, .xlsx, .docx) end-to-end

### Task A0 — Worktree, baselines, and prove the gap first (~10 min)

```bash
TS=$(date +%Y%m%dT%H%M)
cd /mnt/vast/home/brad/git/computable-lab
git worktree add /mnt/vast/home/brad/git/wt/DOC-INGEST-${TS} -b cl/doc-ingest-${TS} main
cd /mnt/vast/home/brad/git/wt/DOC-INGEST-${TS}/server
npx tsc --noEmit 2>&1 | grep -c "error TS"      # record the count (baseline; zero-NEW is the gate)
npx vitest run src/extract/ src/vendor-documents/ 2>&1 | tail -4
cd ../app && npx tsc --noEmit 2>&1 | grep -c "error TS"    # record
```
RED evidence for the gap (this is the "before" a reviewer must see). In the worktree:
```bash
node -e 'const s=require("fs").readFileSync("server/src/extract/decodeAttachment.ts","utf8");
console.log(/docx/i.test(s) ? "docx handled" : "docx NOT handled (expected)")'
# → docx NOT handled (expected)
grep -rn "extractPdfLayoutText" server/src --include=*.ts | grep -v test
# → 4 bypass sites (listed in Current context) — this is the convergence list
```

### Task A1 — A DOCX adapter, config-declared (RED → GREEN)

Config first (DATA, not TS) — append to `config/sequence-analysis/oligo-order.yaml`? **No.** Create a document-scoped config: `config/ingestion/document-extraction.yaml`:

```yaml
# Text-acquisition tools and formats for ingested lab documents.
# External tools are declared here (never hardcoded in TypeScript); a missing
# tool is an honest diagnostic, never a silently empty document.
docx:
  # pandoc reads .docx/.odt/.rtf → plain text; declared, not assumed.
  executable: pandoc
  args: ['--to', 'plain', '--wrap=none']
  timeoutSeconds: 60
images:
  executable: tesseract
  language: eng
  timeoutSeconds: 120
  # scans of PDFs are rasterized first (same tools the oligo OCR path declares)
  rasterizer: pdftoppm
  dpi: 200
  maxPages: 40
```

Create `server/src/extract/DocxTextAdapter.ts`:

```ts
/**
 * DOCX → plain text via a CONFIG-DECLARED external tool (pandoc).
 *
 * A .docx is a ZIP; the repo has no zip reader and we do not add one for a text
 * extraction. pandoc is declared in config/ingestion/document-extraction.yaml
 * exactly like the OCR tools are, so swapping the tool is a data edit. A missing
 * tool yields an honest diagnostic and empty text — never a silent success.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import type { ExtractionDiagnostic } from './ExtractorAdapter.js';

export interface DocxExtractionResult { text: string; diagnostics: ExtractionDiagnostic[] }

interface DocxToolConfig { executable: string; args: string[]; timeoutSeconds: number }

function docxToolConfig(path = 'config/ingestion/document-extraction.yaml'): DocxToolConfig | null {
  if (!existsSync(path)) return null;
  const doc = parseYaml(readFileSync(path, 'utf-8')) as { docx?: Partial<DocxToolConfig> } | null;
  const docx = doc?.docx;
  if (!docx?.executable) return null;
  return {
    executable: docx.executable,
    args: Array.isArray(docx.args) ? docx.args : ['--to', 'plain', '--wrap=none'],
    timeoutSeconds: typeof docx.timeoutSeconds === 'number' ? docx.timeoutSeconds : 60,
  };
}

export async function extractDocxText(
  buffer: Buffer,
  options: { configPath?: string; fileName?: string } = {},
): Promise<DocxExtractionResult> {
  const config = docxToolConfig(options.configPath);
  if (!config) {
    return { text: '', diagnostics: [{ severity: 'error', code: 'DOCX_TOOL_NOT_CONFIGURED',
      message: 'No DOCX reader is configured (config/ingestion/document-extraction.yaml: docx.executable). The document was stored, but its text could not be read.' }] };
  }
  const dir = await mkdtemp(join(tmpdir(), 'cl-docx-'));
  const input = join(dir, options.fileName ?? 'document.docx');
  try {
    await writeFile(input, buffer);
    const exec = promisify(execFile);
    // '--to plain' to stdout: `pandoc in.docx --to plain --wrap=none`
    const { stdout } = await exec(config.executable, [...config.args, input], {
      timeout: config.timeoutSeconds * 1000, maxBuffer: 32 * 1024 * 1024,
    });
    return { text: stdout, diagnostics: [] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const missing = /ENOENT/.test(message);
    return { text: '', diagnostics: [{
      severity: 'error',
      code: missing ? 'DOCX_TOOL_MISSING' : 'DOCX_EXTRACTION_FAILED',
      message: missing
        ? `The configured DOCX reader "${config.executable}" is not installed on this host. Install it, or clear the field and paste the text.`
        : `DOCX extraction failed: ${message}`,
    }] };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
```

RED test — `server/src/extract/DocxTextAdapter.test.ts` (no pandoc needed: stub the config + assert the honest failure path):

```ts
import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractDocxText } from './DocxTextAdapter.js';

function configFile(body: string) {
  const dir = mkdtempSync(join(tmpdir(), 'cl-docx-cfg-'));
  const path = join(dir, 'document-extraction.yaml');
  writeFileSync(path, body);
  return path;
}

describe('DOCX text adapter', () => {
  it('reports an honest diagnostic when no reader is configured', async () => {
    const { text, diagnostics } = await extractDocxText(Buffer.from('PK'), { configPath: '/nonexistent.yaml' });
    expect(text).toBe('');
    expect(diagnostics[0]?.code).toBe('DOCX_TOOL_NOT_CONFIGURED');
  });

  it('reports a MISSING tool (not an empty document) when the binary is absent', async () => {
    const configPath = configFile('docx:\n  executable: definitely-not-a-real-binary-xyz\n  timeoutSeconds: 5\n');
    const { text, diagnostics } = await extractDocxText(Buffer.from('PK'), { configPath });
    expect(text).toBe('');
    expect(diagnostics[0]?.code).toBe('DOCX_TOOL_MISSING');
  });
});
```
```bash
cd server && npx vitest run src/extract/DocxTextAdapter.test.ts    # FAIL (module missing) → implement → 2 passed
```
Then prove it on a real file by hand (pandoc present or not — either outcome is acceptable, but you must know which):
```bash
command -v pandoc && echo "pandoc present" || echo "pandoc ABSENT on this host — the UI must say so"
```
Commit:
```bash
git -c core.fileMode=false add config/ingestion/document-extraction.yaml server/src/extract/DocxTextAdapter.ts server/src/extract/DocxTextAdapter.test.ts
git -c core.fileMode=false commit -m "feat(extract): DOCX text adapter via a config-declared tool (honest diagnostics when unset or missing)"
```

### Task A2 — Teach the dispatcher the new formats (RED → GREEN)

`server/src/extract/decodeAttachment.ts` — add the branches (keep the existing pdf/html/xlsx arms byte-identical):

```ts
  const isDocx = lowerName.endsWith('.docx') || mime.includes('wordprocessingml');
  const isMarkdown = /\.(md|markdown)$/i.test(lowerName);
  const isRtf = lowerName.endsWith('.rtf');
  …
    if (isDocx || isRtf) {
      const res = await extractDocxText(buf, { ...(mime ? {} : {}), fileName: lowerName });
      return { text: res.text, diagnostics: res.diagnostics };
    }
    if (isMarkdown) {
      // Markdown is text: the plain-utf8 arm already returns it. Kept explicit so
      // the format is DECLARED rather than falling through by accident.
      return { text: buf.toString('utf-8'), diagnostics: [{ severity: 'info', code: 'markdown_as_text',
        message: 'Markdown was read as plain text; headings and emphasis are not interpreted.' }] };
    }
```
Test (extend `server/src/extract/` with `decodeAttachment.formats.test.ts`): a `.md` buffer decodes to its own text with the info diagnostic; an `.html` buffer still goes through `extractHtmlText`; an unknown extension still falls back to utf-8 (pin the existing behavior).
```bash
cd server && npx vitest run src/extract/ 2>&1 | tail -4    # all green
```
Commit:
```bash
git -c core.fileMode=false add server/src/extract/decodeAttachment.ts server/src/extract/decodeAttachment.formats.test.ts
git -c core.fileMode=false commit -m "feat(extract): the shared dispatcher handles docx/rtf/markdown (one entry point for every ingest caller)"
```

### Task A3 — Make vendor-document text acquisition format-agnostic (RED → GREEN)

`server/src/vendor-documents/pdfAcquisition.ts` — `extractVendorPdfText` currently PDF-only (`:158`). Widen it to dispatch and to report what kind of source this is:

```ts
export interface VendorPdfExtractionResult {
  kind: 'vendor-pdf-text-extraction';
  mediaKind: 'pdf' | 'text' | 'spreadsheet' | 'image';   // NEW
  source: { artifactPath?: string; fileName: string; sha256: string };
  mode: 'plain' | 'layout' | 'both';
  plainText?: { text: string; pageCount: number; diagnostics: unknown[] };
  layoutText?: { pages: Array<{ pageNumber: number; text: string }>; pageCount: number };
  images?: Array<{ pageNumber: number; path: string }>;  // NEW (Stage B fills it)
}
```
Implementation shape (keep the PDF branch byte-identical — it has a fallback and diagnostics that other callers depend on):
```ts
  const lower = (input.fileName ?? 'document').toLowerCase();
  const isPdf = lower.endsWith('.pdf');
  const decoded = isPdf
    ? /* the existing layout path, unchanged */
    : await decodeAttachmentText(lower, undefined, buffer);
  const mediaKind = isPdf ? 'pdf'
    : /\.(xlsx|xls)$/.test(lower) ? 'spreadsheet'
    : /\.(png|jpe?g|tiff?|webp)$/.test(lower) ? 'image'
    : 'text';
  // A non-PDF has no page model: one pseudo-page keeps the downstream page
  // contract satisfied without pretending the document is paginated.
  const pages = isPdf ? layoutPages : [{ pageNumber: 1, text: decoded.text }];
```
RED test — extend `server/src/vendor-documents/pdfAcquisition.test.ts`:
```ts
it('reads a markdown document as text (one pseudo-page, mediaKind text)', async () => {
  const buffer = Buffer.from('# Lysis protocol\n\n1. Add 500 uL of buffer.\n');
  const result = await extractVendorPdfText({ workspaceRoot: '/tmp', contentBase64: buffer.toString('base64'), fileName: 'lab-protocol.md', mode: 'both' });
  expect(result.mediaKind).toBe('text');
  expect(result.layoutText?.pages).toEqual([{ pageNumber: 1, text: expect.stringContaining('Lysis protocol') }]);
});
```
```bash
cd server && npx vitest run src/vendor-documents/    # FAIL → implement → green (the existing PDF arms must stay green)
```
Commit:
```bash
git -c core.fileMode=false add server/src/vendor-documents/pdfAcquisition.ts server/src/vendor-documents/pdfAcquisition.test.ts
git -c core.fileMode=false commit -m "feat(vendor-documents): text acquisition dispatches by format and reports mediaKind (PDF arm byte-identical)"
```

### Task A4 — Widen the record schema (data change; RED → GREEN)

`schema/lab/vendor-pdf.schema.yaml` — three edits, each minimal:
1. `source.engine`: `const: "exa"` → `enum: [exa, upload, lab]` (an uploaded lab document has no Exa provenance), and keep `url` optional by moving it out of `required`:
```yaml
  source:
    type: object
    additionalProperties: false
    required: [ engine, ingestedAt ]
    properties:
      engine:
        type: string
        enum: [ exa, upload, lab ]
        description: >-
          How the document arrived: exa (found by vendor search), upload (a file
          the user supplied), lab (authored in this lab).
      vendor: { type: string }
      title: { type: string }
      url: { type: string, format: uri }
      query: { type: string }
      ingestedAt: { type: string, format: date-time }
      pageCount: { type: integer, minimum: 0 }
      mediaKind:
        type: string
        enum: [ pdf, text, spreadsheet, image ]
        description: "What the stored file IS — drives the review pane's source preview."
      originalFileName: { type: string }
```
2. `extractedText` stays (page-oriented) but stops being required anywhere (verify it is not in `required` — it is not).
3. `title` and `state` unchanged.

Tests — `server/src/schema/VendorPdfSourceSchema.test.ts` already exists (it was cited for the Quantity datatype); extend it: an `engine: upload` payload with no `url` validates; `engine: 'nonsense'` fails.
```bash
cd server && npx vitest run src/schema/VendorPdfSourceSchema.test.ts    # RED → GREEN
```
**MANIFEST check:** the vendor-pdf schema is NOT in the scientist-intent goldens treeState, so no re-bless is involved. Confirm anyway:
```bash
git -c core.fileMode=false status --short schema/ && git -c core.fileMode=false diff --stat schema/
```
Commit:
```bash
git -c core.fileMode=false add schema/lab/vendor-pdf.schema.yaml server/src/schema/VendorPdfSourceSchema.test.ts
git -c core.fileMode=false commit -m "feat(schema): vendor-pdf source stops assuming exa+pdf (engine enum, optional url, mediaKind)"
```

### Task A5 — Widen the upload handler and route (RED → GREEN)

`server/src/api/handlers/VendorSearchHandlers.ts` `ingestGraphLemurPdfUpload`:
- Accept a broader extension/mime set and reject only what nothing can read (an honest 415-class `SequenceError`-style failure, not a 500).
- Set `source.engine: 'upload'` (today it is Exa-shaped), `source.mediaKind` from the extraction, `source.originalFileName`, and `pageCount` from the extraction.
- Keep the `VPDF-` record id and the existing store write untouched otherwise.

```ts
const READABLE = /\.(pdf|docx|doc|rtf|md|markdown|txt|html?|xlsx|xls|csv|png|jpe?g|tiff?|webp)$/i;
if (!READABLE.test(params.fileName ?? '')) {
  return { success: false, error: 'UNSUPPORTED_DOCUMENT',
    message: `Unsupported document type "${params.fileName ?? 'unknown'}". Supported: PDF, DOCX, RTF, Markdown, TXT, HTML, XLSX/CSV, and page images.` };
}
```
RED test in the existing handler suite (`server/src/api/handlers/` — find the current VendorSearch handler test file and extend it): uploading `lab-protocol.md` creates a `vendor-pdf` with `source.engine === 'upload'` and `source.mediaKind === 'text'`; uploading `virus.exe` returns `UNSUPPORTED_DOCUMENT` and writes nothing.
```bash
cd server && npx vitest run src/api/handlers/ 2>&1 | tail -4     # green, no new failures
```
Commit:
```bash
git -c core.fileMode=false add server/src/api/handlers/VendorSearchHandlers.ts server/src/api/handlers/*VendorSearch*.test.ts
git -c core.fileMode=false commit -m "feat(ingest): the vendor-pdf upload accepts lab documents (honest 415-class refusal, upload/lab provenance, mediaKind)"
```

### Task A6 — The UI: accept them and name them honestly

`app/src/event-editor/right-pane/search/VendorPdfSearchSection.tsx:306-307`:
```tsx
accept=".pdf,.docx,.doc,.rtf,.md,.markdown,.txt,.html,.htm,.xlsx,.xls,.csv,.png,.jpg,.jpeg,.tif,.tiff,.webp"
```
and the copy around it (the fieldset label/help text) from "PDF" to "document" — keep the wording honest about what is read: *"Add a protocol document (PDF, Word, Markdown, text, spreadsheet, or page images)."*

`app/src/ingestion/IngestionPage.tsx:28-31`: the tab label becomes data — change `{ id: 'vendor-pdf', label: 'Vendor PDFs' }` → `{ id: 'vendor-pdf', label: 'Documents' }`. **Keep the tab id** (`vendor-pdf`) so every existing route/test/`data-testid` keeps working; only the human label moves. (If Brad wants the id renamed too, that is a separate rename with route compatibility — open question 1.)

Tests: `app/src/event-editor/right-pane/search/VendorPdfSearchSection.test.tsx` (exists) — assert the input's `accept` includes `.docx`; `app/src/ingestion/IngestionPage.test.tsx` (exists) — assert the tab label reads `Documents`.
```bash
cd app && npx vitest run src/event-editor/right-pane/search/VendorPdfSearchSection.test.tsx src/ingestion/IngestionPage.test.tsx
cd .. && npm run typecheck -w app      # baseline count, zero NEW
```
Commit:
```bash
git -c core.fileMode=false add app/src/event-editor/right-pane/search/VendorPdfSearchSection.tsx app/src/event-editor/right-pane/search/VendorPdfSearchSection.test.tsx app/src/ingestion/IngestionPage.tsx app/src/ingestion/IngestionPage.test.tsx
git -c core.fileMode=false commit -m "feat(ingest-ui): the document picker accepts lab documents and the tab reads Documents"
```

### Task A7 — The review pane previews the real source (RED → GREEN)

`app/src/ingestion/VendorPdfReviewPage.tsx` renders the stored blob with pdfjs canvases. Introduce a three-way source preview keyed on the record's `source.mediaKind` (default `pdf` when absent, so every existing record renders exactly as today):

```tsx
type SourcePreviewKind = 'pdf' | 'text' | 'image';

function sourcePreviewKind(payload: Record<string, unknown>): SourcePreviewKind {
  const kind = (payload.source as { mediaKind?: string } | undefined)?.mediaKind;
  if (kind === 'text' || kind === 'spreadsheet') return 'text';
  if (kind === 'image') return 'image';
  return 'pdf';              // absent ⇒ today's behavior
}
```
- `text` → render `payload.extractedText` joined by page as a **selectable `<pre>`/`<div>`** (this is the "plain-text fallback" the file already has — promote it to a first-class branch), with a header naming the original file.
- `image` → render the stored page images (`<img src={API_BASE + '/vendor-pdfs/' + recordId + '/page/' + n}>` — see Task B3 for the endpoint) one per page.
- `pdf` → the existing canvas viewer, untouched.

The blob endpoints: add `GET /vendor-pdfs/:recordId/page/:pageNumber` in `server/src/api/handlers/VendorPdfBlobHandlers.ts` (mirroring the existing `/pdf` handler at `routes.ts:1188`), serving `source.mediaKind === 'image'` page files; return 404 with an honest message when there is no page image.

Tests: `app/src/ingestion/VendorPdfReviewPage.treeSelect.test.tsx` exists — add a sibling `VendorPdfReviewPage.sourcePreview.test.tsx`: a text-kind payload renders the extracted text and does NOT mount pdfjs; an absent-kind payload still takes the PDF path.
```bash
cd app && npx vitest run src/ingestion/VendorPdfReviewPage.sourcePreview.test.tsx   # RED → GREEN
cd ../server && npx vitest run src/api/handlers/ 2>&1 | tail -4
```
Commit:
```bash
git -c core.fileMode=false add app/src/ingestion/VendorPdfReviewPage.tsx app/src/ingestion/VendorPdfReviewPage.sourcePreview.test.tsx server/src/api/handlers/VendorPdfBlobHandlers.ts
git -c core.fileMode=false commit -m "feat(review): the SAID pane previews the real source (pdf canvases | page images | selectable text)"
```

### Task A8 — Prove Stage A end to end (browser + a real lab document)

1. Ask Brad for a real lab-authored protocol — a `.docx` or a lab-written `.md` — and one vendor PDF as the control.
2. On `:5174/ingestion/vendor-pdf`: upload the `.md`. Expect a `vendor-pdf` record with `source.engine: upload`, `source.mediaKind: text`, the left pane showing the text, and the right pane offering extraction.
3. Do the same with the `.docx`. If pandoc is absent on the host, expect the honest `DOCX_TOOL_MISSING` diagnostic in the UI — record that as the observed state (and tell Brad; installing pandoc is an ops decision, not a code change).
4. Upload the vendor PDF as a control: the left pane must still render pdfjs canvases exactly as before.
5. Run the extraction draft (`POST /extraction/vendor-pdfs/:id/draft`) on the `.md` record and confirm candidates appear — i.e. the pipeline never cared what the source format was.
6. Screenshot receipt → `~/.hermes/cl/receipts/doc-ingest/<timestamp>/` (SOP rule 12).

---

## Stage B — scans and photographs (including notebook pages)

### Task B1 — Image adapter with the SAME config-declared OCR tools

Create `server/src/extract/ImageTextAdapter.ts` using `images:` from `config/ingestion/document-extraction.yaml` (declared in Task A1) — same shape and honesty rules as `DocxTextAdapter`: config-missing → `IMAGE_OCR_NOT_CONFIGURED`; binary missing → `IMAGE_OCR_TOOL_MISSING`; success → text + the `LOCAL_OCR_REVIEW` warning the oligo path already uses (*"Transcribed using local OCR… Check page coverage, every base and modification against the PDF before importing."* — reword for protocols).

RED test mirrors `DocxTextAdapter.test.ts` (config-missing + binary-missing arms; no tesseract needed).

### Task B2 — Rasterize scanned PDFs and KEEP the page images

In `extractVendorPdfText` (Task A3's widened branch): when the PDF's text is empty (a scan) and `images.rasterizer` is configured, rasterize to `page-NNN.png` in a per-record directory under the artifact root, then OCR each page; return `mediaKind: 'image'` with `images: [{pageNumber, path}]` plus `layoutText.pages` from the OCR text. Follow the oligo path's `maxPages`/`dpi`/timeout discipline and its diagnostic wording.

### Task B3 — Serve the page images and show them

`GET /vendor-pdfs/:recordId/page/:pageNumber` (Task A7's endpoint), then the review pane's `image` branch (Task A7). Redact nothing: these are the lab's own documents — but the handler must refuse a path that escapes the record's own artifact directory (`resolve` + prefix check) so a crafted `pageNumber` cannot read arbitrary files. Add that test explicitly (a `../..` attempt returns 404).

### Task B4 — Prove Stage B on a real scan

Photograph (or scan) a page, upload it, and confirm: OCR text present, page image shown in the review pane, the OCR caution visible, and extraction still producing candidates. If tesseract is absent, record that as the observed state and stop — do not fake the receipt.

---

## Stage C — handwriting: the AI round trip IS the answer (an HTR library is not)

**Decision (recommended, and it is cheap because the plumbing is nearly there):** read handwritten pages by a **vision round trip to the model** — page image → schema-constrained read → the same candidate pipeline — not by installing a handwriting-OCR library.

**Why not an HTR library.** TrOCR / Kraken / PaddleOCR are *line-level character* recognizers: they need text-line detection first, a Python/PyTorch stack on the lab box, and they still return *characters*, so a second LLM pass is required to get protocol steps out of them. Two systems and more ops for output we would immediately re-parse. Tesseract (already installed) is print-OCR and is genuinely poor on handwriting. Cloud document-AI (Azure Document Intelligence / AWS Textract / Google Vision) IS excellent at handwriting, but it sends the page off-site — unacceptable as a default for a lab notebook, so it stays an optional, off-by-default adapter (C5). A vision model gives characters **and structure** in one schema-constrained call, and this lab already runs one locally.

**What the round trip actually needs — verified, and it is smaller than it looks:**
1. `ChatMessage.content` is `string | null` (`server/src/ai/types.ts:16-29`); that TS type is the ONLY structural blocker. `normalizeRequest` (`server/src/ai/InferenceClient.ts:82-108`) **spreads `messages` verbatim** into the request body, so an OpenAI-compatible content-part array (`[{type:'text'},{type:'image_url',image_url:{url:'data:image/png;base64,…'}}]`) reaches the wire unchanged — llama.cpp-server and vLLM both accept that form.
2. Most content readers are ALREADY guarded (`AgentOrchestrator.ts:208,1283,1312,1358,1595,1605,1716,1765,1821`, `clarificationLoop.ts:45` all do `typeof message.content === 'string'`), so widening the union degrades gracefully. The one real refactor is `InferenceClient.ts:26-41`, which fills an empty `content` from the reasoning fallback: with a union, "empty" must mean "no TEXT part" and must never clobber an image-carrying content array.
3. **Vision capability is not declared anywhere.** `InferenceConfig` (`server/src/config/types.ts:213+`) has provider/baseUrl/model/apiKey/timeout/maxTokens/temperature/enableThinking — no vision flag, and `grep -rn "mmproj\|vision\|image_url\|multimodal" config.yaml config.example.yaml server/src/config/` returns nothing. Without it the app cannot know whether the configured model accepts images and would silently post a page image to a text-only model. Declare it as DATA (the `enableThinking` presets are the precedent) and refuse honestly when it is absent.
4. The local vision endpoint is already up: an `llama-server` is listening on `100.111.141.22:8080` (the qwen35-4b-vision box, Q4_K_S + mmproj), so handwritten pages never leave the lab.

### Task C1 — Widen `ChatMessage` to content parts (RED → GREEN)

`server/src/ai/types.ts`:
```ts
/** An OpenAI-compatible multimodal content part. */
export type ChatContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };   // url may be a data: URL

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | ChatContentPart[] | null;   // was: string | null
  …
}
```
RED test — `server/src/ai/InferenceClient.contentParts.test.ts`: stub `fetch`, send a message whose content is `[{type:'text',text:'read this'},{type:'image_url',image_url:{url:'data:image/png;base64,AAAA'}}]`, and assert the **captured request body** carries the part array unchanged (this pins that `normalizeRequest` stays a pass-through — the whole feature rests on it).
Then fix the fallback fill (`InferenceClient.ts:26-41`):
```ts
    const hasText = typeof message.content === 'string' && message.content.trim().length > 0;
    const hasParts = Array.isArray(message.content)
      && message.content.some((part) => part.type === 'text' && part.text.trim().length > 0);
    if (hasText || hasParts) continue;      // never clobber an image-carrying message
```
```bash
cd server && npx vitest run src/ai/InferenceClient.contentParts.test.ts   # RED → GREEN
cd server && npx vitest run src/ai/ 2>&1 | tail -4                        # no new failures
cd server && npx tsc --noEmit 2>&1 | grep -c "error TS"                   # any NEW error is a reader to guard
```
Commit:
```bash
git -c core.fileMode=false add server/src/ai/types.ts server/src/ai/InferenceClient.ts server/src/ai/InferenceClient.contentParts.test.ts
git -c core.fileMode=false commit -m "feat(ai): ChatMessage carries content parts (image data URLs reach the wire verbatim; reasoning fallback never clobbers an image message)"
```

### Task C2 — Vision capability as DATA, with an honest refusal

`server/src/config/types.ts` — extend `InferenceConfig`:
```ts
  /**
   * Does the served model accept image inputs? Declared, never guessed: the
   * image-read paths refuse honestly when it is absent rather than posting a
   * page image to a text-only model.
   */
  vision?: {
    supportsImages: boolean;
    /** Largest single image to send (bytes, after encoding). */
    maxImageBytes?: number;
    /** Pages/images per call — a small model reads one page well, ten badly. */
    maxImagesPerCall?: number;
  };
```
Mirror it in `config.example.yaml` with a commented example, and add a test asserting an unset `vision` reads as "no images" (`server/src/config/` — extend the existing config test file).
The read path's guard:
```ts
  if (!inferenceConfig.vision?.supportsImages) {
    return { text: '', diagnostics: [{ severity: 'error', code: 'VISION_NOT_CONFIGURED',
      message: 'This page has no readable text layer. Reading it needs an image-capable model — set one in Settings (the configured model does not accept images).' }] };
  }
```
Commit:
```bash
git -c core.fileMode=false add server/src/config/types.ts config.example.yaml server/src/config/*.test.ts
git -c core.fileMode=false commit -m "feat(config): vision capability declared as data; image reads refuse honestly when the model cannot see"
```

### Task C3 — The page read: image → schema-constrained draft (never invent)

Create `server/src/extract/ImageReadAdapter.ts`:
```ts
/**
 * Read a page IMAGE (a scan or a photograph of a lab notebook) with a
 * vision-capable model and return a schema-constrained draft.
 *
 * The rules that make handwriting safe are the SAME as the printed-scan path:
 *   - the page image is attached to every row so a human verifies the crop;
 *   - every value carries the verbatim region it was read from;
 *   - a digit that cannot be read is null + unreadable, NEVER a guess (5 vs 50
 *     µL is the failure that ruins an experiment);
 *   - the model is shown the lab's own material/labware vocabulary (the
 *     LAB INVENTORY precedent) — domain words are what makes handwriting legible.
 */
```
Contract:
- `readHandwrittenPage(imagePng: Buffer, deps: { llmClient; model; vocabulary?: { materials: string[]; labware: string[] }; maxImageBytes?: number }): Promise<{ draft: unknown | null; diagnostics: ExtractionDiagnostic[] }>`
- One call per page by default (`maxImagesPerCall` from C2 governs); if a page exceeds `maxImageBytes`, downscale first and record an info diagnostic about the reduction.
- Ask for: `{ steps: [{ kind, label, sourceRegion, reagents: [{ name, volume: { value, unit } | null, unreadable?: true, sourceRegion }], labware: [], notes }] }` — and state in the prompt: *"if a digit is not legible, return null with unreadable: true — never infer a plausible number."*
- Reuse `response_format: { type: 'json_object' }` (or a tool call) and validate with Ajv before returning; one repair retry, then honest failure (the oligo AI-read plan's discipline).

RED test: stub the client; assert (a) the request body carries an `image_url` part, (b) a draft with `unreadable: true` flows through untouched, (c) an unconfigured vision model returns `VISION_NOT_CONFIGURED` and makes NO call (assert the client was never invoked).
Commit:
```bash
git -c core.fileMode=false add server/src/extract/ImageReadAdapter.ts server/src/extract/ImageReadAdapter.test.ts
git -c core.fileMode=false commit -m "feat(extract): handwritten page read via a vision model (image attached, regions quoted, unreadable never guessed)"
```

### Task C4 — Crop-anchored review (the human stays in the loop)

The read is only trustworthy if the reviewer can check it in one glance:
- Persist the page image (Stage B already stores page images under the record's artifact directory) and, per row, the `sourceRegion` text and (when the model supplies it) a bounding box.
- In the review pane's `image` source branch (Stage B Task A7), render the page image with the row's region highlighted, and put the extracted values beside it — so "50 µL" is always one look away from the handwritten "50 µL".
- Every handwriting-read row defaults to **needs confirmation**, and the pane says why: *"Read from a photograph of a handwritten page — check every volume against the image."* (The OCR path's `LOCAL_OCR_REVIEW` wording is the precedent.)
- No candidate from a handwritten read may be promoted without an explicit human confirm (reuse the existing review/accept flow; do not add a new gate mechanism).

Test: an app unit test asserting a handwriting-read candidate renders with the page image, the region quote, and the confirmation prompt visible.

### Task C5 — OPTIONAL (config-declared, off by default): cloud document-AI

If handwriting accuracy on a real corpus proves inadequate, the honest third tier is a cloud document-intelligence adapter (Azure Document Intelligence / AWS Textract / Google Vision). Requirements before it is ever enabled:
- It is an **adapter behind the same interface** (C3's), selected by config — never a code branch on a vendor name.
- API keys come from the environment (the repo's hard boundary: no credentials in code or data files).
- The UI states plainly that the page leaves the lab, and it is **off unless enabled in config** — a lab notebook is not something to ship to a third party by default.
- Its output enters the SAME draft contract (C3), so the deterministic pipeline never learns which reader produced it.

### Task C6 — Acceptance on a real handwritten page

Photograph a page of an actual lab notebook (or hand-write a protocol page deliberately), upload it, and require: the page image shown in the review pane; every step and reagent read; **every volume either read with a visible source region or explicitly `unreadable` — zero invented digits**; the confirmation prompt present; and the extracted candidates reaching the same review/promotion flow. Screenshot receipt → `~/.hermes/cl/receipts/doc-ingest/<timestamp>/`. If the honest outcome is "the model could not read this page", that IS the recorded result — do not paper over it.

---

## Tests / validation (the gate)

| Check | Command (worktree) | Expected |
|---|---|---|
| DOCX adapter | `cd server && npx vitest run src/extract/DocxTextAdapter.test.ts` | 2 passed (unset + missing-tool arms) |
| Dispatcher | `cd server && npx vitest run src/extract/` | all green (pdf/html/xlsx arms unchanged) |
| Acquisition | `cd server && npx vitest run src/vendor-documents/` | green; markdown → `mediaKind: text`, 1 pseudo-page |
| Schema | `cd server && npx vitest run src/schema/VendorPdfSourceSchema.test.ts` | `engine: upload` without url validates; unknown engine fails |
| Handler | `cd server && npx vitest run src/api/handlers/` | green; `.md` upload → `engine: upload`; `.exe` → `UNSUPPORTED_DOCUMENT`, nothing written |
| UI units | `cd app && npx vitest run src/ingestion/ src/event-editor/right-pane/search/` | green; accept list + tab label + source-preview branch |
| Types | `cd server && npx tsc --noEmit 2>&1 \| grep -c "error TS"` and the same in `app/` | equal to the Task A0 baselines (zero NEW) |
| Live | Task A8 / B4 | `.md` and `.docx` ingest + extract + preview; vendor PDF unchanged; scan shows text + page image |
| Browser | Task A8 step 6, B4 | receipts, per SOP rule 12 |

TDD per task: write the test → run (paste RED) → implement → run (GREEN) → commit with the exact `git add` paths. Never `git add -A`. Never commit in `/mnt/vast/home/brad/git/computable-lab`. Never restart `:3001`/`:5174` — ask Brad.

## Risks, tradeoffs, open questions

- **The record KIND is now a lie for lab documents.** `kind: "vendor-pdf"` (and the `VPDF-` id prefix) for a lab-authored `.md` or a notebook page is wrong naming, and this repo has a naming admission process (`schema/registry/wave2-naming-crosswalk.yaml`, W2-1). This plan deliberately keeps the kind (YAGNI: every ref, route, test and the review host point at it) and widens only its contents. **Open question 1:** rename to something like `source-document` with the crosswalk admission, or keep `vendor-pdf` as the internal kind and let the UI say "Documents"? (Recommendation: keep the kind now; raise the rename as its own crosswalk item once the ingestor is proven with real lab documents.)
- **External tools are now load-bearing** (pandoc for DOCX, tesseract/pdftoppm for scans). The repo's precedent is config-declared + honest diagnostics, which this plan follows; but a host without them gives a degraded experience. Task A1's `command -v pandoc` step and Task B4 make the host's real capability explicit instead of assumed. Ops decision, flagged, not hidden.
- **Gateway/dependency decision:** the alternative to pandoc is a Node DOCX library (`mammoth`) — one new dependency, no host binary. If Brad prefers dependencies over host tools, Task A1's adapter body changes (the config surface stays). This is a real fork; the plan picked the binary because the repo already ships one that way.
- **Pseudo-pages for pageless sources.** A `.md` has no pages; this plan maps the whole text to page 1 so downstream stays satisfied. If a lab protocol is 20 000 words, one pseudo-page is a coarse unit for review anchors. Follow-up (not now): chunk long text sources into pseudo-pages by heading, reusing `server/src/extract/TextChunker.ts` (it exists).
- **The review pane is the second half of this feature.** Ingesting a `.docx` without a readable SAID pane would be worse than not ingesting it — that is why Task A7 is in Stage A, not deferred.
- **Four bypass sites.** `ProtocolImportService.ts:236`, `AiIngestionHandlers.ts:94` and `VendorProtocolPdf.ts:351` still call `extractPdfLayoutText` directly. Converging all four on the dispatcher is the DRY completion of this work and prevents the next format from repeating this problem; this plan does the vendor-pdf path (the one Brad named) and files the other three as a follow-up item with the same test discipline.
- **Shared choke point with the oligo plan.** `decodeAttachment.ts` is also the fallback seam for `.hermes/plans/2026-10-11_133742-oligo-order-ai-read-fallback.md`. Land whichever goes first, then have the second add ONLY its adapter (no second dispatcher).
- **File-size caps differ today** (`pdfAcquisition` 50 MB, the oligo upload 10 MB, the multipart route's own limit). Declare ONE cap in `config/ingestion/document-extraction.yaml` (`maxBytes`) and read it in both, rather than three literals.
- **Not in scope:** the record-kind rename (open question 1), pseudo-page chunking for very long text sources, converging the other three `extractPdfLayoutText` call sites, the oligo AI-read path, and any change to candidate extraction/promotion. (Handwriting/vision IS now designed — Stage C — because the round trip turned out to need only a type widening plus a declared capability.)
