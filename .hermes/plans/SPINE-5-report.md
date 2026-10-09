# SPINE-5 report — wip-l2t1935 (cl-coder, lane 2)

ITEM: SPINE-5 "Headless completion of the existing prompt-compile route: real endpoint,
real settings, clarification contract". Server-only, headless. Spec cited:
`.hermes/plans/2026-10-08_1620-SPINE-5-headless-compile-route-spec-DRAFT-l2t1620.md`
(+ ORCHESTRATOR RULINGS 2026-10-08T17:40 section, binding).

Worktree: /mnt/vast/home/brad/git/wt/SPINE-5-lane2-l2t1935
Branch: spine-5-lane2-l2t1935, base = SPINE-4 merge commit `1eca007c` (claim gate satisfied:
SPINE-4 merged with adversarial ACCEPT r2, fix1 included).
Commits: `a20e40c9` test(SPINE-5): RED → `69af2d7e` feat(SPINE-5): → this report.

---

## 0. Bootstrap incident (recorded honestly)

The dispatched worktree was missing 102 of trunk's 107 untracked/ignored entries (it carried
only node_modules symlinks, .env, server/schema). The first §5 first-check run therefore
FAILED to load the suite:

    Error: Failed to load url ../../ai/materialRefFields.js ... in .../resolution/resolutionEngine.ts

Root cause: trunk carries `server/src/ai/materialRefFields.ts` (+ .test.ts and ~95 other
entries) as untracked symlinks into Brad's live tree; the worktree bootstrap had not
replicated them. Repair per the lane-proven recipe: replicated trunk's untracked/ignored
entries 1:1 (rsync -a, symlinks as symlinks) from the TRUNK worktree (never from Brad's live
tree). Post-repair parity: `comm -3` of `git -c core.fileMode=false status --porcelain -uall
--ignored=matching` between trunk (107 entries) and the worktree (107 entries) => EMPTY.

## 1. Claim gate — §1 name-and-read (ACTUAL merged spellings vs spec-shape)

All reads first-hand in the worktree at base `1eca007c`.

### 1.1 CompileContracts.ts — MATCHES spec-shape exactly
`grep -n "needs-clarification" server/src/compiler/pipeline/CompileContracts.ts` (live output):

    81: * SPINE-4 (OQ1 ruling (a)): 'needs-clarification' is machine-distinguishable
    87:export type CompileOutcome = 'complete' | 'gap' | 'error' | 'needs-clarification';
    90: * Outcomes the CHATBOT pipeline can produce. 'needs-clarification' is the
    97:export type ChatbotCompileOutcome = Exclude<CompileOutcome, 'needs-clarification'>;

Union member spelling is exactly `'needs-clarification'` (:87). No rename needed. Delta vs
spec-shape: none. (Bonus honesty: `ChatbotCompileOutcome` narrows the member OUT for the
chatbot pipeline — SPINE-4 OQ2 ruling; the route consumes the full CompileOutcome.)

### 1.2 compileScientistIntent.ts — clarifications REQUIRED, gaps REPLACED on the bar
`ScientistIntentCompileResult` (:102-110): `{ terminalArtifacts, normalized, outcome,
diagnostics: Array<{severity, code?, message}>, clarifications: ScientistIntentUnresolvedFact[] }`.
- Field name `clarifications` MATCHES spec-shape; optionality: NOT optional — the field is
  always present (empty array when nothing is unresolved). Route-side consequence: presence
  decisions must key on `outcome` + `clarifications.length`, never on field presence.
- Bar arm (:239-255): on the `unresolved_arguments` diagnostic the runner returns outcome
  `'needs-clarification'` with terminalArtifacts = `{events:[], directives:[], gaps:[]}` +
  `protocolIntent` (the PARSED semantic plan is kept; every artifact-bearing slot absent —
  OQ3(a) zero-artifact CONFIRMED), clarifications read VERBATIM from the bar diagnostic's
  `details.clarifications`. Gaps are REPLACED on the bar (gaps:[] — the stringified
  error-diag gaps are NOT presented). Delta vs spec-shape: spec said "verify whether gaps
  are replaced" — CONFIRMED replaced.
