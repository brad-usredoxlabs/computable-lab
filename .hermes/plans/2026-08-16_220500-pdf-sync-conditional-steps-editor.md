# PDF↔Step Sync + Conditional-Branch UI + Step Editing — Protocol Authoring Surfaces

**Date:** 2026-08-16
**Status:** Plan mode (design + breakdown; no code changed).
**Owner:** Architect (122B)

> **For Hermes:** Use subagent-driven-development to execute task-by-task after approval.

**Goal:** Four UX upgrade to the protocol authoring surface, in realistic, independently-shippable tiers:
(1) click a step → the PDF (and its extracted-text panel) jump to that step's source section, highlighted;
(2) resolving a protocol's if/then/else/or **redraws the step list** from an explicit, re-visitable branch picker;
(3) labwares/materials/equipment become **branch-aware** (bound to the same conditional logic);
(4) steps can be **deleted / merged / split**, with a binding-cascade (delete a step → its equipment/material bindings go with it).

**Architecture:** Frontend surfaces over the *already-built* backend branch model. The good news up front: **feature 2's data layer already exists** — `protocol.branch_axes[]` (conditions over a `choices` map), `BranchResolver` (choices → starting step set), and phase-0 localization that rebuilds the step list from a resolved branch (`ProtocolCompiler.lowerToLabProtocol` + the `resolve_branch_axes` pass on `local-protocol-compile`). So feature 2 is almost pure UI wiring onto a working backend. Features 1/3/4 are moderate surface + one data-model extension each.

