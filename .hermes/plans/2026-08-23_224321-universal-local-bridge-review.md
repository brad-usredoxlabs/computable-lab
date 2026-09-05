# Universal→Local Protocol Bridge Review & Fix Plan

> **For Hermes:** Use subagent-driven-development to implement this plan task-by-task.
>
> **Goal:** Fix the universal→local protocol bridge in the run workspace so that (1) the
> one-shot localization is the primary, automatic path when a universal protocol loads,
> (2) the AI actually sees the lab's inventory (instruments/labware), (3) conditional
> if/then branches are resolved by the dialogue instead of leaking into step 1, and
> (4) the first step is a labware-loading bootstrap onto the chosen deck.

**Architecture:** The bridge spans two surfaces — the collapsed **one-shot chat thread**
(`ProtocolLocalizationThread`) and the **Protocol Planning view** (adaptation table). Both drive
the same small-model scientist-intent compiler (`/intent/compile-from-prompt`)). The fix makes the
one-shot flow load-first, injects a lab-inventory context block into the model prompt, auto-runs
branch-question extraction on protocol load, and adds a deck-load bootstrap step.

**Tech Stack:** React (app), Fastify + scientist-intent compiler (server), `app/src/run/protocol-planning/*`,
`app/src/event-editor/right-pane/protocol/*`, `server/src/compiler/scientistIntent/*`,
`server/src/api/handlers/IntentCompileFromPromptHandlers.ts`.

---

## Browser review — findings (evidence-based, all four points)

Inspected `http://computable:5174/runs/RUN-2026-08-24-run-2k2e` (Zymo protocol, 17 steps), the
`ProtocolTabPanel`, `ProtocolLocalizationThread`, `ProtocolPlanningView`, the scientist-intent
compiler prompt, and `RunContextAssembler`.

### Point 1 — "one-shot localization isn't built into the UI"
**PARTLY IMPLEMENTED, but buried.** The one-shot thread EXISTS in the UI:
- `ProtocolTabPanel.tsx:1517` renders `<details className="protocol-localization-details">` with
  summary **"Localize a universal protocol in chat (one-shot)"**, collapsed by default, and it
  auto-picks `protocolContext.availableProtocols[0]` (NOT necessarily the Zymo one).
- The `ProtocolLocalizationThread` (`app/src/event-editor/right-pane/protocol/ProtocolLocalizationThread.tsx`)
  is fully functional: pastes protocol → `intentCompileFromPrompt` → branch questions → one-shot
  macro → `ghostEvents` on deck → Accept. So it IS built, but **collapsed by default** and not the
  primary path — a user who just clicks the Zymo protocol does not see it.

### Point 2 — "does the AI know the local library?"
**NO, not in the one-shot compiler.** Evidence:
- The one-shot compiler's `INTENT_COMPILE_SYSTEM_PROMPT` (`server/src/compiler/scientistIntent/intentCompile.ts:46`)
  contains **NO lab inventory** (no instruments, no labware, no materials) — it only translates
  free text to intent YAML.
- `compileFromSmallLlm` calls a forced tool `buildScientistIntentTool()` (intent-only); it does
  NOT call `inventory_list`. `AGENT_ALLOWED_TOOLS` DOES include `inventory_list`
  (`server/src/ai/ToolBridge.ts:28`), but the one-shot path never uses it.
- The frontend `LabInventoryPanel` renders instruments to the **user** in Protocol Planning mode,
  but never feeds them to the model. The step-localize prompt says "for THIS lab's instruments and
  labware" (`protocolStepSelection.ts`) but doesn't attach the actual list.
- So the AI genuinely does NOT know what instruments/labware the lab has during one-shot
  localization. **True gap.**

### Point 3 — "loading universal protocol bypasses one-shot → if/then in step 1"
**CONFIRMED.** Browser shows the run's Protocol tab with the `<details>` collapsed and step 1
rendered verbatim as:
  > "Step 1: Add sample to the BashingBead™ Lysis Module... a. If using ZymoBIOMICS™ Lysis Rack...
  > b. If using ZR BashingBead™ Lysis Tubes..."
