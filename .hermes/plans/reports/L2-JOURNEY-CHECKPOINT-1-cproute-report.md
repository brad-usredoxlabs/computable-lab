# L2-JOURNEY-CHECKPOINT-1 — unit cproute (3 of 5, RE-CUT under RESCOPE)

Unit: `L2-JOURNEY-CHECKPOINT-1 UNIT cproute` — the HTTP surface over the pending-intent
checkpoint store. Owner: cl-coder lane 2. Written 2026-11-13 (~05:00 EST) from the worktree
`/home/brad/cl-wt/L2-JOURNEY-CHECKPOINT-1-cproute-lane2`, branch `cl/lane2-journey-checkpoint1-cproute-0323`.

## Base decision (dispatch note honored)
- Brief `base:` line is unit-1's tip `29be43e5` (a FLOOR). This tree was created at that tip and
  STEP 0 confirmed `PendingIntentStore.ts` ABSENT there. Per the DISPATCH NOTE the tree must branch
  from the cpschema2 CONTINUATION TIP, so I fast-forwarded:
  `git merge --ff-only 7d8038ef9eb30659368e6b902f419460a83f3e5e` (verified ancestor of the tip).
  Unit-2's `PendingIntentStore.ts` is committed at that tip (commits 97172767 + a35961e6).
- Environment restoration (no code effect): `server/node_modules` was absent in the fresh worktree —
  copied from the cpschema2 tree after verifying `package-lock.json` is byte-identical (deterministic);
  the untracked `server/schema -> ../schema` symlink (gitignored, `.gitignore:52`) was recreated —
  without it the threadScoped suite cannot collect. Both are untracked/gitignored; they do not appear
  in any diff or commit of this unit.

## STEP 0 (measured this run)
- `git log --oneline -3` at entry: tip was `29be43e5` (unit-1) — store absent (see above), then ff to
  `7d8038ef`.
- `ls server/src/ai-threads/PendingIntentStore.ts` → present (unit 2 live).
- `cd server && npx vitest run src/compiler/journey/checkpointContract.test.ts` → `7 passed` (matches brief).

## Changed files (exactly four; committed in 4eb2471e)
```
server/src/api/handlers/PendingIntentHandlers.ts      NEW   136 lines
server/src/api/handlers/PendingIntentHandlers.test.ts NEW   139 lines
server/src/api/routes.ts                              EDIT   +14 lines (1 type field + 4 registrations)
server/src/server.ts                                  EDIT   +7 lines  (store root source + factory + routeOpts wiring)
```
Total: 296 lines (<= 300 budget), 4 files (<= 4).

Design notes (why the shape is what it is):
- `createPendingIntentHandlers({ rootDir, storeFactory? })` factory mirroring `createAiThreadHandlers`.
  The handler builds the per-request `PendingIntentStore` from `(rootDir, x-user-id header (absent =>
  "default"), endpoint (route param), scope/threadId (query, conditional — exactOptionalPropertyTypes))`.
  The store is stateless across requests and its resume chain is keyed by file PATH at module level in
  `PendingIntentStore.ts`, so per-request construction cannot break two-tabs-one-resume. `storeFactory`
  is injectable so the test hands in the real store class over `mkdtemp` (NOT a mock double).
- `server.ts`: `pendingIntentHandlers = createPendingIntentHandlers({ rootDir: aiThreadsRoot })` — the
  SAME root option that `aiThreadStore` is built from (no re-derived `var/ai-threads` literal);
  `routeOpts.pendingIntentHandlers = pendingIntentHandlers` beside the existing `aiThreadHandlers`
  assignment. Routes registered beside `:865-872` under the existing `/ai/threads` family:
  `POST /ai/threads/:endpoint/checkpoints`, `GET /ai/threads/:endpoint/checkpoints/:checkpointId`,
  `POST /ai/threads/:endpoint/checkpoints/:checkpointId/resume`, `POST /ai/threads/:endpoint/checkpoints/:checkpointId/delta`.
