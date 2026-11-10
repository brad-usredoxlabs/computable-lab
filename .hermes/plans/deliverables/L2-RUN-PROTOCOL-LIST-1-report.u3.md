# L2-RUN-PROTOCOL-LIST-1 — unit u3 report

Item: L2-RUN-PROTOCOL-LIST-1 (lane 2)
Worktree: /home/brad/cl-wt/L2-RUNPROTO-u3b-lane2
Branch: cl/lane2-runprotocollist-u3-l2t2100
Base: d2f7c08eddc7469d0a75da016d426677824e91eb (trunk cl/integration-2)
Unit: u3 — POST /runs/:id/protocols attaches ONE local-protocol ref to an existing
planned-run's ordered `localProtocolRefs`, idempotently, returning ordered ids.

## Decisions

- Reused u2's pure helper `withAttachedProtocol` + `protocolIdsOf` verbatim (no
  dedupe/reorder logic re-implemented in the handler); the handler never mutates
  `record.payload` in place, so legacy `localProtocolRef` survives byte-identical.
- Ref appended as `{ kind: 'record', id: <recordId>, type: 'local-protocol' }`,
  valid against planned-run.schema.yaml:86-99 items.allOf.
- Error taxonomy mirrors siblings exactly: 404 PLANNED_RUN_NOT_FOUND,
  404 LOCAL_PROTOCOL_NOT_FOUND, 400 NOT_A_PLANNED_RUN (also covers absent
  `payload.kind`), 400 NOT_A_LOCAL_PROTOCOL. Missing/empty protocolId falls into
  the LOCAL_PROTOCOL_NOT_FOUND 404 branch (no 500 path).
- Route registered inside the existing `if (plannedRunHandlers) {` block
  (routes.ts:1000-1006), beside `/runs/:id/bindings`; no new router/prefix.
- Body type `{ protocolId?: string }`; nothing assigns `undefined` to an optional
  property (exactOptionalPropertyTypes-safe).

## Changed files

- server/src/api/handlers/PlannedRunHandlers.protocols.test.ts (new, 7 cases)
- server/src/api/handlers/PlannedRunHandlers.ts (attachProtocol handler + helper import)
- server/src/api/routes.ts (one route line)

## Verification (raw)

RED before fix (cwd server):
  Test Files  1 failed (1)
       Tests  7 failed (7)
  (each: TypeError: handlers.attachProtocol is not a function)

After fix, targeted run from worktree root:
  $ npx vitest run server/src/api/handlers/PlannedRunHandlers.protocols.test.ts \
      server/src/api/handlers/PlannedRunHandlers.test.ts server/src/protocol/runProtocolList.test.ts
  ✓ server/src/api/handlers/PlannedRunHandlers.protocols.test.ts  (7 tests) 6ms
  ✓ server/src/api/handlers/PlannedRunHandlers.test.ts  (5 tests) 5ms
  ✓ server/src/protocol/runProtocolList.test.ts  (9 tests) 121ms

  Test Files  3 passed (3)
       Tests  21 passed (21)

Typecheck:
  $ npx tsc -p server/tsconfig.json --noEmit
  tsc_exit=0   (zero diagnostic lines)

Tree: clean (`git -c core.fileMode=false status --short` empty).

Environment note: this worktree arrived without node_modules (only an untracked
app/node_modules symlink to the trunk). To run the brief's commands I temporarily
symlinked root/server node_modules to the same item's u1 worktree pnpm farm and
removed both symlinks before exit; app/node_modules (pre-existing, launcher-created)
was left untouched and locally excluded via .git/info/exclude so the tree reads clean.
Also note: runProtocolList.test.ts resolves `join(process.cwd(), 'schema')`, so the
schema-backed cases only pass from the worktree root (they ENOENT from server/);
from root all 9 pass as shown. No product change was made for that.

## Commits

- bdc374b2 test(run-protocols): RED for attach local-protocol to planned-run (RUNPROTO u3)
- fd489331 feat(run-protocols): attach local-protocol to planned-run (RUNPROTO u3)
- report commit: see `git log -- .hermes/plans/deliverables/L2-RUN-PROTOCOL-LIST-1-report.u3.md`

## Next actions (not this unit)

- detach path + run-surface UI (separate legs); consumer of POST /runs/:id/protocols.

L2-RUN-PROTOCOL-LIST-1-u3 UNIT unit DONE fd48933121e5991cc0308a0a31e6fa063b52b20b