The `BranchPicker` (`app/src/event-editor/protocol/BranchPicker.tsx`) can select branch axes and
call `onLocalize`, but it is **not auto-invoked** when the universal protocol loads. `extractBranchQuestionsFromSmallLlm`
exists server-side but is only reached if the user manually expands the one-shot thread and clicks
Localize. So the default load path lands on raw if/then prose. **True gap.**

### Point 4 — "bootstrapping: step 1 should be load labware onto deck"
**TRUE.** The deck starts empty (`Manual deck`, "Click to choose labware"). The compiler emits
symbolic labware and expects the resolver to bind them, but there is no first-class affordance for
"load the labwares this run needs onto the deck first." For the user's real workflow (cryoking tubes
in 96-well plates in their bead basher, with a custom jig to load beads), the visualization is wrong
until the user manually places labware. Step 1 should meaningfully be "load labware onto the chosen
deck." **True gap.**

---

## Proposed approach

1. **One-shot becomes load-first (Points 1+3):** When a universal protocol is attached to a run,
   auto-expand the one-shot `<details>` (or auto-invoke it), and auto-run `extractBranchQuestions`
   so the if/then branches are asked *before* the user lands on steps — never render raw
   "a. If ... b. If ..." in step 1.
2. **Inject lab inventory into the model context (Point 2):** In `compileFromSmallLlm` /
   `IntentCompileFromPromptHandlers`, load the lab's instruments + labware + material inventory and
   prepend a `LAB INVENTORY:` block to the user prompt (and/or expose an `inventory_list` tool the
   one-shot path can call). Give the model the actual QuantStudio5, bead basher, plates, custom jig.
3. **Deck-load bootstrap step (Point 4):** Add a first-class "Load labware onto deck" step that is
   the starting state of Protocol Planning / Design: present the lab's available labware from
   inventory, let the user choose which to place on the chosen deck, and have the compiler/events
   bind to those loaded labwares.
4. **Auto-resolve branches on load:** Wire `protocolContext → onLoad` to run branch extraction and
   default the BranchPicker resolution so a concrete starting step set is derived before step 1.

---

## Step-by-step plan (TDD, bite-sized)

> Run app tests from `app/` cwd; server tests from `server/` cwd. `npx vitest run <file>`.
> Typecheck: `cd app && npx tsc --noEmit`. Commit after each task.

### Task 1: Auto-run branch-question extraction when a universal protocol loads (Point 3)
**Objective:** When a run has an attached universal protocol, the run's Protocol tab auto-runs
`extractBranchQuestions` and surfaces the axis choices for the user to resolve before steps show.

**Files:**
- Modify: `app/src/event-editor/right-pane/protocol/ProtocolTabPanel.tsx` (around the `<details>`
  at line 1517 and the protocol-load effect)
- Modify: `server/src/api/handlers/IntentCompileFromPromptHandlers.ts` (ensure the handler returns
  axes when called without answers, and add `protocolId` → text resolution if needed)
- Test: `app/src/event-editor/right-pane/protocol/ProtocolTabPanel.test.tsx` (new: asserts that on
  protocol attach, the branch axis chips render / a Localize-error is not thrown)

**Step 1:** Add a failing test: render ProtocolTabPanel with a run that has a universal protocol
(fetch mocks for protocol context returning availableProtocols), assert that `intentCompileFromPrompt`
is called with the protocol text and no answers, and that `setAxes` results in a branch-axis prompt
visible (not raw step 1 if/then).
**Step 2:** Run test — expect FAIL (axes never rendered by default).
**Step 3:** In `ProtocolTabPanel`, add a `useEffect` on protocol-context load that, when a universal
protocol is attached, calls the one-shot handler's first phase (no answers) and sets axes state;
open the `<details>` by default when axes are present.
**Step 4:** Run test — expect PASS.
**Step 5:** Commit: `feat(protocol): auto run branch questioning when a universal protocol loads`.

### Task 2: Persist resolved branches onto the starting step set (Point 3)
**Objective:** Once the user answers the axes, derive and persist the resolved starting step set so
step 1 is concrete (no "a. / b." leakage).

