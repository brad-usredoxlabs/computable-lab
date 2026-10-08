# Per-step subgraph as the REALIZATION of a step-concept (select → draft → inspect → revise → commit)

## Goal
Make the run editor's Protocol tab a focused **run/specify-steps** surface built on a single, explicit model: **a protocol *step* is a human-level *concept* ("wash the media off of the cells before we measure"), and that step's *sub-graph* is the concrete *event series* — specific events + concrete labware — that actualizes the concept.** The user selects a step (concept), sees/edits its sub-graph (realization) behind a **very visible "now editing STEP N" indicator**, and either **AI drafts the realization inline** or the user **hand-builds it with the event-editor UI**, then iterates the **feedback loop** ("close, but use a deepwell, not a 96-well") and **commits** the realization to the step.

This plan re-centers on a fact my earlier versions missed (see "The core model"): the model already EXISTS in the schema — `ProtocolStep.subGraphRef` (`schema/workflow/protocol.schema.yaml:799`) points a step (concept) at a concrete sub-graph, and `StepGraphCompiler` (`server/src/protocol/StepGraphCompiler.ts`) derives the default realization on demand. **What's missing is the UI + a way to COMMIT a concrete realization** (AI-drafted or hand-built) to the step. This is a **concept→realization** relationship, NOT a "don't spill events" container.

## The core model (read this — everything follows)
- **Step = noun = concept.** "Wash the media off the cells." Declarative, human-readable, what/why.
- **Sub-graph = verb = realization.** The concrete events (8-channel pipette, aspirate, dispense 200 µL PBS, shake 30 s, aspirate) + concrete labware that actualizes "wash." Specific, how.
- **One step → one sub-graph** (its realization). The de-coupling the user made is exactly this: a concept can be realized by different event series (different lab, different instrument), so the step holds a REF (`subGraphRef`), not inline events.
- **Two realization sources:**
  1. **Derived/compiled** — `StepGraphCompiler.compileStepToGraph(step, bindings)` produces events on demand (`GET /steps/:id/graph`, `protocol-steps.ts:488`). Always available; the "default" realization evidence.
  2. **Committed** — a concrete, user/AI-created event series saved and linked via `subGraphRef`. Does NOT exist yet in the UI; this is the net-new capability this plan adds.
- **The AI feedback loop refines the realization, not the concept.** "close, but deepwell not 96-well" edits the concrete events; the concept ("wash cells") is unchanged.

