# SPINE-4 REPORT — Register the spine as a pipeline pass; unresolved terms atomically bar compilation
Worker: cl-coder (lane 2). Worktree: /mnt/vast/home/brad/git/wt/SPINE-4-lane2-l2t1710
Branch: spine-4-lane2-l2t1710 off trunk cl/integration-2 @ 0873c47b (contains SPINE-3 merge).
Spec: .hermes/plans/2026-10-08_1605-SPINE-4-resolution-pass-registration-spec.md (read fully).
HEADLESS SERVER-ONLY — no UI, no browser gate, no stack touched (:3093/:5193 never curled).

Commits (this worktree only; trunk untouched):
- 68bec003 test(SPINE-4): RED-first acceptance tests (5 files, +1915/-23)
- 20fab6da feat(SPINE-4): registration + atomic bar (7 files, +510/-23)
- (this report commit follows)

============================================================================
## 1. CLAIM GATE (spec §1) — live output captured in THIS worktree at claim time
============================================================================

### Gate 1 — SPINE-2 five artifacts live on my base (0873c47b)
$ ls schema/scientist-intent/
scientist-intent-vocabulary.lint.yaml
scientist-intent-vocabulary.schema.yaml
scientist-intent-vocabulary.yaml
$ grep -n "export function loadScientistIntentVocabulary" server/src/compiler/scientistIntent/vocabulary.ts
226:export function loadScientistIntentVocabulary(
VERIFIED: all five artifacts live (3 YAML + vocabulary.ts exporting the loader).

### Gate 2 — SPINE-3 resolution suite
$ cd <wt>/server && npx vitest run src/compiler/resolution
 Test Files  2 passed (2)
      Tests  23 passed (23)
VERIFIED: 2 files / 23 tests green — matches the orchestrator's merged-trunk measurement exactly.

### Gate 3 — SPINE-1 contract tests
$ npx vitest run src/compiler/scientistIntent src/compiler/protocolIntent
 Test Files  12 passed (12)
      Tests  113 passed (113)
(includes scientistIntentContract.test.ts 15 + clarificationContract.test.ts 15)
VERIFIED green.

### Gate 4 — §9 baselines re-captured as SETS against MY base
server tsc SET: `npm run typecheck -w server 2>&1 | grep "error TS" | sed 's/([0-9]*,[0-9]*)//' | sort`
=> 26 lines / 6 files (saved /tmp/spine4-claimgate/gate4a-tsc-set.txt). Matches today's trunk capture (26/6).
src/ai failing-file SET: 10 files / 21 failed tests (665 total, 2 pre-existing errors) — saved
gate4b-ai.txt; file set enumerated in §9 below.
pipeline-dir failing SET (composer §9 context): 13 files / 29 failed (613) — gate4d-pipeline.txt.
app tsc SET: 34 lines / 24 files (gate4c) — see §9 note on the stale 47-pin.

============================================================================
## 2. EXECUTABILITY SPLIT (spec §1) — how it resolved on this base
============================================================================
My base 0873c47b ALREADY CONTAINS the SPINE-3 merge (server/src/compiler/resolution/ is live,
gate 2 proves it). The spec's pre-SPINE-3 groundwork phase (stub-pass harness, characterization
pins, OQ1 audit as separate first commits) is therefore NOT applicable as separate commits —
everything was executable at claim time. The split was honored as:
- The OQ1 consumer audit (§6 below) was performed as claim-time analysis (grep battery), not code.
- RED tests committed FIRST (68bec003) — at that commit the two new resolution test files fail to
  load (resolveNounsPass.js absent) and the golden conversions are RED against the untouched base.
- YAML entry + registry.register + depends_on edges + the pass module landed in ONE atomic commit
  (20fab6da), per §8.1 (PIPELINE_MISSING_PASS fail-fast would red the whole scientist-intent suite
  if the YAML landed without the registration). No intermediate commit ever names resolve_nouns
  in the YAML without the engine/registration present.

