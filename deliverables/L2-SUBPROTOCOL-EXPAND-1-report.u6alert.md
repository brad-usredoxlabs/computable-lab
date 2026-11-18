# L2-SUBPROTOCOL-EXPAND-1 — Report (unit u6alert)

## Scope
Integrate `isPlannedRunKindRefusal` into the RoleBindingProposalsPanel catch arm,
adding graceful handling for planned-run-kind refusals alongside 404 responses.

## Commits
- **715727e2** — Implement isPlannedRunKindRefusal predicate in errors.ts.
- **58e09052** — Adopt isPlannedRunKindRefusal in RoleBindingProposalsPanel catch arm.
  Import added, call site at line 54:
  `if (ApiError.isApiError(err) && (err.status === 404 || isPlannedRunKindRefusal(err))) {`
- **f6cbaca6** — File this report for unit u6alert.

## Tests
6/6 GREEN on both files (verified this cycle):
- `src/shared/api/errors.plannedRunRefusal.test.ts` — 6 tests
- `src/run/RoleBindingProposalsPanel.test.tsx` — 6 tests

## Review History
- c1: FIX — missing deliverable (report + DONE marker). Code accepted as-is.
- c2: FIX — D1 wrong marker format/abbreviated sha, D2 missing mutation receipts.
  Code and pins confirmed CORRECT since 58e09052.
- c3 (this report, u6alertpw3): fixes D1 + D2.

## Changed Files
- `app/src/run/RoleBindingProposalsPanel.tsx` — import + catch-arm condition
- `app/src/run/RoleBindingProposalsPanel.test.tsx` — +19 test lines
- `app/src/shared/api/errors.ts` — isPlannedRunKindRefusal predicate
- `app/src/shared/api/errors.plannedRunRefusal.test.ts` — 6 tests

## Mutation Receipts (M1 — Panel Adoption)

Edit: RoleBindingProposalsPanel.tsx:54, remove `|| isPlannedRunKindRefusal(err)`

Mutated run (RoleBindingProposalsPanel.test.tsx):
  ❯ src/run/RoleBindingProposalsPanel.test.tsx  (6 tests | 1 failed) 105ms
    ❯ treats a NOT_A_PLANNED_RUN refusal (400) as nothing to show
  Test Files  1 failed | Tests  1 failed | 5 passed (6)

Post-revert run:
  ✓ src/run/RoleBindingProposalsPanel.test.tsx  (6 tests) 102ms
  Test Files  1 passed | Tests  6 passed (6)
  git status --short: ?? app/node_modules

## Mutation Receipts (M2 — Message Leg)

Edit: errors.ts:147, remove `|| error.message.includes('NOT_A_PLANNED_RUN')`

Mutated run (errors.plannedRunRefusal.test.ts):
  ❯ src/shared/api/errors.plannedRunRefusal.test.ts  (6 tests | 1 failed) 11ms
    ❯ returns true when message contains NOT_A_PLANNED_RUN (wire shape)
  Test Files  1 failed | Tests  1 failed | 5 passed (6)

Mutated run (RoleBindingProposalsPanel.test.tsx):
  ❯ src/run/RoleBindingProposalsPanel.test.tsx  (6 tests | 1 failed) 107ms
    ❯ treats a NOT_A_PLANNED_RUN refusal (400) as nothing to show
  Test Files  1 failed | Tests  1 failed | 5 passed (6)

Note: Under M2 the code-leg case (errors.plannedRunRefusal.test.ts:25,
`code: 'NOT_A_PLANNED_RUN'`) stays GREEN by design — only the wire-shape case
(message contains token) goes RED.

Post-revert runs:
  ✓ src/shared/api/errors.plannedRunRefusal.test.ts  (6 tests) 1ms
  ✓ src/run/RoleBindingProposalsPanel.test.tsx  (6 tests) 101ms
  git status --short: ?? app/node_modules

L2-SUBPROTOCOL-EXPAND-1 UNIT u6alert DONE 06a56df7be024f345167e6f7ef239b5d88ee37a6
