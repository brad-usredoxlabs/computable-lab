# DOCINGEST-B — Lab-document ingestor Stage B (image OCR, scanned-PDF rasterization, page images)

Item: DOCINGEST-B (lane 1 task list: "Stage B: scanned/photographed pages — image OCR adapter,
rasterize scanned PDFs, keep+serve page images (plan Tasks B1-B4)"). Plan doc:
`.hermes/plans/2026-10-11_135441-broaden-protocol-ingest-beyond-pdf.md` (Stage B, Tasks B1-B4,
plan line ~424+). Composition base for FACTS: trunk `cl/integration-1` @ **0a4dc3f8** — every
anchor below verified FIRST-HAND by the composer there. Stage A (DOCINGEST-A) deliverables are
described "per DOCINGEST-A spec (pending merge)" wherever cited — the A coder is live as of this
composition (handoff 20261013T1540), so A's shapes are declared, not yet on-disk.

## Goal (one sentence)

A photographed or scanned lab page becomes a `vendor-pdf` record with `source.mediaKind: image`,
real OCR text (config-declared tesseract, honest `IMAGE_OCR_*` diagnostics when the tool is
missing), retained page images that are data-referenced artifacts served by
`GET /api/vendor-pdfs/:recordId/page/:pageNumber` with a hard path-escape refusal, shown in the
review pane's `image` branch with a visible OCR caution — and candidate extraction/promotion stay
completely unchanged.

## §0 STRUCTURAL GATE (dispatch precondition — read before anything else)

1. The dispatch base MUST be a trunk HEAD that **contains the DOCINGEST-A merge**. First coder
   action in the worktree: `git -c core.fileMode=false log --oneline | grep -i DOCINGEST-A` (or
   `git merge-base --is-ancestor <A-merge-sha> HEAD`) AND on-disk presence of
   `server/src/extract/DocxTextAdapter.ts`, `config/ingestion/document-extraction.yaml`,
   `app/src/ingestion/VendorPdfReviewPage.sourcePreview.test.tsx`. If any is absent: STOP,
   requires-rescope — Stage B has no substrate.
2. **Re-anchor every §2 line number at dispatch HEAD.** All numbers below were measured at
   0a4dc3f8, PRE-Stage-A-merge; Stage A's C1-C12 diffs will shift them. The anchors NAME files and
   functions so they stay findable; only the numbers move.
3. Re-measure §1 baselines at dispatch HEAD before writing any RED test; the gate is zero-NEW
   against YOUR numbers, not against the composer's.
4. deps: [DOCINGEST-A]. dispatch_gate (task list, verbatim): "Stage A merged + observed; separate
   spec composition (do NOT bundle with A)." This spec IS that composition.

## §1 Baselines — measured FIRST-HAND by the composer at 0a4dc3f8 (my own runs)

```
server tsc:    cd server && npx tsc --noEmit | grep -c "error TS"   -> 0
app tsc:       cd app  && npx tsc --noEmit | grep -c "error TS"     -> 23
touch-zone:    cd server && npx vitest run src/extract src/vendor-documents
               src/schema/VendorPdfSourceSchema.test.ts
               src/api/handlers/VendorSearchHandlers.phase9.test.ts
               src/api/handlers/VendorSearchHandlers.test.ts
               -> Test Files 24 passed (24); Tests 298 passed (298)   [2.76s]
app src/ingestion LOCAL baseline (composer-run): 15 passed | 1 FAILED file
               -> VendorPdfReviewPage.treeSelect.test.tsx: 2 failing tests PRE-EXISTING at
                  0a4dc3f8 ("blood-spin (0 proposals)" vs "blood spin"; "Updating the selected
                  branch…"). NOT yours to fix, NOT a NEW failure — do not "repair" it, do not
                  count it against yourself; the app-wide fail-file baseline is 61 post-ISEQ-2
                  (handoff 20261013T1540 orch numbers). Gate: baseline + at most the ONE new app
                  spec this item adds, no OTHER file flips.
host tools (composer `command -v` + `--version` at 0a4dc3f8): tesseract PRESENT (/usr/sbin,
               5.5.3), pdftoppm PRESENT (/usr/sbin, 26.08.0), pandoc ABSENT. eng.traineddata
               present (/usr/share/tessdata). ImageMagick convert/magick present (fixture-making
               only — see bait 14).
gitignore fact (verified): top-level `.gitignore:28` = `artifacts/` — page images written under
               the artifact root are git-ignored workspace data by construction (bait 3).
```

Stage A will have ADDED suites to the touch-zone by merge time; re-measure per §0.3.

## §2 Anchors — verified first-hand at 0a4dc3f8 (re-anchor at dispatch HEAD per §0.2)

- **Oligo OCR precedent (the pattern to copy, machine NOT to reuse)**:
  `server/src/sequences/oligoOrder.ts:75-86` — `if (config.ocr?.enabled)` guard (:75);
  `mkdtemp(tmpdir/cl-oligo-ocr-)` scratch dir (:76); rasterizer call
  `exec(config.ocr.rasterizer, ['-r', dpi, '-f','1','-l', String(maxPages), '-png', input, join(dir,'page')], {timeout})`
  (:80); page list `readdir(...).filter(.png).sort(numeric)` (:81); per-page tesseract
  `exec(executable, [page, 'stdout', '-l', language], {timeout, maxBuffer: 10*1024*1024})` (:82);
  join pages with `\f` (:83); warning `LOCAL_OCR_REVIEW` with message "Transcribed using local
  OCR (up to the configured page limit). Check page coverage, … against the PDF before
  importing." (:84); failure → `LOCAL_OCR_FAILED` error diagnostic (:85); `finally` rm scratch
  (:85). Config `config/sequence-analysis/oligo-order.yaml:58-65`:
  `ocr: { enabled, rasterizer: pdftoppm, executable: tesseract, language: eng, dpi: 200,
  maxPages: 20, timeoutSeconds: 120 }`. The trigger condition upstream (:73-74): only when the
  PDF layout text is empty — THE scan-detector to reuse.
  Config-path resolution precedent: `server/src/sequences/sequenceRuntime.ts:15`
  (`fileURLToPath(new URL('../../../config/...', import.meta.url))`) — the cwd-trap killer.
- **Dispatcher**: `server/src/extract/decodeAttachment.ts` (67 lines at 0a4dc3f8; arms pdf/html/
  xlsx/utf8-fallback). Stage A (C4) teaches it docx/rtf/markdown — still NO image arm (A's
  C12 accept list explicitly excludes image types: "those ride Stage B's upload arm"). B1/B2 add
  the image arm HERE; a per-format if-chain anywhere else = second-dispatcher reject.
- **Acquisition**: `server/src/vendor-documents/pdfAcquisition.ts` —
  `vendorPdfArtifactRoot(workspaceRoot) = resolve(workspaceRoot,'artifacts','foundry','pdfs')`
  (:71); `extractVendorPdfText` (:134-166) — plain arm (:149-155), layout arm with
  `.catch(fallbackLayoutExtraction)` (:158-163), `fallbackLayoutExtraction` (:168, plain-text
  split on \f), `loadPdfBuffer` (:179, defaults fileName 'document.pdf'). Stage A (C6) widens
  `VendorPdfExtractionResult` with OPTIONAL `mediaKind?` and `images?: Array<{pageNumber:number;
  path:string}>` ("reserved", per DOCINGEST-A spec C6 — pending merge). **Stage B fills `images`
  and takes `mediaKind:'image'` for scans** — the ONLY stage that mutates the PDF arm's internals
  since A's byte-identical guarantee; the text-layer PDF behavior must stay pinned (bait 5).
- **Upload handler**: `server/src/api/handlers/VendorSearchHandlers.ts`
  `ingestGraphLemurPdfUpload` (:1445); artifact write
  `join(vendorPdfArtifactRoot(ws), sha12+'.pdf')` (:1516 — A's C8 makes the extension
  format-derived, pending merge); stamps today `engine:'exa'` (:1533),
  `media_type:'application/pdf'` (:1542), `extractedText: []` (:1551) — A's C8 replaces all of
  that with real extraction + `engine:'upload'` + `mediaKind`/`originalFileName` (per
  DOCINGEST-A spec, pending merge). Route: `server/src/api/routes.ts:507`
  `POST /vendors/graph-lemur/pdfs/upload` (the ONE upload route; client
  `app/src/shared/api/client.ts:2716` `uploadGraphLemurVendorPdf`, base64 JSON, fastify bodyLimit
  25 MB). Stage B does NOT add a second upload route (OQ3).
- **Blob serving**: `server/src/api/handlers/VendorPdfBlobHandlers.ts` (134 lines) —
  `RECORD_ID_PATTERN = /^VPDF-[A-Za-z0-9_-]+$/` (:25); the existing guard shape to mirror EXACTLY:
  `resolve(workspaceRootAbsolute, file.stored_path)` + `relative(...)` → `rel === '' ||
  rel.startsWith('..')` → 400 PATH_TRAVERSAL (:78-86); stream-send gotcha `return
  reply.send(stream)` (:125-130, load-bearing comment :126-129). Route registration
  `server/src/api/routes.ts:1199-1204` (`GET /vendor-pdfs/:recordId/pdf`, under the /api prefix —
  note: the PLAN says "routes.ts:1188" — plan drift; measured at :1202). Wiring
  `server/src/server.ts:1524` `createVendorPdfBlobHandlers({recordStore, workspaceRoot})`,
  passed at :1587. Test file EXISTS: `VendorPdfBlobHandlers.test.ts` (8 tests, escape arm
  included) — extend it, do not duplicate it.
- **Schema (post-Stage-A target, per DOCINGEST-A spec C8)**:
  `schema/lab/vendor-pdf.schema.yaml` at 0a4dc3f8 has `source.engine: const "exa"` (:82-83),
  `source.additionalProperties: false` (:76), `extractedText` per-page array NOT in `required`,
  D2 if/then waiving `source.url` when `file.sha256` present (:22-34), top-level
  `unevaluatedProperties: false` (:13). A adds `engine: enum [exa, upload, lab]`,
  `source.mediaKind` enum **`[pdf, text, spreadsheet, image]`** (THE vocabulary — ONE term per
  entity, no synonyms like 'scan'/'ocr'), `source.originalFileName`. **Stage B expects a ZERO
  schema diff**: `image` is already in the enum, OCR text rides `extractedText`, `source.pageCount`
  carries the page count, page-file locations are derived by convention (§B2). If the coder
  wants a schema edit, that is a smell — stop and justify (bait 16).
- **Review pane**: `app/src/ingestion/VendorPdfReviewPage.tsx` (975 lines at 0a4dc3f8) —
  `pdfView` state (:85), pdfjs `getDocument({url: pdfUrl})` (:329-354, `pdfUrl =
  apiClient.vendorPdfBlobUrl(recordId)` :168), canvas pages (:810+), text fallback
  `showText` (:721, text pane :832-845 with per-page `<pre>` + `data-vpdf-page` attrs — the
  OCR-text pane will look exactly like this). A's C12 lands the `sourcePreviewKind` switch
  (pdf|text|spreadsheet|image→pdf-fallback "until Stage B", per A spec) in
  `VendorPdfReviewPage.sourcePreview.test.tsx` companion work (pending merge). **B replaces the
  `'image' → pdf fallback` with the real branch**: one `<img>` per page via the new endpoint +
  the OCR caution (bait 12 on caution persistence). Client needs
  `vendorPdfPageUrl(recordId, pageNumber)` next to `vendorPdfBlobUrl`
  (`app/src/shared/api/client.ts:5150-5152`, `${API_BASE}/vendor-pdfs/${encodeURIComponent(
  recordId)}/pdf` — mirror the encodeURIComponent discipline for the page number too).
- **Config**: `config/ingestion/document-extraction.yaml` — created by A (C2, `docx:` block only,
  header names Stage B as the `images:` consumer — A spec OQ2 DEFAULT). **B1 lands `images:` next
  to its reader**, plan-shape keys + the format gate Stage B needs:
  ```yaml
  images:
    executable: tesseract
    language: eng
    timeoutSeconds: 120
    rasterizer: pdftoppm
    dpi: 200
    maxPages: 40
    formats: [png, jpg, jpeg, tif, tiff, webp]   # upload-gate policy (bait 10)
  ```
  Read it with A's `import.meta.url` loader pattern (sequenceRuntime.ts:15 / DocxTextAdapter
  injected-configPath seam) — REUSE A's loader, do not build a second config reader (bait 9).