## Current context / assumptions (verified by reading the code today)
- **Sub-graph plumbing exists end-to-end:** `StepGraphCompiler` (server) ; `GET /api/protocols/:protocolId/steps/:stepId/graph` (`protocol-steps.ts:488-532`) compiles on demand; client `fetchStepGraph` (`ProtocolTabPanel.tsx:1358`) caches into `ProtocolSelectionContext.stepGraphs`; `ProtocolPreviewBridge` (mounted `RunWorkspacePage.tsx:132`) ghosts visible steps' events onto the deck, tagging `_protocolStepId` + `_protocolStepStatus` (`current`|`past`).
- **The current/past layering is styled:** `eventEditor.css:699-715` (`.tile[data-current-step]` accent outline, `[data-past-step]` dim) + `WellGrid` per-well `data-protocol-step-status`.
- **The realization commit path is MISSING:** `ProtocolStep.subGraphRef` (schema:799) targets `graph-component-instance`; `graph-component-instance.schema.yaml` REQUIRES `componentRef`+`componentVersionRef` (a bound, versioned template) — heavyweight, not a simple "here are these concrete events" record. `event-graph.schema.yaml` REQUIRES `{id, events, labwares}` and is the natural *realization container*, but there is no `POST /steps/:id/subgraph` to write a concrete event series to a step, and no client path. **The persistence design (Phase 4) must reconcile `subGraphRef`'s graph-component-instance expectation with the simpler event-series reality** — this is the key design decision.
- **Step selection → highlight partially works:** step-chip `onSelect` sets `activeStepId` + `expandedStepId` + `setCurrentStepId` (ProtocolTabPanel ~1743); `ProtocolPreviewBridge` tags current vs past. Missing: a single-step investigation mode (today `visibleSteps` ghosts ALL, so "examine THIS step's realization" isn't isolated).
- **AI draft → ghost → revise → accept machinery exists:** `StepLocalizationPane` (right-pane/protocol) — inline chat, `onDraftResult` → `buildPreviewFromDraft` (right-pane/ai/draftPreview.ts) → `EventEditorContext` ghost, `Accept` = `commitPreview`, `handleRedraft` re-prompts appending `Correction:`. `useChatThread` + `ChatInput` (inline, `prefill`). `AiTabPanel` also listens for `protocol-step-selection`.
- **Prompt builders are pure + tested:** `run/protocol-planning/protocolStepSelection.ts` (`buildStepLocalizePrompt`, `composeFullLocalizePrompt`, `buildProtocolStepPrompt`, `dispatchProtocolStepSelection`).
- **`ProtocolPlanningView` (run/protocol-planning/) is UNMOUNTED/dead** (no importer — only its own test). The live run editor is `RunWorkspacePage` → `DeckViewer` + `ProtocolTabPanel`.

## Architecture / proposed approach
Re-center the run tab on **concept (step) → realization (sub-graph)**:

1. **Realization source of truth:** a step's sub-graph = its **committed realization** (`subGraphRef`) when present, else the **compiled** realization (`StepGraphCompiler`). The deck, focused on a step, edits/represents that ONE step's realization; neighbors render dimmed as concept-context.
2. **Step-investigation UI:** selecting a step enters investigation mode — the deck isolates that step's realization (`focusStepId`), a persistent **StepIndicator** shows the CONCEPT ("Editing STEP 2: Wash the cells"), and a compact **StepInvestigationPanel** offers: **Draft with AI** (inline, realizes the concept into the ghost), **Edit by hand** (the event editor composes the realization directly), **Revise** (correct the ghost), **Accept / Discard** (commit/clear the realization).
3. **Commit = persist the realization** to the step via `subGraphRef` (new server route + reuse of the event-graph/graph-component persistence). Accept (AI) and Save (manual) both land the concrete events as the step's realization.

Reuses all existing machinery (compiler, bridge, `buildPreviewFromDraft`, `useChatThread`, `protocolStepSelection`, `event-graph` record); the net-new backend is ONE route and the event-series→step persistence mapping.

**Corrected vs my prior `2026-09-06_212531` plan:** this version (a) removes the wrong "step-scoping / don't-spill" framing — the indicator is about *which concept's realization you're building*, not containment; (b) makes the shared `subGraphRef`/realization persistence an explicit design decision (the old Task 4.1 hand-waved it); (c) frames the AI loop as realizing a *concept*.

---

## Phase 1 — Single-step realization focus in the selection/preview bridge

### Task 1.1 — (RED) TDD: `ProtocolPreviewBridge` honors a `focusStepId` (isolate one step's realization)
File: `app/src/event-editor/protocol/ProtocolSelectionContext.tsx`. Add to state/provider/hook:
```ts
focusStepId: string | null
setFocusStepId: (id: string | null) => void
```
New test `app/src/event-editor/protocol/ProtocolSelectionContext.test.tsx`: two steps' graphs cached; `setFocusStepId('S1')` → bridge ghosts ONLY `S1` events, each `_protocolStepId='S1'`.
Run → fail.

### Task 1.2 — Implement focus mode in `ProtocolPreviewBridge.tsx`
When `focusStepId !== null`, iterate only that step's graph (not all `visibleSteps`); keep current/past tagging. Run Task 1.1 → pass. Commit: `feat(protocol-preview): focus mode isolates one step's realization on the deck`.

---

## Phase 2 — Step selection enters investigation; the concept is always visible

### Task 2.1 — (RED) `StepInvestigationPanel` shows the CONCEPT and three realization actions
New `app/src/event-editor/right-pane/protocol/StepInvestigationPanel.test.tsx`: with a step `{stepId, ordinal, label, description}`, it renders the concept (`Step 2: Wash the media off the cells`), plus **Draft with AI**, **Edit by hand**, and (when `previewActive`) **Revise** + **Accept**/**Discard**. Run → fail (absent).

### Task 2.2 — Build `StepInvestigationPanel` (concept-forward)
Props: `{ runId, step:{stepId,label,description}, stepText?, localProtocolSetup?, onFocusStep?, onDraftWithAi, onEditByHand, onAccept, onDiscard, previewActive }`. Header shows the concept label prominently; action buttons; `previewActive` → one-line Revise (`"Describe a change… (e.g. use a deepwell plate, not a 96-well)"`) + Accept/Discard + `Revising (revision N)`. Run Task 2.1 → pass. Commit: `feat(protocol-step): investigation panel shows the concept + realization actions`.

### Task 2.3 — Wire step-chip selection → investigation mode + focus
`ProtocolTabPanel.tsx`: render `StepInvestigationPanel` where the old inline `StepLocalizationPane` was (lines ~1760-1781); add `focusStepId` state threaded to `setFocusStepId`; `onEditByHand`/`onAccept`/`onDiscard` per Tasks 4-5. Verify typecheck. Commit: `feat(protocol-step): step-chip selection enters investigate mode`.

---

## Phase 3 — "Draft with AI": realize the concept inline, then revise the realization

### Task 3.1 — (RED) inline `useChatThread` in the panel
`StepInvestigationPanel.test.tsx`: "Draft with AI" reveals an inline `ChatInput`; sending composes `composeFullLocalizePrompt` from the step concept + text and calls `chat.send`. Run → fail.

### Task 3.2 — Mount inline chat + ghost
`StepInvestigationPanel.tsx`: `useChatThread` (surface `protocol-step-localization`, context like `StepLocalizationPane`'s) with `onDraftResult` → `buildPreviewFromDraft` → `EventEditorContext` ghost (port from `StepLocalizationPane.tsx:178-220`). "Draft with AI" reveals the `ChatInput`; `handleLocalize` sends the composed prompt carrying the concept + `protocolStepContext`. Commit: `feat(protocol-step): Draft-with-AI realizes the concept into a ghost`, Run Task 3.1 → pass.

### Task 3.3 — Revise = refine the realization (the feedback loop)
`StepInvestigationPanel.tsx`: Revise re-prompts appending `Correction: <input>` (port `StepLocalizationPane.handleRedraft`). Track `revisionCount` per focus. TDD: sent prompt contains `Correction:`. Commit: `feat(protocol-step): revise refines the realization (feedback loop)`.

---

## Phase 4 — Commit the realization to the step (the net-new backend + client)

> **Design decision (the crux this plan adds):** a committed realization must be linked to the step via `subGraphRef`, but `graph-component-instance` requires `componentRef`+`componentVersionRef`. The honest realization container is an `event-graph` (`{id, events, labwares}`). Two options — pick ONE before coding, confirm with the maintainer:
> - **(A) event-series as an event-graph, step points at it.** Add `POST /api/protocols/:protocolId/steps/:stepId/subgraph` that mints an `event-graph` record from `{events, labwares}` and PATCHes the step's `subGraphRef` to `{kind:'record', type:'graph-component-instance'|'event-graph', id}`. This best matches "the concrete series of events," but requires `subGraphRef`'s target type to accept `event-graph` (or a friendlier new ref type). — **Recommended** for the concept→event-series semantics; verify how `subGraphRef` is consumed at run compile before widening the type.
> - **(B) puzzle into graph-component-instance.** Requires component+version; heavier, likely wrong for ad-hoc step realizations. Only if (A) breaks an existing consumer.

### Task 4.1 — (RED) server: `POST /steps/:id/subgraph` persists a realization and PATCHes `subGraphRef`
File: `server/src/api/routes/protocol-steps.ts`. New route:
```ts
fastify.post('/protocols/:protocolId/steps/:stepId/subgraph', async (req) => {
  // body: { events, labwares, name? }
  // per decision (A): mint an event-graph record (reuse how event-graphs are
  //   created today — search server for 'kind: event-graph' + store.create),
  //   then PATCH step.subGraphRef = { kind:'record', type:'<decided>', id }
  // return { subGraphRef }
})
```
TDD: new `server/src/api/routes/protocol-steps.test.ts` (or the harness already used for protocol-steps) — POST creates the event-graph record + returns `subGraphRef`; a second POST replaces the ref (new id). Confirm the real event-graph create path first.

### Task 4.2 — (RED→GREEN) client + "Edit by hand" / Accept commit the realization
`StepInvestigationPanel.tsx`: "Edit by hand" keeps the deck live; **Save step** (and `onAccept` for the AI draft) calls a new `apiClient.patchStepSubgraph(protocolId, stepId, { events, labwares })` (add to `app/src/shared/api/client.ts`) → POSTs the focused step's realization; then `fetchStepGraph` invalidates the cache so the deck shows the committed realization (fall back to compiled when `subGraphRef` absent). Extend `StepInvestigationPanel.test.tsx` for Save→`patchStepSubgraph` call.

---

## Phase 5 — The visible step indicator (which concept's realization am I building?)

### Task 5.1 — (RED) `StepIndicator` renders "Editing STEP N: {concept}"
New `app/src/event-editor/right-pane/protocol/StepIndicator.test.tsx`: renders `Editing STEP 2: Wash the media off the cells` high-contrast + a clear-focus affordance. Run → fail.

### Task 5.2 — Build `StepIndicator` (panel + deck banner)
`app/src/event-editor/right-pane/protocol/StepIndicator.tsx`: pinned, accent-tinted bar showing the CONCEPT label + "Investigate on deck" status + ✕ clear. Mount in the Protocol pane (top, when `focusStepId` set) AND as a block banner above the deck viewer (`RunWorkspacePage`/`DeckViewer`): `Editing step {label} — events you add now realize this step`. Run Task 5.1 → pass. Commit: `feat(protocol-step): visible step indicator (panel + deck banner)`.

### Task 5.3 — attribution: focused-step deck edits commit to that step's realization
While `focusStepId` is set, Save/Accept attributes the deck's events to the focused step's `subGraphRef`. TDD (extend Phase 4 test): focused step + a deck-added event → Save posts it as that step's realization. Commit: `feat(protocol-step): focused-step deck edits realize that step`.

---

## Phase 6 — Cleanup + reconcile prior plans

- **6.1** Delete unmounted `ProtocolPlanningView` (+ its test/css) — verify `rg` shows no importer. Keep `StepDetailPane` + `protocolStepSelection`.
- **6.2** Delete `StepLocalizationPane` + test after folding (decision: no parallel loops); port surviving assertions into `StepInvestigationPanel.test.tsx`.
- **6.3** Add correction banners to BOTH prior plans (`2026-09-06_210448*`, `2026-09-06_212531*`): the run tab is concept→realization; only the reusable protocol *document* (title/prose/materials/equipment) moves to ingestion (`205040`).

---

## Phase 7 — Full verification + E2E

- typecheck server+app; unit tests: `ProtocolSelectionContext`, `StepInvestigationPanel`, `StepIndicator`, `StepDetailPane`, `protocol-steps` route.
- E2E `app/e2e/protocol-step-feedback-loop.spec.ts` (live, run `RUN-2026-09-06-run-43wx`): attach CellROX → click step chip → StepIndicator `EDITING STEP 1` visible (panel + deck) → Draft-with-AI inline chat → send → ghost appears → Revise "deepwell not 96-well" → ghost still there (stubbed `/api/ai/assist/stream`) → Edit-by-hand + add event + Save step → sub-graph persists → the deck shows the committed realization.

---

## Risks, tradeoffs, open questions
- **Task 4 (commit a realization) is THE net-new risk**: no `subGraphRef` write path exists. The `graph-component-instance` schema (component+version refs) is heavyweight and probably the wrong shape for an ad-hoc step realization; decision (A) mints an `event-graph` and points `subGraphRef` at it, but widening `subGraphRef`'s target type may affect run compilation that reads it. **Confirm how `subGraphRef` is consumed at run/compile before choosing (A) vs (B).** This is a schema/consume question the implementer must resolve first.
- **Step as concept vs sub-graph as realization** will change how the run tab talks: the panel header + indicator should show the *concept* language, and the deck edits the *realization*. Avoid the "don't spill" framing — the user was explicit that isolation is about *which concept you're realizing*, not containment.
- **"Wash plate" granularity**: one concept ("wash cells") → ~5 concrete events (aspirate, dispense, shake, aspirate…). The realization-per-step model makes this natural (one step's sub-graph holds many events); the indicator makes it clear all 5 belong to THIS step's concept. No special handling needed beyond the indicator + attribution.
- **Multiple realizations of one concept** (different labs/instruments): out of scope here (one committed realization per step suffices; the `subGraphRef` ref makes it trivially replaceable). Note as follow-up if versioning realizations matters.
- **Manual vs AI edit interplay**: hand-editing after an AI draft replaces the ghost→commits the manual realization. Keep "Accept" = commit the current deck/ghost; "Discard" = clear to the last committed (or compiled) realization.
- **The `graph-component-instance` expectation in `subGraphRef`** is the schema wrinkle; if (A) widens the union, update `schema/workflow/protocol.schema.yaml` + any compiler switch.

---

## Implemented — 2026-09-06/07 (executed directly)

### Supersession note
This plan (`...214008`, concept → realization) supersedes the earlier removal-heavy
`2026-09-06_210448` (which wrong proposed dropping the per-step loop) and builds on the
corrected `...212531`. The per-step AI draft/revise loop STAYS in the run editor.

### What landed (commits on main)
- **Phase 1 focus**: `ProtocolSelectionContext` gained `focusStepId` + `focusedStep`
  (`setFocusedStep`); `ProtocolPreviewBridge` ghosts ONLY the focused step's realization.
- **Phase 2/3 panel**: new `StepInvestigationPanel` (concept header, Draft-with-AI inline
  chat, Edit-by-hand, Revise+correction feedback loop, Accept/Discard); wired into
  `ProtocolTabPanel` in place of the old `StepLocalizationPane`.
- **Phase 4 realization commit (net-new backend)**: `POST /protocols/:id/steps/:id/subgraph`
  mints an `event-graph` realization and sets `step.subGraphRef`; `subGraphRef` schema
  widened to accept `event-graph` (additive); GET /steps/:id/graph prefers the committed
  realization over the compiled template; client `apiClient.patchStepSubgraph` + wiring.
- **Phase 5 indicator**: new `StepIndicator` (panel-top + deck banner via RunWorkspacePage).
- **Phase 6 cleanup**: deleted `StepLocalizationPane` (+test) and dead `ProtocolPlanningView`.
- Tests: protocol-steps route (5), StepInvestigationPanel (8), StepIndicator (4),
  ProtocolSelectionContext (7), ProtocolTabPanel helpers (25) — all green; app+server tsc clean.

### Left / open
- Live E2E spec not yet written; the loop is unit-tested. (Backend on :3001 is `--watch`.
- The `experiment lifecycle / run-editor door` to ingestion (the TapTab document editor,
  plan `...205040`) remains separate.
