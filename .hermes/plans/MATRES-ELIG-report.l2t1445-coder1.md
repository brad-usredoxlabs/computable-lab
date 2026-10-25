# MATRES-ELIG — LANE 2 coder report (l2t1445-coder1)

Item: MATRES-ELIG (material-resolution acceptability policy)
Branch: cl/lane2-matres-elig-l2t1445 (off trunk tip 6f8fb519, includes merged MATRES-RECV)
Worktree: /mnt/vast/home/brad/git/wt/matres-elig-lane2-l2t1445
Spec (acceptance authority): /mnt/vast/home/brad/git/cl-integration-2/.hermes/plans/2026-10-20_0230-MATRES-ELIG-acceptability-policy.md
Task block: /home/brad/.hermes/cl/lanes/2/task-list.md `id: MATRES-ELIG`

## 0. What was built

Three-way material eligibility as DATA, evaluated through the shipped predicate DSL,
disclosed additively on clarification candidates, with the compilation clamp intact.

New policy triplet (spec §6, Attestation pattern):
- schema/scientist-intent/material-eligibility/material-eligibility.yaml — the policy data:
  referentLevels [concept, formulation, vendor-product, instance, aliquot], identityLevels,
  spineTiers/remoteTiers/custodyNeverTiers/identityOnlyTiers, catalogShape patterns,
  spineLayerValues (verified against merged LAYER_ALIASES), and the three data-declared
  outcome policies: eligible-to-DISPLAY / sufficient-to-SUPPRESS / authorized-to-BIND,
  each `when`-guarded so missing evidence => INCOMPLETE (never a silent pass).
- schema/scientist-intent/material-eligibility/material-eligibility.schema.yaml — Ajv
  structural authority (meta-schema): referent-level enum, verdict trio, tier inventories,
  catalogShape pattern list, bindIncompleteReason, spineLayerValues.
- schema/scientist-intent/material-eligibility/material-eligibility.lint.yaml — lint-v1
  rules E1–E10 bound by schemaId (no cross-tree leakage): tier inventories are declared
  spine tiers, custody tiers ⊆ never-bind, identityLevels ⊆ referentLevels, verdict trio
  well-formed, catalogShape patterns compile, etc.

New engine-side modules (owned set, server/src/compiler/resolution/eligibility/):
- policy.ts — loads + Ajv-validates + lint-runs the triplet (loadMaterialEligibility /
  loadMaterialEligibilityIfPresent); exposes bindIncompleteReason.
- facts.ts — builds the adapter-exposed declared-fact envelope per (candidate, arg
  contract): candidate tier, derived referentLevel (OQ-1 seam: local record refs derive
  from the candidate's own termKind via the existing LAYER_ALIASES table; remote hits
  stay 'unknown' — no fabricated vendor-product level), demanded level + allowedDeclared
  discriminator (absent vocabulary `levels` is a DECLARED unconstraint, not missing
  evidence), identityOnlyTiers/custodyNeverTiers, catalogShape.
- evaluate.ts — runs the three data-declared policies via the shipped
  PredicateEvaluator.evaluatePredicate; missing evidence => INCOMPLETE.
- reviewInteraction.ts — the enrichment seam: the review-interaction spine call with the
  remote clamp LIFTED (localOnly: false) against the EXISTING ResolveSpine; compilation
  never calls it.

Engine wiring (owned set):
- resolutionEngine.ts — EligibilityRun per candidate; candidate disclosure rides the
  clarification payload ADDITIVELY (label/reason/confidence/ref and candidate ORDER
  unchanged; new optional tier/referentLevel/eligibility{display,suppress,bind,policyIds});
  AC-3 gate: a catalog-shaped token (policy catalogShape patterns) with no declared vendor
  scope elicits vendor-scope clarification instead of fabricating product identity.
- resolveNounsPass.ts — optional eligibility policy dependency (loads the shipped triplet
  via loadMaterialEligibilityIfPresent; absent => engine runs without disclosure).
- types.ts — additive optional disclosure members on ClarificationCandidateFact +
  vendor-scoped identifier disclosure member.

