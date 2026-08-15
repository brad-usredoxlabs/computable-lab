# Three-Mode Run Workspace + Protocol Planning (Localization) Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task (fresh subagent per task, two-stage review).

**Goal:** Turn the run workspace into a **three-mode** surface — **Protocol Planning** (adapt a universal vendor protocol to this lab), **Design** (build the event graph with the straight-metal UI + AI chat), and **Execute** (run it) — and give the protocol record both a *concise* executable step list and a *full human-readable* text dump, with an AI-assisted "click a step → highlight detail → ghost events" localization loop.

**Architecture:** Extend the existing run workspace mode toggle (currently `'plan' | 'execute'`) to add `'protocol-planning'`. Reuse the existing per-step sub-graph machinery (`ProtocolSelectionContext` → `ProtocolPreviewBridge` → deck ghosting, `StepGraphCompiler`) and the existing AI preview pipeline (`useAiChat.streamAssist` → `setPreview`). Add a `currentStepId` + per-step preview layering so past steps render dimmed and the live step is highlighted. The long-form / extraction text is persisted on the protocol record via a new `humanStepsText` field.

**Tech Stack:** TypeScript, React 18, Fastify, Ajv + YAML schemas, existing event-graph + protocol-builder infrastructure.

---

## Current Context (verified via read-only exploration 2026-08-05)

