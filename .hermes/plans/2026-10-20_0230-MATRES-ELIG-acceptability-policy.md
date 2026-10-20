# MATRES-ELIG — Acceptability policy + purpose-based tier discovery (DRAFT, l2t0115 spec-composer)

Status: DRAFT — NOT dispatchable until the orchestrator promotes it.
Item: MATRES-ELIG, lane 2 task list (~line 10583). Campaign 2, principles P1–P8; P4/P6/P8 bind this spec.
Trunk: cl/integration-2 @ 1997e7e3 (code tip 46c3e4e9, MATRES-ATTEST merged). NFS repo: every git command runs with `-c core.fileMode=false`.
Contracts memo r1 Q1–Q8 are PROPOSED DEFAULTS, silent-ratify 2026-10-21 18:00 EDT (sha256 e8d8165882fd17af… unchanged at dispatch). Every decision in this spec that depends on a memo default carries [DEFAULT-PENDING-RATIFICATION: Qn].

## §1 Goal

Replace the engine's one-word "acceptable candidate" (the confidenceAccept band plus TS early-return branches) with three data-declared eligibility predicates — eligible-to-DISPLAY, sufficient-to-SUPPRESS-further-search, authorized-to-BIND — evaluated by the existing lint predicate DSL over an adapter-exposed declared-fact envelope, plus purpose-based tier-policy data (legal spine tiers per demanded referent level × campaign mode), so an approximate local candidate can no longer suppress an exact demanded-level remote candidate, physical-instance demands never fire vendor tiers, catalog-shaped tokens elicit vendor scope instead of fabricating identity, and missing evidence evaluates INCOMPLETE — with the compiler's network boundary unchanged (P6).

## §2 Description (verbatim from task list — binding)

> Replace the one-word "acceptable candidate" with three data-declared predicates
> evaluated over adapter-exposed declared facts (candidate referent level,
> requested/permitted levels, scoped identifiers, required vs observed spec
> attributes, relationship evidence, completeness indicators): eligible-to-
> DISPLAY, sufficient-to-SUPPRESS-further-search, authorized-to-BIND. Expressible
> in the existing predicate DSL (exists/regex/equals/all/any/not) per r2 — a
> candidate with missing evidence yields a distinct INCOMPLETE outcome, never a
> silent pass. Purpose-based discovery policy data: which spine tiers are legal
> per (utterance-demanded referent level x campaign mode) — e.g. physical-
> instance referent forbids vendor/remote tiers (case 3); product-level referent
> with vendor unknown OR catalog-shaped token (vendor scope ELICITED — catalog
> numbers are vendor-scoped, never globally unique) may reach tier 4 for catalog
> IDENTITY only (P4: never custody evidence). The remote-tier clamp (localOnly)
> stays for COMPILATION (P6); enrichment runs in the review interaction against
> the existing spine and results become accepted stable references before
> recompile. Settle the compiler network-boundary decision explicitly in the
> spec — no "where possible" hedges. Vocabulary/schema changes ride existing
> lint guards (scientist-intent-vocabulary.lint.yaml pattern).

## §3 Why (verbatim from task list)

> Today an approximate local match at the wrong referent level suppresses the
> exact answer at the demanded level (the observed 4-clarification defect). r2:
> defining acceptability BEFORE any tier-order change is what keeps this from
> becoming forbidden new resolution intelligence; P8 keeps policy in YAML.

## §4 Verified-by (verbatim from task list — binding acceptance criteria)

> RED-first vitest: approximate-level local candidate does NOT suppress an exact
> demanded-level remote candidate in the review-interaction spine call; physical-
> instance requests never fire vendor tier; a catalog-shaped token elicits vendor
> scope rather than fabricating product identity; missing-evidence candidate
> evaluates INCOMPLETE not MATCH; offline compilation byte-stable against accepted
> refs (no network in compiler path). npm run typecheck -w server at baseline.

## §5 Harvest-report measurements → eligibility predicates (the "why", mapped)

Each measured suppression surface from `.hermes/plans/MATRES-REPLAY-harvest-report.md` and the predicate that fixes or reframes it:

