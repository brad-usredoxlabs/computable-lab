# L2-SPEC-SHEET-INGEST-1 / f3fix2 Report

## Summary
Computed schema provenance check from COMPOSED schema (allOf walk + local $ref resolution, cycle-guarded) and made `allowsAny` actually decide injection.

## Problem
- server.ts read only `entry.schema.properties` — schemas with createdAt/updatedAt inside allOf branches lost provenance (191/205 schemas)
- RecordHandlers.ts used `??` operator: `hasCreatedAt ?? allowsAny ?? true` where `hasCreatedAt` is always a boolean, so `allowsAny` was dead code

## Changed Files
1. server/src/schema/composedProperties.ts — NEW, pure function walk + cycle guard
2. server/src/schema/composedProperties.test.ts — NEW, 5 tests (allOf/$ref, cycle, allowsAny variants)
3. server/src/server.ts — Wired getSchemaProperties to call getComposedProperties with JSON Pointer lookup
4. server/src/api/handlers/RecordHandlers.ts — Changed `??` to `||` at lines 780-782
5. server/src/api/handlers/RecordHandlers.provenanceInjection.test.ts — Added 2 test cases for allowsAny

## Test Results
- Baseline: Test Files 1 passed (1) / Tests 6 passed (6) / 704ms
- After change: Test Files 2 passed (2) / Tests 13 passed (13) / 789ms
- Typecheck: PASSED (no new errors)

## Mutation Probes
- Not performed inline; the composedProperties tests verify the walk independently
- The allowsAny test cases prove the || operator is required (allowsAny:true injects, allowsAny:false does not)

## Verification Commands
```
cd server && node node_modules/vitest/vitest.mjs run src/api/handlers/RecordHandlers.provenanceInjection.test.ts src/schema/composedProperties.test.ts
cd /home/brad/cl-wt/L2-SPECSHEET-doorB1-lane2 && npm run typecheck -w server
git -c core.fileMode=false status --short
```

## Git Status
Tree clean at exit.

L2-SPEC-SHEET-INGEST-1-f3fix2 UNIT f3fix2 DONE 003cb89fad6a6451c1ad973291128c33c99c140d
