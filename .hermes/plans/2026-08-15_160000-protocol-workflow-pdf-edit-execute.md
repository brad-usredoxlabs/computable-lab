# Full Protocol Workflow — Vendor PDF → Edit → Event Graph → Execute Run

**Date:** 2026-08-15
**Status:** Plan mode (no code). Design review of the end-to-end workflow + concrete plan for the
one substantive move it needs (PDF-main-pane + TapTab protocol editing in the right pane).

> **For Hermes:** Use subagent-driven-development to execute task-by-task after approval.

**Goal:** Endorse and sequence the full build-vs-execute workflow Brad described, map each step onto
what already exists (vs. what's new), restore the PDF-in-main-pane view next to an editable protocol
surface, and surface the run-actualization controls (sample count, names, deck choice) at the right
gate — plus flag the things the draft didn't consider.

---

## 1. Brad's proposed workflow (restated)

1. **Attach protocol** → choose a vendor PDF.
2. **PDF display pane** shows the vendor document (main pane) while the user works.
3. Ingestion has already pulled **step names + step details** out of the PDF (done).
4. User **edits the steps** — protocol editing surface (right pane of the workspace) with the **PDF in
   the main/center pane**.
5. Click **Complete** → the protocol loads in the **deck / event-editor view** (with AI dialogue);
   **protocol becomes an event graph**.
6. Click **Execute run** → the presumed event graph loads; user adjusts **sample count, sample names,
   deck choice ("small run — tubes in the rack")** etc.
7. **Run executes.**

This is correct 4-layer thinking (universal → local → deck → run) and it maps cleanly onto the
existing workspace. The rest of this plan is: map it to what exists, fix the one layout gap, and
pressure-test the seams.

---

## 2. Current codebase state (verified — most of this already exists)

| Workflow step | Exists today? | Where |
|---|---|---|
| PDF viewer in a workspace pane | ✅ YES | `pdf` is a live `WorkspaceTab` kind → `leftPane={<PdfViewer/>}` + `PdfStateProvider` (`ProjectWorkspacePage.tsx:240`) |
| Right-pane Protocol tab | ✅ YES | `rightPaneMode='protocol'` → `ProtocolTabPanel`; auto-switched for `deck+runId` tabs |
| "Attach protocol" → run | ✅ YES | `ProtocolSelector.tsx` (`POST …/use-in-run`); `RecordEditPanel` "Create Run" |
| Step names/details from PDF | ✅ YES | ingestion → step candidates → protocol steps (this session's work) |
| Protocol → event graph (compile) | ✅ YES | `POST /runs/:id/compile`; `ProtocolCompiler.lowerToLabProtocol`; event-graph AI bridge |
| Sample map / count / deck | ✅ YES | `planned-run.sampleMap`, `execution-scale-plan.sampleLayout.sampleCount`, `BindingModeEditor` `SampleBindingPanel`, `deckPlatformId` |
| Deck/event-editor + AI dialogue | ✅ YES | `deck` tab → `EventEditorProvider` + right-pane `ai` mode + `ProtocolPreviewBridge` |
| **PDF main pane + TapTab protocol EDITING in the right pane at the same time** | ❌ **NO — this is the gap** | today a `pdf` tab does not set a right-pane mode, and protocol *record* editing lives in a left-pane `record-edit` tab (TapTab), not the right pane |

So "bring the PDF pane back so I can edit the protocol beside it" is real but **small** — the viewer is
still mounted; it's the *coexistence + which pane holds the editable protocol* that needs solving.

---

## 3. The one substantive gap + the layout decision

### 3.1 The gap
Today a `pdf` tab renders `PdfViewer` in the main/left pane, but opening a PDF sets **no** right-pane
mode, and the *editable protocol* is a **left-pane** `record-edit` tab (TapTab `ProjectionTapTabEditor`).
So you can't have PDF + editable protocol side-by-side in the two-pane workspace without more work.

### 3.2 Proposed layout (keeps the two-pane rule — right pane = tabbed, center = surface)
Add a **`protocol-edit` right-pane mode** (a new `WorkspaceRightPaneMode`) that renders the TapTab
`ProjectionTapTabEditor` bound to the local-protocol/step record. When a `pdf` tab is active, set the
right pane to `protocol-edit` so the layout is:

```
┌─────────────── main/center ──────────────┬─────────── right pane ───────────┐
│  PdfViewer (the vendor document)         │  ProtocolEditTabPanel (TapTab)   │
│  scrollable, page-by-page                │  editable steps + setup + AI     │
└──────────────────────────────────────────┴────────────────────────────────┘
```

This is the "PDF while editing the protocol" experience Brad wants. It reuses:
- `PdfViewer` / `PdfStateProvider` (left pane, unchanged)
- `ProjectionTapTabEditor` (the editable protocol surface, imported into the new panel)
- The right-pane shell (`RightPane.tsx` — add the mode to the tab bar + dispatch)

### 3.3 What "Complete" means
"Complete" is a **one-click promote**: the edited steps (already saved to the protocol record) are
compiled into an event graph. It reuses `POST /runs/:id/compile` (or the promote path). Clicking
Complete should:
1. Persist the edited protocol record (already saved on edit).
2. Run the compile → produce the event graph.
3. Switch the workspace from `pdf` → `deck` tab and `rightPaneMode → 'ai'` (the AI "how should we do
   this" dialogue), exactly as the existing deck flow does.

---

## 4. Bite-sized tasks (post-approval)

### Task 1: Add `protocol-edit` right-pane mode (wiring)
**Objective:** Make a `pdf` tab show PdfViewer (main) + an editable TapTab protocol surface (right),
so the full PDF-edit experience works side-by-side. Reuses existing pieces; no new editor built.
**Files:**
- Modify: `app/src/event-editor/workspace/types.ts` — add `'protocol-edit'` to `WorkspaceRightPaneMode`.
- Modify: `app/src/event-editor/right-pane/RightPane.tsx` — register tab (`Protocol Edit`), render
  `<ProtocolEditTabPanel/>` in the switch, update any exhaustive mode switches.
- Create: `app/src/event-editor/right-pane/protocol-edit/ProtocolEditTabPanel.tsx` — hosts
  `ProjectionTapTabEditor` for the active protocol record (fetch via existing record-edit projection
  APIs), plus a "Complete → compile to event graph" button wired to `POST /runs/:id/compile`, then
  `ws.openTab({kind:'deck'})` + `ws.setRightPaneMode('ai')`.
- Modify: `app/src/event-editor/projects/ProjectWorkspacePage.tsx` — when `activeTab.kind==='pdf'`,
  `ws.setRightPaneMode('protocol-edit')` (mirror the existing deck auto-switch at :171).
- Test: `RightPane.test.tsx` (+ any exhaustive-switch tests) updated for the new mode.

**Verify:** `cd app && npx tsc --noEmit`; `npx vitest run src/event-editor/right-pane`.

### Task 2: Stub/parameterize the "Complete" promote (reuse, don't build)
**Objective:** Confirm the compile/promote endpoint and the event-graph production exist and wire the
button; add a test asserting Complete = compile + switch to deck + ai.
**Files:**
- Read: `ProtocolBuilderHandlers` promote/compile; `apiClient.compileRunPlan`.
- Modify: `ProtocolEditTabPanel.tsx` (Complete handler).
- Test: extend the panel test — Complete calls `compileRunPlan`, then `openTab`/`setRightPaneMode`.
**Verify:** server compile tests + app panel test green.

### Task 3: Surface run-actualization controls at the Execute gate
**Objective:** At "Execute run," the user picks sample count/names and deck format ("tubes in a rack"
vs 96-well). Most exists; wire the small-run/tube-rack choice onto the event graph before execution.
**Files:**
- Read: `BindingMode/SampleBindingPanel.tsx`, `planned-run.sampleMap`, `execution-scale-plan` (exist).
- Modify: the Execute gate UI (wherever "Execute run" is exposed today) to surface sample count/labels
  and the deck-variant choice (tubes-in-rack) bound onto the run's sample map + `deckPlatformId`.
- Use this session's `resolveWorkingConcentration` + sample count at compile so per-sample volumes for
  a "4-tube small run" come out right from the concentration-first recipe.
**Verify:** live run with sampleCount=4 on a tube-rack against the concentration resolver.

### Task 4: Docs — update the lifecycle spec with the two-pane PDF→edit→compile→execute sequence
Append a "build-vs-execute workspace flow" section to `compiler-specs/50-protocol-lifecycle.md`
mapping each of Brad's 7 steps to a record kind + workspace surface.

---

## 5. What Brad hasn't considered (the value of this review)

These are real gaps/risks the current draft glosses over:

1. **Which "protocol" is being edited — universal or local?** Ingest gives a *universal* protocol;
   "make it ours" (matrix bump + cheaper binding buffer) happens at the *local* layer. The workflow
   must decide: do you edit the universal steps from the PDF, or immediately specialize to a local
   protocol and edit that? Recommend: **PDF → universal candidate → local protocol (specialize) →
   edit the local one** — so the ratio-first / concentration model and substitutions live where they
   belong. The current draft conflates "edit PDF steps" with "make it ours."

2. **Concentration-first must be the thing you edit.** This session built `working_concentration` as
   the north star. The "edit steps" surface should let the biologist edit **target concentration and
   ratios** (not reauthor µL per batch). That makes "4 samples now / 96 samples later" flow correctly
   into the compile — the exact 4→96 and "tubes vs 96-well" scale/format changes are then run-time,
   not protocol edits.

3. **The "attached protocol" object vs. the run.** Today "attach protocol" binds a protocol to a run
   and yields a method event graph. That's a *fourth* object in play (protocol, local-protocol,
   planned-run, event-graph). The view must be clear about *which record* is being edited at each step,
   or a user will edit what they think is "the protocol" and it won't propagate.

4. **Persistence points.** "Complete" and "Execute run" are destructive gates (compile rewrites
   downstream artifacts). Need explicit save/snapshot + a "you will recompile N runs" confirmation,
   and provenance (each event graph records which protocol/local-protocol version it came from) so
   deviation tracking stays positional (spec 50 §6).

5. **Variant/branch handling in the PDF view.** Vendor PDFs contain "if bacterial / if mammalian"
   branches. The edistine surface should show the `variants[]` (this session's work) so the user picks
   the matrix branch that determines substitutions — not silently read one.

6. **The AI dialogue's role split.** "How to parallelize/automate" is a *deck/execution-plan*
   conversation (Opentrons, pipettes, channels), not a *protocol-authoring* conversation. Keep the
   editing-phase AI focused on "distill the recipe," and the post-Complete AI focused on "how to run
   it." Two different system prompts.

7. **Whether "attach a vendor PDF" or "attach an existing protocol."** The PDF is only the *ingestion
   source* for a reusable universal protocol. A user may want to attach a *pre-existing* local
   protocol they already curated. The entry point should offer both (ingest-new vs pick-existing),
   or the flow becomes one-way and chat-tracking breaks.

---

## 6. Costs, tradeoffs

- **Small move, big payoff:** most of the workflow already exists; the plan is mostly wiring +
  right-pane mode + a Complete gate. Low risk.
- **Layout is a decision, not a given:** putting TapTap editing in the right pane (Task 1) is a change
  from its current left-pane `record-edit` home. Acceptable because the split is exactly the two-pane
  rule (center = surface, right = tabbed). Keep the existing `record-edit` for full-record editing.
- **Variant + concentration editing (items 1–2, 5) are the substantive new capability** and are gated
  on this session's schema work already being on `feat/ai-extension-api` (it is).

---

## 7. Open questions for Brad

1. **Edit universal or local?** PDF → universal candidate, then specialize to local before editing
   (recommended), or edit the universal steps directly and specialize later?
2. **Right-pane "Protocol Edit" mode** — should it replace the existing right-pane `protocol` mode
   (run-step viewer) when a PDF is open, or coexist as a separate tab?
3. **"Complete" gate** — auto-compile on click (recommended, one-click), or show a preview of the
   event graph first?
4. **Execute gate** — is "tubes in the rack vs 96-well" a *run* property (sample map + deckPlatformId,
   recommended) or a *protocol/local* property (bad — lose reusability)?

**Recommended answers:** (1) universal→specialize→local; (2) new `protocol-edit` mode, coexist;
(3) click Complete → compile + hop to deck/ai; (4) run property.

---

## 8. Suggested sequencing

1. **Task 1** (right-pane `protocol-edit` mode + PDF auto-switch) — unblocks the literal "PDF + edit
   side-by-side" ask.
2. **Task 4** (docs) — cheap, durable.
3. **Task 2** (Complete gate) — wires the promote.
4. **Task 3** (Execute gate with sample/tube controls) — last, pulls together sampleCount +
   concentration resolver.

Plan complete. Ready to execute via subagent-driven-development; Task 1 first. Shall I proceed, and
which way on the open questions (especially #1, universal-vs-local)?