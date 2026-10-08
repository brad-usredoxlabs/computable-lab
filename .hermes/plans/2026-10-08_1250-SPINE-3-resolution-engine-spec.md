# SPINE-3 — One resolution engine: adapt MaterialGrounding/termReconciliation/labware-hints/RoleResolver behind the declared spec
Spec DRAFT (lane 2, l2t1200) — 2026-10-08. Composer reads verified at lane worktree HEAD da76dac3
(= trunk b36f914a + two .hermes/plans-only docs commits; `git -c core.fileMode=false diff --stat
b36f914a..da76dac3` = 2 files, both under .hermes/plans/ — product tree IDENTICAL to b36f914a).
Worker: cl-coder. Headless, server-only. NO UI, NO browser gate. Draft — orchestrator reviews and
promotes.

## 1. Intent (one sentence)
Build ONE pass-internal resolution engine (Brad's ruling: a compiler pass, NOT a standalone
service) whose generic code gathers typed candidates through ADAPTERS over the resolvers that
already exist (ResolveSpine + its providers, the labware-hint lookup, MaterialGrounding's dedup
queries, termReconciliation's suggestion surface, MaterialProfileRegistry layers, ONTOLOGY_DOMAINS,
defaultRoleResolver) and evaluates the SPINE-2 vocabulary's declared argument contracts and
policies — so the chat path and tomorrow's PDF intake resolve nouns through exactly one door,
with hints treated as evidence and the material hierarchy never collapsed.

