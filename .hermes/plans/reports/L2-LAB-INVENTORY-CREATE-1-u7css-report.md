# L2-LAB-INVENTORY-CREATE-1 / u7css — report

Gate: L2-LABINV-SEEDLAB-browser-g1-l2t2210, blocker D1 (door invisible/unclickable).
Worktree: /tmp/wt-L2-LABINV-u7css, branch cl/lane2-labinv-u7css-1815, base aa15b90a.

## Decision
The `.lab-modal*` base stylesheet was module-local inside `LabwareInstanceCreateModal.tsx`
(it was a `const modalStyles` template string rendered only by that dialog). The receiving door
renders the same class names but declared only `__result` / `__refusal` / `__hint`, so its backdrop
stayed `position: static` in flow and `cl-workspace__pane--left` intercepted clicks.

Fix = stylesheet authority only, no behaviour change:
- NEW `app/src/collections/labModalStyles.ts` exports `labModalStyles` — the base block MOVED
  byte-for-byte (2109 bytes, verified equal to `git show aa15b90a:...LabwareInstanceCreateModal.tsx`
  lines 222-267; no rule reformatted, no class renamed).
- `LabwareInstanceCreateModal.tsx`: imports and renders `labModalStyles`; local `const modalStyles`
  deleted. Markup unchanged.
- `MaterialReceivingDoor.tsx`: imports and renders `${labModalStyles}` AHEAD of its own three rule
  groups inside the existing `<style>` element. No second copy of the base block in the door file
  (`grep -c 'lab-modal__backdrop {'` → door 0, module 1). No className / data-testid / payload change.
- `MaterialReceivingDoor.test.tsx`: one RED-first pin asserting the rendered `<style>` TEXT contains
  `.lab-modal__backdrop { ... position: fixed` and `.lab-modal {`, because jsdom does not cascade
  author style rules (a getComputedStyle pin would be vacuous).

## RED evidence (before the fix, pin alone)
    FAIL  src/collections/MaterialReceivingDoor.test.tsx > MaterialReceivingDoor > carries the shared .lab-modal base layout authority, not only its own rules (gate D1)
    AssertionError: expected '\n.lab-modal__result { margin: 0; pad…' to match /\.lab-modal__backdrop\s*\{[^}]*position:\s*fixed/s
    + Received: "\n.lab-modal__result { margin: 0; padding: 8px 10px; ... }\n.lab-modal__hint { margin: 0; font-size: 0.75rem; color: var(--cl-text-faint); }\n"
    Test Files  1 failed (1) / Tests  1 failed | 7 passed (8)

## GREEN evidence
    cd /tmp/wt-L2-LABINV-u7css/app && TMPDIR=/home/brad/.tmp-u7css ./node_modules/.bin/vitest run \
      src/collections/MaterialReceivingDoor.test.tsx src/collections/LabwareInstanceCreateModal.test.tsx
     ✓ src/collections/LabwareInstanceCreateModal.test.tsx  (7 tests) 155ms
     ✓ src/collections/MaterialReceivingDoor.test.tsx  (8 tests) 319ms
     Test Files  2 passed (2)
          Tests  15 passed (15)
(ACTUAL baseline recorded: door 7→8, labware-modal dialog 7; the brief's "8 total" figure omitted the
dialog suite's 7. Before/after for the door file alone: 7 passed → 8 passed.)

## Typecheck — DEVIATION FROM EXPECTED, environmental
    cd /tmp/wt-L2-LABINV-u7css && TMPDIR=/home/brad/.tmp-u7css npm run typecheck -w app
    → exits 2 with 13 `error TS` lines, ALL module-resolution failures caused by this worktree's
      partial node_modules (app/node_modules/ajv absent, no root node_modules): ajv, ajv-formats,
      yaml, prosemirror-view "Cannot find module", plus implicit-any fallout in event-editor tests.
Proof it is baseline and not this change: stashed all four files (`git stash push -u`), re-ran the
same command at base, captured the error list; restored; re-ran on the fix and diffed:
    diff /home/brad/.u7css-tsc-base.txt /home/brad/.u7css-tsc-now.txt → IDENTICAL_TO_BASELINE
No error mentions app/src/collections or the three touched files. Baseline at aa15b90a is therefore
NOT clean in this checkout (contrary to the brief), and this unit introduces zero new diagnostics.

## Not proven here
No browser was available. The tests prove the base rule text is present in the rendered style element
and that the dialog's own tests still pass; AC1 (painted + clickable, backdrop above the left pane)
is for the browser gate on the reloaded lane stack.

## Files changed (4)
app/src/collections/labModalStyles.ts (new, 56 lines)
app/src/collections/LabwareInstanceCreateModal.tsx (import + delete local const)
app/src/collections/MaterialReceivingDoor.tsx (import + prepend base block)
app/src/collections/MaterialReceivingDoor.test.tsx (+14, one pin)
## Exit

Fix commit (all four files + this report body): f065729c14bc1f227ba58da09c3938e3137045b4

L2-LAB-INVENTORY-CREATE-1 u7css DONE f065729c14bc1f227ba58da09c3938e3137045b4
L2-LAB-INVENTORY-CREATE-1 UNIT unit DONE f065729c14bc1f227ba58da09c3938e3137045b4
