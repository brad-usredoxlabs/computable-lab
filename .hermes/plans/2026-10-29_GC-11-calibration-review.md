# ORCHESTRATOR FOLD (promoted by tick l1t0710, 2026-10-27 ~07:30 EDT)

STATUS: PROMOTED. Cite-audit PASSED — every load-bearing [F] cite re-opened first-hand by the
orchestrator against trunk @ 81ed8bf3: ViewRenderer.tsx:25 union verbatim; compat banned-literal
`scatter` at ViewRenderer.compat.test.tsx:42; AnalysisPage.tsx:201-203 silent table-coercion
whitelist; view-spec.schema.yaml:29-31 enum [table, signal, metric, static-figure];
analysis-output-artifact.schema.yaml:27 runRef; RunWorkspaceService.ts:328 kind!=='run' -> null;
SequencesPage useSearchParams present, RecordRegistryPage ZERO (F6 exhaustive-claims HOLD);
client.ts createAnalysisRun :3235; routes.ts:1268-1272 (no run/artifact PUT/PATCH — F5 HOLD);
task block lines 8158/8163/8174-8176 HOLD verbatim. ONE CITE CORRECTION: storage-routing lines are
analysisRunner.ts:393/395 (`>= 50_000`), not :314-340 as drafted — semantics unchanged, use
393-395 at claim.

OQ RULINGS (orchestrator, within approved intent):
- OQ-1 APPROVED as spec'd: originating-run link = /analysis?run=<recordId> with the one-shot
  ?run= consumer (SequencesPage precedent). GC-12 may later add a richer destination; href is the
  seam.
- OQ-2 NO DECISION NEEDED: dispatch brief WILL carry the mandatory re-anchor of the structural
  const table against GC-8's SHIPPED records (lane API) at claim.
- OQ-3 DEFER APPROVED: no calibration-view creation UI this item.
- OQ-4 HONEST-ARM APPROVED: dref-backed calibration artifact renders the named error arm; wiring
  GC-10's content route is NOT gate-relevant.

DISPATCH GATE: NOT dispatchable until GC-8 AND GC-9 AND GC-10 are MERGED to cl/integration-1
(task deps), and every [Gn] cite is re-anchored against shipped code at claim (AMEND-AT-MERGE).

## RE-ANCHOR FOLD (cl-spec-composer, tick l1t1925, 2026-10-27 ~19:30-20:45 EDT)

GATE SATISFIED: GC-7/8/9/10 ALL MERGED (trunk tip `891185da`). Every [G7]/[G8]/[G9]/[G10] AMEND-
AT-MERGE cite has been RE-ANCHORED against shipped code first-hand this session (or corrected where
shipped reality diverges from the promoted spec's assumption — see the old->new table in
`## RE-ANCHOR l1t1925` at the bottom). [Gn] status legend retired: the spec now cites SHIPPED
path:line only. Baselines re-captured live @ 891185da: app vitest src/analysis **13 files 115/115
GREEN**, app tsc **21 error lines / 0 in src/analysis**, server tsc **0**, server
analysisSchema.test.ts **13/13** — all [F-run].

MATERIAL CORRECTIONS the coder MUST know (full detail in the RE-ANCHOR table):
1. **The whitelist moved.** It is no longer an inline list in AnalysisPage.tsx (draft F3 :201-203).
   Shipped: `VIEW_RENDERER_WHITELIST` const + pure `resolveViewRenderer` in **ViewRenderer.tsx:38-53**
   (GC-10 [E]); AnalysisPage only CALLS it (:389). The enum+union+whitelist+arm trifecta is now
   schema :36 + ViewRenderer.tsx :26/:38/:arm — AnalysisPage.tsx needs NO whitelist edit.
2. **selectRun does NOT set the manifest.** Shipped selectRun (AnalysisPage.tsx:355-364) fetches the
   run payload ONLY; `manifest` is set only by execute (:345). The ?run= landing must seed
   manifest+artifactRefs CLIENT-SIDE from the fetched `payload.outputManifest` +
   `manifest.artifactRefs` (the exact channel CompareTraces.tsx:103-104 already consumes) — zero
   execute calls, PB-CH-5 intact. See D3 (corrected).
3. **Calibration payloads are `{rows, columns, ...}` OBJECTS, not bare arrays.** Shipped TableView
   (ViewRenderer.tsx:60-86) renders `Array.isArray(inlineValue) ? rows : []` — GC-8's published
   `calibration_table_view`/`calibration_model_view` render "No rows" TODAY. The composite reads
   `.rows` itself; never rely on TableView for calibration artifacts.
4. **`peak_source` is a STRING** `"<input_name>:row<idx>"` (calibration_fit.py:797), not a structure.
   Row->input-name = split before `:row`; the record-id hop rides the run's frozen
   `inputs[<name>].id` (analysis-run.schema.yaml:44-49 ref objects) — chain re-verified in D2.
5. **`source_point_ref.artifact_or_dref_id` is OMITTED for unpromoted inline level inputs**
   (calibration_fit.py:987-992; the shipped spine asserts the omission at
   analysisGcCalibrationChaining.test.ts:440-446). Never treat its absence as an error.
6. **The statistic-undefined REASON is not in the model payload.** `statistic_value: null` carries no
   reason key (reasons live in the `calibration_statistic` METRIC, calibration_fit.py:1221-1223).
   The honest null arm renders `null` + the verbatim `statistic_definition` — D1 corrected.
7. **Recalc prefill cannot ride the shared run-creation region:** GC-9's selection-change effect
   (AnalysisPage.tsx:169-179) RESETS `paramValues` to schema defaults, stomping any prefill.
   D4 corrected to a dedicated second ParameterForm instance (controlled props shipped for exactly
   this: ParameterForm.tsx:25-31 incl. `testIdPrefix`).
8. **No calibration-shaped lane data exists on :3092 today, and no python-entry-script engine
   record** (all 5 lane engines are STUB/stub-echo). The browser gate CANNOT run until the gate
   fixtures are minted — exact recipe + existing record inventory in the new **Appendix A**.
9. Task block MOVED: task-list.md **:8405-8423** (was :8158-8177); the hard lines hold VERBATIM
   (re-read 8411-8422 this session).

NEW OPEN QUESTIONS (recommendations stated; no policy invented):
- **OQ-5 (gate prerequisite) — python engine for the live gate.** The :3092 lane has ZERO
  python-entry-script engine records; the engine gate REFUSES a last-resort interpreter
  (analysisRunner.ts:540-544 — "a silent system run is refused"), so running the GC-8 entry script
  live needs an `analysis-engine` record (adapter `python-entry-script`, capabilities
  curve_fitting/weighted_regression `supported` — both shipped in the enum, schema :162-163) AND a
  resolved interpreter on the lane stack (config `analysis.python` / CLA_ANALYSIS_PYTHON). Checked:
  live GET /api/records?kind=analysis-engine (5 STUB), analysisRunner engineGate :511-596, engine
  adapter enum shipped [python-entry-script, stub-echo]. RECOMMENDATION: orch mints the engine +
  confirms interpreter resolution on the lane stack BEFORE dispatching the browser gate; the coder
  may seed revisions/runs via the API (GC-9 OQ-3 seeding posture) but interpreter provisioning is
  stack config, not coder scope.
