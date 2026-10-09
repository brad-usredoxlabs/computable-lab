# W2-2-QUANTITY-CONSTRAINTS — spec DRAFT (cl-spec-composer, 2026-10-09T11:30 EDT token l2t1130)

DRAFT — not promoted, not committed. Item: W2-2-QUANTITY-CONSTRAINTS (lane 2, WAVE 2
semantic-protocol-family; deps: W2-1-NAMING-CROSSWALK + SPINE-8-LEVELFOR).
Base examined by composer: cl/integration-2 docs tip cb4b8ee4 / code tip e830cffb — BEFORE the
SPINE-7 merge, before SPINE-8, before W2-1. Trunk WILL have moved by claim time; every baseline
below is RE-MEASURE-ON-YOUR-BASE, SET-identity discipline is the gate (assumption
AS-LANE2-W22-SPEC-COMPOSED-PRE-DEPS is on the record — the orchestrator re-checks this spec
against merged SPINE-7/SPINE-8/W2-1 shapes before promotion).
git ALWAYS `-c core.fileMode=false`. Coder runs on appliance-2 (ONE slot, slow per-token) —
every path, convention, and baseline needed is inlined below; do not re-derive.

## 0. Orientation + grounding (every line verified first-hand by the composer at cb4b8ee4; no
scout output is cited)