- **Mode toggle** = the "selector between design and execution" the user said was lost — it still exists. It is `ModeToggle` in `app/src/run/lib/mode-toggle.tsx` (`mode: 'plan' | 'execute'` at lines 9/10/43), rendered into `AppShell.topbarMiddle` at `app/src/run/RunWorkspaceShell.tsx:24`. `RunWorkspaceContent` (`app/src/run/RunWorkspacePage.tsx:155-195`) dispatches: `execute` → `<ExecutionView>`, else → `<DeckViewer>` (design). URL param `?mode=` handled client-side by `useModeToggle`; default `'plan'`.
- **Spec intent (Jul 28–Aug 1):** three run-time phases **Plan → Execute → Analyze** (`protocol-spec-gap-analysis.md`), and a **Global → Local → Planned → Executed** protocol lifecycle (`compiler-specs/50-protocol-lifecycle.md` §5). The "localization" (universal → instrument-specific) is the `local-protocol` record kind (`inherits_from`, `overrides: {bindings, parameters, substitutions, timing_policies, tip_policies}`, `lab_state_refs`, "same verbs / same order" invariant, `EquipmentCapabilityService`). **Not currently surfaced as a run-workspace mode.**
- **Per-run default single-step protocol is unimplemented.** Spec: *"single non-deletable step called protocol or main or step 1"* (gap-analysis #7, currently P3).
- **Protocol detail view:** `/lab/:category/:entityId` → `app/src/lab/LabEntityWorkspace.tsx` → `ProjectionTapTabEditor` (read-only), shape from `schema/workflow/protocol.ui.yaml` (`$.steps` → `protocol-step-roles`; `$.notes`/`$.purpose` → `protocol-prose-authoring`; `$.overview` not rendered).
- **Concise vs long-form:** the promoted protocol (`records/protocol/CAN-protocol-*.yaml`) has a **structured machine-executable `steps[]`** (`$defs/ProtocolStep`). The **long human-readable** list comes from `POST /api/extraction/human-steps/:vendorPdfId` (`server/src/api/handlers/HumanStepsHandlers.ts`), which returns `{ steps: [{ordinal,text}], raw: <full LLM text incl. clarifying notes>, title }` — **the client (`app/src/extraction/ExtractionReviewPage.tsx:119`) currently drops `raw`.** The `/extraction/review/:recordId` page renders the concise `{ordinal,text}` list as an `<ol>`.
- **AI ghost flow:** `useAiChat.sendPrompt` → `streamAssist(prompt, surface, contextPayload, history, signal, files, thinking)` → `normalizePreviewEvents` → `setPreviewEvents` → `acceptPreview`/`onAcceptEvent` → `EventEditorContext.commitPreview` (deck). `contextPayload` = spread of `AiContext.surfaceContext` + `mentions` + `editorMode` (`useAiChat.ts:404-428`). `AiContext.surfaceContext` (`app/src/types/aiContext.ts:26`) is an arbitrary `Record<string, unknown>` — the injection point for step+highlight context.
- **Step/sub-graph deck machinery:** `ProtocolSelectionContext` (`activeStepId`, `visibleSteps`, `stepGraphs`); `ProtocolPreviewBridge` aggregates **all** visible steps' events → `setPreview` (ghost). **No per-step visual differentiation yet** (no grey-past / highlight-current at the protocol level). Sub-graphs fetched via `GET /api/protocols/:protocolId/steps/:stepId/graph` → `StepGraphCompiler.compileStepToGraph`. Ghost styling exists: `LabwareTile data-ghost`/`data-affected` + `eventEditor.css:628`; draft timeline ticks `scrubber-tick--draft` (`EventPillBar.tsx:282`).
- **Text-selection→AI pattern to reuse:** `AiTabPanel.tsx:489-499` listens for a custom DOM event (e.g. `pdf-text-selection`) and calls `chat.send(text)`.

---

## Proposed Approach (5 capabilities, 4 phases)

- **Phase A — Protocol record keeps both forms; main view = concise steps.** Add `humanStepsText` to `protocol.schema.yaml`; persist the long-form on promote; redesign the protocol detail view so the concise step list is primary and the full text is a collapsible section.
- **Phase B — Three-mode run workspace.** Extend `ModeToggle` to `'protocol-planning' | 'plan' | 'execute'`; add `ProtocolPlanningView`; guarantee every run has a default non-deletable `main` step.
- **Phase C — Protocol-localization data model.** Within protocol-planning mode, create/load a `local-protocol` from the selected universal protocol (instrument + labware adaptation) using the existing `ProtocolContextService`/`local-protocol` machinery.
- **Phase D — Click-step → highlight-detail → AI-ghost loop.** Step chips + long-form detail pane + text highlight → inject `(stepId, stepLabel, highlightedSection, pastStepIds)` into the AI chat context → AI ghosts the current step's events while past steps render dimmed and the current step is highlighted.

Cross-cutting: TDD per task; `exactOptionalPropertyTypes` is ON for the backend — spread optional fields conditionally; schemas use `unevaluatedProperties: false` (any new field must be declared); JSON Schema debugging requirement — always validate with the full schema set loaded.

---

## Phase A — Protocol record: concise steps + full-text dump; main view

### Task A1: Add `humanStepsText` field to protocol schema

**Files:**
- Modify: `schema/workflow/protocol.schema.yaml` (properties block)
- Test: `server/test/protocol/schema-validate.test.ts` (or existing protocol schema test)

**Objective:** Declare the long-form human-readable protocol text so it can persist on every universal protocol record.

**Step 1 — Write failing schema test:**
```ts
// server/test/protocol/schema-validate.test.ts
import { describe, it, expect } from 'vitest'
import { buildValidatorWithAllSchemas } from './helpers/loadAllSchemas'
const SCHEMA='https://computable-lab.com/schema/computable-lab/protocol.schema.yaml'
it('protocol allows humanStepsText', async () => {
  const v = await buildValidatorWithAllSchemas()
  const ok = v.getSchema(SCHEMA)!
  expect(ok({ ...minimalProtocol(), humanStepsText: '1. Add...\n2. Seal...' })).toBe(true)
})
```
Run: `cd server && npx vitest run test/protocol/schema-validate.test.ts` — expect **FAIL** (`humanStepsText` is unevaluated).

**Step 2 — Implement:**
```yaml
# schema/workflow/protocol.schema.yaml  -> properties
  humanStepsText:
    type: string
    description: "Full long-form human-readable protocol (e.g. the /extraction/human-steps output) incl. clarifying notes; kept alongside the concise machine `steps`."
```

**Step 3 — Re-run test** → PASS. Also add `humanStepsText` (read-only `protocol-prose-authoring`) to `schema/workflow/protocol.ui.yaml`.

**Verification:** `cd server && npx tsc --noEmit` (only new lines from this change matter); schema unit test passes.

---

### Task A2: Persist the long-form dump on promote

**Background (verified):** `POST /api/extraction/human-steps/:vendorPdfId` returns `raw` (the full text) but the client drops it; the promote path (`/api/extraction/drafts/:id/candidates/0/promote`) builds the protocol from `candidate.draft` which has **no** `humanStepsText`.

**Files:**
- Modify: `app/src/extraction/ExtractionReviewPage.tsx` (capture `raw` from the human-steps response; pass it forward)
- Modify: the promote client call (`ExtractionReviewPage.tsx` `promote()` ~line 160) to send `humanStepsText` in the body
- Modify: `server/src/api/handlers/*` promote handler (`promoteCandidateLogic` / `CandidatePromoter`) to accept and store `humanStepsText` into the promoted protocol payload

**Step 1 — Failing test (server):** assert that promoting a candidate with `humanStepsText` in the body results in a protocol record whose payload has `humanStepsText` set.

**Step 2 — Implement:** capture `const { steps, raw, title } = await res.json()` in `ExtractionReviewPage` (keep `raw` in state); include `{ humanStepsText: raw }` in the promote `POST` body; server echoes it into the promoted protocol `payload.humanStepsText`.

**Step 3 — Verif:** promote an extraction draft with a body `{humanStepsText:`...`}` → GET the created protocol → payload has `humanStepsText`.

---

### Task A3: Protocol detail view — concise steps primary, full text collapsible

**Goal (user item 1/2):** the main human view of a protocol should be the **succinct executable steps** (the CAN-protocol list); the full text is an expandable section — *not* the default main view.

**Files:**
- Modify: `app/src/lab/LabEntityWorkspace.tsx` (protocol branch) — render main = step list; add a `details/summary` "Full protocol text" block reading `payload.humanStepsText`
- Modify: `schema/workflow/protocol.ui.yaml` — reorder sections so the steps (`protocol-step-roles`) render first; add a collapsible `humanStepsText` section
- Test: `app/src/lab/LabEntityWorkspace.test.tsx`

**Step 1 — Failing test:** given a protocol record with `steps` + `humanStepsText`, the step list is visible and the full text is inside a collapsed `<details>` (not the dominant flow).

**Step 2 — Implement:** section order + the collapsible block.
```tsx
{/* main view */}
<section data-testid="protocol-steps-main"><ProtocolStepsList steps={payload.steps} /></section>
{payload.humanStepsText ? (
  <details data-testid="protocol-full-text">
    <summary>Full protocol text</summary>
    <pre>{payload.humanStepsText}</pre>
  </details>
) : null}
```

**Step 3 — Verif:** `cd app && npx vitest run src/lab/LabEntityWorkspace.test.tsx`; manual: open `/lab/protocols/:id`, confirm steps first + collapsible full text.

---

## Phase B — Three-mode run workspace + default single step

### Task B1: Extend the mode type

**Files:**
- Modify: `app/src/run/lib/mode-toggle.tsx:9,10,43`
- Modify: `app/src/run/RunWorkspacePage.tsx:157`

**Implement:**
```ts
// mode-toggle.tsx
export type RunMode = 'protocol-planning' | 'plan' | 'execute'   // keep 'plan' for design/back-compat
export interface ModeToggleProps { mode: RunMode; onChange: (m: RunMode) => void }
// line 43:
const raw = searchParams.get('mode')
const mode: RunMode = raw === 'execute' ? 'execute' : raw === 'protocol-planning' ? 'protocol-planning' : 'plan'
```
Mirror the type in `RunWorkspaceContentProps.mode: RunMode` (RunWorkspacePage.tsx:157).

**Verification:** `cd app && npx tsc --noEmit`.

---

### Task B2: Add the third button + setMode handling

**Files:** `app/src/run/lib/mode-toggle.tsx` (ModeToggle buttons ~13-33; `setMode` ~47-48)

**Implement** — three buttons ("Protocol Planning" / "Design" / "Execute"); `setMode` sets `?mode=` accordingly:
```ts
const set = (m: RunMode) => {
  const sp = new URLSearchParams(searchParams)
  if (m === 'plan') sp.delete('mode') else sp.set('mode', m)
  navigate(`?${sp.toString()}`, { replace: true })
}
```
Keep `'plan'` labeled **"Design"** in the UI but default mode stays `'plan'`.

**Test:** `app/src/run/lib/mode-toggle.test.tsx` — clicking the third button sets `?mode=protocol-planning`.

---

### Task B3: Dispatch to `ProtocolPlanningView`

**Files:** `app/src/run/RunWorkspacePage.tsx` `RunWorkspaceContent` (155-195)

**Implement:**
```tsx
if (mode === 'protocol-planning') {
  return <ProtocolPlanningView runId={runId} />
}
if (mode === 'execute') {
  return <ExecutionView runId={runId} ... />
}
// else plan/design -> DeckViewer (existing)
```

---

### Task B4: Scaffold `ProtocolPlanningView` + default `main` step

**Files:**
- Create: `app/src/run/protocol-planning/ProtocolPlanningView.tsx` + `.tsx test`
- Modify run creation so every run's method has a default single step

**Objective (user item 3):** by default every run has a single-step protocol named `main`, non-deletable — so Design/Execute are always consistent.

**Implement (data):** a helper that guarantees a default step list when a run has no method/protocol:
```ts
// app/src/run/protocol-planning/defaultPlannedSteps.ts
export function ensureDefaultSteps(steps: ProtocolStep[]): ProtocolStep[] {
  if (steps.length > 0) return steps
  return [{ stepId: 'main', ordinal: 1, label: 'Main', kind: 'other', description: 'Single default step' }]
}
```
Apply in the step-fetch path so the UI never shows a method with zero steps. Enforce non-deletable: the step chip UI disables delete when `steps.length === 1` or `step.stepId === 'main'`.

**Scaffold `ProtocolPlanningView`** (placeholder this task): loads the run's attached protocol (via `protocol-context` / the run's `methodEventGraphId` + `plannedRunRef`), renders step chips via `ensureDefaultSteps`, and shows "Protocol Planning" header. Full behavior lands in Phases C/D.

