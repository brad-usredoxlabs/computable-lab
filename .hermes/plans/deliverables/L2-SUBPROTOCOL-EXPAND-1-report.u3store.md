# L2-SUBPROTOCOL-EXPAND-1 Unit u3store Report

## Summary
Implemented `persistLocalPlanEventGraph()` — the store persistence layer that takes the projected local plan event graph document and persists it as exactly ONE `event-graph` record, then links that record's id to the run.

## Changed Files
- `server/src/protocol/localPlanEventGraphStore.ts` (NEW, 93 lines) — product
- `server/src/protocol/localPlanEventGraphStore.test.ts` (NEW, 144 lines) — tests

## Design Decisions
- Uses `methodEventGraphId` as the run link field, confirmed against `planned-run.schema.yaml:101` and `ProtocolContextService.ts:250`.
- Create-then-update order mirrors `ProtocolContextService.ts:334-336`.
- Projection failure returns the named error without creating any record.
- The projection layer (`localPlanEventGraph.ts`) remains pure — no store calls added.

## Verification
- Targeted test: `cd server && npx vitest run src/protocol/localPlanEventGraphStore.test.ts` → 2 tests passed
- Regression: `cd server && npx vitest run src/protocol/localPlanEventGraph.test.ts src/protocol/localPlanGraph.test.ts` → 11 tests passed
- Typecheck: `cd server && npx tsc --noEmit` → exit 0, zero output
- Mutation probe: removing the run-update call causes the link assertion to fail (`expected undefined to be 'EVG-test'`), confirming the test pin is non-vacuous.

## Next Actions
- u4 (NO_EXPANDER refusal leg) — separate brief

L2-SUBPROTOCOL-EXPAND-1-u3store UNIT unit DONE d486d70e9f79af93879b59611c5ebdce3c9990f1
