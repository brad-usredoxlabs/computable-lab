# L2-SUBPROTOCOL-EXPAND-1 — unit u6binddoor FIX-1 Report

## Summary
Fixed one failing test by adding `kind: 'planned-run'` to the mock PLR payload so the router's draft branch matches.

## Changed Files
1. `app/src/graph/RunEditorRouter.test.tsx` — line 25: added `kind: 'planned-run'` to `mockPlrResp` payload.

## Code Commits
- ecfe0cc8 — u6binddoor: RED test pins route missing and resolution broken
- a6b1809f — u6binddoor: RunEditorRouter resolves run → PLR via getRecordWithUI
- d441682c — u6binddoor: register /runs/:runId/bindings route with lazy RunEditorRouter
- 01e4d871 — test: fix mock PLR payload to include kind for u6binddoor fix1

## Verification
- `npx vitest run src/graph/RunEditorRouter.test.tsx` → 2 passed (2) — GREEN
- `npx tsc -p tsconfig.json --noEmit` → 13 pre-existing TS errors, 0 new errors

L2-SUBPROTOCOL-EXPAND-1-u6binddoor-fix1 UNIT u6binddoor DONE 01e4d871f03360f55f6c276b2e95e4a75178573d
L2-SUBPROTOCOL-EXPAND-1-u6binddoor-fix1 UNIT u6binddoor DONE 6b9acfbb674e6d61102ea618202d1e77231fcadc

## fix2

### Summary
Thread the resolved PLR id through the router to BindingModeEditor (D3) and add the
run-toolbar link to role bindings (D1).

### Changed Files (3)
1. `app/src/graph/RunEditorRouter.tsx` — added `plannedRunId` state, thread to BindingModeEditor
2. `app/src/run/RunWorkspacePage.tsx` — added `hasPlannedRunRef` state + toolbar link
3. `app/src/graph/RunEditorRouter.test.tsx` — added PLR-77 threading pin test

### Code Commits
- d9907b05 — fix(lane2): RunEditorRouter passes the resolved PLR id to BindingModeEditor (u6binddoor-fix2 D3)
- afa58f3c — feat(lane2): run toolbar links to role bindings when the run has a planned-run (u6binddoor-fix2 D1)
- eb677a035505122dac39b62721a0c02c740440d0 — test(lane2): PLR-id threading pin GREEN (u6binddoor-fix2)

### Verification
- `npx vitest run src/graph/RunEditorRouter.test.tsx` → 3 passed — GREEN
- `npx tsc --noEmit` → 0 new errors (pre-existing only)
- `git diff --stat 12c8fc55..HEAD` → 3 files changed, 71 insertions(+), 4 deletions(-)

L2-SUBPROTO-u6binddoor-fix2 UNIT unit DONE eb677a035505122dac39b62721a0c02c740440d0

## fix3 (advc c2 D-1 + D-2)

### Summary
advc c2 demanded the bindings door read run/PLR records through `getRecordWithUI` instead of `/api/records/:id`. Five commits replaced direct API calls with the UI-aware resolver across BindingModeEditor and RunWorkspacePage.

### Commits (5)
- 17438e32 — fix(lane2): BindingModeEditor loads the PLR through getRecordWithUI (u6binddoor-fix3 D-2)
- 015bc868 — fix(lane2): BindingModeEditor loads its local protocol through getRecordWithUI (u6binddoor-fix3 D-2)
- 3cb217e8 — fix(lane2): run toolbar gate reads the run envelope via getRecordWithUI (u6binddoor-fix3 D-1)
- 3e5b217f — test(lane2): pin the bindings door to getRecordWithUI (u6binddoor-fix3)
- b4857538 — test(lane2): fix mock types for getRecordWithUI (u6binddoor-fix3)

### Changed Files (3)
1. `app/src/graph/BindingMode/BindingModeEditor.tsx` — commits 17438e32 + 015bc868: replaced `/api/records/:id` with `getRecordWithUI` for PLR and protocol reads (D-2)
2. `app/src/run/RunWorkspacePage.tsx` — commit 3cb217e8: toolbar gate reads run envelope via `getRecordWithUI` (D-1)
3. `app/src/graph/BindingMode/BindingModeEditor.test.tsx` — commits 3e5b217f + b4857538: pins the bindings door to `getRecordWithUI`; these pins were mutation-proven in the unit that wrote them (3e5b217f), not here

### Measured Diff
```
.../graph/BindingMode/BindingModeEditor.test.tsx   | 27 ++++++++++++++++++----
 app/src/graph/BindingMode/BindingModeEditor.tsx    |  8 ++++---
 app/src/run/RunWorkspacePage.tsx                   |  4 ++--
 3 files changed, 29 insertions(+), 10 deletions(-)
```

### Test Summary
`npx vitest run src/graph/BindingMode/BindingModeEditor.test.tsx src/graph/RunEditorRouter.test.tsx`
→ Test Files 2 passed (2), Tests 7 passed (7)

### Coverage Gap
No test pin exists for the RunWorkspacePage toolbar gate; the gc-section test is RED at baseline in this tree, so D-1 remains unpinned.

L2-SUBPROTOCOL-EXPAND-1-u6binddoorfix3pw UNIT u6binddoorfix3pw DONE edb76724b4b783b0500c320ddbcebae184f0011f

## sibfix1

### Summary
Two sibling test suites (compile.test.tsx and surface.test.tsx) fail because production code
uses `apiClient.getRecordWithUI` but the mocks only defined `getRecord`. Added
`getRecordWithUI` mock methods returning `{ record: ..., ui: undefined }` to both suites.

### Raw GREEN output (combined suite)
```
Test Files  2 passed (2)
      Tests  7 passed (7)
```

### Baseline GREEN (no regression)
```
Test Files  1 passed (1)
      Tests  4 passed (4)
```

### Changed Files (2)
1. `app/src/graph/BindingMode/BindingModeEditor.compile.test.tsx` — added `getRecordWithUI` to mock object + mockImplementation
2. `app/src/run/RunWorkspacePage.surface.test.tsx` — added `getRecordWithUI` to mock object

### Code Commits
- ac2a2d1d — compile suite mock fix
- efe4088a — surface suite mock fix

L2-SUBPROTOCOL-EXPAND-1 UNIT u6binddoorsibfix1 DONE e6e3b2ee003a70966422a89f280995519fdd2470