- Handler re-implements nothing: `store.save` diagnostics => 400 { codes, diagnostics }; save ok =>
  201 { checkpoint_id, concurrency_version } read from the exact document the client sent (the store's
  SaveResult echoes nothing — the committed module is the authority). `store.load` null => 404
  { error: 'checkpoint-not-found', reason } (never a fabricated document; NO-FALLBACK). `store.resume`
  `version_conflict` => 409 with the store's own code/message; the handler mints only the receipt fields
  the store requires that the client does not send (`receiptId` = randomUUID(), `resumedAt` = now,
  `resumedBy` = client body field else the x-user-id header, `outcome: 'resumed'`), and delegates the
  consume-once compare-and-set entirely to the store. `store.attachDelta` `injection-refused` => 422.
- Fastify typing: the generic key for query is `Querystring` (verified in
  `node_modules/fastify/types/route.d.ts`: `Querystring: unknown`).

## ACCEPTANCE CONTRACT clauses served (browser receipts NOT claimed — unit 4 owns them)
- (a) reload mid-journey restores the pending prompt — served by `load` (GET .../checkpoints/:checkpointId, 200 exact document / 404 named reason, no fallback).
- (c) a second tab sees the same pending prompt — same `load` path; identity header-carried, store read-only.
- (e) two tabs both clicking Resume produce exactly one resume — served by `resume` delegating to the store's CAS; pinned by the double-resume test (one 200 + one 409) and the mutation probe below.
- Blocked-restoration case — the 404 carries the machine-readable `reason`; this unit does not render UI (unit 4).

## AC1 — targeted handler test (RAW, final state after restore)
```
$ cd server && npx vitest run src/api/handlers/PendingIntentHandlers.test.ts
 ✓ ... > save then load round-trips the checkpoint document (201 then 200)
 ✓ ... > load of an absent checkpoint id => 404 with a machine-readable reason, never a fabricated document
 ✓ ... > two tabs resume with the SAME expectedVersion (Promise.all): exactly one 200 and one 409
 ✓ ... > a delta declaring request_revision is refused in injection mode => 422 with the store named diagnostic
 ✓ ... > a contract-invalid checkpoint => 400 with the diagnostic codes and NOTHING persisted
 ✓ ... > resume of an absent checkpoint => 400 with the store checkpoint-not-found code (a conflict is never collapsed into it)
 Test Files  1 passed (1)
      Tests  6 passed (6)
```

## AC2 — double-resume negative pin (RAW)
Fired with `Promise.all` on two handler invocations (same user/endpoint/thread, same
`expectedVersion: 1`): the final run asserts `[a, b].map(r => r.statusCode).sort() === [200, 409]`,
the 200 body has `receipt` (the ONE resume receipt) and the 409 body matches `{ code: 'version_conflict' }`
(the SAME code the store returned). Both assertions passed in the 6/6 run above.

## MUTATION PROBE (409 is load-bearing) — RAW
After the green run, `resume`'s delegation was replaced with a direct `store.load` + unconditional
success reply (no status mapping), then the targeted test was run:
```
 FAIL  ... > two tabs resume with the SAME expectedVersion (Promise.all): exactly one 200 and one 409
AssertionError: expected [ 200, 200 ] to deeply equal [ 200, 409 ]

- Expected
+ Received

  Array [
    200,
-   409,
+   200,
  ]

 ❯ src/api/handlers/PendingIntentHandlers.test.ts:99:67

 FAIL  ... > resume of an absent checkpoint => 400 with the store checkpoint-not-found code
AssertionError: expected 200 to be 400 // Object.is equality

 ❯ src/api/handlers/PendingIntentHandlers.test.ts:138:26

 Test Files  1 failed (1)
      Tests  2 failed | 4 passed (6)
```
The double-resume case fails exactly as the pin predicts (both tabs get 200). The delegation was then
restored and re-verified (6/6 green, tsc 0) — the product diff at commit is the clean one (no probe
artifacts remain; the two probe edits were in-file and reverted before commit).

