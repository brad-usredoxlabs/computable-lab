# PROTO-AI-5 worker report — server-side write gates (lane 2, token l2t1605)

Branch `wt/PROTO-AI-5-lane2-l2t1605` off `cl/integration-2` (base `47c19004`).
Status: implementation complete, targeted suite GREEN, live E2E 28/28 GREEN,
zero NEW full-suite failures, zero NEW typecheck errors from owned files.

## What changed (committed files — exactly the owned set)

1. `server/src/api/routes/protocol-steps.ts`
   - **G2 content-lock route gate** — shared `contentLocked()` helper mirroring
     the client rule (`protocolStepEditing.ts:45`), the PUT handler lock
     (`RecordHandlers.ts` CONTROLLED_RECORD_LOCKED 409) and the store lock
     (`RecordStoreImpl.ts:661`): `lifecycleId && state ∈ {approved, effective,
     superseded, archived}`. Applied to all five MUTATING step endpoints
     (PATCH step, POST step, DELETE step, PATCH settings, POST subgraph — the
     subgraph commit PATCHes subGraphRef, a content edit). GETs untouched.
     Pattern cited in code comments.
   - **G3 ≥1-step route gate** on DELETE — 422 `MIN_STEPS_REMAIN`, checked in
     the client's order (count before executedness, `protocolStepEditing.ts:90`
     before :91-92).
   - **Executedness symmetry (G1 target rule)** — DELETE now refuses
     `startedAt || completedAt` (was startedAt-only); same 400
     `STEP_ALREADY_EXECUTED` code/message shape, so the startedAt refusal is
     byte-compatible.
   - **G5 result-discard closed** — `surfaceStoreFailure()` mirrors the EXISTING
     PUT-path mapping (`RecordHandlers.ts:864-897`): validation→422
     `VALIDATION_FAILED`, lint→422 `LINT_FAILED`, controlled lock→409
     `CONTROLLED_RECORD_LOCKED`, SHA mismatch→409 with the original conflict
     string, else 400. Applied at PATCH step, POST step, DELETE step, PATCH
     settings, and the subgraph POST's protocol PATCH (its realization-create
     result was already surfaced).
2. `server/src/api/handlers/RecordHandlers.ts`
   - `protocolStepWriteGate(previous, proposed)` — pure gate for the whole-record
     PUT, invoked immediately AFTER the existing CONTROLLED_RECORD_LOCKED check
     (lock keeps precedence) and BEFORE the store write (persists nothing on
     refusal). Pattern = the existing route-level conditional + stable code
     (cf. `MaterialPrepHandlers.ts:1156` ≥1-step, `protocol-steps.ts`
     DUPLICATE_STEP_ID/STEP_ALREADY_EXECUTED). Fires only for `kind:'protocol'`
     on both sides:
     - G3: `MIN_STEPS_REMAIN` (422) when the write leaves the protocol
       step-less (steps absent, or dropped from a non-empty previous). Absence
       of the GATE code on a legacy record already stored without steps is
       deliberate (guards the deletion, not pre-existing rot; Ajv minItems stays
       the structural authority).
     - G1: `STEP_ALREADY_EXECUTED` (400, existing step-endpoint status) when an
       executed step (startedAt OR completedAt) exists previously but not in the
       proposal. PUT deletions are payload-subtractive, so the stepId-set
       comparison is the whole gate.
     - G4: `DUPLICATE_STEP_ID` (400, matching POST /steps status).
     - Non-protocol PUTs: untouched.
   - Stale `expectedSha` conflict path untouched (still 409 with the original
     SHA-mismatch string; gate refusal simply precedes it, persisting nothing
     either way — proven by test).
   - G3 note: the spec's "map the Ajv minItems failure to a named code" variant
     was implemented as the equivalent ROUTE-level check instead, so the
     response body carries ONLY the stable code (no `error:'Validation failed'`
     string reshaping, keeping the existing 422 shape byte-stable for every
     other validation failure). Same code, same 422, same guarantee.
3. `server/src/api/routes/protocol-steps.test.ts` (extended, existing tests
   unmodified except `makeStore` gaining an optional store-refusal mode)
   — 16 new tests: G2 on all four mutation endpoints + happy-path non-lock
   passthrough; G3 last-step delete + 2→1 happy path; completedAt-only DELETE
   refusal + unchanged startedAt refusal; G5 refusals for PATCH/POST/DELETE/
   settings + store-level lock surfacing. Every refusal asserts the code AND
   `updateCalls.length === 0` / read-back unchanged.
4. `server/src/api/handlers/RecordHandlers.writeGates.test.ts` (NEW) — 12 tests
   on the real `updateRecord` with a persisting in-memory store: G1
   startedAt + completedAt-only refusals (persisted nothing, read-back equal),
   executed-step in-place edit still passes, unexecuted delete still persists;
   G3 empty/absent steps + last-step; G4 duplicate + unique happy path;
   CONTROLLED_RECORD_LOCKED lock-precedence preserved; stale-sha 409 conflict
   intact; gate-beats-stale-sha precedence; non-protocol records unaffected.

## RED-first evidence
- Route file: 11 new tests RED before implementation (content-lock 4, min-steps
  1, completedAt 1, G5 5), 11 pre-existing still green.
- PUT file: 6 RED without the gate (2 of 12 are regression guards that pass
  both ways: happy paths + lock precedence), 12 green with it.

## Test/typecheck results
- Targeted: `npx vitest run src/api/routes/protocol-steps.test.ts
  src/api/handlers/RecordHandlers.writeGates.test.ts
  src/api/handlers/RecordHandlers.lifecycle.test.ts
  src/revisions/RevisionRoutes.test.ts` → all pass (35+ gate tests green in the
  combined run; lifecycle/RevisionRoutes are the neighbors I touched behavior near).
