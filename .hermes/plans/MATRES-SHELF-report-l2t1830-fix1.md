# MATRES-SHELF — coder FIX report (lane 2, l2t1830, cycle 1)

Branch: cl/lane2-matres-shelf1-l2t1830 (worktree /mnt/vast/home/brad/git/wt/matres-shelf1-lane2)
Fix commit: 23966e1bc6b25aab4b501bc07ae14316dcbe0fd3 — `fix(lane2): MATRES-SHELF — wire shelf route in server.ts + payload-leak fixture (advc c1)`
Cycle-1 HEAD (fix base): 0d9689f2 (impl 0ddddd78, spec 7a7e1921)
Review: /home/brad/.hermes/cl/lanes/2/reviews/advc-MATRESSHELF-c1-l2t1830.md (VERDICT: fix, 2 defects)
Orch scope: server.ts AMENDED IN SCOPE for exactly the routeOpts wiring (import + construction + routeOpts entry), nothing else.

## Defect 1 (MAJOR) — route never mounted in the live server: FIXED

### The change (server.ts, exactly the three approved lines, pattern cited line-for-line)

The materialProfileHandlers wiring pattern in server.ts, verbatim:
```
:82   createMaterialProfileHandlers,                       (import block)
:856  const materialProfileHandlers = createMaterialProfileHandlers(ctx.materialProfileRegistry, ctx.store);
:1586       materialProfileHandlers,                       (routeOpts literal field)
```
My three lines, following that pattern exactly (construction from ctx.store, field in the routeOpts literal, adjacent to the materialProfileHandlers lines):
```
:90   import { createInventoryShelfHandlers } from './api/handlers/InventoryShelfHandlers.js';
:857    const inventoryShelfHandlers = createInventoryShelfHandlers(ctx.store);
:1587         inventoryShelfHandlers,
```
Note: `createInventoryShelfHandlers(store)` takes ONLY the store (InventoryShelfHandlers.ts:34), so the construction is `createInventoryShelfHandlers(ctx.store)` — the same `ctx.store` argument the materialProfileHandlers line already passes. Import placed as a direct file import (the handler is not re-exported from api/handlers/index.ts; direct-import is the existing pattern for e.g. IngestionAIHandlers/MaterialAIHandlers at server.ts:89-92).

`git -c core.fileMode=false diff 0d9689f2 -- server/src/server.ts` shows exactly 3 added lines, 0 removed (raw: /tmp/matres-fix-serverdiff.txt). Nothing else in server.ts touched.

### PROOF IT SERVED — boot-level test (factory seam EXISTS)

A server-factory test seam exists and is green at base: `initializeApp` + `createServer` boot suites — e.g. src/api/Api.test.ts:150, src/api/IngestionApi.test.ts:24, src/integration/W25DraftLifecyclePromotion.test.ts:67-71 (the green boot-style harness: CONFIG_PATH pinned to a throwaway config, dataDir on local /tmp, REAL schema tree via `schemaDir: '../schema'`). I added a third one:

NEW: `server/src/api/InventoryShelfApi.test.ts` — boots the REAL `initializeApp(process.cwd(), {schemaDir:'../schema', ...})` + `createServer(ctx)` (the same code path startServer runs, including the full routeOpts assembly + registerRoutes), seeds the join legs through the REAL store (Ajv validation + lint fire at the write wall; all 4 creates asserted `success`), then `app.inject` GETs `/api/inventory/shelf?term=DMSO`.

