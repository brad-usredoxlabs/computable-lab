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

L2-SUBPROTOCOL-EXPAND-1-u6binddoor-fix1 UNIT u6binddoor DONE 01e4d871
