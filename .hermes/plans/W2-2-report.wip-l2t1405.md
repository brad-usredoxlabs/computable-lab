# W2-2-QUANTITY-CONSTRAINTS — coder report (wip-l2t1405)

Lane 2, cl-coder. Spec: .hermes/plans/2026-10-09_1130-W2-2-quantity-constraints-spec.md
(promoted). Task block: lanes/2/task-list.md id W2-2-QUANTITY-CONSTRAINTS.

## 0. Base + ancestor proofs

- Worktree: /mnt/vast/home/brad/git/wt/W2-2-lane2-l2t1405
- Branch: W2-2-lane2-l2t1405
- Base sha (`git -c core.fileMode=false rev-parse HEAD` at creation):
  a1cb8a4a564063a2c4dd46d20f3196e6da1e2a43
  (trunk cl/integration-2 tip at claim = docs commit atop the SPINE-8 merge 2c841760).
- Ancestor proofs (run at claim on trunk, all exit 0):
  - `git merge-base --is-ancestor 86357319 HEAD` -> 86357319 IS ancestor (SPINE-7 merge)
  - `git merge-base --is-ancestor cdfdc56c HEAD` -> cdfdc56c IS ancestor (W2-1 merge)
  - `git merge-base --is-ancestor 1fc239cf HEAD` -> 1fc239cf IS ancestor (SPINE-8 coder tip;
    merge commit 2c841760 likewise ancestor of a1cb8a4a)
- Lane bootstrap: trunk's 107 untracked/ignored entries replicated 1:1 (symlinks as
  symlinks: node_modules, app/node_modules, server/node_modules, server/schema -> trunk
  schema dir). Parity proof: `comm -3` of `git -c core.fileMode=false status --porcelain
  -uall --ignored=matching` (trunk vs worktree) shows ONLY
  .hermes/plans/2026-10-09_1305-W2-3-protocol-semantic-upgrade-spec-DRAFT-l2t1251.md
  (a trunk docs stray created after my snapshot — not copied, not needed). Per-worktree
  core.excludesFile set to /home/brad/.hermes/cl/lanes/2/lane-exclude-W2-2-l2t1405.

## 1. Baselines re-measured on MY base (SET identity)

- src/schema+src/lint fail-file SET: `npx vitest run src/schema src/lint` at base ->
  2 failed files / 5 failed tests / 40 passed / 5 skipped (47 files, 527 tests).
  Capture /tmp/l2t1405-ff.txt:
    src/schema/EventGraphEquipmentSchema.test.ts
    src/schema/LabwarePhysicalGeometryData.test.ts
  `comm -3 <(grep -oE 'FAIL  src/[^ ]+' /tmp/l2t1251-failfiles-schema-lint.txt | sed 's/FAIL  //' | sort -u) /tmp/l2t1405-ff.txt`
  -> EMPTY (exit 0). SET identity holds vs the orchestrator capture.
- server tsc: `npm run typecheck -w server | grep 'error TS' | sed 's/([0-9]*,[0-9]*)//' | sort`
  -> /tmp/l2t1405-tsc-server-base.txt = 26 lines / 14 error-line groups across 6 files
  (AgentOrchestrator, ProtocolIntakeHandlers, RecordHandlers, AuthoringGuard,
  bootstrapAdmin, RecordStoreImpl). `comm -3 /tmp/l2t2230-tsc-server.txt
  /tmp/l2t1405-tsc-server-base.txt` -> EMPTY (exit 0). Non-zero tsc exit BY DESIGN.

## 2. Trunk-drift deltas read at claim (§6.12)

(merged files READ before any write; merged trunk wins over the draft)
- wave2-naming-crosswalk.yaml (merged, 261 lines): entry keys are
  term/status/binds_to/curie_plan/source_decision/note. Quantity entry at :126-140:
  status `missing-datatype`, binds_to.planned_schema =
  schema/core/datatypes/quantity.schema.yaml, curie_plan cf:quantity (OQ1 RATIFIED by
  merged data). `constraint-classes` entry at :161-165: status
  `new-vocab-pending-admission`, curie_plan cf:constraint-class. 7 entries carry
  new-vocab-pending-admission (4 provenance rungs W2-4 + constraint-classes + ...).
  admission section :238-261: rules resolves-through-crosswalk / no-collision (namespaces:
  record-kind, operation-id, scientist-intent-verb, verb-definition-canonical,
  verb-action-map-verb) / curie-plan pattern ^cf:[a-z0-9][a-z0-9-]*$. forbidden_kinds
  (:168-179) already lists `constraint-class` and `quantity` — my vocabulary must NOT
  mint a record kind named either.
- DELTA vs draft §2.F: the draft assumed a status `admitted` flip. The merged admission
  test (Wave2NamingCrosswalk.test.ts:134) treats only `new-vocab-pending-admission` and
  `missing-datatype` as NEW (collision+CURIE enforced); `existing`/`missing-datatype`
  entries resolve via rule 1. Disposition: flip Quantity `missing-datatype` -> `existing`
  (datatype now lands) and constraint-classes `new-vocab-pending-admission` -> `existing`
  (vocab now minted), mirroring the merged entry keys exactly; new minted nouns enter as
  `existing` with schema paths (they resolve through the crosswalk; collision+CURIE were
  enforced at minting time in my own admission test BEFORE the flip — see §6).
