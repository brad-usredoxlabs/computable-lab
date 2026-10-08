# Protocol Cleanup — one plan for the whole vendor-PDF → run protocol loop

## Goal
Make the full protocol loop work end-to-end with no dead ends: ingest a vendor PDF → open it in a single screen (PDF for comparison + extracted protocol), extract and promote a protocol that carries a **meaningful title**, then **find and attach** it (and any localized lab protocol) directly from the run's Protocol pane.

This consolidates three earlier plans — `2026-09-06_143000-vendor-pdf-unified-surface.md`, `2026-09-06_144500-promoted-protocol-titles.md`, `2026-09-06_145500-protocol-pane-search.md` — into one sequenced whole. Nothing is dropped; overlapping fixes are merged once.

## Current context / assumptions (verified by reading the code; see the three source plans for full detail)
- Ingested vendor PDFs are free-floating `vendor-pdf` records with `title`, `file.stored_path`, `source.url`, and per-page `extractedText[]`. They live in the embedded-git records store; the PDF bytes resolve under the workspace root (e.g. `/home/brad/.computable-lab/worktrees/main`).
- `ProtocolCandidatePreview` (`app/src/event-editor/protocol-builder/ProtocolCandidatePreview.tsx`) already renders everything a biologist wants: title, materials, labware, equipment, concise steps, inline overrides, provenance. Its two bugs: overrides render for **every** step (should be conditional) and provenance is text-only (should be clickable to the PDF).
- There is **no blob route for free-floating vendor-pdfs** (only study-scoped `/studies/:studyId/artifacts/:artifactId/blob`). So a PDF pane can't render the stored file.
- "View" on the ingestion tab (`VendorPdfWorkflowTab.tsx` line 162 → `/lab/vendor-pdfs/:id`) is a dead link (`LabEntityWorkspace` doesn't render a vendor PDF). "Extract Protocol" works (→ `ExtractionReviewPage`). "Open in Protocol Builder" routes to a partially-broken `ProtocolBuilderPage`.
- Promoted protocols are minted by `server/src/extract/CandidatePromoter.ts` as `record = { ...candidate.draft, kind, recordId }`, so `record.title` = the extractor's draft title — frequently "Quick Reference", "June 2023", "Untitled". The source vendor-pdf has a good title that is never used. (Live data confirms `CAN-protocol-*__quick-reference.yaml` etc.)
- The run Protocol tab (`ProtocolTabPanel` → `ProtocolSelector`) sources from `getProtocolContext` (`server/src/protocol/ProtocolContextService.ts`) and has **no search**.
- `SearchTabPanel` exists but only searches study-scoped artifacts, not free-floating vendor-pdfs or protocols.

## Architecture / Proposed approach — sequenced phases
The whole is greater than the parts: each phase feeds the next, and the shared components (`ProtocolCandidatePreview`, the review surface, `getProtocolContext`) are fixed once and reused everywhere.

- **Phase 1 (backbone, all server):** serve vendor-pdf bytes over HTTP (blob route) *and* make every promoted protocol carry the source PDF's meaningful title (promotion fix + backfill). This is the data foundation both the review surface and the run pane depend on.
- **Phase 2 (unified review surface):** one screen per ingested PDF — PDF (or plain-text fallback) on the left, extracted protocol on the right — reusing the fixed `ProtocolCandidatePreview`. This replaces the separate "View / Extract Protocol / Open in Protocol Builder" buttons (dead links removed) and gives the biologist the compare-to-PDF experience.
- **Phase 3 (run Protocol pane):** add search + good titles to the run's Protocol tab so the user can find and attach ingested PDFs, candidate protocols, and localized lab protocols in place.
- **Phase 4 (cleanup):** remove dead routes/buttons and the broken protocol-builder right-pane placeholder, leaving one coherent surface per stage of the loop.

Dependencies: P1 blob route → P2 PDF pane. P1 title fix + backfill → P3 display quality. P2 review surface → P3 vendor-pdf rows' "Open" target. Do phases in order; each phase is independently shippable and testable.

---

## Phase 1 — Backbone (server): blob serving + meaningful promotion titles

### T1. Serve a vendor-pdf's stored bytes
New `server/src/api/handlers/VendorPdfBlobHandlers.ts` — path-traversal-safe, mirrors `ArtifactBlobHandlers`:

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
      if (!file?.stored_path) {
        reply.status(404).send({ error: 'NOT_FOUND', message: 'record has no stored file' });
        return;
      }
      const abs = resolve(rootAbs, file.stored_path);
      const rel = relative(rootAbs, abs);
      if (rel.startsWith('..')) {
        reply.status(400).send({ error: 'BAD_REQUEST', message: 'stored_path escapes workspace' });
        return;
      }
      if (!existsSync(abs)) {
        reply.status(404).send({ error: 'NOT_FOUND', message: 'stored file not found' });
        return;
      }
      reply.type(file.media_type ?? 'application/pdf');
      reply.send(createReadStream(abs));
    },
  };
}
```

Register `GET /vendor-pdfs/:recordId/pdf` in `server/src/api/routes.ts` (add `vendorPdfBlobHandlers?` to the options interface ~lines 88-152). Construct in `server/src/server.ts` near the other handlers (~line 1139) passing `recordStore: ctx.store` and `workspaceRoot` = the **same value already passed to `new ArtifactBlobStore(ctx.workspaceRoot, ...)`** (line 779) — do not hardcode the path.

TDD (red → green): new `server/src/api/handlers/VendorPdfBlobHandlers.test.ts` with a mock store returning a vendor-pdf whose stored_path points at a temp file; assert 200 + content-type + bytes for valid, 404 for no-`file`, 400 for `../../etc/passwd` traversal. Then live:
`curl -s -o /tmp/x.pdf -w "%{http_code}" http://100.111.141.22:3001/vendor-pdfs/VPDF-257F57196F6C/pdf` → 200, >1MB.

