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
0985eeadae4f0ae02e5190723a90c13cd357ba83 — "L2-SUBPROTOCOL-EXPAND-1 u1: report"

L2-SUBPROTOCOL-EXPAND-1-u1 UNIT unit DONE 0985eeadae4f0ae02e5190723a90c13cd357ba83

---

# u1fix — advc c1 fixes (D1-D4), branch cl/lane2-subprotocol-expand-1-u1-l2t0045 at 86a39318

## D1 (MAJOR) — ref selection is keyed, not positional
`concreteRef` now checks `CANONICAL_REF_KEYS = [labwareInstanceRef, materialRef,
instrumentRef, contextRef, templateRef, libraryRef]` (schema order) and picks the
one kind-bearing object under those keys. Position/Object.values no longer decides.
- Entry with `labwareGeometryRef` + `labwareInstanceRef` -> `labwareInstanceRef`
  (geometry is NOT the instance; schema/workflow/planned-run.schema.yaml:300-312
  permits both on one LabwareBinding).
- Two kind-bearing canonical keys on one entry -> `{ ambiguous: true }`, surfaced
  as the new named error `AMBIGUOUS_BINDING` with roleId + stepId, same ok:false
  shape, no events. (No positional guess, no partial graph.)
- Generic first-kind-value fallback only when no canonical key carries a ref.

## D2 — structural unbound guard
`bindRoleReferences(value, resolve)` takes a resolver instead of the map and does
`bound[key] = resolve(child)` — there is no `?? child` path, so an abstract role
string can no longer leak. `resolve` throws a local `RoleBindingFailure(code,
roleId)`; the step loop catches it and converts to the existing named
`UNBOUND_ROLE` (or `AMBIGUOUS_BINDING`) result. The declared-role pre-check stays;
the refs.has pre-check was removed so the binding pass itself is the authority for
boundness.

## D3 — vacuous pin replaced
Deleted `expect(emittedStrings).not.toContain(String(50))` (50 is a number;
stringValuesDeep can never yield "50"). Replaced the two `toMatchObject` calls with
`toEqual(substituteRoles(step))`: details must deep-equal the declared step with
ONLY `*Role` strings replaced, pinning every key and every numeric at its original
path (no invented values, no invented keys). Tests: 8 now (5 kept + 3 added).

## Tests added (RED at HEAD 86a39318, GREEN after)
(a) geometry+instance entry -> emits labwareRef (was geometry at HEAD);
(b) only-geometry entry, no canonical key -> geometry selected (fallback documented);
(c) two canonical keys -> AMBIGUOUS_BINDING, roleId plate, stepId read-plate, no events.

## Verification (raw, this worktree)
RED before the product fix (test commit 51d4ddd6, module untouched):
$ cd server && npx vitest run src/protocol/localPlanGraph.test.ts 2>&1 | tail -n 6
Test Files  1 failed (1)
      Tests  2 failed | 6 passed (8)
  Start at  01:24:45
  Duration  945ms (transform 41ms, setup 1ms, collect 41ms, tests 10ms, environment 0ms, prepare 492ms)
  FAIL ... > prefers the canonical instance ref when the entry also carries a geometry ref
  FAIL ... > refuses an entry whose canonical keys disagree, naming AMBIGUOUS_BINDING

GREEN after 5e894a26:
$ cd server && npx vitest run src/protocol/localPlanGraph.test.ts 2>&1 | tail -n 6
Test Files  1 passed (1)
      Tests  8 passed (8)
  Start at  01:25:22
  Duration  929ms (transform 44ms, setup 0ms, collect 41ms, tests 6ms, environment 0ms, prepare 472ms)

$ cd server && npx tsc --noEmit; echo EXIT=$?
EXIT=0

## Files (u1fix)
- server/src/protocol/localPlanGraph.ts (77 insertions / 26 deletions vs 86a39318)
- server/src/protocol/localPlanGraph.test.ts (+57/-5 lines; 8 tests)
- this report. No schema/roleBindingWrite change; no other file touched.
The lane dependency symlink used for verification was removed before exit so the
tree carries no untracked dependency entry; recreate it to re-run:
  ln -s /mnt/vast/home/brad/git/cl-integration-2/server/node_modules server/node_modules
`?? app/node_modules` is the launcher's own lane plumbing, untouched.

## Commits
51d4ddd6 — RED test commit
5e894a26 — product fix (keyed ref selection + structural unbound guard)
679ec32dce260ee9b1852e82c1d37f3a36ae0007 — this report

## D4 note
The u1 marker above ("... UNIT unit DONE ...") is left as history; the corrected
final markers below are the acceptance markers. Both name this report commit,
which contains them (the sha line was fixed in the follow-up commit, per the
brief's two-commit recipe).

L2-SUBPROTOCOL-EXPAND-1-u1 UNIT 1 DONE 679ec32dce260ee9b1852e82c1d37f3a36ae0007
L2-SUBPROTOCOL-EXPAND-1-u1fix UNIT unit DONE 679ec32dce260ee9b1852e82c1d37f3a36ae0007
