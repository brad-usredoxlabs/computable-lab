# COMP3-A6 fix report - emission-side suppression of draft-turn prose on forced-tool flows (l2t0430)

Item: SHORTHAND-COMP-3 / SHORTHAND-COMP-2 close (criterion A6).
Worktree: /mnt/vast/home/brad/git/wt/COMP3-A6FIX-lane2-l2t0430 (branch cl/COMP3-A6FIX-lane2-l2t0430)
Branch base tip: 29fa7e20 (verified via `git log --oneline -5` at session start; includes the CUE-EXEMPT-1 merge 6cf14f60; no W2-9 g2dfix merge present on this branch at dispatch).
Spec: .hermes/plans/2026-10-14_0500-COMP3-A6-draft-prose-suppression-fix-spec.md (orchestrator's doc - left untracked, per report-integrity rule "commit only your own paths").
Architect decision adopted: route (a) emission-side, keyed on declared `draftFlowMode` (/home/brad/.hermes/cl/lanes/2/decisions/COMP3-A6-draft-prose-display-decision-l2t0430.md).

## 1. The fix (one guard, server only)

`server/src/ai/AgentOrchestrator.ts` stream-chunk text-delta block (was :1731-1736 at base 29fa7e20; now :1731-1748, guard `if` at :1745, emission at :1746):

```diff
             if (!choice) continue;
 
             // --- Text content delta ---
+            // COMP3-A6 (architect route (a), emission-side): on a forced-tool
+            // draft flow the model's interleaved first-person deliberation
+            // must never reach the chat pipe — the turn's answer rides the
+            // terminal RESULT payload (summarizeDraftResult -> stream-done
+            // fallbackText), not deltas. Keyed on this instance's DECLARED
+            // draftFlowMode — constructor data, the same declared fork already
+            // branched at :993/:1149/:1155/:3262/:3278 — not a model/host sniff.
+            // accumulatedContent stays byte-unchanged in BOTH modes: history
+            // fidelity and the stop-coercion path + its contentPreview
+            // diagnostic consume it.
             const deltaContent = choice.delta?.content;
             if (typeof deltaContent === 'string' && deltaContent.length > 0) {
               accumulatedContent += deltaContent;
-              onEvent?.({ type: 'text_delta', delta: deltaContent });
+              if (draftFlowMode !== 'forced-tool') {
+                onEvent?.({ type: 'text_delta', delta: deltaContent });
+              }
             }
 
             // --- Tool-call deltas (structure not in ChatMessage type; needs local cast) ---
```

`accumulatedContent += deltaContent` is byte-unchanged in BOTH modes (history fidelity +
stop-coercion contentPreview diagnostics - proven by T1b, section 3). `draftFlowMode` is the
constructor-declared value destructured at AgentOrchestrator.ts:983 (default 'forced-tool');
branching on it is code interpreting declared data, the same fork already branched at
:993/:1149/:1155/:3262/:3278. NO new config field, NO client change, NO prompt/profile edit.
`grep -n "text_delta" server/src/ai/AgentOrchestrator.ts` shows exactly ONE emission site
(:1746) - this guard covers the whole emission path; there is no second server emission path.

Product diff (whole change): `git -c core.fileMode=false diff --name-only HEAD` after commit =
`server/src/ai/AgentOrchestrator.ts` (13 insertions, 1 deletion) + new test file
`server/src/ai/AgentOrchestrator.draftProseSuppression.test.ts`. Zero app/ files touched.

## 2. Tests (RED first)

New file: `server/src/ai/AgentOrchestrator.draftProseSuppression.test.ts` - fake streaming
client (`interleavedClient`) replaying scripted chunks: first-person deliberation deltas
interleaved with partial tool-call deltas (id+name chunk, then arguments fragments), per the
gate's leak pattern; pattern per AgentOrchestrator.shorthandChat.test.ts (colocated fixtures,
test seeds only).

### RED (pre-fix, raw: .hermes/raws/red-a6-tests-3.txt; first capture red-a6-tests.txt)

```
 FAIL  src/ai/AgentOrchestrator.draftProseSuppression.test.ts > COMP3-A6 — forced-tool draft turns suppress model prose at emission > T1a: a forced-tool turn streaming deliberation interleaved with tool calls emits ZERO text_delta — and the tool trace + draft survive
 FAIL  src/ai/AgentOrchestrator.draftProseSuppression.test.ts > COMP3-A6 — forced-tool draft turns suppress model prose at emission > T1b: accumulatedContent stays intact under suppression — prose-only draft JSON still fires the stop-coercion path
 FAIL  src/ai/AgentOrchestrator.draftProseSuppression.test.ts > COMP3-A6 — forced-tool draft turns suppress model prose at emission > T3a: the forced-tool success turn still returns the terminal result payload carrying the A5 product copy
 FAIL  src/ai/AgentOrchestrator.draftProseSuppression.test.ts > COMP3-A6 — forced-tool draft turns suppress model prose at emission > T3b: the refusal arm still surfaces the server-built cannot-draft wording — suppression does not eat honest text
```

