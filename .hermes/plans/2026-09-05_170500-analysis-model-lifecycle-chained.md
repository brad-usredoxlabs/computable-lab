# Model Lifecycle & Chained Analysis — Implementation Plan

> **For Hermes:** IMPLEMENTATION IS DIRECT-CODING (SOUL.md ACTIVE: DIRECT CODING
> since 2026-09-05). The subagent-driven-execution handoff is NOT used — I code
> each task myself, TDD, one commit per task.

**Goal:** Make the analysis surface support the full ML workflow the user
described: **script A trains a model (sklearn/PyTorch) → emits a model file;
script B loads the model and runs predictions on a dataset; scripts C, D, E…
search / sort / transform the results.** Each is a separate immutable
`analysis-revision` + `analysis-run`, chained by referencing prior outputs as
inputs. Model files and derived datasets live on a storage device (never git);
downstream runs consume them by immutable ref.

**Architecture:** Three gaps in the current Phase-4 analysis surface must close:
(1) models/is-objects are `dataKind`-unrepresentable + are never persisted to a
storage device (the runner always inlines `inlineValue` — the deferred TODO);
(2) the SDK can only `publish` JSON-scale values, not emit a file a script
wrote; (3) run inputs only accept `data-reference` refs, so a downstream script
can't consume a prior *run's output* as an input. This plan closes all three:
a file-emitting SDK, a runner that persists large/model artifacts to the storage
device as a `data-reference` (completing the deferred branch), and a
`POST /analysis-artifacts/:id/promote` "Use Result in New Analysis" seam (A06)
that turns any artifact into a consumable data-reference.

**Tech Stack:** TypeScript (server Fastify), the existing `computable_lab_analysis`
python SDK, the existing `StorageService` + `acquisition` (data-reference) seam,
YAML JSON-Schema (Ajv), vitest + python unittest. sklearn/PyTorch in the SDK
ENVIRONMENT (not in CL) — CL only carries bytes + hashes.

---

## The model workflow, as it will work after this plan

1. **Author** a training revision (AI-authored or manual): `run(ctx)` reads
   `ctx.input('features')`, trains `LinearRegression`/any, serializes to a temp
   file, then `ctx.publish_file('model', path, kind='model', format='joblib')`.
2. **Run it.** The runner persists the emitted bytes → storage device + a
   `data-reference` (`DREF-…`), and records an `analysis-output-artifact` with
   `dataKind:'model'`, `format:'joblib'`, `dataReferenceRef → DREF-…`,
   `sourceRelations → [training run, features dref]`.
3. **Author a predict revision**: reads `ctx.input('model')` (a dref resolving to
   the joblib bytes) + `ctx.input('features')`, loads the model, writes a
   predictions table (or `ctx.publish_file('preds.csv', …)`).
4. **Run it** → predictions artifact (small → inline; large → storage).
5. **Author N downstream scripts** (search/sort/filter/transform): each references
   the predictions `data-reference` (or `POST /analysis-artifacts/:id/promote`
   to get a dref for an inline artifact) as an input, and publishes derived
   outputs. Arbitrary chain depth; every artifact immutable + version-pinned.