## §3 Scope — files IN scope

Server:
- `config/ingestion/document-extraction.yaml` (append `images:` block ONLY; `docx:` untouched).
- `server/src/extract/ImageTextAdapter.ts` + `ImageTextAdapter.test.ts` (NEW) — OCR a single
  image buffer via config-declared tesseract; arms: no config → `IMAGE_OCR_NOT_CONFIGURED`,
  binary missing → `IMAGE_OCR_TOOL_MISSING`, success → text + `LOCAL_OCR_REVIEW` warning (message
  reworded for protocols, CODE identical to the oligo precedent — bait 12); argv built from
  config (language, timeout) — assert argv via injected exec, no real tesseract in units (bait 14).
- `server/src/extract/decodeAttachment.ts` + `decodeAttachment.formats.test.ts` (extend) — image
  arm delegating to ImageTextAdapter; existing arms byte-identical.
- `server/src/vendor-documents/pdfAcquisition.ts` + `pdfAcquisition.test.ts` — scan branch in the
  PDF arm: empty text-layer + `images.rasterizer` configured → rasterize to `page-NNN.png` in a
  per-record page directory under the artifact root + OCR each page → `mediaKind:'image'`,
  `images:[{pageNumber,path}]`, layout pages from OCR text; NEW exported helper
  `vendorPdfPageDir(workspaceRoot, sha12)` (sibling of `vendorPdfArtifactRoot`, single naming
  convention shared by writer AND page route — bait 10); also direct image uploads through
  `extractVendorPdfText` (image extension → OCR the bytes, no rasterizer). maxPages discipline:
  pages capped per oligo :80 AND when page-count === maxPages push a coverage warning diagnostic,
  never truncate silently (bait 11).
