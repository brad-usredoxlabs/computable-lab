# L2-CLARIFY-CARD-1 — cmount1closeout Report

## (a) Unit + Item + Branch + Base SHA + Tip SHA

- Item: L2-CLARIFY-CARD-1
- Unit: cmount1closeout (1 of 1)
- Branch: cl/lane2-card1-cmount
- Base SHA: 2582933d5e6ed6b0c67c3b7fee52aa1915788d97
- Gated Commit SHA: 2582933d5e6ed6b0c67c3b7fee52aa1915788d97

## (b) Deliverable Provenance

The code hunk lives in 500e6a7e, a launcher WIP auto-commit (NOT gated). It was launcher-preserved
from the cmount1fix run that exited DIRTY at 16:03 EST. The hunk was then re-landed as gated commit
2582933d ("L2-CLARIFY-CARD-1 cmount-1: hold provisional past settle deadline while host reports
scopePending"). `git show --stat 2582933d` confirms 1 file changed, 7 insertions, 2 deletions:

```
2582933d L2-CLARIFY-CARD-1 cmount-1: hold provisional past settle deadline while host reports scopePending
 app/src/shared/shell/SurfaceChatBridge.tsx | 9 +++++++--
 1 file changed, 7 insertions(+), 2 deletions(-)
```

The WIP commit 500e6a7e shows identical content:

```
500e6a7e WIP AT EXIT (launcher auto-commit, NOT gated): L2-CLARIFY-CARD-1 left the tree dirty; committed by cl-coder-launch.py so no work is lost. Review before accepting.
 app/src/shared/shell/SurfaceChatBridge.tsx | 9 +++++++--
 1 file changed, 7 insertions(+), 2 deletions(-)
```

Line-by-line verification against the briefed hold:

- SurfaceChatBridge.tsx:286 — `const hostReportsPending = declaresDeck && scopePending === true`
  (=== true, not ?? true — load-bearing for P3)
- SurfaceChatBridge.tsx:287 — `const settleWindowElapsed = useScopeSettleDeadline(scopeUndecided && !hostReportsPending)`
  (deadline gated by !hostReportsPending)
- SurfaceChatBridge.tsx:289 — `scopeUndecided && (hostReportsPending || !settleWindowElapsed) ? 'provisional' : 'settled'`
  (provisional when host reports pending OR window not elapsed)

## (c) Test Evidence

Test run executed at this tip (2582933d):

- `npx vitest run src/shared/shell/SurfaceChatBridge.door.test.tsx` → Test Files 1 passed (1), Tests 7 passed (7)
- `npx vitest run src/shared/shell/SurfaceChatBridge.scopeSettle.test.tsx` → Test Files 1 passed (1), Tests 5 passed (5)
- Total: 2 test files, 12 tests passed (12)
- File-level counts: door = 7 tests, scopeSettle = 5 tests

## (d) Invariant Check

P3 pin at SurfaceChatBridge.scopeSettle.test.tsx:98 is GREEN:

```
it('P3 (C-2 bounded): a deck slice that never carries a scope — zero IO before the deadline, ONE settled-absent GET + one map key after', ...
```

This confirms: an ABSENT scopePending prop still settles to absent at the deadline. The `=== true`
choice is load-bearing — it keeps the bounded-settle path active when scopePending is absent, so
P3 still passes and optional-deck doors do not hang provisional forever.

## (e) Scope Statement

`git show --stat 500e6a7e` proves the WIP contains no file other than SurfaceChatBridge.tsx.
This closeout commit adds only this report file (.hermes/plans/reports/L2-CLARIFY-CARD-1-cmount1closeout.md).

## (f) Browser/UI Claim

This unit produces NO browser or UI evidence. The D2(b) live re-gate is the orchestrator's/browser
reviewer's step on the served rev. No verdict on browser behavior is produced here.

---

L2-CLARIFY-CARD-1 UNIT cmount1closeout DONE 2582933d5e6ed6b0c67c3b7fee52aa1915788d97
