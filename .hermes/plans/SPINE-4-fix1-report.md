# SPINE-4 FIX1 REPORT — wip-l2t1945 (lane 2, branch spine-4-lane2-l2t1710)

Fix cycle 1 against adversarial review review-SPINE-4-adversarial-l2t1830.md (VERDICT: fix).
Base for this fix: prior HEAD 178077a3 (trunk cl/integration-2 @ 0873c47b + prior 3 SPINE-4 commits).
Fix commit: 4c52faa2 `fix(SPINE-4): D1 — production routes inject a store-backed spine (ruling (a))`.
Headless server-only; no UI, no browser gate. All commands run in
/mnt/vast/home/brad/git/wt/SPINE-4-lane2-l2t1710 (vitest from <wt>/server; git -c core.fileMode=false).

================================================================================
1. D1 [blocker] — FIXED via orchestrator ruling (a) + defensive fail-loud
================================================================================

(a) PRODUCTION INJECTION (spec §3 intent, orchestrator-preferred):
- server/src/api/handlers/IntentCompileHandlers.ts
  createIntentCompileHandlers now composes
  `createResolveSpineFromContext({ store: deps.store, ...(deps.getAppConfig ? { getAppConfig } : {}) })`
  — the SAME composition server.ts:733 builds for the resolve tools (tier-0 termProvider +
  tier-1 recordProvider over the store; OAK tier when configured; live config accessor so
  PATCH /api/config takes effect without restart, same pattern as server.ts:733's
  `getAppConfig: () => ctx.appConfig`). The compile call site passes
  `{ searchLabwareByHint, spine }` (was `{ searchLabwareByHint }`).
  registerIntentCompileRoutes passes `getAppConfig: () => ctx.appConfig` (live accessor).
- server/src/api/handlers/IntentCompileFromPromptHandlers.ts
  createIntentCompileFromPromptHandlers(ctx, deps) composes
  `createResolveSpineFromContext({ store, ...(ctx.appConfig !== undefined ? { appConfig: ctx.appConfig } : {}), getAppConfig: () => ctx.appConfig })`
  and threads it via `deps: { searchLabwareByHint, spine }` into compileFromSmallLlm ->
  intentCompile.ts:346 `compileScientistIntent(intent, args.deps)` (no change needed there —
  ScientistIntentCompileDeps already carries spine; the route now fills it).
  store resolution follows the handler's existing pattern (`deps.store ?? ctx.store`).

(b) DEFENSIVE FAIL-LOUD (no silent floor):
- server/src/compiler/scientistIntent/compileScientistIntent.ts buildRegistry:
  the `spine: deps.spine ?? createResolveSpine({})` fallback is REMOVED. If deps.spine is
  absent, registration THROWS LOUD:
  "SPINE-4 resolve_nouns registration requires an injected spine (deps.spine): production
  callers pass a store-backed spine via createResolveSpineFromContext; a provider-less spine
  is legal only as an explicitly injected test seam (§3: NO degraded no-resolution mode)."
  The `createResolveSpine` import is gone from compileScientistIntent.ts (no provider-less
  composition remains on any production path). A provider-less spine (createResolveSpine({}))
  is legal ONLY when a test explicitly injects it as a declared seam — three existing suites
  that relied on the silent floor now declare it in-diff with comments (scientistIntent.test.ts
  x4 legs, ProtocolIntentLoweringCharacterization.test.ts compile leg, vocabularyRipOut.test.ts
  prompt-exclusivity leg). NO fallback exists that could silently degrade.

Reviewer probe mirrored as a test (not just a script):
server/src/compiler/resolution/spine4ProductionWiring.test.ts (4 tests):
  1. POST /intent/compile handler with a store that CAN bind 'DMEM' (kind material) ->
     outcome 'complete', events non-empty (was: needs-clarification +
     {label:'DMEM', reason:'unknown-noun'} + zero artifacts — the exact D1 reproduction).
  2. POST /intent/compile-from-prompt handler (stub LLM emitting seed/DMEM) with the same
     store -> outcome 'complete', events non-empty.
  3. compileScientistIntent with route-like deps (searchLabwareByHint only, NO spine) ->
     REJECTS at registration (fail-loud; the provider-less floor cannot silently run).
  4. Explicitly injected provider-less spine (createResolveSpine({})) + hint-eligible nouns ->
     compiles 'complete' — the seam is declared, never defaulted.