- `server/src/api/handlers/VendorSearchHandlers.ts` (upload handler only) +
  `VendorSearchHandlers.phase9.test.ts` (image arms) — accept image formats per config
  `images.formats`, stamp `mediaKind:'image'`, `source.pageCount`, `extractedText` = OCR pages,
  honest `file.media_type` from the config map.
- `server/src/api/handlers/VendorPdfBlobHandlers.ts` + `.test.ts` + `server/src/api/routes.ts` +
  `server/src/server.ts` (one route line + wiring) — `getPageImage` handler (below §B3 shape).

App:
- `app/src/shared/api/client.ts` — `vendorPdfPageUrl(recordId, pageNumber)`.
- `app/src/event-editor/right-pane/search/VendorPdfSearchSection.tsx` (+ its test) — accept list
  gains the config-declared image extensions (mirror the A list; NO drift — bait 4).
- `app/src/ingestion/VendorPdfReviewPage.tsx` + `VendorPdfReviewPage.sourcePreview.test.tsx`
  (extend — file exists post-A) — the real `image` branch: `<img>` per page (src =
  vendorPdfPageUrl), OCR caution visible, NO pdfjs mount; absent/pdf/text unchanged.

## §4 Scope — explicitly OUT

- Candidate extraction/promotion (`ProtocolExtractionService.createDraftFromVendorPdf`,
  vendorProtocolCandidate schemas, promotion paths) — UNCHANGED is the acceptance proof.
