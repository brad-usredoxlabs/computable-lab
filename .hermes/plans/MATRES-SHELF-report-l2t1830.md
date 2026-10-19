# MATRES-SHELF — coder report (lane 2, l2t1830)

Branch: cl/lane2-matres-shelf1-l2t1830 (off cl/integration-2 @ 7a7e1921)
Worktree: /mnt/vast/home/brad/git/wt/matres-shelf1-lane2
Impl commit: 0ddddd789230fbe668eb8ec183a5e366d40c6705 — `feat(lane2): MATRES-SHELF concept-keyed inventory shelf lookup`
Spec: .hermes/plans/2026-10-19_1835-MATRES-SHELF-concept-keyed-inventory.md

## What was built

Side lookup (NOT a spine adapter), exactly per the spec's shape decision:

- `server/src/resolve/shelfLookup.ts` — `createShelfLookup(store: RecordStore): { queryShelf(term): Promise<ShelfReport> }`.
  Resolution law (NON-lexical-first):
  1. term -> CONCEPTS via the imported tier-1 provider `createRecordProvider(store, ['material'])` (providers/records.ts imported, byte-unchanged).
  2. Join DOWN to recorded material: material-instance via `material_ref` in concept ids OR `vendor_product_ref` -> vendor-product whose `material_ref` in concept ids; material-lot via `material_ref`; aliquot via `parent_material_instance_ref` (surfaced instance) or `source_lot_ref` (surfaced lot).
  3. MISSING LINKS VISIBLE: instances/lots with no resolvable concept join that matched the term lexically (records.ts-style name/title/label/synonyms) surface as `joinedVia: 'unknown-provenance'` with NO vendor/lot claim attached.
  Output `ShelfReport { term, concepts[], groups[] }`; groups keyed by vendor/lot; entries carry recordId, kind, label, level (instance|lot|aliquot), vendor?, lot?, joinedVia (vendor-product | direct-material-ref | parent-instance | source-lot | unknown-provenance). Read-only: `store.list` only.
- `server/src/resolve/shelfLookup.test.ts` — acceptance A-D + no-match shape (5 tests).
- `server/src/api/handlers/InventoryShelfHandlers.ts` — thin GET handler (400 on missing term), factory `createInventoryShelfHandlers(store)`.
- `server/src/api/handlers/InventoryShelfHandlers.test.ts` — acceptance F via the REAL `registerRoutes` path (LabSettingsHandlers.routes.test.ts harness pattern: stub mandatory options, mount the optional handler, `app.inject`).
- `server/src/api/routes.ts` — ONLY edit: `inventoryShelfHandlers?: InventoryShelfHandlers` in RouteOptions + `fastify.get('/inventory/shelf', ...)` registration block (8 added lines, mirrors the materialProfileHandlers optional-handlers pattern at :124/:574).

Handler-file choice (spec: "coder picks, cite"): NEW narrow handler file `InventoryShelfHandlers.ts` rather than adding to MaterialProfileHandlers — the shelf is a store-only lookup with no registry dependency; keeping it separate avoids touching an owned-by-other-work handler file.

Route path: registered as `/inventory/shelf` inside the `/api`-prefixed registration scope (server.ts `fastify.register` with prefix `/api` at :1546), so the shipped surface is `GET /api/inventory/shelf?term=...` as the spec names it.

## RED-first proof

Tests authored first; module absent -> honest RED (raw: /tmp/matres-vitest-red.txt):

```
 ❯ loadAndTransform ../../../computable-lab/node_modules/vite/dist/node/chunks/dep-BK3b2jBa.js:51969:17
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
 Test Files  1 failed (1)
      Tests  no tests
   Start at  19:05:47
   Duration  984ms (transform 68ms, setup 0ms, collect 0ms, tests 0ms, environment 0ms, prepare 59ms)
RED_EXIT=1
```

(First RED at 18:56:44 was identical: `Error: Failed to load url ./shelfLookup.js` for both new files.)

## Acceptance evidence (CODER-CAPTURED)

Targeted run (command: `cd server && npx vitest run src/resolve/shelfLookup.test.ts src/api/handlers/InventoryShelfHandlers.test.ts`; raw: /tmp/matres-targeted-final.txt):

