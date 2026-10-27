# GC-10 spec (RE-ANCHORED l1t1405): /analysis — interactive chromatogram + same-axes multi-trace Compare (GC-D4)

RE-ANCHOR PASS by cl-spec-composer (lane 1, run l1t1405, 2026-10-27, trunk `cl/integration-1` @
**b12112e5** — GC-9 merge, code tip; GC-7 merged at 2598e451, an ancestor). This draft re-anchors the
promoted spec `.hermes/plans/2026-10-29_GC-10-chromatogram-compare.md` (composer draft @ a444f944,
orch-promoted l1t2245 @ be76c512, OQ-1..4 ratified) against the CURRENT trunk after BOTH merged
deps landed: **GC-7** (peak integration, merge 2598e451) and **GC-9** (parameterSchema forms,
merge b12112e5 — `AnalysisPage.tsx` gained ~233 lines: ParameterForm wiring, Advanced JSON state,
effective-preview). **NO intent changes**: same goal, same acceptance criteria, same deliverables
modulo the OQ-1(a) server delta the orchestrator ALREADY RATIFIED at promotion, same stop
boundaries, same OQ dispositions. Every [G7]/[G9] AMEND-AT-MERGE clause is now CLOSED — the tags
below resolve to shipped code, opened first-hand this session. Every corrected cite carries
`RE-ANCHORED l1t1405`; the full old->new table is in §Re-anchor record at the end. Baselines marked
[F-run] were EXECUTED this session at b12112e5.

## Status legend

- **[F]** = confirmed fact, cite opened FIRST-HAND this session at trunk b12112e5
  (`/mnt/vast/home/brad/git/cl-integration-1`, git `-c core.fileMode=false`). Where the promoted
  spec's line cite survived unchanged, that is stated explicitly (it is evidence, not staleness).
- **[F-run]** = behavior/number proven by executing a command in-session (baselines below).
- **[G7]** = GC-7 shape. GC-7 IS MERGED (2598e451) — [G7] now resolves to SHIPPED code/tests,
  opened first-hand at trunk. AMEND-AT-MERGE clause CLOSED (F3 leg was already closed l1t1255 at
  2598e451; this pass re-confirms at b12112e5: zero drift, `git -c core.fileMode=false diff
  2598e451..HEAD -- server/src schema app/src/shared/api/client.ts` -> **empty**).
- **[G9]** = GC-9 shape. GC-9 IS MERGED (b12112e5) — [G9] resolves to the shipped
  `ParameterForm.tsx` + `AnalysisPage.tsx` hunks. AMEND-AT-MERGE clause CLOSED.
- **[I]** = inference / design decision (unchanged from the promoted spec; the ratifications at
  the promotion record supersede the open-question posture — see §OQ status).

## OQ status (ratified at promotion l1t2245 — restated, NOT reopened)

- **OQ-1: RATIFIED (a)** — one READ-ONLY `GET /api/analysis-artifacts/:id/content` resolving
  artifact -> `dataReferenceRef` -> `storageService.getProvider(deviceId).read(path)` (the exact
  provisionInputs channel — RE-ANCHORED l1t1405: that channel is
  `server/src/analysis/analysisRunner.ts:221-222`, the promotion record's `:166-171` cite is stale;
  `provisionInputs` itself starts at :147). Sanctioned deviation from the task's literal `files:`
  field: `server/src/api/routes.ts` +1 route line, a small handler, one client method + its test
  file. Server files for OQ-1 move from "PENDING" into §Files IN (this is a STATUS update, not an
  intent change — the ratification text is quoted verbatim in the promoted spec :630-636).
- **OQ-2: RATIFIED handwritten SVG + pure traceModel.** No new chart dependency (re-verified
  in-session: `grep -in "d3|chart|visx|plotly|recharts" app/package.json` -> 0 hits
  RE-ANCHORED l1t1405).
- **OQ-3: RATIFIED new ids** `chromatogram` + `trace-compare`; `signal` stays the static polyline.
- **OQ-4: DEFERRED** — saved-comparison deep-link `/analysis?compare=VSPEC-…` is GC-12's.
  Receipt step (g) (save -> reload -> re-render from the view-spec RECORD) remains the FULL
  acceptance obligation.
- **Saturated-flag honesty FOLD** (display-only) stays folded in, restated with shipped-code cites
  in §D2/bait #7. No lint rule; no fake lint.

## Goal (one sentence — unchanged)

Replace the 320x120 static polyline `SignalView` with a shipped interactive chromatogram renderer
(zoom drag-select / pan / reset / hover readout / RT-peak markers / peak-table row <-> trace sync,
axes labeled from artifact-carried units data) and ship the GC-D4 killer feature — a prominent
**Compare traces** action overlaying signals from MULTIPLE RUNS on ONE set of axes with stable
per-trace colour + data-driven legend + independent show/hide, rejecting incompatible axes unless a
scientist-declared conversion rides the spec data — with saved comparisons persisted as view-spec
RECORDS (data) pinning their source artifacts, zero hidden normalization/resampling, and
visual-only decimation that never touches analysis inputs.

## Authority (read in this order; scope is theirs, not mine)

1. Task block GC-10, `/home/brad/.hermes/cl/lanes/1/task-list.md:8262-8285` — RE-ANCHORED l1t1405
   (promotion-audit cite `:7990-8012` drifted again; GC-9/GC-8 bookkeeping pushed the block).
   `description:` :8268-8276, `why:` :8277-8279, `verified by:` :8280-8283 are BINDING. `files:`
   :8284 = "app/src/analysis/ViewRenderer.tsx (+ chromatogram/compare components), view-spec schema
   enum, tests". deps: GC-7, GC-9 (:8267) — **both MERGED** (2598e451, b12112e5); dispatch
   dependency satisfied (task owner line :8265).
2. The task's hard lines (verbatim clauses, restated where they bind design): *data-only view
   specs*; *incompatible axes rejected or require declared conversion — no hidden
   normalization/resampling*; *saved comparisons are view-spec data pinning their sources*; *stable
   per-trace colour + legend (sample, run, channel, source)*; *visual decimation allowed; analysis
   inputs stay full-res*.