**Files:**
- Modify: `server/src/compiler/scientistIntent/intentCompile.ts` — confirm `compileScientistIntent`
  uses the `answers`/branch axis to resolve the active starting step set (already partly present via
  `compileScientistIntent`; ensure the `answers` flow feeds it).
- Modify: `app/src/event-editor/right-pane/protocol/ProtocolLocalizationThread.tsx` — after
  `handleSubmitAnswers`, use the returned `terminalArtifacts` + resolved steps.
- Test: `server/src/compiler/scientistIntent/scientistIntent.test.ts` — add a case: given a
  universal protocol text + branch answers, the compiled intent resolves the if/then to a single
  starting step set (no leftover "If using A / If using B").

**Steps:** failing test → run (FAIL) → implement → run (PASS) → commit
`feat(compiler): resolve branch axes to a concrete starting step set`.

### Task 3: Inject lab inventory into the one-shot model context (Point 2)
**Objective:** The AI actually sees the lab's instruments, labware, and materials during one-shot
localization.

**Files:**
- Modify: `server/src/compiler/scientistIntent/intentCompile.ts` — extend `IntentCompileFromPromptArgs`
  with an optional `labInventory` block; when present, prepend it to the user prompt as
  `LAB INVENTORY (this lab owns): <instruments> <labware> <materials>`.
- Modify: `server/src/api/handlers/IntentCompileFromPromptHandlers.ts` — load lab inventory
  (`listRecordsByKind('equipment'|'labware'|'material')` or `/semantics/instruments`,
  `/materials/inventory`) and pass it into `compileFromSmallLlm`.
- Test: `server/src/compiler/scientistIntent/scientistIntent.test.ts` — new: when `labInventory` is
  provided, the prompt passed to the client includes the instrument/labware names (assert on the
  mocked client call); when omitted, no inventory block.

**Steps:** failing test → FAIL → implement server-side inventory assembly + prompt injection → PASS →
commit `feat(compiler): inject lab inventory into one-shot localization prompt`.

### Task 4: Expose an `inventory_list` tool to the one-shot path (Point 2, tool-first)
**Objective:** Give the small model a tool it can call to enumerate the lab's inventory when a
prompt doesn't name instruments/labware.

**Files:**
- Modify: `server/src/compiler/scientistIntent/intentCompile.ts` — add `inventory_list` to the
  tool set the one-shot compiler can call; register a handler that returns the lab's equipment +
  labware + material names.
- Modify: `server/src/ai/ToolRegistry.ts` / the intent tool registration (`buildScientistIntentTool`)
  — wire an inventory tool.
- Test: `intentCompile.test.ts` — the one-shot tool list includes `inventory_list`; invoking it
  returns lab names.

**Steps:** test → FAIL → implement → PASS → commit
`feat(compiler): one-shot localizer can call inventory_list`.

### Task 5: Deck-load bootstrap step (Point 4)
**Objective:** The first thing the user does when localizing is load the labwares they want onto the
chosen deck — their 96-well plates, cryoking tubes, and custom bead-basher jig — so the
visualization is correct.

**Files:**
- Modify: `app/src/run/protocol-planning/ProtocolPlanningView.tsx` — add a "Step 1: Load labware
  onto deck" section (or a pre-step) before the adapted steps; populate available labware from
  `LabInventoryPanel` data; let the user place each onto the deck (reuse deck `labwareAdditions`).
- Modify: `app/src/run/protocol-planning/adaptation.ts` — extend `AdaptationDraft` to carry a
  deck-labware selection so it PATCHes onto the local protocol as a concrete labware binding.
- Test: `app/src/run/protocol-planning/ProtocolPlanningView.test.tsx` — new: the deck-bootstrap
  step renders labware options from the lab inventory and persists a chosen labware onto the deck.

**Steps:** test → FAIL → implement bootstrap → PASS → commit
`feat(protocol): deck-load bootstrap step first`.

### Task 6: One-shot is the primary load path (Point 1)
**Objective:** Opening a run with a universal protocol surfaces the one-shot localization as the
main action (not a collapsed footnote).

