# Vendor-PDF review: Save/Save As semantics + run-tab approved-only protocols

## Goal
(1) Save As prompts a modal pre-loaded with the real protocol title so the user can overwrite it; (2) Save = accept the current version with the real title, promoted to a usable protocol (state=approved); (3) the run editor's Protocol tab shows only approved protocol candidates (not the raw extraction drafts).

## Verified facts (read today)
- `VendorPdfReviewPage.tsx` `handleSave`/`handleSaveAs` (lines 231-273): both just `createRecord` with a `PRT-${shortId()}` id. No title modal, no status setting, no "promote" distinction.
- `candidateToProtocolPayload` sets the title from the candidate + `normalizeProtocolPayload` already coerces prose to strings (the earlier `/notes` bug — already fixed).
- Protocol `state` field (schema line 86-90): `draft | in_review | approved | effective | superseded | archived | accepted | deprecated`. Raw extraction drafts should stay `draft`; a saved protocol should be `approved`.
- Run-editor Protocol tab (`ProtocolSelector.tsx` lines 65-71) shows `projectProtocols`/`labProtocols` from `context.availableProtocols`/`projectTemplates` with no state filter. `ProtocolContextService.getProtocolContext` (server line 140-196) builds these without filtering by `state`.

## Changes

### 1. Save As modal
- Add `saveAsOpen` + `saveAsTitle` state; `handleSaveAs` opens the modal with `protocolPayload.title` pre-loaded; modal has an input (title) + "Save As" confirm. On confirm, `createRecord` with the new title + fresh `PRT-*` id + `state: 'approved'`.

### 2. Save = accept/promote
- `handleSave`: `createRecord` (or `updateRecord` if `savedRecordId`) with `state: 'approved'` and the real title (unchanged). No random id — keep a stable id via `savedRecordId` or reuse the record's own id ordering.

### 3. Run tab approved-only
- `ProtocolSelector.tsx`: filter `projectProtocols` and `labProtocols` to `payload?.state === 'approved'` (or `effective`/`accepted`). Simplest: add an `approvedProtocol(p)` predicate.
- `ProtocolContextService.ts`: also filter server-side so the API returns only approved protocols for the run tab (belt and suspenders; keeps the selector honest).

## Tasks (TDD per change)

### Task A — Save As modal (app)
File: `app/src/ingestion/VendorPdfReviewPage.tsx`. Add state + modal + a `data-testid="vpdf-saveas-modal"` + `vpdf-saveas-title` input. On confirm, run the save. Test: render with a fake payload, click "Save As", assert modal appears pre-loaded with the title; type a new title, click confirm, assert `createRecord` called with the new title + `state:'approved'`.

### Task B — Save promotes (app)
File: `app/src/ingestion/VendorPdfReviewPage.tsx`. `handleSave` passes `state:'approved'`. Test: assert `createRecord`/`updateRecord` called with `state:'approved'`.

### Task C — Run tab approved-only (app + server)
- `app/src/event-editor/right-pane/protocol/ProtocolSelector.tsx`: predicate `(p) => ['approved','effective','accepted','superseded'].includes(p.payload?.state)` for both protocol groups. Test: a `state:'draft'` protocol is excluded; `state:'approved'` included.
- `server/src/protocol/ProtocolContextService.ts`: filter `filteredProtocols`/`filteredLocalProtocols` for the run-tab sources to the approved set. Test: `getProtocolContext` returns approved only.

## Verify with Playwright
- `app/e2e/vendor-pdf-save.spec.ts` (new): open the CellROX review → Extract → Save As → modal pre-loaded title → enter new title → confirm → assert a `PRT-*` approved protocol exists (via API) and the run tab lists only approved protocols.
- Run: `cd app && npx playwright test e2e/vendor-pdf-save.spec.ts --config=playwright.config.ts`

## Risks
- The run tab already has attached-run methods (planned-run/event-graph) which have no `state` — those still show; only the *protocol candidates* get the approved filter.
- Older/draft protocols already in the store (e.g. `CAN-protocol-*`) will vanish from the run tab until approved — acceptable, intended.