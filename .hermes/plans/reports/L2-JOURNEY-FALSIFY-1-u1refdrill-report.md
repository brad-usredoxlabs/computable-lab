# L2-JOURNEY-FALSIFY-1 / unit refdrill — report

Worktree: /home/brad/cl-wt/L2-JOURNEY-FALSIFY-1-u1refdrill-lane2
Branch: cl/lane2-journey-falsify-1-refdrill-0158
Base: f357ce117ef4db7d0d5bfba13ad758e76cf896f8
Grounding read: .hermes/plans/architect-context-l2.md §2 (load-bearing distinctions) —
governing line §2.12 (lines 56-58): "A saved checkpoint is not an exactly-once write.
Consumption-once state and effect-once domain writes are different guarantees; anything
crossing a commit boundary owes a fault-injection leg." Decision path: the resume crossing
the checkpoint commit boundary now consults the origin-record revision authority.
The repository (f357ce11) is the authority; the context file agreed with it.

## What the unit does

The FALSIFY-1 reference drill: a journey whose origin record changed while away must be
BLOCKED (named code), not silently restored/redirected. `restoreCheckpoint`
(server/src/compiler/journey/checkpointRestoreCheck.ts, commit 295bf0ce) already owned the
verdict but was dead code — `PendingIntentStore.resume` wrote `status: 'resumed'` + a
receipt for a checkpoint whose origin record had since changed. This unit wires the one
existing verdict into the one existing seam:

- store (PendingIntentStore.ts): optional `originCheck?: (checkpoint) => Promise<RestoreVerdict>`
  on PendingIntentStoreOptions; `resume` awaits it AFTER the CAS/version and
  `status === 'resumed'` refusals and BEFORE building the `status: 'resumed'` document.
  Blocked verdict => `{ ok: false, diagnostics: [{ code: verdict.code, path:
  '/origin/record_revisions', message: verdict.message }] }` — the verdict's OWN named code.
  No write occurs: the file re-reads `status: 'pending'`, `concurrency_version` unchanged,
  no `resume_receipt`. Absent option = today's behaviour (declared dependency, never a
  fabricated "checked" verdict).
- handler (PendingIntentHandlers.ts): class + factory take optional
  `recordStore?: Pick<RecordStore, 'get'>`; `storeFor` passes
  `originCheck: (cp) => restoreCheckpoint(cp, recordStore)` only when present (the ONE
  comparison — called, never re-implemented; no handler/store token logic). Resume maps
  `origin-record-changed` / `origin-record-vanished` to 409 `{ error: <code>, code: <code>,
  reason: message }` — the same "stop, do not redirect" shape as `version_conflict`; no
  receipt in the body.
- server.ts (~:1024): `createPendingIntentHandlers({ rootDir: aiThreadsRoot, recordStore:
  ctx.store })`.

DEVIATION FROM BRIEF (measured, not inferred): the brief said "`store` is already in scope
in that function (created at :540)". Measured at f357ce11: line 540's `const store` is in
`initializeApp` (function spans 336-733); line 1020's call site is in `createServer`
(starts at :734, `createServer(ctx, config)`), where `store` is NOT in scope — tsc error
TS2304 "Cannot find name 'store'" appeared when I first wrote `recordStore: store`.
`ctx.store` IS that same instance (initializeApp builds `AppContext` with `store` at :694),
and it is the same store every other handler in that function receives (e.g.
`createUIHandlers(ctx.uiSpecLoader, ctx.store, ...)` at :1009). So `recordStore: ctx.store`
satisfies the brief's intent exactly — the ONE record store from :540, not a second
instance, not a second authority. No other deviation.

## Files changed (all owned; 5/5)

- server/src/ai-threads/PendingIntentStore.ts (+23/-1): originCheck option + field; resume consults before the resumed document is built.
- server/src/api/handlers/PendingIntentHandlers.ts (+19/-7): recordStore option; storeFor wires restoreCheckpoint; 409 mapping for the two restore codes; header docstring.
- server/src/server.ts (+5/-1): wire recordStore: ctx.store at the existing call site.
- server/src/ai-threads/PendingIntentStore.test.ts (+62): 2 new tests (blocked verdict refused + file untouched; matching revisions + two-tab CAS still one winner).
- server/src/api/handlers/PendingIntentHandlers.test.ts (+85): 3 new tests (changed => 409 with before/after checkpoint; vanished => 409; matching => 200 and absent recordStore => 200).

