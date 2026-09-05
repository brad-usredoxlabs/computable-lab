# Biological Types & Culture Systems: Inclusive Count/Measure-Driven Plating

Date: 2026-09-04 · Branch: main · Mode: plan (no implementation this turn)

SUPERSEDES: `.hermes/plans/2026-09-04_cells-biological-type-plating-workflow.md` (the cells-only
version). This plan is the inclusive generalization Brad asked for.

## Goal

Model biological **types** (cell lines, C. elegans, mice, yeast, E. coli, primary cells,
organoids…) and **culture systems** (anoxic / hypoxic / hyperoxic, tissue-culture-in-a-tube,
organ-on-a-chip, low/high saline, low/high temp, high microplastics…) as first-class,
data-defined concepts — NOT a cells-only special case. When a scientist adds a biological
material to a well, the app asks for the **correct measure for that type** (cells/well,
organisms/well, CFU, OD600, mass…) plus final volume, and records the **condition** (culture
system) as part of what the material is.

## Key realization from exploration (grounding)

The identity spine and the profile registry ALREADY support the two axes Brad named:

1. **`term.kind` enum already has `organism` and `condition`** (`schema/core/term.schema.yaml:34-35`).
   Expressing "mouse", "yeast", "C. elegans", "E. coli" as **organism terms** and "anoxic",
   "organ-on-a-chip", "high-saline" as **condition terms** needs NO schema enum change — only
   seeding `term` records. These are exactly the kind-driven nodes the identity strategy
   (`ontology-curie-identity-strategy.md`) prescribes; aliases collapse spelling variants.
2. **`material-profile.registry.yaml`** is a declarative per-domain authoring policy. This is the
   correct HOME for "which measure + units + required fields per biological type" — data, not TS.
3. **`concentration.schema.yaml`** `basis` already has `count_per_volume` and units `cells/mL`,
   `cells/uL`. **But** it lacks microbial/organism measures: `CFU/mL`, `OD600`, `organisms/mL`,
   and counts-per-well (not per-volume). These are additive to the unit/basis enums.
4. **`material.schema.yaml` `domain`** enum is `[cell_line, chemical, media, reagent, organism,
   sample, other]` — it already distinguishes `organism` from `cell_line`. `term.kind: organism`
   is broader (also covers cells as an organism identity when useful).
5. `material-instance.biological_state` already captures passage/vessel/seeding-density/confluence;
   `material-derivation.schema.yaml` has a `conditions: {additionalProperties:true}` object — a
   hangar for culture-system provenance.

**Design posture (matches "context is everything"):** a biological material is NOT defined by its
name alone — it is defined by (organism/type) × (culture condition) × (measure semantics). Anoxic
C. elegans is a different material than normoxic C. elegans. So the model must keep **type** and
**condition** as orthogonal data, and the **measure basis** follows from the type via a data table.

## Two orthogonal axes

- **Biological type** → `term.kind: organism` (or `material.domain`). Determines the MEASURE.
  - cell line / primary cell → count per volume or per well (cells)
  - C. elegans → organisms/well (L1/L4/adult), sometimes mass of worms
  - yeast (S. cerevisiae) → cells, CFU, or OD600
  - E. coli → CFU/mL, OD600, or cells/mL
  - mouse / rat → organisms/well, cells (if dissociated), or tissue mass
  - organoid / tissue-in-a-tube → organoids/well, tissue mass/volume
- **Culture system / condition** → `term.kind: condition`. ORTHOGONAL to type. Applied to the
  material instance / derivation as a list of condition refs.
  - oxygenation: anoxic, hypoxic, hyperoxic
  - format: tissue-culture-in-a-tube, organ-on-a-chip, 2D plate, spheroid
  - medium/salt: low-saline, high-saline
  - temperature: low-temp, high-temp
  - stressor: high-microplastics, (future: heavy-metal, oxidative)
  - Each is a `TERM-…` node with a `kind: condition`; Aliased; ontology-linkout where one exists.

## Proposed approach (3 layers, all data-driven)

