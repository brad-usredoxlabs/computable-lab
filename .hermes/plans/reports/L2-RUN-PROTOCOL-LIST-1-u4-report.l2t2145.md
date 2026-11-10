# L2-RUN-PROTOCOL-LIST-1 / u4 — detach operation

- Worktree: /home/brad/cl-wt/L2-RUNPROTO-u4-lane2
- Branch: cl/lane2-runproto-u4-l2t2130
- Base: b854c18c6bf60224ad92713c44f24b7c9fa085dd
- Final CODE commit: c6b59791bfbdccab822887dce5a684830eb5ae71
- Status: implementation complete; acceptance (adversarial/browser) not claimed.

## What changed (5 owned files, 198 insertions / 2 deletions)

1. `server/src/protocol/runProtocolList.ts` — new `withDetachedProtocol(payload, protocolId)`:
   filters every `localProtocolRefs` entry whose `refId` equals the target (all duplicates),
   deletes `localProtocolRef` when it names the same id (legacy-singular trap), returns
   `{ ...payload }` unchanged when nothing matches, never mutates input.
2. `server/src/api/handlers/PlannedRunHandlers.ts` — new `detachProtocol` handler:
   404 `PLANNED_RUN_NOT_FOUND` if run absent; 400 `NOT_A_PLANNED_RUN` if kind differs;
   otherwise `store.update` with `Detach protocol from planned-run <id>` and 200
   `{ success: true, protocolRefs: protocolIdsOf(nextPayload) }`. Absent protocol id is a
   200 no-op (never 404).
3. `server/src/api/routes.ts` — `fastify.delete('/runs/:id/protocols/:protocolId', …)` directly
   after the POST attach route, same `if (plannedRunHandlers)` block.
4. `server/src/protocol/runProtocolList.test.ts` — 5 tests: order-preserving removal,
   legacy-singular deletion, empty-list read-back `[]`, duplicate removal, idempotence/no-mutation.
5. `server/src/api/handlers/PlannedRunHandlers.test.ts` — 4 tests: 200 + remaining ids + update
   message, idempotent 200 no-op, 404, 400 (inline envelopes, existing idiom).

Untouched: `withAttachedProtocol`, `protocolRefsOf`, `protocolIdsOf`, attach route/idempotency,
legacy singular read path, `app/**`, `schema/**`, `server/src/types/**`.

## Raw verification

RED (step 1), `npx vitest run src/protocol/runProtocolList.test.ts`:

```
FAIL  src/protocol/runProtocolList.test.ts > withDetachedProtocol — inverse of attach > removes every duplicate entry of the detached id
TypeError: withDetachedProtocol is not a function
...
 Test Files  1 failed (1)
      Tests  5 failed | 9 passed (14)
```

Step 2 module green (`runProtocolList.test.ts` alone): `Tests 14 passed (14)`.

EXIT targeted run (both files):

```
 $ cd server && npx vitest run src/protocol/runProtocolList.test.ts src/api/handlers/PlannedRunHandlers.test.ts
 ✓ src/api/handlers/PlannedRunHandlers.test.ts  (9 tests) 7ms
 ✓ src/protocol/runProtocolList.test.ts  (14 tests) 135ms

 Test Files  2 passed (2)
      Tests  23 passed (23)
```

Baseline was 2 files / 14 tests (9 + 5); exit is 2 files / 23 tests (14 + 9), zero failures.

Typecheck (run once, at handler commit f81abe19; later trims touched only comments/blank lines):

```
 $ cd server && npx tsc --noEmit
 rc=0
 (0 lines of output)
```

Tree at exit:

```
 $ git -c core.fileMode=false status --short
 (empty)
```

Note: `app/node_modules` / `server/node_modules` are dispatch-provided untracked symlinks
(present at base); they were added to the worktree-local `.git/info/exclude` (not a tracked
file) so the tracked tree reports clean. No install was run; both resolve to the live
integration checkout.

## Commits

- 1223d8ab RED detach tests (withDetachedProtocol missing)
- 9b7733e6 withDetachedProtocol in runProtocolList
- f81abe19 detachProtocol handler and DELETE route
- 334b0b52 detachProtocol handler tests
- c6b59791 trim detach comments within line budget (final CODE commit)

## Assumptions

- `localProtocolRefs: []` is schema-valid (run.schema.yaml:139 declares `type: array`, no
  `minItems`), so detaching the last ref persists an empty list rather than deleting the key.
- Detach intentionally does not validate that the protocol record exists — contract is
  idempotent removal by id.

L2-RUN-PROTOCOL-LIST-1-u4 UNIT unit DONE c6b59791bfbdccab822887dce5a684830eb5ae71
L2-RUN-PROTOCOL-LIST-1 UNIT u4 DONE c6b59791bfbdccab822887dce5a684830eb5ae71