| # | Measured surface (harvest report) | Predicate that fixes/reframes it | Mechanism |
|---|---|---|---|
| M1 | **limit-20 head-cut** — `slice(0, limit)` at ResolveSpine.ts:222 (verified); 11/25 nouns edge-capped; below-the-fold candidates never reach the panel | sufficient-to-SUPPRESS-further-search | Suppression becomes a predicate VERDICT, never a side effect of truncation or tier presence. Rule in data: a truncated or absent remote query is UNKNOWN, never sufficient-to-SUPPRESS. The review-interaction enrichment call re-queries the spine at the demanded level with its own limit; the head-cut stays a spine transport detail. |
| M2 | **duplicate-label floods** — 32 of 42 noun-arm outcomes are `ambiguous-noun` clarifications over records whose only visible difference is a recordId suffix; candidate fact carries NO level field (payload `{label, confidence, ref}` — resolutionEngine.ts:101-108, verified) | eligible-to-DISPLAY (+ payload disclosure) | The engine's clarification candidate-fact payload gains the per-candidate eligibility verdict + referentLevel + tier (§7.4), so identical labels at different referent levels become distinguishable IN THE DATA the panel renders. Label de-duplication itself is MATRES-PANEL's job — explicitly out of scope here (§6). |
| M3 | **levelFilter dropping concept-level candidates** — resolutionEngine.ts:144-161 (verified): under `wash.material level: aliquot` every concept-level Trypsin-EDTA/DMEM/FBS/HepG2 candidate was dropped to zero, surfacing a genuinely-available material as unknown-noun + mint | eligible-to-DISPLAY vs authorized-to-BIND split | The structural well-ready drop keeps its current job (data table WELL_READY_LAYERS, materialRefFields — unchanged), but drops become TRACED eligibility verdicts attached to candidates, not silent removals; and the demanded allowed-set job becomes vocabulary data [DEFAULT-PENDING-RATIFICATION: Q1] (§7.5). A concept candidate that is display-relevant but not bind-eligible must remain visible as an incomplete possibility (r2 §4), not vanish into unknown-noun + mint. |
| M4 | **remote tier-4 max confidence 0.58 < band floor 0.7** — TIER_BASE {4: 0.4} + max match bonus 0.15 + level bonus 0.03 (ResolveSpine.ts:40, :232, verified); engine band filter `tier!==5 && confidenceOf in [0.7,1]` (resolutionEngine.ts:224-226, verified) ⇒ vendor hits are structurally unbindable through the engine even online | authorized-to-BIND is eligibility-by-declared-facts, NOT band arithmetic | The band is NOT touched (§8 states the exact interaction): tier-4 never becomes engine-bindable by raising scores (that would be forbidden resolution intelligence). Vendor identity reaches bindability ONLY through review-time enrichment → acceptance as a stable local reference → recompilation, where the accepted record is tier-1 (confidence 1.0, band applies normally). |
| M5 | **343/347 clarification facts clamp to confidence 1.0** — tiers 0-2 saturate after `min(max(score,0),1)`; tier ranking and match quality are INVISIBLE to the clarification payload | eligible-to-DISPLAY payload carries tier + referentLevel + verdict independently of the clamped score | The clamp stays (P1 — no silent confidence rescaling). Disclosure rides the NEW payload fields (§7.4), so whatever renders the clarification (PANEL) sees tier/level/verdict as first-class facts, not as a lost score differential. |

## §6 Files