### Layer 1 — Declarative biological-type registry (the measure table)
A YAML registry (extend `schema/lab/material-profile.registry.yaml` or a new
`schema/registry/biological-types/biological-types.yaml`) mapping each biological type to:
```yaml
biologicalTypes:
  cell-line:
    label: "Cell Line"
    termKinds: [organism]           # identity spine kind(s)
    domains: [cell_line]            # material.domain values it matches
    measures:
      primary: count                # what invariant we record
      units: [cells-per-well, cells-per-ml]
      concentrationBasis: count_per_volume
    fields:
      - cellsPerWell: { required: true, label: "Cells per well" }
      - finalVolumeUl: { required: true, label: "Final volume (µL)" }
      - counterDensity: { label: "Counter density (cells/µL)", optional: true }
  c-elegans:
    label: "C. elegans"
    termKinds: [organism]
    domains: [organism]
    measures:
      primary: organisms-per-well
      units: [worms-per-well, worms-per-ml]
      concentrationBasis: count_per_volume
    fields:
      - organismsPerWell: { required: true, label: "Worms per well (L4)" }
      - finalVolumeUl: { required: true }
      - counterDensity: { label: "concentration (worms/µL)", optional: true }
  yeast:
    label: "Yeast (S. cerevisiae)"
    termKinds: [organism]
    domains: [organism]
    measures:
      primary: cells
      alternative: [od600, cfu]
      units: [cells-per-ml, od600, cfu-per-ml]
      concentrationBasis: [count_per_volume, amount_per_volume]  # OD600 ≈ density
    fields:
      - cellsPerMl: { label: "Cells/mL" }
      - od600: { label: "OD600", optional: true }
      - cfuPerMl: { label: "CFU/mL", optional: true }
      - volumeUl: { required: true }
  e-coli:
    ... (CFU/mL / OD600 / cells/mL primary CFU)
  mouse:
    ... (organisms-per-well or dissociated cells-per-well or tissue mass)
  organoid:
    ... (organoids-per-well + final volume)
```
Unknown type → fall back to a generic `count + final volume` (like the cells default), so
inclusiveness means "if there's no rule yet, count-based still works."

### Layer 2 — Count-first, type-aware Add-Material form
Generalize the earlier Phase B from "cells" to "any organism/biological type":
- `AddMaterialForm` / `EventRibbon` read the type's measure rule (from the registry) and render
  the required fields: **count-per-well (cells/worms/organoids) + final volume (µL)**, with
  counter-density optional. For CFU/OD type, render cells/mL + OD600 + volume.
- A pure helper computes derived volumes when density is present (`suspension_µl = n/density`,
  `top_up = final − suspension`), identical math to the cells plan but parameterized by unit.
- The form ALSO collects **condition refs** (culture system) — a multiselect of `term.kind:
  condition` terms — attached to the material selection.
- Domain/type propagation from the earlier plan still required: `ResolveRef` gains `domain` /
  `termKind` so the form knows the type. For local records, fetch the material/term to resolve type.

### Layer 3 — Culture condition as a first-class association
- Add-material event carries `condition_refs: []` (list of `term.kind: condition`).
- material-instance / derivation persists the conditions (`material-derivation.conditions`,
  `biological_state`) so provenance records "anoxic C. elegans, organ-on-a-chip".
- The deck/event displays the condition chip on the tile.

## Step-by-step plan (bite-sized, TDD)

### Phase A — Seed the inclusive identity spine (data, no code behavior churn)
**Task A1: Seed `term` nodes for the named organisms + conditions.**
- Add `term` records: organisms (C. elegans `TERM-celegans-*` kind `organism`, mouse, S.
  cerevisiae, E. coli, + HepaRG as organism/cell_line) and conditions (anoxic, hypoxic,
  hyperoxic, tissue-culture-in-a-tube, organ-on-a-chip, low-saline, high-saline, low-temp,
  high-temp, high-microplastics, 2D-plate, spheroid — all kind `condition`).
- Use `server/src/terms/EnsureTerm.ts` (ensureTermForLabel) pattern; aliases for variants.
- Test: seed idempotent (re-run reuses), each resolves via `/api/resolve` tier-0 `term` provider.

**Task A2: Extend concentration datatype with the type-appropriate measures.**
- `schema/core/datatypes/concentration.schema.yaml`: add `CFU/mL`, `CFU/uL`, `organisms/mL`,
  `worms/mL` units; consider `OD600` as unit with basis `amount_per_volume` or a new `optical`
  basis. Additive (existing records unaffected; `unevaluatedProperties` safe).
- Test: a `CFU/mL` / `organisms/mL` concentration validates.

### Phase B — Declarative biological-type registry
**Task B1: Author `biological-types.yaml` registry (the measure table above).**
- New `schema/registry/biological-types/biological-types.yaml` (or extend
  `material-profile.registry.yaml`). Every type gets `measures.primary`, `units`,
  `concentrationBasis`, `fields[]` (which inputs, which required).
- Test: loader (`server/src/ontology/biologicalTypes.ts`) returns the rule for `cell-line`,
  `c-elegans`, `yeast`, `e-coli`, `mouse`, `organoid`; unknown type falls back to a
  count+volume default.

