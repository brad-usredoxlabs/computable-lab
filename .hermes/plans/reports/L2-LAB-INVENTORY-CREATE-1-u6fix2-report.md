# L2-LAB-INVENTORY-CREATE-1 — u6fix2 report

Item: L2-LAB-INVENTORY-CREATE-1 (lane 2), unit u6fix2 (2 of 2, fix round c2).
Worktree: /home/brad/cl-wt/L2-LABINV-u6recvdoor-lane2, base 6d739e42 (no rebase).
Seam: receive-by unknown-status parity in the receiving door + unit-report marker paperwork.

## Changes

1. app/src/collections/MaterialReceivingDoor.tsx (lines ~155-161): removed the silent
   unmount `{receivedByStatus !== 'unknown' && (...)}`. The received-by name Text now
   mounts ALWAYS with `disabled={receivedByStatus === 'unknown'}`, and a cue
   `<p className="lab-modal__hint" data-testid="material-receiving-received-by-cue">`
   reading "not sent while status is unknown" appears when status is unknown — mirroring
   the already-shipped arrival-date branch (left untouched). Send path at :97 unchanged;
   it already drops the name on unknown. No type changes (TextProps already had disabled).
2. app/src/collections/MaterialReceivingDoor.test.tsx: ONE new test, the receive-by twin of
   the date test at :127 — types 'Brad', flips received-by status known→unknown, asserts
   input disabled, value retained, cue testid present, submits, claim has no
   receivedByLabel and receivedByStatus === 'unknown'.

Nothing else touched (date branch, StatusSelect/Status types, server/, schema/, refusal
arm, busy guard all unmodified).

## Verification (measured, exact commands)

RED (test added BEFORE tsx change):
  cd app && TMPDIR=/home/brad/.tmp-u6fix2 ./node_modules/.bin/vitest run src/collections/MaterialReceivingDoor.test.tsx
  -> 1 failed | 6 passed (7): new test failed at getByTestId('material-receiving-received-by-label')
     (input silently unmounted) — cue/disabled assertions unreachable. Baseline 6 passed confirmed.
GREEN (after tsx change):
  same command -> 7 passed (7).
Pair:
  ./node_modules/.bin/vitest run src/collections/MaterialReceivingDoor.test.tsx src/collections/LabCollectionView.test.tsx
  -> 2 files passed, 19 passed (baseline 18 + 1 new).
Typecheck:
  cd /home/brad/cl-wt/L2-LABINV-u6recvdoor-lane2 && TMPDIR=/home/brad/.tmp-u6fix2 npm run typecheck -w app
  -> EXIT 0 (tsc --noEmit clean).
Note: ClaimCollectionView.test.tsx pre-existing red (useOpenTabs) ignored per brief.

## Marker paperwork (advc c3 D-1/D-2 correction)

What advc c3 found wrong in the u6fix2 DONE line: (D-1) it named the CODE commit
75713fea88ce890cd6fadae3d0af5d521d1e820b, which does NOT contain this report path
(`git cat-file -e 75713fea:...` = rc 128; rc 0 at report commit 56e8dda5). (D-2) the DONE
line carried a literal two-word placeholder in the unit-token slot (the word "unit" standing
in for a real unit number), and the paragraph here falsely claimed "correct containment
shape" and that no literal placeholder words were present. This unit (u6fix3pw) rewrites the
DONE line to name a sha that CONTAINS the report (56e8dda5921f7b1fc54cd12eb0a05cb4b8b8c0d8),
removes that placeholder word, and corrects this paragraph to state the truth. No product
code touched.

## Commits

1. 75713fea88ce890cd6fadae3d0af5d521d1e820b — fix(lab): receiving door — receive-by unknown-status parity cue + twin test (u6fix2) (test+tsx)
2. this report commit — docs(plan): L2-LAB-INVENTORY-CREATE-1 u6fix2 report + DONE marker (u6fix2)

Changed files (this unit, all committed, worktree dirty=0):
- app/src/collections/MaterialReceivingDoor.tsx
- app/src/collections/MaterialReceivingDoor.test.tsx
- .hermes/plans/reports/L2-LAB-INVENTORY-CREATE-1-u6fix2-report.md (this file)

L2-LAB-INVENTORY-CREATE-1 u6fix3pw DONE 56e8dda5921f7b1fc54cd12eb0a05cb4b8b8c0d8 (report contained at this sha; fix commit supersedes on trunk merge)
