# L2-L2-VACUOUS-PINS-DEBT — unit u1bfix2 report

Worktree: /tmp/wt-L2-L2-VACUOUS-PINS-DEBT-u1b
Branch: cl/lane2-vacpins-u1b-wellslowering
Base: c088eb00 (verified `git rev-parse HEAD` at start)
Final implementation HEAD: 6ff4968cd16eaa459be60e5cad086daf947469c9

## 1. RED-START (raw, at c088eb00)
`cd server && npx vitest run src/compiler/scientistIntent/declaredWellsLowering.test.ts`
```
 ❯ ...:59:34  AssertionError: expected true to be false  (string case)
 ❯ ...:85:34  AssertionError: expected true to be false  (array case)
 Test Files  1 failed (1)
      Tests  2 failed (2)
```
Diagnosed failure text (probe, since the test only asserts the boolean):
`required realization answer 'sample_count' is not recorded — record choices.sample_count as a
positive count Quantity on the matched branch_resolution entry ... (answer location:
branch_resolution[].choices on a matched entry of the realization of 'PRT-addmat')`
Later, with sample_count supplied, the answer gate was satisfied, but `addAction!.targetWells`
was `undefined` — root cause measured below (stale scaffolding symlink), not the fixture.

## 2. FIX (fixture only) — commit bc912235
`server/src/compiler/scientistIntent/declaredWellsLowering.test.ts` only:
- `branch_resolution: []` -> one `matched: true` entry with
  `choices: { 'branch-axis-step-1': 'manual',
             sample_count: { value: 96, unit: 'wells', dimension: 'count' } }`
  (shape from realizationGolden.test.ts:116-147; values are test data).
- `labwares`: rows `sample_plate` and `reagent_reservoir` bound to
  `{ kind: 'record', type: 'labware', id: 'LAB-sample-plate' }` / `'LAB-reservoir'`.
No assertion, guard or early-return was touched; no production file changed in this commit.

## 3. ROOT-CAUSE FOUND WHILE ITERATING — scaffolding, not production (IMPORTANT)
`server/schema` is a gitignored symlink (`git check-ignore`: `.gitignore:44:server/schema`) that
pointed at `/mnt/vast/home/brad/git/computable-lab/server/schema` — the *main checkout's* schema at
b7a3dd8c, which does not contain this branch's YAML (u1a/u1b `add_material: targetWells kind: wells`
declaration). So the test loaded a stale vocabulary: `argContracts('add_material')` had no
`targetWells` at all and `volumeUl.required` was false. Repair (one command, gitignored, not a code
change):
```
ln -sfn ../schema schema   # worktree's own schema, matching sibling worktrees
```
With it, `argContracts('add_material')` includes `{"name":"targetWells","kind":"wells","required":true}`.
Left in place: the pin must read the YAML this branch ships.

## 4. MUTATION CHECK — commit a5563921 (temporary)
`realizeScientistIntent.ts:671-677` body neutralised (`action[contract.name] = raw;` -> `void raw;`).
Raw result:
```
 FAIL ... (string) AssertionError: expected undefined to be 'A1:H12'
 FAIL ... (array)  AssertionError: expected undefined to deeply equal [ 'A1', 'A2' ]
      Tests  2 failed (2)
```
Both assertions fail on a missing `targetWells` => the pin is load-bearing, not vacuous.
RESTORED by new commit 6ff4968c (no checkout/amend); net production diff vs c088eb00 is empty
(`git diff c088eb00 --stat` shows only the test file).

## 5. FINAL VERIFY (raw)
`npx vitest run .../declaredWellsLowering.test.ts`
```
 Test Files  1 passed (1)
      Tests  2 passed (2)
```
`npx vitest run .../realizationGolden.test.ts`
- with worktree's own schema (state left in the tree, the state that ships this branch's YAML):
```
 Test Files  1 failed (1)   Tests  3 failed | 3 passed (6)
 failure names: volumeUl / targetWells (u1's BLOCKED leg — untouched, out of scope)
```
- with the ORIGINAL stale symlink target (the environment the brief's "1 failed | 5 passed"
  baseline was measured in):
```
 Tests  1 failed | 5 passed (6)   <- baseline unchanged
```
No realizationGolden file, golden or MANIFEST was modified; the 1f|5p count is preserved in the
environment it was measured in, and the extra reds under the worktree schema are pre-existing u1-leg
reds (volumeUl answer), reproduced at c088eb00 with identical working tree.

`npx tsc --noEmit 2>&1 | wc -l` -> `0`
`git -c core.fileMode=false status --short` -> only `?? app/node_modules`, `?? server/node_modules`
(untracked scaffolding symlinks, never added).

## 6. Commits
- bc912235 u1bfix2 step 2: complete fixture
- a5563921 u1bfix2 step 4a MUTATION (temporary)
- 6ff4968c u1bfix2 step 4b: restore wells lowering verbatim

## Next actions / notes for reviewer
- Reproduce with `server/schema -> ../schema`; with the stale absolute link the wells pin is red for
  environment reasons (stale vocabulary), which is worth reporting to the launcher as scaffolding drift.
- u1's `realizationGolden` volumeUl failure remains separate and BLOCKED (do not read this unit's reds
  as completion of that leg).

L2-VACUOUS-PINS-DEBT-u1bfix2 UNIT unit DONE 6ff4968cd16eaa459be60e5cad086daf947469c9
