# Cells as a Biological Type: Count-Based Plating + Cell Transfer Workflow

Date: 2026-09-04 · Branch: main · Mode: plan (no implementation this turn)

## Goal

Make cell plating correct at the biological level: when a scientist adds cells to a
well, the system captures **cell COUNT (cells/well)** and **final volume** — not a
bare "volume of cells" — and supports a reusable **cell-transfer protocol**
(release→count→plate→top-up) per biological type.

## Answers to Brad's questions

### Q1 — "did it know to ask species/tissue because we have a 'cell line' type?"
**Partly yes, partly accidental.** Findings (traced):
- There IS a `cell_line` domain: `MaterialDomain` (`app/src/types/material.ts:7`),
  `material.schema.yaml` `domain` enum (`cell_line, chemical, media, reagent, organism,
  sample, other`), and `NAMESPACE_DOMAIN_MAP` maps `CL → cell_line`, `NCBITaxon →
  organism`, `UBERON → sample`.
- **But** the domain/type is NOT propagated to the AddMaterial form. `resolveCandidateToRef`
  (`app/src/shared/api/resolveUtil.ts`) returns only `{kind,id,namespace,label,uri}` —
  it drops `domain`. So AddMaterialForm has NO knowledge the material is a cell line.
- What actually collected species+tissue: the **ontology modal** (the resolution layer),
  not the material type. `material_source_requirement.source_details` already carries
  `ncbi_taxon_ref` + `uberon_tissue_ref` (schema `plate-event.add-material.schema.yaml:86-89`),
  and `ontology/domains.ts` + `pickerConfig.ts` define species(NCBI)/tissue(Uberon) pickers.
  So species/tissue were captured because the USER picked ontology terms in the modal,
  persisted as `class[]` refs on the material — not because the app structurally knew
  "this is a cell line, ask for species+tissue." The `domain: cell_line` field sat unused
  for driving the form.

### Q2 — the "doozy": cells need count, not (only) volume.
Current model: `AddMaterialDetails` has `count?: number` AND `volume?: {value,unit}`
(`app/src/types/events.ts:137,141`). The schema `plate-event.add-material.schema.yaml` has
both `volume` (object) and `count` (number). UI: `AddMaterialForm` shows a **Cell Count**
input when `hasCellComposition` (`role === 'cells'`) but it's optional and buried under
"Overrides & Notes"; the primary ask is always **volume**. So today adding HepaRG to a well
blinds the user for "volume of cells" — wrong for a count-based cell suspension.

**What already exists (good news):**
- `count_per_volume` is a first-class concentration basis: `cells/mL`, `cells/uL`
  (`concentration.schema.yaml`, `app/src/types/material.ts:140-141`;
  `WorkingConcentrationResolver.test.ts` "mass/activity/count bases work like molar").
- `WellStateTracker` `ComponentAmount` carries "cells" as a base unit and reduces additions.
- `material_source_requirement.source_details` already models `ncbi_taxon_ref`+`uberon_tissue_ref`.
- `BiologicalMaterialBuilderModal` already captures passage, vessel, seeding density, confluence
  as `biological_state` on a `material-instance` (`schema/lab/material-instance.schema.yaml:98-117`).
- Concentration propagation engine + `add_material` `concentration`/`volume` semantics exist.

So the **modeling substrate is already there**; the gap is: (a) the domain/type isn't
propagated to the form, (b) there's no "cells/well = user input + final volume = derived
volume" concept, and (c) no cell-transfer protocol template or per-biological-type unit rule.

## Proposed approach

Introduce a **biological-type-driven quantity semantic** for `add_material`:

1. **Propagate domain.** Have the AddMaterial selection carry `domain` (cell_line etc.) forward
   so the form knows the material is a cell line. (Ref type can gain an optional `domain`, or the
   existing `material_ref`→record lookup can fetch it. Prefer: enrich `ResolveRef`/ref with domain;
   consumers that ignore extra fields are unaffected.)