- Non-bar arm (:306): `clarifications: nounsOutput?.clarifications ?? []`.

### 1.3 resolveNounsPass.ts + engine surface — clarification/failure shapes
- `ResolveNounsOutput` (:85-92): `{ bindings, resolvedByLabel, clarifications:
  ScientistIntentUnresolvedFact[], failures: EngineFailure[], blocked }`.
- Bar diagnostic (:292-300): ok:false, ONE error diagnostic `code:'unresolved_arguments'`
  (`UNRESOLVED_ARGUMENTS_CODE`), `details: { clarifications }`. `blocked = clarifications.length > 0`
  (:283) — the bar invariant used by the OQ2 audit (§6 below).
- `EngineFailure` (resolution/types.ts:83-88): `{ kind:'lookup_error', adapter, term, message }`
  — MATCHES the spec's cite. HOW lookup_error surfaces to the compile result: it does NOT
  surface as a clarification reason code and the route never sees failures directly (the route
  consumes only the compile result). A failing tier sets `sawFailure` in the engine
  (resolutionEngine.ts:169,207) which produces a clarification with reason
  `'resolution-lookup-failed'` (a ScientistIntentUnresolvedFact) — i.e. a lookup error bars
  via a clarification, and the route presents it verbatim inside `clarifications`. The
  `failures` array itself stays pass-internal. Verified empirically (spike: bar payload
  clarification reason 'unknown-noun' with mint-affordance candidates; lookup-failure arm is
  engine-tested in nounResolution.test.ts:484).
- Reason codes observed (engine, data-side): 'unknown-noun', 'ambiguous-noun',
  'resolution-lookup-failed', 'unknown-address', 'action-location-unreliable',
  'missing-required-argument' (MISSING_REQUIRED_ARGUMENT_REASON). The route switches on NONE
  of them (bait §7.5 respected).

### 1.4 pipeline/types.ts PassDiagnostic
:24-30 `{ severity:'info'|'warning'|'error', code:string, message, pass_id, details? }`.
The route reads NO diagnostic code directly for classification — it switches on
`compile.outcome` (union member) + error ORIGIN only. It DOES read `compile.diagnostics`
severity==='error' messages to compose the 500 `message` string (presentation only, no
switching on codes).

### 1.5 Post-SPINE-4 state of the two route test files
- `IntentCompileFromPromptHandlers.test.ts` at base: 159 lines, 4 tests. SPINE-4 ALREADY
  migrated two expectations to the bar: test 3 pins `outcome:'needs-clarification'` +
  `events:[]` at 200 ("SPINE-5 DELIBERATE GOLDEN CHANGE" comment), test 4 pins zero-artifact
  keys. NOT double-migrated: I kept both tests' identities and re-pinned only their STATUS
  (200 → 422) plus fixture adjustment for test 3 (see §7 golden diffs).
- `IntentCompileHandlers.test.ts` at base: 84 lines, 2 tests (complete-with-events + 422
  invalid-doc). Untouched by this item; still green (bait §7.8: sibling route left alone).

### 1.6 STOP-AND-REPORT conditions: NEITHER fired
(a) needs-clarification member PRESENT; sibling /intent/compile carries its own (correct,
different trust position) contract — untouched. (b) compile result DOES expose structured
clarifications (`clarifications: ScientistIntentUnresolvedFact[]`, verbatim from the engine).

