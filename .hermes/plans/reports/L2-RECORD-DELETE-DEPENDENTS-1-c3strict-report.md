# L2-RECORD-DELETE-DEPENDENTS-1 — unit delrefc3strict (advc c2 D6)

Worktree: /home/brad/cl-wt/L2-RECORD-DELETE-DELREFS-lane2, branch cl/lane2-recordelete-delrefs-1205, base edce1491.
Files changed: server/src/store/referenceCascade.ts (loader, 34 changed lines), server/src/store/RecordDeleteReferences.test.ts (4 new tests). schema/** untouched (0-line diff; shipped YAML bytes byte-identical).

## Change
loadCascadePolicy no longer `continue`s past mis-declared rules. Four silent-drop arms now throw with shape `<yamlPath>: rule[<i>] <problem>`:
- non-array `rules` key (was coerced to []); non-object rule; `referrerKind` not a non-empty string; `pointers` not a plain object; action value outside the vocabulary (names index, pointer and value).
Kept unchanged: ENOENT -> empty Map; YAML parse error -> throw; missing `rules` key -> throw; empty `pointers: {}` stays a no-op (default-refuse); empty `rules: []` stays a valid fail-closed policy; walker and resolveDeleteAction untouched.
The action vocabulary is ONE exported `CASCADE_ACTIONS = ['cascade','refuse'] as const`; `CascadeAction` derives from it — one place the two actions are written.

## Hardcode-boundary note (verbatim for reviewer)
This unit adds NO kind-name list. `CASCADE_ACTIONS` is the item's own two-value action vocabulary (task-list "an onDelete value of cascade or refuse"), not a branch on record kinds.

## RED (before product change, at RED commit b5ac97d2)
Test Files  1 failed (1) / Tests  4 failed | 6 passed (10)

## Mutation probe (reverted unknown-action arm, then restored)
Tests  1 failed | 9 passed (10) — FAIL: "unknown onDelete action throws naming the offending value" (test a); all other tests passed. Restore reran green.

## VERIFY (raw, at final tree)
1. vitest RecordDeleteReferences.test.ts: Test Files 1 passed (1) / Tests 10 passed (10)  [baseline 6]
2. vitest 3-file set (+ReferenceCascadeSweep, +RecordHandlers.danglingAcl): Test Files 3 passed (3) / Tests 17 passed (17)  [baseline 13]
3. tsc --noEmit -p .: exit 0, zero lines output.
4. git -c core.fileMode=false status --short: clean at exit (see below).

Commit 1 (RED tests): b5ac97d2. Commit 2 (green loader + report): HEAD-OF-COMMIT-2.

L2-RECORD-DELETE-DEPENDENTS-1 UNIT delrefc3strict DONE PLACEHOLDER
