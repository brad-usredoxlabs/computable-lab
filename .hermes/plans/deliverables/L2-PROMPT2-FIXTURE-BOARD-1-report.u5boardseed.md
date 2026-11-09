# L2-PROMPT2-FIXTURE-BOARD-1 — Unit u5boardseed Report

## Summary
Inserted seed-board and verify-board steps into run-gate-legs.py plan, before workspace-reset.
Added test for fail-closed behavior when seed fails (T4: test_fail_closed_seed).

## Changes

### run-gate-legs.py
- Inserted two steps at head of plan(): "seed-board" and "verify-board"
- Updated docstring from "exactly 5 steps" to "exactly 7 steps"
- No changes to leg order, run() logic, timeouts, or fail-closed behavior
- No hardcoded record IDs (grep confirmed empty)

### test-run-gate-legs.py
- T1: Changed from count 5 to 7, order includes seed-board/verify-board before workspace-reset
- T2: Fail-closed reset — now fails on step 1 (seed-board)
- T3: Fail-closed undeclared — now expects step 4 (verify-workspace)
- T4: NEW — fail-closed seed: proves rc=1 and only 1 invocation when seed fails
- T5 (was T4): All green — 7 invocations, RECEIPT_DIR on leg steps
- T6 (was T5): Usage error unchanged

## Verification Results

### Test Suite
```
26 passed
EXIT=0
```
(5 new assertions added: T1 count, T1 order, T4 rc=1, T4 invocations=1, T4 no-leg)

### Dry-run (7 JSON lines)
First two steps are seed-board and verify-board, followed by workspace-reset, verify-workspace, legAB, leg3, leg4.

### Controlled Negative
```
FAILED seed-board rc=1
seed failed: seed create failed EVG-corpus2-prompt1-dmem-baseline -> -1 ...
EXIT=1
```
No "FAILED legAB" — the gate never ran.

### Hardcoded Boundary
`grep -n "EVG-\|tab-deck-\|corpus2-prompt1" run-gate-legs.py` — EMPTY (no matches)

### Live Positive
Not attempted — requires running server. The seed-board.py --seed/--verify behavior was not changed.

### Git Status
Clean tree.

## Files Changed
- `.hermes/plans/harness/corpus2-board/run-gate-legs.py` (+6 lines)
- `.hermes/plans/harness/corpus2-board/test-run-gate-legs.py` (+48 lines, -23 lines)

## Next Actions
None — unit is complete.

L2-PROMPT2-FIXTURE-BOARD-1 UNIT u5boardseed DONE 5aa1bfec9639316c1c324e2a7eaf36d5bddf4167