- Full suite (`npx vitest run` in server/, before/after on this branch):
  baseline 135 failed / 435 passed / 9 skipped (579 files), 221 tests failed /
  3946 passed; after: 130 failed / 441 passed / 9 skipped (580 files — +1 is my
  new test file), 223 failed / 4006 passed. NEW failing FILES: none. 5 baseline
  files FIXED (incl. RecordHandlers.lifecycle, RevisionRoutes,
  SignatureIntegrity, governanceStrictness, LocalAuthorization — they failed to
  COLLECT at baseline because the tracked `RecordHandlers.ts` imports
  `../../lint/AuthoringGuard.js` which is a lane-excluded untracked trunk file
  absent from this worktree; copying the trunk-synced copy (see assumptions)
  made them collect and they now pass). 2 tests newly VISIBLE (not regressions):
  `AuditEventService.test.ts` signature-ref + append-only cases — that file
  could not collect at baseline (0 tests); with the module present its two
  pre-existing assertion failures (mock-reply vs returned-body shape
  mismatch: `(result as any).success` undefined) surface. PROVEN unrelated:
  `git stash` of ALL my tracked changes → those same 2 still fail with only
  the untracked module copy in place. The test file is not in my owned set
  (governance's); flagging to the orchestrator rather than touching it.
- Typecheck `npx tsc --noEmit -p server/tsconfig.json`: baseline measured 50
  errors (spec said ~33 — stale estimate; the true baseline includes 6
  "Cannot find module" errors for lane-excluded trunk files). After: 52 lines,
  but ZERO errors in any owned file (protocol-steps.ts, RecordHandlers.ts
  additions, both tests). The delta is entirely lane-sync drift: my module copy
  REMOVES baseline error `RecordHandlers.ts(36,68) TS2307` and ADDS 3 errors
  inside the copied trunk `AuthoringGuard.ts` (trunk's newer `lint/types.ts`
  AuthoringPolicy/AuthoringRequirement exports are ALSO lane-excluded and
  absent here). Net new errors caused by my code: 0.

## Live E2E (private port :3198 only; :3001/:5174/:3093 untouched)
Real Fastify + real `RecordStoreImpl` (embedded git), fresh private
`CL_DATA_DIR=/tmp/proto-ai5-data`, pre-seeded approved protocol fixture:
28/28 checks pass — PUT executed-delete/empty/duplicate refusals with exact
codes and read-back unchanged; PUT happy path 200 + persisted; stale-sha 409;
PUT locked 409 CONTROLLED_RECORD_LOCKED; PATCH/POST/DELETE/PATCH-settings on the
locked protocol all 409 with persisted nothing; completedAt-only DELETE 400;
last-step DELETE 422 MIN_STEPS_REMAIN; 2→1 DELETE 200; settings happy 200;
settings-Ajv-refusal not a false 200 (422).
Honest cleanup note: early iterations ran against an insufficiently isolated
dataDir (the store's durable data lives in `~/.computable-lab` by default,
independent of APP_BASE_PATH) and created/deleted the two throwaway records
`PRT-E2E-5`/`PRT-E2E-LOCK` in the shared store via its own API — both are
removed (deleted through the API, verified 404, no files remain). No other
records were touched; the lane stack was never used for writes.

## Assumptions / consequential decisions (all reported, per contract)
1. **Lane-sync shim**: this worktree's tracked HEAD cannot even collect
   RecordHandlers tests — trunk's `RecordHandlers.ts` imports
   `server/src/lint/AuthoringGuard.ts`, which is listed in
   `/home/brad/.hermes/cl/lanes/2/lane-exclude` (untracked, invisible to
   git status). I copied it (plus the other 41 lane-excluded server files) from
   `/mnt/vast/home/brad/git/cl-integration-2/server` so the suite could run at
   all. They are git-excluded ⇒ cannot be committed; nothing in the commit
   depends on my copies beyond what trunk already depends on. The trunk lane
   trunk SHOULD probably track these; flagged to the orchestrator.
2. **Status choices**: reused the step endpoints' existing HTTP statuses for the
   mirrored codes (400 STEP_ALREADY_EXECUTED / 400 DUPLICATE_STEP_ID / 422
   MIN_STEPS_REMAIN) so one code means one status on both paths.
3. **G3 on PUT** implemented route-side (see above) — a steps-omitting body on
   a protocol PUT now gets MIN_STEPS_REMAIN instead of the generic 422; a
   legacy record stored WITHOUT any steps (schema-illegal since minItems; only
   reachable via skipValidation seed paths) remains editable — the gate
   prevents creating the emptying, it does not freeze pre-existing rot (the
   RevisionRoutes.test.ts contract "repair a null version … Save" exercises
   exactly that legacy case and must stay green).
4. **Subgraph POST** got the same lock gate + final-PATCH surfacing (same
   false-200 class the spec named at :846). Its pre-existing create-refusal
   handling (:836) was already correct and untouched.
5. AuditEventService.test.ts's 2 surfacing pre-existing failures need a
   governance-lane touch-up (expect `(result as any).success` while the handler
   returns the body; some branches `reply.send()`). Out of my file ownership;
   not weakened, not touched.

## Not done / blockers
None for the assigned scope. No merge performed; commit is on this branch only.

## Verification commands
- `npm run test:run -w server` (from worktree root; run from `server/` to scope
  workspace) — compare the failing-file set; none new.
- `npx tsc --noEmit -p server/tsconfig.json` — grep for
  protocol-steps|writeGates: zero hits.
- E2E script trail: `/tmp/proto-ai5-e2e4.sh` (+ fixture
  `/tmp/proto-ai5-data/worktrees/main/records/protocol/PRT-E2E-LOCK.yaml`).
