# Phase D — Step-Level AI Localization Loop (Protocol tab surface) Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task with two-stage review.

**Goal:** Make the right-pane **Protocol** tab the single surface for the per-step localization loop: the user sees the brief protocol steps, clicks one to expand its full text, types a plain-English instruction about how to localize it to this lab, and the AI drafts that step's events as a ghost on the event graph — current step highlighted, other steps dimmed — then the user reviews, corrects, and re-drafts until the protocol works.

**Architecture:** Consolidate the existing (but scattered) Phase D machinery into the run workspace right-pane Protocol tab. Reuse `ProtocolSelectionContext` (already has per-step `currentStepId`), `ProtocolPreviewBridge` (already tags past/current), `useChatThread` + `ChatInput` + `buildPreviewFromDraft` (the AI→ghost loop), and `protocolStepSelection`/`StepDetailPane` (step text send). The gaps are: (a) the provider + preview bridge are not mounted in the run workspace; (b) the AI input + step detail live in the wrong place (main pane / AI tab) instead of the Protocol tab; (c) the deck never renders the past/current steps; (d) the wonky bindings form and duplicated detail should leave the main pane.

**Tech Stack:** TypeScript, React 18, Fastify, existing event-graph + AI-chat + protocol-subgraph infrastructure, vitest.

---

## Current Context (verified by read-only exploration 2026-08-12)

- **Right-pane Protocol tab** (`app/src/event-editor/right-pane/protocol/ProtocolTabPanel.tsx`) already renders **brief** step chips (`StepChip`: ordinal, label, description, materials list, visibility eye, Play). It wraps itself in `ProtocolSelectionProvider` + `ExecutionProvider` (line 1044). It does **NOT** set `currentStepId` (only `activeStepId`).
- **Run workspace** (`app/src/run/RunWorkspacePage.tsx`) wraps everything in `WorkspaceProvider → EventEditorProvider → FocusModalsProvider → RunWorkspaceShell`. There is **no `ProtocolSelectionProvider` above both panes and no `ProtocolPreviewBridge`** in the run workspace (they exist only in `ProjectWorkspacePage`). So per-step ghosting does not run here today.
- **Main-pane ProtocolPlanningView** (`app/src/run/protocol-planning/ProtocolPlanningView.tsx`) currently shows step chips + `StepDetailPane` (full text) + a **wonky** role→record-id "Bindings/Adaptations" form + `LabInventoryPanel`. `handleStepSelect` already calls `setCurrentStepId` — but the provider isn't mounted in the run workspace, so it degrades to nothing.
- **Per-step ghosting machinery exists:** `ProtocolSelectionContext.tsx` has `currentStepId` + `setCurrentStepId`; `ProtocolPreviewBridge.tsx` tags each preview event with `_protocolStepStatus: 'current' | 'past'` when `currentStepId` is set. **Nothing renders that tag yet** (grep shows only the write site).
- **AI thread machinery is reusable:** `useChatThread({ surface, context, onDraftResult }) → { state, isStreaming, send(text, opts), stop, reset }`; `ChatInput({ isStreaming, onSend, onStop, disabled, placeholder, sendLabel, prefill })`; `onDraftResult(result, prompt)` → `buildPreviewFromDraft(...)` → `actions.setPreview(...)` (the draft→ghost→revision loop; `draftRevision` carries revision history so follow-ups revise the ghost). `buildAcceptedEventGraphProjection` + `getVariantManifest`+`getPlatformManifest` are the deck-context builders used by `AiTabPanel`.
- **Step-text → AI path exists:** `protocolStepSelection.ts` builds `buildProtocolStepPrompt(detail)` and dispatches `protocol-step-selection`; `AiTabPanel.tsx:506-533` listens and sends with `protocolStepContext`. But it only works when the user is on the **AI** tab — not the Protocol tab.
- **Full step text:** `humanStepsText` is read from the protocol record by ProtocolPlanningView and passed to `StepDetailPane`. ProtocolTabPanel does not fetch it.
- **Backend:** server does not currently consume a structured `protocolStepContext` (no match in `server/src`); the step info reaches the AI via the user-prompt text (`buildProtocolStepPrompt`), which is sufficient.

---

## Assumptions / decisions (confirm with Brad)