## AC3 — invariants (RAW)
```
$ cd server && npx vitest run src/compiler/journey/checkpointContract.test.ts src/api/handlers/AiThreadHandlers.threadScoped.test.ts
 Test Files  1 failed | 1 passed (2)
      Tests  8 failed | 7 passed (15)
```
- `checkpointContract.test.ts`: 7 passed (7/7 — matches brief baseline).
- `AiThreadHandlers.threadScoped.test.ts`: MY pre-edit baseline (measured at 7d8038ef before any edit,
  after the symlink restoration) = 8 failed | 7 passed, every failure `TypeError: Cannot read
  properties of undefined (reading 'bind')` at `routes.ts:293`
  (`recordHandlers.listDanglingReferences` — the threadScoped suite's fake routeOpts omits
  `recordHandlers`; pre-existing at base, outside this unit's owned files, and I did not edit
  `AiThreadHandlers.ts` or `PendingIntentStore.ts`). POST-edit: IDENTICAL 8 failed | 7 passed, same
  failure mode, same line. No regression introduced.
- No schema/YAML path in `git diff --stat` (see below).

## tsc (RAW)
- Pre-edit baseline at 7d8038ef (after symlink restore, before any edit): `npx tsc --noEmit 2>&1 | wc -l` → `0`
- Post-edit / at commit: `0` (equal).

## git at commit (RAW)
```
$ git diff --stat            (before the commit, staged state)
 server/src/api/routes.ts | 14 ++++++++++++++
 server/src/server.ts     |  7 +++++++
 2 files changed, 21 insertions(+)      [+ the two untracked new files = 296 insertions total]
$ git -c core.fileMode=false status --short   (after commit)
(empty — CLEAN)
```
Protected files byte-identical vs base `7d8038ef`: `git diff --name-only 7d8038ef -- server/src/ai-threads/PendingIntentStore.ts server/src/api/handlers/AiThreadHandlers.ts server/src/compiler/journey/checkpointContract.ts server/src/compiler/journey/journeyDocumentLint.ts schema` → empty.

## Invariant sweep on the new handler (RAW, greps on the committed files)
- second `new Ajv2020(...)` / Ajv instance: NONE (only two comment mentions of "the one Ajv seam").
- `var/ai-threads` literal: NONE.
- version comparison in handler (`concurrency_version <`, `expectedVersion <>`, `==`): NONE — the only
  `typeof body.expectedVersion !== 'number'` guard is a body-shape 400, not a version COMPARISON.
- `status === 'resumed'` (or any status test) in handler: NONE.
- hand-rolled `typeof` shape check on the checkpoint/delta documents: NONE (only the numeric
  `expectedVersion` presence guard and string-presence guards for header/query identity fields).

## Decisions
1. Per-request store construction (rootDir + request-derived identity) instead of a single long-lived
   store instance, because `PendingIntentStore` takes `(userId, endpoint, scope?, threadId?)` in its
   constructor options — identity IS the store's namespace — and its resume chain is module-level by
   path, so two concurrent tabs share the chain. Matches the brief's "build the store from the SAME
   aiThreadStore root/option source".
2. `resumedBy` defaults to the `x-user-id` header (sibling thread idiom) when the body omits it;
   assigned conditionally (never `undefined`) for exactOptionalPropertyTypes.
3. 409 vs 400 split on resume failure keys off the store's diagnostic code (`version_conflict` => 409,
   anything else — e.g. `checkpoint-not-found` — => 400 with the store's codes): a conflict is never
   collapsed into 400/404, and an absent checkpoint is never answered with a 200.

## Next actions (owner: orchestrator)
- Unit 4 (client resume affordance) can now call the four routes; its browser receipts for (a)/(c)/(e)
  and the blocked-restoration message belong to it.
