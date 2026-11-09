# L2-THREADSCOPE-FLIP-1 — Unit u6-deadline Report

## Defect Authority
review: .hermes/cl/lanes/2/reviews/L2-THREADSCOPE-FLIP-1-advc-fullseries-l2t0755.md §3 D2 (MAJOR)
fix location: app/src/shared/shell/SurfaceChatBridge.tsx — `useScopeSettleDeadline`
branch: cl/lane2-threadscope-u6deadline
base: 03e8da34

## Command Results

### 1. git rev-parse (sha verification)
```
$ git -c core.fileMode=false rev-parse HEAD
70baf71505a8713b44787519700053e0dbbd2949
$ git -c core.fileMode=false rev-parse 70baf715
70baf71505a8713b44787519700053e0dbbd2949
```
The first 8 chars match; the remaining 32 were **not** fabricated. Both resolve to the same
full 40-char sha. This supersedes the earlier claimed marker
`70baf715c2e4c6a5b12e5e6e8a0d9c7f3e1b4a2d` (D2/minor — fabricated suffix).

### 2. RED test pin + GREEN fix commit
```
$ git -c core.fileMode=false rev-parse 46beb2e5
46beb2e5ffe7684ae9bd37fe54164179aa9bd14b
```
RED pin: 46beb2e5 (two-window P7 test exposing D2 bug).
GREEN fix: 70baf715 (`setElapsed(false)` on `!active`).

### 3. Targeted suite — green
```
$ cd app && npx vitest run src/shared/shell/SurfaceChatBridge.scopeSettle.test.tsx
 ✓ src/shared/shell/SurfaceChatBridge.scopeSettle.test.tsx  (5 tests) 49ms
 Test Files  1 passed (1)
       Tests  5 passed (5)
```
Verification facts: orchestrator run 2026-11-05 08:10, 5/5 passing.

### 4. Neighbouring pins (P-a/P-b/P-c + 5s ruled deadline)
```
$ cd app && npx vitest run src/shared/shell/SurfaceChatBridge.door.test.tsx \
      src/event-editor/deck/DeckSurfaceChat.threadScope.test.tsx
 ✓ src/shared/shell/SurfaceChatBridge.door.test.tsx  (6 tests) 56ms
 ✓ src/event-editor/deck/DeckSurfaceChat.threadScope.test.tsx  (2 tests) 5159ms
 Test Files  2 passed (2)
       Tests  8 passed (8)
```

### 5. Typecheck
```
$ cd app && npx tsc --noEmit
RC=2, lines=12, errorTS=10
--- lines mentioning SurfaceChatBridge ---
(none)
```
Baseline unchanged, zero new errors in either touched file.

### 6. Delta shape
```
$ git diff --stat 03e8da34..HEAD
 .../shell/SurfaceChatBridge.scopeSettle.test.tsx   | 36 ++++++++++++++++++++++
 app/src/shared/shell/SurfaceChatBridge.tsx         |  5 ++-
 2 files changed, 40 insertions(+), 1 deletion(-)
```
Only the two allowed files touched. No config, schema, server, or useAiChat.ts.

### 7. Status
```
$ git status --porcelain --untracked-files=no
(empty)
```

## Fix Summary
On deactivation (`!active`), the hook now calls `setElapsed(false)` instead of early-returning.
This prevents `elapsed` from being latched true forever across windows. Verified by mutation control
(pre-fix revert => RED at P7 pre-advance assertion :175) and by adjacency pin sweep (§5 above).

## Adversarial Delta Review
Review path: /home/brad/.hermes/cl/lanes/2/reviews/L2-THREADSCOPE-FLIP-1-advc-u6delta-l2t0815.md
Verdict: fix. Defects listed there are these two paperwork items only (D1: missing report,
D2: fabricated sha in DONE marker). Product fix is mutation-proven correct per §1.6 of that review.

## Outstanding Defects Addressed in This Report
- D1 (MAJOR): Missing deliverable report — this file closes it.
- D2 (MINOR): Fabricated sha suffix — superseded by the verified sha above.

L2-THREADSCOPE-FLIP-1 UNIT u6-deadline DONE 70baf71505a8713b44787519700053e0dbbd2949
