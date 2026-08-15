# Vendor PDF → Universal Protocol: Activate + Test the Extraction Pipeline

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Close the loop by activating and testing the largely pre-existing PDF → universal-`protocol` pipeline from a first-class `vendor-pdf` record. The missing work is a small backend bridge (vendor-pdf candidate → `extraction-draft` → promote) plus a UI entry point; the LLM extraction, the promotion-compile engine, and the canonical-protocol emission already exist and are unit-tested.

**Architecture (two-stage model):** Each acquired vendor PDF progresses through three stages, each a distinct object/surface:
1. **Acquire** → a first-class `vendor-pdf` record (DONE in Milestone 1).
2. **Extract → Universal Protocol** (THIS plan) → LLM pulls steps/materials/labware into a `ProtocolCandidate`, then a human reviews & promotes it into a canonical universal `protocol` (`protocolLayer: universal`, `source.type: vendor`).
3. **Localize** (DEFERRED, separate session) → bind the universal protocol's abstract roles to concrete labware/local materials/instruments per experiment — a per-step model back-and-forth that likely lives on the event-editor. Touchpoints are documented below.

**Tech Stack:** Fastify + TS (server/), React + Vite + TS (app/), YAML JSON-Schema (validation), compile-pipeline engine (server/src/compiler), Vitest.

---

## Current pipeline map (verified — what already works)

- **LLM extraction:** `server/src/ingestion/vendor-protocol/VendorProtocolCandidateService.ts` `extractVendorProtocolCandidateFromInput()` → decodes PDF (`decodeVendorProtocolPdf`), LLM-extracts → `ProtocolCandidate` (`schema/workflow/vendor-protocol-candidate.schema.yaml`: steps/materials/labware/equipment/tables/sections/diagnostics), persisted to `artifacts/foundry/protocol-candidates/<documentId>.json` (workspace JSON, NOT a record).
- **First-class `vendor-pdf`:** ingest (Phase 2) stores `vendorProtocolCandidateRef: { type:'vendor-protocol-candidate', id: documentId }` pointing at that JSON + its own `extractedText`.
- **Official promotion:** `server/src/protocol/ProtocolExtractionService.ts` — `extractDraftFromEventGraph()` (403-474) creates an `extraction-draft` (XDR-) record; `promoteDraft()` (490-631) runs the `promotion-compile` pipeline (`PromotionCompileRunner.ts`) → canonical `protocol` + `extraction-promotion` audit. Endpoints `POST /extraction/protocols/draft` + `POST /extraction/protocols/:draftId/promote` (routes.ts:789-790; ProtocolHandlers.ts:250-328). Output protocol: `protocolLayer:'universal'`, `state:'draft'`, `source.type:'vendor'`, `steps[]`, `roles{}`; **no `localProtocolRef`** (localization deferred).
- **Review UI:** `app/src/extraction/ExtractionReviewPage.tsx` (per-candidate Promote/Reject → canonical record). `app/src/extraction/ExtractionDraftsListPage.tsx` (list + inline PDF upload).
- **Bypass path (exists but skips audit):** `app/src/event-editor/viewer/pdf/ConvertToProtocolModal.tsx` creates a protocol directly via `createRecord` (artifact→protocol, preview but no editing, project/lab scope selector).

## WHAT'S MISSING (the actual gaps)

| Gap | Impact |
|-----|--------|
| No endpoint builds an `extraction-draft` **from a vendor-pdf** (the draft endpoint today takes an `eventGraphId`). | 🔴 The candidate JSON is orphaned; review/promote can't start from a vendor-pdf. |
| `VendorPdfWorkflowTab` "Open in Protocol Builder" passes **no data**. | 🔴 Redundant work; user re-pastes/URLs from scratch. |
| `ConvertToProtocolModal` bypasses the `extraction-draft` → `promotion-compile` audit trail. | 🟡 Two divergent "make a protocol" paths. |
| Candidate is a workspace JSON, not first-class. | 🟢 Durable candidate can't be indexed/re-listed/re-reviewed. |

---

## PLACEMENT DECISION (answers "another tab under ingestion?")

**Recommendation: do NOT add a new tab under `/ingestion` for extraction here.** Ingestion tabs are *acquisition sources* (vendor-pdf, pubmed — "bring a document in"). Turning a source into a universal protocol is a *per-record transform* with human review, not a source type. Instead:

- The **vendor-PDF workflow tab** gets a per-row **"Extract Protocol"** action (next to View / Open in Protocol Builder). Clicking it creates the `extraction-draft` and routes to the extraction **review** surface.
- Reuse the existing **`ExtractionReviewPage`** (`/extraction/review/:draftId`) for Stage-2 review (candidate confidence, promote/reject) — it already produces the canonical universal protocol with an audit trail.
- Add a small **review-queue affordance** so pending vendor-PDF extractions are visible (either filter `VendorPdfWorkflowTab` Recent ingests by `state`, or a link to `/extraction`).

This respects the two-pane convention (no third pane) and the "acquisition ≠ transform" distinction. If you later want a dedicated surface with step-level editing + LLM redraft feedback, that belongs on the review surface (Phase A5, optional), not as an ingestion tab.

---

## Phase A1 — Backend bridge: draft an extraction-draft from a vendor-pdf

**Objective:** Add an endpoint `POST /extraction/vendor-pdfs/:vendorPdfId/draft` that wraps a vendor-pdf's existing `ProtocolCandidate` into an `extraction-draft` (XDR-) record, ready for review+promote — no repeat LLM call.

**Files**
- Create: `server/src/api/handlers/VendorPdfExtractionHandlers.ts`
- Create: `server/src/protocol/VendorPdfExtractionService.ts` (new service)
- Modify: `server/src/api/routes.ts` (register route)
- Test: `server/src/protocol/VendorPdfExtractionService.test.ts`, `server/src/api/handlers/VendorPdfExtractionHandlers.test.ts`
- Reference: `server/src/protocol/ProtocolExtractionService.ts` (`extractDraftFromEventGraph` pattern; generalize to accept a `ProtocolCandidate` instead of `eventGraphId`)

**Step 1 — Service (TDD).** `createDraftFromVendorPdf(vendorPdfId)`:
- Load `vendor-pdf` record; read `extractedText` + `vendorProtocolCandidateRef.id` (the candidate JSON key).
- Load the candidate from `artifacts/foundry/protocol-candidates/<documentId>.json`; if missing, re-extract from the vendor-pdf's `extractedText` via `extractVendorProtocolCandidateFromInput`-style text path.
- Build an `extraction-draft` record (`kind:'extraction-draft'`, `recordId: XDR-…`, `target_kind:'protocol'`, `candidates:[{ target_kind:'protocol', confidence, draft: candidate }]`, `source_artifact:{ kind:'vendor-pdf', id: vendorPdfId }`, `status:'pending_review'`), persist via `store.create`. Return `draftId`.
- Write failing test first: given a vendor-pdf record + candidate JSON, it returns an XDR- id and the draft record is queryable.

**Step 2 — Handler + route.** `POST /extraction/vendor-pdfs/:vendorPdfId/draft` → `{ success, draftId, candidateCount }`. Mirror `ProtocolHandlers.ts:250-328` error handling (404 if vendor-pdf missing).

**Step 3 — Verify.** `npm run typecheck -w server`; `npx vitest run src/protocol/VendorPdfExtractionService.test.ts src/api/handlers/VendorPdfExtractionHandlers.test.ts`.

**Commit:** `feat(server): draft extraction from a first-class vendor-pdf`

## Phase A2 — Frontend: "Extract Protocol" → review → promote

**Objective:** Give the vendor-PDF workflow tab a per-row "Extract Protocol" action that drafts and routes to the existing review page.

**Files**
- Modify: `app/src/ingestion/VendorPdfWorkflowTab.tsx`
- Modify: `app/src/extraction/ExtractionReviewPage.tsx` (accept `source_artifact.kind === 'vendor-pdf'`; show vendor-pdf id + candidate `draft` incl. steps; already promotes to `protocol`)
- Modify: `app/src/shared/api/client.ts` (add `createVendorPdfExtractionDraft(vendorPdfId)`)

**Step 1 — Client method.** `createVendorPdfExtractionDraft` → `POST /api/extraction/vendor-pdfs/:id/draft`, returns `{ draftId }`.

**Step 2 — Workflow tab action.** In `VendorPdfWorkflowTab.tsx` add an "Extract Protocol" button per recent row (disabled while drafting). On success `navigate('/extraction/review/'+draftId)`. Update tests.

**Step 3 — Review page.** Confirm `ExtractionReviewPage` renders a vendor-pdf-sourced draft and its candidate steps; Promote → canonical universal protocol. Adjust `CandidateTapTabSurface` fallback if the `protocol` draft keys don't map to a slot projection (likely fine — `protocol` is a known target kind).

**Step 4 — Verify.** `npm run typecheck -w app`; `npx vitest run src/ingestion src/extraction`.

**Commit:** `feat(ui): wire vendor-pdf → extraction review`

## Phase A3 — End-to-end activation test