- DELTA vs draft §2.4: draft said "mirror operations.yaml's style — kind:
  constraint-vocabulary". Merged crosswalk forbidden_kinds includes `constraint-class`
  and `quantity`; the crosswalk test enumerates `properties.kind.const` across ALL
  *.schema.yaml. Disposition: the vocabulary DATA doc carries `kind:
  constraint-vocabulary` as a plain registry-doc field (like operations.yaml's
  `kind: operation-registry` — NOT a properties.kind.const in any .schema.yaml, so it
  never enters the record-kind namespace); constraint.schema.yaml is a pure datatype
  with NO kind const.
- DELTA vs draft §2.6: draft assumed the vocab doc needs a $id for the lint schemaId
  binding. Merged precedent (scientist-intent-vocabulary.yaml has NO $id; its lint binds
  to vocabulary.schema.yaml's $id; resolveNounsPass.test.ts copies schema+lint pair and
  lints the doc) — disposition: ship constraint-vocabulary.schema.yaml (structural
  authority for the doc, registered) + lint bound to its $id; the doc itself stays
  $id-less registry data like operations.yaml.
- scientist-intent-vocabulary.lint.yaml READ (158 lines): P-family shape copied
  (lintVersion/schemaId header, when+assert, everyItem/allIn/any/not nesting, message
  template). Existing lint rule ids enumerated across schema/**/*.lint.yaml — no
  `constraint-vocab-*` collisions.
- Collision namespaces enumerated from merged data (for my minted nouns):
  operation-ids: create_container add_material transfer incubate mix read centrifuge
  load_plate set_well_contents wash seed harvest elute resuspend dilute stain fix
  permeabilize block quench count label transfect passage freeze thaw aliquot;
  verb canonicals: autoclave heat incubate microwave read rock set shake sonicate stir;
  verb-action-map: 26 verbs incl. count/label/dilute. => bare `count` COLLIDES
  (operation-id + verb-action-map-verb). Disposition: dimension nouns enter the
  crosswalk qualified (`quantity-dimension-count` etc., cf:quantity-dimension-*);
  the bare word `count` is NEVER proposed as a new wave-2 term — it is an existing
  operation id reused as a unit spelling context. Recorded as a finding (W2-2-F1).

## 3. RED capture (§4.1) — tests written first, schemas absent

`npx vitest run src/schema/Wave2QuantitySchema.test.ts src/lint/Wave2ConstraintVocabularyRules.test.ts`
(at base, before any YAML landed):
    Test Files  2 failed (2)
          Tests  28 failed | 13 passed (48)
(capture /tmp/l2t1405-red.txt; the 13 "passes" are the arms that assert only
fixture-shape truths independent of the missing schemas — every registration,
datatype, vocabulary and lint-firing arm RED.)

## 4. §4.2 FIRST TARGETED CHECK (right after the two datatypes landed)

`cd <wt>/server && npx vitest run src/schema/integration.test.ts`:
    stdout | integration.test.ts > ... loads all schemas from schema/ directory
    Loaded 189 schemas
     ✓ src/schema/integration.test.ts  (9 tests) 4511ms
     Test Files  1 passed (1)
          Tests  9 passed (9)
(capture /tmp/l2t1405-firstcheck.txt — the whole-tree loader registered the new
`$id`s with no boot break; §6.6 blast radius closed before building on it.)

Then `npx vitest run src/schema/Wave2QuantitySchema.test.ts` after A+B:
5 failed | 20 passed (32) — the remaining REDs were exactly the constraint/
vocabulary/crosswalk arms awaiting C-F + G. After the vocabulary family landed:
    ✓ src/lint/Wave2ConstraintVocabularyRules.test.ts  (17 tests) 191ms
    ✓ src/schema/Wave2QuantitySchema.test.ts  (32 tests) 3577ms
    Test Files  2 passed (2)   Tests  49 passed (49)

Crosswalk leg (§4.5): `npx vitest run src/schema/Wave2NamingCrosswalk.test.ts
src/schema/integration.test.ts src/schema/ConcentrationFirstSchemaContract.test.ts`
    ✓ Wave2NamingCrosswalk  (6 tests)   ✓ integration  (9)   ✓ ConcentrationFirst  (11)
    Test Files  3 passed (3)   Tests  26 passed (26)
W2-1's admission test is BYTE-UNTOUCHED (not in the diff — see §7 name-only list)
and passes WITH my crosswalk additions present.

Whole scope (§4.4): `npx vitest run src/schema src/lint`
    Tests  5 failed | 518 passed | 53 skipped (576)   [base: 469 passed]
    fail-file SET == base capture (comm -3 EMPTY, exit 0):
      src/schema/EventGraphEquipmentSchema.test.ts
      src/schema/LabwarePhysicalGeometryData.test.ts
My tests only REDUCED failures (added 49 passing tests); no new failing file.

## 5. Boot-level duplicate-rule-ID probe (§6.4)

