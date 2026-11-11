# L2-NOUN-RESOLUTION-POLICY-1 — Unit a1audit Report

## Branch
Branch: cl/lane2-nounpolicy-a1-0656
HEAD (WIP): 93c8b2b7e74bf037544821190187cac7be5011d3
Fork base: c51fbe66

## Context
The a1 coder run exited with exit_marker: missing. The tree was auto-committed
as 93c8b2b7 without gate check or report. This audit runs the three verify commands,
fixes red items, and files the report with exit marker.

## Changes Made

### Change 1: shorthandChat.ts — binding ref stored as CURIE
File: server/src/ai/shorthandChat.ts:1539
The foldAnswersIntoShorthand function stored binding.ref as raw record id (e.g. 'MAT-exoticxyz').
The bindingsToAnsweredSlots mapper calls recordIdFromCurie which strips 'local:' prefix.
Fix: wrap the id with 'local:' prefix when storing bindings.

### Change 2: AgentOrchestrator.foldanswerbind.test.ts — outcome assertion
File: server/src/ai/AgentOrchestrator.foldanswerbind.test.ts:125
The test asserted outcome === 'events', but CompileOutcome only has
'complete' | 'gap' | 'error' | 'needs-clarification'. Changed to 'complete'.

## Verify Results

### Verify 1: foldbind regression
Command: cd server && node node_modules/vitest/vitest.mjs run src/ai/AgentOrchestrator.foldbind.test.ts
Output:
```
RUN  v1.6.1 /home/brad/cl-wt/L2-NOUNPOLICY-a1-lane2/server

 ✓ src/ai/AgentOrchestrator.foldbind.test.ts  (3 tests) 109ms

 Test Files  1 passed (1)
      Tests  3 passed (3)
   Duration  2.10s
```
Verdict: PASS — 1 file / 3 tests passed. The a1 fold arm binds the answered noun to the chosen record id.

### Verify 2: foldanswerbind (RED at WIP, GREEN after fix)
Command: cd server && node node_modules/vitest/vitest.mjs run src/ai/AgentOrchestrator.foldanswerbind.test.ts

WIP output (RED):
```
 FAIL src/ai/AgentOrchestrator.foldanswerbind.test.ts
   → expected 'MAT-exoticxyz' to be 'local:MAT-exoticxyz' // Object.is equality
 Test Files  1 failed (1)
      Tests  1 failed | 1 passed (2)
```

Post-fix output (GREEN):
```
RUN  v1.6.1 /home/brad/cl-wt/L2-NOUNPOLICY-a1-lane2/server

 ✓ src/ai/AgentOrchestrator.foldanswerbind.test.ts  (2 tests) 97ms

 Test Files  1 passed (1)
      Tests  2 passed (2)
   Duration  1.84s
```
Verdict: PASS — 1 file / 2 tests passed. The a1 fold arm binds the answered noun to the chosen record id.
Fix required: binding ref CURIE (shorthandChat.ts:1539) and outcome assertion (test file line 125).
The assertion at line 133 catches the binding — if compileFoldedShorthand stops passing
answeredSlots, the material slot stays unresolved and materialClarifications > 0.

### Verify 3: regression sample
Command: cd server && node node_modules/vitest/vitest.mjs run src/ai/AgentOrchestrator.answerIntent.test.ts src/ai/AgentOrchestrator.ghostpaint1.fold.test.ts
Output:
```
 ✓ src/ai/AgentOrchestrator.answerIntent.test.ts  (2 tests) 46ms
 ✓ src/ai/AgentOrchestrator.ghostpaint1.fold.test.ts  (3 tests) 240ms

 Test Files  2 passed (2)
      Tests  5 passed (5)
   Duration  2.00s
```
Verdict: PASS — 2 files / 5 tests passed. No regression.

### Verify 4: tsc --noEmit
Command: cd server && npx tsc --noEmit
Result: 33 errors total, all pre-existing. 0 errors in the three owned files
(AgentOrchestrator.ts, AgentOrchestrator.foldanswerbind.test.ts, shorthandChat.ts).

### Verify 5: tree status
Command: git -c core.fileMode=false status --short
Result: Clean tree at exit.

## Review Bait Checks
- exactOptionalPropertyTypes: answeredSlots uses conditional spread (shorthandChat.ts:581)
- recordIdFromCurie: exported at shorthandChat.ts:541, used by bindingsToAnsweredSlots (AgentOrchestrator.ts:1122)
- No second curie-stripping helper introduced
- No fixture ids in production code
- resolveNounsPass.ts untouched

L2-NOUN-RESOLUTION-POLICY-1-a1audit UNIT unit DONE 93c8b2b7e74bf037544821190187cac7be5011d3
