# Per-step subgraph + AI drafting feedback loop in the run editor (select → highlight → draft/revise → accept)

## Goal
Make the run editor's Protocol tab a focused **run/specify-steps** surface: the biologist selects a protocol step, its compiled sub-graph events highlight on the event graph for investigation behind a **very visible "now editing STEP N" indicator**, and they can either **draft that step inline with the AI** (ghost) or **hand-draft events with the UI** (step-scoped so events never spill into the wrong step), then iterate the **AI feedback loop** — "close, but use a deepwell plate, not a 96-well" → AI re-drafts the ghost → user inspects → Accept — with the committed sub-graph persisted per step.

## Correction to prior plans (read this first)
My earlier plan `2026-09-06_210448-slim-protocol-tab-search-attach-run.md` proposed **removing** `StepLocalizationPane` (the per-step AI draft/inspect/redraft loop) and `ProtocolLocalizationThread` (one-shot whole-protocol localization) from the run editor. That was **over-removal and is superseded here.** The corrected model:

- **Stays in the run editor (this plan):** per-step sub-graph work + the AI draft → ghost → inspect → re-prompt → redraft → Accept loop. This *is* "run/specify steps" and the user's described goal. `StepLocalizationPane`, step chips, `ProtocolPreviewBridge`, `fetchStepGraph`, `StepExecutionModal` all stay.
- **Moves to ingestion (plan `205040`, separate):** authoring the reusable protocol *document* — the high-level human-language-from-PDF structured text (title, purpose, materials/equipment/labware lists, prose, provenance) with Save / Save As, in the TapTab rich editor. The run editor just *doorways* to it; it does not host the document editor.

Do **not** strip the per-step localization/AI loop from the run tab. This plan builds it out; `205040` builds the document editor elsewhere.

## Current context / assumptions (verified by reading the code today)
- **Per-step sub-graphs fully exist end-to-end:**
  - Server: `server/src/protocol/StepGraphCompiler.ts` compiles a step → `EventGraph`; `GET /api/protocols/:protocolId/steps/:stepId/graph` (`server/src/api/routes/protocol-steps.ts:488-532`) compiles on demand from `query` bindings.
  - Client: `fetchStepGraph(stepId)` in `ProtocolTabPanel.tsx:1358` → caches into `ProtocolSelectionContext.stepGraphs`; `ProtocolPreviewBridge.tsx` (mounted in `RunWorkspacePage.tsx:132`) ghosts visible steps' sub-graph events onto the deck via `EventEditorContext.setPreview`, tagging each event `_protocolStepId` + `_protocolStepStatus` (`current`|`past`).
  - The past/current layering is already styled: `.tile[data-past-step]` (dim) / `[data-current-step]` (accent outline) in `eventEditor.css:699-715`; `previewProjection.ts` + `WellGrid` derive per-well status.