- **The localization surface is the right-pane Protocol tab.** Brief steps, expandable full text, and the AI input all live there (two-pane convention; no third pane).
- **The main pane in Protocol-planning mode should show the event graph (deck)** so the ghost is visible, not the detailed step list. ProtocolPlanningView's detailed steps + bindings form move out of the main pane. (This changes what "Protocol Planning" mode displays in the main pane — flagged for confirmation in Phase 5.)
- Step info to the AI rides in the **user prompt** (no backend change needed for the loop to function); structured `protocolStepContext` is a nice-to-have pass-through, not required.

---

## Phase 1 — Run workspace infrastructure (selection + ghosting)

### Task 1.1: Mount `ProtocolSelectionProvider` around the run workspace

**Objective:** Let both the right-pane Protocol tab and the main-pane deck share step-selection state.

**Files:**
- Modify: `app/src/run/RunWorkspacePage.tsx` (wrap the return of `RunWorkspacePage`)

**Step 1 — failing test:** render `RunWorkspacePage` at `/runs/:runId`; assert a `useProtocolSelection()` consumer below the shell is **non-null**.
Create `app/src/run/RunWorkspacePage.test.tsx` (or extend an existing run-workspace test) that mounts the page and a probe child calling `useProtocolSelection()`.

**Step 2 — implement:** wrap the existing tree in `<ProtocolSelectionProvider>`:
```tsx
return (
  <ProtocolSelectionProvider>
    <WorkspaceProvider studyId={resolvedStudyId}>
      <RunPaneMode />
      <EventEditorProvider runId={runId} {...(resolvedEventGraphId ? { eventGraphId: resolvedEventGraphId } : {})}>
        {/* existing FocusModalsProvider / RunWorkspaceShell */}
      </EventEditorProvider>
    </WorkspaceProvider>
  </ProtocolSelectionProvider>
)
```
Import `ProtocolSelectionProvider` from `../../event-editor/protocol/ProtocolSelectionContext`.

**Step 3 — verify:** `cd app && npx vitest run src/run` ; `npm run typecheck -w app`.

### Task 1.2: Mount `ProtocolPreviewBridge` inside the run's EventEditorProvider

**Objective:** Selecting a step ghosts that step's compiled sub-graph onto the deck (tagged past/current), and clears when nothing is visible.

**Files:**
- Modify: `app/src/run/RunWorkspacePage.tsx` (render bridge inside `EventEditorProvider`)

**Step 1 — implement:** inside `EventEditorProvider` (alongside `FocusModalsProvider`), add:
```tsx
<ProtocolPreviewBridge />
```
Import from `../../event-editor/protocol/ProtocolPreviewBridge`.

**Step 2 — verify:** typecheck; a run workspace test mounts without throwing; manual: select a step in the Protocol tab → sub-graph events appear as ghosts.

**Step 3 — commit** (after each task): `git add ... && git commit -m "feat(run): mount protocol selection + preview bridge"`.

---

## Phase 2 — Step detail (full text) in the Protocol tab

### Task 2.1: Fetch `humanStepsText` in `ProtocolTabPanel` and split per step

**Objective:** The Protocol tab has the long-form text so a selected step can expand its full detail.

**Files:**
- Modify: `app/src/event-editor/right-pane/protocol/ProtocolTabPanel.tsx`

**Step 1 — implement:** in the `fetchSteps` effect (or `ProtocolSelector` `onAttached`), after steps load, resolve the protocol id (same "run → plannedRunRef → protocolRef → record" chain `ProtocolPlanningView.tsx:88-121` uses, or `/api/protocols/:runId/steps` response carrying `humanStepsText`), fetch the protocol record, and store `humanStepsText` in a new state. Add a helper:
```ts
// split the long-form text into per-step sections on "^\s*\d+\." lines (ordinal-keyed)
function splitHumanSteps(text: string): Record<number, string>
```
Return whole text keyed to fallback `1` when it won't split.

**Step 2 — test:** `app/src/event-editor/right-pane/protocol/ProtocolTabPanel.test.tsx` — given a run whose protocol has `humanStepsText` "1. Add\n2. Incubate", the panel stores it and `splitHumanSteps` yields `{1:..., 2:...}`.

