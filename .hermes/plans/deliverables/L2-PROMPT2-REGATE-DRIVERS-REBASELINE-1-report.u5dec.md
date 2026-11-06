# L2-PROMPT2-REGATE-DRIVERS-REBASELINE-1 — unit u5dec report

Unit: u5dec (decision unit: fix vs pin-only for the u4card done-arm test).
Worktree: /home/brad/cl-wt/wt-L2-PROMPT2-REGATE-DRIVERS-REBASELINE-1-u4cardfix (lane 2).
Merged sha after STEP 0 fetch+merge cl/integration-2: `9e730b83026012c0cf173d1a1d27c3caf7da2d2c`.

## State found (corrects one brief anchor)
The brief said the decision state was the trunk predicate `slice(index+1).some(user)`.
At merged tip that is true of origin/cl/integration-2 (afa2e8fd), but NOT of this branch:
commit `412f82c9` (u4card, ancestor of 66293fcd) already changed ChatLog.tsx:117 to the
adjacency form `messages[index + 1]?.role === 'user'` and added the 90-line
ChatLog.regate.u4card.test.tsx pin. The launcher WIP `4b02d24c` added only the 126-line
done-arm test on top; `git diff 66293fcd HEAD -- app/src/agent/ChatLog.tsx` was empty.

## Decision: PIN-ONLY
One-line reason: with the adjacency predicate in place the done-arm test is GREEN; the
product fix it pins already exists (412f82c9) and the mutation run proves it is
load-bearing, so no new product fix was warranted.
Deliverable: the done-arm test strengthened into a TWO-SIDED adjacency pin (the WIP version
would also pass with a never-answered predicate — it pinned only over-suppression).

## Verification (raw)
Baseline at merged tip, unmodified WIP test (never run before):
`cd app && npx vitest run src/agent/ChatLog.regate.u4card.done.test.tsx`
  -> 1 passed (1) / EXIT=0, 17.39s (log /tmp/u5dec-baseline.log).

Mutation matrix on the strengthened test (ChatLog.tsx edited in-tree, then `git checkout --`):
  1. trunk broad form `slice(index + 1).some((m) => m.role === 'user')`
     -> 1 failed | 1 passed: (b1) FAIL "Unable to find [data-testid=\"chat-clarification-card\"]"
        (compact answered row shown); (b2) pass. EXIT=1 (/tmp/u5dec-m1-broad.log)
  2. never-answered `return false`
     -> 1 failed | 1 passed: (b2) FAIL on `toHaveTextContent('Something else entirely')`;
        (b1) pass. EXIT=1 (/tmp/u5dec-m2-never.log)
  3. HEAD adjacency form restored -> both pass. Each direction flips one test; the pair
     pins the predicate from both sides.
Final green: both regate files -> 2 files / 4 tests passed, EXIT=0 (/tmp/u5dec-final-green.log).
Typecheck: `npm run typecheck -w app` -> 10 `error TS`, all pre-existing in event-editor/
ingestion (brief baseline 13); none in app/src/agent. TSC_EXIT=2, unchanged by this unit.

## Files
  M app/src/agent/ChatLog.regate.u4card.done.test.tsx  (+53/-36; helper leg3ThroughDoneArm,
    two tests b1/b2, header updated with the u5dec decision)
  app/src/agent/ChatLog.tsx — NOT changed (only temporary mutations, reverted; verified clean)

## Tree state
Only `?? app/node_modules` remains — a SETUP SYMLINK to /mnt/vast/.../app/node_modules created at
00:48, present before this unit ran. Deliberately NOT committed (it would pin a machine path) and
not ignored by the repo; left for the launcher/env owner.

## Commits
  ce4d6f2a  test-only pin (commit 1)
  commit 2 (this one)   report + marker; `git log --oneline -2` resolves both shas

L2-PROMPT2-REGATE-DRIVERS-REBASELINE-1 UNIT u5dec DONE ce4d6f2afca4394a6565b061bb7c50d284fa279b