```
AssertionError: expected [ { type: 'text_delta', …(1) }, …(1) ] to have a length of +0 but got 2
AssertionError: expected [ { type: 'text_delta', …(1) }, …(2) ] to have a length of +0 but got 3
AssertionError: expected [ { type: 'text_delta', …(1) }, …(1) ] to have a length of +0 but got 2
AssertionError: expected [ { type: 'text_delta', …(1) }, …(3) ] to have a length of +0 but got 4
```

```
 Test Files  1 failed (1)
      Tests  4 failed | 1 passed (5)
   Start at  05:31:12
   Duration  3.30s (transform 722ms, setup 0ms, collect 2.04s, tests 122ms, environment 0ms, prepare 360ms)
```

(The first RED capture, red-a6-tests.txt, additionally showed T2 failing on the preflight pin
because the assertion ran AFTER `compileSpy.mockRestore()` - restore clears recorded calls;
the pin was reordered to assert before restore. That is a test-authoring fix, not a product
change; the honest RED for the four suppression arms is above.)

### GREEN (post-fix, raw: .hermes/raws/green-a6-tests.txt)

```
 Test Files  1 passed (1)
      Tests  5 passed (5)
   Start at  05:31:36
   Duration  1.76s (transform 725ms, setup 0ms, collect 1.15s, tests 88ms, environment 0ms, prepare 128ms)
```

### T2 pin strength - mutation demo (raw: .hermes/raws/mutation-t2.txt)

T2 passes pre-fix (deltas already stream on preflight-llm), so it cannot produce a natural
RED. Vacuity was disproved by MUTATION: temporarily replacing the guard condition with
`if (false && draftFlowMode !== 'forced-tool')` (suppress in ALL modes) - T2 fails, the four
suppression arms stay green (they assert zero deltas either way):

```
 FAIL  src/ai/AgentOrchestrator.draftProseSuppression.test.ts > COMP3-A6 — forced-tool draft turns suppress model prose at emission > T2 (regression pin): the SAME fake on a preflight-llm instance streams deltas verbatim and its compiler preflight still runs
```

```
 Test Files  1 failed (1)
      Tests  1 failed | 4 passed (5)
   Start at  05:31:44
   Duration  1.78s (transform 682ms, setup 0ms, collect 1.11s, tests 85ms, environment 0ms, prepare 91ms)
```

Mutation reverted (guard restored verbatim; verified by re-running the suite green and by the
committed diff above).

## 3. What each test pins

- T1a (forced-tool, default agentConfig): deliberation interleaved with tool-call deltas ->
  ZERO `text_delta` events; `status`, `tool_call` (agent_intent), `tool_result` trace events
  still emitted; draft still compiles (12 events from the shorthand fixture); legacy
  runChatbotCompile tripwire never called.
- T1b (forced-tool, prose-only draft JSON, no tool call): zero `text_delta` AND the
  stop-coercion fast path still fires ("Parsed the draft from the model's text..." status,
  `client.complete` never called) - proves `accumulatedContent` is intact under suppression.
- T2 (same fake, `draftFlowMode: 'preflight-llm'`, no explicit forceDraftTool): deltas
  emitted VERBATIM (join equals the streamed prose, count equal), compiler preflight ran
  (compileSpy called, asserted before mockRestore), and the forced-flow "Skipping compiler
  preflight" status never fired. Regression pin for every non-forced surface.
- T3a (forced-tool success): zero deltas AND the terminal result payload (what the handlers
  send as `done` - AIHandlers.ts:296 `sendEvent({ type: 'done', result })`) still carries
  success, events, `shorthand` verbatim, and the A5 copy
  "Draft compiled deterministically from the scientist-intent shorthand." in `result.notes`.
- T3b (forced-tool, raw event_graph refused twice on the shorthand surface): zero deltas,
  BOTH refusal status events present, `result.error` matches /cannot draft/i, raw payload
  never compiled. Server-built honest text survives suppression.

## 4. Battery (CODER-CAPTURED; raws under .hermes/raws/)

All runs serialized (one vitest job at a time on NFS).