Vocabulary (owned set):
- scientist-intent-vocabulary.yaml — arg-contract slots `levels` / `preferred` /
  `hintEligible` / `hintAuthority` (memo Q1 ratified declaration for add_material.material:
  levels [concept, formulation, vendor-product, instance], preferred concept = plan-phase
  default) and top-level `referentLevels` (the single canonical local term list — NEVER
  two local terms for one entity; cross-document identity pinned by test).
- scientist-intent-vocabulary.lint.yaml — P6: `preferred ∈ levels` (item-relative,
  probe-verified against the shipped PathResolver). P7/P8 experiment documented as a
  probe-verified boundary note: the shipped PathResolver does NOT flatten multi-level
  wildcard selections (verbs[*].args[*].levels selects nested arrays), so canonical
  referent-level membership for vocabulary slots rides the meta-schema enum (Ajv is the
  structural authority), not a DSL membership rule.
- scientist-intent-vocabulary.schema.yaml — arg-contract slots declared structurally.

## 1. Spec §16 promotion rulings honored

- OQ-1 as-stanced: NO vendor-product member added to the MaterialLevel union
  (server/src/resolve/types.ts:14 verified unchanged vs merged tree). Remote/vendor hits
  arrive level 'unknown'; facts.ts derives candidate referent level from the candidate's
  own termKind via the existing LAYER_ALIASES table for local record refs and refuses to
  fabricate a level for remote hits.
- OQ-2 as-stanced: disclosure is additive on the engine clarification payload only; the
  wire schema (schema/workflow/scientist-intent.schema.yaml) unresolved items drop
  candidates (SPINE-1 ruling) and were NOT touched.
- OQ-3 ruled: the REPLAY harvest leg DISCHARGES the golden-candidates dependency — no
  harvest work done here; goldens updated only where the payload shape is byte-pinned
  (declared pin updates, §7.4.4).
- OQ-4 as-stanced: halt-gate verified — the app-side option-bind/clarification unit
  suites (ClarificationPicker, ProtocolLocalizationThread.optionbind,
  clarificationAdapter) pass 29/29 with the additive disclosure present; no strict-shape
  reader rejects the extra optional members (server-side roundTrip + answeredBinding
  handler legs also green). CompileContracts.ts:83 ("scientist must answer structured
  clarifications before any artifact exists") remains unweakened: nothing binds while a
  clarification is open.
- P6 clamp: localOnly STAYS for compilation (compileResolver.ts untouched); enrichment
  runs only in reviewInteraction.ts against the existing spine; no network in the compiler
  path (AC-5 proves byte-stability with a fetch stub + double run).

## 2. Cited-surface verification vs MERGED tree (spec §16)

- MaterialLevel union (server/src/resolve/types.ts:14): verified; NOT extended (OQ-1).
- LAYER_ALIASES (server/src/ai/materialRefFields.ts:66): verified present. DRIFT NOTE:
  the merged table has NO 'spec' key — a spine level 'spec' normalizes to 'material' via
  the materialLayerOf fallback. Recorded here, not silently re-derived; policy data
  spineLayerValues declares only spellings the merged table actually maps.
- resolveDraftMaterials LOCAL_TIERS-first (server/src/ai/ resolve site ~:170-186):
  verified present; untouched (outside owned set, no change needed).
- server/src/ai/materialRefFields.ts was ABSENT from the fresh worktree (lane-standard
  untracked file every lane carries) and was RESTORED as a symlink to the main tree —
  NOT edited.

## 3. Memo hash note (spec §10 silent-ratify discipline)

Spec cites contracts-memo-r1.md sha e8d81658…; the memo on disk hashes
94532da0010b558040f24c48ae9f34340198beae1d90a29d3a6f8f0c507a7169. The memo was amended
after spec authoring; the
LANE 2 task-list ratifies the amended memo (Q1 ratified declaration matches the shipped
vocabulary data). No silent re-derivation: recorded here.

## 4. Tests (RED-first, then green)

AC suites (server/src/compiler/resolution/eligibility/):
- elig-ac1-suppression.test.ts — approximate-level local candidate does NOT suppress the
  exact demanded-level remote candidate in the review-interaction spine call.
- elig-ac2-tier-legality.test.ts — physical-instance requests never fire vendor tier
  (custodyNeverTiers); honest OQ-1 outcomes (remote-no-ref => INCOMPLETE).
- elig-ac3-catalog-scope.test.ts — catalog-shaped token elicits vendor scope rather than
  fabricating product identity.
- elig-ac4-incomplete.test.ts — missing evidence => INCOMPLETE, never MATCH/silent pass
  (incl. declared-empty vs missing distinction: `exists` guards, not `nonEmpty`).
- elig-ac5-offline-byte-stable.test.ts — offline compile byte-stable, no network (fetch
  stub + double run + fixture-policy swap proves policy-driven, not hardcoded).
Fixtures: __fixtures__/material-eligibility-noshape.yaml, -nodisplay.yaml, -custody0.yaml
(anti-hardcode proofs: swapping policy DATA flips outcomes).

Schema contract suite: server/src/schema/MaterialEligibilitySchemas.test.ts (Attestation
pattern): Ajv accepts the shipped policy, rejects malformed variants; lint E-rules fire
against the eligibility schemaId only; cross-document identity: vocabulary referentLevels
and eligibility referentLevels are the SAME set (set-diff pinned).

## 5. Declared byte-pin updates (spec §7.4.4: goldens updated ONLY where the payload
shape is byte-pinned)