============================================================================
## 3. WHAT SPINE-4 CHANGED (implementation map)
============================================================================
NEW: server/src/compiler/resolution/resolveNounsPass.ts (294 lines)
  - Pass id `resolve_nouns`, family `disambiguate` (schema-safe; the emit-drift trap §8.4 avoided;
    compile-pipeline.schema.yaml NOT touched).
  - Output slot `resolve_nouns` = { bindings, resolvedByLabel, clarifications, failures, blocked }
    (§3; resolvedByLabel is the consumption seam).
  - blocked = ANY argument unresolved after reconciliation -> ok:false with ONE error diagnostic
    code `unresolved_arguments`, details carry the structured clarifications verbatim (§4.1).
  - §5.1 reconciliation `reconcileModelUnresolved` (DROP / MERGE / KEEP) — the smallest generic
    code location; switches on identity + engine output + declared contract fields only.
    A binding occupies BOTH identities of the slot it bound (slot:actionIndex:argument AND
    label:<label>); a model item is keyed by its own shape and meets the binding on whichever
    identity it carries. MERGE arm: engine clarification wins verbatim; model candidates are
    NEVER minted — corroborated labels are already carried by the engine fact (SPINE-3 §5.4).
  - §5.2 declarative required-argument sweep `requiredArgumentClarifications` — loops over
    `vocabulary.argContracts(verb)`; a declared-required arg whose kind is not 'scalar'
    (data decides eligibility, never a name table) that is absent/blank becomes a clarification
    with reason `missing-required-argument` + filled actionLocation. NO `if (verb === ...)` anywhere.
  - NO write-capable dependency of any kind (store grep below, §4.2 atomicity structural).

YAML: schema/registry/compile-pipelines/scientist-intent-compile.yaml
  - resolve_nouns inserted after ai_precompile (depends_on: [ai_precompile]); 17 `- id:` lines now.
  - resolve_nouns edge ADDED to every noun consumer's depends_on: lower_protocol_intent,
    expand_protocol_intent_patterns, expand_biology_verbs, resolve_labware, resolve_references,
    resolve_roles. apply_directives stays [lower_protocol_intent] per §3 (proved transitively
    unrunnable: its only dep is skipped => cascade skip; pinned in PROOF B chain walk).
  - chatbot-compile.yaml NOT touched (OQ2 ruling; 29-pin green, §5 below).

Registration: server/src/compiler/scientistIntent/compileScientistIntent.ts
  - buildRegistry registers createResolveNounsPass (intent + vocabulary + spine + optional read-only
    lookups). NO degraded no-resolution mode: shipped vocabulary singleton + provider-less spine
    as the floor; production callers inject a store-backed spine via deps.spine (optional fields,
    conditional spread — exactOptionalPropertyTypes).
  - Bar handling: the runner stores a pass's output slot only for ok:true passes, so the bar is
    read from the resolve_nouns error diagnostic (details.clarifications). On bar: outcome
    'needs-clarification' (OQ1a), gaps REPLACED by structured clarifications (the error-diag
    stringification is not the presentation channel), artifact-bearing slots EMPTY
    (events/directives/gaps = []; deckLayoutPlan/resourceManifest/instrumentRunFiles/
    labStateDelta/labwareAdditions/resolvedRefs/validationReport ABSENT — conditional-spread
    construction; OQ3a total zero-artifact).
  - Result gains `clarifications: ScientistIntentUnresolvedFact[]` (additive returned field).

Consumption seams (server/src/compiler/pipeline/passes/ChatbotCompilePasses.ts) — every edit
slot-guarded, byte-identical legacy when the resolve_nouns slot is ABSENT (chatbot/extraction):
  - resolve_labware: authoritative binding for a hint => push {hint, recordId, title} into
    resolvedLabwares WITHOUT searchLabwareByHint and WITHOUT the multi-match top-pick arm
    (§8.8 legacy arms preserved; deckSlot carry preserved on the authoritative arm).
  - resolve_references: bound label resolves from the slot (resolvedId = binding recordId), no
    fuzzy re-match; unresolved refs never reach it post-bar (cascade skip).
  - resolve_roles: engine address bindings for declared-address args replace the unknown-role
    pass-through (wells expanded from binding.addresses).
  - lower_protocol_intent / expand_biology_verbs: NO edit (spec §3 — they carry labels).