3. GC-D4 intake ruling (ChemStation compare is undiscoverable; ours is a first-class action —
   task `why:` :8277-8279 RE-ANCHORED l1t1405: "Replaces the weakest renderer inside the existing
   ViewRenderer dispatch rather than a parallel chart app").
4. GC-7 and GC-9 are now SHIPPED AUTHORITY, not specs: their artifacts/fixtures/pages ARE the
   trunk (see §Oriented facts — [G7]/[G9] cites resolve to real files at b12112e5).
5. Handoffs `.hermes/plans/handoffs/` — latest is the **118th**
   (`2026-10-27_lane1-tick-20261027T1410-GC9-DONE-MERGED-b12112e5-…-118TH.md`)
   RE-ANCHORED l1t1405 (was "91st-94th"). Carried doctrine unchanged: UI gates go through the orch
   deterministic-Playwright route FIRST with the inner-scroller screenshot technique
   (`scripts/gc4-gate-scroll-probe.mjs` pattern); commit-after-every-step (83rd §3). NEW at the
   118th, AS-L1T1405-2: the GC-9 gate runs ANR-000006/7 are queued-NEVER-executed (stub engine) —
   the GC-10 browser gate needs its OWN artifact-bearing fixture; this spec's §Verification 5
   seeds its own succeeded runs via API (the seed doctrine already written into the promoted spec
   absorbs the observation — no new deliverable).

## Oriented facts — shipped reality [F], every line opened first-hand at b12112e5

### F1. The renderer being replaced (the ONLY dispatch site)

- [F] `app/src/analysis/ViewRenderer.tsx:25` — `RenderableView.renderer` union
  `'table' | 'signal' | 'metric' | 'static-figure' | 'model' | 'binary'`. **The whole file is
  byte-identical to the promoted spec's baseline**: `git -c core.fileMode=false diff
  a444f944..b12112e5 -- app/src/analysis/ViewRenderer.tsx` -> 0 lines (verified in-session).
  RE-ANCHORED l1t1405 = "verified unchanged", every [F] cite below re-opened, none moved.
- [F] ViewRenderer.tsx:63-89 `SignalView` — THE target: reads `inlineValue.axis` / `.values`
  (:65-67), fixed `W = 320`, `H = 120` (:68-69), one `<polyline>` (:86),
  `data-testid="view-spec-signal"` (:85), `stroke="currentColor"`. No hover, no zoom, no markers,
  no axis labels, NO unit rendering at all. Single-trace only (`artifact` is one record, :24).
  **What `signal` does TODAY**: exactly this — a 320x120 unlabelled static polyline; it is the
  chromatogram's before-state, and GC-10 replaces it for GC views by ADDING the `chromatogram`
  arm (OQ-3), not by mutating it.
- [F] ViewRenderer.tsx:123-143 `ViewRenderer` switch — RE-ANCHORED l1t1405 with arm-level
  precision the draft only had at block level: function signature :123, `switch (view.renderer)`
  :124, arms `table` :125-126, `signal` :127-128, `metric` :129-130, `static-figure` :131-132,
  `model`+`binary` fallthrough :133-135, `default:` :136 rendering the visible compatibility error
  `Unsupported renderer: <name>` (`view-spec__error`, testid `view-spec-error`, :137-141). The new
  arms `case 'chromatogram'` / `case 'trace-compare'` land between :135 and :136 (before
  `default:`) so unknown renderers keep hitting the error arm.
- [F] ViewRenderer.tsx:156-176 `renderViews(views, artifacts)` — matches view -> artifact by NAME
  (`artifacts.find(a => a.name === view.artifact)`, :161); missing artifact = visible
  `Missing artifact for view` error (:163-166). Pure per-view map — no cross-view state bus (bears
  on §D2's row<->trace sync design).
- [F] ViewRenderer.tsx:10-19 `RenderableArtifact` — `id/name/dataKind` + optional `inlineValue`,
  `units`, `schema`, `format`, `dataReferenceRef?: { id }`. A dref-backed artifact reaches the
  renderer with NO inlineValue and only a `{id}` pointer — see F4's payload gap (now OQ-1-ratified
  away).
- [F] `app/src/analysis/AnalysisPage.tsx:373-394` (inside the `rendered` useMemo :358-396) — the
  page's view whitelist. RE-ANCHORED l1t1405: the draft's `:194-215`/`:201` cites moved with the
  GC-9 merge (+233 lines to the page). The silent-coercion literal is now
  **:380-382** — `(['table', 'signal', 'metric', 'static-figure'] as const).includes(vv.renderer …)`
  else `: 'table'` — it **coerces any other manifest renderer string to `'table'`** (SILENTLY; the
  compatibility error arm never fires for these). New enum members MUST be added to this whitelist
  in the same commit as the dispatch arms or a `chromatogram` manifest view renders as a table
  (bait #4). View `bindings`/`options` already pass through to `RenderableView` (:383-384) — the
  data-only specs ride it with zero plumbing. Model/binary cards are synthesized client-side
  :388-393 (draft said :209-214).
- [F] `app/src/analysis/ViewRenderer.compat.test.tsx:38-47` — PB-CH-5 "source-pin": reads
  `readFileSync('src/analysis/ViewRenderer.tsx')` (:39) and asserts ZERO occurrences of
  `['quantum','heatmap','scatter','component-tree']` (:42) + presence of `view-spec__error` (:46).
  The new ids `chromatogram`/`trace-compare` are NOT in the banned list — the literal assertion
  survives widening; the comment ("closed set preserved", :38/:40-41) must be amended WITH the
  task-mandated widening, not deleted (bait #2). NOTE: this test cwd-traps — it only runs with
  cwd = `app/` [F-run, F6]. File total: 48 lines.
- [F] `app/src/analysis/ViewRenderer.test.tsx:24,45` (85 lines) — the frozen PB-CH-5 suite asserts
  `view-spec-signal` testid exists (:24) and the error arm names `quantum` (:41,:45). Keep the
  `signal` renderer + its testid working byte-compatibly (OQ-3). Both files byte-identical since
  a444f944 (diff 0 lines, verified in-session).
- [F] `app/src/editor/taptab/extensions/FieldRow.tsx` — RE-ANCHORED l1t1405, correction to the
  promoted spec's out-of-scope wording: the only ViewRenderer consumer OUTSIDE `src/analysis` is
  this editor file (first-hand grep `grep -rln "ViewRenderer|renderViews" app/src --include=*.tsx
  | grep -v src/analysis` -> exactly this one hit). The draft's "the DNA run page rides the same
  `signal` renderer" claim is NOT verifiable on trunk (no `'signal'` renderer usage found under
  `app/src/run` or `app/src/sequences`); the correct framing is: an additive TS-union widening is
  safe for FieldRow.tsx (it consumes the closed set that exists today; nothing removed), and the
  `signal` arm's output stays frozen regardless.

### F2. The view-spec schema (the enum to extend)

- [F] `schema/knowledge/view-spec.schema.yaml:29-31` — `renderer` enum
  `[ table, signal, metric, static-figure ]` ONLY (enum VALUES line :31). RE-ANCHORED l1t1405:
  re-opened first-hand at b12112e5 — **UNCHANGED** (the GC-9/GC-7 schema work landed in
  analysis-engine/analysis-revision/analysis-run schemas, not view-spec:
  `git diff a444f944..b12112e5 --stat -- schema/knowledge` shows view-spec.schema.yaml absent).
  `:26-27` `artifactRef` = single `$ref: ./datatypes/ref.schema.yaml`; `:33-36` `bindings` = free
  object (`additionalProperties: true`); `:38-41` `options` = free object, description "Presentation
  options (labels, units, thresholds, colors)"; `:11` `unevaluatedProperties: false`;
  `required: [kind,id,title,artifactRef,renderer]` (:55); description header (:4-8): "Only SHIPPED
  React renderers execute … the manifest is data only." The GC-10 enum edit lands on **:31**.
- [F] **Schema/TS divergence still exists on trunk:** the schema enum lacks `model`/`binary` even
  though ViewRenderer.tsx:25 dispatches them — model/binary views are page-synthesized, never
  persisted. GC-10 extends BOTH: schema enum (:31) + TS union (:25) + page whitelist (:380) —
  bait #3.
- [F] Runner-persisted view-spec records: `server/src/analysis/analysisRunner.ts:431-461` —
  RE-ANCHORED l1t1405 (draft cited :357-387; GC-7's runner growth moved the block). One `view-spec`
  record per manifest view: dedupe check :435-439, VSPEC max+1 mint over
  `list({kind:'view-spec', limit: 5000})` (:433, regex `/^VSPEC-(\d+)$/` :441, id :447), payload
  `{kind, id, title, artifactRef: {kind:'record', id: AOUT-…, type:'analysis-output-artifact'},
  renderer}` (:452-460). The persisted view carries NO bindings/options (only the manifest view
  does) — saved user comparisons written by the client MAY carry bindings (§D4); the runner path is
  untouched.
- [F] `server/src/analysis/analysisSchema.test.ts:147-167` — RE-ANCHORED l1t1405 (draft's
  :147-166 survives; block end is :167): the server-side view-spec schema test asserts
  `renderer: 'signal'` validates (:148-157) and `renderer: 'quantum'` is rejected (:159-166).
  Enum widening keeps both legs true; GC-10 adds two positive legs (chromatogram, trace-compare).

### F3. Artifact dataKinds + the trace payload shape GC-7 SHIPPED [G7]

- [F] `schema/knowledge/analysis-output-artifact.schema.yaml:40-42` — `dataKind` enum
  `[ table, signal, signal-collection, spatial-array, image, model, binary, metric, sequence,
  sequence-collection, alignment, sequence-hits ]` (re-opened: unchanged). `:48-53` inlineValue vs
  dataReferenceRef (the XOR is COMMENT doctrine :48-49 + runner-enforced at analysisRunner.ts:415
  — RE-ANCHORED l1t1405, draft said :340; NOT Ajv-enforced — promotion drift note holds);
  `:55-63` free `schema` + per-field `units` maps.
- [G7-SHIPPED] RE-ANCHORED l1t1405 at b12112e5 (re-confirms the l1t1255 re-anchor at 2598e451 —
  `git diff 2598e451..b12112e5 -- server/src schema` -> empty, zero drift):
  `server/src/analysis/analysisGcIntegration.test.ts` is the shipped contract:
  - `signal_plus_baseline` is DREF-backed with NO inlineValue: `:390-399` —
    `dataReferenceRef?.id` matches `/^DREF-/` (:398), `inlineValue` is `undefined` (:399).
  - The persisted dref bytes decode to
    `{axis: number[], values: number[], baseline: number[], axis_units, value_units,
    integration_windows}`: decode block :405-428 (JSON.parse :409, `axis_units: 'min'` :413/:420,
    `value_units: 'pA'` :414/:421, endpoint + per-point value pins :418-422,
    `integration_windows.length > 0` :428). RE-ANCHORED l1t1405 (draft said :409-416 — same block).
  - `peak_table` is INLINE (`inlineValue {columns, rows}` + `units` + per-field `schema`
    definitions; block :358-385 — inline-shape assertions :366-373, `dataReferenceRef`
    undefined :373, rows length 2 on the synthetic fixture :374). Columns VERBATIM :376
    `['peak','rt_min','height_pa','area_pa_min','width_min','area_percent','symmetry',
    'saturated','flags']` — note width_min+symmetry; per-column units pinned `rt_min: 'min'`,
    `height_pa: 'pA'`, `area_pa_min: 'pA*min'` (:378-380), column `definition` strings truthy
    (:381), `saturated: false` on the clean row (:385). The marker layer + row<->trace sync consume
    these names as DATA (property names arrive from the artifact's `schema`/rows/`units` — never
    hardcoded in TS for prod paths, §D3/bait #7).
  - Saturated reason code: SHIPPED constant `REASON_SATURATED = "UNRECOVERABLE_SATURATED"` at
    `server/python-executor-service/src/computable_lab_analysis/peak_integration.py:90`, declared
    null + flag appended at :945-950 ("DECLARED null + reason code, never a number" :945);
    behaviour pinned by `tests/test_peak_integration.py:250-251, :549`. RE-ANCHORED l1t1405 (the
    fold cited the GC-7 spec; the shipped files are now the authority). Saturated parameter names
    as shipped: `saturated_top_fraction_of_max` / `saturated_min_plateau_points`
    (analysisGcIntegration.test.ts:149-150, :319-320, :330-331).
  - GC-7's contract statement stands: "GC-10 replaces the renderer, not this contract" — the
    artifact contract is stable; GC-10 changes rendering only.

### F4. Where trace bytes live (the payload gap — now resolved by the ratified route)

- [F] `server/src/analysis/analysisRunner.ts:389-401` + `:415` — RE-ANCHORED l1t1405 (draft cited
  :314-340): blob artifacts ALWAYS -> storage; object values whose JSON `>= 50_000` chars
  (:391-395) -> `persistToStorage` (:398-401; the persist + dref-mint helper is
  `:310-357`, provider obtained at :312); small values stay `inlineValue` (:415). A 72,801-point
  GC-1-class trace is far over 50k -> dref-backed [G7 confirms: F3 dref-only pin].
- [F] persistedManifest: `:775-777` RE-ANCHORED l1t1405 (draft cited :476-479) — stores per
  artifact `value` ONLY when inline, plus `dataReferenceRef` when large; the succeeded run record
  saves `outputManifest` + `outputArtifactRefs` at :784. `GET /api/analysis-runs/:id`
  (routes.ts:1270; handler `AnalysisHandlers.ts:74-82` — draft said :74-85) therefore delivers
  inline small artifacts' payloads but large traces as a DREF POINTER ONLY.
- [F] **Still true on trunk: NO byte-serving route exists for data-references TODAY** — which is
  exactly what the ratified OQ-1(a) route fixes; this section is the PROBLEM STATEMENT, not a
  stop. Routes inventory RE-ANCHORED l1t1405 at b12112e5: `server/src/api/routes.ts:1254-1256`
  storage routes are `/storage/devices`, `/storage/devices/:id/browse` (metadata only),
  `/storage/acquire` — NO content/read route. `routes.ts:1216` `/studies/:studyId/artifacts/
  :artifactId/blob` is the study-artifact (PDF bytes) route, scoped to `ART-*` ids
  (`ArtifactBlobHandlers.ts:32` id pattern, :77 rejection message) and `file.stored_path`
  (`:110-127` resolve + workspace-root escape check) — wrong id grammar (ART-*, not AOUT-*), wrong
  record kind, wrong storage shape (draft cited :27-49; re-opened). `GET /records/:id`
  (routes.ts:235) returns the data-reference ENVELOPE — the dref schema REQUIRES
  `storageDeviceId`, `path`, `contentHash` (`schema/knowledge/data-reference.schema.yaml`
  required-list line :109) — not bytes. [F-run] `grep -rn "data-references"
  server/src/api/routes.ts` -> 0 hits; `client.ts` has no dataReference content fetch (only the
  study-blob URL builder at :5351-5356, ART-scoped).
- [RATIFIED OQ-1(a)] The GC-10 delta: read-only `GET /api/analysis-artifacts/:id/content` —
  handler resolves `AOUT-*` record -> `payload.dataReferenceRef.id` -> `store.get(drefId)` ->
  `{storageDeviceId, path}` -> `ctx.storageService.getProvider(deviceId).read(path)` — the EXACT
  channel provisionInputs uses (`analysisRunner.ts:221-222`; provisionInputs starts :147) — and
  streams the JSON. The path is pinned in an immutable DREF record (never a user-supplied path):
  no traversal surface. Same auth surface as sibling analysis routes; read-only GET only. Route
  registration lands beside its promote sibling `analysis-artifacts/:id/promote`
  (routes.ts:1272). Handler lives in `createAnalysisHandlers`
  (`server/src/api/handlers/AnalysisHandlers.ts` — it already receives `ctx`, imports
  AnalysisRunner, and already hosts the promote sibling via `artifactPromotion.ts`).

### F5. Page data path (what Compare rides) + GC-9's shipped page shape [G9]

- [F] `app/src/shared/api/client.ts` — every cite re-opened first-hand, ALL SURVIVE UNCHANGED
  RE-ANCHORED l1t1405: `listAnalysisRuns` :3231, `getAnalysisRun(id)` :3247 (returns the full
  record envelope incl. `payload.outputManifest` + `payload.outputArtifactRefs`),
  `executeAnalysisRun` :3251, `promoteAnalysisArtifact` :3263, `getRecord(recordId)` :2296,
  `listRecordsByKind(kind, limit, offset)` :2135, `createRecord` :2456 (POST /records, server
  VALIDATES against schemaId — `server/src/store/RecordStoreImpl.ts:568` create-path validation +
  `:1005-1018` `validate()` via the schema validator: both re-verified at identical lines).
  The OQ-1(a) client method (+1) lands in the same analysis block (~:3263+).
- [F] `AnalysisPage.tsx:346-355` `selectRun` — click-only `getAnalysisRun` (draft said :167-176;
  RE-ANCHORED l1t1405). Fetching a run's full payload happens on CLICK today; the mount contract
  is untouched by click-driven fetches.
- [F] `AnalysisPage.tsx:130-131` state — `manifest` + `artifactRefs` are per-SINGLE-run, and are
  set by `execute` (:330-344) / read by `rendered` (:358-396) and `activeProcessed` (:399)
  (draft said :54-55). Compare therefore builds its multi-run artifact index from the
  ALREADY-FETCHED `runs` list (:119) + click-fetched `getAnalysisRun` payloads
  (`payload.outputManifest` / `payload.outputArtifactRefs`) — no new endpoint, no new mount
  fetches (§D4).
- [G9-SHIPPED] **The GC-9 merge (b12112e5) and the Compare-traces attach site.** GC-9's shipped
  hunks in `AnalysisPage.tsx` (572 lines now) are the PARAMETER/CREATE paths, all of which GC-10
  must not touch: `ParameterForm` import + `collectDefaults/collectGateIssues/pruneEmpty` (:15),
  gate helpers (:37-104), param state + revision-selection re-init (:124-185), advanced-JSON
  derivation + invalid-JSON arm (:242-292), frozen preview (:294-306), and the run-create form
  JSX :440-479 (form/advanced disclosure/override badge/preview). Evidence:
  `git diff a444f944..b12112e5 -- app/src/analysis/AnalysisPage.tsx` = +233 lines, all in those
  regions + `ParameterForm.tsx` (NEW 586 lines) + `AnalysisPage.parameter-form.test.tsx` (NEW).
  **Where the Compare action attaches given the new param-form layout**: the parameter form moved
  the run-create section DOWN but the RIGHT PANE is GC-9-untouched:
  `analysis-right` :508, chat panel :512, results header `analysis-right__title` :513-516,
  views region :517-525 (gated by `activeProcessed` :517), promote block :527-540. The
  `analysis-compare-btn` (>= 2 succeeded runs) attaches at the results header (:513-516, extend
  that header with the button) — the results-pane region GC-9 explicitly did not touch. The draft's
  GC-9 spec `:296` protect-ViewRenderer cite is moot anyway: the shipped fact is stronger —
  `ViewRenderer.tsx`/`ViewRenderer.test.tsx`/`ViewRenderer.compat.test.tsx` are byte-identical at
  b12112e5 (diff 0), so GC-10 edits an untouched file. GC-10's own hunks: whitelist :380-382 (+2
  ids), the Compare affordance at :513-516, and results-pane wiring — parameter-form regions
  untouchable (bait #6).
- [F] `app/src/analysis/AnalysisPage.no-execute.test.tsx` (69 lines) — mount fires EXACTLY
  `listAnalysisRevisions` + `listAnalysisRuns`, zero else (frozen mount-accounting; the mocked
  client block already includes `getAnalysisRun`/`promoteAnalysisArtifact` spies :22-30). GC-10
  adds NO mount-time or selection-time fetch (bait #5). GC-9 shipped WITHOUT breaking it (it is
  one of the 9 green files [F-run below]).

### F6. Baselines EXECUTED this session at b12112e5 [F-run] (cwd traps included)

- [F-run] `cd /mnt/vast/home/brad/git/cl-integration-1/app && npx vitest run src/analysis` ->
  **9 files, 52/52 GREEN** (20.0s, run 14:13). RE-ANCHORED l1t1405: the promoted spec's 7/22
  baseline is stale — GC-9 added `ParameterForm.test.tsx` + `AnalysisPage.parameter-form.test.tsx`.
  TRAP (re-confirmed by the compat test's relative `readFileSync`): app vitest MUST run with
  cwd = `app/`.
- [F-run] `npm run typecheck -w app` -> **21 `error TS` lines, ZERO inside src/analysis**
  (re-executed at b12112e5: grep count 21, src/analysis count 0).
- [F-run] `npm run typecheck -w server` -> **0 errors** (re-executed).
- [F] `app/tsconfig.json:18` strict, NO `exactOptionalPropertyTypes` in app (it is
  `server/tsconfig.json:13` only) — same posture as before: payload shapes still omit absent keys
  (bait #10).
- [F] `app/package.json` — **NO chart library at all** (in-session grep for
  d3|chart|visx|plotly|recharts: 0 hits). Decision stands per ratified OQ-2: handwritten SVG
  interaction, no new dependency.
- [F] `app/src/analysis/AnalysisPage.css` (126 lines) — `view-spec__*` class block is **:79-94**
  RE-ANCHORED l1t1405 (draft cited :79-87; the block runs to `__empty` :94). GC-9's param styles
  sit at :98-106+; new chromatogram/compare chrome EXTENDS :79-94's conventions without touching
  GC-9's styles.
- [F] YAML-reload trap (task-list.md:59, re-verified): `tsx --watch` does NOT reload YAML — the
  view-spec enum edit needs `cl-lane-stack.sh 1 restart` before any curl proof. NEVER :3001/:5174;
  lane stack :3092/:5192 only.

## Acceptance criteria — verbatim from the task list (task-list.md:8280-8283 — RE-ANCHORED l1t1405)

> Vitest on renderer + compare selection logic; browser receipt: reviewer finds Compare without
> instruction, overlays two DIFFERENT runs, hovers a peak, resets to full trace; perf acceptable
> at GC-1 trace sizes.

Description clauses that also bind (task-list.md:8268-8276 — RE-ANCHORED l1t1405; text verbatim
identical to the promoted spec's cite, line numbers moved), mapped in §Acceptance mapping:

> Replace the 320x120 static polyline: shipped chromatogram renderer (view-spec enum extended;
> data-only specs) — zoom (drag-select), pan, reset, hover readout, RT/peak markers, peak-table
> row <-> trace sync, explicit pA/min axes. Plus the killer feature: a prominent Compare traces
> action overlaying multiple signals on ONE set of axes — standard vs sample or two samples,
> across different runs; stable per-trace colour + legend (sample, run, channel, source);
> independent show/hide. Incompatible axes rejected or require declared conversion — no hidden
> normalization/resampling. Saved comparisons are view-spec data pinning their sources. Visual
> decimation allowed; analysis inputs stay full-res.

### Acceptance mapping (every description + verified-by clause -> deliverable + proof — unchanged)

| Clause (verbatim fragment) | Deliverable | Proof |
|---|---|---|
| "Replace the 320x120 static polyline … view-spec enum extended; data-only specs" | D1 enum + ChromatogramView; `signal` kept per bait #2 | schema positive legs (verif 4); ChromatogramView render tests; bindings-guard tests (D6) |
| "zoom (drag-select), pan, reset, hover readout" | D2 interaction state | V-suite: drag->domain, pan, reset-to-full, readout numerics (verif 1, receipt c-d) |
| "RT/peak markers, peak-table row <-> trace sync" | D2 markers + micro-table, field names via bindings [G7-SHIPPED F3] | two-way sync tests `chromatogram-row-*`/`chromatogram-marker-*` |
| "explicit pA/min axes" | D2 axis labels from artifact `units`/`axis_units`/`value_units` [F3] | axis-label test with test-local units; bait #7 grep pin (no unit literals) |
| "prominent Compare traces action … across different runs" | D4 header button + run-grouped picker | receipt a-b (two DIFFERENT runs overlay) |
| "stable per-trace colour + legend (sample, run, channel, source); independent show/hide" | D3.5 + D4 legend | colour-stability + toggle tests (bait #9); receipt e |
| "Incompatible axes rejected or require declared conversion — no hidden normalization/resampling" | D3.2/D3.3 gate | conflict tests + byte-identity-on-conflict (bait #8); receipt f |
| "Saved comparisons are view-spec data pinning their sources" | D4 save via /records (server-validated), AOUT refs in bindings | verif 4 POST + receipt g (record lists both ids, reload re-renders) |
| "Visual decimation allowed; analysis inputs stay full-res" | D3.4 + D5 freeze pins | decimation purity tests (verif 1); readout-on-raw-points test |
| "Vitest on renderer + compare selection logic" | traceModel.test.ts + component tests | verif 1-2 |
| "browser receipt: finds Compare without instruction / two runs / hover / reset" | D4 prominence | verif 5 a-d |
| "perf acceptable at GC-1 trace sizes" | D5 O(width) decimation | verif 5 h receipt (wall-clock + droppedCount recorded) |

## Files IN scope

- `app/src/analysis/ViewRenderer.tsx` (union :25 +2 ids, dispatch arms inserted before `default:`
  :136, `signal` arm :127-128 untouched, compat comment amended per bait #2)
- `app/src/analysis/ChromatogramView.tsx` (NEW — interactive single-trace renderer + markers +
  bound peak-table sync; §D2/D3)
- `app/src/analysis/CompareTraces.tsx` (NEW — trace registry UI, axis-compat gate, legend,
  show/hide, saved-comparison writer; §D4)
- `app/src/analysis/traceModel.ts` (NEW — pure logic: trace extraction from run payloads,
  decimation (visual-only), axis-compat check + declared-conversion arithmetic, stable colour
  assignment — unit-testable without DOM)
- `app/src/analysis/AnalysisPage.tsx` (whitelist :380-382 +2; Compare affordance at the results
  header :513-516 + results-pane wiring ONLY — GC-9 regions :37-104/:124-185/:242-306/:440-479
  untouchable)
- `app/src/analysis/AnalysisPage.css` (view-spec__chromatogram / __compare chrome extending :79-94)
- `app/src/analysis/ChromatogramView.test.tsx`, `CompareTraces.test.tsx`, `traceModel.test.ts`,
  `AnalysisPage.compare.test.tsx` (NEW tests; do NOT grow the frozen ViewRenderer.test.tsx)
- `schema/knowledge/view-spec.schema.yaml` (renderer enum :31 -> `[ table, signal, metric,
  static-figure, chromatogram, trace-compare ]`; bindings/options :34-41 stay the free objects that
  carry the data-only specs — §D1)
- `server/src/analysis/analysisSchema.test.ts` (+2 positive legs in the `view-spec schema` block
  :147-167: chromatogram validates, trace-compare validates; quantum leg :159-166 untouched)
- OQ-1(a) RATIFIED — server/client delta (sanctioned `files:` deviation):
  - `server/src/api/routes.ts` (+1 route line registering
    `GET /api/analysis-artifacts/:id/content` beside the promote sibling :1272)
  - `server/src/api/handlers/AnalysisHandlers.ts` (+1 read-only content handler in
    `createAnalysisHandlers`, using the `analysisRunner.ts:221-222` provider-read channel)
  - `app/src/shared/api/client.ts` (+1 method in the analysis block, e.g.
    `getAnalysisArtifactContent(id)` near :3263)
  - one OQ-sanctioned server test file for the route (happy path: dref-backed AOUT -> JSON bytes;
    404 legs: missing artifact / inline artifact with no dref / missing dref record)

## Explicitly OUT of scope (hard stops)

- NO changes to `server/src/analysis/analysisRunner.ts`, `analysisService.ts`, or any GC-4/5/6/7
  file — GC-10 CONSUMES artifact shapes; any gap found = STOP + report (requires-rescope). (The
  ratified route reads `store.get` + `storageService.getProvider` — it does NOT edit the runner;
  import the provider channel, do not fork it.)
- NO new analysis kind, NO lifecycle/coverage-pin edits (view-spec is an existing covered kind —
  adding enum values does not touch the four fence files).
- NO GC-11 calibration-curve renderer, NO calibration semantics, NO quantification.
- NO parameter-form changes (GC-9's shipped regions, F5), NO chat-panel changes.
- NO new chart dependency (package.json untouched; OQ-2 ratified handwritten SVG).
- NO hidden numeric behavior: no smoothing, no resampling, no auto-scaling of VALUES, no
  normalization of trace bytes; decimation affects RENDERED POINTS ONLY and is never persisted
  anywhere (§D5).
- NO edits to `config/sequence-analysis/**`, `app/src/sequences/**`, `app/src/run/**`,
  `app/src/editor/**` (FieldRow.tsx — F1's external consumer — rides the closed set additively;
  it is not touched; the `signal` arm stays frozen regardless).
- NO browser-manual NAS paths; lane stack :3092/:5192 only, NEVER :3001/:5174.

## Design (D1-D6 — unchanged intent; anchors re-verified)

### D1 — view-spec: two new SHIPPED renderers, data-only specs

Schema enum becomes `[ table, signal, metric, static-figure, chromatogram, trace-compare ]`
(schema :31, re-verified current values F2). The TS union at ViewRenderer.tsx:25 gains the same two
ids. The specs ride the EXISTENT free `bindings` object (:34-36 — additionalProperties:true means
NO schema property addition is needed; the closed SHAPE is enforced client-side by a named-error
guard, §D6). Canonical shapes [I] (documented as a comment block in view-spec.schema.yaml's
bindings header so the data contract is reviewable where the enum lives):

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

Colour is NOT spec data (§D3.5 stability rule derives it from record ids); the schema's `options`
description (:41) already says colors are presentation options — the renderer overrides them with
the stable derivation, documented in the comment block.

- `ViewRenderer` dispatch: `case 'chromatogram'` / `case 'trace-compare'` route to new components;
  `trace-compare` inside the per-view `ViewRenderer` (single-artifact) path renders its error arm
  (`view-spec__error`, naming that compare views render through the Compare surface, §D4) — the
  dispatch arm exists so an orphan trace-compare view-spec is VISIBLE, never blank.
- `signal` stays the static polyline byte-compatibly (testid `view-spec-signal`, frozen suite
  ViewRenderer.test.tsx:24). AnalysisPage: when a manifest view says `chromatogram` the whitelist
  passes it (F1 bait #4); when a plain `signal` artifact is GC-class there is NO heuristic upgrade
  — the revision's manifest view decides (data, not sniffing).

### D2 — ChromatogramView.tsx — the interactive single trace

Props: `{ artifact: RenderableArtifact; markerArtifact?: RenderableArtifact;
bindings?: Record<string, unknown> }` (AnalysisPage resolves `markersFrom` by artifact NAME —
renderViews has no cross-view bus, F1 :156-176; the chromatogram component owns its micro-table).

- Data-in: `{axis, values, ...extra}` inline OR fetched via the ratified OQ-1(a) client method
  when the artifact carries only `dataReferenceRef` (F4); axis/values parsed like SignalView
  (:65-67). Missing/short axis -> visible named empty-state, never a thrown render.
- **Zoom (drag-select)**: mousedown-drag draws a selection rect; mouseup sets the x-domain to the
  selection; **Pan**: drag on plot (no modifier) translates the domain; **Reset**: labeled button
  `data-testid="chromatogram-reset"` restores the FULL domain computed from the data (not from the
  spec). State is component-local view state — never written back to any record.
- **Hover readout**: nearest-sample readout `data-testid="chromatogram-readout"` showing
  `<x> <x-unit> / <y> <y-unit>` — units VERBATIM from the payload/`units` map (F3 shipped
  `axis_units`/`value_units`; GC-10 TS contains ZERO `pA`/`min` literals — bait #7). Reads raw
  points, not decimated points (§D5).
- **Markers**: from `markerArtifact` rows (property names via bindings `markerRtField` /
  `markerLabelField`, defaulting to the shipped peak_table column names ONLY as *fallback
  field-name data*, held in one exported const table, never inline stringly logic — bait #7). Rows
  with null rt are skipped visibly (count in a legend line, never silently dropped).
  **Saturated honesty (ratified fold, display-only)**: a row whose `saturated` value is truthy
  renders a DISTINCT declared marker style (never silently like a clean peak) and its micro-table
  row surfaces the reason codes carried in `flags` (the shipped reason code
  `UNRECOVERABLE_SATURATED` arrives AS DATA from the artifact rows — the TS never branches on the
  string's spelling beyond rendering the list it finds; shipped contract
  peak_integration.py:90, :945-950, F3). This is honesty, not a lint: do NOT fake a lint rule
  (GC-5's honest-empty-lint doctrine).
- **Row <-> trace sync**: the component renders the bound peak table rows (labels verbatim from the
  artifact's `schema`/`units`) as a compact table under the plot; row-click highlights the marker
  (+ scrolls readout to that RT), marker-click highlights the row; testids
  `chromatogram-row-<peakId>` / `chromatogram-marker-<peakId>` symmetric so the sync test is
  two-way (acceptance clause "peak-table row <-> trace sync").
- **Axes**: x-axis ticks + y-axis ticks with unit strings from data; axis labels rendered from the
  payload's unit fields — the task's "explicit pA/min axes" arrives via the shipped artifact units
  (F3: `axis_units: 'min'`, `value_units: 'pA'`), not via TS strings.

### D3 — traceModel.ts — the pure, tested core (no DOM, no React)

Exported pure functions (each is a vitest target):

1. `extractTrace(runRecord, artifactRefId): Trace | TraceError` — resolve `AOUT-*` -> payload ->
   inline `{axis, values, units}` OR dref bytes fetched via the OQ-1(a) client method (the fetched
   arm is RATIFIED, not conditional any more). Trace = `{ recordId, runId, runTitle, artifactName,
   axis: number[], values: number[], xUnit?: string, yUnit?: string }` — legend fields come from
   RECORD data (run payload title, artifact name, artifact `label` in bindings) — "legend (sample,
   run, channel, source)" renders whatever labels the data carries; TS never invents "Sample A"
   chrome (bait #7).
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
   (acceptance: pure over inputs; pinned by a test asserting the source arrays are unchanged).
5. `colorForTrace(recordId, paletteIndexFromSortedRank)` — sort participating traces by artifact
   recordId; assign from a fixed 8-colour palette cycling; stability rule: **rank within the saved
   spec's trace list sorted by id** (test the stability leg: same spec, different toggle state,
   same colours).
6. `buildCompareViewSpecPayload(traces, axisUnits, conversions) -> {kind:'view-spec', id, title,
   artifactRef (primary), renderer:'trace-compare', bindings}` — the saved-comparison shape (§D4).

### D4 — Compare traces — the first-class action

- Prominence (acceptance: "finds Compare without instruction"): a top-level button in the results
  pane header — `data-testid="analysis-compare-btn"`, label **"Compare traces"**, attached at the
  `analysis-right__title` region (AnalysisPage.tsx:513-516, RE-ANCHORED l1t1405 to the post-GC-9
  page), visible whenever >= 2 succeeded runs exist (NOT hidden in a disclosure; disabled+reason
  when < 2 — no dead chrome, and the disabled reason names what's missing).
- Selection surface (CompareTraces.tsx, opens over the results pane): left column = every
  succeeded run's signal-class artifacts (walks the ALREADY-FETCHED `runs` list :119; expanding a
  run click-fetches its manifest via the existing `getAnalysisRun` reading
  `payload.outputManifest`/`payload.outputArtifactRefs` — click-only, F5); checkboxes pick traces
  (>= 1 from >= 2 runs encouraged, 1 trace from 1 run is a legal compare too — honest message, not
  a wall). Multi-RUN is headline: the list groups by run so two different runs are side by side.
- Axis-compat gate: `checkAxes` runs LIVE on the selection; conflicts render as named rows
  (`trace-compare-axis-conflict`): `axis units differ: run A y="pA" vs run B y="AU" — no automatic
  conversion is performed; add a declared conversion (factor + unit) below or remove the trace.`
  Declared-conversion inputs are scientist-entered (data -> view-spec bindings). This IS the task's
  "rejected or require declared conversion" leg — no third door.
- Overlay: ONE shared x-axis (union of visible extents) + ONE shared y-axis; each visible trace
  gets `colorForTrace` stroke + a legend row (colour swatch + sample/run/channel/source labels
  FROM DATA) + show/hide checkbox (axes recompute from VISIBLE traces only, standard compare
  semantics; hidden traces never silently rescale anything — pinned test).
- **Save comparison**: "Save as view" writes ONE `view-spec` record via `apiClient.createRecord`
  (:2456; server validates — F5 RecordStoreImpl :568/:1005-1018). RecordId minting client-side
  mirrors the runner's max+1 rule (F2 :433-447): list `view-spec` via
  `listRecordsByKind('view-spec', 5000)`, compute `VSPEC-NNNNNN` max+1 (collision-safe enough for
  the lane; surface the named create error, retry once). Payload = `buildCompareViewSpecPayload` —
  artifact refs pin AOUT-* record ids, so the saved comparison survives run re-execution immutably
  (pinned sources, task clause). Saved comparisons list back through
  `GET /records?kind=view-spec` (`listRecordsByKind` :2135) — zero client.ts changes beyond the
  one ratified OQ-1(a) method.

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
Expected at claim: **9 files, 52/52 GREEN** [F-run re-executed 14:13 at b12112e5 — RE-ANCHORED
l1t1405; GC-8 is still in flight on its own branch, so RE-CAPTURE at claim and cite the fresh
number in the first commit — GC-9's claim-time rule]. Then RED-first:

```
cd /mnt/vast/home/brad/git/cl-integration-1/app && npx vitest run src/analysis/traceModel 2>&1 | tail -5
```
Expected: FAIL "Cannot find module './traceModel'" (test file committed first, component missing).
This proves the pure-core approach (axis-compat + decimation + colour stability) before any SVG is
written.

## Verification (complete, with expected output)

1. `cd /mnt/vast/home/brad/git/cl-integration-1/app && npx vitest run src/analysis`
   Expected: ALL files pass; count = baseline (9 files / 52 at b12112e5, RE-ANCHORED l1t1405) +
   the new files' tests, 0 failures. Legs the reviewer will hunt: axis-conflict rejection WITHOUT a
   conversion changes NOTHING about the traces (byte-identity of values); declared conversion
   clears exactly its own conflict; hide/show never recolors; decimation leaves inputs frozen;
   whitelist passes `chromatogram` through (a manifest view `renderer:'chromatogram'` must NOT
   table-coerce, F1 :380-382); `signal` polyline testid survives.
2. `cd /mnt/vast/home/brad/git/cl-integration-1/app && npx vitest run src/analysis/ViewRenderer.test.tsx src/analysis/ViewRenderer.compat.test.tsx src/analysis/AnalysisPage.no-execute.test.tsx`
   Expected GREEN: frozen suite untouched; compat literal-pin suite still asserts the banned list +
   error arm (comment amended per bait #2); mount accounting UNMODIFIED (bait #5).
3. `npm run typecheck -w app` -> **21 error TS lines** (re-captured baseline drifts with merges —
   count must not GROW, zero inside src/analysis). `npm run typecheck -w server` -> **0**.
4. Schema legs + the ratified route (server, after YAML restart — F6 trap):
   `cd server && npx vitest run src/analysis/analysisSchema.test.ts` -> all pass incl. the two new
   positive legs; then live: `cl-lane-stack.sh 1 restart` and
   `curl -s localhost:3092/api/records?kind=view-spec -H 'accept: application/json' | head -c 300`
   loads clean; POST a chromatogram-shaped view-spec via /records with a seeded AOUT ref -> 200
   with schema validation passing; AND the OQ-1(a) proof: for a dref-backed AOUT (seeded
   GC-class-sized or small-payload-above-50k artifact),
   `curl -s localhost:3092/api/analysis-artifacts/<AOUT-id>/content` returns the stored JSON bytes
   (axis/values round-trip), 404 on an unknown id, and a named error on an inline-only artifact
   (no dref to read). The route is GET-only — a POST must not resolve.
5. Browser receipt (orch deterministic-Playwright route FIRST, inner-scroller technique; lane
   stack :3092/:5192): seed TWO succeeded runs each producing a small-inline signal artifact via a
   seeded revision (test-local entry script publishing `{axis, values}` + units — allowed seeding,
   same doctrine as GC-9's OQ-3 fold; per 118th AS-L1T1405-2 the gate does NOT rely on the
   queued-never-executed ANR-000006/7 stub runs — this spec seeds its own). Seed ONE extra
   dref-backed trace to prove the ratified content route in-browser. Steps, each an assertion:
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
  `wt/gc-10-lane1-<stamp>` off the CURRENT `cl/integration-1` tip AT DISPATCH (orch provisions
  `wt/gc-10-lane1-l1t<ts>` per the 118th handoff; re-anchor baseline b12112e5 — GC-8 may land
  before dispatch, so re-anchor hunks at claim IF anything under app/src/analysis or the cited
  server files moved between b12112e5 and the dispatch tip; at b12112e5 all cites in this doc are
  first-hand current). All git `-c core.fileMode=false`. Trunk worktree READ-ONLY; commit nothing
  there.
- Report at `/home/brad/.hermes/cl/lanes/1/gc-10-report-<unit>.md`; end-marker
  `GC10 DONE <sha>` / `GC10 BLOCKED <reason>`; log `lanes/1/logs/coder-GC10-<unit>.log`.
- Commit-after-every-step mandate (83rd handoff §3): one commit per deliverable in
  `[GC-10][A]..[F]` style (traceModel test-first RED, traceModel, ChromatogramView, CompareTraces,
  schema+dispatch+wiring, route+client-method+test [OQ-1(a)], saved-view + browser-runbook), each
  message naming the acceptance clause it advances.
- Baselines RE-CAPTURE AT CLAIM (numbers drift): app vitest src/analysis count (9/52 at b12112e5
  [F-run]), app typecheck error lines (21, 0 in src/analysis), server typecheck 0 — cite in the
  first commit body.
- MERGE-REBASE WATCH (intent of the old [G9] clause, now shipped): GC-9's parameter-form regions
  (F5 list) are GC-10's collision zone — compare against the shipped page at claim; drift in GC-9
  regions discovered at claim -> rebase hunks, do not re-author GC-9 code.
- Stop boundary -> requires-rescope (with the [F] cite as evidence): any need to edit
  analysisRunner/analysisService beyond the ratified read-only route (F4 — the route READS via
  ctx.store + storageService; it does not modify the runner; any need to change the runner = STOP);
  any new chart dependency (OQ-2 closed — no); any pressure to change the `signal` renderer's
  output; any GC-9 region edit; any bindings shape that would force a schema `properties`
  addition beyond the enum (bindings/options free objects absorb everything — if they don't, STOP).

## Reviewer bait — likely adversarial attacks on this item, pre-empted

1. **"You widened PB-CH-5's closed set."** The compat suite's COMMENT (:38-41) says preserved; the
   TASK (:8269 "view-spec enum extended") mandates widening. Defense: the banned-identifier
   assertion survives untouched, `quantum` still hits the visible error arm (test kept, extended),
   the comment amended to name the task line. Do NOT delete or weaken any assertion — add.
2. **Frozen `ViewRenderer.test.tsx`**: `signal` testid (:24) + polyline must survive
   byte-identically. Chromatogram is a NEW arm; if anyone proposes "just make signal interactive,"
   the frozen suite + ratified OQ-3 are the counter.
3. **Schema/TS divergence trap** (F2): a reviewer will POST `renderer: 'chromatogram'` at /records
   and watch Ajv reject if only the TS union was extended. Enum edit (schema :31) + YAML restart +
   server positive leg + page whitelist (:380) are the QUADRIFECTA; a "works in UI, rejected by
   API" (or vice versa) split is a defect.
4. **The AnalysisPage silent-coercion trap** (F1 :380-382): whitelist coerces unknown renderers to
   `table` with NO error. If the whitelist hunk lands AFTER the schema/dispatch commit, there's an
   intermediate window where chromatogram views table-ify — land whitelist + dispatch + union in
   ONE commit, with the pass-through test in it.
5. **Mount-accounting attack** (F5): Compare must add ZERO fetches at mount or selection — every
   new fetch is click-gated (run-expand, save, load-comparison, dref-content). W-suite re-runs the
   no-execute suite unmodified as proof.
6. **GC-9 collision**: both items touched AnalysisPage.tsx; GC-9 LANDED FIRST. GC-10's hunks are
   :380-382 whitelist, results header affordance (:513-516), results-pane wiring. Touching
   parameter-form regions (:440-479 etc., F5 list) = scope violation with the shipped diff
   (`git diff a444f944..b12112e5 -- app/src/analysis/AnalysisPage.tsx`) as the evidence.
7. **Hardcode-boundary grep**: prod TS (`ChromatogramView.tsx`, `CompareTraces.tsx`,
   `traceModel.ts`) contains ZERO occurrences of `pA`, `AU`, `min`, `baseline_correction`,
   `timed_event`, `ChemStation`, `FAME`, `signal_plus_baseline`, `rt_min`, `peak_table`,
   `UNRECOVERABLE_SATURATED` RE-ANCHORED l1t1405 (the reason-code literal added to the banned
   list: the saturated fold says reason codes arrive AS DATA in `flags` — the shipped contract is
   peak_integration.py:90/:945-950; TS renders the list, never re-types the spelling) — units
   arrive from artifact payloads; field-name FALLBACKS live in one exported const (and tests may
   name fields — they're fixtures). Pin with a grep test (GC-9's pattern, shipped in
   `AnalysisPage.parameter-form.test.tsx`'s suite), CI-owned.
8. **"You rescaled something."** The axis-compat test suite must prove value arrays are
   byte-identical pre/post conflict states (deep-equal on frozen inputs), and the decimation test
   proves no persistence. Any `* 1e3`-style constant in traceModel.ts = instant defect.
9. **Colour stability under membership churn**: reviewer will add/remove/reorder traces between
   saves. The rule (§D3.5) is stated deterministically; the test matrix covers toggle-state
   invariance AND save/reload identity. Random/`uuid`-based colours = defect.
10. **exactOptionalPropertyTypes**: app has no EOPT (F6) BUT saved view-spec payloads must OMIT
    absent optional keys (server stores verbatim; the shipped module-failure doctrine applies to
    view specs too — a `"conversion": undefined` in bindings is a poisoned record). Use the
    `...(x ? {k:v} : {})` spread (the page already models this idiom at :319/:568); assert saved
    payload with `toStrictEqual` + key-set checks.
11. **YAML-reload trap** (F6): the enum proof requires a lane-stack restart; a curl against an
    un-restarted server proves nothing.
12. **Ontology terms**: none required — no knowledge-layer claim/context/assertion/evidence kinds
    are touched; view-spec is an existing kind getting enum DATA widened. Say so in the PR body so
    the reviewer doesn't hunt `docs/knowledge-layer-canonical-example.md` obligations here.
13. **dref-trace honesty** (OQ-1 RATIFIED (a) — RE-ANCHORED l1t1405, was OQ-pending): the content
    route makes full-resolution bytes REAL for dref artifacts; the chromatogram renders what the
    route returns, never a partial/scaled fake. If the route fails for a specific artifact (inline
    with no dref is a NAMED error leg, not a silent fallback), the component shows the named
    error. A chromatogram that looks full-res while plotting decimated-from-what remains the worst
    outcome — the readout-on-raw-points pin (D5) still applies.
14. **Route-surface attack (new face of ratified OQ-1, not new intent)**: the content route takes
    ONLY an `AOUT-*` record id; it resolves the storage path from the immutable DREF record, never
    from a query param; it is GET-only, read-only, same auth surface as sibling analysis routes
    (analysisRunner.ts:221-222 provider channel, ArtifactBlobHandlers' ART-* scoping is NOT
    reused — F4). Any "accept a path/deviceId too" suggestion = defect.

## Draft completeness (this re-anchor)

All sections re-anchored against trunk b12112e5, first-hand this session: legend/OQ status,
oriented facts F1-F6 (every cite re-opened; baselines [F-run] re-executed 14:13: 9 files/52/52,
app tsc 21/0-in-analysis, server tsc 0), acceptance verbatim (task-list :8280-8283, text identical
to the promoted spec's) + clause mapping, Files IN/OUT (+ ratified OQ-1(a) server/client files —
STATUS change per promotion record, not intent), Design D1-D6 unchanged, first targeted check
(9/52 [F-run]), verification 1-6 (+ route proof in 4), worker contract (rebase watch rewritten for
shipped GC-9), reviewer bait 1-14 (13 re-statused per ratification; 14 names the route's attack
surface), saturated fold restated at shipped-code cites. No OQ reopened; no deliverable added
beyond the already-ratified OQ-1(a) set.

## Re-anchor record (l1t1405 — every corrected/verified cite, old -> new)

Baseline: promoted spec @ be76c512 (cite audit @ a444f944) -> re-anchored at **b12112e5** (GC-9
merge, code tip; GC-7 2598e451 is an ancestor). Diff facts used: `git diff a444f944..b12112e5
--stat -- app/src/analysis` -> GC-9's 6 files (+233 lines AnalysisPage, +586 ParameterForm, +2
CSS-net lines, +2 test files); `git diff 2598e451..b12112e5 -- server/src schema
app/src/shared/api/client.ts` -> **empty** (all server/schema/client cites re-verified against
2598e451-era content, and re-opened first-hand regardless); ViewRenderer trio + view-spec schema ->
diff 0.

| # | Cite in promoted spec | Status at b12112e5 | Re-anchored value (RE-ANCHORED l1t1405) |
|---|---|---|---|
| 1 | task-list GC-10 block `:7990-8012` (promoted) / `:7960-7982` (draft) | MOVED | `:8262-8285`; description :8268-8276, verified-by :8280-8283, files :8284, deps :8267; text verbatim identical |
| 2 | AnalysisPage whitelist `:194-215`, literal `:201`, synthetic cards `:209-214` | MOVED (GC-9 +233) | `:373-394`; literal `:380-382`; synthetic model/binary cards `:388-393` |
| 3 | AnalysisPage `selectRun :167-176`; `manifest/artifactRefs` state `:54-55` | MOVED | `:346-355`; `:130-131` (execute :330-344; `rendered` :358-396; `activeProcessed` :399) |
| 4 | (new) Compare-traces attach site given GC-9 param-form layout | — | results header `analysis-right__title` :513-516; right pane :507-542 (chat :512, views :517-525, promote :527-540); GC-9 regions untouchable: :37-104, :124-185, :242-306, :440-479, import :15 |
| 5 | ViewRenderer.tsx union :25, SignalView :63-89 (W/H :68-69, polyline :86, testid :85, parse :65-67), switch :123-143, error arm :137-141, renderViews :156-176 (:161, :163-166), RenderableArtifact :10-19 | VERIFIED UNCHANGED (diff 0) | same lines; arm precision added: switch stmt :124, table :125-126, signal :127-128, metric :129-130, static-figure :131-132, model+binary :133-135, default :136, error div :137-141 |
| 6 | view-spec.schema.yaml enum :29-31, bindings :33-36, options :38-41, required :55, header :4-8 | VERIFIED UNCHANGED | enum VALUES on :31; GC-10 edit target :31; bindings/options stay free |
| 7 | analysisRunner view-spec persistence `:357-387` (payload :377-383, mint :364-372) | MOVED (GC-7 runner growth; re-verified identical at 2598e451) | `:431-461` (dedupe :435-439, list :433, regex :441, id :447, payload :452-460) |
| 8 | analysisRunner 50k routing `:314-340` | MOVED | `:389-401` + inline/dref split `:415`; persist helper `:310-357` |
| 9 | analysisRunner provisionInputs provider-read `:166-171` (OQ-1(a) ratification cite too) | MOVED | `:221-222` (provisionInputs starts `:147`; dref envelope read :181-190) |
| 10 | persistedManifest `:476-479` | MOVED | `:775-777` (run-record save `:784`) |
| 11 | routes.ts analysis/storage `:1270`, storage `:1249-1256`/`:1254-1256`, study blob `:1216`, records `:235` | VERIFIED UNCHANGED (diff of routes.ts since a444f944/be76c512 = 0) | same; new content route lands beside promote sibling `:1272` |
| 12 | ArtifactBlobHandlers `:27-49` | RE-OPENED | id pattern :32, rejection :77, stored_path handling :110-127 (still wrong-scope for AOUT: ART-* + file.stored_path) |
| 13 | AnalysisHandlers getRun `:74-85` | DRIFT (2 lines) | `:74-82` |
| 14 | RecordStoreImpl validation `:568, :1005-1018` | VERIFIED UNCHANGED | same |
| 15 | client.ts :3231/:3247/:3251/:2296/:2135/:2456 | VERIFIED UNCHANGED | same; + promoteAnalysisArtifact :3263, study-blob URL :5351-5356 (ART-scoped, not reusable) |
| 16 | ViewRenderer.compat.test.tsx source-pin `:38-47`; ViewRenderer.test.tsx :24,:45 | VERIFIED UNCHANGED (both diff 0; 48 + 85 lines) | same |
| 17 | analysisSchema.test.ts view-spec legs `:147-166` | VERIFIED (block :147-167) | signal leg :148-157, quantum reject :159-166; +2 positive legs here |
| 18 | [G7] signal_plus_baseline dref-only fixture `:392-399` | SHIPPED, re-opened | analysisGcIntegration.test.ts `:390-399` (dref id :398, no inlineValue :399) |
| 19 | [G7] dref bytes decode shape `:409-416` | SHIPPED, re-opened | `:405-428` (parse :409, axis_units 'min' :413/:420, value_units 'pA' :414/:421, windows :428) |
| 20 | [G7] peak_table inline `:365-371`, columns `:376` | SHIPPED, re-opened | block `:358-385` (inline shape :366-373, rows=2 :374, columns VERBATIM :376, units :378-380, schema definitions :381, saturated :385) |
| 21 | [G7 fold] saturated reason code / params (cited GC-7 spec :190-192) | SHIPPED | peak_integration.py `:90` (REASON_SATURATED="UNRECOVERABLE_SATURATED"), `:945-950`; test_peak_integration.py :250-251, :549; params saturated_top_fraction_of_max/saturated_min_plateau_points at analysisGcIntegration.test.ts :149-150, :319-320, :330-331 |
| 22 | [G9] "GC-9 edits AnalysisPage; protect-ViewRenderer cite GC-9 spec :296/:295; rebase at claim" | SUPERSEDED by shipped fact | GC-9 MERGED b12112e5; ViewRenderer trio byte-identical (diff 0); shipped param regions listed in F5; bait #6 rewritten to cite the shipped diff |
| 23 | F6 baselines `7 files 22/22`; app tsc 21/0; server tsc 0 | STALE -> RE-RUN | app vitest src/analysis **9 files, 52/52** [F-run 14:13]; app tsc **21 TS lines, 0 in src/analysis** [F-run]; server tsc **0** [F-run] |
| 24 | AnalysisPage.css view-spec block `:79-87` | MOVED/EXTENDED | `:79-94` (GC-9 param styles :98-106+; file 126 lines) |
| 25 | OOS wording "the DNA run page rides the same signal renderer" | CORRECTED | sole external ViewRenderer consumer is `app/src/editor/taptab/extensions/FieldRow.tsx` (grep-proved); no signal-renderer usage under app/src/run or app/src/sequences; union widening is additive-safe, arm output frozen regardless |
| 26 | handoffs "91st-94th" | MOVED | latest **118th** (2026-10-27T1410): GC-9 merged b12112e5, browser gate ACCEPT; Playwright-first + inner-scroller technique; AS-L1T1405-2 (ANR-000006/7 queued-never-executed — GC-10 seeds its own gate fixtures, already covered by §Verification 5) |
| 27 | OQ-1 posture "PENDING (NOT in this list until the orchestrator rules)" + bait #13 conditional | RATIFIED (a) @ promotion l1t2245 | server routes.ts +1 route, AnalysisHandlers content handler, +1 client method, +1 route test file moved into Files IN; bait #13 re-statused to "route makes full-res bytes REAL"; new bait #14 names the route's read-only/no-path-input attack surface. Route provider-read channel cite corrected to analysisRunner.ts:221-222 (the ratification text's :166-171 is stale) |
| 28 | schema YAML dataKind enum :40-42, XOR comment :48-49, schema/units :55-63 | VERIFIED UNCHANGED | same (XOR = comment + runner-enforced at :415, not Ajv — promotion drift note confirmed) |
| 29 | GC-7/GC-9 merge identity | ESTABLISHED | GC-7 merge `2598e451` (ancestor of HEAD), GC-9 merge `b12112e5` = HEAD code tip; GC-10 task deps satisfied (task owner line :8265) |

COMPOSER DONE /home/brad/.hermes/cl/lanes/1/drafts/2026-10-29_GC-10-chromatogram-compare.l1t1405.draft.md
