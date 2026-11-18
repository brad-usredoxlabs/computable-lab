# L2-LAB-INVENTORY-CREATE-1 / g3d2display — Report

Unit: g3d2display (Lane 2) — gate g3 defect D2: lexical law ignores display_name
Branch: cl/lane2-labinv-g3d2display-2125
Base: b8f291edeb951798821124ca4be5f5563e656d11 (verified via `git rev-parse HEAD` at run start)
Worktree: /home/brad/cl-wt/L2-LABINV-g3d2display-lane2

## Intent
Teach the tier-1 record lexical law (server/src/resolve/providers/records.ts) to match
`display_name` and to use it as the label fallback, so a labware-definition record — which
carries ONLY `display_name` (no name/title/label) — resolves as a shelf/spine concept hit
with the human label instead of being invisible.

## Changed files (2, diff vs base = exactly these; scope = the two owned files)
- server/src/resolve/providers/records.ts  (+5 / -2)
  - matchableStrings key tuple : `['name', 'title', 'label', 'display_name']`
    (display_name added AFTER name/title/label; same string/empty guard; synonyms loop untouched)
  - label fallback : `payload.name ?? payload.title ?? payload.label ?? payload.display_name ?? record.recordId`
    (display_name after label, before recordId; terminal `?? record.recordId` preserved so
    label is always a string — exactOptionalPropertyTypes-safe)
  - comment naming display_name as the served labware-definition field
- server/src/resolve/providers/records.test.ts  (+62)
  - 3 new RED/GREEN legs (describe "g3 D2: display_name-only definition is matchable"),
    fixture shaped on the SHIPPED shape: payload with display_name and NO name/title/label
    (mirrors records/seed/labware-definition/ field-for-field)
  - leg 1: 'microfuge' against the shipped display_name-only definition → 1 concept hit,
    label = 'Generic 1.5 mL Microfuge Tube' (not the recordId)
  - leg 2: name-bearing definition (name + display_name) → label stays 'name' (precedence,
    not replacement — guards the shelfLookup.test.ts:305-306 fixture expectation)
  - leg 3: non-string display_name (42) → skipped, 0 hits (same guard as today)

Line budget: 2 files, 67 insertions + 2 deletions (<= 80 lines).

## Environment repairs (local only, untracked/ignored — NOT in the diff)
The worktree came with two dangling/missing symlinks that made vitest unrunnable; repaired
in place, both paths are git-ignored (git status stays clean):
- server/node_modules: was -> /mnt/vast/home/brad/git/cl-integration-2/app/node_modules
  (contains only .vite dirs; no yaml/vitest packages) → repointed to
  /mnt/vast/home/brad/git/cl-integration-2/server/node_modules (real server deps).