### T2. Client PDF URL helper
In `app/src/shared/api/client.ts` (near the existing blob helper ~line 4498):
```ts
vendorPdfBlobUrl(recordId: string): string {
  return `${API_BASE}/vendor-pdfs/${encodeURIComponent(recordId)}/pdf`
},
```

### T3. Promote with the source PDF title (future promotions)
Add `sourceTitle?: string` to `server/src/extract/CandidatePromoter.ts` `PromoteCandidateArgs`. After minting `record` (lines 137-141) and before `computeContentHash`, override generically:

```ts
const sourceTitle = args.sourceTitle?.trim();
const DRAFT_GENERIC = /^(quick reference|untitled|unsigned|protocol steps not detected|june \d{4})$/i;
let canonicalRecord: CanonicalRecord = record;
if (sourceTitle) {
  const draftTitle = typeof record.title === 'string' ? record.title.trim() : '';
  if (!draftTitle || DRAFT_GENERIC.test(draftTitle)) {
    canonicalRecord = { ...record, title: sourceTitle };
  }
}
```
Use `canonicalRecord` in `computeContentHash` and as `outcome.record`. Conservative: a specific draft title is never replaced.

TDD (red → green): new case in `server/src/extract/CandidatePromoter.test.ts` (the existing test uses a literal `promoteCandidate({...})` at lines 51-60) — assert a draft titled "Quick Reference" with `sourceTitle: 'Molecular Probes CellROX...'` yields `outcome.record.title === 'Molecular Probes CellROX...'`. Run `npx vitest run server/src/extract/CandidatePromoter.test.ts`.

### T4. Thread the title from the vendor-pdf into promotion
`server/src/api/handlers/ExtractHandlers.ts` calls `promoteCandidateLogic(promoteArgs)` (line 220), `sourceArtifactRef: draft.source_artifact` (line 207), `store` available (line 56). Before `promoteArgs`, resolve the source title:

```ts
let sourceTitle: string | undefined;
if (draft.source_artifact?.kind === 'record' && draft.source_artifact?.id) {
  const srcEnv = await store.get(draft.source_artifact.id).catch(() => null);
  const srcPayload = (srcEnv?.payload ?? null) as Record<string, unknown> | null);
  if (srcPayload && typeof srcPayload.title === 'string' && srcPayload.title.trim()) {
    sourceTitle = srcPayload.title.trim();
  }
}
```
Add `sourceTitle` to `promoteArgs`. Extend `server/src/api/handlers/ExtractHandlers.test.ts`: draft with `source_artifact:{kind:'record',id:'VPDF-X'}` store returns vendor-pdf `payload.title`, assert promoted record title equals it. Run the file.

Commit (T3+T4 together): `fix(extract): promote vendor protocols with the source PDF title`.

### T5. Backfill existing mis-titled promoted protocols
One-off `scripts/backfill-protocol-titles.mjs` (NOT a committed migration): for each `protocol` record with a generic title, parse `source.ref.id`, load the vendor-pdf, `PUT /records/:id` with `{ ...payload, title: <pdf title>, shortSlug: slugify(<pdf title>) }` (payload-replace). Use the record PUT (index stays consistent); never hand-edit YAML.
Verify: `GET records?kind=protocol` shows the CellROX title; run Protocol tab refresh shows it, not "Quick Reference CAN-protocol-...".