- Stage C handwriting/vision (ChatMessage content-parts, `ImageReadAdapter`, vision config,
  C1-C6 of the plan) — deferred by Brad's 2026-10-12 ruling; do not touch `server/src/ai/`.
- Schema edits to vendor-pdf/file-ref/common (zero-diff expected, §2); `VPDF-` prefix, tab id,
  routes, data-testids (A kept them; keep).
- Anything under `server/src/sequences/` (oligo path is DONE — borrow its discipline, not its
  code path); `config/sequence-analysis/*`.
- Retention/cleanup of page images (OQ2 — record-only follow-up), maxBytes unification (plan
  risk section — separate item), new npm dependencies, binaries in commits, installing tools
  (ops), `__goldens__`, pnpm install, the review-pane 'text' branch beyond wiring OCR pages into
  the existing per-page text display.
- NEVER touch :3001/:5174, :3093/:5193. Lane-stack :3092/:5192 restart is orchestrator-owned.

## §5 Acceptance criteria (VERBATIM from the task list)

> A real photographed page yields extracted text + served page images in the review pane;
> browser receipt; missing-OCR-tool = honest diagnostic test. VERDICT: accept.

Description binding bullets: B1 image adapter using the SAME config-declared OCR tools
(tesseract/pdftoppm precedent from the oligo path); B2 rasterize scanned PDFs and KEEP the page
images; B3 serve the page images + show them in the review pane; B4 acceptance on a real scan.
Why-block: page images become data-referenced artifacts, never in git.

## §6 First targeted checks (run FIRST, quote verbatim in the report)

```bash
# B0 — the gap, on-disk at dispatch HEAD (post-A):
node -e 'const fs=require("fs");console.log(fs.existsSync("server/src/extract/ImageTextAdapter.ts")?"image adapter exists (unexpected)":"ImageTextAdapter NOT present (expected RED)")'
grep -n "page/:pageNumber" server/src/api/routes.ts || echo "page route NOT present (expected RED)"
# expect: both NOT-present lines.
# B0b — the toolchain EARLY-PROOF (this host HAS the tools — composer verified): build a real
# photographed-page stand-in and prove pdftoppm+tesseract produce text, EXACTLY the commands the
# adapter will run, before writing any code:
cd /tmp && magick -size 1400x1800 xc:white -pointsize 48 -annotate +100+200 'LYSIS BUFFER ADD 500 uL' scan.pdf
pdftoppm -r 200 -png -f 1 -l 1 scan.pdf page && tesseract page-1.png stdout
# expect: OCR output containing LYSIS (words may lack spacing). If THIS fails, stop: the host
# story is broken and B4 cannot be met honestly.
cd server && npx tsc --noEmit | grep -c "error TS"   # your re-measured baseline (composer saw 0)
cd ../app && npx tsc --noEmit | grep -c "error TS"   # composer saw 23
```

## §7 Verification gates (at dispatch HEAD, against YOUR re-measured §1 baselines)

