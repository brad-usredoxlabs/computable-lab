# L2-JOURNEY-CHECKPOINT-1 — cpd1fix (adversarial D1, one seam)

Worktree: /home/brad/cl-wt/L2-CHECKPOINT-cpd1fix-lane2
Branch: cl/lane2-journey-checkpoint1-cpd1fix-1110
Base: 807329d27ecf2e4e829e1d8c2714120efb64d94f
Tier: consequential (behaviour fix on the resume path; pre-merge)

## Defect (D1, adversarial review l2t1876)
POST /ai/threads/protocols/checkpoints/CP-GHOST/delta on a thread holding cp-1 returned
200 {"delta_id":"delta-1","checkpoint_id":"CP-GHOST"}. The store's attachDelta only checked
that SOME document existed; it never compared the document's checkpoint_id to the path id, so
the handler echoed an unverified id.

## Fix (2 product files, 1 test file touched for the signature)
- server/src/ai-threads/PendingIntentStore.ts
  - `attachDelta(delta: unknown)` -> `attachDelta(checkpointId: string, delta: unknown)`.
  - Existence check replaced with the resume()/load() idiom:
    `const doc = await this.readDocument(); if (doc === null || doc.checkpoint_id !== checkpointId) return { ok: false, diagnostics: [DIAG_NOT_FOUND] };`
  - Order preserved exactly: contract validation -> injection-refused -> existence/id check.
    Reuses the existing DIAG_NOT_FOUND (`checkpoint-not-found`); no new diagnostic or code.
  - Doc comment updated to state the id must match.
- server/src/api/handlers/PendingIntentHandlers.ts
  - `store.attachDelta(checkpointId, request.body)`.
  - New branch after the 422/400 mapping: `checkpoint-not-found` => 404
    `{ error: 'checkpoint-not-found', reason: 'no checkpoint document matches this checkpoint id for this thread' }`.
  - 200 line unchanged: `{ delta_id, checkpoint_id: checkpointId }` — now a store-confirmed id.
- server/src/ai-threads/PendingIntentStore.test.ts
  - Two pre-existing call sites updated to the new signature (assertions untouched).
  - New ghost-id test added.

Not touched: routes.ts, checkpointContract.ts, schema/**, app/**, any other file.

## RED (commit 0b576a72) — new tests fail before the fix
```
$ timeout 180 npx vitest run src/ai-threads/PendingIntentStore.test.ts src/api/handlers/PendingIntentHandlers.test.ts
 FAIL  src/ai-threads/PendingIntentStore.test.ts > ... > attachDelta refuses a path id that does not match the stored checkpoint ...
AssertionError: expected false to be true
 ❯ src/ai-threads/PendingIntentStore.test.ts:131:93
 FAIL  src/api/handlers/PendingIntentHandlers.test.ts > ... > a delta whose path checkpoint id does not match the stored checkpoint => 404 ...
AssertionError: expected 200 to be 404 // Object.is equality
 ❯ src/api/handlers/PendingIntentHandlers.test.ts:128:30
 Test Files  2 failed (2)
      Tests  2 failed | 13 passed (15)
```

## GREEN (commit 2dabb0f6)
```
$ timeout 180 npx vitest run src/ai-threads/PendingIntentStore.test.ts src/api/handlers/PendingIntentHandlers.test.ts
 ✓ src/api/handlers/PendingIntentHandlers.test.ts  (7 tests) 66ms
 ✓ src/ai-threads/PendingIntentStore.test.ts  (8 tests) 74ms
 Test Files  2 passed (2)
      Tests  15 passed (15)

$ timeout 240 npx tsc --noEmit
TSC_RC=0
```

## Acceptance
1. Ghost path id => 404 `checkpoint-not-found`, no 200, no echoed ghost id — covered by the new
   handler test (asserts 404, error code, and that the body does not contain 'CP-GHOST').
2. Correct id + valid plain delta => 200 with delta_id and the confirmed checkpoint_id — covered
   in the same handler test and the store test.
3. injection-refused => 422 and contract-invalid => 400 unchanged; their tests untouched and green.
4. Targeted vitest 15/15 green; tsc rc=0.

## Diff size
3 files changed, 11 insertions(+), 7 deletions(-) in the fix commit; 2 test files in the RED commit.
Within the 4-file / 70-line budget.

## Commits
- 0b576a72 RED tests
- 2dabb0f6 store+handler fix (GREEN, tsc rc=0)
- report commit: see marker below

L2-JOURNEY-CHECKPOINT-1 UNIT unit DONE ca64377ab7a7e7f73f40a8b41fdaba6e756c4355


---

> **SUPERSEDED CODE (architect, 2026-11-13).** This unit re-implemented checkpoint binding with
> `attachDelta(checkpointId, delta)`; the trunk already has the same behaviour from `d1bind`
> (`fb8f6b61`, `4a0fbd61`) as `attachDelta(delta, checkpointId)` — same single read, same
> `checkpoint_id` identity check, same 404 mapping in the delta route (`PendingIntentHandlers.ts:129-132`),
> plus a `checkpointId` field in the success arm that this branch lacks. The trunk is canonical; this
> branch's code and tests were NOT merged. Report retained for the audit trail.
> Resolution: lanes/2/decisions/2026-11-13-MERGE-RESOLUTION-checkpoint-cpd1.md
