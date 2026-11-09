# GC-2 — GC method records: acquisition + analysis triplets, gc_fid readout vocabulary

**PROVISIONAL — orchestrator-composed 2026-10-25T23:45** (authorized 7b(c) hedge: the
cl-spec-composer run cl-l1-speccompose-gc2-l1t1730 exceeded 3x expected duration at 4h+
without emitting its draft; the 77th handoff authorizes the tick to compose this spec from
the GC-1 report + bounded local inspection, flagged for architect ratification). Every
cite below was read first-hand by the orchestrator on trunk `cl/integration-1`.

Campaign: WAVE: gc-analysis-cycle (task-list header ~line 7458, Brad-approved 2026-10-25,
binding decisions GC-D1..D6). Task block: `id: GC-2`. NO re-litigating of GC-D2 (capture
acquisition data NOW as declarative method records) or the unknown-is-unknown rule.

## Oriented facts (orchestrator-verified on trunk, 2026-10-25/26)

1. **Triplet convention** = `schema/lab/<kind>.schema.yaml` + `<kind>.lint.yaml` +
   `<kind>.ui.yaml`. Schema pattern to mirror: `schema/lab/assay-definition.schema.yaml`
   (JSON Schema 2020-12, `unevaluatedProperties: false`,
   `allOf: [$ref ./common.schema.yaml#/$defs/FAIRCommon]`, `kind: const`,
   id `pattern`, refs via `./datatypes/ref.schema.yaml`).
   FAIRCommon lives at `schema/core/common.schema.yaml#/$defs/FAIRCommon`
   (leaf files ref it as `./common.schema.yaml` — see calibration-record.schema.yaml:10;
   the loader resolves by registry, follow the existing files verbatim).
2. **CRITICAL: the readout instrument_type enum is MIRRORED IN ZOD.**
   `schema/lab/readout-definition.schema.yaml:34`:
   `enum: [ plate_reader, qpcr, gc_ms, lc_ms, microscopy, other ]` and
   `server/src/registry/ReadoutDefinitionRegistry.ts:22`:
   `instrument_type: z.enum(['plate_reader', 'qpcr', 'gc_ms', 'lc_ms', 'microscopy', 'other'])`.
   A YAML-only edit loads the new registry instance file as a zod FAILURE. BOTH must gain
   `gc_fid`. (`AssayDefinitionRegistry.ts:23` and `InstrumentRegistry.ts:24` mirror the
   same list for THEIR kinds — do NOT touch them; GC-2 needs no gc_fid assay/instrument
   instance. `schema/lab/measurement.schema.yaml:79` has a DIFFERENT enum
   `[ qpcr, plate_reader, microscopy, gc_ms, flow, other ]` — a separate vocabulary,
   STOP BOUNDARY: leave it alone.)
3. **Registry instances** are plain YAML files loaded by kind-directory:
   `schema/registry/readout-definitions/` has `gcms-peak-area.yaml` (model):
   `kind/id/name/instrument_type/mode/channel_label/units/tags` — flat, no FAIRCommon.
4. **Registry-kind lifecycle coverage**: `schema/registry/registry-kinds.registry.yaml`
   lists plain kinds getting the minimal `registry-ops` lifecycle (person, equipment,
   calibration-record, ...). A new operational record kind joins that list.
5. **Lint DSL** (verified): `lintVersion: 1`, `schemaId: <the schema $id>`,
   `rules: [{id,title,severity,scope:"record",when:{op:"equals",path,value},
   assert:{op:"exists"|"nonEmpty",path},message:{template,paths}}]` — real example
   `schema/integration/lab-sync-event.lint.yaml`. Many triplets ship `rules: []`.
6. **No fatty-acid/FAME vocabulary exists** (verified): `schema/registry/compound-classes/`
   = 4 non-lipid entries (model: `PPARa-activator.yaml` with `chebi_ids:` +
   `candidates:[{compoundId,name}]`); `schema/registry/ontology-terms/` = chebi.yaml
   (187-line download placeholder, grep: zero fatty-acid terms), manual.yaml (manual
   source, `kind: ontology-term` entries with id/source/label/definition). Refs are
   `{kind: record|ontology, id, type?, label?, uri?}` (ReadoutDefinitionRegistry.ts
   RefShape + datatypes/ref.schema.yaml).
