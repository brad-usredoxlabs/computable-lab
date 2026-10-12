# SPINE-3 report — one resolution engine behind the declared spec (wip-l2t1440)

Worktree: /mnt/vast/home/brad/git/wt/SPINE-3-lane2-l2t1440
Branch: spine-3-lane2-l2t1440 (ff-merged onto trunk 39a5311b — SPINE-2 merged; base d3c73f00 superseded)
Engine commit: b73e08e0
Spec: .hermes/plans/2026-10-08_1250-SPINE-3-resolution-engine-spec.md (read in full, both halves)

## 0. Worktree bootstrap note (deviation recorded honestly)

The prepped worktree was missing trunk's lane-synced untracked/ignored entries
(server/schema symlink, config.yaml, .env, ~76 entries). The §9 first check
initially FAILED (7 failed files — vocabulary triplet not found via the
server/schema symlink) until the missing entries were replicated 1:1 from the
TRUNK worktree (rsync, symlinks as symlinks), verified with comm -3 of
`git status --porcelain -uall --ignored=matching` (only .hermes/plans docs
differed, which is expected). After replication the §9 check went green.

## 1. Claim gate §2 checklist (live output at claim, 39a5311b)

1. Triplet present: `git ls-tree HEAD schema/scientist-intent/ --name-only` =>
   scientist-intent-vocabulary.lint.yaml / .schema.yaml / .yaml — PRESENT.
2. vocabulary.ts present: `git ls-tree HEAD server/src/compiler/scientistIntent/`
   => vocabulary.ts (+ vocabulary.test.ts, vocabularyMirrorDrift.test.ts,
   vocabularyRipOut.test.ts) — PRESENT.
3. SPINE-2 tests green: vocabulary.test.ts 16, vocabularyMirrorDrift 6,
   vocabularyRipOut 8 — all PASS (see §4 run).
4. SPINE-1 set green: §9 run => 12 files / 113 tests, 0 failures (9 SPINE-1
   files + 3 SPINE-2 vocabulary files).
5. Verb-inventory parity: vocabularyMirrorDrift.test.ts (6 tests) PASS — shipped
   vocabulary == fixtures/verb-inventory.yaml.

## 2. §9 probe transcript (settles every §3.3 UNVERIFIED-hypothesis; probe NEVER committed)

Throwaway `__probe_spine3.test.ts` output (verbatim, key lines):

    PROBE verbs().length = 31
    PROBE verbs() = ["seed","incubate",...,"repeat_rows"]  (31, declaration order)
    PROBE argContracts("transfer") = [
      {"name":"source","kind":"resolvable","required":false,"domain":"labware","hintEligible":true},
      {"name":"target","kind":"resolvable","required":false,"domain":"labware","hintEligible":true},
      {"name":"labware","kind":"resolvable","required":false,"domain":"labware","hintEligible":true},
      {"name":"volumeUl","kind":"quantity","required":false},
      {"name":"volume","kind":"quantity","required":false},
      {"name":"sourceWells","kind":"wells","required":false},
      {"name":"targetWells","kind":"wells","required":false}
    ]
    PROBE policies() keys = ["strategyOrder","ambiguity","hintAuthority","ruleIds"]
    PROBE policies() full = {
      "strategyOrder": ["explicit_wells","hint_search","symbolic_label","ontology_resolution","mint_local"],
      "ambiguity": {"mode":"clarify","confidenceAccept":{"min":0.7,"max":1},"strategyRef":"symbolic_label"},
      "hintAuthority": {"mode":"lab_hint_first","strategyRef":"hint_search"},
      "ruleIds": ["hint-authority","ambiguity-clarify"]
    }
    PROBE patterns() = ["serial_dilution","media_swap_duplicate_columns","source_wells_to_duplicate_target_columns","repeat_rows"]
    PROBE toolActionEnum length = 31
    (per-verb dump: every resolvable arg carries domain (labware|material|instrument);
     hintEligible present ONLY on labware-domain args; material/instrument args have NO hintEligible;
     every verb carries policyRef: hint-authority)