---

## Phase 2 — Unified review surface

### T6. New `VendorPdfReviewPage` (`/ingestion/vendor-pdf/:recordId`)
New `app/src/ingestion/VendorPdfReviewPage.tsx`:
- Load record via `getRecord`. `pdfUrl=apiClient.vendorPdfBlobUrl(recordId)`. Extract `extractedText` pages, `activePage` (number|null), `extraction` (candidate), `extracting`, `error`.
- Main pane (left): pdfjs canvas renderer (copy the worker init + per-page canvas from `literature/PdfProtocolBuilder.tsx`); `onGotoPage` scrolls to that page. If blob 404s (no stored file), fall back to a plain-text pane rendering `extractedText` per page.
- Right pane: reuse `ProtocolCandidatePreview` (from `event-editor/protocol-builder/`). "Extract Protocol" button POSTs `/protocol-builder/extract` with `sourceText` joined from `extractedText` (mirror ExtractionPanel line 102). Title = `record.payload.title`.
- Add props to `ProtocolCandidatePreview`: `onGotoPage?: (pageNumber: number) => void` and make provenance "Page N" a clickable button.

Register lazy route in `app/src/App.tsx` near other ingestion routes (~line 129): `<Route path="/ingestion/vendor-pdf/:recordId" ... />`.

Verify: `npm run typecheck -w app`; existing ingestion/extraction tests still pass.

### T7. Conditional overrides in `ProtocolCandidatePreview`
Gate each override input on the step actually having that quantity (only render Volume input when step has a volume, etc.):
```tsx
{stepHasQuantity(step.volume) && (
  <label ...>Volume (µL):<input ... /></label>
)}
```
`stepHasQuantity(v) = v != null && String(v).trim() !== ''`. If `AiProtocolCandidateStepSummary` (in `app/src/types/ai.ts`) lacks these fields, either add `volume?/temperature?/duration?/concentration?` and populate server-side, or use a text heuristic (default: text heuristic for speed).
TDD: `ProtocolCandidatePreview.test.tsx` — step without a volume renders no volume input; step with one does.

### T8. Clickable provenance
Already folded into T6's `onGotoPage`; verify a step with evidence page 5 fires `onGotoPage(5)` and a step with no evidence renders no link (test in `ProtocolCandidatePreview.test.tsx`).

