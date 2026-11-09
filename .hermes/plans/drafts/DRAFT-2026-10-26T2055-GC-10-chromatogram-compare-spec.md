# GC-10 spec DRAFT: /analysis — interactive chromatogram + same-axes multi-trace Compare (GC-D4)

DRAFT by cl-spec-composer (lane 1, run 2026-10-26T20:55, trunk `cl/integration-1` @ a444f944 code+docs
tip — GC-1..GC-4 + GC-2R merged; GC-4 merge a444f944). NOT orchestrator-reviewed; not dispatchable
until promoted. Every [F] cite below was opened FIRST-HAND this session against
`/mnt/vast/home/brad/git/cl-integration-1` (git `-c core.fileMode=false`); the load-bearing baselines
were EXECUTED in-session (marked [F-run]).

## Status legend

- **[F]** = confirmed fact, cite opened first-hand this session (path:line into trunk @ a444f944).
- **[F-run]** = behavior/number proven by executing a command in-session (baselines below).
- **[G7]** = shape from the PROMOTED GC-7 spec `.hermes/plans/2026-10-28_GC-7-integration-revision.md`
  (cited by its spec-file line numbers). GC-7 code is NOT merged — everything cited [G7] is an
  **AMEND-AT-MERGE** item: re-anchor against GC-7's shipped artifacts/fixtures at dispatch claim,
  never assume shipped. Same discipline as GC-9 spec's [G7d] tag, except this draft cites the
  PROMOTED spec, not the draft.
- **[G9]** = shape from the PROMOTED GC-9 spec `.hermes/plans/2026-10-28_GC-9-parameter-forms.md`
  (promoted 2026-10-26T20:45, OQ ratifications at its :479-488). GC-9 code is NOT merged — [G9]
  cites are AMEND-AT-MERGE.
- **[I]** = inference / design decision of this spec, flagged for the orchestrator.

## Goal (one sentence)

Replace the 320x120 static polyline `SignalView` with a shipped interactive chromatogram renderer
(zoom drag-select / pan / reset / hover readout / RT-peak markers / peak-table row <-> trace sync,
axes labeled from artifact-carried units data) and ship the GC-D4 killer feature — a prominent
**Compare traces** action overlaying signals from MULTIPLE RUNS on ONE set of axes with stable
per-trace colour + data-driven legend + independent show/hide, rejecting incompatible axes unless a
scientist-declared conversion rides the spec data — with saved comparisons persisted as view-spec
RECORDS (data) pinning their source artifacts, zero hidden normalization/resampling, and visual-only
decimation that never touches analysis inputs.

## Authority (read in this order; scope is theirs, not mine)

1. Task block GC-10, `/home/brad/.hermes/cl/lanes/1/task-list.md:7960-7982` — description
   (:7966-7974) and `verified by` (:7978-7981) are BINDING. `files:` (:7982) =
   "app/src/analysis/ViewRenderer.tsx (+ chromatogram/compare components), view-spec schema enum,
   tests". deps: GC-7, GC-9 (:7965).
2. The task's hard lines (verbatim clauses, restated where they bind design): *data-only view
   specs*; *incompatible axes rejected or require declared conversion — no hidden
   normalization/resampling*; *saved comparisons are view-spec data pinning their sources*; *stable
   per-trace colour + legend (sample, run, channel, source)*; *visual decimation allowed; analysis
   inputs stay full-res*.