```bash
cd server && npx vitest run src/extract/ImageTextAdapter.test.ts        # 3 passed: NOT_CONFIGURED / TOOL_MISSING / injected-success argv pin
cd server && npx vitest run src/extract/                                # all green (A's arms + image arm)
cd server && npx vitest run src/vendor-documents/                       # all green; scan arm: mediaKind image, images[] written under vendorPdfPageDir, rasterizer NOT called for text-layer PDFs (spy pin)
cd server && npx vitest run src/schema/VendorPdfSourceSchema.test.ts    # unchanged suite still green (zero schema diff expected)
cd server && npx vitest run src/api/handlers/VendorSearchHandlers.test.ts src/api/handlers/VendorSearchHandlers.phase9.test.ts   # green + new image-upload arms
cd server && npx vitest run src/api/handlers/VendorPdfBlobHandlers.test.ts  # green incl. NEW: page route 200 image/png; pageNumber '../..' (URL-encoded or not) -> 404; non-image record -> 404; missing page -> 404
cd server && npx vitest run src/sequences                               # byte-identical: 10 files, 72 passed | 2 skipped (composer-measured; re-anchor post-A) — ZERO diff under server/src/sequences/
cd server && npx tsc --noEmit | grep -c "error TS"                      # exactly your baseline (0 at 0a4dc3f8) — exactOptionalPropertyTypes live
cd app && npx vitest run src/ingestion/VendorPdfReviewPage.sourcePreview.test.tsx src/event-editor/right-pane/search/VendorPdfSearchSection.test.tsx src/ingestion/IngestionPage.test.tsx   # all green
cd app && npx tsc --noEmit | grep -c "error TS"                         # exactly your baseline (23 at 0a4dc3f8)
cd app && npx vitest run 2>&1 | grep -E "^ *FAIL" | sed -E 's/^ *FAIL +//; s/ *> .*//; s/ \[.*//' | sort -u | wc -l
   # baseline 61 at 0a4dc3f8 post-ISEQ-2 (handoff 20261013T1540); gate: baseline + 0..1 (only if a
   # BRAND-NEW spec file is added beyond extending existing ones) and no OTHER file flips. Report
   # the actual numbers. The treeSelect 2 failures are IN that baseline (composer-measured).
# real-OCR integration (tesseract PRESENT — composer-verified; no skips allowed on this host):
cd server && npx vitest run src/vendor-documents --testNamePattern="scan"   # the scan-arm tests may invoke the REAL tools against a tmpdir fixture PDF (no binary committed) if the unit needs true end-to-end OCR text; keep runtime < 30s
```

