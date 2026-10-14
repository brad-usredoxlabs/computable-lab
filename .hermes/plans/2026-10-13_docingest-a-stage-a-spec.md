# DOCINGEST-A — Lab-document ingestor Stage A (executable spec, COMPOSER DRAFT l1t1155)

Item: DOCINGEST-A (lane 1, task-list "Lab-document ingestor Stage A: .docx/.md/.txt/.html/.xlsx
end-to-end via ONE dispatcher (converge the 4 bypass sites, widen schema/handlers/UI/review pane)
(plan Tasks A0-A8)"). Plan doc:
`.hermes/plans/2026-10-11_135441-broaden-protocol-ingest-beyond-pdf.md` (Stage A, Tasks A0-A8).
Composition base: lane trunk `cl/integration-1` @ **95d340a8** — every anchor below re-verified
FIRST-HAND by the composer at this sha (one bounded scout question used for screening only, every
load-bearing claim checked personally with read/grep).

## Goal (one sentence)

The vendor-document ingestor accepts what a lab actually has — vendor PDFs plus `.docx`/`.md`/
`.txt`/`.html`/`.xlsx` uploads — routing every format through the ONE existing dispatcher
(`server/src/extract/decodeAttachment.ts`), storing honest provenance (`source.engine: upload`,
`source.mediaKind`, `source.originalFileName`), previewing the real source in the review pane, and
leaving candidate extraction/promotion completely unchanged.

## §1 Baselines — re-measured FIRST-HAND by the composer at 95d340a8 (my own runs)

```
server tsc:      cd server && npx tsc --noEmit | grep -c "error TS"   -> 0
app tsc:         cd app  && npx tsc --noEmit | grep -c "error TS"     -> 23
server sequences: cd server && npx vitest run src/sequences
                 -> Test Files 10 passed (10); Tests 72 passed | 2 skipped (74)
touch-zone suites: cd server && npx vitest run src/extract src/vendor-documents
                 src/schema/VendorPdfSourceSchema.test.ts
                 src/api/handlers/VendorSearchHandlers.phase9.test.ts
                 src/api/handlers/VendorSearchHandlers.test.ts
                 -> Test Files 24 passed (24); Tests 298 passed (298)
app test:unit fail-file baseline: cd app && npx vitest run 2>&1 | grep -E "^ *FAIL"
                 | sed dedupe -> 59 unique failing files at 95d340a8
                 (25 e2e + 34 unit). NOTE: post-ISEQ-1/ISEQ-2 merges this baseline is expected
                 60/61 (handoff 20261013T1120: "app fail-file baseline is 60 post-ISEQ-1, honest
                 terminal 61"). RE-MEASURE at dispatch; the gate is zero-NEW fail files other
                 than the ONE new app spec this item adds.
host tool state (composer-verified, `command -v`): pandoc ABSENT; tesseract PRESENT;
                 pdftoppm PRESENT. The .docx arm MUST therefore produce the honest
                 DOCX_TOOL_MISSING/DOCX_EXTRACTION_FAILED diagnostic on this host — a blank
                 success is a defect. Installing pandoc is an ops decision, NOT a code change.
```

## §2 Anchors — verified first-hand at 95d340a8

- `server/src/extract/decodeAttachment.ts` (67 lines): `decodeAttachmentText(name, mimeType,
  content)`; arms = pdf (`extractPdfText` — PLAIN text, not layout), html, xlsx, then plain-utf8
  fallback (that fallback is what makes .md/.txt work today, by accident, with no diagnostic).
  Only caller: `server/src/ai/AgentOrchestrator.ts:1492`. NO test file for decodeAttachment
  exists yet (the plan's `decodeAttachment.formats.test.ts` is genuinely new).
- TWO different `extractPdfLayoutText` functions coexist: `server/src/extract/PdfTextAdapter.ts:248`
  (imported by VendorProtocolPdf.ts:3, oligoOrder.ts:8) and
  `server/src/ingestion/pdf/TableExtractionService.ts:20` (imported by pdfAcquisition.ts:5,
  ProtocolImportService.ts:1, AiIngestionHandlers.ts:11). Convergence must NOT naively swap these
  imports — the bypass convergence list is about format dispatch, not about unifying these two.
- The 4 bypass sites (convergence list, plan §"Current context", grep-verified):
  1. `server/src/vendor-documents/pdfAcquisition.ts:158` — `extractPdfLayoutText(buffer, fileName)`
     with `.catch(fallbackLayoutExtraction)` inside `extractVendorPdfText` (:134-166);
     `loadPdfBuffer` (:179) defaults fileName to `'document.pdf'` — a non-PDF upload routed here
     today would be parsed as a PDF.
  2. `server/src/ingestion/vendor-protocol/VendorProtocolPdf.ts:351` — `decodeVendorProtocolPdf(
     buffer, options)` takes NO fileName; used by `decodeVendorProtocolPdfFile(path)` (:359,
     passes basename into options but :351 ignores it) and ZymoDecisionTree.test.
  3. `server/src/protocol/ProtocolImportService.ts:236` — `options.extractPdfText ??
     extractPdfLayoutText` (injectable, typed `typeof extractPdfLayoutText` at :65); the injectable
     seam is a test hook — keep its signature working.
  4. `server/src/api/handlers/AiIngestionHandlers.ts:94` — `extractFileContent(buffer, fileName,
     mimeType)` local function, if/else on extension with its own utf8 fallbacks.
- `extractVendorPdfText` consumers (scout-screened, then verified first-hand):
  `VendorSearchHandlers.ts:1262-1268` (layoutText.pages),
  `server/src/ingestion/labware-spec/LabwareSpecCandidateService.ts:265-280`
  (layoutText.pages || plainText.text, source.fileName/sha256/artifactPath),
  `server/src/mcp/tools/vendorPdfTools.ts:55` (full result passthrough). A widened result shape
  (new OPTIONAL fields) keeps all three compiling untouched.
- Upload route: `server/src/api/routes.ts:507` `POST /vendors/graph-lemur/pdfs/upload`; client
  `app/src/shared/api/client.ts:2716` `uploadGraphLemurVendorPdf` (base64 JSON body; fastify
  bodyLimit 25 MB — server/src/server.ts:204). Handler `ingestGraphLemurPdfUpload`
  (VendorSearchHandlers.ts:1445): writes artifact to
  `join(vendorPdfArtifactRoot(workspaceRoot), `${sha12}.pdf`)` (:~1516 — .pdf suffix HARDCODED),
  payload sets `engine: 'exa'`, `pageCount: 0`, `file.media_type: 'application/pdf'` (:1541-1542),
  `extractedText: []` — it runs NO extraction at all today.
- `schema/lab/vendor-pdf.schema.yaml`: `source.engine` is `const: "exa"` (:82-83);
  `source.additionalProperties: false` (:76); `url` is already NOT flat-required — the W2-8-FIX2 D2
  top-level `if/then` (:22-34) requires `source.url` ONLY when there is no `file.sha256`;
  `file:` -> `schema/core/datatypes/file-ref.schema.yaml` (requires file_name+media_type;
  `page_count` has `minimum: 1`); `extractedText` per-page array (not in `required`);
  `recordId` pattern `^VPDF-[A-Z0-9][A-Z0-9_-]*$`.
- Handler tests that ENCODE today's upload-is-exa contract:
  `server/src/api/handlers/VendorSearchHandlers.phase9.test.ts:428-508` — describe
  "GraphLemur PDF upload → durable vendor-pdf record" asserts `source.engine === 'exa'` at :461
  (upload WITH url) and in the no-url upload block starting :486. These are deliberate RED-inversion
  targets for A5 (say so in the commit message).
  `server/src/schema/VendorPdfSourceSchema.test.ts` builds `engine: 'exa'` payloads at :55/:91.
- UI: `app/src/ingestion/IngestionPage.tsx:28-31` TABS — `{ id: 'vendor-pdf', label: 'Vendor PDFs' }`;
  `IngestionPage.test.tsx` keys off `data-testid` `ingestion-tab-vendor-pdf` (id-based, label-free).
  `app/src/event-editor/right-pane/search/VendorPdfSearchSection.tsx:307` `accept=".pdf,application/pdf"`
  (the "Step 2 — Bring the file back" input, `data-testid="vendor-pdf-bring-back"`, feeds
  `handleBringBack` :150 -> `uploadGraphLemurVendorPdf` :156).
- `app/src/ingestion/VendorPdfReviewPage.tsx` (975 lines): `pdfView: 'pdf' | 'text'` state (:85);
  pdfjs canvas pages (:774+) with existing plain-text fallback branch (:721 `showText`, :832-845
  renders `extractedText` per page in `<pre>`). The text pane ALREADY exists — A7 promotes it to a
  first-class branch keyed on `source.mediaKind`, defaulting to today's behavior when absent.
- OLIGO-AI-3 producer shape (just merged, read as the pattern, do not reuse its machinery):
  `server/src/sequences/oligoOrderAiRead.ts` — policy as DATA in
  `config/sequence-analysis/oligo-order.yaml`, config/prompt/schema loaded via
  `import.meta.url` (:110-111, sequenceIntent.ts precedent), absent config ⇒ behavior OFF, honest
  re-ask-once, never a silent empty success. `server/src/sequences/sequenceRuntime.ts:15` is the
  exact config-path-resolution precedent for the new document-extraction config.
- Host/config facts: `config/` has no `ingestion/` dir yet and `git check-ignore
  config/ingestion/document-extraction.yaml` -> NOT ignored (rc=1). `server/tsconfig.json:13`
  `exactOptionalPropertyTypes: true` (server only). CLAUDE.md non-negotiables: data-not-TS,
  "a missing tool must produce a diagnostic, never an empty document", tests-first (rule 5).
- Goldens: `grep -rln "vendor-pdf" server/src/compiler/__goldens__` -> EMPTY. The vendor-pdf
  schema is NOT in the scientist-intent goldens treeState — no re-bless involved; touching
  `__goldens__` at all is a defect.

## §3 Scope — files IN scope

Server (text acquisition + provenance):
- `config/ingestion/document-extraction.yaml` (NEW) — `docx:` block ONLY for Stage A
  (executable/args/timeoutSeconds; see OQ2 — the `images:` block belongs to Stage B; do not land
  OCR config with dead readers).
- `server/src/extract/DocxTextAdapter.ts` + `DocxTextAdapter.test.ts` (NEW).
- `server/src/extract/decodeAttachment.ts` + `decodeAttachment.formats.test.ts` (NEW test).
- `server/src/vendor-documents/pdfAcquisition.ts` + `pdfAcquisition.test.ts`.
- `server/src/ingestion/vendor-protocol/VendorProtocolPdf.ts` (+ its test — convergence site 2).
- `server/src/protocol/ProtocolImportService.ts` (+ its test — site 3).
- `server/src/api/handlers/AiIngestionHandlers.ts` (site 4).
- `schema/lab/vendor-pdf.schema.yaml` + `server/src/schema/VendorPdfSourceSchema.test.ts`.
- `server/src/api/handlers/VendorSearchHandlers.ts` (upload handler only) +
  `VendorSearchHandlers.phase9.test.ts` (engine inversion + new upload arms).

App (naming + preview):
- `app/src/event-editor/right-pane/search/VendorPdfSearchSection.tsx` (+ its existing test): the
  `accept` list widens; fieldset/copy says "document" honestly.
- `app/src/ingestion/IngestionPage.tsx` (+ its existing test): label `Vendor PDFs` -> `Documents`;
  the tab **id `vendor-pdf` and every data-testid/route stay** (id rename is a separate campaign).
- `app/src/ingestion/VendorPdfReviewPage.tsx` + `VendorPdfReviewPage.sourcePreview.test.tsx` (NEW).

## §4 Scope — explicitly OUT of scope

- Candidate extraction/promotion: `ProtocolExtractionService.createDraftFromVendorPdf`
  (:729-807 — it reads only `vendorPdfPayload.extractedText`, so a one-pseudo-page text record
  flows through unchanged; zero diff here is the acceptance proof), `VendorProtocolPdf.ts`'s
  section/table extraction LOGIC (only its decode entry-point converges), `vendorProtocolCandidate`
  schemas, promotion paths, protocol schemas.
- Stage B: image/OCR adapter, rasterization, keeping page images, the
  `GET /vendor-pdfs/:recordId/page/:pageNumber` endpoint, and the review pane's `image` branch.
  `source.mediaKind` ENUM reserves the `image` value now (schema-only); until Stage B a record
  with `mediaKind: image` renders via today's fallback. Task-list DOCINGEST-B B3 owns the endpoint.
- Stage C: deferred by Brad's 2026-10-12 ruling; ChatMessage content-parts stays un-done.
- Tab/route/recordId renames; the `VPDF-` id convention (keep); `file-ref.schema.yaml` changes;
  `vendorPdfTools.ts` tool description text (it passthroughs the widened result);
  `LabwareSpecCandidateService.ts` (compiles untouched against optional new fields);
  `config/sequence-analysis/*`; anything under `server/src/sequences/` (OLIGO side is DONE);
  `__goldens__`; installing pandoc/tesseract (ops, not code); lockfile changes
  (`pnpm install --frozen-lockfile` is broken on this trunk — use existing node_modules, and
  Stage A adds NO npm dependencies anyway: pandoc is an external binary via config, exactly like
  the oligo OCR precedent).
- NEVER touch :3001/:5174 (Brad's live stack). Lane stack :3092/:5192 restart is the
  orchestrator's post-merge job.

## §5 Acceptance criteria (VERBATIM from the task list, `verified by:` block)

> A0 RED evidence quoted; dispatcher tests (each format arm); a real .docx and .md ingest
> end-to-end to candidate review; review pane previews non-PDF sources; browser gate
> /ingestion on :5192, VERDICT: accept. Zero-NEW on existing pdf path (arms byte-identical).

And the description's binding bullets: A0 prove the gap; A1 DOCX adapter, config-declared tools,
missing tool = honest diagnostic; A2 teach the shared dispatcher the new formats (existing arms
byte-identical); A3 make vendor-document acquisition format-agnostic; A4 widen vendor-pdf schema;
A5 widen upload handler/route; A6 UI accepts and names them honestly; A7 review pane previews the
real source; A8 browser proof on a real lab document; candidate extraction/promotion UNCHANGED.

## §6 A0 — first targeted check (run FIRST, quote output verbatim in the report)

```bash
node -e 'const s=require("fs").readFileSync("server/src/extract/decodeAttachment.ts","utf8");
console.log(/docx/i.test(s) ? "docx handled" : "docx NOT handled (expected)")'
# expect: docx NOT handled (expected)
grep -rn "extractPdfLayoutText" server/src --include=*.ts | grep -v test
# expect: the §2 bypass sites (plus legitimate pdf-only internals: CaymanPlateMapAdapter,
# oligoOrder.ts:72 already format-gated, specDrivenExtractor/caymanPlateMapPdf on the
# ingestion/pdf copy — internals of pdf arms, NOT convergence targets)
cd server && npx tsc --noEmit | grep -c "error TS"          # 0
cd ../app && npx tsc --noEmit | grep -c "error TS"          # 23
```
The EARLY PROOF-OF-APPROACH (run right after the A2 GREEN commit, before touching the handler):
```bash
cd server && npx vitest run src/extract/decodeAttachment.formats.test.ts src/extract/ src/vendor-documents
# expect: new formats test green AND every pre-existing extract/vendor-documents file still green
```
If the .md-via-dispatcher test is not green by this point, stop — the dispatcher approach is wrong
and everything downstream (schema/handler/UI) is built on it.

## §7 Verification gates (complete commands + expected outputs)

```bash
cd server && npx vitest run src/extract/DocxTextAdapter.test.ts                       # 2 passed (config-missing + binary-missing arms; no pandoc needed)
cd server && npx vitest run src/extract/ src/vendor-documents                          # all green; baseline was 24 files / 298 tests across the full touch-zone run incl. schema+handler suites below
cd server && npx vitest run src/schema/VendorPdfSourceSchema.test.ts                  # all passed; engine:'upload'+no url+file.sha256 VALID; engine:'nonsense' INVALID; mediaKind accepted
cd server && npx vitest run src/api/handlers/VendorSearchHandlers.test.ts src/api/handlers/VendorSearchHandlers.phase9.test.ts   # all green; upload arms assert engine==='upload', url-ingest arms STILL engine==='exa'
cd server && npx vitest run src/protocol/ src/ingestion/vendor-protocol/              # green, incl. ZymoDecisionTree.test (decodeVendorProtocolPdfFile PDF path untouched)
cd server && npx vitest run src/sequences                                             # 10 files, 72 passed | 2 skipped — byte-identical, zero diff under server/src/sequences/
cd server && npx tsc --noEmit | grep -c "error TS"                                    # exactly 0 (exactOptionalPropertyTypes live)
cd app && npx vitest run src/event-editor/right-pane/search/VendorPdfSearchSection.test.tsx src/ingestion/IngestionPage.test.tsx src/ingestion/VendorPdfReviewPage.sourcePreview.test.tsx   # all green
npm run typecheck -w app    # or cd app && npx tsc --noEmit — exactly 23 error TS (not 22, not 24)
cd app && npx vitest run 2>&1 | grep -E "^ *FAIL" | sed -E 's/^ *FAIL +//; s/ *> .*//; s/ \[.*//' | sort -u | wc -l
   # baseline 59 at 95d340a8; post-ISEQ-merge expected 60-61. Gate: baseline +1 max (the ONE new
   # app spec) and no OTHER file flips. Report the actual numbers you measured.
```
LIVE PROBES after merge + lane-stack restart (orchestrator's gate, NEVER against :3001/:5174):
```bash
curl -s -X POST http://localhost:3092/api/vendors/graph-lemur/pdfs/upload \
  -H 'content-type: application/json' \
  -d "{\"fileName\":\"lysis.md\",\"contentBase64\":\"$(printf '# Lysis protocol\n\n1. Add 500 uL buffer.\n' | base64 -w0)\",\"title\":\"Composer md probe\"}"
# expect 200, recordedArtifact.recordId VPDF-...; then GET /api/records/<that id>:
# source.engine == "upload", source.mediaKind == "text", source.originalFileName == "lysis.md",
# extractedText == [{pageNumber:1,...containing "Lysis protocol"}], file.media_type NOT "application/pdf"
curl -s -X POST http://localhost:3092/api/extraction/vendor-pdfs/<that id>/draft -H 'content-type: application/json' -d '{}'
# expect 201 with candidateCount >= 1 — the extraction pipeline never cared about the source format
curl ... upload of {"fileName":"virus.exe",...}   # expect 415-class UNSUPPORTED_DOCUMENT error AND GET confirms nothing written
```
Restart trap (lane fact, task-list ENVIRONMENT): `tsx --watch` does NOT reload YAML — schema +
config changes need `cl-lane-stack.sh 1 restart` (orchestrator-owned) before live probes.

## §8 Open questions (composer could not resolve locally; recommended defaults)

- **OQ1 — How deep does convergence cut at sites 2 and 3?** `decodeVendorProtocolPdf`
  (VendorProtocolPdf.ts:346-357) has no fileName and its PDF arm needs LAYOUT text
  (PdfTextAdapter.extractPdfLayoutText), while `decodeAttachmentText`'s PDF arm is PLAIN text —
  routing PDF bytes through the naive dispatcher would SILENTLY DEGRADE vendor PDF extraction.
  ProtocolImportService.ts:65/236 exposes an injectable `typeof extractPdfLayoutText` test seam.
  DEFAULT (recommended): converge by DELEGATION, not by import-swapping — add an optional
  `fileName` to decodeVendorProtocolPdf; PDF bytes keep the exact current layout call;
  non-PDF bytes (or unknown extension) route through `decodeAttachmentText`. ProtocolImportService
  keeps its injectable seam untouched and adds a pre-branch: non-PDF fileName -> dispatcher.
  AiIngestionHandlers.extractFileContent replaces its hand-rolled if/else with the dispatcher,
  PDF arm byte-identical. Alternative rejected: forcing layout through decodeAttachmentText
  (changes PDF extraction behavior — violates "arms byte-identical").
- **OQ2 — Does the `images:` config block land with Stage A?** The plan's A1 yaml includes
  images/OCR keys, but Stage B is a separate dispatched item (dispatch_gate: "do NOT bundle") and
  its reader would not exist until B1. DEFAULT (recommended): Stage A lands `docx:` ONLY; the
  `images:` block lands with B1 next to its reader. The config file header comment names Stage B
  as the future consumer. Alternative (shipped-but-unread config) violates data-honesty spirit.
- **OQ3 — `source.engine` value for the existing upload path + the phase9 inversion + legacy
  records.** The upload handler today stamps `engine: 'exa'` even for url-less content uploads
  (a lie phase9.test.ts:461/:486-block pins). The plan says uploads become `upload`. DEFAULT
  (recommended): `engine: enum [exa, upload, lab]`; upload handler stamps `upload` (the `lab`
  value reserved, unused in Stage A); the phase9 upload assertions are INVERTED in a RED commit
  with the contract change called out in the commit message; NO migration of existing on-disk
  `engine: exa` upload records (both values validate; they are lane test data per A4/Brad ruling).
  Alternative rejected: keeping `exa` on uploads (perpetuates false provenance and the schema
  const blocks the whole feature).

## §9 RED-first commit sequence (exact add-paths and messages; NEVER `git add -A`; every git
command `git -c core.fileMode=false ...`)

- **C1 RED** — `git add server/src/extract/DocxTextAdapter.test.ts` →
  `test(extract): RED — DOCX reader diagnostics (no config / missing binary must never fake an empty success)`.
  Fails: module missing. Tests use a tmpdir configPath — NEVER the plan's cwd-relative default.
- **C2 GREEN** — `git add config/ingestion/document-extraction.yaml server/src/extract/DocxTextAdapter.ts` →
  `feat(extract): DOCX text adapter via a config-declared tool (honest diagnostics when unset or missing)`.
  Config loaded via `import.meta.url` (sequenceRuntime.ts:15 precedent) with an injected-configPath
  seam for tests. pandoc is ABSENT on this host — the GREEN proof IS the two honest-diagnostic arms.
- **C3 RED** — `git add server/src/extract/decodeAttachment.formats.test.ts` →
  `test(extract): RED — dispatcher arms for docx/rtf/markdown + pins existing pdf/html/xlsx/utf8 arms`.
  Pins: .md returns its own text WITH the markdown_as_text info diagnostic; .html still routes
  extractHtmlText; unknown extension still utf8-falls back; pdf/html/xlsx arm behavior frozen.
- **C4 GREEN** — `git add server/src/extract/decodeAttachment.ts` →
  `feat(extract): the shared dispatcher handles docx/rtf/markdown (one entry point for every ingest caller)`.
  Existing arms byte-identical (reviewer will diff the pdf/html/xlsx blocks).
- **C5 RED** — `git add server/src/vendor-documents/pdfAcquisition.test.ts` →
  `test(vendor-documents): RED — text documents acquire as mediaKind text with one pseudo-page; PDF arm (layout + fallback + diagnostics) pinned byte-identical`.
  Include the plan's lab-protocol.md case (mediaKind 'text', one page containing the heading) and a
  PDF regression pin.
- **C6 GREEN** — `git add server/src/vendor-documents/pdfAcquisition.ts` →
  `feat(vendor-documents): text acquisition dispatches by format and reports mediaKind (PDF arm byte-identical)`.
  Optional fields only (`mediaKind?`, `images?` reserved) so the three consumers §2 compile untouched.
- **C7 RED** — `git add server/src/schema/VendorPdfSourceSchema.test.ts server/src/api/handlers/VendorSearchHandlers.phase9.test.ts` →
  `test(schema,ingest): RED — vendor-pdf source stops assuming exa+pdf; upload stamps engine=upload (contract inversion of the phase9 exa pins)`.
  New arms: engine:'upload' + no url + file.sha256 validates (the D2 conditional already waives
  url); engine:'nonsense' fails; source.mediaKind/originalFileName ACCEPTED (they must be declared —
  source is additionalProperties:false); phase9 upload assertions flipped to 'upload', url-ingest
  arms stay 'exa'.
- **C8 GREEN** — `git add schema/lab/vendor-pdf.schema.yaml server/src/api/handlers/VendorSearchHandlers.ts` →
  `feat(schema,ingest): vendor-pdf source enum engine + mediaKind/originalFileName; upload runs real extraction (upload provenance, honest media_type, extension-preserving artifact, honest 415-class refusal)`.
  Handler: READABLE-format gate (extension set DERIVED from document-extraction.yaml per §10 bait 8)
  returning `{error:'UNSUPPORTED_DOCUMENT'}` 415-class with NOTHING written; run
  extractVendorPdfText(mode:'both') on the bytes; stamp engine 'upload', mediaKind,
  originalFileName, pageCount from extraction, extractedText = the pseudo-pages; artifact keeps the
  ORIGINAL extension (`${sha12}${ext}`) with honest file.media_type from the config's declared
  format map; `file.page_count` omitted (minimum:1 forbids 0) for non-PDF; VPDF-id derivation and
  the D2 file.sha256 rule untouched.
- **C9 RED** — `git add server/src/ingestion/vendor-protocol/VendorProtocolPdf.test.ts server/src/api/handlers/AiIngestionHandlers.converge.test.ts` (create whichever suite does not exist) →
  `test(ingest): RED — VendorProtocolPdf/AiIngestionHandlers route non-PDF formats through the ONE dispatcher; PDF layout arm frozen`.
  Per OQ1: decodeVendorProtocolPdf with a .md buffer+fileName returns the text; a .pdf buffer still
  goes through the layout extractor (spy/pin); AiIngestionHandlers csv/html/md arms unchanged in
  text, unchanged for pdf.
- **C10 GREEN** — `git add server/src/ingestion/vendor-protocol/VendorProtocolPdf.ts server/src/protocol/ProtocolImportService.ts server/src/api/handlers/AiIngestionHandlers.ts` (+ the ProtocolImportService test if a RED arm belongs there) →
  `refactor(ingest): converge the remaining extractPdfLayoutText bypass sites onto the shared dispatcher (delegation, PDF arms byte-identical; injectable test seam kept)`.
  After this: `grep -rn "extractPdfLayoutText" server/src --include=*.ts | grep -v test` shows only
  pdf-internal arms (the two function definitions + their true pdf callers) — the 4 named bypass
  sites now format-gate or dispatch.
- **C11 RED** — `git add app/src/event-editor/right-pane/search/VendorPdfSearchSection.test.tsx app/src/ingestion/IngestionPage.test.tsx app/src/ingestion/VendorPdfReviewPage.sourcePreview.test.tsx` →
  `test(ingest-ui): RED — picker accepts lab documents, tab reads Documents, review pane previews the real source (mediaKind) with pdf default when absent`.
  sourcePreview arms: mediaKind 'text' payload renders extractedText and does NOT mount pdfjs;
  mediaKind ABSENT still takes today's pdf path (legacy-record regression pin).
- **C12 GREEN** — `git add app/src/event-editor/right-pane/search/VendorPdfSearchSection.tsx app/src/ingestion/IngestionPage.tsx app/src/ingestion/VendorPdfReviewPage.tsx` →
  `feat(ingest-ui): the document picker accepts lab documents, the tab reads Documents, and the SAID pane previews the real source (pdf canvases | selectable text)`.
  accept=".pdf,.docx,.doc,.rtf,.md,.markdown,.txt,.html,.htm,.xlsx,.xls,.csv" (NO image
  extensions — those ride Stage B's upload arm); copy "Add a protocol document (PDF, Word,
  Markdown, text, or spreadsheet)."; tab id/data-testids UNCHANGED; review pane switches on
  source.mediaKind (text|spreadsheet -> selectable text with original-file header; absent/pdf ->
  today exactly; 'image' -> today's pdf fallback until Stage B).

## §10 Reviewer bait (the likely edge errors for this item — the coder pre-empts all of them)

1. **The two-extractPdfLayoutText trap**: `extract/PdfTextAdapter.ts:248` and
   `ingestion/pdf/TableExtractionService.ts:20` are DIFFERENT functions. Any diff that "unifies"
   them, or routes a PDF through `decodeAttachmentText`'s PLAIN-text pdf arm, changes vendor-PDF
   extraction — instant reject. The pdf arms must be byte-identical (§5 acceptance says so).
2. **cwd trap** (carried lane finding "server-suite cwd trap"): the plan's docx config default is
   the cwd-relative `'config/ingestion/document-extraction.yaml'` — server vitest runs with cwd
   `server/`, so that default NEVER resolves. Load via `import.meta.url` (sequenceRuntime.ts:15)
   with a `configPath` override for tests; mutation probe: delete the file from cwd, tests must
   still pass; delete the repo file, you get DOCX_TOOL_NOT_CONFIGURED (the honest arm), never a
   silent empty text.
3. **pandoc-ABSENT honesty**: on this host a "successful" .docx extraction is FAKE. The only valid
   GREEN for the success arm is the two diagnostic arms (NOT_CONFIGURED / TOOL_MISSING) + the live
   browser state showing the honest diagnostic. A report claiming "docx text extracted" here is a
   fabrication.
4. **exactOptionalPropertyTypes sites (server/tsconfig.json:13)**: `source.mediaKind`,
   `source.originalFileName`, widened `VendorPdfExtractionResult.mediaKind?`, handler payload
   spreads — conditional spread `...(kind ? { mediaKind: kind } : {})` ONLY; `{ x: undefined }` is
   a tsc failure AND an envelope-validation liar. server tsc must stay exactly 0.
5. **additionalProperties:false on `source`** (schema :76): mediaKind/originalFileName must be
   DECLARED in vendor-pdf.schema.yaml or every upload envelope fails at runtime Ajv while unit
   tests that skip createEnvelope still pass. The phase9/handler suites go through the real
   envelope — keep them real; no test may hand-build a payload that bypasses the schema gate.
6. **The D2 conditional still bites**: schema :22-34 requires source.url whenever
   `file.sha256` is absent. An upload record MUST carry file.sha256 (it always has) — dropping
   the file block or sha256 while removing the exa-url stamp makes uploads un-storable. Mutation
   probe: remove sha256 from the test payload -> schema-invalid.
7. **file-ref floor**: `page_count` minimum is 1 — never stamp `file.page_count: 0` for a text
   document (omit the key). `source.pageCount` minimum 0 is fine.
8. **Hardcode boundary (CLAUDE.md "The Hard Boundary")**: the readable-extension gate and any
   extension->media_type map are FORMAT POLICY — declare them in
   `config/ingestion/document-extraction.yaml` and read them from code; no domain lists in TS.
   Mutation probe: change the config (remove csv) -> the handler refuses csv. Also: no hardcoded
   'application/pdf' left on the upload stamp (:1541-1542 today).
9. **Artifact-extension sneak**: the upload writes `${sha12}.pdf` unconditionally — a .md stored
   as .pdf makes the blob handler serve text as application/pdf and the review pane's pdf path
   choke. The widened handler keeps the original extension AND the blob handler's path-traversal
   guard keeps working (stored_path still under workspace root).
10. **phase9 inversion honesty**: flipping :461/:486-block from 'exa' to 'upload' is a deliberate
    contract change (OQ3), not test-noodling — it must be RED-committed separately (C7) and named
    in the commit message. Leaving either upload assertion at 'exa' with a handler stamping
    'upload' (or vice versa) is a split-brain defect.
11. **Tab-id / testid sneak**: renaming the `vendor-pdf` tab id, the route, the `VPDF-` recordId
    pattern, or any data-testid breaks IngestionPage.test.tsx and every receipt tool. Only the
    human LABEL moves.
12. **Legacy-record blankout**: mediaKind is absent on EVERY existing record. The review pane's
    switch must default to today's pdf path (`absent -> pdf`), pinned by the sourcePreview test —
    a legacy VPDF record that goes blank is the exact EDITOR-era failure mode (round-3 gate).
13. **YAML-reload trap**: schema/config edits do NOT hot-reload (tsx --watch ignores YAML). Any
    live :3092 probe before an orchestrator restart reads the OLD schema — report it, don't fake
    the probe. Coder never restarts the lane stack.
14. **Goldens / manifest**: vendor-pdf is NOT in the goldens treeState (composer-verified empty
    grep) — if any golden test suddenly "needs a re-bless", the diff touched the wrong thing.
15. **App baseline honesty**: app test:unit is NOT green (59 fail files at 95d340a8; 60-61
    post-ISEQ). The honest bar is baseline + the ONE new spec. A report claiming "fully green"
    fails the gate on sight.
16. **Second-dispatcher violation** (plan cross-cutting rule): any new per-format if-chain in
    pdfAcquisition or the handler instead of `decodeAttachmentText` delegation = reject.

## §11 Worker contract

- Worktree `/mnt/vast/home/brad/git/wt/DOCINGEST-A-lane1-l1t<ts>`, branch
  `wt/DOCINGEST-A-lane1-l1t<ts>` off lane trunk `cl/integration-1` — base MUST include 95d340a8
  (OLIGO-AI-3) and the post-ISEQ trunk; first coder action: on-disk confirm `git merge-base
  --is-ancestor 95d340a8 HEAD` in the fresh worktree AND that ISEQ-1/ISEQ-2 merges are in
  (deps: [OLIGO-AI-3, ISEQ-2]).
- Lane-sync convention (OLIGO-AI-2/3 + ISEQ-1 proven): root `node_modules` symlink ->
  `cl-integration-1/node_modules`, `server/schema` symlink, `schema/*` lane-exclude REAL COPIES;
  no `pnpm install` (lockfile drift known-broken on this trunk).
- Report (unique): `/home/brad/.hermes/cl/lanes/1/docingest-a-report-l1t<ts>.md`, ending marker
  `DOCINGEST-A CODER DONE <sha>`. Commits per §9 only; every git command
  `git -c core.fileMode=false ...`; never `git add -A`; NEVER edit the task list or trunk;
  :3001/:5174/:3093/:5193 never touched; no blanket pkill; lane-stack restart is
  orchestrator-owned (post-merge).
- No new npm dependencies. No product-code outside §3. Stop-boundary: anything that can't be
  expressed within §3/§4 (schema redesign beyond §3's edits, promotion changes, Stage B surface)
  -> STOP and return requires-rescope to the architect with evidence.

## §12 BROWSER GATE (owed — this item changes UI; states on :5192 ONLY)

Against a stack confirmed serving the merged revision (confirm the served checkout contains the
merge sha first; restart happens post-merge, orchestrator-owned). Receipts
`/home/brad/.hermes/cl/receipts/DOCINGEST-A/<ts>/`. Every negative claim (blank/404/absent)
re-verified by reload or API call before reporting (reviewer reliability rule).
- **S1** `/ingestion` — tab strip reads **Documents** (tab id unchanged; DevTools/attribute crop
  proving `data-testid="ingestion-tab-vendor-pdf"` still present).
- **S2** Upload flow: the bring-back file input's `accept` attribute crop includes `.docx,.md`
  (no image types); upload a real lab-authored `.md` fixture (ask Brad for one; composer cannot
  fabricate lab provenance) -> review page opens for the new VPDF- record.
- **S3** Review pane, text-kind record: selectable extracted text pane is FIRST-CLASS (header
  names the original file), NO pdfjs canvas mounted, `source.engine: upload` /
  `source.mediaKind: text` visible in the record (API-readback crop or UI facts); then run the
  extraction draft from the UI (or the §7 curl) and screenshot candidates appearing — the
  pipeline-cared-nothing-about-format proof.
- **S4** Control: an existing PDF VPDF record opens with pdfjs canvases exactly as before
  (zero-NEW regression on the pdf path; full-page crop).
- **S5** The .docx truth: upload a real `.docx`; on this host (pandoc ABSENT — composer-verified)
  the expected state is the record stored with the honest DOCX diagnostic surfaced in the UI,
  never a blank successful-looking document. Screenshot whichever state is real; if pandoc has
  been installed by ops since composition, screenshot the extracted text instead. Report the
  observed state verbatim.
Verdict language: `VERDICT: accept|reject` per state. Automatic rejects: blank preview on any
state, pdfjs canvases gone on S4, .docx presenting as successfully empty, exa provenance claimed
for an upload.

COMPOSER-DRAFT-END l1t1155
