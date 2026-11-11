# L2-LAB-INVENTORY-CREATE-1 — u4select-c3 Report

## Overview
Close 2 MINOR defects from adversarial cycle 2 (advc-c2) by editing only
`app/src/run/RoleBindingProposalsPanel.test.tsx`. Zero product-code edits.

## Changes
- **File**: `app/src/run/RoleBindingProposalsPanel.test.tsx` (+30 lines)
- **DEFECT-1**: Added test "a proposed definition candidate renders no Bind button and shows the hint"
  - Uses a single-candidate proposed role with `recordKind: 'material'` (definition)
  - Asserts zero `[data-testid="bind-candidate"]` nodes in the proposed row
  - Asserts row textContent contains "definition, bind an instance instead"
- **DEFECT-2**: Extended existing test at :88 with an assertion that the proposed row contains a `[data-testid="bind-candidate"]` node
  - The fixture `threeRoles` has `recordKind: 'material-instance'`, so the Bind button is present

## Test Results
### Baseline
- 16/16 GREEN (verified before changes)

### After Changes
- 17/17 GREEN (1 new test added)

### Teeth Proof (DEFECT-1)
- Temporarily reverted `panel.tsx:135` to `{role.candidates[0] ? (` (removing `INSTANCE_KINDS.has()` gate)
- Result: 16/17 GREEN, 1 FAILED — "a proposed definition candidate renders no Bind button and shows the hint"
  - Failure: `expected <button type="button" …> to be null` at line 125
- Restored `panel.tsx` with `git checkout -- app/src/run/RoleBindingProposalsPanel.tsx`
- Re-verified: 17/17 GREEN

### Teeth Proof (DEFECT-2)
- The assertion `expect(proposed?.querySelector('[data-testid="bind-candidate"]')).not.toBeNull()` would fail if the Bind button were absent for the material-instance fixture
- Confirmed passing with correct code

## Verification
- `git -C <worktree> -c core.fileMode=false diff d28c7b54 --name-only` lists only `app/src/run/RoleBindingProposalsPanel.test.tsx` and this report
- `git -C <worktree> status --porcelain` is empty

L2-LABINV-u4select-c3 UNIT u4select-c3 DONE a3c57169759df01b061dd29e982d08287bebea07
report_commit: fb35a975ad580f0b1ae9243861197d30470b9787

## Amendment
adv c3 (advc-c3): The DONE marker named a dangling commit SHA
(216ee7b79728e567ee2ee1467ac66174ef55fab0) that was amended away.
Replaced with the actual code+tests commit a3c57169759df01b061dd29e982d08287bebea07.

L2-LABINV-u4select-pw1 UNIT u4select-pw1 DONE e9a297f42ca9dddb526c07bc7a30659c2d482f12