LIVE PROBES after merge + orchestrator stack restart (NEVER :3001/:5174; YAML/config changes need
the orchestrator's `cl-lane-stack.sh 1 restart` first — tsx --watch does NOT reload YAML):
```bash
# photographed page (make the stand-in exactly like §6 B0b):
magick -size 1400x1800 xc:white -pointsize 48 -annotate +100+200 'ADD 500 uL LYSIS BUFFER' page.png
curl -s -X POST http://localhost:3092/api/vendors/graph-lemur/pdfs/upload -H 'content-type: application/json' \
  -d "{\"fileName\":\"photographed-page.png\",\"contentBase64\":\"$(base64 -w0 page.png)\",\"title\":\"Composer scan probe\"}"
# expect 200, recordId VPDF-...; GET /api/records/<id>: source.engine upload, source.mediaKind image,
# source.originalFileName photographed-page.png, extractedText[{pageNumber:1, text ~ LYSIS}]
# page endpoint:
curl -sI http://localhost:3092/api/vendor-pdfs/<id>/page/1     # 200, content-type image/png
curl -s  http://localhost:3092/api/vendor-pdfs/<id>/page/../../etc/passwd   # 404 (URL-encode too: %2e%2e%2f — 404)
curl -s  http://localhost:3092/api/vendor-pdfs/<id>/page/99     # 404 honest no-page
# extraction still works (acceptance: "extraction still producing candidates"):
curl -s -X POST http://localhost:3092/api/extraction/vendor-pdfs/<id>/draft -H 'content-type: application/json' -d '{}'
# expect 201; candidateCount may be 0 for a one-line fixture — the DRAFT must not error on an image-kind record.
# scanned PDF arm: upload scan.pdf (the §6 B0b file): mediaKind image, pageCount >=1,
# page images EXIST under the workspace artifacts/foundry/pdfs/... page dir, and
git -c core.fileMode=false status --porcelain | grep -c "page-" || echo "no page images in git (expected)"
```

## §B2-B3 Design pins (the two shapes the reviewer will hold you to)

- **Page storage convention (single source of truth)**: `vendorPdfPageDir(workspaceRoot, sha12) =
  join(vendorPdfArtifactRoot(workspaceRoot), 'pages', sha12.slice(0,12))` exported from
  `pdfAcquisition.ts`; files `page-001.png`… (1-based, zero-padded). Writer (acquisition) and
  reader (page route) BOTH import this helper — the route reconstructs the dir from the record's
  own `file.stored_path`-derived sha, `resolve`s `join(pageDir, 'page-NNN.png')`, then asserts
  `relative(pageDir, resolved)` has no `..` AND `relative(workspaceRoot, …)` escapes nothing —
  same shape as VendorPdfBlobHandlers.ts:78-86. `pageNumber` param must match `/^\d+$/` BEFORE
  path building (non-numeric → 404 with honest message, matching the plan's "`../..` attempt
  returns 404"). Media type `image/png`. Only serve when `source.mediaKind === 'image'` (else 404).
- **OCR caution in the review pane**: diagnostics are NOT persisted on the record (schema has no
  diagnostics field — adding one is a schema edit = out of scope). The caution is DERIVED:
  `mediaKind === 'image'` ⟹ render banner text mirroring the `LOCAL_OCR_REVIEW` wording reworded
  for protocols ("Transcribed using local OCR (up to the configured page limit). Check page
  coverage and every volume against the page image before importing."). An image-kind record by
  construction went through the OCR arm — the derivation is honest. Pin the wording in the spec
  test.

## §8 RED-first commit sequence (exact add-paths; NEVER `git add -A`; every git command
`git -c core.fileMode=false ...`)

- **C1 RED** — `git add server/src/extract/ImageTextAdapter.test.ts` →
  `test(extract): RED — image OCR adapter diagnostics (no config / missing binary never fake an empty page)`.
  Arms: `IMAGE_OCR_NOT_CONFIGURED`, `IMAGE_OCR_TOOL_MISSING` (injected exec throwing ENOENT),
  injected-success argv pin (tesseract argv from config: language, per-page timeout, maxBuffer).
  tmpdir configPath seam — NEVER cwd-relative (bait 9).
- **C2 GREEN** — `git add config/ingestion/document-extraction.yaml server/src/extract/ImageTextAdapter.ts` →
  `feat(extract): image OCR adapter via config-declared tesseract (honest IMAGE_OCR_* diagnostics; LOCAL_OCR_REVIEW warning on success)`.
  Reuses A's config loader; `images:` block per §2 (OQ1 defaults).
- **C3 RED** — `git add server/src/extract/decodeAttachment.formats.test.ts` (extend) →
  `test(extract): RED — dispatcher image arm delegates to the OCR adapter; pdf/html/xlsx/docx arms pinned byte-identical`.
- **C4 GREEN** — `git add server/src/extract/decodeAttachment.ts` →
  `feat(extract): the ONE dispatcher gains the image arm (still the single entry point for every ingest caller)`.
- **C5 RED** — `git add server/src/vendor-documents/pdfAcquisition.test.ts` (extend) →
  `test(vendor-documents): RED — empty-text-layer PDF rasterizes+OCRs to mediaKind image with kept page images; text-layer PDF never touches the rasterizer (spy); maxPages coverage warning`.
  Fixture: build the image PDF IN the test via the config-declared tools (tesseract present) or a
  committed TEXT-based recipe — no binary in git (bait 14).
- **C6 GREEN** — `git add server/src/vendor-documents/pdfAcquisition.ts` →
  `feat(vendor-documents): scanned pages rasterize to kept page-NNN.png artifacts and OCR text (per-record page dir; direct image uploads OCR the bytes)`.
  Fills the `images?` reserved slot; `vendorPdfPageDir` exported.
- **C7 RED** — `git add server/src/api/handlers/VendorSearchHandlers.phase9.test.ts` (extend) →
  `test(ingest): RED — photographed .png upload records mediaKind image with OCR extractedText; scanned PDF stamps image + pageCount; non-image gate unchanged`.
  Gate driven by `images.formats` in config (bait 10 mutation probe: remove webp → webp refused).
- **C8 GREEN** — `git add server/src/api/handlers/VendorSearchHandlers.ts` →
  `feat(ingest): upload accepts page images (honest media_type, upload provenance, OCR pages as extractedText)`.
- **C9 RED** — `git add server/src/api/handlers/VendorPdfBlobHandlers.test.ts` (extend) →
  `test(api): RED — page-image route serves the record's own PNGs; ../.. and non-numeric page numbers 404; non-image record 404; missing page 404`.
  Explicit `../..` test is plan-B3-mandated — name it in the test title.
- **C10 GREEN** — `git add server/src/api/handlers/VendorPdfBlobHandlers.ts server/src/api/routes.ts server/src/server.ts` →
  `feat(api): GET /vendor-pdfs/:recordId/page/:pageNumber serves kept page images (resolve+prefix guard, per-record page dir only)`.
- **C11 RED** — `git add app/src/event-editor/right-pane/search/VendorPdfSearchSection.test.tsx app/src/ingestion/VendorPdfReviewPage.sourcePreview.test.tsx` (extend both) →
  `test(ingest-ui): RED — picker accepts page images; image-kind records render <img> per page with the OCR caution and never mount pdfjs; pdf/text/absent branches pinned`.
- **C12 GREEN** — `git add app/src/shared/api/client.ts app/src/event-editor/right-pane/search/VendorPdfSearchSection.tsx app/src/ingestion/VendorPdfReviewPage.tsx` →
  `feat(ingest-ui): scanned pages show their real page images with an OCR caution in the SAID pane`.

## §9 Worker contract

- Worktree `/mnt/vast/home/brad/git/wt/DOCINGEST-B-lane1-l1t<ts>`, branch
  `wt/DOCINGEST-B-lane1-l1t<ts>` off lane trunk `cl/integration-1` — base MUST contain the
  DOCINGEST-A merge (§0.1 gate, verify first action).
- Lane-sync convention (proven OLIGO/ISEQ/DOCINGEST-A): root `node_modules` symlink →
  `cl-integration-1/node_modules`, `server/schema` symlink, `schema/*` lane-exclude REAL COPIES;
  no `pnpm install`.
- Report (unique): `/home/brad/.hermes/cl/lanes/1/docingest-b-report-l1t<ts>.md`, ending marker
  `DOCINGEST-B CODER DONE <sha>`. Commits per §8 only. Never edit the task list or trunk; no
  blanket pkill; never restart the lane stack; :3001/:5174/:3093/:5193 never touched.
- B4 receipts: `/home/brad/.hermes/cl/receipts/DOCINGEST-B/<ts>/` — real photographed-page story
  per §7 live probes + browser states below. tesseract is PRESENT (composer-verified 5.5.3):
  faking or skipping the real-OCR evidence on this host is a fabrication (bait 13).
- Stop-boundary: anything not expressible in §3/§4 (schema redesign, Stage C surface, retention
  machinery) → STOP, requires-rescope to the architect with evidence.

## §10 Reviewer bait (mutation probes — the coder pre-empts ALL of them)

1. **Empty-success-on-missing-tool**: rename tesseract (PATH-stripped exec) → record must carry
   the `IMAGE_OCR_TOOL_MISSING` error diagnostic and NOT present a blank OCR'd page as success.
   Config deleted → `IMAGE_OCR_NOT_CONFIGURED`. The oligo precedent (:85) makes failures
   diagnostics, never fakes.
2. **Path escape on the page route**: `pageNumber=../..`, `%2e%2e%2f`, `..%2f..`, absolute paths,
   huge numbers, non-numeric → all 404 BEFORE filesystem contact (regex first), and the
   resolve+prefix check catches a crafted-but-numeric edge. The unit test asserting `../..`→404 is
   plan-B3-MANDATED — its absence is a reject even if the code is safe.
3. **Rasterized pages leaked to git**: page images live ONLY under the workspace artifact root
   (`.gitignore:28` `artifacts/` covers it); probe = live-probe §7 git-status line + `git log
   --stat` on every commit (no `.png`, no PDF fixture binary anywhere in history of the branch).
4. **mediaKind synonym drift**: the ONLY vocabulary is Stage A's enum `pdf|text|spreadsheet|image`
   (per DOCINGEST-A spec, pending merge). No 'scan', 'ocr', 'image-ocr', 'photo' — in schema, TS,
   UI, or config. Grep your diff.
5. **Stage-A byte-identical arms regression**: the text-layer PDF must never invoke the rasterizer
   (spy pin in C5); decodeAttachment pdf/html/xlsx/docx arms byte-identical; review-pane pdf and
   text branches + legacy absent-mediaKind default untouched; `server/src/sequences/` zero diff.
6. **Second dispatcher**: the image arm lives in `decodeAttachmentText` (plan cross-cutting rule);
   any new if/else format chain in pdfAcquisition/handler = reject.
7. **exactOptionalPropertyTypes (server/tsconfig.json:13)**: `mediaKind?`/`images?` fills and
   handler payload spreads use conditional spread `...(x ? {k: v} : {})`; `{ x: undefined }` = tsc
   failure + envelope liar. server tsc stays at baseline 0.
8. **YAML-reload trap**: config/schema changes do not hot-reload; live probes before the
   orchestrator's restart read stale data — report, never fake.
9. **cwd trap (carried lane finding)**: the `images:` block loads through A's `import.meta.url`
   loader; a cwd-relative default never resolves from `server/` vitest. Mutation: delete the file
   from cwd → tests still pass; break the loader path → honest `IMAGE_OCR_NOT_CONFIGURED`, never
   a silent skip. Do not build a SECOND config reader.
10. **Hardcode boundary (CLAUDE.md:160-162)**: extensions (`images.formats`), dpi, maxPages,
    timeout, executable, language are CONFIG. No `.jpg` literal in TS, no `'application/pdf'`
    re-stamped on image uploads, no magic dpi in argv. The page-dir naming is the ONE structural
    convention and it exists exactly once, exported, mirroring `vendorPdfArtifactRoot` (:71).
    Mutation probe: remove `webp` from config → webp upload refused with UNSUPPORTED_DOCUMENT.
11. **maxPages silent truncation**: rasterizer capped at maxPages (oligo argv `-l` :80) — when the
    cap is hit (page count === maxPages) an OCR page-coverage warning MUST appear; a 41-page scan
    reporting 40 pages with no caveat is a lie.
12. **Caution-visibility fake**: the pane caution must be wired to the record's actual mediaKind
    (unit-pinned), not a static string always on the image branch — the branch makes it
    conditional already; the test pins wording AND absence on pdf/text branches.
13. **Host honesty**: tesseract 5.5.3 + pdftoppm 26.08.0 PRESENT (composer-verified) — "tool
    missing, could not verify" on this host is false. B4 requires REAL OCR output in the receipt.
14. **Binary/fixture smuggling**: no PNG/PDF committed; unit success arms via injected exec argv
    pins; the scan-arm integration test builds its fixture at runtime with config-declared tools
    in tmpdir (B0b recipe). ImageMagick exists on the host for §6/§7 receipts only.
15. **Envelope honesty**: every upload test goes through `createEnvelope` + real Ajv (source
    `additionalProperties: false`, top-level `unevaluatedProperties: false`) — no hand-built
    payloads bypassing the schema gate; do NOT stuff diagnostics into `source` (undeclared =
    invalid).
16. **Schema-diff smell**: Stage B's expected schema diff is EMPTY. A vendor-pdf.schema.yaml edit
    means the design drifted from §B2 (e.g. someone decided to store page paths in the record) —
    the §B2 convention (derived page dir via `vendorPdfPageDir`, zero schema diff) is the resolved
    default: STOP and return requires-rescope to the architect rather than editing schema.
17. **Legacy-record blankout (carried EDITOR-era rule)**: mediaKind absent → today's pdf path;
    pdf-kind → canvases; a legacy VPDF record going blank on the C11/C12 diff = instant reject.
    `VendorPdfReviewPage.treeSelect.test.tsx`'s 2 failures are PRE-EXISTING at 0a4dc3f8 (composer
    reproduced) — not yours, leave them.
18. **Accept-list drift**: the app accept list must mirror the config `images.formats`
    extensions added to A's widened list exactly; a UI accepting an extension the handler then
    415s on (or vice versa) is split-brain — pin both in tests.

## §11 Open questions (defaults recommended; Brad-level policy NOT decided here)

- **OQ1 — dpi / maxPages / timeout for protocol scans.** Oligo precedent:
  `oligo-order.yaml:58-65` dpi 200, maxPages 20, timeout 120. The plan's images block says dpi
  200, maxPages 40, timeout 120. DEFAULT (recommended): the plan's values (protocol kits run
  longer than oligo sheets); the values are config data so this stays reversible. Alternative:
  copy oligo's 20 — rejected (kit manuals exceed it).
