# L2-THREADSCOPE-FLIP-1 — P7 Closure Cycle Report (l2t0158)

## Scope
Two test files, four hunks, zero production changes. Per ruling ~/.hermes/cl/lanes/2/decisions/THREADSCOPE-P7-unsaveddeck-l2t0110-ruling.md §2/§3.

## Changed Files
- app/src/event-editor/deck/DeckSurfaceChat.threadScope.test.tsx (import + second it block: edits 1-5)
- app/src/shared/shell/SurfaceChatBridge.scopeSettle.test.tsx (:126 gets()->io() one-line change)

## Commit Log
- Commit A: 281a5da3 L2-THREADSCOPE-FLIP-1 closure: P7 single-case amendment per ruling l2t0110
- Commit B: 4f96dc3a L2-THREADSCOPE-FLIP-1 closure: defect-2 pin upgrade gets()->io() per ruling §3a

## VERIFY 1: DeckSurfaceChat.threadScope.test.tsx

```
RUN  v1.6.1 /mnt/vast/home/brad/git/wt/L2-THREADSCOPE-FLIP-1-lane2-l2t0550/app

 ✓ src/event-editor/deck/DeckSurfaceChat.threadScope.test.tsx  (2 tests) 5233ms

 Test Files  1 passed (1)
      Tests  2 passed (2)
   Duration  26.97s (transform 2.58s, setup 1.53s, collect 7.38s, tests 5.23s, environment 10.62s, prepare 595ms)
```
Duration 5233ms ≥ 5000ms — proves deadline release. PASS.

## VERIFY 2: Full P7 set (one run)

```
 ✓ src/shared/api/aiThreadClient.promote.test.ts  (2 tests) 4ms
 ✓ src/shared/hooks/useAiChat.threadScoped.test.ts  (6 tests) 304ms
 ✓ src/agent/HarnessChatPane.threadPicker.test.tsx  (4 tests) 355ms
 ✓ src/event-editor/deck/DeckSurfaceChat.threadScope.test.tsx  (2 tests) 5163ms

 Test Files  4 passed (4)
      Tests  14 passed (14)
```
All P7 tests green. PASS.

## VERIFY 3: SurfaceChatBridge.scopeSettle.test.tsx green + F-mutation tail

Green run:
```
 ✓ src/shared/shell/SurfaceChatBridge.scopeSettle.test.tsx  (4 tests) 28ms
 Test Files  1 passed (1)
      Tests  4 passed (4)
```

F-mutation (guard-3 reverted at useAiChat.ts:950, :125 relaxed):
```
RUN  v1.6.1 /mnt/vast/home/brad/git/wt/L2-THREADSCOPE-FLIP-1-lane2-l2t0550/app

stdout | src/shared/shell/SurfaceChatBridge.scopeSettle.test.tsx > SurfaceChatBridge — scope-settle pin matrix (unit 3: P2/P3/P5/P6) > P5 (C-4): a provisional send writes nothing; on release the held turn POSTs under the settled scope only
F-MUTATION: io() = [
  {
    "u": "/api/ai/threads/event-editor/threads",
    "m": "GET",
    "h": {
      "x-cl-thread-id": "415fb79e-a5b7-46ac-87aa-1d2b6dd1b0ce"
    }
  }
]

 ❯ src/shared/shell/SurfaceChatBridge.scopeSettle.test.tsx  (4 tests | 1 failed) 79ms
   ❯ ... > P5 (C-4): a provisional send writes nothing; on release the held turn POSTs under the settled scope only
     → expected [ { …(3) } ] to have a length of +0 but got 1

 Test Files  1 failed (1)
      Tests  1 failed | 3 passed (4)

 FAIL  ... > P5 (C-4): a provisional send writes nothing; on release the held turn POSTs under the settled scope only
AssertionError: expected [ { …(3) } ] to have a length of +0 but got 1
 ❯ src/shared/shell/SurfaceChatBridge.scopeSettle.test.tsx:127:112
```
Failure lands on the upgraded :126 line (now :127 due to added log). The list URL `/api/ai/threads/event-editor/threads` is visible in the captured io() output — the LIST GET is observed by io() but invisible to gets() (which excludes `/threads`). This proves the pin upgrade is non-vacuous. PASS.

## VERIFY 4: Full app suite totals

```
Test Files  63 failed | 410 passed (473)
      Tests  80 failed | 2990 passed (3070)
     Errors  5 errors
```
Base totals: 63 failed, 410 passed (473). 80 failed, 2990 passed (3070). No new tests added (0 new). Our changed files show green in the full run. The 63 failures and 80 test failures are pre-existing (ClaimCollectionView, ClarificationPicker.realshape.card1, useAiChat.card1fix5.realDrop, and e2e/spec files that were already red at HEAD).

## VERIFY 5: Typecheck

```
npx tsc --noEmit -p . 2>&1 | grep -c 'error TS'
10
```
10 pre-existing errors, zero NEW lines, none in our files. PASS.

## VERIFY 6: Amendment note, derived timeouts, no literals

- Amendment note present at line :313-315, citing ruling path. PASS.
- Both timeouts derived from DOOR_REQUIRED_RECHECK_DEADLINE_MS:
  - waitFor timeout: DOOR_REQUIRED_RECHECK_DEADLINE_MS + 2000
  - it() third arg: DOOR_REQUIRED_RECHECK_DEADLINE_MS + 10000
- No literal 5000/7000 in the file. PASS.

## §4 Process Disposition

The prior cycle shipped a red P7 test instead of STOP+report; STOP stands unamended.

L2-THREADSCOPE-FLIP-1 UNIT p7close DONE 3baaa714fc40419a8bbedb886c9e0b11958ace06
