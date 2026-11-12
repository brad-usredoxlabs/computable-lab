# L2-LAB-INVENTORY-CREATE-1 / unit shelflw2 Report

## Decision
Defect D3 (browser gate g1 clause (c)): the shelf's labware concept arm queried only
record kind `labware-definition`, so the 20 seed vessels declared `kind: labware`
(records/seed/labware/*) never resolved as concepts. Fix reads BOTH merged labware
record families through one named const, `LABWARE_CONCEPT_KINDS = ['labware',
'labware-definition']` (shelfLookup.ts, next to KIND_LEVEL), used at the single labware
provider call site. The reported `sourceKind` and `joinedVia` stay
`'labware-definition'` — the ShelfConcept/ShelfJoinPath unions are NOT widened. The
material provider arm (`['material']`), store.list-only property, LEVEL_ORDER and
labwareDefIds Set semantics are untouched.

## Changed files (2 files, +65/-2; only owned paths)
1. server/src/resolve/shelfLookup.ts — new const + call-site kind list (+12/-2 incl. comment)
2. server/src/resolve/shelfLookup.test.ts — new non-vacuous pin H + kind-`labware` fixture (+53)

## RED (before the fix, raw)
```
RUN  v1.6.1 /home/brad/cl-wt/L2-LABINV-shelflw2-lane2/server

 ❯ src/resolve/shelfLookup.test.ts  (9 tests | 1 failed) 13ms
   ❯ src/resolve/shelfLookup.test.ts > shelfLookup — concept-keyed inventory (MATRES-SHELF) > H: kind labware record resolves as a concept and joins its labware-instance via labwareId
     → expected undefined not to be undefined

 FAIL  src/resolve/shelfLookup.test.ts > shelfLookup — concept-keyed inventory (MATRES-SHELF) > H: ... 
AssertionError: expected undefined not to be undefined
 ❯ src/resolve/shelfLookup.test.ts:438:21
 Test Files  1 failed (1)
      Tests  1 failed | 8 passed (9)
```

## GREEN (targeted pair, raw)
```
$ cd server && npx vitest run src/resolve/shelfLookup.test.ts src/api/InventoryShelfApi.test.ts

 ✓ src/api/InventoryShelfApi.test.ts  (3 tests) 11808ms

 Test Files  2 passed (2)
      Tests  12 passed (12)
   Duration  16.34s
```
(11 baseline + new H. Env note: this worktree was missing the gitignored
`server/schema -> ../schema` symlink and `server/node_modules`; both are gitignored
worktree infra — a repo-local `server/schema` symlink was created for the run, and
node_modules was temporarily symlinked from a sibling worktree, then removed. Neither
appears in git status. The API test boots against ../schema and the vocabulary loader
resolves server/schema, so cwd=server is required.)

## Mutation probe (raw failing summary with :179 reverted to ['labware-definition'])
```
 ❯ src/resolve/shelfLookup.test.ts  (9 tests | 1 failed) 13ms
   ❯ ... > H: kind labware record resolves as a concept and joins its labware-instance via labwareId
     → expected undefined not to be undefined
 FAIL  src/resolve/shelfLookup.test.ts > ... > H: ...
AssertionError: expected undefined not to be undefined
 ❯ src/resolve/shelfLookup.test.ts:438:21
 Test Files  1 failed (1)
      Tests  1 failed | 8 passed (9)
```
Restored; re-run green (`Test Files 1 passed (1)` / `Tests 9 passed (9)`), so the pin
fails if the fix is reverted. Fixture is non-vacuous: schemaId `SCHEMA('labware')` AND
payload.kind `'labware'`; instance label omits the term so only the labwareId join surfaces it.

## Typecheck (one run, at end)
```
$ cd server && npx tsc --noEmit
EXIT=0
```
(zero output lines)

## Tree
```
$ git -c core.fileMode=false status --short
(clean at code-commit time; only the two owned files were modified)
```

## Commit
5cb84ff1eecaa75cbf7709360c301d8de634927b — "fix(shelfLookup): resolve labware concepts
from both merged record families (shelflw2)"

## Next actions / remaining
- Live browser re-grade of g1 clause (c) on a served revision requires the orchestrator
  to reload the lane stack (this is a TS change, not YAML) and for D1's branch
  cl/lane2-labinv-u7lotdoor-1129 to be merged separately.
- Playwright/browser acceptance is owned by the independent reviewer; not claimed here.
- AC2/AC3 covered by existing tests (empty-report test, InventoryShelfApi DMSO test) and
  by the untouched material provider arm.

L2-LAB-INVENTORY-CREATE-1 UNIT shelflw2 DONE 5cb84ff1eecaa75cbf7709360c301d8de634927b