Union + narrowing (OQ1a, mandated): server/src/compiler/pipeline/CompileContracts.ts
  - CompileOutcome = 'complete' | 'gap' | 'error' | 'needs-clarification' (the union site OQ1
    names: CompileContracts.ts:78).
  - NEW `ChatbotCompileOutcome = Exclude<CompileOutcome, 'needs-clarification'>` — the chatbot
    pipeline registers no resolve_nouns (OQ2) and runChatbotCompile computes only complete/gap/error;
    consumers bound to the three-value enum (VendorProtocolEventGraphDraftService compileStatus:
    'error'|'not_run'|'complete'|'gap') consume the narrowing.
  - server/src/ai/runChatbotCompile.ts: 3-line type annotation change (import + 2 sites:
    RunChatbotCompileResult.outcome and the local `outcome` binding) to ChatbotCompileOutcome.
    ZERO behavior change. NECESSITY PROVEN: stashing only this file yields tsc 27 lines with the
    NEW error `src/ingestion/vendor-protocol/VendorProtocolEventGraphDraftService.ts: error TS2322:
    Type 'CompileOutcome' is not assignable to type '"error" | "not_run" | "complete" | "gap"'`
    — i.e. without the narrowing the claim-gate tsc SET identity (26/6) is violated. With it:
    comm -3 EMPTY, per-file counts unchanged (VendorProtocol contributes 0 lines both sides).

Comment-only edit (SPINE-3 OQ2 ruling, spec §3 last bullet): parseScientistIntent.ts — the
"SPINE-3 widens it" promise rewritten to name SPINE-4's resolve_nouns reconciliation (SPINE-3
registered no widening and none was made). No behavior change; SPINE-1 parse pins behavioral and
green.

============================================================================
## 4. RED EVIDENCE (before GREEN) — genuine stash-leg against the bare base
============================================================================
Method: `git -c core.fileMode=false stash push -u -m spine4-red-leg -- <the 7 implementation
paths>` (tests kept in tree), run, pop. Live output:

$ npx vitest run src/compiler/resolution src/compiler/protocolIntent src/api/handlers/IntentCompileFromPromptHandlers.test.ts
 FAIL  src/compiler/resolution/resolveNounsPass.test.ts [ ... ]
 FAIL  src/compiler/resolution/spine4Registration.test.ts [ ... ]
Error: Failed to load url ./resolveNounsPass.js ... Does the file exist?
 FAIL  ...ProtocolIntentLoweringCharacterization.test.ts > characterization.deckSlot-passthrough > on the scientist-intent path normalizeScientistIntent NEVER sets deckSlot
 FAIL  ...IntentCompileFromPromptHandlers.test.ts > compiles to localMacro + terminalArtifacts when answers present (verb-lift applied)
 FAIL  ...IntentCompileFromPromptHandlers.test.ts > bars instead of surfacing labwareAdditions when the named labware cannot bind (SPINE-4 OQ3: total zero-artifact)
 Test Files  4 failed | 7 passed (11)
      Tests  3 failed | 57 passed (60)
(the two new files fail at collection — the pass module does not exist yet; the two golden
conversions fail against the pre-bar behavior; the characterization compile leg fails.)
GREEN after 20fab6da: same battery 16 files / 169 tests, 0 failed (§7 run below).

Additional mid-run REDs (harness honesty, fixed against evidence, not by weakening assertions):
- resolve_references pin leg: my first expected-array construction was wrong (the default arm
  OVERWRITES reason — pinned now as 'kind unresolved_symbol not handled by resolve_references');
  the end-to-end DROP leg exposed a real implementation gap: a label-keyed model item must meet a
  slot-keyed binding — fixed in reconcileModelUnresolved (binding contributes both identity keys).
  That fix is IN the feat commit; the test stayed strict (run.ok === true).

============================================================================
## 5. PROOF A + PROOF B transcripts (spec §4.3 — both required, non-vacuous)
============================================================================
Harness: buildSpiedRegistry registers spy-wrapped REAL factories (spy delegates to real `.run`)
into a test-built registry against the REAL shipped YAML (loadPipeline of the worktree file).
A no-op stub would make both proofs vacuous; the mutation leg (§8) proves non-vacuity.