### Task 2.2: Expandable full-text block under the selected step chip

**Objective:** Clicking a brief step expands the full human text below it (in the Protocol tab), and a second click collapses.

**Files:**
- Modify: `app/src/event-editor/right-pane/protocol/ProtocolTabPanel.tsx`
- Add CSS to `app/src/event-editor/right-pane/protocol/protocolTabPanel.css` (create if absent) or reuse step-detail styles.

**Step 1 — failing test:** after selecting a step with a `humanStepsText` section, the full text for that ordinal renders in the tab; collapsing hides it.

**Step 2 — implement:** render, below the step-chips list, a details/animated panel for the `activeStepId`:
```tsx
{expandedStepId && humanSection ? (
  <StepDetailPane
    runId={runId}
    stepId={expandedStepId}
    stepLabel={activeStep.label}
    text={humanSection}
  />
) : null}
```
Reuse the existing `StepDetailPane` (`app/src/run/protocol-planning/StepDetailPane.tsx`) — it already renders the long-form `<pre>` + "Send selection to AI". Toggle `expandedStepId` from the StepChip select handler.

### Task 2.3: Set `currentStepId` on selection in the Protocol tab

**Objective:** Selecting a step drives per-step past/current ghosting (bridge + deck).

**Files:**
- Modify: `app/src/event-editor/right-pane/protocol/ProtocolTabPanel.tsx` (the `onSelect` handler)

**Step 1 — implement:** in the StepChip `onSelect` (ProtocolTabPanel.tsx:991-997), also call:
```tsx
protocolSelection?.setCurrentStepId(wasActive ? null : step.stepId)
```
(alongside the existing `setActiveStepId`). This mirrors `ProtocolPlanningView.handleStepSelect`.

**Step 2 — verify:** selecting a step in the Protocol tab now changes `currentStepId`; the bridge tags events past/current.

---

## Phase 3 — AI localization input + ghost loop in the Protocol tab

### Task 3.1: Create `StepLocalizationPane` (compact AI thread)

**Objective:** A reusable compact pane — step label header, a streaming message log, `ChatInput`, and an accept/discard control — that drives the AI→ghost loop scoped to the run's deck.

**Files:**
- Create: `app/src/event-editor/right-pane/protocol/StepLocalizationPane.tsx` (+ test)
- Add CSS: `app/src/event-editor/right-pane/protocol/protocolTabPanel.css`

**Step 1 — implement (reuse verified APIs):**
```tsx
// surface: the deck surface id so the agent drafts/ghosts the event graph
const editor = useOptionalEventEditor()
const editorState = editor?.state ?? null

// build a minimal AiContext (accepted graph projection + deck scope), like
// AiTabPanel.context but trimmed, plus the protocol step context
const context = useMemo(() => ({
  studyId: ws.state.studyId,
  ...buildAcceptedEventGraphProjection({ /* from editorState — mirror AiTabPanel:185-209 */ }),
  ...(protocolStep ? { protocolStepContext: protocolStep } : {}),
}), [editorState, protocolStep])

const onDraftResult = useCallback((result, prompt) => {
  // same as AiTabPanel.onDraftResult: buildPreviewFromDraft → actions.setPreview
  // (mirror AiTabPanel.tsx:258-320, incl. draftRevision for re-draft)
}, [editor])

const chat = useChatThread({ surface: PROTOCOL_LOCALIZE_SURFACE, context, onDraftResult })
```
Render: `<ChatInput isStreaming onSend={send} onStop={chat.stop} sendLabel={previewActive ? 'Revise' : 'Localize Step'} placeholder="e.g. we only have a QuantStudio 5 — adapt the thermal steps" />` + a compact `<MessageLog messages={chat.state.messages} />`-style list (or just the latest assistant draft), + an "Accept / Discard" row that calls `editor.actions.commitPreview` / `clearPreview`.
Define `const PROTOCOL_LOCALIZE_SURFACE = 'protocol-step-localization'` (a stable surface id).

**Step 2 — test:** mounting the pane with a mocked `getPlatformManifest`/editor, typing and sending calls `chat.send` with a prompt containing the step label + instruction; when a preview is active the send button reads "Revise".

### Task 3.2: Inject the step + user instruction into the prompt

