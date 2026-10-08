# Slim the run-editor Protocol tab to search + attach + run/specify steps

## Goal
Reduce the event editor's **Protocol** right-pane tab (`ProtocolTabPanel`) so it does exactly three jobs — find+a protocol, attach it to the run, and run/see/specify that run's steps — and move the **high-level "human-language-from-PDF" protocol authoring** (one-shot universal→local chat localization, per-step language localization with editable step text) off the run editor and onto the ingestion surface, where the TapTab protocol editor is being built.

## Current context / assumptions (verified by reading the code today)
- **`ProtocolTabPanel` is enormous (1823 lines)** and does too much in one right-pane tab (`app/src/event-editor/right-pane/protocol/ProtocolTabPanel.tsx`, mounted by `RightPane.tsx:89` when `rightPaneMode === 'protocol'`). It renders, top-to-bottom (lines ~1620-1800):
  1. `RunHeader` (run name/operator/mode/Play All)
  2. "Change protocol" button → re-opens `ProtocolSelector`
  3. **`<details>` one-shot `ProtocolLocalizationThread`** (lines 1663-1676) — chat-first universal→local localization with branch questions (open by default whenever a universal protocol is attached)
  4. **Plate-setup editing** `SetupSectionWidget`s "This assay needs" (lines 1684-1721) incl. an auto-specialize effect that drafts/patches a local-protocol record
  5. `BranchPicker` (line 1725)
  6. **Step chips** (line 1727-1784): `StepChip` with visibility toggle, Play, settings (`SettingsPanel`), and an **inline per-step `StepLocalizationPane`** (EditableProtocolText title + full step text + AI "Localize Step" + Accept/Discard + Save-to-corpus) — this is the high-level human-language-from-PDF editing that belongs on ingestion
  7. `StepExecutionModal`
- **Search/attach already exists and is the right shape** but is gated behind the no-protocol / change-protocol branch (`ProtocolSelector.tsx`, mounted ~line 1560): it already has the **server-backed `q` search** (`ProtocolContextService` + `getProtocolContext({q})` → `availableProtocols` filtered by title/recordId/steps/humanStepsText) plus an **Ingested PDFs** group (`context.ingestedPdfs`, Open-not-Attach). The "better search tool" from the 145500 plan IS implemented; it just reads as unchanged because it only appears when no protocol is attached and the one-shot localization chat dominates the attached view.
- **The per-step subgraph work the user wants to KEEP** is `fetchStepGraph` (`ProtocolTabPanel.tsx:1358` → `GET /api/protocols/{runId}/steps/{stepId}/graph`), `StepChip`'s visibility toggle + Play, `SettingsPanel`, and `StepExecutionModal`. This is "run/specify steps." Keep it.
- **The high-level human-language authoring to MOVE is** `ProtocolLocalizationThread` (the whole one-shot localize-in-chat) and `StepLocalizationPane`'s editable step title/full text + AI language localization. These read/write the protocol's human prose and belong on the ingestion surface.
- **The ingestion authoring surface is being built by plan `2026-09-06_205040-taptab-vendor-pdf-protocol-review.md`** (`VendorPdfReviewPage` → `ProjectionTapTabEditor` on `/ingestion/vendor-pdf/:recordId`). There is no dedicated "protocol authoring" route from the run editor today.
- `ProtocolTabPanel.test.tsx` (244 lines) tests only pure helpers (`splitHumanSteps`, `protocolTextFromSource`, `extractLocalProtocolSetup`, `extractUniversalProtocolSetup`, `setupSuggestionIndices`, `extractUniversalRoleIds`, `formatWorkingConcentration`) — it does NOT render the panel, so removing UI sections won't break it. `ProtocolSelector.test.tsx` (5 tests) covers the selector (search/attach/ingested-PDFs) and stays.

## Architecture / proposed approach
Refactor `ProtocolTabPanel` into two clear modes with the localization/edit machinery removed:

- **Mode A — find & attach** (no protocol attached, OR change-protocol): keep `ProtocolSelector` as-is. Make the search box the persistent, prominent entry (it already is inside the selector; the change is that the tab surfaces the selector/search as the primary action, not a rare no-protocol fallback).
- **Mode B — run/specify steps** (protocol attached): render `RunHeader` + step chips (visibility, Play, settings, execution) + per-step subgraph affordance, and **remove** the one-shot `ProtocolLocalizationThread` block, the plate-setup `SetupSectionWidget` editing block (and its auto-specialize effect), the `BranchPicker`, and the inline `StepLocalizationPane`. Replace the removed "localize / edit protocol prose" entry with a lightweight **"Edit protocol on the ingestion surface"** link that routes to the current vendor-pdf/protocol authoring page (`/ingestion/vendor-pdf/:recordId` when the source is a vendor-pdf, else a protocol-edit route), so a biologist who wants to change the human-language step text does it there, not in the run editor.

This is a UI-cleanup/refactor of one file (plus small helpers). It reuses the already-built search/attach and the TapTab ingestion surface; it does not change the protocol/data model.

Phases land independently, test-gated, committed per phase.

---

## Phase 1 — Make find-&-attach the primary surface (search prominence)

### Task 1.1 — Ensure the search box is prominent and reachable whenever a run has no protocol
File: `app/src/event-editor/right-pane/protocol/ProtocolTabPanel.tsx`.
The `noProtocol || changingProtocol` branch already renders the search input above `ProtocolSelector` (verify — it is there from the earlier search work). Add a 2-line affordance so a run attached to a protocol keeps a visible "Change protocol" entry (already present at line 1636). No behavior change needed.

Verification: `npm run typecheck -w app`. `npx vitest run src/event-editor/right-pane/protocol/ProtocolSelector.test.tsx` → 5 pass (search + ingested-PDFs cases already green).

Commit: `chore(protocol-tab): keep find-&-attach as the primary no-protocol surface (no behavior change)`.

### Task 1.2 — Add a live E2E pinning the search tool (guards the "unchanged" complaint)
New `app/e2e/protocol-tab-search-attach.spec.ts` (pattern-match `e2e/protocol-selector-search.spec.ts`, live backend): open `/runs/RUN-2026-09-06-run-43wx` (a run with NO method attached), assert the search input `[data-testid=protocol-search-input]` is visible, type `cellrox`, assert the CellROX ingested PDF row `[data-testid=open-pdf-VPDF-651F03789D80]` appears with an Open (not Attach) action and the CellROX protocols remain attachable.
Command: `PLAYWRIGHT_BASE_URL=http://127.0.0.1:5174 npx playwright test e2e/protocol-tab-search-attach.spec.ts --config=playwright.cl-e2e.config.ts --project=chromium-ev` → 2-3 pass. (Recreate `playwright.cl-e2e.config.ts` pointing at the installed chromium-1243 if absent.)

---

## Phase 2 — Remove the one-shot + per-step language localization from the run editor

