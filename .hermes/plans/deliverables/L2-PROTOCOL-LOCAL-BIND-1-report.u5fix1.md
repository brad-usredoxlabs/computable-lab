# L2-PROTOCOL-LOCAL-BIND-1 — unit u5fix1 (lane 2)

Worktree: /home/brad/cl-wt/L2-LOCALBIND-u5door-lane2
Branch: cl/lane2-localbind-u5door-0126
Base: be8c8525

## Defect
The run-surface proposals panel read `clarificationRequests` per protocol
(`protocol.clarificationRequests`), but the server emits it TOP-LEVEL:
`PlannedRunHandlers.ts:450` returns `{ ...proposals, clarificationRequests: cards }`
where `proposals === { protocols: [...] }`. Consequence: on the real wire shape the
server clarification prompt never rendered and the panel always fell back to
"Choose a <kind> for <roleId>". The client type mirrored the wrong nested shape,
so typecheck could not catch it.

## Fix
- app/src/shared/api/client.ts — `RoleBindingProposalsResponse`: removed
  `clarificationRequests` from the per-protocol object; added it as an optional
  top-level sibling of `protocols`. Doc comment records the single allowed location.
- app/src/run/RoleBindingProposalsPanel.tsx:80 — lookup changed from
  `protocol.clarificationRequests?.find(...)` to
  `data.clarificationRequests?.find(...)` over the whole response.
- app/src/run/RoleBindingProposalsPanel.test.tsx — fixture moved the same card array
  from `protocols[0].clarificationRequests` to the top level of the response object;
  existing "server prompt wins" assertion unchanged.

No other app source references a per-protocol proposals `clarificationRequests`
(searched app/src; remaining hits are the unrelated AI-chat clarification type).

## Commits
1. 7d7cb48a — RED: fixture on server wire shape (test file only)
2. 6c97fb8a — fix: read clarificationRequests from top level (panel + client.ts)

## Verification (real output)
Baseline before change (green on WRONG nested shape):
    Test Files  1 passed (1)
         Tests  4 passed (4)

RED after fixture move, before panel fix:
    Test Files  1 failed (1)
         Tests  1 failed | 3 passed (4)
    (failing assertion: the "server prompt wins" test — prompt not found, fallback shown)

GREEN after fix:
    Test Files  1 passed (1)
         Tests  4 passed (4)

Typecheck:
    cd app && npx tsc --noEmit  ->  TSC_EXIT=0

Exact commands:
    cd /home/brad/cl-wt/L2-LOCALBIND-u5door-lane2/app && timeout 260 npx vitest run src/run/RoleBindingProposalsPanel.test.tsx
    cd /home/brad/cl-wt/L2-LOCALBIND-u5door-lane2/app && timeout 260 npx tsc --noEmit

## Changed files (3)
- app/src/run/RoleBindingProposalsPanel.tsx
- app/src/run/RoleBindingProposalsPanel.test.tsx
- app/src/shared/api/client.ts (RoleBindingProposalsResponse only)

Server files untouched. node_modules entries in `git status` are symlinks to the
shared install and are untracked/ignored — tree is otherwise clean.

## Next actions / remaining
- Orchestrator may reload the lane stack and let live verification (browser review)
  exercise the proposals panel against the real endpoint; no further code change
  identified here.
