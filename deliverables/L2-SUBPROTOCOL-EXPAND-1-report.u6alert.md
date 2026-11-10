# L2-SUBPROTOCOL-EXPAND-1 — Report (unit u6alert)

## Scope
Integrate `isPlannedRunKindRefusal` into the RoleBindingProposalsPanel catch arm,
adding graceful handling for planned-run-kind refusals alongside 404 responses.

## Commits
- **58e09052** — Adopt isPlannedRunKindRefusal in RoleBindingProposalsPanel catch arm.
  Import added, call site at line 54:
  `if (ApiError.isApiError(err) && (err.status === 404 || isPlannedRunKindRefusal(err))) {`
- **4bdf6a1c** — WIP auto-commit holding +19 test lines for RoleBindingProposalsPanel.test.tsx.

## Tests
6/6 tests GREEN on `src/run/RoleBindingProposalsPanel.test.tsx` — verified by orchestrator.

## Review
advc c1 verdict: FIX solely for missing owned deliverable (report + DONE marker).
Code accepted as-is: production change present, both pins correct, mutation-proven.

## Changed Files
- `app/src/run/RoleBindingProposalsPanel.tsx` — import + catch-arm condition
- `app/src/run/RoleBindingProposalsPanel.test.tsx` — +19 test lines (WIP commit)

## Status
Implementation accepted. Paperwork complete: report filed, DONE marker committed.

L2-SUBPROTOCOL-EXPAND-1-u6alert-pw UNIT unit DONE 4bdf6a1c