### Task 2.1 — (RED) Render test: Protocol tab attached view no longer mounts the localization thread or step-localization editor
New `app/src/event-editor/right-pane/protocol/ProtocolTabPanel.view.test.tsx` (a render test — the existing one only tests helpers). Stub the run/context endpoints (`apiClient.getRecord(runId)` → run with a `plannedRunRef`; the PLR's `protocolRef`; `/api/protocols/{id}/steps`) to return a protocol with ≥1 step. Render `ProtocolTabPanel` wrapped in `ProtocolSelectionProvider` + `ExecutionProvider` (copy the provider wiring from `ProtocolTabPanel.tsx:1817-1821`). Assert:
- `[data-testid=protocol-steps]` (or the step chip container) renders the step.
- `[data-testid=protocol-localization-details]` is **absent**.
- `[data-testid=step-localization-pane]` is **absent**.
- an "Edit protocol" affordance link is present.

Run it → RED (the localization thread and `StepLocalizationPane` still render). Commit the failing test first.

### Task 2.2 — Strip the localization/edit machinery from the attached view
File: `app/src/event-editor/right-pane/protocol/ProtocolTabPanel.tsx`, render branch (lines ~1620-1800):
- Delete the `<details className="protocol-localization-details">…<ProtocolLocalizationThread …/></details>` block (lines 1663-1676) and its import.
- Delete the `SetupSectionWidget` "This assay needs" block (lines 1684-1721), the `auto-specialize`/draft local-protocol effect, and the `patchSetup`/`specializedKeyRef` logic — this belongs on ingestion (the local-protocol authoring surface). Keep the helpers `extractLocalProtocolSetup`/`extractUniversalProtocolSetup` (they are tested and may move) but no longer render them in this tab.
- Delete the `BranchPicker` (line 1725) and import.
- In the step list (lines 1760-1781), remove the `expandedStepId === step.stepId ? <StepLocalizationPane …/>` inline editing block. Keep the `StepChip` expand affordance but retarget `onSelect`/`onExpand` to "make a subgraph for this step" (open the step's `subGraph` / a step-scoped editor) instead of the localization chat.
- Keep: `StepChip` (visibility, Play, settings, completion), `StepExecutionModal`, `RunHeader`, step list.
- Remove now-unused imports: `StepLocalizationPane`, `ProtocolLocalizationThread`, `SetupSectionWidget`, `BranchPicker`, `EditableProtocolText`, any now-dead `handleLocalize`/`composeFullLocalizePrompt`-dependent state. Delete the `expandedStepId`/`expandedPanelRef` scroll hack only if it no longer has a consumer.

Task 2.2 TDD: run Task 2.1's test → GREEN (3-4 assertions pass). Run `npm run typecheck -w app` clean; `npx vitest run src/event-editor/right-pane/protocol/ProtocolTabPanel.test.tsx` → helpers still 13/13 pass (no helper removed).

Commit: `refactor(protocol-tab): drop one-shot localization + per-step language editor from run pane`.

### Task 2.3 — Retarget the per-step expand to "make a subgraph for this step"
In the same file, change the `StepChip` expand/`onSelect` handler so selecting a step no longer mounts `StepLocalizationPane`; instead it fetches and reveals the step's `subGraph` (already fetched by `fetchStepGraph`) and opens the step-scoped event editing affordance (the existing `subGraph`/`StepExecutionModal` path). This preserves the user's "make their own subgraph for each protocol step in the run editor" requirement.
Verify: typecheck clean; e2e in Phase 4.

---

## Phase 3 — Surface the ingestion-based protocol authoring from the run editor

### Task 3.1 — Add an "Edit protocol" entry to the attached view
File: `app/src/event-editor/right-pane/protocol/ProtocolTabPanel.tsx`. In Mode B, add a small header row (next to "Change protocol"):
```tsx
<button
  type="button"
  data-testid="edit-protocol-prose"
  onClick={() => {
    const src = attachedSourceId // run → plannedRunRef → protocolRef/sourceRef
    if (src?.startsWith('VPDF-')) navigate(`/ingestion/vendor-pdf/${encodeURIComponent(src)}`)
    else navigate(`/protocols/${encodeURIComponent(protocolId)}`) // or a protocol-edit route
  }}
>
  Edit protocol text (ingestion)
</button>
```
Resolve `attachedSourceId`/`protocolId` from the ALREADY-fetched run→PLR→protocol resolution (reuse the `protocolId`/`attachedId` values computed in `fetchSteps`, lines 1063-1085 — surface them via a small state `const [editTarget, setEditTarget] = useState<{route:string}|null>(null)` set during `fetchSteps`).
TDD: extend `ProtocolTabPanel.view.test.tsx`: assert the "Edit protocol text (ingestion)" button is present and renders a route to `/ingestion/vendor-pdf/…` when the source id is `VPDF-*`. (RED first if testing navigation, else assert presence.)
Run typecheck + the view test.

### Task 3.2 — Route decision for non-PDF protocols
For a protocol NOT sourced from a vendor-pdf (a lab-authored or local protocol), there is no `/ingestion/vendor-pdf/:id`. Confirm the existing **Protocol Builder** route (`/protocol-builder`, `ProtocolBuilderPage`) is the authoring destination, or, if the TapTab plan's review page generalizes, point there. **Verify what route exists today** (`rg "protocol-edit|/protocols/:|ProtocolEditPage" app/src`) before wiring; if none, route to `/protocol-builder?protocolId=<id>` and note the TapTab plan (205040) as the eventual editor. This keeps YAGNI: don't build a new authoring page here.
Verify: typecheck clean.

---

## Phase 4 — Cleanup + full verification

### Task 4.1 — Remove dead imports/state and confirm no orphan consumers
File: `app/src/event-editor/right-pane/protocol/ProtocolTabPanel.tsx`. After Phase 2, `rg` for `ProtocolLocalizationThread|StepLocalizationPane|SetupSectionWidget|BranchPicker|EditableProtocolText` in the file; delete any left-behind imports/state. Confirm none of the removed components are imported elsewhere that still need them on the run surface (`rg "ProtocolLocalizationThread|StepLocalizationPane" app/src` — they may be reused on ingestion; if referenced by ingestion, leave the component files, just stop mounting them here).

### Task 4.2 — Full verification
- `npm run typecheck -w server` and `npm run typecheck -w app` (both clean).
- `npx vitest run src/event-editor/right-pane/protocol/ProtocolTabPanel.test.tsx` → 13/13 helper tests pass.
- `npx vitest run src/event-editor/right-pane/protocol/ProtocolSelector.test.tsx` → 5/5.
- `npx vitest run src/event-editor/right-pane/protocol/ProtocolTabPanel.view.test.tsx` → 3-4 pass.
- Live E2E (Phase 1 spec + a return-to-attached step): open `/runs/RUN-2026-09-06-run-43wx` (no protocol) → search box + Ingested PDFs; attach a protocol → run/specify view shows step chips, no localization thread, and the "Edit protocol text (ingestion)" button.

---

## Tests / validation summary
| Area | Command | Expected |
|---|---|---|
| Selector (attach/search) | `npx vitest run src/event-editor/right-pane/protocol/ProtocolSelector.test.tsx` | 5 pass (unchanged) |
| Helpers | `npx vitest run src/event-editor/right-pane/protocol/ProtocolTabPanel.test.tsx` | 13 pass (helpers kept) |
| New view test | `npx vitest run src/event-editor/right-pane/protocol/ProtocolTabPanel.view.test.tsx` | RED for old → GREEN after strip |
| App typecheck | `npm run typecheck -w app` | clean |
| Server typecheck | `npm run typecheck -w server` | clean |
| E2E search/attach | `npx playwright test e2e/protocol-tab-search-attach.spec.ts` (chromium-ev) | 2-3 pass |
| Live | `/runs/RUN-2026-09-06-run-43wx` | search→ingested-PDFs→Open; attach→step chips, no localize thread, Edit-protocol button |

## Risks, tradeoffs, open questions
- **Scope of removal is deliberate**: this removes the one-shot localization chat and the per-step language-localization editor from the RUN editor. That is a real feature loss in the run context — those capabilities are being relocated to ingestion (TapTab plan 205040). If the team still wants translate/localize in the run editor, that's a design conflict; this plan assumes they belong on ingestion per the request. **Confirm before executing.**
- **Where "make a subgraph per step" lives**: the user explicitly wants per-step subgraph work to stay in the run editor. This plan keeps `fetchStepGraph` + `StepExecutionModal` + visibility/Play. The removed `StepLocalizationPane` conflated "edit the human text" (move to ingestion) with "AI-draft this step's events onto the deck" (arguably run work). If the AI-on-deck part is also wanted in the run editor, keep a slim step-localize-on-deck affordance and move only the text/title editing to ingestion. **Default in this plan: move the whole StepLocalizationPane out; flag to confirm.**
- **`/protocol-builder` vs the TapTab review page as authoring destination** (Task 3.2): unverified. The plan routes by source-id (VPDF → `/ingestion/vendor-pdf/:id`; else `/protocol-builder`). If the TapTab plan lands an editable protocol route, retarget. This is the primary open routing question.
- **Helper functions`extractLocalProtocolSetup`/`extractUniversalProtocolSetup`/`setupSuggestionIndices` stay** because they're tested and may move to ingestion; no exports are deleted, so `ProtocolTabPanel.test.tsx` stays green.
- **E2E fixtures** depend on live records/run (`RUNTEST-RUN`, `VPDF-651F03789D80`) in the shared store; fine here, brittle in clean CI (same caveat as the 145500/205040 specs).
- **Over-slimming the attached view** could hide setup/branch context a run-technician needs. The plan assumes setup and branch decisions are authoring-time (ingestion) not run-time; confirm the product spec doesn't require them in the tab. If it does, keep setup as a read-only summary.