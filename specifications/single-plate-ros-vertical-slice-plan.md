# Single-Plate ROS Read Vertical Slice Implementation Plan

Status: Draft
Date: 2026-05-24
Related: `specifications/lab-appliance-ui-plan.md`, `specifications/material-identity-and-resolution.md`, `docs/cl-appliance-plr-bridge.md`

## 1. Summary

Implement the first true CL vertical slice as an integration over existing infrastructure, not a rebuild.

The target workflow is:

1. The user starts in the single-plate editor.
2. The user adds semantically backed materials to wells using existing local-first material resolution.
3. The user asserts that a set of wells containing HepG2 cells, growth medium, and a complex I blocker is a ROS positive-control context.
4. The user binds that assertion to a plate-reader fluorescence readout such as CellROX Deep Red, Ex/Em 644/665.
5. The user writes the protocol/rationale in TapTab while the zoomed single-plate view stays onscreen.
6. The user clicks `Read plate`.
7. The app executes the existing Gemini active-read path.
8. Parsed measurement results become evidence supporting the assertion.

The main missing work is orchestration inside the focused single-plate view and post-read evidence publication. Material identity, material search, formulation creation, material-instance creation, slash mentions, semantics records, TapTab, and Gemini active reads already exist in partial or reusable form.

## 2. Phase 1: Preserve Material Identity In Event Editor

Current gap: event-editor add-material actions flatten material selections to `material_ref: string`, which can lose whether the user selected a material concept, material spec/formulation, material instance, aliquot, or vendor product.

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

## 3. Phase 2: Reuse Existing Material Search And Creation

Current gap: the older editor has a richer local-first material picker, while the event-editor has a newer add-material modal. The vertical slice should not introduce a third material picker.

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

## 4. Phase 3: Add Single-Plate Workflow Rail

Current gap: the zoomed single-plate view supports well interaction and material placement, but it does not yet compose the full vertical-slice workflow.

Implement a right rail inside the focused single-plate view with these sections:

- `Materials`: add existing or newly created semantically backed materials to selected wells without leaving focus view.
- `Knowledge`: create the ROS positive-control context/assertion for selected wells.
- `Readout`: bind the assertion to a plate-reader fluorescence readout, defaulting to CellROX Deep Red-style Ex/Em 644/665.
- `Protocol`: embed TapTab for the protocol/writeup/narrative anchor while the plate remains onscreen.

Acceptance tests:

- User can complete materials -> knowledge -> readout -> protocol without returning to deck view.
- Rail state survives well selection changes and focus-view interactions.
- The plate remains visible and usable while the rail is open.

## 5. Phase 4: Semantic Record Orchestration

Current gap: existing semantics APIs can generate measurement contexts, well groups, role assignments, and generic generated knowledge records, but this slice needs an explicit scientific assertion.

Implement:

- Use existing semantics APIs for `measurement-context`, `well-group`, and `well-role-assignment` where they fit.
- Add a targeted ROS positive-control orchestration helper if needed to create the exact `context`, `claim`, and `assertion` rather than only generic role-assignment text.
- Persist draft records before read so measurement results attach to stable semantic anchors.
- Store the TapTab protocol/writeup as an `experiment-narrative` entry or compatible protocol/narrative record linked to the claim/assertion.

Acceptance tests:

- Generated records validate against schemas.
- Assertion explicitly represents the scientist's claim, not only a generic role assignment.
- Narrative links to the claim/assertion and planned read.

## 6. Phase 5: Read Plate Modal And Gemini Execution

Current gap: the Gemini execution endpoint exists, but the single-plate editor does not construct and execute the read job from focused plate state.

Implement:

- Add `Read plate` to the focused single-plate header.
- Add a read configuration modal showing:
  - full-plate v1 read scope,
  - assigned/readout-linked wells,
  - selected fluorescence channel(s),
  - Gemini EM instrument,
  - live/simulated execution mode,
  - required confirmation state.
- Construct an existing Gemini `instrument-appliance-job`.
- Call `/measurements/appliance-jobs/execute`.
- For v1, execute full-plate fluorescence reads. Do not implement hardware rectangular block reads in this slice.

Acceptance tests:

- Missing readout or missing knowledge blocks execution with clear UI state.
- Simulated Gemini read returns a measurement.
- Live read requires explicit confirmation.

## 7. Phase 6: Post-Read Evidence Publication

Current gap: Gemini reads are ingested as measurements, but the completed measurement is not yet published as evidence for the user-authored assertion.

Implement:

- After measurement ingest succeeds, create an evidence record linking:
  - measurement result,
  - raw CSV artifact,
  - read event/event graph,
  - measurement context,
  - ROS positive-control context/assertion.
- Update or create assertion evidence refs so the knowledge layer reflects the completed read.
- Surface completion in the rail:
  - measurement ID,
  - raw data path,
  - evidence ID,
  - assertion support status.

Acceptance tests:

- Evidence record supports the intended assertion.
- Measurement is linked to labware, read event, instrument, and measurement context.
- Re-running a read creates a new measurement/evidence bundle without overwriting prior evidence.

## 8. Implementation Assumptions

- Full-plate read is accepted for v1; rectangular hardware reads are deferred.
- Existing material, formulation, material-instance, TapTab, slash-menu, semantics, and Gemini execution infrastructure should be reused.
- No new top-level scientific schema family should be introduced unless implementation exposes a concrete schema gap.
- The primary new value is orchestration inside the single-plate focus view and post-read evidence linkage.