**Test:** `ensureDefaultSteps([])` returns the `main` step; view renders one chip.

---

## Phase C — Protocol localization (universal → lab-specific)

User item 4: turn a universal vendor protocol into a local, executable protocol specific to this lab's instruments (e.g., QuantStudio 5 vs Bio-rad) and labware.

**Leverage existing machinery (verified):**
- `local-protocol` record kind (`schema/workflow/local-protocol.schema.yaml`): `inherits_from` (→ global protocol), `overrides` (bindings/parameters/substitutions/timing_policies/tip_policies), `lab_state_refs`.
- `server/src/protocol/ProtocolContextService.specializeForExperiment(protocolId, studyId, experimentId)` already creates a `local-protocol` that `inherits_from` a protocol.
- Lab capability matching: `server/src/capabilities/EquipmentCapabilityService.ts` (equipment-capability records).

### Task C1: List lab inventory + instruments inside ProtocolPlanningView

**Files:** `app/src/run/protocol-planning/ProtocolPlanningView.tsx`, new `app/src/run/protocol-planning/LabInventoryPanel.tsx` (+ test)

**Implement:** a panel reading lab equipment/instruments (from `equipment`/`equipment-capability` records via `apiClient`) and the current lab state, so the user can see "which instrument do we have" (QuantStudio 5 / Bio-rad) and labware/deck options. Keep it a compact two-pane addition **inside the right pane tabs** (project convention: no third pane / no pre-built widget libs).

