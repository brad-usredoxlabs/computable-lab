# Plan: Single vendor-PDF surface — PDF + extracted protocol, fixes, dead links

## Goal
Give every ingested vendor PDF one working screen: the PDF (or its plain-text) in the main pane, the extracted protocol (title, materials/equipment, concise steps) in the right pane, with conditional step overrides, provenance that jumps to the PDF page, and no dead buttons.

## Current context / assumptions (verified by reading the code)
- Ingested vendor PDFs are free-floating `vendor-pdf` records (`schema/lab/vendor-pdf.schema.yaml`). Real records carry:
  - `file` = `{ file_name, media_type: "application/pdf", source_url, size_bytes, sha256, stored_path, page_count }`
  - `stored_path` like `artifacts/foundry/pdfs/ZymoBIOMICS-96-MagBead-DNA-Kit.pdf` (resolves under the repo workspace root)
  - `extractedText` = per-page `{ pageNumber, text }[]` (populated for most records; several have 1-2 pages, some 69)
  - `source.url` = original external URL
- **"View" is broken**: `app/src/ingestion/VendorPdfWorkflowTab.tsx` line 162 navigates to `/lab/vendor-pdfs/${r.recordId}`. `App.tsx` routes `/lab/:category/:entityId` → `LabEntityWorkspace`, which does NOT render a vendor-pdf record or its PDF (it's the generic entity editor). So View does nothing useful.
- **"Extract Protocol" works**: `VendorPdfWorkflowTab.handleExtractProtocol` → `apiClient.createVendorPdfExtractionDraft(recordId)` → navigates to `/extraction/review/:draftId` (`ExtractionReviewPage`). That page gives a concise numbered step list + Promote/Reject, BUT: no page title from the source, no materials/equipment/instruments list, and no way to compare steps against the actual PDF.
- **"Open in Protocol Builder"** routes to `/protocol-builder` with `state.sourceText`/`title`. `ProtocolBuilderPage`'s left `ExtractionPanel` uses `ProtocolCandidatePreview` — which ALREADY shows title, materials, labware, equipment, concise steps, per-step inline overrides, and step provenance (page/section). This is the "best of both" component the user likes.
- **Protocol-builder problems the user flagged**: (a) the right-hand `RightPanel` tabs (Preview/Configure/Draft/Promote) are largely placeholder/broken; (b) `ProtocolCandidatePreview` shows override inputs for volume/temp/duration/concentration on EVERY step regardless of whether the step actually has that quantity (`ProtocolCandidatePreview.tsx` lines ~251-296 always render all four fields); (c) provenance is text-only (`Page N · sec`) and NOT clickable to the PDF.
- **PDF rendering exists**: `app/src/literature/PdfProtocolBuilder.tsx` loads a PDF from a URL with pdfjs (canvas pages + text selection). `app/src/event-editor/viewer/pdf/PdfViewer.tsx` + `ExtractedTextPanel.tsx` render canvas pages + extracted text with search. These prove a working PDF pane is feasible.
- **Blob serving is study-scoped only**: `GET /studies/:studyId/artifacts/:artifactId/blob` (`server/src/api/handlers/ArtifactBlobHandlers.ts`). It resolves `file.stored_path` under the workspace root and streams bytes. There is NO route for free-floating vendor-pdf blobs — this must be added.

## Architecture / proposed approach
Add one route, `GET /vendor-pdfs/:recordId/pdf`, that reads the stored PDF bytes by recordId (path-traversal-safe, mirroring ArtifactBlobHandlers) and streams `application/pdf`. Add one new React route `/ingestion/vendor-pdf/:recordId` hosting a new `VendorPdfReviewPage`: main pane = PDF viewer (falling back to the extractedText plain-text pane when the blob is absent), right pane = `ProtocolCandidatePreview` overloaded to (a) show source title, (b) render overrides conditionally, (c) make provenance "Page N" clickable to jump the PDF panel to that page. Rewire the ingestion tab's three buttons: "Extract Protocol" and "Open in Protocol Builder" both open this single review page (extraction happens there); "View" opens the same page (it becomes the canonical viewer). Do NOT touch the unfinished protocol-builder Draft/Promote/export machinery — YAGNI: the user only wants extraction + comparison, not the draft loop.

## Step-by-step tasks

### Task 1 — Serve a vendor-pdf's stored PDF bytes to the browser

`server/src/api/handlers/VendorPdfBlobHandlers.ts` (new file):

```ts
import { resolve, relative } from 'node:path';
import { createReadStream, existsSync } from 'node:fs';
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { RecordStore } from '../../store/types.js';

interface VendorPdfBlobHandlerOptions {
  recordStore: RecordStore;
  workspaceRoot: string;
}

export function createVendorPdfBlobHandlers(opts: VendorPdfBlobHandlerOptions) {
  const rootAbs = resolve(opts.workspaceRoot);
  return {
    async getVendorPdfBlob(
      req: FastifyRequest<{ Params: { recordId: string } }>,
      reply: FastifyReply,
    ): Promise<void> {
      const { recordId } = req.params;
      if (!/^[A-Za-z0-9_-]+$/.test(recordId)) {
        reply.status(400).send({ error: 'BAD_REQUEST', message: 'malformed recordId' });
        return;
      }
      const envelope = await opts.recordStore.get(recordId);
      const payload = envelope?.payload as Record<string, unknown> | undefined;
      const file = payload?.file as { stored_path?: string; media_type?: string } | undefined;
      const storedPath = file?.stored_path;
      if (!storedPath) {
        reply.status(404).send({ error: 'NOT_FOUND', message: 'record has no stored file' });
        return;
      }
      const abs = resolve(rootAbs, storedPath);
      // Path-traversal guard: must remain inside workspace root.
      const rel = relative(rootAbs, abs);
      if (rel.startsWith('..') || relative(rootAbs, abs).includes('..')) {
        reply.status(400).send({ error: 'BAD_REQUEST', message: 'stored_path escapes workspace' });
        return;
      }
      if (!existsSync(abs)) {
        reply.status(404).send({ error: 'NOT_FOUND', message: 'stored file not found' });
        return;
      }
      reply.type(file?.media_type ?? 'application/pdf');
      reply.send(createReadStream(abs));
    },
  };
}
```

> Note for the implementer: `workspaceRoot` used in the server is the value passed to `new ArtifactBlobStore(ctx.workspaceRoot, ...)` (server.ts line 779), which resolves to the embedded-git worktree holding the records store (e.g. `/home/brad/.computable-lab/worktrees/main`). Confirm this by reusing the same expression, and update/construct `opts.workspaceRoot` identically when wiring the handler in `server/src/server.ts`. Do NOT hardcode the path.

Register the route in `server/src/api/routes.ts` (find where `getStudyInventoryUsage`/tree routes live ~line 349, or alongside the vendor/document routes ~line 480). Add `vendorPdfBlobHandlers?: ReturnType<typeof createVendorPdfBlobHandlers>;` to the options interface (~line 88-152) and:

```ts
fastify.get('/vendor-pdfs/:recordId/pdf', vendorPdfBlobHandlers.getVendorPdfBlob.bind(vendorPdfBlobHandlers));
```

Construct it in `server/src/server.ts` where other handlers are built (~line 1139 area): pass `recordStore: ctx.store` and `workspaceRoot` (use the same value passed to `new ArtifactBlobStore(...)` at line 779: `ctx.workspaceRoot`). Assign `routeOpts.vendorPdfBlobHandlers = ...`.

Verification (TDD-red first): add `server/src/api/handlers/VendorPdfBlobHandlers.test.ts` with a `MockRecordStore` returning a vendor-pdf payload whose `file.stored_path` points at a temp PDF file; assert (a) 200 + correct content-type + streamed bytes for a valid record, (b) 404 for record with no `file`, (c) 400 for a path-traversal `stored_path` like `../../etc/passwd`. Run `npx vitest run src/api/handlers/VendorPdfBlobHandlers.test.ts` — all pass. Then restart the main backend on :3001 and run:
`curl -s -o /tmp/x.pdf -w "%{http_code}" http://100.111.141.22:3001/vendor-pdfs/VPDF-257F57196F6C/pdf` → expect `200` and `/tmp/x.pdf` bytes > 1 MB (Zymo record).

### Task 2 — Client method to fetch the PDF URL

In `app/src/shared/api/client.ts`, add after the existing `getArtifactBlob`-style method (~line 4498):

```ts
vendorPdfBlobUrl(recordId: string): string {
  return `${API_BASE}/vendor-pdfs/${encodeURIComponent(recordId)}/pdf`
},
```

Verify: `npm run typecheck -w app` clean.

### Task 3 — New `VendorPdfReviewPage` (single surface)

`app/src/ingestion/VendorPdfReviewPage.tsx` (new file):

- Props: route param `recordId`.
- Load the record via `apiClient.getRecord(recordId)`.
- State: `record`, `pdfUrl` = `apiClient.vendorPdfBlobUrl(recordId)`, `extractedText` pages from `record.payload.extractedText`, `activePage` (number|null), `extraction` (candidate from `/protocol-builder/extract` or `/extraction/human-steps/:id`), `extracting`, `error`.
- **Main pane** (left), builds on the pdfjs pattern already in `PdfProtocolBuilder.tsx` (copy its pdfjs worker init + `PdfPage`-style canvas rendering, or render `PdfViewer` if the artifact plumbing is workable; simplest correct path is to reuse the pdfjs loading + per-page canvas from `PdfProtocolBuilder`):
  - If `pdfUrl` fetch succeeds → render canvas pages with pdfjs; a page-jump means scrolling to that page.
  - If the blob 404s (no stored file) → render the `extractedText` as a plain-text pane with per-page headers (this is the "plain text extracted viewer" the user remembers).
  - A small "PDF / Plain text" toggle OR auto-fallback to plain text when blob missing.
- **Right pane**: reuse `ProtocolCandidatePreview` (import from `../event-editor/protocol-builder/ProtocolCandidatePreview`). Wire `candidate` from an extraction call. Add an "Extract Protocol" button in this pane that POSTs to `/protocol-builder/extract` with `sourceText` (joined from `extractedText`) — mirroring `ExtractionPanel.tsx` line 102's call. On success `setExtraction(candidate)`.
- **Title**: the right-pane header shows `record.payload.title` (e.g. "ZymoBIOMICS™ 96 MagBead DNA Kit"), not a generic label.

Verification: `npm run typecheck -w app` clean; `npx vitest run` for any existing ingestion/extraction tests still passing.

### Task 4 — Conditional overrides in `ProtocolCandidatePreview`

`app/src/event-editor/protocol-builder/ProtocolCandidatePreview.tsx` lines ~251-296: render a volume input ONLY when `step.volume != null` (or the step text/detected fields contain a volume), a temperature input only when the step has temp, etc. The step type is `AiProtocolCandidateStepSummary` — check `app/src/types/ai.ts` for a `volume?: string | null` / `temperature?: string | null` / `duration?` field; if absent, fall back to a per-field `hasQuantity` heuristic on the step text. Concretely, gate each field:

```tsx
{stepHasQuantity(step.volume) && (
  <label className="protocol-candidate-preview__override-field">
    Volume (µL):
    <input ... value={override?.volume ?? ''} placeholder="use extracted" />
  </label>
)}
```

Where `stepHasQuantity(v)` returns `v != null && String(v).trim() !== ''`. If the step type has no volume field, add `volume?: string | null`, `temperature?: string | null`, `duration?: string | null`, `concentration?: string | null` to `AiProtocolCandidateStepSummary` in `app/src/types/ai.ts` and populate them server-side in the extract/human-steps handler (search where the candidate step summary is built in `server/src/extract/`).

TDD: add a case to any existing `ProtocolCandidatePreview` test (or create `app/src/event-editor/protocol-builder/ProtocolCandidatePreview.test.tsx`) asserting that a step WITHOUT a volume renders no volume input and a step WITH a volume does. Run `npx vitest run app/src/event-editor/protocol-builder/ProtocolCandidatePreview.test.tsx`.

### Task 5 — Clickable provenance → jump PDF to page

In `ProtocolCandidatePreview.tsx` (`app/src/event-editor/protocol-builder/ProtocolCandidatePreview.tsx`, lines ~239-249), make the provenance "Page N" a button. Add an optional prop:

```tsx
onGotoPage?: (pageNumber: number) => void
```

and render:

```tsx
{step.evidence?.[0]?.pageNumber ? (
  <button type="button" className="protocol-candidate-preview__provenance-link"
    onClick={() => onGotoPage?.(step.evidence![0]!.pageNumber!)}>
    Page {step.evidence![0]!.pageNumber}
  </button>
) : null}
```

In `VendorPdfReviewPage`, pass `onGotoPage` to scroll the PDF pane to that page (`setActivePage(n)` + `scrollIntoView` the canvas/scene).

TDD: extend the new `ProtocolCandidatePreview.test.tsx` — a step with evidence page 5 calls `onGotoPage(5)` when the provenance button is clicked; a step with no evidence renders no link.

### Task 6 — Rewire ingestion tab buttons to the single surface

`app/src/ingestion/VendorPdfWorkflowTab.tsx`:
- Replace all three per-item buttons with the review page as the single destination, but keep clear labels:
  - "Extract Protocol": `navigate('/ingestion/vendor-pdf/' + recordId)` (the page auto-extracts).
  - "View": same route (it's the viewer now).
  - "Open in Protocol Builder": DROP it or repoint it to the same review page — the review page IS the builder's extraction front. Simplest per YAGNI: remove the Protocol Builder button and keep two: "Extract Protocol" (primary) and "View" (secondary), both → `/ingestion/vendor-pdf/:id`.
- Optionally keep `handleBuildProtocol` dead code removed (delete it) to avoid the unused/broken path.

Register the route in `app/src/App.tsx` (lazy, near the other ingestion routes ~line 129):

```tsx
const VendorPdfReviewPage = lazy(async () => import('./ingestion/VendorPdfReviewPage').then((m) => ({ default: m.VendorPdfReviewPage })))
// ...
<Route path="/ingestion/vendor-pdf/:recordId" element={<DeferredRoute><VendorPdfReviewPage /></DeferredRoute>} />
```

Verification: `npm run typecheck -w app` clean. Update `app/src/ingestion/VendorPdfWorkflowTab.test.tsx` if it asserts button behavior; run it.

## Tests / validation summary
- New `VendorPdfBlobHandlers.test.ts` (blob 200/404/400). `npx vitest run src/api/handlers/VendorPdfBlobHandlers.test.ts`.
- `npm run typecheck -w server` and `npm run typecheck -w app` both clean.
- Live: `curl -s -o /tmp/x.pdf -w "%{http_code}" http://100.111.141.22:3001/vendor-pdfs/VPDF-257F57196F6C/pdf` → 200; browser can open that URL and render the Zymo 31-page PDF.
- `ProtocolCandidatePreview.test.tsx`: conditional override cases + provenance-click case, red → green.
- `npm run vitest run` on affected suites (ingestion, extraction).

## Risks, tradeoffs, open questions
- **PDF CORS in pdfjs**: rendering the pdfjs canvas from `/api/.../pdf` is same-origin (frontend proxies `/api`), so no CORS issue. But confirm the app is served same-origin with the API (Vite proxy) — the preview pages use relative `/api`; flag if the deployed app hosts the backend separately.
- **Candidate fields for conditional overrides**: whether `AiProtocolCandidateStepSummary` exposes `volume/temperature/duration` determines Task 4's complexity. If not present, either (a) add them + populate server-side in the extractor (more work), or (b) use a text heuristic (cheap, approximate). Default to (b) text-heuristic for speed, note (a) as a follow-up.
- **`Extract Protocol` duplicate engines**: vendor extracts via both `/protocol-builder/extract` (candidate with materials/equipment — the desired one) and `/extraction/human-steps/:id` (concise). Prefer `/protocol-builder/extract` since it returns materials/equipment. Confirm it works against the vendor-pdf sourceText; if it requires a studyId/context the review page must synthesize the `sourceText` from `extractedText` (Task 3 does this).
- **Scope control**: this plan deliberately does NOT fix the protocol-builder Draft/Promote/export right-pane machinery. The user called it "an unfinished mess"; the review surface replaces its frontend role. If the user wants the Draft loop too, that's a separate plan.
- **`onGotoPage` + pdfjs**: pdfjs renders all pages eagerly; jumping requires `scrollIntoView` on the target page element. If pagination is virtualized, the handler must request the page be rendered first. Assume eager render for simplicity.