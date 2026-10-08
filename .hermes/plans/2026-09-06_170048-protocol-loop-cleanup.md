# Protocol Loop Cleanup — one coherent plan (vendor-PDF ingestion → run Protocol pane)

Supersedes: `2026-09-06_143000-vendor-pdf-unified-surface.md`,
`2026-09-06_144500-promoted-protocol-titles.md`,
`2026-09-06_145500-protocol-pane-search.md`,
`2026-09-06_151000-protocol-cleanup-consolidated.md`.

## Goal
Make the full protocol loop work end-to-end with no dead ends: ingest a vendor
PDF → open it on a single review screen (PDF on the left, extracted protocol on
the right) → promote it carrying the source PDF's meaningful title → then find
and attach it (or any localized lab protocol) directly from the run's Protocol
pane.

## Current context / assumptions (verified against the code today)
- Ingested PDFs are free-floating `vendor-pdf` records (title, `file.stored_path`,
  per-page `extractedText[]`). Bytes resolve under the workspace root; the
  records live in the embedded-git store. **No HTTP route serves a free-floating
  vendor-pdf's stored bytes** — only study-scoped
  `/studies/:studyId/artifacts/:artifactId/blob` exists (`routes.ts:1120`,
  `ArtifactBlobHandlers`).
- **View is a dead link**: `app/src/ingestion/VendorPdfWorkflowTab.tsx:162`
  navigates to `/lab/vendor-pdfs/:id`, which `LabEntityWorkspace` does not render.
  "Extract Protocol" (`:154`) and "Open in Protocol Builder" (`:170`,
  `handleBuildProtocol`) go to separate, half-finished surfaces.
- **Promoted titles are meaningless**: `server/src/extract/CandidatePromoter.ts`
  mints `record = { ...candidate.draft, ... }` (lines 137-141), so `record.title`
  = the LLM draft title ("Quick Reference", "June 2023", "Untitled"). The source
  vendor-pdf has a good title that is never used. Confirmed live:
  `CAN-protocol-*__quick-reference.yaml`.
- The run Protocol tab (`ProtocolTabPanel.tsx` → `ProtocolSelector.tsx`) sources
  from `getProtocolContext` (`server/src/protocol/ProtocolContextService.ts`) and
  **has no search box**; it renders Project/Lab groups only, and offers
  "Attach to run" (via `useProtocolInRun`, which accepts only `protocol` /
  `local-protocol` kinds).
- `ProtocolCandidatePreview.tsx` (shared, `app/src/event-editor/protocol-builder/`)
  already renders title/materials/labware/equipment/steps/provenance. Two bugs:
  it renders all four override inputs on **every** step (lines 252-296), and
  provenance is text-only (lines 239-249). The step type
  `AiProtocolCandidateStepSummary` (`app/src/types/ai.ts:490`) has **no**
  volume/temperature/duration fields, so "does this step have a volume?" requires
  a text heuristic (see T7).

## Architecture / proposed approach
Sequenced, dependency-ordered phases. Each phase is independently shippable and
tested (TDD per task). Shared components are fixed once and reused: the blob
route + title pipeline (Phase 1) are the data foundation the review surface
(Phase 2) and the run pane (Phase 3) depend on; Phase 4 removes the now-dead
routes. **Search is server-side** (a `q` param on `getProtocolContext`) so the
filter is consistent across scopes and scales; free-floating vendor-pdfs are
returned in a new `ingestedPdfs` field so the pane can render an "Ingested PDFs"
group with an Open (not Attach) action.

File-ownership rule: `CandidatePromoter.ts`, `ProtocolCandidatePreview.tsx`,
`ProtocolSelector.tsx`, `ProtocolTabPanel.tsx` are each touched by exactly one
phase — do not parallelize across phases that share a file. Commit at the end of
each task (or each phase) with the message given.

---

## Phase 1 — Backbone (server): serve PDF bytes + meaningful promotion titles