RED EVIDENCE (test written BEFORE the wiring; run against HEAD 178077a3):
  Test Files 1 failed (1); Tests 3 failed | 1 passed (4)
  FAIL leg 1: AssertionError: expected 'needs-clarification' to be 'complete' (route false-bar)
  FAIL leg 2: AssertionError: expected 'needs-clarification' to be 'complete' (route false-bar)
  FAIL leg 3: AssertionError: promise resolved "{ terminalArtifacts: { …(3) }, …(4) }" instead
    of rejecting — resolved payload carried clarifications [{label:'DMEM', reason:'unknown-noun',
    candidates:[Create local term “DMEM” x2], actionLocation:{actionIndex:0, action:'seed',
    argument:'material'}}] and diagnostics [{code:'unresolved_arguments', severity:'error'}]
    — verbatim D1 reproduction. (full transcript: /tmp/spine4-fix1-red.txt)
GREEN after the wiring: 4/4 pass (inside the 173 below).

Independent probe re-run post-fix: `npx tsx /tmp/spine4-probe.mts` (the reviewer's own script,
route-like deps leg) now THROWS the fail-loud registration error instead of silently
false-barring — the degraded mode is structurally impossible.

Report §3 false claim corrected: an inline [FIX1 CORRECTION] annotation was added to
.hermes/plans/SPINE-4-report.wip-l2t1710.md at the exact "production callers inject a
store-backed spine via deps.spine" sentence (patched in the report commit).

================================================================================
2. D3 [minor] — DOCUMENTED (the reviewer-offered doc note; engine-wins is spec)
================================================================================
Chosen repair: documentation, not code. resolveNounsPass.ts §5.1 MERGE arm now carries an
explicit note: the merge is LABEL-SET-EQUIVALENT BY CONSTRUCTION — a corroborated model
candidate's label is already carried verbatim in engineFact.candidates, so an append-and-dedupe
implementation would produce the identical label SET; the only delta a model could add for an
overlapping label is its own confidence, which §5.1's "engine clarification wins" supersedes.
No behavior change; no test change (existing reconciliation pins stay green).

================================================================================
3. D2 [minor] — re-affirmed disclosure (orchestrator SIGN-OFF recorded, no code action)
================================================================================
The 3 files outside the §7 allow-list remain exactly as disclosed in the worker report §11:
- server/src/compiler/pipeline/CompileContracts.ts — OQ1(a) union site (needs-clarification member).
- server/src/ai/runChatbotCompile.ts — 3-line type annotation keeping the tsc SET identity.
- server/src/compiler/protocolIntent/ProtocolIntentLoweringCharacterization.test.ts — forced by
  §7's own "0 failed" command (and, post-fix1, also the explicit test-seam spine injection).
Sign-off rationale lives in the lane handoff; nothing changed here.

D4 [minor] — no code change (coverage gap inherited from SPINE-3 engine policy: the engine's
explicit_wells strategy clarifies multi-candidate sets, so a >1-well role bars upstream and never
reaches the resolve_roles seam; noted for the record, not a SPINE-4 regression).

================================================================================
4. EXTRA FILES TOUCHED FOR THE INJECTION (expanded §7 ownership, enumerated per ruling)
================================================================================
All outside the original §7 allow-list, each justified by the D1 injection alone:
1. server/src/api/handlers/IntentCompileHandlers.ts — production call site #1: composes the
   store-backed spine and passes deps.spine (ruling (a) names this file explicitly).
2. server/src/api/handlers/IntentCompileFromPromptHandlers.ts — production call site #2: composes
   the store-backed spine and threads it through the from-prompt route's deps (ruling (a) names
   this file explicitly).
3. server/src/compiler/scientistIntent/scientistIntent.test.ts — test file inside the §7 regex
   allow-list (`scientistIntent\.test\.ts$` IS listed): 4 compile legs now inject the declared
   test-seam spine because the silent floor is gone.
4. server/src/compiler/scientistIntent/vocabularyRipOut.test.ts — matches §7's
   `Intent.*\.test\.ts`? NO — it is outside the allow-list; touched only to inject the declared
   test-seam spine into its one compileFromSmallLlm leg (the fail-loud registration otherwise
   throws in that test). Injection-consequence only.
5. server/src/compiler/protocolIntent/ProtocolIntentLoweringCharacterization.test.ts — already a
   disclosed D2 file; fix1 adds only the explicit test-seam spine to its compile leg (same
   injection consequence).
