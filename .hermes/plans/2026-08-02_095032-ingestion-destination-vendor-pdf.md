# Ingestion Destination + First-Class `vendor-pdf` Record — Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Introduce a top-level **Ingestion** destination (alongside Projects, Runs, Claims, Lab) hosting tabbed ingestion *workflows* (vendor-PDF, then PubMed), and make the ingested `vendor-pdf` a first-class, free-floating lab record (no required studyId) that can be graph-linked to studies/runs.

**Architecture:** Ingestion is a distinct *class* of surface — external-document acquisition workflows (search → fetch → extract → promote), as opposed to record *discovery* (universal search) or record *browsing* (Lab). `<TBD write>` Iteration 1 ships a `vendor-pdf` tab that runs the existing Exa search + ingest + extract pipeline, but writes a first-class `vendor-pdf` record instead of a study-scoped `artifact`. Extraction still promotes to a universal `protocol` (`source.type=vendor`). The run right-pane "search" tab keeps local artifact lookup and links out to Ingestion instead of embedding the vendor-PDF workflow.

**Tech Stack:** React 18 + Vite + TS (app/), Fastify + TS (server/), YAML JSON-Schema via Ajv (validation), pnpm/npm workspaces, Vitest (unit), Playwright (e2e).

---

## Decisions locked (from Brad)
1. New record kind: `vendor-pdf` (NOT reusing `document`).
2. Exa vendor-PDF search stays **local to the vendor-PDF workflow tab** — do NOT fold into the universal top search bar.
3. Ingestion workflows get their own **top-level destination** (`/ingestion`), a tabbed page like `/lab`. Iteration 1 tabs: **vendor-pdf**, **pubmed**.
4. Ingested `vendor-pdf` is a **first-class, free-floating** object: no required studyId; stored flat; linkable to studies/runs.
5. **Q2 (in-study "+ Add source"):** the link is kept **as part of the ingestion record** — a vendor-pdf ingested from inside a study carries that parent link in its own payload (`links.studyId`) — not only as a separate relationship record.
6. **Q1 (Lab):** `/lab` gets a **Vendor PDFs** category (records list). From inside it a **"+ New PDF"** button navigates to the Ingestion pipeline (`/ingestion/vendor-pdf`).
7. **Q3 (universal search):** shows only **already-ingested** vendor-pdf/protocol records — NO live Exa results.
8. **Q4 ("Build Protocol"):** keep the existing extraction → `vendor-protocol-candidate` → promote-to-universal-`protocol` (`source.type=vendor`) path, **plus** an "Open in Protocol Builder" CTA from the vendor-pdf record / recent-ingests list.

---

## Phase 0 — Add `vendor-pdf` schema (lab-scoped, studyId optional)

**Objective:** Author the canonical first-class record that captures an ingested vendor document + its extraction products.

**Files**
- Create: `schema/lab/vendor-pdf.schema.yaml`
- Test: `server/src/validation/` schema-load smoke (see Phase 1)

