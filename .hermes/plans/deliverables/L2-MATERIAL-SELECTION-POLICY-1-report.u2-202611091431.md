# L2-MATERIAL-SELECTION-POLICY-1 Unit 2 Report

## Summary
Wires material picker to consume declared selection-policy records.
- only: collapses to exactly one row with preselected:true
- default: all rows survive, one preselected
- Fail-open: vendor product not in rows or duplicate only -> no change
- Byte-stability: empty policies -> deep-equal, no preselected key

## Changed Files (4)
1. app/src/shared/taptab/slashMenu/clarifyPickerRanking.test.ts (10 new tests)
2. app/src/shared/taptab/slashMenu/policy.ts (getMaterialSelectionPolicies + helpers)
3. app/src/shared/taptab/slashMenu/clarifyPickerRanking.ts (applySelectionPolicies, curie, preselected)
4. app/src/shared/taptab/slashMenu/resolvers.ts (4 call sites wired, preselected spread)

## Verification
- Tests: 21/21 GREEN (11 baseline + 10 new)
- Typecheck: 0 errors
- Mutation probes: both RED on removal, GREEN on restoration
- Git: clean (tracked files)

## Commits
b4f40f4c test(picker): RED pins for only/default selection policy (MATSEL u2a)
3ea15661 feat(picker): load declared selection policies (MATSEL u2b)
45153f7f feat(picker): collapse on only, preselect on default (MATSEL u2c)
cc44ee28 feat(picker): wire selection policies into all resolver branches (MATSEL u2c)

## Notes
- only collapse is PICKER behaviour only; does NOT suppress clarification question (unit 3)
- No types.ts changes needed
- No server changes needed


## Mutation Probes

1. **Probe 1 - Remove preselected preference in firstDefaultFocusIndex**: 2 tests FAILED (pin b)
   - Removed the `if (rows[i].preselected === true) return i` early-return block
   - Tests failed: "default — all rows survive, exactly one is preselected, focus index matches" and "prefers preselected row over canBeDefault row"
2. **Probe 2 - Remove only-collapse in applySelectionPolicies**: 2 tests FAILED (pin a)
   - Removed the collapse logic (result.length=0, push single row)
   - Tests failed: "only — collapses to exactly one row" and "only — material_ref kind=record matches by row recordId"
3. **Restoration**: Both mutations restored, all 21 tests GREEN

L2-MATERIAL-SELECTION-POLICY-1-u2 UNIT unit DONE 059bfc3d2672cbe4b7951b39ff7befa9faf073ca
