# L2-MATERIAL-SELECTION-POLICY-1 unit 1-fix1 report (lane 2, advc c1 fix)

## Scope
Fix two MINOR defects from advc c1 review:
1. F1: lint.yaml message.paths arrays missing interpolated field references
2. F2: test gap — no test proves two `selection: 'default'` records for same concept are allowed

## Changes

### Step 1: fix lint.yaml message.paths (commit 0889d351)
- schema/lab/material-selection-policy.lint.yaml
  - Rule 1 (since-must-be-present): paths changed from ["$.since"] to ["$.recordId", "$.since"]
  - Rule 2 (non-only-requires-reason): paths changed from ["$.recordId", "$.reason"] to ["$.recordId", "$.selection", "$.reason"]

### Step 2: new test — two defaults allowed (commit d8ee9c3d)
- server/src/materials/MaterialSelectionPolicy.test.ts
  - Added test 'allows two default selections for the same concept'
  - Asserts normalizeMaterialSelectionPolicies returns index with 2 entries for same concept key
  - Confirms no exception thrown for duplicate default selections

## Verification

### Vitest output (4 tests expected, 4 passed):
```
RUN  v1.6.1 /home/brad/cl-wt/L2-MATERIAL-SELECTION-POLICY-1-u1-lane2/server

 ✓ src/materials/MaterialSelectionPolicy.test.ts  (4 tests) 342ms

 Test Files  1 passed (1)
      Tests  4 passed (4)
   Start at  13:08:42
   Duration  857ms (transform 55ms, setup 0ms, collect 95ms, tests 342ms, environment 0ms, prepare 54ms)
```

### Files changed: 2 (lint.yaml, test.ts)
### Lines added: 2 (lint.yaml paths) + 44 (new test) = 46

L2-MATERIAL-SELECTION-POLICY-1-u1fix1 UNIT 1 DONE d8ee9c3de91637c78aff94563645291587cd152f