### Task C2: "Create local protocol" from the universal protocol

**Files:** `app/src/run/protocol-planning/ProtocolPlanningView.tsx`, client API (`app/src/shared/api/protocols.ts`), existing `ProtocolContextService.specializeForExperiment`

**Implement:**
```ts
await apiClient.specializeProtocolForExperiment({ protocolId, studyId, experimentId, title: `${protocol.title} (local)` })
```
Returns a `local-protocol` record that `inherits_from` the universal protocol. Add a button in `ProtocolPlanningView`: "Create local protocol for this lab". After creation, load the local-protocol as the run's working method (or link it via the run's `plannedRunRef`).

**TDD:** a `ProtocolContextService` test asserting `specializeForExperiment` yields a record with `inherits_from.ref.id === protocolId` and `overrides` present (`server/src/protocol/ProtocolContextService.test.ts` — extend existing).

### Task C3: Capture instrument/labware adaptations as `overrides`

**Files:** `ProtocolPlanningView.tsx`, `app/src/run/protocol-planning/adaptation.ts` (+ test)

**Implement** a small editor (within the planning tab) mapping: instrument role → concrete instrument, material roles → concrete stocks/specs, tip/labware roles → concrete labware. Serialize to `overrides.substitutions`/`bindings` per the local-protocol lifecycle spec, then PATCH the local-protocol. Keep it simple (a table of role → concrete record), extensible later.

