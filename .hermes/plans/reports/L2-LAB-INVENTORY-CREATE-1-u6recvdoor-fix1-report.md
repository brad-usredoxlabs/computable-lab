# L2-LAB-INVENTORY-CREATE-1 u6fix1 — Receive-a-lot door, adversarial c1 MINOR fixes (lane 2)

Item: L2-LAB-INVENTORY-CREATE-1 / u6recvdoor-fix1. Advc c1 verdict: FIX (0 BLOCKER, 3 MINOR).
Review: ~/.hermes/cl/lanes/2/reviews/L2-labinv-u6recvdoor-advc-c1-l2t1512.md
Worktree: /home/brad/cl-wt/L2-LABINV-u6recvdoor-lane2 (branch cl/lane2-labinv-u6recvdoor-1442, started at ec348c53).

## Files changed (2, in scope)
- app/src/collections/MaterialReceivingDoor.tsx (+27/-5)
- app/src/collections/MaterialReceivingDoor.test.tsx (+43/-2)

Budget: 67 insertions / 5 deletions (<= 80 lines); files <= 3; no new components; no PROHIBITED file touched.

## Defects and chosen behaviour

### D1 — stated-fact fidelity: typed arrival date silently discarded on unknown status
Chosen fix (review option 1, "explicit cue"): the "Arrival date" date input is now rendered
DISABLED when occurredAtStatus === 'unknown' (value retained, visible but inert) and a visible
cue line "not sent while status is unknown" (data-testid material-receiving-occurred-at-cue)
is rendered next to it in the same state. The :97 claim-building discard is unchanged — it is
now impossible to miss in the UI. `Text` gained an optional `disabled` prop (absent => not
disabled; no present-as-undefined: `disabled={...}` is a plain boolean attribute, and the
prop itself is omitted at the other 4 call sites).
receivedByLabel audit: already conditional (~:144, renders only when status !== 'unknown'),
so no parallel change was needed.
Test leg: "makes the unknown-status discard explicit..." — opens door, sets status known,
types a date, flips status back to unknown, asserts input disabled + value retained + cue
visible, submits, asserts the sent claim has NO occurredAt key and occurredAtStatus 'unknown'.

### D2 — refusal arm hides draftId + reviewHash
The server returns draftId + reviewHash on BOTH arms. The refusal panel
(material-receiving-refusal) now renders the draftId/reviewHash <dl> identifier block
(present-but-refused) above the verbatim diagnostics <ul>; the canAccept arm is untouched.
Refusal test updated: the old `queryByTestId('material-receiving-draft-id')).toBeNull()`
assertion is replaced with `within(refusal).queryByTestId('material-receiving-draft-id')`
NOT null plus exact values DRAFT-u6recv-2 / sha256:def456; verbatim diagnostic + no-accept
assertions retained, plus acceptSpy not called.

### D3 — double-submit gap (test pin)
Component behaviour verified, not changed: the busy flag disables the submit button during
compile, and in jsdom the second rapid fireEvent.click does not reach the form handler —
exactly ONE compile call. Pinned per actual behaviour (option 1 of the review): test leg
"rapid double submit hits the busy guard" clicks submit twice, waits for the result, asserts
compileSpy toHaveBeenCalledTimes(1), acceptSpy never called, no accept affordance. Client-side
only; no server-side records asserted.

Style note: the door's own BEM classes (lab-modal__result / __refusal dl / __hint) were
unstyled — they were never present in the global lab-modal <style> block
(LabwareInstanceCreateModal.tsx). A scoped <style> string was added to the door itself
(LabwareInstanceCreateModal.tsx is PROHIBITED; same in-file <style> pattern that modal uses),
strictly --cl-* tokens (--cl-border, --cl-text-faint).

## Verification (measured, in this worktree)

Environment repair (pre-work): the worktree's app/node_modules symlink was broken (pointed at
the empty /mnt/vast/.../cl-integration-2/app/node_modules; deps live hoisted at the integration-2
root). Re-pointed to /mnt/vast/home/brad/git/cl-integration-2/node_modules (same as sibling
lane-2 worktrees; git-ignored, nothing committed). Root node_modules was an empty real dir —
replaced with the same symlink so `npm run typecheck -w app` can resolve server/ deps the way
the baseline did.

- Baseline (pre-change): MaterialReceivingDoor.test.tsx 4/4 pass, LabCollectionView.test.tsx 12/12
  pass (16 total, 2 files green); `npm run typecheck -w app` 0 errors.
- RED: after test edits only — MaterialReceivingDoor.test.tsx 2 failed | 4 passed (6):
  refusal leg "expected null not to be null" (D2), unknown-discard leg
  "expect(element).toBeDisabled()" (D1). D3 leg passed pre-fix (pins existing guard behaviour).
- GREEN: after tsx edits — MaterialReceivingDoor.test.tsx 6/6 pass,
  LabCollectionView.test.tsx 12/12 pass; Test Files 2 passed (2), Tests 18 passed (18).
  Command: cd app && ./node_modules/.bin/vitest run src/collections/MaterialReceivingDoor.test.tsx src/collections/LabCollectionView.test.tsx
- Typecheck: `npm run typecheck -w app` -> tsc --noEmit, 0 errors.

## Next actions
None for this unit. Browser reviewer still owns acceptance (screenshots). If the lane stack is
reloaded for a later unit, the door's new cue/identifier blocks are the visible delta on the
refusal and unknown-status paths.

## Commits
9e64d604 fix(lab): receiving door — explicit unknown-status discard, refusal-arm identifiers, double-submit pin (u6fix1)

L2-LABINVENTORY-CREATE-1-u6fix1 UNIT unit DONE 9e64d604204dbf56078c9760ef15654b8fefea39
