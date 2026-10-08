# Computable Lab Analysis Surface

Version: 0.1 — proposed implementation specification  
Date: 2026-09-05  
Status: Design proposal for engineering implementation; existing repository interfaces have not been inspected.

## 1. Product intent

Provide an AI-assisted scientific analysis workspace inside Computable Lab. A user describes an analysis, the on-premises model writes Python, and the application displays the resulting controls, plots, tables, images, and datasets through reusable frontend components.

Each analysis has an inspectable and downloadable Python script. Users interact with the resulting tool without needing to understand notebook cells, execution order, Python, or frontend development. Scripts are complete methods with explicit inputs and parameters. Every execution produces an immutable run record.

The system must support cytometry, LC/GC, mass spectrometry, qPCR, plate readers, cell counters, and spectrophotometers such as NanoDrop. Domain support expands through readers and scientific Python libraries, not separate instrument applications.

**Core architectural decision:** standardize the boundary between Python and the application. Python expresses scientific calculations; a small SDK exposes inputs, parameters, selections, outputs, and views. Do not require every calculation to be represented as a registered framework operation.

## 2. Goals and boundaries

### Required for v0.1

- One complete Python entry script per analysis revision, with bundled helper modules permitted.
- Local model inference, local Python execution, and local data storage; no cloud dependency for normal operation.
- Reusable React/TypeScript views driven by validated output specifications.
- Explicit, typed parameters and dataset inputs.
- Named derived datasets that subsequent analyses can consume directly.
- Script inspection, editing, download, revision history, and execution history.
- Reproducibility bundles and a documented headless runner.
- Stable selection semantics, independent of plotting libraries.
- Provenance integrated through existing Computable Lab graph interfaces.
- Domain-neutral infrastructure validated with multiple instrument workflows.

### Excluded from v0.1

- Notebook cells or a persistent shared Python namespace as the user model.
- AI-generated JavaScript, arbitrary HTML, or new React components during routine analysis.
- A universal wrapper around all Python functions.
- Automatic support for every proprietary vendor format.
- A visual workflow editor, distributed execution cluster, or automatic incremental execution engine.
- Claims that an AI-written scientific method is validated solely because it executes successfully.
- Autonomous changes to source acquisitions or instrument settings.

Assumption: the existing frontend is TypeScript and likely React. Confirm before implementation; preserve the host application's routing, authentication, dataset services, and graph conventions.

## 3. User experience

An analysis page contains a title and description, dataset inputs, parameter controls, a results surface, run status, and an AI conversation panel. Secondary tabs expose Python, method notes, and history. Controls include Run, Cancel, View Python, Download, and Use Result in New Analysis.

### Creation

1. User selects datasets, wells, samples, or prior outputs through existing application navigation.
2. User describes the desired analysis.
3. The model inspects authorized dataset descriptors and retrieves relevant SDK examples and library documentation from local resources.
4. The model creates a draft script, parameter schema, input contract, and method notes.
5. The system validates the draft and runs it in an isolated development execution.
6. Successful output descriptors render in the same workspace the user will use subsequently.
7. User adjustments create parameter changes or new code revisions as appropriate.

Routine draft runs need no extra confirmation when within the user's existing authorization. Failed draft attempts remain inspectable and cannot overwrite successful results.

### Three interaction classes

| Interaction | Execution behavior |
| --- | --- |
| Zoom, pan, rotate, hover, sort a displayed table | Frontend or data-query action; no AI call and no scientific rerun |
| Change an integration boundary, channel, gate, or threshold | Update a typed parameter or selection; run Python when requested |
| Ask for a different method or calculation | Model edits the script and associated schema; creates a new revision |

Explicit Run is the default for computational changes. Optional debounced auto-run may be enabled for designated inexpensive analyses. While parameters differ from the displayed run, show “Results from previous settings.”

Changing presentation-only state must not create a new scientific run. A control that changes the coordinate system used by a gate is analytical state and must preserve that distinction.

## 4. Logical architecture

| Component | Responsibility |
| --- | --- |
| Existing frontend | Navigation, dataset selection, analysis pages, access control presentation |
| Analysis API | Revision management, input resolution, parameter validation, job submission, output access |
| Local AI service | Generate and revise Python using authorized metadata and local SDK documentation |
| Execution supervisor | Start, limit, cancel, and clean up isolated workers |
| Python worker and SDK | Execute scripts, read mounted inputs, produce validated output manifests and artifacts |
| Artifact store | Immutable source references and run outputs; large data remains outside the graph |
| Graph adapter | Connect acquisition, sample, analysis revision, run, selection, and derived dataset |