In-process probe (tsx, no :3093): loadAllLintSpecs over the real schema/ tree +
one LintEngine.addSpec for every non-empty spec:
    lint specs loaded=44 errors=2 added=23 emptySkipped=21 indexedRules=61
    constraint-vocab rules: constraint-vocab-class-policy-refs-declared,
    constraint-vocab-vendor-default-carries-policy, constraint-vocab-class-ids-unique,
    constraint-vocab-applicability-names-declared-class,
    constraint-vocab-constraint-classes-resolve,
    constraint-vocab-required-classes-present-well-state,
    constraint-vocab-constraint-dimension-laws,
    constraint-vocab-constraint-carries-declared-policy,
    constraint-vocab-binding-kind-policy-compatible
No `Duplicate rule ID` throw. The 2 loader errors (core/lab-state.lint.yaml,
workflow/local-protocol.lint.yaml "Invalid lint spec structure") are PRE-EXISTING:
the identical probe on trunk cl/integration-2 emits the identical 2 errors.

## 6. §5 commands — verbatim tails (all on final tip c1b7ad56)

1. PRIMARY SCOPE SET:
   `npx vitest run src/schema src/lint | grep FAIL | sed ... | sort -u > /tmp/l2t1405-ff-final.txt`
   `comm -3 /tmp/l2t1405-ff.txt /tmp/l2t1405-ff-final.txt` -> EMPTY (exit 0).
   Base capture itself matched the orchestrator pin /tmp/l2t1251-failfiles-schema-lint.txt
   (2 files) — see §1.
2. server tsc: `npm run typecheck -w server | grep 'error TS' | sed 's/([0-9]*,[0-9]*)//' | sort`
   -> 26 lines; `comm -3 /tmp/l2t2230-tsc-server.txt /tmp/l2t1405-tsc-server-final.txt`
   -> EMPTY (exit 0). Non-zero tsc exit by design; zero new TS errors from a
   data item (own test files additionally verified clean under a strict
   test-inclusive tsconfig: 0 errors after the c1b7ad56 hygiene commit).
3. app: `git -c core.fileMode=false diff --name-only <base>..HEAD -- app/` -> EMPTY.
4. zero production TS: `git -c core.fileMode=false diff --name-only <base>..HEAD -- server/src
   | grep -v '\.test\.ts$'` -> EMPTY (exit 1). The only server/src files in the
   diff are the two .test.ts files.
5. no vendor identity/numeric-shape in code: `git -c core.fileMode=false diff
   <base>..HEAD -- server/src ':!server/src/**/*.test.ts' | grep -inE
   'zymo|hepg2|hepatocyte|bead|beater|10000'` -> EMPTY (exit 1). The literal grep
   over ALL of server/src matches ONLY inside the two test files (fixture lines,
   quoted in the RED evidence trail) — the numbers live in YAML fixtures
   (constraint-vocabulary.yaml dimensionLaws/example_bounds) and test fixtures,
   never in production code.
6. OWNERSHIP: `git -c core.fileMode=false diff --name-only <base>..HEAD | grep -v -E
   '^schema/core/datatypes/quantity(-ratio)?\.schema\.yaml$|^schema/registry/constraint-vocabulary/|^schema/registry/wave2-naming-crosswalk\.yaml$|^server/src/(schema/Wave2QuantitySchema|lint/Wave2ConstraintVocabularyRules)\.test\.ts$|^\.hermes/plans/'`
   -> EMPTY (exit 1).