**Objective:** Prove the loop works from a real ingest through to a canonical universal protocol.

- **Manual smoke:** ingest a vendor PDF in `/ingestion/vendor-pdf` → row appears → "Extract Protocol" → `/extraction/review/:draftId` → Promote → confirm a `protocol` record exists with `protocolLayer:'universal'`, `source.type:'vendor'`, populated `steps`/`roles`.
- **Verify output:** `curl /api/records?kind=protocol` then read the new record; assert it carries the extraction-promotion audit id.
- **Backend log:** confirm `Loaded 144 schemas` (vendor-pdf already there) and no validation errors during `store.create`.
- Fix any promotion-compile incompatibility between the `ProtocolCandidate` shape and the `promotion-compile.yaml` expectations (this is the main pre-existing risk — the compile pass was built for event-graph drafts).

## Phase A4 (stretch, recommended soon) — Make the candidate first-class

- Add `schema/workflow/vendor-protocol-candidate.schema.yaml` to the record registry (`record.schema.yaml` union) + `PathConvention` flat storage `records/vendor-protocol-candidate/`; have ingest write the candidate as a record instead of (or in addition to) the workspace JSON; drop `source_artifact` self-ref in favor of a `vendor-pdf` link. Makes the candidate durable, indexable, re-reviewable, and eliminates the "orphaned JSON" gap.
- Do this only after A1–A3 pass with the JSON candidate, to keep the activation path simple.

## Phase A5 (optional) — Rich review / redraft feedback

- If "user feedback" means more than promote/reject, add an LLM **redraft** loop to the vendor extraction review (feedback → re-run extraction → replace candidate), reusing the `/protocol-builder` `redraft`/`FeedbackChat` pattern. Kept optional — the existing review page's promote/reject may be enough to close the loop initially.

---

## LOCALIZATION — DEFERRED (documented, out of scope this session)

This is the second, larger task (per-step binding to concrete labware/materials/instruments/variations with model back-and-forth). It is intentionally NOT in Milestone scope. Touchpoints already present and correct for it:
- `protocol.schema.yaml`: `protocolLayer:'universal'|'local'`, `roles{labwareRoles,materialRoles,instrumentRoles}`, `parameters[]`, `localProtocolRef` on `local-protocol.schema.yaml`.
- `run.schema.yaml`: `localProtocolRef` — a run links to its localized protocol.
- `server/src/api/handlers/ProtocolHandlers.ts:445-487` `POST /protocols/:id/bind` (roles → PlannedRun); `POST /protocol-actions/specialize-for-experiment` (universal → local-protocol for an experiment).
- **UI home:** `event-editor` (deep link from a universal protocol's roles to a deck/event-graph; per-step instrument/material binding on the event graph). This is where the "per-step back-and-forth with the model" is most natural — the event-editor already hosts the deck, labware, and deviation surfaces.
- **Future session:** "Universal protocol → Localized protocol → Run" planning using the bind/specialize paths above, with the event-editor as the localization surface.

---

## Cross-cutting validation
- Backend: `npm run typecheck -w server` && `npm run test:run -w server`
- Frontend: `npm run typecheck -w app` && `npm run test -w app`
- Manual e2e (Phase A3): ingest → draft → review → promote → verify universal `protocol` (source.type=vendor) + audit record.
- exactOptionalPropertyTypes: when building the extraction-draft / vendor-pdf links, omit absent fields (never `undefined`).
- Schema: if Phase A4 promotes a new record kind, re-run the Ajv all-schemas probe (expect 145).

## Risks / tradeoffs / open questions
- **Main risk:** `promotion-compile.yaml` may not accept a `ProtocolCandidate`-shaped draft (built/tested against event-graph drafts). Mitigate in A1 by mapping the candidate into the extractor-draft shape the compile pass expects; verify in A3.
- **Two divergent "make a protocol" paths** (extraction-draft→promote vs `ConvertToProtocolModal` direct-create). Recommend unifying on extraction-draft→promote for consistency + audit; keep the modal's project/lab scope selector as a field on the draft.
- **Open Q1 (placement):** OK to keep extraction as a per-vendor-pdf action + existing review page (recommended), or do you want a dedicated review/feedback surface that we build in A5?
- **Open Q2 (feedback depth):** Is promote/reject enough to close the loop initially, or do you need the LLM redraft feedback loop before we call it done?
- **Open Q3 (data flow):** Reuse the candidate already extracted at ingest (recommended, no repeat LLM cost) vs. always re-extract from `vendor-pdf.extractedText` on draft? Reuse unless the JSON is missing.
