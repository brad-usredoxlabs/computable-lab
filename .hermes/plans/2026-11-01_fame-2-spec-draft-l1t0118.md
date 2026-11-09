# FAME-2 SPEC DRAFT — l1t0118 (composer draft, pending orchestrator review/promotion)

Item: FAME-2 "Real peak-table revision: shipped integrate_peaks on real .D bytes, views with
markers, threshold controls as parameterSchema DATA" — lane 1, trunk cl/integration-1.

## Section plan (this file grows by appended sections; orchestrator promotes on approval)
1. Goal
2. Code/data boundary (declarative-first)
3. Grounding — revision records, ANREV-000009 / ANREV-000007
4. Grounding — executor: integrate_peaks, declared-settings, capability gate
5. Grounding — views-as-data: markersFrom + peak micro-table (C1 boundary)
6. Grounding — parameterSchema controls
7. Work items (what the coder authors, as records)
8. Explicitly out of scope
9. Acceptance criteria (verbatim) + standing gates
10. First targeted check
11. Verification commands
12. Worker contract + file ownership
13. Reviewer bait
14. Open questions

<!-- SECTIONS APPENDED BELOW -->

## 1. Goal
Mint an immutable successor revision to ANREV-000009 (as RECORDS via the API) that decodes real
.D bytes via d_reader, calls the shipped integrate_peaks, publishes a NON-EMPTY peak-table
artifact on ANREV-000007's column contract with views feeding ChromatogramView markersFrom + the
peak micro-table, requires capability peak_detection, and exposes the shipped reject/sensitivity
params as parameterSchema DATA so the scientist can tune "minimum area to count as a peak" and
re-Analyze into a fresh immutable run.

## 2. Code/data boundary (declarative-first)
CLAUDE.md:147 — "Code never makes policy decisions — it follows the rules declared in data."
- ZERO peak math, ZERO thresholds, ZERO file/compound names in TypeScript. All thresholds are
  parameterSchema DATA; all views are ctx.view(...) manifest data (already plumbed end to end).
- The revision + its runs are RECORDS in the lane data repo (/home/brad/.computable-lab-lane1,
  embedded git) created via POST /api/analysis-revisions / the /analysis UI — NEVER hand-written
  YAML, NEVER committed to the code repo (ANREV-000009's own entryScript says it: schema record
  precedent + peak_integration reference-script header, ANREV-000011 entryScript lines 7-17).
- The ONLY anticipated code diff is the C1 renderer-shape fix (section 5). If the coder finds the
  C1 fix cannot be done generically, STOP with requires-rescope — do not fork the python module.

## 3. Grounding — revision records, ANREV-000009 / ANREV-000007 (all first-hand verified)
- ANREV-000009 (signal-only revision, the "no views" ancestor):
  /home/brad/.computable-lab-lane1/worktrees/main/records/analysis-revision/
  ANREV-000009__d-trace-reader-revision-gc-15-real-d-bytes-real-signal-trace.yaml — publishes
  signal_trace only, NO views, NO requiredCapabilities, engineRef ENG-PYCAL01-L1T2305
  (that engine declares ONLY curve_fitting/weighted_regression — NOT peak_detection).
- Successor chain field exists: schema/knowledge/analysis-revision.schema.yaml:30-37
  parentRevisionRef {kind:record, type:analysis-revision, id}. Immutability doctrine :4-9.
- requiredCapabilities closed enum (NO new terms): analysis-revision.schema.yaml:101-118 —
  baseline_control, width_slope_sensitivity, area_height_reject, timed_integration_windows,
  peak_detection, deconvolution, curve_fitting, weighted_regression.
- ANREV-000007's peak-table COLUMN CONTRACT (9 columns, incl. saturated + flags):
  ANREV-000007__test-gc-11-minimal-peak-table-publisher...yaml:12-19 — peak, rt_min, height_pa,
  area_pa_min, width_min, area_percent, symmetry, saturated, flags. The SHIPPED module publishes
  exactly these names (peak_integration.py table_rows assembly, server/python-executor-service/
  src/computable_lab_analysis/peak_integration.py:1027-1038; PEAK_TABLE_COLUMNS :100).