**Files:**
- Modify: `app/src/event-editor/right-pane/protocol/ProtocolTabPanel.tsx` — expand the `<details>`
  by default when a universal protocol is attached (linked to Task 1's auto-questions); move a
  prominent "Localize for this lab" affordance above the steps.
- Modify: `ProtocolLocalizationThread.tsx` — when `sourceProtocolId` is set, preload the source
  protocol text into `protocolText` so the Localize button works immediately.

**Steps:** failing test (ProtocolTabPanel renders the one-shot expanded when a universal protocol is
present; Localize button enabled with prefilled text) → FAIL → implement → PASS → commit
`feat(protocol): one-shot localization is the primary load path`.

### Task 7: Full end-to-end verification (browser + suites)
**Objective:** Prove the whole bridge against a live browser pass + unit suites.

**Files:**
- Docs: create `docs/universal-local-bridge.md` describing load→questions→inventory→macro→
  deck-bootstrap→accept.

**Steps:**
1. `cd app && npx vitest run src/event-editor/right-pane/protocol src/run/protocol-planning`
   — expect all new + existing pass (excluding known pre-existing mock failures).
2. `cd server && npx vitest run src/compiler/scientistIntent src/api/handlers/IntentCompileFromPromptHandlers.test.ts`
   — expect pass.
3. `cd app && npx tsc --noEmit` — expect 0 errors.
4. Browser: open `RUN-2026-08-24-run-2k2e`, Protocol tab → one-shot expanded → branch questions
   shown → localize → inventory visible → deck bootstrap step lets user place 96-well plate +
   cryoking tubes + custom jig → macro ghosts with those labwares → Accept persists.
5. Commit: `docs(protocol): universal→local bridge behavior`.

---

## Files likely to change (summary)

**Frontend (app):**
- `app/src/event-editor/right-pane/protocol/ProtocolTabPanel.tsx`
- `app/src/event-editor/right-pane/protocol/ProtocolLocalizationThread.tsx`
- `app/src/run/protocol-planning/ProtocolPlanningView.tsx`
- `app/src/run/protocol-planning/adaptation.ts`
- tests: `ProtocolTabPanel.test.tsx`, `ProtocolPlanningView.test.tsx`

**Backend (server):**
- `server/src/compiler/scientistIntent/intentCompile.ts` (inventory prompt + inventory tool)
- `server/src/api/handlers/IntentCompileFromPromptHandlers.ts` (load inventory, resolve id→text)
- `server/src/ai/ToolRegistry.ts` (wire inventory tool)
- tests: `scientistIntent.test.ts`, `IntentCompileFromPromptHandlers.test.ts`

## Risks, tradeoffs, open questions

- **Two localization surfaces already exist** (one-shot thread + Protocol Planning adaptation
  table). This plan makes one-shot the load-first path but deliberately does NOT rip out the
  adaptation table — they must not diverge. Open Q: should Protocol Planning route through the
  one-shot macro going forward, or stay as the manual override? (Default: keep both, one-shot
  primary.)
- **Lab inventory is lab-global, not study-scoped** (`LabInventoryPanel` comment: "inventory is
  lab-global so we load all"). Confirmed appropriate — localization must see the whole lab, not one
  study.
- **Small-model cost/latency:** calling `extractBranchQuestions` on every protocol load adds one
  LLM round-trip. Acceptable (it replaces wasted if/then resolution later), but consider gating on
  protocol text containing conditional markers ("If using", "either", "choose").
- **`exactOptionalPropertyTypes`** (server): optional `labInventory` / `deckLabware` fields must be
  conditionally spread, never `undefined`.
- **Deck-labware binding correctness:** the compiler's `resolve_labware` must still bind event
  `source_labware`/`destination_labware` to the loaded deck labwares; ensure the bootstrap writes
  concrete labware ids (not symbolic) so Task 5's deck placements flow through the resolver.
- **Ordering with the existing run flow:** the deck bootstrap step must feed `EventEditorContext`
  (like `ghostEvents` does) so committed deck labwares appear in Design mode immediately.
- **Open Q for Phase 0 gate:** should the deck-load bootstrap be a *hard prerequisite* (cannot
  proceed past step 0 until labware is placed) or a *soft* first step (suggested, skippable)?
  Default: soft-first, with a visual "Load labware to start" callout.
