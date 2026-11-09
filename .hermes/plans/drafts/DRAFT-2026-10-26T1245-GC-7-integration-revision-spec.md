# GC-7 spec: GC integration revision — peaks as auditable artifacts, zero hardcoded domain truth

DRAFT by cl-spec-composer (lane 1, run 2026-10-26T1245, trunk docs tip 21fed0cc / code tip 89084740).
NOT orchestrator-reviewed; not dispatchable until promoted. Every [F] cite below was opened
FIRST-HAND this session against the trunk worktree /mnt/vast/home/brad/git/cl-integration-1
(git -c core.fileMode=false). GC-5/GC-6 code is NOT on trunk — every anchor into them cites the
PROMOTED SPEC (path + section), never an invented code line.

## Status legend

- **[F]** = confirmed fact, cite opened first-hand this session (path:line into trunk @ 89084740).
- **[G1]** = binding from the GC-1 promoted report `.hermes/plans/2026-10-26_GC-1-gc-feasibility-spike-report.md`
  (cited by its own line numbers; decoder CODE `.hermes/plans/scripts/gc1-decD.py` is normative over
  prose per the errata pointer at report :195).
- **[GC4]** / **[GC5]** / **[GC6]** = shape inherited from the promoted GC-4 / GC-5 / GC-6 specs
  (cited by their spec-file line numbers; code unmerged).
- **[I]** = inference / design decision of this spec, flagged for the orchestrator.

## Goal (one sentence)

Ship a reusable, stdlib-only peak-integration module inside the shipped Python SDK plus a declared
analysis-revision (data repo, engine pinned per GC-5) that integrates a channel's signal **entirely
per declared run parameters** — baseline behaviour, width/slope, area/height reject, timed ON/OFF
events — and emits the peak table (RT, area, height, width, area%, symmetry, each with explicit
definition + units, unavailable values DECLARED null with a reason code), the signal+baseline trace,
and metrics as run artifacts with machine-readable provenance (source hash, reader version, method
revision, effective parameters, actual engine), with ZERO hardcoded NAS paths, method names,
compound lists, or thresholds in code.

## Authority (read in this order; scope is theirs, not mine)

1. Task block GC-7, `/home/brad/.hermes/cl/lanes/1/task-list.md:7803-7826` — description
   (:7809-7816) and `verified by` (:7821-7824) are BINDING. `files:` (:7825) = "analysis revision
   records (data repo), python integration module in SDK/tests, server integration tests".