## 2. §5 first targeted check (live output, on the repaired base)

    $ grep -n "needs-clarification" server/src/compiler/pipeline/CompileContracts.ts
    81: * SPINE-4 (OQ1 ruling (a)): 'needs-clarification' is machine-distinguishable
    87:export type CompileOutcome = 'complete' | 'gap' | 'error' | 'needs-clarification';
    90: * Outcomes the CHATBOT pipeline can produce. 'needs-clarification' is the
    97:export type ChatbotCompileOutcome = Exclude<CompileOutcome, 'needs-clarification'>;

    $ npx vitest run src/api/handlers/IntentCompileFromPromptHandlers.test.ts
     ✓ src/api/handlers/IntentCompileFromPromptHandlers.test.ts  (4 tests) 42ms
     Test Files  1 passed (1)
          Tests  4 passed (4)

(First attempt before the §0 bootstrap repair failed with the materialRefFields load error;
the green above is on the parity-verified base.)

## 3. Fresh §8 SET captures ON MY BASE (claim-time, pre-diff)

- Server tsc: `npm run typecheck -w server 2>&1 | grep 'error TS' | sed 's/([0-9]*,[0-9]*)//' | sort`
  => 26 lines / 6 files (AgentOrchestrator 8, RecordStoreImpl 11, AuthoringGuard 3,
  ProtocolIntakeHandlers 2, RecordHandlers 1, bootstrapAdmin 1).
  sha256(/tmp/spine5-tsc-claim.txt) = 924c18bd566d539571f6bba7b4b480cffdf3bf82383200f85b893b22d52b9e41
  — byte-identical to the composer's trunk capture (SPINE-4 merge did NOT move the tsc set).
- src/ai failing-FILE SET: 10 files / 21 failed tests — AgentOrchestrator.bypass,
  AgentOrchestratorForwarding, AgentOrchestrator.golden, AgentOrchestrator.goldenWithSeeds,
  AgentOrchestrator.tubeGate, ChatbotCompileDeckSlot, chatbotCompile.e2e, InferenceClient.config,
  materialFollowUp, submitSuggestionTool.tubeSchema. MATCHES the carried 10/21 exactly.
- scientistIntent+protocolIntent: 12 files / 113 tests GREEN (matches carried pin).
- resolution: 2 failing files / 5 failed tests (resolveNounsPass.test.ts 3,
  spine4Registration.test.ts 2). CARRIED BASE DEFECT, see §8.
- app tsc: 34 error lines / 24 files (matches the carried 34-err pin; app diff EMPTY).

## 4. RED evidence (before GREEN)

RED run at `a20e40c9` (test file only, handler untouched):

    FAIL ... > createIntentCompileFromPromptHandlers > bars instead of surfacing labwareAdditions ... (SPINE-4 OQ3: total zero-artifact)
    FAIL ... > intent-compile-api.needs-clarification > intent-compile-api.needs-clarification
    FAIL ... > intent-compile-api.malformed-model-output > intent-compile-api.malformed-model-output
    FAIL ... > intent-compile-api.compile-server-error > intent-compile-api.compile-server-error
     Test Files  1 failed (1)
          Tests  4 failed | 7 passed (11)

The 4 REDs are exactly the contract arms the base route lacks (422 bar status x2, 502
malformed, 500 INTENT_COMPILE_FAILED). The 7 passing at RED are the characterization pins
(400, ask-branch, success re-pin with resolving fixture, gap-additive, settings,
no-execution) — they pin behavior the contract must NOT change.

GREEN after `69af2d7e`:

    ✓ src/api/handlers/IntentAcceptHandlers.test.ts  (2 tests)
    ✓ src/api/handlers/IntentCompileHandlers.test.ts  (2 tests)
    ✓ src/api/handlers/IntentCompileFromPromptHandlers.test.ts  (11 tests)
     Test Files  3 passed (3)
          Tests  15 passed (15)

Plus `src/compiler/resolution/spine4ProductionWiring.test.ts` (the SPINE-4 fix1 test that
invokes THIS handler): 4 passed — the contract change did not break the wiring proof.

## 5. The implemented contract (handler diff, 124 insertions / 7 deletions)

