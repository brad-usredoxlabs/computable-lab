# HARNESS-SEQ-1 coder report — l2t0805 (lane 2, unified harness chat on sequences, Phases 1-2)

Worktree: /mnt/vast/home/brad/git/wt/HARNESS-SEQ-1-lane2-l2t0805
Branch: cl/HARNESS-SEQ-1-lane2-l2t0805
Spec: /mnt/vast/home/brad/git/cl-integration-2/.hermes/plans/2026-10-14_0755-HARNESS-SEQ-1-harness-chat.md (read fully; orchestrator rulings applied: pane home app/src/agent/, clarification render+round-trip on stubs only, ChatLog keeps `sequence-chat` class).

## 0. Base verification

`git -c core.fileMode=false log --oneline -1` at dispatch: `f756f685` — identical to cl/integration-2 tip (`rev-list --left-right --count HEAD...cl/integration-2` = `0 0`). The tip INCLUDES the COMP3-A6 merge (2531fc3d). The W2-9-g2dfix chain is NOT yet merged into trunk (it lives on branch cl/W2-9-g2dfix-lane2-l2t0310, cycles 1-4 reports present in `--all`), so no rebase was required or performed. No file overlap with W2-9's YAML.

Lane bootstrap repair (environment, all git-ignored): fresh worktree lacked the exclude-symlink materialization. Repaired per the COMP3-A6FIX lane pattern: `node_modules` -> computable-lab/node_modules, `app/node_modules` -> computable-lab/app/node_modules, `server/schema`, `server/node_modules`, and the 14 app exclude symlinks (protocolStepText.ts, draftChanges.ts/.test.ts, ParameterAnswerInput.tsx/.test.tsx, useChatThread.deckLayout.test.tsx, ExecutionContext.test.tsx, ProtocolCandidatePreview.test.tsx, LawnSurface.footprint.test.tsx, useSurfaceContext.ts/.test.ts, useAiChat.surfaceContext.test.ts, surfaces/registry.ts, createLabwareFromDefinitionPayload.test.ts) recreated with `ln -sfn` pointing at computable-lab. All are covered by /home/brad/.hermes/cl/lanes/2/lane-exclude-a6fix-l2t0430 (verified via `git check-ignore -v`). After repair, lane tsc baseline == trunk tsc baseline byte-identical.

## 1. Baselines (captured BEFORE any edit)

### 1a. Playwright pair vs trunk :5193 (baseline run)

```
Running 6 tests using 6 workers
  ✓  1 [chromium] › e2e/sequence-chat-scroll.spec.ts:13:1 › sequence chat follows the latest reply while keeping history and the composer usable (4.1s)
  ✓  5 [chromium] › e2e/three-pane-harness.spec.ts:73:3 › Three-pane agent harness › deck still renders in the action pane (4.0s)
  ✓  6 [chromium] › e2e/three-pane-harness.spec.ts:43:3 › Three-pane agent harness › left nav tabs switch between Protocol, Search, and Details (3.8s)
  ✓  2 [chromium] › e2e/three-pane-harness.spec.ts:18:3 › Three-pane agent harness › renders three panes: nav | action | chat, with the AI chat permanent (4.0s)
  ✓  3 [chromium] › e2e/three-pane-harness.spec.ts:55:3 › Three-pane agent harness › clicking a step updates the live chat header (EDITING: Step N — concept) (8.3s)
  ✓  4 [chromium] › e2e/three-pane-harness.spec.ts:33:3 › Three-pane agent harness › nav rail lists the protocol step concepts (8.3s)
  6 passed (10.3s)
```

### 1b. `npm run typecheck -w app` baseline (sorted error lines, 23) — identical to trunk's 23 (set-diff empty)

