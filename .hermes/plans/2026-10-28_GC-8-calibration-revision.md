# GC-8 spec: Calibration + quantification revision — curve artifact consumable across runs

**PROMOTED by the orchestrator 2026-10-26T155x after a 100% first-hand cite-audit @ cb6e0f57
(runner provisions analysis-output-artifact inputs, artifactPromotion.ts idempotent+dref path,
inline-artifact `.inline` path never written, ctx.py read_rows dict fall-through, routes.ts:1272
promote route, run/revision/artifact/view schemas, ref.schema type free-string, GC-1 :15 SAMPLE.XML
Amount 0/ISTD 0, fame-local terms, runner harness). TWO cite corrections folded: (1) the run
schema's `inputs` $ref points at `./datatypes/ref.schema.yaml` relative to schema/knowledge/ — a
path that does NOT exist on disk; the real file is `schema/core/datatypes/ref.schema.yaml` and `type`
is a free string there (the draft itself flagged this correctly; restated for the record); (2)
draft's `ctx.py:54-52` typo = :54-60. OQ FOLD (orch rulings):
OQ1 APPROVED as recommended — T3 lane-only smoke, real 6:0/8:0 series, declared placeholder levels
marked `not_production_evidence`, receipt pasted + orch re-runs at gate. OQ2 APPROVED as
recommended — GC-8 stays clean; a platform-side fix of the dict-inline provisioning gap is a
SEPARATE future lane item (with the fields/properties seam gap). OQ3 APPROVED — stdlib-only, NO
scipy import anywhere in GC-8. OQ4 APPROVED — bump `__version__` to 0.4.0, both revisions pin
`sdkVersion: "0.4.0"`, RE-PIN against shipped values at claim. OQ5 APPROVED as spec'd — levels are
PARAMETERS, peak tables are named INPUTS; no calibration-level record kind.
DISPATCH GATE: GC-8 claims ONLY after GC-7 is MERGED to trunk (chain GC-3 -> GC-4/GC-5 -> GC-6 ->
GC-7 -> GC-8); branch off CURRENT tip at dispatch, B1 re-pin is its own first commit.**
Baseline: trunk `cl/integration-1` docs tip cb6e0f57 (GC-7 spec promotion). GC-4/GC-5/GC-6/GC-7
code is NOT on trunk — every anchor into them cites the PROMOTED SPEC (path + section), never an
invented code line. Every [F] cite below was opened FIRST-HAND this session; the two load-bearing
runtime behaviors were additionally **executed** against shipped code (see A5).

## Status legend

- **[F]** = confirmed fact, cite opened first-hand this session (path:line into trunk @ cb6e0f57),
  or behavior PROVEN by executing shipped code in-session (marked [F-run]).
- **[G7]** = shape inherited from the GC-7 promoted spec
  `.hermes/plans/2026-10-28_GC-7-integration-revision.md` (cited by its spec-file lines; code unmerged).
- **[GC5]** / **[GC6]** / **[GC4]** = shape from the promoted GC-5 / GC-6 / GC-4 specs
  (`.hermes/plans/2026-10-27_GC-5-engine-registry.md`, `..._2026-10-27_GC-6-python-d-reader.md`,
  `..._2026-10-26_GC-4-nas-package-registration.md`; code unmerged).
- **[G1]** = binding from the GC-1 promoted report `.hermes/plans/2026-10-26_GC-1-gc-feasibility-spike-report.md`.
- **[I]** = inference / design decision of this spec, flagged for the orchestrator.

## Goal (one sentence)

Ship a stdlib-only calibration-fit module plus a quantification consumer module inside the shipped
Python SDK, driven by two declared analysis-revisions (data repo, engine pinned per GC-5), that
turn DECLARED standard levels + compound identities + RT windows + amounts/units + ISTD roles into
a calibration-table artifact and a fitted-model artifact (coefficients, explicit equation string,
declared correlation statistic, per-point relative residuals, source-point refs), and prove the
acceptance spine — the fitted-model artifact **promoted** from run A is consumed as a NAMED INPUT
by a quantification run B executing on a DIFFERENT run's peak table — with zero hardcoded domain
truth and every failure (missing/duplicate level, bad units, out-of-range sample, ISTD
double-application) a declared failure code.

## Authority (read in this order; scope is theirs, not mine)

1. Task block GC-8, `/home/brad/.hermes/cl/lanes/1/task-list.md:7827-7849` — description
   (:7833-7840) and `verified by` (:7844-7847) are BINDING (re-quoted verbatim below).
   `files:` (:7848) = "calibration revision records + python module, server chaining tests".
2. Wave intake `~/.hermes/specs/intake/2026-10-25_gc-chemstation-analysis-cycle/intake-packet.md`:
   GC-D4 standard-vs-sample (Brad's prompt :7, rulings :45-48 — Compare/overlay is GC-10's, not
   here); raw-proposal `task-list-draft.md:237-250` + `raw-proposal.md:157-167` observable
   acceptance (response-factor conventions declared; fit eligibility; provenance distinguishable
   from measurement-context calibration refs; area% ≠ mass%); assumption 4 (`raw-proposal.md:279`):
   genuine calibration standards are required for production quantitative claims — synthetic
   standards cannot serve as production evidence.
3. GC-7 promoted spec (PEAK TABLE artifact contract §A1 :302-322, parameter contract §A2 :324-348,
   entry-script pattern §A0 :293-300, T2 harness :519-551, artifact table §A3.6 :410-422,
   no-ISTD/no-compound-mapping boundary B6 :286-289) — GC-8's quantification input IS GC-7's
   `peak_table` artifact.
4. GC-5 promoted spec (engineRef §(b) :230-255, engineProvenance §(c) :257-291), GC-6 promoted
   spec (d_reader API D2 :273-324), GC-4 promoted spec (`packageAnalysisInputs` :258, :277).
5. GC-1 promoted report — tolerances :152-158 (RT ≤ 0.02 min / height ≤ 5 % / area ≤ 10 % /
   per-point max(1 %, 5 pA)); FAME context + SAMPLE.XML shape :15 (Amount/Multiplier/Dilution/ISTD
   fields, RES35077-4 carries `Amount 0`, `ISTD 0` — the honest state of real amounts on the NAS).
6. Handoffs 85th-88th `.hermes/plans/handoffs/` — OQ-fold precedent, commit-after-every-step
   (83rd :49, :108-109), end-markers, script-file launchers + slot FIFO (88th §4).

## Acceptance criteria — verbatim from the task list (task-list.md:7844-7847)

> Tests: known-synthetic fit exact; missing/duplicate level, bad units, out-of-range sample,
> ISTD double-application all fail loudly; a second run consumes the promoted curve and
> quantifies; real-standards (6:0/8:0/...) run produces the calibration table artifact.

Description clauses that also bind (task-list.md:7833-7840): standard levels + compound identities
+ RT windows + amounts/units + ISTD roles → calibration table artifact, fitted model (coefficients,
explicit equation, declared correlation statistic, per-point relative residuals, source-point refs).
**Model choice, weighting, origin constraint, extrapolation policy are declared parameters — not
TS-chosen.** Promoted calibration artifact consumable by a quantification run on a DIFFERENT run's
peaks (artifact-promotion chaining). Analytical calibration stays distinct from the acquisition
measurement-context calibration refs. **Area% is never silently mass%/concentration.**

## Oriented facts — shipped reality [F], every line opened first-hand

### The artifact-promotion chain (THE spine — what routes + provisioning ACTUALLY support)

- [F] `server/src/api/routes.ts:1272` — `POST /analysis-artifacts/:id/promote` shipped;
  :1264-1271 revisions/runs/execute all shipped.
