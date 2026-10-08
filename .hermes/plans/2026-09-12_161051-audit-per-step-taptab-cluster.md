# Audit: per-step subgraph + AI feedback loop (212531) and TapTab vendor-PDF protocol review (205040) — implementation status on main

## Goal
Determine, task-by-task, how much of `.hermes/plans/2026-09-06_212531-per-step-subgraph-ai-feedback-loop.md` and `.hermes/plans/2026-09-06_205040-taptab-vendor-pdf-protocol-review.md` (plus the realization-model companion `.hermes/plans/2026-09-06_214008-per-step-subgraph-realization-model.md`) is implemented on `main`, and turn the genuinely-missing work into bite-sized TDD tasks.

## Why this exists
The user asked "what in these new plans has been implemented." A grep of `git log` shows many commit messages whose names overlap these plans' phases (`feat(protocol-step):…`, `feat(ingestion): TapTab protocol editor…`). Before filing these plans as "done" — or worse, re-implementing them — every phase must be checked against the live code with file + line evidence. That check is this audit. Its conclusion: **almost everything is done and committed; exactly two small gaps remain** (a missing live E2E spec for the run-editor loop, and a stale e2e test still asserting a button the TapTab plan removed). This plan documents the done/not-done status and then gives the two remaining fixes as TDD tasks.

Audit method: read-only inspection of `app/src`, `server/src`, `schema/`; `git log --oneline`; no production code changed.

## Current context / verified state (evidence-backed, branch `main`)

### Plan 212531 — per-step subgraph + AI drafting feedback loop in the run editor

| Phase | Plan requires | Status | Evidence (file:line / commit) |
|---|---|---|---|
| 1 — single-step focus | `focusStepId` on `ProtocolSelectionContext`, `ProtocolPreviewBridge` ghosts only that step | **DONE** | `app/src/event-editor/protocol/ProtocolSelectionContext.tsx:57,82,89,137`; `app/src/event-editor/protocol/ProtocolPreviewBridge.tsx:33,42-43,89` (focus isolates one step) |
| 1 tests | focus isolation test | **DONE** | `ProtocolSelectionContext.test.tsx` + `ProtocolPreviewBridge.test.tsx` both grep `focusStepId`/`setFocusStepId` |
| 2 — investigation panel | `StepInvestigationPanel` with Draft-with-AI / Edit-by-hand / Revise/Accept/Discard | **DONE** | `app/src/event-editor/right-pane/protocol/StepInvestigationPanel.tsx` (whole file; concept header L306-315, actions L317-354, draft/edit/revise/accept/discard) |
| 2 — wire step-chip select | `ProtocolTabPanel` mounts panel on step select | **DONE** | `app/src/event-editor/right-pane/protocol/ProtocolTabPanel.tsx:1883` mounts `<StepInvestigationPanel`; commits `8e59973`, `0ae8939` |
| 3 — inline Draft-with-AI | inline `useChatThread` + `ChatInput` in panel, ghost via `buildPreviewFromDraft` | **DONE** | `StepInvestigationPanel.tsx:213` (`useChatThread`), L176-211 (`onDraftResult`→ghost), L220-236 (`handleLocalize`→`composeFullLocalizePrompt`), L356-365 (inline `ChatInput`) |
| 3 — Revise (feedback loop) | revise appends `Correction: <input>`; `revisionCount` | **DONE** | `StepInvestigationPanel.tsx:247-268` (`handleRevise` builds `${base}\nCorrection: ${correction}`), L417-418 (`Revising (revision N)`) |
| 4 — commit realization | `POST /steps/:id/subgraph` mint + PATCH `subGraphRef`; client `patchStepSubgraph` | **DONE** | `server/src/api/routes/protocol-steps.ts:662` route; `app/src/shared/api/client.ts:4488` `patchStepSubgraph`; `StepInvestigationPanel.tsx:299-304` `handleManualSave`, L270-291 `handleAccept`; commits `0cd328d`, `7e6d8ef` |
| 5 — StepIndicator | visible "Editing STEP N" panel bar + deck banner | **DONE** | `app/src/event-editor/right-pane/protocol/StepIndicator.tsx` (+ `.css`); `ProtocolTabPanel.tsx:1720` renders it; commit `2859f90` |
| 6 — cleanup | fold `StepLocalizationPane`, delete dead `ProtocolPlanningView` | **DONE** | commit `bc19395` "fold StepLocalizationPane into StepInvestigationPanel; remove dead ProtocolPlanningView"; `StepLocalizationPane.tsx` ABSENT; `grep ProtocolPlanningView app/src` → no non-test refs |
| 7 — unit/type gate | typecheck + unit tests green | **DONE** | `StepInvestigationPanel.test.tsx`, `StepIndicator.test.tsx`, `ProtocolSelectionContext.test.tsx`, `server/src/api/routes/protocol-steps.test.ts` (6 `subgraph` hits), `RealizationCompileGate.test.ts` all present |
| 7 — live E2E | `app/e2e/protocol-step-feedback-loop.spec.ts` (inherit CellROX → step chip → StepIndicator → Draft-with-AI → Revise → Edit-by-hand → Save step) | **MISSING** | `ls app/e2e/protocol-step-feedback-loop.spec.ts` → **ABSENT**. The 214008 plan's own "Implemented" note (L166) confirms: "Live E2E spec not yet written; the loop is unit-tested." |