### T9. Rewite the ingestion tab buttons to the single surface
`app/src/ingestion/VendorPdfWorkflowTab.tsx`: replace the three per-item buttons with the review page:
- "Extract Protocol" → `navigate('/ingestion/vendor-pdf/' + recordId)` (auto-extracts).
- "View" → same route (it's the viewer now).
- Remove "Open in Protocol Builder" (the review page is the builder's extraction front). Delete `handleBuildProtocol` dead code.

Commit (T6-T9): `feat(ingestion): single vendor-PDF review surface (Pdf + extracted protocol)`.

---

## Phase 3 — Run Protocol pane search + good titles

### T10. Server-side `q` filter in `getProtocolContext` (multi-kind text search)

Add a `q?: string` to `ProtocolContextQuery` (`server/src/protocol/ProtocolContextService.ts` line 10) and implicitly to the HTTP query (Fastify passes `request.query` straight into `getContext`, `ProtocolHandlers.ts` line 116). In `getContext`, when `q` is non-empty, pre-filter the fetched record lists by a case-insensitive substring match on `title`, `recordId`, and (cheap) any `humanStepsText`/`steps[].label` on the record — then run the existing project/experiment/lab-grouping logic over the filtered sets. Add a small helper:

```ts
function matchesQuery(record: RecordEnvelope, needle: string): boolean {
  const p = (record.payload ?? {}) as Record<string, unknown>;
  const haystack = [
    typeof p.title === 'string' ? p.title : '',
    record.recordId,
    typeof p.humanStepsText === 'string' ? p.humanStepsText : '',
  ].join(' ').toLowerCase();
  return haystack.includes(needle);
}
```
where `needle = (query.q ?? '').trim().toLowerCase()`. If `needle` is non-empty, wrap each `protocols`/`localProtocols` store-list with `.filter((r) => matchesQuery(r, needle))` before grouping. `runMethods` (planned-run/event-graph scoped to the run) and their step labels should ALSO be matched by `needle` so run-attached methods are searchable in place.

- Because `availableProtocols` is built from those filtered groups, a `q` narrows it. Vendor-pdfs are NOT in this response today — see T10b.

Add server tests in `server/src/protocol/ProtocolContextService.test.ts` (create if absent) with a mock `store.list` returning known protocols:
1. `q='cellrox'` returns only the protocol whose title/recordId/humanStepsText contains cellrox.
2. `q=''` (or absent) returns everything (no regression).
3. A run-attached method matching `q` appears in `runMethods`.
Run `npx vitest run server/src/protocol/ProtocolContextService.test.ts` — red → green.

### T10b. Return free-floating vendor-pdfs in `getProtocolContext`

Add `ingestedPdfs: RecordEnvelope[]` to `ProtocolContextResponse` (line 16). In `getContext`, also `store.list({ kind: 'vendor-pdf' })` and include entries (filtered by the same `matchesQuery` when `q` non-empty):

```ts
const vendorPdfs = needle
  ? (await this.store.list({ kind: 'vendor-pdf' })).filter((r) => matchesQuery(r, needle))
  : await this.store.list({ kind: 'vendor-pdf' });
```
Return `ingestedPdfs: uniqueById(vendorPdfs)` in the response. Keep `vendor-pdf` OUT of `availableProtocols` (they are not attachable via `useProtocolInRun`); they ride in their own field so the UI renders them as an "Ingested PDFs" group with an Open action.

Test: add to `ProtocolContextService.test.ts` — a vendor-pdf whose title matches `q='cellrox'` appears in `ingestedPdfs`; with no `q`, all vendor-pdfs are returned in `ingestedPdfs` (and NOT in `availableProtocols`).

### T10c. Client: send `q` and render the three groups

`app/src/event-editor/right-pane/protocol/ProtocolSelector.tsx` + `app/src/event-editor/right-pane/protocol/ProtocolTabPanel.tsx`:
- **Client method**: extend `getProtocolContext` in `app/src/shared/api/client.ts` (line ~4356) to accept `q?: string` in its query arg and set it as a `q` URLSearchParam. Add `ingestedPdfs: RecordEnvelope[]` to the client `ProtocolContextResponse` (line ~58-63).
- Add `query` state in `ProtocolTabPanel`; when it changes, re-fetch `getProtocolContext({ studyId, runId, q })` (debounced ~250ms). Thread the updated `context` (now including `ingestedPdfs`) down to `ProtocolSelector`.
- In `ProtocolSelector`, drop the added client-side substring filter from the local lists (the server already filtered) but KEEP the "no matches" empty-state and render a third group, "Ingested PDFs", from `context.ingestedPdfs` — each row: title + `recordId · Vendor PDF`, with an **"Open"** button (`onOpenIngestedPdf` prop → `/ingestion/vendor-pdf/:id`) — NOT "Attach" (`useProtocolInRun` only accepts protocol/local-protocol).
- `candidate protocols` are free-floating `protocol` records already in `availableProtocols`/`labProtocols`, so the server `q` covers them (no extra fetch).
- `localized lab protocols` already in `projectProtocols`/`labProtocols` — covered by the server `q`.

TDD (client): extend `ProtocolSelector.test.tsx` — (1) renders "Ingested PDFs" group from `context.ingestedPdfs`; (2) a vendor-pdf row has an Open button, no Attach button; (3) no-match state shows "No matches". These don't need a live server since `ProtocolContextResponse` now carries `ingestedPdfs`. Run `npx vitest run app/src/event-editor/right-pane/protocol/ProtocolSelector.test.tsx`.

### T11. Defensive fallback title in the selector
In `ProtocolSelector.tsx` `titleOf` (lines 42-45): map a generic title to `'Untitled PDF protocol'` (real fix is T3-5; this is a UI safety net):
```ts
const GENERIC = /^(quick reference|untitled|june \d{4})$/i;
function titleOf(p) { const t = typeof payload?.title === 'string' ? payload.title : ''; return t && !GENERIC.test(t) ? t : (t || 'Untitled PDF protocol'); }
```

### T12. Wire through `ProtocolTabPanel`
Pass `onOpenIngestedPdf={(id) => navigate('/ingestion/vendor-pdf/' + id)}` (add `useNavigate` if missing); add the debounced `q` re-fetch. Attach flow unchanged (`useProtocolInRun`).

Commit (T10-T12): `feat(protocol-pane): server-side search across protocols, run methods, and ingested PDFs`.

---

## Phase 4 — Cleanup dead routes

### T13. Remove dead / broken surfaces
- `ProtocolBuilderPage` right-pane `RightPanel` tabs (Preview/Configure/Draft/Promote) are broken/placeholder — per YAGNI, remove the broken right-pane tabs from `ProtocolBuilderPage.tsx` (or hide the tab strip) so the page shows only the working extraction front `ProtocolCandidatePreview`. The review surface (T6) replaces the page's role for this workflow.
- Confirm no route still points at the old `/lab/vendor-pdfs/:id` View dead-link (T9 covers the button; if `ProtocolSelector`/other components deep-link there, repoint to the review route).

Verify: `npm run typecheck -w app`; run the `ProtocolSelector`/`ProtocolCandidatePreview`/ingestion test suites.

---

## Tests / validation summary
| Area | Command | Expectation |
|---|---|---|
| Blob | `npx vitest run src/api/handlers/VendorPdfBlobHandlers.test.ts` | 200/404/400 pass |
| Promotion title | `npx vitest run src/extract/CandidatePromoter.test.ts` | red→green |
| Extract thread | `npx vitest run src/api/handlers/ExtractHandlers.test.ts` | passes |
| Candidate preview | `npx vitest run app/src/event-editor/protocol-builder/ProtocolCandidatePreview.test.tsx` | conditional + provenance cases pass |
| Protocol-context search | `npx vitest run server/src/protocol/ProtocolContextService.test.ts` | `q` filters + `ingestedPdfs` cases pass |
| Selector search | `npx vitest run app/src/event-editor/right-pane/protocol/ProtocolSelector.test.tsx` | Ingested PDFs group, Open-vs-Attach, no-match cases pass |
| server typecheck | `npm run typecheck -w server` | clean |
| app typecheck | `npm run typecheck -w app` | clean |
| Live (after P1) | `curl -so /tmp/x.pdf -w "%{http_code}" http://100.111.141.22:3001/vendor-pdfs/VPDF-257F57196F6C/pdf` | 200, >1MB |
| Live (after P1 backfill) | `GET records?kind=protocol` | CellROX title, not "Quick Reference" |
| Live (P3) | open a run Protocol tab, type "cellrox" | CellROX PDF shows (Open, no Attach); protocol with cellrox in title shows (Attach) |

## Risks, tradeoffs, open questions
- **Dependency ordering**: Phases must land in order — P1 blob+title before P2 PDF pane & P3 titles; P2 review route before P3's "Open" target. Do not parallelize across phases that share a file (e.g. `CandidatePromoter`, `ProtocolCandidatePreview`, `ProtocolSelector` are each touched by exactly one phase). Commit per phase.
- **Title conservatism**: promotion overwrites only generic draft titles; a hand-authored title is preserved. Separate quality issue — "Protocol steps not detected" (empty extraction) — is **NOT** in scope; flagged for a follow-up.
- **Search is server-side** via a new `q` param on `getProtocolContext`, filtering `protocol`, `local-protocol`, and new `vendor-pdf` records (title/recordId/humanStepsText). This scales better than a client-side substring filter and keeps `availableProtocols`/`runMethods` consistent. The client sends `q` debounced (~250ms). If the library grows to need full-text/ranking, swap `matchesQuery` for the existing `/search/graph` or a proper index — a clean follow-up, not needed now.
- **Vendor-pdf "Open" vs "Attach"**: a bare `vendor-pdf` result intentionally does not offer "Attach to run" (`useProtocolInRun` only accepts protocol/local-protocol). Expected click path: search → Open review page → Extract → Promote → back to run to attach. One-click PDF→attach is a separate, larger promote-then-attach flow; confirm if wanted.
- **Step-body search** is partially covered by the server-side `q` (it matches `humanStepsText`), so long-form step text is searchable. Structured per-step field-level search (querying individual step labels) is a possible refinement, but not required now.
- **`onGotoPage` + pdfjs**: pdfjs renders all pages eagerly; jumping = `scrollIntoView` on the target page element. If virtualized pagination arrives later, the handler must request render first; assume eager for now.

## Notes for the implementer (zero-context)
- Read `CLAUDE.md` first: schema-driven, tests-are-the-gate, `exactOptionalPropertyTypes` on (so optional fields must be genuinely optional), no hardcoded domain config.
- The workspaces: server (Fastify) rebuilds via `npx tsx src/server.ts` from `<repo>/server` (or `npm run dev -w server`); frontend vite dev on :5174 via `start-app.sh`. Leave the running daemons alone; restarting the server reloads P1 route/promotion changes.
- Follow the TDD cycle per task: write failing test → run to confirm red → implement → run to confirm green → commit.
- The code blocks above are copy-pasteable but verify the exact current signatures (e.g. `promoteCandidate's `PromoteCandidateArgs`, `ProtocolSelector's `titleOf`) against the files before wiring — minor drift from the three source plans is corrected here, but always re-confirm line numbers.