7. **Test harness** (model, real pipeline over the real schema/ dir):
   `server/src/schema/ControlledDocumentSchemas.test.ts` — vitest,
   `loadAllSchemas` + `createSchemaRegistry` + `createValidator` + `loadAllLintSpecs` +
   `createLintEngine` + `loadAllUISpecs`.
8. **UI triplets** use the EDITOR-1 binding: `editor.blocks[]` with explicit `slots:`
   claims claiming every `editor.slots[]` id (list order = field order); loader ERRORS on
   unknown/double/unclaimed refs. Model: `schema/lab/controlled-document.ui.yaml`.

## GC-1 verdicts this spec consumes (from the orch-verified report
`.hermes/plans/2026-10-26_GC-1-gc-feasibility-spike-report.md`)

- Engine = scipy 1.18.1 core + pybaselines 1.2.1 pluggable baseline backend; venv
  numpy==2.5.4 scipy==1.18.1 on /usr/bin/python3 3.14.7; GC-5 owns runner wiring.
- .M verdict: NO vendor parsing. IQ1.MTH keys parseable but **semantics
  vendor-undocumented** → any IQ1.MTH values live ONLY as imported key-values
  (`{key, raw_value, source_file}`), NEVER mapped into executable fields.
  ACQ.TXT method-name extraction is the only extraction (feeds GC-3, not this item).
- Saturated-peak flag (`saturated: true` when flat-topped) is a PROPOSAL — do not encode
  a lint rule here; it lands with GC-10/GC-6.
- Corpus: `20201023-WEGMANS-BUTTER.D` is a partial .D — irrelevant to GC-2 (no parsing).

## Deliverables (create; commit on the worker branch)

### A. `schema/lab/gc-method.schema.yaml` — kind `gc-method`
- id pattern `'^GCM-[A-Za-z0-9_-]+$'`, `kind: const gc-method`, FAIRCommon mixin,
  `unevaluatedProperties: false`. Required: kind, id, name, method_version.
- `method_name` string; `method_version` integer >= 1 (record-level versioning; the
  revision/signature contract already immutable-pins edits via REV- snapshots — do NOT
  reinvent).
- `acquisition:` (GC-D2) object, NOTHING required inside (absent = unknown, never a
  default value):
  - `oven:` array of steps `{step, hold_time_min, ramp_rate_c_per_min | null,
    target_temp_c}` — units in field names, no unit-less numbers.
  - `inlet:` `{mode enum [split, splitless, on_column], temp_c, pressure_psi,
    split_ratio, carrier_gas enum [helium, nitrogen, hydrogen, other]}`
  - `diverter` / `saver:` setpoint objects (string/number with unit-suffixed fields;
    semantics unclear on real ChemStation → keep `{position, description}`).
  - `column:` `{length_m, id_mm, film_thickness_um, stationary_phase,
    flow_mode enum [constant_flow, constant_pressure, other]}`.
- `analysis:` object:
  - `global:` `{baseline_correction enum [none, tangent_skim, vertical_drop, other],
    skim_ratio, valley_to_peak_ratio, peak_width_s}`.
  - `timed_events:` array `{at_min, integration enum [on, off], slope_sensitivity,
    peak_width_s, area_reject_au, height_reject_au}` (ChemStation timed-event menu).
  - `compound_assignments:` array `{label, compound_ref (ref.schema.yaml —
    kind record|ontology), expected_rt_min, rt_window_min, response_factor?}`.
  - `calibration:` `{istd_ref?, istd_amount {value, unit}, dilution_factor,
    multiplier, calibration_levels (array of refs)}`.
  - **executable-use gate (the lint hook):** every entry under `timed_events` and every
    field set inside `global` is capture; executability is declared data:
    `analysis.executable_binding: {engine_ref (ref), declared_at}` — OPTIONAL. The lint
    rule (D) refuses *executable* interpretation without it (see D).