- server/src/compiler/scientistIntent/goldens/MANIFEST.yaml — treeState vocabulary pin
  re-blessed once: aa57f2e3627ab828d2b7b3180ac04b303cc0989520c6ef087ba3a151ea25a73c ->
  32c5b5b17fc8f38bb8e108db61b8336887a7270bafb079cdde221bebb7af3ba5 (delta = the MATRES-ELIG
  arg-contract declaration slots only; verified by hashing 6f8fb519's copy vs the working
  copy). ambiguous-material record pin 5fc65b92754633b95a6b5b81a4803bcf3abbe6f0852a8584a82df0d2b82e5f46
  -> 16c388936697f25ca1f351bdd00b6fd27ab5776aac0523c557b3335aab01586d (re-blessed through the
  real replay kernel; one-off bless writer NOT committed).
- server/src/compiler/scientistIntent/goldens/__records__/ambiguous-material.golden.json
  — re-blessed (candidate disclosure is additive payload).
- server/src/compiler/scientistIntent/goldens/goldenIntentToClarification.test.ts —
  inline candidate literal pin.
- server/src/compiler/scientistIntent/vocabulary.test.ts — lint rule-id list pin (P6) +
  schema-loader entry-count pin (new triplet schemas).
- server/src/api/handlers/IntentCompileFromPromptHandlers.answeredBinding.test.ts —
  clarification-payload candidate pin gains the additive disclosure (verified by
  execution, strict toEqual, 7/7).

## 6. Deviations (recorded, not silent)