- **OQ2 — Retention/cleanup of page images.** Nothing today deletes anything under
  `artifacts/foundry/` (pdf blobs included — same state). DEFAULT: no cleanup in Stage B; record
  a lane follow-up "artifact retention sweep" so nobody assumes space is reclaimed. Alternative
  (per-record cleanup on record delete): needs a delete-cascade that does not exist — out of size
  budget for this item.
- **OQ3 — Does a photographed `.jpg` ride the Stage A upload route or the scan-PDF branch?**
  DEFAULT: the SAME `POST /vendors/graph-lemur/pdfs/upload` route (verified: it is the only
  content-upload route, routes.ts:507; the client picker already posts base64 through it), with
  the image formats added to A's config-driven gate — one route, one dispatcher, one schema.
  Alternative (separate image route): rejected — second surface, no benefit.

## §12 Browser gate (states on :5192 ONLY; receipts /home/brad/.hermes/cl/receipts/DOCINGEST-B/<ts>/)

Against a stack confirmed serving the merged revision (orchestrator restarts first — YAML).
Every negative claim re-verified by reload/API-readback before reporting.
- **S1** Upload a real photographed page (phone photo preferred; §6 B0b stand-in acceptable ONLY
  as a machine-made surrogate, label it as such in the receipt) → review pane shows the PAGE
  IMAGE (real `<img>`, not a pdfjs canvas — DevTools crop proving no canvas in the pane), the
  OCR caution text visible, extracted text present per page.
- **S2** API-readback crop: `source.engine: upload`, `source.mediaKind: image`,
  `source.originalFileName` — and the page URL loads standalone (curl crop or network-tab 200
  image/png).
- **S3** Scanned-PDF control: upload a §6-B0b-recipe scan.pdf → same image branch; then a real
  text PDF record still opens with pdfjs canvases exactly as before (zero-NEW pin, full-page crop).
- **S4** Extraction on the image-kind record completes without error (candidates or an honest
  empty-candidates state — no crash, no fake).
Automatic rejects: blank pane on any state, pdfjs canvases gone on S3, page image rendered from
git (bait 3), caution missing on S1, any non-image record's pane changed.