Use existing services where suitable. A Python API implementation using FastAPI/Pydantic is a proposed default, not a requirement to replace the existing application backend. A single-host durable queue is sufficient initially. No external broker is required unless the repository already uses one.

## 5. Domain model and persistence

| Entity | Required information |
| --- | --- |
| Analysis | ID, title, owner/project, description, current draft revision, timestamps |
| AnalysisRevision | Immutable ID, parent revision, entry script and helper hashes, input contract, parameter JSON Schema, SDK version, environment reference, method notes, author |
| AnalysisRun | ID, revision ID, resolved inputs, parameters, selection snapshots, environment digest, status, initiator, timing, logs, output manifest, seeds if applicable |
| DatasetDescriptor | Dataset/version ID, content hash, kind, storage reference, dimensions, axes/columns, units, sample links, acquisition metadata, reader version |
| Selection | ID/version, source dataset/version, selection kind, definition, coordinate space, transform reference, optional membership artifact |
| OutputArtifact | ID, producing run, stable output name, type, schema, units, hash, storage reference, source relationships |
| ViewSpec | ID, schema version, renderer type, artifact references, field bindings, display options, control/selection bindings |

A revision defines the method and admissible inputs. A run freezes the specific input versions and parameter values. Editing a script never changes an existing run.

Outputs are addressed by producing run ID and output name. An input referring to “latest result” must resolve to an immutable artifact before execution. Later upstream runs do not silently alter downstream results; offer an explicit rerun with updated inputs.

Persist run state durably before starting the worker. Stage outputs until completion and validation, then commit artifacts and the successful manifest atomically. Graph publication should be idempotent, using the run ID as a deduplication key; retry through an outbox if the graph service is unavailable.

## 6. Dataset abstraction and readers

Do not force every instrument into a flat table. A dataset may expose multiple related representations.

| Kind | Examples | Required semantics |
| --- | --- | --- |
| Observation table | Cytometry events, cell measurements, NanoDrop results | Stable row identity, column types, units, sample membership |
| Signal | GC/LC trace, spectrum | Ordered axis, axis units, intensity units, acquisition context |
| Signal collection | qPCR curves, plate kinetics | Individual signal IDs plus sample/well/channel relationships |
| Spatial array | Plate measurement grid | Well coordinates, plate geometry, sample/treatment links |
| Multidimensional acquisition | LC-MS scans | Scan identity, retention time, m/z and intensity arrays; allow ragged scans |
| Image and objects | Cell counter data | Image coordinates, object IDs, segmentation/mask relationships |

Readers must preserve original files, expose metadata, report unsupported features, and record preprocessing they perform. Never infer that values are raw merely from a library's field name. Preserve compensation, gain scaling, baseline correction, and display transformation history where available.

Stable source row identity should include dataset version and original row index or native ID. Filtering and downsampling must preserve that mapping. Derived aggregates receive new IDs and lineage references.

Initial imports: FCS plus documented tabular exports for chromatography and plate readers. Vendor-native formats require fixtures and dedicated verification before being marked supported. Import failure must explain the unsupported format or missing metadata rather than inventing axes or units.

Cross-instrument joins use resolved sample/well identifiers, not filename similarity. Ambiguous identity requires user mapping.

## 7. Python SDK contract

The proposed package name is `computable_lab_analysis`. This API is a design contract to implement, not an existing installed package.

An analysis exports `run(ctx)`. The runner imports the entry module and calls it once in a fresh interpreter. Inputs and parameters are supplied by the runner; scripts must not depend on previous executions.

Required SDK responsibilities:

- `ctx.input(name)`: return an authorized dataset handle with metadata and documented read methods.
- `ctx.parameters`: immutable validated parameter mapping for this run.
- `ctx.selection(name)`: resolve a frozen selection, if declared.
- `ctx.publish(name, data, ...)`: persist a named dataset/artifact with schema and units; return an artifact handle.
- `ctx.view(...)`: append a validated view specification referencing artifacts.
- `ctx.metric(...)`: publish a scalar with units and explanatory label.
- `ctx.figure(...)`: save an approved static image representation.
- `ctx.log(...)` and `ctx.progress(...)`: emit bounded execution messages.