### 4a. Targeted server/src/ai dir - base (pre-fix, base-ai-suite.txt)

```
 Test Files  10 failed | 87 passed (97)
      Tests  18 failed | 765 passed (783)
     Errors  2 errors
   Start at  05:22:44
   Duration  13.53s (transform 14.25s, setup 22ms, collect 135.49s, tests 25.49s, environment 114ms, prepare 28.24s)
```

### 4b. Targeted server/src/ai dir - head (post-fix, head-ai-suite.txt)

```
 Test Files  10 failed | 88 passed (98)
      Tests  18 failed | 770 passed (788)
     Errors  2 errors
   Start at  05:32:08
   Duration  12.82s (transform 11.52s, setup 17ms, collect 114.62s, tests 23.61s, environment 80ms, prepare 27.74s)
```

Fail-FILE set base vs head (`comm -3 .hermes/raws/base-failfiles.txt .hermes/raws/head-failfiles.txt`): EMPTY - identical 10 files:

```
src/ai/AgentOrchestrator.bypass.test.ts
src/ai/AgentOrchestratorForwarding.test.ts
src/ai/AgentOrchestrator.golden.test.ts
src/ai/AgentOrchestrator.goldenWithSeeds.test.ts
src/ai/AgentOrchestrator.tubeGate.test.ts
src/ai/attachedProtocol.test.ts
src/ai/ChatbotCompileDeckSlot.test.ts
src/ai/chatbotCompile.e2e.test.ts
src/ai/createRecordIntent.test.ts
src/ai/submitSuggestionTool.tubeSchema.test.ts
```

Fail-TEST set base vs head (`comm -3 .hermes/raws/base-failtests.txt .hermes/raws/head-failtests.txt`): EMPTY (18 = 18 names, byte-identical). The +1 file / +5 tests at head are the new test file passing. The `Errors 2 errors` line is pre-existing unhandled-exception debt, identical base->head.

### 4c. Full server suite - head (head-full-server.txt)

```
 Test Files  89 failed | 624 passed | 9 skipped (722)
      Tests  98 failed | 5739 passed | 70 skipped (6080)
     Errors  2 errors
   Start at  05:32:59
   Duration  248.15s (transform 93.11s, setup 514ms, collect 1478.11s, tests 1823.01s, environment 1.55s, prepare 513.91s)
```

### 4d. Full server suite - base (stash-parity: fix+test stashed, base-full-server.txt)

```
 Test Files  91 failed | 621 passed | 9 skipped (721)
      Tests  99 failed | 5729 passed | 70 skipped (6075)
     Errors  2 errors
   Start at  05:39:14
   Duration  242.42s (transform 94.74s, setup 311ms, collect 1440.08s, tests 1807.23s, environment 933ms, prepare 492.98s)
```

Headline moves 91f->89f / 99f->98f. Set-diff (`comm -3 .hermes/raws/base-full-failfiles.txt .hermes/raws/head-full-failfiles.txt`) - base-only (failed at base, passed at head), i.e. NFS load flakes on files unrelated to this diff:

```
src/integration/W25DraftLifecyclePromotion.test.ts
src/revisions/Qms6bSchemaDrift.test.ts
```

Head-only (NEW failures): EMPTY - zero new fail files. Proof the two base-only files are load
flakes, not fix-related: standalone re-run at head (head-standalone-flappers.txt):

```
 Test Files  2 passed (2)
      Tests  9 passed (9)
   Start at  05:43:37
   Duration  24.20s (transform 4.51s, setup 0ms, collect 5.80s, tests 18.80s, environment 0ms, prepare 368ms)
```

src/ai subset of the full head run is identical to the targeted ai-dir head run (diff of
fail-file lists: empty; `grep -c AgentOrchestrator.draftProseSuppression` on the full-run
fail list: 0).

### 4e. Boundary suites re-run green at head (green-boundary-suites.txt)

AgentOrchestrator.shorthandChat.test.ts + AgentOrchestrator.honestRefusal.test.ts +
AgentOrchestrator.reviewWriteWall.test.ts (the suites that own the A5/refusal/write-wall
boundary behavior):

```
 Test Files  3 passed (3)
      Tests  31 passed (31)
   Start at  05:38:48
   Duration  3.93s (transform 1.35s, setup 1ms, collect 8.26s, tests 431ms, environment 0ms, prepare 1.21s)
```

### 4f. Typecheck