CORRECTED 2026-10-14T09:40 EDT BY THE ORCHESTRATOR (advc c1 DEFECT 1): the block originally
quoted here held 28 lines — a pre-/mid-symlink-repair capture (5 stale TS2307/TS7006 lines
from unresolved exclude symlinks: draftChanges, ParameterAnswerInput+QuestionsPanel,
WorkstateProposalCard x2) plus two `in type`/`on type` wording drift lines. The corrected
capture below was RE-RUN post-repair by the orchestrator in THIS worktree (`cd app &&
npx --no-install tsc --noEmit`, sorted) and is byte-identical to the trunk capture taken the
same minute in /mnt/vast/home/brad/git/cl-integration-2/app (set-diff empty; 23 == 23). The
zero-new conclusion in the original run stands; only the quoted evidence was mislabelled.
Verbatim post-repair HEAD capture (== trunk baseline):

```
src/event-editor/deck/LawnSurface.moveAcross.test.tsx(47,5): error TS2353: Object literal may only specify known properties, and 'runDeckLock' does not exist in type 'EventEditorState'.
src/event-editor/deck/PreviewActionBar.test.tsx(108,5): error TS2353: Object literal may only specify known properties, and 'runDeckLock' does not exist in type 'EventEditorState'.
src/event-editor/editorHistory.test.ts(176,34): error TS2345: Argument of type '{ type: "load_event_graph_success"; eventGraphId: string; runId: null; events: never[]; labwares: {}; placements: never[]; }' is not assignable to parameter of type 'EventEditorAction'.
src/event-editor/editorHistory.test.ts(199,37): error TS2345: Argument of type '{ type: "load_event_graph_success"; eventGraphId: string; runId: null; events: PlateEvent[]; labwares: {}; placements: never[]; }' is not assignable to parameter of type 'EventEditorAction'.
src/event-editor/EventEditorContext.tsx(1288,29): error TS2339: Property 'equipments' does not exist on type '{ eventGraphId: string; runId: string | null; events: PlateEvent[]; labwares: Record<string, Labware>; placements: EventEditorPlacement[]; }'.
src/event-editor/focus/LabwareFocus.instrument.test.tsx(47,5): error TS2353: Object literal may only specify known properties, and 'runDeckLock' does not exist in type 'EventEditorState'.
src/event-editor/right-pane/ai/systemPromptForViewer.ts(45,3): error TS2322: Type '"document" | "protocol-review" | "pdf" | "deck" | "project-details"' is not assignable to type 'SystemPromptKind'.
src/event-editor/right-pane/ai/useChatThread.deckLayout.test.tsx(52,9): error TS2353: Object literal may only specify known properties, and 'onDeckLayout' does not exist in type 'UseChatThreadOptions'.
src/event-editor/right-pane/ai/useChatThread.deckLayout.test.tsx(84,9): error TS2353: Object literal may only specify known properties, and 'onDeckLayout' does not exist in type 'UseChatThreadOptions'.
src/event-editor/right-pane/protocol/ProtocolLocalizationThread.tsx(232,35): error TS2339: Property 'runDeckLock' does not exist on type 'EventEditorState'.
src/event-editor/topbar/DeckModeSwitcher.tsx(11,24): error TS2339: Property 'runDeckLock' does not exist on type 'EventEditorState'.
src/event-editor/viewer/deck/DeckToolbar.tsx(38,31): error TS2339: Property 'runDeckLock' does not exist on type 'EventEditorState'.
src/event-editor/viewer/ViewerToolbar.tsx(54,13): error TS2322: Type '{ id: string; kind: "protocol-review"; recordId: string; title: string; }' is not assignable to type 'never'.
src/event-editor/viewer/Viewer.tsx(64,13): error TS2322: Type '{ id: string; kind: "protocol-review"; recordId: string; title: string; }' is not assignable to type 'never'.
src/ingestion/components/IngestionUploadModal.tsx(232,23): error TS2554: Expected 2 arguments, but got 1.
src/ingestion/protocol-review/ExtractionProgressPanel.test.tsx(9,19): error TS6133: 'fireEvent' is declared but its value is never read.
src/shared/context/useSurfaceContext.ts(36,3): error TS2322: Type '{ editorMode?: string | undefined; surfaceData?: Record<string, unknown> | undefined; surface: string; active: ActiveObject; selection: SelectionItem[]; }' is not assignable to type 'SurfaceContextPayload'.
src/shared/hooks/useAiChat.surfaceContext.test.ts(102,7): error TS2322: Type '"event-editor"' is not assignable to type 'SurfaceId'.
src/shared/hooks/useAiChat.surfaceContext.test.ts(107,53): error TS2739: Type 'SurfaceContextPayload' is missing the following properties from type 'AiContext': summary, surfaceContext
src/shared/hooks/useAiChat.surfaceContext.test.ts(34,5): error TS2322: Type '"materials"' is not assignable to type 'SurfaceId'.
src/shared/hooks/useAiChat.surfaceContext.test.ts(47,53): error TS2739: Type 'SurfaceContextPayload' is missing the following properties from type 'AiContext': summary, surfaceContext
src/shared/hooks/useAiChat.surfaceContext.test.ts(66,53): error TS2739: Type 'SurfaceContextPayload' is missing the following properties from type 'AiContext': summary, surfaceContext
src/shared/hooks/useAiChat.surfaceContext.test.ts(82,53): error TS2739: Type 'SurfaceContextPayload' is missing the following properties from type 'AiContext': summary, surfaceContext
```