Python may import supported scientific libraries and bundled helper modules. Scientific algorithms are ordinary Python functions. The SDK does not dictate algorithms.

### Illustrative complete method

```python
import numpy as np


def run(ctx):
    trace = ctx.input("trace").read_signal()
    x = trace.axis
    y = trace.values
    low, high = ctx.parameters["integration_window"]
    chosen = (x >= low) & (x <= high)

    if np.count_nonzero(chosen) < 2:
        raise ValueError("Select an interval containing at least two points.")
    if not np.all(np.diff(x) > 0):
        raise ValueError("Integration requires a strictly increasing axis.")
    if not np.all(np.isfinite(y[chosen])):
        raise ValueError("The selected interval contains non-finite values.")

    area = float(np.trapezoid(y[chosen], x[chosen]))
    curve = ctx.publish("trace_display", trace, kind="signal")
    results = ctx.publish(
        "peak_results",
        [{"start": low, "end": high, "area": area}],
        kind="table",
        units={"start": trace.axis_unit,
               "end": trace.axis_unit,
               "area": f"{trace.value_unit}*{trace.axis_unit}"},
    )
    ctx.view("trace", "signal", artifact=curve,
             selection_parameter="integration_window")
    ctx.view("results", "table", artifact=results)
```

This example integrates acquired points inside an interval without baseline subtraction or boundary interpolation. Those choices must be stated in its method notes. It illustrates the interface, not a validated chromatography method. The environment must pin a NumPy version supporting the function used.

Input contracts and parameter schemas live beside the script in the revision manifest. They must be available before execution so the UI can render controls without running arbitrary Python. Schema changes invalidate incompatible saved parameters and require explicit migration or re-entry.

## 8. Python-to-React output protocol

Workers emit a versioned JSON output manifest containing artifact descriptors and view specifications. Large arrays are transferred through authorized artifact endpoints, not embedded in JSON manifests or model prompts.

Required initial renderer types: table, signal, scatter2d, scatter3d, heatmap/plate map, image, metric, static figure, and downloadable artifact. A static figure fallback supports Python visualizations without a custom React component.

Each view specifies stable IDs, artifact IDs, field/axis bindings, labels/units, presentation configuration, and optional parameter or selection bindings. Define schemas as discriminated unions keyed by renderer type. Reject unknown required fields/types with a visible compatibility error. Generate TypeScript bindings from the canonical schemas where feasible.

Only shipped React renderers execute. Labels are plain text; no arbitrary HTML, JavaScript callbacks, remote resources, or executable plot payloads. Binary data and images require approved formats. Never deserialize arbitrary Python pickle files in the API or browser.

The API supports paging tables, requesting signal windows, and retrieving reproducible plot samples. Rendering may use sampled or aggregated data, but must disclose displayed versus total counts. Analysis inputs remain full resolution unless explicitly configured otherwise.

## 9. Parameters and selections

Supported parameters: number, integer, Boolean, text, enum, column/channel reference, interval, and declared structured objects. Validate bounds, required fields, units where applicable, and compatibility with the selected dataset.

Supported selection types: row IDs, well IDs, axis intervals, 2D polygons, and named population references. Images and 3D volume selections are extension points.

A selection records its exact source dataset version, axes, units, transforms, parent selection, and geometry or membership definition. A polygon gate is evaluated against all source observations in the specified transformed coordinate system. Lassoing a sampled plot must not silently produce a population consisting only of displayed points.

Membership-only selections and reusable geometric gates are distinct. Explicitly label which was created. Preserve membership as a compact artifact where large. Export maintains the mapping back to original rows.

For v0.1, use linked 2D gates with a rotatable 3D view. Screen-projected 3D lasso is deferred until depth and occlusion semantics are specified and tested. A 3D scatterplot and a binned 3D density representation are different view types.

Selections produce new run inputs when changed; they do not mutate the input acquisition. Prevent feedback loops by treating view events as requests to update draft parameters, never as direct script callbacks.

## 10. AI development workflow

Expose narrow local tools for inspecting authorized dataset descriptors, obtaining bounded summaries/previews, searching local SDK/library examples, reading and editing drafts, submitting development runs, reading logs, and inspecting outputs.

The model writes scripts and schemas directly; a planner-specific operation language is not required. The application validates scripts for syntax and manifests for schema compatibility before execution. Validation does not establish safety or scientific correctness; worker isolation and numerical checks remain necessary.