PROOF A (spy callCount === 0 after a bar):
 ✓ clarification-barrier > PROOF A: spy-wrapped REAL factories record callCount === 0 for every downstream stage
   (asserts run.ok === false; spies.get(stage).calls === 0 for all 13 DOWNSTREAM_STAGES:
   lower_protocol_intent, expand_protocol_intent_patterns, expand_biology_verbs, apply_directives,
   resolve_labware, resolve_references, resolve_roles, compute_volumes, compute_resources,
   plan_deck_layout, lab_state, emit_instrument_run_files, validate; and resolve_nouns' own
   pass_status === 'failed' — the abort is a real executed pass, not a silent gap.)

PROOF B (trace + statuses):
 ✓ clarification-barrier > ONE bad argument among valid actions: structured clarifications out, ZERO artifact-bearing slots
   (onPassEvent trace: pass_started CONTAINS resolve_nouns; pass_finished for resolve_nouns present;
   NO pass_started for any of the 13 downstream stages.)
 ✓ clarification-barrier > PROOF B: every consumer carries status skipped with the exact runner reason; direct consumers name resolve_nouns, transitive stages chain through a skipped dep back to it
   (direct consumers lower/expand_patterns/expand_verbs/resolve_references: status 'skipped',
   reason EXACTLY 'dependency resolve_nouns was failed' (PipelineRunner.ts:288). Transitive
   stages: chain-walk asserts each reason names a DECLARED dep that is itself skipped/failed and
   terminates at resolve_nouns 'failed' — e.g. apply_directives -> lower_protocol_intent ->
   resolve_nouns. A forgotten edge fails loudly; the mutation leg demonstrates it.)

Also pinned: bar is NOT 'error' (outcome !== 'error'/'gap'/'complete'; the error-severity
diagnostic code 'unresolved_arguments' remains present for observability); lookup-error arm bars
with reason 'resolution-lookup-failed' intact and distinguishable from 'unknown-noun' (SPINE-3
§5.6 codes pass THROUGH unchanged — SPINE-4 renames nothing).

============================================================================
## 6. OQ1 CONSUMER-AUDIT TABLE (every CompileOutcome comparison site, disposition)
============================================================================
Grep battery (live, this worktree):
  grep -rn "outcome === 'complete'\|outcome !== 'complete'\|outcome === 'gap'\|outcome === 'error'\|outcome: CompileOutcome" server/src --include="*.ts" | grep -v .test.ts
  grep -rn "switch (outcome\|switch(outcome" server/src --include="*.ts"  => EXIT 1 (ZERO exhaustive
  switches anywhere — the OQ1 stop condition never fired; no stop-and-report needed).

| Site | Path:line | Path sees scientist-intent pipeline? | Disposition |
|---|---|---|---|
| compile result field | server/src/compiler/scientistIntent/compileScientistIntent.ts:104 | YES (producer) | now emits 'needs-clarification' on bar |
| FixtureTypes outcome | server/src/compiler/pipeline/fixtures/FixtureTypes.ts:65 | fixture type only | no comparison; untouched |
| CompileResult.outcome | server/src/compiler/pipeline/CompileContracts.ts:369 | chatbot/foundry result type | widened union; no comparison at site |
| ProtocolIdeHandlers | server/src/api/handlers/ProtocolIdeHandlers.ts:1187 (`=== 'error'`) | NO — consumes runChatbotCompile (:58/:1134) | falls through non-complete arm; typed via ChatbotCompileOutcome |
| ProtocolFoundryCompileRunner | server/src/foundry/ProtocolFoundryCompileRunner.ts:543/:547/:594 | NO — calls runChatbotCompile (:7/:579) | falls through; 'error' arm unchanged |
| FoundryLedger | server/src/foundry/FoundryLedger.ts:251 (`=== 'complete'`) | NO (chatbot path) | falls through |
| FoundrySupervisor | server/src/foundry/FoundrySupervisor.ts:153/:549 (`=== 'complete'`) | NO | falls through |
| FoundryReviewedSpecRunner | server/src/foundry/FoundryReviewedSpecRunner.ts:167/:293-294 | NO | falls through |
| FoundryArchitect | server/src/foundry/FoundryArchitect.ts:728 (`!== 'complete'`) | NO | falls through |
| AgentOrchestrator short-circuit | server/src/ai/AgentOrchestrator.ts:1238-1239 (`=== 'complete' \|\| === 'gap'`) | NO — runChatbotCompile result | falls through to LLM-loop arm; chatbot pipeline registers no resolve_nouns (OQ2) so it can never receive the new member |
| VendorProtocolEventGraphDraftService | server/src/ingestion/vendor-protocol/...:4 (consumes RunChatbotCompileResult.outcome into compileStatus enum 'error'\|'not_run'\|'complete'\|'gap') | NO (chatbot result) | REQUIRED the ChatbotCompileOutcome narrowing: without it tsc gains TS2322 (27/6, SET identity broken); with it 26/6 comm -3 EMPTY |