### Phase C — Propagate type so the form knows what it's plating
**Task C1: Enrich ref with type/domain.**
- `app/src/shared/api/resolveUtil.ts` `ResolveRef` gains optional `domain`/`termKind`; set from
  candidate (infer via `inferDomainFromNamespace`, or from material record when local).
- `AddMaterialDetails` gains optional `biological_type?` (term ref) + `condition_refs?` (ref[]).
- Test: selecting a `CL:` candidate / organism / condition sets the type; condition multiselect
  populates `condition_refs`.

### Phase D — Type-aware count-first form
**Task D1: Measure-driven inputs.**
- `app/src/graph/events/forms/AddMaterialForm.tsx` + `EventRibbon.tsx`: look up the type's rule;
  render count-per-well (or CFU/OD) + final volume + optional counter density, per the rule.
  Persist `count`, `volume`, `concentration` (for per-mL), plus `condition_refs`.
- Pure helper `app/src/graph/events/forms/plating.ts`: `computePlating({count, density?,
  finalVolumeUl}) → {suspensionUl?, topUpUl?, volume}` — parameterized (works for cells, worms,
  organoids). Test: math + edges (density 0, final<suspension, no density → no derived).
- Test: form shows cells/worms/CFU fields per type; chemical unchanged (volume-first).

### Phase E — Condition capture + provenance
**Task E1: Condition refs on the event + instance.**
- Schema: `plate-event.add-material.schema.yaml` optional `condition_refs` (ref[]); persistence
  into material-instance `biological_state` / derivation `conditions`.
- Test: event carries conditions; accepted instance records them.