The model may run temporary experiments or tests during development. These are development attempts, not user-facing notebook cells. Retain the code revision and logs of attempts associated with an analysis. Bound repair loops by configurable attempt and time budgets; surface unresolved errors when exhausted.

Context should prioritize metadata, units, shapes, local examples, and bounded summaries. Full numerical datasets stay in the analysis worker. Never invent missing channel identities, sample assignments, calibration factors, or units. Ask for the particular missing information when it changes the method.

Each revision includes short method notes: algorithm, preprocessing, parameter meaning, assumptions, exclusions, and known limitations. Show material method changes alongside code diffs. Manual edits and AI edits create the same kind of revision.

Local model selection is a deployment decision. Evaluate it on actual generation and repair tasks; architecture must not assume a particular model's reliability from parameter count alone.

## 11. Execution, isolation, and lifecycle

Run states: queued, running, succeeded, failed, cancelled, and timed_out. Record transitions with timestamps. Queue submission uses an idempotency token. Cancellation terminates the worker and child processes after a bounded grace period and prevents output publication.

Each run uses a fresh, non-root isolated worker with read-only mounts for resolved inputs and a dedicated writable scratch/output directory. Workers receive no host secrets, no container-engine socket, no unrestricted host filesystem, and no outbound network. Restrict CPU, memory, process count, execution time, and output bytes through the execution platform. A Python subprocess alone is not an isolation boundary.

Library imports come from pinned, locally available environments. Scripts cannot install packages during execution. Environment installation is a separate controlled deployment operation. Record the environment digest, package lock, Python version, SDK version, OS/architecture, and accelerator details when relevant.

The supervisor owns run state and artifact commitment. A worker crash, host restart, or malformed output becomes a failed/interrupted execution with diagnostics; do not display partially written data as a successful result. Preserve the previous successful run.

Enforce project permissions on inputs, outputs, code, logs, and derived datasets. Derived outputs must not become more broadly accessible merely because they were generated by a script. The AI's tool access obeys the initiating user's authorization.

## 12. API outline

These are logical endpoints; adapt paths to existing repository conventions.

| Method and route | Purpose |
| --- | --- |
| POST /analyses | Create analysis |
| GET /analyses/{id} | Retrieve metadata and revision/run references |
| POST /analyses/{id}/revisions | Create immutable revision; use expected-parent guard |
| GET /analysis-revisions/{id} | Retrieve script, schemas, environment, notes |
| POST /analysis-runs | Submit revision, bindings, parameters, selection versions, idempotency key |
| GET /analysis-runs/{id} | Status and committed output manifest |
| GET /analysis-runs/{id}/events | Stream progress, state, and bounded logs |
| POST /analysis-runs/{id}/cancel | Idempotent cancellation request |
| GET /analysis-artifacts/{id} | Authorized metadata or typed data retrieval |
| POST /analysis-selections | Persist versioned selection definition |
| GET /analysis-runs/{id}/bundle | Download reproducibility bundle |

Use optimistic concurrency for revision edits. Every result response carries run ID and revision ID. The UI binds its displayed state to the explicitly selected run; completion of an older request must never overwrite a newer selected result.

## 13. Provenance and export

Graph relationships connect a run to its method revision, input datasets, samples/wells, selections, initiator, and derived outputs. Use existing graph/compiler mechanisms after inspecting repository schemas. Keep numerical arrays, images, membership masks, and full logs in artifact storage.

Record script and helper hashes, input hashes, parameters, environment identity, seeds, method notes, and outputs. Reproducing a method does not guarantee bitwise equality across all numerical hardware; define numerical tolerances for validation fixtures and document nondeterministic methods.

Provide both plain Python download and a ZIP reproducibility bundle containing:

- Entry script and required helper modules.
- Revision manifest and parameter schema.
- Run parameters, input manifest with hashes, and selection definitions/membership files.
- Dependency lock and environment identity.
- README with a headless replay command and data placement instructions.
- Optional source data and outputs when requested and authorized.

Proposed replay interface: `python -m computable_lab_analysis run ./bundle --inputs ./data --output ./replay`. The SDK/runner must be installable and versioned; exported scripts must not rely on undocumented application services. A script-only download must clearly disclose that its SDK, dependencies, and input data are still required.

## 14. Initial implementation slices

### Slice A: execution and rendering

