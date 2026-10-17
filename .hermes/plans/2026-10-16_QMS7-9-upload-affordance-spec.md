# SPEC (promoted) — QMS7-9: First-class upload affordance on /ingestion/vendor-pdf

Lane 1. Promoted by orchestrator 2026-10-16T03:15 after first-hand anchor verification at
trunk 7a9a55af (no scout needed — every anchor below was opened and cited by the
orchestrator directly). Item block: /home/brad/.hermes/cl/lanes/1/task-list.md id QMS7-9.
Brad's demand (2026-10-15): "the new multi-file type ingestion surface lacks an upload
button. Or some kind of surface." Hint-without-control is dead chrome by SOP rule 12.

## Ground truth (orchestrator-verified at 7a9a55af, 2026-10-16 ~03:05 EDT)

- UI surface: `app/src/event-editor/right-pane/search/VendorPdfSearchSection.tsx` — shared
  by the AI-tab "+ Add source" context AND standalone Ingestion workflow
  (`app/src/ingestion/VendorPdfWorkflowTab.tsx:19` imports it, :75 renders it).
  Props (:22-49): optional `studyId`, required `onIngested(artifactId, info)`, optional
  `onBuildProtocol`. The STANDALONE form (no `onBuildProtocol`) currently offers ONLY
  Exa URL search plus the buried vendor-blocked "Step 2 — Bring the file back" fallback
  (:67, :293-309).
- Client method EXISTS: `app/src/shared/api/client.ts:2716 uploadGraphLemurVendorPdf` —
  POST `/vendors/graph-lemur/pdfs/upload`, body `{url?, title?, vendor?, studyId?, query?,
  fileName?, contentBase64}`. Upload = fileName + contentBase64, NO url.
- File->base64 reader already in the section file: `readFileAsBase64` at
  VendorPdfSearchSection.tsx:355 (used by bring-back at :156).
- Extension accept-list precedent: inline `accept=".pdf,.docx,.doc,.rtf,.md,.markdown,.txt,
  .html,.htm,.xlsx,.xls,.csv,.png,.jpg,.jpeg,.tif,.tiff,.webp,application/pdf"` at :310.
  Config source of truth: `config/ingestion/document-extraction.yaml` `formats:` (:47+,
  pdf/docx/doc/rtf/md/markdown/txt/html/htm/xlsx/xls/csv + image formats png/jpg/jpeg/
  tif/tiff/webp via :35 + media-image entries). The :310 string is the CURRENT single UI
  source; DO NOT author a second hardcoded list.
- Server: POST /vendors/graph-lemur/pdfs/upload is already generalized (DOCINGEST-A):
  readable-format gate reads document-extraction.yaml `formats:` and refuses unsupported
  types with `UNSUPPORTED_DOCUMENT` 415 BEFORE any write. NO server change in this item.
- Tests: `app/src/event-editor/right-pane/search/VendorPdfSearchSection.test.tsx` exists —
  RED lands there.

## The change (small, UI-only)

1. In VendorPdfSearchSection's STANDALONE rendering (the form area used when
   `onBuildProtocol` is absent — inspect the existing layout and mirror the search
   button's visual weight), add a peer control: an "Upload a document" button that opens a
   file picker. On file selection: `readFileAsBase64` -> `apiClient.uploadGraphLemurVendorPdf({
   fileName: file.name, contentBase64, ...(studyId ? { studyId } : {}), ...(query.trim() ?
   { query } : {})})` -> on success call `onIngested(recordId, {title: file.name,
   sourceUrl: <response source per existing ingest handler pattern>, vendor: <same>})` so
   the Recent list refreshes and the record opens in review like any other. Surface the
   server's honest error text (incl. UNSUPPORTED_DOCUMENT 415) inline like searchError
   today; no record is written server-side on refusal.
2. The file input's `accept` MUST reuse the existing extension set: hoist the :310 accept
   string into ONE module-level const (e.g. `const DOCUMENT_ACCEPT`) and use it for BOTH
   inputs. No second literal.