Every audited consumer compares === 'complete' (or === 'error'/'gap') and falls through its
non-complete arm with ZERO edits — exactly the OQ1(a) prediction. The only consumer whose TYPE
is bound to the three-value enum is VendorProtocol (chatbot-result consumer), handled by the
narrowing above, not by widening a schema enum.

============================================================================
## 7. resolve_references fate-of-unresolved_symbol FINDING (spec §2.2 item 4 caveat)
============================================================================
Read the WHOLE switch before editing (ChatbotCompilePasses.ts:1203-1349). Finding, pinned in
tests (describe 'resolve_references.fate-of-unresolved_symbol', 3 legs):
- normalizeScientistIntent only ever emits kind:'unresolved_symbol' (normalizeScientistIntent.ts:200).
- The switch arms are protocol/assay/pattern/compound-class; unresolved_symbol falls to the
  DEFAULT arm => unresolvableRefs with reason 'kind unresolved_symbol not handled by
  resolve_references'. So the composer's flag was right: the arm is INERT-as-resolution today
  (it never resolves; it always lands unresolvable). It is NOT a noun-lookup shadow.
- Post-SPINE-4: (a) slot present + label bound => resolves from the slot (resolvedId = binding
  recordId, resolvedName = resolvedLabel), NO fuzzy re-match; (b) label the engine left
  unresolved bars upstream => the pass is skipped entirely (PROOF B); (c) slot absent (chatbot)
  => default arm byte-identical. End-to-end leg: a model hedge the engine bound is DROPPED from
  the bar (reconciliation KEEP/DROP) and resolve_references resolves it from the slot (run.ok true).

============================================================================
## 8. MUTATION LEG (spec §8.11 — spy-harness honesty / barrier non-vacuity)
============================================================================
Scratch edit: removed the resolve_nouns edge from resolve_references in the worktree YAML
(one line). Live result:
$ npx vitest run src/compiler/resolution/spine4Registration.test.ts
 FAIL > scientist-intent-pipeline.resolution-pass-order > EVERY noun consumer declares the resolve_nouns edge
   AssertionError: resolve_references lacks the resolve_nouns edge: expected [ 'ai_precompile' ] to include 'resolve_nouns'
 FAIL > clarification-barrier > ONE bad argument among valid actions: ...
   AssertionError: resolve_references ran after the bar: expected [ 'ai_precompile', …(4) ] to not include 'resolve_references'
 FAIL > clarification-barrier > PROOF A: spy-wrapped REAL factories record callCount === 0 ...
   AssertionError: resolve_references was invoked: expected 1 to be +0
 (+2 more failed)  Test Files 1 failed | Tests 5 failed | 10 passed (15)
The barrier test goes RED loudly — spies are real (resolve_references actually ran, callCount 1),
PROOF B catches the trace leak. Restore: re-applied the edge; sha256 byte-clean verified:
  b47eee0c3bd0f4f334b5070c3bfba2cbf0d0a360bd38af855c10bd012679fbf8  (before scratch)
  b47eee0c3bd0f4f334b5070c3bfba2cbf0d0a360bd38af855c10bd012679fbf8  (after restore)
Re-run: 15/15 green.

============================================================================
## 9. DELIBERATE GOLDEN DIFFS (spec §6 list) — verbatim
============================================================================
(a) server/src/api/handlers/IntentCompileFromPromptHandlers.test.ts — TWO legs (full git diff
captured at fix time; key hunks):