- Unit 5 (per-surface export/restore declarations) unchanged.
- Pre-existing (NOT this unit's): the 8 threadScoped failures at `routes.ts:293`
  (`recordHandlers.listDanglingReferences` unbound in the suite's fake routeOpts) exist at base
  `7d8038ef`; a separate unit should fix that suite or route registration.

## Marker
The marker sha below is `git rev-parse HEAD` of the code commit that contains this unit's work
(4 files, 296 lines); this paperwork commit follows it.

L2-JOURNEY-CHECKPOINT-1 UNIT 3 DONE 4eb2471ee4a0b4249421107bce346569b903bae5
L2-JOURNEY-CHECKPOINT-1 UNIT cproute DONE 4eb2471ee4a0b4249421107bce346569b903bae5
L2-JOURNEY-CHECKPOINT-1 UNIT cproute DONE 2bcbeeda6e188d50f3d3fe576d275e90df6c9768

## d1bind fix cycle

Source: reviews/L2-JOURNEY-CHECKPOINT-1-accum-advc-c1-l2t1876.md D1 (major, required-correction), probe P5.
Base measured this run: `807329d27ecf2e4e829e1d8c2714120efb64d94f`, tree clean.

### Defect
`POST /ai/threads/protocols/checkpoints/CP-GHOST/delta` on a thread holding `cp-journey-1` answered
`200 {"delta_id":"delta-1","checkpoint_id":"CP-GHOST"}`. `attachDelta` checked only "a document exists"
(`readDocument() === null`) and the handler echoed the path segment back, so the delta was bound to a
checkpoint id the store never had — while `load()` and `resume()` already compare `checkpoint_id`.

### Change (4 files, all in the brief's owned set)
- `server/src/ai-threads/PendingIntentStore.ts`: `attachDelta(delta: unknown, checkpointId: string)`;
  one `readDocument()` into a local; refuse `DIAG_NOT_FOUND` (unchanged code `checkpoint-not-found`)
  unless `doc !== null && doc.checkpoint_id === checkpointId`. Order unchanged: contract validation
  -> `injection-refused` 422 -> identity check. `AttachResult`'s success arm now carries the
  CONFIRMED `checkpointId` (read from the stored document), so the handler cannot echo the path.
- `server/src/api/handlers/PendingIntentHandlers.ts`: passes `checkpointId` to the store; maps the
  `checkpoint-not-found` diagnostic to `404 {error:'checkpoint-not-found', code, reason}` (after the
  422 arm, before the generic 400 arm); the 200 body's `checkpoint_id` is `result.checkpointId`, never
  the raw path string.
- Tests: one new arm each in `PendingIntentHandlers.test.ts` and `PendingIntentStore.test.ts` (ghost id
  refused, matching id still 200); the two existing `attachDelta` call sites now pass the stored id.
- NOT touched: `routes.ts` (its `:checkpointId` param already existed at :937), `checkpointContract.ts`,
  `checkpointRestoreCheck.ts`, any schema/app path.

### RED first (raw, before the fix)
New handler arm and new store arm both fail; the other 13 pass:

```
 ❯ src/api/handlers/PendingIntentHandlers.test.ts  (7 tests | 1 failed) 71ms
   ❯ ... > a delta naming a checkpoint id the thread does not hold => 404 checkpoint-not-found, no fabricated association (d1bind)
     -> expected 200 to be 404 // Object.is equality
 ❯ src/ai-threads/PendingIntentStore.test.ts  (8 tests | 1 failed) 83ms
   ❯ ... > a delta naming an id the stored document does not carry is refused checkpoint-not-found (d1bind)
     -> expected true to be false // Object.is equality
 Test Files  2 failed (2)
      Tests  2 failed | 13 passed (15)
```
RED commit `c75e996e`; store fix `fb8f6b61`; handler mapping `4a0fbd61746877018d2d6da50728e9ecc1a66793`.

### GREEN (raw)
```
cd server && npx vitest run src/api/handlers/PendingIntentHandlers.test.ts src/ai-threads/PendingIntentStore.test.ts
 ✓ src/ai-threads/PendingIntentStore.test.ts  (8 tests) 71ms
 ✓ src/api/handlers/PendingIntentHandlers.test.ts  (7 tests) 74ms
 Test Files  2 passed (2)
      Tests  15 passed (15)
```
`cd server && npx tsc --noEmit` -> `TSC_REAL_EXIT=0` (no output).

### Live probe (AC1/AC2/AC3) — real server from THIS worktree, isolated dirs
Server started from this worktree (`npx tsx src/server.ts`, PORT=3123, HOST=127.0.0.1,
`APP_BASE_PATH=<worktree>`, `AI_THREADS_ROOT=/home/brad/.checkpoint-d1bind-scratch/ai-threads`,
`HOME=/home/brad/.checkpoint-d1bind-scratch/home` so the embedded-git data dir was scratch-local and never
`~/.computable-lab`). Brad's :3001/:5174 and the lane stacks were not touched; the server was killed after
the probe (port 3123 verified closed).

```
BASE=http://127.0.0.1:3123/api/ai/threads/protocols/checkpoints
curl -s -w ' [%{http_code}]' -X POST "$BASE?threadId=probe-1" -H 'content-type: application/json' -H 'x-user-id: u1' --data @cp.json
  -> {"checkpoint_id":"cp-journey-1","concurrency_version":1} [201]
curl ... "$BASE/CP-GHOST/delta?threadId=probe-1" ... --data @delta.json
  -> {"error":"checkpoint-not-found","code":"checkpoint-not-found","reason":"no checkpoint document is stored for this thread: absent file, malformed JSON, or a mismatched checkpoint_id — never a fallback read of a sibling thread or \"most recently updated\""} [404]
curl ... "$BASE/cp-journey-1/delta?threadId=probe-1" ... --data @delta.json
  -> {"delta_id":"delta-1","checkpoint_id":"cp-journey-1"} [200]
curl ... "$BASE/cp-journey-1/delta?threadId=probe-1" ... --data @delta-inj.json   (request_revision)
  -> {"error":"injection-refused","code":"injection-refused","reason":"delta declares request_revision: ..."} [422]
curl ... "$BASE/cp-journey-1/delta?threadId=probe-1" ... --data @delta-bad.json  (entry missing canonical_value/semantic_type)
  -> {"error":"delta rejected by contract","codes":["delta-entry-incomplete",...,"shape-invalid"],...} [400]
```
The 404 body carries NO `delta_id` (also asserted in the handler test).

### Mutation probe (the only mutation that matters)
Deleted the `doc.checkpoint_id !== checkpointId` half of the guard, leaving `doc === null`; ran the two
targeted files:

```
 -> expected 200 to be 404 // Object.is equality
 -> expected true to be false // Object.is equality
 FAIL  src/ai-threads/PendingIntentStore.test.ts > ... > a delta naming an id the stored document does not carry is refused checkpoint-not-found (d1bind)
 FAIL  src/api/handlers/PendingIntentHandlers.test.ts > ... > a delta naming a checkpoint id the thread does not hold => 404 checkpoint-not-found, no fabricated association (d1bind)
 Test Files  2 failed (2)
      Tests  2 failed | 13 passed (15)
```
Restored the guard -> `Tests 15 passed (15)`; `git -c core.fileMode=false status --short` printed nothing (clean).

### Notes for review
- `AttachResult`'s success arm gained `checkpointId`: the brief requires the 200 body's `checkpoint_id`
  to come from the confirmed document, and the store is the only component that has read it. No second
  not-found code was minted (`DIAG_NOT_FOUND` reused verbatim); the 422 rule text and `load`/`resume`
  behaviour are untouched.
- No UI surface at this unit (ACCEPTANCE waived); the end-to-end resume path is the item's browser gate.
- Scratch dir `/home/brad/.checkpoint-d1bind-scratch/` (probe scripts, payloads, isolated data) removed at
  exit; the raw outputs above are the receipt.

### Marker
Code commit containing the fix: `4a0fbd61746877018d2d6da50728e9ecc1a66793`; this section is committed after it.

L2-JOURNEY-CHECKPOINT-1 UNIT d1bind DONE 4a0fbd61746877018d2d6da50728e9ecc1a66793
