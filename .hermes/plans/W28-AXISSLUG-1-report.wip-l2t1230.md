# W28-AXISSLUG-1 — coder report (lane 2, wip-l2t1230)

Branch: W28-AXISSLUG-1-lane2 (off cl/integration-2 @ 3f804c17)
Commits:
- RED:  4d967d48  test(W28-AXISSLUG-1): RED — answer-key axisIds must be slugged on accept assembly (gate r4 DEFECT-1)
- FEAT: 9f3c505b  feat(W28-AXISSLUG-1): slug answer keys into branch_resolution axisId+choices key on accept assembly (gate r4 DEFECT-1)

## Defect (gate r4 DEFECT-1)

POST /api/intent/accept -> 409 ACCEPT_CREATE_FAILED
"Validation failed: /branch_resolution/1/axisId: Must match pattern: ^[a-z][a-z0-9-]*$"

The accept assembly path copied each answer KEY verbatim into
branch_resolution[].axisId and the choices OBJECT KEY
(IntentAcceptHandlers.ts:77-82). The model emits underscore axis ids on purpose
(intentCompile.ts:441 literally instructs `axisId: 'short stable id, e.g. sample_type'`),
so the model-derived axis "lyse_variant" 409'd against the local-protocol schema
(schema/workflow/local-protocol.schema.yaml:96-98, axisId pattern ^[a-z][a-z0-9-]*$).
No LPR minted; the A5 accept leg blocked. The mock-store test harness never validated
against the schema — that was the pin gap.

## Change (one module, exactly the approved scope)

server/src/api/handlers/IntentAcceptHandlers.ts:
- Added import of the EXISTING exported helper `slugifyRecordLabel`
  (server/src/compiler/material/MaterialCompiler.ts:109 — lowercase, non-alnum -> '-',
  trim/dedupe dashes, cap 128, fallback 'unknown'). No new slug utility.
- branch_resolution assembly now maps each answers entry through the helper ONCE:
  `const axisId = slugifyRecordLabel(key);` and uses the result for BOTH `axisId` and
  the `choices` object key. `matched: true` unchanged; `branchIds: [chosenValue]` and
  choices VALUES stay verbatim (schema confirms: branchIds items are plain strings with
  no pattern; choices is additionalProperties:true — only axisId is pattern-constrained).
- Collision discipline pinned by test, not code: entries stay in Object.entries order;
  two distinct keys that slug to the same axisId each get their own row (per-row
  provenance). NO de-dup, NO suffixing, NO id invention.

NOT touched: schema/lint YAML, prompts, intentCompile tool descriptions, resolveNounsPass,
app files, 422 envelope, fold leaf. No fixture/record writes, no new reason codes.
Diff scope (git diff 3f804c17..HEAD --stat): only
server/src/api/handlers/IntentAcceptHandlers.ts (+17/-6) and its .test.ts (+127).

## Golden change (DELIBERATE, called out)

The EXISTING VALID fixture case (answers { sample_type: 'bacterial', module_type: 'rack' })
previously asserted/passed with underscore axisIds because the mock store never validated.
Its expectation is DELIBERATELY updated to 'sample-type' / 'module-type' (plus choices-key
assertions). This is the intended behavior change: underscore keys in the envelope were the
bug; the old expectation pinned the bug.

## Tests (RED-first)

RED commit 4d967d48 written against unmodified code: 4 failed | 3 passed (the 4 failures
are exactly the new slugged-axisId assertions; idempotence/no-answers pins pass trivially).
Then implemented -> GREEN.

Final suite (7 tests, committed tree):
  ✓ src/api/handlers/IntentAcceptHandlers.test.ts  (7 tests) 5ms
  Test Files  1 passed (1)
       Tests  7 passed (7)

Cases:
1. Gate r4 request shape { 'lysis-method':'bead-beater', 'lyse_variant':'variant_a' } ->
   branch_resolution[1].axisId === 'lyse-variant', choices {'lyse-variant':'variant_a'};
   row 0 'lysis-method' byte-stable; branchIds ['variant_a'] / ['bead-beater'] verbatim.
2. Idempotence: slugifyRecordLabel('lysis-method') === 'lysis-method'.
3. Pathological: 'Variant B!!' -> 'variant-b'; '!!!' -> helper's 'unknown' fallback; every
   emitted axisId asserted directly against /^[a-z][a-z0-9-]*$/; never throws.
4. Order + collision pin: Object.entries order preserved; {'lyse_variant','Lyse Variant'}
   -> two rows both 'lyse-variant' with their own choices/branchIds (no de-dup/suffix).
5. No answers (undefined or {}) -> NO branch_resolution key at all (regression pin).
6. Golden case above.

## Verify (real output)

1) npm run test:run -w server -- src/api/handlers/IntentAcceptHandlers.test.ts
   Test Files  1 passed (1)
        Tests  7 passed (7)

2) npm run test:run -w server -- src/api/handlers/
   Test Files  26 failed | 35 passed (61)
        Tests  5 failed | 303 passed (308)
   ZERO NEW vs base: same command re-run with the two lane files reverted to 3f804c17 gives
   Test Files 26 failed | 35 passed (61); Tests 5 failed | 298 passed (303) — comm -3 of the
   sorted FAIL-file lists (base vs lane) is EMPTY (exit 0). The 5 pre-existing failures are
   trunk debt in ExtractHandlers (upload), LifecycleHandlers (terminalStates echo x2),
   WorkspaceHandlers (PUT x2); IntentAcceptHandlers appears in NEITHER fail list.
   (One intermediate run also flaked EventEditorFixHandlers 'startApplyFixJob' — it passes
   in isolation (16/16) and in the final full run; timing flake, not lane-related.)

3) npm run typecheck -w server
   Lane: 25 'error TS' lines (exit 2). Base (3f804c17, same env): 25 'error TS' lines.
   diff of the sorted error-line sets base vs lane: IDENTICAL — ZERO new errors.
   NOTE vs the stated 33-line pin: at this trunk tip with a correctly linked
   server/node_modules the measured baseline is 25 error-TS lines (28 raw diagnostic lines
   incl. multi-line continuation text). The lane pins the identical set, not the headline
   number; the 33 figure likely counts continuation lines or an older tip. All 25 are
   pre-existing (AgentOrchestrator missing-module TS2307s, implicit-any TS7006s,
   exactOptionalPropertyTypes TS2379, RecordStoreImpl/AuthoringGuard etc.); none mention
   IntentAcceptHandlers.

## Environment note (lane hygiene, no code impact)

The lane's server/node_modules was a stale real directory containing only a .vite vitest
cache (no packages), which made the first typecheck report 419 bogus TS2307s and truncated
vitest collection (247 tests). Replaced with a symlink to the trunk's
cl-integration-2/server/node_modules (read-only trunk dep tree; trunk itself untouched).
All numbers above are post-fix. The stale dir is parked at /tmp/axisslug_lane2_server_nm_vite.

## Handoff

- Accept leg now writes schema-valid axisIds; orch post-merge headless accept against :3093
  should return 200 + recordId and GET choices == {"lysis-method":"bead-beater","lyse-variant":"variant_a"}.
- No merge/push/stack restart performed (per task boundaries). DEFECT-2 / OBSERVATION-3
  remain carried for adjudication per spec; untouched.

AXISSLUG1 DONE
