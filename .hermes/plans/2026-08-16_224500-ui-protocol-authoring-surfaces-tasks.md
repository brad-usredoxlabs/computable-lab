# Protocol Authoring Surfaces — PDF↔Step Sync + Conditional Branch UI + Step Editing (Implementation)

**Date:** 2026-08-16
**Status:** Plan mode (design + task breakdown; no code changed). Decisions from interview LOCKED.
**Owner:** Architect (122B)

> **For Hermes:** Use subagent-driven-development to execute task-by-task after approval.

**Goal:** Four UI upgrades to the protocol authoring surface: (F1) click a step → PDF + extracted-text jump to that step's source, highlighted; (F2) picker of if/then/else/or branches that rebuilds the step list into a **subset working copy**; (F3) labware/material/equipment become **branch-scoped** with **branch-triggered step insertion**; (F4) steps can be **delete/merge/split** with a binding-cascade.

**Architecture:** The universal `protocol` is **read-only** (source of truth). Localization starts from a **working copy** (LPR draft). The branch picker + all step edits operate on that copy. Data layer is already built: `branch_axes` conditions → `BranchResolver` → phase-0 localization (`lowerToLabProtocol` + `resolve_branch_axes` pass). This plan is mostly **frontend surfaces + two small backend extensions** (PDF anchor; resource/step insertion on branch) over that.
**Tech Stack:** React (`app/src/event-editor/right-pane`, `PdfViewer`/`PdfStateProvider`, `editor/taptab`), two-pane layout; server `server/src/protocol/ProtocolCompiler.ts` + a new pure `deriveBranchAxes`-adjacent modules; TDD (Vitest); live-browser reachability per user convention.

## LOCKED decisions (interview round 2)
1. Universal protocol is read-only; all editing happens on an **LPR working copy**.
2. **F2:** user picks high-level branch choices, **then** a **subset working copy** is made (shared ∪ chosen-branch steps; un-picked never shown). Option-boxes per axis that **redraw as you select** and are re-visitable (move back up).
3. **F3:** per-branch resource sets **and branch-triggered step insertion** are permitted (e.g. plant branch adds a pre-freeze step).
4. **F4:** merge **auto-concats** actions into one logical step (events stay distinct in the event graph).
5. F2/F4 operate on the working copy by default.

## Existing pieces (verified — reuse, don't rebuild)
`pdf` tab → `PdfViewer`+`PdfStateProvider`; `rightPaneMode='protocol'` → `ProtocolTabPanel`; `ProjectionTapTabEditor` (editable protocol doc); vendor `ProtocolStepCandidate` has `sourceText`+`provenance.pageStart`; `protocol.branch_axes[]` + `BranchResolver` + phase-0 localization (both `lowerToLabProtocol` and `resolve_branch_axes` pass); `protocol.producedArtifacts[]`. (Chaining is a SEPARATE plan — see follow-up.)

---
## Tier 0 — shared wiring (do first)

### Task 0-1: "Localize to subset copy" client endpoint + server pass
**Objective:** given a universal `protocol` + `branchChoices`, return a **subset working copy** (LPR draft payload: resolved-branch steps + `branch_resolution[]` + inherited roles).
**Files:** Server: reuse `ProtocolCompiler.lowerToLabProtocol` phase-0 (already does exactly this); add a thin handler/expose `localizeProtocolSubset` returning the LPR draft body. Client: `app/src/shared/api/` client fn.
**Step 1 (TDD):** server test — `lowerToLabProtocol` with branchChoices returns steps = shared ∪ chosen-branch, `branch_resolution` present; un-picked steps absent (already covered by `ProtocolCompiler.branch.test.ts` — extend for the LPR-draft-as-response shape).
**Step 2:** expose the handler; assert response shape.
**Step 3:** commit.
**Verify:** `cd server && npx vitest run <file> && npx tsc --noEmit`.

### Task 0-2: Working-copy cursor in the right pane
**Objective:** the right-pane `protocol` surface opens against the **working copy** (not the universal), so edits never touch the source.
**Files:** `app/src/event-editor/right-pane/protocol/ProtocolTabPanel.tsx`.
**Verify:** picking a branch produces a new copy id; the editor binds to the copy.

---
## Tier 1 — F2 (recommended first)

### Task F2-1: `BranchPicker` renders one option-group per branch axis (re-visitable)
**Objective:** render `branch_axes[]` → a group of option boxes per axis; selecting sets `branchChoices[axisId]=conditionId`; a "clear" lets the user move back up and re-pick.
**Files:** Create `app/src/protocol-authoring/BranchPicker.tsx` (+test).
**Verify:** grouping + re-visit behavior; `npx vitest run` + `npx tsc`.