---

## Phase D — Click-step → highlight-detail → AI-ghost loop (user item 5)

### Task D1: Add `currentStepId` + per-step preview layering

**Files:**
- Modify: `app/src/event-editor/protocol/ProtocolSelectionContext.tsx` (add `currentStepId`, `setCurrentStep(stepId)`)
- Modify: `app/src/event-editor/protocol/ProtocolPreviewBridge.tsx` — don't ghost **all** visible steps as one flat layer; instead tag each preview event with its originating `stepId` and render past vs current distinctly

**Implement:** keep `visibleSteps` but add `currentStepId`. When building the preview layer, group by stepId: past (`ordinal < current`) → dimmed layer; current → highlighted (`data-affected`); keep the existing clear-guard (`sourcePrompt === 'Protocol step preview'`). Deck styling via `eventEditor.css`:
```css
.event-editor .tile[data-past-step='true'] { opacity: 0.4; filter: grayscale(0.6); }
.event-editor .tile[data-current-step='true'] { outline: 2px solid var(--cl-accent); }
```

**TDD:** `ProtocolSelectionContext` test — setting `currentStepId` and toggling visibility yields a preview whose events carry `stepId` and correct past/current flags.

### Task D2: Step detail pane with selectable long-form text

**Files:**
- Create: `app/src/run/protocol-planning/StepDetailPane.tsx` (+ test)
- Reuse: the text selection → custom event pattern from `AiTabPanel.tsx:489-499`

**Implement:** when a step chip is selected, show below it (same right-pane tab, per two-pane convention) a `<pre>` of the long-form detail for that step (from `humanStepsText`; split by the verb/step text). The user can select a subsection. A "Send selection to AI" button captures `{ stepId, stepLabel, highlightedSection }` and dispatches a custom DOM event `protocol-step-selection` (mirror `pdf-text-selection`).

### Task D3: Inject step + highlight context into the AI chat

**Files:**
- Modify: `app/src/event-editor/right-pane/ai/AiTabPanel.tsx` — add a `protocol-step-selection` listener that calls `chat.send(...)` with a prefixed prompt
- Modify: the `AiContext.surfaceContext` builder for the protocol-planning surface to include `protocolStepContext`

**Context payload (verified injection point — `AiContext.surfaceContext`, sent via `streamAssist`):**
```ts
contextPayload.protocolStepContext = {
  protocolId, currentStepId, currentStepLabel,
  highlightedSection, highlightedSectionRange: { start, end },
  pastStepIds: [...], currentStepEvents: [...],
}
```

### Task D4: Backend consumes `protocolStepContext`

**Files:**
- Modify: server prompt assembly (the event-graph agent / compiler context builder) to render `protocolStepContext` into the system/user prompt (step label, highlighted section, past events for material-concentration continuity)

**Implement:** when present, append to the prompt:
```
CURRENT PROTOCOL STEP: <label>
User-highlighted detail: "<highlightedSection>"
Adapt this step to this lab. Prior steps' events (for concentration context): <count> events.
Ghost the events for THIS step onto the editor.
```

### Task D5: AI ghosts current-step events; past dimmed (verify end-to-end)

**Files:** existing `useAiChat` preview + `ProtocolPreviewBridge` per-step layering (from D1)

**Verification (end-to-end):** in `?mode=protocol-planning`, click step 2, highlight a subsection, send to AI → the AI's draft ghosts step-2 events highlighted while step-1 events stay dimmed on the deck; material concentrations from step 1 remain visible (grey) for context.

---

## Files Summary (changed/created)

