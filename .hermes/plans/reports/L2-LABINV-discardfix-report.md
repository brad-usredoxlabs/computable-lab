# L2-LABINV-discardfix — unit report

Item: L2-LAB-INVENTORY-CREATE-1, unit discardfix (lane 2, worktree
/home/brad/cl-wt/L2-LABINV-discardfix-lane2, branch
cl/lane2-labinv-discardfix-0736, base c9464937ed62bd527a3186045f6068409150f6f8)

## Why (the defect)
Browser gate g5, LEG 1, DEFECT 1 (HIGH): closing the "Receive a lot" door
does NOT discard a staged draft — re-opening resurrects it byte-identical
(same DRAFT-* id, live Accept button; gate trail step 33; screenshots
22-04 vs 31-06 md5-identical) and no discard cue is ever shown.

Measured root cause (not re-derived): the door is ALWAYS mounted by
LabCollectionView (LabCollectionView.tsx:549, pre-fix
`<MaterialReceivingDoor isOpen={showReceiveModal} .../>`) and early-returns
null on !isOpen (MaterialReceivingDoor.tsx:104 pre-fix), so every useState
survives close/reopen.

## What changed (3 files, 119 insertions / 5 deletions vs base)
1. app/src/collections/MaterialReceivingDoor.tsx (+40/-4)
   - New optional prop `onDiscard?: () => void`.
   - New `handleClose`: when a compiled draft is on screen and not yet
     accepted (`result !== null && accepted === null`), ALL door state
     resets locally (the 9 claim fields, result, failure, busy, acceptBusy,
     accepted) and `onDiscard?.()` fires; then `onClose()` as before.
     Closing with nothing staged is unchanged (no cue, no state churn).
   - All three close affordances route through `handleClose`: backdrop
     mousedown, header ✕ (lab-modal__close), footer Close (lab-modal__cancel).
   - Discard is purely local: the compile seam never writes, NO server call
     was added, and the Stage draft / Accept flows + busy/acceptBusy guards
     are untouched.
2. app/src/collections/LabCollectionView.tsx (+21/-1)
   - Parent-owned `receiveDiscarded` state. `onDiscard` sets it true and a
     banner with data-testid="material-receiving-discarded" (text
     "Staged draft discarded." + Dismiss button) renders on /lab/materials
     AFTER the door is gone. The '+ Receive a lot' button clears the cue on
     open; the Dismiss control clears it.
   - CUE-LIFECYCLE DECISION: the brief's placement note said "cleared on
     re-open or dismiss", but the RED spec + acceptance 1-2 require the cue
     to be VISIBLE on the page AFTER RE-OPEN with a staged draft on close
     (the RED test reopens then asserts the cue). Clearing on re-open would
     make the acceptance sequence unsatisfiable, so the cue is cleared on
     open of the '+ Receive a lot' BUTTON (the user's fresh intent) and on
     Dismiss, and it survives a plain reopen (the draft really was
     discarded, so the cue is still true). Escalating this interpretation;
     code implements the acceptance-consistent reading.
   - No CSS file touched (forbidden budget-wise): the banner reuses the
     existing `.lab-collection__hint` class (LabCollectionView.css:66,
     declared on --cl-text-dim).
3. app/src/collections/MaterialReceivingDoor.test.tsx (+58/-0) — the RED test
   `discards a staged draft on close: reopen shows no staged block and a
   discard cue is visible`: state-hoisted harness re-renders the SAME door
   instance with isOpen false then true (no unmount between toggles;
   cleanup() only runs in the shared afterEach — pinning that the door was
   mounted across the toggle), opens, stages LOT-DISCARD-TEST, clicks
   Close (class lab-modal__cancel), reopens, and asserts no staged block,
   no draftId, no live Accept, empty fields, /discard/i cue, and no
   accept/second-compile (nothing committed).

## Deviations from the brief (measured, not invented)
- jsdom 29 does NOT implement document.body.innerText (verified by probe:
  it is `undefined` in this repo's vitest/jsdom config). The gate's
  `document.body.innerText matches /discard/i` check is realized via
  `document.body.textContent` (same page-text assertion) plus the
  testid-scoped cue assertion; both are pinned in the test with this
  rationale.
- Output budget: 3 files / 119 added lines (brief said files <= 3, lines
  <= 120 total — satisfied; the "~<=120" reading also holds).

## RED/GREEN measured
Command (always `npm run test:unit -w app --`; bare `npx vitest run` fails
with "document is not defined" on this repo):
- Baseline (before the test): `npm run test:unit -w app --
  src/collections/MaterialReceivingDoor.test.tsx` -> 14 passed (14).
- RED (test committed at 5673a3a8 on trunk behaviour): 1 failed / 14
  passed (15). Failure: `AssertionError: expected <dd …(1)></dd> to be
  null` — the resurrected material-receiving-draft-id after reopen, exactly
  the g5 trail step 33 behaviour.
- GREEN (fix committed at 39a77ec4 + strengthened assertions):
  `Tests  15 passed (15)`, `Test Files  1 passed (1)`, Duration 11.56s
  (2026-11-13 run; full log /tmp/discardfix-green.txt).
- Adjacent regression check (banner must not regress the view):
  `npm run test:unit -w app -- src/collections/LabCollectionView.test.tsx
  src/collections/LabCollectionView.instanceSearch.test.tsx` -> 21 passed
  (21).

## tsc
`cd app && npx tsc --noEmit`: 13 errors, ALL pre-existing (identical set
with the fix stashed — verified via git stash diff of the tsc output:
the only delta was the RED test's onDiscard type error, which the fix
resolves). 0 errors in app/src/collections/. The 13 are module-resolution
errors in server/ (yaml, ajv, ajv-formats) and app taptab/widget files
(prosemirror-view, ajv) that also exist at the RED commit (trunk state of
this worktree); 0 errors reference any file changed by this unit.

## Acceptance mapping
1. Open -> stage -> Close -> reopen: no staged block, no live Accept, no
   resurrected draftId (RED test asserts all three after reopen). PASS.
2. Cue on /lab/materials after close-with-staged-draft matching /discard/i:
   `material-receiving-discarded` banner "Staged draft discarded." PASS.
3. Nothing committed by discard: compile never writes (unchanged seam);
   test pins exactly 1 compile and 0 accept calls on the discard path.
   PASS.
4. Targeted suite 15/15 green, tsc 0 errors in changed files (13
   pre-existing worktree-wide errors, see above). PASS.

## Commits (in the required order)
- 5673a3a8 test(discardfix): RED — staged draft must be discarded on door
  close (RED: 1 failed / 14 passed)
- 39a77ec4 fix(discardfix): discard a staged draft when the receiving door
  closes (GREEN: 15/15)
- report + marker follow this file (marker cites the report commit sha).

## Next actions / blockers
- Browser gate re-run (g5) to close LEG 1 DEFECT 1: trail step 33 must not
  reproduce; shots should now differ on reopen and the discard cue must be
  visible. Owner: browser reviewer (acceptance owner).
- YAML/lane stack: no YAML changed, so no lane-stack reload required.

L2-LABINV-discardfix UNIT unit DONE __REPORT_SHA__