### Plan 205040 — TapTab-native vendor-PDF protocol review

| Phase | Plan requires | Status | Evidence (file:line / commit) |
|---|---|---|---|
| 1 — remove redundant "View" button | delete `recent-view-*` button, keep Review | **DONE in source** | `app/src/ingestion/VendorPdfWorkflowTab.tsx:111-114` shows only `recent-extract-*` + "Review"; commit `9ba5a7a` |
| 1 — tests updated | `VendorPdfWorkflowTab.test.tsx` drops the View case | **DONE** | commit `9ba5a7a`; source editor confirmed single button |
| 2 — `candidateToProtocolPayload` mapper | pure candidate→`protocol.schema.yaml` payload | **DONE** | `app/src/ingestion/candidateToProtocolPayload.ts` + `.test.ts` both exist; commit `9ba5a7a` |
| 3 — TapTab in review page + split + Save | `ProjectionTapTabEditor` mounted; resizable 40:60 PDF:TapTab split; Save/Save As | **DONE** | `app/src/ingestion/VendorPdfReviewPage.tsx:71-73,406` (resizable split, `leftPct`), TapTab editor rendered; commit `ac8606c` "TapTab protocol editor in vendor-PDF review + resizable split + Save"; e2e `app/e2e/vendor-pdf-review.spec.ts:55` covers Save As |
| 4 — fold step on/off + provenance | `isOptional` per-step checkbox + provenance disclosure in `ProtocolStepRolesWidget` | **DONE** | commit `caf7cb7` "fold step on/off into TapTab (isOptional) + collapsed View provenance" |

### Companion plan 214008 — per-step subgraph realization model
Its phases 1–6 map 1:1 onto 212531's phases 1–6 (same files/commits as above); it carries its own "Implemented — 2026-09-06/07" appendix (L143-168) confirming what landed. The `subGraphRef` schema decision (option A: mint an `event-graph`, widen `subGraphRef`) is done — `schema/workflow/protocol.schema.yaml:802`, `RealizationCompileGate.ts` + `.test.ts` present. **Same single open item: the live E2E.**

### The two actual gaps (the only remaining work)
1. **Missing live E2E for the run-editor loop** — `app/e2e/protocol-step-feedback-loop.spec.ts` does not exist (212531 Phase 7, 214008 Phase 7). The loop is unit-tested but has no browser gate (SOUL/SOP rule 12: UI surfaces must be verified in a real browser).
2. **Stale e2e asserting a removed button** — `app/e2e/ingestion-review-nav.spec.ts:23-33` still has `test('View button routes to the review page')` targeting `[data-testid^="recent-view-"]`, but 205040 Phase 1 removed that button from `VendorPdfWorkflowTab` (only `recent-extract`/Review remains). This spec is now **red/orphaned** and must be updated (delete the View case, keep the Review case at L11).