IN SCOPE (task-block files list, extended with the new policy-data triplet — the extension is this spec's decision, listed so the coder never improvises):
- server/src/compiler/resolution/ — eligibility submodules (new `eligibility/` dir: facts.ts, policy.ts, evaluate.ts), resolutionEngine.ts (consume verdicts; payload disclosure), types.ts (EngineOutcome/Clarification fact shape additions, additive)
- server/src/resolve/ — ResolveSpine.ts ONLY if a policy-driven tier-gate hook is needed at the tier-list construction seam (§7.3, decision D4); otherwise untouched. NO changes to TIER_BASE, matchBonus, DEFAULT_LIMIT, localOnly semantics.
- schema/scientist-intent/scientist-intent-vocabulary.yaml + .schema.yaml + .lint.yaml — arg-contract declaration slots for the demanded-level allowed-set [DEFAULT-PENDING-RATIFICATION: Q1]; lint rules for well-formedness of new fields.
- NEW: schema/scientist-intent/material-eligibility/material-eligibility.yaml (policy data), .schema.yaml, .lint.yaml — the triplet pattern of constraint-vocabulary / scientist-intent-vocabulary (schema binds by schemaId; lint is DSL-only).
- Tests: server/src/compiler/resolution/eligibility/*.test.ts + resolutionEngine eligibility tests; schema/IntakeSchemas-style schema-lint test for the new triplet (pattern: server/src/schema/AttestationSchemas.test.ts, the ATTEST precedent).

OUT OF SCOPE (hard — a reviewer should reject any of these appearing in the diff):
- app/ (any UI) — the panel is MATRES-PANEL.
- Label de-duplication of real records (M2 fix belongs to PANEL; ELIG only enriches the payload it will render).
- Mint-on-select behavior, MaterialGrounding, EnsureTerm writes.
- materialRefFields.ts (lane symlink into Brad's tree — trunk-hygiene finding owned by orchestrator/Brad per handoff l2t0115; do NOT re-point, copy, or "fix" it; import it as the existing code does).
- TIER_BASE / band values / matchBonus arithmetic / DEFAULT_LIMIT (no tier-order or score changes — r2: acceptability BEFORE any tier-order change).
- Any change to `createCompileOntologyResolver`'s localOnly wiring (server.ts:826 passes `localOnly:false` for the NounPhraseResolver ontology tier — that is EXISTING doctrine, best-effort remote OLS4; ELIG neither widens nor narrows it. See D3).
- Alias append / termReconciliation (Q6, separate).
- A campaign-mode SYSTEM (modes are policy-data keys only, D5).

## §7 The design (settles, no hedges)

### §7.1 The three predicates are DATA, evaluated by the existing DSL

One registry of eligibility policies in `material-eligibility.yaml`. Each policy entry has the shape:

```yaml
- id: bind-instance-requires-instance-level
  verdict: authorized-to-bind          # one of: eligible-to-display | sufficient-to-suppress | authorized-to-bind
  when:  {op: equals, path: demanded.referentLevel, value: instance}   # optional applicability guard over the fact envelope
  requires: <predicate>                # evidence-completeness guard
  assert: <predicate>                  # the business predicate
```

Three-state semantics WITHOUT an interpreter change (this is the settlement the DSL question needs — verified op set: exists, nonEmpty, regex, equals, in, allIn, noneIn, everyItem, all, any, not, compare; PredicateEvaluator.ts:894 `evaluatePredicate`, lint-v1.schema.yaml:140-392):

- `requires` false ⇒ verdict **INCOMPLETE** (missing evidence; the reason string from the evaluator rides the verdict).
- `requires` true, `assert` false ⇒ verdict **FAIL**.
- both true ⇒ **PASS**.
- A `not:` whose sub-verdict is INCOMPLETE propagates INCOMPLETE. INCOMPLETE is absorbing under `all`/`any`/`not` (all-with-any-INCOMPLETE ⇒ INCOMPLETE if no FAIL; any-with-a-PASS branch ⇒ PASS only if no INCOMPLETE remains unresolved — the evaluator helper resolves this ONCE, generically, no domain knowledge).

Missing-evidence ⇒ INCOMPLETE never collapses to PASS because every `assert` that reads an evidence path is gated by a `requires` completeness guard FIRST — do NOT rely on `allIn` vacuous-pass over an empty selection (lint-v1.schema.yaml:243-244: empty selection PASSES vacuously — that is reviewer bait, §11). The PROTO-AI-3 membership ops are load-bearing here and verified in the corpus: `allIn`/`noneIn` (schema/lint/lint-v1.schema.yaml:236-316, PredicateEvaluator.ts:443-500) express demanded-level allowed-set membership (`candidate.referentLevel allIn demanded.allowedLevels`), noneIn expresses the physical-instance tier disjointness (§7.3), and `everyItem` per-candidate asserts. The `compare` op exists (lint-v1.schema.yaml:142-149) but this task must not use it for confidence thresholds — the band is not a predicate input (§8).

### §7.2 The declared-fact envelope (adapter-exposed; P8 "no new resolution intelligence")

A pure data assembly, new module `eligibility/facts.ts`. Per (candidate, request):

```yaml
demanded:
  referentLevel: <canonical one of concept|formulation|vendor-product|instance|aliquot | unknown>  # from the utterance-demanded arg contract
  allowedLevels: [...]        # vocabulary arg-contract `levels` slot [Q1]; absent = unconstrained (today)
  scopedIdentifiers: [...]    # vendor-scoped identifiers seen in the utterance (value + vendorRef when named)
  requiredAttributes: [...]   # from the arg contract / draft slot context
campaignMode: <string>        # policy-data key, see D5
candidate:
  referentLevel: <canonical ... | unknown>   # derived from the candidate's OWN record kind/ref type THROUGH materialRefFields.materialLayerOf (existing alias DATA table; 'formulation'→material-spec etc.), else unknown. NOT re-mapped by any new TS list.
  tier: 0-5                   # verbatim RankedCandidate.tier
  source: canonical-term|local-record|oak|ols4|vendor|mint
  identifierScopes: [...]     # vendor-scope of candidate identifiers (unknown = declared, never inferred)
  observedAttributes: [...]
  relationshipEvidence: [...] # e.g. vendor-product.material_ref joins, supplies/conforms facts, when present in the store
  completeness: {identityKnown, vendorKnown, custodyEvidence: false-for-tier-4}  # booleans from DECLARED presence only
```

Every field is adapter-exposed presence, never inference. Biological-equivalence inference, grade-suitability guessing, or `isCompatible`-style TS fields are FORBIDDEN (r2 §4 verbatim: opaque TS "isCompatible" would move business logic out of sight).

### §7.3 Purpose-based tier-policy data (P4)

In `material-eligibility.yaml`, a `tierLegality` table keyed by (demanded referent level × campaign mode), tiers as data, enforced by `noneIn`/`allIn` over the envelope — not by TS branches:

- `instance` (and `aliquot`) demanded ⇒ tiers {3, 4} NOT legal (case 3: a physical bottle is never answered by a catalog lookup; no vendor/remote tier fires — AC-2).
- `vendor-product` demanded with vendor unknown OR a catalog-shaped token ⇒ tiers {0,1,2,3,4} legal, with tier-4 output constrained to the **identity role only**: every tier-4 verdict carries `role: catalog-identity` in the policy data; a policy assertion that tier-4 evidence satisfies ANY custody/use/attestation predicate MUST NOT exist and the lint forbids the shape (P4 — catalog lookup may resolve catalog identity anywhere, including execute and retrospective mode; its result may never serve as evidence of custody or use).
- `concept`/`formulation` demanded ⇒ tiers {0,1,2} legal; tiers {3,4} legal only for identity-clarification display (eligible-to-DISPLAY), never sufficient-to-SUPPRESS.
- Vendor KNOWN is NOT a ban on vendor lookup (r2's repair of R5′): legality is per PURPOSE (the verdict), never per vendor-knownness.

Catalog-shaped token detection is DATA: a `catalogShape:` regex list in `material-eligibility.yaml` (the nounShape precedent — config/drafting/shorthand-drafting.yaml patterns loaded PER call, resolutionEngine.ts:262). A token matching a shape with no named vendor scope ⇒ verdict set {eligible-to-display: PASS(local candidates only), sufficient-to-suppress: INCOMPLETE, authorized-to-bind: FAIL} + a scope-elicitation clarification (reason `vendor-scope-unknown`, candidate list empty or scope suggestions) — AC-3: elicit scope, never fabricate product identity (`15400021` is not globally unique, third-party §4: shape alone must not invent vendor scope).

The five referent levels **concept | formulation | vendor-product | instance | aliquot** are canonical (campaign header P5 / memo Q1) — NOT re-declared here; the eligibility data references them by those names and lint checks every `referentLevel`/`levels`/`allowedLevels` value in vocabulary AND eligibility data against exactly that set (vocab lint pattern: `allIn` against a declared `referentLevels:` list in the data file). Code-side spellings ('spec', 'material', 'unknown') are normalized through materialLayerOf's existing alias table (verified: materialRefFields.ts LAYER_ALIASES maps formulation→material-spec, vendor→vendor-product); the canonical vocabulary name `formulation` is an accepted alias already.

### §7.4 Engine consumption + payload disclosure (M2/M3/M5)

resolutionEngine.ts changes are minimal and generic (engine law holds: no switch on verb/class/domain NAME):
1. After `levelFilter`/dedupe, assemble the fact envelope and evaluate the three predicates per candidate; collect verdicts + trace strings (the existing `traces` channel).
2. The band filter stays byte-identical for the compile path (§8). The BIND arm (`inBand.length === 1`) additionally requires authorized-to-bind PASS — a band-passing but bind-INCOMPLETE candidate falls to clarification as an incomplete possibility, never binds.
3. Suppression: the strategy loop's early-return on `inBand ≥ 1` is REPLACED by a sufficient-to-SUPPRESS check: the loop continues to the next strategy iff no in-band candidate is sufficient-to-suppress PASS. This is the exact code-level root of AC-1 in the engine; the second root — `resolveDraftMaterials`'s LOCAL_TIERS-first drop (resolveDraftMaterials.ts:174-186, verified: any local hit ⇒ remote candidates dropped wholesale) — is a draft-consumer behavior left UNCHANGED for compilation (localOnly makes it moot there); the review-interaction path does not route through resolveDraftMaterials (D2).
4. `candidateFact` gains, via conditional spread only: `tier`, `referentLevel`, `eligibility: {display, suppress, bind}` verdict enums (`pass|fail|incomplete`) + reason refs. Additive fields; existing goldens updated ONLY where the payload shape is byte-pinned (declared, test-pinned commit discipline, RECV $defs precedent).

### §7.5 Vocabulary arg-contract slots [DEFAULT-PENDING-RATIFICATION: Q1]

`ScientistIntentArgContract` (vocabulary.ts:48, verified) gains two OPTIONAL data slots: `levels: [referent levels]` (allowed set; absent = unconstrained, backwards-compatible) and `preferred` (panel pre-selection hint — NEVER a filter, never suppression). Vocabulary lint: `preferred in levels`; `levels` members allIn the canonical five. `wantLevel`/levelFilter keeps its current well-ready job; the allowed-set job reads `levels` through the envelope (`demanded.allowedLevels`). Clarification never fires merely because the top allowed candidate is not preferred. Initial declaration for `add_material.material` per memo Q1 is the memo's [Q1]; if the harvest worksheet legs later amend it, that is a data-only amendment.

## §8 The compiler network-boundary decision (P6 — explicit, no hedges)

SETTLED AS:
1. **COMPILATION stays exactly as wired today.** The engine's spine adapter keeps `localOnly: true` (adapters.ts:82, verified). `createCompileOntologyResolver` keeps its declared `localOnly: false` best-effort OLS4 wiring (server.ts:824-826 + compileResolver.ts:35-44, verified — ELIG changes NEITHER; do not "harmonize" them, that is a doctrine change requiring an explicit r3, P6). No fetch reaches the compiler path from anything ELIG adds. Offline compilation against accepted stable references is byte-stable: the AC-5 proof (fetch-stub + double-run golden).
2. **ENRICHMENT runs in the review interaction** against the existing spine through the EXISTING `POST /resolve` handler (ResolveHandlers.ts, verified: it already accepts `localOnly` as an optional body field and omits remote only when true) — no new endpoint, no new engine, no new tier machinery. The review interaction calls with the tier-legality-filtered request (instance-demanded ⇒ the caller passes `localOnly: true`; product-demanded-catalog ⇒ `localOnly` omitted). The eligibility verdicts (§7.1) are computed locally over the returned candidates; only the candidate FETCH is networked, and it happens in the interactive surface, not in any compile.
3. **Results become accepted stable references BEFORE recompile**: an accepted enrichment selection lands as an accepted local record (existing mint-on-select / accept paths — unchanged, PANEL wires the interaction); the recompile then resolves it at tier 1 with confidence 1.0 and the normal band applies. Tier-4 enrichment NEVER participates in compilation directly.
4. **Band interaction with tier-4, stated precisely (M4):** confidenceAccept [0.7, 1] remains the engine's local-tier in-band gate and is NOT modified, NOT re-keyed, and NOT consulted on the identity-enrichment path. The enrichment path is gated by authorized-to-bind over declared facts (identity role, scope known, evidence presence). Tier-4's max score 0.58 therefore has ZERO interaction with tier-4 identity enrichment — the band simply does not see that path; and it continues to make tier-4 non-bindable inside the engine, which is CORRECT and stays (a raw remote hit is never bindable; only an accepted reference is). If anyone later proposes raising TIER_BASE or lowering band.min to "fix" 0.58, that is forbidden tier-order/score change — reject at review.

## §9 Vocabulary/lint guard discipline

- All new conditional well-formedness rides DSL-only lint rules (exists/nonEmpty/equals/in/allIn/noneIn/everyItem/all/any/not) in the existing scientist-intent-vocabulary.lint.yaml pattern and a NEW material-eligibility.lint.yaml bound by schemaId — zero interpreter changes, zero new predicate ops. (The DSL question from r2 §4 is answered: CONFIRMED within this boundary; PROTO-AI-3 allIn/noneIn/everyItem already shipped and are the load-bearing additions.)
- **No hardcoded kind/level/tier lists in TypeScript** — the engine law holds: the five canonical level names appear in TS ONLY as existing types/alias tables; policy references are data checked by lint. New TS may not contain the literals `vendor-product`/`aliquot`/tier numbers in switch/branch form — lint + a reviewer grep (§11).
- The eligibility data file is loaded **per call, never process-cached** (the nounShape law, resolutionEngine.ts:256-262 comment, verified — and note the counter-example: `loadScientistIntentVocabulary` IS a cached singleton, vocabulary.ts:269-280; if ELIG reads vocabulary `levels` slots, the cache behavior of that path must be RE-STATED in code comments, and the eligibility file itself follows the per-call law).

## §10 Worker contract

- Profile/lock: cl-coder, FLEET LOCK held (RECV coder currently holds it — orchestrator sequences; do not start until released).
- Worktree: `/mnt/vast/home/brad/git/wt/matres-elig-lane2`, branch `cl/lane2-matres-elig-l2t<tick>` off trunk tip **1997e7e3** (post-ATTEST). All git: `git -c core.fileMode=false …` (NFS).
- node_modules symlink to /mnt/vast/home/brad/git/computable-lab/node_modules (lane-standard, REPLAY A6 precedent).
- Deliverable (unique): `.hermes/plans/MATRES-ELIG-report.l2t<tick>-coder1.md`.
- RED-first: failing tests committed BEFORE green (separate commits; mutation-proof where feasible, ATTEST precedent).
- Silent-ratify discipline (MATRES-0): code against the PROPOSED defaults now; every touched decision site carries `[DEFAULT-PENDING-RATIFICATION: Q1]` (and Q2/Q5 where §7.4 payload / unknown-provenance INCOMPLETE semantics are leaned on) as a code comment at the site. Before ANY commit, re-check `sha256sum /home/brad/.hermes/specs/intake/2026-10-19_material-resolution-attestation/contracts-memo-r1.md`; if it changed from e8d8165882fd17af…, STOP, re-read the annotations, and re-tag or halt with a question — never improvise over a veto.
- Report the four AC behaviors with real command output; no claim without a run.
- Do not touch the task list; orchestrator owns bookkeeping.

## §11 Reviewer bait (pre-empted, for the coder AND the adversarial reviewer)

1. **exactOptionalPropertyTypes**: every optional envelope/payload field must be built by CONDITIONAL SPREAD (`...(x !== undefined ? {x} : {})`) — vocabulary.ts:47 comment is the in-repo law. A plain `field: undefined` will typecheck-fail; watch candidateFact and the eligibility verdict struct.
2. **YAML-reload trap**: the eligibility data MUST load per call (nounShape law). A module-level `const POLICY = load(...)` is an instant reject. Conversely, do not "fix" the vocabulary cached singleton — out of scope, and realizationGolden/riposte tests pin it. A test that mutates a YAML fixture mid-process and expects a reload must use fixture `path:` injection, not the cache.
3. **Vacuous allIn**: `allIn` over an empty selection PASSES vacuously (schema text, verified). A bind predicate that becomes vacuous when `relationshipEvidence` is missing is exactly the "not known to mismatch ⇒ known to match" bug. Required: `requires:` completeness guards on EVERY evidence path; a RED test must prove missing-evidence ⇒ INCOMPLETE (§12 AC-4) before any allIn appears in a bind policy.
4. **INCOMPLETE under not/all/any**: an implementation that evaluates `not(INCOMPLETE)` as FAIL (or PASS) silently collapses the third state. The absorbing-propagation rule (§7.1) is unit-tested directly, including nested not(all(any(…))).
5. **Ontology terms**: tier-0/tier-2 hits are concept-level with `level` possibly `unknown` (ProviderHit.level optional, records-only per resolve/types.ts:38 comment, verified); the unknown level must yield INCOMPLETE on bind predicates, never PASS-by-default and never a crash.
6. **Hardcode boundary**: no TS branch may contain tier numbers, level names, or vendor-kind literals for POLICY (the existing `tier !== 5` mint-affordance guard is pre-existing and stays; nothing NEW joins it). Reviewer grep: policy literals only under schema/ data + existing tables.
7. **Band/tier-order smuggling**: any diff line touching TIER_BASE, matchBonus, confidenceAccept values, DEFAULT_LIMIT, or the `tier!==5 && band` expression is out of scope by §6 — reject on sight. Same for "harmonizing" server.ts:826 localOnly:false.
8. **Suppression root #2**: fixing only the engine early-return while `resolveDraftMaterials` LOCAL_TIERS-first still drops remotes invites a false claim that review-time suppression is fixed. The spec's answer: review-interaction does not route through resolveDraftMaterials (D2); a reviewer must see that routing named in the report.
9. **Custody leakage (P4)**: a policy shape where a tier-4 candidate's PASS on any predicate is consumed as custody/attestation evidence anywhere in the diff — the `role: catalog-identity` tag must survive from policy data into the verdict payload.
10. **Byte-stability**: the AC-5 double-run must be over the REAL compile path (fetch throwing stub, `offline.fetch_blocked == 0` style counter, REPLAY harness precedent), not a mocked spine — a vi.mock spine proves nothing about network reachability.

## §12 Verification commands (expected outputs)

First targeted check (run this BEFORE designing the engine edit — it proves the three-state evaluator approach early and is the smallest RED):

```
cd /mnt/vast/home/brad/git/wt/matres-elig-lane2
npm run test:run -w server -- eligibility/evaluate   # RED: missing-evidence candidate => INCOMPLETE
```
Expected before implementation: suite fails to resolve / assertions fail (RED commit). After the §7.1 evaluator + AC-4 tests land: PASS.

Full verification:

```
npm run test:run -w server -- src/compiler/resolution/eligibility          # unit: envelope, evaluator, propagation, catalog-shape, tier-legality
npm run test:run -w server -- src/compiler/resolution                       # engine integration incl. existing goldens
npm run test:run -w server -- src/resolve                                   # spine/conformance unchanged-green
npm run test:run -w server -- -t "elig-ac"                                  # the four AC behavior tests by tag
npm run typecheck -w server                                                 # exit 0 at baseline (AS-LANE2-OPTIONBIND-TSC-BASELINE-0)
```

AC → test mapping:

| AC (verbatim §4) | Test | Where | Mechanism proven |
|---|---|---|---|
| approximate-level local does NOT suppress exact demanded-level remote (review-interaction spine call) | `elig-ac1-suppression.test.ts` | compiler/resolution/eligibility | fake local provider yields tier-1 concept-level candidate; fake vendor/tier-3 provider yields exact demanded-level candidate; policy: concept candidate sufficient-to-suppress FAIL/INCOMPLETE ⇒ engine loop continues, clarification payload contains the remote candidate, suppression verdict trace present |
| physical-instance requests never fire vendor tier | `elig-ac2-tier-legality.test.ts` | compiler/resolution/eligibility | demanded.referentLevel=instance ⇒ policy-resolved legal tiers exclude {3,4}; a vendor provider spy is asserted ZERO calls in the review-interaction call path; noneIn disjointness over tierLegality data |
| catalog-shaped token elicits vendor scope, never fabricates identity | `elig-ac3-catalog-scope.test.ts` | compiler/resolution/eligibility | token `15400021` + no named vendor ⇒ reason `vendor-scope-unknown` clarification, bind FAIL, no candidate minted/labelled with an invented vendor; shape regex read from DATA (test mutates the fixture pattern and the behavior follows — the anti-hardcode proof) |
| missing-evidence candidate evaluates INCOMPLETE not MATCH | `elig-ac4-incomplete.test.ts` | eligibility/evaluate | envelope lacks relationshipEvidence/completeness flags ⇒ every dependent predicate INCOMPLETE with named-path reason; not(all(…)) propagation case included |
| offline compilation byte-stable against accepted refs, no network in compiler path | `elig-ac5-offline-byte-stable.test.ts` | compiler (pattern: realizationGolden + REPLAY fetch-stub) | throwing globalThis.fetch stub, blocked-call counter must be 0, compile a draft against accepted refs twice, deepStrictEqual byte-equal; existing goldens unchanged |
| npm run typecheck -w server at baseline | command above | — | exit 0 |

## §13 Decisions (D-numbered, for the coder prompt)

- **D1 — Three-state via requires/assert pairing, zero DSL op changes.** Rejected: (a) new `incomplete` op (interpreter change + schema churn + r2 boundary breach); (b) boolean with sentinel values (collapses P8 honesty).
- **D2 — Enrichment seam = existing POST /resolve (localOnly body field already present); verdicts computed locally.** Rejected: new /enrich endpoint (second resolution path = "one resolution path, one answer" breach); engine reaching remote in compile (P6 breach).
- **D3 — Neither compile wiring moves.** The engine spine adapter (localOnly:true) and compileOntologyResolver (localOnly:false, best-effort OLS4) BOTH stay byte-identical; P6 forbids touching either without an explicit r3. The harvest's "compiler path is remote-blind by construction" claim is true of the ENGINE's spine adapter only — the ontology-tier resolver has always been remote-best-effort; do not let a "cleanup" merge them.
- **D4 — Tier legality is enforced at the review-interaction request construction (which opts the caller passes to the existing spine) + as eligibility predicates over returned candidates; ResolveSpine's tier-list construction gains NO domain branch.** If a hook into ResolveSpine is used at all it is a generic `allowedTiers?: number[]` pass-through option (data in, filter out) — pre-verify the option plumbing; if it adds domain knowledge to the spine, drop the hook and filter verdicts in the caller (decision rule for the coder, both acceptable, report which).
- **D5 — campaignMode is a policy-data key with a single ratified default `planning` this task; absent mode ⇒ default.** Time-phase (P5) wiring to execute/retrospective arrives with PANEL/CHAIN surfaces; building a mode system here is scope creep. [DEFAULT-PENDING-RATIFICATION: Q1/P5]
- **D6 — candidateFact payload gains tier/referentLevel/eligibility additively (M2/M5 fix at the data layer).** Rejected: re-reading the store at render time (H3's current derivation path — payload must state its own facts, P1).
- **D7 — levelFilter keeps its well-ready job; the drop becomes traced verdicts; allowed-set job is new data [Q1].** Rejected: deleting the filter (breaks goldens + well-ready physics); moving the drop into TS policy branches (P8 breach).

## §14 OPEN QUESTIONS (orchestrator rules at promotion; the coder never improvises)

- **OQ-1 — referentLevel source for vendor-product candidates.** The spine's `MaterialLevel` union is `concept|spec|instance|aliquot|unknown` — NO vendor-product member (resolve/types.ts:14, verified); provider hits for vendor products arrive `level: unknown` (harvest H3: VPR candidates level unknown/concept). My stance (in spec): the eligibility fact-builder derives `candidate.referentLevel` from the candidate's OWN record kind / ref-type through materialLayerOf's existing alias table when the candidate carries a local record ref; remote hits with no ref keep `unknown` ⇒ bind predicates go INCOMPLETE (honest). Rejected alternatives: (a) extend MaterialLevel with 'vendor-product' (touches the shared spine type + conformance suite, wider blast radius than ELIG warrants); (b) infer level from tier===4 (tier-as-truth = the exact defect class). Checked: resolve/types.ts, ResolveSpine.ts toCandidate, materialRefFields alias table, harvest H3.
- **OQ-2 — campaign mode vocabulary.** No campaign-mode concept exists in code today (grep: only vocabulary `ambiguity.mode: clarify` and surface ids; surfaces list `workspace.deck`). My stance: D5's default `planning` + data keys. Rejected: surface-inference (third-party audit: surface is a default, never authority). Checked: grep mode/surfaces across server/src, schema, config/drafting.
- **OQ-3 — REPLAY dependency discharge.** deps list MATRES-REPLAY, which is in-progress with ONLY the MATRES-0-deferred worksheet legs open; the harvest leg (this spec's substrate) is merged. Handoff l2t0115 explicitly routes this call to the orchestrator at promotion. My recommendation: harvest-merged state discharges ELIG's dep (this spec consumes exactly the harvest; worksheet legs feed PANEL/ratification). Ruling needed: mine, not the coder's.
- **OQ-4 — clarification fact-shape change blast radius on ANSWER-BIND/OPTIONBIND consumers.** Adding fields to candidate facts is additive, but `ClarificationPicker answerFromMention` idioms read `{label, confidence, ref}`; my stance: additive spread can't break readers, but the coder must run the app-side option-bind goldens (`npm run test:unit -w app` scoped) even though app is out of the write scope — if a reader validates payload shape exactly (additionalProperties), STOP and route back. Checked: resolutionEngine.optionRef.test.ts exists; app-side picker not individually audited (deliberate: coder's targeted run is cheaper than my recon).

## §15 Scout-recon record — first-hand verified vs scout-screened

Scout screening file: `.hermes/plans/2026-10-19_matres-elig-scout-screening.md` (3 claims). ALL THREE re-verified first-hand by me before citation: band filter at resolutionEngine.ts:224-226 (`tier!==5 && confidenceOf in [band.min,band.max]`) ✓; ResolveSpine.ts:188 `localOnly ? tiers.filter(spec=>!spec.remote) : tiers` ✓ (line 188 exactly, verified in context of resolve()); vocabulary policies.ambiguity.confidenceAccept {0.7,1} + strategyRef symbolic_label ✓ (seen via sed of the policies block). The scout's line cite "entry resolveScientistIntentNouns :341" was NOT independently confirmed (I verified resolveNoun at :163 and the loop structure); treat :341 as approximate.

Additional FIRST-HAND verification beyond the scout (this spec's own recon): PredicateEvaluator full op inventory (incl. PROTO-AI-3 allIn/noneIn/everyItem semantics + vacuous-pass law, :443-500); lint-v1.schema.yaml op definitions :140-392 including `compare`; materialRefFields.ts symlink confirmed (`ls -la` — lane symlink into Brad's main tree, trunk-hygiene carried), LAYER_ALIASES + WELL_READY_LAYERS tables read; TIER_BASE {0:1.2,1:1.0,2:0.8,3:0.6,4:0.4,5:0.05} at ResolveSpine.ts:40 + levelBonus 0.03 at :232 ⇒ the harvest's 0.58 tier-4 max reproduces arithmetically; DEFAULT_LIMIT=20 at :43 and the head-cut slice at :222; compileResolver.ts:35-44 localOnly default **false** and server.ts:824-826 explicit `localOnly:false` (the one nuance where the scout/harvest framing needed correction — see D3); adapters.ts:76-84 spine adapter localOnly:true verbatim; resolveDraftMaterials LOCAL_TIERS-first wholesale remote drop (:44, :170-186) named as suppression root #2; ResolveHandlers body.localOnly optional (review seam D2); vocabulary.ts ScientistIntentArgContract slots + cached-singleton load (:48, :269-280); nounShape per-call load (resolutionEngine.ts:262 + comment); lint DSL-only law header of scientist-intent-vocabulary.lint.yaml; task-list lines 10420-10620 (campaign header P1-P8 + MATRES-ELIG block) read verbatim; harvest report, memo r1, r2 and r3 audits read in full; handoff l2t0115 read; ATTEST merge stat (46c3e4e9, 13 files) confirms AttestationSchemas.test.ts triplet pattern precedent. Scout output was used for orientation only; every line cited in this spec carries a first-hand read.

EXIT SUMMARY
- Path: /home/brad/.hermes/cl/lanes/2/specs-draft/2026-10-20_0155-MATRES-ELIG-acceptability-policy-spec-DRAFT.l2t0115.md
- Sections: 15
- Open questions: OQ-1 referentLevel source for vendor-product candidates (derive via materialLayerOf alias table; spine enum untouched); OQ-2 campaign mode = policy-data key with default 'planning', no mode system; OQ-3 whether REPLAY harvest-merged state discharges ELIG's dep (recommendation: yes; orchestrator's call per handoff); OQ-4 clarification payload additive-shape risk to app-side option-bind goldens (coder runs app unit suite scoped; halt if a strict-shape reader exists).
