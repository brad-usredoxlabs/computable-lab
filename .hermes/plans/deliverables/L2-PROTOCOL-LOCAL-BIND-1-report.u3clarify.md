# L2-PROTOCOL-LOCAL-BIND-1 — unit u3clarify (lane 2)

Worktree: /home/brad/cl-wt/L2-LOCALBIND-u3clarify-lane2
Branch: cl/lane2-localbind-u3clarify-0110, base eaff70d4

## Scope decision

Server half only: turn a `state: 'ambiguous'` role proposal into ONE named clarification
request listing every candidate, and prove the proposals endpoint still writes nothing.
The run-surface / picker render leg is a SEPARATE unit — criterion (b) is NOT claimed
end-to-end here; the claim is "the server emits the card and writes no binding".

## Environment note (not a code change)

This fresh worktree had no `node_modules` (the checkout was built from local disk without
an install). Per "do not install dependencies", root and `server/node_modules` were
symlinked temporarily to the existing local sibling install at
/home/brad/cl-wt/L2-MATSEL-u2-lane2/ for the verification runs, and both symlinks were
removed before exit. Baselines re-measured at eaff70d4 with that install:
`npx tsc --noEmit` = 0 lines; `roleBindingProposal.test.ts` = 6 passed.
Pre-existing untracked `app/node_modules` symlink (created by dispatch, points at NFS)
was left untouched.

## Step 1 — RED

New `server/src/protocol/roleBindingClarify.test.ts` (first line
`// @vitest-environment node`) with a fixture run whose universal protocol declares two
material roles: `medium` resolves to exactly ONE matching vendor-product (`proposed`) and
`enzyme` to TWO (`ambiguous`), plus handler-level wiring tests that spy on
create/update/delete.

Raw RED (module does not exist yet):

```
 RUN  v1.6.1 /home/brad/cl-wt/L2-LOCALBIND-u3clarify-lane2/server

 ❯ src/protocol/roleBindingClarify.test.ts  (0 test)

⎯⎯⎯⎯⎯⎯⎯ Failed Suites 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/protocol/roleBindingClarify.test.ts [ src/protocol/roleBindingClarify.test.ts ]
Error: Failed to load url ./roleBindingClarify.js (resolved id: ./roleBindingClarify.js) in /home/brad/cl-wt/L2-LOCALBIND-u3clarify-lane2/server/src/protocol/roleBindingClarify.test.ts. Does the file exist?

 Test Files  1 failed (1)
      Tests  no tests
```

## Step 2 — GREEN: pure card emitter + endpoint wiring

New `server/src/protocol/roleBindingClarify.ts` — one pure exported function,
no store, no side effects:

```ts
export function clarificationRequestsFor(proposals: RoleBindingProposals): AgentClarificationRequest[]
```

Rules, by construction:
- one card per `state === 'ambiguous'` role, zero for `proposed` / `unbound`;
- `kind` = the role's own `roleKind` pass-through (`'labware' | 'material'`, both
  members of `AgentClarificationKind`) — no switch over role kinds, no new kind;
- `id` = `` `role-binding-${protocolId}-${roleId}` `` (deterministic join id; candidates
  are already sorted `byRecordId` upstream and are NOT re-sorted);
- `prompt` names the `roleId` and every candidate `label` verbatim;
- `options` = `{ id: candidate.recordId, label: candidate.label }` only — no scores,
  confidences, snippets or ontology terms;
- `menuProvider: 'choice'`, `origin: 'harness'`, `roleId` set;
- no optional key is ever written as `undefined` — the card literal simply omits
  unused keys (server `exactOptionalPropertyTypes` clean).

One deviation from the brief's arithmetic, resolved from code (not a behaviour change):
the proposal entry's `protocolId` is the run's LOCAL protocol id (`protocolIdsOf` keys
the entry by the ref; the universal only supplies the role declarations), so the join id
is `role-binding-<localProtocolId>-<roleId>` — e.g. `role-binding-LPR-1-enzyme`. The card
is still deterministic and collision-free per protocol entry. Test asserts the measured
id; no universal/local id invention.

Handler wiring (`getRoleBindingProposals` only):
`{ ...proposals, ...(cards.length > 0 ? { clarificationRequests: cards } : {}) }` with the
declared return widened to
`(RoleBindingProposals & { clarificationRequests?: AgentClarificationRequest[] }) | ApiError`.
Same 404/400 branches, same read-only store use, no other handler touched.

## Verification (raw)

1. `cd server && npx vitest run src/protocol/roleBindingClarify.test.ts src/protocol/roleBindingProposal.test.ts`

```
 RUN  v1.6.1 /home/brad/cl-wt/L2-LOCALBIND-u3clarify-lane2/server

 ✓ src/protocol/roleBindingProposal.test.ts  (6 tests) 11ms
 ✓ src/protocol/roleBindingClarify.test.ts  (6 tests) 13ms

 Test Files  2 passed (2)
      Tests  12 passed (12)
```

2. `cd server && npx tsc --noEmit | wc -l`

```
0
```

3. Adjacent suites (no regression): `PlannedRunHandlers.test.ts` 9, 
   `PlannedRunHandlers.protocols.test.ts` 7, `roleBindingWrite.test.ts` 7 — 
   `Test Files 3 passed (3)`, `Tests 23 passed (23)`.

`server/src/protocol/roleBindingWrite.ts` and `roleBindingProposal.ts` are untouched
(`git diff --name-only` lists only the handler and the new files).

## Read-only proof

`roleBindingClarify.test.ts` builds a store whose `create`/`update`/`delete` are spies,
calls the real `getRoleBindingProposals` handler, asserts the card is present and that
all three write spies have zero calls; the pure module has no store parameter at all.

## Not claimed here

- Criterion (b) end-to-end: the run-surface/picker render leg (`app/**`) is a separate
  unit. This unit claims only "the server emits the card and writes no binding".
- Nothing was reloaded or exercised against a live lane stack (no YAML changed; no UI).

## Next action (for the reviewer / next unit)

Reviewer: check the card shape against `AgentClarificationRequest` and confirm the
absent-key rule. Follow-on unit: render these `clarificationRequests` on the run surface
picker (app/**) and gate the bind write on the answer.
