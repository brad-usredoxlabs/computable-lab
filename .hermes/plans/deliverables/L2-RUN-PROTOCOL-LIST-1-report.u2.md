L2-RUN-PROTOCOL-LIST-1 u2 Report
================================

STATUS: complete

## Summary
Implemented ordered protocol list on the planned-run write path. The draft creator now accepts and persists an ordered array of local-protocol refs alongside the legacy singular ref.

## Files Changed
- `schema/workflow/planned-run.schema.yaml` — added `localProtocolRefs` property (ordered array of refs)
- `server/src/protocol/PlannedRunFromLocalProtocolService.ts` — widened signature to accept `string | string[]`, validates every id, de-duplicates, writes `localProtocolRefs` array, writes singular `localProtocolRef` only when list has length 1
- `server/src/api/handlers/PlannedRunHandlers.ts` — accepts optional `protocolRefs?: string[]` in body, passes through to service
- `server/src/protocol/PlannedRunFromLocalProtocolService.test.ts` — added 5 new tests + helper functions

## RED/GREEN Summaries
- Baseline: 7 passed (7)
- RED tests added: 5 new tests (two protocol refs, dedup, single array, 404 with id, 400 with id/kind)
- Post-implementation: 12 passed (12)

## Mutation Probe
- Mutation: commented out `localProtocolRefs: refEntries` line in the envelope builder
- RED summary: 12 tests, 3 failed (two protocol refs, dedup, single array) — all asserting `localProtocolRefs` is defined, 9 passed
- Restored: 12 passed (12)
- GREEN summary: 12 passed (12)

## Verification Commands and Results
1. `cd server && npx vitest run src/protocol/PlannedRunFromLocalProtocolService.test.ts` → 12 passed (12)
2. `cd server && npx vitest run src/protocol/runProtocolList.test.ts` → 9 passed (9)
3. `npx tsc -p server/tsconfig.json --noEmit` → exit 0, zero diagnostics
4. `git -c core.fileMode=false status --short` → clean tree (only app/node_modules untracked, ignored)

## Assumptions
- Error messages for 404/400 now name the specific id (e.g., "local-protocol not found: LPR-nonexistent") — updated the existing test expectation accordingly.
- The `sourceRef` still points at the first/lead protocol's ref entry with its revisionRef.
- Links are merged from all protocols in the list, with options overriding.

L2-RUNPROTO-u2 UNIT unit DONE 2f22ee371e189fa95d9bc08d2f1205ec4902bb63