RED-first (before the server.ts wiring landed):
```
$ npx vitest run src/api/InventoryShelfApi.test.ts
AssertionError: expected 404 to be 200   (x3: grouped / P7 / no-match)
 Test Files  1 failed (1)
      Tests  3 failed (3)
EXIT=1        (raw: /tmp/matres-fix-boot-red.txt)
```
404 = exactly the Defect 1 failure mode (registered in routes.ts, unmounted by routeOpts). After the three server.ts lines:
```
 ✓ src/api/InventoryShelfApi.test.ts  (3 tests) 15987ms
 Test Files  3 passed (3)
      Tests  11 passed (11)      (with shelfLookup 5 + handlers 3)
EXIT=0        (raw: /tmp/matres-fix-targeted-green.txt)
```
The boot test asserts 200 + grouped shape (concepts contain the fixture concept; bottle entry `joinedVia='vendor-product'`, `vendor='Sigma-Aldrich'`; lot entry `joinedVia='direct-material-ref'`, `lot='SLCM4455'`; a Sigma-Aldrich group exists), no-match term -> 200 `concepts:[] groups:[]`, and the P7 grep on the HTTP payload (below).

Fixture note (assumption AS-SHELF-6): the repo's DMSO seed lives under the PLURAL `records/seed/materials/`, which the store does NOT auto-merge — `RecordStoreImpl.list` merges `join(seedDir, filter.kind)` with the SINGULAR kind (`RecordStoreImpl.ts:524-525`), and `protocols/seedProtocols.ts:5-7` documents that only singular seed dirs auto-merge. First run proved this live (concepts came back `[]`); the boot fixture therefore creates its own concept `MAT-SHELF-DMSO-BOOT` through the real store.

## Defect 2 (MINOR) — AC-C fixture could not catch the payload-passthrough leak: FIXED

Schema-real enum values (read from the schemas, not invented):
- `schema/lab/material-instance.schema.yaml:86-88` — `status: enum [ available, reserved, consumed, expired, discarded ]`
- `schema/lab/material-lot.schema.yaml:64-66` — same enum

Fixture change in `server/src/resolve/shelfLookup.test.ts` (fixtureRecords):
- `MINST-SIGMA-D8642` payload now carries `status: 'available'` (:121)
- `LOT-DMSO-20260217` payload now carries `status: 'reserved'` (:135)
Test C's no-leak assertion is unchanged (serialized JSON grepped for available/availability/reserved/sufficient). The boot test seeds the same bait through the real store and greps the HTTP payload (InventoryShelfApi.test.ts:119, :135 + P7 test).

Strength proof (mutation probe, throwaway, reverted clean):
```
$ cp server/src/resolve/shelfLookup.ts /tmp/shelfLookup.orig.ts
$ patch: makeEntry return `{ ...(payload as object), recordId: ... }`  (payload passthrough mutant)
$ npx vitest run src/resolve/shelfLookup.test.ts
 ❯ ... > C: serialized report contains none of the banned words (P7 recorded-material law)
 Test Files  1 failed (1)
      Tests  1 failed | 4 passed (5)
MUT_EXIT=1    (raw: /tmp/matres-fix-mutation.txt)
$ cp /tmp/shelfLookup.orig.ts back -> git diff empty (REVERTED)
```
The AC-C test now FAILS against a payload-passthrough implementation — the exact leak vector the reviewer said it could not catch. Production code unchanged (field whitelist intact); the bait lives only in fixtures.

## VERIFY (real command output)

Targeted (task-specified):
```
$ cd server && npx vitest run src/resolve/shelfLookup.test.ts src/api/handlers/InventoryShelfHandlers.test.ts src/api/InventoryShelfApi.test.ts
 Test Files  3 passed (3)
      Tests  11 passed (11)
EXIT=0
```
Typecheck:
```
$ npm run typecheck -w server
> tsc --noEmit
EXIT=0; grep -c "error TS" -> 0   (raw: /tmp/matres-fix-typecheck.txt)
```

Full suite (`npm run test:run -w server`, serialized on NFS) — fail-file set analysis:

