# L2-SUBPROTOCOL-EXPAND-1 — unit u1 report

Worktree: /home/brad/cl-wt/L2-SUBPROTOCOL-EXPAND-u1-lane2
Branch: cl/lane2-subprotocol-expand-1-u1-l2t0045 (base af779076)
Owned files (only these changed):
- server/src/protocol/localPlanGraph.ts (new, 156 lines)
- server/src/protocol/localPlanGraph.test.ts (new, 123 lines)
Budget: 2 files / 279 lines (limit 3 files / 300 lines).

## What was built
Pure producer `buildLocalPlanGraph({ protocolId, protocol, bindings })`.
- Declared roles = roleIds found under any `protocol.roles.<key>[].roleId`.
- Binding index = flattened `bindings.<category>[].roleId` -> the entry's concrete
  ref object (the one object value carrying `kind`), so labware/materials/instruments/
  contexts are one code path.
- Generic role walk: any object key ending in `Role` whose value is a string is a
  referenced roleId; it is replaced by its concrete ref. No per-verb switch, no
  role-id/vendor/reagent literal in the module.
- Per step: every reference must be declared (else UNDECLARED_ROLE roleId+stepId)
  and bound (else UNBOUND_ROLE roleId+stepId). Error results carry NO events field
  -> no partial graph.
- Event: `{ eventId: "<stepIndex>-<stepId>", stepId, event_type: step.kind,
  details: step with refs replaced }`. Deterministic across calls.
- No numeric is synthesized and nothing is measured; details copy only step fields.
- MALFORMED_PROTOCOL is a third named error for non-object protocol / non-array
  steps / missing stepId or kind (structural contract, no guessing).

## Verification (raw)
$ ls server/src/protocol/localPlanGraph.ts   (before creating it)
ls: cannot access 'server/src/protocol/localPlanGraph.ts': No such file or directory

RED (test written, module absent):
 ❯ src/protocol/localPlanGraph.test.ts  (0 test)
 Error: Failed to load url ./localPlanGraph.js ... Does the file exist?
 Test Files  1 failed (1)

$ cd server && npx vitest run src/protocol/localPlanGraph.test.ts
 ✓ src/protocol/localPlanGraph.test.ts  (5 tests) 5ms
 Test Files  1 passed (1)
      Tests  5 passed (5)

$ cd server && npx tsc --noEmit
(no output, exit 0)

## Environment note (not source)
This worktree had NO node_modules (unlike sibling unit worktrees), so vitest could
not resolve packages. To run the checks I temporarily created the standard lane
symlinks, then removed them before exit so no untracked dependency symlink is left
for the launcher to auto-commit:
  ln -s /mnt/vast/home/brad/git/computable-lab/node_modules node_modules
  ln -s /mnt/vast/home/brad/git/cl-integration-2/node_modules server/node_modules
(Recreate with those two commands to re-run verification.) `?? app/node_modules`
was already present from the launcher and is untouched.

## Next actions (NOT in this unit)
- u2: emit/record the event graph + run link (store seam).
- u3: no-expander arm for intent steps.
- Caller must pass the protocol whose `roles` are resolved (declaredRolesOf follows
  inherits_from); this unit deliberately reads `protocol.roles` only.

## Commit
6ec5c1b9cf6a86999d716d594fad3472a0e67963 — "L2-SUBPROTOCOL-EXPAND-1 u1: ..."