-  it('compiles to localMacro + terminalArtifacts when answers present (verb-lift applied)', ...
-    expect(payload.outcome).toBeDefined();
     expect(payload.localMacro).toBeDefined();
     ...
-    expect(payload.terminalArtifacts?.events?.length ?? 0).toBeGreaterThan(0);
+    // SPINE-4 DELIBERATE GOLDEN CHANGE (before: outcome 'gap' + mix/transfer
+    // events present). This stub intent names labware nouns ('MagBinding
+    // Buffer', 'block', 'magstand') that the mock store cannot bind, so the
+    // resolve_nouns bar fires: outcome 'needs-clarification', ZERO events, and
+    // the route still answers 200 with the structured clarifications (SPINE-5
+    // owns the response contract; the status code is unchanged here).
+    expect(payload.outcome).toBe('needs-clarification');
+    expect(payload.terminalArtifacts.events).toEqual([]);

-  it('surfaces labwareAdditions in terminalArtifacts so the one-shot deck is never blank when events ghost', ...
+  it('bars instead of surfacing labwareAdditions when the named labware cannot bind (SPINE-4 OQ3: total zero-artifact)', ...
-    expect(payload.terminalArtifacts?.events?.length ?? 0).toBeGreaterThan(0);
-    const hasDeckLabware = Array.isArray(payload.terminalArtifacts?.labwareAdditions) && ...
-    expect(hasDeckLabware || hasRequirements || Array.isArray(payload.terminalArtifacts?.deckLayoutPlan)).toBe(true);
+    expect(payload.outcome).toBe('needs-clarification');
+    expect(payload.terminalArtifacts.events).toEqual([]);
+    const keys = Object.keys(payload.terminalArtifacts);
+    expect(keys).not.toContain('labwareAdditions');
+    expect(keys).not.toContain('labwareRequirements');
+    expect(keys).not.toContain('deckLayoutPlan');
Route status codes UNCHANGED (200 + {outcome, terminalArtifacts, localMacro, axes}) — SPINE-5's
approved scope respected (reviewer-bait §8.3 honored).

(b) server/src/compiler/protocolIntent/ProtocolIntentLoweringCharacterization.test.ts — the
COMPILE leg only (the normalize-side deckSlot pin above it is untouched):

-    const { terminalArtifacts } = await compileScientistIntent(doc, { searchLabwareByHint: async () => [] });
-    const additions = terminalArtifacts.labwareAdditions ?? [];
-    expect(additions.length).toBeGreaterThan(0);
-    for (const addition of additions) { expect(addition).not.toHaveProperty('deckSlot'); }
+    const { terminalArtifacts, outcome, clarifications } = await compileScientistIntent(doc, { searchLabwareByHint: async () => [] });
+    expect(outcome).toBe('needs-clarification');
+    expect(Object.keys(terminalArtifacts)).not.toContain('labwareAdditions');
+    expect(terminalArtifacts.events).toEqual([]);
+    expect(clarifications.map((c) => c.label).sort()).toEqual(['mystery_source', 'mystery_target']);
BEFORE: unbindable hints minted deckSlot-free labwareAdditions. AFTER: unbindable nouns bar
atomically (resolve_labware never runs). This leg is a forced consequence of the bar and is
required green by the spec's own §7 command (protocolIntent dir => 0 failed).

(c) scientistIntent.test.ts:245-264 ("gap: unresolved symbol") — §6's expected re-pin was NOT
NECESSARY: the §6 either/or resolved to the FIRST arm — the test's stub searchLabwareByHint
binds 'standards'/'fresh_plate' through the engine's hint adapter, so no bar fires and the
events (mix+transfer) stay byte-identical. Test file UNTOUCHED (20/20 green). Its title is now
a misnomer (no unresolved symbol reaches the bar); left as-is — renaming a green SPINE-1 pin is
not in scope.

(d) NO other goldens touched. chatbotCompilePipelineLoad.test.ts:36 (29-pin) UNTOUCHED and green
(54/54 in that file's run); chatbot-compile.yaml untouched (grep below).

============================================================================
## 10. §7 VERIFICATION COMMANDS — verbatim outputs (final state, HEAD = 20fab6da)
============================================================================
$ cd <wt>/server && npx vitest run src/compiler/resolution src/compiler/scientistIntent src/compiler/protocolIntent
 Test Files  16 passed (16)
      Tests  169 passed (169)          [resolution 4 files/56 + scientistIntent 6/80 + protocolIntent 6/33]

$ cd <wt>/server && npx vitest run src/ai
 Test Files  10 failed | 74 passed (84)
      Tests  21 failed | 644 passed (665)   Errors 2
 failing-file SET comm -3 vs claim-time capture: EMPTY (identical 10-file set:
 AgentOrchestrator.bypass / AgentOrchestratorForwarding / AgentOrchestrator.golden /
 AgentOrchestrator.goldenWithSeeds / AgentOrchestrator.tubeGate / ChatbotCompileDeckSlot /
 chatbotCompile.e2e / InferenceClient.config / materialFollowUp / submitSuggestionTool.tubeSchema)

$ cd <wt> && npm run typecheck -w server 2>&1 | grep 'error TS' | sed 's/([0-9]*,[0-9]*)//' | sort
 => 26 lines / 6 files; comm -3 vs claim-time capture: EMPTY (exit 0).
 Per-file counts both sides identical (AgentOrchestrator 8 lines at :285/:2679+ — outside every
 SPINE-4 edit site; VendorProtocolEventGraphDraftService contributes 0 lines both sides — the
 narrowing kept it assignable; the no-narrowing probe added exactly 1 line, disclosed in §3).

$ cd <wt> && npm run typecheck -w app => 34 lines / 24 files; comm -3 vs a FRESH TRUNK capture
 (run in /mnt/vast/home/brad/git/cl-integration-2, same command): EMPTY. app/** diff EMPTY.
 NOTE: the spec's "47 lines / 24 files" pin is stale against today's trunk — today BOTH trunk and
 worktree measure 34/24; SET identity vs trunk is the gate and it holds.

$ cd <wt>/server && npx vitest run src/compiler/pipeline
 Test Files  13 failed | 67 passed (80); Tests 29 failed | 584 passed (613)
 failing-file SET comm -3 vs claim-time capture: EMPTY (13-file set identical; all pre-existing
 assertion-level failures, e.g. INVALID_REVISION 422 fixture-gate errors).

Hardcode greps (verbatim):
$ grep -rnE "'(transfer|read|wash|spin|add_material|serial_dilution|[a-z_]+)'\s*(===|!==|==|in\b)" server/src/compiler/resolution/resolveNounsPass.ts
(no output) exit: 1   => ZERO verb/class/domain literals
$ grep -n "store" server/src/compiler/resolution/resolveNounsPass.ts
(no output) exit: 1   => zero write-capable imports (§4.2)
$ grep -c '^  - id:' schema/registry/compile-pipelines/scientist-intent-compile.yaml
17
$ grep resolve_nouns schema/registry/compile-pipelines/chatbot-compile.yaml
(no output) exit: 1   => chatbot YAML clean (OQ2)
$ grep -rn "switch (outcome\|switch(outcome" server/src --include="*.ts"
(no output) exit: 1   => no exhaustive switch anywhere (OQ1 stop condition never fired)

Chatbot pins (legacy-labware-hints criterion):
$ npx vitest run src/compiler/pipeline/chatbotCompilePipelineLoad.test.ts src/compiler/pipeline/passes/ChatbotCompilePasses.test.ts
 Test Files  1 passed (1) [re-run individually: 54/54 and 44/44]  — 29-pin green, YAML untouched.
$ npx vitest run src/api/handlers/IntentCompileHandlers.test.ts IntentCompileFromPromptHandlers.test.ts IntentAcceptHandlers.test.ts ...
 Test Files  5 passed (5)  Tests 106 passed (106)

============================================================================
## 11. OWNERSHIP GATE — result + DISCLOSED DEVIATIONS (reviewer must check each)
============================================================================
$ git -c core.fileMode=false diff --name-only 0873c47b..HEAD | grep -v -E '<spec regex>'
server/src/ai/runChatbotCompile.ts
server/src/compiler/pipeline/CompileContracts.ts
server/src/compiler/protocolIntent/ProtocolIntentLoweringCharacterization.test.ts

Three files land OUTSIDE the spec's §7 allow-list regex. Each is mandated by the spec's own
binding rulings/gates; the regex simply failed to enumerate them. Disclosed, not papered:
1. CompileContracts.ts — OQ1(a) ruling names THIS file:78 as the union site. Adding the member
   IS the ruling; the allow-list omission is a spec-internal contradiction. Edit = union line +
   ChatbotCompileOutcome + doc comments.
2. runChatbotCompile.ts — 3-line type annotation (import alias + 2 sites) required to keep the
   claim-gate tsc SET identity (26/6): without it VendorProtocolEventGraphDraftService gains
   TS2322 (probe output in §3). Zero behavior change; chatbot outcome values unchanged.
3. ProtocolIntentLoweringCharacterization.test.ts — §6's "NOTHING else" conflicts with §7's own
   command (protocolIntent dir => 0 failed): the bar makes the compile leg's old assertion
   (additions minted from unbindable labels) impossible. Deliberate golden with before/after in
   §9(b). If the orchestrator prefers a different disposition, the alternative is leaving a
   known-red test, which §7 forbids.
Everything else in the diff matches the allow-list exactly. scientistIntent.test.ts,
IntentCompileHandlers.ts/.test.ts, IntentCompileFromPromptHandlers.ts (route code) NOT touched.

RIPPLE DISCLOSURE follow-up (N-1): no consumer I wired needs vendor-as-material semantics.
resolve_nouns consumes the spine + hint adapters; material-domain args flow through the SPINE-3
engine policy unchanged. NO engine change, NO policy widening, §5.6 stop boundary not fired.

Bootstrap note: worktree server/schema symlink was re-pointed from the trunk path to ../schema
(worktree-local) so tests read the WORKTREE pipeline YAML (17 passes) rather than trunk's (16).
server/schema is git-ignored; not committed. No lane-exclude entries staged (lane-exclude respected).

============================================================================
## 12. REVIEWER-BAIT LEDGER (spec §8, item by item)
============================================================================
1. YAML-before-registration: one atomic feat commit (20fab6da) — YAML + register + edges + module.
2. Forgotten depends_on edge: per-stage skip reasons asserted; mutation leg RED proof in §8.
3. Outcome-string overreach: NO route status-code change, NO response contract, NO reason-code
   rename, NO CompilerDiagnosticOutcome set on unrelated passes.
4. Drift trap: family 'disambiguate' used; compile-pipeline.schema.yaml NOT touched.
5. The 29 pin: chatbot YAML untouched; pin green (54/54 file).
6. exactOptionalPropertyTypes: conditional spread at every construction site; tests assert key
   ABSENCE via Object.keys, never toEqual-with-undefined.
7. YAML-reload trap: all tests unit/contract level; lane stack never touched; fixture vocab via
   opts.path injection (vocab-required-flip copy); shipped files never mutated in tests.
8. resolve_labware legacy arms: multi-match top-pick + zero-match minting preserved; slot-absent
   byte-identity leg green; bound-label bypass leg green (two distinct spies: engine lookup ran,
   legacy lookup ZERO calls).
9. resolve_references caveat: whole switch read before editing; fate pinned in 3 tests (§7 above).
10. Bar-as-'error' conflation: distinct outcome asserted (not 'error'/'gap'/'complete');
    'resolution-lookup-failed' vs 'unknown-noun' distinguishable in the payload.
11. Spy-harness honesty: spies delegate to real .run; mutation leg shows a real invocation leak.
12. Knowledge layer: zero verb knowledge added to TS; vocabularyRipOut.test.ts green (rip-out
    carries); no claim/context/assertion surface consumed.
13. Hardcode boundary: §10 greps ZERO; only reason codes + slot ids + pass id as literals.

============================================================================
## 13. UNRESOLVED / FOR THE ORCHESTRATOR
============================================================================
- The three ownership-gate deviations (§11) need orchestrator sign-off (regex vs rulings).
- scientistIntent.test.ts:245-264 title misnomer left as-is (green, untouched) — flag for a
  future docs pass, not SPINE-4 scope.
- app tsc pin drift: spec says 47/24, today's trunk measures 34/24 (both sides identical).
- SPINE-5 owns: route response contract for 'needs-clarification', surfacing labwareAdditions
  as clarification candidates (OQ3(b)), and any chatbot-pipeline registration (OQ2 future item).

SPINE-4 DONE