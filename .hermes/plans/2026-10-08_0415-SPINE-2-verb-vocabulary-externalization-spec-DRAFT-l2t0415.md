# SPINE-2 — Externalize the 31-verb vocabulary + argument contracts into YAML; TypeScript keeps no list
Spec DRAFT (lane 2, l2t0415) — 2026-10-08. Composer reads verified at trunk 55319ef2 (PB-CH-8 fix1
merged; SPINE-1 spec promoted at aca53208, SPINE-1 NOT yet on trunk). Worker: cl-coder. Headless,
server-only. NO UI, NO browser gate. Draft — orchestrator reviews and promotes.

## 1. Intent (one sentence)
Move the scientist-intent verb vocabulary and per-argument contracts out of seven hand-maintained
copies into ONE declarative YAML triplet (schema + data + lint) that the parser, the lifter, the
normalizer's pattern-set, the tool schema, and the prompt builder all consume — so that deleting a
verb from YAML deletes it from prompt and parser with zero TypeScript edits (CLAUDE.md:160 rip-out
rule; campaign LOCKED decision "op vocabulary + field policy live in YAML, never TypeScript
branches").

## 2. Claim gate — SPINE-1 merged (precise; verify ALL of these on trunk before claiming)
SPINE-2 rides SPINE-1's frozen contracts. At claim time trunk MUST contain (check each):
1. `server/src/compiler/scientistIntent/fixtures/verb-inventory.yaml` — the 31-verb migration
   baseline, declaration order (SPINE-1 §6). SPINE-2's `current-verb-parity` test diffs the shipped
   vocabulary against THIS file (set + order), not against any TS list.
2. `server/src/compiler/scientistIntent/scientistIntentContract.test.ts` with the in-test
   `verb-inventory` equality (fixture == types.ts union == schema enum == KNOWN_ACTIONS ==
   INTENT_ACTIONS) and `scientist-intent-contract.compatibility`.
3. `server/src/compiler/scientistIntent/clarificationContract.test.ts` (argument-location identity
   + confidence-scale pins).
4. `server/src/compiler/protocolIntent/ProtocolIntentLoweringCharacterization.test.ts`
   (hint->candidate->deckSlot pins).
5. `schema/workflow/scientist-intent.schema.yaml` carrying SPINE-1's optional extensions
   (`actionLocation`, `expected*Domain`, candidates freeze) and `types.ts`
   `ScientistIntentUnresolvedFact.actionLocation` preserved by `normalizeDocument`.
If any is missing, SPINE-2 is NOT claimable (composer verified at 55319ef2: NONE of 1-5 exist yet —
`server/src/compiler/scientistIntent/` is still 7 files, no fixtures/ dir). SPINE-2 must keep every
SPINE-1 characterization pin green THROUGHOUT its own migration (see §7 migration order); a pin that
"needs updating" is a design defect in SPINE-2, not a pin problem.

## 3. Verified file map at 55319ef2 (every line re-read by the composer; scout-free)

### 3.1 The verb-set copies (THE things SPINE-2 kills or mirror-checks)
SEVEN copies, all 31, all verified today (union count re-extracted programmatically = 31):
- A. `server/src/compiler/scientistIntent/types.ts:12-47` — `ScientistIntentActionKind` type union.
  COMPILE-TIME ONLY (a type; no runtime emission). -> stays as the drift-checked mirror (§5.3).
- B. `schema/workflow/scientist-intent.schema.yaml:36-71` — wire-schema `action` enum (31).
  -> stays as a human-readable mirror, machine-injected at validator build (§5.1), drift-gated.
- C. `server/src/compiler/scientistIntent/parseScientistIntent.ts:43-50` — `KNOWN_ACTIONS`
  ReadonlySet, consulted in `normalizeDocument` at :67 (silent-drop filter). RUNTIME LIST -> DELETE,
  derive from vocabulary (§5.1).
- D. `server/src/compiler/scientistIntent/intentCompile.ts:140-147` — `INTENT_ACTIONS` const,
  consumed ONLY by `buildScientistIntentToolSchema` enum at :168. RUNTIME LIST -> DELETE, tool
  schema enum comes from vocabulary.
- E. `server/src/compiler/scientistIntent/intentCompile.ts:80-85` — the ALLOWED ACTIONS verb block
  embedded in `INTENT_COMPILE_SYSTEM_PROMPT` (:56-98); used at :242
  (`args.systemPrompt ?? INTENT_COMPILE_SYSTEM_PROMPT`) inside `compileFromSmallLlm`. -> prompt
  generated from vocabulary (§5.2).
- F. `server/src/compiler/scientistIntent/liftScientistIntent.ts:20-27` — `CANONICAL_ACTIONS`
  (+ `canonicalSet()` :112-114). RUNTIME LIST -> DELETE, derive from vocabulary. (NOTE: SPINE-1's
  five-copy inventory MISSED this one — six runtime/text copies + the registry template; the
  coder's grep must include liftScientistIntent.ts. `ACTION_SYNONYMS` :34-65 maps ALIASES to verbs
  — see open question Q2.)
- G. `schema/registry/prompt-templates/intent.compile.system.yaml` — registry/UI-layer prompt with
  the same verb block; NO runtime consumer in server/src (only a comment cites it,
  intentCompile.ts:53-54 — verified by grep). -> YAML mirror, drift-gated (§5.3), NOT generated.

### 3.2 Adjacent verb-derived lists (WHERE the list lives changes; behavior must not)
- `server/src/compiler/scientistIntent/normalizeScientistIntent.ts:33` — `PATTERN_ACTIONS`
  (exactly the 4 geometric macros). Consulted :171,:175 to route symbolic labels (non-pattern
  source -> updateSymbol; pattern -> toPattern). -> DERIVE from the vocabulary's per-verb `class`
  field (Q3); sets must be provably identical pre/post (current-verb-parity pins behavior).
- `normalizeDocument`'s per-field whitelists (parseScientistIntent.ts:69-85) are FIELD lists, not
  verb lists — OUT of scope for "keeps no list" (the wire contract's fields stay; per-verb argument
  CONTRACTS are the new YAML's job, consumed for validation/prompt, not to rewrite the fold).
- `liftScientistIntent.ts` `ALLOWED_PARAM_KEYS` :68-77 / `PARAM_ALIASES` :80-92 — parameter-surface
  data, not verb vocabulary. Leave (SPINE-3 may relocate; do NOT expand scope today).

### 3.3 Explicitly NOT this vocabulary (reviewer-adjacency map)
- `server/src/ai/submitSuggestionTool.ts` — the forced `agent_intent` tool's intent enum
  (event_graph/deck_layout/create_record/protocol_edit/unknown). DIFFERENT tool, different campaign
  (PROTO-AI-7). ZERO edits; "no second forced tool" applies to the WHOLE ai/ surface (open
  questions) AND SPINE-2 additionally must not touch `emit_scientist_intent`'s existence — the tool
  STAYS (wire-format decision), only its enum source changes (D above).
- `server/src/ai/AgentOrchestrator.ts`, `server/src/ai/systemPrompt.ts` (vocab-pack prompt path
  :114-123 — that is the EVENT-EDITOR verb surface, see next), `server/src/ai/clarificationLoop.ts`
  — untouched.
- `app/src/shared/vocab/` (packs like `liquid-handling.v1.ts`: aspirate/dispense PRIMITIVE event
  verbs with UI metadata) and `server/src/compiler/protocolIntent/*` (`ProtocolIntentValidation.ts`
  :324,:337-410 `case 'transfer' | 'media_swap' | 'repeat_rows'` etc.),
  `server/src/compiler/biology/verbs/simpleVerbs.ts`, `compiler/patterns/*` — these are the
  DOWNSTREAM ProtocolIntent/expansion IR verb surface: the boundary of "the 31-verb vocabulary" is
  the SCIENTIST-INTENT WIRE (`parseScientistIntent` in, `compileScientistIntent` out). Nothing
  below the boundary changes in SPINE-2.
- `server/src/compiler/pipeline/parser-evals/*` (FireAssay baseline's inline `verbs` registry) —
  a different harness contract (SPINE-1 §3 said the same); do not reuse, do not edit.

### 3.4 Triplet + lint conventions (verified)
- Schema loader: `server/src/schema/SchemaLoader.ts:33` `DEFAULT_PATTERNS =
  ['*.schema.yaml','*.schema.json']`, recursive (:130-146); every loaded file MUST carry `$id`
  (:91,:222 'Schema missing $id'). Server boots with `loadAllSchemas({basePath: schemaDir,
  recursive:true})` (server.ts:353) -> `SchemaRegistry.addSchemas` (:369).
- Lint loader: `server/src/lint/LintSpecLoader.ts:13` matches `'.lint.yaml'` recursively;
  server.ts:398-422 loads all specs, and ALREADY REWRITES RULE DATA FROM A REGISTRY at boot
  (:413-419 injects `predicateRegistry.getAllIds()` into the `approved-predicate` rule's
  `assert.values`) — THE repo precedent for "data file feeds a loaded spec".
- Lint meta-schema: `schema/lint/lint-v1.schema.yaml` — rule shape (:60-140: id/title/severity/
  scope/schemaId/when/assert/message); predicates today include exists/nonEmpty/regex/equals/in +
  the PROTO-AI-3 generics: `allIn` cross-collection membership (:226-267, with `itemField`),
  `noneIn` disjointness (:270-...), `everyItem` per-item quantification with item-relative
  sub-asserts (:299+). The vocabulary lint is written with these — no new predicates.
- Engine: `server/src/lint/LintEngine.ts:5` header — business rules MUST live in *.lint.yaml;
  `lint(data, schemaId)` (:231) filters rules by schemaId (:95-105) — so a lint spec bound to the
  VOCABULARY schema's `$id` runs against the vocabulary document standalone (ValidationHandlers
  precedent, `POST /validate` + lint path, ValidationHandlers.ts:20-70).
- `exactOptionalPropertyTypes` on (server/tsconfig.json:13).
- YAML path convention: `server/schema` is a symlink to repo `schema/`; parseScientistIntent reads
  `join(process.cwd(),'schema',...)` (:24-27) with cwd=server — the vocabulary loader MUST use the
  same convention (tests run from `<wt>/server`).

### 3.5 Verb copies the prompt today (composer-verified answer)
The model prompt embeds the vocabulary in exactly one live place: `INTENT_COMPILE_SYSTEM_PROMPT`
(intentCompile.ts:56-98, verb block :80-85), passed at :242, overrideable per-call via
`args.systemPrompt` (:105) — `compileFromSmallLlm`'s existing seam. No test greps the constant's
text (verified by search over `*.test.ts`); golden risk is low but §6 checks it.

## 4. Scope + file ownership
IN SCOPE (the complete diff surface):
- NEW `schema/scientist-intent/scientist-intent-vocabulary.schema.yaml` — the meta-schema (§5.0).
- NEW `schema/scientist-intent/scientist-intent-vocabulary.yaml` — the data (31 verbs + policies).
- NEW `schema/scientist-intent/scientist-intent-vocabulary.lint.yaml` — conditional policy (§5.0).
- NEW `server/src/compiler/scientistIntent/vocabulary.ts` — the loader/consumption API (§5.1).
- EDIT `parseScientistIntent.ts` (delete KNOWN_ACTIONS; validator+filter from vocabulary).
- EDIT `intentCompile.ts` (delete INTENT_ACTIONS; generated prompt builder; tool-schema enum from
  vocabulary). NO new/renamed/removed tool — `emit_scientist_intent` (:149) stays byte-identical in
  name and call shape.
- EDIT `liftScientistIntent.ts` (delete CANONICAL_ACTIONS; `canonicalSet()` from vocabulary).
- EDIT `normalizeScientistIntent.ts` ONLY to derive PATTERN_ACTIONS from the vocabulary's class
  field (Q3) — no other line changes.
- EDIT `types.ts` ONLY the union's doc-comment ("drift-checked mirror; authority = vocabulary YAML")
  — the union itself stays (Q1 half; a TYPE cannot be YAML at runtime, the task's own
  "drift-checked mirror" branch covers it).
- EDIT `schema/registry/prompt-templates/intent.compile.system.yaml` verb block ONLY if
  mirror-drift forces sync — it is a gate target, not a consumer.
- NEW tests: `vocabulary.test.ts`, `vocabularyRipOut.test.ts` (or one file, named tests per §6);
  test fixtures under `server/src/compiler/scientistIntent/fixtures/` (SPINE-1 created the dir).
OUT OF SCOPE (hard): everything in §3.3; ALL of app/**; `schema/workflow/scientist-intent.schema.yaml`
and `scientist-intent.lint.yaml` (SPINE-1's contract stays byte-identical — the wire schema's enum
mirror is NOT edited by SPINE-2; if injection (§5.1) reveals it cannot work without touching them,
STOP and report, do not "fix" the contract); `ProtocolIntentLowering.ts` (SPINE-3's hint turf);
`ChatbotCompilePasses.ts`; `IntentCompileFromPromptHandlers.ts` (SPINE-5's route); any hint BEHAVIOR
(source/target/labwareHint precedence, firstString order, candidate lowering, deckSlot
passthrough) — SPINE-3 owns hint behavior; SPINE-2 relocates vocabulary DATA only.

## 5. Data design + consumption contract

### 5.0 The triplet (schema/scientist-intent/ — the task's proposed home, adopted)
File-name traps FIRST: `*.schema.yaml` gets schema-registered (needs `$id`); `*.lint.yaml` gets
lint-registered; the DATA file must match NEITHER pattern. Names:
- `scientist-intent-vocabulary.schema.yaml` — `$id:
  https://computable-lab.com/schema/scientist-intent/vocabulary.schema.yaml`,
  `title: ScientistIntent Verb Vocabulary`, registered by the recursive loader like every other
  schema. Structural rules ONLY (expressible in JSON Schema): `version: 1`; `verbs:` map keyed by
  `^[a-z][a-z0-9_]*$` (minProperties 1), each verb: `class: [simple|compound|pattern]` required,
  `args:` map of argument declarations, each `{ kind: [resolvable|scalar|wells|quantity],
  required: boolean, domain?: string (non-empty), capability?: string, hintEligible?: boolean }`,
  `additionalProperties:false` + `unevaluatedProperties:false` at every level; `policies:` object
  declaring `strategyOrder:` (array of strategy ids, unique), `ambiguity:` (mode +
  `confidenceAccept:` {min,max} on the SAME 0..1 DECLARED scale SPINE-1 froze — declared, not
  calibrated), `hintAuthority:` (mode string). Conditional checks do NOT go here.
- `scientist-intent-vocabulary.yaml` — the data. `class: pattern` on exactly the 4 macros
  (normalizeScientistIntent.ts:33 today). Domains per argument are DECLARATION SLOTS (free-text
  domain/capability tags naming where the noun must land, e.g. `labware`, `material`, `instrument`)
  — SPINE-3's adapters consume them; NO knowledge-layer term validation fires in SPINE-2 (Q1's
  boundary; same ruling as SPINE-1 bait §5 — validating tags before their consumers exist is the
  second-policy-home failure the lint header forbids).
- `scientist-intent-vocabulary.lint.yaml` — `schemaId:` the vocabulary `$id`. Conditional business
  policy, DSL-only (allIn/noneIn/everyItem/exists/in — no interpreter changes):
  (P1) every `resolvable` arg declares a non-empty `domain` (everyItem per verb over args with a
  when-guard on kind; if the current DSL cannot express "args keys are items", use
  `args` as an ARRAY of declarations in the schema instead — pick ONE representation and say it in
  the report; ARRAY form is RECOMMENDED precisely because everyItem needs arrays);
  (P2) every `hintEligible` arg's verb participates in a policy id present in `policies` (allIn
  membership — the PROTO-AI-3 predicate; this is "missing rule refs");
  (P3) `class: pattern` verbs forbid `required` resolvable source (pattern-macro shape);
  (P4) strategy ids referenced by ambiguity/hintAuthority are members of `strategyOrder` (allIn).
  The resolver spec must NOT become a second policy home: policy VALUES (order, thresholds,
  authority mode) live in `policies:` (data), policy WELL-FORMEDNESS lives in this lint (DSL), and
  NO conditional may be re-implemented in TS — `vocabulary.ts` validates (schema) + lints (engine)
  + reads; it never branches on a verb, class, or domain.

### 5.1 Parser consumption (`vocabulary.ts` + parseScientistIntent.ts)
`loadScientistIntentVocabulary(opts?: {path?})`: read YAML (cwd/schema convention §3.4) -> Ajv
validate against the registered vocabulary schema (fresh `createValidator({strict:false})`, the
ProtocolProseFieldsSchema pattern) -> `LintEngine` with the vocabulary lint spec loaded -> return a
frozen `ScientistIntentVocabulary { verbs(): readonly string[]; has(v); classOf(v);
argContracts(v); patterns(): ReadonlySet<string>; policies(); promptVerbBlock(): string;
toolActionEnum(): string[] }`. FAIL LOUD on missing file / invalid doc / lint errors — a thrown
error naming path+ruleId; NO default verb set, NO try/catch fallback anywhere (hard boundary).
Module caches per resolved path (mirrors parseScientistIntent's cache discipline); tests inject a
fixture path via `opts` — no env-var config surface.
`parseScientistIntent(text, opts?: { vocabulary? })`: (1) validator build reads the wire-schema YAML
text, PARSES it, sets `properties.actions.items.properties.action.enum =
vocabulary.toolActionEnum()` BEFORE `addSchema` — the machine-injection precedent is server.ts:413-419;
the on-disk schema enum stays the human mirror, equality asserted in mirror-drift. (2)
`normalizeDocument`'s :67 filter consults `vocabulary.has()` instead of KNOWN_ACTIONS. Delete
KNOWN_ACTIONS. The cache singleton stays (production behavior unchanged) but is keyed per
vocabulary so fixture-vocabulary tests get fresh validators; the compatibility path keeps the real
singleton (SPINE-1 bait §2 logic — the cached singleton IS production).

### 5.2 Prompt + lifter + normalizer consumption
`intentCompileSystemPrompt(vocab = default())` renders the EXACT current prompt text with the
ALLOWED ACTIONS block generated from `vocab.promptVerbBlock()`; `compileFromSmallLlm` uses it at
:242. The PARAMETERS/RULES prose stays hand-written this wave (prose, not a verb list — say so in
the report; per-verb arg contracts already exist in data for SPINE-3 to generate richer prompts).
`buildScientistIntentToolSchema()` enum <- `vocab.toolActionEnum()`.
`liftScientistIntent`: `canonicalSet()` <- `vocab.verbs()`; `canonicalActionName` synonym behavior
UNCHANGED (Q2). `normalizeScientistIntent`: `PATTERN_ACTIONS` <- `vocab.patterns()` (Q3) —
characterization tests + parity prove the sets identical.

### 5.3 Mirror-drift mechanics (`scientist-intent-vocabulary.mirror-drift`)
One test, set-DIFFS (never lengths — SPINE-1 bait §4/§7): shipped vocabulary verbs vs
(a) types.ts union literals (source-text extraction, SPINE-1's method), (b) wire-schema enum
(`schema/workflow/scientist-intent.schema.yaml`, yaml-parsed), (c) tool-schema enum
(`buildScientistIntentToolSchema()` output), (d) the generated prompt's ALLOWED ACTIONS block,
(e) registry template G verb block (yaml-parsed). Every diff must be EMPTY (both directions, order
pinned against verb-inventory.yaml declaration order for (a)(b)). Removing ANY copy from the check
list is a review fail.

## 6. Acceptance criteria (VERBATIM from the task list 'verified by' — test names exact)
  scientist-intent-vocabulary.rip-out — removing a verb via fixture changes BOTH prompt vocabulary
  and parser acceptance with zero TS edits; scientist-intent-vocabulary.mirror-drift fails when the
  mirror is stale; current-verb-parity preserves all 31 accepted shapes; resolver-spec.validation
  rejects missing rule refs / incomplete argument contracts; lint fixture flips strategy order with
  code untouched; prompt fixtures still emit scientist-intent YAML exclusively (no line-DSL parser
  anywhere).
Mapping to RED-first tests (new file names as in §4):
- `.rip-out`: build a fixture vocabulary (a copy minus `pellet`) + a doc using `pellet`. Assert
  `intentCompileSystemPrompt(fixtureVocab)` lacks `pellet` and CONTAINS the other 30; assert
  `parseScientistIntent(doc, {vocabulary: fixtureVocab})` THROWS (Ajv enum injection at §5.1 —
  this is why the injection exists: static-enum acceptance would NOT follow the fixture) and that a
  doc without `pellet` still parses. The whole test must pass with `git diff` showing zero changes
  to any `.ts` UNDER the product (test file + fixtures only).
- `.mirror-drift`: §5.3; plus a mutation leg proving it FAILS when stale (patch a temp copy of the
  wire-schema text with one verb removed -> the diff assertion goes red — test the test).
- `current-verb-parity`: vocabulary verb set+order == `fixtures/verb-inventory.yaml` (SPINE-1 file)
  == 31; AND every acceptance shape SPINE-1 pinned still parses/compiles through the REAL
  `parseScientistIntent` singleton (re-run the THREE_ACTION + full-vocab fixtures).
- `resolver-spec.validation`: the shipped vocabulary validates + lints CLEAN (zero findings);
  fixture mutations each produce a NAMED failure: arg with `kind: resolvable` and no `domain`
  (P1), policyRef absent from `policies` (P2), class/pattern mismatch (P3), strategyRef absent
  (P4), and a structurally incomplete contract (arg without `kind`).
- strategy-order flip: fixture copy of vocabulary+lint pair with `strategyOrder` entries swapped;
  loaded fixture reports the swapped order through `policies()`; assert the SHIPPED order unchanged
  and zero TS touched — proves precedence is data, not code (SPINE-3 consumes it).
- prompt-exclusivity: captured mock-client system prompt (scientistIntent.test.ts mock-driver
  pattern) contains `OUTPUT ONLY YAML` + the generated verb block and NO line-DSL surface; grep
  assertion that no new parser module exists for any other grammar (`spawn|line-dsl|shorthand`
  surface absent from scientistIntent dir).
Plus repo gates (§7/§8): SPINE-1's three contract tests + scientistIntent.test.ts +
ProtocolIntentLowering*.test.ts stay GREEN at every commit; `npm run typecheck -w server` no new
error lines; app/** diff EMPTY.

## 7. Migration order (pins green throughout — SPINE-1's freeze is the harness)
1. Baseline capture (before ANY edit): run §8 first-targeted-check; record tsc line-set, src/ai
   failing-file list, verb counts from all 7 copies (§3.1) in the report.
2. Land the triplet (schema+data+lint) + `vocabulary.ts` + RED `resolver-spec.validation` -> GREEN
   resolver-spec first (pure addition; nothing consumed yet).
3. Land `.mirror-drift` GREEN against today's 7 copies (before deleting anything — it must pass
   pre- AND post-migration; the mutation leg proves it bites).
4. Consumption flips, ONE surface per commit, full scientistIntent suite green after each:
   (a) parser (delete C, enum injection), (b) tool schema (delete D), (c) prompt (E), (d) lifter
   (delete F), (e) PATTERN_ACTIONS derivation. Each commit: characterization pins byte-green —
   a "pin update" request = STOP.
5. `.rip-out` + strategy-order fixtures.
6. Full §8 gates; report.

## 8. Baselines to RE-MEASURE AT CLAIM (not from this draft — trunk will have moved with SPINE-1)
- Server tsc: `cd <wt> && npm run typecheck -w server` — capture error LINE SET; the gate is
  `comm -3` IDENTITY vs trunk's line set at claim (handoff 2026-10-08_0350: use diff-vs-trunk, the
  absolute '26/6' note drifted; composer observed ~27 lines at 55319ef2, 6 files, none in files
  this item owns — record, never demand green; non-zero exit by design).
- src/ai failing-file SET identity: `cd <wt>/server && npx vitest run src/ai` — composer measured
  at 55319ef2: "Test Files 10 failed | 74 passed (84) / Tests 21 failed | 644 passed (665)" (2
  unhandled errors). The 10-file SET identity is the gate; re-capture trunk's set at claim.
- vitest MUST run from `<wt>/server` (repo root gives false failures — standing lane fact).
- app tsc 47/24 pin + full-app 53-failing-file SET: record N/A-once (app diff must be empty).
- NFS: every git command `git -c core.fileMode=false ...`; stale-.mjs cache: fresh paths;
  :3093/:5193 restart after YAML edits is the ORCHESTRATOR's job — the coder never restarts the
  stack and never curls it mid-work (stale YAML there is expected, not a defect).
- Playwright: N/A (headless item).

## 9. First targeted check (run FIRST, proves the substrate before any edit)
  cd /mnt/vast/home/brad/git/cl-integration-2/server && npx vitest run \
    src/compiler/scientistIntent src/compiler/protocolIntent
  => 0 failed files (SPINE-1's contract files included — this doubles as the claim-gate check §2),
  then: grep -c "^  - " src/compiler/scientistIntent/fixtures/verb-inventory.yaml == 31 (same cwd).
  If the contract files are absent, STOP: SPINE-1 is not merged.

## 10. Verification commands (final, expected outputs)
- `cd <wt>/server && npx vitest run src/compiler/scientistIntent src/compiler/protocolIntent`
  => all listed files pass, 0 failures (pre-existing skips tolerated; ZERO new failing files).
- `cd <wt>/server && npx vitest run src/ai` => failing-file SET identical to claim-time capture.
- `npm run typecheck -w server` (repo root) => comm -3 vs claim-time trunk line-set EMPTY.
- `npm run typecheck -w app` => 47 lines / 24 files (untouched).
- Rip-out proof-of-zero-TS: `git -c core.fileMode=false diff --name-only <base>..HEAD -- 'server/src/**/*.ts' | grep -v -E 'vocabulary|parseScientistIntent|intentCompile|liftScientistIntent|normalizeScientistIntent|types\.ts'` => EMPTY (the allowed TS surface is exactly §4's list).
- Hard-boundary grep (the review WILL run it):
  `grep -rn "media_swap_duplicate_columns" server/src --include='*.ts' | grep -v test | grep -v 'type\[' `
  => only types.ts union (type position, mirror) may remain; zero runtime string-literal verb sets
  (KNOWN_ACTIONS/INTENT_ACTIONS/CANONICAL_ACTIONS/PATTERN_ACTIONS definitions gone).

## 11. Reviewer bait (this item's likely edge errors — pre-empt in code + report)
1. HARD BOUNDARY: any surviving TS runtime verb list — including a `?? DEFAULTS` fallback, a
   try/catch that keeps booting on vocabulary failure, or `PATTERN_ACTIONS` hand-list — is a
   REVIEW FAIL (CLAUDE.md:160). Deleting every entry from the YAML must delete the verb set; boot
   then fails LOUDLY naming the file. Prove it: report shows the loud-failure output for an
   emptied fixture.
2. YAML-reload trap: parseScientistIntent's `_validator` singleton now embeds an injected enum —
   fixture-vocabulary tests MUST use fresh validators (ProtocolProseFieldsSchema pattern), and the
   compat test MUST keep using the real singleton. A test that patches schema text in-memory
   against the shared cache is a fail. The lane stack never reloads YAML — do not curl :3093 and
   call staleness a defect.
3. exactOptionalPropertyTypes: every optional vocabulary field (domain, capability, hintEligible,
   opts.vocabulary) is conditional-spread only; tests assert key ABSENCE (not.toHaveProperty),
   never toEqual-with-undefined.
4. Loader-registration traps (§5.0): data file named `*-vocabulary.yaml` matches NEITHER
   DEFAULT_PATTERNS nor LintSpecLoader's `.lint.yaml` — prove with a boot log or registry-size
   assertion; vocabulary schema has `$id` (SchemaLoader fails it otherwise); lint file has
   `lintVersion: 1` + non-empty `rules` (LintSpecLoader rejects otherwise — and server.ts:412
   SKIPS empty-rule specs silently: an empty policy file would pass unnoticed; the
   resolver-spec.validation test is the backstop — say this).
5. Ontology terms: domains are DECLARATION SLOTS; a reviewer demanding knowledge-layer term
   validation now gets the SPINE-1 §5 ruling — the consumers are SPINE-3's adapters; validating
   before them exists is the second-policy-home failure. Read
   docs/knowledge-layer-canonical-example.md before replying: this item declares SLOTS, consumes
   no claim/context/assertion semantics.
6. Mirror-drift must FAIL on divergence — lengths pass a swap; sets catch it (SPINE-1 bait §4/§7);
   include the mutation leg (§6 mirror-drift) or the reviewer runs the mutation themselves.
7. The registry template G and the wire-schema enum B are MIRRORS, not authorities — "you left two
   YAML copies" is expected and answerable: one authority + drift-gated mirrors is the task's own
   sanctioned option ("drift-checked mirror"); the alternative (deleting B's enum) would edit
   SPINE-1's frozen wire contract mid-flight.
8. Scope creep magnets: ACTION_SYNONYMS relocation (Q2: no), parameter-key whitelists (field lists,
   not verb lists — §3.2), app vocab packs (§3.3, different surface), emit_scientist_intent tool
   removal (wire-format decision), agent_intent enum (PROTO-AI-7's tool). A reviewer who asks gets
   §3.3, not code.
9. Hint behavior byte-parity: normalize's firstString precedence, serial_dilution *Hint quirk,
   first-role-wins, harvest/passage ternary — SPINE-1 pins them; SPINE-2 touches normalizeScientistIntent.ts
   ONE line (PATTERN_ACTIONS source). Any "cleanup" of a quirk is SPINE-3's charter violation.
10. current-verb-parity is order-AWARE against verb-inventory.yaml (SPINE-1 bait §7); alphabetized
    vocabulary silently passes set-equality and loses the migration baseline.
11. No new grammar: the line-DSL is a RENDER and does not exist in wave 1; prompt fixtures assert
    scientist-intent YAML exclusivity (§6 last test) — if anyone adds a shorthand parser this item
    fails its own verified-by.

## 12. Worker contract
- Worktree: `wt/SPINE-2-lane2-l2t0415` off trunk `cl/integration-2` AT CLAIM TIME (base >= SPINE-1's
  merge commit; branch same name). One worker (cl-coder, fleet lock).
- Deliverable report (unique): `.hermes/plans/SPINE-2-report.wip-l2t0415.md` — must contain: claim-gate
  checklist output (§2, five artifacts named), the 7-copy before/after table (§3.1), RED evidence per
  test BEFORE each flip, GREEN final, the emptied-fixture loud-failure transcript, mirror-drift
  mutation-leg transcript, re-measured baselines (§8), the §10 greps verbatim, and the diff-surface
  list vs §4 (any file outside §4 in the diff = self-flag).
- Expected diff surface: exactly §4 IN SCOPE; zero app/**; zero changes to
  schema/workflow/scientist-intent.*; schema/registry/prompt-templates touched only per §4-G.

## 13. Open questions (orchestrator: approve or override)
Q1. Keep `ScientistIntentActionKind` union (A) + wire-schema enum (B) as drift-checked mirrors, or
  full delete + codegen? RECOMMEND: keep, mirror-gated. A TS type has no runtime YAML source without
  a codegen step (new build machinery = second policy home risk); the task text itself offers "or a
  generated, drift-checked mirror". Checked: types.ts (type-only), schema enum is load-bearing for
  Ajv (SPINE-1 froze it; mutating the frozen file mid-chain breaks SPINE-1's compat pins),
  server.ts:413-419 injection precedent makes B a checked mirror safely.
Q2. Move `ACTION_SYNONYMS` (liftScientistIntent.ts:34-65) into the vocabulary per-verb now?
  RECOMMEND: NO — synonyms are alias->verb mappings, not the verb set; moving them enlarges the
  rip-out surface for zero boundary gain, and SPINE-1 Q3 already deferred their data home to this
  decision: defer AGAIN to SPINE-3 (the lift is the extraction-lifter surface the resolver replaces
  anyway). Add a test pin (every synonym target ∈ vocabulary verbs) so the mirror stays honest
  either way. Checked: lift file lines, SPINE-1 spec Q3.
Q3. Derive `PATTERN_ACTIONS` from vocabulary `class: pattern`, or hand SPINE-3 a vocabulary and
  leave the local set? RECOMMEND: derive (it IS a verb list in TS — the item's own hard boundary
  names "zero TS list survives"; set-identity is provable and SPINE-1 pins catch drift). Checked:
  normalizeScientistIntent.ts:33,:171,:175; class field designed into §5.0 for exactly this.

## Appendix A — cite-verified log (EVERY file:line re-read by the composer at checkout HEAD
55319ef21485646a0e4f641ad13b87d34dc9fe39, branch cl/integration-2; no scout output cited):
- server/src/compiler/scientistIntent/types.ts — full read; union :12-47; union literal count
  re-extracted programmatically = 31 (node regex over the source).
- parseScientistIntent.ts — full read; schema $id :16-17; singleton :19-32; cwd/schema read :24-27;
  KNOWN_ACTIONS :43-50; drop-filter :67; whitelists :69-85; validate :129-135.
- intentCompile.ts — full read; prompt :56-98 (verbs :80-85); systemPrompt seam :105,:242;
  INTENT_ACTIONS :140-147; tool name :149; tool enum :168; forced tool call :257-261.
- liftScientistIntent.ts :1-120 — CANONICAL_ACTIONS :20-27; ACTION_SYNONYMS :34-65;
  ALLOWED_PARAM_KEYS :68-77; PARAM_ALIASES :80-92; canonicalSet :112-114; canonicalActionName :103-106.
- normalizeScientistIntent.ts — PATTERN_ACTIONS :33 (grep-verified), consumers :171,:175;
  :172 ternary (SPINE-1 quirk, quoted context).
- schema/workflow/scientist-intent.schema.yaml — full read; enum :36-71; unresolved/candidates
  :139-167 (confidence 0..1 :164-166).
- schema/workflow/scientist-intent.lint.yaml — full read; header :1-7; 2 rules :11-45.
- schema/lint/lint-v1.schema.yaml — rule shape :60-140; allIn :226-267 (itemField :262);
  noneIn :270+; everyItem :299+; predicate set enumerated via PredicateEvaluator.ts :54-159,:977.
- server/src/lint/LintEngine.ts — :5 header, addSpec :54, schemaId filter :95-105, lint :231-236.
- server/src/lint/LintSpecLoader.ts — '.lint.yaml' :13, loadAllLintSpecs :255+, validity gate
  (lintVersion+rules) :282-286.
- server/src/server.ts — loadAllSchemas :353, addSchemas :369, createLintEngine :385,
  loadAllLintSpecs :398, empty-spec skip :412, approved-predicate registry INJECTION precedent
  :413-419.
- server/src/schema/SchemaLoader.ts — DEFAULT_PATTERNS :33, $id enforcement :91/:222, recursive
  find :130-146.
- server/src/api/handlers/ValidationHandlers.ts :1-80 — schemaId-bound validate/lint surface.
- schema/registry/prompt-templates/intent.compile.system.yaml — read; verb block present; runtime
  consumer search = intentCompile.ts:53-54 comment ONLY (server-wide grep).
- server/src/compiler/scientistIntent/ dir listing — 7 files, NO fixtures/ dir at 55319ef2
  (SPINE-1 artifacts absent => claim gate §2 live-proven pending).
- server/src/ai/ grep surfaces — scientist-intent consumption is intentCompile + handlers only;
  AgentOrchestrator/systemPrompt vocab-pack path :114-123 is the event-editor surface (untouched).
- server/src/compiler/protocolIntent/ProtocolIntentValidation.ts :1-60 + :324,:337-410 — downstream
  IR verb switch (boundary §3.3).
- server/src/mcp/tools/aiPlanningTools.ts serial_dilution hits :547,:984-1029 — macro_program tool
  surface, NOT the scientist-intent verb list (adjacency note).
- app/src/shared/vocab/packs/liquid-handling.v1.ts head — PRIMITIVE event-verb pack (different
  surface, out of scope).
- server/tsconfig.json :13 exactOptionalPropertyTypes; server/schema symlink -> repo schema/;
  CLAUDE.md :145,:160 (policy-in-data + rip-out hard stop);
  docs/knowledge-layer-canonical-example.md :1-50 (slot-vs-semantics ruling context).
- Live measurements at 55319ef2 (composer, this session): server tsc error lines ~27 / 6 files
  (AgentOrchestrator 8, RecordStoreImpl 11, AuthoringGuard 3, ProtocolIntakeHandlers 2,
  RecordHandlers 1, bootstrapAdmin 1); `npx vitest run src/ai` from server => 10 failed files |
  74 passed (84), 21 failed | 644 passed (665), 2 unhandled errors; test-grep for
  INTENT_COMPILE_SYSTEM_PROMPT text => zero test consumers.
- SPINE-1 promoted spec .hermes/plans/2026-10-08_0315-SPINE-1-contract-freeze-spec.md — full read;
  handoff 2026-10-08_0350 (baselines block) — full read; task-list SPINE-1..6 block :3007-3188 —
  full read (SPINE-2 block :3049-3076 verbatim in §6).

COMPOSER DONE — draft only; orchestrator review required before dispatch.