## 2. Claim gate — SPINE-1 AND SPINE-2 merged (verify ALL on trunk before claiming)
SPINE-3 consumes SPINE-2's vocabulary + `vocabulary.ts`. SPINE-2 is IN FLIGHT (coder pid 2654616,
worktree wt/SPINE-2-lane2-l2t1145, handoff 2026-10-08_1200). Its artifacts are NOT on trunk:
composer PROVED non-existence at both candidate bases (own `git -c core.fileMode=false` runs at
da76dac3):
- `git ls-tree b36f914a schema/ --name-only` lists bio/core/domains/governance/identity/ingestion/
  integration/knowledge/lab/lint/... — NO `schema/scientist-intent/` directory. (Same at
  55319ef2 — SPINE-2's own spec appendix §3.4/3.6 recorded the dir absent there; re-prove at claim.)
- `git cat-file -e b36f914a:server/src/compiler/scientistIntent/vocabulary.ts` => "path does not
  exist" (composer ran this; likewise `git ls-tree b36f914a server/src/compiler/scientistIntent/
  --name-only` shows NO vocabulary.ts — the dir is the SPINE-1 ten files).
At claim time trunk MUST contain (check each, live):
1. `schema/scientist-intent/scientist-intent-vocabulary.yaml` +
   `scientist-intent-vocabulary.schema.yaml` + `scientist-intent-vocabulary.lint.yaml` (SPINE-2 §5.0).
2. `server/src/compiler/scientistIntent/vocabulary.ts` exporting
   `loadScientistIntentVocabulary(opts?)` and the frozen `ScientistIntentVocabulary` with
   `verbs() / has() / classOf() / argContracts() / patterns() / policies() / promptVerbBlock() /
   toolActionEnum()` (SPINE-2 spec §5.1,
   .hermes/plans/2026-10-08_0415-SPINE-2-verb-vocabulary-externalization-spec.md:185-194).
3. SPINE-2's test files green (vocabulary.test.ts / vocabularyRipOut.test.ts or the promoted
   single file — whatever SPINE-2's report names; §6 test names present).
4. ALL SPINE-1 artifacts still green: `cd <wt>/server && npx vitest run
   src/compiler/scientistIntent src/compiler/protocolIntent` => the 9-file/83-test set PASSES
   (composer re-measured today at da76dac3: 9 files / 83 tests, 0 failures).
5. `fixtures/verb-inventory.yaml` still == shipped vocabulary (SPINE-2's current-verb-parity green).
If any is missing, SPINE-3 is NOT claimable. SPINE-3 keeps every SPINE-1 characterization pin
byte-green THROUGHOUT (its hint-parity harness IS those pins — §6).

## 3. Verified file map (every line re-read first-hand by the composer at da76dac3 ≡ b36f914a;
scout-free — every orientation question was answered directly, so no scout citations exist)

### 3.1 THE RESOLVERS THE ENGINE ADAPTS (real entry points, signatures, TODAY's returns)
NOTE: the item text says "compiler/biology/materials/MaterialGrounding.ts" — that path does NOT
exist. The real locations (verified by find): `server/src/materials/` (not under compiler/).

- `server/src/resolve/ResolveSpine.ts` — THE identity spine (header :1-21: "One implementation of
  term → ranked CURIE candidates, walking the six-tier hierarchy (canonical term → local record →
  local OAK → remote OLS4 → vendor → mint-local). Every consumer — the compiler's
  NounPhraseResolver, the UI slash menu and copilot, and the agent's resolve tool — calls this").
  API: `ResolveSpine.resolve(term, opts?): Promise<RankedCandidate[]>` (:59-61, :180-220);
  factory `createResolveSpineFromContext({store, appConfig?, getAppConfig?})` (:253-266).
  Ranking: tier base 1.2/1.0/0.8/0.6/0.4/0.05 then match bonus exact 0.15 / prefix 0.08 /
  substring 0.02 (:40, :70-78); dedupe by CURIE keeping highest score (:207-215); ALWAYS appends
  the tier-5 mint affordance (:218, `mintAffordance` :268-279). `ResolveOptions` already carries
  `level?: MaterialLevel` and `kinds?: string[]` (:80+ of resolve/types.ts — the level field feeds
  `toCandidate`'s +0.03 level bonus, ResolveSpine.ts:232).
  ERROR PROPAGATION TODAY (load-bearing for ambiguity-and-failure): `runProvider` (:138-153) runs
  each provider under AbortController timeout and `catch { return [] }` — a FAILING tier is
  indistinguishable from an EMPTY tier at this level. Same swallowing inside providers:
  `server/src/resolve/providers/terms.ts:64-65` and `providers/records.ts:65-66` wrap `store.list`
  in try/catch → empty. The spine is deliberately best-effort (header :17-20); SPINE-3 MUST NOT
  change that (other consumers depend on it) — the engine wraps providers itself (§5.3).
- `server/src/resolve/types.ts` — `MaterialLevel = 'concept' | 'spec' | 'instance' | 'aliquot' |
  'unknown'` (:17); `RankedCandidate { curie, label, namespace, tier, level, score (0..~1.1),
  source, uri?, definition?, termKind?, domain?, mint? }` (:48-68); `ResolveSource` per tier
  (:20-26). THESE are the candidate types the engine binds — no new candidate record type.
- `server/src/compiler/protocolIntent/ProtocolIntentLowering.ts` — the labware-HINT lowering.
  `lowerProtocolIntentLabwareCandidates(intent): ProtocolIntentLoweredCandidateLabware[]` (:204-223);
  candidate shape `{ hint: resolvedRecordId ?? labwareHint, reason, deckSlot? }` (:14-18, :194-202);
  tips/waste join only WITH deckSlot (:206-221 continue-guards). Consumption today:
  `createLabwareResolvePass({searchLabwareByHint})` in
  `server/src/compiler/pipeline/passes/ChatbotCompilePasses.ts:1537+` — per candidate: 0 matches →
  labwareAddition (hint minted as recordId, :1579-1585); 1 match → resolved (+placement if deckSlot,
  :1586-1598); MULTI-match → **picks matches[0] and emits an `info` diagnostic
  `ambiguous_labware_hint`** (:1604-1627). That top-pick is today's ARBITRARY-WINNER behavior the
  engine's ambiguity policy replaces (it is NOT pinned by SPINE-1's characterization file —
  verified: no multi-match case exists there).
- `server/src/materials/MaterialGrounding.ts` — MINT/GROUND side, not a search:
  `ensureLocalMaterialForOntology(store, ontologyRef, options?)` (:118-184) and
  `ensureLocalMaterialForDraft(store, draftRef, options?)` (:199-258), both
  `Promise<RefShape>` with `RefShape = {kind:'record'|'ontology'|'draft', id, type?, label?,
  namespace?, uri?}` (:9-16). Candidate-gathering it does internally: `store.list({schemaId:
  MATERIAL_SCHEMA_ID, limit:10000})` then class-CURIE match, then case-insensitive NAME match, then
  deterministic-id `store.get` (:127-146, :211-223) — dedup by case-insensitive name, idempotent
  mint (`localMaterialIdForCurie/ForLabel`, termId.ts). ERRORS: THROWS on create failure after a
  re-get retry (:177-181, :251-255); empty-label mint returns the ref untouched as a gap (:207-209).
  The engine's material adapter may REUSE these dedup queries but the engine never mints: mint
  stays behind these functions / the spine's tier-5 affordance (§5.4).
- `server/src/materials/termReconciliation.ts` — "link on a match, SUGGEST on a near miss — never
  merge" (header :1-23). `suggestExistingTerms(query, terms, tolerance=2): TermSuggestion[]`
  (:71-96, bounded Levenshtein, ordered best-first, NEVER applied); `aliasToAppend(term, spelling)`
  (:102-108, the confirm-write side); `normalizeTermName` (:31-33). Exact/alias LINKING is
  explicitly ResolveSpine's job (:10-13) — the engine consumes suggestions as CLARIFICATION
  evidence, never auto-links typos.
- `server/src/ai/resolveDraftMaterials.ts` — the boundary precedent the engine mirrors:
  `resolveDraftMaterials(events, spine: SpineLike, {localOnly=true, suggestionLimit=3})` (:147-245).
  Local hit (tier 0/1, `LOCAL_TIERS` :44) → BIND into the field its LAYER implies via
  `RECORD_TYPE_BY_LEVEL = {concept:'material', spec:'material-spec', instance:'material-instance',
  aliquot:'aliquot'}` (:47-52) + `fieldForCandidate` (:121-125); no local hit → keep mint + offer
  remote suggestions (:233-238); explicit id untouched (:20-21 header). One spine call per distinct
  spelling via promise cache (:156-167). `singularizeLastWord` retry (:139-145) is a pinned quirk
  living at the boundary — out of SPINE-3's editing scope.
- `server/src/ai/materialRefFields.ts` — the ONE layer→field table. `MaterialLayer =
  'material' | 'material-spec' | 'material-instance' | 'aliquot' | 'vendor-product'` (:30-35);
  `MATERIAL_LAYER_FIELD` (:38-44); header :20-23 verbatim: "Layers are a provenance hierarchy
  (concept < formulation < instance < aliquot) and must never be collapsed: a bare concept is NOT a
  formulation, and a formulation is NOT an instance." `WELL_READY_LAYERS` (:58+).
- `server/src/materials/MaterialProfileRegistry.ts` — `MaterialProfileLayer = 'concept' |
  'formulation' | 'instance'` (:5); controls incl. `'local-material-required'` (:6-11);
  `lookup({domain?, formulationKind?})` (:167-182) with 'other' fallback; loaded from
  `schema/lab/material-profile.registry.yaml` (:207-209). A THIRD level vocabulary (UI/profile
  layers). The engine reads it for domain-appropriate layer requirements; it does NOT unify the
  three level vocabularies (§5.5).
- `server/src/ontology/domains.ts` — `ONTOLOGY_DOMAINS`: the canonical "one ontology per domain"
  map (chemical→chebi, cell types→CL, ... :37+). THE declared bridge from a vocabulary `domain`
  tag to an ontology the noun must land in. Engine consults it; NO TS domain→ontology literals.
- `server/src/compiler/roles/RoleResolver.ts` — `type RoleResolver = (role, ctx) => string[]`
  (:30); `defaultRoleResolver` (:43-56) maps `cell_region | control_well | perturbant_col_N |
  triplicate_<label>` to well addresses; UNKNOWN ROLE returns `[]` (:55) and the consuming
  `resolve_roles` pass (ChatbotCompilePasses.ts:2288+) passes such events THROUGH unchanged
  (unknown-role pass-through with warning, :2338-2343). This is an ADDRESS expander, not a noun
  resolver — the engine adapts it for address-kind arguments ONLY.
  NOT THIS: `server/src/security/RoleResolver.ts` (authz) — zero overlap, cite-and-ignore.
- Adjacent, explicitly OUT (reviewer-adjacency map):
  `server/src/compiler/precompile/NounPhraseResolver.ts` — the deterministic event-editor precompile
  path (its own 4-tier registry ladder :191-280 incl. multi-match first-hit `ontHits[0]` :251-261);
  different pipeline surface, not the scientist-intent door. `server/src/materials/AddMaterialSupport.ts`
  (event-time materialization, composition snapshotting :205-239), `server/src/ai/resolveMentions.ts`,
  `server/src/terms/EnsureTerm.ts` — untouched. `server/src/compiler/scientistIntent/`
  normalize/parse/lift — see §4.

### 3.2 SPINE-1's contract surface the engine consumes (b36f914a, SPINE-1 merged)
- `server/src/compiler/scientistIntent/types.ts` — `ScientistIntentActionLocation {actionIndex?,
  action?, argument?}` (:94-98); `ScientistIntentUnresolvedFact {label, reason, candidates?:
  [{label, confidence?}], actionLocation?}` (:100-105) — THIS is the clarification shape the
  engine emits (SPINE-1 froze it). `expectedSourceDomain / expectedTargetDomain /
  expectedLabwareDomain` (:61-66) with the verbatim comment: "Nothing consumes them until SPINE-2's
  vocabulary YAML declares per-verb per-argument domains and SPINE-3's resolution engine evaluates
  them" (:63) — SPINE-3 IS that consumer.
- `parseScientistIntent.ts:102-105` comment: "The normalizeScientistIntent unresolvedRefs boundary
  stays {kind,label,reason} — SPINE-3 widens it" — see OQ2: SPINE-3 does NOT widen it.
- `ProtocolIntentLoweringCharacterization.test.ts` (271 lines, read in full): pins hint→candidate
  mapping, tips/waste continue-guards, one-match placement-on-slot, plan_deck_layout first-wins,
  deckSlot-absence on the scientist-intent path, blockers-keep-candidates. `confidence` on
  candidates is on the DECLARED 0..1 scale (schema, SPINE-2 appendix cite :164-166) — declared,
  NOT calibrated. SPINE-1 NOTEs the coder must carry (from
  /home/brad/.hermes/cl/lanes/2/reviews/review-SPINE-1-adversarial-l2t1135.md §3):
  - N3: whitespace-only `actionLocation.argument` passes schema minLength but is DROPPED at parse
    (`parseScientistIntent.ts:130` — `typeof loc.argument === 'string' && loc.argument.trim()`),
    quirk-consistent with the pre-existing `source` whitespace-drop, currently UNPINNED. §5.7 rules
    on it.
  - N2: the cross-item invariant `actionLocation.action == actions[actionIndex].action` is
    inexpressible in stock JSON Schema 2020-12 AND in the current lint DSL (§7/OQ1).
  - N1: two inline fixture bodies sit outside the compat re-validation set — SPINE-3 may fold them
    into ITS parity/compat fixtures (test-only strengthening, allowed).

### 3.3 SPINE-2 consumption API — ASSUMED vs MUST-RE-VERIFY
ASSUMED (from the promoted SPINE-2 spec §5.0/§5.1/§6, cited above, plus orchestrator promotion
note at :431-445):
- `vocabulary.ts`: `loadScientistIntentVocabulary(opts?: {path?})` → frozen object with
  `verbs()/has()/classOf()/argContracts()/patterns()/policies()/promptVerbBlock()/toolActionEnum()`;
  FAILS LOUD (throws naming path+ruleId), no fallback set; cache keyed per resolved path; fixture
  injection via `opts.path`.
- arg contract shape per argument: `{ kind: 'resolvable'|'scalar'|'wells'|'quantity', required:
  boolean, domain?: string, capability?: string, hintEligible?: boolean }`.
- `policies()` shape: `{ strategyOrder: string[] (unique), ambiguity: {mode, confidenceAccept:
  {min,max}} (0..1 declared scale), hintAuthority: {mode} }`.
- Orchestrator ruling Q2 (SPINE-2 spec :439): ACTION_SYNONYMS STAYS in liftScientistIntent.ts,
  pinned (every synonym target ∈ vocabulary verbs), "data home deferred to SPINE-3 explicitly" —
  SPINE-3 inherits that decision (OQ3).
MUST RE-VERIFY AT CLAIM (SPINE-2 has not merged; its coder may have deviated):
(a) args represented ARRAY vs map (SPINE-2 §5.0 P1 RECOMMENDED array for everyItem — `argContracts()`
may return arrays; do not code against a map until re-checked);
(b) the EXACT method names/return types of vocabulary.ts as shipped (read it, run it — §9 probe);
(c) whether `expected*Domain` slots were given any consumer inside SPINE-2 (they must not have
been, but check);
(d) the vocabulary `class` values and `hintEligible` presence per verb (drives the hint adapter
gate);
(e) SPINE-2's final file names for the triplet + its test files (claim-gate §2 item 3).
Anything here marked UNVERIFIED-hypothesis is exactly that — the §9 probe converts (a)-(e) into
facts before any engine code is written.

## 4. Scope + file ownership
IN SCOPE (the complete diff surface):
- NEW `server/src/compiler/resolution/` — the engine, pass-internal library (SPINE-4 registers it
  as a pass; SPINE-3 registers NOTHING):
  `types.ts` (ResolutionRequest / BoundNoun / Clarification / TierOutcome / EngineOutcome),
  `adapters.ts` (CandidateAdapter interface + the §5.3 adapters), `strategies.ts` (generic strategy
  registry keyed by the DATA ids in `policies().strategyOrder`), `resolutionEngine.ts`
  (`resolveScientistIntentNouns(intent, vocab, deps): Promise<EngineOutcome>`), plus RED-first tests
  `nounResolution.test.ts` (the six §6 criteria), `hintParity.test.ts` (§6 hint-parity), and test
  fixtures under `server/src/compiler/resolution/fixtures/` (fixture vocabularies — copies of
  SPINE-2's shipped vocabulary with policy flips).
- NEW test-only glue importing SPINE-2's vocabulary.ts (read-only consumer).
OUT OF SCOPE (hard — any file below appearing in the diff is a self-flag / review fail):
ALL existing resolver files named in §3.1 (the engine ADAPTS them, edits none);
`normalizeScientistIntent.ts` (its unresolvedRefs key set is PINNED by SPINE-1 compat tests —
widening it there would break a pin, which SPINE-2 §2 declares a design defect; OQ2);
`parseScientistIntent.ts`, `types.ts`, `liftScientistIntent.ts` (incl. ACTION_SYNONYMS — OQ3),
`intentCompile.ts`; the whole `schema/` tree (SPINE-2's triplet is frozen at merge — engine consumes;
no new schema/lint files in THIS item; policy VALUES already exist as vocabulary data);
`ChatbotCompilePasses.ts`, `ProtocolIntentLowering.ts` (SPINE-4 rewires consumers),
`ResolveSpine.ts` + `resolve/providers/*` (best-effort swallow stays — §5.6), `NounPhraseResolver.ts`,
`AddMaterialSupport.ts`, `resolveDraftMaterials.ts`, `materialRefFields.ts`,
`security/RoleResolver.ts`, ALL of `app/**`, any pipeline registry / `scientist-intent-compile.yaml`
(SPINE-4's registration surface).

## 5. Data + consumption design (the engine)

### 5.1 One door, pass-internal
`resolveScientistIntentNouns` takes the PARSED ScientistIntent document (SPINE-1 frozen contract),
the SPINE-2 vocabulary, and injected adapters; returns `{ bindings, clarifications, failures }`.
It performs NO store writes, NO minting, NO pipeline state mutation (write-side mint stays behind
MaterialGrounding/EnsureTerm — the spine's tier-5 affordance is an AFFORDANCE, and today's bind/mint
boundary remains resolveDraftMaterials/`ensureLocalMaterial*`). SPINE-4 will register this as the
declared pipeline pass; SPINE-3 ships the library + proof.

### 5.2 The request is contract + slot, never verb-name
For each action argument: `ResolutionRequest { verb, argument, label (verbatim biologist words),
actionLocation?, declared: argContracts(verb)[argument], expectedDomain?: doc's expected*Domain
slot, wantLevel? }`. The engine NEVER switches on a verb string, a class string, or a domain
literal; all specificity flows from the vocabulary data (§5.0 of SPINE-2's spec: "vocabulary.ts
validates + lints + reads; it never branches on a verb, class, or domain" — the engine inherits
that law). `verb-constrained-domain` falls out: same ambiguous label + `domain: labware` vs
`domain: instrument` → different adapter/domain filter → different eligible sets.

### 5.3 Adapters (generic interface over §3.1 entry points)
`CandidateAdapter { id: string; gather(label, req): Promise<TierOutcome> }` where
`TierOutcome = { candidates: RankedCandidate-like[], failed: boolean }` — `failed` is the honest
error bit (§5.6). The five adapters:
- spineAdapter: wraps a `SpineLike` (resolveDraftMaterials' own seam, :29-31 — tests need no
  server). Since ResolveSpine.runProvider swallows provider errors (:148-149), the engine builds
  its spine from PROVIDER-WRAPPING deps: each ResolveProvider passed to `createResolveSpine` is
  wrapped to set `failed=true` when the inner provider throws, without changing ResolveSpine
  itself.
- labwareHintAdapter: wraps a `searchLabwareByHint`-shaped lookup (the exact dep shape at
  ChatbotCompilePasses.ts:1537+); returns matches WITH failure capture (the callback throws →
  `failed`, never silent-empty).
- registryAdapter: exact-match evidence over `labwareDefinitionRegistry.findByName` /
  `compoundClassRegistry.findByName` shapes (NounPhraseResolver deps §3.1) — evidence tier only,
  never auto-wins at ambiguity.
- ontologyAdapter: declared `domain` tag → `ONTOLOGY_DOMAINS` (domains.ts) → namespace filter on
  spine candidates (namespaceOf already exists, ResolveSpine.ts:131-135). No new ontology search.
- roleAddressAdapter: `defaultRoleResolver` for address-kind arguments
  (`kind: 'wells'` contract); empty expansion is UNKNOWN ADDRESS (→ clarification), NOT the
  pass-through-the-pipeline behavior (§3.1 — the engine is stricter by policy, and the policy is
  declared, §5.6).

### 5.4 Hints are evidence, never canonical identity
A hint (sourceHint/targetHint/labwareHint, `lowerProtocolIntentLabwareCandidates` candidates,
model `unresolved[].candidates`) enters ONLY as TierOutcome evidence with its provenance string
(the existing `reason` fields). Identity = CURIE/recordId from tier 0/1, exactly the
resolveDraftMaterials doctrine (:15-21: bind a LOCAL hit; never bind a mint; suggestions are
never auto-applied). `hintAuthority` (policy mode) decides whether a hint may RAISE a candidate's
eligibility — never whether it may CREATE a term. local-term-identity: aliases resolve through the
tier-0 alias-first provider (terms.ts header: the F-praus fix); engine duplicate-mint is
structurally impossible because the engine writes nothing and near-miss typos surface as
`suggestExistingTerms` evidence in a clarification (never merged, termReconciliation.ts:1-23).

### 5.5 Material levels never collapse
The task list names "concept/formulation/instance/aliquot/composition". The REAL repo has THREE
level vocabularies (§3.1): resolve `MaterialLevel` (concept/spec/instance/aliquot/unknown),
`MaterialLayer` (material/material-spec/material-instance/aliquot/vendor-product —
materialRefFields), profile `MaterialProfileLayer` (concept/formulation/instance — registry).
The engine consumes candidates carrying `MaterialLevel.level` (already on RankedCandidate), binds
via the `RECORD_TYPE_BY_LEVEL` precedent, and enforces `material-levels`: a `level: 'concept'`
(or 'unknown') candidate is INELIGIBLE for a contract requiring instance/aliquot — the same fact
WELL_READY_LAYERS encodes. SPINE-3 adds NO fourth level enum and NO coercion between the three;
the mapping table stays exactly where it is (materialRefFields.ts is "the ONE place"). The
composition layer today = formulation (`ProtocolMaterialFormulationIntent` ProtocolIntent.ts:93-99;
AddMaterialSupport composition_snapshot path) — cited, not re-typed.

### 5.6 Ambiguity and failure are structured outcomes, not winners
- Policy evaluation: strategies applied in `policies().strategyOrder` order via the injected
  strategy registry (strategy IMPLEMENTATIONS are imperative code; selection+order+presence are
  DATA — `policy-is-data` flips outcomes by editing a FIXTURE COPY's strategyOrder/ambiguity with
  zero TS diff). Acceptance = SPINE-1's declared 0..1 scale through `ambiguity.confidenceAccept`
  {min,max}: exactly one candidate inside the acceptance band → binding; MULTIPLE inside →
  clarification; ZERO → clarification with candidates (possibly empty) + mint affordance noted
  (tier-5 passthrough), never silent auto-mint.
- The clarification object IS `ScientistIntentUnresolvedFact` (§3.2) with `actionLocation` carried
  from the request — same frozen shape, confidence 0..1 declared, stable ordered candidate list
  (order = spine rank then adapter order — deterministic, test-pinned twice in the same run).
- lookup error ≠ unknown noun, HONESTLY from what the code does today: the spine swallows provider
  errors to empty (§3.1 — verified) and MaterialGrounding THROWS on mint-create failure (:180,
  :254). Design: engine's `failures[]` records `{ kind: 'lookup_error', adapter, term, message }`
  whenever a wrapped adapter/provider threw, and an argument whose eligible set came ONLY from
  failed tiers yields a clarification with `reason` code `resolution-lookup-failed` — NOT the
  unknown-noun mint path, and NOT a throw. The engine itself never throws for data reasons; it
  throws only for programming errors (missing vocabulary = SPINE-2's loud loader).
- NO hand-rolled TS policy branch: every conditional above is driven by `policies()` /
  `argContracts()` values. If a check cannot be data-driven, STOP-and-report (LintEngine.ts:5
  header law applies to this engine too even though it is not a lint consumer).

### 5.7 The carried SPINE-1 NOTEs
- N3 (whitespace-only actionLocation.argument dropped at parse): SPINE-3 CONSUMES the quirk —
  the engine treats a missing/blank `argument` as "argument location unknown" → the clarification
  still carries actionIndex+action, argument omitted (exactOptionalPropertyTypes conditional
  spread). Additionally SPINE-3 PINS the drop with ONE characterization test in its own test dir
  (test-only; it cannot break existing pins and it closes the reviewer's NOTE). Not a schema fix,
  not a parse fix.
- N2 (cross-item invariant inexpressible): §7 / OQ1.
- N1 (two inline fixture bodies): folded into hintParity/nounResolution fixture bodies (test-only).

## 6. Acceptance criteria (VERBATIM from the task list 'verified by' — test names exact)
  noun-resolution.verb-constrained-domain (same ambiguous label, different declared argument
  contracts => different eligible candidate sets); noun-resolution.material-levels (a concept
  match cannot satisfy an instance/aliquot requirement); noun-resolution.local-term-identity
  (aliases land on one canonical entity, no duplicate term coined); noun-resolution.
  policy-is-data (lint fixture edit flips precedence/ambiguity outcome); noun-resolution.hint-parity
  (SPINE-1 characterization fixtures reproduce exactly); noun-resolution.ambiguity-and-failure
  (structured clarifications, stable candidate lists, never an arbitrary winner; lookup error !=
  unknown noun).
Mapping (RED-first, `server/src/compiler/resolution/nounResolution.test.ts` + `hintParity.test.ts`):
- `.verb-constrained-domain`: ONE fixture candidate pool (ambiguous label, e.g. 'Gemini') served
  by all adapters; TWO requests — same label, vocabulary fixture declaring arg A `domain: labware`
  and arg B `domain: instrument` → eligible sets DISJOINT (assert set-diff, both directions).
- `.material-levels`: pool contains a tier-0 concept hit + an aliquot record hit; contract
  requiring aliquot/instance → the concept candidate is ABSENT from eligible AND named in a
  `level-mismatch` trace line; the concept-only pool yields a clarification, never a bind.
- `.local-term-identity`: alias spellings (the F-praus family, real shapes from terms.ts header)
  all bind to ONE curie across four requests; mintAffordance appears in ZERO bindings; the pool's
  terms store is never mutated (engine has no write dep — assert by absent write spy).
- `.policy-is-data`: copy of the SHIPPED vocabulary YAML as fixture with `strategyOrder` swapped
  (and ambiguity mode flipped); loaded via `opts.path` injection; engine outcome flips (bind↔
  clarify) with `git diff` showing zero `.ts` changes; the SHIPPED vocabulary outcome unchanged
  in the same run. Note the honest mapping: precedence VALUES live in the vocabulary `policies:`
  data (lint CHECKS their well-formedness per SPINE-2 §5.0 P2/P4 — the task's "lint fixture edit"
  is satisfied by editing the policy DATA the lint governs; say this in the report).
- `.hint-parity`: for EVERY fixture scenario in ProtocolIntentLoweringCharacterization.test.ts
  (§3.2 list), `lowerProtocolIntentLabwareCandidates(intent)` output is deep-equal to the engine's
  hint-evidence adapter output for the same intent (same `{hint, reason, deckSlot?}` objects, key
  ABSENCE asserted via Object.keys — not undefined). Plus the SPINE-1 file itself re-runs
  UNTOUCHED and green in the same command (§10).
- `.ambiguity-and-failure`: (i) two candidates inside the acceptance band → ZERO bindings, ONE
  clarification, candidates list ordered, re-run twice byte-equal (stable), no `chosen` field
  anywhere; (ii) adapter whose inner lookup THROWS → `failures[]` names adapter+term and the
  clarification reason code is `resolution-lookup-failed`, DISTINCT from the empty-pool case's
  unknown-noun mint-affordance clarification; (iii) contrast case: same label, provider returns
  `[]` → mint affordance offered.

## 7. The lint-DSL gap (SPINE-1 NOTE N2) — explicit, not hand-rolled
The predicate set TODAY (verified: schema/lint/lint-v1.schema.yaml predicate blocks + server/src/
lint/types.ts constants): exists, nonEmpty, regex, equals, in, all, any, not, plus PROTO-AI-3's
generics allIn / noneIn / everyItem (with `itemField`, item-relative sub-asserts). What is
genuinely ABSENT for N2: a COMPUTED CROSS-REFERENCE — a path selector that resolves a per-item
field as an ARRAY INDEX into a sibling collection (e.g. assert `item.actionLocation.action equals
data.actions[item.actionIndex].action`). `allIn` compares membership over a WHOLE collection
projection; no predicate composes an index from item data, and Ajv $data cannot template array
indices portably (the reviewer's exact finding). SPINE-3 does NOT need this predicate for its six
criteria (the engine consumes actionLocation defensively: mismatch between actionLocation.action
and the action at actionIndex is treated as "argument location unreliable" → clarification — that
is INPUT-INTEGRITY handling in imperative glue code, which the engine legitimately is; it is not a
business-policy branch over a verb or domain). Do NOT add the predicate in SPINE-3 (no lint
interpreter change — that's the LintEngine.ts:5 boundary and a separate item's diff surface).
OQ1 records the recommendation.

## 8. Baselines to RE-MEASURE AT CLAIM (composer captured TODAY at da76dac3 ≡ b36f914a; trunk WILL
have moved with SPINE-2 — re-capture every line below against claim-time trunk, as SETS)
- Server tsc: `cd <wt> && npm run typecheck -w server 2>&1 | grep 'error TS' | sort` — gate is
  `comm -3` SET IDENTITY vs claim-time trunk capture (composer capture at b36f914a: 26 lines /
  6 files, exact sorted set in Appendix A; non-zero exit by design; record, never demand green;
  zero of these lines are in any file this item owns).
- scientistIntent+protocolIntent: `cd <wt>/server && npx vitest run src/compiler/scientistIntent
  src/compiler/protocolIntent` => composer measured TODAY: 9 files / 83 tests PASSED. Post-SPINE-2
  the file count grows (vocabulary tests) — the gate is ZERO failures + the SPINE-1 9 files present.
- src/ai fail-set IDENTITY: `cd <wt>/server && npx vitest run src/ai` => 10 failed | 74 passed
  (84) files; 21 failed | 644 passed (665) tests (composer re-measured TODAY, set in Appendix A) —
  the failing-FILE SET must be identical claim-time and final.
- app tsc 47/24 pin + full-app 53-failing-file SET: carried from handoff 2026-10-08_1200 (NOT
  re-measured by the composer today — UNVERIFIED-today, standing baseline); app/** diff must be
  EMPTY so record once.
- NFS: git ALWAYS `-c core.fileMode=false`; vitest from `<wt>/server` ONLY (repo root gives false
  failures); cl-lane-stack restart is BLOCKING → orchestrator's job in background — the coder never
  restarts or curls :3093/:5193 (YAML staleness there is expected, not a defect); fresh worktrees
  checked against CURRENT trunk tip before dispatch (last tick's race lesson).
- Playwright: N/A (headless item).

## 9. First targeted check (run FIRST — proves SPINE-2's real API shape before any engine code)
`cd <wt>/server && npx vitest run src/compiler/scientistIntent src/compiler/protocolIntent` => 0
failed files (doubles as claim-gate §2 item 4), THEN a throwaway probe test (never committed)
importing `loadScientistIntentVocabulary()` and PRINTING `verbs().length`, `argContracts('transfer')`
(or the shipped equivalent) serialized, and `policies()` keys — this settles every
UNVERIFIED-hypothesis in §3.3 (args array-vs-map, method shapes, policy keys) BEFORE design freezes.
If vocabulary.ts or the triplet is absent: STOP, SPINE-2 is not merged.

## 10. Verification commands (final, expected outputs)
- `cd <wt>/server && npx vitest run src/compiler/resolution src/compiler/scientistIntent
  src/compiler/protocolIntent` => all listed files PASS, 0 failures (SPINE-1's characterization +
  contract files included UNTOUCHED; zero new failing files).
- `cd <wt>/server && npx vitest run src/ai` => failing-file SET identical to claim-time capture.
- `npm run typecheck -w server` (repo root) => `comm -3` vs claim-time trunk line-set EMPTY.
- `npm run typecheck -w app` => 47 lines / 24 files (untouched).
- Ownership diff gate:
  `git -c core.fileMode=false diff --name-only <base>..HEAD | grep -v -E '^server/src/compiler/resolution/|^\.hermes/plans/'`
  => EMPTY (new files under the owned dir + report only).
- Hard-boundary greps (the review WILL run these):
  `grep -rnE "'(transfer|read|wash|spin|pellet|serial_dilution|[a-z_]+)'\s*[=:]|case '" server/src/compiler/resolution/*.ts | grep -v test`
  => ZERO verb/class/domain string literals in engine code (adapter ids and reason codes only are
  allowed — reviewer checks each hit against `policies()` data ids).
  `grep -rn "schemaId: " server/src/compiler/resolution/*.ts | grep -v test` => ZERO (no store
  writes, no direct record queries from the engine — all data via adapters).
- Zero-write proof: the engine module has NO `store.create` / `store.update` / `EnsureTerm` import
  (grep the imports).

## 11. Reviewer bait (this item's likely edge errors — pre-empt in code + report)
1. VERB/DOMAIN HARDCODE IS THE KILL SHOT: any `if (verb === 'transfer')`, any domain→ontology TS
   map (the ontology map is ONTOLOGY_DOMAINS, domains.ts, in data), any strategy chosen by verb —
   REVIEW FAIL (§10 greps). Strategies are chosen by DATA ids from `strategyOrder` only.
2. exactOptionalPropertyTypes sites: clarification/candidate/RefShape construction is
   conditional-spread ONLY; tests assert key ABSENCE via `Object.keys(...).sort()` /
   `not.toHaveProperty` (SPINE-1 harness convention), never toEqual-with-undefined.
3. YAML-reload trap: engine tests inject FIXTURE vocabularies via the loader's `opts.path` (fresh
   validator per SPINE-2 discipline); the compat path uses the shipped singleton; the lane stack
   NEVER reloads YAML — do not curl :3093 and call staleness a defect; a test that mutates the
   shipped vocabulary file in place is a fail (fixture COPIES only).
4. Ontology terms: SPINE-3 is the FIRST consumer of the declared domain slots — the answer to
   "should the engine validate terms?" is: namespaces are filtered against the ONTOLOGY_DOMAINS
   declaration for the arg's domain; term existence itself stays with the spine tiers. Read
   docs/knowledge-layer-canonical-example.md + CLAUDE.md rules 7-8 before replying to anything
   knowledge-layer shaped: THIS item consumes NO claim/context/assertion semantics; rule 8
   (hierarchy never collapses) is the one that binds, and §5.5 is the answer.
5. Hint-parity byte-traps: `reason` strings are pinned VERBATIM ('ProtocolIntent source labware
   resource lw_x' — ProtocolIntentLowering.ts:197-199); the adapter must not "improve" wording;
   tips/waste WITHOUT deckSlot stay skipped; deckSlot key ABSENT vs undefined distinguishes pass
   from fail; multi-match top-pick is NOT parity-scoped (unpinned — §3.1) but do not touch the
   pass either (SPINE-4's turf).
6. Ambiguity regressions: reusing the spine's "highest score wins" as an implicit winner inside the
   acceptance band = criterion fail; mint affordance silently becoming a binding = criterion fail;
   candidate ordering that depends on Promise/set iteration instability = criterion fail (sort by
   score DESC then curie ASC — declared, tested twice).
7. lookup-error conflation: testing failure by returning `[]` proves NOTHING (that's the unknown-
   noun arm) — the failure arm must THROW inside the adapter and assert the distinct reason code;
   conversely do NOT edit ResolveSpine.runProvider's catch (its best-effort contract is load-bearing
   for UI/agent consumers).
8. Scope magnets: registering the pass (SPINE-4), rewiring compileScientistIntent/ChatbotCompile
   (SPINE-4), widening normalizeScientistIntent's unresolvedRefs (breaks SPINE-1 pins — OQ2),
   moving ACTION_SYNONYMS into the vocabulary (OQ3 says not-now), unifying the three level
   vocabularies (§5.5 says no), touching security/RoleResolver.ts (different resolver entirely).
9. The parity proof must be REAL equality (deep-equal on the existing output objects), not a
   hand-copied expectation list; mutation leg: perturb the adapter's reason string in a scratch run
   and show the parity test RED.
10. Vocabulary consumption must be fail-loud inherited: no try/catch around
    loadScientistIntentVocabulary in the engine; a missing/invalid vocabulary must surface the
    SPINE-2 loud error, not a degraded no-resolution mode.

## 12. Worker contract
- Worktree: `wt/SPINE-3-lane2-l2t1200` off trunk `cl/integration-2` AT CLAIM TIME (base >= SPINE-2's
  merge commit; branch `spine-3-lane2-l2t1200`). One worker (cl-coder, fleet lock — currently HELD
  by SPINE-2 pid 2654616). Bootstrap per the SPINE-1 recipe (7 symlinks incl. server/schema,
  start-app.sh, trunk untracked entries 1:1); NFS worktree add ~4-6 min → background; re-verify
  HEAD against current trunk tip before dispatch.
- Deliverable report (unique): `.hermes/plans/SPINE-3-report.wip-l2t1200.md` — must contain: claim-
  gate §2 checklist output (five artifacts named, live output), the §9 probe transcript resolving
  every §3.3 UNVERIFIED item, RED evidence per §6 test BEFORE each GREEN, the parity mutation-leg
  transcript, the §10 greps verbatim, re-measured §8 baselines as SETS (tsc comm -3 empty both
  sides), the §3.1 before/after adapter table (adapter → entry point it wraps → return type), and
  the diff-surface list vs §4 (any file outside §4 = self-flag).
- Server-only spec → NO browser gate.

## 13. Open questions (orchestrator: approve or override)
- OQ1 (N2 cross-reference predicate): add a computed cross-reference predicate to the lint DSL for
  the actionLocation/actionIndex equality invariant, now or never? RECOMMEND: NOT in SPINE-3 — the
  engine handles mismatches defensively as input-integrity (clarification, §7), no §6 criterion
  needs the predicate, and a lint-DSL change is its own RED-first item (PROTO-AI-3 precedent). If
  SPINE-4/5 later needs the invariant DECLARED (e.g. in a scientist-intent lint spec over resolved
  documents), raise it as a sibling to PROTO-AI-3 with the exact gap text from §7. Checked:
  lint-v1.schema.yaml predicate set, lint/types.ts constants, reviewer NOTE N2.
- OQ2 (the parseScientistIntent.ts:105 comment "SPINE-3 widens" normalizeScientistIntent's
  unresolvedRefs): widen it? RECOMMEND: NO in SPINE-3 — SPINE-1 pins normalize's exact key set
  {kind,label,reason} in green tests (reviewer §3 verified two such tests); the engine returns its
  OWN clarification objects (full SPINE-1 shape incl. actionLocation) which SPINE-4's pass emits at
  the pipeline seam, so no pin is broken and the comment's promise lands in SPINE-4 with a code
  comment pointer. Checked: characterization/contract test pins, reviewer §0-2, engine return type
  §5.1.
- OQ3 (SPINE-2 Q2 inheritance: ACTION_SYNONYMS data home): move the synonym map into the
  vocabulary YAML now? RECOMMEND: NO — the engine consumes VERBATIM labels (the resolveDraftMaterials
  doctrine), synonyms are extraction-time normalization inside liftScientistIntent (already
  pinned to vocabulary membership by SPINE-2), and moving them enlarges the engine's surface for
  zero §6 criterion gain; if wave 2 (PDF intake) needs synonym data outside the lift, it belongs in
  the vocabulary as a per-verb `aliases:` field with its own lint pin — a one-commit follow-up, not
  a ride-along here. Checked: SPINE-2 spec §3.1-F/§5.2/promotion note, liftScientistIntent.ts
  :34-65, SPINE-2 Q2 pin.

## Appendix A — cite-verified log (EVERY file:line re-read first-hand by the composer at lane
worktree da76dac3, product tree == b36f914a (git diff --stat b36f914a..da76dac3 = 2 files, both
.hermes/plans); NO scout output cited — every orientation question was resolved directly, so the
scout step was unnecessary; nothing below is inference)
- server/src/materials/MaterialGrounding.ts — FULL read. RefShape :9-16; MATERIAL_DOMAINS/clamp
  :19-33; ensureLocalMaterialForOntology :118-184 (store.list+class/name dedup :127-146; create+
  throw-on-failure :167-181); ensureLocalMaterialForDraft :199-258 (label-gap passthrough :207-209;
  name dedup :211-223; throw :251-255). PATH CORRECTION vs item text: NOT under compiler/biology.
- server/src/materials/termReconciliation.ts — FULL read (108 lines). Header doctrine :1-23;
  normalizeTermName :31-33; editDistance :36-49; suggestExistingTerms :71-96 (exact-match
  suppression :80, best-first sort :95); aliasToAppend :102-108.
- server/src/materials/MaterialProfileRegistry.ts — FULL read. MaterialProfileLayer :5; controls
  :6-11; VALID_LAYERS :57; lookup :167-182 ('other' fallback :181); loader + v1 profile list :189-
  205 (schema/lab/material-profile.registry.yaml :208).
- server/src/compiler/roles/RoleResolver.ts — FULL read. type :30; defaultRoleResolver :43-56;
  unknown role → [] :55; consumers verified via ChatbotCompilePasses.ts:2288+ (unknown-role
  pass-through :2338-2343). security/RoleResolver.ts exists (authz) — grep-confirmed unrelated.
- server/src/compiler/protocolIntent/ProtocolIntentLowering.ts — FULL read (381 lines).
  CandidateLabware :14-18; candidateLabware() :194-202; lowerProtocolIntentLabwareCandidates
  :204-223; pass blockers-keep-candidates :338-344.
- server/src/compiler/pipeline/passes/ChatbotCompilePasses.ts :1537-1630 — createLabwareResolvePass
  zero/one/multi-match arms (:1579, :1586, :1604) incl. ambiguous_labware_hint top-pick info diag.
- server/src/resolve/ResolveSpine.ts — FULL read. Header :1-21; TIER_BASE :40; runProvider
  swallow-to-empty :138-153; resolve :180-220 (dedupe :207-215, mint always appended :218);
  toCandidate level bonus :232; createResolveSpineFromContext :253-266; mintAffordance :268-279.
- server/src/resolve/types.ts — FULL read (97 lines). MaterialLevel :17; ResolveSource :20-26;
  ProviderHit :31-46; RankedCandidate :48-68 (score 0..~1.1 comment :57); ResolveOptions incl.
  level/kinds :76+.
- server/src/resolve/providers/terms.ts :1-40 (alias-first F-praus header; store.list try/catch
  :64-65); providers/records.ts try/catch :65-66 (grep).
- server/src/ai/resolveDraftMaterials.ts — FULL read. SpineLike :29-31; LOCAL_TIERS :44;
  RECORD_TYPE_BY_LEVEL :47-52; BoundTerm/ProposedTerm :54-76; isMintRef :100-106;
  singularizeLastWord :139-145; resolveDraftMaterials :147-245 (bind arms :211-232, propose arm
  :233-238, promise cache :156-167).
- server/src/ai/materialRefFields.ts :1-60 — MaterialLayer :30-35; MATERIAL_LAYER_FIELD :38-44;
  MATERIAL_REF_FIELDS :47-53; never-collapse header :20-23; WELL_READY_LAYERS :58+.
- server/src/compiler/protocolIntent/ProtocolIntent.ts :83-115 — material definition/formulation/
  aliquot intent interfaces (composition layer citation).
- server/src/ontology/domains.ts :1-60 — ONTOLOGY_DOMAINS canonical one-ontology-per-domain map.
- server/src/compiler/precompile/NounPhraseResolver.ts — FULL read; four-tier ladder :191-280
  (first-hit ontology pick :251-261) — cited for the OUT-OF-SCOPE map §3.1 only.
- server/src/compiler/scientistIntent/compileScientistIntent.ts :1-120 — pipeline seam (pass
  registry, searchLabwareByHint dep :68); SCIENTIST_INTENT_PIPELINE_PATH :60-62.
- server/src/compiler/scientistIntent/types.ts :40-105; parseScientistIntent.ts :100-133
  (preserveActionLocation incl. N3 drop site :130).
- server/src/compiler/protocolIntent/ProtocolIntentLoweringCharacterization.test.ts — FULL read
  (271 lines) — pin inventory §3.2.
- schema/lint/lint-v1.schema.yaml predicate docs (allIn :226-267, noneIn :270+, everyItem :299+);
  server/src/lint/types.ts predicate constants (all/allIn/any/equals/everyItem/exists/in/noneIn/
  nonEmpty/not/regex — computed-index grep EMPTY); server/src/lint/LintEngine.ts :1-12 header.
- /home/brad/.hermes/cl/lanes/2/task-list.md :3041-3258 — SPINE-1..6 blocks read in full; SPINE-3
  block :3148-3175 verbatim in §6.
- .hermes/plans/2026-10-08_0415-SPINE-2-verb-vocabulary-externalization-spec.md — FULL read
  (445 lines incl. promotion note :431-445).
- /home/brad/.hermes/cl/lanes/2/reviews/review-SPINE-1-adversarial-l2t1135.md — FULL read (NOTE
  N1-N5 §3, baselines §0).
- .hermes/plans/handoffs/2026-10-08_1200-lane2-spine1-merged-spine2-coding.md — FULL read.
- /mnt/vast/home/brad/git/computable-lab/CLAUDE.md :140-165 (rules 1-8, hard boundary) +
  docs/knowledge-layer-canonical-example.md :1-40 (read per protocol; consumed for rule-7/8
  context only).
- BASE-REF absence proofs (composer's own git): `git ls-tree b36f914a schema/ --name-only` → no
  scientist-intent/; `git cat-file -e b36f914a:server/src/compiler/scientistIntent/vocabulary.ts`
  → fatal path does not exist; `git ls-tree b36f914a server/src/compiler/scientistIntent/
  --name-only` → SPINE-1 ten files, no vocabulary.ts.
- LIVE measurements at da76dac3 ≡ b36f914a (composer's own runs, this session):
  `cd server && npx vitest run src/compiler/scientistIntent src/compiler/protocolIntent` →
  Test Files 9 passed (9) / Tests 83 passed (83) [files: ProtocolIntent 5, Lowering 7,
  PatternExpanders 8, StatePlanner 3, Validation 4, LoweringCharacterization 6,
  clarificationContract 15, scientistIntent 20, scientistIntentContract 15].
  `npx vitest run src/ai` → Test Files 10 failed | 74 passed (84); Tests 21 failed | 644 passed
  (665); FAIL-file set (sorted): AgentOrchestrator.bypass, AgentOrchestratorForwarding,
  AgentOrchestrator.golden, AgentOrchestrator.goldenWithSeeds, AgentOrchestrator.tubeGate,
  ChatbotCompileDeckSlot, chatbotCompile.e2e, InferenceClient.config, materialFollowUp,
  submitSuggestionTool.tubeSchema — matches the SPINE-1 reviewer's set exactly.
  `npm run typecheck -w server | grep 'error TS' | sort` → 26 lines / 6 files; exact sorted line
  set (per-file counts: AgentOrchestrator 8, RecordStoreImpl 11, AuthoringGuard 3,
  ProtocolIntakeHandlers 2, RecordHandlers 1, bootstrapAdmin 1):
    src/ai/AgentOrchestrator.ts(2679,52) profileForDomain
    src/ai/AgentOrchestrator.ts(2680,50) clarificationForLayer
    src/ai/AgentOrchestrator.ts(2712,56) clarificationPolicy
    src/ai/AgentOrchestrator.ts(2734,75) profileForDomain
    src/ai/AgentOrchestrator.ts(2736,44) requirementsForLayer
    src/ai/AgentOrchestrator.ts(2810,79) profileForDomain
    src/ai/AgentOrchestrator.ts(2812,40) requirementsForLayer
    src/ai/AgentOrchestrator.ts(285,11)  material-instance not assignable to PromptMention kind
    src/api/handlers/ProtocolIntakeHandlers.ts(396,46) refreshTree
    src/api/handlers/ProtocolIntakeHandlers.ts(397,51) implicit any 'd'
    src/api/handlers/RecordHandlers.ts(35,15) AuthoringPolicy not exported
    src/lint/AuthoringGuard.ts(11,15) AuthoringPolicy not exported
    src/lint/AuthoringGuard.ts(11,32) AuthoringRequirement not exported
    src/lint/AuthoringGuard.ts(45,22) implicit any 'r'
    src/scripts/bootstrapAdmin.ts(40,22) clear not on SessionStore
    src/store/RecordStoreImpl.ts(269,18)+(269,48)+(295,18)+(295,48)+(421,18)+(421,48) gitCommit
    src/store/RecordStoreImpl.ts(459,36) getVerifiedCommit
    src/store/RecordStoreImpl.ts(575,115)+(575,145)+(770,124)+(770,154) gitCommit
  (26 lines total; full column-accurate text lives in the claim-time re-capture the coder must take).
- UNVERIFIED-hypothesis register (all routed through the §9 probe or claim-time re-measure; none
  cited as fact above): SPINE-2 vocabulary.ts exact shapes (§3.3 ASSUMED list a-e); args array-vs-
  map; policy keys; SPINE-2's final test file names; app tsc 47/24 pin (carried, not re-measured
  today); SPINE-2 absence at 55319ef2 (cited from SPINE-2's own appendix + SPINE-1 record, re-prove
  at claim per §2).

COMPOSER DONE — draft only; orchestrator review required before dispatch.

---

## ORCHESTRATOR PROMOTION NOTE (2026-10-08T12:50 EDT — canonical, l2t1250)

Reviewed at trunk b36f914a (da76dac3 docs-tip). Orch INDEPENDENTLY re-verified the
load-bearing cites: ResolveSpine.resolve :59-61/:180, mint always appended :218,
RankedCandidate/types MaterialLevel :17; ChatbotCompilePasses multi-match top-pick +
ambiguous_labware_hint :1604-1627; types.ts ScientistIntentActionLocation :99-103 +
the expected*Domain "SPINE-3 is that consumer" comment :61-66;
parseScientistIntent.ts "SPINE-3 widens" comment :102-105 + N3 whitespace-drop site
:130; resolveDraftMaterials SpineLike :29 / LOCAL_TIERS :44 / RECORD_TYPE_BY_LEVEL
:47-52. The characterization file lives at compiler/protocolIntent/ (271 lines, as
cited). Composer baselines (9/83 green, src/ai 10-file set, tsc 26/6 set) match this
tick's SPINE-1 merge measurements exactly.

RULINGS on the composer's open questions — ALL THREE RECOMMENDATIONS ADOPTED:
- OQ1: NO lint-DSL change in SPINE-3. Mismatch = input-integrity clarification in
  engine glue (§7 text stands). If SPINE-4/5 needs the invariant declared, it is a
  NEW sibling item to PROTO-AI-3, not a ride-along.
- OQ2: NO widening of normalizeScientistIntent in SPINE-3. The engine's own
  clarification return type IS the widening; the parse-site comment's promise lands
  in SPINE-4 (that item must update the comment text in its own diff).
- OQ3: ACTION_SYNONYMS stays in liftScientistIntent for SPINE-3; a future vocabulary
  `aliases:` field is a separate one-commit item with its own lint pin.

CLAIM GATE REMINDER (spec §2): SPINE-2 must be MERGED first — claim-time trunk must
show schema/scientist-intent/ triplet + vocabulary.ts + its §6 tests green, plus the
SPINE-1 9-file/83-test set still green. The §9 probe (vocab API shape printout)
PRECEDES any engine code; §3.3 (a)-(e) are hypotheses until the probe settles them.
Worker: cl-coder under the fleet lock. Server-only -> NO browser gate.