Resolution of §3.3 hypotheses:
(a) args are ARRAYS (argContracts returns readonly ScientistIntentArgContract[] with a `name` field) — CONFIRMED array, engine codes against arrays.
(b) exact shipped API: verbs()/has()/classOf()/argContracts()/patterns() (Set)/policies()/promptVerbBlock()/toolActionEnum() — CONFIRMED as spec §5.1; policies() additionally carries `strategyRef` on ambiguity AND hintAuthority, plus `ruleIds` (spec §3.3 ASSUMED shape lacked strategyRef/ruleIds — engine consumes them as data).
(c) expected*Domain slots: grep of scientistIntent dir shows types.ts declares them; NO consumer inside SPINE-2 (only the "SPINE-3 is that consumer" comment) — CONFIRMED unconsumed; SPINE-3 now consumes them (see §5 trace test).
(d) class values: simple/compound/pattern; hintEligible present per verb as above — CONFIRMED; hint adapter gate rides the flag (contract.hintEligible === true), never a verb name.
(e) SPINE-2 final file names: vocabulary.test.ts / vocabularyRipOut.test.ts / vocabularyMirrorDrift.test.ts — CONFIRMED.

## 3. RED-first evidence (transcript verbatim)

RED state (engine files moved aside; tests exist, engine does not):

     ❯ src/compiler/resolution/hintParity.test.ts  (0 test)
     ❯ src/compiler/resolution/nounResolution.test.ts  (0 test)
     FAIL  src/compiler/resolution/hintParity.test.ts [ hintParity.test.ts ]
     FAIL  src/compiler/resolution/nounResolution.test.ts [ nounResolution.test.ts ]
     Error: Failed to load url ./adapters.js ... Does the file exist?
     Test Files  2 failed (2)
          Tests  no tests

