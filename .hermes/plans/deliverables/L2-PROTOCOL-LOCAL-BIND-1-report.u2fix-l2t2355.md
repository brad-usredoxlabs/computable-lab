# L2-PROTOCOL-LOCAL-BIND-1 — unit u2fix (write-half adversarial fixer)

Worktree: /home/brad/cl-wt/L2-PROTOCOL-LOCALBIND-u1fix-lane2
Branch: cl/lane2-protocol-localbind-1-u1fix-l2t2355, base b0a84dcb (trunk cl/integration-2)
Scope: server/src/protocol/{roleBindingWrite.ts,roleBindingProposal.ts (export only),roleBindingWrite.test.ts}

## Defect (advc-c2 D1) and fix
Write half collected declared roleIds off the local-protocol payload:
`asObject((await store.get(protocolId))?.payload)?.roles` — local-protocol has no `roles`
(schema unevaluatedProperties:false), so `declared` was empty on real data and every POST
returned NOT_A_DECLARED_ROLE.

Fix (one accessor, no parallel resolver): `declaredRolesOf` was already the read half's
resolution (local payload -> own roles defensively -> `inherits_from.id` -> universal
protocol payload `roles`). Exported it from roleBindingProposal.ts (param narrowed to
`Pick<RecordStore,'get'>`, structurally compatible with both callers) and called it from
roleBindingWrite.ts. Generic over inherits_from: no role names, record ids or kinds in TS.

## RED (commit 4d81d06f) — raw vitest output at HEAD-ish tree with new leg only
```
❯ src/protocol/roleBindingWrite.test.ts > writeRoleBindings > resolves declared roles through inherits_from on the universal protocol
  → NOT_A_DECLARED_ROLE: roleId 'plate' is not declared on any attached protocol
Error: NOT_A_DECLARED_ROLE: roleId 'plate' is not declared on any attached protocol
 Tests  1 failed | 6 passed (7)
```
Fixture shape (schema-valid): run -> local-protocol (NO roles, inherits_from{kind:record,id:PRT-U1,type:protocol}) -> universal `protocol` PRT-U1 carrying `roles.labwareRoles/materialRoles`.

## GREEN after fix (commit 88cd8284)
```
cd server && timeout 240 npx vitest run src/protocol/roleBindingProposal.test.ts src/protocol/roleBindingWrite.test.ts
 ✓ roleBindingProposal.test.ts (6 tests)
 ✓ roleBindingWrite.test.ts (7 tests)      # 1 NEW non-vacuous inherits_from leg
 Test Files 2 passed (2) / Tests 13 passed (13)

cd server && timeout 240 npx tsc --noEmit   -> exit 0, no output
```
All pre-existing write legs were converted from a local-protocol `roles` fixture (the
vacuous shape) to the inherits_from chain; the NOT_A_DECLARED_ROLE leg now also asserts
the universal record PRT-U1 is consulted, so it cannot pass by not resolving the chain.
`protocol()` local-roles fixture removed from the write test.

## Notes / reviewer checks
- exactOptionalPropertyTypes: no optional field added; conditional spread unchanged (lotNumber).
- Skill/domain: no schema, records, routes.ts, PlannedRunHandlers.ts or RunProtocolList* touched.
- Files changed: 3, diff 14 insertions(+), 12 deletions(-).

VERIFY (re-run): cd server && npx vitest run src/protocol/roleBindingProposal.test.ts src/protocol/roleBindingWrite.test.ts && npx tsc --noEmit

L2-PROTOCOL-LOCAL-BIND-1 UNIT u2fix DONE ee3cdaee0e804bdb9eee6c52f54a72fee0f5475a
L2-PROTOCOL-LOCAL-BIND-1-u2fix UNIT unit DONE ee3cdaee0e804bdb9eee6c52f54a72fee0f5475a