- server `npx tsc --noEmit`: base exit 0 (base-tsc.txt), head exit 0 (head-tsc.txt) - 0 new errors.
- app `npx tsc --noEmit`: base 23 `error TS` lines (base-app-tsc.txt, stash-parity), head 23
  (head-app-tsc.txt); error-set `comm -3` of `file(line,col): error TSxxxx` signatures: EMPTY
  (matches the lane-2 pin of 23 app-tsc errors at this trunk).

## 5. Boundary pins table

| Boundary (from decision artifact) | How pinned | Status |
|---|---|---|
| A5 copy "Drafted 1 event. Draft compiled deterministically from the scientist-intent shorthand." rides the RESULT payload; summarizeDraftResult/stream-done/fallbackText untouched | T3a asserts the exact server note in result.notes + shorthand verbatim; diff touches no app/ file and no server note line (AgentOrchestrator.ts:2340 at head - the note string is not in the diff) untouched; boundary suite 4e green | PASS |
| preflight-llm / preflight-deterministic flows byte-unchanged | T2 (verbatim deltas + preflight ran + no skip-status) + mutation demo + 4b fail-set comm empty | PASS |
| Server-built refusals / cannot-draft wording / clarifications remain rendered | T3b (two refusal status events + result.error /cannot draft/i); honestRefusal suite green in 4e | PASS |
| No suppression of status / tool_call / tool_result / ledger_answer | Guard wraps ONLY the single `text_delta` emission line (diff section 1); T1a asserts status+tool_call+tool_result present; ledger_answer emission (:2882 at head) untouched by diff | PASS |
| ZERO client changes; no profile/prompt edit; no new config field | diff --name-only = server AgentOrchestrator.ts + new test only; no config/ or app/ paths in diff | PASS |

## 6. Assumptions disclosed

1. Production blast radius: the run chat runs through the shared orchestrator instance
   (server.ts:1199, agentConfig = profile.agent ?? {} at :1096). `draftFlowMode` defaults to
   'forced-tool' at AgentOrchestrator.ts:983 when unset; no config file in the repo sets
   draftFlowMode (grep over config/ found none; config.example.yaml:211 documents
   `draftFlowMode: forced-tool`). So the gate's run chat is a forced-tool instance and is
   suppressed; any deployment that explicitly declares preflight-llm keeps streaming prose
   (T2). Verified by reading, not assumed from the spec.
2. The terminal `done` event is emitted by the API handlers (AIHandlers.ts:296,
   RunDraftHandlers.ts:329 etc. `sendEvent({ type: 'done', result })`), not by an
   orchestrator onEvent call - so T3a pins the RESULT payload the handlers wrap in `done`.
   The spec's "terminal done with result payload" is pinned at that seam.
3. T2's preflight assertion must run before `compileSpy.mockRestore()` (restore clears
   recorded calls) - discovered in the RED cycle (red-a6-tests.txt), fixed in the test only.
4. Full-suite headline drift 91f->89f is NFS load flapping on two files outside this diff
   (both pass standalone at head, section 4d); zero new failures proven by set-comm, not headline.
5. `Errors 2 errors` in both ai-dir and full runs is pre-existing unhandled-exception debt,
   identical base->head (lane-known debt; not introduced or fixed here).
6. Gate r2 evidence (run-page PROMPT 1 + 2 on /runs/RUN-2026-10-09-run-1i4b, assistant-bubbles
   assertions) requires the stack restart - THE STACK RESTART IS THE ORCHESTRATOR'S STEP;
   no server was restarted or touched by this coder run (appliance-2:18080, thunderbeast:8080,
   computable:8080 all preserved).
7. Vitest tails above were extracted programmatically from the saved raws (leading spaces
   preserved) and verified with `grep -F -x` against the raw files; raw paths cited are the
   re-derivation source.

## 7. Changed paths

- server/src/ai/AgentOrchestrator.ts (guard + comment, 13+/1-)
- server/src/ai/AgentOrchestrator.draftProseSuppression.test.ts (new, 5 tests)
- .hermes/plans/reports/COMP3-A6-fix-report.l2t0430.md (this report)
- .hermes/raws/* (CODER-CAPTURED evidence logs)

Untracked and left so: .hermes/plans/2026-10-14_0500-COMP3-A6-draft-prose-suppression-fix-spec.md
(orchestrator's spec doc placed in the worktree for reading).

## Unresolved / for the orchestrator

- Gate r2 run-page verification after merge + stack restart (browser reviewer). If prose still
  appears anywhere in a bubble, the decision artifact's fallback applies: report the SECOND
  emission path - this run found exactly one server emission site (:1746), so a residual leak
  would most likely be a client-side channel (ChatHandlers.ts proxy path, which does not go
  through AgentOrchestrator at all) - flagged, not papered over.