2. Wave intake `~/.hermes/specs/intake/2026-10-25_gc-chemstation-analysis-cycle/intake-packet.md`:
   "run the analysis and the analysis lands back in CL" (Brad's prompt :7), GC-D3 pluggable-engine
   ruling :47 (:43-48), ChemStation Integration-tab surface inventory :15 (peak table columns #,
   Time, Area, Height, Width, Area%, Sym; global + per-signal timed events), exclusions :57.
3. GC-1 promoted report — tolerances :152-159, saturated-plateau honesty :84/:159, decoder-vs-
   ChemStation caveat :100 (AS-5 :176), venv/engine decision :105-143; errata pointer :195 →
   `.hermes/plans/scripts/gc1-decD.py` is normative decode [F: file exists, read this session].
4. GC-5 promoted spec `.hermes/plans/2026-10-27_GC-5-engine-registry.md` (engineRef pin §(b)
   :230-255, engine gate + interpreter resolution §(c) :257-291, `engineProvenance` shape :280-287,
   adapters §(d), failure matrix §(e)).
5. GC-6 promoted spec `.hermes/plans/2026-10-27_GC-6-python-d-reader.md` (d_reader public API D2
   :273-324, ctx seam D3, manifest `reader` block D4 :343-353, meta pass-through D5 :355-364,
   large-signal route D8 :387-396, failure table :398-416).
6. GC-4 promoted spec `.hermes/plans/2026-10-26_GC-4-nas-package-registration.md` (per-file role
   DREFs + `packageAnalysisInputs` :255-264, :265-283 — how peaks' source signal arrives).
7. Handoffs 84th-87th `.hermes/plans/handoffs/` — OQ-fold precedent, commit-after-every-step
   (83rd §3), end-markers, script-file launchers (87th §1), slot FIFO.

## Oriented facts — shipped reality [F], every line opened first-hand

### Runner + entry-script protocol

- [F] `server/src/analysis/analysisRunner.ts:27` `DEFAULT_PYTHON = '/usr/bin/python3'` — GC-5
  replaces resolution; GC-7 touches nothing here.
- [F] analysisRunner.ts:32-53 `analysisSdkDir()` (env `CLA_ANALYSIS_SDK_DIR` first, module-relative
  fallback, `__init__.py` probe :41) — **any module added under `computable_lab_analysis/` is
  importable from entry scripts with zero runner change**.
- [F] analysisRunner.ts:55-60 `InputSpec { dataKind, path, inline? }` — the TS→SDK input contract
  (GC-6's promoted D5 adds `meta` [GC6:355-364]; post-merge this spec assumes it exists — [GC5]/[GC6]).
- [F] analysisRunner.ts:107-179 `provisionInputs` — per named input resolves a `data-reference`
  (:150-161) or `analysis-output-artifact` → dref (:122-149); streams to `<inputDir>/<name>.bin`
  (:166-172). THE signal-input path: GC-4's `packageAnalysisInputs` [GC4:255-264] yields per-FILE
  refs, so this stays file-shaped once GC-4 lands.
- [F] analysisRunner.ts:182-225 `runPython` — spawns `python -m computable_lab_analysis run
  <entry> --inputs <json> --parameters <json> --input-dir <dir>` (:194), PYTHONPATH=sdkDir (:198);
  non-zero exit → `RUN_FAILED` naming stderr (:210). Python exceptions surface as
  `TypeName: msg` (GC-6 [GC6:76-78]).
- [F] analysisRunner.ts:409-411 `executeRun` = `withRecordLock(... 'analysis:'+runId)` — serialized per run.
- [F] analysisRunner.ts:432-436 frozen-field re-check → `FROZEN_INPUT_CHANGED`; :437-438 idempotent
  success early-return returns the STORED manifest (`status==='succeeded' && outputManifest`) and
  :438 `RUN_ALREADY_STARTED` for a started frozen-revision run — **rerun-immutability is shipped
  behavior; GC-7's "rerun = new immutable run" test proves it, adds nothing**.
- [F] analysisRunner.ts:443-445 revision payload read from `frozenRevisionRef` REV- snapshot when
  present → `entryScript` required (:445). Anything the revision declares is frozen automatically
  (GC-5 [GC5:59-61] same reading).
- [F] analysisRunner.ts:452-460 dispatch `sequenceMethod ? executeSequenceMethod : runPython`
  (GC-5's registry-dispatch turf [GC5:293-311]; GC-7 rides whichever shape is on trunk AT DISPATCH —
  merge order GC-5 → GC-6 → GC-7 is a dispatch precondition, B1).
- [F] analysisRunner.ts:469 `artifact.sourceRelations = Object.values(runPayload.inputs ?? {})` —
  every artifact already gets record-refs to the input DREFs; source file hashes ride the DREF
  records (data-reference.schema.yaml `contentHash` pattern `^[a-f0-9]{64}$` [F :40-42]).
- [F] analysisRunner.ts:314-327 — **large-value routing**: blob artifacts ALWAYS → storage; object
  values whose JSON ≥ 50,000 chars → storage; `persistToStorage` (:232-283) mints a `data-reference`
  record with contentHash/sizeBytes/format. Small values stay `inlineValue` (:340). Large signals
  never inline = DISCHARGED by `publish_file` + this routing — zero TS delta (GC-6 D8 same finding).
- [F] analysisRunner.ts:476-481 completion write: `persistedManifest` (stored artifact payloads,
  refs) + status/completedAt/outputArtifactRefs in ONE `store.update` — GC-5's `engineProvenance`
  write site [GC5:280-287]; GC-7 emits nothing here.
- [F] `analysisService.ts:48-57` `CreateRevisionInput` (title/description/parentRevisionRef/
  entryScript/sdkVersion/methodNotes/inputs/parameterSchema — **NO engineRef on trunk yet**; GC-5
  §(b) [GC5:249-255] forwards `engineRef`/`requiredCapabilities` once merged); :71-94 createRevision
  payload field-by-field with conditional spreads; :96-118 createRun (`inputs` frozen at submit).
- [F] `server/src/api/routes.ts:1264-1272` — POST /analysis-revisions, /analysis-runs,
  /analysis-runs/:id/execute, /analysis-artifacts/:id/promote all shipped.

### Schemas the revision + artifacts must satisfy (no edits, verified open enough)

- [F] `schema/knowledge/analysis-revision.schema.yaml` — `unevaluatedProperties: false` (:12);
  `inputs[]` items `{name, description?, dataKind?, required?}` with dataKind enum incl. `signal`,
  `table`, `binary` (:60-73); `parameterSchema` = free JSON-Schema object (:77-79);
  `required: [kind,id,title,entryScript,sdkVersion]` (:93). Post-GC-5 it additionally carries
  optional `engineRef` + `requiredCapabilities` [GC5:230-247]. **No method-ref property exists —
  method identity travels as declared PARAMETER data (see OQ3), never a new schema property (B4).**
- [F] `schema/knowledge/analysis-run.schema.yaml` — `inputs` name→ref frozen (:44-48),
  `parameters` free object (:50-53) — **the effective-settings carrier: GC-7's provenance clause
  "method revision, effective params" resolves to run.parameters + the revision snapshot**,
  `status` enum (:39-41), `outputManifest` free object (:67-70) — the manifest `reader` block
  [GC6:343-353] and any artifact echo flow through with zero schema change.
- [F] `schema/knowledge/analysis-output-artifact.schema.yaml` — `inlineValue` (:50) XOR
  `dataReferenceRef` (:53), free `schema` (:55-58) + `units` (:60-63) per-field maps — **THE home
  for peak-table column definitions + units**: ship `units` and a `schema.columns` block naming
  every column's definition/units (see §A1); required `[kind,id,title,runRef,name,dataKind]` (:83).
- [F] `schema/knowledge/view-spec.schema.yaml` — `renderer` enum `[ table, signal, metric,
  static-figure ]` (:29-31) ONLY. GC-7 emits views with these shipped renderers; interactive
  chromatogram is GC-10's enum extension, NOT this item (B4).
- [F] `schema/knowledge/data-reference.schema.yaml` — `format` (:55) and `readerVersion` (:59) are
  free strings (GC-6 read the same way).

### The method record's EFFECTIVE SETTINGS — what actually shipped (GC-2), mapped

Task text says integration runs "per the method record's effective settings". What shipped in GC-2
is `schema/lab/gc-method.schema.yaml` (trunk, read first-hand this session):
- [F] `analysis.global` (:128-141): `baseline_correction` enum `[none, tangent_skim, vertical_drop,
  other]`, `skim_ratio`, `valley_to_peak_ratio`, `peak_width_s`.
- [F] `analysis.timed_events[]` (:145-166): required `at_min` + `integration ∈ {on, off}`; optional
  per-event `slope_sensitivity`, `peak_width_s`, `area_reject_au`, `height_reject_au`.
- [F] `analysis.executable_binding` (:221-230) {engine_ref, declared_at} + lint rule
  `gcmethod-timed-events-require-executable-binding` (`schema/lab/gc-method.lint.yaml:20-32`) —
  timed events are CAPTURE; executable use requires the declared binding.
**No code path reads a gc-method record at run time** (the runner provisions data-references and
artifacts only [F provisionInputs]). The effective settings therefore ARRIVE AS RUN PARAMETERS: the
submitter (UI/manual/GC-9 prefill) transcribes the method record's `analysis` section into
`parameters` frozen at submit. This spec (a) defines the parameterSchema 1:1 against the shipped
field names/enums (§A2 mapping table), (b) pins the transcription contract in `methodNotes`, (c)
proves by test that the module consumes ONLY `ctx.parameters` + named inputs. The gc-method record's
identity may travel as the free-text parameter `method_label` [I] — a string value in data, not a
code literal — see OQ3. The `*_au` (arbitrary-unit) reject fields have NO vendor-documented
conversion to pA [G1:20 IQ1.MTH semantics vendor-undocumented] — GC-7's parameters carry EXPLICIT
units (`pa`, `pa_min`); au→physical mapping is scientist-declared data, never a code constant
(OQ3, bait #8).

### GC-1 tolerance + honesty pins the tests are built on [G1]

- [G1:152-158] comparison tolerances (PINNED for test assertions): **RT ≤ 0.02 min; height ≤ 5 %;
  area ≤ 10 %; per-point |Δ| ≤ max(1 %, 5 pA)**; saturated peaks excluded from area comparison.
- [G1:159] saturated flag rule (declared as PARAMETERS, not code constants): flat top = **≥ N
  consecutive points within fraction f of the local max; GC-1 proposes f = 0.5 %, N ≥ 10 — shipped
  as `saturated_top_fraction_of_max = 0.005` / `saturated_min_plateau_points = 10` in the run
  payload, i.e. data**.
- [G1:84] KERRY lesson, binding on the table contract: on a saturated plateau **FWHM and area are
  UNRECOVERABLE — the table must say so** (null + reason code, never a number).
- [G1:100, :176 AS-5] decoder peak lists are LOCAL MAXIMA, not vendor integration; ChemStation's
  own rules will merge/split differently. GC-7 does not claim vendor parity — its synthetic-truth
  tests are the correctness gate; the real-NAS leg is a manual smoke that records agreement WITHIN
  the [G1] tolerances, not vendor agreement.
- [G1:195] errata pointer → decode authority is the code at `.hermes/plans/scripts/gc1-decD.py`
  [F: exists on trunk; BE int16 slots, /60000 time divisor, unbounded accumulators — GC-6 D2 :288-300
  encodes the corrected reading GC-7 consumes].

### Upstream shapes consumed (cited, NOT restated, NOT redefined)

- [GC6:273-324] d_reader public API: `read_ch_bytes`, `decode_sample_xml`, `decode_run_log`,
  `attach(ctx)`; `READER_NAME`/`READER_VERSION`; failure codes `CH_*`/`METADATA_*` (GC-6 failure
  table :398-416). GC-7 imports these names, defines none of them.
- [GC6:343-353] manifest `reader: {name, version, sdk_version}` block set by `attach()` → flows to
  stored `outputManifest` with zero TS change → "reader version recorded" leg of GC-7's provenance.
- [GC6:355-364] D5: input `meta {sourcePath, contentHash}` pass-through → the reader's `meta.source`
  + GC-7's `effective_parameters` artifact echo the source hash WITHOUT re-hashing (GC-5 owns the
  execute-time re-hash [GC5:289-291]).
- [GC5:230-247] revision `engineRef` (ref host pinned `type: const analysis-engine`, id
  `^ENG-[A-Za-z0-9_-]+$`, optional in schema); [GC5:257-278] interpreter resolution + probe;
  [GC5:280-287] `engineProvenance` = {engineRef, engineRecordId, engineVersion, adapter,
  interpreterPath, interpreterVersion, packages:[{name,required,actual}], probedAt,
  capabilitiesReported}; [GC5:293-311] adapters `python-entry-script` / `stub-echo`; [GC5:313-327]
  failure tokens (`ENGINE_UNAVAILABLE`, `ENGINE_CAPABILITY_UNSUPPORTED`, …).
- [GC4:255-264] `packageAnalysisInputs(ctx, packageRecordId)` → per-file `name → data-reference`
  input map (roles [GC4:221-228]); GC-7's revision declares INPUT NAMES generically
  (`signal1`…`signalN`, optional `sampleMeta`, `runLog`) and classifies by CONTENT via GC-6's
  attach-style sniffing — **the module must never assume GC-4's naming** (GC-6 D3 same rule).

## Acceptance criteria — verbatim from the task list (task-list.md:7821-7824)

> Numerical tests within GC-1 tolerances incl. a real NAS .D end-to-end run; grep-proved no
> hardcoded paths/compounds; rerun = new immutable run; provenance (source hash, reader,
> method revision, effective params, actual engine) machine-readable in the run.

Description clauses that also bind (task-list.md:7809-7816): reusable analysis-revision (Python,
engine per GC-5) implementing peak integration **per the method record's effective settings**:
baseline behaviour, width/slope, area/height reject, timed ON/OFF events. Outputs as artifacts: peak
table (RT, area, height, width, area%, symmetry — definitions + units explicit; **unavailable values
declared, not faked**), signal+baseline, metrics. **Consumes named inputs + parameterSchema only** —
no NAS path, method name, or FAME compound list in code. **Acceptance/reject thresholds arrive as
declared data.** Fixtures: isolated peaks, overlapping, baseline drift, timed exclusions, empty
signal, agreed tolerances. The "real NAS .D end-to-end run" leg = lane-only manual read-only smoke
receipt (B2 — never inside vitest, same doctrine GC-6's promotion kept).

## Files IN scope

- `server/python-executor-service/src/computable_lab_analysis/peak_integration.py` (NEW — the whole
  integration core: parameter validation, timed events, baseline model, detection, widths/rejects,
  peak-table + artifact payload builders). Placement inside the shipped SDK structure = the task's
  "python integration module in SDK"; importable from entry scripts via the shipped sdk-dir seam
  [F analysisRunner.ts:32-53] with zero runner change.
- `server/python-executor-service/src/computable_lab_analysis/__init__.py` (EDIT, additive: export
  `integrate_peaks`; `__version__` bump per OQ5 fold-default).
- `server/python-executor-service/tests/test_peak_integration.py` (NEW — unittest, stdlib gate).
- `server/python-executor-service/fixtures/gc-peaks/make_peak_fixtures.py` (NEW — DETERMINISTIC
  synthetic-signal GENERATOR only: isolated / overlapping / drift / timed-exclusion / empty /
  saturated traces as pure Python; committed generator, NEVER committed signal bytes — same doctrine
  as GC-6's `fixtures/gc-d/` [GC6:208-210]).
- `server/src/analysis/analysisGcIntegration.test.ts` (NEW vitest — runner-backed integration
  minting a REAL revision record through AnalysisService; harness = analysisRunner.test.ts pattern
  [F: test file :15-59 read this session]).
- `.hermes/plans/scripts/gc7-nas-e2e-smoke.sh` (NEW, LANE-ONLY read-only runbook: end-to-end on the
  real RES35077-4.D via the lane stack or direct CLI — the acceptance's real-NAS leg).
- **Revision RECORDS are data-repo data, NEVER code-repo files.** Their YAML/JSON payloads appear in
  this spec as fixtures (§A4) and are minted by the tests/vitest through the API into tmp/lane data
  dirs. Nothing in §Files IN scope stores a revision, run, engine, or gc-method record in git.

## Explicitly OUT of scope / STOP boundaries (hard stops — report with evidence, exit)

- **B1 Merge order.** Deps GC-5 + GC-6 code are spec-promoted, unmerged (verified posture identical
  to GC-6's authority-boundary note). Dispatch/merge order **GC-5 → GC-6 → GC-7**; GC-7 claims ONLY
  after both are on trunk and branches off the CURRENT tip. At claim, re-pin: `engineRef` forwarding,
  `engineProvenance` keys, `d_reader` API names, `attach()` shape, input `meta` — against shipped
  code. Any drift in THEIR names → STOP (B3), never rename.
- **B2 No NAS bytes in vitest/unittest.** Real-NAS end-to-end = the lane-only smoke script (read
  only, `/mnt/vast/gc-fid/machine1/...` named ONLY inside `.hermes/plans/scripts/`, never under
  `server/`). Fixture .CH bytes are GENERATOR-produced synthetic (GC-6 doctrine).
- **B3 Zero edits to GC-4/GC-5/GC-6/GC-2 files.** No edits to `analysisRunner.ts`,
  `analysisService.ts`, `d_reader.py`, ctx.py beyond NOTHING (GC-6 owns its seams), `engineAdapters.ts`,
  `schema/lab/gc-method.*`, engine triplet, coverage pins. GC-7 CONSUMES their shipped APIs.
  Any gap found = STOP + report.
- **B4 No new schema, no new kind, no new renderer enum, no new HTTP route.** The artifact/view/run
  shapes verified open enough [F above]. If a `methodRef`-style property starts looking necessary →
  STOP (OQ3 rules the alternative). Peak table is a `table` artifact + `table` view.
- **B5 No scipy/numpy import at module import time; no scipy requirement for the stdlib path.**
  scipy is an OPTIONAL declared backend (§A3.0) — lazily imported ONLY when `parameters.backend ==
  "scipy"` AND then absent = declared `IntegrationError BACKEND_UNAVAILABLE`, never a silent
  fallback to/from scipy (GC-5's no-substitution policy mirrored in python). Rationale: the shipped
  python test gate runs on `/usr/bin/python3` where numpy/scipy are ABSENT [G1:107].
- **B6 No vendor-parity claims, no .M parsing, no deconvolution, no calibration/quantification
  (GC-8), no UI/renderer work (GC-9/GC-10), no evidence wiring.** Compound identities: the module
  NEVER maps RT→compound; `label` in the peak table is the peak index (compound assignment is GC-8's
  calibration job).

## Design

### A0 — Shape of the deliverable

Entry scripts are strings stored in the revision record (data). The REUSABLE part — everything
scientific — lives in `peak_integration.py` inside the SDK (importable, unit-testable, reviewable);
the revision's `entryScript` is a thin ~30-line consumer: decode inputs → `integrate_peaks(ctx,
decoded, params)` → publish artifacts. A reference copy of the entry script ships at
`fixtures/gc-peaks/entry-reference.py` (fixture data for review + the vitest leg reads it into
`createRevision`) — the authoritative copy stays in the revision record (data repo).

### A1 — Peak table: column definitions, units, declared-nulls (the artifact contract)

Peak table artifact: `ctx.publish('peak_table', {columns: [...], rows: [...]}, kind='table',
units=UNITS, schema=COLUMNS)` — `units`/`schema` flow onto the artifact record verbatim
[F :337-338]. Definitions (all reproducible from the shipped signal+baseline artifact):

| column | type | units | definition | null-when (reason code) |
|---|---|---|---|---|
| `peak` | int | — | 1-based index in RT order | never null |
| `rt_min` | number | min | time-axis value at the max sample inside the peak window | never null |
| `height_pa` | number | pA | max sample value minus the peak's baseline at the RT point | never null (sub-baseline maxima are rejected, not tabled) |
| `area_pa_min` | number | pA·min | trapezoid of max(signal − baseline, 0) over the peak's start/end window (the GC-1 decD area method, `.hermes/plans/scripts/gc1-decD.py:107` [F: opened this session]) | `null` + `UNRECOVERABLE_SATURATED` (flat top, §A3.5) or `REJECTED_*` rows never appear |
| `width_min` | number | min | `area_pa_min / height_pa` (the tangential-equivalent width definition; declared in `schema`, not inferred by readers) | `null` + `UNRECOVERABLE_SATURATED`, or `UNDEFINED_ZERO_HEIGHT` |
| `area_percent` | number | % of reported total | `area / Σ(reported non-null areas) × 100` over the CURRENT table; **undefined when ANY accepted peak's area is null or Σ == 0** → every row's `area_percent` is `null` + `UNDEFINED_SIBLING_AREA_NULL` / `UNDEFINED_ZERO_TOTAL` — never a partial percentage presented as complete | see left |
| `symmetry` | number | ratio | `f / b` at half height: `f` = RT − t_f where t_f is the last crossing of (baseline + height/2) BEFORE the RT; `b` = t_b − RT where t_b is the first crossing ABOVE half height AFTER the RT (front/back half-height widths; symmetric ≈ 1; declared in `schema`) | `null` + `UNRECOVERABLE_SATURATED` / `UNDEFINED_HALF_HEIGHT_UNBOUNDED` (a half-height crossing runs off the peak window) |
| `saturated` | boolean | — | declared rule evaluated per peak: ≥ `saturated_min_plateau_points` consecutive samples within `saturated_top_fraction_of_max` of the peak's max [G1:159, values ARRIVE AS PARAMETERS] | never null |
| `flags` | string[] | — | reason codes above + `TIMED_OFF_WINDOW` boundary notes | — |

Every `null` cell is accompanied by its reason code in `flags` — "unavailable values are DECLARED,
never faked" is mechanically checkable: a row with a null numeric column MUST have a reason code
(unit test asserts the pairing both ways).

### A2 — Parameter contract (the effective-settings mapping; parameterSchema is the validator)

`parameterSchema` is free-form JSON-Schema [F revision schema :77-79]; run `parameters` are stored
verbatim [F run schema :50-53]. The module VALIDATES parameters itself (the runner does not — it
passes them through [F :190]) and fails loudly with named `IntegrationError` codes on anything
missing/unknown — absent settings are NOT defaulted (GC-2's unknown-is-unknown rule, gc-method
header :6-8). Mapping to the shipped gc-method fields:

| parameter (type, unit) | gc-method field [F :128-166] | notes |
|---|---|---|
| `baseline_correction` (enum `none\|tangent_skim\|vertical_drop\|other`) | `analysis.global.baseline_correction` | same enum values; `other` → declared failure `UNSUPPORTED_BASELINE_CORRECTION` (no invented semantics) |
| `baseline_window_s` (number, s) | — (new, REQUIRED) | snaking rolling-min window for the global baseline; unit-EXPlicit in the name (gc-method units-in-field-names convention [F :53]) |
| `peak_width_s` (number, s) | `analysis.global.peak_width_s` | expected peak width → detection `distance` and width-plausibility gate (× declared factors `min_width_factor` / `max_width_factor`, required numbers) |
| `slope_sensitivity` (number, fraction 0-1) | per-event field, globalized | prominence threshold = fraction of the trace's robust range (max − global baseline); ChemStation-style sensitivity as DECLARED fraction, not a vendor step |
| `area_reject_pa_min`, `height_reject_pa` (numbers, pA·min / pA) | `timed_events[].area_reject_au` / `height_reject_au` | **unit-explicit params replace `*_au` — au conversion is scientist-declared data, never a code constant (OQ3)**; absent param = that reject leg off (declared, logged) |
| `timed_events` (array of `{at_min: number ≥ 0, integration: 'on'\|'off', slope_sensitivity?, peak_width_s?, area_reject_pa_min?, height_reject_pa?}`) | `analysis.timed_events[]` | same shape + same required fields as shipped :150-166; per-event overrides replace the globals from `at_min` forward; first event MUST be `on` coverage rule: window before first event = `integration` value in force (default `on`, DECLARED + logged) |
| `saturated_top_fraction_of_max` (number, fraction), `saturated_min_plateau_points` (int ≥ 2) | — (new) | the [G1:159] proposal, shipped as DATA per its own "not yet a lint rule" note |
| `backend` (enum `stdlib\|scipy`) | — (new) | §A3.0; engine-record capabilities gate which values are honest [GC5:276-278] |
| `method_label` (string, free text, OPTIONAL) | gc-method record identity | provenance echo ONLY into `effective_parameters`; never parsed (OQ3) |
| `channel` (string, OPTIONAL) | — | selects the decoded signal when multiple; else single-signal assumption + log; never a filename literal |

The transcription contract (method record `analysis` section → run `parameters`) is documented in
the revision's `methodNotes` (schema field [F :56-58]) verbatim: "values transcribed from
gc-method <identity> analysis section, fields 1:1 per the spec §A2 table; unit-bearing fields
carry their units in their names". The transcription step itself (UI prefill) is GC-9's job.

### A3 — Algorithm (stdlib core; deterministic; every step parameter-gated)

#### A3.0 Backend selection
`integrate_peaks` is PURE STDLIB (lists, math) — 72,801 points worst-case corpus size [G1:161-166]
runs in well under a second of CPython (decD's own metrics loop was sequential [G1:87]). `backend:
"scipy"` (optional param): lazily `import scipy` INSIDE the branch; ImportError →
`IntegrationError("BACKEND_UNAVAILABLE: backend=scipy requested but scipy not importable")` —
declared failure, never auto-fallback [GC5 no-substitution mirrored]. V1 acceptance tests run the
stdlib backend ONLY (the /usr/bin/python3 gate has no scipy [G1:107]); the scipy branch exists so a
GC-5 engine record may declare `peak_detection: supported` honestly and is exercised by ONE test on
the provisioned venv IF the launch brief provides `CLA_ANALYSIS_PYTHON` pointing at it — else that
single test is skipped with an explicit report line, never silently.

Pipeline (function `integrate_peaks(ctx, decoded_signals, params) -> dict`, pure w.r.t. inputs):

1. **Validation** — required params present, types/ranges sane, enums closed, timed_events sorted
   by `at_min`, `at_min` inside axis range warn-logged (an event past the trace end is DECLARED via
   a log line, not swallowed). Failure codes: `PARAM_MISSING`, `PARAM_INVALID`,
   `UNSUPPORTED_BASELINE_CORRECTION`, `BACKEND_UNAVAILABLE` (each its own test).
2. **Timed-event resolution** — per-sample boolean array `integration_on` built from the half-open
   `[at_min_i, at_min_{i+1})` walk; per-segment effective settings snapshot (slope/width/rejects).
   Segments with `integration: off` contribute NOTHING (peaks neither detected NOR baselined INTO
   the table; the emitted baseline trace still covers them — it's the measured baseline, honest).
3. **Baseline model** (`baseline_correction`):
   - `none`: y = 0 line (declared; height/area are raw — logged so nobody misreads it).
   - `vertical_drop`: snaking rolling-min over `baseline_window_s` (min filter on the down pass,
     carried on the up pass — the classic ChemStation-style drop), then a monotone-free smoothing
     pass `k = max(1, round(peak_width_s / dt))` points centered moving-min. Deterministic stdlib
     implementation; per-segment the window resets at `off` boundaries.
   - `tangent_skim`: baseline = vertical_drop baseline, then for each valley between adjacent
     detected maxima whose valley floor rises above the smaller flank's half-height by ratio
     `skim_ratio` [F gc-method global field], the valley region is skimmed to the straight line
     between the two flanks' crossing points (`valley_to_peak_ratio` gates which valleys skim).
     ORDERING DECLARED: detect → baseline → skim → re-measure. This is a DECLARED interpretation of
     the vendor concept (semantics vendor-undocumented [G1:20]); `methodNotes` says so verbatim;
     synthetic tests pin ITS behavior, not ChemStation's.
4. **Detection** (per `on` segment): prominence threshold = `slope_sensitivity × (segmax − baseline
   min)`; local maxima strictly greater than both neighbours AND above `baseline + threshold`;
   minimum inter-peak distance `peak_width_s / dt` (segment-effective value). Overlap handling:
   NO deconvolution (out of scope, [G1:136-136] U everywhere) — resolved-envelope local maxima each
   become a row with the shared-region area measured against the skimmed baseline and flagged
   `OVERLAP_SHARED_BASELINE` (the GC-1 AS-5 honesty rule: an envelope is not N compounds, and we
   never pretend the split is clean).
5. **Width / reject filters**: drop maxima whose `width_min` is outside
   `[min_width_factor, max_width_factor] × peak_width_s` (→ `REJECTED_WIDTH`, counted metric); drop
   rows under `area_reject_pa_min` / `height_reject_pa` (segment-effective) → `REJECTED_AREA` /
   `REJECTED_HEIGHT` counts. Rejections NEVER vanish silently: the metrics artifact carries
   per-reason rejection counts + the trace emits a `ctx.log` per rejected peak (the reject thresholds
   ARE the declared acceptance criteria — task clause).
6. **Saturated-plateau rule** [G1:84, :159]: a peak whose top has ≥ `saturated_min_plateau_points`
   consecutive samples within `saturated_top_fraction_of_max` of its max → `saturated: true`;
   `area_pa_min`, `width_min`, `symmetry` = null + `UNRECOVERABLE_SATURATED`; RT + plateau top
   (height) remain (they ARE measurable [G1:159 "compare RT and plateau top only"]).
7. **Metrics** (via `ctx.metric`, unit-tagged): `peaks_detected`, `peaks_rejected_width|area|height`
   (per reason), `saturated_peaks`, `baseline_noise_p95_pa` (p95 |signal−baseline| over `on`
   segments), `timed_off_duration_min`, `integration_coverage_fraction`, `params_digest` (sha256 of
   the canonicalized params JSON — the provenance echo key), `source_content_sha256` (from GC-6
   input `meta.contentHash` [GC6:355-364] — echo, never re-hash; absent meta → metric omitted +
   warning log, DECLARED).

#### A3.6 Artifact + view output contract (entry script publishes exactly this set)

| artifact name | kind | inline or dref-backed | content |
|---|---|---|---|
| `peak_table` | table | inline (rows ≤ dozens; the ≥50k routing [F :316-321] still guards pathological cases) | §A1 columns/rows + per-column `units` + `schema` definitions |
| `signal_plus_baseline` | signal | `publish_file` of a tempfile JSON `{axis, values, baseline, axis_units: "min", value_units: "pA", integration_windows}` → blob → dref [F :314-327; GC-6 D8 pattern incl. the tempfile-lifetime note [GC6:396]] | full-resolution trace + baseline + off-window mask |
| `effective_parameters` | table (small) | inline | the EXACT run parameters + `params_digest` + `method_label` when declared + `source_content_sha256` + reader block copy — machine-readable provenance INSIDE an artifact, consumable by evidence wiring (GC-8+) |

Views: `table` view on `peak_table`, `signal` view on `signal_plus_baseline` (static polyline today
— fine; GC-10 replaces the renderer, not this contract), `metric` views optional. Metrics ride
`manifest.metrics`. Every artifact automatically gets `sourceRelations` = input refs [F :469].
Blob lifetime: tempfile under `tempfile.mkstemp` (process tmp), file must survive until the runner
persists [GC6:396].

### A4 — The revision record (DATA — payload shown as fixture, minted via API, never in git)

```yaml
# analysis-revision record payload (data repo; created via POST /analysis-revisions)
kind: analysis-revision
id: ANREV-<minted>
title: "GC peak integration — declared-settings revision 1"
description: >-
  Reusable peak-integration revision. Consumes named signal inputs (per-file DREFs from an
  acquisition package via packageAnalysisInputs) and run parameters transcribed 1:1 from a
  gc-method record's analysis section. Zero hardcoded domain truth.
entryScript: |
  # reference copy: fixtures/gc-peaks/entry-reference.py (authoritative copy lives HERE, as data)
  from computable_lab_analysis.d_reader import attach
  from computable_lab_analysis.peak_integration import integrate_peaks
  def run(ctx):
      decoded = attach(ctx)                 # GC-6 public API: decode + manifest reader block
      integrate_peaks(ctx, decoded, ctx.parameters)
sdkVersion: "0.3.0"                          # post-GC-6 bump chain — re-pin at dispatch (OQ5)
engineRef: { kind: record, type: analysis-engine, id: ENG-<lane stub or scipy-core record> }
requiredCapabilities: [peak_detection, baseline_control, timed_integration_windows,
                       area_height_reject, width_slope_sensitivity]
inputs:
  - { name: signal1, dataKind: signal, required: true, description: "channel .CH bytes (per-file DREF)" }
  - { name: sampleMeta, dataKind: binary, required: false, description: "SAMPLE.XML when provided" }
  - { name: runLog, dataKind: binary, required: false, description: "RUN.LOG when provided" }
methodNotes: >-
  Baseline/detect/reject pipeline per spec §A3. baseline_correction semantics are DECLARED
  interpretations of vendor-undocumented concepts (GC-1 IQ1.MTH note); tangent skim ordering:
  detect -> baseline -> skim -> re-measure. Saturated-plateau columns are DECLARED-null (GC-1
  honesty clause). Parameters transcribed from a gc-method record's analysis section 1:1 per the
  spec §A2 mapping; timed_events capture is executable only under the method's declared
  executable_binding (gc-method lint) — this revision is that declaration's consumer.
parameterSchema:            # JSON-Schema; §A2 fields; every number carries its unit IN the name
  type: object
  required: [baseline_correction, baseline_window_s, peak_width_s, slope_sensitivity,
             min_width_factor, max_width_factor, saturated_top_fraction_of_max,
             saturated_min_plateau_points, backend]
  properties: { ...verbatim per §A2 table, timed_events.items mirroring gc-method :150-166
                required [at_min, integration]... }
```

Engine record choice per GC-5: the lane may run the `python-entry-script` adapter against either the
system interpreter (stdlib backend — honest: `peak_detection: approximate` per the GC-1 matrix
[G1:135] ratings) or the provisioned venv record (numpy/scipy pins [G1:113-117], `supported`).
GC-7's tests use the STDLIB path on `/usr/bin/python3` injected via the runner constructor (the
existing test channel) so the vitest gate never depends on the venv.

## Test plan

### T1 — Python unit tests (`tests/test_peak_integration.py`, unittest, PYTHONPATH=src, /usr/bin/python3)

Generator `fixtures/gc-peaks/make_peak_fixtures.py` (deterministic, seeded, no file bytes committed —
returns in-memory `{axis, values}` lists; ALSO writes a synthetic v181 .CH via GC-6's promoted
encoder doctrine so the vitest leg has real bytes):

1. **Exact Gaussian analytic case (hand-checkable):** single Gaussian, amplitude A = 1000 pA,
   σ = 0.1 min, dense grid dt = 0.001 min, baseline `none`. Assert `height_pa` = 1000 ± 0.1 %,
   `area_pa_min` = A·σ·√(2π) = 250.66 pA·min within **0.5 %** (trapezoid discretization bound is
   ≤ 1e-6 relative at this dt; 0.5 % is generous and stated), `width_min` = area/height within
   0.5 %, `symmetry` ∈ [0.99, 1.01], `area_percent` = 100.0 exactly.
2. **Isolated peaks:** 3 Gaussians at declared RTs, widths 0.05/0.10/0.20 min on a flat 10 pA
   offset, `vertical_drop` baseline → RTs within **0.005 min** (grid-limited, inside the pinned 0.02
   [G1:155]), heights within **2 %** (pinned 5), areas within **2 %** (pinned 10).
3. **Baseline drift:** linear drift 10→60 pA over the trace → drift case repeats case-2 tolerances
   (10 % area) AND `baseline_noise_p95_pa` < drift span (the baseline artifact trace is readable
   back and asserted pointwise within **max(1 %, 5 pA)** of the generator's drift line [G1:158]).
4. **Overlapping:** two Gaussians at ΔRT = 1.0 σ → BOTH rows present, each flagged
   `OVERLAP_SHARED_BASELINE`, sum of areas within 10 % of the analytic sum (shared region is
   trapezoid-continuous), neither width inside the reject gate (proves no vanishing).
5. **Timed exclusions:** event table `[on@0, off@1.0, on@2.0]` with a peak at 1.5 min → that peak
   ABSENT from the table but `timed_off_duration_min` = 1.0 and per-peak reject metric
   `skipped_integration_off` counts it (declared, never vanished); a peak at 0.5 survives.
6. **Reject thresholds:** area_reject/height_reject params each drop the declared peak and bump the
   matching metric; absent params → the leg is off + warning log (declared-off).
7. **Width reject:** a spike (2 samples wide) with `peak_width_s`=0.1, `min_width_factor`=0.3 →
   `REJECTED_WIDTH`.
8. **Saturated plateau:** synthetic flat-top peak (30 samples at max) with the GC-1 proposed
   fraction/counts as params → `saturated: true`, area/width/symmetry null WITH reason code,
   height/RT present; `area_percent` null on ALL rows + `UNDEFINED_SIBLING_AREA_NULL`.
9. **Empty signal:** all-zeros, n = 5000 → succeeded, `peak_table.rows == []`,
   `peaks_detected == 0`, metrics present, NO fabricated row; axis-less input (n == 0) →
   `IntegrationError PARAM_INVALID`-class named failure (never an empty success that looks real).
10. **Parameter honesty matrix:** missing required param → `PARAM_MISSING` naming it; unknown param
    name → `PARAM_INVALID` (no silent ignore); `baseline_correction: other` → declared failure;
    event array unsorted / out-of-range → its named code. Zero defaults applied.
11. **Determinism:** same inputs twice → byte-identical `params_digest`, table JSON, metrics
    (json.dumps sort_keys=True compare).
12. **Null/reason pairing invariant** (§A1) asserted over ALL fixtures' outputs.
13. **scipy branch honesty:** with `backend: scipy` on /usr/bin/python3 → `BACKEND_UNAVAILABLE`
    raised (this is the GREEN assertion on the stdlib-only gate); if env `CLA_ANALYSIS_PYTHON` names
    a scipy venv, one extra subprocess test runs `backend: scipy` end-to-end and asserts results
    agree with the stdlib backend within the pinned [G1:152-158] tolerances (engine-swappability
    proof: same revision, different engine, old run's stored table byte-unchanged [GC5:310-311]).

### T2 — Runner-backed integration (vitest, `analysisGcIntegration.test.ts`)

Harness = analysisRunner.test.ts verbatim pattern (tmp mount `usb0`, TEST-WRITTEN config.yaml,
`new AnalysisRunner(ctx, '/usr/bin/python3', resolve(process.cwd(), 'python-executor-service',
'src'))` [F test :15-59]). Synthetic .CH bytes from the GC-6-doctrine generator (≥ 25k points so
the signal artifact is genuinely ≥50k chars → dref-backed [F :316-321]). Legs:
1. Mint revision via `service.createRevision` (engineRef per GC-5 once merged — assert
   `ENGINE_REF_UNRESOLVED` on a bogus id is GC-5's own test, NOT repeated here; reference entry
   script read from `fixtures/gc-peaks/entry-reference.py`); mint per-file data-references for the
   synthetic .D files (the exact shape [GC4:255-264] yields, hand-wired like GC-6 T2); createRun with
   §A2 parameters; execute → succeeded; `peak_table` artifact record exists INLINE with the §A1
   schema/units payload; `signal_plus_baseline` has `dataReferenceRef` + NO `inlineValue`
   (never-inline proven); read the persisted bytes off the tmp device, assert n/axis/values match the
   generator (GC-6 EXACT decode) and the baseline column exists.
2. **Provenance machine-readable in the run** [acceptance clause 4]: stored run payload's
   `outputManifest.reader` == `{name, version, sdk_version}` [GC6:343-353] (reader version recorded,
   GC-6 D4 independent leg); `outputManifest.engineProvenance` present with `packages[].actual`
   versions once GC-5 is merged (post-merge assertion per B1 re-pin — this is the "actual engine"
   clause); `effective_parameters` artifact row == run.parameters exactly + `params_digest` +
   `source_content_sha256` == the minted DREF's contentHash (echo leg, "source hash" + "effective
   params" clauses); `method_label` echo present when declared ("method revision" clause's honest
   data form — see OQ3 for the REV-pin upgrade).
3. **Rerun = new immutable run:** re-execute the SAME run → stored manifest returned verbatim
   (idempotent leg [F :437-438]); create a NEW run on the same revision with one parameter changed →
   new ANR id, its `effective_parameters.params_digest` differs, and the FIRST run's stored payload
   is byte-identical before/after (assert a sha of the serialized payload — rides [F :437] + the
   append-only store).
4. **Failure legs named:** empty-signal input → succeeded with zero rows (declared); a corrupt .CH
   (truncated) → run `failed`, failure message names `CH_TRUNCATED` (GC-6 X11 channel — proves GC-7's
   consumer path propagates reader codes); missing required parameter → run `failed` naming
   `PARAM_MISSING` (params ARE NOT validated by the runner — the module is the validator; prove it).
5. Vitest→unittest spawn wrapper over `tests/` (GC-6 OQ5 precedent folded: keep) as the
   single-command python gate.

### T3 — Real-NAS end-to-end (LANE-ONLY manual read-only smoke; the acceptance's real leg)

`.hermes/plans/scripts/gc7-nas-e2e-smoke.sh` (path literal ONLY here — runbook data, never under
server/): with GC-4 merged and the lane config declaring `gc-fid-nas`, register RES35077-4.D via the
live API (:3092, `cl-lane-stack.sh 1`), `packageAnalysisInputs` → revision + run with the declared
FAME method's transcribed settings (data in the script's heredoc = lane data, acceptable in
.hermes/), execute, then assert: run succeeded; peak_table lands; every peak RT matches the
GC-1 decD-pinned table (`RT 4.0217 / 4.4834 / ... max 400112.8313 pA @ 4.6074` [G1:52-60]) within
**RT ≤ 0.02, height ≤ 5 %, per-point ≤ max(1 %,5 pA)** — areas compared ONLY against decD within
10 % where decD produced one, and the honest note is printed: GC-7 tables bound truth within
DECODER tolerances, not vendor parity [G1:100]. The saturated-resistance case is RES4's
4.48-4.66 envelope: rows present + flagged, NO crash. Prints `GC7 NAS E2E OK <n_peaks> <maxrt>` —
receipt pasted in the worker report. NO writes to NAS; NOTHING from /mnt/vast in any test fixture.

## First targeted check (run before writing any entry-script/vitest)

After `peak_integration.py` + `make_peak_fixtures.py` + T1 tests 1-2 ONLY:

    cd /mnt/vast/home/brad/git/cl-integration-1/server/python-executor-service && PYTHONPATH=src /usr/bin/python3 -m unittest tests.test_peak_integration -v

RED first (module-not-found), then GREEN (EDITOR-1 inversion-note precedent). This proves the
analytic-Gaussian anchor — the riskiest correctness assumption — before any runner/schema-adjacent
code is touched.

## Verification (complete, coder-executable)

1. `cd /mnt/vast/home/brad/git/cl-integration-1/server/python-executor-service && PYTHONPATH=src /usr/bin/python3 -m unittest discover -s tests -v`
   → `Ran >= 41 tests ... OK` (pre-GC-6 baseline 18 [GC6:109-111], GC-6 adds ~8 — re-count at claim;
   GC-7 adds ≥ 15), exit 0.
2. `cd /mnt/vast/home/brad/git/cl-integration-1/server && npx vitest run src/analysis/analysisGcIntegration.test.ts src/analysis/analysisDReader.test.ts src/analysis/analysisRunner.test.ts src/analysis/analysisService.test.ts`
   → all pass, 0 failures (the last three prove zero regression; GC-5/GC-6's own suites stay green —
   GC-7 changes none of their files).
3. `npx vitest run` full suite green (capture fail-file baseline at claim, report both — house
   baseline-staleness rule).
4. `cd /mnt/vast/home/brad/git/cl-integration-1 && npm run typecheck` → delta vs trunk baseline
   EMPTY in touched files (GC-2/GC-5/GC-6 comparator precedent; app-wide exit 0 NOT expected; GC-7
   touches ZERO .ts in production, so any new TS error means scope drift).
5. Hardcode greps — ALL ZERO in production code + tests:
   - `grep -rn "mnt/vast\|gc-fid\|machine1" server/python-executor-service/src server/python-executor-service/tests server/python-executor-service/fixtures server/src/analysis/analysisGcIntegration.test.ts` → 0
   - `grep -rniE "RESTEK|FAME|KERRYGOLD|WEGMANS|COUNTRYSIDE|CANT.BELIEVE|AOAC|FID1A|butter" server/python-executor-service/src/computable_lab_analysis/peak_integration.py server/src/analysis/analysisGcIntegration.test.ts` → 0
   - method-name literals: `grep -rn "_M\b\.M'" ...same files` and any `GCM-` id literal in python → 0
   - threshold hardcode probe: `grep -nE "0\.02|0\.005|5 ?\*|1e-2|0\.5|10\b" peak_integration.py` reviewed
     by eye — numeric literals permitted ONLY inside error-message formatting and the docstrings;
     EVERY scientific threshold must read from `params[...]` (reviewer greps `params\[` coverage).
   - `grep -rn "numpy\|import scipy\|from scipy" server/python-executor-service/src/computable_lab_analysis/peak_integration.py`
     → hits ONLY inside the lazy `backend == "scipy"` branch (import at module level = REJECT, B5).
6. `bash .hermes/plans/scripts/gc7-nas-e2e-smoke.sh` (lane-only, NAS mounted, live stack up) →
   `GC7 NAS E2E OK …` receipt line in the report (B2: this is the ONLY place NAS appears).
7. `git -c core.fileMode=false status --porcelain` in code repo AND lane data dir's embedded git:
   code repo diff = §Files IN scope ONLY, zero binary, zero .CH/.XML/.LOG/revision-record bytes in
   git; revision/run/engine records exist ONLY in tmp test workspaces (vitest) or the lane data repo
   (smoke receipt runs).

## Worker contract

- Worktree/branch off lane trunk: `/mnt/vast/home/brad/git/wt/gc-7-lane1-<stamp>`, branch
  `wt/gc-7-lane1-<stamp>` off CURRENT `cl/integration-1` tip AT DISPATCH (draft baseline docs tip
  21fed0cc; GC-3-fix1, GC-4, GC-5, GC-6 all merge ahead of you — B1 re-pin is step 1, its own
  commit). All git `-c core.fileMode=false`; trunk worktree READ-ONLY, commit nothing there.
- Deliverables = §Files IN scope exactly. Report `/home/brad/.hermes/cl/lanes/1/gc-7-report-<unit>.md`;
  commits AFTER every step (83rd handoff §3); end-marker `GC7 DONE <sha>` / `GC7 BLOCKED <reason>`;
  log `lanes/1/logs/coder-GC7-<unit>.log`; script-file launcher + slot FIFO (87th handoff lesson).
- Lane stack via `cl-lane-stack.sh 1` only (T3 leg needs it after any merge); never :3001/:5174.
  Python/TS edits need NO restart for vitest [GC6:586-589].
- Records minted by tests = TEST data in tmp workspaces; lane-stack live records via API only,
  titled with `TEST` prefix so GC-7 residue is identifiable, never hand-edited.
- Stop boundary (requires-rescope, report + exit): any pressure to edit GC-4/5/6 files, add a schema
  property/kind/renderer enum/route (B4), a scipy requirement on the stdlib path (B5), NAS bytes in a
  test (B2), vendor-parity claims, or GC-8 calibration creep.

## Reviewer bait (edge errors expected for THIS item — the diff must pre-empt them)

1. **The declared-null invariant is the acceptance spine.** Any row with a null area/width/symmetry
   WITHOUT a reason code — or worse, a plausible-looking number on a saturated plateau [G1:84] —
   fails the item's own title ("auditable artifacts"). Check T1-8/T1-12 actually assert BOTH
   directions, and that no code path substitutes 0.0 for null.
2. **Hardcode boundary** (the grep-proved clause): no NAS path outside `.hermes/plans/scripts/`, no
   method name / compound / filename literal anywhere in the module or vitest leg, no threshold
   literals in algorithm position (§Verification 5's `params[`-coverage eyeball). `method_label` is
   echoed, NEVER branched on. Channel selection by input name/declared `channel` param — no `FID1A`
   special-casing (GC-6 bait #8同款).
3. **Parameter defaults laundering.** A `params.get("x", 0.10)` anywhere in algorithm code is a
   hardcoded threshold wearing a trench coat — required params MUST come from validation or fail
   with a named code (T1-10). Same rule for `timed_events` default state before the first event:
   it must be DECLARED (param or explicit logged default in the contract), not incidental.
4. **area% honesty:** when any sibling area is null (saturated case!), `area_percent` is null on
   EVERY row — a reviewer should specifically try to make the module emit a "complete-looking"
   percentage over an incomplete total. Sum-over-reported must exclude nulls explicitly.
5. **Rerun immutability test vacuity:** asserting "a new run got a new id" proves nothing (that's
   [F :438] shipped). The load-bearing assertion is the OLD run's stored payload hash unchanged
   after the new run + params_digest differs. If the test passes with the GC-5/GC-6 code deleted,
   it's vacuous.
6. **Engine/version drift vs GC-5:** don't re-define `engineProvenance` keys, don't mint an engine
   record in the code repo, don't duplicate GC-5's failure-token tests. If shipped `engineProvenance`
   spelling differs from [GC5:280-287] → STOP B3, don't adapt silently. Same for `attach()`/
   `READER_VERSION` vs [GC6:273-324] and the `meta` D5 shape.
7. **exactOptionalPropertyTypes** [GC5 F20]: the vitest leg builds CreateRevisionInput/CreateRunInput
   payloads — conditional spreads only, no `field: undefined` (TS strictness catches it; typecheck
   delta must be EMPTY — GC-7 should have ZERO production TS, so any tsc noise = scope drift).
8. **au→physical honesty:** `area_reject_au` has NO code conversion; if a "helpful" constant
   (e.g. `AU_TO_PA = 1.302e-4`) appears anywhere, REJECT — the scale constant belongs to the reader's
   header decode [GC6:292] and scientist-declared parameter data, not the integrator.
9. **Ontology terms:** none required — the module claims zero chemistry semantics (GC-4/GC-6 same
   ruling posture); `label`/`method_label` are decoded DATA strings, not vocabulary. No CURIEs minted.
   If the coder feels an ontology term is needed → STOP B4.
10. **YAML-reload trap** [GC5 F22]: GC-7 ships ZERO schema/lint/ui YAML. Any schema/ edit = scope
    drift (B4). The T3 live leg rides whatever stack state the orchestrator left post-GC-6 merge.
11. **determinism vs float non-determinism:** sorting equal-RT maxima, dict iteration, and
    `sum()` order can wobble across runs — T1-11's byte-identical assertion forces canonical order
    (sort by (rt, index); `math.fsum` for the area% total). If T1-11 flakes, FIX the ordering,
    don't weaken the test.
12. **scipy-branch cheating:** the acceptance must not quietly require the venv — the /usr/bin
    `BACKEND_UNAVAILABLE` assertion (T1-13) is the honest leg; the venv comparison leg is optional
    per the launch brief and must announce itself SKIPPED (reported), never silently absent.

## Open questions for orchestrator (each with recommended default)

1. **Real-NAS end-to-end inside the vitest gate?** Task `verified by` says "incl. a real NAS .D
   end-to-end run"; B2/T3 keep NAS out of vitest (GC-4/GC-6 promotion doctrine) and put the leg in
   the lane-only manual smoke receipt. Recommended default: keep T3 as-is — the acceptance word
   "run" is a run, its receipt is the report, consistent with GC-6's folded OQ1 posture. Checked:
   GC-6 spec :247-261 + :478-490, GC-4 spec B4 doctrine refs, 87th handoff live-state notes.
   Alternative: orch runs T3 itself at the gate (my default assumes a report receipt + orch re-run).
2. **When does GC-7 dispatch?** Deps GC-5+GC-6 unmerged; GC-6's own OQ1 ruling ("code after deps
   merge, branch at dispatch") serializes GC-7 behind BOTH. Recommended default: GC-7 codes may
   START only after GC-6 merges (GC-5 already per B1), because `d_reader.attach` is a hard import —
   coding against the spec text alone re-risks the GC-6/D5 same-function class of conflict at zero
   benefit. Checked: task-list :7808 deps, GC-6 promotion fold (:620-638), GC-5 dispatch
   preconditions (:426). Alternative: full-parallel coding with a re-pin rebase (rejected: no
   overlap-free path — the entry script imports GC-6 names).
3. **"Method revision" provenance without a methodRef property.** Acceptance names "method
   revision"; no revision-schema property exists for a gc-method ref and B4 refuses schema edits.
   Recommended default: `method_label` (free-text parameter) + the `methodNotes` transcription
   contract + `params_digest` — machine-readable in `effective_parameters`; the UPGRADE to a pinned
   `methodRevisionRef` REV-snapshot travels as an OPTIONAL parameter field `method_revision_ref`
   (string id, echoed verbatim, validated only as a shape) so a later schema item can promote it
   without touching this module. Checked: analysis-revision schema whole file, GC-5 spec's
   engineRef-shape precedent (:230-247), routes list (no patch endpoint), gc-method REV-snapshot
   mechanics (RecordRevisionService exists for snapshots). Alternative: a one-field
   analysis-revision.schema.yaml `methodRef` addition in GC-7 — STOP-B4 territory, orch ruling.
4. **Tangent-skim / vertical-drop semantic fidelity.** gc-method's enums name the vendor concepts;
   their numeric semantics are vendor-undocumented [G1:20]. §A3.3 ships DECLARED stdlib
   interpretations + synthetic-truth tests. Recommended default: accept as declared-interpretation
   (methodNotes states it) — the alternative (refusing to implement anything but `none`) guts the
   item. Checked: gc-method enum fields, gc1-decD baseline approach (:84-99 local baseline),
   GC-1 :129-135 matrix (scipy = approximate for baseline). Alternative: GC-8-era vendor study.
5. **sdkVersion + `__version__` chain.** GC-6 folds `__version__` 0.1.0→0.2.0 with
   `READER_VERSION` 1.0.0; GC-7 adds peak_integration and the reference entry pins an sdkVersion.
   Recommended default: bump `computable_lab_analysis.__version__` 0.2.0→0.3.0, reference entry
   `sdkVersion: "0.3.0"` — re-pin against shipped values AT DISPATCH (B1 step 1). Checked: GC-6
   spec :202-203, :613-615 fold, shipped ctx/`__init__` [F]. Minor; fold at promotion.

