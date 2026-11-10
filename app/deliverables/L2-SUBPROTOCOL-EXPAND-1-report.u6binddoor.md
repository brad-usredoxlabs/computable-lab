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
