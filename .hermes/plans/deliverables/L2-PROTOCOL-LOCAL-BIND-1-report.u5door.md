# L2-PROTOCOL-LOCAL-BIND-1 — unit u5door report

Worktree: /home/brad/cl-wt/L2-LOCALBIND-u5door-lane2
Branch: cl/lane2-localbind-u5door-0126
Base: e45098792212c8f9d7bf92a339e07efb6cb2cc6d

## Claim

The run surface renders the proposals projection (read-only). No binding is
chosen or written; item criterion (b) is NOT claimed (answer/write half is
u2 + u3clarify).

## Change

- `app/src/shared/api/client.ts` — exported `BindingCandidate`, `RoleProposal`,
  `RoleBindingProposalsResponse`; one new `apiClient.getRoleBindingProposals`
  method (GET, no request-body method option). Nothing else touched.
- `app/src/run/RoleBindingProposalsPanel.tsx` — NEW read-only panel. One
  `useEffect` fetch keyed on `runId` with a `cancelled` guard; `ApiError`
  404 renders nothing (same as an empty projection); non-404 renders one
  visible `role="alert"` line. `proposed` = one candidate labelled
  "proposed, read-only"; `ambiguous` = server candidate list + optional
  `clarificationRequests[].prompt` (absent-tolerant) else "Choose a …";
  `unbound` = server `reason` else "no candidate". Keys are `protocolId`,
  `roleId`, candidate `recordId`; no index keys, no re-sorting.
- `app/src/run/RoleBindingProposalsPanel.test.tsx` — NEW, 4 tests (jsdom).
- `app/src/run/RunWorkspacePage.tsx` — import + ONE mount line after
  `RunProtocolStepsLoader` (same `ProtocolSelectionProvider`).

No server, schema/YAML, CSS, or event-editor change. No POST/PUT/PATCH/DELETE
added anywhere in the diff. `RunProtocolStepsLoader.tsx` and its test are
byte-identical (`git diff` = 0 lines).

Budget: 4 files, 259 changed lines (109 test + 110 panel + 38 client + 2 page).

## RED (before implementation)

Command:
`cd app && timeout 240 ../node_modules/.bin/vitest run src/run/RoleBindingProposalsPanel.test.tsx 2>&1 | tail -n 12`

```
FAIL  src/run/RoleBindingProposalsPanel.test.tsx [ src/run/RoleBindingProposalsPanel.test.tsx ]
Error: Failed to resolve import "./RoleBindingProposalsPanel" from "src/run/RoleBindingProposalsPanel.test.tsx". Does the file exist?

 Test Files  1 failed (1)
      Tests  no tests
```

RED commit: 8e88d365 `test(localbind): u5door RED - proposals panel renders proposed/ambiguous/unbound`

## GREEN

1. `cd app && timeout 240 ../node_modules/.bin/vitest run src/run/RoleBindingProposalsPanel.test.tsx 2>&1 | tail -n 6`

```
Test Files  1 passed (1)
      Tests  4 passed (4)
   Start at  01:36:40
   Duration  2.61s (transform 93ms, setup 57ms, collect 131ms, tests 68ms, environment 572ms, prepare 107ms)
```

2. `cd app && timeout 240 ../node_modules/.bin/vitest run src/run/RunProtocolList.test.tsx src/run/RunProtocolStepsLoader.test.tsx 2>&1 | tail -n 4`

```
Tests  21 passed (21)
   Start at  01:36:44
   Duration  2.90s (transform 166ms, setup 113ms, collect 320ms, tests 663ms, environment 1.36s, prepare 207ms)
```

(existing files untouched; earlier same run reported `Test Files 2 passed (2)`)

3. `cd app && timeout 240 ../node_modules/.bin/tsc --noEmit | wc -l; echo EXIT=$?`

```
0
EXIT=0
```

4. `git -c core.fileMode=false status --short` → empty (no output).

```
STATUS_EXIT=0
```

5. `grep -n "method: 'POST'" app/src/run/RoleBindingProposalsPanel.tsx` → no hits
   (exit 1). No write request was added.

## Notes / environment

The checkout's `app/node_modules` was a dangling symlink to an empty directory;
a temporary root `node_modules` symlink to the integration tree was created only
to run vitest/tsc and both untracked links were removed before the final
`git status --short` (empty). No dependency installation.

## Next actions

Independent review + browser review own acceptance. A run with an attached
protocol and declared roles exercises the panel; no YAML reload needed (the
panel is not schema-driven).

L2-PROTOCOL-LOCAL-BIND-1 UNIT u5door DONE ce327084f96d525937107448e97cf788b6406471
L2-PROTOCOL-LOCAL-BIND-1-u5door UNIT unit DONE ce327084f96d525937107448e97cf788b6406471
