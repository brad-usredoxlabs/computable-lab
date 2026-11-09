# GC-11 spec DRAFT: /analysis — calibration review view: table <-> curve <-> residual selection

DRAFT by cl-spec-composer (lane 1, run 2026-10-27T06:20 EDT, trunk `cl/integration-1` @ code tip
`a015a594` / docs tip `cdc004ce` — GC-1..GC-6 + GC-2R merged; GC-7 coder LIVE in
`wt/gc-7-lane1-l1t0520`, GC-8/9/10 specs PROMOTED but code UNMERGED). NOT orchestrator-reviewed;
not dispatchable until promoted AND deps GC-8/GC-9/GC-10 merge. Every [F] cite below was opened
FIRST-HAND this session against `/mnt/vast/home/brad/git/cl-integration-1` (git
`-c core.fileMode=false`); the load-bearing baselines were EXECUTED in-session (marked [F-run]).

## Status legend

- **[F]** = confirmed fact, cite opened first-hand this session (path:line into trunk @ a015a594).
- **[F-run]** = behavior/number proven by executing a command in-session (baselines below).
- **[G7] / [G8] / [G9] / [G10]** = shape from the PROMOTED specs `.hermes/plans/2026-10-28_GC-7-
  integration-revision.md`, `2026-10-28_GC-8-calibration-revision.md`, `2026-10-28_GC-9-parameter-
  forms.md`, `2026-10-29_GC-10-chromatogram-compare.md` (cited by their spec-file line numbers).
  NONE of that code is merged — every [Gn] cite is an **AMEND-AT-MERGE** item: re-anchor against the
  SHIPPED artifacts/fixtures/exports at dispatch claim, never assume shipped.
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

1. Task block GC-11, `/home/brad/.hermes/cl/lanes/1/task-list.md:8158-8177` — description (:8165-
   :8169) and `verified by` (:8174-8175) are BINDING (re-quoted verbatim below). `files:` (:8176) =
   "app/src/analysis/ (calibration renderer + wiring + tests), view-spec enum". deps: GC-8, GC-9,
   GC-10 (:8163).
2. The task's hard lines (verbatim clauses that bind design): *selecting a calibration-table row
   highlights its point + residual and links to its originating run*; *Changes (point inclusion,
   model params) spawn a NEW analysis-run — completed models are never mutated*; *Uncalibrated vs
   quantitative results visually distinct*; *Full-text column headers (no 'Man...' truncation)*.
3. GC-8 promoted spec — THE artifact contract this renderer consumes: calibration_table columns
   [G8:276-297 §A1], fit/statistic/residual definitions [G8:299-360 §A2], artifact + provenance
   contract incl. the `calibration_model` payload and `source_point_ref` per fit point
   [G8:443-456 §A6], the two-revisions/two-modules shape [G8:256-274 §A0], `levels[]`-as-parameters
   with per-level `fit`/`required` [G8:458-474 §A7, :695-701 OQ5].