Origin-based classification seam (no message-substring switching):
- ScientistIntentValidationError escaping the compileFromSmallLlm CALL SITE → 502
  `{ error:'MALFORMED_MODEL_OUTPUT', message }` (OQ1(a)). NO outcome/clarifications/
  localMacro/terminalArtifacts keys.
- compile.outcome === 'needs-clarification' → 422 `{ error:'NEEDS_CLARIFICATION', outcome,
  clarifications (verbatim), localMacro (OQ4(a) hold-the-macro), terminalArtifacts
  (zero-artifact) }`. NO axes key (ask channel only, bait §7.1).
- compile.outcome === 'error' → 500 `{ error:'INTENT_COMPILE_FAILED', message }` (message
  composed from error-severity diagnostic messages; distinct from the KEPT catch-all
  INTENT_COMPILE_PROMPT_FAILED, which still covers the ask-branch catch and unforeseen throws).
- 'complete' | 'gap' → 200, today's shape unchanged; `clarifications` attached ONLY when
  outcome==='gap' AND compile.clarifications.length>0 (OQ2(a) additive; conditional spread,
  exactOptionalPropertyTypes idiom — key ABSENT otherwise, never undefined).
- Ask/answer branch: byte-unchanged (200, needsAnswers/axes/sourceProtocolId conditional spread).
- Response contract types exported INSIDE the handler file (SuccessResponse /
  NeedsClarificationResponse / MalformedModelOutputResponse / CompileFailedResponse)
  consuming ScientistIntentUnresolvedFact + TerminalArtifacts verbatim. NO new YAML, NO
  second clarification type, NO new route, NO registration change.
- toInferenceConfig untouched: fallback literals 'http://127.0.0.1:8899/v1' and 'lfm2.5-2.6b'
  byte-identical (OQ3(a)); comments say "active AI profile", no model names added.

## 6. OQ2 gap-reachability audit (on MERGED code, claim-time) — FINDING

'gap' IS REACHABLE for model-emitted intents post-SPINE-4. Mechanism (compileScientistIntent
:238-255 vs :257-307 + resolveNounsPass :283 + normalizeScientistIntent :199-205):
a model-declared `unresolved` item naming a noun the ENGINE binds authoritatively is DROPPED
by reconcileModelUnresolved (superseded hedge → clarifications empty → blocked=false → no bar),
while normalizeScientistIntent's `unresolvedRefs` (built from the raw parsed doc, independent
of reconciliation) still feeds gatherGaps → gaps.length>0, no error diagnostics → outcome 'gap'.
Empirically pinned (spike + test `intent-compile-api.gap-additive`: serial_dilution with a
'standards' hedge against a store that owns 'standards' → 200, outcome 'gap', gaps[1] present).

Additive-clarifications reachability: on ANY non-bar outcome compile.clarifications is
PROVABLY empty — the pass output slot exists only for ok:true, ok:true ⟺ blocked=false ⟺
clarifications.length===0 (resolveNounsPass:283,303), and the non-bar arm reads
nounsOutput?.clarifications ?? []. So the OQ2(a) additive arm is a forward-compatible no-op
today; the route implements the ruling's mapping verbatim and the test pins the observable:
gap → 200, gaps present, `clarifications` key ABSENT (nothing to add). NOT absorbed: the bar
does NOT absorb every unresolved path — only engine-visible unresolved slots bar; superseded
model hedges land on 'gap'.

## 7. Deliberate golden re-pins (before/after)

1. `compiles to localMacro + terminalArtifacts when answers present (verb-lift applied)`
   BEFORE (SPINE-4 merge): fixture store could not bind 'MagBinding Buffer'/'block'/
   'magstand' → pinned outcome 'needs-clarification' + events:[] at 200.
   AFTER: FIXTURE adjusted (stub store now owns the three named labware — spec §4: adjust
   fixtures, not expectations) → outcome 'complete', 200, events>0, verb-lift + numeric
   coercion pins preserved.