- **Selecting a step → highlight already partially works:** `ProtocolTabPanel` step-chip `onSelect` sets `activeStepId` + `expandedStepId` + `protocolSelection?.setCurrentStepId(stepId)` (line ~1743), and `ProtocolPreviewBridge` tags that step's events `current`, others `past`. What's **missing / rough**: there is no *single-step investigation focus* — `visibleSteps` ghosts ALL visible steps, so "investigate THIS step" isn't an explicit mode; and selecting a step currently drives `StepLocalizationPane` (a heavyweight inline editor) rather than a clean "here are this step's events, draft them (by hand or AI)" panel.
- **The AI draft → ghost → inspect → redraft → Accept machinery exists** and is the exact loop the user wants:
  - `StepLocalizationPane.tsx` (right-pane/protocol) is the per-step client: editable title + full step text (`EditableProtocolText`), `ChatInput` → `chat.send(composeFullLocalizePrompt(...))` with `protocolStepContext`. `onDraftResult` → `buildPreviewFromDraft` (right-pane/ai/draftPreview.ts) → `EventEditorContext` ghost preview. **Accept** = `commitPreview`. **Redraft** = `handleRedraft` ("What to do differently?" textarea → `composeFullLocalizePrompt({... instruction: base + 'Correction: ' + whatToDoDifferently})` → `chat.send`).
  - `useChatThread.ts` (`send(text, { surfaceOverride, protocolStepContext, ... })`) relays `protocolStepContext` and drives SSE; `chatReducer` + `assistStream.ts` handle the stream.
  - `AiTabPanel.tsx` already listens for `protocol-step-selection` (a `CustomEvent` with `{runId, stepId, stepLabel, highlightedSection}`) → `stepSelectionToSurfaceContext` → `sendSurfaceContext(sc, { protocolStepContext })` (lines 517-548). So **sending a step to the AI from any surface works today**.
  - `run/protocol-planning/protocolStepSelection.ts` has `buildProtocolStepPrompt`, `buildStepLocalizePrompt`, `composeFullLocalizePrompt`, `dispatchProtocolStepSelection` — pure, tested prompt builders.
  - The `RunInEventEditorButton` + `ChatInput` `prefill` (ChatInput.tsx:49,147) can push text into the chat input — the "close, but..." re-prompt hook.
- **Manual ("draft the events onto the graph themselves") path:** the deck is a live event editor (`DeckViewer` / `EventEditorProvider`); the user can add events/labware by hand. What's missing is *step-scoping* that manual work — a clear "I'm now editing step N's sub-graph" boundary + a way to save it back as that step's sub-graph. Server persists `subGraphRef` per step via `PATCH /protocols/:id/steps/:stepId` (`protocol-steps.ts:257`, `subGraphRef` accepted) — but there is **no dedicated "save events → step sub-graph" endpoint**; a graph-component-instance record + a `subGraphRef` PATCH is the persistence path to wire.
- **`StepDetailPane` and `ProtocolPlanningView` are separate run-surface files** (`run/protocol-planning/`) but `ProtocolPlanningView` is **NOT mounted** (no importer found — only its own test references it). The LIVE run editor is `RunWorkspacePage` → `DeckViewer` + `RightPane`/`ProtocolTabPanel`. So the plan should **augment the live `ProtocolTabPanel`/deck**, and either delete the dead `ProtocolPlanningView` (YAGNI) or reuse its pieces — recommend deleting the dead surface in Phase 5 to avoid confusion.

## Architecture / proposed approach
Build the run-editor step-drafting loop as a **sparse, focused panel**: selecting a step enters **step-investigation mode** — `currentStepId` drives `ProtocolPreviewBridge` to show ONLY that step's sub-graph events (dim/highlight), and a compact per-step action panel offers three paths: **(1) Send to AI to draft**, **(2) Edit events by hand (step-scoped on the deck)**, **(3) Revise** — a one-line "close, but…" input that re-sends the correction appended to the composed localize prompt (the existing redraft machinery), followed by **Accept / Discard**. Persistence: Accept writes the accepted events to a graph-component-instance and PATCHes the step's `subGraphRef`.

Everything reuses existing machinery (`ProtocolSelectionContext`, `ProtocolPreviewBridge`, `buildPreviewFromDraft`, `useChatThread`, `composeFullLocalizePrompt`, `protocol-steps` API) — no new model or compiler. The plan is UI+wire work in the run editor, TDD per task.

---

## Phase 1 — Single-step investigation focus in the selection/preview bridge