```
 RUN  v1.6.1 /mnt/vast/home/brad/git/wt/matres-shelf1-lane2/server
 ✓ src/resolve/shelfLookup.test.ts  (5 tests) 4ms
 ✓ src/api/handlers/InventoryShelfHandlers.test.ts  (3 tests) 78ms
 Test Files  2 passed (2)
      Tests  8 passed (8)
   Start at  19:05:28
   Duration  2.93s (transform 719ms, setup 0ms, collect 1.26s, tests 82ms, environment 0ms, prepare 216ms)
EXIT=0
```

### A. DMSO fixture (vendor-product join only) surfaces; grouped by vendor/lot
`shelfLookup.test.ts > A` — GREEN. Fixture: concept `mat-seed-dmso-anhydrous` (mirrors records/seed/materials/mat-seed-dmso-anhydrous.yaml, synonyms DMSO); instance `MINST-SIGMA-D8642` payload name "Sigma D8642" with NO 'DMSO' anywhere in its payload, joined ONLY via `vendor_product_ref` -> `VPR-SIGMA-D8642` -> `material_ref`. Asserts: bottle entry `joinedVia='vendor-product'`, `level='instance'`, `vendor='Sigma-Aldrich'`; lot entry `joinedVia='direct-material-ref'`, `lot='SLCM4455'` (vendor_lot); aliquots via `parent-instance` / `source-lot`; unrelated trypsin bottle absent; a `vendor==='Sigma-Aldrich'` group contains the bottle.

### B. Unjoined-but-lexical instance -> unknown-provenance, never silently absent
`shelfLookup.test.ts > B` — GREEN. `MINST-UNJOINED-DMSO` (name contains DMSO, material_ref points at an unrelated concept) surfaces with `joinedVia='unknown-provenance'` and `vendor`/`lot` ABSENT (no provenance claim).

### C. Banned words absent from serialized response (P7)
`shelfLookup.test.ts > C` — GREEN. `JSON.stringify(report)` grepped (case-insensitive) for `available`, `availability`, `reserved`, `sufficient` — none present. (Note: fixture payloads deliberately carry no `status` field; the response shape itself never uses these words.)

### D. Write-spy proves zero mutations
`shelfLookup.test.ts > D` — GREEN. Fixture store's create/update/delete push to `mutationCalls`; after a query `expect(store.mutationCalls).toEqual([])` and `listCalls.length > 0`.

### E. Spine untouched + typecheck baseline 0
```
$ git -c core.fileMode=false diff 7a7e1921...HEAD -- server/src/resolve/ResolveSpine.ts server/src/resolve/providers/ server/src/compiler/resolution/ | wc -l
0
$ npm run typecheck -w server   # head 0ddddd78
(no error lines; grep -cE 'error TS' on raw /tmp/matres-typecheck-head2.txt -> 0)
```
Base typecheck (pre-edit, bootstrapped worktree): 0 error lines (/tmp/matres-typecheck-base.txt). Baseline 0 confirmed and held.

### F. Route test: 200 grouped report; empty-but-shaped for no-match
`InventoryShelfHandlers.test.ts` — GREEN (3 tests): `GET /inventory/shelf?term=DMSO` -> 200 with concepts + grouped entries (Sigma-Aldrich group present); `?term=zzz-no-such-thing` -> 200 with `concepts: []`, `groups: []`; missing term -> 400.

## Full-suite: no NEW failing files

`npm run test:run -w server` serialized on NFS (one run at a time). Base raw: /tmp/matres-vitest-base.txt (started 18:55:01, BEFORE the new test files existed — raw contains zero mentions of shelfLookup/InventoryShelf; collected 772 files). Head raw: /tmp/matres-vitest-head.txt (collected 774 = +2 new files).

BASE (verbatim tail):
```
 Test Files  89 failed | 674 passed | 9 skipped (772)
      Tests  99 failed | 6354 passed | 70 skipped (6700)
     Errors  2 errors
   Start at  18:55:01
   Duration  287.59s (transform 112.70s, setup 350ms, collect 1752.30s, tests 2172.43s, environment 1.54s, prepare 579.97s)
```