3. Keep an ingesting/in-progress disabled state mirroring `ingestingUrl` usage. Keep the
   vendor-blocked bring-back flow byte-identical in behavior.
4. Do NOT change the right-pane ("+ Add source") rendering except insofar the accept-const
   hoist touches it (behavior byte-identical).

## File ownership

IN: app/src/event-editor/right-pane/search/VendorPdfSearchSection.tsx,
    app/src/event-editor/right-pane/search/VendorPdfSearchSection.test.tsx,
    app/src/ingestion/VendorPdfWorkflowTab.tsx (ONLY if a prop wiring is genuinely needed —
    prefer none), its .test.tsx if you add a mount-level assertion.
HARD OUT: server/**, schema/**, config/**, client.ts, App.tsx, RecordRegistryPage.tsx,
  shared/shell/** (QMS7-1 is CONCURRENTLY editing those — zero overlap is the point),
  DocumentControlBar, CsvImportModal. NEVER touch :3001/:5174. NEVER restart :3092/:5192.

## RED-first plan

RED in VendorPdfSearchSection.test.tsx at base (capture failing output BEFORE implementing,
name the inversion in the commit message):
- T1 standalone render shows NO "Upload a document" control (assert absent at base,
  present at tip).
- T2 selecting a supported file calls uploadGraphLemurVendorPdf with fileName +
  contentBase64 and no url (mock apiClient), then fires onIngested with the returned
  recordId.
- T3 server refusal (mock rejection with UNSUPPORTED_DOCUMENT message) surfaces the error
  text and does NOT call onIngested.
- T4 the two file inputs share one accept constant (assert equality of the accept attribute
  against the module const).

## VERIFICATION BARS

1. First targeted check: `cd <wt>/app && npx vitest run src/event-editor/right-pane/search/VendorPdfSearchSection.test.tsx` — RED first, then green.
2. `npx tsc --noEmit` in app: count == 23 AND the error-line multiset pin
   sha256 723a7fb86ab0ec242d9185ef683abb4f8d9130740b45f9e7e0a1dbc9cbeaeecb (recompute: sort
   the 'error TS' lines, sha256sum the multiset; drift OUTSIDE the six exhaustive-site files
   of QMS7-1 = stop; your files must add ZERO new errors).
3. `npx vitest run src/event-editor/right-pane/search src/ingestion` fully green.
4. Scope guard: diff file list == IN-ownership files only.
5. Report to YOUR unique path; commit on your branch (RED commit + impl commit).

## ORCHESTRATOR RULINGS

- OQ1 (sourceUrl/vendor on onIngested): follow the existing ingest-success shape at
  :125/:168 — reuse the same info fields the bring-back path supplies; if the upload
  response lacks a URL, pass `sourceUrl: ''`-style value consistent with what
  VendorPdfWorkflowTab does with it today (read the caller; do not break Recent rendering).
- OQ2 (where the button lives): STANDALONE form only (onBuildProtocol-absent branch). The
  AI-tab +Add-source context keeps search-only — out of scope.
- OQ3 (recent-list refresh + review open): already driven by onIngested in
  VendorPdfWorkflowTab — verify, do not re-implement.

## Browser gate (post-merge, orchestrator-owned — worker does NOT browse)

cl-browser-reviewer on http://localhost:5192/ingestion/vendor-pdf with the task-list
verified-by criteria verbatim (upload .md creates a VPDF record visible in Recent + review;
unsupported type honest refusal, no record; search flow unchanged; bring-back unchanged).
Receipts: /home/brad/.hermes/cl/receipts/QMS7-9/<ts>/.

## Fleet/coder mechanics

Queue behind the fleet lock (queue-qms7-9.sh). Worktree built off CURRENT trunk at lock
time by the script; base may be >= 7a9a55af. If base already contains QMS7-1's merged
App.tsx changes, that is fine — you touch none of them.

END-LINE: `QMS7-9 DONE <report-path>`