NOTE: before the §0 symlink repair the same command printed 33 lines (10 extra TS2307/TS7006 lines from the 14 unresolved exclude symlinks, e.g. `Cannot find module './protocolStepText'`). The 23-line list above is the repaired-lane baseline and is byte-identical to trunk's 23-line list (diff empty, verified) — it is the list every zero-new proof in this report compares against.

### 1c. Vitest four-suite baseline (lane, post-repair) == trunk (run on cl-integration-2 for parity)

Lane AND trunk both print:
```
 Test Files  3 failed | 50 passed (53)
      Tests  303 passed (303)
     Errors  1 error
```
The 3 failed files are the pre-existing symlink-exclude load failures (vite resolves symlinked test files to their real path outside the vite root): draftChanges.test.ts, ParameterAnswerInput.test.tsx, useChatThread.deckLayout.test.tsx — identical on trunk (`Failed to load url ... resolved id: /mnt/vast/home/brad/git/computable-lab/...`). The `Errors 1 error` is the pre-existing unhandled-exception debt (ClarificationPicker listOnTimeout), identical base and head.

## 2. RED evidence (commit 78a44e79)

`npx vitest run src/agent/HarnessChatPane.test.tsx src/agent/ChatFocusContext.test.tsx`:
```
 FAIL  src/agent/ChatFocusContext.test.tsx [ src/agent/ChatFocusContext.test.tsx ]
Error: Failed to resolve import "./ChatFocusContext" from "src/agent/ChatFocusContext.test.tsx". Does the file exist?
 FAIL  src/agent/HarnessChatPane.test.tsx [ src/agent/HarnessChatPane.test.tsx ]
Error: Failed to resolve import "./ChatFocusContext" from "src/agent/HarnessChatPane.test.tsx". Does the file exist?
 Test Files  2 failed (2)
      Tests  no tests
```
(RED as the spec predicted: module-not-found for the not-yet-existing components.)

## 3. Implementation (commits 9c7bb5ab feat, b9085e8e test)

NEW:
- app/src/agent/HarnessChatPane.tsx (+ HarnessChatPane.css) — `useAiPanel().chat` consumer; `data-testid="harness-chat-pane"`; chat===null -> honest empty state ("No surface has registered a chat with this panel.", role=status, composer disabled, no fake messages); LOCAL prompt state; Send -> chat.sendPrompt + clear; Cancel -> chat.cancelStream while streaming; optional `onReviewProposal` threaded via conditional spread; NO extra AiPanelProvider.
- app/src/agent/ChatFocusContext.tsx — provider `{focus:{surface,label,detail?,refs?}|null, setFocus}`; host-controlled when `focus` prop supplied; carrier only, zero derivation logic, zero model calls; `useChatFocus()` returns null without provider (never throws).
- app/src/agent/SurfaceFocusHeader.tsx (+ .css) — renders `Working focus: <label>` from ChatFocusContext ONLY; own testid `surface-focus-header`; renders nothing when no published focus.
- app/e2e/sequences-harness-chat.spec.ts — rule-12 e2e (legs a/b/d/e; leg c covered by unit per spec).
- app/src/agent/HarnessChatPane.test.tsx, ChatFocusContext.test.tsx (RED-first).