- WORKING TEMPLATE ALREADY ON THE LANE: ANREV-000011/-000012 (L1-SIGNALDREF peak-integration
  revisions) = d_reader attach + integrate_peaks + requiredCapabilities [peak_detection] + a
  full parameterSchema mirroring §A2 (ANREV-000012 file, lines 40-60 script, :68-121 schema,
  :126-127 engine+capability). Live proof: ANR-000032 ran ANREV-000012 on a real DREF and
  published AOUT-000038 {columns 9, rows 2} + AOUT-000039 content route (handoff 218TH:40-56).
  FAME-2's real-bytes revision is that shape + parentRevisionRef->ANREV-000009 + real-file inputs
  + the threshold defaults tuned so the standard shows ~17 clusters (report the ACTUAL counts).
- Engine pin: reuse ENG-L1G-6a298b or ENG-L1G-95dc64 (lane records declare capability
  peak_detection supported — verified in records/analysis-engine/); do NOT pin
  ENG-PYCAL01-L1T2305 (no peak_detection -> 409). Do NOT mint a new engine unless the orchestrator
  asks (OQ-1).
- API routes: server/src/api/routes.ts:1277-1280 (GET/POST /api/analysis-revisions,
  /analysis-revisions/draft, GET :id). Runs: analysisHandlers create/execute (AnalysisHandlers.ts).

## 4. Grounding — executor, declared-settings, capability gate
- integrate_peaks: peak_integration.py:719. Required/optional param vocabulary (§A2, shipped,
  NO new names): REQUIRED baseline_correction, baseline_window_s, peak_width_s, slope_sensitivity,
  min_width_factor, max_width_factor, saturated_top_fraction_of_max,
  saturated_min_plateau_points, backend; OPTIONAL timed_events, area_reject_pa_min,
  height_reject_pa, method_label, method_revision_ref, channel, skim_ratio,
  valley_to_peak_ratio (peak_integration.py:130-150). Absent reject legs are DECLARED off with a
  REJECT_LEG_OFF log (:767-772) — so the "minimum area to count as a peak" control is
  area_reject_pa_min (+ height_reject_pa; width legs = min/max_width_factor;
  "sensitivity" = slope_sensitivity). Unknown params FAIL loudly (:745-748).
- Artifacts + views the module publishes itself (§A3.6): peak_table {columns, rows} inline
  (:1086-1091), signal_plus_baseline via publish_file -> DREF-backed (:1105-1107),
  effective_parameters provenance (:1124-1125), metrics incl. peaks_detected /
  peaks_rejected_area / saturated_peaks / params_digest (:1067-1084), and TWO views:
  peak_table_view (table) + signal_view (signal) (:1127-1128). The revision script CANNOT
  suppress those two views (module-owned) — this is why the C1 fix is in scope (section 5).
- The GC-7 declared-settings contract (§A2) + the thin entry-script shape to copy:
  ANREV-000011 entryScript (attach(ctx) -> contentHash echo -> integrate_peaks(ctx, decoded,
  ctx.parameters)) — ANREV-000012 lines 40-60. The successor script ADDS its chromatogram view:
  ctx.view('<n>', 'chromatogram', artifact='signal_plus_baseline',
  bindings={'markersFrom': 'peak_table'}) — ctx.view already accepts bindings
  (computable_lab_analysis/ctx.py:326-341) and bindings ride the manifest
  (server/src/analysis/analysisRunner.ts:111-117 ManifestView.bindings) with ZERO server change.
- Capability gate seam (where the 409 lives): analysisRunner.ts:616-627 —
  requiredCapabilities ⊄ engine capabilities.declared(supported/approximate) ->
  ENGINE_CAPABILITY_UNSUPPORTED 409. The negative leg reuses engine
  ENG-CAPUNSUP01-L1T0130 (records/analysis-engine/, declares no peak_detection): mint a
  throwaway variant revision pinning it and expect the 409 with the named token.