GREEN iterations (each failing assertion shown before its fix):
- First engine run: 1 failed — ambiguity candidate ordering assertion expected
  recordIds but clarification candidates carry resolved titles ('Gemini reader
  A','Gemini reader B'); ordering itself correct (score DESC then curie ASC).
  Test assertion corrected.
- Second: 1 failed — clarification.actionLocation undefined: the test helper
  built requests without actionLocation; helper fixed to carry
  {actionIndex, action, argument} (engine carries it from the request).
- Final: 2 files / 23 tests PASS (see §4).

## 4. Final gate runs (§10, verbatim tails)

Targeted suite (SPINE-1 characterization UNTOUCHED in same command):
    ✓ src/compiler/resolution/hintParity.test.ts  (9 tests)
    ✓ src/compiler/resolution/nounResolution.test.ts  (14 tests)
    ✓ ... (12 SPINE-1/SPINE-2 files)
    Test Files  14 passed (14)
         Tests  136 passed (136)

src/ai fail-set IDENTITY (claim-time capture == final):
    Test Files  10 failed | 74 passed (84)
         Tests  21 failed | 644 passed (665)
    comm -3 of FAIL-file sets (claim vs final): EMPTY (10 files:
    AgentOrchestrator.bypass, AgentOrchestratorForwarding, AgentOrchestrator.golden,
    AgentOrchestrator.goldenWithSeeds, AgentOrchestrator.tubeGate,
    ChatbotCompileDeckSlot, chatbotCompile.e2e, InferenceClient.config,
    materialFollowUp, submitSuggestionTool.tubeSchema)

Server tsc SET identity (baseline captured at step 1 BEFORE any edit: 26 lines /
6 files — AgentOrchestrator 8, RecordStoreImpl 11, AuthoringGuard 3,
ProtocolIntakeHandlers 2, RecordHandlers 1, bootstrapAdmin 1):
    comm -3 baseline final => EMPTY (exit 0). Zero baseline lines in any file this item owns.

App tsc: worktree app diff EMPTY (git diff --name-only 39a5311b..HEAD -- app/ => 0).
Fresh trunk measurement recorded: 34 error lines / 24 files at 39a5311b (the
carried 47/24 pin predates SPINE-2 merge; my worktree == trunk, app untouched).

§10 hard-boundary greps (verbatim):
    grep -rnE "'(transfer|read|wash|spin|pellet|serial_dilution|[a-z_]+)'\s*[=:]|case '" server/src/compiler/resolution/*.ts | grep -v test
    => ZERO matches (exit 1)
    grep -rn "schemaId: " server/src/compiler/resolution/*.ts | grep -v test
    => ZERO matches (exit 1)
    grep -rnE "store\.(create|update)|EnsureTerm|ensureLocalMaterial" server/src/compiler/resolution/*.ts
    => only two COMMENT lines (types.ts:8, resolutionEngine.ts:8) — zero imports, zero calls.

Zero-write proof: engine module imports are exactly resolve/types,
scientistIntent/{vocabulary,types}, ai/materialRefFields, materials/termReconciliation,
ontology/domains, compiler/roles/RoleResolver, protocolIntent/{ProtocolIntentLowering,ProtocolIntent}
(read-only), plus its own files. No store, no EnsureTerm, no mint.

## 5. Six §6 acceptance criteria -> named tests

1. noun-resolution.verb-constrained-domain — nounResolution.test.ts
   'same ambiguous label + different declared argument domains => disjoint
   eligible sets'. ONE pool ('Gemini': CHEBI tier-0 + CL tier-1), fixture
   vocab-domain-flip declares transfer.source domain: chemical and
   transfer.labware domain: cellType => bindings disjoint BOTH directions.
   Domain bridge = ONTOLOGY_DOMAINS data (chemical->chebi, cellType->cl);
   local-namespace candidates are never filtered (prefer-what-the-lab-has).
2. noun-resolution.material-levels — 'a concept match cannot satisfy an aliquot
   requirement; concept-only pool clarifies'. Concept candidate ABSENT from
   eligible AND named in a `level-mismatch:` trace line; concept-only pool =>
   clarification, never a bind. Well-ready table read from
   materialRefFields WELL_READY_LAYERS data (no fourth level enum, no coercion).
3. noun-resolution.local-term-identity — two tests: four F-praus-family
   spellings bind ONE curie (local:term-fpraus) via the tier-0 alias-first
   provider; mint affordance in ZERO bindings; dep-surface assertion proves no
   write capability exists to spy on; plus a doc-level test through
   resolveScientistIntentNouns.
4. noun-resolution.policy-is-data — two legs on fixture COPIES loaded via
   opts.path: (i) strategyOrder swap (symbolic_label ahead of hint_search)
   flips WHICH candidate binds (LBW-A <-> local:plate-B) with zero .ts change;
   (ii) ambiguity.strategyRef flip (symbolic_label -> accept_top_ranked) flips
   the ambiguous-pool arm clarify -> accept-top. SHIPPED vocabulary outcome
   unchanged in the same run. Honest mapping per spec §6: precedence VALUES
   live in vocabulary `policies:` data (lint P1-P4 govern well-formedness);
   the task's "lint fixture edit" is satisfied by editing that policy DATA.
5. noun-resolution.hint-parity — hintParity.test.ts: all SEVEN
   ProtocolIntentLoweringCharacterization.test.ts fixture scenarios deep-equal
   the engine's hint-evidence adapter output (real equality against the
   lowering's own objects; Object.keys absence checks; verbatim reason strings).
   The characterization file itself re-runs UNTOUCHED in the same §10 command
   (14 files green). Mutation leg: scratch run perturbing
   ProtocolIntentLowering.ts's reason string made the parity test RED
   (transcript: FAIL ... reason strings pass through VERBATIM — AssertionError;
   1 failed | 8 passed), file restored byte-clean (git status clean). In-suite
   leg asserts parity sensitivity to reason perturbation.
6. noun-resolution.ambiguity-and-failure — (i) two in-band candidates => ZERO
   bindings, ONE clarification (reason 'ambiguous-noun'), ordered candidates,
   JSON byte-equal across two runs, no 'chosen' anywhere; (ii) throwing
   labware-hint lookup AND throwing spine provider => failures[] name
   adapter+term, clarification reason 'resolution-lookup-failed', DISTINCT from
   (iii) empty-pool 'unknown-noun' clarification which carries the mint
   affordance candidate while the failure arm carries none. Plus role-address
   arms (known role expands, unknown role clarifies) and the near-miss
   suggestion test (suggestExistingTerms evidence rides the unknown-noun
   clarification, never merged).

## 6. §3.1 adapter table (adapter -> entry point wrapped -> return)

- spineAdapter (createSpineAdapter + createFailureTrackingProvider) ->
  EngineSpineLike (resolveDraftMaterials' SpineLike seam shape, typed against
  real ResolveOptions; production wiring = createResolveSpine providers wrapped
  OUTSIDE ResolveSpine so runProvider's swallow stays untouched) ->
  TierOutcome{candidates: RankedCandidate[], failed, failedBy?, error?}
- labwareHintAdapter (createLabwareHintAdapter) -> searchLabwareByHint-shaped
  callback (ChatbotCompilePasses.ts:1521 dep shape) -> TierOutcome (throw =>
  failed, never silent-empty)
- registryAdapter (createRegistryAdapter) -> labwareDefinitionRegistry.findByName
  / compoundClassRegistry.findByName (NounPhraseResolver dep shapes) ->
  TierOutcome (evidence tier only, confidence 0.9 — in band, never auto-wins)
- ontologyAdapter (declaredNamespacesForDomain / filterCandidatesByDeclaredDomain)
  -> ONTOLOGY_DOMAINS (domains.ts data) -> {eligible, rejected} + trace lines;
  no new ontology search, no TS domain->ontology literals
- roleAddressAdapter (createRoleAddressAdapter) -> defaultRoleResolver
  (compiler/roles/RoleResolver.ts) -> TierOutcome of address candidates;
  empty expansion => 'unknown-address' clarification (stricter than pipeline
  pass-through; strictness is engine policy)
- hint-evidence adapter (createHintEvidenceAdapter) ->
  lowerProtocolIntentLabwareCandidates VERBATIM -> TierOutcome (parity surface)
- near-miss seam (nearMissSuggestions) -> suggestExistingTerms
  (termReconciliation.ts) -> clarification candidate evidence (never applied)

## 7. Engine design facts (policy-is-data compliance)

- Strategies run in policies().strategyOrder order via the injected registry;
  unimplemented strategy ids THROW (fail-loud, mirrors vocabulary.ts).
- Acceptance band = ambiguity.confidenceAccept {min,max} on the declared 0..1
  scale; exactly-one-in-band binds; multiple-in-band => ambiguity arm decided
  by the strategy NAMED in ambiguity.strategyRef ('clarify' shipped /
  'top' fixture); zero-in-band falls through to the next strategy in order.
- Hints reach ONLY the strategy named by policies().hintAuthority.strategyRef
  (data gate); hint strings are evidence for lookups, identities are returned
  recordIds. Engine never mints: tier-5 affordance is OFFERED in unknown-noun
  clarifications only, never bound, never offered on the lookup-failure arm.
- expected*Domain slots (SPINE-1's "SPINE-3 is that consumer" comment) are
  EVALUATED: effective domain = declared contract domain, doc slot fills when
  absent, declared-vs-expected disagreement traced (test: 'expected*Domain
  slots are EVALUATED').
- Input integrity (§7/OQ1): actionLocation.action disagreeing with the action
  at actionIndex => 'action-location-unreliable' clarification (imperative
  glue, not business policy). NO lint-DSL change made (OQ1 adopted).
- N3 consumed + pinned: parse-level whitespace-only argument drop pinned by a
  characterization test in the engine's own test dir; engine clarification
  carries actionIndex+action with argument key ABSENT (exactOptionalPropertyTypes
  conditional spreads throughout; key absence asserted via Object.keys /
  not.toHaveProperty).
- OQ2 honored: normalizeScientistIntent untouched; the engine's own
  clarification return type IS the widening (SPINE-4 emits it at the seam).
- OQ3 honored: ACTION_SYNONYMS untouched; engine consumes VERBATIM labels.
- Fail-loud inherited: no try/catch around loadScientistIntentVocabulary in
  engine or tests; fixture vocabularies inject via opts.path (fresh validator +
  lint per copy — all three fixture triplets load lint-clean).

## 8. Diff surface vs §4 (ownership gate)

git diff --name-only 39a5311b..HEAD => 15 files, ALL under
server/src/compiler/resolution/ (4 engine modules, 2 test files, 9 fixture
files = 3 vocabulary copies x 3 triplet files) + this report.
grep -v -E '^server/src/compiler/resolution/|^\.hermes/plans/' => EMPTY.
app/** diff: 0 files. No existing resolver file touched (ProtocolIntentLowering.ts
was perturbed ONLY in the scratch mutation run and restored byte-clean —
git status confirms).

## 9. Open questions / unresolved items

- None blocking. Recorded for orchestrator: (1) the engine's wantLevel seam
  (deps.levelFor) is the SPINE-4 wiring point for profile-derived layer
  requirements (MaterialProfileRegistry lookup is read in §3.1 but layer
  requirements per verb/arg are not declared in vocabulary data yet — when
  SPINE-4 registers the pass it supplies levelFor from the profile registry);
  (2) spine adapter uses localOnly:true (compiler hot-path doctrine,
  ResolveOptions comment) — SPINE-4 may want remote tiers for PDF intake;
  that is a wiring decision at the pass seam, not an engine change;
  (3) registry adapter confidence 0.9 and hint-match 1.0 are engine-internal
  declared scales (adapter identity, not vocabulary data) — pinned by tests;
  (4) worktree bootstrap required replicating trunk's untracked lane-synced
  entries (done, §0) — orchestrator may want the lane-prep recipe updated.

SPINE-3 CODER DONE