4. GC-10 promoted spec — the renderer precedent: handwritten SVG + pure model module (OQ-2 RATIFIED
   at [G10:629]), new-id-per-shipped-component (OQ-3 RATIFIED: "GC-11 adds `calibration-curve` the
   same way" [G10:631]), enum-widening trifecta + whitelist trap ([G10:512-518] baits #3/#4),
   read-only artifact-content route RATIFIED [G10:620-627] (NOT needed here — see F7).
5. GC-9 promoted spec — the labeled-controls surface the recalculation rides: ParameterForm props
   [G9:176-213 §A], submit/payload rules [G9:214-244 §B], default pre-fill + visible overrides
   [G9:246-256 §C], OQ ratifications [G9:479-488].
6. GC-7 promoted spec — peak_table columns the originating-run link lands on [G7:302-322 §A1];
   GC-10 owns its chromatogram renderer for the source-run surface, GC-11 does not re-render traces.
7. Handoffs `.hermes/plans/handoffs/` 101st-104th — commit-after-every-step (83rd §3), UI gates go
   through the orch deterministic-Playwright route FIRST (91st §4), GC-7 LIVE-worker checkpoint
   (104th: do NOT read `wt/gc-7-lane1-l1t0520` unmerged state as fact).

## Oriented facts — shipped reality [F], every line opened first-hand

### F1. The renderer dispatch GC-11 widens

- [F] `app/src/analysis/ViewRenderer.tsx:25` — `RenderableView.renderer` union
  `'table' | 'signal' | 'metric' | 'static-figure' | 'model' | 'binary'`; switch at :123-143;
  `default:` arm = visible `Unsupported renderer:` error (`view-spec__error`,
  testid `view-spec-error`, :137-141). GC-10 [G10:301] adds `chromatogram` + `trace-compare` arms
  ahead of GC-11 — re-anchor at claim.
- [F] `ViewRenderer.tsx:34-61 TableView` — headers are the UNION of row-object keys rendered as
  `<th key={c}>{c}</th>` (:47) with `String(r[c] ?? '')` cells (:54); `RenderableArtifact` (:10-19)
  carries NO per-column label field, so **the artifact's property names ARE the headers** — the
  "full-text column headers, no 'Man...'" clause is (a) a ban on introducing CSS truncation and
  (b) GC-8's column names rendering verbatim (`response_raw_pa_min` et al. [G8:281-294]). No
  ellipsis/`text-overflow`/`nowrap` exists on `.view-spec__table` today (grep
  `ellip|text-overflow|nowrap` in `app/src/analysis/AnalysisPage.css` → 0 hits [F-run in-session]).
- [F] `ViewRenderer.tsx:156-176 renderViews(views, artifacts)` — per-view map, matches view ->
  artifact by NAME; **no cross-view state bus** — the table<->curve<->residual selection state lives
  INSIDE one composite component (same finding as [G10 F1] bears on GC-10's sync design).
- [F] `app/src/analysis/ViewRenderer.compat.test.tsx:39-44` — source-pin:
  `readFileSync('src/analysis/ViewRenderer.tsx')` asserts ZERO occurrences of
  `['quantum','heatmap','scatter','component-tree']` + presence of `view-spec__error`.
  **CRITICAL for GC-11: the banned list contains the literal word `scatter` — the new arm id is
  `calibration-curve` and ViewRenderer.tsx must never contain the string "scatter" (comment or
  otherwise). All "scatter" prose lives in CalibrationCurveView.tsx / docs.** (GC-10's [G10 bait #1]
  rule applies: amend the PB-CH-5 COMMENT to name the task-mandated widening; add assertions,
  never delete/weaken.)

### F2. The view-spec enum — GC-11 adds exactly ONE value, and nobody upstream proposed it for GC-11

- [F] `schema/knowledge/view-spec.schema.yaml:29-31` — enum `[ table, signal, metric,
  static-figure ]` on trunk today.
- [G8:144-146, 454-456] GC-8's spec B4 mints **no** enum value ("The interactive calibration-curve
  view is GC-11's item"); GC-8's revisions publish `table` views only.
- [G10:249-251, 277] GC-10's promoted spec extends the enum to `[table, signal, metric,
  static-figure, chromatogram, trace-compare]` — its proposal does NOT include calibration-curve
  (its OUT-of-scope [G10:263] explicitly excludes GC-11's renderer), and its OQ-3 ratification
  says GC-11 adds `calibration-curve` **the same way** [G10:631].
- **[I] Consequence (checked, not invented):** GC-11 adds exactly one enum member —
  `calibration-curve` — on top of GC-10's shipped four+two, in GC-11's own commit, reusing
  GC-10's widened shape verbatim. No second proposal exists or is needed.

### F3. The AnalysisPage silent-coercion whitelist (must move in the same commit)

- [F] `app/src/analysis/AnalysisPage.tsx:194-207` — the page's view whitelist
  `(['table','signal','metric','static-figure'] as const).includes(...)` **silently coerces any
  other renderer string to `'table'`** (:201-203). GC-10 lands `chromatogram`/`trace-compare` into
  this list (its bait #4 mandates one commit); GC-11's `calibration-curve` MUST land in the
  whitelist + TS union + schema enum + dispatch arm in ONE commit or the curve silently table-ifies
  (same trap, same defense).
- [F] `AnalysisPage.tsx:209-214` — **client-synthesized views precedent**: model/binary artifacts
  without a manifest view get a synthesized `model`/`binary` card view client-side. This is the
  door GC-11 rides for its composite view (§D1): the GC-8 revisions publish `table` views [G8:454];
  GC-11 synthesizes the `calibration-curve` composite client-side when a run's manifest carries a
  calibration_table-shaped AND calibration_model-shaped artifact (structural gate, §D1 — not name
  sniffing), AND the widened enum makes a persisted `calibration-curve` view-spec record validate +
  dispatch honestly for the forward path (orch can seed one via /records — server validates on
  create [G10 F5] RecordStoreImpl:568).
- [F] `AnalysisPage.tsx:179-217 rendered` useMemo builds `RenderableArtifact[]` from
  `manifest.artifacts` + `artifactRefs` via `toRenderable` (:334-352) — inline values arrive here
  verbatim (calibration artifacts are inline, F7), and `artifactRefs[name].artifactRecordId` gives
  the AOUT record id for every artifact (§D2's run-link rides this).
- [F] mount accounting pin: `app/src/analysis/AnalysisPage.no-execute.test.tsx:1-12,38-40` — mount
  fires EXACTLY `listAnalysisRevisions` + `listAnalysisRuns`, zero else. Any GC-11 mount-time fetch
  must be gated to the `?run=` deep-link param being present (SequencesPage precedent, F6) and the
  suite re-runs unmodified as proof.

### F4. GC-8's artifacts, as specified (AMEND-AT-MERGE shapes — the renderer's whole input)

- [G8:443-450 §A6] Three inline `table`-kind artifacts per CAL run: `calibration_table` (rows =
  §A1 columns), `calibration_model` (`{model_version, model, equation, coefficients, weighting,
  origin_constraint, statistic_name, statistic_value, statistic_definition, residual_basis,
  response_quantity, amount_unit, fit_points: [{amount, response, weight, relative_residual,
  source_input, source_peak_index, source_point_ref}], x_min, x_max, calibration_run_id,
  params_digest, calibration_scope: "analytical"}`), `effective_parameters`.
- [G8:281-297 §A1] calibration_table columns: `level, compound_label, compound_ref, amount,
  rt_target_min, rt_window_min, peak_source, response_raw_pa_min, response_ratio, fit_point,
  relative_residual, flags` — every null paired with a reason code in `flags`; `fit_point` is the
  per-level DECLARED inclusion boolean [G8:292].
- [G8:289, 448] **the originating-run pointer exists and is machine-readable**: `peak_source`
  (which input name + peak row) on the table row, and `source_point_ref = {artifact_or_dref_id,
  input_name, peak_row_index}` on each model fit point. The AOUT artifact record carries
  `runRef` [F: `schema/knowledge/analysis-output-artifact.schema.yaml:27-30 runRef property, :83
  required: [kind,id,title,runRef,name,dataKind]`] — so row -> artifact record -> `runRef.id` =
  originating analysis-run, via the EXISTING `apiClient.getRecord` (client.ts:2296 [F]) — zero
  server change (§D2).
- [G8:319-334] the named statistic is echoed data: `statistic_name` + `statistic_value` +
  `statistic_definition` (definition emitted verbatim so a reader never guesses); residuals are
  `relative_residual` (%) on the FIT response quantity, `residual_basis` says which in words;
  excluded points carry `EXCLUDED_FROM_FIT` [G8:293]. **The renderer renders these strings/numbers
  verbatim — it computes NO statistic of its own.**
- [G8:341-353] failure vocabulary, [G8:467-474 §A7] parameter lists: point inclusion lives in the
  `levels[]` parameter, per-level `fit` (required boolean) — the recalculation control is a `fit`
  checkbox rendered by GC-9's ParameterForm over the GC-8 revision's parameterSchema (§D4).
- [G8:414-421 §A4] quantified results: `quantified_peak_table` carries `model_artifact_id`,
  `model_params_digest`, the amount columns named with the model's declared unit, `area_percent`
  in its OWN column, and the schema honesty sentence ("area_percent is ... NOT a mass fraction,
  NOT a concentration...") — **this is the data the calibrated/uncalibrated distinction reads from
  (§D5); no new artifact kinds, no new fields needed.**

### F5. What GC-7/GC-8 runs look like client-side (never-mutate + spawn-new-run plumbing, all shipped)

- [F] `app/src/shared/api/client.ts` — `createAnalysisRun` :3235-3245 (POST /analysis-runs; body
  `{title, revisionRef, inputs, parameters?}`), `executeAnalysisRun` :3251-3261, `getAnalysisRun`
  :3247-3249 (full payload incl. frozen `parameters` + `revisionRef`), `listAnalysisRuns` :3231,
  `getRecord` :2296, `createRecord` :2456, `listRecordsByKind` :2135.
- [F] `server/src/api/routes.ts:1268-1272` — analysis-runs list/create/get/execute + promote routes
  shipped; **no PUT/PATCH/UPDATE route exists for runs or artifacts — mutation is server-side
  impossible today; GC-11 keeps it that way (never propose one).**
- [F] `schema/knowledge/analysis-run.schema.yaml:44-53` — run `inputs`/`parameters` frozen at
  submit; `revisionRef` required (:164). A recalculation = `createAnalysisRun` with the SOURCE
  run's `revisionRef` + a NEW parameters object → new recordId; the old run's stored payload is
  re-read unchanged after (immutability proof, bait #6).

### F6. Where the "originating run" link can actually land (checked exhaustively)

- [F] `app/src/App.tsx:202` — `/runs/:runId` renders `RunWorkspacePage`, whose server half
  `RunWorkspaceService.getRunWorkspace` **rejects any record whose payload.kind !== 'run'**
  (`server/src/run-workspace/RunWorkspaceService.ts:328` — returns null → 404 for an
  `analysis-run` record [F-run read this session]). `/runs/:runId` is the DNA/event run sheet —
  NOT a destination for analysis runs today (GC-12's run-sheet is where GC run surfaces land).
- [F] `/registry` (App.tsx:225, RegistryHostPage) has NO record-selection deep link —
  `RecordRegistryPage.tsx` contains zero `useSearchParams` [F-run grep]; a link there cannot
  preselect a record.
- [F] Precedent that works: `app/src/sequences/SequencesPage.tsx:37` — "ISEQ-2 §4b deep-link
  consumer: /lab/sequences?record=<id> selects that record once" — the house pattern for
  select-on-arrival is a QUERY PARAM on the surface that hosts the entity.
- **[I] Therefore §D3's answer:** the originating-run link is `/analysis?run=<AREF-recordId>`;
  AnalysisPage grows a one-shot consumer: on mount, if `?run=` is present, click-select it via the
  EXISTING `selectRun` path (`AnalysisPage.tsx:167-176`, `getAnalysisRun` on selection — the same
  fetches a manual click fires; mount accounting unchanged when the param is absent, F3). Landing
  on the source run shows ITS results (GC-10's chromatogram/peak table renders it) — the traceability
  loop closes on surfaces that already exist. Flagged as OQ-1 (low-risk; GC-12 may later add a
  first-class run-sheet destination — a link href is the seam, not the wall).

### F7. No payload-fetch problem for GC-11 (unlike GC-10) — stated so nobody over-builds

- [F-run] GC-8's artifacts are INLINE by contract: tables are tens-to-hundreds of rows, far under
  the 50,000-char storage-routing threshold (`server/src/analysis/analysisRunner.ts:314-340` — blob
  artifacts always -> storage, object JSON >= 50k -> dref, small values stay inlineValue; [G8:128-130]
  states "Calibration payloads are tens-to-hundreds of rows — inline is honest"). The persisted
  manifest carries inline `value` per artifact [G10 F4 re analysisRunner.ts:476-479] and
  `getAnalysisRun` delivers it. **GC-11 needs ZERO byte-serving: do NOT call GC-10's
  `/analysis-artifacts/:id/content` route for the curve (§D7); if a calibration artifact ever
  arrives dref-backed (pathological size), render the named honest error arm, not a fake.**

### F8. Baselines executed this session [F-run] (cwd traps included)

- [F-run] `cd app && npx vitest run src/analysis` → **7 files, 22/22 GREEN** (15.85s, 06:35).
  TRAP: app vitest MUST run with cwd = `app/` (compat source-pin reads relative paths).
- [F-run] `npm run typecheck -w app` → **21 `error TS` lines, ZERO inside src/analysis**.
- [F-run] `npm run typecheck -w server` → **0 errors**.
- [F] `app/tsconfig.json` strict, NO `exactOptionalPropertyTypes` in app (server/tsconfig.json:13
  only) — same posture as GC-9 F6/GC-10 F6; payload shapes still OMIT absent keys.
- [F] `app/package.json` deps read whole: **NO chart library** (no d3/chart.js/visx/plotly);
  react-router-dom present (`useSearchParams` available, zero new dep). GC-10's handwritten-SVG
  route is RATIFIED precedent [G10:629].
- [F] YAML-reload trap (task-list env facts; GC-5 F22): `tsx --watch` does NOT reload YAML — the
  enum edit needs `cl-lane-stack.sh 1 restart` before any curl proof. NEVER :3001/:5174.
- [F] GC-7 coder LIVE in `wt/gc-7-lane1-l1t0520` (104th handoff) — at GC-11's claim GC-7 is long
  merged; until then NOTHING from that worktree is fact.

## Acceptance criteria — verbatim from the task list (task-list.md:8174-8175)

> Vitest render/selection tests; browser receipt: reviewer identifies an outlier, jumps to its
> source run, and triggers a versioned recalculation via labeled controls.

Description clauses that also bind (task-list.md:8165-8169), mapped in §Acceptance mapping:

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

## Files IN scope

- `app/src/analysis/ViewRenderer.tsx` (union +1 id `calibration-curve`, dispatch +1 arm; existing
  arms untouched; compat COMMENT amended per bait #1 — assertions only added)
- `app/src/analysis/CalibrationCurveView.tsx` (NEW — composite curve + residual strip + table +
  selection + run-link + recalc affordance; §D1-D4)
- `app/src/analysis/calibrationModel.ts` (NEW — pure, no DOM: structural artifact-shape guards,
  row<->fit-point join, outlier identification by `max |relative_residual|` OVER THE ARTIFACT'S OWN
  residuals [G8:327] with NO invented threshold, provenance classifier quantitative/uncalibrated —
  §D2/D5)
- `app/src/analysis/AnalysisPage.tsx` (whitelist +1 in the same commit; `?run=` deep-link consumer
  (§D3/F6); client-synthesized calibration-curve view pairing (§D1); provenance badges (§D5) —
  GC-9's parameter-form regions and GC-10's Compare regions UNTOUCHABLE)
- `app/src/analysis/AnalysisPage.css` (calibration chrome; NO text-overflow/ellipsis on table
  headers — bait #7)
- `app/src/analysis/CalibrationCurveView.test.tsx`, `calibrationModel.test.ts`,
  `AnalysisPage.calibration.test.tsx` (NEW; do NOT grow frozen ViewRenderer.test.tsx)
- `schema/knowledge/view-spec.schema.yaml` (renderer enum + `calibration-curve`, on top of GC-10's
  two; bindings comment block documents the curve's bindings, §D1)
- `server/src/analysis/analysisSchema.test.ts` (+1 positive leg `calibration-curve`; quantum leg
  untouched — mirrors GC-10's [G10:449] trifecta)
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

