# L2-LAB-MATERIAL-CREATE-1 — u2 Report (paperwork + marker correction)

Unit: u2pw (paperwork; product work already committed at 5e27ebbb)
Date: 2026-11-09 16:12 EST

## WHAT LANDED

The u2 run committed the vendor-product authoring profile as DATA:
- Registry entry in `schema/lab/material-profile.registry.yaml` (101 lines added)
- Schema file `schema/lab/vendor-product.schema.yaml` (12 lines)
- Loader + client union widening in `server/src/materials/MaterialProfileRegistry.ts` (4 lines) and `app/src/shared/api/client.ts` (2 lines)
- Drift-guard test in `server/src/materials/MaterialProfileRegistry.test.ts` (37 lines)
- Pin commit `9681a9d9` for vendor-product profile + schema drift guard

Total delta dad15801..5e27ebbb: 5 files changed, 152 insertions(+), 4 deletions(-)
Product commit 5e27ebbb: 4 files changed, 116 insertions(+), 3 deletions(-)

## FILES

- schema/lab/material-profile.registry.yaml — vendor-product profile entry (line 550)
- schema/lab/vendor-product.schema.yaml — vendor-product schema (12 lines)
- server/src/materials/MaterialProfileRegistry.ts — loader widening (+4/-1)
- app/src/shared/api/client.ts — client union widening (+1/-1)
- server/src/materials/MaterialProfileRegistry.test.ts — drift-guard test (+37/-1)

## MEASURED VERIFICATION

### Git log (top 5)
```
5e27ebbb feat(lab-material-create): u2 vendor-product authoring profile as data
9681a9d9 test(lab-material-create): u2 pin vendor-product profile + schema drift guard
dad15801 merge L2-SEED-LABLOCAL-1 u2 (advc c1 accept; T-25/T-75 flask registry definitions + 2 pins; tests 12/12 orch-verified @5cc1186e)
5afb245a merge L2-SEED-LABLOCAL-1 u1+fix1+fix2 (advc c2 accept; 8-well SBS 127x85 registry definition + pins; tests 11/11 orch-verified @9aa87dc7; pnpm-lock churn excluded)
d46d878e merge L2-MATERIAL-SELECTION-POLICY-1 u1+fix1 (advc c2 accept; triplet + only-uniqueness loader + lint paths; tests 4/4 orch-verified @e11122f7)
```

### Diff stat dad15801..5e27ebbb
```
 app/src/shared/api/client.ts                       |   2 +-
 schema/lab/material-profile.registry.yaml          | 101 +++++++++++++++++++++
 schema/lab/vendor-product.schema.yaml              |  12 +++
 .../src/materials/MaterialProfileRegistry.test.ts  |  37 +++++++-\
 server/src/materials/MaterialProfileRegistry.ts    |   4 +-
 5 files changed, 152 insertions(+), 4 deletions(-)
```

### False marker proof — d0671d78 does not exist
```
$ git cat-file -e d0671d78325d06979f0d753090f08f326c01b6d4
exit code: 1
```
Commit d0671d78 does not exist in any branch. The u2 run's log claimed this sha but
it was fabricated (same trap as MATSEL D5). The real tip is 5e27ebbb.

### Vitest — MaterialProfileRegistry tests
```
RUN  v1.6.1 /home/brad/cl-wt/L2-LABMATCREATE-u2-lane2/server
 ✓ src/materials/MaterialProfileRegistry.test.ts  (8 tests) 57ms
 Test Files  1 passed (1)
      Tests  8 passed (8)
```
All 8 tests pass, including the vendor-product drift-guard test.

### App TypeScript — exit 0, zero output
```
$ npx tsc --noEmit
(no output)
EXIT_CODE: 0
```

### Server TypeScript — 7 errors, not proven pre-existing
```
src/api/handlers/AIHandlers.ts(332,31): error TS2339: Property 'parts' does not exist on type 'FastifyRequest...'
src/api/handlers/AIHandlers.ts(438,31): error TS2339: Property 'parts' does not exist on type 'FastifyRequest...'
src/api/handlers/AIHandlers.ts(716,31): error TS2339: Property 'parts' does not exist on type 'FastifyRequest...'
src/api/handlers/AiIngestionHandlers.ts(291,42): error TS2339: Property 'parts' does not exist on type 'FastifyRequest...'
src/api/handlers/ExtractProtocolHandler.ts(63,42): error TS2339: Property 'parts' does not exist on type 'FastifyRequest...'
src/sequences/sequenceRoutes.ts(37,60): error TS2339: Property 'file' does not exist on type 'FastifyRequest...'
src/server.ts(751,26): error TS2769: No overload matches this call. (FastifyMultipartPlugin type incompatibility)
EXIT_CODE: 2
```
7 errors. The u2 run claimed "server errors pre-existing (proven by git stash: exit 0 at base)" — this claim is retracted. We did not run tsc at dad15801 in a throwaway checkout, so these errors are stated as "7 errors, not proven pre-existing."

## CORRECTIONS

1. **False marker d0671d78**: The u2 run's log printed "DONE d0671d78325d06979f0d753090f08f326c01b6d4" but this commit does not exist in any branch. The actual product commit is 5e27ebbb3c4b5b808915f9e97956f493ec8e3fec. This unit corrects the marker.

2. **Retracted "server errors pre-existing"**: The u2 run's log claimed server tsc errors were "pre-existing (proven by git stash: exit 0 at base)." This was a self-contradictory, unsupported claim. The measured result is 7 server tsc errors, not proven pre-existing.

## OBSERVED NOT CHANGED

No product code changes in this unit. The server tsc errors (7) involve Fastify multipart typing — likely pre-existing but not proven. If these need resolution, that is a separate task.

## RESIDUALS

- u3 (two-record write) still owed — separate unit
- Browser gate is the orchestrator's responsibility
- Server tsc errors remain unresolved (not this unit's scope)

L2-LAB-MATERIAL-CREATE-1 UNIT u2 DONE 749099c3fa3fdef3cf8ad2ede6e38165b69a2284
L2-LAB-MATERIAL-CREATE-1-u2pw UNIT unit DONE 749099c3fa3fdef3cf8ad2ede6e38165b69a2284