1. THE GAP IS REAL. `schema/lab/datatypes/` contains exactly one file,
   `chemical-properties.schema.yaml` (concept-level chemistry fields only).
   `schema/core/datatypes/` has 13 datatype files including:
   - `amount.schema.yaml` — `{value: number, unit: string}` required [value, unit] (:6),
     `additionalProperties: false` (:5), NO dimension, free-text unit. Consumed by
     recipe/material/material-instance/aliquot/plate-event schemas (grep `datatypes/amount` →
     9 non-test refs). Untyped: `unit: "banana"` validates.
   - `concentration.schema.yaml` — required [value, unit, basis]; closed `unit` enum (:16-38,
     M..fM, g/L..ng/mL, U/mL, cells/mL, cells/uL, CFU.., % v/v, % w/v); closed `basis` enum
     (:39-47: molar, mass_per_volume, activity_per_volume, count_per_volume, volume_fraction,
     mass_fraction). Note `value` carries `exclusiveMinimum: 0` (:12-13) — ZERO IS REJECTED.
     This datatype is the only unit-controlled surface today.
   - `reference-ratio.schema.yaml` — ADVISORY authoring annotation (description :4-11): bare
     `numerator`/`denominator` NUMBERS (:16-18), never load-bearing ("never what the resolver
     uses to produce volumes"). W2-2's ratio is quantity-per-quantity and is a DIFFERENT
     object; do not conflate, do not edit reference-ratio.
2. BARE-SCALAR STEPS TODAY: `schema/workflow/protocol.schema.yaml` StepAddMaterial is
   `oneOf [required:[volume_uL], required:[working_concentration]]` (:863-864);
   `working_concentration` → `$ref ./datatypes/concentration.schema.yaml` (:888-889);
   `ratio` → reference-ratio (:892-893); StepTransfer `required: [kind, source, target,
   volume_uL]` (:900). Registry protocols carry bare scalars:
   `schema/registry/protocols/zymo-magbead-minimal.yaml:27 volumeUl: 400`,
   `test-wash-protocol.yaml:13 volumeUl: 200`.
3. THE IMPLICIT MATH THIS CONTRACT REPLACES (later waves, NOT this item):
   `server/src/compiler/math/WorkingConcentrationResolver.ts` (C1V1=C2V2; hard-coded per-basis
   unit lists MOLAR_UNITS/MPV_UNITS/ACT_UNITS/CNT_UNITS at :21-29; `toBasePerLiter` collapses
   everything to one dimension), `server/src/compiler/math/eventReducers.ts` +
   `WellStateTracker.ts` (well volume/composition reducers). Read them for the SHAPE of the
   problem; touch none of them (§1 out-of-scope).
4. THE MACHINERY YOUR DATA PLUGS INTO (verified):
   - SchemaLoader: recursive discovery of `*.schema.yaml` (`SchemaLoader.ts:33`
     DEFAULT_PATTERNS; `loadAllSchemas` :154). Anything you drop under `schema/` is
     auto-registered at boot — a broken `$id`/`$ref` breaks EVERY boot test (integration.test.ts
     loads the whole tree and asserts `errors == []`).
   - LintSpecLoader: recursive `*.lint.yaml` discovery (`LintSpecLoader.ts:13`), loaded at boot
     `server/src/server.ts:397-403`; SPECS WITH ZERO RULES ARE SILENTLY SKIPPED
     (`server.ts:411 if (spec.rules.length === 0) continue;`).
   - LintEngine: GLOBAL rule-id uniqueness — `addSpec` THROWS `Duplicate rule ID` on collision
     across ALL specs (`LintEngine.ts:59-61`). New rule ids must be namespaced (e.g.
     `constraint-vocab-*`).
   - Lint DSL (lint-v1): ops exist/nonEmpty/regex/equals/in/allIn/noneIn/everyItem/all/any/not
     (`server/src/lint/types.ts` PredicateOp :21-36; meta-schema const sites
     `schema/lint/lint-v1.schema.yaml` :147,159,177,192,211,244,285,324,350,364,378); scope
     record|collection|repo (meta-schema :87). No arithmetic, no value-set comparisons inside
     conditional arms — design rules DSL-only (the scientist-intent-vocabulary.lint.yaml
     header makes the same commitment; copy that discipline).
   - Lint-spec-on-a-registry-doc PRECEDENT: `schema/scientist-intent/scientist-intent-vocabulary.lint.yaml`
     binds by `schemaId:` (:9) to a non-record-kind vocabulary doc and enforces well-formedness
     (P1-P5). Your constraint-vocabulary lint mirrors this shape exactly.
   - UI-spec precedent for a registry doc: `schema/registry/derivations/derivation.ui.yaml`
     exists next to its registry schema+lint (52 `*.ui.yaml` in the tree; header shape:
     `uiVersion: 1` + `schemaId:` + display/form — see `schema/lab/material.ui.yaml:1-4`).
5. EQUIPMENT CAPABILITY EXISTS — bead-beater requirement LANDS ON IT, does not mint it:
   `schema/workflow/equipment-capability.schema.yaml` — kind `equipment-capability`, `ECP-` id
   pattern (:26), `capabilities`, `equipmentClassRef` accepting either an `EQC-` record or a
   `^CL:` CURIE (:57) for generic physical kinds (`CL:water_bath`, `CL:heat_block`... — the
   2026-09-19 namespace ruling at :39-43).
6. ONTOLOGY SURFACE: `schema/registry/ontology-terms/` holds 6 files (cell-ontology, chebi,
   exact, gene-ontology, manual, ncbi-taxon). NOTE the existing prefix reality: `CL:<digits>`
   is OBO Cell Ontology (cell-ontology.yaml) while `CL:<lower_snake_kind>` is the computable-lab
   physical-kind namespace (equipment-capability :57) — do not invent a new prefix; new wave-2
   nouns carry the CURIE admission via W2-1's crosswalk (§2.F).
7. W2-1 CROSSWALK BINDS YOUR NOUNS (spec promoted
   `.hermes/plans/2026-10-09_1110-W2-1-naming-crosswalk-spec.md`, its §5 already adjudicates
   the overlap): `amount`/`concentration`/`reference-ratio` stay; Quantity is the genuinely-missing
   dimensioned datatype; "every wave-2 term must (1) resolve through the crosswalk, (2) not
   collide, (3) carry a CURIE plan" BEFORE entering any schema, lint, or fixture — enforced by
   `server/src/schema/Wave2NamingCrosswalk.test.ts`. W2-2 is the FIRST task to mint wave-2 vocab
   (dimensions count/volume/mass/molar, the 8+1 class names, capability/applicability terms), so
   its entries must be present in `schema/registry/wave2-naming-crosswalk.yaml` at W2-2 merge —
   see OQ3 for the exact update mechanics.
8. D6 (task-list wave-2 header, lines 4062-4068): ONE constraint vocabulary covering ratios,
   concentrations, per-unit doses, minima/maxima, capacities, thresholds, ordering, completion
   conditions, vendor defaults (the "8+1"), on a NEW shared Quantity datatype (value+unit+
   dimension; count/volume/mass/molar first; quantity-per-quantity ratios; ~zero
   representable). Forcing functions are Brad's own round-3 words (intake
   round-0-grounding.md :124-129): plate 10,000 HepG2, aspirate → 10,000 cells and
   (essentially) zero volume; 5 bashing beads per well; bead beater = equipment capability.