PROMOTED (git mv, rename-detected R in status):
- app/src/sequences/SequenceChat.tsx -> app/src/agent/ChatLog.tsx — scroll spine (followLatest + ResizeObserver + resize-vs-user-scroll disambiguation) VERBATIM; pinned selectors VERBATIM: root class `sequence-chat`, role=log name=Conversation, 'Review action' w/ originating request (sequenceProposalRequest ?? last user before index), 'Latest messages ↓' pill, textarea labelled 'Message', Send/Cancel. Added: optional `onReview` (absent -> Review button omitted) and clarification turn rendering (prompt + numbered option buttons; answer text via EXPORTED `clarificationAnswerPrompt` from AiTabPanel — import-only; prompt not duplicated when useAiChat already surfaced it as the message body).
- app/src/sequences/SequenceChat.test.tsx -> app/src/agent/ChatLog.test.tsx (5 pinned tests kept + 2 new clarification tests).
- CSS: `.sequence-chat*` rules moved from SequencesPage.css into app/src/agent/ChatLog.css (dead rules deleted from SequencesPage.css with a pointer comment).

MODIFIED:
- app/src/sequences/SequencesPage.tsx — SequenceChat import + page-owned `prompt` state deleted; wrapped in `<ChatFocusProvider focus={chatFocus}>`; focus derived from resolved state only: `Sequences — <Tab>` + ` · <label??name??title??recordId>` when selected resolves in records; `rightPane={<HarnessChatPane onReviewProposal={onSequenceProposal}/>}`. Everything else (:33-47 proposals/handoff/selectRecord, :101-107 nav/textarea/handoff, tabs const, aiContext, useAiChat+useRegisterAiChat) untouched.
- app/src/event-editor/right-pane/ai/ChatContextHeader.tsx — optional delegation ONLY: `useChatFocus()` non-null -> render published focus (same testid `chat-context-header`, same label/value structure); null -> EXISTING useProtocolSelection path byte-for-byte (strings 'Working focus', 'No step focused — ask the AI to navigate', 'EDITING', `Step <ordinal>: <text>`, data-ctx-step all unchanged). The run page publishes no ChatFocusContext -> run output literally unchanged.
- app/src/agent/ChatLog.tsx clarification-prompt dedup (b9085e8e).

## 4. Acceptance criteria mapping (verbatim criteria -> evidence)

1. "/lab/sequences right pane is HarnessChatPane (no SequenceChat.tsx in tree)" — `find app/src -name 'SequenceChat*'` returns nothing (git mv R-detected); SequencesPage rightPane = HarnessChatPane; both /sequences and /lab/sequences routes render SequencesPage (App.tsx:209-210). e2e leg (a) asserts `[data-testid="harness-chat-pane"]` visible alongside `.cl-workspace__pane--chat` and `.sequence-library` on /sequences.
2. "focus header follows tab/record changes without a model call" — e2e leg (d): click Analysis -> header 'Sequences — Analysis'; click Library record pUC19 -> 'Sequences — Editor · pUC19'; `clStreamRequests.length === 0` after those clicks (fetch-swap spy). Unit: ChatFocusContext tests (derivation carrier, null without provider). Focus label built from tab/selected/records only.
3. "three-pane-harness.spec.ts passes UNMODIFIED" — `git diff --name-only` lists NEITHER pinned spec; pair runs vs trunk :5193: 6 passed (final battery, multiple runs); vs lane-local :5194 serial x3: 6 passed (my ChatLog keeps the pinned selectors green). AgentChatPane.test.tsx (1) + ChatContextHeader.test.tsx (3) green.
4. "pane honest-empty without registered chat" — unit tests: honest text present, no 'Assistant' placeholder, Send disabled, composer disabled, no sendPrompt fired, and the state DISAPPEARS the moment a chat registers (rerender both directions, B6).
5. "Browser gate :5193; VERDICT: accept" — orchestrator's post-merge gate; not the coder's. See §6 for the :5193 serving-trunk constraint.