2. `bars instead of surfacing labwareAdditions ...`
   BEFORE: 200 + outcome 'needs-clarification' + zero-artifact keys.
   AFTER: 422 + error NEEDS_CLARIFICATION + same zero-artifact key assertions. Status-only
   re-pin; the SPINE-4 zero-artifact expectation is kept intact.
3. Malformed arm: BEFORE 500 INTENT_COMPILE_PROMPT_FAILED (spike-verified on base);
   AFTER 502 MALFORMED_MODEL_OUTPUT (OQ1(a)).
4. Body-discriminator assertion refined vs spec wording: the §3 table's 422 body has NO
   `message` key, so the 502/422 shared-field set is exactly ['error'] — a STRONGER
   distinction than "no shared fields beyond message". Pinned as `toEqual(['error'])` with
   the reasoning in a test comment.

## 8. Carried baseline defects (NOT mine; routed to orchestrator)

A. TRUNK FIXTURE TRIPLET INCOMPLETE → resolution suite red ON THE BASE (carried):
   `server/src/compiler/resolution/fixtures/vocab-required-flip/` carries only
   `scientist-intent-vocabulary.yaml` (tracked, sha cfb1ca2b…); the loader requires the
   triplet (.schema.yaml + .lint.yaml) and throws "vocabulary triplet is required". The two
   missing files exist UNTRACKED in the SPINE-4 coder's worktree
   (wt/SPINE-4-lane2-l2t1710: lint sha e8d1f76e…, schema sha e6bd314b…) and were never
   committed to trunk. Effect at base AND at HEAD (identical): resolveNounsPass.test.ts 3
   failures + spine4Registration.test.ts 2 failures (5 failed | 168 passed, 2 files failed).
   My diff cannot touch these (route-side only; compiler/** is SPINE-3/4 turf, edits
   forbidden by ownership). FIX OWNERSHIP: whoever owns SPINE-4's fixture hygiene — commit
   the two triplet files to trunk. I did NOT copy them into my worktree (ownership gate).
B. Worktree bootstrap gap (§0) — orchestrator bootstrap step missed the trunk untracked
   replication; repaired here per the lane recipe.

## 9. §6 verification commands — final outputs (both sides of every commit)

1. Three intent route files: 3 files / 15 tests PASSED (shown §4).
2. scientistIntent+protocolIntent: `Test Files 12 passed (12) / Tests 113 passed (113)` —
   matches carried pin, zero new failing files.
3. resolution: 2 failed files / 5 failed tests — SET IDENTITY vs claim-time capture
   (same 2 files, same 5 tests; carried defect §8.A).
4. Server tsc: post-diff capture 26 lines / 6 files; `comm -3 claim post` => EMPTY;
   sha256 identical (924c18bd…). Non-zero exit by design; none of the owning files appear.
5. src/ai: `Test Files 10 failed | 74 passed (84) / Tests 21 failed | 644 passed (665)`;
   failing-FILE SET comm-3 vs claim-time capture => EMPTY (10/21, same 10 files).
6. app tsc: 34 error lines / 24 files (carried pin holds); `git -c core.fileMode=false
   diff --name-only 1eca007c..HEAD -- app/` => EMPTY (0 files).
7. Ownership gate: `git -c core.fileMode=false diff --name-only 1eca007c..HEAD | grep -v -E
   '^server/src/api/handlers/IntentCompileFromPromptHandlers(\.test)?\.ts$|^\.hermes/plans/'`
   => EMPTY. Tracked diff = exactly the two owned files.

## 10. §7.5/§7.6 greps (verbatim)

Tier/size literals (handler file vs base file):
    HEAD :92:      ?? 'lfm2.5-2.6b',        (baseUrl fallback :90-91 byte-identical too)
    BASE :67:      ?? 'lfm2.5-2.6b',
    diff '+' lines tier grep => NO NEW TIER LITERALS
Verb literals:
    grep over handler FILE => zero verb literals (classification switches on outcome union
    members + error origin only)
    grep over HANDLER diff '+' lines => zero
    (verb names appear only in TEST stub fixtures as model-emitted data — the pre-existing
    pattern from the base test file, unchanged in kind)
Import barrier (proof (b)):
    grep -nE "^import|^export .* from" .../IntentCompileFromPromptHandlers.ts | grep -E
    "IntentAcceptHandlers|AgentOrchestrator|Foundry|/runs?/|chat/" => no forbidden imports
    (mirrored as a source-regex test, lane drift-pin idiom)
Store writes:
    grep -nE "store\.(create|update|delete|history)" handler => NO STORE WRITE CALLS

## 11. Proof-strategy transcripts

Settings (T-settings-1/-2/-3, all green):
- Construction leg: NO deps.llmClient/baseUrl/model; ctx.appConfig.ai = { activeProfile:
  'lab-a', inference:{fallback}, profiles:{'lab-a':{inference:{baseUrl:
  'http://configured-host:9/v1', model:'configured-model-name'}}}}; ONLY the
  createInferenceClient factory seam mocked; called exactly once with the ACTIVE PROFILE's
  baseUrl+model (resolveAiProfile ran REAL).
- Invocation leg: injected recording client + same config → every complete() (branch-questions
  AND one-shot) carries model==='configured-model-name'.
- Precedence + no-tier pin: ai.smallModel wins over active profile (characterization);
  unconfigured-deployment fallback pinned byte-identical ('http://127.0.0.1:8899/v1' /
  'lfm2.5-2.6b') — OQ3(a), zero new tier literals in the diff.
Write-spy zeros (proof (a)): mockStore carries create/update/delete/history spies that THROW
if called; every branch test asserts zeroWrites (400, ask, success, needs-clarification,
malformed, error, gap, settings legs). Accept-receipt scan (proof (c)): no payload contains
ok/recordId/localProtocol/acceptToken keys. Import barrier (proof (b)): §10 + test.
Seams honesty (bait §7.10): only the model client + the record store are stubs; vocabulary
YAML, Ajv validator, lift, resolve_nouns pass, SPINE-3 engine, store-backed spine, and every
deterministic pipeline pass run REAL in the success/clarification/gap/error tests (the success
test asserts store.list was really consulted for labware kinds).

## 12. Reviewer-bait pre-emptions applied

1. needsAnswers channel untouched + characterization-pinned (keys asserted disjoint).
2. exactOptionalPropertyTypes: conditional spreads at every send site; tests assert key
   ABSENCE via Object.keys, never toEqual-with-undefined.
3. No shipped schema/vocabulary/pipeline mutation in tests; clarification outcomes driven via
   stub model + mock store only. No :3093 probing.
4. Clarifications/candidates pass VERBATIM; test asserts no recordId/id minted on items.
5. Classification switches on error ORIGIN + outcome member only; no reason-code string
   matching in the route.
6. No model-family literal in any new line; comments say "active AI profile".
7. No response-schema YAML, no second clarification type (types re-export ScientistIntent-
   UnresolvedFact inside the handler file).
8. Sibling /intent/compile untouched (its test green).
9. Golden-silent drift: the SPINE-4-pinned 200-bar fixtures were explicitly re-pinned with
   before/after recorded (§7), not silently inherited.
10. Pipeline never mocked in the success test (factory seam only).
11. No accept payload, no acceptToken, no IntentAcceptHandlers import.

## 13. Unresolved / routed items

- §8.A trunk fixture-triplet defect (resolution suite 5 red on base and HEAD): needs the two
  vocab-required-flip triplet files committed to trunk by SPINE-4's owner. Not fixable inside
  SPINE-5 ownership.
- Stack restart / live-stack behavior: orchestrator's job (not probed per contract).
- app consumer (client.ts `outcome?: string`) needs no change (additive widening verified by
  EMPTY app diff + unchanged app tsc); any UI consumption of the new 422/502 arms is a later
  item (headless bar).

SPINE-5 DONE