## 5. Grounding — views-as-data + the C1 boundary (VERDICT: the fix IS in scope, reuse only)
- Views are manifest data: ctx.view(name, renderer, artifact=, bindings=) (ctx.py:326-341) ->
  OutputManifest.views (analysisRunner.ts:111-122) -> AnalysisPage maps bindings straight through
  (app/src/analysis/AnalysisPage.tsx:526-536) -> ViewRenderer chromatogram arm resolves
  bindings.markersFrom BY SIBLING ARTIFACT NAME (app/src/analysis/ViewRenderer.tsx:300-308) ->
  ChromatogramView resolves markerArtifact/siblings by name (ChromatogramView.tsx:160-170) and
  renders markers + the PEAK MICRO-TABLE with row<->trace sync (ChromatogramView.tsx:171-184,
  344-367). Marker field names are DATA with the shipped fallback DEFAULT_MARKER_FIELDS =
  {rt:'rt_min', label:'peak', saturated:'saturated', flags:'flags'} (ChromatogramView.tsx:42) —
  exactly ANREV-000007's columns. The renderer enum is CLOSED and already contains chromatogram
  + table (schema/knowledge/view-spec.schema.yaml:29-33; ViewRenderer.tsx:44-52 whitelist) —
  NO enum extension needed for FAME-2.
- Persisted view-spec records: the runner writes VSPEC records per manifest view
  (analysisRunner.ts:449-480) — precedent records exist in the lane (VSPEC-000914 chromatogram,
  VSPEC-000915/916 table+signal from the ANREV-000012 run).
- CARRIED FINDING C1, first-hand confirmed: the generic table renderer TableView
  (ViewRenderer.tsx:67-70) accepts ONLY an Array inlineValue; the shipped peak_table artifact is
  {columns:[{name,units,...}...], rows:[...]}. So integrate_peaks' own peak_table_view renders
  "No rows" (live on ANR-000032 / AOUT-000038, handoff 218TH:52-56).
- DECISION (composer-verified): the peak MICRO-TABLE inside ChromatogramView does NOT ride
  TableView — it is ChromatogramView's own table (ChromatogramView.tsx:344-367) fed by
  parseMarkerRows, which correctly reads the {rows} shape
  (app/src/analysis/traceModel.ts:308-329). So the markers + micro-table acceptance legs are
  achievable TODAY with zero TS change. BUT the revision CANNOT suppress the module's built-in
  peak_table_view + signal_view (peak_integration.py:1127-1128) — every FAME-2 run will surface
  the table view, and the acceptance criterion "NON-EMPTY peak artifacts ... table visibly
  changes on re-Analyze" is graded on the analysis surfaces where that view renders "No rows".
  Therefore the minimal generic C1 fix IS IN SCOPE, bounded to:
  app/src/analysis/ViewRenderer.tsx TableView (its test file) ONLY — teach it the shipped
  {columns:[{name,...}]|string[], rows:[...]} shape declaratively: if inlineValue is an object
  with a rows ARRAY, render rows[] honouring columns[].name order/labels when present; plain
  arrays keep today's behavior verbatim; {rows:[]} keeps the named "No rows" arm; anything else
  keeps today's fallback. NO renderer-enum change, NO new component, NO name-based branching
  (shape only — bait: 'peak_table'/'signal_view' string literals are FORBIDDEN in TS), NO
  changes to SignalView/ChromatogramView/AnalysisPage.