Implement analysis/revision/run records, a local isolated worker, SDK, manifests, signal/table/static figure renderers, explicit Run/Cancel, script editing/download, and immutable history. Demonstrate a manually authored script before adding AI generation.

### Slice B: chromatography

Import a documented time/intensity CSV, plot a trace, select an integration window, calculate area with stated baseline/boundary behavior, publish a peak table, export, and replay. Introduce native GC files only after validating a reader against known runs.

### Slice C: cytometry

Import FCS, inspect channel metadata, explicitly configure compensation/transforms, plot linked 2D/3D views, gate all events, publish a named population, and export filtered data while preserving raw/processed semantics.

### Slice D: plate-reader analysis

Import measurements with well/sample/control mappings, display a plate map, fit a specified standard-curve method, report diagnostics, and calculate concentrations with units. Invalid standards and extrapolated results receive visible flags.

### Slice E: AI authoring

Add local generation, repair, code diffs, and method notes over the already functioning execution protocol. The generated scripts must pass the same contracts as manually authored scripts.

These slices validate shared infrastructure. LC-MS, qPCR, cell counter, and NanoDrop adapters then add appropriate readers and example analyses. Do not advertise validated method support solely because generic CSV import works.

## 15. Acceptance criteria

| ID | Required evidence |
| --- | --- |
| A01 | A user creates an analysis from a prompt and obtains functioning controls and outputs without writing code. |
| A02 | Downloaded script plus bundle executes through the documented runner without the React application. |
| A03 | Rerunning from a fresh worker reproduces expected fixture results within declared tolerances. |
| A04 | Zoom/rotate/hover produces no AI calls or scientific reruns; a parameter change makes result staleness visible. |
| A05 | A geometric gate drawn over a sampled plot selects the correct full-dataset population with stable IDs. |
| A06 | A published population or trace becomes an input to another analysis without download/re-upload. |
| A07 | Editing code or upstream results cannot change a prior run or downstream frozen inputs. |
| A08 | GC integration matches a fixture with known area and explicitly stated endpoint/baseline conventions. |
| A09 | FCS round-trip preserves the intended selected events and documents compensation/transformation metadata. |
| A10 | Plate-reader concentration results match a known calibration fixture and flag invalid/extrapolated cases. |
| A11 | An infinite loop, excess allocation, child process, and cancelled run are contained; unrelated application work remains available. |
| A12 | Attempts to read unrelated files, access host secrets, or send data externally are blocked by execution controls. |
| A13 | Concurrent edits detect conflicts; out-of-order run completion cannot replace the selected result. |
| A14 | Malformed view manifests and executable HTML/JS payloads are rejected without compromising the frontend. |
| A15 | Full workflow succeeds with internet access disabled and dependencies/model already installed locally. |
| A16 | Every committed output resolves to its exact script revision, input versions, parameters, and environment. |

Use representative real instrument fixtures plus synthetic numerical fixtures. Measure preview latency, peak memory, run duration, cancellation time, and local-model success/repair rate on a declared appliance configuration. Establish budgets from those measurements; do not promise instrument-independent performance without data.

## 16. Implementation decisions to resolve from the repository

Before coding, inspect frontend framework/version, backend language, authentication and project permissions, dataset storage, graph schemas/compiler, job infrastructure, deployment hardware, and current import code. Reuse these interfaces where practical.

Specific open decisions: artifact encoding per data kind; isolation runtime on supported hosts; first local model and context budget; pinned scientific environment; initial native file readers; and exact graph event/schema names. These decisions must preserve the script-based method, explicit run inputs, local execution, immutable provenance, and fixed frontend renderer boundary defined above.

## 17. Reference starting points

These are implementation references, not evidence that the proposed Computable Lab SDK exists.

- [FastAPI features and OpenAPI integration](https://fastapi.tiangolo.com/features/)
- [FlowKit Sample interface and preprocessing semantics](https://flowkit.readthedocs.io/en/latest/sample.html)
- [FlowKit gating strategy tutorial](https://flowkit.readthedocs.io/en/latest/notebooks/flowkit-tutorial-part03-gating-strategy-and-gating-results-classes.html)
- [Plotly.js charts](https://plotly.com/javascript/)
- [Plotly 3D selection feature request](https://github.com/plotly/plotly.js/issues/3511)

The references were reviewed during the preceding design discussion. Verify package versions and API compatibility when pinning the implementation environment.

