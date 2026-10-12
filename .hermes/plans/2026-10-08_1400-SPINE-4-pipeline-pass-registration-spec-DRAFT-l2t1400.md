# SPINE-4 — Register the spine as a pipeline pass; unresolved terms atomically bar compilation
Spec DRAFT (lane 2, l2t1400) — 2026-10-08. Composer verified everything below FIRST-HAND at lane
worktree HEAD d3c73f00 (= trunk tip; `git -c core.fileMode=false diff --stat
b36f914a..HEAD -- ':!.hermes'` = 0 lines — product tree IDENTICAL
to SPINE-1's merge b36f914a; d3c73f00/da76dac3 are .hermes/plans-only docs commits). No scout
output is cited anywhere: every orientation question was answered directly with read_file/search.
Worker: cl-coder. Headless, server-only. NO UI, NO browser gate. Draft — orchestrator reviews and
promotes.

## 0. Goal (one sentence)
Register SPINE-3's resolution engine as ONE declared pass (`resolve_nouns`, family
`disambiguate`) in PassRegistry + `scientist-intent-compile.yaml` positioned ahead of every
noun-consuming stage, make the noun-consuming stages consume the pass's authoritative bindings
instead of re-interpreting hints, and make ANY remaining unresolved argument abort compilation
atomically — structured SPINE-1 clarifications out, zero graph/planned-run/run-file artifacts,
downstream graph stages provably never invoked.