**Tech Stack:** React (`app/src/event-editor/workspace`, `app/src/editor/taptab/TapTabEditor`, `PdfViewer`/`PdfStateProvider`), right-pane workspace modes, `app/src/types/events.ts`; backend `server/src/protocol/ProtocolCompiler.ts`, `branch_axes`/`BranchResolver`. TDD (Vitest) for any new logic; UI reachability checked live (per user's convention: changes must be VISIBLE in the state he navigates).

---

## 1. What already exists (verified — do not rebuild)

| Concern | Exists today | Where |
|---|---|---|
| PDF in a workspace pane | ✅ | `pdf` `WorkspaceTab` → `leftPane={<PdfViewer/>}` + `PdfStateProvider` (`ProjectWorkspacePage.tsx:240`) |
| Extracted-text surface | ⚠️ partially | ingestion extraction shows candidate steps/notes; a dedicated "extracted text" panel below the PDF is NOT confirmed a unified surface |
| Right-pane protocol surface | ✅ | `rightPaneMode='protocol'` → `ProtocolTabPanel`; auto-switch for deck+runId (`RunWorkspacePage.tsx:161`); editable protocol = `ProjectionTapTabEditor` |
| Step → source anchor mapping | ⚠️ raw only | vendor `ProtocolStepCandidate` carries `sourceText` + `provenance.{documentId,pageStart}`; not surfaced in the PDF view today |
| Declarative branches (`branch_axes`) + resolver | ✅ | `schema/core/datatypes/condition.schema.yaml`, `protocol.branch_axes`, `server/src/protocol/BranchResolver.ts` |
| Localization rebuilds steps from a branch choice | ✅ | `ProtocolCompiler.lowerToLabProtocol` phase-0 filter + `resolve_branch_axes` pass |
| Roles / substitutions / bindings | ✅ | `protocol.roles`, `local-protocol.overrides.{bindings,substitutions}` |
| Two-pane layout rule | ✅ | center = surface, right = tabbed (`app/src/event-editor/right-pane/RightPane.tsx`) |

---

## 2. Feature-by-feature design

### Feature 1 — Step → PDF sync + highlight (jump into context)

**Goal:** Click a protocol step → the PDF and its extracted-text panel scroll to that step's source section and highlight it, exposing the associated graph/table.

**What already helps:** the extractor already records each step's `sourceText` and `provenance.pageStart`; the PDF is already in a pane. The missing link is a **step ↔ PDF-anchor index** and the **scroll + highlight** action.

**Design (two layers):**
- **Anchor layer (server, TDD):** a small pure module that, given the vendor document + a step's `sourceText`/`pageStart`, returns a **text-token anchor** (page + a stable text span, e.g. `{page, startText, endText}` or the line/char offsets into the extracted per-page text). For extracted-text view this is trivial (find `sourceText` in the page text → offsets). For the rendered PDF, use the same token to drive the viewer to that page & a hit-highlight rect.
- **Surface layer (app):** the step chips in the protocol pane get a "locate in PDF" affordance. On click → `PdfStateProvider.scrollTo({page, anchorText})` (PDF scrolls + highlights) **and** the extracted-text panel below scrolls its text to the same span. Both driven by the same anchor object.

**Acceptance:** clicking a step scrolls both the PDF and the text panel to that section with the text highlighted; the associated table/figure near that section is on-screen.

### Feature 2 — Conditional choice → steps rebuild (the one you asked about)

Your instinct is exactly right: **a series of option boxes in the protocol tab that redraw as the user selects the next one** (not a modal interview). Reasons:
- Explicit: every choice is visible as a control, not buried in a modal stack.
- Re-visitable: the user can move back up and change an earlier axis, which re-filters downstream.
- It maps 1:1 onto the data model: each `branch_axes[*]` becomes a **group of option boxes**; picking one sets `branchChoices[axisId] = branchId`; all axes drive a single re-localization.

**Design:**
- **`BranchPicker` component** (new, in the right-pane protocol surface): renders one group per branch axis, an option box per condition (`condition.label` = the branch text; `id` = branch id → `branchChoices[axisId] = id`). Selecting a later axis rebuilds the step list; moving back up re-selects / clears dependent axes.
- **Rebuild action:** on any change, call the localization with the accumulated `branchChoices` → returns the **rebuilt step list + `branch_resolution[]`** (this is `lowerToLabProtocol` phase-0). The redrawn step list is exactly the shared ∪ selected-branch steps. This is the "steps rebuild" — and it already works server-side.
- **Where it lives:** the user's "protocol tab." Recommend the right-pane `protocol-edit` / `protocol` surface (not a modal). If it should prime *before* localization (pick branches on the raw universal, then localize), the picker reads `branch_axes` from the universal protocol; if mid-localization, it drives `branchChoices` on the LPR. **Needs your call** (see Open Questions 2).

### Feature 3 — labwares/materials/equipment bound to the conditional logic

**Goal:** the resource pickers become branch-aware — each branch can carry its own labware/material/equipment set, and a resource bound to a step follows that step across branches.

**Design (data-model extension):**
- Add **branch-scoped role/resource bindings**: extend the branch condition (or a parallel `resources` map) so a branch can declare which `labwareRoles`/`materialRoles`/`instrumentRoles` apply. Reuse `branch_axes[*].conditions[*]` + a new optional `then_resourceRefs` (or a `branch_resources` map keyed by `axisId.conditionId`).
- At the surface, the labware/material/equipment pickers read the active branch set; bound resources are shown per-branch; deleting/merging a step cascade-cleans its resource refs (ties into Feature 4).
- **Scope configuration needed** (Open Questions 3): do you want per-branch *different* resources (e.g. bacterial uses tube rack, mammalian uses a flask), or just that a resource bound to a step is *kept* as the step travels its branch? The latter is nearly free (cascade on the existing role model); the former is a real data-model change.

### Feature 4 — Step delete/merge/split + binding cascade

**Goal:** edit the protocol structurally; deleting a step takes its equipment/material bindings with it (e.g. "we tested shake-10 and it made no difference → delete; the shaker binding goes too").

**Design:**
- **`ProtocolStepEditor`** operations over the protocol steps + `overrides`: **delete** (drop step + cascade its bindings/substitutions/`then_stepIds` references in `branch_axes`), **merge** (combine N steps → one; how volumes/actions combine is a design Q — see Open Questions 4), **split** (one step → two; the conditions/actions divide along a chosen boundary).
- **Cascade rule (server TDD):** a pure `deleteStep(protocol, stepId)` that removes the step, its `overrides.bindings`/`substitutions` rows referencing it, its `branch_axes[*].conditions[*].then_stepIds` entry (and cleans an axis whose condition empties), and the step's equipment ref. This is the "shaker goes too" behavior — deterministic, tested.
- The UI: per-step overflow menu (Delete / Split / Merge-with…), plus an undo/confirm where destructive.

---

## 3. Where we realistically sit (tiering)

My honest read on effort vs. shovel-readiness:

| Tier | Feature | Backend readiness | Effort | Note |
|---|---|---|---|---|
| **1** | PDF↔step sync + highlight (F1) | Medium (new anchor module) | Medium | Self-contained; highest solo payoff for "context" |
| **1** | Conditional picker + steps rebuild (F2) | **High (fully built)** | Low–Medium | The only true "new" work is the `BranchPicker` + a locale endpoint call |
| **2** | Step delete/merge/split + cascade (F4) | Medium (cascade is new) | Medium | Well-trodden editor work; cascade is the crisp new bit |
| **3** | Branch-aware labwares/materials/equipment (F3) | Low (real data-model change) | High | Largest; depends on F2's branch model settling |

**Recommended order:** **F2 first** (it's the one that makes the whole thing feel alive, and the backend is already done) → **F1** (sync/highlight, independent) → **F4** (step editing + cascade) → **F3** last (depends on the branch model being stable). The 2-pane layout stays; all of this is either center-surface or right-pane tabs, no third pane.

---

## 7. Round-2 design threads (from Brad's feedback — refinements + a new epic)

### 7.1 The universal protocol is READ-ONLY; localization edits a WORKING COPY

**Brad's model:** the ingested protocol IS the universal protocol and is treated as **read-only**. Localization (the PDF view) begins by taking a **copy** we then trim / refine / embellish according to our wants.

**Refinement to F2/F4 surface:** the branch picker and every delete/merge/split edit operate on the **localization working copy** (a derived LPR draft), never on the pristine universal. This cleanly separates "what the vendor says" (immutable) from "what we're going to do" (editable). Concretely:
- Universal `protocol` stays immutable (provenance: source PDF).
- `local-protocol` = the working copy; editing writes `overrides`/steps on the LPR, `variantRef`/`branch_resolution` records the choice.
- The PDF-sync + step-edit surfaces bind to the **copy**. This also resolves the earlier F2 surface question (#2): the option boxes live on the working copy, upstream of/at localization; the universal is never mutated.
- **Impact on tasks:** F2's picker writes `branch_resolution[]` on the LPR copy; F4's delete/merge/split mutate the LPR copy's steps + overrides + branch entries. Both already fit the phase-0 localization model — the copy is just the object being localized.

### 7.2 F3 = genuine PER-BRANCH resource sets (Brad's sample-type example)

Brad's example settles F3's scope question — it is per-branch **instrumentation, materials, and even conditional steps**:

| Branch | Lysis | Mechanical step | Equipment | Materials |
|---|---|---|---|---|
| **Mammalian** | buffer alone | **none** | (no bead-beater) | — |
| **Bacterial** | needs cell-wall smash | bead-beating | **mechanical bead-beater** | tubes + many small glass beads |
| **Plant** | fibrous, needs pulverize | bead-beating | **bead-beater** (+ **-80 °C freezer** first) | frozen tissue + one large stainless bead |

So the branch axis drives **three coupled things**: (a) which steps exist (mammalian drops the bead-beating step entirely; plant *adds* a pre-freeze step the others don't have), (b) which equipment is required (bead-beater for bacteria+plant; freezer only for plant), (c) which material is used (small glass beads vs one large stainless bead).

**Design consequence:** this is the deepest form of branch-scoping — it fuses Feature 2 (steps rebuild) with Feature 3 (resources rebuild) per branch. The `branch_axes` model already rebuilds steps; F3 extends it so a branch also declares its **`then_resourceRefs`** (equipment/labware/material refs) and can **add/remove steps** (not just select among pre-declared ones — plant's pre-freeze step is *new* at selection time). This correctly makes the **bead-beater a shared-but-not-universal** resource (needed by 2 of 3 branches), and the **-80 °C freezer branch-gated** equipment. This is a meaty, well-specified feature — still best last, but now crisp.

### 7.3 F4 = step GRANULARITY is layered: logical steps ↔ event-graph events

Brad's question — is "incubate" one step or three (transfer→incubate→transfer-back)? — reveals a **two-level step model**:

- **Logical step** = the authoring/biology unit ("precipitate DNA", "incubate 10 min"). Two separate liquid additions (salt + ethanol) **remain distinct events** in the event graph but can be combined into **one logical step** (`precipitate DNA = add salt + add ethanol`).
- **Event-graph step** = the concrete execution event(s). A logical "incubate" may *expand* into multiple events (transfer to incubator → incubate → transfer back) at the deck/compile layer.

**Design consequence:** delete/merge/split operate on **logical steps**; the event graph keeps the granular underlying events. So:
- **Merge** = combine two logical steps into one (even though their events stay distinct) — "precipitate DNA" is exactly this.
- **Split** = separate one logical step's actions into two logical steps.
- The **cascade** (delete → binding goes) still holds at the logical-step level; the event graph re-expands.
- Two additions "always remain distinct in the event graph" is a **structural invariant** (already true — the tracker/event graph never collapses two adds) while *display/authoring* may group them.

### 7.4 NEW EPIC — Protocol chaining: a produced material feeds the next protocol (RNA → rtPCR)

**Brad's idea (confirmed real-but-idle):** a run may chain protocols — an RNA extraction yields a material that is the *input* to an rtPCR protocol ("n runs per run, a protocol produces a material used in the next protocol").

**What already exists (verified):**
- `protocol.producedArtifacts[]` — declarative contract for what a protocol produces (kind: `material`/`measurement`/`dataset`; `artifactId` symbol; `derivationType`; `materialSpecRef`) — `protocol.schema.yaml:199`.
- The event-graph has `derived_from` lineage; `material-instance`/`aliquot` lineage; `harvest` emits the final produced composition (well-state tracker's `harvest` reducer).
- Material-derivation records + `lineage_includes` predicate can link the produced material to the consuming protocol's input.

**What's missing (the gap that makes it "idle"):** an explicit **chaining flow** — declaring that protocol B's input material comes from protocol A's `producedArtifacts` output, and a run that realizes A then feeds B (n input samples → m outputs → next). There's no `downstreamProtocolRef`/input-material-from-previous link, no run-level sequencing of two sub-protocols sharing a produced material.

**Recommendation:** **treat this as its own planning track** (a distinct epic/plan), NOT folded into the four UI features — it spans protocol schema (input contract linking a produced artifact), material instantiation, and run sequencing. It pairs naturally with the well-state tracker (harvest → next protocol's initial / bound input). I'll draft that epic separately if you want.

---

## 8. Open questions — round 2 (the next decisions)

1. **Chaining epic — go now or later?** Do you want me to spin out the RNA→rtPCR protocol-chaining epic as its own plan *now* (in parallel with the UI features), or keep it on the shelf and focus on Features 1–4 first? (I recommend latter-now → draft it next, since it touches schemas/run-sequencing and deserves undivided planning.)
2. **Working-copy granularity:** when localization copies the universal to the LPR working copy, do you want the copy to start as an **exact mirror** of the universal steps (then trim), or only the **resolved-branch subset** (shared ∪ chosen branch) with un-picked steps never shown? I lean: start from the resolved branch subset, keep the universal pristine as the "source of truth" you can consult.
3. **F3's step-add under a branch:** plant's pre-freeze step is *new* at selection time (not pre-declared). OK to allow **branch-triggered step insertion** (a branch can add steps beyond selecting among declared ones)? This pushes F3 into real "the branch changes the recipe" territory (which is what your example demands).
4. **F4 merge UX:** combining "precipitate DNA" (salt + ethanol) — should merge **auto-concat actions into one logical step** (recommended; events stay distinct), or prompt the user to re-order/rename each time?
5. **F2/F4 operate on the copy by default** (per 7.1) — confirm that's right, so I scope all step-edit/rebuild tasks against the LPR working copy, not the universal.

Plan complete and saved. Ready to continue executing **F2 + F1** first, and to **spin out the protocol-chaining epic** per your answer to Q1.

### Realism notes
- **F2 is genuine low-hanging fruit** — the schema, resolver, and phase-0 rebuild all shipped in the prior plan. The "steps redraw from a choice picker" is a thin client on top.
- **F1's hard part is the PDF anchor** (page + stable text span from a step's `sourceText`), not the view. Extract a stable token at ingest so re-renders don't break the highlight.
- **F4's "shaker goes too" is a deterministic cascade function** — small, testable, high-trust.
- **F3 is the only one I'd call a real feature-epic** (per-branch resource sets touch roles, branch schema, and both localization surfaces). If the real ask is just "resources follow their steps across branches," it collapses to near-F4 work.

---

## 4. Bite-sized implementation tasks (post-approval, per tier)

### Tier 1 — F2 (recommended first)
### Task F2-1: `BranchPicker` renders one option-group per `branch_axes` axis
**Files:** Create `app/src/protocol-authoring/BranchPicker.tsx`.
Render `branch_axes[]` → a group of option boxes per axis; selection sets `branchChoices[axisId]=conditionId`; a "clear" returns up (re-selection). Test the grouping + re-visit behavior.
**Verify:** `npx vitest run <BranchPicker>` ; `npx tsc --noEmit`.

### Task F2-2: Rebuild steps on choice (call localization with branchChoices)
**Files:** Create a thin client function `apiClient.localizeForBranches(protocolId, branchChoices)` → rebuilt steps + `branch_resolution` (backs onto `lowerToLabProtocol`/a small endpoint); `BranchPicker` redraws the step list on change, preserving earlier choices as the axes tighten.
**Verify:** server handler test (choices → filtered steps) + frontend render test.

### Task F2-3: Place the picker + redrawn step list in the protocol surface
**Files:** `app/src/event-editor/right-pane/protocol-edit/` (host `BranchPicker` + the live step chips above the cached list).
**Verify:** live browser pass (pick a branch → steps visibly rebuild), per user's "must be visible in the state I navigate" rule.

### Tier 1 — F1
### Task F1-1: Step→PDF anchor module (server, TDD)
**Files:** Create `server/src/ingestion/vendor-protocol/StepPdfAnchor.ts` (+test): `anchorForStep(document, step) → { page, startText, endText }` from `sourceText`/`provenance.pageStart`.
### Task F1-2: PDF + text-panel scroll/highlight
**Files:** `PdfStateProvider` gains `scrollTo(anchor)`; extracted-text panel scrolls to the span; step chips get "locate" affordance.
### Task F1-3: Wire + live pass.

### Tier 2 — F4
### Task F4-1: `deleteStep(protocol, stepId)` pure cascade (server TDD)
Removes step + `overrides.bindings/substitutions` rows + `branch_axes` `then_stepIds` entry + step's equipment ref. Tests: "deleting the shake step removes its shaker binding and its branch entry."
### Task F4-2: UI delete/menu + confirm; merge/split
Add per-step Delete/Split and Merge-with…; merge/split semantics per Open Q4.

### Tier 3 — F3
### Task F3-1: branch-scoped resource bindings (schema + resolver)
Per Open Q3. If "different resources per branch": extend branch condition with `then_resourceRefs` + thread through localization; else collapse into F4 cascade.

---

## 5. Tests / validation
- Every pure function (`anchorForStep`, `deleteStep`, any merge/split merge-fn) TDD'd (Vitest, `server/` cwd).
- Frontend: component tests for `BranchPicker` (grouping, re-visit), step-chip affordances; `npx tsc --noEmit` app+server.
- **Live browser pass** per user convention: reach the surface, click a branch → steps visibly rebuild; click a step → PDF + text highlight; delete a step → shaker binding gone.
- Full-suite comparison: zero new failing tests over baseline (current baseline 76 failed / 3294 passed, 2 pre-existing errors, 1 pre-existing `slugify` tsc error).

---

## 6. Risks / trade-offs / open questions

**Risks**
- F1 PDF anchoring: rendered-PDF hit-highlight can be finicky (text-layer offsets vs. extractor tokens) — mitigate by reusing the same text token for both views so at least the *extracted* view is always exact.
- F3 is the largest; do NOT start it until F2's branch UX settles (the per-branch resource model depends on the branch model being ergonomic).
- Destructive step edit needs undo/confirm; compile rewrites downstream artifacts (snapshot + "will recompile N runs" guard).

**Open questions for you (please answer):**
1. **F1 text layer:** is "the extracted text of the PDF in the window below" an *existing* panel I should hook into, or do you want me to add a dedicated extracted-text view below the PDF? (I believe a dedicated one; confirm.)
2. **F2 surface + timing:** do the branch option-boxes live on the **universal** protocol (pick branches, then localize) or on the **local** protocol mid-localization? And do you pick branches in the right-pane `protocol` surface itself, or a dedicated "localize" step before the deck editor? (I lean: universal branch picker in the protocol tab, before/at localization.)
3. **F3 scope:** per-branch *different* labware/material/equipment sets, or only "resources follow their steps/branches" (much cheaper)? Real example you care about?
4. **F4 merge/split semantics:** merge of two steps with different volumes/actions — combine additively (sum volumes, concat actions) or require the user to choose a winner? Split — does the user pick the action/condition boundary? I lean: merge is guided (user picks how amounts combine), split is by position/action boundary.
5. **Ordering/skip:** want me to also fold in the already-scoped "PDF in main-pane + right-pane protocol edit" layout change (from the earlier workflow plan Task 1) as part of this, or is the current tabbed workspace enough to carry Features 1–4?

---

Plan complete and saved. Ready to execute via subagent-driven-development once you answer the 5 open questions (they gate F2-surface, F3-scope, F4-semantics) — then I can start with **F2 + F1** (the two most-ready tiers), as recommended in §3.