## Goal (one sentence)

Land the shared Quantity datatype (value+unit+dimension, ~zero representable, quantity-per-
quantity ratios) and ONE complete constraint vocabulary — all 8+1 classes, applicability, and
override policy as data in a bound lint YAML — as a pure schema/lint/UI-spec contract with
fixture proof, changing ZERO lines of production TypeScript.

## 1. Scope / non-scope (D6: classes as data, contract only, no compiler behavior, no UI code)

IN SCOPE — the only files the diff may touch (plus `.hermes/plans/`):
A. `schema/core/datatypes/quantity.schema.yaml` (new) — the Quantity datatype, §2.1.
B. `schema/core/datatypes/quantity-ratio.schema.yaml` (new) — quantity-per-quantity ratio, §2.2.
C. `schema/registry/constraint-vocabulary/constraint.schema.yaml` (new) — the constraint-object
   datatype (class, bound/target, applicability, bindingKind vendor_default|hard_bound,
   overridePolicy ref), §2.3.
D. `schema/registry/constraint-vocabulary/constraint-vocabulary.yaml` (new) — the vocabulary
   DATA doc: the 8+1 classes with CURIE/`cf:` plan, applicability map, override policy — §2.4.
E. `schema/registry/constraint-vocabulary/constraint-vocabulary.lint.yaml` (new) — well-formedness
   of D, DSL-only, bound by schemaId (scientist-intent-vocabulary.lint.yaml shape), §2.5.
F. `schema/registry/constraint-vocabulary/constraint-vocabulary.ui.yaml` (new) — UI HINTS ONLY
   for later review surfaces (derivation.ui.yaml precedent); no app code, no UI gate.
G. `schema/registry/wave2-naming-crosswalk.yaml` (EDIT — additions only, §2.F/OQ3).
H. Tests (new, under `server/src/`): `src/schema/Wave2QuantitySchema.test.ts`,
   `src/lint/Wave2ConstraintVocabularyRules.test.ts` — §2.6/§4.
I. Report `.hermes/plans/W2-2-report.wip-l2t<tickid>.md`.

EXPLICITLY OUT OF SCOPE (any hit = reviewer reject):
- ANY production TypeScript: `server/src/compiler/**` (incl. math/WorkingConcentrationResolver.ts,
  eventReducers.ts, WellStateTracker.ts), `server/src/lint/**` (no DSL extension — if a rule is
  inexpressible DSL-only, that is a STOP-and-report, not a PredicateEvaluator edit),
  `server/src/materials/**`, `server/src/execution/**`, `server/src/ai/**`, `server/src/schema/**`
  (loader/engine code). This item is DATA + TESTS.
- `schema/workflow/protocol.*` triplet — binding constraints to steps is W2-3 (D1 discriminated
  step shape). You ship the constraint OBJECT; W2-3 mounts it.
- Edits to `amount.schema.yaml`, `concentration.schema.yaml`, `reference-ratio.schema.yaml`, or
  any consumer record schema. The W2-1 adjudication stands: Quantity COEXISTS; migration of
  existing fields is a later wave. `ConcentrationFirstSchemaContract.test.ts` must stay green
  untouched.
- `schema/scientist-intent/**` and the goldens `MANIFEST.yaml` (SPINE-7/SPINE-8 territory; W2-1
  hard rule inherited verbatim). If trunk moved under you, your three-dot diff stays clean —
  never re-bless anything here.
- `schema/lint/lint-v1.schema.yaml` (DSL meta-schema), `schema/workflow/equipment-capability.schema.yaml`
  (reference it via `$ref`/CURIE; do not extend it), verb vocabularies, no new record kinds
  (D1: family/realization/IR/ladder forbidden as kinds; your vocabulary is a registry doc, not
  a kind), no app/ files, no `git add -A` (lane-sync strays).
