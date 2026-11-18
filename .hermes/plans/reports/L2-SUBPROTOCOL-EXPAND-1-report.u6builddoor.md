# L2-SUBPROTOCOL-EXPAND-1 Report — u6builddoorfix2

## fix2

**Problem:** `apiClient.buildPlanGraph` POSTed to `/runs/:id/bindings` instead of `/runs/:id/plan-graph`.

**Fix:** Changed route string in `app/src/shared/api/client.ts` line 5640 from `/bindings` to `/plan-graph`.

**Verification:**
- RED baseline: 1 failed | 8 passed (9 total) — route pin test failed
- GREEN after fix: 0 failed | 9 passed (9 total) — all tests pass

**Changed files:** 1 (app/src/shared/api/client.ts)
**Lines changed:** 1

L2-SUBPROTOCOL-EXPAND-1-u6builddoorfix2 UNIT unit DONE ebe10fcaf28567394ff60c8b38589a0a6d014ae4