6. server/src/compiler/resolution/spine4ProductionWiring.test.ts — NEW test, inside the §7
   allow-list (`^server/src/compiler/resolution/`).
7. server/src/compiler/resolution/resolveNounsPass.ts — comment-only D3 note, inside the allow-list.
8. server/src/compiler/scientistIntent/compileScientistIntent.ts — inside the allow-list; the
   fail-loud registration + doc-comment correction.
server.ts itself was NOT touched: both route registrars receive the full AppContext (server.ts
:1510-1517 already passes `ctx`), so the composition happens inside the handlers — zero server.ts
diff, zero new wiring at the boot seam.

================================================================================
5. VERIFICATION GATES (all run in <wt>; exact commands + outputs)
================================================================================
G1 RED->GREEN: spine4ProductionWiring.test.ts 3 failed | 1 passed at HEAD (transcript above)
   -> 4/4 green after the fix commit.

G2 `npx vitest run src/compiler/resolution src/compiler/scientistIntent src/compiler/protocolIntent`
   => Test Files 17 passed (17); Tests 173 passed (173); 0 failures.
   (was 16 files/169 at claim; +1 file/+4 tests = the new wiring test.)

G3 `npx vitest run src/api/handlers` => Test Files 4 failed | 41 passed (45); Tests 7 failed | 320 passed.
   Failing-file SET: {ExtractHandlers, MeasurementHandlers.applianceJob, SignatureHandlers,
   WorkspaceHandlers} — pre-existing integration flakes (timestamped record counters, store
   create-call shapes, workspace version drift; none is an Intent* handler).
   SET IDENTITY PROVEN: stash-leg (git stash push -u of the 8 changed paths, suite run on
   pristine HEAD 178077a3, stash pop) => identical 4-file/7-test set; `comm -3` of the two
   FAIL-file sets => EMPTY (exit 0). (Transcripts: /tmp/spine4-fix1-hf-head.txt HEAD leg,
   /tmp/spine4-fix1-hf-headfix.txt HEAD+fix leg.) A first stash run additionally caught
   EventEditorFixHandlers.test.ts once (5 files/8 tests) — a timing-flaky job-phase leg that
   did NOT recur on either measured leg; it is pre-existing and unrelated to SPINE-4. IntentCompileHandlers.test.ts and
   IntentCompileFromPromptHandlers.test.ts are GREEN both sides (the from-prompt golden legs
   still assert needs-clarification against the mock store that CANNOT bind their labware —
   a REAL bar, not the D1 false-bar; the new wiring test proves the same route COMPILES when
   the store CAN bind).
   `npx vitest run src/ai` => Test Files 10 failed | 74 passed (84); Tests 21 failed | 644 passed
   (665). Failing-file SET `comm -3` vs /tmp/spine4-claimgate/gate4b-ai.txt => EMPTY (exit 0) —
   identity 10 files/21 tests holds.

G4 `npm run typecheck -w server | grep 'error TS' | sed 's/([0-9]*,[0-9]*)//' | sort`
   => 26 lines / 6 files; `comm -3` vs /tmp/spine4-claimgate/gate4a-tsc-set.txt => EMPTY (exit 0).
   The route wiring added ZERO tsc errors (capture: /tmp/spine4-fix1-tsc-set.txt).

G5 app diff EMPTY: `git -c core.fileMode=false diff --name-status 0873c47b...HEAD -- app/` => no
   output; working-tree app/ diff => no output.

Spec greps re-run post-fix: `grep -n "store" server/src/compiler/resolution/resolveNounsPass.ts`
=> zero write-capable imports (unchanged; the pass still has NO store dep — the spine is
composed at the HANDLER seam and passed as the read-only EngineSpineLike slice). Hardcode grep
on resolveNounsPass.ts unchanged (comment-only edit added no literals with comparison roles).

================================================================================
6. UNRESOLVED / NOTES FOR THE ORCHESTRATOR
================================================================================
- The reviewer's /tmp/spine4-probe.mts first leg now throws the registration error (expected:
  the script hand-builds route-like deps WITHOUT a spine; the real routes no longer do).
- src/api/handlers has 4 pre-existing failing files at pristine HEAD (proven via stash leg);
  they are outside SPINE-4 scope and unchanged by this fix.
- SPINE-5 (route response contract) still owns exposing `clarifications` in the HTTP payload;
  both handlers keep the 200 + {outcome, terminalArtifacts} shape per spec §4.4.

SPINE-4 FIX1 DONE