- No :3093/:5193 interaction (and never :3001/:5174 — main checkout's stack). Headless item:
  NO browser gate. In-process vitest boots are the authority; `tsx --watch` does NOT reload YAML.

## 2. File-by-file plan

2.1 `schema/core/datatypes/quantity.schema.yaml`
  `$id: https://computable-lab.com/schema/computable-lab/datatypes/quantity.schema.yaml`
  (mirror amount.schema.yaml's `$id` convention exactly — SchemaLoader keys on `$id`).
  `type: object`, `additionalProperties: false`, `required: [value, unit, dimension]`.
  - `dimension`: enum [count, volume, mass, molar] (first wave ONLY; extension is a future
    data edit, never a TS list).
  - `unit`: controlled per dimension — JSON-Schema-native cross-enforcement, e.g.
    `allOf: [{ if: {properties:{dimension:{const:count}}} then: {properties:{unit:{enum:[...]}}} }, ...]`
    with per-dimension closed unit sets (count: cells, beads, wells, ...; volume: uL, mL, L;
    mass: g, mg, ug; molar: M, mM, uM, nM — reconcile spellings against concentration.schema.yaml
    :16-38 so the SAME spelling means the SAME thing across datatypes). An uncontrolled unit
    (e.g. `dimension: count, unit: "uL"`) must FAIL schema validation — that is an acceptance
    arm ("uncontrolled units rejected").
  - `value`: `type: number, minimum: 0`. NOT exclusiveMinimum — the aspiration fixture needs
    volume EXACTLY 0 representable (concentration's exclusiveMinimum:0 is precisely the trap
    this datatype must not repeat).
  - `qualifier`: optional enum [exact, approximately_zero] (or the shape OQ2 settles) — "~zero
    representable" per D6. The datatype must make "count=10000, volume=0, both exact facts about
    the same well" expressible with no forced conversion.
  - description must cite the forcing functions and state: no arithmetic, no conversion,
    dimension-preservation law (counts never collapse into volumes).

2.2 `schema/core/datatypes/quantity-ratio.schema.yaml`
  required [numerator, denominator], both `$ref: "./quantity.schema.yaml"` — a quantity-per-
  quantity ratio (e.g. 5 beads / 1 well: numerator count/beads, denominator count/wells — both
  dimension count, DIFFERENT units, which is exactly why ratio ≠ dimensionless).
  `additionalProperties: false`; optional `basis_label`/`ratioed_label` style labels may mirror
  reference-ratio's affordances. Description MUST state the adjudication: this is load-bearing
  where reference-ratio.schema.yaml (:4-11) is advisory; the two coexist by W2-1 ruling.

2.3 `schema/registry/constraint-vocabulary/constraint.schema.yaml`
  The constraint-object datatype every W2-3 step will embed. Properties (all decisions are
  DATA, no TS): `class` (ref to a class id declared in D), `bound` ($ref quantity.schema.yaml
  and/or quantity-ratio where the class demands it), `subject` (applicability: role/kind/term
  ref — symbolic refs only, never inline payloads), `bindingKind`: enum [vendor_default,
  hard_bound] (THE vendor-vs-material strictness seam SPINE-8/SPINE-3 governs — encode the
  DISTINCTION here, not the policy), `overridePolicy`: string ref to an override-policy id
  declared in D's data, optional `capabilityRequirement` ($ref style pointing at
  equipment-capability / `^CL:` CURIE — the bead-beater arm), `provenance`: optional.
  `unevaluatedProperties: false` on the object (unevaluated-safe with the $refs; mirror
  equipment-capability.schema.yaml's allOf+$ref style). Do NOT reference constraint.schema.yaml
  from any shipped record schema yet — nothing consumes it until W2-3.

2.4 `schema/registry/constraint-vocabulary/constraint-vocabulary.yaml`
  Registry-style pure data (mirror `schema/registry/operations.yaml`'s non-triplet registry
  style — `kind: constraint-vocabulary`, version, entries). One entry per class of the 8+1:
  ratio, concentration, per_unit_dose, minimum, maximum, capacity, threshold, ordering,
  completion_condition (the 8 memo classes — minima/maxima as two entries per "8+1" counting
  vendor_default as the +1; if W2-1's merged crosswalk counts differently, THE CROSSWALK WINS,
  note it in the report) + vendor_default. Each entry: id, `cf:`-style CURIE, description,
  applicability targets, allowed bindingKinds, `overridePolicy` refs. Plus `overridePolicies:`
  section declaring each policy (e.g. lab-may-relax / lab-may-tighten / never-override) —
  policies are NAMES + attributes here; enforcement of which applies to which record is W2-3+
  via lint bound to the consuming records.

2.5 `schema/registry/constraint-vocabulary/constraint-vocabulary.lint.yaml`
  `lintVersion: 1`, `schemaId:` the vocabulary doc's `$id`, rules DSL-only (P-family style from
  scientist-intent-vocabulary.lint.yaml, ids prefixed `constraint-vocab-` for global uniqueness
  — LintEngine.ts:59-61). Minimum arms:
  R1 (error): every class entry's `overridePolicy` refs a policy declared in `overridePolicies`.
  R2 (error): every `vendor_default` class declares an override policy (vendor defaults are by
  definition overridable-under-policy — a vendor_default with no policy is undeclared strictness).
  R3 (error): class ids unique / non-empty; applicability entries name declared classes
  (allIn/everyItem/noneIn — all three are in the shipped DSL).
  The spec MUST ship ≥1 rule (server.ts:411 silently skips empty specs) and the test §2.6 proves
  it FIRES, not just loads.

2.6 Tests (harness styles are in the repo — COPY, don't invent):
  - `server/src/schema/Wave2QuantitySchema.test.ts`: registry-load harness per
    `ConcentrationFirstSchemaContract.test.ts` (loadAllSchemas from `join(process.cwd(),
    'schema')` — vitest ONLY from `server/`, cwd-relative schema joins) + Ajv validate fixtures:
    all 8+1 constraint classes instantiate; dimension mismatch rejected; uncontrolled unit
    rejected; quantity volume 0 ACCEPTED; ratio count/beads over count/wells accepted; ratio
    count-over-volume representable but a constraint class that requires same-dimension ratio is
    expressible via data (report which classes declare it).
  - `server/src/lint/Wave2ConstraintVocabularyRules.test.ts`: parse the REAL vocabulary + lint
    YAMLs from disk into a LintEngine and lint inline payloads, per
    `server/src/lint/ProtocolLintRules.test.ts:22-50` (fileURLToPath ../../../schema/... paths);
    THE FORCING-FUNCTION FIXTURES LIVE HERE (lint-fixture payloads, not DB records):
    HepG2 — well state {count 10000 exact, volume 0 approximately_zero} passes; a mutated
    payload that converts the count into a volume or erases it fails; bead — 5 beads/well ratio
    as material count-per-well + `capabilityRequirement: CL:bead_beater`-style ref passes;
    vendor_default-without-policy → lint error; hard_bound arm distinct from vendor_default
    (same bound value, different bindingKind → different findings).
  - Crosswalk leg: `Wave2NamingCrosswalk.test.ts` (W2-1's, green untouched) must still pass with
    your crosswalk additions; add no exception hacks to it.

2.F Crosswalk integration (G): add your minted nouns (4 dimensions, 8+1 class ids, bindingKinds,
  override-policy ids, capability term) to `schema/registry/wave2-naming-crosswalk.yaml`
  following the merged file's entry shape, status flipped from
  `new-vocab-pending-admission` → admitted with the schema path. READ the merged file first and
  mirror its actual entry keys; do not guess them (OQ3).

## 3. Acceptance criteria (VERBATIM from the task block, `verified by:`)

> Headless schema/lint fixtures: all 8+1 constraint classes instantiate; dimension
> mismatches and uncontrolled units rejected; HepG2 fixture — 10,000-cell count survives
> aspiration with volume ~0, count never converted/erased; bead fixture — 5 beads/well as
> material count-per-well + bead-beater equipment-capability requirement; vendor defaults
> distinguishable from hard bounds with lint-declared override policy. No vendor identity
> or numeric-shape-guessing in code.

Description clauses that bind scope: "classes, applicability, override policy all in lint YAML.
UI hints for later review surfaces. No compiler behavior yet — this task is the contract only."

## 4. RED-first build order + exact commands (vitest ONLY from `<wt>/server`; git ALWAYS
`-c core.fileMode=false`; worktree bootstrap = the standard lane 6 symlinks + lane-exclude
copies, baseline RED without them is environmental)

1. RED: write the two test files with fixtures only. They must FAIL (schemas absent). Record
   the RED output in the report.
2. GREEN-schema: write A+B (§2.1-2.2). FIRST TARGETED CHECK — the single command that proves the
   approach early and that a broken new schema can never pass silently:
   `cd <wt>/server && npx vitest run src/schema/integration.test.ts` => green (the whole-tree
   loader registers your new `$id`s with `errors: []`, no boot break).
   Then `npx vitest run src/schema/Wave2QuantitySchema.test.ts` => green.
3. Vocabulary + lint: write C+D+E+F (§2.3-2.5) + crosswalk additions (G).
   `npx vitest run src/lint/Wave2ConstraintVocabularyRules.test.ts` => green (error arms fire;
   clean vocabulary emits zero findings).
4. Whole-scope: `npx vitest run src/schema src/lint` vs §5 baseline set.
5. `npx vitest run src/schema/Wave2NamingCrosswalk.test.ts` => green (your nouns pass W2-1's
   admission check with the crosswalk updated, not the check updated around you).
6. tsc + ownership greps (§5). Report + commit (owned files only). Final line `W2-2 DONE <sha>`.

## 5. Baselines and pins (RE-MEASURE every one on your claim base; SET identity is the gate)

- PRIMARY SCOPE SET: `cd <wt>/server && npx vitest run src/schema src/lint 2>&1 | grep -E "FAIL"
  | sed 's/.*FAIL *//' | sed 's/ >.*//' | sort -u > /tmp/l2t<id>-ff.txt; comm -3
  /tmp/l2t1130-failfiles-schema-lint.txt /tmp/l2t<id>-ff.txt` => EMPTY.
  Composer's MEASURED baseline at cb4b8ee4 (this tick, real run): exactly 2 failing files /
  5 failed tests — `src/schema/EventGraphEquipmentSchema.test.ts`,
  `src/schema/LabwarePhysicalGeometryData.test.ts` — captured at
  `/tmp/l2t1130-failfiles-schema-lint.txt`. Post-merge trunk may differ: re-measure the SET at
  claim on your base and gate against YOUR capture; your new tests may only REDUCE failures,
  never add.
- server tsc: `cd <wt> && npm run typecheck -w server 2>&1 | grep 'error TS' |
  sed 's/([0-9]*,[0-9]*)//' | sort > /tmp/l2t<id>-tsc-server.txt && comm -3
  /tmp/l2t2230-tsc-server.txt /tmp/l2t<id>-tsc-server.txt` => EMPTY vs claim-time re-measure
  (pin `/tmp/l2t2230-tsc-server.txt` = 26 lines / 6 files, sha256 924c18bd566d...9e41,
  re-verified present this tick). Non-zero tsc exit is BY DESIGN — never demand green.
  A schema/lint-data item should add zero TS: if comm is non-empty, something leaked.
- app: `git -c core.fileMode=false diff --name-only <base>..HEAD -- app/` => EMPTY (app tsc pin
  47-out/34-err carried; never exercised).
- Contract-only proof greps (both must hold):
  `git -c core.fileMode=false diff --name-only <base>..HEAD -- server/src | grep -v '\.test\.ts$'`
  => EMPTY (zero production TS);
  `git -c core.fileMode=false diff <base>..HEAD -- server/src | grep -inE 'zymo|hepg2|hepatocyte|bead|beater|10000'`
  => EMPTY in any non-test file context (no vendor identity, no numeric-shape-guessing in code —
  the numbers live in YAML fixtures).
- OWNERSHIP: `git -c core.fileMode=false diff --name-only <base>..HEAD | grep -v -E '^schema/core/datatypes/quantity(-ratio)?\.schema\.yaml$|^schema/registry/constraint-vocabulary/|^schema/registry/wave2-naming-crosswalk\.yaml$|^server/src/(schema/Wave2QuantitySchema|lint/Wave2ConstraintVocabularyRules)\.test\.ts$|^\.hermes/plans/'`
  => EMPTY.
- MANIFEST discipline: `server/src/compiler/scientistIntent/goldens/MANIFEST.yaml` must be
  byte-untouched in your diff (it pins `schema/scientist-intent/*` shas — vocabulary sha
  6c5e397c... at cb4b8ee4, verified matching the file this tick; SPINE-7/8 re-bless on THEIR
  items, never yours).

## 6. Reviewer bait (the likely edge errors for THIS item — pre-empt each in the report)

6.1 The zero trap: copying concentration's `exclusiveMinimum: 0` (concentration.schema.yaml:12-13)
    into Quantity kills the HepG2 arm (volume ~0 must validate). `minimum: 0` + qualifier.
6.2 Dimension collapse: any design that stores 10,000 cells as `amount{value, unit}` or as a
    concentration (cells/uL) violates the forcing function — count must remain dimension `count`
    alongside volume, both fields, no conversion, no erasure. The test must show the MUTATION
    (count converted/erased) FAILING, not just the good case passing (non-vacuity).
6.3 Hardcode boundary (principles §6/§9, declarative=law): class names, unit sets, applicability,
    override policies all live in YAML; ZERO new TS policy — a `if (class === 'ratio')` anywhere,
    a TS unit list, a per-vendor branch = reject. Numeric-shape-guessing ("value < 1 must be
    volume") is the named reject in the acceptance verbatim.
6.4 Duplicate rule ID: LintEngine.addSpec throws GLOBAL duplicates (LintEngine.ts:59-61) — unprefixed
    ids like `class-refs-resolve` can collide with a SPINE-7/W2-1 sibling merged after this spec
    was drafted; `constraint-vocab-` prefix; the boot-level proof is the whole `src/lint` scope run.
6.5 Empty-spec silence: server.ts:411 skips zero-rule specs LOUDLY-INVISIBLE; ship rules AND a
    test that a violating fixture produces the finding.
6.6 Loader blast radius: every `*.schema.yaml` under `schema/` auto-loads (SchemaLoader.ts:33).
    A typo'd `$id` or broken `$ref` reds integration.test.ts and half the tree — the FIRST
    targeted check (§4.2) exists precisely to catch this before you build on it.
6.7 exactOptionalPropertyTypes (backend ON): your test files construct fixtures with optional
    fields (`qualifier`, `overridePolicy`, `capabilityRequirement`) — build absent means ABSENT,
    never `undefined`; conditional spreads only. (No production TS sites exist — §5 grep.)
6.8 YAML-reload trap: lane `tsx --watch` does NOT reload YAML (:3093 restart would be required
    for any human-facing E2E claim; `cl-lane-stack.sh 2 restart` is BLOCKING → background=true).
    All YOUR evidence is in-process vitest; do not touch the stack at all.
6.9 DSL over-reach: a rule wanting arithmetic/value-set comparison inside conditional arms will
    fail — lint-v1 has exists/nonEmpty/regex/equals/in/allIn/noneIn/everyItem/all/any/not ONLY
    (types.ts:21-36). Restrict lint rules to vocabulary well-formedness + cross-ref closure;
    numeric comparison at enforcement time is W2-3+ DSL extension territory (STOP-and-report if
    you believe an arm is impossible DSL-only — do not extend the DSL, that is not this item).
6.10 Two-terms-one-entity: ratio appears THREE ways in this repo (reference-ratio = advisory
    bare numbers; your quantity-ratio = load-bearing; scientist-intent operations.yaml has a
    separate 'add_material' vocabulary). Each new file's description must name which it is and
    which it is NOT; your class id `ratio` must resolve through the crosswalk (W2-1 admission),
    not shadow operations.yaml.
6.11 CURIE honesty: `CL:` is ALREADY doubly-used (OBO Cell Ontology `CL:<digits>` vs computable-lab
    kind `CL:<snake>` — equipment-capability :39-43,57). Mint NEW vocab as `cf:` per W2-1's plan;
    reference bead-beater through the EXISTING equipment-capability machinery; inventing a fourth
    prefix = reject.
6.12 Pre-deps drift: W2-1's merged crosswalk entry keys / admitted statuses and SPINE-8's merged
    vocabulary shape may differ from this draft's assumptions. READ the merged files at claim;
    where they contradict this spec, the merged trunk wins — record the delta in the report and
    adapt, never edit the neighbor artifacts to match this draft.

## 7. Worker contract

- Branch `w2-2-lane2-l2t<tickid>` off `cl/integration-2` TRUNK TIP AT CLAIM (must be a descendant
  of the SPINE-7 merge, W2-1 merge, and SPINE-8 merge — task deps; record
  `git -c core.fileMode=false rev-parse HEAD` + `git merge-base --is-ancestor` checks in the
  report header).
- Worktree `/mnt/vast/home/brad/git/wt/W2-2-lane2-l2t<tickid>` + standard lane bootstrap (6
  symlinks + lane-exclude untracked copies; `/tmp/lane2-sync-wt.sh` precedent; lane-excluded
  symlinked tests resolve to MAIN's sources — never gates, AS-LANE2-ENV-1).
- Unique deliverables: report `<wt>/.hermes/plans/W2-2-report.wip-l2t<tickid>.md` (orchestrator
  promotes), log `~/.hermes/cl/lanes/2/logs/coder-W2-2-l2t<tickid>.log`, captures `/tmp/l2t<tickid>-*`.
- Server/schema-only; headless — NO browser gate, NO :3093/:5193/:3001/:5174 interaction;
  one worker; NEVER `git add -A`; final line `W2-2 DONE <sha>`.
- Report must carry: RED capture (§4.1), §4.2 first-check output, every §5 command's verbatim
  tail, the crosswalk delta (merged entry keys found + what you added), the §3 acceptance
  walkthrough naming which fixture proves which clause, §6 dispositions, `diff --name-only` list.
- Stop-and-report (SPINE-style) over faking: if an acceptance arm proves unreachable at your
  base, show probe evidence and the clause, do not weaken the fixture.

## 8. Open questions (composer could not resolve locally)

OQ1 — Placement: Quantity at `schema/core/datatypes/` (alongside amount/concentration — the
composer's recommendation, matching the $id convention and the concentration-first precedent)
vs `schema/lab/datatypes/` (the task description says "schema datatypes" and the verified gap it
names is lab/datatypes, which today holds only chemical-properties)? Composer checked both dirs,
the $id conventions, and ConcentrationFirstSchemaContract registration; either loads. The
constraint-vocabulary placement (`schema/registry/constraint-vocabulary/`, derivation/operations
precedents) is composer-chosen for the same reason — confirm or relocate.
OQ2 — ~zero semantics: `qualifier: [exact, approximately_zero]` (composer's recommendation —
value stays numeric, honesty travels with the quantity, no invented epsilon) vs a tolerance
field (`tolerance: quantity`) vs a separate approximate datatype. Grepped: no `~zero`/approx-zero
precedent exists anywhere in schema/ or docs. The choice binds W2-3 (intent steps carry these)
and W2-9 (render); pick the shape once at promotion.
OQ3 — Crosswalk update mechanics: W2-1's merged `wave2-naming-crosswalk.yaml` did not exist at
draft time (W2-1 still queued on the fleet lock at l2t1200). Does W2-2 EDIT that file's entries
(`new-vocab-pending-admission` → admitted + schema path — composer's assumption), or does the
admission check expect a separate W2-2-owned section? Composer checked: W2-1 spec deliverable B
defines the entry shape {term,status,binds_to,source_decision} and the enforceable collision
test; exact merged keys are unverifiable pre-merge. If W2-1 merges with different keys, §6.12
tells the coder to mirror the merged file — confirm this disposition at promotion.

SPINE8SHAPE-DRAFT written 2026-10-09 ~11:30 EDT by cl-spec-composer (l2t1130). All §0 cites
first-hand at cb4b8ee4; nothing in this spec is scout-sourced. UNVERIFIED-by-necessity items are
confined to OQ1-OQ3 (post-merge trunk shapes this draft cannot see).