## 1. Assumptions + claim gate (READ FIRST — the shape of this item)
ASSUMED MERGED (this spec is written against trunk + the declared SPINE-2/SPINE-3 APIs; where
today's trunk differs, BOTH are cited):
- SPINE-1 MERGED (b36f914a, task-list.md:3070): actionLocation/clarification contract frozen.
  Verified live today: `ScientistIntentActionLocation` types.ts:99-103,
  `ScientistIntentUnresolvedFact {label, reason, candidates?[{label,confidence?}],
  actionLocation?}` types.ts:105-110 (server/src/compiler/scientistIntent/types.ts).
- SPINE-2 MERGED with the vocabulary triplet LIVE. NOT on trunk today — proven at HEAD:
  `git ls-tree HEAD schema/ --name-only` has NO `scientist-intent/` dir;
  `git cat-file -e HEAD:server/src/compiler/scientistIntent/vocabulary.ts` => "path does not
  exist" (composer ran both). Claim-time trunk MUST show
  `schema/scientist-intent/scientist-intent-vocabulary{.yaml,.schema.yaml,.lint.yaml}` +
  `vocabulary.ts` exporting `loadScientistIntentVocabulary` / frozen vocabulary with
  `verbs()/has()/classOf()/argContracts()/patterns()/policies()/promptVerbBlock()/
  toolActionEnum()` (SPINE-2 spec §5.0/§5.1,
  .hermes/plans/2026-10-08_0415-SPINE-2-verb-vocabulary-externalization-spec.md:157-159 for the
  arg-contract shape `{kind: resolvable|scalar|wells|quantity, required: boolean, domain?,
  capability?, hintEligible?}`, :185-194 for the loader API).
- SPINE-3 MERGED per its promoted spec (.hermes/plans/2026-10-08_1250-SPINE-3-resolution-engine-
  spec.md — orchestrator promotion note :597-624). Engine contract SPINE-4 consumes:
  `server/src/compiler/resolution/` with
  `resolveScientistIntentNouns(intent, vocab, deps): Promise<{bindings, clarifications,
  failures}>` (SPINE-3 spec §5.1:217-222); clarifications ARE
  `ScientistIntentUnresolvedFact` (§5.6:287-289); failures `[{kind:'lookup_error', adapter, term,
  message}]` (§5.6:292). SPINE-3 spec §4:191-192 states verbatim: "SPINE-4 registers it as a
  pass; SPINE-3 registers NOTHING" — THIS item is that registration.
- Orchestrator ruling SPINE-3/OQ2 (promotion note :613-616): normalizeScientistIntent's
  unresolvedRefs key set is NOT widened; "the parse-site comment's promise lands in SPINE-4
  (that item must update the comment text in its own diff)". The comment is
  parseScientistIntent.ts:102-105 ("...SPINE-3 widens it") — SPINE-4 owns a COMMENT-ONLY edit
  there. Verified live today.

CLAIM GATE (verify ALL live at claim time, per the architecture-of-record ground-truth order:
shipped code > lane env facts > recent handoff > intake > old plans):
1. SPINE-2's five §2 artifacts live + its tests green (SPINE-3 spec §2 list applies verbatim).
2. SPINE-3's `server/src/compiler/resolution/` exists and `resolveScientistIntentNouns` is
   exported; run `cd <wt>/server && npx vitest run src/compiler/resolution` => 0 failures.
3. SPINE-1 9-file/83-test set still green (re-measured by composer TODAY at d3c73f00: 83/83).
4. §9 baselines re-captured as SETS against claim-time trunk.

EXECUTABILITY SPLIT (the report must honor it):
- Executable ONLY after SPINE-3 merges: EVERYTHING that imports the engine, AND the pipeline-YAML
  edit + registry registration. Rationale, from shipped code: `runPipeline` fail-fast — every
  pass referenced in the YAML but unregistered returns `PIPELINE_MISSING_PASS` diagnostics and
  ok:false WITHOUT executing anything (PipelineRunner.ts:189-213), and `loadPipeline` is called
  on EVERY compile (compileScientistIntent.ts:151), so landing the YAML entry before the
  registration turns the whole existing scientist-intent suite red
  (scientistIntent.test.ts:245-264 calls compileScientistIntent). YAML + registry.register +
  depends_on edges must be ONE atomic commit with the engine available.
- Executable after SPINE-2 merges but BEFORE SPINE-3 (groundwork, test-only, first commits,
  RED-first): artifact-surface characterization pins of today's
  compileScientistIntent outcome/terminalArtifacts; the spy/onPassEvent barrier harness against
  a STUB pass injected into a temp registry (no YAML change); the `CompileOutcome` consumer audit
  (OQ1 data-gathering). NOTHING else.

## 2. The pass mechanism AS BUILT (every line re-read by the composer today)
### 2.1 Registry + runner
- `server/src/compiler/pipeline/PassRegistry.ts` — in-memory `Map<id, Pass>`; `register()`
  throws on duplicate id (:25-30); `get/has/list` (:38-59). Registration sites:
  scientist-intent: compileScientistIntent.ts `buildRegistry` :81-116; chatbot:
  runChatbotCompile.ts :252-392.
- `server/src/compiler/pipeline/types.ts` — `Pass {id, family, run}` :85-89; `PassFamily` union
  :11-19; `PassDiagnostic {severity, code, message, pass_id, details?}` :24-30; `PassResult`
  :66-78 with `secondaryOutputs` (:71-77, the passthrough precedent: deterministic_precompile
  writing a stripped output into the `ai_precompile` slot); `PipelineState` :37-43 (read-only
  `input/context/meta/outputs/diagnostics`); `CompilerDiagnosticOutcome` :56-61
  ('auto-resolved'|'needs-confirmation'|'needs-missing-fact'|'policy-blocked'|
  'execution-blocked' — today NO scientist-intent pass sets `outcome`; only tracked at
  PipelineRunner.ts:336-339/343-345/395-397).
- `server/src/compiler/pipeline/PipelineRunner.ts` — topological Kahn sort over `depends_on`
  (:438-498; deterministic given YAML order — queue seeded in declaration order :467-473, so the
  "pipeline trace shows the pass before consumers" criterion is reproducible).
  - MISSING pass => fail-fast, nothing runs (:189-213).
  - `when` semantics: free-form string per schema (compile-pipeline.schema.yaml:71-75);
    `DEFAULT_WHEN_EVALUATOR` truthiness over dotted paths through `state.outputs`/`state` (:104-
    134); false => status 'skipped' + info diag `pass_skipped_by_when` (:252-270). The
    scientist-intent YAML uses NO when today (grep: zero `when:` in
    schema/registry/compile-pipelines/scientist-intent-compile.yaml).
  - THE CASCADE-BARRIER (load-bearing for §4 below): a pass with `ok:false` gets status 'failed'
    (:393-400); ANY pass whose `depends_on` names a 'failed' OR 'skipped' pass is ITSELF skipped
    WITHOUT CALLING run() (:272-293), and skips cascade transitively. `pass_started` events fire
    ONLY for passes actually executed (:300).
  - Overall ok = no failed passes AND no error-severity diagnostics (:403-406).
- HOW A PASS DECLARES REQUIRES/PROVIDES — AS BUILT there is NO formal requires/provides slot
  vocabulary (grep 'requires|provides' across pipeline/*.ts: no declaration mechanism; the only
  hit is prose at PipelineRunner.ts:4). "Requires" = `depends_on` in the pipeline YAML (schema
  :65-70 "Ids of prior passes that must succeed before this one runs"); "provides" = the output
  slot keyed by the pass's own id in `state.outputs` (PipelineRunner.ts:384) plus optional
  `secondaryOutputs` keys (:388-392). Consumption is by convention: `state.outputs.get(passId)`
  (e.g. resolve_labware reads 'ai_precompile' + 'lower_protocol_intent',
  ChatbotCompilePasses.ts:1544-1545). SPINE-4 declares through THIS mechanism — no new DSL.
- Loader/validation: `PipelineLoader.ts` — hand-rolled validation (:55-193), `emit` IS in the
  loader's validFamilies (:86-95) while `compile-pipeline.schema.yaml` family enum does NOT list
  'emit' (:55-62) — a KNOWN DRIFT: the YAML files already use `family: emit`
  (scientist-intent-compile.yaml:68, :73, :83) and the schema file is NOT enforced at load
  (loadPipeline never Ajv-validates against it; only the entrypoint enum has an alignment test,
  schemaEntrypointAlignment.test.ts:26-40). Do NOT "fix" the schema drift in this item.
- Pass counts (the item text's "26-pass mechanism" is header drift): the chatbot pipeline
  declares 29 passes (schema/registry/compile-pipelines/chatbot-compile.yaml, 29 `- id:` lines;
  pinned `expect(spec.passes.length).toBe(29)` chatbotCompilePipelineLoad.test.ts:36) while
  compileScientistIntent.ts:5 says "26-pass". `scientist-intent-compile.yaml` declares 16 passes
  (verified count). SPINE-4 makes it 17.

### 2.2 The declared scientist-intent pipeline + the noun-consuming stages
File: `schema/registry/compile-pipelines/scientist-intent-compile.yaml` (entrypoint
`scientist-intent-compile`, enum-registered schema:24-33, PipelineLoader.ts:27). Pass order as
declared (id: depends_on, line in file):
  ai_precompile (:13, synthetic seed — buildRegistry's stub returns normalizeScientistIntent
    output, compileScientistIntent.ts:85-89);
  protocol_intent_state_plan :17 [ai_precompile]; validate_protocol_intent :22 [ai_precompile];
  lower_protocol_intent :27 [state_plan, validate]; expand_protocol_intent_patterns :32
  [state_plan, validate]; expand_biology_verbs :37 [ai_precompile]; apply_directives :42 [lower];
  resolve_labware :47 [lower]; resolve_references :52 [ai_precompile]; resolve_roles :57
  [expand_protocol_intent_patterns, expand_biology_verbs, lower_protocol_intent];
  compute_volumes :62 [resolve_roles]; compute_resources :67 [compute_volumes]; plan_deck_layout
  :72 [compute_resources]; lab_state :77 [resolve_roles]; emit_instrument_run_files :82
  [resolve_roles]; validate :87 [plan_deck_layout].

EXACT STAGE IDS OF EVERY NOUN-CONSUMING STAGE + WHERE THEY RE-INTERPRET HINTS TODAY:
1. `lower_protocol_intent` — emits hint candidates:
   `lowerProtocolIntentLabwareCandidates` ProtocolIntentLowering.ts:204-223 ({hint, reason,
   deckSlot?}, tips/waste join only WITH deckSlot :206-221), wired into the pass output at
   ProtocolIntentLowering.ts:305, :341. The hints themselves come from normalize: symbolic
   source/target/labware labels carried forward (normalizeScientistIntent.ts:107-118
   toCandidateEvent, :167-173 symbolicLabels, :187-196 labwareInstances{labwareHint}).
2. `expand_biology_verbs` — ChatbotCompilePasses.ts:1075-1100: reads
   `ai_precompile.candidateEvents` (:1080) whose `source_labware`/`destination_labware`/`labware`
   fields carry the RAW SYMBOLIC labels (normalizeScientistIntent.ts:110-118) into event details;
   does NOT hit the store (lookup happens downstream).
3. `resolve_labware` — ChatbotCompilePasses.ts:1537-1661: THE re-interpretation site. Reads
   candidateLabwares from ai_precompile + lower_protocol_intent (:1543-1548); per hint calls
   `deps.searchLabwareByHint(hint)` (:1584); 0 matches => labwareAddition minting the hint as
   recordId (:1589-1595); 1 match => resolved (:1601-1611); MULTI-match => **picks matches[0] and
   emits an `info` diagnostic `ambiguous_labware_hint`** (:1615-1627) — today's arbitrary winner
   that SPINE-3's policy replaced at the engine level and which this item must stop shadowing on
   the scientist-intent path. The lookup dep is store READ-ONLY
   (`createLabwareLookup` -> `store.list({kind:'labware'})`, ai/compiler/labwareLookup.ts:62-77).
4. `resolve_references` — ChatbotCompilePasses.ts:1203+: consumes `ai_precompile.unresolvedRefs`
   (:1210-1212) and re-interprets each ref by fuzzy registry lookup (`fuzzyMatch(p.name,
   ref.label) || p.id === ref.label`, protocol arm :1220-1223, assay arm :1234+...). NOTE:
   normalize only ever emits `kind:'unresolved_symbol'` (normalizeScientistIntent.ts:200), so
   today every scientist-intent ref falls to the non-matching arms — coder must read the full
   switch and pin the unresolved_symbol arm's actual fate before editing (do not assume).
5. `resolve_roles` — ChatbotCompilePasses.ts:2288+: `defaultRoleResolver(role, ctx)` (:2335);
   empty expansion => UNKNOWN ROLE PASSES THROUGH UNCHANGED (:2337-2343) — the address-side
   arbitrary passthrough the engine's stricter policy (SPINE-3 §5.3 roleAddressAdapter) replaces.
Downstream GRAPH/artifact stages (must be provably skipped when the bar fires):
`compute_volumes`, `compute_resources`, `plan_deck_layout`, `lab_state`,
`emit_instrument_run_files`, `validate` (YAML :62-90; run-file pass factory
ChatbotCompilePasses.ts:3395-3465, in-memory InstrumentRunFile[] output — it NEVER writes disk
or store; "run-file artifacts" means the `terminalArtifacts.instrumentRunFiles` slot, assembled
at compileScientistIntent.ts:173, :201).
Also OUT of the scientist-intent pipeline but cited per the trace mandate:
`deterministic_precompile`/`NounPhraseResolver` live on the chatbot pipeline only
(runChatbotCompile.ts:267+) — SPINE-4 does not touch the chatbot path (§6 OQ2).

### 2.3 The consumers of the compile result (where a bar surfaces today)
- `compileScientistIntent(intent, deps)` — compileScientistIntent.ts:145-211. Flow:
  normalizeScientistIntent (:149) -> buildRegistry (:150) -> loadPipeline EVERY call (:151) ->
  runPipeline (:161) -> assemble TerminalArtifacts from output slots (:163-202) -> `gaps` from
  unresolvedRefs + error diagnostics (`gatherGaps` :118-137; error diags become
  `kind:'clarification'` gaps :127-135) -> `computeOutcome` (:139-143): 'error' if ANY
  error-severity diagnostic, else 'gap' if gaps, else 'complete'. Deps surface:
  `{searchLabwareByHint?, priorLabState?, onPassEvent?}` (:63-67) — NO store, NO cache, NOTHING
  write-capable on this path.
- Routes: POST /intent/compile — IntentCompileHandlers.ts:47-90: parse (422 on
  ScientistIntentValidationError :63-68), compile, then `reply.send({outcome,
  terminalArtifacts})` at HTTP 200 EVEN WHEN outcome==='error' (:78-82). POST
  /intent/compile-from-prompt — IntentCompileFromPromptHandlers.ts:122-183: active-profile model
  (:44-70), `compileFromSmallLlm` (:163), send `{outcome, terminalArtifacts, localMacro, axes}`
  (:170-175); the ask/answer branch round-trip (:138-158) untouched by SPINE-4 (route CONTRACT is
  SPINE-5's item — SPINE-4 stops at the compile boundary + keeps these two handlers compiling and
  behavior-honest per §4.4).
- `compileFromSmallLlm` returns `{intent, compile}` (intentCompile.ts:239-342, compile call
  :341) — unchanged signature; its `compile` field gains the SPINE-4 result fields.
- Chatbot path (out of SPINE-4's registration scope, enumerated for the barrier trace):
  AgentOrchestrator preflight `runChatbotCompile` :1191-1216 and drafts-compile :2852-2866; BOTH
  pass `labStateCache: getDefaultLabStateCache()` (:1201, :2861) and runChatbotCompile PERSISTS
  the post-pipeline snapshot AFTER the compile — `cache.put(convId, labStateDelta.snapshotAfter)`
  runChatbotCompile.ts:596-599 (IN-MEMORY LabStateCache, not the store). Artifact-writing side
  effects AFTER the compile point, complete list: (a) that cache.put (chatbot path only);
  (b) record-store writes happen ONLY on accept — IntentAcceptHandlers.ts:95
  `ctx.store.create(...)` is a separate later request; (c) foundry consumers branch on outcome
  ('complete' vs gap) — ProtocolFoundryCompileRunner.ts:547, :594, FoundryLedger.ts:251,
  FoundrySupervisor.ts:153/:549, FoundryReviewedSpecRunner.ts:167/:293-294 (chatbot/foundry
  paths; they never see the scientist-intent pipeline, verified: they call runChatbotCompile,
  ProtocolFoundryCompileRunner.ts:7, :579). The scientist-intent path writes NOTHING anywhere
  (grep of compileScientistIntent/intentCompile/both handlers: zero store.create/update).

## 3. The registration DELTA (what SPINE-4 actually changes)
Pass id `resolve_nouns`, family `disambiguate` (schema-safe: family enum lists disambiguate,
compile-pipeline.schema.yaml:58; avoids the emit-drift trap, §2.1). "Provides" = output slot
`resolve_nouns` = `{ bindings, clarifications, failures, blocked: boolean }` (bindings keyed by
actionLocation identity; clarifications are ScientistIntentUnresolvedFact[] verbatim; blocked =
"any argument still unresolved after reconciliation"). "Requires" = `depends_on:
[ai_precompile]` (the engine consumes the PARSED document + normalized symbols, not expanded
events).

DECLARED POSITION — YAML edits (one atomic commit):
1. Insert pass `resolve_nouns` after `ai_precompile` (YAML list order + Kahn seeding keep the
   trace honest).
2. ADD `resolve_nouns` TO THE `depends_on` OF EVERY NOUN CONSUMER:
   lower_protocol_intent (:29), expand_protocol_intent_patterns (:34), expand_biology_verbs
   (:39), apply_directives (:44 — consumes lower's directives, keep transitive via lower; the
   coder must add it to lower only and prove apply_directives cannot run without lower),
   resolve_labware (:49), resolve_references (:54), resolve_roles (:59).
   This places resolve_nouns topologically ahead of every noun consumer AND wires the
   cascade-barrier (PipelineRunner.ts:272-293) to every graph stage downstream of them.
   After the edit: resolve_nouns fails => lower/expand/patterns/verify references/roles skipped =>
   compute_volumes/compute_resources/plan_deck_layout/lab_state/emit_instrument_run_files/validate
   skipped (transitively) => their output slots ABSENT => TerminalArtifacts assembly sees empty
   slots (compileScientistIntent.ts:163-173 all `?? []`/undefined-guarded).
3. Registration in `buildRegistry` (compileScientistIntent.ts:81-116):
   `registry.register(createResolveNounsPass({ resolve: resolveScientistIntentNouns, vocabulary:
   <the shipped vocabulary singleton or injected fixture via deps>, deps: {spine, labwareHint-
   search via deps.searchLabwareByHint, ...engine deps}}))` — deps threaded through
   `ScientistIntentCompileDeps` as OPTIONAL fields (exactOptionalPropertyTypes: conditional
   spread at every construction site; when resolve_nouns is NOT constructible the pass
   registration itself throws LOUD — the fail-loud doctrine SPINE-3 §11.10 inherits upward:
   NO degraded no-resolution mode).

SMALLEST CONSUMPTION CONTRACT PER STAGE (do NOT redesign the stages; each edit is
"authoritative-if-present, byte-identical-legacy-when-absent"):
- `resolve_labware`: at the head of the per-candidate loop (ChatbotCompilePasses.ts:1578+), if
  `state.outputs.get('resolve_nouns')?.bindings` has an authoritative recordId for this hint/
  label, push `{hint, recordId, title?}` into resolvedLabwares WITHOUT calling
  `searchLabwareByHint` (:1584) and WITHOUT the multi-match top-pick arm (:1604-1627). When the
  slot is absent (chatbot pipeline, extraction pipeline, any pipeline without the pass): today's
  code runs untouched. This single seam is what "downstream consumes authoritative bindings
  instead of re-interpreting hints" means concretely for the hint path — resolve_draft-style
  binding arrives pre-decided; the search is a SECOND noun lookup the criterion forbids.
- `lower_protocol_intent` / `expand_biology_verbs`: NO edit. They carry labels; once resolve_
  nouns runs the canonical refs reach the assembly through resolve_labware's resolved slot and
  the bindings map — verified by the `resolved-bindings` test asserting the search spy recorded
  ZERO calls for bound labels on the scientist-intent path. (Smallest diff that satisfies
  "no second noun lookup" without moving lowering logic.)
- `resolve_references`: the unresolved_symbol arm must consume the slot: refs whose label the
  pass bound are NOT re-fuzzy-matched; refs the engine left unresolved never reach here because
  the bar already fired. If the coder's read of the switch (§2.2 item 4 caveat) shows
  unresolved_symbol already inert, the minimal edit is a guard clause + a code comment citing
  the slot — pin both in tests.
- `resolve_roles`: consume the engine's address bindings for `kind:'wells'` contracts: if a
  binding provides concrete wells for an event's role, use them instead of `defaultRoleResolver`
  (:2335) and NEVER take the unknown-role pass-through (:2337-2343) for an argument the vocabulary
  declares resolvable. Slot-absent => byte-identical today. If the engine returned no address
  for a declared-address argument, the bar already fired upstream — assert that, don't re-check.
- `compileScientistIntent` result: add `clarifications: ScientistIntentUnresolvedFact[]` to
  `ScientistIntentCompileResult` (compileScientistIntent.ts:69-74, additive-optional-safe since it
  is a returned field, not input); when `resolve_nouns.blocked`, force
  `outcome = <bar-outcome>` (OQ1), REPLACE gaps with the structured clarifications (no half-
  baked `{message}` gap strings for the blocked case — gatherGaps' error-diag->gap stringification
  :127-135 must not be the presentation channel), and EMPTY the artifact-bearing slots
  (events/directives/deckLayoutPlan/resourceManifest/instrumentRunFiles/labStateDelta/
  labwareAdditions absent — conditional-spread construction already dominant at :183-201;
  extend it). Also update the parseScientistIntent.ts:102-105 COMMENT (SPINE-3 OQ2 ruling —
  comment-only, no behavior change; SPINE-1's pins are behavioral).

## 4. The clarification BARRIER — mechanism, not hope
### 4.1 Where the abort surfaces
The pass returns `{ok:false, output:{blocked:true, clarifications, ...}, diagnostics:[{severity:
'error', code:'unresolved_arguments', message, pass_id:'resolve_nouns',
details:{clarifications}}]}`. Runner: status 'failed' (:393-400), overall ok:false (:406), error
diag present => `computeOutcome` 'error' TODAY (:139-143) — SPINE-4 upgrades this to the OQ1 bar
outcome so 'error' keeps meaning "compile machinery broke" and "the scientist must answer" is
machine-distinguishable (SPINE-5's route contract depends on it).
### 4.2 Atomicity (no partial writes) — enumerated from code
The scientist-intent compile path is WRITE-FREE end-to-end (§2.3): pass registry, PipelineRunner
state, TerminalArtifacts assembly — all in-memory; both routes respond only. The ONLY post-
compile side effects that exist ANYWHERE near this seam are (a) chatbot-path LabStateCache
.put (runChatbotCompile.ts:596-599 — not reachable from compileScientistIntent), (b) accept-time
store.create (IntentAcceptHandlers.ts:95 — different request), (c) foundry ledger writes (chatbot
path). ATOMICITY IS THEREFORE STRUCTURAL: no pass on the scientist-intent pipeline has a
write-capable dep (§2.3 deps surface), and the engine itself has zero write imports (SPINE-3 §10
grep gate — re-run it here). SPINE-4 must KEEP it that way: the resolve_nouns pass gets NO store
dep; the report proves it with the import grep.
### 4.3 "Provably not invoked" — the mechanism (test approach, both proofs required)
- PROOF A (spy): in tests, wrap the consumer/graph pass FACTORIES with a recording decorator
  before building the registry (tests build their own registry — buildRegistry's passes are
  imported factories, so the test registers spy-wrapped Pass objects delegating to the real
  `.run`), then assert `callCount === 0` for every stage in the downstream list (§2.2).
- PROOF B (trace): `deps.onPassEvent` (compileScientistIntent.ts:66, threaded at :161; runner
  emits pass_started ONLY on execution, PipelineRunner.ts:299-303) — capture the event list and
  assert NO `pass_started` for any downstream graph stage after a bar, and assert resolve_nouns'
  own started/finished pair IS present (the abort is a real executed pass, not a silent gap).
  Additionally assert pass_statuses from the run carry status 'skipped' with reason
  `dependency resolve_nouns was failed` for each consumer (exact reason string built at
  PipelineRunner.ts:288).
### 4.4 candidateEvents never presented as success
normalizeScientistIntent ALWAYS populates candidateEvents (:237) and today a document with
unresolved symbols still compiles artifacts with outcome 'gap' (pinned today:
scientistIntent.test.ts:245-264 — title "gap: unresolved symbol", asserts mix+transfer events
EXIST). Under SPINE-4 an unresolved argument BARS: outcome must not be 'complete' and
terminalArtifacts.events must be EMPTY. That existing test is therefore a DELIBERATE GOLDEN
CHANGE (see §6 pin list): either the fixture's labels all resolve in the stub (events kept,
byte-identical) or its unresolved arm flips to the bar (zero events + clarifications) — the
coder converts it in-diff with the before/after in the handoff, never silently.
Route behavior during SPINE-4 (before SPINE-5's response contract): the two handlers keep
returning 200 + `{outcome, terminalArtifacts}` — honest because artifacts are structurally empty
on a bar; SPINE-5 gives it the documented needs-clarification shape. NO new route, NO status-code
change here (that's SPINE-5's approved scope).

## 5. Model-supplied unresolved[] reconciliation + the declarative constraint
### 5.1 Reconciliation (rule, as data-as-possible)
Inputs: doc `unresolved[]` (SPINE-1 shape, types.ts:105-110) vs engine `clarifications[]` +
`bindings[]`. Reconcile ONLY where declared rules justify it:
- DROP a model item when the engine produced an authoritative BINDING for the same slot
  (actionIndex+argument identity when actionLocation present; label identity otherwise) — the
  vocabulary's arg-contract + policy data justified the bind; the model's hedge is superseded.
- MERGE when the engine clarified the same slot: engine clarification wins, model candidates are
  appended as evidence ONLY when their label appears in the engine candidate set (provenance
  preserved; NEVER minted — SPINE-3 §5.4: hints are evidence, never canonical identity).
- KEEP any model item the engine did not touch (it names a slot the engine never saw) — it bars
  exactly like an engine clarification.
DATA-vs-CODE DECLARATION (per SPINE-2 OQ precedent): the rule CANNOT live in the lint DSL
today — no predicate composes a per-item cross-document join (there is no computed cross-
reference / index-resolution predicate; the same gap SPINE-3 §7 documents for the
actionIndex<->action invariant, and the lint engine runs over one record payload against one
spec — LintEngine.ts schemaId filter, cited in SPINE-3 appendix :538-540). SMALLEST GENERIC
CODE LOCATION: the reconciliation function inside the SPINE-4 pass module
(`server/src/compiler/resolution/resolveNounsPass.ts`, NEW file under SPINE-3's owned dir — the
pass IS SPINE-4's addition to that directory; §4 out-of-scope map there named SPINE-4 as the
registration owner). It switches on NOTHING but identity + engine output + declared contract
fields; report must show the verb-literal grep (§7 gate) EMPTY inside it.
### 5.2 Declarative missing-address/quantity fires pre-compile, zero verb-specific TS
Data path, declared at each hop:
`schema/scientist-intent/scientist-intent-vocabulary.yaml` per-arg `required: true`
(SPINE-2 spec :157-159 — arg contract `{kind, required, domain?, capability?, hintEligible?}`)
-> `vocabulary.argContracts(verb)` (SPINE-2 §5.1) -> engine `ResolutionRequest.declared`
(SPINE-3 §5.2:224-231) -> the generic required-argument check (absent/blank label where
declared.required AND kind is resolvable/quantity => clarification with a stable reason code,
e.g. `missing-required-argument`, actionLocation filled) -> resolve_nouns fails -> bar.
PRE-COMPILE BY CONSTRUCTION: resolve_nouns topologically precedes lowering/expansion/graph
(§3), so nothing compiled has happened when the constraint fires. The check loops over
`argContracts(verb)` map entries — there is NO `if (verb === ...)` anywhere; criterion 5's test
flips `required: true` on a FIXTURE COPY of the vocabulary (loader `opts.path` injection,
SPINE-2 discipline) for an address arg (kind 'wells') and a quantity arg on different verbs,
and the §7 hardcode grep proves no verb name entered the TS.

## 6. TEST PLAN (vitest from `<wt>/server`; RED-first; goldens untouched unless deliberately
pinned — every deliberate re-pin gets a before/after diff in the handoff). Criteria names are
VERBATIM from task-list.md:3221-3227. New test files live under
`server/src/compiler/resolution/` (pass + registration tests) — SPINE-3's owned dir, SPINE-4's
registration turf per its §4.
1. `scientist-intent-pipeline.resolution-pass-order` — loadPipeline(scientist-intent-compile.
   yaml): resolve_nouns present; 17 passes; topological position strictly before every noun
   consumer (assert depends_on edges per §3); plus a REAL compile with onPassEvent capture
   asserting the runtime trace order matches (Kahn determinism, §2.1).
2. `resolved-bindings` — stub the engine deps so every noun binds; assert bound recordIds reach
   resolve_labware's resolvedLabwares output and the searchLabwareByHint SPY has ZERO calls for
   bound labels; resolve_roles consumes engine wells when declared (no defaultRoleResolver call
   for bound address args); artifact contents byte-equal to the pre-SPINE-4 fixture where the
   same recordIds would have been found (no gratuitous reshaping).
3. `clarification-barrier` — ONE bad argument among valid actions (e.g. 3 valid + 1 unbindable
   label): clarifications non-empty (SPINE-1 shape incl. actionLocation); terminalArtifacts has
   NO events/directives/deckLayoutPlan/resourceManifest/instrumentRunFiles/labStateDelta/
   labwareAdditions (assert key ABSENCE via Object.keys, exactOptionalPropertyTypes convention);
   PROOF A spy callCount===0 for all downstream stages AND PROOF B no pass_started in the trace
   + pass_statuses 'skipped: dependency resolve_nouns was failed' (§4.3); outcome = bar outcome
   (OQ1), NOT 'complete'; lookup-error arm (engine failure) also bars with reason
   'resolution-lookup-failed' intact (SPINE-3 §5.6 codes pass THROUGH unchanged — SPINE-4 does
   not rename them).
4. `legacy-labware-hints` — existing suites re-run UNTOUCHED and green: scientistIntent/ (3
   files incl. clarification/contract), protocolIntent/ (6 files, 83 tests total), Chatbot
   labware-hint passes tests; resolve_labware slot-ABSENT path byte-identical (its chatbot
   consumers see zero change — proven by the existing chatbot pass tests staying green, and
   chatbotCompilePipelineLoad's 29-pin UNTOUCHED).
5. `declarative missing-address/quantity` — per §5.2 with a fixture vocabulary copy; bar fires;
   zero graph passes executed; grep gate in §7.
DELIBERATE GOLDEN/BEHAVIOR RE-PINS expected (diff in handoff, no rubber-stamp):
- scientistIntent.test.ts:245-264 ("gap: unresolved symbol") — converts per §4.4.
- IntentCompileHandlers.test.ts / IntentCompileFromPromptHandlers.test.ts — any fixture with an
  unresolved symbol moves from artifacts-present to artifacts-empty + bar outcome (expected-
  outcome edits only; the routes' status codes MUST stay as-is — SPINE-5 owns the response).
- NOTHING else. chatbotCompilePipelineLoad.test.ts:36 (29) MUST NOT change (chatbot YAML
  untouched, OQ2).

## 7. Verification commands (final, expected outputs)
- `cd <wt>/server && npx vitest run src/compiler/resolution src/compiler/scientistIntent
  src/compiler/protocolIntent` => 0 failed files/tests (SPINE-1's 83 + SPINE-3's suite + SPINE-4's
  new files all included; zero new failing files).
- `cd <wt>/server && npx vitest run src/ai` => failing-FILE SET identical to claim-time capture
  (composer today: 10 files / 21 failed tests, set in §9).
- `cd <wt> && npm run typecheck -w server 2>&1 | grep 'error TS' | sed 's/([0-9]*,[0-9]*)//' |
  sort` => `comm -3` vs claim-time trunk capture EMPTY (26 lines today; non-zero exit by design;
  record, never demand green; none of the 6 owning files is in this item's diff EXCEPT
  AgentOrchestrator whose 8 lines live at :285/:2679+ — outside any SPINE-4 edit site; if the
  OQ1 union widening touches a foundry file, that file's error COUNT must not change — capture
  before/after per-file).
- `cd <wt> && npm run typecheck -w app` => 47 lines / 24 files (standing pin; app/** diff EMPTY).
- Ownership gate: `git -c core.fileMode=false diff --name-only <base>..HEAD | grep -v -E
  '^server/src/compiler/resolution/|^server/src/compiler/scientistIntent/compileScientistIntent\.
  ts$|^server/src/compiler/scientistIntent/parseScientistIntent\.ts$|^schema/registry/compile-
  pipelines/scientist-intent-compile\.yaml$|^server/src/compiler/pipeline/passes/
  ChatbotCompilePasses\.ts$|^server/src/api/handlers/Intent(Compile|CompileFromPrompt)
  Handlers\.ts$|^server/src/api/handlers/Intent.*\.test\.ts$|^server/src/compiler/scientistIntent/
  scientistIntent\.test\.ts$|^\.hermes/plans/'` => EMPTY.
  (ChatbotCompilePasses.ts is in the allow-list because the consumption seams of §3 live there —
  every edit must be slot-guarded; reviewer checks each hunk.)
- Hardcode greps (the review WILL run these):
  `grep -rnE "'(transfer|read|wash|spin|add_material|serial_dilution|[a-z_]+)'\s*(===|!==|==|in\b)"
  server/src/compiler/resolution/resolveNounsPass.ts` => ZERO verb/class/domain literals
  (reason codes + slot ids + pass id only — reviewer checks each).
  `grep -n "store" server/src/compiler/resolution/resolveNounsPass.ts` => zero write-capable
  imports (§4.2).
  Pipeline YAML: `grep -c '^  - id:' schema/registry/compile-pipelines/scientist-intent-compile.
  yaml` => 17; `grep resolve_nouns chatbot-compile.yaml` => EMPTY.

## 8. Reviewer bait (likely edge errors for THIS item — pre-empt in code + report)
1. YAML-LANDS-BEFORE-REGISTRATION: any commit where the YAML names resolve_nouns but the engine/
   registration isn't in the same commit reds the whole scientist-intent suite via
   PIPELINE_MISSING_PASS fail-fast (PipelineRunner.ts:197-213). One atomic commit.
2. FORGOTTEN DEPENDS_ON EDGE = the whole criterion: a noun consumer without the edge runs after
   the bar and builds a half-resolved graph. The test asserts per-stage skip reasons (§4.3
   PROOF B), so an omission fails LOUDLY — do not weaken the test to "outcome failed".
3. OUTCOME-STRING OVERREACH: do NOT change route status codes or invent a response contract here
   (SPINE-5's approved scope); do NOT rename SPINE-3's reason codes; do NOT set
   CompilerDiagnosticOutcome on unrelated passes.
4. THE DRIFT TRAP: compile-pipeline.schema.yaml family enum lacks 'emit' while the loader allows
   it and the shipped YAML uses it (§2.1). Use `disambiguate`; do NOT "repair" the schema — a
   schema edit there is a different item's mess.
5. THE 29 PIN: chatbotCompilePipelineLoad.test.ts:36 — chatbot-compile.yaml is NOT touched.
   "Register in PassRegistry" means buildRegistry (scientist-intent), not runChatbotCompile.
6. exactOptionalPropertyTypes sites: the result `clarifications` field, TerminalArtifacts slot
   spreads, clarification construction — conditional spread only; tests assert key ABSENCE via
   Object.keys, never toEqual-with-undefined (SPINE-1 harness convention).
7. YAML-reload trap: pipeline YAML re-read every call (loadPipeline at
   compileScientistIntent.ts:151 — readFileSync :202-212, no cache), so in-process staleness is
   IMPOSSIBLE — but the lane stack's tsx --watch does NOT reload vocabulary/pipeline YAML; the
   orchestrator restarts the stack in background; the coder NEVER curls :3093/:5193 or calls
   staleness a defect. Fixture vocabularies via `opts.path` injection; NEVER mutate the shipped
   vocabulary/pipeline files in a test.
8. resolve_labware legacy arms: removing/moving the multi-match top-pick (:1604-1627) breaks the
   CHATBOT path (unpinned by SPINE-1 but live). Guard with slot-presence; both arms tested
   (bound-label bypass + slot-absent legacy byte-identity).
9. resolve_references caveat honored: read the WHOLE switch before editing — normalize only emits
   `unresolved_symbol` (:200); assuming a protocol/assay arm fires on the scientist-intent path
   is UNVERIFIED (composer flagged, not inferred-as-fact, §2.2 item 4).
10. Bar-as-'error' conflation: 'error' must keep meaning "compile broke". If the orchestrator
    picks OQ1(a), the clarification-bar test asserts the DISTINCT outcome string in addition to
    empty artifacts; assert lookup-error vs unknown-noun reason codes stay distinguishable in the
    clarifications payload (SPINE-3 criterion parity through the pipeline).
11. Spy-harness honesty: PROOF A spies must delegate to the real `.run` on the happy path (the
    resolved-bindings test uses the SAME wrapped factories — a no-op stub pass would make both
    proofs vacuous; show a mutation leg: remove one depends_on edge in a scratch run, watch the
    barrier test go RED).
12. Ontology terms / knowledge layer: this item consumes NO claim/context/assertion semantics;
    docs/knowledge-layer-canonical-example.md read per protocol — the binding rule that applies
    is CLAUDE.md "if it can be expressed as data it must be" + the rip-out test
    (computable-lab-principles.md:63): deleting a verb from the vocabulary must still flow
    (SPINE-2's rip-out carries it); SPINE-4 adds zero verb knowledge to TS.
13. Hardcode boundary: the reconciliation fn and consumption seams must read engine
    `blocked`/bindings and vocabulary contracts ONLY — any per-verb/per-domain literal beyond
    reason/slot/pass ids is a self-flag (§7 greps).

## 9. BASELINES — MEASURED BY THE COMPOSER TODAY AT d3c73f00 (product tree == b36f914a). Re-
measure ALL as SETS at claim time; trunk WILL have moved (SPINE-2/SPINE-3 merges):
- Server tsc: `npm run typecheck -w server 2>&1 | grep 'error TS' | sed
  's/([0-9]*,[0-9]*)//' | sort` => 26 lines / 6 files; per-file counts (measured):
  AgentOrchestrator 8, RecordStoreImpl 11, AuthoringGuard 3, ProtocolIntakeHandlers 2,
  RecordHandlers 1, bootstrapAdmin 1 — identical to the SPINE-1/SPINE-3 pinned SET; gate =
  `comm -3` SET identity vs claim-time capture, never demand green.
- src/ai failing-FILE SET (composer re-ran today): 10 failed | 74 passed (84) files; 21 failed |
  644 passed (665) tests: AgentOrchestrator.bypass, AgentOrchestratorForwarding,
  AgentOrchestrator.golden, AgentOrchestrator.goldenWithSeeds, AgentOrchestrator.tubeGate,
  ChatbotCompileDeckSlot, chatbotCompile.e2e, InferenceClient.config, materialFollowUp,
  submitSuggestionTool.tubeSchema. Set-identity gate claim-time AND final.
- scientistIntent+protocolIntent: 9 files / 83 tests PASS (re-measured today, 83/83).
- NEW THIS ITEM (SPINE-4 runs inside the pipeline dir, so its baseline is pinned here):
  `npx vitest run src/compiler/pipeline` => 13 failed | 76 passed (89 files, three-dir union
  run: 29 failed | 667 passed tests). Failing-file SET (assertion failures, NOT environment —
  pre-existing at this HEAD, none touched by the spine work): aiPrecompileGating,
  fixtures/BaselineFixtures, fixtures/CrossTurnMini, fixtures/FixItFixtures,
  fixtures/FixtureRunner, fixtures/PatternExpandersDebug, fixtures/Prompt01Green,
  fixtures/Prompt02Green, fixtures/Prompt04DeepDebug, parser-evals/ParserEvalHarness,
  passes/AiPrecompileShapeMismatch.log, passes/GeminiEmAppliancePath,
  passes/ProtocolRealizePass. Gate: SET identity (zero NEW failing files), NOT green.
- app tsc 47/24 pin: carried from handoff 2026-10-08_1310 (baseline facts) — carried, NOT
  re-measured today; app diff must be EMPTY so record once.
- NFS/harness standing facts: git ALWAYS `-c core.fileMode=false`; vitest from `<wt>/server`
  ONLY; stack restart is BLOCKING -> orchestrator, background; worktree add ~4-6 min background
  + HEAD re-verify vs trunk tip before dispatch; Playwright N/A (headless).

## 10. Worker contract
- Worktree `wt/SPINE-4-lane2-l2t1400` off trunk `cl/integration-2` AT CLAIM TIME (base >=
  SPINE-3's merge commit; branch `spine-4-lane2-l2t1400`). One worker (cl-coder, fleet lock).
  Bootstrap per the SPINE-1/2 recipe (7 symlinks incl. server/schema, start-app.sh, trunk
  untracked entries 1:1).
- Deliverable report (unique): `.hermes/plans/SPINE-4-report.wip-l2t1400.md` — must contain:
  claim-gate §1 output live (SPINE-2 five artifacts + SPINE-3 resolution dir test run); the
  executability-split statement with which commits were groundwork; RED evidence per §6 test
  BEFORE each GREEN; the §4.3 PROOF A + PROOF B transcripts; the mutation leg (§8.11) transcript;
  deliberate golden diffs (§6 list) verbatim; §7 greps verbatim; re-measured §9 SETS both sides
  of the merge; resolve_references fate-of-unresolved_symbol finding (§2.2 caveat); the OQ1
  consumer-audit table (every CompileOutcome comparison site from §2.3 and its disposition).
- Server-only -> NO browser gate.

## 11. Open questions (orchestrator rules; each decidable)
OQ1 — Bar-outcome shape. (a) Add `'needs-clarification'` to the `CompileOutcome` union
(CompileContracts.ts:78 today `'complete'|'gap'|'error'`) and audit consumers, vs (b) reuse
'error' + a required `clarifications[]` field. RECOMMEND (a): SPINE-5's route must
machine-distinguish "model/resolution uncertainty" from "invalid-model-output"/crash (its own
verified-by names the distinction), and every consumer found today compares `=== 'complete'`
(foundry sites §2.3c, AgentOrchestrator.ts:1238, ProtocolFoundryCompileRunner.ts:547/:594) so
the new member falls through existing non-complete arms with zero edits — BUT the union is
shared: tsc will surface any exhaustive switch; if one appears outside the audited list, stop
and report rather than paper it. Trade-off (b): zero type churn now, guaranteed rename cost in
SPINE-5. Checked: union site, all comparison sites via grep, gatherGaps/computeOutcome flow.
OQ2 — Register resolve_nouns in chatbot-compile.yaml too? RECOMMEND NO: the item text names
scientist-intent-compile.yaml; the chatbot pipeline's noun handling is the deterministic_precompile
/NounPhraseResolver door (different pipeline surface, SPINE-3 spec §3.1 out-of-scope map), the
29-pin would need a deliberate re-pin, and chatbot consumers (AgentOrchestrator/foundry) have
outcome contracts SPINE-4 must not silently change. A chatbot registration is its own item once
SPINE-4's evidence exists. Checked: YAML pass lists, pin at chatbotCompilePipelineLoad.test.ts:36,
runChatbotCompile registry :252-392.
OQ3 — LabwareAdditions on a bar: on a blocked compile, `resolve_labware` is skipped so
`labwareAdditions` (the "propose a new labware" proposals a UI would show) vanish entirely,
including additions UNRELATED to the bad argument. Options: (a) accept total zero-artifact (task
text is literal: "no graph/planned-run/run-file artifacts"; simplest, matches the approved
verified-by); (b) surface blocked-run labwareAdditions as clarification candidates inside the
clarifications payload instead of artifacts. RECOMMEND (a) for SPINE-4 (the acceptance is
verbatim zero-artifact and the engine's mint-affordance clarification already carries "this
label is unknown, here are candidates"); if the UI later needs the additions, that's a SPINE-5/
presentation decision with its own criterion. Checked: resolve_labware additions arm
(:1589-1595), TerminalArtifacts.labwareAdditions slot (:183-185), approved text
task-list.md:3224-3225.

## Appendix A — cite-verified log (EVERY file:line re-read first-hand by the composer at
d3c73f00; product tree == b36f914a; NO scout output cited; live-absence proofs for SPINE-2
artifacts run today: ls-tree + cat-file outputs in §1):
- PassRegistry.ts :16-59; pipeline/types.ts :11-89; PipelineRunner.ts :14-29 (spec shapes),
  :104-134 (when), :189-213 (missing-pass), :215-235+238-303+330-401 (exec/status/outputs),
  :272-293 (cascade skip — the barrier), :299-303 (pass_started only-on-execution), :336-339
  (outcome tracking), :384-392 (output + secondaryOutputs), :403-406 (ok rule), :438-498 (Kahn).
- PipelineLoader.ts :17-28 (entrypoints), :55-138 (pass validation), :86-95 (families incl.
  emit), :202-229 (loadPipeline reads EVERY call).
- compile-pipeline.schema.yaml :24-33 (entrypoint enum incl. scientist-intent-compile), :48-75
  (pass shape; family enum WITHOUT emit :55-62; when free-form :71-75);
  schemaEntrypointAlignment.test.ts :26-40; chatbotCompilePipelineLoad.test.ts :36 (29-pin).
- scientist-intent-compile.yaml :1-90 full read (16 passes; depends_on lists; no `when`);
  chatbot-compile.yaml (29 `- id:` lines enumerated).
- compileScientistIntent.ts :1-211 full read (26-pass header :5; seam stub :85-89; factories
  :91-113; gatherGaps :118-137; computeOutcome :139-143; assembly :163-202; deps :63-67;
  onPassEvent threaded :161).
- normalizeScientistIntent.ts :1-244 full read (PATTERN_ACTIONS :33; symbols :107-118/:167-173;
  labwareInstances :187-196; unresolvedRefs kind unresolved_symbol :198-204;
  blocksLowering:false :230; candidateEvents always :237).
- types.ts (scientistIntent) :40-130: action-value :49-89, expected*Domain + comment :61-66,
  ScientistIntentActionLocation :99-103, ScientistIntentUnresolvedFact :105-110.
- parseScientistIntent.ts :95-135 (the "SPINE-3 widens" comment :102-105;
  preserveActionLocation conditional spread :118-133).
- ChatbotCompilePasses.ts: createLabwareResolvePass :1537-1661 (reads :1543-1548, search :1584,
  zero arm :1589-1595, one :1601, multi top-pick + ambiguous_labware_hint :1615-1627);
  createExpandBiologyVerbsPass :1075-1100 (candidateEvents :1080); createResolveReferencesPass
  :1203-1240 (unresolvedRefs :1210-1212, protocol fuzzy :1220+); createResolveRolesPass :2288-
  2360 (defaultRoleResolver call :2335, unknown-role passthrough :2337-2343);
  createEmitInstrumentRunFilesPass :3395-3465 (in-memory only); createMintMaterialsPass :1837+
  (chatbot-only, no store writes inside passes).
- ProtocolIntentLowering.ts :27/:305/:341 (candidateLabwares in pass output);
  lowerProtocolIntentLabwareCandidates :204-223 (re-verified same-day as SPINE-3's cites).
- ProtocolIntentValidation.ts blocksLowering sites :49-:57, :277, :421-:448, :494 (blocker
  filter) — cited for the validate-stage semantics only; NOT edited.
- runChatbotCompile.ts :239+ (registry build :252-392, deterministic_precompile deps :267+,
  labStateCache arg :127/:244, cache.put :596-599, downstreamQueue :593); AgentOrchestrator.ts
  :30/:514, preflight :1191-1216, labStateCache :1201/:2861, drafts-compile :2852-2866,
  short-circuit outcome use :1236-1241.
- IntentCompileHandlers.ts :47-97; IntentCompileFromPromptHandlers.ts :44-70, :122-190;
  IntentAcceptHandlers.ts :95 (store.create accept-only); labwareLookup.ts :62-77 (read-only).
- intentCompile.ts :140-147 (INTENT_ACTIONS — SPINE-2 mirror, not edited here), :239-342
  (compileFromSmallLlm, compile call :341); CompileContracts.ts :78 (CompileOutcome), :348-352.
- Foundry outcome consumers: ProtocolFoundryCompileRunner.ts :7/:547/:579/:594; FoundryLedger.ts
  :251; FoundrySupervisor.ts :153/:549; FoundryReviewedSpecRunner.ts :167/:293-294.
- scientistIntent.test.ts :245-264 (the deliberate-re-pin target); IntentCompile*.test.ts
  present (behavior edits expected per §6).
- SPINE-3 spec consumption cites: §4:191-192 (SPINE-4 registers), §5.1:217-222 (engine
  signature), §5.6:287-296 (clarification/failure shapes), §7 (lint-DSL gap),
  promotion note :597-624 (OQ1-OQ3 rulings; "SPINE-4 must update the comment" :615-616).
- SPINE-2 spec :157-159 (arg contract incl. `required: boolean`), :185-194 (vocabulary API),
  :360-372 (Q1-Q3 rulings pattern — the OQ precedent for §5.1's data-vs-code finding).
- computable-lab-principles.md :63 (rip-out hard stop), :116 (declarative/imperative split);
  CLAUDE.md (lane copy) — knowledge-layer rule read per protocol; no claim/context/assertion
  surface in this item.
- Live measurements today: tsc 26-line SET (raw saved /tmp/spine4-tsc-raw.txt; per-file counts
  §9); src/ai 10-file SET + 21/665; scientistIntent+protocolIntent 83/83; pipeline-dir failing
  SET 13 files (three-dir union 29 failed/667 passed) — assertion-level, pre-existing;
  SPINE-2/SPINE-3 live-absence proofs (§1); `git -c core.fileMode=false diff --stat
  b36f914a..HEAD -- ':!.hermes'` = 0 (product tree identity).

COMPOSER DONE — draft only; orchestrator review required before dispatch.