### Phase F — Cell Transfer / generic count-protocol template
**Task F1: Seed a reusable "Biological Material Transfer" universal protocol** (release → count →
plate N per well → top-up to final volume), tag `biological`, generic across types (parameterized
by the type's measure). Selectable in Protocol tab. **(Optional/YAGNI — only if Brad wants it now.)**

### Phase G — Verify
- `app` + `server` typecheck; `app vitest` (forms, plating, resolveUtil) + `server vitest`
  (biologicalTypes loader, term seeding, schema, concentration).
- Live-browser pass (SOUL rule): add HepaRG / C. elegans / yeast to a well → form asks the type's
  measure; chemical still asks volume; condition chip appears on the deck tile; count flows into
  the event.

## Files likely to change
- `schema/core/datatypes/concentration.schema.yaml` (add units/basis)
- `schema/registry/biological-types/biological-types.yaml` (NEW, measure table)
- `server/src/ontology/biologicalTypes.ts` (NEW loader + helper)
- `records/term/*.yaml` or seed via EnsureTerm (organisms + conditions)
- `schema/workflow/events/plate-event.add-material.schema.yaml` (`biological_type`/`condition_refs`)
- `app/src/shared/api/resolveUtil.ts` (type/domain on ref)
- `app/src/types/events.ts` (`AddMaterialDetails` type/condition fields)
- `app/src/graph/events/forms/AddMaterialForm.tsx`, `graph/events/ribbon/EventRibbon.tsx`
- `app/src/graph/events/forms/plating.ts` (NEW pure helper)
- `schema/lab/material-instance.schema.yaml`, `material-derivation.schema.yaml` (condition persist)
- Tests colocated.

## Risks / tradeoffs / open questions
- **Measure table is data, not code.** The registry is the single source of "what do I ask for
  this organism?" — keep it schema-registry-loaded, no hardcoded TS rules (repo rule #1).
- **OD600 / CFU basis.** `concentration.schema.yaml` basis is molar/mass/activity/count/volume-
  fraction. OD600 is an optical density and CFU is a count of colonies. Per D1, these are
  ESTIMATE mechanisms, not hard concentrations: CFU → `count_per_volume` (CFU per volume),
  OD600 → recorded as `count_estimate.measuredBy: od600` + a raw reading, NOT a strict molar-like
  concentration. This avoids over-typing a fraught measurement. (Brad's decision: don't pretend
  OD600 is a precise concentration.)
- **Species vs strain (DECIDED, D2):** two-level organism identity via `term.strain_of`. Species
  = `kind: organism`; strain = child `kind: organism` term with `strain_of` → species. A strain is
  referenceable on its own. Material-instance records the strain.
- **Condition orthogonality (DECIDED, D3):** conditions are a multiselect of `term.kind: condition`
  refs on the material add + persisted to instance/derivation. Not a full condition graph (YAGNI).
- **Form discriminator (DECIDED, D4):** coarse `material.domain` gates biological-vs-chemical; the
  resolved specific organism/strain term picks the registry rule; unknown → generic count+volume.
- **First-wave scope.** Recommend: A1 (seed terms incl. strains), A2 (units), B1 (registry with
  verification method), C1 (type/condition on ref), D1 (count-first form), D2 (count_estimate at
  seed), D3 (Verify-plating read + evidence), E1 (condition refs) — that's the inclusive MVP
  including the estimate-vs-evidence honesty layer. F1 (protocol template) is optional/defer.

## Ready to execute (next turn)
Plan only — no files changed this turn. On go, execute Phase A→G task-by-task (TDD, commit after
each). Recommend starting Phase A (seed terms + units) since the registry and form depend on the
type/condition being expressible.

---

# Brad's decisions (2026-09-04) — folding these in

## D1 — OD600 / counting is fraught: seeds are ESTIMATES, the follow-up reading is EVIDENCE
Brad's decisive point: any biological count (cells/worms/CFU/DNA) at seeding is a **best guess**.
You plate "about right," then a **follow-up reading** (total-protein assay, or Hoechst nuclear
stain count) determines whether you actually plated correctly. So the model must treat the
**seeding number as an ESTIMATE with a stated mechanism**, and carry a **verification-read seam**
that supports/refutes it.

Modelling implication (not a separate feature — an honesty layer over the count):
- The seed `count` / `cellsPerWell` is tagged with:
  - `measuredBy` (mechanism): `cell_counter | hemocytometer | od600 | total_protein | hoechst_nuclei | manual`
  - `confidence`: estimate (not a hard fact) — store as `isEstimate: true` + optional ± tolerance.
- A **verification event**: a later `read` event (`modality: microscopy|fluorescence` for Hoechst;
  `absorbance` for total protein) on the SAME wells. The `read` schema already exists
  (`plate-event.read.schema.yaml`, `modality` enum incl. microscopy/fluorescence/absorbance). The
  verification reading becomes **evidence** — link it to the `evidence.schema.yaml` bundle so it
  "supports/refutes that the plate actually has ~N cells/well."
- The WellStateTracker already carries count as a base unit; the verification read is a
  measurement mutation, not a composition mutation.

Concrete additions:
- `plate-event.add-material.schema.yaml` optional `count_estimate?: { measuredBy, isEstimate,
  tolerancePct? }` beside `count`.
- Registry `measures` gains a `verification?: { method, readModality }` per type (cell line →
  hoechst_nuclei/microscopy or total_protein/absorbance; e-coli → cfu; yeast → od600+cfu).
- Plan Phase D2 (NEW): capture `count_estimate` at seed time; Phase D3 (NEW): a "Verify plating"
  action that stages a `read` event on the seeded wells and links it as evidence.

## D2 — Species vs strain: we NEED a strain concept (species have strains)
Organism identity must be two-level: species AND strain. e.g. Mus musculus (species, NCBITaxon:
10090) has strains C57BL/6J, BALB/c, NOD. A strain is its own referenceable identity, linked to its
species.

Concrete additions:
- `term.schema.yaml`: optional `strain_of` ref (`$ref` to a species `term`) + optional `strain`
  label field, ADDITIVE (existing terms unaffected). Species term = `kind: organism`, no
  `strain_of`. Strain term = `kind: organism`, `strain_of: <species term>`, alias includes both
  e.g. "C57BL/6" and "C57BL/6 mouse".
- The generalizable shape (not just mouse): `organism` terms may form a parent/child spine via
  `strain_of` (species → strain → substrain). A strain resolves as its own TERM in tier-0 of the
  resolve spine.
- Plan Phase A gains: seed mouse strains (C57BL/6J etc.) + E. coli strains (K-12, BL21), each
  `strain_of` its species term. `material-instance.biological_state` gains optional `strain_ref`.
- Registry never keys IDs on a bare "mouse" — it keys on the specific organism/strain term.

## D3 — Condition granularity: Brad accepts the recommendation
Multiselect **condition refs** on the material add + persisted to instance/derivation. NOT a full
condition graph (YAGNI). Anoxic-vs-normoxic contrast is the minimal useful unit. Plan Phase E as
written (condition_refs on event + instance).

## D4 — Form discriminator: Brad accepts the recommendation
Lock: the form GATES on coarse `material.domain === 'cell_line' | 'organism'` (decides
"biological/count-based vs chemical/volume-based"). Within biological, it resolves the SPECIFIC
type from the selected material/term (match registry on term label/alias/NCBITaxon linkout) to
pick exact fields (cells vs worms vs CFU vs OD600). Unknown biological type → generic
`count + final volume` fallback. (MaterialPicker already carries `domain`; C1 adds domain/termKind
to the ref so the add form can do this.)