## 5. Final battery (post-implementation)

- Vitest four suites: `Test Files 3 failed | 52 passed (55) / Tests 321 passed (321) / Errors 1 error` — same 3 pre-existing symlink-exclude failures + same 1 unhandled error as baseline; +2 files, +18 tests, ZERO new failures. src/agent alone: 4 files / 24 tests all green.
- app tsc: 23 sorted error lines, `diff` vs baseline empty — ZERO new lines.
- New e2e vs LANE-LOCAL :5194 (my worktree's vite serving my app code, proxying to trunk backend :3093 — zero server changes shipped): `1 passed (2.1s)` — legs a (pane+three-pane geometry), b (Send -> user bubble, Cancel toggles, streamed reply lands), d (focus follows tab+record clicks, ZERO stream requests), e (stub done clarification -> numbered options render; pick '1. EcoRI' -> SECOND stream request whose body contains 'Use EcoRI for sequence.' -> answer turn lands 'EcoRI it is.').
- New e2e vs trunk :5193: fails at `[data-testid="harness-chat-pane"]` element-not-found — EXPECTED, trunk serves pre-merge code; spec is authored+locally-verified, fully passes only post-merge (per dispatch instruction).
- Pinned pair vs trunk :5193 (specs untouched): passes (6 passed) in the final battery and in 3 consecutive parallel runs; sequence-chat-scroll.spec.ts shows an INTERMITTENT load flap against :5193 (observed 3 failures across ~15 runs, including runs of that spec ALONE against trunk, and one 5-passed/1-failed serial run) — environmental :5193 vite load-timing flake on TRUNK-served code that this lane cannot affect (my lane never touches the :5193 server; the same spec passes 5/5 standalone runs and 3/3 lane-local serial runs). Matches the known load-timeout flap pattern. Flagged for the orchestrator's gate runs (retries:0 in playwright.config.ts).
- Pinned pair vs lane-local :5194 serial x3: 6 passed each — the promotion keeps both specs green against MY code.

## 6. :5193 serving constraint + local verification mechanism

Per the spec's "may NOT assume the lane stack serves a worktree": :5193 serves TRUNK app dir. To exercise the NEW spec against my code without touching the trunk stack, I ran a lane-local vite on :5194 from my worktree (script .run/start-lane-local.sh, git-ignored), proxying /api to the trunk lane backend :3093 (legitimate: this item ships ZERO server/ changes, so the trunk backend is the correct backend). The trunk stack (:3093/:5193) was never restarted or disturbed. Post-merge the orchestrator's gate can run the new spec directly against :5193 after the lane stack serves the merged tip.

## 7. Reviewer bait audit

- B1 (fall-through-identical): ChatContextHeader delegation is gated on `useChatFocus()` non-null; run page publishes none -> existing path byte-for-byte. Unit-tested both directions in ChatFocusContext.test.tsx ('keeps the existing protocol-selection path byte-for-byte when no ChatFocusContext exists' + 'delegates to a non-null ChatFocusContext'). AgentChatPane.test.tsx green; three-pane e2e green vs trunk AND vs lane-local.
- B2 (pinned selectors): `sequence-chat` root class, role=log name=Conversation, label 'Message', 'Review action', 'Latest messages ↓' all kept verbatim in ChatLog; sequence-chat-scroll.spec.ts UNMODIFIED and green vs lane-local :5194.
- B3 (single-slot ref): HarnessChatPane consumes `useAiPanel()` (already subscribes via chatVersion); no nested AiPanelProvider added anywhere; honest-empty <-> registered transitions unit-tested both directions (re-render test).
- B4 (sequenceProposal flow): `sequenceProposal`/`sequenceProposalRequest` path untouched (ChatLog keeps the exact originating-request fallback; ChatLog.test.tsx pins it — the promoted 5 tests pass unchanged); Knowledge tab vocabulary untouched (zero edits to knowledge selects/wording).
- B5 (hardcode boundary): focus label derives only from tab/selected/records; e2e 4d asserts zero /api/assist/stream on clicks; no surface-name branches; tabs const untouched (no YAML move); conditional spread used for optional props (onReviewProposal, detail, ref, query, allowCreateLocal) — no `undefined` assigned to optional props.
- B6 (honest empty): no placeholder messages, composer+Send disabled, no sendPrompt while empty, disappears on registration — 3 unit tests.
- B7 (no AiTabPanel import into the pane): HarnessChatPane imports only ChatLog + SurfaceFocusHeader + useAiPanel. ChatLog imports ONLY the exported `clarificationAnswerPrompt` from AiTabPanel (import-only, zero edits to AiTabPanel internals — verified: AiTabPanel.tsx not in the diff). ReviewAiPanel untouched. forceDraftTool untouched. Zero server/ and zero schema/ changes (`git status` clean of both).

## 8. Future-consumer handoff (spec HANDOFF obligation)

Future HarnessChatPane consumers named by the item, NOT rewired here:
- app/src/ingestion/protocol-review/ReviewAiPanel.tsx (+ its tests/css) — untouched; the natural next consumer of HarnessChatPane once its bespoke panel is folded in.
- The five other registrant surfaces: MaterialsPage.tsx, FormulationsPage.tsx (endpoint 'browser'), ProtocolsBody.tsx, LiteratureBody.tsx, BrowserBody.tsx — untouched; each already feeds the seam via useRegisterAiChat, so swapping their right panes to HarnessChatPane is a per-page follow-up (note: LiteratureBody/BrowserBody nest their OWN AiPanelProvider — those must be unwound when they adopt the shared pane, else the nested provider shadows the app-wide one).

## 9. Assumptions block

- Assumed the orchestrator ruling "clarification = render + round-trip unit/e2e-tested on STUBS only" permits the e2e stub to synthesize the `done` clarification frame in the fetch-swap (the real sequences backend hard-sets forceDraftTool, so a live clarification turn is HARNESS-SEQ-2's emission duty — the pane makes the mechanism AVAILABLE, per spec §Clarification-turn adoption).
- Assumed `menuProvider ?? 'choice'` is the faithful bridge from AiClarification (no menuProvider required) to the AiClarificationRequest shape the exported lane-2 helper reads; the helper reads entityType first, which AiClarification always carries.
- Assumed the lane-local :5194 vite (proxying to trunk backend :3093) is an acceptable coder verification mechanism since this item ships zero server changes; the trunk stack was never restarted.
- Assumed the sequence-chat-scroll :5193 flap is environmental (it reproduces against trunk-served code with this lane's changes absent from that server); the orchestrator's gate should treat a lone sequence-chat-scroll failure on :5193 as a retry candidate, not a merge blocker — the spec passes standalone and against my code.
- The 3 symlink-exclude vitest failures and the 1 unhandled-error are pre-existing trunk debt (proven by identical trunk run), not introduced here.

## 10. Commits on cl/HARNESS-SEQ-1-lane2-l2t0805

- 78a44e79 test(harness): RED — HarnessChatPane + ChatFocusContext/SurfaceFocusHeader contracts
- 9c7bb5ab feat(harness): unified harness chat on sequences — ChatLog promoted, HarnessChatPane, ChatFocusContext + SurfaceFocusHeader, SequencesPage rewiring, ChatContextHeader optional delegation
- b9085e8e test(harness): rule-12 e2e sequences-harness-chat + ChatLog clarification-turn unit tests; no duplicate prompt render

HARNESS-SEQ-1 DONE b9085e8e