### Task F2-2: On complete-pick → build subset working copy (rebuild steps)
**Objective:** an explicit "Localize" action takes the accumulated `branchChoices`, calls Task 0-1, and replaces the working-copy step list with the subset.
**Files:** `BranchPicker.tsx` → `ProtocolTabPanel` → `localizeProtocolSubset` client fn.
**Verify:** picking branches rebuilds the visible step list (live browser); earlier choices re-widen.

---
## Tier 1 — F1 (independent)

### Task F1-1: Step→PDF anchor module (server, TDD)
**Objective:** map a step to a stable text anchor `{ page, startText, endText }` from `sourceText`/`provenance.pageStart`.
**Files:** Create `server/src/ingestion/vendor-protocol/StepPdfAnchor.ts` (+test).
**Verify:** anchor round-trips for both PDF + extracted text.

### Task F1-2: Scroll + highlight in PDF view AND extracted-text panel
**Objective:** step-chip "locate" affordance scrolls the PDF to the page/span and highlights, and scrolls the extracted-text panel to the same span.
**Files:** `PdfStateProvider.scrollTo(anchor)`; extracted-text panel; step chips.
**Verify:** live browser — click step → both panels jump + highlight, associated table/figure on-screen.

---
## Tier 2 — F4

### Task F4-1: `deleteStep(protocolCopy, stepId)` pure cascade (server TDD)
**Objective:** remove the step + its `overrides.bindings/substitutions` rows + its `branch_axes` `then_stepIds`/condition (clean empty axes) + its equipment ref.
**Files:** Create `server/src/compiler/protocol/WorkcopyEdit.ts` (+test).
**Verify:** "deleting the shake step removes its shaker binding and its branch entry."

### Task F4-2: UI delete/menu + confirm; merge (auto-concat) + split
**Objective:** per-step overflow menu (Delete / Split / Merge-with…). Merge auto-concats actions into one logical step; split divides at the chosen action boundary.
**Files:** `app/src/protocol-authoring/StepEditorMenu.tsx` (+test).
**Verify:** merge of salt+ethanol → one "precipitate DNA" logical step, events stay distinct; split by boundary; delete cascades.

---
## Tier 3 — F3

### Task F3-1: branch-scoped resources + step insertion (schema + resolver, TDD)
**Objective:** extend a branch condition with `then_resourceRefs` (equipment/labware/material refs) + optional `insert_steps`: (`e.g.` plant branch inserts a pre-freeze step). `BranchResolver` unions resource refs + inserted steps for the active branch.
**Files:** `schema/core/datatypes/condition.schema.yaml` (add fields, additive); `server/src/protocol/BranchResolver.ts` + tests; `ProtocolCompiler` returns resolved resources.
**Verify:** bead-beater = shared-but-not-universal (bacteria+plant); −80 °C freezer = plant-only; plant's pre-freeze step appears on-selection.

### Task F3-2: branch-aware resource pickers (surface)
**Objective:** labware/material/equipment pickers read the active branch's resolved refs; bound resources follow their steps.
**Files:** `app/src/protocol-authoring/ResourcePicker.tsx`.
**Verify:** pick plant → freezer + large bead + pre-freeze appear; mammalian → neither.

---
## Tests / validation
- Every pure function (`anchorForStep`/`deleteStep`/`mergeSteps`/resolve-resources) TDD'd (server cwd vitest).
- Frontend component tests; `npx tsc --noEmit` server+app.
- **Live browser pass** per user convention: reach each surface, see it change.
- Full-suite: zero new failing tests over baseline (76 failed / 3294 passed / 2 pre-existing errors / 1 pre-existing `slugify` tsc error).

## Risks / trade-offs / notes
- F1 PDF hit-highlight can be finicky (text-layer offsets) — the extracted-text panel is always exact (same token); the rendered-PDF highlight may be best-effort first.
- F3 is the largest; keep it last so F2's branch UX settles first.
- Destructive step edits need undo/confirm + "recompile N run" guard (snapshot provenance).
- Keep two-pane layout (center=surface, right=tabbed); no third pane.

---
Plan complete and saved. Ready to execute via subagent-driven-development. Recommended order: **Tier 0 → F2 → F1 → F4 → F3**. This was the **first plan**. Interview for the **second plan** (protocol chaining RNA→rtPCR) next.