- `provenance_capture:` `{entered_by (person ref), source_files: array of
  {file, role enum [acq_txt, iq1_mth, da_m, other], key_values?: array of
  {key, raw_value}}}` — the ONLY home for vendor-derived values; a value may move from
  `source_files.key_values` into an executable field ONLY by scientist-entered data in
  the sections above (GC-1 unknown-is-unknown rule).
- STOP BOUNDARY: do not add lifecycleId const; lifecycle comes from E.

### B. `schema/lab/gc-method.ui.yaml` — generated-form triplet
`editor:` with `mode: form`, blocks with explicit `slots:` claims covering every slot
(EDITOR-1 loader errors on unclaimed slots) — sections: identity (name/version/method
identity fields), acquisition (oven/inlet/column fields), analysis (global + timed
events repeater via `kind: repeater` + `path:` if needed — blocks WITHOUT `slots:` keep
prefix binding, so the repeater binds by path), calibration, provenance. Render every
scalar as a plain field; no new widgets (a new widget demand = STOP, return to
architect).

### C. gc_fid readout vocabulary (DATA + its zod mirror)
1. `schema/lab/readout-definition.schema.yaml:34` — append `gc_fid` to the enum
   (after `gc_ms`).
2. `server/src/registry/ReadoutDefinitionRegistry.ts:22` — add `'gc_fid'` to the zod
   enum (the ONLY server change in this item; cite it in the commit message: without it
   the data change fails at registry load).
3. NEW `schema/registry/readout-definitions/gcfid-peak-area.yaml` modeled on
   gcms-peak-area.yaml: `kind: readout-definition`, `id: RDEF-GCFID-PEAK_AREA`,
   `name: GC-FID Peak Area`, `instrument_type: gc_fid`, `mode: peak_area`,
   `channel_label: FID`, `units: pA`, `tags: [gc-fid]`. (pA from GC-1's decode; FID is
   NEVER filed under gc_ms.)

### D. `schema/lab/gc-method.lint.yaml` — the silent-execution block
One rule (DSL per fact 5): severity error, scope record,
when `$.analysis.timed_events` exists-and-nonEmpty (use the DSL's actual op vocabulary —
read `server/src/lint/types.ts` for legal ops before writing), assert
`$.analysis.executable_binding` exists → message: timed integration events are captured
but not executable until an engine binding is declared. This IS "recordable for capture,
lint-blocked from silent executable use". If the DSL cannot express "array nonEmpty",
express the rule over `$.analysis.executable_binding` presence when
`$.analysis` exists — pick the closest EXISTING-DSL-expressible form, never invent DSL
ops. Second rule: `provenance_capture.source_files[].key_values[].raw_value` entries
must never be referenced from analysis paths — expressible only if the DSL has such
ops; otherwise record as a documented intent comment (do NOT fake a rule).

### E. `schema/registry/registry-kinds.registry.yaml` — add `- kind: gc-method`
(minimal registry-ops lifecycle, draft default state — same treatment as
calibration-record; no `stripDomainStatus`).

### F. FAME/FFA compound identity (ontology-search-first, per task block)
- Search already done (orchestrator, verified): NOTHING fatty-acid in
  schema/registry/. Attempt a real ChEBI lookup via the EBI OLS4 API
  (`https://www.ebi.ac.uk/ols4/api/...` via curl/web) for: hexanoic acid, octanoic
  acid, decanoic acid, and their methyl esters (methyl hexanoate CAS 106-70-7,
  methyl octanoate CAS 111-11-5, methyl decanoate CAS 110-42-9 — CAS numbers cited from
  an ECHA dossier found in an orchestrator web search; ChEBI IDs MUST be confirmed by
  the lookup, NEVER from memory). Confirmed → record the CHEBI CURIE in the term.
  **ORCH CORRECTION 2026-10-26T01:00 (verified live at OLS4 + PubChem):** the FAME
  CAS anchors above are CORRECT (CID 7824/8091/8050 titles match); an earlier draft's
  hexanoic-acid anchor 110-94-1 was WRONG (PubChem CID 743 = glutaric acid; true
  hexanoic acid CAS 142-62-1, CID 8892). Confirmed ChEBI ids for all six (orch-
  verified labels): hexanoic acid CHEBI:30776, octanoic acid CHEBI:28837, decanoic
  acid CHEBI:30813, methyl hexanoate CHEBI:77322, methyl octanoate CHEBI:87432,
  methyl decanoate CHEBI:143577.
  Not confirmed → mint WITHOUT an external id (unknown-is-unknown).