- server/schema: was -> ../../schema (resolves OUTSIDE the worktree to a non-existent
  /home/brad/cl-wt/schema) → repointed to ../schema (worktree's own schema/).
  Without this, the pre-existing ELIG leg ('the ELIG envelope derives candidate.referentLevel
  vendor-product') fails at base with "material-eligibility data file not found" — measured at
  base via git stash (1 failed | 5 passed) — i.e. a pre-existing environment failure, not a
  regression; after the repair it passes.

## Raw baseline (recorded FIRST-HAND at base, before any change)
$ cd server && grep -n "for (const key of" src/resolve/providers/records.ts
36:  for (const key of ['name', 'title', 'label'] as const) {
(key tuple WITHOUT display_name)
$ cd server && grep -n "const label = String" src/resolve/providers/records.ts
88:        const label = String(payload.name ?? payload.title ?? payload.label ?? record.recordId);
Shipped shape verified: grep -c "^name:" records/seed/labware-definition/*.yaml = 0 for all 39 files.

## RED (committed BEFORE the fix; commit 2cdb2e7cbf13e833892440b254cd06f416229837)
$ cd server && npx vitest run src/resolve/providers/records.test.ts

 RUN  v1.6.1 /home/brad/cl-wt/L2-LABINV-g3d2display-lane2/server

 ❯ src/resolve/providers/records.test.ts  (9 tests | 2 failed) 92ms
   ❯ ... > a display_name-only labware-definition resolves as a concept hit labeled from display_name (not the recordId)
     → expected +0 to be 1 // Object.is equality
   ❯ ... > display_name extends the match set after name/title/label: a name-bearing definition keeps labelling from name
     → expected +0 to be 1 // Object.is equality

 FAIL ... > a display_name-only labware-definition resolves as a concept hit labeled from display_name (not the recordId)
AssertionError: expected +0 to be 1 // Object.is equality
 ❯ src/resolve/providers/records.test.ts:253:25
    253|     expect(hits.length).toBe(1);
       |                         ^
 (concept list does NOT contain the definition — the D2 behaviour, shaped on the SHIPPED shape)

 FAIL ... > display_name extends the match set after name/title/label ...
AssertionError: expected +0 to be 1 // Object.is equality
 ❯ src/resolve/providers/records.test.ts:272:25
    272|     expect(hits.length).toBe(1);
       |                         ^

 Test Files  1 failed (1)
      Tests  2 failed | 7 passed (9)
(The 2 new legs FAIL; all 7 pre-existing legs pass — the non-string guard leg passes at RED
because a non-string was already skipped today.)

## GREEN (after the fix; commit 7a414036d85354a7eecccc74078937d7e533eee1)
$ cd server && npx vitest run src/resolve/providers/records.test.ts src/resolve/shelfLookup.test.ts

 RUN  v1.6.1 /home/brad/cl-wt/L2-LABINV-g3d2display-lane2/server

 ✓ src/resolve/shelfLookup.test.ts  (11 tests) 12ms
 ✓ src/resolve/providers/records.test.ts  (9 tests) 88ms

 Test Files  2 passed (2)
      Tests  20 passed (20)
(shelfLookup.test.ts 11/11 green → AC3 no regression, incl. the :305-306 name+display_name
fixture still labelling from `name`; records.test.ts 9/9.)

## Typecheck
$ cd /home/brad/cl-wt/L2-LABINV-g3d2display-lane2 && ./server/node_modules/.bin/tsc --noEmit -p server
(exit 0, zero output = 0 errors)
Note: run via the server's local tsc (root has no node_modules; `npx tsc` from root resolves a
stub). Sanity: --listFilesOnly reports 1968 files incl. src/resolve/providers/records.ts, so the
check processed the project.

## Mutation probe (after green)
Temporarily removed 'display_name' from the tuple (label fallback left in place):
$ cd server && npx vitest run src/resolve/providers/records.test.ts
 ❯ src/resolve/providers/records.test.ts  (9 tests | 2 failed) 97ms
   ❯ ... > a display_name-only labware-definition resolves as a concept hit labeled from display_name (not the recordId)
     → expected +0 to be 1 // Object.is equality
   ❯ ... > display_name extends the match set after name/title/label ...
     → expected +0 to be 1 // Object.is equality
 Test Files  1 failed (1)
      Tests  2 failed | 7 passed (9)
(leg 1 fails: display_name-only definition invisible again; leg 2 fails: 'deep well' no longer
matches. The new legs DO pin the tuple change.)
Restored from HEAD (git checkout HEAD -- server/src/resolve/providers/records.ts) and re-ran:
$ cd server && npx vitest run src/resolve/providers/records.test.ts
 ✓ src/resolve/providers/records.test.ts  (9 tests) 93ms
 Test Files  1 passed (1)
      Tests  9 passed (9)
Tree clean after restore (git status --porcelain empty).

## Commits (on cl/lane2-labinv-g3d2display-2125, from base b8f291ed)
- 2cdb2e7cbf13e833892440b254cd06f416229837 test(resolve): g3 D2 RED — display_name-only definition is invisible to the lexical law
- 7a414036d85354a7eecccc74078937d7e533eee1 fix(resolve): match display_name in the record lexical law + label fallback
- 5a06c07979b76ece954e47b27e2ba1cf53074daa docs(plan): L2-LAB-INVENTORY-CREATE-1 g3d2display report + DONE marker (contains this file)
- follow-up marker-correction commit (names 5a06c079, the report commit, in the exit marker)

## Acceptance contract status
1. PASS — provider leg for the shipped shape: substring 'microfuge' → concept hit
   local:lbw-def-generic-1-5ml-microfuge-tube, label 'Generic 1.5 mL Microfuge Tube'.
   (AC2's shelf join via joinedVia:'labware-definition' is the existing shelfLookup leg 6
   consumed over labwareDefIds built from these provider hits; shelfLookup 11/11 green.)
2. PASS — see 1 + shelfLookup.test.ts labware-definition join legs green.
3. PASS — records.test.ts 9/9, shelfLookup.test.ts 11/11 (20/20).
4. PASS — diff touches only the two owned files (git diff b8f291ed --stat: 2 files, +67/-2).

## Verification commands (reproducible)
  cd /home/brad/cl-wt/L2-LABINV-g3d2display-lane2/server
  npx vitest run src/resolve/providers/records.test.ts src/resolve/shelfLookup.test.ts
  cd .. && ./server/node_modules/.bin/tsc --noEmit -p server
  git diff b8f291edeb951798821124ca4be5f5563e656d11 --stat

## Marker
All marker lines below name the SAME sha: 5a06c07979b76ece954e47b27e2ba1cf53074daa — the
report commit (docs(plan): L2-LAB-INVENTORY-CREATE-1 g3d2display report + DONE marker),
which contains this file AND the fix commit 7a414036d85354a7eecccc74078937d7e533eee1
(fix(resolve): match display_name in the record lexical law + label fallback).
Verifiable in-branch: git cat-file -e 5a06c07979b76ece954e47b27e2ba1cf53074daa:reports/L2-LAB-INVENTORY-CREATE-1-g3d2display-report.md (rc 0)
and git merge-base --is-ancestor 5a06c07979b76ece954e47b27e2ba1cf53074daa HEAD (rc 0).
The `UNIT unit` line is the launcher's literal template line, kept verbatim; the
`UNIT g3d2display` lines name this item's unit token.

L2-LAB-INVENTORY-CREATE-1-g3d2display UNIT DONE 5a06c07979b76ece954e47b27e2ba1cf53074daa
L2-LAB-INVENTORY-CREATE-1-g3d2display UNIT g3d2display DONE 5a06c07979b76ece954e47b27e2ba1cf53074daa
L2-LABINV-g3d2display UNIT g3d2display DONE 5a06c07979b76ece954e47b27e2ba1cf53074daa
L2-LABINV-g3d2display UNIT unit DONE 5a06c07979b76ece954e47b27e2ba1cf53074daa
