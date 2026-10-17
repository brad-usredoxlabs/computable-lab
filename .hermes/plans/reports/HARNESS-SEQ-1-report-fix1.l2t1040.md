# HARNESS-SEQ-1 — FIX RUN 1 report (l2t1040)

Lane: wt/HARNESS-SEQ-1-lane2-l2t0805, branch cl/HARNESS-SEQ-1-lane2-l2t0805.
Rebased onto cl/integration-2 (clean; trunk tip 28e8a1fc; my merged artifact 22d0bb00 already in trunk; `git diff 7e40d18a..HEAD -- app/src app/e2e` EMPTY — trunk moved only in docs/checkpoints, zero product-code delta).

## 0. Gate defect under fix

DEFECT-1 [HIGH], verbatim from /home/brad/.hermes/cl/receipts/HARNESS-SEQ-1/2026-10-14_0945/report.md:
"Clarification round-trip failure — After clicking clarification option '1. EcoRI', a second stream request should be recorded with body containing 'Use EcoRI for sequence.' Actual: Only 1 stream request recorded after clicking; clarification response not rendered."

Honoring orch corrections: the failing leg is sequences-harness-chat.spec.ts:130 `expect(requestsAfterPick).toBe(requestsBeforePick + 1)`; the option-RENDER assertions passed at the gate; DEFECT-2 (/run/EXR-LANE2-AI10 404) is a wrong route in the gate prompt (real route /runs/:runId) — fixed nothing for it.

## 1. Root cause (with the real local-pass / served-fail difference)

The handler is NOT broken. The clarification-option click path works end-to-end:
ChatLog option button -> onClarificationPick(clarificationAnswerPrompt(...)) -> HarnessChatPane `chat.sendPrompt('Use EcoRI for sequence.')` -> useAiChat -> streamAssist fetch. Measured (probe B, in-page performance.now marks): React onClick (mouseup) at t=1046.0ms, the follow-up fetch fires at t=1052.3ms — 6.3ms later — with body `{"prompt":"Use EcoRI for sequence.","surface":"sequences",...}`; the answer turn then renders 'EcoRI it is.' (probe C: "answer body ok: true / answer turn rendered").