Prohibited files untouched: checkpointRestoreCheck.ts + its test, checkpointContract.ts,
schema/**, app/**, config/journey/**, .hermes/plans/decisions/**.
Line budget: +194/-9 net across the 5 files (well under 300).

## Commits (RED -> GREEN, message names u1refdrill)

1. c1a0330f — RED: store-level drill test (fails at f357ce11: resume returns ok:true).
2. 2a47eb1c — GREEN (store): originCheck option + consult-before-write.
3. cda3b35e — GREEN (handler+server): recordStore wiring + 409 mapping + handler tests.
4. ae6c653e — this report (report commit).

## Baselines (measured at f357ce11, before any change)

- Targeted: `cd server && npx vitest run src/ai-threads/PendingIntentStore.test.ts src/api/handlers/PendingIntentHandlers.test.ts`
  => 2 files, 15 passed (8 + 7), 0 failed.
- tsc: `cd server && npx tsc --noEmit` => 6 pre-existing error lines (AIHandlers.ts 332/438/716,
  AiIngestionHandlers.ts 291, ExtractProtocolHandler.ts 63, sequenceRoutes.ts 37). None in the
  three owned product files. Saved: /home/brad/.refdrill-scratch (deleted at exit) and /tmp/tsc-baseline-u1refdrill.txt.

## RED (raw, commit c1a0330f, store suite only)

    ❯ src/ai-threads/PendingIntentStore.test.ts  (10 tests | 1 failed) 98ms
      → expected true to be false // Object.is equality
    FAIL ... resume consults the origin-record revision check BEFORE writing: ... (u1refdrill)
    AssertionError: expected true to be false // Object.is equality
    - Expected + Received
    - false + true
     ❯ src/ai-threads/PendingIntentStore.test.ts:139:23
       139|     expect(result.ok).toBe(false);
     Test Files  1 failed (1)
           Tests  1 failed | 9 passed (10)

Today it resumes (ok:true): the silent-redirect defect, demonstrated.

## Mutation probe (raw summary)

Mutation applied (option kept, call removed from resume):
    ❯ src/ai-threads/PendingIntentStore.test.ts  (10 tests | 1 failed | 9 skipped) 122ms
    FAIL ... (u1refdrill)
    AssertionError: expected true to be false // Object.is equality
    - Expected + Received
    - false + true
    Test Files  1 failed (1)
          Tests  1 failed | 9 skipped (10)
With the originCheck call removed the resume returns ok:true — the drill test FAILS, proving
the assertion binds to the new call and not to some other mechanism. (The brief phrased this
as "paste the raw summary showing it goes GREEN (resumes anyway)": the RESUME goes green —
it succeeds, resumed anyway — which is exactly why the test's refusal assertion fails. That
is the binding proof; a probe where the test still passed would prove nothing.)
Product file reverted; `git -c core.fileMode=false status --short` => (empty) clean tree.

## Final verification (raw, on the final commit)

Targeted (two owned suites):
    ✓ src/ai-threads/PendingIntentStore.test.ts  (10 tests) 73ms
    ✓ src/api/handlers/PendingIntentHandlers.test.ts  (10 tests) 68ms
    Test Files  2 passed (2)
         Tests  20 passed (20)   Duration 1.70s
(baseline 15 + 5 new; 0 failed)

Three files (adds the untouchable verdict suite, confirming it still passes beside the change):
    Test Files  3 passed (3)
         Tests  24 passed (24)   Duration 682ms

Typecheck (one run at the end): `cd server && npx tsc --noEmit` => exit 2, exactly the 6
pre-existing error lines, byte-identical to the baseline — ZERO new error lines in the three
owned product files (PendingIntentStore.ts, PendingIntentHandlers.ts, server.ts).

Tree at exit: `git -c core.fileMode=false status --short` => clean.

## AC4 drill receipt (reachable, not theoretical)

Executed with the REAL handlers + REAL PendingIntentStore + REAL restoreCheckpoint against
a record store whose get() returns rec-1 with live contentSha '9' while the checkpoint
declared revision '7' (via npx tsx on a temp file, deleted after):

    === 409 body ===
    HTTP 409
    {
      "error": "origin-record-changed",
      "code": "origin-record-changed",
      "reason": "origin record rec-1 changed since the checkpoint: declared revision '7' but the live envelope's contentSha is '9'"
    }
    === checkpoint document BEFORE blocked resume ===
    { "status": "pending", "concurrency_version": 1 }
    === checkpoint document AFTER blocked resume ===
    { "status": "pending", "concurrency_version": 1 }

No `receipt` in the 409 body; `resume_receipt` absent before and after; version unchanged:
a refused resume consumes nothing.

## Acceptance contract

- AC1 PASS: 409 with code 'origin-record-changed' naming rec-1, no receipt in the body
  (handler test + live receipt above).
- AC2 PASS: GET after the 409 reads status 'pending', concurrency_version 1, no resume_receipt.
- AC3 PASS: matching revisions => 200 + receipt (store + handler tests); two concurrent
  resumes with the check wired still produce exactly one winner (['ok','version_conflict']).
- AC4 PASS: drill receipt quoted above.

## Reviewer-bait dispositions

1. CONTRACT WIDENING: not needed — ContractDiagnostic.code is an open `string`
   (checkpointContract.ts:24), so 'origin-record-changed' type-checks without touching the
   contract or schema. No BLOCKED condition arose.
2. SECOND AUTHORITY: the only token comparison in the change is the call
   `restoreCheckpoint(cp, recordStore)`; grep the diff for `contentSha`/`gitCommit` in
   handler/store — zero occurrences outside the verdict module's own test data.
3. OPTIONALITY: exactOptionalPropertyTypes on; options built with conditional assignment
   (`if (recordStore !== undefined) opts.originCheck = ...`), never `x: undefined`.
4. BLOCKED-BUT-WRITTEN: the refusal returns BEFORE validateCheckpoint/writeAtomic; tests
   assert on the re-read FILE, not only the return value.
5. DEFAULT-PRETENDS-TO-CHECK: absent recordStore => absent originCheck => today's behaviour;
   covered by the "absent recordStore => 200" handler test. No truthy default.
6. GLOBAL-VS-LOCAL: one resume route, one store seam extended; recordStore is a declared
   input, not a second store (ctx.store is the same instance every handler in createServer uses).

## Next actions / remaining blockers

None for this unit. The other FALSIFY-1 units (falsify-compose, hidesjourney) are separate
briefs. If the lane stack reload is desired before live verification of the 409 path, the
orchestrator owns the reload (YAML changes were not made here, so no reload is owed by this
unit).

L2-JOURNEY-FALSIFY-1-u1refdrill UNIT refdrill DONE ae6c653e4fde94a2f50639b7cf857989d2c0d23d