**Step 1: Write the schema** (mirror `artifact`'s polymorphic body, minus the `studyId` requirement; add `source` provenance and an optional `vendorProtocolCandidateRef` to the extraction sidecar):

```yaml
$schema: "https://json-schema.org/draft/2020-12/schema"
$id: "https://computable-lab.com/schema/computable-lab/vendor-pdf.schema.yaml"
title: "VendorPdf"
description: >
  A first-class, lab-level record representing an ingested vendor document
  (e.g. a kit protocol PDF). It is FREE-FLOATING: it requires no parent
  study/experiment/run. Links to consuming studies/runs are expressed via
  relationship records. Extraction products (vendor-protocol-candidate) are
  referenced, not embedded.
type: object
unevaluatedProperties: false
allOf:
- $ref: "./common.schema.yaml#/$defs/FAIRCommon"
required: [ kind, recordId, title, source, state ]
properties:
  kind: { const: "vendor-pdf" }
  recordId:
    type: string
    pattern: "^VPDF-[A-Z0-9]+$"
  title: { type: string }
  shortSlug: { type: string }
  state:
    type: string
    enum: [ draft, in_progress, ingested, extracted, superseded, archived ]
  # Optional parent link, kept as part of the ingestion record (Decision 5):
  # a vendor-pdf ingested from inside a study records that study here so the
  # contextual link survives. The record is still first-class/free-floating.
  links:
    type: object
    additionalProperties: false
    description: "Optional parent filing links captured at ingest time."
    properties:
      studyId: { type: string }
      experimentId: { type: string }
      runId: { type: string }
  source:
    type: object
    additionalProperties: false
    required: [ engine, url, ingestedAt ]
    properties:
      engine: { const: "exa" }
      vendor: { type: string }
      title: { type: string }
      url: { type: string, format: uri }
      query: { type: string }
      ingestedAt: { type: string, format: date-time }
      pageCount: { type: integer, minimum: 0 }
  file: { $ref: "./datatypes/file-ref.schema.yaml" }
  extractedText:
    type: array
    items:
      type: object
      additionalProperties: false
      required: [ pageNumber, text ]
      properties:
        pageNumber: { type: integer, minimum: 1 }
        text: { type: string }
  vendorProtocolCandidateRef:
    $ref: "./datatypes/ref.schema.yaml"
  promotedProtocolRef:
    $ref: "./datatypes/ref.schema.yaml"
  tags:
    type: array
    items: { type: string }
    uniqueItems: true
```

**Step 2: Add `vendor-pdf` to the recordId regex** in `server/src/repo/PathConvention.ts` (`RECORD_ID_PATTERNS`, add `/^VPDF-[A-Z0-9]+$/`).

**Verify:** `npm run typecheck -w server`; schema loads with all 141 schemas (see JSON Schema Debugging section). Confirm Ajv validates the sample payload in Step 1 with all schemas loaded.

**Commit:** `feat(schema): add first-class vendor-pdf record schema`

---

## Phase 1 — Record plumbing: index + kindMeta so vendor-pdf is first-class & findable

**Objective:** Make `vendor-pdf` a real, addressable, searchable kind across backend index and frontend routing.

**Files**
- Modify: `server/src/index/IndexManager.ts` (buildIndexEntry — vendor-pdf is a flat kind, auto-covered; add `source.*` to index fields if desired)
- Modify: `app/src/shared/lib/kindMeta.ts`
- Modify: `server/src/repo/PathConvention.ts` (flat storage — already default since kind !== artifact/event-graph; add `VPDF-` regex)

**Why flat is free:** `generatePath()` only nests when `kind === 'event-graph'` or `kind === 'artifact'`. A `vendor-pdf` kind lands flat under `records/vendor-pdf/` with **no code change** to storage. `parseRecordPath`/`isNestedKind` need no change.

**Step 1 — kindMeta (app):** add entries:
```ts
// KIND_LABEL
'vendor-pdf': 'Vendor PDF',
// KIND_TO_LAB_CATEGORY — Lab gets a Vendor PDFs records-list category (Decision 6)
'vendor-pdf': 'vendor-pdfs',
// kindToSearchEntityType — first-class routable lab bucket (Decision 7: discovery only)
if (kind === 'vendor-pdf') return 'lab'
```
`recordRoute` then resolves `vendor-pdf` → `/lab/vendor-pdfs/:id` (LabEntityWorkspace is schema-agnostic).

**Step 2a — Lab category (Decision 6).** In `app/src/collections/LabCollectionView.tsx` add to `CATEGORIES`:
```ts
{ id: 'vendor-pdfs', label: 'Vendor PDFs', kind: 'vendor-pdf' },
```
This renders the ingested vendor-pdf records as cards. Add a **"+ New PDF"** header action button (visible when `activeCategory === 'vendor-pdfs'` — or render it alongside `sortControls` for every category disabled otherwise) that `navigate('/ingestion/vendor-pdf')`. Add a test asserting the button appears on the vendor-pdfs tab and routes to the Ingestion pipeline.

**Step 2 — index (server):** confirm `buildIndexEntry` indexes the kind generically (it does for arbitrary kinds). Add unit test: indexing a `vendor-pdf` payload produces an `IndexEntry` queryable by `kind='vendor-pdf'` and by `source.title`.

**Step 3 — PathConvention test:** add `VPDF-` to `RECORD_ID_PATTERNS`; test `generatePath({ kind:'vendor-pdf', recordId:'VPDF-ABC123...' })` → `records/vendor-pdf/VPDF-*.yaml`.

**Verify:** `npm run test:run -w server` (PathConvention + index tests); `npm run test -w app` (kindMeta).

**Commit:** `feat(kind): wire vendor-pdf into index + routing`

---

## Phase 2 — Backend ingest writes a first-class vendor-pdf (decouple studyId)

**Objective:** `POST /vendors/graph-lemur/pdfs/ingest` creates a durable `vendor-pdf` record even with NO studyId (currently it writes nothing durable in that case).

**Files**
- Modify: `server/src/api/handlers/VendorSearchHandlers.ts` (ingestGraphLemurPdf, ~983–1318)
- Modify: `server/src/repo/PathConvention.ts` (no nesting needed; ensure `getGlobPattern('vendor-pdf')` works — default flat glob is fine)
- Test: `server/src/api/handlers/VendorSearchHandlers.phase9.test.ts` / new `VendorSearchHandlers.vendorpdf.test.ts`

**Step 1 — write failing test first (TDD).** Ingest with `url` + a `vendor`, **no studyId**; assert response now includes `recordedArtifact` where `envelope.payload.kind === 'vendor-pdf'` and the file lives at `records/vendor-pdf/VPDF-*.yaml`. (Today this returns no record.)

**Step 2 — change the persistence branch** in `ingestGraphLemurPdf`:
- Keep download + `extractVendorProtocolCandidateFromInput` as-is (sidecar candidate unchanged).
- Replace the `if (requestedStudyId && store)` guard with an **always-persist** path that builds a `vendor-pdf` payload:
  - `kind: 'vendor-pdf'`, `recordId: 'VPDF-<sha12>'`
  - `title`, `source: { engine:'exa', vendor, url, query, ingestedAt, pageCount }`
  - `file` (from `download`), `extractedText` (from extraction pages)
  - `vendorProtocolCandidateRef: { kind:'record', type:'vendor-protocol-candidate', id: documentId }` (candidate is still a workspace JSON sidecar; reference it by documentId — Q on whether candidate becomes a record is Phase 7)
- Keep the legacy study-scoped `artifact` path ONLY when a `studyId` is explicitly provided (back-compat + in-study contextual ingest). **When `studyId` is present (in-study "+ Add source"), set `links.studyId` on the `vendor-pdf` payload** (Decision 5 — the link is kept as part of the ingestion record). When absent (from `/ingestion/vendor-pdf`), omit `links` entirely.

**Verify:** new test passes; existing `VendorSearchHandlers.phase9.test.ts` and `Artifact.smoke.test.ts` still pass (no regression to the study-scoped legacy path).

**Commit:** `feat(server): ingest vendor PDF as first-class record without studyId`

---

## Phase 3 — Ingestion destination: nav + route + tabbed shell

**Objective:** Add a top-level **Ingestion** destination and a tabbed page `/ingestion` mirroring the `/lab` tab structure.

**Files**
- Modify: `app/src/shared/shell/GlobalNavbar.tsx` (DESTINATIONS + activeDest logic)
- Modify: `app/src/App.tsx` (route `/ingestion`, `/ingestion/:tab`)
- Create: `app/src/ingestion/IngestionPage.tsx` + `IngestionPage.css`
- Create: `app/src/ingestion/ingestion.css` (tabs)

**Step 1 — Nav.** Add `{ id:'ingestion', label:'Ingestion', path:'/ingestion' }` to `DESTINATIONS` in `GlobalNavbar.tsx`. Verify active-dest highlighting works for `/ingestion/*`.

**Step 2 — Route.** In `App.tsx` add:
```tsx
const IngestionPage = lazy(() => import('./ingestion/IngestionPage').then(m => ({ default: m.IngestionPage })))
<Route path="/ingestion" element={<DeferredRoute><IngestionPage /></DeferredRoute>} />
<Route path="/ingestion/:tab" element={<DeferredRoute><IngestionPage /></DeferredRoute>} />
```

**Step 3 — Tabbed shell.** `IngestionPage` renders an `AppShell` (brand "Ingestion", `layout='workspace'`, `topbarTabs={<WorkspaceTabStrip/>}`) whose body is a category-style tab nav (copy the `lab-collection__categories` pattern) with tabs: `vendor-pdf`, `pubmed`. Active tab from `useParams().tab`. Each tab dispatches to a workflow component (`VendorPdfWorkflowTab`, `PubmedWorkflowTab`).

**Verify:** `npm run test -w app` (nav/route); manual: `/ingestion` shows both tabs; nav highlights Ingestion.

**Commit:** `feat(ui): add top-level Ingestion destination with tabbed shell`

---

## Phase 4 — Vendor-PDF workflow tab (Exa search local to this tab)

**Objective:** Reuse the existing `VendorPdfSearchSection` as the vendor-pdf workflow inside `/ingestion/vendor-pdf`, decoupled from `studyId`.

**Files**
- Create: `app/src/ingestion/VendorPdfWorkflowTab.tsx` (wraps `VendorPdfSearchSection` + recent-ingests list)
- Modify: `app/src/event-editor/right-pane/search/VendorPdfSearchSection.tsx` (make `studyId` optional — remove the hard requirement)
- Test: `app/src/event-editor/right-pane/search/VendorPdfSearchSection.test.tsx` (+ new workflow-tab test)

**Step 1 — loosen `VendorPdfSearchSection`.** The `studyId` prop becomes optional. When absent, `ingestGraphLemurVendorPdf({ url, title, vendor, query })` is called without `studyId` — the server now writes the first-class `vendor-pdf` (Phase 2). Adjust `ingestError` messaging (the "no durable artifact" branch now means something different — it should surface server errors, not the old study-misconfig text). `onIngested(artifactId, info)` callback unchanged.

**Step 2 — workflow tab.** `VendorPdfWorkflowTab`:
- Renders `<VendorPdfSearchSection studyId={undefined} onIngested={refreshRecent} onBuildProtocol={...} />` (conditional spread; do NOT pass `studyId: undefined` — omit it per exactOptionalPropertyTypes).
- Below the search: a **Recent ingests** list = `listRecordsByKind('vendor-pdf')`, showing title + vendor + state + a "View" link and "Open in Protocol Builder" CTA.
- "Build Protocol" routes into the existing promote flow or `/protocol-builder` (per Q4).

**Verify:** `vendor-pdf` ingestion from `/ingestion/vendor-pdf` produces a record listed under Recent ingests; `npm run test -w app` passes.

**Commit:** `feat(ui): vendor-pdf ingestion workflow tab in Ingestion`

---

## Phase 5 — Run right-pane cleanup + contextual in-study ingest

**Objective:** Remove the vendor-PDF section from the run's "search" tab (it lives in Ingestion now); keep a link/CTA.

**Files**
- Modify: `app/src/event-editor/right-pane/search/SearchTabPanel.tsx` (remove `VendorPdfSearchSection` embed; add a "Ingest a vendor PDF →" link to `/ingestion/vendor-pdf`; keep local artifact lookup)
- Modify: `app/src/event-editor/right-pane/ai/AddSourceModal.tsx` (contextual in-study: now targets a first-class vendor-pdf + relationship link per Q2, or routes to Ingestion)
- Test: `app/src/event-editor/right-pane/search/SearchTabPanel.test.tsx`, `VendorPdfSearchSection.test.tsx`

**Step 1 — SearchTabPanel.** Remove the `<VendorPdfSearchSection ...>` block (lines ~136–151) and its `onBuildProtocol` wiring; replace with a small CTA linking to `/ingestion/vendor-pdf`. Update the empty-state hint text.

**Step 2 — AddSourceModal.** Per Decision 5: keep the "+ Add source" affordance, accepting an optional `studyId`. On successful ingest the backend writes a first-class `vendor-pdf` carrying `links.studyId` (the contextual link is part of the ingestion record). The modal passes `studyId` through to `VendorPdfSearchSection` as before; the server handles the `links.studyId` population. No additional `relationship` record is required for this case (Decision 5).

**Verify:** run right-pane "search" no longer embeds vendor-PDF search; local artifact lookup still works; `npm run test -w app` green.

**Commit:** `refactor(ui): vendor-PDF workflow moves to Ingestion; run search keeps local lookup`

---

## Phase 6 (follow-on) — PubMed ingestion tab

**Objective:** Second workflow in the Ingestion shell, proving the tabbed-workflow abstraction generalizes.

**Files**
- Create: `app/src/ingestion/PubmedWorkflowTab.tsx`
- Modify: `app/src/ingestion/IngestionPage.tsx` (register `pubmed` tab)
- Backend (new or existing): a `searchPubmed` + `ingestPubmedDocument` route + a first-class record kind (reuse `vendor-pdf`? No — a `literature`/`document`-derived kind or reuse extraction candidate). Decide in planning.

**Note:** This is deliberately deferred. Iteration 1 should NOT stub PubMed; leave the tab as a "coming soon" placeholder so the shell structure is testable without pretending a backend exists.

---

## Phase 7 (stretch) — Bring relationships to life

**Objective:** Implement the graph-link plumbing so "ownership is a function of the graph" (vendor-pdf ↔ study/run links, protocol ↔ run evidence).

**Files**
- Create: `server/src/api/handlers/RelationshipHandlers.ts` (POST /relationships)
- Modify: `server/src/api/routes.ts` (register POST)
- Modify: `app/src/shared/api/client.ts` (add `createRelationship`)
- Modify: `app/src/shell` / viewer to render relationship edges (optional)

**Why:** `GET /relationships` + index + client already exist; only create + UI surfacing is missing. This is the mechanism that lets the free-floating `vendor-pdf` (and labwide protocols like the PicoGreen DNA-quant example) be shared across projects.

---
## Milestone 1 progress (2026-08-02)

- **Phase 0/1 — DONE.** `vendor-pdf` schema (`schema/lab/vendor-pdf.schema.yaml`, free-floating, optional `links.studyId`, `source`/`file`/`extractedText` + candidate/protocol refs) registers (144 schemas) & validates with/without links. `PathConvention` `VPDF-` pattern; flat `records/vendor-pdf/` storage (no nesting). `kindMeta` label/category/search-bucket; Lab **Vendor PDFs** category + **"+ New PDF" → `/ingestion/vendor-pdf`**. Typecheck green (server+app); app collection tests pass.
- **Phase 2 — DONE.** `ingestGraphLemurPdf` ALWAYS persists a first-class `vendor-pdf` (even without studyId); adds `links.studyId` only when studyId provided; keeps legacy study-scoped `artifact` path for back-compat under `if (studyId && store)`. `recordedArtifact.studyId` now optional. 6/6 phase9 tests pass. Note: the Exa-text-fallback (blocked-binary) branch still writes only a study-scoped artifact — candidate to unify later.
- **PAUSED before Phase 3/4** per Brad: waiting on his tab-handling changes; will re-plan Ingestion destination (`/ingestion`) + vendor-PDF workflow tab after those land.
- **Phase 3 — DONE (2026-08-02).** Top-level **Ingestion** destination added: `GlobalNavbar` 5th nav item (Projects/Runs/Claims/Lab/**Ingestion**), `/ingestion` + `/ingestion/:tab` routes in `App.tsx`, new `app/src/ingestion/IngestionPage.tsx` (tabbed shell mirroring `/lab`: **Vendor PDFs** + **PubMed** tabs, active from `:tab`, default vendor-pdf) + CSS + tests. Tab bodies are placeholders; the actual vendor-PDF workflow fills them in Phase 4. App typecheck clean; 9/9 tests pass.
- **Phase 4 — DONE (2026-08-02).** Vendor-PDF workflow tab implemented. `VendorPdfSearchSection.studyId` is now **optional** (conditional spread — omitted in standalone use; server writes free-floating `vendor-pdf`). New `app/src/ingestion/VendorPdfWorkflowTab.tsx` (Exa search + ingest + **Recent ingests** list of `vendor-pdf` records with View → `/lab/vendor-pdfs/:id` and Open-in-Protocol-Builder → `/protocol-builder`). `IngestionPage` vendor-pdf tab now renders the workflow. App typecheck clean; 25 tests pass (6 files) including new workflow + no-studyId decoupling tests. NOTE: Phase 5 (remove vendor-PDF from run right-pane SearchTabPanel / AddSourceModal reflow) NOT done — still pending.
- **Phase 5 — DONE (2026-08-02).** Run right-pane `SearchTabPanel` no longer embeds the vendor-PDF section; it now shows a CTA "Ingest a vendor PDF…" → `/ingestion/vendor-pdf`. Removed now-unused imports; updated hint text; added CTA routing test. `AddSourceModal` (in-study "+ Add source") unchanged — passes `studyId` through; server keeps `links.studyId` on the first-class record (Decision 5). App typecheck clean; 26 tests pass (6 files).
- **CSS fix — DONE (2026-08-02).** `VendorPdfSearchSection` now imports its own `search.css` (previously only `SearchTabPanel` loaded it → unstyled in `/ingestion`); `search.css` also carries self-contained `right-panel__heading/error/hint` helpers for the standalone context.
- **Runtime — RESTARTED (2026-08-02).** `./start-app.sh` relaunched backend+frontend; the server now loads **144 schemas** incl. `vendor-pdf` and serves the Phase 2 ingest handler (resolves "no durable record written" caused by the stale pre-Phase-2 server). Milestone 1 (Phases 0/1–5) complete.
- **Follow-ons (not started):** Phase 6 PubMed tab; Phase 7 relationship create path; unify the Exa-text-fallback ingest branch to also write a `vendor-pdf`.

---

- Backend: `npm run typecheck -w server` && `npm run test:run -w server`
- Frontend: `npm run typecheck -w app` && `npm run test -w app`
- Manual smoke: `/ingestion/vendor-pdf` ingest → first-class record appears in Recent ingests + universal search (`Find anything…`); a run's search tab links out; vendor-pdf record opens in viewer.
- Schema: verify the new schema loads with ALL schemas in Ajv before runtime (allOf `FAIRCommon` chain — see JSON Schema Debugging pitfalls). `vendor-pdf` uses vocabulary-free lifecycle fields (`state`), NOT `lifecycleId` (it is not a material) — do not spread material lifecycle helpers.

## Risks / tradeoffs
- **Backward-compat with study-scoped `artifact` ingest:** existing callers (in-run, AI tab) must be migrated or kept behind an explicit `studyId`. Risk of regressions if the legacy path is removed outright → default: keep both, migrate UI callers.
- **Tree visibility:** `getStudyTree()` still renders runs strictly nested; a free-floating vendor-pdf is NOT a run so it is unaffected, but multi-project runs remain a separate concern (Phase 3 of the earlier flattening report — out of scope here).
- **ExactOptionalPropertyTypes:** never pass `studyId: undefined` — use conditional spread / omit the field.
- **Monolithic `LabCollectionView`:** NOT touched here (Ingestion is its own destination). If Q1 adds a `/lab/vendor-pdfs` records category later, that needs the embedded-category refactor — deferred.
- **schema count:** adding a schema changes the "141 schemas" baseline; ensure `loadAllSchemas` picks it up (recursive) and topology resolves the `./common.schema.yaml` + `./datatypes/*` refs.
