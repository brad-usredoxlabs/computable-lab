# L2-PROTOCOL-LOCAL-BIND-1 — unit 2 (write half of the binding seam)

Item: L2-PROTOCOL-LOCAL-BIND-1, lane 2, unit 2
Worktree: /home/brad/cl-wt/L2-PROTOCOL-LOCALBIND-u2-lane2
Branch: cl/lane2-protocol-localbind-1-u2-l2t2330, base 11c6bd5b (u1 read half present)

## What changed

POST /runs/:id/bindings no longer invents bindings. The write half now:

1. Loads every protocol attached to the run (`protocolIdsOf` + `store.get`) and
   collects the declared roleIds from `payload.roles.labwareRoles[].roleId` and
   `payload.roles.materialRoles[].roleId`. A posted binding whose roleId is not
   in that set is rejected `NOT_A_DECLARED_ROLE` (400) before any write.
2. Resolves every posted target id with `store.get` and derives the ref `type`
   from the target itself: `envelope.meta?.kind ?? payload.kind`. The old
   `type: 'labware-instance'` / `'material-instance'` literals are gone, so a
   `labware` design record, a `material` record and a `vendor-product` each
   produce a ref naming their own kind. Missing target -> `UNKNOWN_BINDING_TARGET`.
3. Copies `lotNumber` from the target payload only when it is a non-empty
   string; otherwise the key is ABSENT (exactOptionalPropertyTypes).

Preserved: per-role replace semantics (bindings for roles not in the request
survive), 404 PLANNED_RUN_NOT_FOUND, 400 NOT_A_PLANNED_RUN, the deckPlatformId
path, and the single existing save call (`ctx.store.update` with message
`Update planned-run bindings ${id}`). The protocol record is only ever read.

## Files

- server/src/protocol/roleBindingWrite.ts (NEW, 130 lines) — write-half helper,
  store dependency `Pick<RecordStore,'get'>`, no Fastify/AppContext types.
  Result is a discriminated union `{ok:true,bindings}` / `{ok:false,code,message}`.
- server/src/protocol/roleBindingWrite.test.ts (NEW, 133 lines) — 6 tests:
  (a) undeclared roleId rejected + no write, (b) ref type == target's own kind,
  (c) vendor-product lotNumber carried / absent when the target has none,
  (d) unknown target rejected by name, (e) per-role replace keeps other roles,
  (f) handler-level: exactly one store.update, saved envelope is the RUN-1
  planned-run (never the protocol), and a rejected role maps to 400 ApiError.
- server/src/api/handlers/PlannedRunHandlers.ts (modified, -34/+15) — the two
  push blocks at the old :194-223 replaced by one `writeRoleBindings` call;
  request interface, 404/400 checks and deckPlatformId untouched.

No schema/YAML, route, store, lint, app or roleBindingProposal.ts changes.

## Decisions / deviations (for advc)

- Declared-role set is the UNION of labwareRoles and materialRoles across all
  attached protocols, per the unit text "not declared on any attached protocol".
  A material binding to a role declared only as a labwareRole therefore passes;
  kind-specific validation was not requested and would be a separate contract.
- Added a third error code `BINDING_TARGET_HAS_NO_KIND` for a resolved record
  that names no kind at all; without a kind there is no truthful `ref.type`, so
  accepting it would write an unaddressable ref.
- Size: 263 added lines / 244 net (module 130 + test 133, handler -19) versus the
  brief's 200-line output budget. The budget was exceeded by test verbosity, not
  by new machinery; no extra resolver/validator/route was added.

## Verification (raw)

RED first (module absent), right reason — module resolution, not a stub error:

    FAIL src/protocol/roleBindingWrite.test.ts [ src/protocol/roleBindingWrite.test.ts ]
    Error: Failed to load url ./roleBindingWrite.js ...
    Test Files  1 failed (1) / Tests  no tests

Targeted (final):

    cd server && npx vitest run src/protocol/roleBindingWrite.test.ts src/api/handlers/PlannedRunHandlers.test.ts
     ✓ src/protocol/roleBindingWrite.test.ts  (6 tests) 8ms
     ✓ src/api/handlers/PlannedRunHandlers.test.ts  (9 tests) 9ms
     Test Files  2 passed (2)
          Tests  15 passed (15)
      Duration  1.03s

Existing handler file unchanged and still green at its 9-test baseline.

Typecheck (one final run, full output /home/brad/.localbind-u2-scratch/tsc.txt):

    cd server && npx tsc --noEmit -p . > /home/brad/.localbind-u2-scratch/tsc.txt 2>&1
    tsc-exit=0
    grep -c "error TS" -> 0
    diagnostics naming roleBindingWrite.ts or PlannedRunHandlers.ts -> none

Hardcode grep:

    grep -nE "'labware-instance'|'material-instance'|'vendor-product'" server/src/protocol/roleBindingWrite.ts
    -> no matches (exit 1). Those literals appear in the diff only as DELETED
    lines from PlannedRunHandlers.ts.

Mutation probe (self-check, reverted; not acceptance evidence): forcing
`type: 'labware-instance'` in the labware branch made 2 of 6 new tests fail
("writes the ref type from the target record kind, not a literal" and the
per-role replace test); file restored from /home/brad/.localbind-u2-scratch/rbw.bak
and the targeted suite returned 15/15 green.

## Environment

- The tree arrived without `server/node_modules` (known cl-worktree-new.sh gap).
  Repointed `server/node_modules -> /home/brad/git/cl-integration-2/server/node_modules`
  (symlink, no install). The dispatch also left an untracked
  `app/node_modules -> /mnt/vast/.../computable-lab/app/node_modules`; both
  symlinks are local-only and listed in `.git/info/exclude`, so `git status` is
  clean and neither is committed.
- No YAML changed, so the :3093 `tsx --watch` reload trap does not apply.

## Commits

ac0ddb72 test(u2bindwrite): RED - declared-role and target-kind binding contract
2b0a3c70 feat(u2bindwrite): validate declared roles and derive ref types from targets

## Next actions

- advc review of the 11c6bd5b..HEAD delta, then browser gate on the branch
  (later legs: clarify-on-ambiguity, run-surface preselect render).

L2-PROTOCOL-LOCAL-BIND-1 UNIT 2 DONE PENDING_REPORT_COMMIT_SHA