| run | HEAD | files collected | failed files | comm vs base report |
|---|---|---|---|---|
| base report (cycle 1) | 0d9689f2-era | 772 | 89 | (pin) |
| fix run1 | 23966e1b | 775 | 90 | Qms6b out; W25+seqRoutes in |
| fix run2 | 23966e1b | 775 | 91 | Qms6b+W25+seqRoutes in |
| fix run3 | 23966e1b | 775 | 89 | Qms6b out; W25 in |
| baserevert (fix code, boot test held out) | 23966e1b | 774 | 90 | W25 in; FoundryCoderPatch in |
| BASE CONTROL (no fix at all) | 0d9689f2 detached | 774 | 90 | W25 in; Wave2SemanticPassE2E in; Qms6b out |

The comm is NOT literally empty run-to-run, and the honest reading is: the differing files are load-timeout flaps, proven three ways:
1. ISOLATION PROBE — all three run1-comm files pass alone at fix HEAD:
   Qms6bSchemaDrift 4/4, sequenceRoutes 4/4, W25DraftLifecyclePromotion 5/5, EXIT=0 each (raw: /tmp/matres-fix-isolation.txt).
2. BASE CONTROL — at 0d9689f2 with NO fix, the same files flap anyway: W25 fails, Wave2SemanticPassE2E fails, Qms6b drops out (raw: /tmp/matres-fix-vitest-basecontrol.txt). The flap distribution exists without my change; the base report's 89-file set is itself one sample of it.
3. FAILURE FORMS are timeout signatures, not assertion regressions: W25 (e) `Test timed out in 10000ms` (NFS embedded-git commits; passes 5/5 in isolation), sequenceRoutes ai-read `Test timed out in 10000ms`, Qms6b suite-load `[ file ]` form identical to its base form.
Zero shelf files in ANY fix-run fail set (grep count 0 in all four head raws); run3 shows all three shelf suites green:
```
 ✓ src/resolve/shelfLookup.test.ts  (5 tests) 24ms
 ✓ src/api/handlers/InventoryShelfHandlers.test.ts  (3 tests) 528ms
 ✓ src/api/InventoryShelfApi.test.ts  (3 tests) 84302ms
```
`Errors 2` constant across every run (pre-existing AgentOrchestrator.goldenWithSeeds unhandled-rejection debt, identical text in base and fix raws).

## Ownership compliance

`git -c core.fileMode=false diff --name-only 0d9689f2...23966e1b`:
```
server/src/api/InventoryShelfApi.test.ts   (NEW — boot proof)
server/src/resolve/shelfLookup.test.ts     (fixture bait only)
server/src/server.ts                       (3 lines — orch-approved scope)
```
Spine dirs / schema/ / UI: zero diff. server.ts: exactly import + construction + routeOpts field, adjacent to the materialProfileHandlers pattern lines.

## Assumptions (updated list)

| id | value | where | why |
|---|---|---|---|
| AS-SHELF-1..5 | unchanged from cycle-1 report | — | — |
| AS-SHELF-6 | Boot fixture creates its own concept `MAT-SHELF-DMSO-BOOT` instead of relying on the repo seed | InventoryShelfApi.test.ts | `records/seed/materials` is PLURAL and not auto-merged by the store (RecordStoreImpl.ts:524-525 merges `seedDir + filter.kind` singular; seedProtocols.ts:5-7 documents the rule). Proven live by the first RED run (concepts []). |
| AS-SHELF-7 | Full-suite fail-set drift is NFS load-timeout flapping, not fix-caused | full-suite section | Proven by isolation probe (all comm files green alone), base control at 0d9689f2 (same files flap with no fix), and timeout failure forms. |

## Raw artifacts
- /tmp/matres-fix-boot-red.txt (RED 404 x3)
- /tmp/matres-fix-targeted-green.txt (11/11 green)
- /tmp/matres-fix-mutation.txt (AC-C mutant RED)
- /tmp/matres-fix-typecheck.txt (0 errors)
- /tmp/matres-fix-vitest-head.txt / head2 / head3 / baserevert / basecontrol.txt + matching *-failfiles.txt
- /tmp/matres-fix-isolation.txt (3/3 green alone)
