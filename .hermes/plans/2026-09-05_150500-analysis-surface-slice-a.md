# Analysis Surface — Slice A Implementation Plan

> **SUPERSEDED 2026-09-05:** See `.hermes/plans/2026-09-05_153000-storage-instrument-analysis-surface.md`
> (the current plan). It corrects the foundational error in this one: analysis
> inputs are STORAGE-REFERENCED instrument output files (S3/NAS/USB), never
> git-tracked binaries. This file is retained for the phased detail it still
> contributes (analysis schemas, SDK, runner, renderer, /analysis route, corpus).

> **For Hermes:** IMPLEMENTATION IS DIRECT-CODING (SOUL.md ACTIVE: DIRECT CODING
> since 2026-09-05). The subagent-driven-execution handoff is NOT used — I code
> each task myself, TDD, one commit per task.

**Goal:** Stand up the *analysis* work surface end-to-end for a manually
authored Python method: declare record schemas, execute a script in an
isolated runner, render validated outputs (table / signal / static figure),
wire the `/analysis` route + tab with a real `SurfaceContext(surface:'analysis')`,
and capture confirmed run → result pairs to the existing local corpus seam.

**Architecture:** This is the deferred landing surface from the corpus plan
(Task 3.3). It reuses the already-landed `SurfaceContext` payload + `analysis`
surface id (schema/registry/surfaces/surfaces.yaml:42, server/src/surfaceContext/)
and the local corpus capture seam (server/src/corpus/surfaceContextCorpus.ts).
It does NOT touch the existing robot-execution platform
(server/src/execution/) — analysis runs are a NEW record family with the SAME
lifecycle shape (immutable revision → frozen run → committed artifact manifest),
but a separate runner. Data files live in the git-backed `records/` tree like all
other records; provenance links back through `Ref` relationships.

**Tech Stack:** TypeScript (server Fastify, app React+Vite), YAML JSON-Schema
2020-12 (Ajv), Python 3.12 (present at /usr/bin/python3, no venv yet), the
existing `computable_lab_analysis` SDK package (author under
server/python-executor-service/), vitest (both workspaces).

---

## Concrete grounded facts (from inspection, 2026-09-05)

- `analysis` surface is ALREADY registered. `schema/registry/surfaces/surfaces.yaml:42-47`:
  id `analysis`, path `/analysis`, objectTypes `[project, run, collection]`,
  selectableKinds `[well, cell, event, material]`, aiRole `"interrogative goals
  answered in place"`.
- `SurfaceContext` (server/src/surfaceContext/SurfaceContext.ts) + deterministic
  serialization (server/src/surfaceContext/serialization.ts: toYaml/toJson,
  stable key order, slims empty optional fields). Frontend mirror at
  app/src/shared/context/SurfaceContext.ts, app/src/shared/surfaces.ts.
- Corpus seam: `server/src/corpus/surfaceContextCorpus.ts` — pure builder +
  opt-in local JSONL via env `CLA_CORPUS_LOCAL_PATH`. Already wired for
  `source: 'Surface-context'`.
- `app/src/App.tsx` has NO `/analysis` route. Existing route block:
  find at `:172`, settings at `:173`, `*` NotFound at `:175`. Routes use
  `lazy(...)` + `<DeferredRoute>`.
- Python executor skeleton exists: `server/python-executor-service/`
  (pyproject.toml, src/python_executor_service/ claim_loop.py, models.py,
  runner_registry.py, runner_base.py, runners/integra_assist.py). Python 3.12.3
  at /usr/bin/python3. NO venv / requirements installed yet.
- Record CRUD canonical: `server/src/store/` RecordStoreImpl; records are YAML in
  `records/`; schema-loading via server/src/schema/SchemaRegistry.ts with YAML.
- The execution platform (server/src/execution/) is for ROBOT execution
  (robot-plan → execution-run → instrument-log). Reuse its LIFECYCLE PATTERN
  (immutable run, commit-after-validate, Artifact already in git on successful
  commit), do NOT reuse its robot-specific record kinds.

---

## Phases

### Phase 0 — Baseline

