# Single-Plate ROS Read Vertical Slice Implementation Plan

Status: Draft (Phases 1–3 landed; Phase 4 reframed around the canonical knowledge model)
Date: 2026-05-24 (revised after knowledge-model alignment)
Related: `specifications/lab-appliance-ui-plan.md`, `specifications/material-identity-and-resolution.md`, `docs/cl-appliance-plr-bridge.md`, `docs/knowledge-layer-canonical-example.md`

## 1. Summary

Implement the first true CL vertical slice as an integration over existing infrastructure, not a rebuild.

ROS is the surface example. The substance is the knowledge layer: a plate sets the *biological context* for a scientist's *assertions* about *globally reusable claims*; a plate read produces *evidence* that supports or refutes those assertions in that context. The PPARα → ROS via β-oxidation–driven NADH reductive stress experiment in `docs/knowledge-layer-canonical-example.md` is the worked canonical reference; this vertical slice has to handle that shape (many assertions per plate, multiple channels, a mechanism-model wrapping atomic claims), not only the simpler ROS positive-control case the headline implies.

The target workflow is:

1. The user starts in the single-plate editor.
2. The user adds semantically backed materials to wells using existing local-first material resolution.
3. The user picks (or composes) a `mechanism-model` and authors one or more `assertion` records — each one binding a global `claim` to a set of well-`context` records via a `context-role`, with a predicted outcome direction on a specific readout channel.
4. The user binds the read to one or more plate-reader fluorescence channels (`measurement-context` records, defaulting to CellROX Deep Red Ex/Em 644/665 and optionally NADH autofluorescence Ex/Em 340/460).
5. The user writes the protocol/rationale in TapTab against an `experiment-narrative` record while the zoomed single-plate view stays onscreen.
6. The user clicks `Read plate`.
7. The app executes the existing Gemini active-read path, possibly once per measurement-context.
8. Parsed measurement results become `evidence` records, each `supports`-linking to the relevant assertion and citing the result, context, measurement-context, event-graph, and raw CSV.

The main missing work is orchestration inside the focused single-plate view and post-read evidence publication. Material identity, material search, formulation creation, material-instance creation, slash mentions, semantics records, TapTab, and Gemini active reads already exist in partial or reusable form.

## 2. Phase 1: Preserve Material Identity In Event Editor (LANDED)

Landed in commit `73ec375` (bundled with Phase 2). Event-editor `add_material` events now carry a structured `Ref` and route through `addMaterialRefDetails` to the correct `material_ref` / `material_spec_ref` / `material_instance_ref` / `aliquot_ref` / `vendor_product_ref` field.

Current gap (resolved): event-editor add-material actions flatten material selections to `material_ref: string`, which can lose whether the user selected a material concept, material spec/formulation, material instance, aliquot, or vendor product.

Implement:

- Change event-editor add-material state/actions to carry a structured material-like ref.
- Emit the correct add-material details field:
  - `material_ref` for bare material concepts.
  - `material_spec_ref` for saved formulations/stocks.
  - `material_instance_ref` for prepared materials/cell cultures.
  - `aliquot_ref` for aliquots.
  - `vendor_product_ref` for vendor products.
- Preserve concentration, volume, cell count, composition snapshot, and provenance fields already supported by schemas and server normalization.
- Keep the existing `add_material` event type and existing well-state/event-graph computation path.

Acceptance tests:

- Selecting a saved formulation emits `material_spec_ref`.
- Selecting cells emits `material_instance_ref`.
- Selecting a bare concept emits `material_ref`.
- Existing well-state rendering still shows material additions.

## 3. Phase 2: Reuse Existing Material Search And Creation (LANDED)

Landed in commit `73ec375`. The `/m` slash resolver now queries `apiClient.searchMaterials` + `getFormulationsSummary` and ranks by category (saved-stock → vendor → prepared → biological → concept). Mention types extended for `material-instance` and `vendor-product` on both client and server (token parser + `NounPhraseResolver`).

Current gap (resolved): the older editor has a richer local-first material picker, while the event-editor has a newer add-material modal. The vertical slice should not introduce a third material picker.

Implement:

- Extract or wrap the richer material picker/search behavior so the single-plate workflow uses the established ordering:
  - saved stocks/formulations,
  - vendor reagents,
  - prepared instances,
  - biological derivatives,
  - concept-only records,
  - ontology fallback.
- Keep the existing event-editor builders for compounds, cells, mixtures, and samples.
- Ensure ontology selections create local CL records before use.
- Update `/m` slash resolver to use the material search stack, not only JSON-LD `material` records, so TapTab mentions can reference formulations and instances as well as bare concepts.

Acceptance tests:

- Material search in the single-plate workflow finds saved formulations and prepared cell instances.
- `/m` finds material specs and material instances, not just material concepts.
- Ontology selection still creates local CL records before use.

## 4. Phase 3: Add Single-Plate Workflow Rail (LANDED — Materials / Knowledge / Readout)

Landed in commit `d47fd09`. Rail is mounted inside `LabwareFocus` with three sections (Materials, Knowledge, Readout); Protocol section deferred to Phase 4 where it lands with the experiment-narrative record.

Draft state lives in `EventEditorContext.plateRail`, keyed by `placementId`, and survives selection changes / focus toggles. Cleaned up on `remove_placement`, single-plate-slot displacement, and `set_platform`.

**Phase 3 used a placeholder shape for Knowledge.** It modeled a single `KnowledgeDraft` with flat `contextLabel` / `claimText` / `role` / `wells` fields. The canonical model (`docs/knowledge-layer-canonical-example.md`) requires a richer shape: many assertions per plate, each binding a `claim_ref` to one or more `context_refs` via `context-role` bindings with a predicted outcome direction. Phase 4 retires the placeholder and replaces it with `assertions: AssertionDraft[]` (see §5).

Original acceptance tests (still valid for the rail mechanics):

- User can complete materials → knowledge → readout without returning to deck view.
- Rail state survives well selection changes and focus-view interactions.
- The plate remains visible and usable while the rail is open.

## 5. Phase 4: Knowledge-Layer Orchestration

This phase ships the orchestration that anchors a plate to the canonical knowledge model in `docs/knowledge-layer-canonical-example.md`. The Phase 3 rail's Knowledge section is a placeholder; this phase replaces it with explicit assertion authoring driven by a mechanism-model and atomic claims, and lands the Protocol section against an `experiment-narrative` record.

Current gap: the rail has placeholder `KnowledgeDraft` state, the server's `createWellRoleAssignment` only auto-generates generic claim/assertion text, the `mechanism-model` schema doesn't yet exist, `context-role` requires non-empty prerequisites, and a NADH readout-definition isn't seeded.

### Schema work

- **Add** `schema/knowledge/mechanism-model.schema.yaml` (+ `.lint.yaml`, `.ui.yaml`). Shape per canonical example: `nodes[]` (typed local-id graph), `edges[]` (each edge has local `id` + `claim_ref` + `subject`/`object` referencing node ids), `interventions[]` (`material_ref` + either `blocks_edge` or `modulates_node` + `expected_effect`). Edge predicate lives on the referenced claim (single source of truth).
- **Relax** `schema/knowledge/context-role.schema.yaml` to allow empty `prerequisites` (drop `minItems: 1`). Enables hybrid pattern: well-known roles carry machine-checkable prereqs, ad-hoc roles ship with `prerequisites: []`.
- **Add (optionally)** lint rules for the prerequisites DSL (`has_material`, `any`, `all`, `has_expected_effect`, `has_material_role`). Free-object today; tighten as the verification engine grows.

### Seed records

- `RDEF-PLATE-NADH-AF` (NADH autofluorescence, Ex 340/Em 460). Append to `INSTDEF-GENERIC-PLATE_READER.supported_readout_def_refs`.
- Six `context-role` records (`CR-vehicle-baseline`, `CR-test-perturbation`, `CR-ros-positive-control`, `CR-ros-negative-control`, `CR-nadh-rs-positive-control`, `CR-nadh-rs-negative-control`) with prerequisites where known.
- Starter atomic claims from the canonical example (`CLM-ppar-causes-bo`, `CLM-bo-causes-nadh-rs`, `CLM-nadh-rs-causes-ros`, `CLM-bhb-causes-nadh-rs`, `CLM-acac-causes-nadh-os`, `CLM-rot-positive-for-ros`, `CLM-fccp-negative-for-ros`) so a fresh demo has something to pick from.
- `MECH-PPARA-ROS-001` mechanism-model record.