- [F] `server/src/analysis/artifactPromotion.ts:38-116` `promoteArtifact(ctx, artifactId)`:
  already-dref-backed artifact → **idempotent return of the existing dref** (:52-58); inline artifact
  → writes `JSON.stringify(inlineValue)` bytes to `<defaultDevice>/analysis-artifacts/promoted/<artifactId>/<name>.json`
  (:72-74), mints a `data-reference` with contentHash (:81-100), links the artifact
  (:103-113). Bytes never enter git.
- [F] `server/src/analysis/analysisRunner.ts:122-149` — `provisionInputs` **already accepts an
  `analysis-output-artifact` as a run input**: artifact → its `dataReferenceRef` (:130-142) →
  streamed to `<inputDir>/<name>.bin` (:166-176). **The cross-run chain needs ZERO route, schema,
  or runner change** — run B's `inputs` map may hold `{kind:'record', id:<AOUT>, type:'analysis-output-artifact'}`.
- [F] `schema/knowledge/analysis-run.schema.yaml:44-48` — `inputs` name→ref, `additionalProperties:
  $ref ref.schema.yaml`; `schema/core/datatypes/ref.schema.yaml:52-55` — `type` is a FREE string
  (file at `schema/core/datatypes/ref.schema.yaml`, NOT `schema/knowledge/datatypes/` — the GC-7
  spec's shorthand resolves here). **Any record type is a legal run input — no gap, no OPEN QUESTION.**
- [F] `analysisService.ts:59-66` `CreateRunInput.inputs: Record<string, {kind:'record'; id; type}>`
  — artifact refs pass through; :96-118 `createRun` freezes inputs at submit.
- [F-run] **THE INLINE TRAP (executed this session against shipped ctx.py):** an UNPROMOTED inline
  artifact whose `inlineValue` is a DICT (e.g. GC-7's `{columns, rows}` peak table) is provisioned
  as `InputSpec.inline` + `path: <inputDir>/<name>.inline` (`analysisRunner.ts:145`) — a path to a
  file that is NEVER WRITTEN. `DatasetHandle.read_rows()` (`ctx.py:54-60`) returns the inline value
  ONLY when it is a **list**; for a dict inline it falls through to `Path(self.path).read_text()` on
  the nonexistent `.inline` path → **`FileNotFoundError` at run time**. A PROMOTED (dref-backed)
  artifact streams real JSON bytes to `<name>.bin`, and `read_rows()` parses the dict-with-`rows`
  payload correctly (`ctx.py:75-93`, `_parse_rows` handles `{"rows": [...]}` — verified by
  execution). **Design consequence: the acceptance spine runs the PROMOTED path; the quantification
  module must read inputs via `file_bytes()` + `json.loads` (never `read_rows()`'s coercion) and
  must fail with a DECLARED code (`INPUT_NOT_PROMOTED`) when handed a dict-inline input — see A5.**
  This is an anchor fact, not scope creep: no runner/schema change is proposed.

### Artifact + record shapes the outputs must satisfy (no edits, verified open enough)

- [F] `schema/knowledge/analysis-output-artifact.schema.yaml` — `inlineValue` (:50) XOR
  `dataReferenceRef` (:52-53); free `schema` (:55-58) + `units` (:60-63) per-field maps — the home
  for calibration column definitions + the **declared amount unit**; `sourceRelations` (:65-69);
  `dataKind` enum (:40-42) incl. `table`/`model`/`metric`; required `[kind,id,title,runRef,name,dataKind]` (:83).
- [F] `analysisRunner.ts:314-327` — blob artifacts always → storage; object values whose JSON
  ≥ 50,000 chars → storage dref; small values stay inline (:340). Calibration payloads are
  tens-to-hundreds of rows — inline is honest; the routing guard still backstops pathological ones.
- [F] `analysisRunner.ts:469` — every artifact auto-gets `sourceRelations` = the run's input refs
  — **the cross-run lineage (quantified table → promoted-model artifact → calibration run) rides
  this shipped field for free**; GC-8 adds nothing to the runner.
- [F] `analysisRunner.ts:432-438` — frozen-field re-check, idempotent-success early return,
  `RUN_ALREADY_STARTED`; :443-445 frozen revision snapshot read — rerun immutability is shipped
  behavior, GC-8 proves it for the chain, adds nothing.
- [F] `analysisRunner.ts:32-53` `analysisSdkDir()` seam — any module added under
  `computable_lab_analysis/` is importable from entry scripts with zero runner change (same finding
  GC-7 §Runner cites).
- [F] `schema/knowledge/analysis-revision.schema.yaml` — `unevaluatedProperties: false` (:12);
  `inputs[]` items dataKind enum incl. `table` (:67-73); `parameterSchema` free JSON-Schema
  (:77-79); required `[kind,id,title,entryScript,sdkVersion]` (:93). Post-GC-5 adds optional
  `engineRef`/`requiredCapabilities` [GC5:230-247]. **No new property needed for GC-8 (B4).**
- [F] `schema/knowledge/view-spec.schema.yaml:29-31` — renderer enum `[table, signal, metric,
  static-figure]` ONLY. Calibration curve renders as a `table` scatter artifact + `table` view;
  the interactive curve view is GC-11's turf, NOT this item.
- [F] `server/python-executor-service/src/computable_lab_analysis/ctx.py` — `publish` (:238-249,
  units/schema verbatim), `publish_file` (:251-288), `metric` (:290-298), `log` (:319-322),
  `DatasetHandle.file_bytes()` (:62-68). `__version__ = "0.1.0"` shipped ([F __init__.py]; GC-6
  folds 0.2.0, GC-7 pins 0.3.0 [GC7:699-703] — GC-8 rides the shipped value at claim, OQ4).
- [F] Runner test harness `server/src/analysis/analysisRunner.test.ts:11-65` — tmp mount `usb0`,
  TEST-WRITTEN config.yaml, `new AnalysisRunner(ctx, '/usr/bin/python3', resolve(process.cwd(),
  'python-executor-service', 'src'))`. `artifactPromotion.test.ts` exists (promotion already has a
  vitest suite to imitate, not extend).

### Lexical-distinctness audit (the "calibration" collision, checked first-hand)

- [F] `schema/lab/calibration-record.schema.yaml:1-30` — kind `calibration-record` (`CAL-*`) = the
  ACQUISITION/QMS equipment-calibration event; `schema/lab/measurement-context.schema.yaml:57`
  `acquisition_context.calibration_refs` = refs pinned AT acquisition;
  `schema/registry/registry-kinds.registry.yaml:24` covers the kind in the ops lifecycle;
  `schema/lab/gc-method.schema.yaml:192-229` `analysis.calibration` = the vendor-captured ISTD/level
  block (capture, not compute). **GC-8 mints NO new kind, NO new record id prefix, NO ontology term.
  Its outputs are `analysis-output-artifact` payloads; "analytical calibration" is a data value
  (`calibration_scope: "analytical"` inside the artifact payload) that keeps it lexically distinct
  from the acquisition vocabulary — no `CAL-` id, no `calibration-record` ref, ever (B4).**
- [F] No existing `quantification` / `calibration_fit` / `fitted_model` module, kind, or schema name
  anywhere in schema/, server/src, app/src (grep this session; the only `response_factor` hits are
  gc-method capture fields [F gc-method.schema.yaml:189-190] — capture data GC-8 never re-declares).
- [F] GC-2 FAME identity terms ship at `schema/registry/ontology-terms/fame-local.yaml`
  (`FAME-LOCAL:hexanoic-acid-n6` etc., chain labels `6:0`/`8:0`/`10:0`, FFA and methyl ester as
  DISTINCT terms). Compound identities arrive as **ref/label data** in level parameters; the module
  NEVER branches on a compound string (hardcode greps below).

### What the upstream specs give GC-8 (cited, NOT restated)

- [G7:302-322] peak_table artifact contract: `{columns, rows}` with `rt_min`, `height_pa`,
  `area_pa_min`, `area_percent`, `saturated`, `flags`; declared-nulls paired with reason codes.
  **The quantifier consumes EXACTLY this; it re-derives nothing.**
- [G7:286-289] B6: GC-7's module NEVER maps RT→compound and NEVER normalizes to an ISTD. **Therefore
  GC-8 owns the ISTD-role combination (A3) — the peak rows carry RAW areas, ratio-to-ISTD is built
  here from declared data.**
- [G7:324-348] §A2 parameter-honesty doctrine applies VERBATIM: the module validates parameters
  itself, absent settings are NOT defaulted, no `params.get(x, default)` laundering, unknown param
  = named failure.
- [G7:410-422] §A3.6: `effective_parameters` inline artifact carrying `params_digest` +
  `source_content_sha256` — GC-8's provenance chain echoes the calibration run's digest into the
  quantification run's artifacts (A6).
- [G7:519-551] T2 harness + GC-6-doctrine synthetic generator pattern; [G7:553-565] T3 lane-only
  smoke pattern — GC-8 mirrors both.
- [GC5:230-255] engineRef pin + [GC5:280-287] engineProvenance; [GC5:313-327] failure tokens.
  GC-8 rides whichever dispatch shape is on trunk AT claim (same B1 posture as GC-7).
- [GC6:273-324] `d_reader.read_ch_bytes` etc. — GC-8 imports NOTHING from d_reader (it consumes
  GC-7's artifacts + declared level data, not raw .CH bytes); it imports the peak-integration
  module ONLY for the calibration-run fixture leg that needs a real peak table from synthetic .CH.
- [GC4:258, :277] `packageAnalysisInputs` — how a calibration run's STANDARD-RUN signal inputs
  arrive in the real-standards leg (identical path GC-7 T3 used); never GC-8's naming assumption.

## Files IN scope

- `server/python-executor-service/src/computable_lab_analysis/calibration_fit.py` (NEW —
  parameter validation, level-matrix assembly, weighted least-squares fitter, correlation/residual
  definitions, artifact payload builders for `calibration_table` + `calibration_model`).
- `server/python-executor-service/src/computable_lab_analysis/quantification.py` (NEW — promoted
  payload loader, RT-window matching, ISTD-ratio combination, inverse prediction, extrapolation
  policy, `quantified_peak_table` payload builder, failure codes).
- `server/python-executor-service/src/computable_lab_analysis/__init__.py` (EDIT, additive: export
  `fit_calibration` and `quantify_peaks`; `__version__` bump per OQ4 fold-default).
- `server/python-executor-service/tests/test_calibration_fit.py` +
  `tests/test_quantification.py` (NEW — unittest, stdlib gate).
- `server/python-executor-service/fixtures/gc-calibration/` (NEW — deterministic builders:
  `make_calibration_fixture.py` (exact synthetic level sets + hand-checkable expected coefficients,
  synthetic peak-table payloads), `cal-entry-reference.py` + `quant-entry-reference.py` (reference
  copies of the two entry scripts; authoritative copies live in revision records, per [G7:293-300]).
  NO committed bytes; generator-produced data only (GC-6/GC-7 doctrine).
- `server/src/analysis/analysisGcCalibrationChaining.test.ts` (NEW vitest — THE chaining spine:
  mint calibration run → promote model artifact → quantification run on a DIFFERENT run's
  `peak_table` → concentrations correct within declared tolerance; harness =
  analysisRunner.test.ts pattern [F :11-65]).
- `.hermes/plans/scripts/gc8-real-standards-smoke.sh` (NEW, LANE-ONLY read-only runbook — the
  real-standards leg, see T3/OQ1; path literals live ONLY here).
- **Calibration/quantification revision RECORDS are data-repo data, NEVER code-repo files.** Their
  payloads appear below as fixtures (§A7) and are minted by the tests through the API into tmp/lane
  data dirs. Nothing in §Files IN scope stores a revision, run, artifact, or engine record in git.

## Explicitly OUT of scope / STOP boundaries (hard stops — report with evidence, exit)

- **B1 Merge order + re-pin at claim.** Deps: GC-7 (+ GC-4/GC-5/GC-6 underneath, all spec-promoted,
  unmerged; GC-7 coder not yet dispatched). Chain: GC-3 → GC-4/GC-5 → GC-6 → GC-7 → GC-8. GC-8
  claims ONLY after GC-7 is MERGED and branches off the CURRENT tip. Step 1 (own commit): re-pin
  against shipped code — peak_table §A1 column names, `integrate_peaks` signature, engineRef/
  engineProvenance spelling, `sdkVersion`/`__version__` chain. Any drift in THEIR names → STOP,
  never rename.
- **B2 No NAS bytes in vitest/unittest.** Real-standards leg = the lane-only read-only smoke script
  (§T3). `/mnt/vast/gc-fid/...` named ONLY inside `.hermes/plans/scripts/`. All test data is
  generator-produced synthetic.
- **B3 Zero edits to GC-4/5/6/7 files or shipped machinery.** No edits to `analysisRunner.ts`,
  `analysisService.ts`, `artifactPromotion.ts`, `routes.ts`, `peak_integration.py`, `d_reader.py`,
  ctx.py, gc-method schemas, coverage pins. GC-8 CONSUMES their shipped APIs. The inline-artifact
  trap [F-run] is discharged in GC-8's OWN code (fail declared + consume promoted) — any pressure
  to touch `provisionInputs` :122-149 = STOP + report (OQ2 carries the alternative ruling).
- **B4 No new schema, no new kind, no new dataKind/renderer enum value, no new HTTP route, no new
  ontology term.** Artifact/view/run shapes verified open enough [F above]. Compound identities are
  `ref`/`label` DATA already minted by GC-2 (`fame-local.yaml`); minting terms here = STOP.
- **B5 Parameter honesty, absolute.** No `params.get(x, default)` anywhere in algorithm position;
  model set, weighting, origin constraint, extrapolation policy, correlation-statistic choice, ISTD
  role, amount units, RT windows ALL arrive as declared parameters/level data. No python-side
  default may supply domain truth (GC-7 doctrine verbatim). Numeric literals permitted only inside
  error-message formatting, docstrings, and float-epsilon constants declared as such.
- **B6 No UI/renderer work (GC-9/GC-10/GC-11), no evidence/claim wiring (GC-13+), no vendor .M
  parsing, no ChemStation parity claims, no acquisition `calibration-record` writes** — analytical
  calibration only (lexical-distinctness audit above).

## Design

### A0 — Shape of the deliverable (two revisions, two modules, one chain)

Same pattern GC-7 established [G7:293-300]: the REUSABLE science lives in two stdlib modules inside
the SDK; the revision `entryScript`s are thin ~25-line consumers; reference copies ship at
`fixtures/gc-calibration/{cal,quant}-entry-reference.py` while the authoritative copies live in the
revision records (data). Two revisions because the acceptance spine is TWO RUNS:

- **Revision CAL** (`fit_calibration(ctx, params)`): named inputs = one peak-table-shaped input PER
  standard level (`level_<k>` — the submitter wires GC-7 `peak_table` artifact refs, or promoted
  drefs of them, into the level slots; the module classifies by CONTENT, never by GC-4/GC-7 naming
  [GC4:258 discipline]) → publishes `calibration_table` + `calibration_model` (+
  `effective_parameters`).
- **Revision QUANT** (`quantify_peaks(ctx, params)`): named inputs = `calibration_model` (the
  PROMOTED model artifact from a CAL run) + `peak_table` (a DIFFERENT run's GC-7 artifact) →
  publishes `quantified_peak_table` (+ `effective_parameters`).
- The compound identity ↔ level ↔ amount ↔ RT-window data is DECLARED PARAMETERS (`levels[]` array —
  parameterSchema constrains; run `parameters` freeze them at submit [F run schema :50-53]). Peak
  tables arrive as INPUTS; levels are PARAMETERS. That split is exactly the shipped contract
  (inputs = record refs, parameters = validated values) and it is what makes "not TS-chosen" checkable.

### A1 — Calibration table artifact (`calibration_table`)

Payload `{rows: [...], columns: [...], amount_unit: <declared>, istd: <declared role echo or null>,
calibration_scope: "analytical"}`; `units` + `schema` ride the publish call verbatim [F ctx.py:238-249].

| column | type | units | definition | null-when (reason code) |
|---|---|---|---|---|
| `level` | int | — | 1-based declared level index | never null |
| `compound_label` | string | — | the declared identity label, echoed verbatim (never parsed, never branched on) | never null |
| `compound_ref` | ref | — | declared ref (GC-2 `FAME-LOCAL:*`/ChEBI data) echoed into `schema`-documented field | null only when the level declared none (then label is the sole identity) |
| `amount` | number | **declared amount unit** (param `amount_unit`, e.g. `ng/uL`) | declared level amount | never null (missing amount = whole-run failure `LEVEL_AMOUNT_MISSING`) |
| `rt_target_min` | number | min | declared window centre | never null |
| `rt_window_min` | number | min | declared ± half-width | never null |
| `peak_source` | string | — | which input name + peak row the response came from | null + `NO_MATCHING_PEAK` (level declared but no peak in window) |
| `response_raw_pa_min` | number | pA·min | matched peak's `area_pa_min` verbatim from GC-7's table [G7:313] — never recomputed | null + `NO_MATCHING_PEAK` / `UNRECOVERABLE_SATURATED` (inherited from GC-7's declared null [G7:313]) |
| `response_ratio` | number | ratio | ISTD-mode only: `response_raw / istd_peak_area` where `istd_peak_area` is the SAME peak table's declared ISTD peak (A3); plain mode: == `response_raw_pa_min` (declared identity, documented) | null + reason inherited |
| `fit_point` | boolean | — | whether the point entered the fit (fit-eligibility is DECLARED per level: `fit: false` excludes, e.g. a top bracket point) | never null |
| `relative_residual` | number | % | (fitted − observed)/observed × 100 on the FIT RESPONSE quantity, per the pinned definition in A2.5 | null + `EXCLUDED_FROM_FIT` / `ZERO_OBSERVED` |
| `flags` | string[] | — | reason codes above | — |

Null/reason pairing invariant (GC-7's, inherited): every null numeric cell names its code in `flags`
(unit test asserts both directions).

### A2 — Fit design (all declared; stdlib; deterministic)

**A2.1 Declared model set** — parameter `model` (enum): `"linear"` (y = b·x + a), `"linear_through_origin"`
(y = b·x), `"quadratic"` (c2·x² + c1·x + c0). Closed enum; anything else → `MODEL_UNSUPPORTED`.
No auto-selection, no "best fit" search — **TS never chooses; the parameter says** (task clause).
x = amount (declared `amount_unit`), y = fit response (A3 rule). Quadratic REQUIRES ≥ 3 fit points
after weighting/eligibility, linear ≥ 2 (≥ 3 whenever a correlation statistic is demanded — see A2.4),
origin-constrained linear ≥ 1; below the floor → `INSUFFICIENT_POINTS` (named, with the count).

**A2.2 Weighting** — parameter `weighting` (enum): `"none"` (w=1), `"1/x"`, `"1/x^2"`, `"1/y^2"`
(inverse-variance proxy on the observed response). Closed enum; `"1/x"` and `"1/x^2"` require every
fitted x > 0 (`WEIGHT_UNDEFINED_AT_ZERO`, named level). Weights enter the normal equations; no
implicit weights anywhere.

**A2.3 Origin constraint** — parameter `origin_constraint` (bool). `true` on `linear` FORCES the
intercept to 0 (equivalent to choosing `linear_through_origin` — both spellings legal, both
documented; the artifact's `equation` string says which was fit). `true` on `quadratic` → declared
failure `ORIGIN_CONSTRAINT_UNSUPPORTED` (no invented half-model). The forced-on-origin case is
exercised explicitly (fixture C6) because silently forcing is a classic reviewer catch.

**A2.4 Correlation statistic — DEFINITION PINNED (the bait-proof paragraph).** `correlation_statistic`
is a declared parameter naming which single statistic the artifact carries:
- `"weighted_r_squared"` = 1 − SS_res/SS_tot with SS_res = Σ wᵢ(yᵢ − ŷᵢ)², SS_tot = Σ wᵢ(yᵢ − ȳ_w)²,
  ȳ_w = Σ wᵢyᵢ / Σ wᵢ — pinned here, emitted verbatim in the artifact's `statistic_definition`
  field so a reader never has to guess. **Undefined (`null` + `STATISTIC_UNDEFINED`) when
  SS_tot == 0** (1 fit point, or all y equal) — never 1.0, never 0.0 substituted. With weighting
  `none` this reduces to ordinary r², documented as such. No Pearson r (it would silently ignore
  declared weights).
- `"max_abs_relative_residual"` = max |relative_residual| over fit points (always defined when ≥ 1
  point with y ≠ 0; null + `ZERO_OBSERVED` handling per A2.5).
Only these two enum values; unknown → `STATISTIC_UNSUPPORTED`.

**A2.5 Residual definition** — per-point relative residual = (ŷ − y)/y × 100 on the FIT response
quantity (raw area in plain mode, ratio in ISTD mode — the artifact's `residual_basis` field says
which in words); y == 0 → null + `ZERO_OBSERVED` (never ±∞, never dropped silently).

**A2.6 Explicit equation string** — built from the ACTUAL coefficients with a fixed format, e.g.
`"response_ratio = 2.0 * amount_ng_uL + 1.0"` — coefficient digits at `repr(float)` round-trip
precision; the artifact ALSO carries structured `coefficients` so nothing is parse-dependent. No
vendor-echo equations (the intake screenshot's `Area = 9.17907206*Amt + 0` inspired the FORMAT only;
that value appears nowhere in code or fixtures).

**A2.7 Failure codes (calibration leg)** — all raised as `CalibrationError(code)` → runner
`RUN_FAILED` naming the code [F runner :208-211]: `LEVEL_AMOUNT_MISSING`, `DUPLICATE_LEVEL` (same
compound_label + same amount declared twice, or two fit-eligible windows overlapping for the same
compound — named both), `UNIT_INVALID` (missing/empty/non-string `amount_unit` — levels share ONE
declared unit; no unit conversion is ever guessed), `RT_WINDOW_INVALID` (window ≤ 0 or target < 0),
`NO_FIT_POINTS`, `INSUFFICIENT_POINTS`, `MODEL_UNSUPPORTED`, `ORIGIN_CONSTRAINT_UNSUPPORTED`,
`WEIGHTING_UNSUPPORTED`, `WEIGHT_UNDEFINED_AT_ZERO`, `STATISTIC_UNSUPPORTED`,
`STATISTIC_UNDEFINED` (never a substitution path), `INPUT_NOT_PROMOTED` (dict-inline input, A5),
`INPUT_JSON_INVALID`, `PEAK_TABLE_SHAPE_INVALID` (required [G7:A1] columns absent — a consumer-side
shape check, never a re-derivation), `ISTD_PEAK_NOT_FOUND` (declared ISTD identity has no matching
peak row in a level's table). `NO_MATCHING_PEAK` is per-level (row present, response null) UNLESS
the level declared `required: true` → hard `LEVEL_UNMATCHED` — `required` is a required boolean per
level entry; no default may decide it (B5).

**A2.8 Algorithm determinism** — weighted normal equations, stdlib floats, `math.fsum` summation,
fixed iteration order (level order). [I] Fractions deliberately NOT used: the fixtures are built so
the exact rational answers are representable within float epsilon (assert ≤ 1e-12 vs hand-computed
values, T1), and Fraction paths would make the float artefacts non-representative of production.
Near-singular guard: scale-relative determinant test fails → `FIT_ILL_CONDITIONED` (declared, never
garbage numbers). Same inputs twice → byte-identical artifacts (json.dumps sort_keys=True compare).

### A3 — ISTD-role semantics (GC-8 owns this; GC-7 tables do NOT normalize)

Binding upstream fact [G7:286-289]: GC-7's peak table carries RAW areas — no ISTD normalization, no
compound identity. The combination rule is therefore GC-8's, entirely declared:

- Parameters `istd.role` (enum `"none" | "internal_standard"`, REQUIRED — absence is never
  normalization-by-default) and, when `internal_standard`, `istd.compound_label` (+ optional
  `istd.compound_ref`, `istd.rt_target_min`, `istd.rt_window_min`) naming WHICH peak row is the
  internal standard in each table — matched by the SAME RT-window machinery as any compound.
- Fit response = `area(analyte) / area(istd peak)` per level table (`response_ratio`, A1); a level
  whose table lacks the ISTD peak → `ISTD_PEAK_NOT_FOUND` (never "fall back to raw area" — a silent
  role switch would mix quantities inside one fit).
- **Double-application guard (acceptance clause):** the ONLY division by an ISTD area in the whole
  system is this one function. `quantification.py` NEVER divides again — it reads the model's
  declared `response_quantity` (`"raw_area_pa_min"` | `"area_ratio"`) and the QUANT parameter
  `istd.role` MUST be consistent with it: `role: internal_standard` against a `raw_area_pa_min`
  model would re-ratio an already-ratioed curve, `role: none` against an `area_ratio` model would
  quantify raw areas off a ratio curve → both hard-fail `ISTD_DOUBLE_APPLICATION` naming both sides.
- Sample amount/multiplier/dilution fields [G1:15 SAMPLE.XML shape] arrive ONLY as quant parameters
  (`sample.multiplier`, `sample.dilution`, ...) applied EXACTLY ONCE in the final reporting step
  (A4.4), with the pinned convention `amount_semantics` (enum `"model_amount_as_reported" |
  "apply_multipliers"`, REQUIRED): the first reports the model's x directly; the second multiplies
  by multiplier and divides by dilution once. Both defaults are 1.0 ONLY as declared numbers in the
  run payload (absent + `amount_semantics: apply_multipliers` → `PARAM_MISSING`, B5).
- The ISTD's own declared amount does NOT enter the fit (ratio calibration: it cancels by design —
  methodNotes states this verbatim; an artifact that "helpfully" rescaled by ISTD amount would be
  the double-application crime in a different coat).

### A4 — Quantification design (the consumer)

Inputs: `calibration_model` (PROMOTED, A5) + `peak_table` (a DIFFERENT run's GC-7 artifact).

1. **Model validation first**: `model_version`, `equation`, `coefficients`, `amount_unit`,
   `response_quantity`, `x_min`/`x_max`, `model_params_digest` all read from the payload; any
   missing/typed-wrong key → `MODEL_PAYLOAD_INVALID` (payload contract = A6; no `read_rows`
   heuristics, no CSV coercion — A5).
2. **RT-window matching**: `targets[]` params (`compound_label`, optional `compound_ref`,
   `rt_target_min`, `rt_window_min`) — the SAME declared-window vocabulary the CAL revision used,
   so identity never invents itself. Peak matching ZERO targets → row kept with compound fields
   null + `UNASSIGNED_PEAK` (the peak is real; identity is unknown — no RT→identity invention
   beyond declared windows, task clause). Target matching MULTIPLE peaks in-window →
   `AMBIGUOUS_PEAK_MATCH` naming both rows (no nearest-RT rescue). Peaks with `area_pa_min` null
   [G7:313] carry the null through with the inherited code (never quantified from null).
3. **Inverse prediction with declared extrapolation policy**: `extrapolation` (enum):
   `"reject"` → response outside the model's declared `[x_min, x_max]`-derived response range:
   `fail_on_out_of_range: true` → hard failure `OUT_OF_RANGE` naming compound + value; false → row
   amounts null + `OUT_OF_RANGE` flag (the LOUDNESS is data, the arithmetic never guesses).
   `"allow_within_declared_extension"` → extra required bounds (`extension_low`/`extension_high`)
   inside which the row is emitted flagged `EXTRAPOLATED`. Any other value → `EXTRAPOLATION_UNSUPPORTED`.
   Linear: x = (y − a)/b; origin-linear: x = y/b; quadratic: roots of c2x² + (c1)x + (c0 − y),
   selection rule PINNED in code + methodNotes: root nearest the fit-range midpoint; both candidates
   recorded in `fit_detail` (auditable); no real root → null + `NO_REAL_ROOT`.
4. **Units + exactly-once factors**: concentration column is NAMED with the model's declared amount
   unit (e.g. `amount_ng_uL` — units-in-names convention [G7:335]); `amount_reported_<unit>` applies
   the A3 multiplier/dilution rule once. Every concentration output carries the calibration's
   declared amount unit — never a re-labelled area unit.
5. **Area%-honesty columns**: `area_percent` from GC-7 verbatim, in its own column, and the
   artifact's `schema` block carries the sentence (verbatim, test-asserted): "area_percent is a
   peak-area fraction of the reported table total; it is NOT a mass fraction, NOT a concentration,
   and is not derived from the calibration model."
6. Metrics: `compounds_quantified`, `peaks_unassigned`, `out_of_range_count`, `ambiguous_matches`,
   `model_params_digest` (echoed), `model_artifact_id`, `params_digest` (quant's own), plus per-leg
   warning logs — machine-readable, matching GC-7's metrics doctrine [G7:403-408].

### A5 — The promoted-input load path (anchor-fact-driven, zero platform change)

[Anchor F-run, executed against shipped code] Dict-inline artifact inputs are unusable through
`DatasetHandle.read_rows()` — FileNotFoundError on a never-written `.inline` path
[analysisRunner.ts:145 + ctx.py:54-52]. Therefore BOTH modules load table/model-shaped inputs via
one helper `load_structured_input(handle, params)`:
1. If `handle.inline` is a dict (unpromoted inline artifact provisioning): allowed ONLY when the
   REQUIRED parameter `allow_inline_inputs` is `true` (declared; the shipped spine never needs it);
   otherwise raise `INPUT_NOT_PROMOTED` naming the input — the DECLARED failure instead of the
   shipped FileNotFoundError crash class.
2. Else `handle.path` (promoted dref streamed to `<name>.bin` [F :166-176], or GC-7 inline-list
   edge) → `json.loads(Path(path).read_bytes())`; unreadable/invalid JSON → `INPUT_JSON_INVALID`.
   NEVER `read_rows()`/CSV auto-coercion [ctx.py:75-121 numeric-guesses strings — a silent
   identity-corruptor for compound labels and a silent mangle of ref objects].
The helper lives in GC-8's OWN module (B3: zero runner/platform edits). The chaining test promotes
BEFORE consuming — exactly the acceptance spine.

### A6 — Artifact + provenance contracts

| artifact | kind | inline/dref | content |
|---|---|---|---|
| `calibration_table` | table | inline (A1 payload; ≥50k routing [F :316-321] backstops) | + `params_digest`, `calibration_scope: "analytical"` |
| `calibration_model` | table | inline | `{model_version: 1, model, equation, coefficients, weighting, origin_constraint, statistic_name, statistic_value, statistic_definition, residual_basis, response_quantity, amount_unit, fit_points: [{amount, response, weight, relative_residual, source_input, source_peak_index, source_point_ref}], x_min, x_max, calibration_run_id, params_digest, calibration_scope: "analytical"}` — `source_point_ref` per fit point = `{artifact_or_dref_id, input_name, peak_row_index}` (source-point refs clause, machine-readable, no new schema) |
| `quantified_peak_table` | table | inline | A4 columns + `model_artifact_id`, `model_params_digest`, `extrapolation_policy`, `amount_semantics`, `calibration_scope: "analytical"` |
| `effective_parameters` | table | inline | both revisions: exact `ctx.parameters` + `params_digest` + `source_content_sha256` echoes from input `meta` [GC6:355-364] — same doctrine [G7:410-422] |

Every artifact auto-carries `sourceRelations` = the run's input refs [F :469]: the quantified table
links → {model artifact id, peak_table artifact id} and the run's frozen `inputs` map freezes both
refs — **cross-run lineage mechanically checkable on shipped fields**. Views: `table` renderer
(shipped enum [F view-spec :29-31]). The interactive calibration-curve view is GC-11's item, not
here (B4).

### A7 — The revision records (DATA — payloads shown as fixtures, minted via API, never in git)

Both records follow GC-7's §A4 shape [G7:424-464]: thin `entryScript` (reference copies per §A0);
`sdkVersion` re-pinned at claim (B1, OQ4); `engineRef`/`requiredCapabilities` per GC-5
[GC5:230-247] (declared capability names `curve_fitting`, `weighted_regression`; GC-5's gate owns
verification — GC-8 re-implements none of it); `methodNotes` stating verbatim: parameters are
declared domain data transcribed by the submitter; the pinned fit/residual/statistic definitions of
§A2; ISTD combination is GC-8's declared step over GC-7's RAW tables [G7:286-289]; analytical
calibration scope is distinct from acquisition calibration refs; quadratic root-selection rule; no
vendor parity. `parameterSchema` REQUIRED lists — CAL: `[model, weighting, origin_constraint,
correlation_statistic, amount_unit, istd, extrapolation, fail_on_out_of_range, allow_inline_inputs,
levels]`; levels items required `[level, compound_label, amount, rt_target_min, rt_window_min, fit,
required]` (+ optional `compound_ref, input_names`). QUANT: `[istd, targets, extrapolation,
fail_on_out_of_range, amount_semantics, allow_inline_inputs]` (+ optional `sample`); the model
contract is NOT re-parameterised (its truth-site is the calibration artifact — a second copy would
be a second truth). Fixture payloads for the vitest legs are §A2/T2-built objects minted via
`service.createRevision` / `createRun` into tmp workspaces — nothing committed.

## Fixtures — known-synthetic fits, hand-checkable (values computed by the composer with
exact-rational arithmetic this session; the generator reproduces them deterministically)

| id | declared data | expected (hand-checkable) |
|---|---|---|
| C1 | linear, w=none, 5 points x=1..5, y = 2x+1 | intercept = 1.0, slope = 2.0 EXACT (float ε ≤ 1e-12), weighted_r_squared = 1.0, all relative_residual = 0.0 |
| C2 | SAME exact line, weights 1,2,3,4,5 | coefficients EXACT (weight-invariance on exact data — catches weight plumbing bugs), r²_w = 1.0 |
| C3 | linear, w = 1,1,4, points (1,2),(2,4),(3,9) | slope = 26/7 = 3.7142857142857144, intercept = −16/7 = −2.2857142857142856, r²_w = 0.9657142857142857, relative residuals −28.571428...%, +28.5714...%, −1.587301...% — all asserted to 1e-12 |
| C4 | quadratic, w=none, x=1..5 on y = 1 + 2x + 0.1x² | c0 = 1.0, c1 = 2.0, c2 = 0.1 (1/10 exact rational; float ε ≤ 1e-12) |
| C5 | `linear_through_origin`, points (1,3),(2,6),(3,9),(4,12) | slope = 3.0 EXACT, `equation` string says `+ 0` form, intercept absent/zero BY CONSTRUCTION flag |
| C6 | origin_constraint=true FORCED on y = 2x+1, x=1..4 | slope = 70/30 = 7/3 = 2.3333333333333335 EXACT (= Σxy/Σx²) — proves forcing happened and is visible in residuals (non-zero!), equation string, and statistic |
| C7 | ISTD ratio mode: level tables each carry analyte peak + declared ISTD peak; analyte area = k·amount, ISTD area constant 1000 | ratio-curve slope = k/1000 EXACT; `response_quantity == "area_ratio"`; quant round-trip recovers declared amounts |
| C8 | quadratic quant inverse: y from C4 model at declared responses; two real roots present | selected root = nearest fit-range midpoint, BOTH roots in `fit_detail` |
| C9 | out-of-range sample: response above x_max model range; both `fail_on_out_of_range` settings | hard `OUT_OF_RANGE` vs declared-null row + flag (policy leg) |
| C10 | duplicate level (same label+amount twice) / missing amount / amount_unit "" | each its named code |

Failure matrix (T1, one named assertion each): C10 legs + `MODEL_UNSUPPORTED`, `WEIGHTING_UNSUPPORTED`,
`WEIGHT_UNDEFINED_AT_ZERO`, `ORIGIN_CONSTRAINT_UNSUPPORTED` (quadratic+origin), `STATISTIC_UNSUPPORTED`,
`STATISTIC_UNDEFINED` (single fit point), `INSUFFICIENT_POINTS`, `ISTD_PEAK_NOT_FOUND`,
`ISTD_DOUBLE_APPLICATION` (both directions, A3), `AMBIGUOUS_PEAK_MATCH`, `UNASSIGNED_PEAK` (declared,
not a failure), `INPUT_NOT_PROMOTED` (dict-inline via a synthetic Context — [F-run] reproducible),
`INPUT_JSON_INVALID`, `PEAK_TABLE_SHAPE_INVALID`, `MODEL_PAYLOAD_INVALID`, `NO_REAL_ROOT`,
`RT_WINDOW_INVALID`, `FIT_ILL_CONDITIONED`, parameter-honesty matrix (missing required → `PARAM_MISSING`
naming it; unknown param → `PARAM_INVALID`; ZERO defaults applied — GC-7 T1-10 pattern).
Determinism leg: same inputs twice → byte-identical artifact JSON (sort_keys compare).

## Test plan

### T1 — Python unit tests (`tests/test_calibration_fit.py`, `tests/test_quantification.py`;
unittest, PYTHONPATH=src, /usr/bin/python3)

Fixtures C1-C10 above + the failure matrix + null/reason-pairing invariant over all fixture outputs
(GC-7's invariant, both directions). Quant tests build peak-table payloads DIRECTLY in the
GC-7 §A1 shape [G7:302-322] (columns/rows dicts) — no GC-7 import needed for the math legs; model
payloads are REAL outputs of `fit_calibration` on the C-fixtures (round-trip honesty: the consumer
consumes the producer's exact artifact, not a hand-copy). `allow_inline_inputs: true` lets unit tests
feed dicts through `Context(inputs=...)` inline without a runner — the declared parameter earning
its keep.

### T2 — Runner-backed chaining (vitest, `analysisGcCalibrationChaining.test.ts`) — THE SPINE

Harness = analysisRunner.test.ts verbatim pattern [F :11-65] (tmp `usb0` mount, TEST-WRITTEN
config.yaml, `/usr/bin/python3`, sdk dir). Entry scripts read from the fixture reference copies.
Legs:

1. **Full chain:** (a) mint GC-7 revision + TWO runs (standard-A synthetic signal, standard-B
   synthetic signal — different synthetic traces ⇒ different runs) [GC-7's module consumed via ITS
   promoted entry pattern; if GC-7 is merged, its artifact is real; if the chain leg needs GC-7
   absent, the leg uses a minimal test revision publishing a §A1-shaped table — the assertion is on
   GC-8's consumption, never on GC-7's math] → two `peak_table` artifacts; (b) mint CAL revision,
   run with level params + the two peak_table artifacts as named inputs (inline dict path exercised
   ONLY with `allow_inline_inputs: true` to prove A5's accept branch); execute → succeeded,
   `calibration_table` + `calibration_model` inline artifacts with the A1/A6 payloads (coefficients
   == C-fixtures within 1e-12, equation string, statistic, residuals, source_point_refs present);
   (c) **promote** the model artifact via the shipped service/route [F artifactPromotion.ts:38-116]
   → dref id asserted on the artifact record; (d) mint QUANT revision, run with inputs
   `{calibration_model: <AOUT ref>, peak_table: <run-B's AOUT ref>}` (B's peak table is from a run
   DIFFERENT from CAL's inputs — the acceptance spine), parameters = targets/istd/policy; execute →
   succeeded; `quantified_peak_table` concentrations match declared synthetic amounts within the
   declared tolerance (`quant_tolerance_percent`, a run parameter, defaulting NOWHERE — the test
   declares it); `amount_reported_<unit>` column named with the declared amount unit;
   `sourceRelations` on the quantified artifact contains BOTH upstream artifact ids (cross-run
   lineage assertion [F :469]); run.payload.inputs freezes the model artifact ref.
2. **A5 reject branch:** same run WITHOUT promotion and `allow_inline_inputs` absent → run `failed`
   naming `INPUT_NOT_PROMOTED` (never the shipped FileNotFoundError class [F-run]).
3. **Failure legs named (via real runs):** `ISTD_DOUBLE_APPLICATION`, `OUT_OF_RANGE` (fail-mode),
   `DUPLICATE_LEVEL` at CAL — each its own run, each asserts status `failed` + message names the code
   [F :208-211].
4. **Immutability leg (chain variant):** re-execute run B → stored manifest verbatim [F :437]; a NEW
   quant run with one changed parameter → new id, first run's stored payload sha unchanged
   (anti-vacuity: if the assertion passes with GC-8 code deleted, it's vacuous — GC-7 bait #5同款).
5. Vitest→unittest spawn wrapper over `tests/` (GC-6 OQ5 / GC-7 T2-5 precedent) as the python gate.

### T3 — Real-standards leg (LANE-ONLY manual read-only smoke; OQ1)

`.hermes/plans/scripts/gc8-real-standards-smoke.sh`: with GC-7 merged and the lane stack up
(`cl-lane-stack.sh 1`), run the REAL 6:0/8:0/... series through the chain: register the standard
.D packages via the live API (GC-4 `packageAnalysisInputs` [GC4:258]), GC-7 integration runs per
standard, declare level params from the scientist-provided amounts (heredoc data in the script =
lane data, acceptable in `.hermes/`), CAL run → **asserts the calibration table artifact lands**
(the `verified by` clause), promote, quantify one sample run. HONESTY GATE (raw-proposal :279,
binding): SAMPLE.XML amounts on the corpus are `0`/placeholder [G1:15] — if genuine amounts are not
scientifically available at gate time, the script prints `GC8 REAL-STANDARDS DEFERRED <reason>` and
the level→artifact leg still runs with DECLARED placeholder amounts marked `provenance_status:
"synthetic_levels_not_production_evidence"` in every emitted artifact's payload; the receipt line is
pasted in the worker report and the orchestrator re-runs at the gate (GC-7 OQ1 posture). NAS bytes
NEVER in vitest (B2); path literals ONLY in this script.

## First targeted check (before any vitest, before the quantification module)

After `calibration_fit.py` + `make_calibration_fixture.py` + T1 C1/C3/C6 only:

    cd /mnt/vast/home/brad/git/cl-integration-1/server/python-executor-service && PYTHONPATH=src /usr/bin/python3 -m unittest tests.test_calibration_fit -v

RED first (module-not-found), then GREEN. This proves the weighted-normal-equations math against the
hand-checked rationals (26/7, −16/7, 7/3) — the riskiest correctness assumption — before anything
runner-adjacent exists.

## Verification (complete, coder-executable)

1. `cd /mnt/vast/home/brad/git/cl-integration-1/server/python-executor-service && PYTHONPATH=src /usr/bin/python3 -m unittest discover -s tests -v`
   → `Ran >= (post-GC-7 baseline + 30) tests ... OK`, exit 0 (baseline re-counted at claim, GC-7
   verification-1 precedent).
2. `cd /mnt/vast/home/brad/git/cl-integration-1/server && npx vitest run src/analysis/analysisGcCalibrationChaining.test.ts src/analysis/analysisGcIntegration.test.ts src/analysis/analysisRunner.test.ts src/analysis/artifactPromotion.test.ts src/analysis/analysisService.test.ts`
   → all pass, 0 failures (last four = zero-regression proof; GC-8 edits none of their files).
3. `npx vitest run` full suite; capture fail-file baseline at claim, report both (house rule).
4. `cd /mnt/vast/home/brad/git/cl-integration-1 && npm run typecheck` → delta vs trunk baseline
   EMPTY in touched files; GC-8 ships ZERO production .ts — any new TS error = scope drift.
5. Hardcode greps — ALL ZERO:
   - `grep -rn "mnt/vast\|gc-fid\|machine1" server/python-executor-service/src server/python-executor-service/tests server/python-executor-service/fixtures server/src/analysis/analysisGcCalibrationChaining.test.ts` → 0
   - `grep -rniE "RESTEK|FAME|KERRYGOLD|WEGMANS|COUNTRYSIDE|CANT.BELIEVE|AOAC|FID1A|butter|hexanoate|octanoate|decanoate|9\.17907206" server/python-executor-service/src/computable_lab_analysis/calibration_fit.py server/python-executor-service/src/computable_lab_analysis/quantification.py server/src/analysis/analysisGcCalibrationChaining.test.ts` → 0
     (compound names/labels are PARAMETER data in tests, allowed in test parameter literals only via
     generic labels like `TEST-CMPD-A`; the fixture generator uses generic labels — REAL labels
     appear only in the lane-only script's heredoc).
   - threshold-literal probe: `grep -nE "0\.9[0-9]|tolerance *=|1e-[0-9]|default" calibration_fit.py quantification.py`
     eyeballed: numeric literals ONLY in float-epsilon constants (`_EXACT_EPS = 1e-12` named as such),
     error formatting, docstrings; EVERY scientific threshold reads from `params[...]`; grep
     `params\[` coverage eyeball (GC-7 §Verification-5 pattern). `params.get(` with a non-None
     second arg in algorithm position = instant REJECT.
   - `grep -rn "read_rows" server/python-executor-service/src/computable_lab_analysis/calibration_fit.py quantification.py` → 0 (A5: file_bytes+json only)
   - `grep -rn "import numpy\|import scipy\|from scipy\|from numpy" calibration_fit.py quantification.py` → 0 (stdlib-only, no optional backend this time — the fit is trivially stdlib; a scipy leg would be scope creep [I], OQ3).
6. `bash .hermes/plans/scripts/gc8-real-standards-smoke.sh` (lane-only, NAS mounted, stack up) →
   receipt line (`GC8 REAL-STANDARDS OK <model artifact id> <n_quantified>` or `... DEFERRED <reason>`)
   in the report.
7. `git -c core.fileMode=false status --porcelain` code repo + lane data repo: diff = §Files IN
   scope ONLY; zero revision/run/artifact/engine record bytes in git; records exist only in tmp
   vitest workspaces / lane data repo.

## Worker contract

- Worktree/branch off lane trunk: `/mnt/vast/home/brad/git/wt/gc-8-lane1-<stamp>`, branch
  `wt/gc-8-lane1-<stamp>` off CURRENT `cl/integration-1` tip AT DISPATCH (draft baseline docs tip
  cb6e0f57; GC-3-fix1, GC-4, GC-5, GC-6, GC-7 all merge ahead of you — B1 re-pin is step 1, its own
  commit). All git `-c core.fileMode=false`; trunk worktree READ-ONLY, commit nothing there.
- Deliverables = §Files IN scope exactly. Report `/home/brad/.hermes/cl/lanes/1/gc-8-report-<unit>.md`;
  commits AFTER every step (83rd handoff §3/§4); end-marker `GC8 DONE <sha>` / `GC8 BLOCKED <reason>`;
  log `lanes/1/logs/coder-GC8-<unit>.log`; script-file launcher + slot FIFO (87th/88th lessons);
  anti-context-death: never read whole spec/review files into the coder session — the brief carries
  the excerpted steps.
- Lane stack via `cl-lane-stack.sh 1` only; never :3001/:5174. Records minted by tests = tmp test
  data; live records via API only, `TEST` title prefix, never hand-edited.
- Stop boundary (requires-rescope, report + exit): pressure to edit GC-4/5/6/7 or platform files
  (B3), a new schema/kind/enum/route (B4), numpy/scipy in the fit (OQ3 unless ruled), NAS bytes in a
  test (B2), read_rows/CSV coercion for structured inputs (A5), GC-9/10/11 UI creep (B6).

## Reviewer bait (edge errors expected for THIS item — the diff must pre-empt them)

1. **The chain leg must run through PROMOTION, not a hand-wired dref.** The acceptance spine is
   artifact→`promoteArtifact`→named input on a second run. A test that mints its own data-reference
   of the table bytes bypasses the shipped chain and proves nothing about GC-8's title. Check T2-1
   calls the promote route/service and asserts the artifact record gains `dataReferenceRef`.
2. **Dict-inline trap substitution.** [F-run] is the crux: if the coder "helpfully" uses
   `read_rows()` on a dict-inline input, the run dies with a FileNotFoundError-class failure — NOT a
   declared code. `INPUT_NOT_PROMOTED` must be raised by GC-8's loader BEFORE any filesystem read;
   the grep `read_rows → 0` is the mechanical gate.
3. **Weighting plumbing lies.** Weight-invariance on exact data (C2) catches weights computed but not
   applied; C3's exact 26/7 / −16/7 catches weights applied to the wrong side of the normal
   equations; C3's r²_w = 0.9657142857142857 (weighted SS_tot with ȳ_w) catches a plain-r²
   substituted for the declared statistic (plain unweighted r² on C3 = 0.9364207221350078 —
   computed this session, DIFFERENT by construction; the test asserting the weighted value is the
   anti-laundering assertion).
4. **Origin-constraint fake.** C6 must show NON-ZERO residuals + slope 7/3 ≠ 2.0. A "forced" fit that
   secretly keeps an intercept shows slope ≈ 2 — the test discriminates.
5. **ISTD double-application is bidirectional.** Both mismatch directions fail
   (`ISTD_DOUBLE_APPLICATION`); a reviewer should try feeding an `area_ratio` model into a quant run
   that also declares `internal_standard` role — success there fails the item.
6. **Area%-laundering.** Any code path that turns `area_percent` into a concentration or drops the
   schema honesty sentence (test-asserted verbatim) fails the description clause. Also: `unit` on
   concentration columns must come from the MODEL's declared amount_unit — a test that renames the
   unit mid-chain trips the column-name check.
7. **Extrapolation silence.** Out-of-range with `fail_on_out_of_range: false` must still be VISIBLE
   (null + flag + metric), never a quiet number; with `true` it must be LOUD (run failed). A reviewer
   should flip both settings on the same fixture (C9).
8. **Parameter-defaults laundering (GC-7 doctrine verbatim).** `extrapolation`, `istd.role`,
   `amount_unit`, `fail_on_out_of_range`, `allow_inline_inputs` are REQUIRED — a `params.get(x,
   safe_default)` anywhere is a hardcoded policy wearing a trench coat. Greps §Verification-5.
9. **Ontology/lexical collision.** No new kind, no `CAL-` id, no `calibration-record` ref, no
   `FAME-LOCAL` mint; `calibration_scope: "analytical"` is the distinctness marker INSIDE artifact
   payloads. A reviewer greps the diff for `calibration-record` (expect 0) and for `kind:` strings
   added to registry files (expect 0).
10. **exactOptionalPropertyTypes** [GC7 bait #7同款]: vitest legs build CreateRevisionInput/
    CreateRunInput payloads — conditional spreads only, no `field: undefined`; ZERO production .ts
    means any tsc noise = scope drift.
11. **YAML-reload trap** [GC7 bait #10同款]: GC-8 ships ZERO schema/lint/ui YAML files. Any `schema/`
    edit in the diff = scope drift (B4).
12. **Vacuous immutability leg** (GC-7 bait #5同款): assert the OLD chain run's stored payload hash
    unchanged + new run's params_digest differs.
13. **Determinism float wobble:** `math.fsum`, fixed level order, sort_keys JSON — if the
    byte-identical leg flakes, fix ordering, never weaken the test (GC-7 bait #11).
14. **Real-standards honesty:** the smoke receipt with placeholder amounts must carry the
    `not_production_evidence` marker; a receipt that silently presents placeholder levels as genuine
    quantitative proof violates raw-proposal :279.

## Open questions for orchestrator (each with recommended default)

1. **Real-standards leg: gate-blocking or declared-deferred?** `verified by` names a
   "real-standards (6:0/8:0/...) run produces the calibration table artifact". The corpus' SAMPLE.XML
   amounts are `0`/placeholder [G1:15] and genuine standard amounts are scientist data not in the
   repo. Recommended default: T3 runs the REAL series for the TABLE leg (levels declared in the
   script's heredoc as lane data, marked `provenance_status: not_production_evidence`), receipt in
   the report, orch re-runs at the gate (GC-7 OQ1 posture); production-evidence quantitative claims
   stay GC-13's gate. Checked: GC-1 report :15, raw-proposal :279, GC-7 OQ1 fold :27-29.
   Alternative: orch supplies vetted amounts before dispatch.
2. **Runner-side fix for the dict-inline trap?** [F-run] proves an unpromoted dict-inline artifact
   input crashes with FileNotFoundError in shipped code. GC-8 discharges it with declared
   `INPUT_NOT_PROMOTED` + promote-first doctrine (zero platform change). Recommended default: keep
   GC-8 clean; if the orchestrator wants the platform hardened, it is a SEPARATE lane item touching
   provisionInputs [analysisRunner.ts:122-149] / ctx.py — NOT folded here (B3). Checked: provisionInputs
   inline branch :143-146, ctx.py read_rows :54-60, executed repro this session.
3. **Stdlib-only fit (no scipy)?** Linear/quadratic WLS is ~80 stdlib lines; the pinned fixtures are
   float-exact. GC-5's engine registry still makes the ENGINE swappable (a future engine record may
   declare `curve_fitting` via scipy and a later revision pin it). Recommended default: no scipy
   import in GC-8 at all (unlike GC-7's lazy backend branch — a second backend doubles the
   correctness matrix for zero science gain). Checked: GC-7 B5/§A3.0 precedent, GC-5 capability
   gate [GC5:257-278]. Alternative: mirror GC-7's lazy branch for symmetry (my read: ceremony).
4. **`sdkVersion`/`__version__` chain.** GC-6 folds 0.2.0, GC-7 pins 0.3.0 [G7:699-703]. GC-8 adds
   two modules. Recommended default: bump `__version__` 0.3.0→0.4.0, both revisions pin
   `sdkVersion: "0.4.0"` — RE-PIN against shipped values at claim (B1 step 1). Checked: shipped
   `__init__.py` 0.1.0 [F], GC-6 spec :203, GC-7 OQ5 fold.
5. **One `levels[]`-array parameter vs per-level inputs for compound identity refs.** This spec puts
   level/amount/window data in PARAMETERS (`levels[]`) and peak tables in named INPUTS — the shipped
   contract's natural split and what makes "not TS-chosen" greppable; GC-9 renders arrays-of-objects
   forms per its own scope. Recommended default: as spec'd. Alternative (orch ruling if the intake's
   "fitting eligibility / response-factor conventions" phrasing implies more): a dedicated
   calibration-level RECORD kind — rejected here (B4 mints nothing; revisit at GC-12/13 if evidence
   wiring demands record-level level provenance).