3. GC-D4 intake ruling (ChemStation compare is undiscoverable; ours is a first-class action —
   task `why:` :7975-7977: "Replaces the weakest renderer inside the existing ViewRenderer dispatch
   rather than a parallel chart app").
4. GC-7 promoted spec (the artifact shapes this renderer consumes) + GC-9 promoted spec (the page
   this item shares `AnalysisPage.tsx` with — merge-order rebase risk, see §Worker contract).
5. Handoffs `.hermes/plans/handoffs/` 91st-94th — UI gates go through the orch deterministic-
   Playwright route FIRST (91st §4); commit-after-every-step (83rd §3); GC-4 merge a444f944.

## Oriented facts — shipped reality [F], every line opened first-hand

### F1. The renderer being replaced (the ONLY dispatch site)

- [F] `app/src/analysis/ViewRenderer.tsx:25` — `RenderableView.renderer` union
  `'table' | 'signal' | 'metric' | 'static-figure' | 'model' | 'binary'`.
- [F] ViewRenderer.tsx:63-89 `SignalView` — THE target: reads `inlineValue.axis` / `.values`,
  fixed `W = 320`, `H = 120` (:68-69), one `<polyline>` (:86), `data-testid="view-spec-signal"`
  (:85), `stroke="currentColor"`. No hover, no zoom, no markers, no axis labels, NO unit rendering
  at all. Single-trace only (`artifact` is one record, :24).
- [F] ViewRenderer.tsx:123-143 `ViewRenderer` switch — `default:` arm renders the visible
  compatibility error `Unsupported renderer: <name>` (`view-spec__error`, testid `view-spec-error`,
  :137-141). Unknown renderer = visible error, never silent.
- [F] ViewRenderer.tsx:156-176 `renderViews(views, artifacts)` — matches view -> artifact by NAME
  (`artifacts.find(a => a.name === view.artifact)`, :161); missing artifact = visible
  `Missing artifact for view` error (:163-166). It is a pure per-view map — there is no cross-view
  state bus (bears on §D2's row<->trace sync design).
- [F] ViewRenderer.tsx:10-19 `RenderableArtifact` — `id/name/dataKind` + optional `inlineValue`,
  `units`, `schema`, `format`, `dataReferenceRef?: { id }`. **A dref-backed artifact reaches the
  renderer with NO inlineValue and only a `{id}` pointer** — see F5's payload gap.
- [F] `app/src/analysis/AnalysisPage.tsx:194-215` — the page's view whitelist
  `['table','signal','metric','static-figure']` (:201) **coerces any other manifest renderer string
  to `'table'`** (SILENTLY — the compatibility error arm never fires for these). New enum members
  MUST be added to this whitelist in the same commit or a `chromatogram` manifest view renders as a
  table (reviewer bait #4). Model/binary cards are synthesized client-side (:209-214).
- [F] `app/src/analysis/ViewRenderer.compat.test.tsx:38-47` — PB-CH-5 "source-pin": reads
  `readFileSync('src/analysis/ViewRenderer.tsx')` and asserts ZERO occurrences of
  `['quantum','heatmap','scatter','component-tree']` + presence of `view-spec__error`. The new ids
  `chromatogram`/`trace-compare` are NOT in the banned list — the literal assertion survives
  widening; the PB-CH-5 comment ("closed set preserved") must be amended WITH the task-mandated
  widening, not deleted (bait #2). NOTE: this test cwd-traps — it only runs with cwd = `app/`
  [F-run, F6].
- [F] `app/src/analysis/ViewRenderer.test.tsx:24,45` — the frozen PB-CH-5 suite asserts
  `view-spec-signal` testid exists and the error arm names `quantum`. Keep the `signal` renderer +
  its testid working byte-compatibly (static polyline stays as the plain `signal` arm; the
  chromatogram is a NEW renderer id, not a mutation of `signal` — [I] decision, rationale §D1 +
  OQ-3).

### F2. The view-spec schema (the enum to extend)

- [F] `schema/knowledge/view-spec.schema.yaml:29-31` — `renderer` enum
  `[ table, signal, metric, static-figure ]` ONLY. `:26-27` `artifactRef` = single
  `$ref: ./datatypes/ref.schema.yaml`; `:33-36` `bindings` = free object
  (`additionalProperties: true`); `:38-41` `options` = free object, description
  "Presentation options (labels, units, thresholds, colors)"; `:11`
  `unevaluatedProperties: false`; `required: [kind,id,title,artifactRef,renderer]` (:55);
  description header (:4-8): "Only SHIPPED React renderers execute … the manifest is data only."
- [F] **Schema/TS divergence exists on trunk:** the schema enum lacks `model`/`binary` even though
  ViewRenderer.tsx:25 dispatches them — because model/binary views are page-synthesized, never
  persisted as view-spec records. GC-10 extends BOTH: schema enum + TS union (bait #3).
- [F] Runner-persisted view-spec records: `server/src/analysis/analysisRunner.ts:357-387` — one
  `view-spec` record per manifest view, payload
  `{kind, id: VSPEC-NNNNNN, title, artifactRef: {kind:'record', id: AOUT-…, type:'analysis-output-artifact'}, renderer}`
  (:377-383); id minted max+1 over `list({kind:'view-spec'})` (:364-372). The persisted view carries
  NO bindings/options (only the manifest view does) — saved user comparisons written by the client
  MAY carry bindings (§D4); the runner path is untouched.
- [F] `server/src/analysis/analysisSchema.test.ts:147-166` — the server-side view-spec schema test
  asserts `renderer: 'signal'` validates and `renderer: 'quantum'` is rejected. Enum widening keeps
  both legs true; adding a `chromatogram` positive leg belongs to GC-10's server-test delta ONLY
  if the schema edit lands (§Files IN).

### F3. Artifact dataKinds + the trace payload shape GC-7 ships [G7]

- [F] `schema/knowledge/analysis-output-artifact.schema.yaml:40-42` — `dataKind` enum
  `[ table, signal, signal-collection, spatial-array, image, model, binary, metric, sequence,
  sequence-collection, alignment, sequence-hits ]`. `:50-53` inlineValue XOR dataReferenceRef;
  `:55-63` free `schema` + per-field `units` maps.
- [G7] GC-7 promoted spec :415 (§A3.6): the integration run publishes `signal_plus_baseline`
  (dataKind `signal`) via `publish_file` of a tempfile JSON
  `{axis, values, baseline, axis_units: "min", value_units: "pA", integration_windows}` -> blob ->
  **dref-backed, NO inlineValue** (GC-7 spec :530 states it verbatim: "signal_plus_baseline has
  `dataReferenceRef` + NO inlineValue"). AMEND-AT-MERGE: re-read the shipped entry script/fixture.
- [G7] GC-7 spec :308-318 (§A1): `peak_table` (dataKind `table`, inline) with columns `peak,
  rt_min, height_pa, area_pa_min, width_min, area_percent, symmetry, saturated, flags` + per-column
  `units` + `schema` definitions; declared-null cells carry reason codes in `flags`. The
  chromatogram's marker layer and the row<->trace sync consume THIS shape as data (property names
  arrive from the artifact's `schema`/rows — never hardcoded in TS for prod paths, §D3).
- [G7] GC-7 spec :418: "GC-10 replaces the renderer, not this contract" — the artifact contract is
  stable; GC-10 changes rendering only.

### F4. Where trace bytes live (the payload gap — load-bearing)

- [F] `server/src/analysis/analysisRunner.ts:314-340` — blob artifacts ALWAYS -> storage; object
  values whose JSON >= 50,000 chars -> storage; small values stay `inlineValue` (:340). A 72,801-
  point GC-1-class trace is far over 50k -> dref-backed [G7 confirms].
- [F] persistedManifest (:476-479) stores per artifact `value` ONLY when inline, plus
  `dataReferenceRef` when large — `GET /api/analysis-runs/:id` (routes.ts:1270,
  AnalysisHandlers.ts:74-85 returns the full record envelope) therefore delivers inline small
  artifacts' payloads but large traces as a DREF POINTER ONLY.
- [F] **No byte-serving route exists for data-references**: `server/src/api/routes.ts:1249-1256`
  storage routes are `/storage/devices`, `/storage/devices/:id/browse` (metadata only),
  `/storage/acquire` — NO content/read route. `routes.ts:1216-1218`
  `/studies/:studyId/artifacts/:artifactId/blob` is the study-artifact (PDF bytes) route scoped to
  `ART-*` ids with `file.stored_path` (`server/src/api/handlers/ArtifactBlobHandlers.ts:27-49`) —
  wrong id grammar, wrong record kind, wrong storage shape. `GET /records/:id` (routes.ts:235)
  returns the data-reference ENVELOPE (storageDeviceId + path + contentHash), not bytes.
  [F-run] greps: `grep -rn "data-references" server/src/api/routes.ts` -> 0 hits; `client.ts` has
  no dataReference content fetch.
- [I] Consequence: **the client CANNOT fetch a dref-backed trace's JSON today.** The browser receipt
  ("overlays two DIFFERENT runs, hovers a peak") on GC-7-class artifacts is impossible without
  either (a) one read-only content route, or (b) an engine-side display copy. This is OQ-1 with a
  recommendation; the task's `files:` field does not list a server file, so the orchestrator must
  rule.

### F5. Page data path (what Compare can ride WITHOUT new mounts)

- [F] `app/src/shared/api/client.ts` — `listAnalysisRuns` :3231-3233, `getAnalysisRun(id)`
  :3247-3249 (full payload incl. `outputManifest` + `outputArtifactRefs`), `executeAnalysisRun`
  :3251-3261 (returns live manifest + artifactRefs), `getRecord(recordId)` :2296,
  `listRecordsByKind(kind, limit, offset)` :2135-2150 (GET /records?kind=), `createRecord` :2456
  (POST /records, server VALIDATES against schemaId — `server/src/store/RecordStoreImpl.ts:568,
  1005-1018` validates on create via the schema validator).
- [F] `AnalysisPage.tsx:167-176` `selectRun` — click-only `getAnalysisRun` (fetching a run's full
  manifest happens on CLICK today; the mount contract is untouched by click-driven fetches).
- [F] `AnalysisPage.tsx:54-55` state — `manifest` + `artifactRefs` are per-SINGLE-run today;
  Compare needs a multi-run artifact index (§D4 builds it from the ALREADY-FETCHED `runs` list +
  click-fetched run payloads — no new endpoint, no new mount fetches).
- [F] `app/src/analysis/AnalysisPage.no-execute.test.tsx:1-12` (read in full via GC-9 spec F6 +
  re-confirmed present) — mount fires EXACTLY `listAnalysisRevisions` + `listAnalysisRuns`, zero
  else. GC-10 adds NO mount-time or selection-time fetch (bait #5).
- [F] GC-9 (unmerged [G9]) edits the SAME `AnalysisPage.tsx` (its §B: RevPayload, paramValues,
  render rule, submit) AND its §Out-of-scope explicitly protects ViewRenderer.tsx (GC-9 spec :296).
  GC-10 lands AFTER GC-9 per deps — rebase hunks onto GC-9's shipped page shape at claim; GC-10's
  own hunks are the renderer whitelist (:201), the Compare action affordance (§D4), and
  results-pane wiring. GC-10 must NOT touch GC-9's parameter-form regions (bait #6).

### F6. Baselines executed this session [F-run] (cwd traps included)

- [F-run] `cd /mnt/vast/home/brad/git/cl-integration-1/app && npx vitest run src/analysis` ->
  **7 files, 22/22 GREEN** (15.9s, run 21:25). TRAP (GC-9 F6, re-confirmed by the compat test's
  relative `readFileSync`): app vitest MUST run with cwd = `app/`.
- [F-run] `npm run typecheck -w app` -> **21 `error TS` lines, ZERO inside src/analysis**.
- [F-run] `npm run typecheck -w server` -> **0 errors**. GC-10's server delta is schema YAML (+ one
  schema-test leg) only unless OQ-1 sanctions a route.
- [F] `app/tsconfig.json:18` strict, NO `exactOptionalPropertyTypes` in app (it is
  `server/tsconfig.json:13` only) — same posture GC-9 F6: payload shapes still omit absent keys.
- [F] `app/package.json` — dependencies carry `@rjsf/*`, codemirror, tiptap, pdfjs-dist, tailwind,
  react-router; **NO chart library at all** (no d3, no chart.js, no visx, no plotly) [F: whole
  deps block read first-hand]. Decision [I]: handwritten SVG interaction, no new dependency —
  rides the ViewRenderer precedent, stays jsdom-testable, keeps the closed-set doctrine. See OQ-2
  for the honest alternative.
- [F] `app/src/analysis/AnalysisPage.css:79-87` — existing `view-spec__*` class block; new chrome
  extends this file's conventions.
- [F] YAML-reload trap (task-list env facts, GC-5 F22): `tsx --watch` does NOT reload YAML — the
  view-spec enum edit needs `cl-lane-stack.sh 1 restart` before any curl proof. NEVER :3001/:5174.

## Acceptance criteria — verbatim from the task list (task-list.md:7978-7981)

> Vitest on renderer + compare selection logic; browser receipt: reviewer finds Compare without
> instruction, overlays two DIFFERENT runs, hovers a peak, resets to full trace; perf acceptable
> at GC-1 trace sizes.

Description clauses that also bind (task-list.md:7966-7974), mapped in §Acceptance mapping:

> Replace the 320x120 static polyline: shipped chromatogram renderer (view-spec enum extended;
> data-only specs) — zoom (drag-select), pan, reset, hover readout, RT/peak markers, peak-table
> row <-> trace sync, explicit pA/min axes. Plus the killer feature: a prominent Compare traces
> action overlaying multiple signals on ONE set of axes — standard vs sample or two samples,
> across different runs; stable per-trace colour + legend (sample, run, channel, source);
> independent show/hide. Incompatible axes rejected or require declared conversion — no hidden
> normalization/resampling. Saved comparisons are view-spec data pinning their sources. Visual
> decimation allowed; analysis inputs stay full-res.

### Acceptance mapping (every description + verified-by clause -> deliverable + proof)

| Clause (verbatim fragment) | Deliverable | Proof |
|---|---|---|
| "Replace the 320x120 static polyline … view-spec enum extended; data-only specs" | D1 enum + ChromatogramView; `signal` kept per bait #2 | schema positive legs (verif 4); ChromatogramView render tests; bindings-guard tests (D6) |
| "zoom (drag-select), pan, reset, hover readout" | D2 interaction state | V-suite: drag->domain, pan, reset-to-full, readout numerics (verif 1, receipt c-d) |
| "RT/peak markers, peak-table row <-> trace sync" | D2 markers + micro-table, field names via bindings [G7] | two-way sync tests `chromatogram-row-*`/`chromatogram-marker-*` |
| "explicit pA/min axes" | D2 axis labels from artifact `units`/`axis_units` [G7] | axis-label test with test-local units; bait #7 grep pin (no unit literals) |
| "prominent Compare traces action … across different runs" | D4 header button + run-grouped picker | receipt a-b (two DIFFERENT runs overlay) |
| "stable per-trace colour + legend (sample, run, channel, source); independent show/hide" | D3.5 + D4 legend | colour-stability + toggle tests (bait #9); receipt e |
| "Incompatible axes rejected or require declared conversion — no hidden normalization/resampling" | D3.2/D3.3 gate | conflict tests + byte-identity-on-conflict (bait #8); receipt f |
| "Saved comparisons are view-spec data pinning their sources" | D4 save via /records (server-validated), AOUT refs in bindings | verif 4 POST + receipt g (record lists both ids, reload re-renders) |
| "Visual decimation allowed; analysis inputs stay full-res" | D3.4 + D5 freeze pins | decimation purity tests (verif 1); readout-on-raw-points test |
| "Vitest on renderer + compare selection logic" | traceModel.test.ts + component tests | verif 1-2 |
| "browser receipt: finds Compare without instruction / two runs / hover / reset" | D4 prominence | verif 5 a-d |
| "perf acceptable at GC-1 trace sizes" | D5 O(width) decimation | verif 5 h receipt (wall-clock + droppedCount recorded) |

## Files IN scope

- `app/src/analysis/ViewRenderer.tsx` (union +2 ids, dispatch +2 arms, `signal` arm untouched,
  compat comment amended per bait #2)
- `app/src/analysis/ChromatogramView.tsx` (NEW — interactive single-trace renderer + markers +
  bound peak-table sync; §D2/D3)
- `app/src/analysis/CompareTraces.tsx` (NEW — trace registry UI, axis-compat gate, legend,
  show/hide, saved-comparison writer; §D4)
- `app/src/analysis/traceModel.ts` (NEW — pure logic: trace extraction from run payloads, decimation
  (visual-only), axis-compat check + declared-conversion arithmetic, stable colour assignment —
  unit-testable without DOM)
- `app/src/analysis/AnalysisPage.tsx` (whitelist :201 +2; Compare affordance + results-pane wiring
  ONLY — GC-9 regions untouchable)
- `app/src/analysis/AnalysisPage.css` (view-spec__chromatogram / __compare chrome)
- `app/src/analysis/ChromatogramView.test.tsx`, `CompareTraces.test.tsx`, `traceModel.test.ts`,
  `AnalysisPage.compare.test.tsx` (NEW tests; do NOT grow the frozen ViewRenderer.test.tsx)
- `schema/knowledge/view-spec.schema.yaml` (renderer enum `[table, signal, metric, static-figure,
  chromatogram, trace-compare]`; bindings/options stay the free objects that carry the data-only
  specs — §D1)
- `server/src/analysis/analysisSchema.test.ts` (+2 legs: chromatogram validates, trace-compare
  validates; quantum leg untouched)
- OQ-1 PENDING (NOT in this list until the orchestrator rules): a read-only trace-content route +
  handler + client method IF option (a) is ratified.

## Explicitly OUT of scope (hard stops)

- NO changes to `server/src/analysis/analysisRunner.ts`, `analysisService.ts`, or any GC-4/5/6/7
  file — GC-10 CONSUMES artifact shapes; any gap found = STOP + report (requires-rescope).
- NO new analysis kind, NO lifecycle/coverage-pin edits (view-spec is an existing covered kind —
  adding enum values does not touch the four fence files).
- NO GC-11 calibration-curve renderer, NO calibration semantics, NO quantification.
- NO parameter-form changes (GC-9's file regions, F5), NO chat-panel changes.
- NO new chart dependency (package.json untouched; adding one requires OQ-2 ratification first).
- NO hidden numeric behavior: no smoothing, no resampling, no auto-scaling of VALUES, no
  normalization of trace bytes; decimation affects RENDERED POINTS ONLY and is never persisted
  anywhere (§D5).
- NO edits to `config/sequence-analysis/**`, `app/src/sequences/**`, `app/src/run/**` (the DNA run
  page rides the same `signal` renderer — untouched per F1's signal-keeps-polyline decision).
- NO browser-manual NAS paths; lane stack :3092/:5192 only, NEVER :3001/:5174.

## Design

### D1 — view-spec: two new SHIPPED renderers, data-only specs

Schema enum becomes `[ table, signal, metric, static-figure, chromatogram, trace-compare ]`
(F2 file :29-31). `TS union` at ViewRenderer.tsx:25 gains the same two ids. The specs ride the
EXISTENT free `bindings` object (schema :33-36 — additionalProperties:true means NO schema property
addition is needed; the closed SHAPE is enforced client-side by a named-error guard, §D6).
Canonical shapes [I] (documented as a comment block in view-spec.schema.yaml's bindings header so
the data contract is reviewable where the enum lives):

```
# chromatogram view bindings (all optional, data-only):
#   markersFrom: "peak_table"          # sibling artifact NAME -> RT markers
#   markerRtField / markerLabelField   # property NAMES in the marker artifact rows
#   baselineFrom: "signal_plus_baseline"; baselineField: "baseline"   # overlay key
# trace-compare view:
#   artifactRef = the PRIMARY trace artifact (schema-required field satisfied honestly)
#   bindings.traces: [ { artifactRef: {kind:'record', id:'AOUT-…', type:'analysis-output-artifact',
#                                      label?: '<data label>'},
#                        conversion?: { factor: number, toUnit: string, declaredBy: string } } ]
#   bindings.axisUnits: { x: '<unit string as seen>', y: '<unit string as seen>' }  # echo for audit
```

Colour is NOT spec data (§D5 stability rule derives it from record ids); the schema's `options`
description already says colors are presentation options — the renderer overrides them with the
stable derivation, documented in the comment block.

- `ViewRenderer` dispatch: `case 'chromatogram'` / `case 'trace-compare'` route to new components;
  `trace-compare` inside the per-view `ViewRenderer` (single-artifact) path renders its error arm
  (`view-spec__error`, naming that compare views render through the Compare surface, §D4) — the
  dispatch arm exists so an orphan trace-compare view-spec is VISIBLE, never blank.
- `signal` stays the static polyline byte-compatibly (testid `view-spec-signal`, DNA/generic
  artifacts unaffected). AnalysisPage's synthetic chromatogram upgrade: when a manifest view says
  `chromatogram` the whitelist passes it (F1 bait #4); when a plain `signal` artifact is GC-class
  there is NO heuristic upgrade — the revision's manifest view decides (data, not sniffing).

### D2 — ChromatogramView.tsx — the interactive single trace

Props: `{ artifact: RenderableArtifact; markerArtifact?: RenderableArtifact;
bindings?: Record<string, unknown> }` (AnalysisPage resolves `markersFrom` by artifact NAME —
renderViews has no cross-view bus, F1 :156-176; the chromatogram component owns its micro-table).

- Data-in: `{axis, values, ...extra}` inline OR fetched-per-OQ-1; axis/values parsed like SignalView
  (:65-67). Missing/short axis -> visible named empty-state, never a thrown render.
- **Zoom (drag-select)**: mousedown-drag draws a selection rect; mouseup sets the x-domain to the
  selection; **Pan**: drag on plot (no modifier) translates the domain; **Reset**: labeled button
  `data-testid="chromatogram-reset"` restores the FULL domain computed from the data (not from the
  spec). State is component-local view state — never written back to any record.
- **Hover readout**: nearest-sample readout `data-testid="chromatogram-readout"` showing
  `<x> <x-unit> / <y> <y-unit>` — units VERBATIM from the payload/`units` map (F3/G7
  `axis_units`/`value_units`; GC-10 TS contains ZERO `pA`/`min` literals — bait #7). Reads raw
  points, not decimated points (§D5).
- **Markers**: from `markerArtifact` rows (property names via bindings `markerRtField` /
  `markerLabelField`, defaulting to the [G7] §A1 names ONLY as *fallback field-name data*, held in
  an exported const table, never inline stringly logic — bait #7). Rows with null rt are skipped
  visibly (count in a legend line, never silently dropped).
- **Row <-> trace sync**: the component renders the bound peak table rows (labels verbatim from the
  artifact's `schema`/`units`) as a compact table under the plot; row-click highlights the marker
  (+ scrolls readout to that RT), marker-click highlights the row; testids
  `chromatogram-row-<peakId>` / `chromatogram-marker-<peakId>` symmetric so the sync test is
  two-way (acceptance clause "peak-table row <-> trace sync").
- **Axes**: x-axis ticks + y-axis ticks with unit strings from data; axis labels rendered from the
  payload's unit fields — the task's "explicit pA/min axes" arrives via GC-7's artifact units [G7],
  not via TS strings.

### D3 — traceModel.ts — the pure, tested core (no DOM, no React)

Exported pure functions (each is a vitest target):

1. `extractTrace(runRecord, artifactRefId): Trace | TraceError` — resolve
   `AOUT-*` -> payload -> inline `{axis, values, units}` (OQ-1 adds the fetched-bytes arm here).
   Trace = `{ recordId, runId, runTitle, artifactName, axis: number[], values: number[],
   xUnit?: string, yUnit?: string }` — legend fields come from RECORD data (run payload title,
   artifact name, artifact `label` in bindings) — "legend (sample, run, channel, source)" renders
   whatever labels the data carries; TS never invents "Sample A" chrome (bait #7).
2. `checkAxes(traces, conversions?): {ok:true} | {ok:false, conflicts: [...]}` — REQUIRED
   same-name unit strings on both axes (string equality on the data-carried units; absent unit on
   any trace = conflict `UNIT_UNDECLARED`, never assume). A conflict clears ONLY when the
   comparison data carries an explicit `conversion {factor, toUnit, declaredBy}` for that trace
   AND the post-conversion unit strings then match. NO implicit factor discovery, no resampling,
   no offsetting — x-domains may differ freely (overlay on the union of extents is honest);
   monotonic-non-numeric axis -> conflict `AXIS_NOT_NUMERIC`.
3. `applyDeclaredConversion(trace, conversion)` — multiply values + rename unit; the ONLY place
   arithmetic touches values, and only under scientist-declared data.
4. `decimateForRender(axis, values, pixelWidth, mode='min-max'): RenderSlice` — per-pixel bucket
   min/max pair (preserves peaks); returns indices + a `droppedCount` the UI shows ("decimating
   N points for display — full resolution is preserved in the artifact"). NEVER rewrites inputs
   (acceptance: pure over inputs; input arrays untouched — pinned by a test asserting the source
   arrays are unchanged).
5. `colorForTrace(recordId, paletteIndexFromSortedRank)` — sort participating traces by artifact
   recordId; assign from a fixed 8-colour palette cycling; identical colour across sessions/runs
   for the same artifact set membership rule stated explicitly: **rank within the saved spec's
   trace list sorted by id** (a show/hide or a member added changes ONLY that ordering rule's
   deterministic output — test the stability leg: same spec, different toggle state, same colours).
6. `buildCompareViewSpecPayload(traces, axisUnits, conversions) -> {kind:'view-spec', id, title,
   artifactRef (primary), renderer:'trace-compare', bindings}` — the saved-comparison shape (§D4).

### D4 — Compare traces — the first-class action

- Prominence (acceptance: "finds Compare without instruction"): a top-level button in the results
  pane header — `data-testid="analysis-compare-btn"`, label **"Compare traces"**, visible whenever
  >= 2 succeeded runs exist (NOT hidden in a disclosure; disabled+reason when < 2 — no dead
  chrome, and the disabled reason names what's missing).
- Selection surface (CompareTraces.tsx, opens over the results pane): left column = every
  succeeded run's signal-class artifacts (walks the ALREADY-FETCHED `runs` list; expanding a run
  click-fetches its manifest via the existing `getAnalysisRun` — click-only, F5); checkboxes pick
  traces (>= 1 from >= 2 runs encouraged, 1 trace from 1 run is a legal compare too — honest
  message, not a wall). Multi-RUN is headline: the list groups by run so two different runs are
  side by side.
- Axis-compat gate: `checkAxes` runs LIVE on the selection; conflicts render as named rows
  (`trace-compare-axis-conflict`): `axis units differ: run A y="pA" vs run B y="AU" — no
  automatic conversion is performed; add a declared conversion (factor + unit) below or remove the
  trace.` Declared-conversion inputs are scientist-entered (data -> view-spec bindings). This IS
  the task's "rejected or require declared conversion" leg — no third door.
- Overlay: ONE shared x-axis (union of visible extents) + ONE shared y-axis; each visible trace
  gets `colorForTrace` stroke + a legend row (colour swatch + sample/run/channel/source labels
  FROM DATA) + show/hide checkbox (hide = excluded from axes recomputation? NO — axes recompute
  from VISIBLE traces only, standard compare semantics; hidden traces never silently rescale
  anything — pinned test).
- **Save comparison**: "Save as view" writes ONE `view-spec` record via
  `apiClient.createRecord` (schemaId view-spec; server validates — F5 RecordStoreImpl:568).
  RecordId minting client-side mirrors the runner's max+1 rule (F2 :364-372): list `view-spec` via
  `listRecordsByKind('view-spec', 5000)`, compute `VSPEC-NNNNNN` max+1 (collision-safe enough for
  the lane; the server validator enforces schema, id uniqueness via store.create failure — surface
  the named error, retry once). Payload = `buildCompareViewSpecPayload` — artifact refs pin
  AOUT-* record ids, so the saved comparison survives run re-execution immutably (pinned sources,
  task clause). Saved comparisons list back through `GET /records?kind=view-spec&…`
  (`listRecordsByKind`, existing client fn — zero client.ts changes unless OQ-1(a) fires).

### D5 — decimation is visual-only (the hard line, mechanically pinned)

`decimateForRender` output flows ONLY into SVG geometry. Nothing writes it: not to a record, not to
the manifest, not to the hover readout (readout snaps to raw points). A pin-test asserts:
(1) inputs structurally unchanged (deep-freeze + identity check), (2) rendered `<polyline>` point
count <= 2 x pixel-buckets while `trace.values.length` is untouched, (3) `droppedCount > 0` shows a
declared UI line. Perf clause: decimation guarantees O(width) SVG nodes at 72k-point GC-1 sizes
[perf receipt in the browser gate, not a fixed number].

### D6 — named client-side guards (no silent blanks anywhere)

A `parseChromatogramBindings(v)` / `parseCompareBindings(v)` closed-shape guard: malformed bindings
render `view-spec__error`-styled named messages (`bindings.traces[1].conversion.factor is not a
number — refusing to guess`), matching the item's existing visible-error doctrine (F1 :137-141).
Unknown binding keys pass (forward-compat, additionalProperties is the schema's own stance) but are
listed in a dev-visible audit line [I].

## First targeted check (run before writing any component)

```
cd /mnt/vast/home/brad/git/cl-integration-1/app && npx vitest run src/analysis 2>&1 | tail -5
```
Expected at claim: **7 files, 22/22 GREEN** (re-capture — GC-7/GC-9 merges will have changed the
count; cite the fresh number in the first commit, GC-9's claim-time rule). Then RED-first:

```
cd /mnt/vast/home/brad/git/cl-integration-1/app && npx vitest run src/analysis/traceModel 2>&1 | tail -5
```
Expected: FAIL "Cannot find module './traceModel'" (test file committed first, component missing).
This proves the pure-core approach (axis-compat + decimation + colour stability) before any SVG is
written.

## Verification (complete, with expected output)

1. `cd /mnt/vast/home/brad/git/cl-integration-1/app && npx vitest run src/analysis`
   Expected: ALL files pass; count = baseline + 4 new files' tests, 0 failures. Legs the reviewer
   will hunt: axis-conflict rejection WITHOUT a conversion changes NOTHING about the traces
   (byte-identity of values); declared conversion clears exactly its own conflict; hide/show never
   recolors; decimation leaves inputs frozen; whitelist passes `chromatogram` through (a manifest
   view `renderer:'chromatogram'` must NOT table-coerce, F1); `signal` polyline testid survives.
2. `cd /mnt/vast/home/brad/git/cl-integration-1/app && npx vitest run src/analysis/ViewRenderer.test.tsx src/analysis/ViewRenderer.compat.test.tsx src/analysis/AnalysisPage.no-execute.test.tsx`
   Expected GREEN: frozen suite untouched; compat literal-pin suite still asserts the banned list +
   error arm (comment amended per bait #2); mount accounting UNMODIFIED (bait #5).
3. `npm run typecheck -w app` -> **21 error TS lines** (re-captured baseline drifts with merges —
   count must not GROW, zero inside src/analysis). `npm run typecheck -w server` -> **0**.
4. Schema legs (server, after YAML restart — F6 trap):
   `cd server && npx vitest run src/analysis/analysisSchema.test.ts` -> all pass incl. the two new
   positive legs; then live: `cl-lane-stack.sh 1 restart` and
   `curl -s localhost:3092/api/records?kind=view-spec -H 'accept: application/json' | head -c 300`
   loads clean; POST a chromatogram-shaped view-spec via /records with a seeded AOUT ref -> 200
   with schema validation passing (if OQ-1(a) is NOT ratified, save-compare rides bindings on
   inline artifacts only — see OQ-1 for what the browser receipt uses).
5. Browser receipt (orch deterministic-Playwright route FIRST, 91st handoff §4; lane stack
   :3092/:5192): seed TWO succeeded runs each producing a small-inline signal artifact via a seeded
   revision (test-local entry script publishing `{axis, values}` + units — allowed seeding, same
   doctrine as GC-9's OQ-3 fold). Steps, each an assertion:
   a. reviewer lands on /analysis, selects a succeeded run, **finds `Compare traces` with zero
      instruction** (visible in results header, no disclosure click);
   b. picks one trace from run A and one from run B -> overlay on one axis pair, two distinct
      stroke colours + legend rows naming both runs' titles;
   c. **hovers a peak** -> readout shows numeric x/y + unit strings;
   d. drag-selects a zoom window, pans, **clicks Reset -> full trace returns** (domain equals data
      extent — assert via the readout extremes or a data-domain testid);
   e. toggles trace B's visibility off -> legend persists, axes rescale to A only, B's colour
      unchanged when re-shown;
   f. seeds a mismatched-units artifact (values with y="AU") -> Compare names the conflict, offers
      declared conversion only; entering factor 1000 clears it; NOTHING rescaled before entry;
   g. Save as view -> `GET /records?kind=view-spec` shows the trace-compare record pinning both
      AOUT ids; reload proves it re-renders;
   h. perf: at 72k-point GC-1-class size the overlay stays interactive (receipt records wall-clock
      + droppedCount line; no fixed threshold — reviewer judges "acceptable").
6. `git -c core.fileMode=false status` in worktree: no bytes, no fixtures committed (all seeds are
   API-minted lane data).

## Worker contract

- Worktree/branch off lane trunk: `/mnt/vast/home/brad/git/wt/gc-10-lane1-<stamp>`, branch
  `wt/gc-10-lane1-<stamp>` off the CURRENT `cl/integration-1` tip AT DISPATCH (draft baseline
  a444f944; dispatch gated by the orchestrator on GC-7 AND GC-9 MERGED per task deps — GC-9 merge
  changes AnalysisPage.tsx, so re-anchor hunks at claim). All git `-c core.fileMode=false`. Trunk
  worktree READ-ONLY; commit nothing there.
- Report at `/home/brad/.hermes/cl/lanes/1/gc-10-report-<unit>.md`; end-marker
  `GC10 DONE <sha>` / `GC10 BLOCKED <reason>`; log `lanes/1/logs/coder-GC10-<unit>.log`.
- Commit-after-every-step mandate (83rd handoff §3): one commit per deliverable in
  `[GC-10][A]..[F]` style (traceModel test-first RED, traceModel, ChromatogramView, CompareTraces,
  schema+dispatch+wiring, saved-view + browser-runbook), each message naming the acceptance clause
  it advances.
- Baselines RE-CAPTURE AT CLAIM (numbers drift): app vitest src/analysis count, app typecheck error
  lines, server typecheck 0 — cite in the first commit body.
- AMEND-AT-MERGE at claim, mechanically: [G7] payload field names vs GC-7's shipped
  `signal_plus_baseline` / `peak_table` fixtures (read the shipped records via the lane API);
  [G9] AnalysisPage shape vs GC-9's shipped hunks. Drift in THEIR names -> STOP + report, never
  rename.
- Stop boundary -> requires-rescope (with the [F] cite as evidence): any need to edit
  analysisRunner/analysisService (F4's gap is OQ-1, pre-ruled there — do not "absorb" a route
  unless OQ-1(a) was ratified in the dispatch brief); any new chart dependency (OQ-2); any
  pressure to change the `signal` renderer's output; any GC-9 region edit; any bindings shape that
  would force a schema `properties` addition beyond the enum (bindings/options free objects absorb
  everything — if they don't, STOP).

## Reviewer bait — likely adversarial attacks on this item, pre-empted

1. **"You widened PB-CH-5's closed set."** The compat suite's COMMENT says preserved; the TASK
   (:7967 "view-spec enum extended") mandates widening. Defense: the banned-identifier assertion
   survives untouched, `quantum` still hits the visible error arm (test kept, extended), the
   comment amended to name the task line. Do NOT delete or weaken any assertion — add.
2. **Frozen `ViewRenderer.test.tsx`**: `signal` testid + polyline must survive byte-identically
   (DNA surfaces ride it). Chromatogram is a NEW arm; if anyone proposes "just make signal
   interactive," the frozen suite + OQ-3 rationale are the counter.
3. **Schema/TS divergence trap** (F2): a reviewer will POST `renderer: 'chromatogram'` at /records
   and watch Ajv reject if only the TS union was extended. Enum edit + YAML restart + server
   positive leg are the trifecta; a "works in UI, rejected by API" split is a defect.
4. **The AnalysisPage silent-coercion trap** (F1 :201): whitelist coerces unknown renderers to
   `table` with NO error. If the whitelist hunks land AFTER the schema/dispatch commit, there's an
   intermediate window where chromatogram views table-ify — land whitelist + dispatch + union in
   ONE commit, with the pass-through test in it.
5. **Mount-accounting attack** (F5): Compare must add ZERO fetches at mount or selection — every
   new fetch is click-gated (run-expand, save, load-comparison). W-suite re-runs the no-execute
   suite unmodified as proof.
6. **GC-9 collision**: both items touch AnalysisPage.tsx. GC-10's hunks are :201 whitelist, results
   header affordance, results-pane wiring. Touching parameter-form regions = scope violation with
   GC-9 spec :296 as the evidence.
7. **Hardcode-boundary grep**: prod TS (`ChromatogramView.tsx`, `CompareTraces.tsx`,
   `traceModel.ts`) contains ZERO occurrences of `pA`, `AU`, `min`, `baseline_correction`,
   `timed_event`, `ChemStation`, `FAME`, `signal_plus_baseline`, `rt_min`, `peak_table` — units
   arrive from artifact payloads; field-name FALLBACKS live in one exported const (and tests may
   name fields — they're fixtures). Pin with a grep test (GC-9's pattern), CI-owned.
8. **"You rescaled something."** The axis-compat test suite must prove value arrays are
   byte-identical pre/post conflict states (deep-equal on frozen inputs), and the decimation test
   proves no persistence. Any `* 1e3`-style constant in traceModel.ts = instant defect.
9. **Colour stability under membership churn**: reviewer will add/remove/reorder traces between
   saves. The rule (§D3.5) is stated deterministically; the test matrix covers toggle-state
   invariance AND save/reload identity. Random/`uuid`-based colours = defect.
10. **exactOptionalPropertyTypes**: app has no EOPT (F6) BUT saved view-spec payloads must OMIT
    absent optional keys (server stores verbatim; the [G7] module-failure doctrine applies to view
    specs too — a `"conversion": undefined` in bindings is a poisoned record). Use the
    `...(x ? {k:v} : {})` spread; assert saved payload with `toStrictEqual` + key-set checks.
11. **YAML-reload trap** (F6): the enum proof requires a lane-stack restart; a curl against an
    un-restarted server proves nothing.
12. **Ontology terms**: none required — no knowledge-layer claim/context/assertion/evidence kinds
    are touched; view-spec is an existing kind getting enum DATA widened. Say so in the PR body so
    the reviewer doesn't hunt `docs/knowledge-layer-canonical-example.md` obligations here.
13. **dref-trace honesty** (OQ-1 dependent): if OQ-1 is NOT ratified, the Compare surface must show
    a NAMED, per-trace state on dref artifacts ("full trace stored on device — display bytes not
    served by any route today") and NEVER render a partial/scaled fake. A chromatogram that looks
    full-res while plotting decimated-from-what is the worst outcome.

## Open questions (for orchestrator; recommendations stated, no silent decisions)

- **OQ-1 (LOAD-BEARING) — how does the browser get full-resolution trace bytes for dref-backed
  signal artifacts?** Facts: GC-7 ships `signal_plus_baseline` dref-only (F3/G7 :415, :530); the
  50k routing sends anything GC-1-sized to storage (F4 :314-321); NO route serves data-reference
  bytes (F4, grep-proved) — `GET /records/:id` gives the envelope, the study-blob route is ART-*
  scoped. Options: **(a) RECOMMENDED** — one read-only `GET
  /api/analysis-artifacts/:id/content` that resolves artifact -> dataReferenceRef ->
  `storageService.getProvider(deviceId).read(path)` (the EXACT channel `provisionInputs` already
  uses, analysisRunner.ts:166-171; path is pinned in an immutable DREF record — no traversal
  surface) and streams JSON; adds `server/src/api/routes.ts` +1 route line, a small handler, one
  client method + OQ-sanctioned test file — a deviation from the task's literal `files:` field, so
  rule it here; **(b)** GC-10 renders inline-class traces only, dref arm visible-but-unrenderable
  (bait #13) — the browser receipt then rides seeded small-inline artifacts and the REAL GC-7
  traces stay unviewable until a later item (GC-11/GC-12 will hit the same wall); **(c)** engine-side
  display-decimated inline echo in GC-7's contract — rejected: edits GC-7's contract (out of
  scope) and pre-decimates display data (against the task's decimation spirit). What I checked:
  routes.ts full analysis/storage greps, ArtifactBlobHandlers scoping, RecordStoreImpl validation,
  client.ts analysis + records surfaces, GC-7 promoted spec §A3.6.
- **OQ-2 — no chart library.** package.json has zero chart deps (F6); spec chooses handwritten SVG
  + pure traceModel (ViewRenderer precedent, jsdom-testable, closed-set doctrine, no new supply
  chain). Alternative: add a small lib (e.g. visx primitives) — ~40% less interaction code but a
  new dependency, jsdom friction, and a second rendering paradigm to review. Ratify handwritten
  unless the browser perf leg fails at GC-1 sizes (it should not: decimated to O(width) SVG nodes).
- **OQ-3 — new ids vs mutating `signal`.** Spec adds `chromatogram` + `trace-compare` rather than
  making `signal` interactive: the frozen PB-CH-5 suite + DNA lane ride `signal`'s static output;
  discriminator semantics ("only SHIPPED renderers execute") read cleanest as one id per shipped
  component; GC-11 will add `calibration-curve` the same way. Alternative: `options.interactive`
  flag on `signal` — rejected (behavior fork inside one id; compatibility-error doctrine blurrs).
  Low risk either way; ratify for the enum wording in the schema comment.
- **OQ-4 — saved-comparison loading UX depth.** This spec saves and lists view-spec records and
  re-renders them (receipt step g) but does NOT build a full saved-comparisons browser (named
  picker + deep-link `/analysis?compare=VSPEC-…`). Enough for the acceptance clause ("saved
  comparisons are view-spec data pinning their sources"); a compare deep-link probably belongs to
  GC-12's run-sheet wiring. Checked: no existing view-spec GET-by-id client route needs (records
  route suffices). Rule whether deep-link is demanded for this item.

## Draft completeness

All sections landed and verified against trunk @ a444f944 on-disk trail: legend/authority, oriented
facts F1-F6 (every [F] opened first-hand; baselines [F-run] executed 21:25), acceptance verbatim +
clause mapping, Files IN/OUT, Design D1-D6, First targeted check, Verification 1-6, Worker
contract, Reviewer bait 1-13, OQ-1..4 with recommendations. Awaiting orchestrator review; the
GC-7/GC-9 AMEND-AT-MERGE items ([G7]/[G9]) are re-anchor steps at dispatch claim, not blockers to
promotion of this draft.