- **OQ-6 (design, flagged for ratification) — recalc region = dedicated ParameterForm instance.**
  Alternative A (recommended, now spec'd in D4): the composite footer owns its own ParameterForm
  instance + own createAnalysisRun submit (carries the source run's FROZEN inputs — the shared
  createRun hardcodes `inputs: {}` at AnalysisPage.tsx:327, so the shared path cannot carry them
  without touching GC-9's region). Alternative B: prefill the shared region — mechanically broken by
  the :169-179 defaults-reset (correction 7) and entangles GC-9's submit gate semantics. Checked:
  ParameterForm props/classify (array-object items ARE expressible — ParameterForm.tsx:109,350-395,
  and the real GC-8 `levels[]` schema is exactly that shape,
  analysisGcCalibrationChaining.test.ts:94-113). No GC-9 FILE edits under either door.

PRIOR OQ rulings (OQ-1 ?run= seam / OQ-2 re-anchor mandate [THIS FOLD DISCHARGES IT] / OQ-3 defer
creation UI / OQ-4 honest dref arm) all HOLD unchanged; the ?run= consumer is verified UNshipped
(grep `?run=` + useSearchParams across app/src/analysis = 0 hits) so it still lands with GC-11.

# GC-11 spec: /analysis — calibration review view: table <-> curve <-> residual selection

DRAFT by cl-spec-composer (2026-10-27T06:20 EDT, trunk @ a015a594); **RE-ANCHORED IN PLACE by
cl-spec-composer run l1t1925 (2026-10-27 ~20:45 EDT) against trunk `cl/integration-1` tip
`891185da` — GC-7/8/9/10 ALL MERGED.** Every [Gn] cite is now a first-hand shipped [F] cite (old
->new map in `## RE-ANCHOR l1t1925` at the bottom). Baselines re-executed in-session @ 891185da
(marked [F-run]). Dispatchable once the orchestrator ratifies OQ-5/OQ-6 and mints the gate
fixtures (Appendix A). Every [F] cite was opened FIRST-HAND this session against
`/mnt/vast/home/brad/git/cl-integration-1` (git `-c core.fileMode=false`); NEVER read
`/mnt/vast/home/brad/git/computable-lab` or :3001/:5174.

## Status legend

- **[F]** = confirmed fact, cite opened first-hand this session (path:line into trunk @ 891185da).
- **[F-run]** = behavior/number proven by executing a command in-session (baselines + live lane API).
- ~~[G7]/[G8]/[G9]/[G10]~~ — RETIRED at re-anchor: all four deps are MERGED; every former [Gn]
  cite below is rewritten against the shipped code (python module
  `server/python-executor-service/src/computable_lab_analysis/`, the server spine test
  `server/src/analysis/analysisGcCalibrationChaining.test.ts`, the shipped client components).
- **[I]** = inference / design decision of this spec, flagged for the orchestrator.

## Goal (one sentence)

Ship a `calibration-curve` view-spec renderer (handwritten SVG, GC-10's ratified route) on
`/analysis` that renders GC-8's `calibration_table` + `calibration_model` artifacts as scatter +
fit line with the artifact's equation string, named correlation statistic (echoed verbatim),
per-point residuals and included/excluded markers — where selecting a calibration-table row
highlights its point AND its residual and links to the point's originating run; where every change
(point inclusion via the level's `fit` flag, model params) spawns a NEW analysis-run through the
GC-9 labeled form (completed models/runs NEVER mutated); where quantitative vs uncalibrated
results wear a data-derived visual distinction; and where every column header renders full-text
(no `Man...` truncation).

## Authority (read in this order; scope is theirs, not mine)

1. Task block GC-11, `/home/brad/.hermes/cl/lanes/1/task-list.md:8405-8423` (moved from the
   draft's :8158-8177 — content VERBATIM-identical, re-read this session) — description (:8411-
   :8416) and `verified by` (:8420-8422) are BINDING (re-quoted verbatim below). `files:` (:8423) =
   "app/src/analysis/ (calibration renderer + wiring + tests), view-spec enum". deps: GC-8, GC-9,
   GC-10 (:8410) — ALL MERGED (GC-8 4b7e2b4c, GC-10 891185da; GC-9 earlier on the GC-8-side track).
2. The task's hard lines (verbatim clauses that bind design): *selecting a calibration-table row
   highlights its point + residual and links to its originating run*; *Changes (point inclusion,
   model params) spawn a NEW analysis-run — completed models are never mutated*; *Uncalibrated vs
   quantitative results visually distinct*; *Full-text column headers (no 'Man...' truncation)*.
3. GC-8's SHIPPED calibration module — THE artifact contract this renderer consumes:
   `server/python-executor-service/src/computable_lab_analysis/calibration_fit.py` — calibration_-
   table columns `CAL_TABLE_COLUMNS` (:1070-1073), per-column definitions `_CAL_SCHEMA_NOTE`
   (:1090-1105), the `calibration_model` payload build (:1026-1055), per-fit-point `source_point_-
   ref` with the D4 omission rule (:973-1009), publish + the two `table` views it emits
   (:1143-1227), the named-statistic definitions `STATISTIC_DEFINITIONS` (:950-961). The server
   spine `server/src/analysis/analysisGcCalibrationChaining.test.ts` pins the live shapes end-to-
   end (CAL_PARAMS_SCHEMA :79-113 is the REAL `levels[]` parameterSchema GC-11's form must render).
   The quantified-table contract lives in `quantification.py` (`quant_payload` :820-829,
   AREA_PERCENT_HONESTY :86, unit-named amount columns :560-561).
4. GC-10's SHIPPED renderer precedent: `app/src/analysis/ChromatogramView.tsx` (handwritten SVG +
   bindings-guarded props :86-96), `traceModel.ts` (pure module, bindings guards :451-587),
   `ViewRenderer.tsx` (whitelist-as-pure-function :38-53, sibling resolution via the `siblings`
   prop :155/:169-181 — the exact machinery GC-11 rides), `CompareTraces.tsx` (the dref-content
   consumer :103-104). GC-10's ratified OQs (handwritten SVG, new-id-per-component: "GC-11 adds
   `calibration-curve` the same way") stand ratified — the enum comment at
   `schema/knowledge/view-spec.schema.yaml:31-36` documents the precedent.
5. GC-9's SHIPPED labeled-controls surface: `app/src/analysis/ParameterForm.tsx` — props
   `{schema, value, onChange, disabled, testIdPrefix}` (:25-31), classify incl. array-object
   (:100-110), the row-block array arms (:350-395), `pruneEmpty` (:452), `collectGateIssues`
   (:500), `collectDefaults` (:561); the page-side submit discipline in AnalysisPage.tsx (:280-337).
6. GC-7's SHIPPED peak_table columns (the originating-run link's source shape): the spine's
   MINIMAL_PEAK_TABLE_ENTRY (analysisGcCalibrationChaining.test.ts:65-77) mirrors GC-7's published
   columns; GC-10's ChromatogramView consumes peak tables via `DEFAULT_MARKER_FIELDS`
   (ChromatogramView.tsx:41). GC-11 does not re-render traces.
7. Handoffs `.hermes/plans/handoffs/` — latest 124th (`2026-10-27_lane1-tick-20261027T1825-GC10-
   MERGED-891185da-BROWSERGATE-RUNNING-124TH.md`): commit-after-every-step (83rd §3), UI gates go
   through the orch deterministic-Playwright route FIRST (91st §4), and the 124th's own lesson —
   gate fixtures are orch-minted via the API with schema-typed ref-objects (422 on bare ids).

## Oriented facts — shipped reality [F], every line opened first-hand

### F1. The renderer dispatch GC-11 widens (SHIPPED, GC-10 landed)

- [F] `app/src/analysis/ViewRenderer.tsx:26` — `RenderableView.renderer` union
  `'table' | 'signal' | 'metric' | 'static-figure' | 'chromatogram' | 'trace-compare' | 'model' |
  'binary'` (GC-10's two ids ARE in it now); switch at :157-201; `default:` arm = visible
  `Unsupported renderer:` error (`view-spec__error`, testid `view-spec-error`, :195-200). GC-11's
  `calibration-curve` arm lands at :192 (between `trace-compare` and `model`), ahead of `default:`
  exactly like GC-10's arms (their comment :166-168 states the rule: new arms BEFORE `default:` so
  the closed-set error is preserved).
- [F] `ViewRenderer.tsx:59-86 TableView` — headers are the UNION of row-object keys rendered as
  `<th key={c}>{c}</th>` (:72) with `String(r[c] ?? '')` cells (:79); `RenderableArtifact` (:11-20)
  carries NO per-column label field, so **the artifact's property names ARE the headers** — the
  "full-text column headers, no 'Man...'" clause is (a) a ban on introducing CSS truncation and
  (b) GC-8's column names rendering verbatim (`response_raw_pa_min` et al., CAL_TABLE_COLUMNS).
  **NEW AT RE-ANCHOR (correction 3): TableView reads `Array.isArray(inlineValue) ? value : []`
  (:62) — GC-8's calibration payloads are `{rows, columns, ...}` OBJECTS (calibration_fit.py
  :1157-1164), so GC-8's shipped `calibration_table_view` renders "No rows" through TableView
  TODAY. The composite table reads `.rows` from the object itself; a reviewer who "discovers" the
  empty table-view is discovering shipped GC-8/TableView reality, not a GC-11 regression.** No
  ellipsis/`text-overflow`/`nowrap` exists on `.view-spec__table` (grep `ellip|text-overflow` in
  `app/src/analysis/AnalysisPage.css` → 0 hits [F-run]; the single `white-space: nowrap` at :211
  belongs to `.analysis-compare-btn`, a button, not a table — leave it).
- [F] `ViewRenderer.tsx:215-235 renderViews(views, artifacts)` — per-view map, matches view ->
  artifact by NAME, passes `siblings={artifacts}` (:231); **no cross-view state bus** — the
  table<->curve<->residual selection state lives INSIDE one composite component.
- [F] `app/src/analysis/ViewRenderer.compat.test.tsx:38-51` — source-pin:
  `readFileSync('src/analysis/ViewRenderer.tsx')` asserts ZERO occurrences of
  `['quantum','heatmap','scatter','component-tree']` (:46-48) + presence of `view-spec__error`
  (:50). The comment (:38-45) was ALREADY amended by GC-10 to name its task-mandated widening.
  **CRITICAL for GC-11: the banned list contains the literal word `scatter` — the new arm id is
  `calibration-curve` and ViewRenderer.tsx must never contain the string "scatter" (comment or
  otherwise). All "scatter" prose lives in CalibrationCurveView.tsx / docs.** GC-11's edit = amend
  THAT COMMENT again (name task :8412's mandate) + ADD assertions; never delete/weaken.

### F2. The view-spec enum — GC-11 adds exactly ONE value

- [F] `schema/knowledge/view-spec.schema.yaml:36` — enum `[ table, signal, metric, static-figure,
  chromatogram, trace-compare ]` (GC-10's widening SHIPPED; the `calibration-curve` addition lands
  on THIS line, appending one member; the :31-35 comment block gets a GC-11 line mirroring it).
- [F] GC-8 shipped publishes `table` views ONLY: calibration_fit.py:1226-1227
  (`ctx.view("calibration_table_view", "table", ...)` + model view) — it minted no enum value and
  never proposed one. Confirmed no upstream proposal exists for calibration-curve anywhere in the
  shipped schema/tests (grep view-spec enum legs: analysisSchema.test.ts :159-196 has quantum-
  reject + chromatogram/trace-compare accepts only [F-run read]).
- **[I] Consequence (checked, not invented):** GC-11 adds exactly one enum member —
  `calibration-curve` — on top of GC-10's six, in GC-11's own commit. No second proposal needed.

### F3. The whitelist — SHIPPED as a pure function in ViewRenderer.tsx (AnalysisPage edit no longer needed)

- **[CORRECTED AT RE-ANCHOR — the draft's F3 cite is superseded.]** The silent-coercion whitelist is
  no longer an inline literal in AnalysisPage.tsx. GC-10 [E] extracted it:
  `app/src/analysis/ViewRenderer.tsx:38-45 VIEW_RENDERER_WHITELIST` (as-const array) +
  `:49-53 resolveViewRenderer(raw)` (pure: shipped id passes, anything else -> `'table'`).
  AnalysisPage's `rendered` useMemo CALLS it at AnalysisPage.tsx:389 (`renderer:
  resolveViewRenderer(vv.renderer)`). **GC-11's trifecta = schema enum :36 + TS union :26 +
  WHITELIST array :38-45 + dispatch arm — ALL FOUR IN ViewRenderer.tsx + schema, ONE commit;
  AnalysisPage.tsx needs NO whitelist hunk.** Same trap, same defense: a `calibration-curve`
  manifest view must pass through resolveViewRenderer, never table-coerce.
- [F] `AnalysisPage.tsx:394-400` — **client-synthesized views precedent**: model/binary artifacts
  without a manifest view get a synthesized `model`/`binary` card view client-side. This is the
  door GC-11 rides for its composite view (§D1): the GC-8 revisions publish `table` views only;
  GC-11 synthesizes the `calibration-curve` composite client-side when a run's manifest carries a
  calibration_table-shaped AND calibration_model-shaped artifact (structural gate, §D1 — not name
  sniffing), AND the widened enum makes a persisted `calibration-curve` view-spec record validate +
  dispatch honestly for the forward path (orch can seed one via POST /records — routes.ts:238
  createRecord; live proof captured at the GC-10 gate: renderer 'chromatogram' -> 201, 'quantum'
  -> 422 closed-set naming the enum, 124th handoff §Verification-4).
- [F] `AnalysisPage.tsx:367-403 rendered` useMemo builds `RenderableArtifact[]` from
  `manifest.artifacts` + `artifactRefs` via `toRenderable` (:578-596) — inline values arrive here
  verbatim as `inlineValue` (calibration artifacts are inline, F7), and `artifactRefs[name].artifactRecordId`
  gives the AOUT record id for every artifact (§D2's run-link rides this).
- [F] mount accounting pin: `app/src/analysis/AnalysisPage.no-execute.test.tsx:44-56` — mount
  fires EXACTLY `listAnalysisRevisions` + `listAnalysisRuns` (:48-49), zero else. Any GC-11 mount-time
  fetch must be gated to the `?run=` deep-link param being present (SequencesPage precedent, F6)
  and the suite re-runs unmodified as proof.

### F4. GC-8's SHIPPED artifacts — the renderer's whole input (structural const table, re-anchored)

The draft's [G8] table is SUPERSEDED. Everything below was opened first-hand in
`server/python-executor-service/src/computable_lab_analysis/calibration_fit.py` @ 891185da; the
live-shape proof is the shipped spine `server/src/analysis/analysisGcCalibrationChaining.test.ts`
(T2 spine runs the REAL entry script through the REAL runner in-process).

- [F] THREE inline `table`-kind artifacts per CAL run, published by `fit_calibration`
  (calibration_fit.py `_publish` :1143-1209):
  - `calibration_table` (:1175) — inline value is an OBJECT, not an array (:1157-1164):
    `{rows: [...], columns: [...], amount_unit, istd, calibration_scope: "analytical", params_digest}`.
    Row keys = `CAL_TABLE_COLUMNS` (:1070-1073), verbatim: `level, compound_label, compound_ref,
    amount, rt_target_min, rt_window_min, peak_source, response_raw_pa_min, response_ratio,
    fit_point, relative_residual, flags`. Per-column definitions ride the artifact's own
    `schema.columns.<col>.definition` (from `_CAL_SCHEMA_NOTE` :1090-1105) — tooltips copy those.
    `fit_point` is the per-level DECLARED inclusion boolean copied from `levels[].fit` (:772);
    excluded rows carry `EXCLUDED_FROM_FIT` in `flags` (:92 REASON constant); every null numeric
    cell names its reason code in `flags` (the invariant documented :1104).
  - `calibration_model` (:1193) — payload built :1026-1055. Keys (ALL shipped): `model_version: 1`
    (:104), `model` (`"linear" | "linear_through_origin" | "quadratic"`, MODEL_ENUM :42),
    `equation` (explicit string, `_equation` :537-558), `coefficients` (**keyed object, NOT an
    array** — `{slope, intercept}` for linear/linear_through_origin (:463/:473), `{c0, c1, c2}` for
    quadratic (:525); the shipped evaluator `_predict` :528-534 shows the exact key-per-model
    reading GC-11's line geometry copies), `weighting`, **`effective_weighting` (SHIPPED FIELD THE
    DRAFT'S TABLE LACKED** — names the weighting actually applied, :1013-1025; render it beside
    `weighting`, they can differ by design), `origin_constraint`, `statistic_name`,
    `statistic_value`, `statistic_definition`, `residual_basis` (a data sentence, :1037-1041),
    `response_quantity`, `amount_unit`, `fit_points` (below), `x_min` / `x_max` (min/max of the
    FIT point amounts, :968), `calibration_run_id` (declared echo or null), `params_digest`,
    `calibration_scope: "analytical"`.
  - `effective_parameters` (:1209) — `{parameters, params_digest, source_content_sha256?}`.
- [F] `fit_points[]` per entry (:971-1010): `{amount, response, weight, relative_residual,
  source_input, source_peak_index, source_point_ref}` where `source_point_ref =
  {artifact_or_dref_id?, input_name, peak_row_index, contentHash?}`. **Divergences from the draft
  table, BINDING:** `artifact_or_dref_id` is OMITTED (never null, never a path) when the input
  declares no record id — unpromoted inline level inputs (the common spine case; the module's own
  doc :973-992, asserted by the spine at analysisGcCalibrationChaining.test.ts:440-446
  `expect('artifact_or_dref_id' in ref).toBe(false)`); `contentHash` is also optional. Never treat
  either absence as an error; the link chain falls back to `inputs[input_name]` (D2).
- [F] **`peak_source` is a STRING** — `f"{input_name}:row{first_idx}"` (:797; null + NO_MATCHING_-
  PEAK flags when unmatched :769). The draft assumed a structure; parse = split on the LAST `:row`.
- [F] `response_quantity` VALUES are `"raw_area_pa_min"` / `"area_ratio"` (:47-48, set :737 by
  istd-mode) — **these are NOT table column names**. Mapping the curve needs (one const-table row,
  data-driven, zero branching on domain words): `response_quantity === "area_ratio"` -> plot the
  table's `response_ratio` column; `"raw_area_pa_min"` -> `response_raw_pa_min`. The draft's "column
  PICK" assumption holds; its literal values did not.
- [F] The named statistic is echoed data: `statistic_name` + `statistic_value` +
  `statistic_definition` (`STATISTIC_DEFINITIONS` :950-961 — definitions emitted verbatim).
  **Divergence (correction 6): when `statistic_value` is null the REASON (STATISTIC_UNDEFINED /
  ZERO_OBSERVED) is NOT in the model payload** — it only rides the `calibration_statistic` METRIC
  (:1221-1223). The composite renders null honestly as `null` + the verbatim definition; it does
  NOT invent a reason string (the row-level flags already carry per-point reasons).
  Residuals are `relative_residual` (%) on the fit response quantity, `(fitted-observed)/observed*100`
  (`_relative_residual` :559-565); observed==0 -> null + ZERO_OBSERVED. **The renderer renders these
  strings/numbers verbatim — it computes NO statistic of its own** (fit-line SAMPLING via the
  shipped `_predict` key rule is geometry, not analysis — D7).
- [F] Point-inclusion control data: the `levels[]` parameter with per-level required booleans
  `fit`/`required` — the REAL shipped parameterSchema shape is `CAL_PARAMS_SCHEMA` at
  analysisGcCalibrationChaining.test.ts:79-113: `levels` = `{type:'array', minItems:1, items:
  {type:'object', required:[level, compound_label, amount, rt_target_min, rt_window_min, fit,
  required], properties:{... fit:{type:'boolean'}, required:{type:'boolean'}, weight:{type:'number'},
  input_names:{type:'array'}, compound_ref:{type:['object','string','null']}}}}`. GC-9's
  ParameterForm classifies exactly this as `array-object` (ParameterForm.tsx:100-109 repeatable row
  blocks :350-395) — **the `fit`-checkbox edit IS expressible, no rescope needed** (this resolves
  the draft's OQ-2 anxiety with shipped evidence; see OQ-6 for WHERE the form instance lives).
- [F] Quantified results (`quantification.py`): `quant_payload` (:820-829) = `{rows, columns,
  model_artifact_id, model_params_digest, extrapolation_policy, amount_semantics,
  calibration_scope, params_digest}`; the amount columns are UNIT-NAMED dynamically — `amt_col =
  f"amount_{unit_slug}"`, `rep_col = f"amount_reported_{unit_slug}"` (:560-561), `model_artifact_-
  id` may be null (:546-551 layout-declared extraction) while `model_params_digest` is always
  echoed (:551). **D5 classifier correction: `model_artifact_id` can be null on a real quantified
  table — classify quantitative on `model_params_digest` presence (always present, :823-824), NOT
  on `model_artifact_id`.** `area_percent` rides its own column with `AREA_PERCENT_HONESTY` in the
  schema (:86, column note :844) — copied verbatim, never rewritten.
- [F-run] The AOUT artifact record proves the run pointer live: `GET
  http://localhost:3092/api/records?kind=analysis-output-artifact` returned payloads carrying
  `runRef: {kind:'record', id:'ANR-*', type:'analysis-run'}` on every record; schema requires it
  (`schema/knowledge/analysis-output-artifact.schema.yaml:27-34 runRef property, :83 required
  [kind,id,title,runRef,name,dataKind]`). Row -> AOUT record -> `runRef.id` = originating
  analysis-run via the EXISTING `apiClient.getRecord` (client.ts:2296) — zero server change (§D2).

### F5. Client-side run plumbing (never-mutate + spawn-new-run, all shipped, line numbers re-verified)

- [F] `app/src/shared/api/client.ts` — `createAnalysisRun` :3235-3245 (POST /analysis-runs; body
  `{title, revisionRef, inputs, parameters?}` — inputs is a RECORD of ref objects, the frozen
  source-run `payload.inputs` shape passes straight through), `executeAnalysisRun` :3251-3261,
  `getAnalysisRun` :3247-3249 (full payload incl. frozen `parameters`, `revisionRef`,
  `outputManifest`, `outputArtifactRefs` — verified live [F-run] on ANR-GC10A), `listAnalysisRuns`
  :3231, `getRecord` :2296, `createRecord` :2456, `listRecordsByKind` :2135,
  `getAnalysisArtifactContent` :3279 (GC-10's content client — NOT needed here, F7).
- [F] `server/src/api/routes.ts:1268-1275` — analysis-runs list/create/get/execute + artifact
  promote (:1272) + GC-10's read-only content route (:1275, GET-only); **no PUT/PATCH route exists
  for runs or artifacts — mutation is server-side impossible today; GC-11 keeps it that way (never
  propose one).**
- [F] `schema/knowledge/analysis-run.schema.yaml` — `inputs` name->ref frozen at submit (:44-49),
  `parameters` (:51-53), `revisionRef` required (:30, required list :166). A recalculation =
  `createAnalysisRun` with the SOURCE run's `revisionRef` + `inputs` + a NEW parameters object ->
  new recordId; the old run's stored payload is re-read unchanged after (immutability proof, bait #6).
- [F] **Execute-on-new-run re-read path (shipped, matters for D4):** analysisRunner.ts:666 — a
  second execute of a SUCCEEDED run returns the STORED manifest untouched (idempotent re-read).
  GC-11 never re-executes a completed run; execute fires once, on the NEW id (the page's existing
  create->execute click pattern, AnalysisPage.tsx:339-353).

### F6. Where the "originating run" link can actually land (re-checked exhaustively @ 891185da)

- [F] `app/src/App.tsx:202` region — `/runs/:runId` renders `RunWorkspacePage`, whose server half
  `RunWorkspaceService.getRunWorkspace` **rejects any record whose payload.kind !== 'run'**
  (`server/src/run-workspace/RunWorkspaceService.ts:328` — returns null -> 404 for an
  `analysis-run` record [F-run read this session]). `/runs/:runId` is the DNA/event run sheet —
  NOT a destination for analysis runs today (GC-12's run-sheet is where GC run surfaces land).
- [F] `/registry` (App.tsx:225) has NO record-selection deep link — `RecordRegistryPage.tsx`
  contains ZERO `useSearchParams` [F-run grep -c = 0]; a link there cannot preselect a record.
- [F] `?run=` is NOT yet consumed anywhere: grep `?run=` across app/src -> 0 hits; grep
  useSearchParams across app/src/analysis -> 0 hits [F-run]. The consumer lands WITH GC-11 (OQ-1
  ruling stands, nothing shipped stole the seam).
- [F] Precedent that works: `app/src/sequences/SequencesPage.tsx:37-41` — "ISEQ-2 §4b deep-link
  consumer: /lab/sequences?record=<id> selects that record once" — a `deepLinkRef` one-shot guard
  firing after the first catalog load (:41). The house pattern for select-on-arrival is a QUERY
  PARAM on the surface that hosts the entity.
- **[I] Therefore §D3's answer:** the originating-run link is `/analysis?run=<ANR-recordId>`;
  AnalysisPage grows a one-shot consumer on the SHIPPED selection machinery (corrected mechanics
  in D3 — selectRun alone does not render views). Landing on the source run shows ITS results
  (GC-10's chromatogram/peak table renders it) — the traceability loop closes on surfaces that
  already exist. Flagged OQ-1, RULED; GC-12 may later add a first-class run-sheet destination —
  a link href is the seam, not the wall.

### F7. No payload-fetch problem for GC-11 (unlike GC-10) — stated so nobody over-builds

- [F] GC-8's artifacts are INLINE by contract: tables are tens-to-hundreds of rows, far under the
  50,000-char storage-routing threshold — `server/src/analysis/analysisRunner.ts:391-395`
  (`isLarge`: string length OR `JSON.stringify(page.value).length >= 50_000` -> storage+dref;
  small values stay inline; blob artifacts ALWAYS storage :397). The spine asserts calibration
  inline-ness directly: `inlineValue).toBeDefined(); // inline (small)`
  (analysisGcCalibrationChaining.test.ts:378 [F-run read]). The persisted manifest carries inline
  `value` per artifact and `getAnalysisRun` delivers it (live proof: ANR-GC10A manifest artifact
  has `value` [F-run]). **GC-11 needs ZERO byte-serving: do NOT call GC-10's
  `/analysis-artifacts/:id/content` route for the curve (§D7); if a calibration artifact ever
  arrives dref-backed (pathological size), render the named honest error arm, not a fake** (OQ-4
  ruling; the client method + ChromatogramView's fetch pattern ChromatogramView.tsx:96-110 exist as
  precedent IF the orch ever re-rules).

### F8. Baselines re-executed this session @ 891185da [F-run] (cwd traps included)

- [F-run] `cd app && npx vitest run src/analysis` → **13 files, 115/115 GREEN** (20.04s, 19:42).
  TRAP (123rd handoff, live at GC-10): app vitest MUST run with cwd = `app/` — the compat source-
  pin reads relative paths; running from repo root fakes 5 ENOENT failures.
- [F-run] `npm run typecheck -w app` → **21 `error TS` lines, ZERO inside src/analysis**.
- [F-run] `npm run typecheck -w server` → **0 errors**; `cd server && npx vitest run
  src/analysis/analysisSchema.test.ts` → **13/13** (20:43) — GC-11's +1 positive leg grows this to 14.
- [F] `app/tsconfig.json` strict, NO `exactOptionalPropertyTypes` in app (server/tsconfig.json:13
  only) — same posture GC-9/GC-10 shipped; payload shapes still OMIT absent keys (GC-8's own
  module doctrine: omission, never null-placeholder — calibration_fit.py:987-992).
- [F] `app/package.json` deps: **NO chart library** (grep d3/chart.js/visx/plotly/recharts = 0
  [F-run]); react-router-dom ^6.28.0 present (:41, `useSearchParams` available, zero new dep).
  GC-10's handwritten-SVG route is SHIPPED precedent.
- [F] YAML-reload trap (GC-5 F22, proven again at the GC-10 gate): `tsx --watch` does NOT reload
  YAML — the enum edit needs `cl-lane-stack.sh 1 restart` before any curl proof. NEVER :3001/:5174.
- [F] GC-7/8/9/10 worktrees are dead history — trunk @ 891185da is the ONLY source of fact.

## Acceptance criteria — verbatim from the task list (task-list.md:8420-8422)

> Vitest render/selection tests; browser receipt: reviewer identifies an outlier, jumps to its
> source run, and triggers a versioned recalculation via labeled controls.

Description clauses that also bind (task-list.md:8411-8416), mapped in §Acceptance mapping:

> Calibration-curve view (view-spec renderer): scatter + fit line, equation, named correlation
> statistic, residuals per point, included/excluded markers; selecting a calibration-table row
> highlights its point + residual and links to its originating run. Changes (point inclusion,
> model params) spawn a NEW analysis-run — completed models are never mutated. Uncalibrated vs
> quantitative results visually distinct. Full-text column headers (no 'Man...' truncation).

### Acceptance mapping (every clause -> deliverable + proof)

| Clause (verbatim fragment) | Deliverable | Proof |
|---|---|---|
| "Calibration-curve view (view-spec renderer): scatter + fit line" | D1 enum+arm+CalibrationCurveView | render tests: point count == fit/table rows, line from `equation`/`coefficients` data (verif 1) |
| "equation, named correlation statistic" | D1 echoes `equation`, `statistic_name`+`statistic_value`+`statistic_definition` verbatim | testids `calibration-equation`/`calibration-statistic`; tests assert strings == artifact values, TS computes none |
| "residuals per point, included/excluded markers" | D1 residual strip + `fit_point` marker shapes | per-point `calibration-residual-<i>`; excluded row -> hollow marker + `EXCLUDED_FROM_FIT` visible |
| "selecting a calibration-table row highlights its point + residual" | D2 two-way selection state in the composite | `calibration-row-<i>` click -> `[data-selected]` on point i + residual i; marker-click -> row highlight (two-way test) |
| "and links to its originating run" | D2 `?run=` link via AOUT record `runRef` | test mocks getRecord -> asserts href `/analysis?run=<AREF>`; receipt (b) |
| "Changes ... spawn a NEW analysis-run — completed models are never mutated" | D4 recalculation via createAnalysisRun (+ ParameterForm [G9]) | vitest: spy createAnalysisRun payload, source run's getAnalysisRun payload byte-identical before/after; grep: zero update-record calls (verif 1) |
| "Uncalibrated vs quantitative results visually distinct" | D5 data-derived badge on result views | classify tests (payload-shape only); receipt (d) |
| "Full-text column headers (no 'Man...' truncation)" | D6 no-ellipsis CSS + header test | header textContent == full column key incl. a 24-char test column; no text-overflow rule added (verif 1 grep) |
| "Vitest render/selection tests" | calibrationModel.test.ts + CalibrationCurveView.test.tsx + AnalysisPage.calibration.test.tsx | verif 1-2 |
| "browser receipt: outlier -> source run -> versioned recalculation via labeled controls" | D1 outlier affordance + D2 link + D4 labeled recalc | verif 5 (a)-(d) |

## Files IN scope (re-anchored @ 891185da)

- `app/src/analysis/ViewRenderer.tsx` (union +1 id `calibration-curve` :26; WHITELIST array +1
  :38-45; dispatch +1 arm before `default:`; existing arms untouched; GC-11 imports nothing new
  beyond './CalibrationCurveView')
- `app/src/analysis/CalibrationCurveView.tsx` (NEW — composite curve + residual strip + table +
  selection + run-link + recalc affordance; §D1-D4)
- `app/src/analysis/calibrationModel.ts` (NEW — pure, no DOM: structural artifact-shape guards
  over the `{rows, columns}` payload objects, row<->fit-point join, response_quantity->column
  mapping const table [F4], outlier identification by `max |relative_residual|` OVER THE
  ARTIFACT'S OWN residuals with NO invented threshold, provenance classifier quantitative/
  uncalibrated — §D2/D5)
- `app/src/analysis/AnalysisPage.tsx` (synthesis pairing in the `rendered` useMemo — gated to the
  calibration pair only, GC-10's chromatogram/trace-compare hunks UNTOUCHED; `?run=` deep-link
  consumer + the manifest-seed fix (§D3, corrected); provenance badges (§D5); recalc submit
  region (§D4, OQ-6 door A). **NO whitelist hunk — resolveViewRenderer's array lives in
  ViewRenderer.tsx now (F3).** GC-9's parameter-form regions (:159-301, :447-490) UNTOUCHABLE
  except additive mount of a NEW sibling region)
- `app/src/analysis/AnalysisPage.css` (calibration chrome; NO text-overflow/ellipsis on table
  headers — bait #7)
- `app/src/analysis/CalibrationCurveView.test.tsx`, `calibrationModel.test.ts`,
  `AnalysisPage.calibration.test.tsx` (NEW; do NOT grow frozen ViewRenderer.test.tsx — GC-10's D6
  restored it byte-identical to f571e2b9 and the reviewer WILL diff it again)
- `schema/knowledge/view-spec.schema.yaml` (renderer enum :36 + `calibration-curve`, on top of
  GC-10's two; bindings comment block :38-53 documents the curve's bindings, §D1)
- `server/src/analysis/analysisSchema.test.ts` (+1 positive leg `calibration-curve`; quantum leg
  untouched — mirrors GC-10's shipped legs :170-196; 13 -> 14 tests)
- `app/src/analysis/ViewRenderer.compat.test.tsx` (comment amend + ADDED legs only: the banned-list
  leg itself, incl. the `scatter` literal, stays byte-true)

## Explicitly OUT of scope (hard stops)

- NO server changes at all: no routes, no runner/service edits, no new run/artifact fields
  (F5/F7 — the shipped contract is verified open enough: AOUT.runRef + frozen run.parameters +
  createAnalysisRun cover every clause). Any pressure = STOP + requires-rescope.
- NO new analysis kind, NO dataKind enum change, NO coverage-pin touch (view-spec is an existing
  covered kind; enum data does not move the four fence files — [G10:262] same finding).
- NO ontology terms (no knowledge-layer kind touched; canonical-example doc gate does not fire —
  say so in the PR body, [G10 bait #12] pattern).
- NO GC-10 file edits beyond what the merge already owns: ChromatogramView.tsx / CompareTraces.tsx /
  traceModel.ts are GC-10's shipped surface — GC-11 imports nothing from them and edits nothing in
  them (the source-run view renders through GC-10's components BY THE PAGE, already wired).
- NO GC-9 region edits in AnalysisPage.tsx (its §Out-of-scope mirror), no ParameterForm.tsx changes;
  if the form cannot express a `levels[]` edit, that is requires-rescope with the fixture as evidence.
- NO mutation surfaces: no PUT/PATCH, no `updateRecord` of runs/artifacts/revisions, no re-execution
  of a completed run (idempotent re-execute is the SERVER's business; the UI never calls
  executeAnalysisRun on a run it did not just create from a change).
- NO new chart dependency; NO math: no refit, no residual recomputation, no statistic derivation in
  TS (GC-8's python module owns the arithmetic; TS renders its numbers).
- NO GC-12 run-sheet, no `?compare=` work, no evidence/claim wiring, no vendor parity claims.
- Lane stack `cl-lane-stack.sh 1` only; NEVER :3001/:5174; no NAS paths in code/tests.

## Design

### D1 — one new shipped renderer id, a composite view, data-only specs

Schema enum (after GC-10's widening ships): `[ table, signal, metric, static-figure, chromatogram,
trace-compare, calibration-curve ]` [F2]. TS union + dispatch arm + AnalysisPage whitelist in ONE
commit (F3, [G10 bait #4] same rule). The id string is `calibration-curve`; the word `scatter` appears
NOWHERE in ViewRenderer.tsx (F1 compat-pin — banned literal).

CalibrationCurveView is a COMPOSITE: one view renders curve + residual strip + the calibration
table together, because selection state must be shared and `renderViews` has no cross-view bus
(F1). Props: `{ artifact: RenderableArtifact /* calibration_table */; modelArtifact:
RenderableArtifact /* calibration_model */; bindings?: Record<string, unknown> }` — AnalysisPage
resolves the pairing (see below), exactly like GC-10's `markersFrom` sibling resolution [G10:312].

View discovery (two honest doors, no artifact-name sniffing):
1. **Persisted-record door (the enum's reason to exist):** a view-spec record with
   `renderer: 'calibration-curve'` validates (server-legit — GC-10 proved the /records validation
   path [G10 F5]) and dispatches. Its `bindings` (free object [F view-spec schema :33-36]) carry
   the data-only spec: `bindings.modelArtifact: '<sibling artifact name>'` + optional
   `bindings.rowLabelField` / `bindings.outlierTopN`. A closed-shape guard parses bindings and
   renders the `view-spec__error` arm on malformed data (GC-10's D6 doctrine).
2. **Client-synthesis door (today's reality — GC-8's revisions publish `table` views only
   [G8:454]):** in the `rendered` useMemo, when the manifest's artifacts STRUCTURALLY pair (one
   artifact whose inline value has array `rows` + a `columns` array containing `fit_point` AND
   `relative_residual`, and one whose value carries `equation` + `coefficients` +
   `statistic_name` — the [G8:448] model contract), synthesize ONE `calibration-curve` view
   replacing the two raw table views' prominence (the raw tables stay reachable inside the
   composite). Structural gate via `calibrationModel.classifyArtifact()`, never name equality —
   same shape-classifier that powers §D5; fixtures in tests, prod TS contains zero GC domain
   strings (bait #2 grep pin).

Curve geometry (render-only math on artifact numbers — plotting, not analysis):
- x = `amount` (declared `amount_unit` on the axis label, verbatim from data), y = the fit response
  quantity named by `response_quantity` (a column PICK, `response_ratio` vs `response_raw_pa_min` —
  data says which; a wrong pick is a defect).
- Fit line: sampled from `equation`/`coefficients` over the model's declared `[x_min, x_max]` —
  the string renders VERBATIM beside the plot (`calibration-equation`), the line geometry uses the
  structured `coefficients` (never string-parsing, [G8:336-339] honesty).
- Point markers: included rows solid, excluded (`fit_point: false`) hollow + `EXCLUDED_FROM_FIT`
  in the tooltip/legend (task clause "included/excluded markers").
- Statistic block: `statistic_name` + `statistic_value` + `statistic_definition` verbatim
  (`calibration-statistic`); `null` statistic_value renders as "undefined (STATISTIC_UNDEFINED)"
  honestly, never 1.0/0.0 substituted [G8:323-325].
- Residual strip under the plot: one bar per table row, height = `relative_residual` %, nulls
  render as a declared tick with their reason code, basis label = `residual_basis` verbatim.
- **Outlier identification** (browser receipt: "reviewer identifies an outlier"): the view surfaces
  the row(s) with the largest `|relative_residual|` among included points (max is over the
  artifact's OWN residuals; `bindings.outlierTopN` default 1 is presentation data) with a distinct
  `data-outlier` marker — the UI points at data; it declares no scientific threshold and never
  removes a point.

### D2 — selection + the originating-run link (the spine clause)

Local component state `selectedRow: number | null`. Two-way sync (GC-10's
`chromatogram-row-<id>`/`chromatogram-marker-<id>` symmetry pattern): table row `data-testid=
"calibration-row-<level>"` <-> curve point `data-testid="calibration-point-<level>"` <-> residual
`data-testid="calibration-residual-<level>"`; selecting any one sets `data-selected` on all three
(tests assert both directions + null-clears).

Run link: the row's `peak_source` / the model fit point's `source_point_ref` name the SOURCE
INPUT, but the *originating run* of a synthetic-standards level row is the run that produced the
input peak table — while the run that produced THIS table is the calibration run itself. The link
renders BOTH, honestly labeled:
- **"Calibration run <id>"** — from the page's already-known active run id (zero fetch).
- **"Source run" per point** — resolve the active run's frozen `inputs[input_name].id` (already on
  the page's `activeRun.payload` [F AnalysisPage RunPayload.inputs]) -> AOUT record via
  `apiClient.getRecord` (click-gated fetch on the link itself, not on selection) ->
  `record.payload.runRef.id` [F AOUT schema :27/:83] -> href `/analysis?run=<that recordId>` (§F6).
  If any hop fails to resolve the link renders a NAMED disabled state
  (`calibration-source-run-unresolved` + reason), never a dead `#` anchor (no dead chrome).
Test: mock getRecord chain; assert final href; assert zero fetch before the click.

### D3 — `?run=` deep-link consumer on AnalysisPage (the landing half of the link)

On mount, read `useSearchParams().get('run')`; if present, run it through the SAME selection path
as a manual click (`getAnalysisRun` -> setActiveRun/setManifest per AnalysisPage.tsx:167-176)
ONCE, then strip the param (one-shot, SequencesPage ISEQ-2 pattern [F6]). Mount accounting: the
no-execute suite (mocks return no `?run=`) stays green unmodified — the extra fetch fires ONLY
when the param exists; the wiring test asserts exactly that. GC-12 may later upgrade the
destination to the GC run-sheet; the href is the seam (OQ-1).

### D4 — changes spawn a NEW analysis-run; completed models never mutate (the discipline clause)

The recalculation affordance lives in the composite's footer, riding surfaces that already exist:
- **Point inclusion:** each table row carries a `fit` checkbox (initial = `fit_point`). Toggling
  does NOT refit anything client-side — it arms a pending change (visible diff line: "level 3:
  fit true -> false").
- **Model params:** a labeled button "Recalculate in new run…" opens the run-creation region
  prefilled from the ACTIVE run: same `revisionRef`, same frozen `inputs`, `parameters` = the
  active run's frozen parameters with the toggled `levels[].fit` applied [G8:467-474]. Where the
  revision carries a `parameterSchema` (GC-8's do [G8:458-474 §A7]), the prefill renders THROUGH
  GC-9's `ParameterForm` [G9 §A] — labeled controls, visible overrides vs defaults (§C of GC-9),
  frozen preview before submit [G9 §B] — "labeled controls" in the receipt is this. GC-11 imports
  ParameterForm; edits it not.
- **Submit:** `createAnalysisRun` (new recordId) then `executeAnalysisRun` on that NEW id only
  (the page's existing create->execute click pattern), then select the new run. Spying test:
  `createAnalysisRun` called ONCE with the diffed parameters; `executeAnalysisRun` called with the
  NEW recordId and NEVER with the source run's id; source run re-fetched after -> payload
  byte-identical (JSON.stringify compare) = "completed models are never mutated", proven.
- No-schema fallback (a legacy revision): honest named message, the run-list path stays available —
  never a silent raw-JSON requirement (GC-9's noschema line pattern).

### D5 — uncalibrated vs quantitative, visually distinct (data-derived)

`calibrationModel.classifyResultView(artifactName, inlineValue)` returns
`'quantitative' | 'uncalibrated'`: quantitative iff the payload carries `model_artifact_id` +
`model_params_digest` (the [G8:449] quantified_peak_table contract) or the run's manifest carries
a calibration_model pair feeding it; everything else (raw peak tables, area%, generic revisions
including the DNA lane) classifies uncalibrated. The page renders a per-results-badge
(`results-provenance--quantitative` solid badge naming the calibration run / `--uncalibrated`
outlined badge "no calibration model applied"), test-pinned both ways, DNA-run tests prove the
generic path degrades to uncalibrated WITHOUT error (non-regression: badges are additive chrome on
the results header, zero change to existing render arms). Area% rows carry the artifact's own
honesty sentence [G8:419-421] in the tooltip — TS copies it from `schema`, never rewrites it.

### D6 — full-text headers, mechanically pinned

No `text-overflow`, `ellipsis`, or header `nowrap` may exist on any calibration/table view-spec
class after this item (grep pin + a CSS assertion in the view test: header cell
`textContent === <full key>` incl. one 24-char test-local column name). Long names wrap
(`overflow-wrap: anywhere`) — wrap, never truncate. Column labels are the artifact keys verbatim
(F1 TableView already does this; the composite's table inherits the same rendering rule).

### D7 — non-goals that reviewers will probe

No refit / no residual math / no statistic math in TS (D1 renders artifact numbers; the pure module
does joins + classification ONLY — a reviewer grepping `coefficients` usage must find it feeding
line geometry only). No dref byte-fetch (F7): a dref-backed calibration artifact renders the named
honest arm. No Compare/chromatogram coupling: the composite stands alone; the source-run landing
page happens to host GC-10's components.

## First targeted check (before writing any component)

````
cd /mnt/vast/home/brad/git/cl-integration-1/app && npx vitest run src/analysis 2>&1 | tail -5
````
Expected at claim: baseline GREEN re-captured (22/22 at a015a594 [F-run]; GC-7/8/9/10 merges WILL
have grown it — cite the fresh number in the first commit). Then RED-first on the pure core:

````
cd /mnt/vast/home/brad/git/cl-integration-1/app && npx vitest run src/analysis/calibrationModel 2>&1 | tail -5
````
Expected: FAIL "Cannot find module './calibrationModel'" (test file committed first). This proves
the shape-guards + join + classification (the riskiest correctness assumptions: which row is the
model's fit point, what counts as quantitative) before any SVG exists.

## Verification (complete, with expected output)

1. `cd /mnt/vast/home/brad/git/cl-integration-1/app && npx vitest run src/analysis`
   Expected: ALL pass; count = baseline + 3 new files, 0 failures. Legs the reviewer will hunt:
   two-way selection (row->point+residual AND marker->row, both asserted); equation/statistic
   strings == artifact values (no TS math); excluded point hollow + reason code visible; outlier
   marker == max |relative_residual| on fixture data; run-link chain (inputs -> AOUT -> runRef ->
   `?run=`) with click-gated fetch; recalc spy (create ONCE, execute NEW id only, source run
   byte-identical after); quantitative/uncalibrated classifier both directions + DNA-class
   artifact -> uncalibrated no-error; full-text header incl. 24-char column; bindings guard arm;
   dref-artifact honest arm; `?run=` absent -> mount fetches byte-identical to the no-execute
   contract.
2. `cd /mnt/vast/home/brad/git/cl-integration-1/app && npx vitest run src/analysis/ViewRenderer.test.tsx src/analysis/ViewRenderer.compat.test.tsx src/analysis/AnalysisPage.no-execute.test.tsx`
   Expected GREEN: frozen suite untouched; compat suite's banned-list legs (incl. `scatter`) still
   byte-true with only ADDED legs + amended comment; mount accounting unmodified.
3. `npm run typecheck -w app` → 21 error TS lines (re-capture at claim; must not GROW, zero inside
   src/analysis). `npm run typecheck -w server` → **0** (server delta = one schema-test leg only).
4. Schema trifecta (after `cl-lane-stack.sh 1 restart` — F8 trap):
   `cd server && npx vitest run src/analysis/analysisSchema.test.ts` → pass incl. the
   `calibration-curve` positive leg; live: POST a calibration-curve view-spec via /records with a
   seeded AOUT ref → 200 (Ajv accepts the widened enum — "works in UI, rejected by API" is a
   defect, [G10 bait #3]).
5. Browser receipt (orch deterministic-Playwright route FIRST, 91st handoff §4; lane stack
   :3092/:5192). Seed via API (allowed seeding, GC-9 OQ-3 posture): a GC-8-shaped CAL revision or
   seeded-entry publishing a test-local calibration_table + calibration_model (synthetic, one
   level with a +30 %-residual outlier, one level `fit: false`) + the run succeeded. Steps, each an
   assertion:
   a. reviewer lands on /analysis, selects the calibration run, sees curve + equation text +
      named statistic + residual strip WITHOUT instruction; the outlier point is visibly marked
      and its table row visibly worst;
   b. clicks the outlier row -> its point + residual highlight; clicks the source-run link ->
      lands on `/analysis?run=<source run>` showing that run's results (back-navigable);
   c. toggles a row's `fit` checkbox, opens "Recalculate in new run…", confirms via the LABELED
      form (no JSON textarea touched), submits -> a NEW run appears, executes, its curve shows the
      point excluded (hollow) and new residual numbers;
   d. the OLD run re-selected -> equation/residuals IDENTICAL to step a (never mutated) and
      results badges: calibration run vs a plain peak-table run are visually distinct;
   e. every column header reads full-text at 1280px (screenshot evidence, no truncation).
6. Hardcode greps — ALL ZERO in prod TS (`CalibrationCurveView.tsx`, `calibrationModel.ts`):
   `grep -nE "response_ratio|fit_point|relative_residual|equation|EXCLUDED_FROM_FIT|FAME|ChemStation|pA|ng/uL|scatter" app/src/analysis/CalibrationCurveView.tsx app/src/analysis/calibrationModel.ts`
   — property-name CONSTANTS live in exactly one exported const table in calibrationModel.ts
   (mirroring GC-10's fallback-names rule); the grep legs allow the const block, pin zero
   occurrences in the VIEW file + zero domain literals anywhere (`pA|FAME|ChemStation` zero even
   in the const block). Put the pin in a test so CI owns it. Also: `grep -rn "text-overflow\|ellipsis" app/src/analysis/AnalysisPage.css` → 0.
7. `git -c core.fileMode=false status` in worktree: files = §Files IN scope exactly; no records,
   no bytes, no fixtures committed.

## Worker contract

- Worktree/branch off lane trunk: `/mnt/vast/home/brad/git/wt/gc-11-lane1-<stamp>`, branch
  `wt/gc-11-lane1-<stamp>` off the CURRENT `cl/integration-1` tip AT DISPATCH (draft baseline
  a015a594; dispatch gated by the orchestrator on GC-8 AND GC-9 AND GC-10 MERGED per task deps —
  all three land files this item touches; re-anchor every [Gn] at claim). All git
  `-c core.fileMode=false`. Trunk worktree READ-ONLY; commit nothing there. NEVER read
  other live worktrees' unmerged state as fact.
- AMEND-AT-MERGE at claim, mechanically: [G8] artifact payload field names vs GC-8's SHIPPED
  calibration_table/calibration_model records (read them via the lane API, not the spec);
  [G9] ParameterForm props + AnalysisPage hunks vs GC-9's shipped page; [G10] enum state,
  whitelist hunks, bindings-guard helpers vs GC-10's shipped ViewRenderer (import/reuse, do not
  fork). Drift in THEIR names -> STOP + report, never rename.
- Report at `/home/brad/.hermes/cl/lanes/1/gc-11-report-<unit>.md`; end-marker
  `GC11 DONE <sha>` / `GC11 BLOCKED <reason>`; log `lanes/1/logs/coder-GC11-<unit>.log`;
  script-file launcher + slot FIFO (87th/88th lessons); commit-after-every-step (83rd §3), commits
  `[GC-11][A]..[F]` (calibrationModel test-first RED, model, view, whitelist+enum+arm one commit,
  recalc wiring, receipt runbook), each naming the acceptance clause it advances.
- Baselines RE-CAPTURE AT CLAIM (numbers drift): app vitest src/analysis count, app typecheck
  error lines (≈21 today), server typecheck 0 — cite in the [A] commit body.
- Lane stack via `cl-lane-stack.sh 1` only; NEVER :3001/:5174; seeds are API-minted lane data,
  `TEST` title prefix, never hand-edited, never committed.
- Stop boundary -> requires-rescope (with the [F] cite as evidence): ANY server change (F5/F7 say
  none is needed); any need to mutate a completed run/artifact (the answer is always a new run);
  a ParameterForm expressiveness gap on the real GC-8 parameterSchema (fixture evidence, stop);
  any GC-10/GC-9 region edit; any new dependency; any pressure to compute fit/residuals in TS.

## Reviewer bait — likely adversarial attacks on this item, pre-empted

1. **"You widened the closed set again / deleted the pin."** ViewRenderer.tsx must NEVER contain
   the string `scatter` (compat banned-literal, F1). The PB-CH-5 comment gets amended to name
   task :8165's mandate ("view-spec renderer"); assertions only ADDED (a `calibration-curve`
   positive arm leg); the
   frozen ViewRenderer.test.tsx byte-untouched.
2. **"Domain truth lives in TS."** Prod TS names: zero `response_ratio`/`fit_point`/`FAME`/`pA`
   outside the single exported const table (verif 6). The curve's y-column is CHOSEN by
   `response_quantity` data; a fixture where `response_quantity` flips and the plot follows is the
   anti-hardcode proof.
3. **"You computed the fit yourself."** Grep `Math.pow|** |slope` arithmetic in the view: the ONLY
   math permitted is pixel mapping + evaluating the model's structured `coefficients` for line
   geometry. Residual bars use `relative_residual` verbatim; if you can make the plot lie by
   editing the artifact's residual numbers and the UI recomputing them, you fail.
4. **The enum/union/whitelist trifecta split** ([G10 bait #4] same trap): schema enum + TS union +
   whitelist + dispatch arm in ONE commit or `calibration-curve` manifest views silently table-ify
   (F3 coercion). The pass-through test lands in that same commit.
5. **Synthesized-view sniffing:** the client-synthesis gate is STRUCTURAL (classifyArtifact over
   payload shape), never `name === 'calibration_table'` — a revision may rename artifacts
   (entry-script publishes names; GC-8's doctrine classifies by CONTENT [G8:263-264]). Test: a
   renamed pair still pairs; an unrelated table+table pair never synthesizes a curve.
6. **"Mutation dressed as versioning."** The spy suite must prove execute is NEVER called with the
   source run's id and the source run's `getAnalysisRun` payload is byte-identical before/after
   recalc; the diff line shows the OLD run's params too (frozen — that IS the source's stored
   parameters, copied not read-live).
7. **Full-text headers attack surface:** reviewer resizes to 1024px and names a column
   `measurement_response_raw_pa_min_extended_test_name` in a fixture — headers wrap, never
   truncate; the CSS grep (verif 6) is the mechanical gate.
8. **exactOptionalPropertyTypes / payload hygiene:** app has no EOPT (F8) BUT createAnalysisRun's
   body must OMIT absent optionals (GC-9 W1 reasoning — a `"parameters": undefined` poisons the
   frozen run); tests use `toStrictEqual` + key-set checks, not `toEqual`.
9. **Mount-spy attack (F3):** `?run=` consumer fires its ONE fetch ONLY when the param exists;
   no-execute suite re-runs unmodified as the proof; link resolution fetches are click-gated
   (D2), asserted by a zero-mock-call-until-click test.
10. **YAML-reload trap (F8):** the enum curl proof requires a lane-stack restart; a rejection
    accepted against an un-restarted server proves nothing.
11. **Ontology/knowledge-layer gate:** none required — say so in the PR body ([G10 bait #12]
    pattern); no claim/context/assertion/evidence/mechanism records are constructed.
12. **The seam hazards are NOT here:** the fields<->properties seam gap (AS-L1T1520-2) and the
    inline-artifact dict-provisioning gap stay tracked as separate future lane items per GC-8's
    OQ2 ruling — GC-11 consumes shipped/promoted shapes only and must not absorb either; a
    reviewer pulling them in is scope creep, cite GC-8 spec :679-684.
13. **Uncalibrated-badge false positives:** every DNA/generic run must badge uncalibrated WITHOUT
    error and without hiding results; a badge that blanks a non-GC view is a defect (test: DNA-
    shaped manifest -> badge renders, views identical to pre-GC-11 snapshot).

## Open questions (for orchestrator; recommendations stated, no silent decisions)

- **OQ-1 (low-risk) — destination of the originating-run link.** `/runs/:runId` hard-rejects
  analysis-run records (RunWorkspaceService.ts:328 `kind !== 'run'` -> 404, F6) and /registry has
  no record deep-link (F6). Spec's answer: `/analysis?run=<id>` (the run IS a first-class result
  surface there once GC-10 lands). Alternative: a `/records/:id` generic deep-link — no such route
  exists (App.tsx route inventory read, F6) and minting one is a server/host-surface item beyond
  this task's `files:`. Recommendation: `?run=` as spec'd; GC-12's run-sheet may add a richer
  destination later — the href is the seam. Checked: App.tsx routes, RunWorkspaceService:323-328,
  RecordRegistryPage searchParams grep, SequencesPage ISEQ-2 precedent.
- **OQ-2 (dispatch-order) — GC-8's shipped artifact names/shape vs this spec's structural gate.**
  The synthesis gate keys on `fit_point` + `relative_residual` + `equation` + `coefficients`
  presence [G8:448], not artifact names. If GC-8's shipped payload renames any of these keys
  (B1 re-pin could), the gate silently never fires — the browser receipt (step a) is the backstop,
  but RE-ANCHORING the const table against the shipped records at claim is mandatory, not
  optional. No decision needed now; flagged so the dispatch brief carries it. Checked: GC-8 spec
  §A1/§A6 vs nothing shipped (GC-8 unmerged).
- **OQ-3 (fold-in candidate) — does GC-11's persisted view door need a creation UI?** The spec
  makes persisted calibration-curve view-specs validate + dispatch (the enum's forward contract)
  but the CREATION path is the client-synthesis door (GC-8's revisions publish table views). A
  "Save this calibration view" writer (like GC-10's save-comparison [G10 D4]) is ~30 lines but the
  task's `verified by` never asks for it. Recommendation: DEFER (no creation UI this item;
  re-decide if the orchestrator wants user-authored curve views pinned at GC-12/13 evidence time).
  Checked: GC-8 §A6 view outputs, GC-10 D4 save path, task :8174-8175.
- **OQ-4 (seam, per the drift rule — routing not re-litigating) — dref-backed calibration payloads.**
  F7 argues inline is honest for GC-8's table sizes; the 50k routing is size-driven
  (analysisRunner.ts:314-340). A pathological level count (>~50k chars JSON) would route
  `calibration_table` to storage and GC-11 renders the honest named arm (D7). GC-10's ratified
  read-only content route [G10:620-627] would cover it IF merged — but wiring it here couples GC-11
  to GC-10's server hunk beyond the stated deps' *client* surfaces. Recommendation: honest arm
  now; wire the route-fed arm only if the orchestrator rules the pathological case gate-relevant.
  Checked: analysisRunner routing thresholds, GC-8 spec :128-130 inline-honesty claim, GC-10 OQ-1
  ratification.

## Draft completeness

All sections landed against trunk @ a015a594 on-disk trail: legend/authority, oriented facts F1-F8
(every [F] opened first-hand; baselines [F-run] executed 06:35), acceptance verbatim + clause
mapping, Files IN/OUT, Design D1-D7, First targeted check, Verification 1-7, Worker contract,
Reviewer bait 1-13, OQ-1..4 with recommendations. Every [G7]/[G8]/[G9]/[G10] cite is
AMEND-AT-MERGE — GC-7/8/9/10 code is unmerged at draft time; the orchestrator's cite-audit should
spot-check the [F] line cites (compat banned-literal :42, whitelist :201, RunWorkspaceService
:328, AOUT runRef :27/:83, GC-10 OQ ratifications :620-634) as the load-bearing set.

GC11 DRAFT COMPLETE


## ORCHESTRATOR RATIFICATION FOLD (tick l1t2155, 2026-10-27 ~21:50 EDT)

RE-ANCHOR ACCEPTED. Cite-audit of the fold's load-bearing corrections done first-hand by the
orchestrator against trunk @ b000379e (= code tip 891185da): VIEW_RENDERER_WHITELIST +
resolveViewRenderer at ViewRenderer.tsx:38-53 with AnalysisPage calling only (:389) — CONFIRMED;
selectRun sets only activeRun, manifest set only by execute — CONFIRMED (AnalysisPage.tsx:355-364
read myself); TableView `Array.isArray(inlineValue) ? value : []` empty-arm at
ViewRenderer.tsx:60-63 — CONFIRMED. Corrections 4-9 accepted on the composer's first-hand trail.

OQ-5 RATIFIED as recommended: the ORCHESTRATOR mints the analysis-engine record (adapter
python-entry-script, curve_fitting + weighted_regression supported) and confirms interpreter
resolution on the lane stack BEFORE the browser gate; coder may seed via API only. Gate is
orch-blocked on this, not coder-blocked.
OQ-6 RATIFIED: Alternative A (dedicated ParameterForm instance in the composite footer, own
createAnalysisRun submit carrying the source run's frozen inputs) APPROVED. No GC-9 file edits.

DISPATCH-GATE: OPEN. GC-7/8/9/10 code merged (trunk code tip 891185da); re-anchor landed;
OQ-5/OQ-6 resolved. Coder dispatches off trunk with the mandated re-anchor table (corrections
1-9) IN THE BRIEF VERBATIM. Note for the coder: GC-10's fix-run-2 delta (0bc58c87..ec983170:
traceInteraction.ts shared hook, AnalysisPage hydration, CSS) is NOT yet on trunk — it lands as
a follow-up merge before/with this item's gate; code off the current trunk and do NOT edit
CompareTraces/ChromatogramView beyond what the calibration view needs (the hydration + hook
arrive via the GC-10 follow-up merge, not via GC-11).