- NEW `schema/registry/ontology-terms/fame-local.yaml` (source: local/manual pattern of
  manual.yaml): terms distinguishing the two species REQUIRED — for each n in {6,8,10}:
  free fatty acid (`...-n0-acid`, label "Hexanoic acid (free fatty acid, 6:0)") vs
  methyl ester (`...-n0-ome`, label "Methyl hexanoate (FAME, 6:0-OMe)"). The two-line
  rule: one entity, one local term — never two ids for one thing; ids follow the file's
  existing source-prefix convention.
- NEW `schema/registry/compound-classes/fame-medium-chain.yaml` modeled on
  PPARa-activator.yaml: the 6:0/8:0/10:0 **methyl esters** as `candidates:`
  (the standards the GC-FID FAME method runs).

### G. RED-first tests — NEW `server/src/schema/GcMethodSchemas.test.ts`
Harness = ControlledDocumentSchemas.test.ts (real loaders/validator/lint over the real
schema dir). Cases:
1. valid full gc-method (acquisition + analysis + compound refs to the new ontology
   terms + provenance_capture) validates against schema + lint passes WITH an
   executable_binding;
2. same record WITHOUT `executable_binding` but WITH `analysis.timed_events` → lint
   ERROR (the silent-execution block) — schema still valid, lint fails;
3. dangling compound_ref (unknown ontology id) rejected by the ref/validation path the
   existing suite uses for dangling refs (read how calibration/claim tests do it —
   mirror the mechanism, do not invent a new validator);
4. `gcfid-peak-area.yaml` loads: JSON-schema validation + `getReadoutDefinitionRegistry()`
   includes `RDEF-GCFID-PEAK_AREA` (this test is RED before the zod line is added — keep
   it honest); an unknown instrument_type (`fid`) still rejected;
5. ui.yaml loads via loadAllUISpecs with zero loader errors (every slot claimed);
6. bad unit-free shapes: an oven step with an unknown extra key rejected
   (unevaluatedProperties:false).

### Also (cheap, only if trivially true): grep any other server-side consumer that
switches on readout `instrument_type === 'gc_ms'` for peak_area behavior
(`grep -rn "'gc_ms'" server/src --include='*.ts' | grep -v test` — orchestrator saw only
the three zod mirrors + ingestion kind strings + ProtocolLabReviewService backendIds at
claim time; if a CONSUMER branches on gc_ms, do NOT silently include gc_fid there —
STOP and report, it's a policy question).

## Verification commands (worker runs, output quoted in report)
- `npm run typecheck` in server/ and app/ workspaces (baseline: ~33 pre-existing server
  TS errors on trunk — ZERO NEW errors, none in your files; do not chase baseline).
- the touched vitest suites green (the new GcMethodSchemas.test.ts + anything registry
  tests cover).
- after YAML additions, local `node`/vitest runs suffice for acceptance; the
  orchestrator restarts the lane stack (:3092) post-merge.

## Stop boundaries (return `requires-rescope`, do NOT absorb)
- Any need to change RecordHandlers/ref-resolution machinery, the revision contract, or
  EditorProjectionService.
- measurement.schema.yaml:79 enum, AssayDefinition/Instrument zod enums, ingestion kind
  strings — NOT yours.
- A new widget demand in the ui.yaml; any GC-5 runner/engine-registry work; any IQ1.MTH
  semantic mapping; any file under app/ (no UI page here — forms are GENERATED).
- pnpm-lock.yaml (trunk dirt, pre-existing) — leave untouched, `git add` your files
  explicitly, never `-A` over it.

## Report contract
Write ONLY to your unique report path (given in your brief). End stdout with exactly
`GC2 DONE <commit-sha>`. Answer: files created/changed with :line cites; test output
pasted; lint DSL ops you used and why expressible; ChEBI lookups attempted + outcomes
(confirmed id + source URL per term, or honest 'not confirmed'); the two-species rule
audit (no duplicate local terms); assumptions list; any stop boundary touched.