The genuine defect is a HARNESS RACE in the spec's eager read (the "evaluate-before-microtask" class the dispatch anticipated):
- useAiChat.sendPrompt deliberately flushSyncs the user bubble, then `await waitForNextPaint()` (requestAnimationFrame + setTimeout 0, useAiChat.ts:445 + :1350-1360) BEFORE the stream fetch — a product design so the bubble paints before the stream starts (predates this item: introduced in 237815f9).
- Spec lines 128-130: `click()` then an IMMEDIATE `page.evaluate` count read. The evaluate round-trip completes in ~2-5ms; the fetch lands ~6-20ms after the click. The read wins the race and sees the OLD count.
- Diagnostic run on the served production build: eager read = 2, answer fetch crossed +20.0ms after that read (marks: fetch#1 369.6, fetch#2(answer) 436.3, eager read returned ~416). Diagnostic on dev: eager read = 2, crossed +7.5ms after the read. Exactly the gate's "Expected: 3, Received: 2".

REAL local-pass / served-fail difference: my original lane-local run (:5194, cold vite, heavy module-graph load) won the race — the click->fetch gap happened to fit inside the slower CDP round-trip. The race is load-dependent: on my warm dev server the UNMODIFIED spec is FLAKY (probe C + 6 runs: 2 passed / 4 failed, same Expected 3 / Received 2); on the served production build (:5312 vite preview of `vite build` output — the gate's :5193 situation) it fails DETERMINISTICALLY (4/4 pre-fix). The gate hit the losing side of a race that was always there; the gate report's narrative ("options not visible / clarification not rendered") is wrong — rendering passes (gate itself confirmed the render assertions; my probes re-confirm).

## 2. Fix (timing-tolerant read; assertions preserved verbatim)

Dispatch-sanctioned path: proven genuine harness race -> timing-tolerant rewrite that still proves a second request fired with the term in its body. Product code was NOT changed: moving the fetch before waitForNextPaint would undo a deliberate, cross-surface paint-flush design in the shared useAiChat (blast radius: every chat surface) to paper over a test-read race.

app/e2e/sequences-harness-chat.spec.ts (+10 lines, nothing removed):
- Added `await expect.poll(() => page.evaluate(count), { timeout: 10_000 }).toBe(requestsBeforePick + 1)` after the click — proves the second request fires with EXACTLY one increment (poll asserts equality, not >=; a double-fire would time out the poll and fail).
- Kept the original `const requestsAfterPick = ...; expect(requestsAfterPick).toBe(requestsBeforePick + 1)` verbatim as a post-poll re-read.
- Kept verbatim: `expect(lastBody).toContain('Use EcoRI for sequence.')`, `await expect(log).toContainText('EcoRI it is.')`, all leg (a)/(b)/(d) assertions, `expect(errors).toEqual([])`.
- Comment block in the spec records the measured timings.

three-pane-harness.spec.ts and sequence-chat-scroll.spec.ts: UNTOUCHED (frozen). No product-code change in this fix run (`git diff --stat`: 1 file, +10).

## 3. Verification battery (lane-local servers only; :5193/:3093/:5174/:3001 never touched, nothing restarted)

My own servers: vite DEV on :5311 (VITE_CACHE_DIR=node_modules/.vite-l2t1040) and vite PREVIEW on :5312 serving `vite build` output (the served-build reproduction of the gate condition).

### 3a. sequences-harness-chat.spec.ts POST-FIX
Served production build :5312 (>=2 consecutive required; 3 run):
```
=== PREVIEW(:5312, served production build) RUN 1 ===  ✓ (722ms)  1 passed (2.8s)
=== PREVIEW(:5312, served production build) RUN 2 ===  ✓ (822ms)  1 passed (1.4s)
=== PREVIEW(:5312, served production build) RUN 3 ===  ✓ (722ms)  1 passed (1.2s)
```
Dev :5311 (3 consecutive):
```
RUN 1 ✓ (4.1s) 1 passed (5.3s) | RUN 2 ✓ (1.5s) 1 passed (2.0s) | RUN 3 ✓ (1.4s) 1 passed (1.9s)
```
PRE-FIX contrast (same unmodified spec): :5312 4/4 FAILED "Expected: 3 / Received: 2"; :5311 6 runs 2 passed / 4 failed (flaky).

### 3b. Frozen specs (UNMODIFIED)
Pair vs served build :5312: `6 passed (7.1s)` (three-pane 5 + sequence-chat-scroll 1, all ✓).
three-pane standalone vs :5312 x3: `5 passed` each.
Pair vs dev :5311 serial x3: run1 6 passed, run2 6 passed, run3 5 passed + 1 sequence-chat-scroll failure (waitForFunction(emitChatText) leg).
sequence-chat-scroll standalone dev :5311 x4: 3 passed / 1 failed; standalone served :5312: passed.
=> sequence-chat-scroll shows the known load-timing flap (matches the fleet's documented :5193 flap pattern; its failing leg is its OWN stub race, unrelated to this fix — my change touches only the clarification-pick read in sequences-harness-chat.spec.ts). three-pane-harness: green in every run.

### 3c. Vitest app/src/agent
```
✓ src/agent/AgentChatPane.test.tsx (1)  ✓ src/agent/ChatFocusContext.test.tsx (8)
✓ src/agent/ChatLog.test.tsx (7)        ✓ src/agent/HarnessChatPane.test.tsx (8)
Test Files 4 passed (4) / Tests 24 passed (24)
```

### 3d. Full app vitest zero-new proof (stash-parity, comm of fail-file lists)
Base (spec stashed to pre-fix) and head (post-fix), identical filter (src/ files, e2e/ collect noise excluded):
```
base:  Test Files 56 failed | 297 passed (353) / Tests 71 failed | 2314 passed (2385) / Errors 5
head:  Test Files 56 failed | 297 passed (353) / Tests 71 failed | 2314 passed (2385) / Errors 6
comm -3 base-vs-head fail-file lists: EMPTY (zero new fail files)
```
Errors 5 vs 6 is the known pre-existing unhandled-exception debt drift (ClarificationPicker / RawRecordEditor x4 / App.test.tsx DOMMatrix-via-pdfjs; count drifts 5-6 run to run at identical base and head).

## 4. tsc baseline verbatim (pre-fix capture; post-fix set-diff EMPTY, 23 == 23)

Captured in this worktree post-rebase: `cd app && npx tsc --noEmit` (23 error lines). Post-fix re-run: `grep -c "error TS"` = 23; `diff <(sort baseline) <(sort postfix)` = empty.

```
  Property 'equipments' is missing in type '{ type: "load_event_graph_success"; eventGraphId: string; runId: null; events: never[]; labwares: {}; placements: never[]; }' but required in type '{ type: "load_event_graph_success"; eventGraphId: string; runId: string | null; events: PlateEvent[]; labwares: Record<string, Labware>; equipments: Record<string, Equipment>; placements: EventEditorPlacement[]; }'.
  Property 'equipments' is missing in type '{ type: "load_event_graph_success"; eventGraphId: string; runId: null; events: PlateEvent[]; labwares: {}; placements: never[]; }' but required in type '{ type: "load_event_graph_success"; eventGraphId: string; runId: string | null; events: PlateEvent[]; labwares: Record<string, Labware>; equipments: Record<string, Equipment>; placements: EventEditorPlacement[]; }'.
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
  Type '"protocol-review"' is not assignable to type 'SystemPromptKind'.
  Types of property 'surface' are incompatible.
    Type 'string' is not assignable to type 'SurfaceId'.
```
(continuation lines of multi-line errors sort among the 23 counted `error TS` lines; the raw capture is /tmp/seq1-fix1-tsc-baseline.txt, post-fix /tmp/seq1-fix1-tsc-postfix.txt.)

## 5. Diff summary

- app/e2e/sequences-harness-chat.spec.ts: +10 lines (expect.poll + explanatory comment + verbatim re-read). No assertion removed or weakened.
- No product-code change. No server/schema change. Frozen specs untouched.
- Evidence probes kept at .hermes/probes/seq1-clar-probe{,-b,-c}.mjs (diagnostic spec copies were deleted after evidence capture).

## 6. Assumptions block

- Assumed the dispatch's explicit allowance ("prove the test itself has a genuine harness race (evaluate-before-microtask) -> timing-tolerant rewrite preserving the same assertions") is the correct path here, because the product behavior is measurably correct (fetch fires 6.3ms after onClick with the exact body; answer turn renders) and the failing read is a one-shot evaluate racing a deliberate rAF+setTimeout paint-flush in the shared useAiChat. Rewriting useAiChat's paint-flush instead would change every chat surface's stream timing to satisfy a read pattern — rejected.
- Assumed vite preview of `vite build` output on :5312 is a faithful reproduction of the gate's served-bundle condition (the gate ran the spec against a served :5193 while my original pass was a cold dev-server run); the deterministic pre-fix fail / deterministic post-fix pass on :5312 brackets the race.
- Assumed the sequence-chat-scroll dev-server flap (1 of 4 standalone dev runs, 1 of 3 pair runs; green on served build) is the fleet's known load-timing flap, not a regression from this fix (its failing leg is its own stub's waitForFunction, and the spec is frozen/untouched).
- DEFECT-2 (run-page 404) not touched per orch correction (b): real route is /runs/:runId; gate prompt handed the reviewer a wrong route.
- Vitest full-suite fail set (56 files / 71 tests) is pre-existing trunk debt proven identical base-vs-head by comm; the 5-vs-6 unhandled-error drift is the documented debt flapping.

## 7. Commits on cl/HARNESS-SEQ-1-lane2-l2t0805 (this fix run)

- 25758f0d test(harness): HARNESS-SEQ-1 fix1 — clarification-pick count read made timing-tolerant (expect.poll == before+1, exact-increment proof) after proven evaluate-before-microtask race (measured: answer fetch fires ~6ms after onClick, ~20ms after the eager read on served build); assertions verbatim; probes + report

HARNESS-SEQ-1 FIX1 DONE 25758f0d