7. MANIFEST discipline: `git -c core.fileMode=false diff --name-only <base>..HEAD --
   server/src/compiler/scientistIntent/goldens/MANIFEST.yaml schema/scientist-intent/`
   -> EMPTY: MANIFEST.yaml and scientist-intent/** are BYTE-UNTOUCHED.

## 7. Crosswalk delta (§2.F / OQ3)

Merged entry keys FOUND in wave2-naming-crosswalk.yaml (read at claim, 261 lines):
`term / status / binds_to / curie_plan / source_decision / note` (binds_to is a
map with kind/schema/field/kind_line/... sub-keys). Statuses present: existing,
missing-datatype, new-vocab-pending-admission. Admission section (:238-261) names
namespaces record-kind / operation-id / scientist-intent-verb /
verb-definition-canonical / verb-action-map-verb and pattern ^cf:[a-z0-9][a-z0-9-]*$.

FLIPPED (2, mirroring the merged keys exactly):
- Quantity: status missing-datatype -> existing; binds_to.planned_schema ->
  binds_to.schema (+ ratio_schema, schema_line); curie_plan/source_decision kept.
- constraint-classes: status new-vocab-pending-admission -> existing; binds_to
  added (vocabulary/vocabulary_schema/vocabulary_lint/constraint_datatype paths).

ADDED (22 entries, all status existing + cf: CURIE + source_decision D6):
quantity-dimension-{count,volume,mass,molar}; quantity-ratio; quantity-qualifier;
constraint-class-{ratio,concentration,per_unit_dose,minimum,maximum,capacity,
threshold,ordering,completion_condition,vendor_default};
binding-kind-{vendor-default,hard-bound};
override-policy-{lab-may-relax,lab-may-tighten,never-override}; "bead beater".

OQ3 disposition (merged-trunk-wins, §6.12): the draft assumed an `admitted`
status flip; the merged admission test enforces collision+CURIE only for
new-vocab-pending-admission/missing-datatype terms. Minted nouns therefore enter
as `existing` (they resolve through the crosswalk — rule 1), and the admission
proof for them runs in MY test (Wave2QuantitySchema.test.ts admission leg: every
minted noun listed + cf: CURIE + zero collision against all five enumerated
namespaces) BEFORE the flip. W2-1's test file is untouched and green with my
additions present (26/26 across the three-file run above).

FINDING W2-2-F1 (new, carried for the architect): the bare dimension word `count`
COLLIDES with operations.yaml operation-id `count` AND verb-action-map verb
`count` (proven by test: the collision arm asserts both memberships true).
Dimensions therefore enter the crosswalk QUALIFIED (quantity-dimension-count,
cf:quantity-dimension-count) — a dimension noun is a different entity from the
count OPERATION and must not shadow it. Same reasoning kept `concentration`
classes qualified as constraint-class-concentration.

## 8. Per-file summary

- schema/core/datatypes/quantity.schema.yaml (NEW): $id mirrors amount.schema.yaml's
  convention; required [value, unit, dimension]; dimension enum
  [count, volume, mass, molar]; per-dimension CLOSED unit sets via JSON-Schema
  if/then allOf (count: cells/beads/wells/organisms/worms/CFU/colonies; volume:
  nL/uL/mL/L; mass: g/mg/ug/ng/pg; molar: M/mM/uM/nM/pM/fM — spellings reconciled
  with concentration.schema.yaml:16-38); value minimum: 0 (NOT exclusiveMinimum —
  §6.1); qualifier [exact, approximately_zero] (OQ2); additionalProperties false;
  description states no-arithmetic/no-conversion + dimension-preservation law +
  both forcing functions.
- schema/core/datatypes/quantity-ratio.schema.yaml (NEW): required [numerator,
  denominator], both $ref ./quantity.schema.yaml; optional basis_label/
  ratioed_label/rationale mirroring reference-ratio affordances; description names
  the load-bearing-vs-advisory adjudication (this is NOT reference-ratio, NOT
  operations.yaml's add_material).
- schema/registry/constraint-vocabulary/constraint.schema.yaml (NEW): the
  constraint object — class (pattern, closure via lint), bound (oneOf Quantity |
  QuantityRatio), subject (symbolic refs only: ref/role/kind + composed
  dimensionKey + bindingPolicyKey — the no-join encoding, §6.9), bindingKind enum
  [vendor_default, hard_bound], overridePolicy ref, capabilityRequirement riding
  ref.schema.yaml + CL: pattern (equipment-capability :44-57 style), provenance;
  unevaluatedProperties:false with allOf FAIRCommon (equipment-capability style).
  NO kind const (no new record kind). Not referenced by any shipped record schema.
- schema/registry/constraint-vocabulary/constraint-vocabulary.schema.yaml (NEW):
  structural authority for the doc (scientist-intent-vocabulary.schema.yaml
  precedent): kind is an ENUM not a const (deliberate — a const would mint a
  record kind the crosswalk forbids); classIds mirror (uniqueItems = Ajv duplicate
  arm); classes[] (curie ^cf:, boundShape, dimensionRule, allowedBindingKinds,
  defaultBindingKind, overridePolicy, example_bound); overridePolicies[];
  policyBindingKeys[]; profiles + profile-keyed requiredClasses; dimensionLaws[];
  applicability[]; capabilityTerms[] (CL:<snake> refs).
- schema/registry/constraint-vocabulary/constraint-vocabulary.yaml (NEW): the DATA
  doc — 10 class entries (8+1: ratio, concentration, per_unit_dose, minimum,
  maximum, capacity, threshold, ordering, completion_condition + vendor_default;
  the memo's minima/maxima split into two, crosswalk does not disagree), 3
  override policies (lab-may-relax / lab-may-tighten / never-override), 3 policy x
  bindingKind pairs, 7 dimensionLaws (cell_count:count, aspiration_volume:volume,
  bead_count:count, well_count:count, fill_volume:volume, dose_mass:mass,
  working_concentration:molar), profiles [well_state] + requiredClasses.well_state
  [minimum, threshold], applicability map for all 10 classes, capabilityTerms
  bead_beater -> CL:bead_beater.
- schema/registry/constraint-vocabulary/constraint-vocabulary.lint.yaml (NEW):
  lintVersion 1 + schemaId binding (scientist-intent-vocabulary.lint.yaml shape),
  9 DSL-only rules (exists/nonEmpty/equals/allIn/everyItem/any/all/not ONLY —
  §6.9), ids all constraint-vocab-* (§6.4), vocabulary arms guarded by
  `when: exists classes/classIds/applicability`, payload arms by `when: exists
  constraints` — one bound spec serves both docs.
- schema/registry/constraint-vocabulary/constraint-vocabulary.ui.yaml (NEW):
  uiVersion 1 + schemaId + display/form/list hints (derivation.ui.yaml precedent).
  Hints only — no app code, no gate.
- schema/registry/wave2-naming-crosswalk.yaml (EDIT): 2 flips + 22 additions (§7).
- server/src/schema/Wave2QuantitySchema.test.ts (NEW, 32 tests): registration arm;
  Quantity arms (aspiration pair, volume 0, negative, 3 dimension/unit mismatches,
  uncontrolled unit, missing dimension, bad qualifier, unknown dimension, unknown
  sibling, mass/molar spellings); QuantityRatio arms (5 beads/1 well, labels,
  cross-dimension representable, bare-number rejection = reference-ratio shape,
  missing denominator); Constraint arms (hard_bound, vendor_default ratio,
  CL:bead_beater capability, symbolic subject, unknown bindingKind, unevaluated
  sibling, bogus ontology ref); vocabulary arms (doc validates vs its schema; ALL
  10 classes instantiate DATA-DRIVEN from the YAML — no class list in TS;
  ratio dimensionRule same-dimension + per_unit_dose quantity-per-count proven as
  declared data; policy-ref closure); admission leg (minted nouns read from the
  shipped files, listed + cf: + zero collision; W2-2-F1 collision arm proven).
- server/src/lint/Wave2ConstraintVocabularyRules.test.ts (NEW, 17 tests): spec
  shipped/non-empty/prefixed/meta-schema-valid; no Duplicate rule ID alongside the
  scientist-intent spec; clean vocabulary doc -> ZERO findings; R1/R2/R3 arms fire;
  forcing-function fixtures (below); seam arm (same bound, different bindingKind ->
  different finding).
- .hermes/plans/W2-2-report.wip-l2t1405.md (this report).

## 9. §3 acceptance walkthrough — which fixture proves which clause

Verbatim clause 1: "all 8+1 constraint classes instantiate"
  -> Wave2QuantitySchema.test.ts "ALL 8+1 constraint classes instantiate": the
     class list AND each class's example bound are READ from
     constraint-vocabulary.yaml (classes[*].example_bound); each is validated
     against constraint.schema.yaml via Ajv. 10 entries (8 memo classes with
     minima/maxima split + vendor_default). No class names in TypeScript — the
     test iterates the data.

Verbatim clause 2: "dimension mismatches and uncontrolled units rejected"
  -> Quantity arms: {count, uL} rejected; {volume, cells} rejected; {molar,
     wells} rejected; {count, banana} rejected (uncontrolled unit); unknown
     dimension rejected. Enforcement is the per-dimension closed unit enum in
     quantity.schema.yaml (data), not code.

Verbatim clause 3: "HepG2 fixture — 10,000-cell count survives aspiration with
volume ~0, count never converted/erased"
  -> Schema side: {10000, cells, count, exact} AND {0, uL, volume,
     approximately_zero} both validate (volume EXACTLY 0 accepted — minimum: 0,
     the concentration exclusiveMinimum trap NOT repeated, §6.1).
  -> Lint side (Wave2ConstraintVocabularyRules.test.ts): hepG2Payload() passes
     with ZERO findings; MUTATION 'count-to-volume' FAILS
     constraint-vocab-constraint-dimension-laws (composed key cell_count:volume
     is not a declared dimensionLaw — the collapse is a DATA violation);
     MUTATION 'count-erased' FAILS
     constraint-vocab-required-classes-present-well-state (requiredClasses.
     well_state demands minimum + threshold). Non-vacuity proven (§6.2): the
     good case AND the failing mutations are both asserted.

Verbatim clause 4: "bead fixture — 5 beads/well as material count-per-well +
bead-beater equipment-capability requirement"
  -> Schema side: QuantityRatio {5, beads, count}/{1, wells, count} validates
     (same dimension, DIFFERENT units); constraint with
     capabilityRequirement {kind: ontology, id: CL:bead_beater, namespace: CL}
     validates (rides ref.schema.yaml + the existing CL:<snake> machinery — no
     fourth prefix, §6.11); bare-number ratio {1, 2.5} REJECTED (that is the
     advisory reference-ratio shape, §6.10).
  -> Lint side: beadPayload() passes with ZERO findings; the ratio class declares
     dimensionRule same-dimension as DATA (asserted from the vocabulary YAML).

Verbatim clause 5: "vendor defaults distinguishable from hard bounds with
lint-declared override policy"
  -> Vocabulary side: vendor_default class entry (allowedBindingKinds
     [vendor_default], overridePolicy lab-may-relax); R2 fires when a
     vendor_default class drops its overridePolicy (undeclared strictness).
  -> Payload side: R7 fires when a constraint lacks/undeclares its policy; R8
     seam arm: SAME 5-beads bound + SAME policy name, bindingKind flipped to
     hard_bound -> composed key lab-may-tighten:hard_bound is NOT a declared
     policyBindingKey -> constraint-vocab-binding-kind-policy-compatible fires,
     while the vendor_default arm passes. Different findings from DATA fields
     alone — no TypeScript branch (§6.3).

Verbatim clause 6: "No vendor identity or numeric-shape-guessing in code"
  -> §6 grep 5 EMPTY over non-test server/src; the only vendor-flavored strings
     (CL:bead_beater, 10000, 5 beads) live in YAML data + test fixtures. No
     `if (class === ...)` anywhere; no TS unit list; no per-vendor branch. The
     10000-as-volume mutation is caught by DATA (dimensionLaws), not by a
     numeric-shape heuristic.

Description clauses: "classes, applicability, override policy all in lint YAML"
  -> classes/applicability/policies are declared in constraint-vocabulary.yaml
     (data) and their WELL-FORMEDNESS + closure is the bound lint YAML (9 rules);
     "UI hints for later review surfaces" -> constraint-vocabulary.ui.yaml (hints
     only); "No compiler behavior yet — the contract only" -> zero production TS
     (§6 grep 4 EMPTY), nothing references constraint.schema.yaml from any record
     schema (W2-3 mounts it).

## 10. §6 reviewer-bait dispositions

- 6.1 zero trap: quantity value uses minimum: 0; concentration's
  exclusiveMinimum NOT copied; volume-0 arm asserted. concentration.schema.yaml
  byte-untouched (not in diff).
- 6.2 dimension collapse: count stays dimension count beside volume (both fields,
  no conversion); MUTATIONS asserted failing (dimension-laws + required-classes).
- 6.3 hardcode boundary: class names, unit sets, applicability, override policies,
  dimension laws, policy x bindingKind pairs ALL in YAML; zero TS policy; the
  instantiation test reads the class list from the YAML. Numeric-shape-guessing
  absent — the collapse arm is a declared-law membership check.
- 6.4 duplicate rule ID: all 9 ids constraint-vocab-* prefixed; boot-level probe
  (§5) adds all 23 non-empty specs into one LintEngine — no throw; whole src/lint
  scope green.
- 6.5 empty-spec silence: 9 rules shipped; clean-doc zero-findings test + 8 firing
  arms prove they FIRE.
- 6.6 loader blast radius: FIRST TARGETED CHECK (§4.2) green right after the two
  datatypes landed (189 schemas, errors []); whole-tree integration.test.ts green
  at final tip.
- 6.7 exactOptionalPropertyTypes: fixtures use conditional spreads only
  (`...(cls.overridePolicy !== undefined ? {...} : {})`, `...(roles !== undefined
  ? ...)` pattern per ProtocolLintRules precedent); no `undefined` values; own
  test files verified under a strict test-inclusive tsconfig (0 errors).
- 6.8 YAML-reload trap: zero stack interaction — all evidence is in-process
  vitest + one headless tsx probe; :3093/:5193/:3001/:5174 untouched.
- 6.9 DSL over-reach: rules use exists/nonEmpty/equals/allIn/everyItem/any/all/
  not ONLY. The DSL has NO collection joins, so cross-field laws (role->dimension,
  policy x bindingKind) are encoded as payload-carried composed KEYS checked by
  allIn membership against declared law lists — data-side composition, no DSL
  extension, no STOP needed. Recorded as a design note for W2-3 (if Brad wants
  join-free laws computed rather than composed, that is a DSL-extension item,
  not this one).
- 6.10 two-terms-one-entity: quantity-ratio description names which it is and
  which it is NOT (advisory reference-ratio coexists untouched; operations.yaml
  add_material untouched); class id `ratio` resolves through the crosswalk
  (constraint-class-ratio entry), does not shadow operations.yaml.
- 6.11 CURIE honesty: new vocab is cf: only; bead beater referenced via the
  EXISTING CL:<snake> equipment-capability machinery; no fourth prefix.
- 6.12 pre-deps drift: merged crosswalk + vocab lint READ at claim; deltas
  recorded in §2 (status-flip mechanics, registry-doc kind handling, $id-less
  data doc + separate meta-schema, scientist-intent triple precedent). Merged
  trunk won everywhere; no neighbor artifact edited (scientist-intent/**,
  MANIFEST.yaml, protocol.* triplet, amount/concentration/reference-ratio,
  equipment-capability, lint-v1 meta-schema all byte-untouched — §6 grep 7 +
  name-only list).

## 11. Commits + diff --name-only (base a1cb8a4a..HEAD)

- d83f8be6 feat(w22): datatypes + vocabulary + lint + UI hints + crosswalk + tests
- c1b7ad56 test(w22): own-file strict-tsc hygiene (final tip)

git -c core.fileMode=false diff --name-only a1cb8a4a..HEAD:
  schema/core/datatypes/quantity-ratio.schema.yaml
  schema/core/datatypes/quantity.schema.yaml
  schema/registry/constraint-vocabulary/constraint-vocabulary.lint.yaml
  schema/registry/constraint-vocabulary/constraint-vocabulary.schema.yaml
  schema/registry/constraint-vocabulary/constraint-vocabulary.ui.yaml
  schema/registry/constraint-vocabulary/constraint-vocabulary.yaml
  schema/registry/constraint-vocabulary/constraint.schema.yaml
  schema/registry/wave2-naming-crosswalk.yaml
  server/src/lint/Wave2ConstraintVocabularyRules.test.ts
  server/src/schema/Wave2QuantitySchema.test.ts
(10 files, +2084/-8; report lives at the trunk-checkout path
.hermes/plans/W2-2-report.wip-l2t1405.md per the lane deliverable convention —
untracked lane-synced plans dir, orchestrator promotes.)

## 12. Open items carried (not blockers)

- W2-2-F1 (crosswalk note + test arm): bare `count` collides with
  operation-id/verb-action-map `count`; dimensions qualified. Architect may want
  the same qualification review for future dimension-like nouns.
- 8+1 counting: shipped 10 class entries (minima/maxima split + vendor_default);
  merged crosswalk does not enumerate a competing count; crosswalk note records
  the split.
- DSL no-join encoding (composed keys) is the mechanism W2-3 inherits for
  payload-level law closure; if W2-3 wants computed joins, that is a separate
  DSL-extension item (not taken here — §6.9 forbids it in this item).
- Lane-stack restart (YAML landed) is the orchestrator's post-merge step; this
  worker never touched :3093/:5193.

## Fix cycle 1 (l2t1531)

Adversarial review review-W2-2-adversarial-l2t1531-c1.md: VERDICT fix, 2 defects.
Fix commit: e3756acd on branch W2-2-lane2-l2t1405 (atop c1b7ad56). 3 files,
+142/-15. No other scope touched.

### D1 [medium] — maximum's declared default pair vs the shipped seam lint — FIXED per orchestrator ruling

Coherent story adopted: a lab MAY TIGHTEN a maximum (fill-volume caps are always
tightenable by the biologist; relaxing is what policy forbids; a tightened hard
bound stays hard). Data changes in
schema/registry/constraint-vocabulary/constraint-vocabulary.yaml:
1. policyBindingKeys: ADDED "lab-may-tighten:hard_bound" (now 4 pairs). Surrounding
   comment documents the semantics: lab-may-relax pairs ONLY with vendor_default
   (relaxing a hard bound is never declared compatible); lab-may-tighten pairs with
   BOTH kinds (tightening never loosens); never-override pairs only with hard_bound;
   every class default pair MUST appear here (guarded by the new test).
2. overridePolicies[lab-may-tighten].allowedBindingKinds: [ vendor_default ] ->
   [ vendor_default, hard_bound ]; description expanded (tighten a vendor number OR
   tighten a hard cap; relaxable: false unchanged).
3. maximum class: KEPT defaultBindingKind: hard_bound + overridePolicy:
   lab-may-tighten; description now states the tighten-never-loosen semantics and
   that lab-may-relax:hard_bound is deliberately NOT a declared pair.

GUARD (the missing net): new data-driven block in
server/src/lint/Wave2ConstraintVocabularyRules.test.ts — "class-default x
policyBindingKeys guard (D1 net)": builds the composed key from EVERY class's OWN
declared defaultBindingKind + overridePolicy, loads policyBindingKeys AND
overridePolicies[*].allowedBindingKinds from the shipped vocabulary doc, asserts
membership on BOTH declared surfaces for all 10 classes (zero violations). No TS
policy: the check reads only the shipped data. A future class whose declared
default pair is incompatible fails loudly.

Consequential arm re-point (required by the ruling): the old R8 seam mutation used
bindingPolicyKey lab-may-tighten:hard_bound — under the ruling that pair is now
DECLARED, so the arm was re-pointed to the still-forbidden lab-may-relax:hard_bound
(hard_bound under the RELAXABLE policy). It still asserts valid=false + the specific
rule constraint-vocab-binding-kind-policy-compatible. The bead fixture's
vendor_default-under-lab-may-tighten arm is unchanged and still passes.

### D2 [minor] — admission-leg coverage overclaim — FIXED by EXTENDING mintedNouns() (preferred option)

mintedNouns() in server/src/schema/Wave2QuantitySchema.test.ts now covers ALL 22
crosswalk entries W2-2 added — every noun READ from shipped data, no invented
enumerations: 10 constraint-class-* (vocabulary doc classes), 4
quantity-dimension-* (quantity.schema.yaml dimension enum), quantity-ratio (derived
from the shipped QUANTITY_RATIO_ID $id), quantity-qualifier (quantity.schema.yaml
qualifier enum — one noun for the axis), 2 binding-kind-* (constraint.schema.yaml
bindingKind enum), 3 override-policy-* (vocabulary doc overridePolicies ids), and
"bead beater" (vocabulary doc capabilityTerms). The capability term is joined on the
CURIE both sides declare (crosswalk entry binds_to.curie == capabilityTerms kindRef
== CL:bead_beater) and the test asserts it carries NO cf: plan (a cf: plan would
duplicate an existing kind, §6.11) — mirrors the crosswalk entry shape the reviewer
verified at H1. New count arm asserts mintedNouns().length === 22. The collision arm
and the crosswalk-listing arm now run over all 22; stayed green (reviewer's grep
prediction confirmed). Report §7's claim is now backed: coverage is 22/22, not 14.

### Gates re-run at fix tip e3756acd (verbatim tails)

1. `cd server && npx vitest run src/schema/Wave2QuantitySchema.test.ts src/lint/Wave2ConstraintVocabularyRules.test.ts src/schema/Wave2NamingCrosswalk.test.ts`
       ✓ src/lint/Wave2ConstraintVocabularyRules.test.ts  (19 tests) 203ms
       ✓ src/schema/Wave2QuantitySchema.test.ts  (33 tests) 2433ms
       ✓ src/schema/Wave2NamingCrosswalk.test.ts  (6 tests) 4304ms
       Test Files  3 passed (3)
            Tests  58 passed (58)
   (was 49: lint 17->19 guard arms, schema 32->33 count arm; crosswalk 6 untouched)

2. `cd server && npx vitest run src/schema src/lint`
       Test Files  2 failed | 42 passed | 5 skipped (49)
            Tests  5 failed | 521 passed | 53 skipped (579)
   FAIL-file SET: comm -3 <(pin /tmp/l2t1251-failfiles-schema-lint.txt) /tmp/l2t1531f-ff.txt
   -> EMPTY (exit 0). SET identity EXACTLY {EventGraphEquipmentSchema.test.ts,
   LabwarePhysicalGeometryData.test.ts}; 5 failed tests baseline unchanged.

3. `npm run typecheck -w server | grep 'error TS' | sed 's/([0-9]*,[0-9]*)//' | sort`
   -> 26 lines; `comm -3 /tmp/l2t2230-tsc-server.txt /tmp/l2t1531f-tsc.txt` -> EMPTY
   (exit 0). Non-zero exit by design; zero new TS errors.
   Own test files under strict test-inclusive tsc (--strict
   --exactOptionalPropertyTypes --noUncheckedIndexedAccess ...): exit 0.

4. Ownership/untouched greps at fix tip:
   - `git -c core.fileMode=false diff --name-only -- server/src | grep -v '\.test\.ts$'` -> EMPTY (exit 1): zero production TS.
   - non-test server/src vendor/numeric grep (zymo|hepg2|hepatocyte|bead|beater|10000) -> EMPTY (exit 1).
   - `git -c core.fileMode=false diff --name-only -- app/ MANIFEST.yaml schema/scientist-intent/ amount/concentration/reference-ratio triplet protocol.* schemas lint-v1.schema.yaml LintEngine.ts` -> EMPTY: all BYTE-UNTOUCHED.

### Non-vacuity proof of the new guard (fabricated incompatible pair IS caught)

(a) In-test arm (Wave2ConstraintVocabularyRules.test.ts, "NON-VACUITY" it): mutates a
    structuredClone IN MEMORY (maximum.overridePolicy := 'lab-may-relax'; disk
    untouched) -> classDefaultPairViolations returns exactly 2 findings
    ("maximum: lab-may-relax:hard_bound is not a declared policyBindingKey" AND
    "maximum: hard_bound is not in lab-may-relax.allowedBindingKinds"); the test then
    re-reads the shipped doc from disk and asserts it is still clean.

(b) Out-of-tree probe against the REAL shipped lint (no worktree writes;
    /tmp/l2t1531f-d1probe/probe.ts, tsx, loads the real constraint-vocabulary.lint.yaml
    into LintEngine and lints payloads built from each class's OWN defaults):
        declared policyBindingKeys: ["lab-may-relax:vendor_default","lab-may-tighten:vendor_default","lab-may-tighten:hard_bound","never-override:hard_bound"]
        lab-may-tighten allowedBindingKinds: ["vendor_default","hard_bound"]
        class ratio                 default pair lab-may-tighten:vendor_default seam-violations=0
        class concentration         default pair lab-may-tighten:vendor_default seam-violations=0
        class per_unit_dose         default pair lab-may-tighten:vendor_default seam-violations=0
        class minimum               default pair never-override:hard_bound    seam-violations=0
        class maximum               default pair lab-may-tighten:hard_bound   seam-violations=0
        class capacity              default pair never-override:hard_bound    seam-violations=0
        class threshold             default pair never-override:hard_bound    seam-violations=0
        class ordering              default pair never-override:hard_bound    seam-violations=0
        class completion_condition  default pair never-override:hard_bound    seam-violations=0
        class vendor_default        default pair lab-may-relax:vendor_default seam-violations=0
        ALL 10 class-default pairs pass the shipped seam lint: true
        FABRICATED maximum->lab-may-relax (key lab-may-relax:hard_bound): valid= false seam findings= 1 ["constraint bindingKind and overridePolicy are not a declared compatible pair"]
    The reviewer's D1 probe (maximum rejected at c1b7ad56) is now inverted: all 10
    pass; a fabricated incompatible pair is REJECTED by the shipped seam rule.

### Fix commit diff --name-only (e3756acd)

  schema/registry/constraint-vocabulary/constraint-vocabulary.yaml
  server/src/lint/Wave2ConstraintVocabularyRules.test.ts
  server/src/schema/Wave2QuantitySchema.test.ts
(3 files, +142/-15; MANIFEST.yaml, scientist-intent/**, protocol triplet,
amount/concentration/reference-ratio datatypes, lint-v1, LintEngine all untouched;
zero production TS.)