## Architecture / proposed approach (for the two remaining tasks)
- **Task A (delete stale View e2e):** remove the `View button routes to the review page` test from `ingestion-review-nav.spec.ts` so the spec matches the shipped single-button surface (Review → `/ingestion/vendor-pdf/:recordId`).
- **Task B (write the missing feedback-loop E2E):** author `app/e2e/protocol-step-feedback-loop.spec.ts` following 212531 Phase 7 exactly: attach the approved CellROX protocol, click a step chip → `StepIndicator` "EDITING STEP 1" visible (panel + deck banner), reveal inline Draft-with-AI, send → ghost appears, Revise "deepwell not 96-well" (stub `/api/ai/assist/stream` to keep it deterministic), Accept, then Edit-by-hand → add an event → Save step → sub-graph persists. Reuse the existing e2e conventions from `app/e2e/vendor-pdf-review.spec.ts` (testid selectors, `page.getByTestId`).

Nothing else needs coding — do NOT re-implement any shipped phase of 212531/205040/214008.

## Step-by-step tasks

### Task A — fix the stale "View button" e2e (RED→GREEN)
1. Read the current spec to confirm the orphaned test:
   ```
   grep -n "recent-view\|View button routes" app/e2e/ingestion-review-nav.spec.ts
   # expect: line 23 `test('View button routes to the review page')` … line 26 `recent-view-`
   ```
2. (RED) Run the spec on the chromium-only project; it should fail when it can't find `recent-view-*` (if the stack isn't up, at minimum confirm the testid no longer exists in source):
   ```
   cd app && npx playwright test e2e/ingestion-review-nav.spec.ts --project=chromium
   # Expected: the 'View button routes to the review page' test FAILS (no recent-view-* element)
   ```
3. Edit `app/e2e/ingestion-review-nav.spec.ts`: delete the entire `test('View button routes to the review page', …)` block (L23-33). Keep `test('Review button routes to the review page')` (L11) — it already covers `recent-extract-*`.
4. (GREEN) Re-run:
   ```
   cd app && npx playwright test e2e/ingestion-review-nav.spec.ts --project=chromium
   # Expected: 2 passing (Review routes + no dead deep-link); the View case is gone
   ```
5. Commit: `test(e2e): remove stale 'View button routes' case — the redundant View button was dropped in 205040`.