**Phase A**
- `schema/workflow/protocol.schema.yaml` (+`humanStepsText`)
- `schema/workflow/protocol.ui.yaml` (reorder + collapsible full text)
- `server/test/protocol/schema-validate.test.ts`
- `app/src/extraction/ExtractionReviewPage.tsx` (capture+forward `raw`)
- server promote handler (store `humanStepsText`)
- `app/src/lab/LabEntityWorkspace.tsx` (+ test)

**Phase B**
- `app/src/run/lib/mode-toggle.tsx` (+ test)
- `app/src/run/RunWorkspacePage.tsx`
- `app/src/run/protocol-planning/ProtocolPlanningView.tsx` (+ test)
- `app/src/run/protocol-planning/defaultPlannedSteps.ts` (+ test)

**Phase C**
- `app/src/run/protocol-planning/LabInventoryPanel.tsx` (+ test)
- `app/src/run/protocol-planning/adaptation.ts` (+ test)
- `server/src/protocol/ProtocolContextService.ts` (extend test for specialize)
- `app/src/shared/api/protocols.ts`

**Phase D**
- `app/src/event-editor/protocol/ProtocolSelectionContext.tsx`
- `app/src/event-editor/protocol/ProtocolPreviewBridge.tsx`
- `app/src/event-editor/styles/eventEditor.css` (past/current step styles)
- `app/src/run/protocol-planning/StepDetailPane.tsx` (+ test)
- `app/src/event-editor/right-pane/ai/AiTabPanel.tsx` (`protocol-step-selection` listener)
- `app/src/types/aiContext.ts` / surface builder (`protocolStepContext`)
- server prompt/compiler context assembly (`protocolStepContext`)

---

## Tests / Validation

- Per task TDD (RED → GREEN) using existing vitest config (server `src/**/*.test.ts` + `test/**/*.test.ts`; app `app/src/**/*.test.tsx`).
- **Server typecheck:** `cd server && npx tsc --noEmit`. **App typecheck:** `cd app && npx tsc --noEmit`.
- **Critical pitfall on schema validation:** always test with **all schemas loaded** into Ajv (see `schema` notes); `unevaluatedProperties:false` means any new field must be explicitly declared.
- End-to-end manual script: create run → `?mode=protocol-planning` → load CAN-protocol → create local-protocol → step 2 → highlight subsection → AI ghost (past dimmed, current highlighted) → switch to Design → events present → switch to Execute → play steps.

## Risks / Tradeoffs / Open Questions

- **`humanStepsText` provenance:** the long-form currently lives only in the `/extraction/human-steps` response (`raw`, dropped by client). Wiring it into promote is the single riskiest change — confirm the promote body contract before editing server handlers.
- **Per-step preview layering** changes `ProtocolPreviewBridge` behavior used today by the Protocol tab (design). Keep the flat "ghost all visible steps" as a flag and only opt into per-step layering in protocol-planning mode to avoid regressing the existing deck ghosting (gap-analysis: deck ghosting is a core UX differentiator, currently ✅).
- **Mode naming:** user calls it "protocol design" (current `plan`), a third "protocol planning" (localization), and execute. Keep URL enum `'plan'|'execute'|'protocol-planning'` for back-compat; label Design/Execute/Protocol Planning in UI.
- **"Same verbs, same order" invariant** for local-protocols means adaptations are **additive overrides only** — a radically different lab workflow is a *sibling global protocol*, not a local override (per lifecycle spec §5). Plan C must not let the UI reorder/rettype global steps implicitly.
- **Default `main` step** is additive and non-deletable; ensure existing run-creation paths (quickCreateRun, use-in-run) route through `ensureDefaultSteps` so no run ever has zero steps.
- Open: should protocol-planning live at `/runs/:id?mode=protocol-planning` (recommended, no new route) or as its own route? Recommended: query param, per exploration.
- Open: where `humanStepsText` splits per step (paragraph/numbered regex) for the StepDetailPane — propose splitting on `^\s*\d+\.` lines.

## Execution Handoff

Plan complete and saved. Ready to execute using subagent-driven-development — I'll dispatch a fresh subagent per task with two-stage review (spec compliance then code quality). Shall I proceed?