HEAD (verbatim tail):
```
 Test Files  89 failed | 676 passed | 9 skipped (774)
      Tests  99 failed | 6362 passed | 70 skipped (6708)
     Errors  2 errors
   Start at  19:00:02
   Duration  293.84s (transform 121.89s, setup 259ms, collect 1782.51s, tests 2239.30s, environment 1.46s, prepare 573.86s)
```

Fail-file set extraction (identical rule on both raws):
`grep -oE '❯[[:space:]]+(src|test)/[^[:space:]]+\.test\.tsx?' <raw> | sed 's/❯[[:space:]]*//' | sort -u`
-> base 89 files, head 89 files. `comm -3 /tmp/matres-base-failfiles.txt /tmp/matres-head-failfiles.txt` -> EMPTY (zero new, zero disappeared). Fail counts identical (89 files / 99 tests / Errors 2 — the 2 unhandled-exception errors are pre-existing trunk debt, identical base->head). The +2 passed files / +8 passed tests are exactly the new suites.

## Ownership compliance

`git -c core.fileMode=false diff --name-only 7a7e1921...HEAD`:
```
server/src/api/handlers/InventoryShelfHandlers.test.ts
server/src/api/handlers/InventoryShelfHandlers.ts
server/src/api/routes.ts
server/src/resolve/shelfLookup.ts
server/src/resolve/shelfLookup.test.ts
```
Created: the 4 new files. Edited: routes.ts only (8 lines). Spine dirs (ResolveSpine.ts, resolve/providers/, compiler/resolution/): 0 diff lines. No schema files, no vocabulary verb, no UI.

## Assumptions

| assumption_id | task | value | where | why_missing |
|---|---|---|---|---|
| AS-SHELF-1 | MATRES-SHELF | Local `KIND_LEVEL` const table (instance/lot/aliquot) | shelfLookup.ts | providers/records.ts's KIND_LEVEL is module-private and the file must stay byte-unchanged; spec §6 explicitly allows a local const recorded as assumption |
| AS-SHELF-2 | MATRES-SHELF | Canonical "Sigma D8642" fixture built in-test | shelfLookup.test.ts / InventoryShelfHandlers.test.ts | No D8642 record exists in the repo (grep over records/ finds only the seed DMSO concept); spec's fixture is a law statement, so the test fixture mirrors the seed concept + schema-verified ref shapes |
| AS-SHELF-3 | MATRES-SHELF | Aliquot vendor/lot inherited from the already-surfaced parent entry | shelfLookup.ts step 5 | Spec names vendor "from vendor-product when joined" but not the aliquot case; inheriting recorded parent data (never inventing) is the minimal data-recording choice |
| AS-SHELF-4 | MATRES-SHELF | Missing `term` query param -> 400 | InventoryShelfHandlers.ts | Spec doesn't define the no-term case; fail-fast chosen over an unanchored full-inventory dump |
| AS-SHELF-5 | MATRES-SHELF | Concept resolution reuses `createRecordProvider(store, ['material'])` | shelfLookup.ts | Spec's minimum viable join set names exactly this reuse ("createRecordProvider(store, ['material'])-style concept hits"); provider imported, not copied |

## Open item for orchestrator (NOT expanded into)

Production mounting: routes.ts now registers the route WHEN `inventoryShelfHandlers` is passed, but server.ts's `routeOpts` construction (server.ts:1546-1650) is outside my ownership boundary (spec: "EDIT ONLY: server/src/api/routes.ts wiring"). A one-line `inventoryShelfHandlers: createInventoryShelfHandlers(ctx.store)` in server.ts is needed for the live server to serve it. I did not add it; flagging for orchestrator sign-off.

## Worktree bootstrap note

Fresh lane-2 worktree lacked node_modules symlinks, server/schema, and 46 lane-excluded untracked server/schema files; repaired per the lane-2 recipe (symlinks to computable-lab node_modules with package-lock sha256 verified identical; `ln -s ../schema server/schema`; cp -a the 46 excluded files). Git status stays clean (all lane-excluded). Baselines captured AFTER repair.