### Server

- Generic `POST /records` already handles `claim`, `assertion`, `evidence`, `context`, `context-role`, `well-group`, and (after the schema lands) `mechanism-model` writes. Keep `createMeasurementContext` and `createWellGroup` as ergonomic shortcuts.
- The existing `createWellRoleAssignment` auto-claim/assertion path is no longer the orchestration entry point. Keep the endpoint for the measurement-context-scoped role binding (it remains how rotenone is tagged as positive control *in this measurement context*), but stop relying on its auto-generation of generic knowledge records. Replace with explicit assertion authoring through the rail.

### App-side rail (Phase 3 → Phase 4 transition)

- **Retire** Phase 3's `KnowledgeDraft` (single shape) from `EventEditorContext.plateRail`. Replace with `assertions: AssertionDraft[]` per placement. Each draft holds the inputs for one `assertion` record.
- **New rail section: Hypothesis**, above Knowledge: pick or compose a `mechanism-model`. When selected, surface the mechanism's nodes/edges/interventions and offer "Add assertion for edge X" shortcuts that pre-fill `claim_ref` from the edge.
- **Knowledge section** becomes an *assertion list* — N entries per plate. Each entry exposes: claim picker (search existing or compose new via subject/predicate/object), scope selector (`single_context` / `comparison` / `series` / `global`), context anchors (anchor wells → derive context), context-role bindings (one per anchored context), outcome predictor (`direction`, `measure`, `layer: model_derived`, `confidence`).
- **Protocol section** (deferred from Phase 3): create / select an `experiment-narrative` record whose `primaryClaimIds` are the claims under test; render TapTab in prose mode against the narrative's prose body. `entries[]` reference the mechanism-model, assertions, and the planned read.
- **Pre-read validation flags**: missing channel controls (no `CR-ros-positive-control` assertion bound to `MCTX-cellrox`), unbalanced comparisons (scope=comparison with only one context anchored), ungrounded claim refs (claim id doesn't resolve), assertions whose anchored context contents fail the bound context-role's prerequisites.

### Acceptance tests

- All authored records (`claim`, `context`, `context-role`, `measurement-context`, `well-group`, `assertion`, `mechanism-model`, `experiment-narrative`) validate against the schemas via Ajv.
- The rail can author multiple assertions on one plate, against multiple claims (the canonical PPARα/ROS experiment yields ≥6 assertions across two channels).
- An assertion's `claim_ref` matches a mechanism-model edge's `claim_ref` when the user adds the assertion from the Hypothesis section's "Add assertion for edge X" shortcut.
- Authoring a well-known control role (e.g. `CR-ros-positive-control`) on a context whose `contents[]` contains the expected material (rotenone) passes prerequisite verification; authoring it on `CTX-normal` fails verification with a clear UI flag.
- The narrative record's `primaryClaimIds` and `entries[]` cleanly reference the assertions, mechanism-model, and planned read.
- Re-opening the focused plate restores the assertion list, mechanism-model selection, and narrative draft from `EventEditorContext.plateRail`.

## 6. Phase 5: Read Plate Modal And Gemini Execution

Current gap: the Gemini execution endpoint exists, but the single-plate editor does not construct and execute the read job from focused plate state.

Implement:

- Add `Read plate` to the focused single-plate header.
- Add a read configuration modal showing:
  - full-plate v1 read scope,
  - the plate's `measurement-context` records (one per channel) — CellROX and NADH for the canonical example,
  - which assertions each measurement-context is bound to (via shared context anchors / channel),
  - Gemini EM instrument,
  - live/simulated execution mode,
  - required confirmation state.
- For each `measurement-context` selected for execution, construct a Gemini `instrument-appliance-job` and call `/measurements/appliance-jobs/execute`. Reads may chain (one job per channel) but the modal treats them as a single user action.
- Pre-flight checks (from Phase 4): block execution if a measurement-context has no `CR-*-positive-control` / `CR-*-negative-control` assertions anchored on the plate, or if any selected assertion has unresolved refs.
- For v1, execute full-plate fluorescence reads. Do not implement hardware rectangular block reads in this slice.

Acceptance tests:

- Missing readout or missing knowledge (no anchored assertions) blocks execution with clear UI state.
- Each `measurement-context` selected for execution maps to exactly one Gemini job; multi-channel reads execute as N jobs in sequence and surface progress per channel.
- Simulated Gemini read returns a measurement per executed job.
- Live read requires explicit confirmation.

## 7. Phase 6: Post-Read Evidence Publication

Current gap: Gemini reads are ingested as measurements, but the completed measurements are not yet published as evidence for the user-authored assertions.

Implement:

- After each measurement-context's ingest succeeds, create **one `evidence` record per anchored assertion**, not one per plate. Each evidence record `supports[]` lists the relevant assertion(s) and cites in `sources[]`:
  - the measurement result(s) for the assertion's anchored contexts,
  - the `context` records,
  - the `measurement-context` record,
  - the `event-graph` record that produced the contexts,
  - the raw CSV artifact (`type: file`).
- For `scope: comparison` assertions, the evidence bundle's `quality{}` carries computed effect-size, significance, and direction (e.g. `fold_change`, `mean_difference`, `p_value`, `method`), so the realized effect is recorded independently of the assertion's predicted `outcome`. The assertion itself is not mutated — the same record carries the prediction across the read; only `evidence_refs` is appended.
- For control assertions (`CR-*-positive-control` / `CR-*-negative-control`), compute and store channel pos/neg control statistics (e.g. z-prime) in `evidence.quality.channel_pos_neg_control_zprime`. These bundles gate the validity of the rest of the plate's evidence.
- Append evidence refs to each assertion's `evidence_refs[]` so the knowledge layer reflects the completed read.
- Update the experiment-narrative `entries[]` with timeline entries pointing at the new evidence bundles (`role: result`).
- Surface completion in the rail, per assertion:
  - evidence ID,
  - measurement ID(s),
  - raw data path,
  - realized direction vs predicted direction (match / contradict / inconclusive),
  - pos/neg control status (passed / failed) for the channel.

Acceptance tests:

- Each authored assertion receives a corresponding evidence record after the read.
- Evidence records validate against the schema; `sources[]` cite at minimum a `result`, the relevant `context` records, the `measurement-context`, and the raw CSV `file`.
- For comparison assertions, `evidence.quality` carries computed effect-size and significance.
- For control assertions, `evidence.quality` carries channel pos/neg control statistics; the rail flags the channel as invalidated if pos/neg control evidence fails its expected direction.
- Assertion `evidence_refs[]` are appended (not overwritten); re-running the read creates new evidence records without mutating existing ones.
- The experiment-narrative reflects the completed read with new timeline entries pointing at the evidence bundles.

## 8. Implementation Assumptions

- Full-plate read is accepted for v1; rectangular hardware reads are deferred.
- Existing material, formulation, material-instance, TapTab, slash-menu, semantics, and Gemini execution infrastructure should be reused.
- One new top-level scientific schema is introduced — `mechanism-model` — to satisfy a concrete gap surfaced by the canonical knowledge example (assembling atomic claims into a queryable causal chain with interventions). Atomic claims stay primary and reusable; mechanism-model is a lightweight wrapper. The shape is in `docs/knowledge-layer-canonical-example.md`. No other new top-level families.
- One existing schema is relaxed: `context-role.schema.yaml` allows empty `prerequisites` (hybrid pattern from `docs/knowledge-layer-canonical-example.md`).
- The primary new value is (a) orchestration inside the single-plate focus view that honors the canonical knowledge model — many assertions per plate, mechanism-model–driven authoring, multi-channel reads — and (b) post-read evidence linkage where every assertion receives its own evidence bundle with realized effect / significance / control statistics.
- The PPARα → ROS via β-ox-driven NADH reductive stress example in `docs/knowledge-layer-canonical-example.md` is the gold standard the demo must support end-to-end (≥6 assertions, 2 channels, blockability inference). Simpler one-assertion ROS demos are a subset.