- Out-of-scope C1 leftovers (record, don't fix): /analysis dropping ?run= (deep link works);
  effective_parameters {parameters,params_digest} table view will render a 2-col degenerate table
  after the fix — acceptable, it is machine-readable provenance (peak_integration.py:1124-1125);
  the module's signal_view (renderer 'signal') over the DREF-backed signal_plus_baseline rides
  SignalView's content route (ViewRenderer.tsx:93+ OQ-1(a)) — expected to render, not in scope.

## 6. Grounding — parameterSchema controls precedent
- The Analyze page renders a LABELED FORM from the revision's parameterSchema
  (AnalysisPage.tsx:644-680 render rule; :303-309 collectDefaults on revision select;
  collectGateIssues/pruneEmpty :140), imported from app/src/analysis/ParameterForm.
  ANREV-000012's parameterSchema (records file :68-121, additionalProperties:false) is the
  working template — the FAME-2 successor's parameterSchema follows it and ADDS the reject legs:
  area_reject_pa_min + height_reject_pa (numbers, minimum:0, DEFAULTS DECLARED so the tune story
  starts from a known place), min_width_factor/max_width_factor (width-reject legs),
  slope_sensitivity (0..1) already required. Every declared default freezes per run (the run
  stores its parameters; each re-Analyze = new analysis-run record — append-only history;
  analysis-revision.schema.yaml:76-80 parameterSchema description: "the UI renders controls
  from it without executing Python").
- Immutability: a revision edit is IMPOSSIBLE (immutable; editing goes via parentRevisionRef
  chain per schema :4-9) — "each tune = a new immutable run freezing the parameters", NOT a new
  revision, unless params are outside the declared schema.

## 7. Work items (in order; the coder authors RECORDS at :3092, code only per section 5)
W1. Fresh baselines at claim (tests, tsc — section 11) + capture the pristine trunk SHAs.
W2. RED-first vitest for the C1 TableView shape fix (ViewRenderer tests; failing test first with
    {columns:[{name}],rows:[...]} object rendering header cells + cells; plain-array regression
    test unchanged; empty-rows keeps "No rows"). Implement the minimal fix. This is the ONLY
    product-code edit.
W3. Attach/point real .D inputs at the lane: RES35077-5.D and 20201023-COUNTRYSIDE-BUTTER.D
    under /mnt/vast/gc-fid/machine1/ (both exist on device — verified this session by ls).
    Reuse the established DREF-provisioning path the SIGNALDREF run used (ANR-000032's input
    shape, handoff 218TH) — the file-level DREF pin the inputs contract consumes
    (ANREV-000009 inputs[].description :117: "the door's file-level DREF pin").
W4. POST /api/analysis-revisions the successor ANREV: parentRevisionRef -> ANREV-000009,
    entryScript = the ANREV-000011 attach+integrate_peaks shape PLUS the one extra
    ctx.view(..., 'chromatogram', artifact='signal_plus_baseline',
    bindings={'markersFrom':'peak_table'}), inputs [{name:signal, dataKind:signal, required}],
    parameterSchema per section 6 (defaults DECLARED, additionalProperties:false), engineRef ->
    ENG-L1G-6a298b, requiredCapabilities [peak_detection, area_height_reject] — NOTE:
    area_height_reject is an EXISTING enum term (schema :108) and matches the reject legs; keep
    it only if the pinned engine declares it; ENG-L1G-6a298b declares ONLY peak_detection, so
    requiredCapabilities = [peak_detection] (+ width_slope_sensitivity/baseline_control only if
    the orchestrator widens the engine record — OQ-1). sdkVersion 0.4.0.
W5. Run RES35077-5.D at :5192 (Analyze UI); report ACTUAL peaks_detected metric + row count
    (sanity band ~17 clusters: accept 12-22, REPORT the number, do not assert exact); confirm the
    chromatogram renders WITH markers + micro-table; capture the persisted VSPEC records.
W6. Run COUNTRYSIDE (sanity band ~12: accept 8-16, report actual).
W7. Threshold tune: set area_reject_pa_min visibly higher in the form -> new run ->
    peaks_rejected_area metric rises AND the rendered table/marker set shrinks; the FIRST run's
    record + manifest are unchanged (append-only proof: re-GET run 1's digest/params before/after).
    Then lower/tune again for the "visibly changes" receipt both directions.
W8. Negative gate: revision variant pinned to ENG-CAPUNSUP01-L1T0130 (or ANREV-000009's own
    ENG-PYCAL01-L1T2305, which lacks peak_detection) still 409 ENGINE_CAPABILITY_UNSUPPORTED —
    curl the create/execute and capture the {error:...,message} body.
W9. ROUND-TRIP-GATE-1 receipts: per changed surface (chromatogram-with-markers run sheet surface,
    threshold re-Analyze, peak table) capture the outgoing REQUEST BODY + paired rendered
    screenshot; zero interception of /api/ai/**.

## 8. Explicitly out of scope
- FAME-1 (acquisition status qualification; GcSectionChrome attach chrome) — IN FLIGHT in
  parallel; do not touch attach chrome or acquisition-package triplet.
- FAME-3+ : interactive peak->compound assignment, compound_assignments writes, ontology
  picking, AI-chat assignment, area-% denominators, composition checks, cross-run binding,
  renderer-enum extension (FAME-6). Nothing in FAME-2 names a compound.
- No new capability terms, no view-spec renderer enum change, no new engine capability
  declarations, no server-side changes (analysisRunner/AnalysisHandlers untouched), no
  SignalView/ChromatogramView/CompareTraces edits, no task-list edits, no merges.
- The ?run= URL-drop pre-existing finding; effective_parameters presentation.
- Genuine platform gap discovered mid-flight -> STOP that section, return requires-rescope
  (standing wave-2 rule), do not invent product surface.

## 9. Acceptance criteria (verbatim from the task block) + standing gates
VERIFIED BY (task list, verbatim):
  Live at :5192: RES35077-5.D + COUNTRYSIDE runs publish NON-EMPTY peak artifacts (report actual
  cluster counts; ~17 and ~12 expected — sanity range, not exact assert), chromatogram renders
  WITH peak markers (the "no views" dead-end is gone), threshold parameter visibly changes the
  table on re-Analyze, engine without peak_detection still 409s. Round-trip receipts.
Standing gates: tests green; FRESH tsc baseline captured at claim time and zero NEW errors
(pre-existing server baseline drifts per-branch — compare fresh, never an old number);
adversarial review gate; ROUND-TRIP-GATE-1 (request body + rendered pair per changed surface,
zero /api/ai/** interception, "visible DOM" alone is NOT evidence); browser gate on the
run-sheet/analysis surfaces (cl-browser-reviewer, VERDICT accept); NO new vocabulary (capability
enum and renderer enum both untouched); R3/R8 respected (zero peak math / compound truth in TS).

## 10. First targeted check (run before anything else, early-proves the approach)
On trunk, at the lane stack (:3092 up, verified 200 this session):
  curl -s http://localhost:3092/api/records/ANR-000032 | python3 -c "import sys,json;p=json.load(sys.stdin)['record']['payload'];m=p['outputManifest'];print(p['status'],[a['name'] for a in m['artifacts']],[v['renderer'] for v in m['views']],[x['name']+'='+str(x['value']) for x in m['metrics'] if x['name']=='peaks_detected'])"
Expected: succeeded with artifacts incl. peak_table + signal_plus_baseline and the module's
table/signal views — proving integrate_peaks already publishes on a real run today; the ONLY
missing pieces are (a) the chromatogram+markers view and (b) the C1 table shape. If ANR-000032
is absent or its manifest lacks peak_table, STOP and report — the 218TH evidence chain broke.
(Side-check, also early: python -m unittest tests.test_peak_integration in
server/python-executor-service -> "Ran 31 tests ... OK (skipped=1)" — verified by the composer
on trunk tip 5675f5df, so the engine side is NOT the gap.)

## 11. Verification commands (expected outputs)
- Python SDK (the shipped math, unchanged): cd server/python-executor-service &&
  python -m unittest tests.test_peak_integration tests.test_d_reader -> all OK (composer ran
  test_peak_integration: 31 tests OK skipped=1 at 5675f5df).
- Server+app vitest (touched: ViewRenderer suites + full app suite for the C1 fix):
  npm run test -w app (vitest run) -> exit 0; npm run test -w server -- run/analysis suites ->
  exit 0. (Pre-existing note: python-executor-service tests.test_integra_runner errors on
  pristine trunk — environment-related, pre-existing, not FAME-2's; do not "fix" it.)
- Typecheck: npm run typecheck -> the fresh baseline captured at claim minus zero new errors
  (do NOT claim exit-0 unless the fresh baseline was exit-0).
- Records proof: GET /api/records/<new ANREV> -> payload.parentRevisionRef.id == ANREV-000009,
  requiredCapabilities == ["peak_detection"], parameterSchema.properties.area_reject_pa_min
  present with a declared default.
- 409 leg: the create/execute curl -> HTTP 409 body naming ENGINE_CAPABILITY_UNSUPPORTED.
- Browser gate: cl-browser-reviewer on /analysis run-sheet surfaces (chromatogram markers,
  peak table, threshold re-Analyze) with the ROUND-TRIP-GATE-1 pairs; negative claims
  re-verified per the reviewer reliability rule.
- Lane hygiene: git -c core.fileMode=false for all diffs; node_modules in worktrees is a
  SYMLINK — never commit through it; NEVER restart :3092/:5192 (no YAML/schema edits in this
  item — if one sneaks in, STOP, tsx --watch does not reload YAML and restarts are orch-only);
  NEVER pkill; :3001/:5174 untouched; records via API only, never hand-edited YAML, never the
  code repo.

## 12. Worker contract + file ownership
- Branch: wt/fame-2-lane1-<ts> off cl/integration-1 (lane-1 trunk worktree rules; trunk itself
  is the lane integration worktree /mnt/vast/home/brad/git/cl-integration-1 — code work happens
  on the branch, merges are orch-only).
- Deliverable report (unique path): <ORCH-FILL: /home/brad/.hermes/cl/lanes/1/fame-2-report-l1t<ts>.md>
- Files OWNED (the entire code diff): app/src/analysis/ViewRenderer.tsx + its test file(s)
  covering TableView (ViewRenderer.test.tsx et al.). Everything else is DATA: lane-data records
  via API (ANREV successor, runs, VSPECs persisted by the runner, threshold-tune runs), plus the
  report + receipts under ~/.hermes/cl/receipts/FAME-2/<ts>/.
- Mark in-progress on claim; NEVER mark done (orch owns status).

## 13. Reviewer bait (anticipate these; pre-empt in the diff/report)
1. exactOptionalPropertyTypes: ViewRenderer/RenderableArtifact sites — TableView changes must
   not widen optionality; build the cells via explicit spreads, no undefined-assignment.
2. YAML-reload trap: this item declares ZERO schema/lint/ui YAML edits; if the report claims one,
   the stack would need a restart the worker cannot do -> that's a scope break, flag it.
3. Ontology/capability terms: requiredCapabilities items MUST exist in
   analysis-revision.schema.yaml:105-118; grep the final revision record for any term outside
   the enum (expect exactly peak_detection). Renderer strings must exist in the closed enum.
4. Hardcode boundary: greps that MUST come up empty on the code diff: 'peak_table', 'signal_view',
   'RES35077', 'COUNTRYSIDE', '17', '12' as a literal threshold, any compound name inside
   app/src/**. The chromatogram view is bound by artifact NAME via bindings DATA
   (markersFrom:'peak_table' lives in the PYTHON entry script record = DATA, not TS).
5. {columns,rows} edge: columns entries are OBJECTS {name,units,...} in peak_integration.py
   (PEAK_TABLE_COLUMNS) while the C1 fix also accepts string[]; flags is an ARRAY cell —
   String(array) rendering is acceptable for v1 but state it; saturated boolean renders 'true'.
6. Views duplication: the module publishes peak_table_view/signal_view and the revision adds a
   chromatogram view — reviewer will check the persisted VSPEC dedupe (analysisRunner.ts:449-456
   dedupes by artifact+title) doesn't collide; titles differ, fine.
7. Marker micro-table vs TableView conflation: verify WHICH table the acceptance screenshots
   show (ChromatogramView's own vs the generic one) — the report must name both.
8. Append-only proof: re-Analyze must not mutate run 1; reviewer should re-GET run 1 params/digest
   after the tune runs (params_digest metric differs across tunes — that's the freeze witness).

## 14. Open questions (composer could not resolve locally)
OQ-1 (engine capability width): should the FAME-2 revision ALSO require baseline_control /
    width_slope_sensitivity / area_height_reject (all shipped enum terms the module genuinely
    uses)? Checked: ENG-L1G-6a298b + 95dc64 declare ONLY peak_detection
    (records/analysis-engine/*), so requiring more would 409. Default: [peak_detection] only,
    matching the ANREV-000012 precedent; widening the engine record is an orch/architect call.
OQ-2 (input provisioning door): the exact attach UI/API door that minted ANR-000032's signal DREF
    from real .D bytes was not re-derived first-hand this session (218TH handoff names the run +
    AOUT/DREF pair; the file-level pin is described in ANREV-000009 inputs). Checked routes.ts +
    218TH handoff; coder should replay THAT door (git log of SIGNALDREF receipts) — if no lane
    door exists to pin an arbitrary /mnt/vast/gc-fid file, that is a genuine gap: STOP+requires-rescope.
OQ-3 (sanity bands): ~17/~12 expected clusters — codified accept-bands 12-22 / 8-16 above are the
    composer's widening, not architect text. Ratify or replace before promotion.