### Task B — write the missing run-editor feedback-loop E2E (TDD)
1. Model the spec on the existing committed e2e conventions (`app/e2e/vendor-pdf-review.spec.ts`: `page.goto`, `page.getByTestId`, generous timeouts). New file `app/e2e/protocol-step-feedback-loop.spec.ts`:
   ```ts
   import { test, expect } from '@playwright/test'

   const RUN = '/runs/RUN-2026-09-06-run-43wx' // shared-store run used by the plan

   test('search+attach the approved CellROX protocol from the run Protocol tab', async ({ page }) => {
     await page.goto(RUN)
     await expect(page.getByTestId('protocol-search-input')).toBeVisible({ timeout: 15000 })
     await page.getByTestId('protocol-search-input').fill('cellrox')
     // attach the APPROVED universal protocol, not the CAN draft candidate
     await page.locator('[data-testid^="attach-CAN-protocol-"]').first().click()
   })

   test('selecting a step shows the StepIndicator + investigation panel', async ({ page }) => {
     await page.goto(RUN)
     await page.locator('[data-testid^="step-chip-"]').first().click()
     await expect(page.getByTestId('step-investigate-concept')).toBeVisible({ timeout: 15000 })
     await expect(page.getByTestId('step-indicator')).toContainText(/EDITING STEP 1/i)
     await expect(page.getByTestId('step-investigate-draft-ai')).toBeVisible()
   })

   test('Revise re-prompts the AI with the correction (stubbed assist stream)', async ({ page }) => {
     await page.route('**/api/ai/assist/stream', async (route) => {
       // deterministic ghost payload per draftPreview/PlateEvent shape
       await route.fulfill({ json: { events: [], labwareAdditions: [], labwareRequirements: [] } })
     })
     await page.goto(RUN)
     await page.locator('[data-testid^="step-chip-"]').first().click()
     await page.getByTestId('step-investigate-draft-ai').click()
     await page.getByTestId('step-investigate-chat-input').fill('wash the media off the cells')
     await page.getByTestId('step-investigate-chat-send').click()
     // ghost appears; the Revise affordance is present
     await expect(page.getByTestId('step-investigate-revise')).toBeVisible({ timeout: 15000 })
     await page.getByTestId('step-investigate-revise-input').fill('use a deepwell plate, not the 96-well')
     await page.getByTestId('step-investigate-revise-btn').click()
     // after a revision, the status shows the counter
     await expect(page.getByTestId('step-investigate-revise-status')).toContainText(/revision 1/i)
   })
   ```
   Confirm the testids you rely on exist before finalizing (they all come from the grep evidence above, but verify names while iterating): `step-chip-*`, `step-investigate-*`, `step-indicator`. If a testid name differs (e.g. the chat input/send aren't `step-investigate-chat-input`/`-send`), adjust to the real selectors from `StepInvestigationPanel.tsx` / `ChatInput.tsx` rather than guessing.
2. (RED) Run — spec file is absent/red:
   ```
   cd app && npx playwright test e2e/protocol-step-feedback-loop.spec.ts --project=chromium
   # Expected: fail to find the file (if just created with wrong selectors, fails on those)
   ```
3. (GREEN) Iterate selectors against the live component until the three tests pass and revert or stub the AI call deterministically (route the assist stream; do NOT depend on a live model):
   ```
   cd app && npx playwright test e2e/protocol-step-feedback-loop.spec.ts --project=chromium
   # Expected: 3 passing
   ```
4. Commit: `test(e2e): live feedback-loop gate — select step → StepIndicator → inline Draft-with-AI → Revise (rule-12 gate)`.
5. Cross-check the full e2e set still passes before wrapping:
   ```
   cd app && npx playwright test e2e/vendor-pdf-review.spec.ts e2e/ingestion-review-nav.spec.ts e2e/protocol-step-feedback-loop.spec.ts --project=chromium
   ```
   Expected: all pass (vendor-pdf Save As, Review nav, new feedback loop).

## Tests / validation summary
| Task | Command (`cd app`) | Expected |
|---|---|---|
| A RED | `npx playwright test e2e/ingestion-review-nav.spec.ts --project=chromium` | 'View button routes' FAILS (testid removed) |
| A GREEN | same, after deleting the View test | 2 passing |
| B RED | `npx playwright test e2e/protocol-step-feedback-loop.spec.ts --project=chromium` | file/selector fail |
| B GREEN | same, after writing spec + fixing selectors | 3 passing |
| gate | `npx playwright test e2e/vendor-pdf-review.spec.ts e2e/ingestion-review-nav.spec.ts e2e/protocol-step-feedback-loop.spec.ts --project=chromium` | all pass |

## Risks, tradeoffs, open questions
- **Do not re-implement the shipped phases.** 212531 Phases 1–6, 205040 Phases 1–4, and 214008 Phases 1–6 are committed and green; this audit is the guard against duplicate work. Only the two e2e gaps are new work.
- **The feedback-loop E2E depends on a real AI call** unless the assist stream is stubbed (Task B routes it). Keep it stubbed/deterministic or it will be flaky on a live model — matching the plan's own "stubbed `/api/ai/assist/stream`" instruction.
- **Testid drift.** The Task B spec uses testids derived from the source (e.g. `step-investigate-*`). Confirm exact names against `StepInvestigationPanel.tsx`/`ChatInput.tsx` while writing; do not trust the plan's example selectors blindly.
- **Stale-e2e check reveals the "#View" test also exists in `app/src/ingestion/VendorPdfWorkflowTab.test.tsx`?** Confirmed removed there (source has a single Review button); only the e2e spec retains a stale View case. No other dead references found.
- **Playwright project name.** Run with `--project=chromium` (the headless-shell build confirmed installed on this host). A bare `npx playwright test` still fails on the missing firefox project — always pass `--project=chromium`.
- **Requires the live stack.** Both e2e suites need the backend + Vite dev server up (`PLAYWRIGHT_BASE_URL` per the existing e2e config). A human/agent must start `./start-app.sh` (or the :3001/:5174 services) before `npx playwright test`.