- Confirm `cd server && npx vitest run src/surfaceContext src/corpus` green.
- Node probe loads ALL schemas into Ajv (ajv-unevaluatedproperties-pitfall: load
  all 141 schemas, don't test in isolation) before authoring new schemas.
- No commit.

### Task 1.1: Dataset-outline + selection refs (understand data source)

**No new code.** Trace how a well selection on an existing surface becomes a
`SelectionItem[]` (ref kind `record`, type e.g. `plate-read` / `measurement-context`)
so the analysis inputs can resolve to records. Read
`app/src/graph-search/GraphSearchPage.tsx` `sendSelectionToAi` (corpus commit
`dce884e`) and `app/src/shared/api/client.ts` for the graph-search
`CollectionService` shape. Record findings in this file's Risks section.

**Task goal:** every `analysis-run` input resolves to a record id + schema type.

### Task 1.2: Author the analysis record schemas (schema-first, repo rule #1)

**Files (new, under schema/knowledge/):**
- `analysis-revision.schema.yaml` — immutable method: entryScript (string),
  helperHashes?, inputContract (array of {name, recordType, required}),
  parameterSchema (JSON-Schema fragment), computedInference.model? no — keep
  minimal: { id, title, description, parentRevisionRef?, entryScript, sdkVersion,
  methodNotes, author }
- `analysis-run.schema.yaml` — frozen: { id, revisionRef, inputs: [{name, ref}],
  parameters, status: [queued,running,succeeded,failed,cancelled],
  outputManifestRef?, startedAt, completedAt?, initiator }
- `analysis-output-artifact.schema.yaml` — { id, runRef, name, kind:
  [table,signal,static-figure,metric], schema (field/axis bindings), units,
  storageRef, sourceRelationships }
- `view-spec.schema.yaml` — discriminated union keyed by `renderer`:
  table | signal | static-figure | metric.

Follow the FAIRCommon mixin pattern (`schema/core/common.schema.yaml` allOf;
see material-instance.schema.yaml for shape). Add `analysis-revision.lint.yaml`
(required entryScript non-empty, revisionRef exists) if enforced pattern applies.

**Step 1:** failing schema test `server/src/analysis/analysisSchema.test.ts`:
load all schemas into Ajv, validate a sample revision + run payload (use the
probe pattern from ajv-unevaluatedproperties-pitfall: load ALL schemas).
**Step 2:** run → FAIL (schema missing).
**Step 3:** write schemas. **Step 4:** PASS. **Step 5:** commit `feat(analysis):
analysis-revision/run/artifact/view schema triplet`.

### Task 1.3: Analysis record store service (CRUD + list)

- `server/src/analysis/analysisService.ts` — nextRecordId (ANLV##/ANLR##/ANLA##),
  create/update/get/list via ctx.store (pattern: ExecutionRunService).
- `server/src/api/routes.ts` + new `server/src/api/handlers/AnalysisHandlers.ts`:
  POST/GET `/api/analysis-revisions`, POST/GET `/api/analysis-runs`,
  GET `/api/analysis-runs/:id` status + manifest.
- TDD `server/src/analysis/analysisService.test.ts` (in-memory ctx, create/list).
- Commit `feat(analysis): analysis record CRUD + API`.

### Task 2.1: Python SDK `computable_lab_analysis`

Under `server/python-executor-service/src/` add the SDK package, e.g.
`src/computable_lab_analysis/` with `runner.py` + `ctx.py`:

```python
# ctx.py
class Context:
    def __init__(self, inputs: dict, parameters: dict): ...
    def input(self, name):   # authorized dataset handle
    @property
    def parameters(self):    # immutable validated mapping
    def publish(self, name, data, kind="table", units=None): ...
    def metric(self, name, value, unit=None, label=None): ...
    def view(self, name, renderer, **bindings): ...
    def log(self, msg): ...
    def progress(self, msg): ...

def run(module, ctx):  # import entry module, call run(ctx) once
```

Support just `kind in {table, static-figure, signal, metric}` for Slice A.
Outputs collected into an in-memory `OutputManifest` that serializes to JSON with
stable ordering (mirror surfaceContext serialization style).
**Step 1:** failing py tests (`server/python-executor-service/tests/test_sdk.py`,
`python -m unittest discover -s tests -v`).
**Step 2:** FAIL. **Step 3:** implement. **Step 4:** PASS.
**Step 5:** commit `feat(analysis-sdk): computable_lab_analysis ctx + runner`.

### Task 2.2: Runner — execute an entry script in a fresh subprocess

- `server/src/analysis/analysisRunner.ts` — given an `analysis-run` + resolved
  input records, materialize inputs as read-only JSON into a temp dir, spawn
  `/usr/bin/python3 -m computable_lab_analysis run <entry.py> --inputs <dir>`,
  capture output manifest JSON, write artifacts to `records/analysis-artifact/`,
  commit via ctx.repoAdapter only on success (the Artifact staleness rule —
  same as ExecutionRunner log write). Failure → run status `failed` with stderr
  captured; never publish partial.
- TDD `server/src/analysis/analysisRunner.test.ts` — a fixture script that
  publishes a table + metric exits 0 and yields a manifest; a throwing script
  yields a failed run with stderr.
- Commit `feat(analysis-runner): subprocess runner commits artifacts only on success`.

### Task 3.1: ViewSpec → React renderers (no chart lib yet)

- Frontend: `app/src/analysis/components/ViewRenderer.tsx` — switch on
  `view.renderer`:
  - `table` → plain `<table>` (columns from schema fields)
  - `metric` → stat display
  - `signal` → inline SVG polyline (drawn from x/y arrays in the artifact JSON)
  - `static-figure` → `<img src=` on stored PNG artifact
- Data fetched from `GET /api/analysis-artifacts/:id` (client method added to
  app/src/shared/api/client.ts).
- TDD (vitest app): `ViewRenderer.test.tsx` renders a table + metric from a
  mocked manifest; unknown renderer → compatibility error message.
- Commit `feat(analysis-ui): view-spec renderers (table/metric/signal/static-figure)`.

### Task 3.2: `/analysis` route + page + tab

- New `app/src/analysis/AnalysisPage.tsx` (lazy-loaded). Layout per two-pane rule:
  left = analysis list + submit; right = run status + rendered output + AI panel.
  It is the `analysis` surface: build a `SurfaceContext` with
  `surface:'analysis'`, `active` = the active run/revision, `selection` = input
  refs. Show run status and "Results from previous settings" staleness banner.
- `app/src/App.tsx`: add `<Route path="/analysis" element={<DeferredRoute><AnalysisPage/></DeferredRoute>} />`
  in the route block near the `/find` (line ~172) and `/settings` (line ~173) routes.
- Also add `apiClient.listAnalysisRuns()` / `getAnalysisRun()`.
- TDD: `AnalysisPage.test.tsx` renders the run list from a mocked client.
- Commit `feat(analysis-ui): /analysis route + page`.

### Task 3.3: Corpus capture at accept (the weekend goal, closes Task 3.3)

- At the point a user accepts a successful analysis result (e.g. "Use Result in
  New Analysis" or an explicit accept), call
  `captureSurfaceContextPairToLocal({ surfaceContext, goal, acceptedGraph })`
  from the FRONTEND via a new POST endpoint, OR call the pure builder server-side
  at run-commit. **Recommend server-side**: on successful run commit, build the
  entry with `acceptedGraph = outputManifest` and write via
  `server/src/corpus/surfaceContextCorpus.ts` (respects CLA_CORPUS_LOCAL_PATH
  opt-in; no-op when unset).
- TDD `server/src/analysis/analysisRunner.test.ts` or a new `analysisCorpus.test.ts`:
  a successful run with the env toggle set writes a JSONL line with
  `prompt.surfaceContext.surface === 'analysis'` and non-empty acceptedGraph.
- Commit `feat(corpus): capture analysis SurfaceContext→accepted pairs`.

### Task 4.1: Headless end-to-end fixture (GC trace → area → peak table)

Recipe the spec's Slice B, but using the record/graph data source:
- Seed a small synthetic trace dataset record (time/intensity columns) under
  records/ (a real test fixture).
- Author a manual `entry.py`: `ctx.input('trace')` → read x/y → integrate area
  under a stated window (matching the spec §7 illustrative method) → publish
  `peak_results` table + `trace_display` signal → `ctx.metric('area', ...)`.
- Headless replay command (spec §13): `python -m computable_lab_analysis run
  ./bundle --inputs ./data --output ./replay`.
- TDD: reproduce expected fixture area within tolerance on a fresh subprocess
  (spec A03). Build the reproducibility bundle (entry.py + manifest + run
  inputs + dependency lock).
- Commit `feat(analysis): GC end-to-end fixture + replay bundle`.

### Task 4.2: Live-verify (SOUL rule, mandatory)

- app+server running (backend 3001 + Vite 5174). Navigate to /analysis.
- Create analysis revision via API, submit a run, watch status go
  queued→running→succeeded, confirm the rendered table + signal appear.
- Confirm `curl -s http://localhost:5174/src/analysis/AnalysisPage.tsx | grep -c "analysis"`.
- Confirm a confirmed run writes a local corpus JSONL entry
  (temp path, verify file read-back).
- Report explicitly WHAT was confirmed live vs unit-only. Do NOT fabricate a pass.

---

## Deferred (explicitly out of scope — park, don't build)

- **AI authoring of scripts** (§10) — reuse the Foundry loop shape later. Slice A
  requires MANUALLY authored scripts first (spec §14 "before adding AI generation").
- **Container-level isolation** (§11) — subprocess runner only for Slice A; true
  non-root/networkless container isolation is a later slice.
- **FCS/compensation/gating, plate-reader calibration** (§ Slices C/D) — later.
- **plotly/recharts** — not needed; SVG + table for Slice A. No chart lib added.
- **Multiple renderer richness** (scatter2d/3d, heatmap) — extend ViewSpec union
  in a later slice.

## Risks / tradeoffs

- **Input record resolution** (Task 1.1) is the biggest unknown: the analysis
  inputs must map to real record types that already hold well/measurement data.
  If the graph has no ready "signal dataset" record to feed `ctx.input`, Slice A
  may need a minimal `dataset-descriptor` record or a synthetic record — confirm
  with Brad before coding Task 2.1.
- **Local pairwise reproducibility** (A03): floating-point area depends on numpy;
  pin numpy in a venv/requirements before the fixture, and declare tolerance.
- **Cl-appliance corpus-service** may be offline — 3.3 uses local JSONL opt-in;
  do not depend on remote.
- **Determinism in output JSON ordering** mirrored from surfaceContext.

## Validation checklist

- [ ] vitest server: analysis schema/service/runner/corpus green
- [ ] vitest app: ViewRenderer + AnalysisPage green
- [ ] python unittest: SDK + fixture green
- [ ] typecheck app + server clean
- [ ] no regression: surfaceContext + corpus + existing tests still pass
- [ ] Live: /analysis route renders, run succeeds, table+signal shown, corpus
      JSONL written on accept
- [ ] Headless replay reproduces fixture area within tolerance (A03)