**Objective:** The AI knows which step and what the user wants localized.

**Files:**
- Modify: `app/src/run/protocol-planning/protocolStepSelection.ts` (add `buildStepLocalizePrompt`)
- Modify: `app/src/event-editor/right-pane/protocol/StepLocalizationPane.tsx`

**Implement** a prompt builder (extend the existing module, reuse `ProtocolStepSelectionDetail`):
```ts
export function buildStepLocalizePrompt(step, instruction): string {
  return [
    `Localize step ${step.stepId} ("${step.label}") for THIS lab's instruments and labware.`,
    instruction.trim() ? `User instruction: "${instruction.trim()}"` : null,
    'Draft/ghost this step\'s events onto the current event graph so I can review them on the deck.',
  ].filter(Boolean).join('\n\n')
}
```
`StepLocalizationPane.send` calls `chat.send(buildStepLocalizePrompt(step, text), { enableThinking: false })`.

**Step 3 — test:** `buildStepLocalizePrompt` includes the step label + instruction.

### Task 3.3: Wire the loop into the Protocol tab

**Objective:** When `expansionStepId` is selected, the `StepLocalizationPane` renders below the step detail, scoped to that step.

**Files:**
- Modify: `app/src/event-editor/right-pane/protocol/ProtocolTabPanel.tsx`

**Step 1 — implement:** under the expanded step detail (from Task 2.2), render:
```tsx
{expandedStepId ? <StepLocalizationPane runId={runId} step={activeStep} stepText={humanSection} /> : null}
```

**Step 2 — end-to-end (eventual manual):** select step → full text expands → type "use the QuantStudio 5 thermal block, 25 µL reactions" → **Localize Step** → ghost appears on the deck (Design/Execute main pane), current step highlighted, others dimmed → review → type a correction → **Revise** → ghost updates.

---

## Phase 4 — Deck past/current highlight

### Task 4.1: Render `_protocolStepStatus` on ghost tiles

**Objective:** The deck visually distinguishes the current step from past steps.

**Files:**
- Modify: the event-editor deck tile renderer that draws preview/ghost events (locate during impl via `search_files("data-ghost|data-affected|previewEvents", path="app/src/event-editor")`) — e.g. `LabwareTile` / the event-glyph that consumes `state.preview.previewEvents`.
- Modify: `app/src/event-editor/styles/eventEditor.css`

**Step 1 — implement:** where a ghost event is reduced to a tile/well, read the event's `_protocolStepStatus` and set a data attribute:
```tsx
...(ev._protocolStepStatus ? { 'data-protocol-step-status': ev._protocolStepStatus } : {})
```
**Step 2 — CSS:**
```css
.event-editor [data-protocol-step-status='past'] { opacity: 0.4; filter: grayscale(0.6); }
.event-editor [data-protocol-step-status='current'] { outline: 2px solid var(--cl-accent); outline-offset: 0; }
```

**Step 3 — test:** assert the renderer emits `data-protocol-step-status="current"` vs `"past"` for events carrying the tag (extend the relevant deck component test).

### Task 4.2: Per-step ghost source — select current step, hide/keep others

**Objective (interpretation of user #3):** while localizing step N, its events are the highlighted focus; events from every other step are greyed (kept for context, not removed).

**Files:** `ProtocolPreviewBridge.tsx` (already tags correctly), CSS from Task 4.1. No logic change unless we opt to filter non-visible; keep all visible steps ghosted with the current one emphasized.

---

## Phase 5 — Consolidate the main pane (cleanup the wonky bindings)

> Confirm with Brad before/at this phase, per the Assumptions section.

### Task 5.1: Protocol-planning main pane shows the event graph

**Files:**
- Modify: `app/src/run/RunWorkspacePage.tsx` `RunWorkspaceContent` (lines ~162+) — change the `mode === 'protocol-planning'` branch to render the deck surface so the ghost is visible:
```tsx
if (mode === 'execute') return <ExecutionView ... />
// 'protocol-planning' and 'plan' both show the deck (event graph) + right-pane controls
return <DeckViewer ... />
```

### Task 5.2: Trim `ProtocolPlanningView`

**Files:**
- Modify: `app/src/run/protocol-planning/ProtocolPlanningView.tsx`
- Remove the `StepDetailPane` detail block and the **Bindings/Adaptations** form (`adaptation.ts` usage) from the main pane; the localization loop now lives in the Protocol tab. Keep (or move) the "Localize for this lab" `specializeForExperiment` affordance into the right-pane Protocol tab if still wanted.
- Update `app/src/run/protocol-planning/*.test.tsx` to match.

**Step 1 — test:** `ProtocolPlanningView` no longer renders the adaptations/bind form; the right-pane Protocol tab is the localization surface.

---

## Phase 6 — End-to-end verification

Manual script (user-driven, per repo convention):
1. Open `/runs/:runId` → Protocol tab in the right pane.
2. Select a protocol (or see ingested globals) → brief steps appear in the tab.
3. Click a step → full text expands below; the event graph (main pane) shows that step's events **highlighted**, other steps **dimmed**.
4. Type a localization instruction → **Localize Step** → AI drafts → ghost updates on the deck.
5. Review → correct → **Revise** → ghost revises (re-draft loop). Continue until acceptable → Accept.
6. No detailed-steps / bindings form in the main pane.

Automated gates:
- `cd app && npm run typecheck -w app` (and `-w server` if backend touched)
- `cd app && npx vitest run src/run src/event-editor/right-pane/protocol src/event-editor/protocol`
- `cd server && npx vitest run` for any backend change (only if Task 3.x adds backend consumption)

---

## Files changed/created (summary)

- `app/src/run/RunWorkspacePage.tsx` — provider + preview bridge mount; protocol-planning main pane → deck.
- `app/src/event-editor/right-pane/protocol/ProtocolTabPanel.tsx` — fetch humanStepsText; expandable full text; set `currentStepId`; render `StepLocalizationPane`.
- `app/src/event-editor/right-pane/protocol/StepLocalizationPane.tsx` (+ test + css) — NEW: compact AI thread + ChatInput + accept/discard.
- `app/src/run/protocol-planning/protocolStepSelection.ts` — add `buildStepLocalizePrompt`.
- `app/src/event-editor/protocol/ProtocolPreviewBridge.tsx` — (already tags; no change unless filtering).
- event-editor deck tile renderer + `app/src/event-editor/styles/eventEditor.css` — `data-protocol-step-status` past/current styles.
- `app/src/run/protocol-planning/ProtocolPlanningView.tsx` (+ tests) — remove detail + bindings; keep/create-local-protocol affordance.
- Tests: `RunWorkspacePage.test.tsx`, `ProtocolTabPanel.test.tsx`, `StepLocalizationPane.test.tsx`, `protocolStepSelection.test.ts`.

---

## Risks / tradeoffs / open questions

- **Protocol-planning main pane → deck** is the biggest behavioral change; confirm the user wants the event graph there (vs. a minimal step-summary pane). Recommendation: deck (so the ghost is visible), controls in the right pane.
- **AI input placement:** duplicating a small AiThread in the Protocol tab vs. auto-switching to the AI tab. This plan adds a compact `StepLocalizationPane` (selected: keeps the loop in the Protocol tab as requested). It duplicates ~40 lines of context/draft-builder — acceptable; refactor into a shared `useDeckAiDraft` hook only if reuse grows.
- **`humanStepsText` provenance/split:** splitting on `^\s*\d+\.` is a heuristic; fall back to whole-text when it fails. Confirm `humanStepsText` is reliably present on ingested protocols (if not, fall back to `step.description` or the human-steps endpoint `POST /api/extraction/human-steps/:vendorPdfId`).
- **Backend:** the loop works with step info in the user prompt; adding structured `protocolStepContext` consumption server-side is optional/stretch (no match today).
- **Past/current deck styling:** locate the exact tile renderer that draws preview events during Task 4.1 (grep `data-ghost` / `previewEvents`); keep ghosting clear-guard intact so the existing Protocol-tab flat-ghost behavior doesn't regress.

---

## Execution handoff

Plan complete and saved. Ready to execute using subagent-driven-development — I'll dispatch a fresh subagent per task (spec-compliance then code-quality review), starting with Phase 1 (run-workspace provider + preview bridge) which unblocks everything. Shall I proceed?
