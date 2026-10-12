# SPINE-5 — Headless completion of the existing prompt-compile route: real endpoint, real settings, clarification contract
Spec DRAFT (lane 2, composer l2t1620) — 2026-10-08. Draft only; orchestrator reviews and promotes.
Worker: cl-coder. Server-only, headless — NO UI, NO browser gate. Every file:line below was
re-read FIRST-HAND by the composer in the lane trunk checkout /mnt/vast/home/brad/git/cl-integration-2
at branch cl/integration-2, docs tip 85270387 / CODE tip fac6648e (verified
`git -c core.fileMode=false diff --stat 39a5311b..fac6648e -- ':!.hermes'` = 6 files +328/-1,
PB-CH-5fix app-side only — no server/compiler drift since SPINE-2's merge 39a5311b). No scout
output is cited anywhere. See Appendix A for the cite-verified log and the end-of-draft re-verify.

## 0. Goal (one sentence)
Extend the EXISTING POST /intent/compile-from-prompt handler with the SPINE-1/SPINE-4 response
contract — machine-readable success vs needs-clarification (422, repo validation convention) vs
malformed-model-output vs compile-server-error, clarification payloads exactly
ScientistIntentUnresolvedFact[] — while keeping the model source exactly what it is today (the
ACTIVE AI profile via resolveAiProfile, no size/tier assumptions per PROTO-AI-13), the ask/answer
branch round-trip byte-identical, and the structural guarantees "never executes a run, never
auto-accepts a proposal, no chat/UI wiring" pinned by named tests.

## 1. Claim gate + contested-state honesty (READ FIRST)
Claim gate = SPINE-1 + SPINE-2 MERGED (both DONE: SPINE-1 b36f914a, SPINE-2 39a5311b) AND
SPINE-4 MERGED with its adversarial ACCEPT. Base >= SPINE-4's merge commit. Today SPINE-4 is
SPEC-PROMOTED ONLY (.hermes/plans/2026-10-08_1605-SPINE-4-resolution-pass-registration-spec.md,
orch rulings 2026-10-08T16:05 binding: OQ1=(a) 'needs-clarification' union member, OQ2=NO
chatbot registration, OQ3=(a) total zero-artifact on bar) and SPINE-3 is in its adversarial FIX
cycle — NEITHER'S internals are frozen contracts. THIS SPEC CITES THEM AS SPEC-SHAPE, NOT FACT:

CONSUMER-VISIBLE FIELDS THAT ARE SPEC-SHAPE TODAY AND MUST BE CODER-VERIFIED AT CLAIM, by
reading the actual SPINE-3/SPINE-4 MERGE files (name-and-read, in this order):
1. `server/src/compiler/pipeline/CompileContracts.ts` — CompileOutcome must actually read
   `'complete' | 'gap' | 'error' | 'needs-clarification'` (today at fac6648e it is
   'complete'|'gap'|'error' — :78, re-read). One-line claim check:
   `grep -n "needs-clarification" server/src/compiler/pipeline/CompileContracts.ts` => non-empty.
   If the merge landed a different member spelling, THAT spelling is the contract; do not rename.
2. `server/src/compiler/scientistIntent/compileScientistIntent.ts` — ScientistIntentCompileResult
   (today :69-74: {terminalArtifacts, normalized, outcome, diagnostics}; re-read). SPINE-4's
   spec §3 adds `clarifications: ScientistIntentUnresolvedFact[]`; verify the field name, optionality,
   and whether gaps are REPLACED on a bar before writing the route mapping.
3. `server/src/compiler/resolution/resolveNounsPass.ts` + the engine surface SPINE-3's merge
   shipped under `server/src/compiler/resolution/` (engine signature, clarification + failure
   shapes: SPINE-3 promoted spec §5.1/§5.6 cite clarifications ARE ScientistIntentUnresolvedFact
   and failures `[{kind:'lookup_error', adapter, term, message}]`) — the route must NOT reach into
   these; it consumes them ONLY through the compile result. Verify how lookup_error surfaces to
   the compile result (clarification reason code vs diagnostic) and map it per §3's table.
4. `server/src/compiler/pipeline/types.ts` PassDiagnostic (:24-30 today) — IF the route reads any
   diagnostic code directly (recommended: it should not), the exact codes are the merge's.
5. The two route test files the SPINE-4 merge touched (§6 of that spec predicts behavior-only
   fixture edits): `IntentCompileFromPromptHandlers.test.ts`, `IntentCompileHandlers.test.ts` —
   read their post-SPINE-4 state before extending, so expectations are not double-migrated.
STOP-AND-REPORT conditions at claim: (a) needs-clarification member absent or the sibling
/intent/compile route already carries a different response contract; (b) the compile result does
NOT expose structured clarifications (only stringified gaps) — that is a SPINE-4 defect, report,
do not re-derive clarifications in the route.

## 2. Scope — file ownership
IN SCOPE (the only tracked files this item may edit):
- server/src/api/handlers/IntentCompileFromPromptHandlers.ts (189 lines at fac6648e; route POST
  registered at :189 by registerIntentCompileFromPromptRoutes :187-190; compileFromSmallLlm call
  site :163; active-profile config resolution toInferenceConfig :44-70; ask/answer branch
  :138-158; success send :170-175; catch-all 500 :176-182).
- server/src/api/handlers/IntentCompileFromPromptHandlers.test.ts (151 lines, 4 tests today —
  400 requires-protocolText :90-95; needsAnswers/axes round-trip :97-108; one-shot compile with
  verb-lift + numeric coercion pins :110-127; labwareAdditions-in-artifacts :129-151. SPINE-1's
  spec :135 explicitly earmarks this file as "SPINE-5's turf; do not extend here [SPINE-1]" —
  that hour has come: this item EXTENDS it).
- The response-contract type: exported interface(s) INSIDE the handler file (SuccessResponse /
  NeedsClarificationResponse / MalformedModelOutputResponse / error envelopes). There is NO
  separate SPINE-1 "response-contract module" — SPINE-1 froze the clarification shape in
  server/src/compiler/scientistIntent/types.ts (ScientistIntentActionLocation :107-111,
  ScientistIntentUnresolvedFact :113-118, both re-read) and the schema
  schema/workflow/scientist-intent.schema.yaml (unresolved :165+, actionLocation :180-187,
  217 lines). SPINE-5 CONSUMES those types verbatim; it mints NO second schema, NO YAML envelope.
OUT OF SCOPE (explicit):
- server/src/api/handlers/IntentCompileFromPromptHandlers.ts's siblings: IntentCompileHandlers.ts
  (POST /intent/compile — different consumer: client-supplied intent YAML, where a validation
  failure IS a client error and today's 422 SCIENTIST_INTENT_VALIDATION :63-68 is correct),
  IntentAcceptHandlers.ts (POST /intent/accept — the accept path; the one store.create on this
  seam lives at :95, reached ONLY by a separate later request, re-read), server.ts registration
  (:1510-1517, route path unchanged).
- server/src/compiler/** (SPINE-3/4 turf — imports allowed, edits forbidden),
  intentCompile.ts (compileFromSmallLlm :244-347: malformed output ALREADY signals itself as
  ScientistIntentValidationError — thrown via `throw retryError` :336 after PLAIN_TEXT_ATTEMPTS=3
  :298, and 'scientist-intent emission produced no usable intent' :341-345; the route classifies,
  the driver stays untouched), schema/**, app/** (MUST be 0-file diff; the existing consumer
  app/src/shared/api/client.ts:3946-3961 types `outcome?: string` so contract widening needs
  ZERO app edit — touching it is itself the UI-wiring violation), chat/AgentOrchestrator wiring,
  run execution endpoints, chatbot pipeline.
- NO new route. The expert draft's /api/scientist-intent/compile is DEAD (task-list grounding
  correction); this item EXTENDS the route that exists.

## 3. The endpoint contract (three outcomes + the honest leftovers)
Machine-readable discriminator = HTTP status + stable `error`/`outcome` code (the repo pattern:
every error body is {error: CODE, message, ...extras}). Status convention VERIFIED, not assumed:
422 is the repo's validation-failed convention (30+ non-test sites, e.g. RecordHandlers.ts:477
INITIAL_STATE_REQUIRED, and THIS family's own IntentCompileHandlers.ts:64 SCIENTIST_INTENT_VALIDATION);
400 stays for malformed REQUEST bodies (route's own PROTOCOL_TEXT_REQUIRED :129); 502 is the repo's
upstream-endpoint-fault convention (OntologyHandlers.ts:81,:125; LabSyncHandlers.ts:46,:64); 500 is
server-fault (route's own INTENT_COMPILE_PROMPT_FAILED :178). The task's proposed 422 for
needs-clarification FITS the verified convention. Adopted mapping (answer-shape stays
additive-compatible with the existing success body):

| state (post-SPINE-4 compile) | status | machine-readable body |
|---|---|---|
| success: outcome 'complete' | 200 | `{ outcome:'complete', terminalArtifacts, localMacro, axes }` (today's shape :170-175, unchanged; clarifications ABSENT as a key, not undefined) |
| needs-clarification: outcome === the SPINE-4 union member (spec-shape 'needs-clarification'; verify §1.1) | 422 | `{ error:'NEEDS_CLARIFICATION', outcome:'needs-clarification', clarifications: ScientistIntentUnresolvedFact[], localMacro, ...(terminalArtifacts empty-on-bar per SPINE-4 OQ3(a)) }` — clarifications verbatim from the compile result (§1.2): items {label, reason, candidates?[{label, confidence?}], actionLocation?{actionIndex?, action?, argument?}}; no route-side invention of labels/candidates/ids |
| malformed-model-output: ScientistIntentValidationError (or lift/parse failure) escaping compileFromSmallLlm | 502 (OQ1; 422-discriminator alternative there) | `{ error:'MALFORMED_MODEL_OUTPUT', message, attempts? }` — NO outcome field, NO clarification list, NO partial macro presented as anything |
| compile machinery broke: outcome 'error' after a PARSED intent, or unexpected throw | 500 | `{ error:'INTENT_COMPILE_FAILED', message }` (new code, distinct from today's catch-all INTENT_COMPILE_PROMPT_FAILED which stays for the ask-branch and unforeseen throws) |
| ask/answer branch (no answers) | 200 UNCHANGED | `{ needsAnswers:true, axes, sourceProtocolId? }` — characterization-pinned; extraction failure stays non-fatal axes:[] (:149-152) |
| outcome 'gap' if still reachable post-SPINE-4 | OQ2 (claim-time audit) | recommendation: 200 + `clarifications` attached when the compile result carries them (back-compat), assert unreachability if the audit proves the bar absorbs it |

CRITICAL CLASSIFICATION SEAM (route-side, origin-based, ~10 lines): a ScientistIntentValidationError
raised from the compileFromSmallLlm call site (:163) is MODEL output (502 MALFORMED_MODEL_OUTPUT);
an error surfacing from the compile RESULT object is the compile's (422/500 per table). Do not
classify by message substring. The route must remain WRITE-FREE: its only store use is
loadLabInventory's read-only store.list (:85-119) — keep it so.

PROOF STRATEGY — never-executes / never-auto-accepts (criterion no-execution-no-acceptance):
(a) mockStore gains create/update/delete/history spies; every one of the five tests asserts ZERO
write calls after every request (ask-branch, success, needs-clarification, malformed, 400);
(b) import-barrier test: the handler module imports NOTHING from IntentAcceptHandlers, run/runs
handlers, AgentOrchestrator, or Foundry* modules (assert via a grep gate in the report AND a
source-regex test like the lane's existing drift pins); (c) response-shape: no success payload
contains a recordId/runId/ok:true accept-receipt field (the accept seam is IntentAcceptHandlers.ts,
a DIFFERENT endpoint, server.ts :1516-1517 comment "persist accepted local-protocol" — the route
must not absorb it).

PROOF STRATEGY — active-profile-from-settings (criterion current-model-settings), WITHOUT
mocking the selection away:
- T-settings-1 (construction leg): do NOT mock resolveAiProfile or InferenceClient's internals;
  set ctx.appConfig.ai = { activeProfile:'lab-a', inference:{fallback noise}, profiles:{'lab-a':
  {inference:{baseUrl:'http://configured-host:9/v1', model:'configured-model-name'}}} }, build
  handlers with NO deps.llmClient and NO deps.baseUrl/model, and vi.mock ONLY the module seam
  createInferenceClient (server/src/ai/InferenceClient.js — the route's driver factory, imported
  at handler :24, invoked at :136) to return a recording stub; assert it was called exactly once
  with config.baseUrl==='http://configured-host:9/v1' AND config.model==='configured-model-name'
  (resolveAiProfile at server/src/config/types.ts:235-239 runs REAL — it is 5 lines of active-
  profile lookup; mocking it would mock away the very thing under test).
- T-settings-2 (invocation leg): with deps.llmClient injected and the SAME active-profile config,
  the recording client must show every complete() request (both the branch-questions call :143-147
  and the one-shot call :163-169) carrying model==='configured-model-name' (args.model threading
  verified at intentCompile.ts:252, baseRequest.model; the forced-tool call :265-269 and plain-text
  retries :302-305 reuse baseRequest).
- T-settings-3 (precedence + no-tier pin): active profile + ai.smallModel present => smallModel
  wins (:59-66 order, characterization); and a source-grep gate: the handler's NEW diff lines
  introduce ZERO model-name/tier literals (existing last-resort fallback '127.0.0.1:8899/v1'
  :62 / 'lfm2.5-2.6b' :66 are OQ3 — kept byte-identical, characterization-pinned, nothing new).

## 4. Acceptance-criteria-to-test map (verified-by verbatim, task-list.md:3379-3385)
All five named tests live in server/src/api/handlers/IntentCompileFromPromptHandlers.test.ts,
named EXACTLY (the lane greps for them):
1. `intent-compile-api.success` — controlled model adapter (stub llmClient emitting a
   emit_scientist_intent tool_call whose nouns resolve against the mock store's labware list)
   THROUGH THE REAL ROUTE = the registered handler at the real path (server.ts:1516-1517
   registers registerIntentCompileFromPromptRoutes POST /intent/compile-from-prompt; lane test
   convention = direct handler invocation with the file's existing mock-request/mock-reply
   harness :17-35 — same harness PROTO-AI-5 mirrors as "supertest against real handlers").
   Asserts: 200; payload.outcome==='complete'; localMacro.actions present; terminalArtifacts.
   events.length>0; a RESOLVED recordId from the stub store appears in the artifacts (real
   vocabulary YAML + real parse + real SPINE-4-registered pipeline run — nothing mocked but the
   model endpoint).
2. `intent-compile-api.needs-clarification` — stub emits a document whose one noun the engine
   cannot bind (per SPINE-4's bar; mock store list returns no matching labware for that label);
   asserts 422, error==='NEEDS_CLARIFICATION', clarifications non-empty IN THE §3 SHAPE with
   actionLocation when the union member carries one, Object.keys(terminalArtifacts) contains NO
   artifact-bearing keys (SPINE-4 OQ3(a) zero-artifact), store write spies zero.
3. `intent-compile-api.malformed-model-output` — stub returns un-parseable tool-call args AND
   junk plain text on all 3 retries (drives intentCompile.ts:298-337 to exhaustion); asserts the
   §3 malformed status/code, the body has NO clarifications key and NO outcome key (i.e.
   distinguishable from resolution uncertainty at body level, not just status), and a second case
   proves the 502 body ≠ the 422 body byte-shape (no shared fields beyond message).
4. `intent-compile-api.current-model-settings` — T-settings-1/-2 above (construction + invocation
   legs), plus the smallModel-precedence characterization.
5. `intent-compile-api.no-execution-no-acceptance` — over ALL branches (400, ask, success,
   clarification, malformed): write-spy zeros, import-barrier source pin, no accept-receipt
   fields in any payload.
Deliberate behavior re-pins expected (handoff before/after, no rubber-stamp): today a compile
whose outcome is 'error' or 'gap' returns 200 with artifacts (:170-175, unpinned in this file
today); the success-path existing tests :110-151 keep passing ONLY if their fixtures land on
'complete' after SPINE-4 (stub nouns must resolve — adjust fixtures, not expectations, where
possible); any genuinely-changed golden gets its diff in the report.

## 5. First targeted check (proves the approach early)
At claim, on the fresh worktree BEFORE writing code:
`grep -n "needs-clarification" server/src/compiler/pipeline/CompileContracts.ts && npx vitest run src/api/handlers/IntentCompileFromPromptHandlers.test.ts` (from <wt>/server)
=> the grep line proves SPINE-4's union landed (the dependency this route rides); the suite green
proves the SPINE-4 merge left the route's 4 tests standing, so any later red is THIS item's.

## 6. Verification commands (final, expected outputs — vitest ONLY from <wt>/server)
- `cd <wt>/server && npx vitest run src/api/handlers/IntentCompileFromPromptHandlers.test.ts src/api/handlers/IntentCompileHandlers.test.ts src/api/handlers/IntentAcceptHandlers.test.ts` => 0 failures (this item's file + both sibling intent routes untouched-green).
- `cd <wt>/server && npx vitest run src/compiler/scientistIntent src/compiler/protocolIntent src/compiler/resolution` => 0 failures (SPINE-1/3/4 suites still green under route-side edits — route edits cannot reach them, so any red here is mis-scope; claim baseline per handoff: scientistIntent+protocolIntent 12 files/113 tests GREEN).
- `cd <wt>/server && npx vitest run src/ai` => failing-FILE SET identical to claim-time capture (§8; carried 10 files / 21 failed tests).
- `cd <wt> && npm run typecheck -w server 2>&1 | grep 'error TS' | sed 's/([0-9]*,[0-9]*)//' | sort` => `comm -3` EMPTY vs the coder's OWN claim-time capture (§8); non-zero exit by design — record, never demand green. NONE of the owning files may appear in this item's diff.
- `cd <wt> && npm run typecheck -w app` => unchanged vs carried 47-out/34-err pin AND `git -c core.fileMode=false diff --name-only <base>..HEAD -- app/` => EMPTY.
- Ownership gate: `git -c core.fileMode=false diff --name-only <base>..HEAD | grep -v -E '^server/src/api/handlers/IntentCompileFromPromptHandlers(\.test)?\.ts$|^\.hermes/plans/'` => EMPTY (stricter than SPINE-4's — this item is ONE source file + its test).
- Hardcode/tier greps (reviewer bait §7.6): `grep -nE "'(lfm2\.5|qwen|Ornith|350M|2\.6b|3B)|small.?model' *[=(]" server/src/api/handlers/IntentCompileFromPromptHandlers.ts` vs the base file => no NEW tier/size literal beyond the OQ3-kept fallback; verb-literal grep over the diff => zero.

## 7. Reviewer bait (likely edge errors for THIS item — pre-empt in code + report)
1. needsAnswers IS NOT needs-clarification. The ask/answer round-trip (:138-158, branch-question
   axes, 200) is a PRE-compile dialog; needs-clarification is the POST-compile SPINE-4 bar. Do
   not merge the channels, do not change the ask branch's status or body; characterization-pin it.
2. exactOptionalPropertyTypes sites (backend strict): clarifications/localMacro/
   terminalArtifacts presence on each response arm, actionLocation/candidates/confidence nesting,
   the `attempts` extra — conditional spread only (`...(x ? {x} : {})`, the file's own idiom
   :156, :95-118); tests assert key ABSENCE via Object.keys, never toEqual-with-undefined
   (SPINE-1 harness convention).
3. YAML-reload traps: the scientist-intent Ajv validator is a MODULE-LEVEL singleton cached over
   schema/workflow/scientist-intent.schema.yaml (SPINE-1 spec §2.1) and pipeline YAML reloads
   every call — do NOT mutate shipped schema/vocabulary/pipeline files in tests; drive
   clarification outcomes through the stub model + mock store, not fixture surgery; never curl
   :3093 (stack staleness is the orchestrator's background-restart job).
4. Ontology terms: this item consumes NO claim/context/assertion/evidence semantics
   (docs/knowledge-layer-canonical-example.md read per protocol; nothing here touches it). The
   applicable rules are "if it can be expressed as data it must be" + no fabricated ids: the route
   passes clarifications/candidates through VERBATIM — minting a candidate, confidence, label, or
   recordId route-side is a hard fail (SPINE-3 hint doctrine: hints are evidence, never identity).
5. Hardcode boundary: the classification seam switches on ERROR ORIGIN + outcome union member,
   never on message substrings, verb names, model names, or clarification reason-code string
   matching beyond the stable error codes the route itself defines (NEEDS_CLARIFICATION /
   MALFORMED_MODEL_OUTPUT / INTENT_COMPILE_FAILED / existing PROTOCOL_TEXT_REQUIRED /
   INTENT_COMPILE_PROMPT_FAILED kept for the ask-branch catch).
6. No size/tier assumptions anywhere (PROTO-AI-13's standing note): no model-family literal in
   any new line; the two existing fallback literals :62/:66 are OQ3, kept byte-identical and
   characterization-pinned, not celebrated or extended; comments describing the driver must say
   "active AI profile", not a model name.
7. Second schema home: do NOT author a response schema YAML or a second clarification type; the
   payload type IS ScientistIntentUnresolvedFact (types.ts:113-118) re-exported/referenced.
8. Sibling-route drift: POST /intent/compile keeps 200+outcome for a compiled intent and 422 for
   CLIENT-supplied invalid intent; "fixing" it here is scope creep its own item will regret (its
   body IS client input — a different trust position).
9. Golden-silent drift: SPINE-4's merge may already have flipped this route's fixtures to the bar
   outcome (§1.5). Re-read the test file at claim; if a current test silently passes on an empty
   outcome, say so in the report instead of inheriting it.
10. The success test must not accidentally mock the pipeline: only llmClient + store are seams.
    If a test reaches for vi.mock on compileScientistIntent/vocabulary/parseScientistIntent, the
    "REAL route" criterion is void.
11. Never-auto-accept creep: do NOT return the accept payload, do NOT add an `acceptToken`, do
    NOT import IntentAcceptHandlers "for the types" (duplicate the two literal types locally or
    in the handler file).

## 8. Baselines — re-measure at claim as SETS (composer captures below are pre-SPINE-3/4-merge
context, NOT the gate)
- Server tsc: composer's FRESH own capture at fac6648e (this checkout, today):
  `npm run typecheck -w server 2>&1 | grep 'error TS' | sed 's/([0-9]*,[0-9]*)//' | sort` =>
  26 lines / 6 files; per-file: AgentOrchestrator 8, RecordStoreImpl 11, AuthoringGuard 3,
  ProtocolIntakeHandlers 2, RecordHandlers 1, bootstrapAdmin 1; sorted-set file
  /tmp/spine5-tsc-trunk-fac6648e.txt sha256 924c18bd566d539571f6bba7b4b480cffdf3bf82383200f85b893b22d52b9e41.
  DISCREPANCY STATED PLAINLY: the lane pin AS-LANE2-S2-TSC-PIN-27 says 27 lines; the composer
  measures 26 here (matching the reviewer's 26/6 worktree measurement). Counts are ILLUSTRATIVE;
  the GATE is SET identity (comm -3 EMPTY) between the coder's OWN claim-time capture on its own
  base and its post-diff capture, both sides of every commit. If the coder's two captures drift
  from EACH OTHER on files outside the diff -> STOP (the route edit cannot perturb
  AgentOrchestrator/RecordStoreImpl; any such delta is contaminated base, re-sync off trunk).
- src/ai failing-FILE SET (carried from SPINE-4 spec §9 + handoff 2026-10-08_1600 — 10 files /
  21 failed tests): AgentOrchestrator.bypass, AgentOrchestratorForwarding, AgentOrchestrator.golden,
  AgentOrchestrator.goldenWithSeeds, AgentOrchestrator.tubeGate, ChatbotCompileDeckSlot,
  chatbotCompile.e2e, InferenceClient.config, materialFollowUp, submitSuggestionTool.tubeSchema.
  Gate = SET identity vs claim-time re-capture, NOT green.
- scientistIntent+protocolIntent: 12 files / 113 tests GREEN on merged trunk (handoff
  2026-10-08_1520/:1600) — re-run green claim-time AND final (SPINE-4 will have re-pinned counts;
  zero new failing files is the gate).
- app tsc: carried pin 47 out-lines / 34 error-lines (AS-LANE2-APP-TSC-PIN-47-24) + app diff
  EMPTY (this item must not need the pin at all).
- NFS/harness standing facts: git ALWAYS `-c core.fileMode=false`; vitest from <wt>/server ONLY;
  never touch wt/SPINE-3-lane2-l2t1440 (live coder); never restart/probe :3093/:5193; do NOT run
  the full server suite (targeted paths only, as §6).

## 9. Stop-boundaries
- No new/parallel route; no path or prefix change. If the contract feels impossible on this
  route, STOP and report — that is an architect question, not a second endpoint.
- No chat/UI wiring: app/** diff EMPTY; no SSE/AgentOrchestrator integration; no ChangesPanel;
  no acceptance of proposals (headless is the wave-1 bar, Brad).
- No run execution, no store writes, no accept-time behavior.
- No SPINE-3/4 internals edits to "help" the contract; consumer-side only (§1 stop-conditions).
- No new YAML schema, no vocabulary/pipeline edits, no prompt-template edits.

## 10. Open questions (orchestrator rules; each with the composer's recommendation)
OQ1 — Status code for malformed-model-output. RECOMMEND 502 (error MALFORMED_MODEL_OUTPUT):
malformed model output is an UPSTREAM model-endpoint fault, not client input failure; the repo
HAS a 502 upstream-fault convention (OntologyHandlers.ts:81,:125; LabSyncHandlers.ts:46,:64 —
re-read), which makes "distinguishable from resolution uncertainty" true at the status level with
zero ambiguity. Alternative (b): single 422 for both with body discriminator
(NEEDS_CLARIFICATION vs MALFORMED_MODEL_OUTPUT) — closer to "everything invalid is 422", but
blurs the exact distinction the verified-by names. Convention VERIFIED before adopting: 422
validation-failed 30+ sites incl. this family's IntentCompileHandlers.ts:64. Checked: all
non-test 422/502/503 sites in server/src/api.
OQ2 — fate of outcome 'gap' post-SPINE-4. If the SPINE-4 merge's bar absorbs every unresolved
path (SPINE-4 spec §3 replaces gaps with clarifications on the blocked case), 'gap' may be
unreachable for model-emitted intents; if still reachable, RECOMMEND 200 with `clarifications`
attached when present (back-compat, additive). Claim-time step: audit computeOutcome/gatherGaps
in the MERGED compileScientistIntent + pin the reachability finding in the report. Checked:
today's computeOutcome (outcome from gaps/diagnostics, compileScientistIntent.ts re-read region
:118-211) and SPINE-4 spec §3/§4.4.
OQ3 — The historical last-resort fallback baseUrl 'http://127.0.0.1:8899/v1' :62 and model
'lfm2.5-2.6b' :66 vs "no size/tier assumptions anywhere in the route" (PROTO-AI-13 note).
RECOMMEND: keep both byte-identical (they fire only when config has NEITHER profiles NOR
smallModel — an unconfigured-deployment default, not a tier claim on the active path),
characterization-pin the fallback in T-settings-3, forbid any NEW tier literal in the diff;
removal/503-on-unconfigured is a behavior change for Brad's live deployments — its own item.
Checked: toInferenceConfig precedence chain :57-69, config/types.ts resolveAiProfile :235-239,
lane-stack profile history (handoffs).
OQ4 — Does the needs-clarification 422 include `localMacro` and `axes`? RECOMMEND yes-localMacro
(the model emitted a PARSEABLE macro with unresolved slots — the client folds answers into it,
per the file header's Q6 hold-the-macro contract; SPINE-4 OQ3(a) zero-artifact governs
terminalArtifacts only) and no-axes (axes belong to the ask branch; mixing channels invites bait
§7.1). Checked: header :12-20, client consumer client.ts:3946-3961.

## 11. Worker contract
- Worktree `wt/SPINE-5-lane2-l2t1620` off trunk `cl/integration-2` AT CLAIM TIME (base >=
  SPINE-4's merge commit), branch `spine-5-lane2-l2t1620`. One worker (cl-coder, fleet lock).
  Bootstrap per the SPINE-1/2/4 recipe (7 symlinks incl. server/schema, start-app.sh, trunk
  untracked entries 1:1; NFS: -c core.fileMode=false everywhere).
- Deliverable report (unique): `.hermes/plans/SPINE-5-report.wip-l2t1620.md` — must contain: §1
  claim-gate file reads with the ACTUAL merged spellings/shapes found (union member, result
  fields, clarification/failure shapes) vs this spec's spec-shape, delta noted; §5 first-check
  output; RED evidence per §4 test BEFORE each GREEN; the two proof-strategy transcripts
  (settings-1/-2, write-spy zeros across all branches); §6 commands + §8 SET diffs both sides of
  every commit; §7.5/§7.6 greps verbatim; any deliberate golden re-pin before/after; the OQ2
  gap-reachability audit finding.
- Server-only -> NO browser gate. Stack restart (if YAML ever moved — it must not) is the
  orchestrator's background job.

## Appendix A — cite-verified log (EVERY cite re-read first-hand by the composer at branch
cl/integration-2, docs tip 85270387 / code tip fac6648e; no scout output cited; reads via
read_file/search_files, one tsc run executed read-only):
- IntentCompileFromPromptHandlers.ts full file (189 ln): header contract :1-21; deps iface :35-42;
  toInferenceConfig :44-70 (smallModel :51-53, active profile :54-56, fallbacks :62/:66); body
  iface :72-76; PROTOCOL_TEXT_REQUIRED 400 :128-133; client build :135-136; ask branch
  :138-158 (extraction-failure non-fatal :149-152); one-shot :160-175 (compileFromSmallLlm call
  :163, send :170-175); catch 500 :176-182; registration :187-190.
- IntentCompileFromPromptHandlers.test.ts full file (151 ln): harness mocks :4-35 (mockStore
  get/getRecord/list ONLY — no write spies today); stubLlm tool-name routing :40-87; 4 tests
  :90-151.
- intentCompile.ts: ScientistIntentLlmClient iface :34-44; INTENT_COMPILE_MAX_TOKENS :52;
  IntentCompileFromPromptArgs :107; LabInventory :121; compileFromSmallLlm :244-347 (forced tool
  call :265-269, tool-arg parse+lift :272-284, plain-text fallback :286-338 w/
  PLAIN_TEXT_ATTEMPTS=3 :298, throw retryError :336, no-usable-intent throw :340-345, compile
  call :346, return {intent, compile} :347); stripYamlFence :350-359;
  BranchQuestionsResult :398, extractBranchQuestionsFromSmallLlm :460.
- types.ts (scientistIntent): ScientistIntentActionLocation :107-111 (actionIndex/action/
  argument, optional-by-design); ScientistIntentUnresolvedFact :113-118; ScientistIntent
  {actions, unresolved} :120-127.
- compileScientistIntent.ts: ScientistIntentCompileDeps (no store, write-free surface) :63-67;
  ScientistIntentCompileResult {terminalArtifacts, normalized, outcome, diagnostics} :69-74;
  buildRegistry :82-116.
- CompileContracts.ts at server/src/compiler/pipeline/ (NOT compiler/ root — path correction to
  the bare-filename cite): CompileOutcome 'complete'|'gap'|'error' :78 (needs-clarification
  ABSENT at fac6648e = SPINE-4 pending, confirmed by grep); Gap {kind, message, details?} :69-72.
- IntentCompileHandlers.ts :43-97 (422 SCIENTIST_INTENT_VALIDATION :63-68 — convention anchor;
  200 + outcome even on compile error :77-82).
- IntentAcceptHandlers.ts :95 store.create (accept-only write), :121 route post '/intent/accept'.
- server.ts registration :1508-1518 (both intent routes under /api prefix :1405/:1599).
- config/types.ts resolveAiProfile :235-239 (activeProfile -> profiles[active] else top-level
  inference), InferenceConfig :244+.
- app/src/shared/api/client.ts:3946-3961 intentCompileFromPrompt consumer typed `outcome?:
  string` (additive-widening safe; grep: 10 app-side refs all in client.ts region — no
  component wiring to change, none allowed).
- Status conventions: 422 non-test sites incl. RecordHandlers.ts:477/:800/:810,
  ProtocolIntakeHandlers.ts:338/:365/:399/:453, AiRecordDraftHandlers.ts:66/:78; 502
  OntologyHandlers.ts:81/:125, LabSyncHandlers.ts:46/:64; 503 LabSyncHandlers/metaHandlers;
  400 request-body convention (307 sites).
- schema/workflow/scientist-intent.schema.yaml (217 ln): unresolved :165, actionLocation notes
  :17-20/:180-187 (fabricated-verb rejection = fabrication gate).
- spec-shape citations (NOT code facts): SPINE-4 promoted spec §3 (union member + clarifications
  field + zero-artifact), §6 predicted route-test edits, orch rulings block :607-626; SPINE-3
  promoted spec §5.1/§5.6 shapes via SPINE-4 spec :36-43; SPINE-1 promoted spec :135 (route test
  file = SPINE-5 turf), :28-30 types cites.
- Live measurements today: server tsc 26-line/6-file SET captured (file + sha256 §8; per-file
  counts §8); task-list SPINE-5 block read verbatim (id/title/deps/verified-by :3360-3385);
  handoff 2026-10-08_1600 (claim-gate state, baselines carry, live-worker boundaries); PROTO-AI-13
  note context :3373 + :955/:988.
- NOT executed (composer is read-only; per mission): any vitest suite, any git mutation, any
  stack probe. src/ai + 113-test counts are CARRIED (§8), flagged as carried.

END-DRAFT RE-VERIFY (re-run after writing; tip MOVED mid-session): trunk tip is now
0873c47b = SPINE-3 MERGED (adv-gate2 ACCEPT; commit message itself records orch-verified tsc
SET identity 26/6 vs fresh trunk capture + src/ai fail-set identity 10/21 + scope
server/src/compiler/resolution/ only). Spot-checked FIRST-HAND at 0873c47b:
CompileContracts.ts:78 STILL 'complete'|'gap'|'error' — needs-clarification ABSENT, i.e.
SPINE-4 remains unmerged exactly as this spec's §1 claims; IntentCompileFromPromptHandlers.ts
:44-46/:163-165/:187-189 byte-unchanged (every cite holds at the new tip). Consequence:
§8's tsc 26/6 capture is CONSISTENT with the post-SPINE-3 trunk (SPINE-3 added no tsc
errors per its own verified gate); §8's carried scientistIntent+protocolIntent 113-count now
sits on a trunk that also carries SPINE-3's 23 resolution tests — the claim-time re-run is
more load-bearing than before, not less. If SPINE-4 merges before dispatch, re-run §5 and
re-capture §8 on the coder's base per §1.

COMPOSER DONE — draft only; orchestrator review required before dispatch.

---

## ORCHESTRATOR RULINGS 2026-10-08T17:40 EDT (l2t1735) — BINDING

Cite-review performed first-hand at trunk 0873c47b (SPINE-3 merged): CompileContracts.ts:78
still 'complete'|'gap'|'error' (needs-clarification absent — §1 honest, SPINE-4 pending);
IntentCompileFromPromptHandlers.ts 189 lines, :62/:66 fallback literals and :163/:187-189 as
cited; IntentCompileHandlers.ts:63-68 422 SCIENTIST_INTENT_VALIDATION verified; OntologyHandlers
502 BAD_GATEWAY convention verified (:81/:125); ScientistIntentActionLocation/
ScientistIntentUnresolvedFact verified verbatim at scientistIntent/types.ts:107-118; route test
file 151 lines. ALL LOAD-BEARING CITES HOLD.

OQ1 = (a) 502 MALFORMED_MODEL_OUTPUT. Malformed model output is an upstream model-endpoint
fault; the repo's 502 convention is verified and it makes the verified-by's "distinguishable
from resolution uncertainty" true at the status level. Adopted.
OQ2 = claim-time audit, per recommendation: if the merged SPINE-4 bar makes outcome 'gap'
reachable for model-emitted intents, map 200 + additive `clarifications` when the compile
result carries them; if the audit proves absorption, pin unreachability in the report.
Decidable only from merged SPINE-4 code — do not guess.
OQ3 = (a) keep both fallback literals byte-identical, characterization-pinned in T-settings-3;
zero NEW tier literals in the diff. Removal is a behavior change for live deployments — its
own item, not SPINE-5's.
OQ4 = (a) 422 includes localMacro (parseable macro with unresolved slots — the file-header
hold-the-macro contract), excludes axes (ask-branch channel only; bait §7.1).

CLAIM GATE (unchanged): SPINE-4 MERGED with adversarial ACCEPT, base >= SPINE-4 merge commit,
then §1 name-and-read + §5 first check + fresh §8 SET captures on the coder's own base.