### T1. Serve a vendor-pdf's stored bytes
New file `server/src/api/handlers/VendorPdfBlobHandlers.ts` — path-traversal-safe
mirror of `ArtifactBlobHandlers`:

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
      if (!/^[A-Za-z0-9_-]+$/.test(req.params.recordId)) {
        reply.status(400).send({ error: 'BAD_REQUEST', message: 'malformed recordId' });
        return;
      }
      const envelope = await opts.recordStore.get(req.params.recordId);
      const file = (envelope?.payload as Record<string, unknown> | undefined)?.file as
        { stored_path?: string; media_type?: string } | undefined;
      if (!file?.stored_path) {
        reply.status(404).send({ error: 'NOT_FOUND', message: 'record has no stored file' });
        return;
      }
      const abs = resolve(rootAbs, file.stored_path);
      if (relative(rootAbs, abs).startsWith('..')) {
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

Wire it:
- Add `vendorPdfBlobHandlers?: ReturnType<typeof createVendorPdfBlobHandlers>;` to
  `RouteOptions` in `server/src/api/routes.ts` (interface starts ~line 80). Near
  the existing artifact-blob registration (`routes.ts:1118-1124`) add:
  `fastify.get('/vendor-pdfs/:recordId/pdf', vendorPdfBlobHandlers.getVendorPdfBlob.bind(vendorPdfBlobHandlers));`
  (guard with `if (vendorPdfBlobHandlers)` like the artifact one).
- In `server/src/server.ts`, construct it next to the other handlers and assign
  `routeOpts.vendorPdfBlobHandlers = createVendorPdfBlobHandlers({ recordStore: ctx.store, workspaceRoot })`.
  **`workspaceRoot` must be the same value already passed to
  `new ArtifactBlobStore(ctx.workspaceRoot, ...)`** — find that call and reuse the
  expression. Do NOT hardcode a path.

TDD (red → green): new `server/src/api/handlers/VendorPdfBlobHandlers.test.ts`
with a mock `recordStore.get` returning a payload whose `file.stored_path` points
at a temp PDF; assert status 200 + `application/pdf` + streamed bytes for a valid
record, 404 when the record has no `file`, 400 for `stored_path:
'../../etc/passwd'`. Then live:
`curl -s -o /tmp/x.pdf -w "%{http_code}" http://100.111.141.22:3001/vendor-pdfs/VPDF-257F57196F6C/pdf`
→ expect `200`, `/tmp/x.pdf` > 1MB.
Commit: `feat(server): serve free-floating vendor-pdf bytes over HTTP`.

### T2. Client PDF URL helper
In `app/src/shared/api/client.ts`, add a method (near the existing blob helper):

```ts
vendorPdfBlobUrl(recordId: string): string {
  return `${API_BASE}/vendor-pdfs/${encodeURIComponent(recordId)}/pdf`;
},
```

Verify: `npm run typecheck -w app`.

### T3. Promote with the source PDF title (future promotions)
In `server/src/extract/CandidatePromoter.ts`: add `sourceTitle?: string` to
`PromoteCandidateArgs` (interface ~line 20). After minting `record` (line 141)
and before `computeContentHash(record)` (line 144), override conditionally:

```ts
const sourceTitle = args.sourceTitle?.trim();
const DRAFT_GENERIC = /^(quick reference|untitled|unsigned|protocol steps not detected|june \d{4})$/i;
let canonicalRecord: CanonicalRecord = record;
if (sourceTitle) {
  const draftTitle = typeof record.title === 'string' ? record.title.trim() : '';
  const replace = !draftTitle || DRAFT_GENERIC.test(draftTitle);
  if (replace) {
    canonicalRecord = { ...record, title: sourceTitle };
  }
}
```

Then pass `canonicalRecord` to `computeContentHash` (line 144) and return it as
`outcome.record` (line 163). Conservative: only replaces missing/generic draft
titles; a specific hand-authored title is never overwritten.

TDD (red → green): add a case in `server/src/extract/CandidatePromoter.test.ts`
(a `promoteCandidate({ ...sourceTitle: 'Molecular Probes CellROX…', ... })`
literal in the file's existing style): draft titled "Quick Reference" +
`sourceTitle` → `outcome.record.title === sourceTitle`. Run
`npx vitest run server/src/extract/CandidatePromoter.test.ts`.

### T4. Thread the title from the vendor-pdf into promotion
In `server/src/api/handlers/ExtractHandlers.ts`, `promoteArgs` is built at
lines 196-217 and passed to `promoteCandidateLogic(promoteArgs)` at line 220;
`sourceArtifactRef: draft.source_artifact` (line 207); `store` is in scope.
Before `promoteArgs`, resolve and add:

```ts
let sourceTitle: string | undefined;
if (draft.source_artifact?.kind === 'record' && draft.source_artifact?.id) {
  try {
    const srcEnv = await store.get(draft.source_artifact.id);
    const title = (srcEnv?.payload as Record<string, unknown> | undefined)?.title;
    if (typeof title === 'string' && title.trim()) sourceTitle = title.trim();
  } catch { /* ignore missing source */ }
}
// ...add `sourceTitle` to the promoteArgs object
```

Extend `server/src/api/handlers/ExtractHandlers.test.ts`: a draft with
`source_artifact: { kind: 'record', id: 'VPDF-X' }`; the mock store's
`get('VPDF-X')` returns a vendor-pdf payload with a meaningful `title`; assert the
promoted record's `title` equals it. Run `npx vitest run server/src/api/handlers/ExtractHandlers.test.ts`.
Commit (T3+T4): `fix(extract): promote vendor protocols with the source PDF title`.

### T5. Backfill existing mis-titled promoted protocols
One-off `scripts/backfill-protocol-titles.mjs` at repo root (NOT a committed
migration, NOT a manual YAML edit). For each `GET records?kind=protocol` record
whose `title` matches the generic regex: read `source.ref.id` → `GET` that
vendor-pdf → `PUT /records/:id` with `{ ...payload, title: <pdfTitle>, shortSlug: slugify(<pdfTitle>) }`
(payload-replace; the record PUT keeps the index consistent). Verify:
`GET records?kind=protocol` shows the CellROX title, and the run Protocol tab
(refresh) shows it, not "Quick Reference CAN-protocol-…".

## Phase 2 — Unified review surface

### T6. New `app/src/ingestion/VendorPdfReviewPage.tsx` (route `/ingestion/vendor-pdf/:recordId`)
- Load the record via `apiClient.getRecord(recordId)`; `pdfUrl = apiClient.vendorPdfBlobUrl(recordId)` (T2).
- **Left pane**: render the PDF with pdfjs (copy the worker-init + per-page canvas
  from `app/src/literature/PdfProtocolBuilder.tsx`). If the blob 404s (no stored
  file), render a plain-text pane of `extractedText` per page instead.
- **Right pane**: reuse `ProtocolCandidatePreview` (import from
  `../event-editor/protocol-builder/ProtocolCandidatePreview`). An "Extract
  Protocol" button POSTs `/protocol-builder/extract` with `sourceText` joined
  from `extractedText` (mirror `app/src/event-editor/protocol-builder/ExtractionPanel.tsx`
  ~line 102) and `title: record.payload.title`; on success `setExtraction(candidate)`.
- Register a lazy route in `app/src/App.tsx` near the other ingestion routes
  (~line 129): `<Route path="/ingestion/vendor-pdf/:recordId" ... />`.
Verify: `npm run typecheck -w app`.

### T7. Conditional overrides in `ProtocolCandidatePreview`
`AiProtocolCandidateStepSummary` has no typed quantity fields, so use a text
heuristic (no server change; typed fields + server population is a flagged
follow-up). In `app/src/event-editor/protocol-builder/ProtocolCandidatePreview.tsx`
(lines 252-296), gate each input on a `stepHasQuantity` check:

```ts
const Q = {
  volume: /(\d+(?:\.\d+)?\s*(?:µL|uL|ul|μl|microliter|mL|ml|L)\b)/i,
  temperature: /(\d+(?:\.\d+)?\s*°?\s*C\b)/i,
  duration: /(\d+(?:\.\d+)?\s*(?:min|hr|h|sec|s)\b)/i,
  concentration: /(\d+(?:\.\d+)?\s*(?:m?M|µ?M|mM|nM|uM)\b)/i,
};
const stepText = (step.text ?? '') + ' ' + (step.notes ?? []).join(' ');
const stepHasQuantity = (field: keyof typeof Q) => Q[field].test(stepText);
```

Then wrap each `<label className="...override-field">Volume (µL):…`, `Temp (°C):…`,
`Duration:…`, `Concentration:…` in `{stepHasQuantity('volume') && (…)}` (and the
equivalents), so a step whose text mentions no volume renders no volume input, etc.

TDD: new `app/src/event-editor/protocol-builder/ProtocolCandidatePreview.test.tsx`
(does not exist yet — create it): a step with "Add 5 mL of buffer" renders a
Volume input; a step with "Incubate" renders no Volume input. Run
`npx vitest run app/src/event-editor/protocol-builder/ProtocolCandidatePreview.test.tsx`.

### T8. Clickable provenance → jump the PDF to that page
In `ProtocolCandidatePreview.tsx`, add optional prop
`onGotoPage?: (pageNumber: number) => void`. Replace the text-only provenance
(lines 239-249) so a step with `evidence?.[0]?.pageNumber` renders a button
calling `onGotoPage(pageNumber)`; a step with no evidence renders no link. In
`VendorPdfReviewPage`, pass `onGotoPage={(n) => setActivePage(n)}` and have the
pdfjs pane `scrollIntoView` that page's canvas. Extend the T7 test: a step with
evidence page 5 triggers `onGotoPage(5)`; a step with none renders no link.

### T9. Rewire the ingestion tab to the single surface
`app/src/ingestion/VendorPdfWorkflowTab.tsx`: replace the per-item buttons —
"Extract Protocol" (`:154`) AND "View" (`:162`) both become
`navigate('/ingestion/vendor-pdf/' + recordId)`; remove the "Open in Protocol
Builder" button (`:170`) and delete the now-dead `handleBuildProtocol` callback
(`:83-98`). Update `VendorPdfWorkflowTab.test.tsx` if it asserts button behavior.
Commit (T6-T9): `feat(ingestion): single vendor-PDF review surface (PDF + extracted protocol)`.

## Phase 3 — Run Protocol pane: server-side search + tested titles

### T10. Server-side `q` filter in `getProtocolContext`
In `server/src/protocol/ProtocolContextService.ts`: add `q?: string` to
`ProtocolContextQuery` (line 10); the handler passes `request.query` straight in,
so the HTTP query param works for free. In `getContext`, before the existing
grouping, add:

```ts
const needle = (query.q ?? '').trim().toLowerCase();
const matchesQuery = (record: RecordEnvelope): boolean => {
  const p = (record.payload ?? {}) as Record<string, unknown>;
  return [
    typeof p.title === 'string' ? p.title : '',
    record.recordId,
    typeof p.humanStepsText === 'string' ? p.humanStepsText : '',
  ].join(' ').toLowerCase().includes(needle);
};
const scoped = <T extends RecordEnvelope>(list: T[]) => needle ? list.filter(matchesQuery) : list;
```

Apply `scoped(...)` to the `protocols`/`localProtocols`/`plannedRuns`/`eventGraphs`
lists returned by the four `store.list` calls (lines 115-120), so every produced
group (`availableProtocols`, `runMethods`, project/experiment scopes) is filtered
by the same predicate. Add server tests in a new
`server/src/protocol/ProtocolContextService.test.ts` (mock `store.list` returning
known protocols): (1) `q='cellrox'` returns only the matching protocol; (2) no/empty
`q` returns everything (no regression); (3) a run-attached method matching `q`
appears in `runMethods`. Run `npx vitest run server/src/protocol/ProtocolContextService.test.ts`.

### T10b. Return free-floating vendor-pdfs
Add `ingestedPdfs: RecordEnvelope[]` to `ProtocolContextResponse` (line 16). In
`getContext`, `store.list({ kind: 'vendor-pdf' })`, apply `scoped(...)`, and
return it as `ingestedPdfs: uniqueById(...)`. Keep `vendor-pdf` OUT of
`availableProtocols` — they are not attachable via `useProtocolInRun`; they ride
in their own field. Extend the test: a vendor-pdf matching `q='cellrox'` appears
in `ingestedPdfs`; with no `q` all vendor-pdfs are returned in `ingestedPdfs` and
NOT in `availableProtocols`.

### T10c. Client: send `q`, render the three groups + Ingested PDFs
- `app/src/shared/api/client.ts`: extend the `getProtocolContext` query arg to
  accept `q?: string` (set it as a `q` URLSearchParam) and add
  `ingestedPdfs: RecordEnvelope[]` to the client `ProtocolContextResponse`.
- `app/src/event-editor/right-pane/protocol/ProtocolTabPanel.tsx`: keep the
  existing `protocolContext` state (line 960); add `query` state and re-fetch
  `getProtocolContext({ studyId, runId, q })` on change, debounced ~250ms.
- `app/src/event-editor/right-pane/protocol/ProtocolSelector.tsx`: remove the
  (previously-planned) client-side substring filter — the server already filtered —
  but keep the "no matches" empty-state, and render a third group **"Ingested
  PDFs"** from `context.ingestedPdfs`: each row = `titleOf(pdf) || pdf.recordId`
  with subtitle `pdf.recordId · Vendor PDF` and an **Open** button (new optional
  prop `onOpenIngestedPdf?: (recordId: string) => void`), NOT an Attach button
  (`useProtocolInRun` only accepts protocol/local-protocol). Existing project/lab
  groups are already filtered server-side, so no extra client work for them.
- TDD: extend `app/src/event-editor/right-pane/protocol/ProtocolSelector.test.tsx`:
  (1) renders "Ingested PDFs" group from `context.ingestedPdfs`; (2) a vendor-pdf
  row has an Open button and no Attach button; (3) a query with zero matches shows
  "No matches". Since `ProtocolContextResponse` now carries `ingestedPdfs`, these
  need no live server. Run `npx vitest run app/src/event-editor/right-pane/protocol/ProtocolSelector.test.tsx`.

### T11. Defensive fallback title label
In `ProtocolSelector.tsx` `titleOf` (lines 42-45), map generic titles to a
friendly label (real fix is T3-T5; this is a UI safety net):

```ts
const GENERIC_TITLE = /^(quick reference|untitled|june \d{4})$/i;
function titleOf(p: { payload?: unknown }): string {
  const payload = p.payload as Record<string, unknown> | undefined;
  const t = typeof payload?.title === 'string' ? payload.title : '';
  return t && !GENERIC_TITLE.test(t) ? t : (t || 'Untitled PDF protocol');
}
```

### T12. Wire `ProtocolTabPanel`
Pass `onOpenIngestedPdf={(id) => navigate('/ingestion/vendor-pdf/' + id)}` to
`ProtocolSelector` (add `useNavigate` to `ProtocolTabPanel` if missing — confirm;
the file imports it elsewhere in the panel file). Attach flow unchanged.
Commit (T10-T12): `feat(protocol-pane): server-side search across protocols, run methods, and ingested PDFs`.

## Phase 4 — Cleanup dead routes

### T13. Remove dead / broken surfaces
- In `app/src/event-editor/protocol-builder/ProtocolBuilderPage.tsx`, the
  right-pane `RightPanel` tabs (Preview/Configure/Draft/Promote) are broken
  placeholders — remove the tab strip / broken tabs per YAGNI so the page shows
  only the working extraction front `ProtocolCandidatePreview`. The review surface
  (T6) supersedes the page for this workflow.
- Confirm nothing still deep-links to `/lab/vendor-pdfs/:id` (T9 removes the
  button; grep `vendor-pdfs/` in `app/src` and repoint any other link to
  `/ingestion/vendor-pdf/:id`).
Verify: `npm run typecheck -w app`; run the ProtocolSelector,
ProtocolCandidatePreview, and ingestion test suites.

## Tests / validation summary
| Area | Command | Expectation |
|---|---|---|
| Blob route | `npx vitest run server/src/api/handlers/VendorPdfBlobHandlers.test.ts` | 200/404/400 pass |
| Promotion title | `npx vitest run server/src/extract/CandidatePromoter.test.ts` | red → green |
| Extract threading | `npx vitest run server/src/api/handlers/ExtractHandlers.test.ts` | passes |
| Candidate preview | `npx vitest run app/src/event-editor/protocol-builder/ProtocolCandidatePreview.test.tsx` | conditional + provenance cases pass |
| Protocol-context search | `npx vitest run server/src/protocol/ProtocolContextService.test.ts` | `q` filter + `ingestedPdfs` cases pass |
| Selector search | `npx vitest run app/src/event-editor/right-pane/protocol/ProtocolSelector.test.tsx` | Ingested PDFs group, Open-vs-Attach, no-match pass |
| server typecheck | `npm run typecheck -w server` | clean |
| app typecheck | `npm run typecheck -w app` | clean |
| Live (after P1) | `curl -so /tmp/x.pdf -w "%{http_code}" http://100.111.141.22:3001/vendor-pdfs/VPDF-257F57196F6C/pdf` | 200, >1MB |
| Live (after P1 backfill) | `GET records?kind=protocol` | CellROX title, not "Quick Reference" |
| Live (P3) | open a run's Protocol tab, type "cellrox" | CellROX PDF row (Open, no Attach); matching protocol row (Attach) |

## Risks, tradeoffs, open questions
- **Ordering is mandatory**: P1 (blob + title) precedes P2 (PDF pane) and P3
  (titles/display); P2's review route precedes P3's "Open" target. Respect the
  file-ownership rule in "Architecture" — no cross-phase parallel edits to the
  same file. Commit per task/phase.
- **Search is server-side** (`q` on `getProtocolContext` filtering title/recordId/
  humanStepsText). This is a linear substring scan over the library; the current
  library is small. If it grows, swap `matchesQuery` for `/search/graph` or an
  index — a clean follow-up, not needed now. This is the ONE architecture decision
  chosen here: the earlier `protocol-pane-search` draft proposed a client-side
  filter; that approach is superseded because a client-side `listRecordsByKind(200)`
  fetch of vendor-pdfs wouldn't scale and would bypass `useProtocolInRun`
  consistency. Do not resurrect the client-side filter (T10c says remove it).
- **Vendor-pdf "Open" vs "Attach"**: a bare `vendor-pdf` result intentionally
  offers only "Open → review page → Extract → Promote → back to the run to attach",
  because `useProtocolInRun` validates kind. One-click PDF→attach is a separate,
  larger promote-then-attach flow — out of scope; confirm if wanted.
- **Conditional overrides are heuristic**: `AiProtocolCandidateStepSummary` has no
  typed quantity fields, so T7 uses regexes on step text. Approximate. Adding typed
  `volume?/temperature?/duration?/concentration?` fields + populating them
  server-side at extraction time is a clean, isolated follow-up that makes the
  override inputs exact — only do it if the heuristic proves insufficient.
- **Title conservatism**: promotion overwrites only missing/generic draft titles;
  hand-authored titles preserved. The empty-extraction "Protocol steps not
  detected" quality issue is explicitly NOT in scope.
- **`onGotoPage` + pdfjs**: pdfjs renders all pages eagerly; jumping =
  `scrollIntoView` on the target page element. If pagination becomes virtualized,
  the handler must request a render first; assume eager for now.
- **PDF CORS**: frontend proxies `/api` same-origin in dev, so pdfjs loading the
  blob is not cross-origin. Flag if a deployed backend ever hosts separately.

## Notes for the implementer (zero context)
- Read `CLAUDE.md` first: schema-driven, tests-are-the-gate, `exactOptionalPropertyTypes`
  on (optional fields must be genuinely optional), no hardcoded domain config.
- Workspaces: server (Fastify, `npm run dev -w server` / `npx tsx server/src/server.ts`)
  and app (Vite :5174, `npm run dev -w app`). Restarting the server reloads P1
  route/promotion changes; the frontend hot-reloads. Do not kill running daemons
  with a blanket `pkill` — target specific PIDs/ports if a restart is needed.
- TDD per task: write failing test → confirm red → implement → confirm green →
  commit. The code blocks above are copy-pasteable, but re-confirm current
  signatures before wiring (line numbers drift; e.g. confirm `promoteCandidate`'s
  `PromoteCandidateArgs`, `getProtocolContext`'s client signature, and the
  `workspaceRoot` expression in `server.ts`).

---

## Implementation status — 2026-09-06 (executed directly)

### Done & verified
- **T1** server/src/api/handlers/VendorPdfBlobHandlers.ts + test (6/6) — route wired in routes.ts + server.ts. Live: GET /api/vendor-pdfs/VPDF-257F57196F6C/pdf → 200, 1.1MB. NB: route is under /api prefix.
- **T2** apiClient.vendorPdfBlobUrl in app/src/shared/api/client.ts.
- **T3** CandidatePromoter sourceTitle? arg; record overridden pre-hash when title missing/generic. Tests 10/10.
- **T4** ExtractHandlers resolves title from source_artifact.id (vendor-pdfs are kind:'file' + VPDF-* id, NOT kind:'record' as the plan assumed — fixed). Test passes.
- **T5** scripts/backfill-protocol-titles.mjs (dry-run default; --apply). Applied to the 3 live CAN-protocol-* records; verified on disk + API.
- **T6-T9** VendorPdfReviewPage (/ingestion/vendor-pdf/:recordId) + route + CSS; ProtocolCandidatePreview conditional overrides + onGotoPage provenance (6/6 tests); ingestion tab rewired (5/5 tests), dead /lab/vendor-pdfs/:id removed. App typecheck clean.
- **T10/T10b** getProtocolContext q filter (title/recordId/humanStepsText/steps) + ingestedPdfs field. Tests 7/7. Live: ?q=cellrox → 2 CellROX protocols + VPDF-651F03789D80 in ingestedPdfs.
- **T10c/T11/T12** client q + ingestedPdfs, ProtocolTabPanel search box (debounced) + onOpenIngestedPdf, ProtocolSelector Ingested PDFs group (Open, not Attach) + defensive title. App typecheck clean; selector 5/5, tab panel 25/25.

### Not done (deferred / scope decisions)
- **T13 second half (optional)**: gutting ProtocolBuilderPage's broken right-pane tabs was NOT done — large risky edit to a page other components still import; review surface supersedes it. Follow-up.
- One-click vendor-pdf to attach (promote-then-attach) out of scope, as flagged.
- Search is linear-substring (fine for current library); swap for an index if it grows.

### Test-suite caveat (NOT regressions from this work)
The full server (73 files / 81 tests) and app (189 files / 100 tests) suites fail repo-wide BEFORE and AFTER this work. Root cause: a pre-existing broken tree (branch 43 commits ahead with in-flight uncommitted work; dominant failure is the JSDOM/pdfjs 'DOMMatrix is not defined' error affecting any test importing pdfjs transitively). Proof: App.test.tsx fails identically (8/32) on clean HEAD; all files I changed pass in isolation (65/65 bar the 4 component suites; server blob/promoter/extract/context suites green). The one shared file (ExtractHandlers.test.ts upload case) was already failing on clean HEAD (verified by stash+test).