1. schema/scientist-intent/material-eligibility/* (new triplet) — outside the task block's
   owned list, MANDATED by spec §6 file plan (policy must live in YAML/data; the triplet
   is the item's deliverable). Justification: spec is acceptance authority.
2. server/src/compiler/scientistIntent/vocabulary.ts — loader must carry the new declared
   arg-contract slots (RawArg + mapping) or the vocabulary DATA declarations are inert.
   Minimal additive change; no policy logic in TS.
3. Byte-pin updates listed in §5 (several outside the owned set) — sanctioned class per
   spec §7.4.4; each carries an inline MATRES-ELIG declared-pin comment.
4. server/src/ai/materialRefFields.ts — restored as lane-standard symlink (was absent in
   the fresh worktree); NOT edited.
5. Lane environment replication (lane-standard untracked files + config.yaml +
   info/exclude from the lane-exclude list) was required to make the baseline comm exact;
   these are untracked environment files, not source edits.
No files under server/src/receiving/, server/src/drafts/, schema/lab/* were touched
(MATRES-RECV off-limits respected).

## 7. VERDICT

Suites run (exact outputs):

1. RED-first AC suites (eligibility/, written RED before the wiring):
   `npx vitest run src/compiler/resolution/eligibility`
   - elig-ac1-suppression (2), elig-ac2-tier-legality (3), elig-ac3-catalog-scope (4),
     elig-ac4-incomplete (6), elig-ac5-offline-byte-stable (3) = 18/18 pass.
   - MaterialEligibilitySchemas.test.ts (schema+lint contract, cross-document identity
     set-diff pin) = 9/9 pass.
2. `npx vitest run src/compiler/resolution src/compiler/scientistIntent src/resolve`
   (exact): `Test Files  45 passed (45)` / `Tests  457 passed (457)`.
   `npx tsx scripts/golden-replay.ts` (exact): `37/37 checks passed`.
3. `npm run test:run -w server -- run src/compiler/resolution src/resolve
   src/compiler/scientistIntent src/api/handlers/IntentCompileFromPromptHandlers.answeredBinding.test.ts
   src/api/handlers/IntentCompileHandlers.roundTrip.test.ts
   src/schema/MaterialEligibilitySchemas.test.ts src/drafts`
   (exact): `Test Files  4 failed | 83 passed (87)` / `Tests  3 failed | 764 passed (768)`.
   The 4 failing files (FixtureRunner, ProtocolFoundryCompileRunner, ExecutionRunService,
   initializeApp.extractionRunner) are ALL in the 88-file baseline set with BYTE-IDENTICAL
   failure text vs the baseline raw (/tmp/elig-base5.raw) — pre-existing trunk debt, zero
   new.
4. App-side OQ-4 halt-gate scoped run (ClarificationPicker +
   ProtocolLocalizationThread.optionbind + clarificationAdapter): 29/29 pass; the additive
   disclosure breaks no strict-shape reader; the halt gate (structured clarifications
   answered before any artifact) is unweakened.
5. `npm run typecheck -w server` (exact): `> tsc --noEmit` — TYPECHECK_EXIT=0.
6. Full suite vs baseline (exact):
   run-1 (pre-pin-fix, probes still present): 93 failed files; NEW set = 2 leftover probe
   files (deleted) + 1 declared pin (answeredBinding, fixed) + 2 load-timeout flaps
   (Wave2NamingCrosswalk `Test timed out in 10000ms`, ZymoCampaignGoldenE2E — both PASS
   22/22 in isolation; known load-timeout flap class).
   final run (exact): `Test Files  88 failed | 693 passed | 9 skipped (790)` /
   `Tests  99 failed | 6494 passed | 70 skipped (6836)` (baseline: 88 failed | 687 passed |
   9 skipped (784) / 99 failed | 6467 passed | 70 skipped (6809) — +6 files, +27 tests are
   this item's new suites).
   comm vs /tmp/elig-baseline.sorted AND vs /tmp/b.sorted (88 files each):
   NEW empty, GONE empty.

Typecheck exit: 0.
Baseline comm result: NEW empty / GONE empty (88 = 88, identical file sets).

Deviations (all recorded in §6, none silent): new policy triplet under
schema/scientist-intent/material-eligibility/ (spec §6 file plan mandates it);
vocabulary.ts loader carries the new declared slots; declared byte-pin updates in
vocabulary.test.ts, MANIFEST.yaml, ambiguous-material.golden.json,
goldenIntentToClarification.test.ts, answeredBinding.test.ts (spec §7.4.4 class);
materialRefFields.ts restored as lane-standard symlink (not edited); lane environment
replication (untracked env files, not source).

Files touched outside the owned set: the §5/§6 list above — every one is a spec-mandated
new file, a declared byte-pin update, or environment restoration. NO file under
server/src/receiving/, server/src/drafts/ (source), schema/lab/*, or the wire schema was
modified. server/src/resolve/* was inspected but NOT modified (OQ-1 as-stanced: the
MaterialLevel union stays unchanged).