### Task 1.1 — (RED) TDD: `ProtocolPreviewBridge` honors a `focusStepId` that isolates one step
File: `app/src/event-editor/protocol/ProtocolSelectionContext.tsx`. Add to the context state + provider + hook:
```ts
/** Non-null: bridge shows ONLY this step's events (single-step focus).
 *  null: flat "ghost all visible steps" fallback. */
focusStepId: string | null
setFocusStepId: (id: string | null) => void
```
Add a test in `app/src/event-editor/protocol/ProtocolSelectionContext.test.tsx` (create if absent — mirror `protocol-selection-bridge.test.tsx` pattern): with two steps' graphs cached, setting `focusStepId='S1'` → `ProtocolPreviewBridge`'s ghost contains only `S1` events, each tagged `_protocolStepId='S1'`.
Run `npx vitest run src/event-editor/protocol/ProtocolSelectionContext.test.tsx` → fail (focusStepId doesn't exist).

### Task 1.2 — Implement focus mode in the bridge
File: `app/src/event-editor/protocol/ProtocolPreviewBridge.tsx`. Read `focusStepId`. In the `useEffect`, when `focusStepId !== null`, iterate ONLY that step's graph (not all `visibleSteps`):
```ts
const source = focusStepId
  ? (focusStepId in stepGraphs ? [focusStepId] : [])
  : Array.from(visibleSteps)
for (const stepId of source) {
  const graph = stepGraphs[stepId]
  if (!graph) continue
  for (const event of graph.events) {
    const status = currentStepId !== null ? (stepId === currentStepId ? 'current' : 'past') : undefined
    // tag _protocolStepId + _protocolStepStatus as today
  }
}
```
Keep the existing current/past tagging. The `state.preview?.sourcePrompt === 'Protocol step preview'` guard for `clearPreview` stays.
Run Task 1.1 test → pass. `git add` + commit: `feat(protocol-preview): single-step focus mode isolates one step's sub-graph on the deck`.

---

## Phase 2 — Step selection enters step-investigation mode + a focused action panel

### Task 2.1 — (RED) TDD: step chip select sets `focusStepId` and shows a per-step action panel
New `app/src/event-editor/right-pane/protocol/StepInvestigationPanel.test.tsx` for a NEW component `StepInvestigationPanel` (build it in Task 2.2). Assert that with a selected step it renders three actions: "Draft with AI", "Edit events by hand", and a redraft affordance ("Revise" with a text input when a draft preview is active).
Run → fail (component absent).

### Task 2.2 — Build `StepInvestigationPanel` (compact per-step actions)
New `app/src/event-editor/right-pane/protocol/StepInvestigationPanel.tsx`. Props:
```ts
interface StepInvestigationPanelProps {
  runId: string
  step: { stepId: string; label: string; description?: string }
  stepText?: string            // splitHumanSteps section or step.description
  localProtocolSetup?: LocalProtocolSetupRows | undefined
  onFocusStep?: (id: string | null) => void   // delegate to setFocusStepId
  onDraftWithAi: () => void
  onEditByHand: () => void
  onAccept: () => void
  onDiscard: () => void
  previewActive: boolean
}
```
Renders:
- header: `Step {ordinal} — {label}` + an "Investigate on deck / Exit focus" toggle (`onFocusStep(stepId)` / `onFocusStep(null)`).
- a "Draft with AI" button → `onDraftWithAi()`.
- an "Edit events by hand" button → `onEditByHand()`.
- when `previewActive`: a one-line `Revise` input (placeholder `"Describe a change… (e.g. use a deepwell plate, not a 96-well)"`) + `Accept` / `Discard` + a "Revising (revision N)" status.
Run Task 2.1 test → pass. Commit: `feat(protocol-step): step-investigation action panel (draft-by-AI / draft-by-hand / revise)`.

### Task 2.3 — Wire step-chip selection → investigation mode
File: `app/src/event-editor/right-pane/protocol/ProtocolTabPanel.tsx`. When a step is selected (`activeStepId` set), render `<StepInvestigationPanel>` in place of the old inline `StepLocalizationPane` (lines 1760-1781). Add `const [focusStepId, setFocusStepId]` alongside `expandedStepId` and thread it into `protocolSelection?.setFocusStepId`. Keep `StepLocalizationPane` importable (Phase 3 reuses it) but stop mounting it inline here.
- `onDraftWithAi` → dispatch the step to the AI (Task 3.1) and ensure `currentStepId` is set so `buildPreviewFromDraft` ghosts onto the deck.
- `onEditByHand` → task 4 (step-scoped manual mode).
- `onAccept`/`onDiscard` → task 5 (persist / clear).
Verify: `npm run typecheck -w app`. Commit: `feat(protocol-step): step-chip selection opens investigation mode`.

---

## Phase 3 — "Draft with AI": select a step, send to AI, ghost, revise loop

### Task 3.1 — (RED) TDD: `StepInvestigationPanel` drafts via an inline `useChatThread`
File: `app/src/event-editor/right-pane/protocol/StepInvestigationPanel.test.tsx`. Assert:
- "Draft with AI" renders an inline `ChatInput`/composer inside the panel (NOT a hop to the AI tab).
- sending text composes `buildStepLocalizePrompt`/`composeFullLocalizePrompt` with the step's text and calls `chat.send` (spy on the hook / SSE runner).
Run → fail (panel has no inline chat yet). The prompt composition + `buildPreviewFromDraft` ghost output exist; only the inline mount is new.

### Task 3.2 — Implement inline `onDraftWithAi`
File: `app/src/event-editor/right-pane/protocol/StepInvestigationPanel.tsx`. Mount a `useChatThread` (surface `protocol-step-localization`, context built like `StepLocalizationPane`'s — studyId, `protocolStepContext`, local setup) with `onDraftResult` → `buildPreviewFromDraft` → `EventEditorContext` ghost (port the `onDraftResult`/`buildPreview` body from `StepLocalizationPane.tsx:178-220`). "Draft with AI" reveals the inline `ChatInput`; `handleLocalize` sends `composeFullLocalizePrompt`. Do NOT rely on the `AiTabPanel` `protocol-step-selection` listener for this path (it stays as an alternate entry only).
Run Task 3.1 test → pass. Commit: `feat(protocol-step): inline Draft-with-AI chat in the step-investigation panel`.

### Task 3.3 — Revise (the feedback loop): re-prompt appends the correction
File: `app/src/event-editor/right-pane/protocol/StepInvestigationPanel.tsx`. When `previewActive`, the `Revise` input feeds the SAME correction machinery `StepLocalizationPane.handleRedraft` uses today:
```ts
const base = lastInstruction ?? ''
const composed = composeFullLocalizePrompt({
  step, titleText, fullText: stepText,
  instruction: `${base}${base ? '\n' : ''}Correction: ${whatToDoDifferently}`,
})
void chat.send(composed, { protocolStepContext: { stepId, stepLabel, highlightedSection: stepText ?? '', selectedText: whatToDoDifferently } })
```
Wire `StepInvestigationPanel` to a `useChatThread` (surface `protocol-step-localization`, `context` built like `StepLocalizationPane`'s), and render a running `revisionCount` in the panel. This is the "close, but deepwell not 96-well" loop.
TDD: unit test `composeFullLocalizePrompt` appends `Correction: <input>` after the base (extend `protocolStepSelection` test — already covered partly by `StepLocalizationPane.test.tsx`'s `handleRedraft` intent); assert via a spy that the sent prompt contains `Correction:`. Commit: `feat(protocol-step): Revise re-prompts the AI with the user's correction (feedback loop)`.

---

## Phase 4 — "Edit events by hand": step-scoped manual drafting

### Task 4.1 — (RED) API: accept a step's edited events → graph-component-instance + subGraphRef
Server: `server/src/api/routes/protocol-steps.ts`. Add a route to persist a step's committed sub-graph:
```ts
// POST /api/protocols/:protocolId/steps/:stepId/subgraph
fastify.post('/protocols/:protocolId/steps/:stepId/subgraph', async (req) => {
  // body: { events, labwares }
  // 1. mint a graph-component-instance record (how does StepGraphCompiler/EventGraph
  //    create one today? — see server/src/mcp/tools/componentTools.ts `component_create`
  //    + server/src/ingestion/vendor-protocol/VendorProtocolEventGraphPromotionService:
  //    reuse the existing graph-component-instance mint + store.create pattern)
  // 2. PATCH the step's subGraphRef to the new instance id
  // return { subGraphRef }
})
```
Before writing, confirm the existing way graph-component-instance records are created (search the codebase for `kind: 'graph-component-instance'` + `store.create`) and reuse it — do NOT invent a new record kind. TDD: add `protocol-steps.test.ts` (IP exists? check `server/src/api/**/*.test.ts` for a protocol-steps test harness pattern) asserting POST creates the component instance + PATCHes `subGraphRef`, returning it.

### Task 4.2 — (RED→GREEN) Client "Edit events by hand"
`StepInvestigationPanel.onEditByHand` sets `setManualEdit(true)`: the deck stays live (`EventEditorProvider`) but the panel shows "Editing step {id} by hand — drag/add events on the deck, then Save step". A **Save step** button POSTs to the new route with the deck's edited `events`/`labwares`, then `fetchStepGraph` invalidates the cache so the assembled sub-graph reflects the manual edits. Extend `StepInvestigationPanel.test.tsx` for "Edit by hand" → Save calls `apiClient.patchStepSubgraph(...)` (add that client method in `app/src/shared/api/client.ts`).
Commit: `feat(protocol-step): hand-draft a step's events and save its sub-graph`.

---

## Phase 5 — Visible step indicator (mandatory step-awareness; never spill step events)

### Task 5.1 — (RED) TDD: a persistent "now editing STEP N" header shows the focused step
New `app/src/event-editor/right-pane/protocol/StepIndicator.test.tsx` for a NEW `StepIndicator` component (build in 5.2). Assert that with `{stepId, ordinal, label}` it renders a high-contrast header `Editing STEP {ordinal}: {label}` with a strong border, and that it renders a clear "clear focus" affordance.
Run → fail (component absent).

### Task 5.2 — Build `StepIndicator` + mount it
New `app/src/event-editor/right-pane/protocol/StepIndicator.tsx`. Props: `{ stepId, ordinal?, label, onClearFocus?: () => void }`. Renders a full-width, pinned, high-contrast bar (accent border + background tint) reading `STEP {ordinal}: {label}` with an "Investigate on deck" status and an "✕ clear" button. It lives at the TOP of the run editor's Protocol pane whenever `focusStepId` is set, and its presence is driven by `StepInvestigationPanel`'s focus state (Task 2.3 sets `setFocusStepId`).
Add a matching block-level indicator on the DECK: when `focusStepId` is set, show a thin pinned banner above the deck viewer (`RunWorkspacePage`'s `RunWorkspaceContent` / `DeckViewer` shell) reading `Editing step {label} — events you add now belong to this step's sub-graph`, plus the existing `[data-current-step]` tile/well highlight. This is the "very visible step indicator" so the user never adds the next step's events to the previous step.
Run Task 5.1 test → pass. Commit: `feat(protocol-step): persistent step indicator (panel + deck banner) scopes manual edits`.

### Task 5.3 — scoping: when a step is focused, deck activity is attributed to it
File: `app/src/event-editor/protocol/ProtocolSelectionContext.tsx` + `ProtocolPreviewBridge.tsx`. Ensure that while `focusStepId` is set, any events the user adds/edits on the deck are conceptually part of that step's sub-graph (the indicator + `_protocolStepId` tagging already support it). The **Save step** (Phase 4, Task 4.2) captures the focused step's events to its sub-graph. TDD: with a focused step, adding an event on the deck and clicking "Save step" yields a sub-graph containing that event tagged `_protocolStepId = <focused>` (extend the Phase 4 test).
Commit: `feat(protocol-step): focused-step deck edits are attributed to that step's sub-graph`.

---

## Phase 6 — Cleanup of dead surface + reconcile prior plan

### Task 6.1 — Delete the unmounted `ProtocolPlanningView` (and confirm nothing imports it)
`rg "ProtocolPlanningView" app/src` → only its own file/test/css. Delete `app/src/run/protocol-planning/ProtocolPlanningView.tsx`, `.test.tsx`, `.css` (YAGNI — it's dead). Keep `StepDetailPane` + `protocolStepSelection` (StepDetailPane is small and may be reused on ingestion; `protocolStepSelection` prompt builders are used by Task 3). Verify typecheck + `npx vitest run src/run/protocol-planning/` (only StepDetailPane.test remains → green).
Commit: `chore(protocol): remove unmounted ProtocolPlanningView dead surface`.

### Task 6.2 — Delete `StepLocalizationPane` after folding (decision #2)
Once `StepInvestigationPanel` owns the inline chat + revise loop (Phases 3), delete `app/src/event-editor/right-pane/protocol/StepLocalizationPane.tsx` + `.test.tsx` and port any still-relevant assertions into `StepInvestigationPanel.test.tsx`. Re-`rg` for stray imports. Commit: `chore(protocol): fold StepLocalizationPane into StepInvestigationPanel; no parallel loops`.

### Task 6.3 — Update `2026-09-06_210448` plan's Phase-2 instruction to "keep the loop, move only the document editor"
Append a correction banner to `2026-09-06_210448-slim-protocol-tab-search-attach-run.md` stating: per-step AI drafting + feedback loop STAYS in the run editor (this plan); 210448's "remove StepLocalizationPane" is superseded; only high-level document authoring moves to ingestion (plan `205040`).

---

## Phase 7 — Full verification + E2E for the loop

### Task 7.1 — Unit + typecheck gate
- `npm run typecheck -w server` && `npm run typecheck -w app` clean.
- `npx vitest run src/event-editor/protocol/ProtocolSelectionContext.test.tsx`
- `npx vitest run src/event-editor/right-pane/protocol/StepInvestigationPanel.test.tsx`
- `npx vitest run src/event-editor/right-pane/protocol/StepIndicator.test.tsx`
- `npx vitest run src/run/protocol-planning/StepDetailPane.test.tsx`
- server: the protocol-steps route test (`npx vitest run src/api/routes/protocol-steps.test.ts`), and re-run any existing `ProtocolTabPanel.test.tsx` helpers (13 pass, unchanged).

### Task 7.2 — Live E2E
New `app/e2e/protocol-step-feedback-loop.spec.ts` (live backend + shared store, run `RUN-2026-09-06-run-43wx`):
1. open `/runs/RUN-2026-09-06-run-43wx`, attach the CellROX protocol via the Protocol tab search (`protocol-search-input` → "cellrox" → `attach-CAN-protocol-...`).
2. click the first step chip → the `StepInvestigationPanel` appears with an inline Draft-with-AI; the **StepIndicator** header `EDITING STEP 1: {...}` is visible (deck banner too).
3. click "Draft with AI" → the inline `ChatInput` appears; send → a ghost preview appears on the deck.
4. with a ghost, the "Revise" input is present; type "use a deepwell plate, not the 96-well" and send → the composed prompt contains `Correction:` (assert via a stubbed `fetch` on `/api/ai/assist/stream`) and a ghost still appears.
5. click "Edit by hand", add an event on the deck (e.g. via the deck UI), optionally switch steps and confirm the StepIndicator boundary, then "Save step" → sub-graph persists.
Run: `PLAYWRIGHT_BASE_URL=http://127.0.0.1:5174 npx playwright test e2e/protocol-step-feedback-loop.spec.ts --config=playwright.cl-e2e.config.ts --project=chromium-ev` → passes (recreate the local chromium-ev config if absent).

---

## Tests / validation summary
| Area | Command | Expected |
|---|---|---|
| Focus mode | `npx vitest run src/event-editor/protocol/ProtocolSelectionContext.test.tsx` | focus isolates one step's events |
| Investigation panel | `npx vitest run src/event-editor/right-pane/protocol/StepInvestigationPanel.test.tsx` | inline Draft-with-AI + Edit-by-hand + revise prompt |
| Step indicator | `npx vitest run src/event-editor/right-pane/protocol/StepIndicator.test.tsx` | "Editing STEP N: {label}" header + clear-focus |
| Prompt correction | extend `protocolStepSelection` / `StepInvestigationPanel` test | `Correction: <input>` in sent prompt |
| srv subgraph persist | `npx vitest run src/api/routes/protocol-steps.test.ts` | POST mints instance + PATCHes subGraphRef |
| app typecheck | `npm run typecheck -w app` | clean |
| server typecheck | `npm run typecheck -w server` | clean |
| E2E | `e2e/protocol-step-feedback-loop.spec.ts` | investigate→inline Draft-with-AI→Revise→hand-edit→Save step |

## Risks, tradeoffs, open questions

### Resolved decisions (user direction — fold into implementation)
1. **"Draft with AI" stays inline in the Protocol tab** (not a hop to the AI tab). `StepInvestigationPanel` mounts its own `useChatThread` (surface `protocol-step-localization`, context like `StepLocalizationPane`'s) and renders the `ChatInput` inline. Do NOT rely on the `AiTabPanel` `protocol-step-selection` event for the primary draft path — that listener stays as an alternate entry, but the run tab's panel owns draft/ghost/revise.
2. **Delete `StepLocalizationPane` after folding** — no parallel loops. Its `handleRedraft` correction logic + tests port into `StepInvestigationPanel`; then delete `StepLocalizationPane.tsx` + `.test.tsx`.
3. **Hand-edit is UI-driven, step-scoped, and step-aware.** The user edits steps with the event-editor UI (e.g. "wash plate" → 8-channel pipette, select all wells, aspirate media, dispense 200 µL PBS, shake 30 s, aspirate). The step indicator (Phase 5) is mandatory so events never spill into the wrong step.
4. **Visible step indicator (new requirement).** A persistent, high-contrast "now editing STEP N — {label}" header + a clearly-bounded deck/event-graph region so the user knows exactly which step's sub-graph they're populating. See Phase 5.

### Remaining risks / unknowns
- **Manual-draft persistence (Task 4) is the riskiest**: there is no existing "save events → step sub-graph" endpoint today, and the correct graph-component-instance mint/persist pattern must be *reused* (search `componentTools.ts`/`VendorProtocolEventGraphPromotionService`), not invented. If `subGraphRef` semantics on a `protocol` step conflict with how runs bind it, prefer `PATCH /steps/:id` `subGraphRef` as the sole persistence and let the run attach differently. Confirm the existing graph-component-instance creation path before coding Task 4.1.
- **Dead `ProtocolPlanningView`**: recommend deleting (Task 6.1). If the user wants its StepDetailPane/"adaptation table" ideas preserved for ingestion, keep StepDetailPane and say so; otherwise it's YAGNI debt.
- **Revision numbering**: the review loop needs a monotonic `revisionCount` per investigate-session so "Revising (revision N)" is accurate; reset on new step focus. Verify the existing `draftRevision`/`revisionCount` plumbing (`ChatInput` prefill; `AiTabPanel` revision UI) is reused, not rebuilt.
- **The "wash plate" example reveals granularity**: a single protocol step ("wash plate") maps to MULTIPLE hand-edited events (aspirate → dispense → shake → aspirate). The step-scoping (Phase 5) must make it obvious those all belong to ONE step's sub-graph. Confirm the deck's event add/composer supports multi-event-step composition smoothly (it does — the deck is a live `EventEditorProvider`; the risk is UX clarity, which Phase 5's indicator addresses).
- **Step-scoping manual deck edits** is the least defined UX. The deck is live-editable today; "edit by hand for THIS step" needs a clear affordance + save. If step-scoping manual edits proves awkward, fall back to "manual edits are global to the run's current graph, and Save captures them as the step's sub-graph snapshot" — confirm acceptable.