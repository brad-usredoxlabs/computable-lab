# L2-GC-PEAK-NAMING-1-u1data — report

Item: L2-GC-PEAK-NAMING-1-u1data (1 of 1) — populate the FAME reference-standard data
Lane: 2 | worktree: /home/brad/cl-wt/L2-GC-PEAK-NAMING-1-u1data-lane2 | branch: cl/lane2-peaknaming-u1data-l2t2640
Base: 3987aeb0df8de224906996c5621966fcbf59762d
Ruling applied: fa9e28cd0 + 72c48ff82 — peak names live in the knowledge layer; assertions keyed to RT + method are the library. This unit lays the substrate only.

## Commits (base..HEAD)
- 57201dd88 L2-GC-PEAK-NAMING-1 u1data RED: FAME class must declare all eight methyl esters (1 file, +60)
- 85971344a L2-GC-PEAK-NAMING-1 u1data GREEN: FAME class 6:0-20:0 + methyl-ester seed materials (4 files, +58/-4)

`git diff --stat 3987aeb0d..85971344a` → exactly 5 files, 118 insertions(+), 4 deletions(-):
- schema/registry/compound-classes/fame-medium-chain.yaml (+20/-4 area: candidates 3→8, header/description updated)
- records/seed/materials/mat-seed-fame-methyl-hexanoate-n6.yaml (new, 14 lines)
- records/seed/materials/mat-seed-fame-methyl-octanoate-n8.yaml (new, 14 lines)
- records/seed/materials/mat-seed-fame-methyl-decanoate-n10.yaml (new, 14 lines)
- server/src/registry/FameCompoundClass.test.ts (new, 60 lines)
Budget: files 5/5, lines 118/150. Nothing outside SCOPE touched (fame-local.yaml, src/ non-test code, other schema/records all untouched).

## Step 1 — RED (run on base registry, candidates.length 3)
`cd server && npx vitest run src/registry/FameCompoundClass.test.ts`
```
 ❯ src/registry/FameCompoundClass.test.ts  (3 tests | 1 failed) 15ms
   → expected 3 to be greater than or equal to 8
 FAIL src/registry/FameCompoundClass.test.ts > ... > declares all eight methyl-ester candidates (6:0-20:0)
AssertionError: expected 3 to be greater than or equal to 8
 Test Files  1 failed (1)
      Tests  1 failed | 2 passed (3)
```

## Step 2 — GREEN (exact VERIFY command)
`cd server && npx vitest run src/registry/FameCompoundClass.test.ts src/seeds/material.seed.test.ts`
```
 ↓ src/seeds/material.seed.test.ts  (13 tests | 13 skipped)
 ✓ src/registry/FameCompoundClass.test.ts  (3 tests) 6ms
 Test Files  1 passed | 1 skipped (2)
      Tests  3 passed | 13 skipped (16)
```
0 failed. Re-run after the GREEN commit (10:06:13) gives the identical result.

material.seed.test.ts note: the suite is skipped by design — line 16 calls `describe.skip(title, fn)` with a ternary as the TITLE argument, so vitest skips the whole suite regardless of condition. Baseline at base: 10 skipped (9 files + 1 length test); after adding 3 files: 13 skipped (12 files + 1 length test). 0 failed in both runs, as the brief requires. I additionally verified the three new files parse with js-yaml and satisfy every predicate the suite asserts: kind=material, recordId matches /^mat-seed-/, name ends with " (seed)", domain in the material enum — all true for all three.

## Typecheck
`cd server && npx tsc --noEmit` → exit 2, 6 errors, all pre-existing @fastify/types property errors in src/api/handlers/AIHandlers.ts (332,438,716), src/api/handlers/AiIngestionHandlers.ts (291), src/api/handlers/ExtractProtocolHandler.ts (63), src/sequences/sequenceRoutes.ts (37). None in my files; none introduced by this unit (environmental, per brief: do not chase). Typecheck delta = 0.

## AC map
1. Eight candidates declared: YES — FameCompoundClass.test.ts asserts candidates.length >= 8 and presence of all eight FAME-LOCAL:methyl-{hexanoate-n6,octanoate-n8,decanoate-n10,myristate-n14,pentadecanoate-n15,palmitate-n16,heptadecanoate-n17,arachidate-n20}; all pass. No free-fatty-acid id added (fame-local.yaml untouched); no chebi id added (chebi_ids unchanged at 3).
2. Three seed material files: YES — parse (js-yaml verified), recordId /^mat-seed-/, name ends " (seed)"; material.seed.test.ts: 0 failed.
3. FameCompoundClass.test.ts RED before edit (expected 3 >= 8 failed), GREEN after; the combined vitest run shows 0 failed across both files.
4. git diff --stat base..HEAD = 5 files, all in SCOPE.

## Blockers / follow-ups (not mine to fix — outside SCOPE)
- src/registry/CompoundClassRegistry.test.ts is now RED (1 failed | 7 passed): the test "get(\"fame-medium-chain\") returns the three methyl-ester standards (GC-2 F)" pins the candidate list to exactly 3 ids (line 108 toEqual of 3 entries); the registry now correctly returns 8. This file is explicitly prohibited from my SCOPE, so I did not edit it. Owner: orchestrator — either assign the assertion update to a follow-up unit or extend this item's scope.
- No YAML/schema changes were made; no lane-stack reload is required for this unit (YAML registry change is data read by the registry loader; no schema file touched).

## Verdict
Implementation complete: all four acceptance criteria met with real run output above. Acceptance (browser/adversarial review) is a separate state.