2. **Count-first UI for cell lines.** When the selected material's `domain === 'cell_line'` (or
   a `biologicalType` says so), `AddMaterialForm`/`EventRibbon` present:
   - **Cells per well** (count) — REQUIRED invariant.
   - **Final volume per well** (µL) — the well's total after top-up.
   - Optionally **counter density** (cells/µL) as a helper that computes the suspension µL.
   - Derived: **suspension volume** (`cells_per_well / counter_density`) and **top-up volume**
     (`final_volume − suspension_vol`), so the event stores volume but count is authoritative.
   - Degree: count AND final volume → volume derivable automatically (volume = final; the
     suspension aliquot is a sub-term). Keep `count` as the invariant; store both.
3. **Schema.** Extend `plate-event.add-material.schema.yaml` with optional
   `cells_per_well?: number`, `final_volume?: {value,unit}`, `counter_density?: Concentration`
   (reuse `count_per_volume`), and a `biologicalType?: `enum`. `count` stays.
4. **Cell-transfer protocol template.** A reusable **universal protocol** "Cell Transfer"
   (release with trypsin/DMEM → count on counter → plate N cells/well → bring final volume up to
   X) modeled as a `protocol` record with steps + a declared `biologicalType`/count requirement.
   This gives Brad the "protocol for cell transfer" he asked for, expressed as data.
5. **Per-biological-type workflow/unit rule.** A small declarative registry (data, per repo rule
   #1: no hardcoded domain logic in TS) mapping biological type → primary quantity + units:
   - `cell_line` → `cells_per_well` (count) + `final_volume`
   - chemical/reagent → existing `working_concentration` / volume
   - (future) organoid, primary → same count-based semantics
   This registry drives which inputs the form requires.

## Step-by-step plan (bite-sized, TDD)

### Phase A — Propagate domain + know it's a cell line (foundation)
**Task A1: Enrich ref/selection with domain.**
- Modify `app/src/shared/api/resolveUtil.ts` `ResolveRef` optional field `domain?`; set it in
  `resolveCandidateToRef` when the candidate carries a domain (infer from namespace via
  `inferDomainFromNamespace`).
- Modify `app/src/types/events.ts` `AddMaterialDetails` optional `material_domain?: MaterialDomain`.
- Modify `app/src/graph/events/forms/AddMaterialForm.tsx` + `EventRibbon.tsx` to stash domain into
  `material_domain` on selection, and export a `isCellLineMaterial(details)` helper.
- Test: `app/src/graph/events/forms/*.test.tsx` — selecting a `CL:...` candidate / `cell_line`
  material sets `material_domain:'cell_line'`.

### Phase B — Count-first form for cell lines
**Decision (Brad, 2026-09-04):** the scientist enters **cells/well (count)** + **final volume
per well**. Counter density is an **optional helper** — when provided it computes the derived
suspension µL and top-up; when absent, the app still captures count + final volume (the
invariants) and leaves suspension µL uncomputed / optional.
**Task B1: Derive count+volume inputs.**
- `app/src/graph/events/forms/AddMaterialForm.tsx`: when `isCellLineMaterial`, show **Cells per
  well** (required) + **Final volume (µL)** (required) + optional **counter density (cells/µL)**.
  When density is provided, compute `suspension_µl = cells_per_well / density` and
  `top_up_µl = final_volume − suspension_µl` (guard density>0, final ≥ suspension). Persist
  `count` = cells_per_well, `volume` = final volume. When density is absent, require cells/well +
  final volume and leave suspension µL blank.
- `EventRibbon` `Compact` form mirrors with a "cells" variant.
- Add a pure helper `app/src/graph/events/forms/cellPlating.ts`:
  `computeCellPlating({cellsPerWell, counterDensity?, finalVolumeUl}) → {suspensionUl?,
  topUpUl?, volume}` unit-tested (density 0 handling, final<suspension warning, density-absent
  → no derived volumes).
- Test: cellPlating.test.ts (math + edge cases) + form test (cell_line shows count-first; chemical
  shows volume-first unchanged).

### Phase C — Schema extensions (additive, optional-only)
**Task C1: event schema.**
- Modify `schema/workflow/events/plate-event.add-material.schema.yaml`: add optional
  `cells_per_well`, `final_volume`, `counter_density`, `biological_type`. All optional + additive
  (`unevaluatedProperties:false` safe; existing records unaffected).
- Test: a cell-plating event validates; a chemical add_material still validates (no new required).

### Phase D — Biological-type registry (declarative, data-driven)
**Task D1: type→unit rule registry.**
- Add a declarative spec, e.g. `schema/registry/biological-types/biological-types.yaml` mapping
  `cell_line` → `{ primaryQuantity: cells_per_well, required: [cellsPerWell, finalVolume],
  units: { volume: uL }, allowCounterDensity: true }`; chemical → existing.
- Loader + lookup `server/src/ontology/biologicalTypes.ts` (or frontend constant if UI-only).
- Test: loader returns the rule; unknown type falls back to chemical semantics.

### Phase E — Cell-transfer protocol template
**Task E1: seed the universal "Cell Transfer" protocol record.**
- Add a `protocol` record (universal layer) "Cell Transfer": steps release(trypsin/DMEM) →
  count → plate N cells/well (declare `count` requirement) → bring final volume to X; `tags:
  ['biological', 'cell-transfer']`; `biologicalType: cell_line`.
- Store under `records/protocol/` or an ingest path; ensure it appears in the Protocol selector
  (lab-wide, no links).
- Test: record passes protocol schema; appears in `GET /api/protocol-context` availableProtocols.

### Phase F — Verify + wire
- Full `app` + `server` typecheck; run `app vitest` for forms/events + `server vitest` for
  schema + registry + protocol.
- Live-browser pass (SOUL rule): add HepaRG to a well range — form asks cells/well + final
  volume (not blind volume); count flows into the event; a chemical still asks volume.
- Verify the Cell Transfer protocol is selectable and its count semantics round-trip.

## Files likely to change
- `app/src/shared/api/resolveUtil.ts` (domain on ref)
- `app/src/graph/events/forms/AddMaterialForm.tsx`, `graph/events/ribbon/EventRibbon.tsx`
- `app/src/types/events.ts` (`AddMaterialDetails.material_domain`/cells fields)
- `app/src/types/material.ts` (helpers, unit list already has cells/mL/uL)
- `app/src/graph/events/forms/cellPlating.ts` (new pure math)
- `schema/workflow/events/plate-event.add-material.schema.yaml`
- `schema/registry/biological-types/biological-types.yaml` (new)
- `server/src/ontology/biologicalTypes.ts` (loader, if server-side needed)
- `records/protocol/<cell-transfer>.yaml` (or an ingest seed)
- Tests colocated with each.

## Risks / tradeoffs / open questions
- **Count vs volume precedence.** Recommend count is authoritative; volume derived from
  `counter_density × cells_per_well` and final top-up. If no counter density given, still require
  cells_per_well + final_volume and leave suspension µl uncomputed (or inferred from a default).
  Need Brad to confirm: when density is unknown, do we ask for suspension µL directly alongside
  cells/well + final?
- **Where domain lives.** Enriching `ResolveRef` is least invasive; but a just-created local term's
  domain may not be available at ref time → fall back to fetching the material record on selection.
- **biologicalType vs domain.** Keep `domain: cell_line` as the discriminator for now (YAGNI);
  add `biologicalType` only when a distinct type needs its own rule (organoid etc.).
- **Counter density provenance.** Should the density be auto-captured from the instrument run-file
  (QuantStudio/counter) or typed each time? Plan assumes typed-for-now; instrument linkage is future.
- **Well-state / protocol compile.** Cells as a base unit already work in WellStateTracker; no change
  needed there for phase B/D. A full "cell transfer" compiler pass is out of scope.
- **Open decision needed (Brad):** for the count-first form, is the desired input (a) `cells/well +
  final volume` [recommended], or (b) `suspension cells/µL + cells/well + final volume`, or (c)
  just `total cells in the reservoir + per-well split`? This changes the helper math.

## Ready to execute (next turn)
This is a plan only — no files changed this turn. On your go, execute task-by-task (TDD, commit after
each Task A1→F). Recommend starting Phase A (domain propagation) since everything else depends on the
form knowing it's a cell line.