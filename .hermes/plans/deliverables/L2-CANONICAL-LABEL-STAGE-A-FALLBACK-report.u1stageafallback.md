# L2-CANONICAL-LABEL-STAGE-A-FALLBACK — Unit 1 Report (server leg)
<!-- L2-CANONICAL-LABEL-STAGE-A-FALLBACK-u1stageafallback -->

## Changes
- server/src/ai/shorthandChat.ts: Added name-keyed fallback in canonicalLabelsForFacts (~47 lines, +1 import)
- server/src/ai/shorthandChat.canonicalLabelFallback.test.ts: NEW — 8 tests covering AC-1/2/4/5/6

## Decisions
- Fallback sits after PASS 2 (id GETs), only fires when unresolved keys exist
- Uses store.list with MATERIAL_SCHEMA_ID (imported from MaterialGrounding.js), limit 10000 — mirroring VocabHandlers.ts:124-131
- Guarded with typeof check for store.list and wrapped in try/catch
- Cost model: ONE list per call, ZERO when every id hit

## Verification
### Tests (raw output)
```
Test Files  3 passed (3)
Tests  28 passed (28)
```
Baseline preserved: sameNounDedupe = 9 tests, VocabHandlers.mint = 11 tests. New file = 8 tests.

### Mutation proof
With the fallback disabled (replaced with comment-only): 5 of 8 tests failed (AC-1, AC-5, AC-6 legs).
With the fallback restored: all 8 tests pass.

### Typecheck
0 new error TS lines (only pre-existing S3 module error unrelated to this change)

### AC-8 (live read-only proof)
- API GET 3093: payload.name = '1 mM Clofibrate in DMSO' (verified via python3 json.loads)
- App 5193: 200
- Record file in main checkout: sha256=ad9797f6..., stat=364 bytes, unchanged

### git status
Clean tree. Exactly 2 files changed. API diff stat: empty.

## Commits
1. u1stageafallback: RED test for canonical-label name-keyed fallback (AC-1/2/4/5/6)
2. u1stageafallback: STAGE A name-keyed fallback in canonicalLabelsForFacts

L2-CANONICAL-LABEL-STAGE-A-FALLBACK-u1stageafallback UNIT 1 DONE fe4eed29c0896d4a72fbd82992b7ea76c830b260