Cross-instrument/identity integrity is unchanged: inputs are resolved by
`data-reference` id (never filename similarity — locked rule #5).

---

## Concrete gaps (from inspection, 2026-09-05)

- `schema/knowledge/analysis-output-artifact.schema.yaml:42` — `dataKind` enum is
  `[table, signal, signal-collection, spatial-array, image, binary, metric]` — **no
  `model`**. `binary` exists but is generic; we want `model` as a first-class kind.
- `server/src/analysis/analysisRunner.ts:194-212` — `persistArtifactRecord` ALWAYS
  inlines `inlineValue` (`isSmall ? inlineValue : inlineValue` — both branches
  inline). The `dataReferenceRef` field on the artifact schema is never populated.
  This is the deferred "large artifacts → storage device" TODO.
- `server/python-executor-service/src/computable_lab_analysis/ctx.py` — `Context`
  has `publish(name, data, kind=…)` (JSON-scale) but NO file emission; `DatasetHandle`
  has `read_signal`/`read_rows` but no way to read an arbitrary model file into memory.
- `server/src/analysis/analysisRunner.ts:84-130` `provisionInputs` requires
  `ref.type === 'data-reference'`; a run can't consume a prior `analysis-output-artifact`.
- `server/src/api/handlers/AnalysisHandlers.ts` + `routes.ts` — no artifact-promote
  endpoint (A06 "Use Result in New Analysis").

---

## Phases / tasks

### Phase 0 — Baseline
- `npx vitest run src/analysis/ src/storage/` green (23 + 22 tests).
- `PYTHONPATH=src python3 -m unittest discover -s tests` green (14).
- No commit.

### Task 1.1: SDK — emit a file artifact (`ctx.publish_file`)

**Objective:** Let a script hand a serialized file (model/CFV/CSV/PNG) to CL as
an artifact, with CL capturing size + sha256 (bytes stay on storage, never git).

**Files:**
- Modify `server/python-executor-service/src/computable_lab_analysis/ctx.py`
- Test `server/python-executor-service/tests/test_computable_lab_analysis.py`

Add to `Context`:

```python
def publish_file(self, name, path, *, kind="binary", format=None,
                 units=None, schema=None):
    """Register a file the script wrote as an output artifact.
    kind: model|table|signal|image|binary ...   format: joblib|pt|csv|png...""
    p = Path(path)
    if not p.exists(): raise FileNotFoundError(f"... {path}")
    import hashlib
    sha = hashlib.sha256(p.read_bytes()).hexdigest()
    self._manifest.artifacts.append({
        "name": name, "dataKind": kind,
        "format": format or p.suffix.lstrip("."),
        "blob": {"path": str(p), "sha256": sha, "sizeBytes": p.stat().st_size},
        **({"units": units} if units else {}),
        **({"schema": schema} if schema else {}),
    })
```

Add to `DatasetHandle`:
```python
def file_bytes(self) -> bytes:       # read_path -> bytes (models, raw files)
    if self.path: return Path(self.path).read_bytes()
    raise RuntimeError("no file path for this input")
```
And expose `source_path` (already exists). Enough for `joblib.load(ctx.input('model').source_path)`.

**Step 1:** failing py test: a script publishes a temp file via `publish_file`,
manifest artifact carries `blob.path/sha256/sizeBytes` + `dataKind:'model'`.
**Step 2:** FAIL. **Step 3:** implement `publish_file` + `DatasetHandle.file_bytes`.
**Step 4:** PASS. **Step 5:** commit `feat(analysis-sdk): publish_file + input file_bytes`.

### Task 1.2: Schema — `model` dataKind

**Files:**
- Modify `schema/knowledge/analysis-output-artifact.schema.yaml:42` — add `model` to
  the enum.
- Modify `schema/knowledge/analysis-revision.schema.yaml` inputs `dataKind` enum —
  add `model`.
**Step 1:** failing `server/src/analysis/analysisSchema.test.ts` — a `dataKind:'model'`
artifact + revision-input validates.
**Step 2:** FAIL. **Step 3:** edit both enums.
**Step 4:** PASS (full-schema Ajv load — the unevaluatedProperties pitfall).
**Step 5:** commit `feat(analysis): model dataKind in artifact + revision inputs`.

### Task 1.3: Runner — persist large/model artifacts to storage as a data-reference

**Objective:** Close the deferred TODO: when a manifest artifact has a `blob`
(emitted file) OR is large, write its bytes to the default storage device and
record a `data-reference`, then set `artifact.dataReferenceRef` +
`sourceRelations`. Small JSON (table/metric) stays inline.

**Files:**
- Modify `server/src/analysis/analysisRunner.ts` `persistArtifactRecord`
- Test `server/src/analysis/analysisRunner.test.ts`

`persistArtifactRecord(runId, page, viewSpecs)` becomes:
- if `page.blob` (path to the emitted temp file): stream that file → the default
  storage device (`ctx.storageService.defaultDeviceId()`, new helper) via
  `provider.write`, then create a `data-reference` via `acquireDataReference`
  (reuse) or a similar record mint (DREF-, storageDeviceId, path, sha256, size,
  dataKind, format). Set `artifact.dataReferenceRef = { kind:'record', id:dref,
  type:'data-reference' }`, `sourceRelations=[runRef, …inputs]`.
- else if `isLarge`: write the JSON+hash to storage the same way.
- else (small table/metric): keep `inlineValue`.
- **A run with a model artifact now yields BOTH an `analysis-output-artifact`
  (`dataKind:'model'`, `dataReferenceRef`) AND a `data-reference` record.**

`StorageService` needs a `defaultDeviceId()` accessor (first `default:true`, else
first device; throw if none).

**Step 1:** failing test — a script that emits a small "model" file via
`publish_file` runs; assert an `analysis-output-artifact` with `dataReferenceRef`
exists AND a `data-reference` record `DREF-…` exists whose `path` resolves on the
storage device, AND no model bytes are in `records/`.
**Step 2:** FAIL. **Step 3:** implement. **Step 4:** PASS.
**Step 5:** commit `feat(analysis-runner): persist emitted/large artifacts to storage as data-reference`.

### Task 1.4: Runner — consume an `analysis-output-artifact` as a run input

**Objective:** a downstream script's `inputs` can reference a prior run's output
artifact (its `dataReferenceRef`), enabling chaining.

**Files:**
- Modify `server/src/analysis/analysisRunner.ts` `provisionInputs`
- Test `server/src/analysis/analysisRunner.test.ts`

In `provisionInputs`, when `ref.type === 'analysis-output-artifact'`:
- load the artifact record → resolve its `dataReferenceRef` (if present) and
  stream bytes exactly as for a data-reference; else if it has `inlineValue` and
  it's a `model`/`binary`, write the inlined value to a temp file and hand that
  path (small inline tables/metrics stay readable via `read_rows` — or just
  resolve through promote). Simplest robust path: **always route through a
  data-reference** — if the artifact has no `dataReferenceRef`, promote it first
  (calls Task 1.6's promote helper). This keeps one provisioning code path.

**Step 1:** failing test — run B whose input `{kind:'record', type:'analysis-output-artifact',
id:<artifact of run A>}` provisions the model bytes and a script can
`ctx.input('model').source_path` → `joblib.load(...)`.
**Step 2:** FAIL. **Step 3:** implement resolution.
**Step 4:** PASS. **Step 5:** commit `feat(analysis-runner): consume output-artifact as run input (chaining)`.

### Task 1.5: End-to-end train→predict→downstream chained fixture (the user scenario)

**Objective:** prove the full workflow headlessly with a tiny sklearn-free model
(to avoid pip deps) — a hand-rolled least-squares/linear model persisted as
`joblib` via a manual dump, OR a trivial in-python model (dict of coefficients)
serialized with `pickle`. No external ML lib requirement at test time.

**Files:**
- Add `server/python-executor-service/fixtures/ml-chain/` — `train_entry.py`,
  `predict_entry.py`, `filter_entry.py`, `data.csv`, `README.md`
- Add `server/python-executor-service/tests/test_ml_chain.py`

Flow (headless, through the SDK CLI + a real temp storage device):
1. `train_entry.py`: read `features.csv` → fit y=2x+1 via least squares →
   `ctx.publish_file('model', 'model.pkl', kind='model', format='pkl')`.
2. `predict_entry.py`: `model = pickle.load(ctx.input('model').file_bytes())`;
   read new `x` → `ctx.publish('predictions', [{x,pred}], kind='table')` or a
   `preds.csv` via publish_file.
3. `filter_entry.py`: read predictions (dref from step 2) → keep rows where
   `pred > threshold` parameter → publish filtered table.

Use the TS `analysisRunner` to drive all three runs against a temp `local-mount`
device, then assert: model dref produced; predict consumed it; filter consumed
predictions (via artifact-ref input); filtered values correct within tolerance.
**Step 1:** failing test. **Step 2:** FAIL. **Step 3:** implement fixtures.
**Step 4:** PASS. **Step 5:** commit `test(analysis): train→predict→filter chained fixture (A06)`.

### Task 1.6: `POST /analysis-artifacts/:id/promote` (A06 "Use Result in New Analysis")

**Objective:** expose an endpoint so any artifact (esp. an inline table/metric,
or to get a canonical dref for a model) can be materialized as a `data-reference`
that a new run's inputs can reference — the UI + API "use this result downstream".

**Files:**
- Create `server/src/analysis/artifactPromotion.ts` (pure helper: `promoteArtifact(ctx,
  artifactId, opts) -> { dataReferenceId }` — if artifact has `dataReferenceRef`, return it;
  else write inlineValue to default device + mint dref + update artifact with
  `dataReferenceRef` + `sourceRelations`).
- Modify `server/src/api/handlers/AnalysisHandlers.ts` + `routes.ts`:
  `POST /analysis-artifacts/:id/promote`.
- Modify `app/src/shared/api/client.ts` — `promoteAnalysisArtifact(id)`.
- Test `server/src/analysis/artifactPromotion.test.ts` (inline artifact → promotable;
  already-referenced artifact → idempotent returns same dref).
**Step 1:** failing test. **Step 2:** FAIL. **Step 3:** implement.
**Step 4:** PASS. **Step 5:** commit `feat(analysis): POST /analysis-artifacts/:id/promote (A06)`.

### Task 1.7: UI — model artifact display + "Use Result in New Analysis"

**Files:**
- Modify `app/src/analysis/ViewRenderer.tsx` — handle `model`/`binary` renderer
  (show format + link if `dataReferenceRef`; if inline, show "promote to use
  downstream").
- Modify `app/src/analysis/AnalysisPage.tsx` — on a model/binary artifact card,
  a **"Use in New Analysis"** button calling `promoteAnalysisArtifact` then
  opening a pre-seeded "New method" with an `inputs` hint (or just an info line
  with the resulting `DREF-…` you can reference). Keep it minimal: show the dref +
  a copyable ref snippet.
- Tests: `app/src/analysis/ViewRenderer.test.tsx` (model renderer), `AnalysisPage.test.tsx`.
- **Live-verify (SOUL rule):** isolated backend+vite; run the training chain via
  API; confirm the model artifact renders and "Use in New Analysis" returns a dref;
  drive a predict revision through the UI referencing it and see the predictions table.
- commit `feat(analysis-ui): model artifact card + Use-Result-in-New-Analysis (A06)`.

### Task 1.8: Docs — update the analysis plan/READMEs

- Add a short "Model lifecycle & chained analyses" section to
  `server/python-executor-service/fixtures/ml-chain/README.md` and the main plan,
  describing A→B→C→N chaining and that each step is an immutable revision/run.
- No code. commit `docs(analysis): model lifecycle + chained analysis notes`.

---

## Deferred (park — don't build now)

- **Noun-accurate "bag of model metadata"** (hyperparams/architecture/seed as a
  first-class `.metadata` block on the artifact) — nice-to-have; YAGNI until a
  real training run needs it. The schema already allows `schema`/`units` freeform.
- **Ambient environment pinning** per run (conda/requirement digest) — the runner
  uses `/usr/bin/python3` today; pinning sklearn/PyTorch versions is a deployment
  slice (§11 env identity), noted but separate.
- **Parallel model search (grid/random search)** — out of scope; the model is a
  black-box artifact. A grid search is just a train revision with parameter sweep
  (later).
- **A workflow/DAG orchestrator** for arbitrary script graphs — chaining is done
  by explicit artifact refs today (YAGNI); a visual DAG is a big pivot.

## Risks / tradeoffs

- **sklearn/PyTorch availability** — CL's `/usr/bin/python3` may not have them.
  Mitigation: the test fixtures use `pickle`/hand-rolled models (no ML dep), so
  tests pass anywhere; real sklearn/torch training runs depend on the environment
  the runner points at (`CLA_ANALYSIS_SDK_DIR` + python path), which is a
  deployment concern, documented.
- **Model serialization ≠ portable across envs** (pickle dumps embed classes) —
  when model is consumed in a DIFFERENT run, the python env must have the class
  module importable. Mitigation: use joblib/sklearn models in-run, or `pickle` of
  dicts/arrays (portable). Document in the fixture README; an `.onnx`/`state_dict`
  export is a later enhancement.
- **Large artifact path** — model files stream to the default storage device with
  a sha256 anchor; no git growth. `dataReferenceRef` stays a pointer.

## Validation checklist

- [ ] py SDK: publish_file + file_bytes tests green
- [ ] schema: `model` dataKind in artifact + revision validates (full-schema Ajv)
- [ ] runner: emitted/model artifacts persist to storage as dref + dataReferenceRef set
- [ ] runner: a run consumes a prior output-artifact as an input (chaining)
- [ ] headless ml-chain fixture: train → predict → filter reproduces known values
- [ ] promote endpoint: inline → dref; idempotent
- [ ] app: model artifact renders + Use-in-New-Analysis works
- [ ] no regression: analysis + storage + corpus suites green; typecheck app+server
- [ ] Live: UI renders a model artifact and chains a prediction run (SOUL)

---

## Implementation status (2026-09-05 evening — DONE)

All Tasks 1.1–1.8 committed on `main`. The analysis surface now supports the
full model lifecycle + chained analyses:

- SDK: `ctx.publish_file(name, path, kind='model')` (sha + size) + `ctx.input('model').file_bytes()`.
- Schema: `model` dataKind on artifact, revision inputs, and data-reference.
- Runner: emitted/large artifacts stream to the default storage device +
  mint a `data-reference` (`dataReferenceRef`); bytes never in git.
- Chaining: a run's `inputs` may reference a prior run's `analysis-output-artifact`
  (resolved to its dref) or a `data-reference` — arbitrary depth.
- `POST /analysis-artifacts/:id/promote` (A06 "Use Result in New Analysis"):
  inline artifact → storage dref, idempotent.
- Headless train→predict→filter fixture reproduces known values end-to-end.
- UI: model/binary artifact card (format + dref) + "Use in New Analysis" promote.
- AI-authoring (previous plan) drafts scripts that can now emit/consume models.

Deferred (unchanged): container isolation, FCS/gating/plate-reader slices,
direct instrument control, ambient env pinning.