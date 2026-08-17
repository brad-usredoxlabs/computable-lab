# Working-Concentration-First Quantity Model

**Status:** Design draft — for Brad's review and sign-off (gates implementation).
**Date:** 2026-08-15 (revised — north star corrected from *ratio* to *concentration*)
**Owner:** Architect (122B)
**Related:** `compiler-specs/50-protocol-lifecycle.md` (layers §2, §5), `schema/workflow/protocol.schema.yaml`
(step shapes, `Expr`, `WellSelector`), `schema/core/datatypes/concentration.schema.yaml` (concentration
datatype), `schema/lab/material-spec.schema.yaml` `formulation.concentration` (stock concentration),
`schema/workflow/setting.schema.yaml` (setting types).

---

## 1. Purpose — why concentration, not ratio

A protocol's scientific essence is the **final working concentration of each active component in the
assay well**, not the raw volume and not the ratio per se.

> Fenofibrate affects PPARα-dependent gene expression maximally at **10 nM**. Whether the starting stock
> is 1 mM, 1 µM, 100 nM, or 100×, the north star is: **in the final assay plate, the concentration is
> 10 nM.** No stock strength, scale, or pipette changes that.

The bakery comparison is the same fact in disguise: scaling a batch "10× all-purpose flour" works because
the **hydration** (flour:water — a `% w/v` concentration) stays constant, not because flour weight per se
is the invariant. Ratio is the **mechanism**; concentration is the **destination**.

### The failure mode we are preventing

Today a step's `volume_uL` is a single `Expr` — it can only say "550 µL" (or a parameter ref). Nothing
expresses **"this dispensing step is meant to land the well at 10 nM fenofibrate."** The consequence of
only-ever-storing absolute volume is:
- **stock-coupled:** the recipe silently assumes a stock strength; swap the stock and the 550 µL is wrong;
- **scale-coupled:** a 4-sample run vs a 96-sample run must not change the recipe, but a baked volume invites
  exactly that kind of edit;
- **substitution-hostile:** "swap in our cheaper 100 µM binding buffer" cannot be expressed as a recipe fact —
  you'd have to hand-edit every volume, which is the 4→96 trap again, at the reagent level.

---

## 2. The model — one north-star, C₁V₁=C₂V₂

### 2.1 A step declares its working concentration; everything else is derived

Reuse the **existing** `schema/core/datatypes/concentration.schema.yaml`:

```yaml
$id: .../concentration.schema.yaml
Concentration:
  required: [ value, unit, basis ]
  value: number                 # exclusiveMinimum: 0
  unit:  M | mM | uM | nM | pM | fM | g/L | mg/mL | ug/mL | ng/mL | U/mL | U/uL | cells/mL | cells/uL | % v/v | % w/v
  basis: molar | mass_per_volume | activity_per_volume | count_per_volume | volume_fraction | mass_fraction
```

A protocol step that dispenses an active material carries:

```yaml
StepAddMaterial:
  required: [ kind, target, wells, material ]        # NOTE: volume_uL no longer required when ratio/working_conc present
  material:
    materialRole: string
  # NORTH STAR — the final assay-well concentration of `material`.
  working_concentration:
    $ref: "./datatypes/concentration.schema.yaml"    # { value: 10, unit: nM, basis: molar }
  # ADVISORY authoring proxy — the dilution this step achieves (derived, never the invariant).
  ratio: ReferenceRatio                               # optional; e.g. sample:diluent 1:2.5
```

### 2.2 Resolution — the bakery rule, made precise

```
Given (at the planned-run → execution-plan compile step):
  C_target  = working_concentration            (recipe — the north star)
  C_stock   = material-spec.formulation.concentration   (lab/run binding per material)
  V_well    = final well volume                (deck layer + run sampleCount-derived)

Derive:
  V_stock   = V_well × C_target / C_stock      (volume of stock to dispense)
  V_diluent = V_well − V_stock                 (diluent / carrier to add)
  per_well_active_moles = V_stock × C_stock    (≡ V_well × C_target — checkable invariant)
  batch_master_mix = per_well_active_amount × run.sampleCount (+ dead volume at deck layer)
```

The **invariant** is `V_stock × C_stock = V_well × C_target` — the conservation law C₁V₁=C₂V₂. Stock
strength, well volume, and sample count are all free knobs; the active amount per well and the final
concentration are locked.

### 2.3 Where the facts live by layer

| Layer | What carries the concentration facts |
|---|---|
| Universal protocol | step `working_concentration` (north star) + optional advisory `ratio` |
| Local protocol | `overrides.substitutions` swap materials (each carries its own stock `formulation.concentration`); `overrides.parameters` may pin C_target |
| Planned run | resolves `V_stock = C_target × V_well / C_stock` against `sampleMap`/`sampleCount` at compile |
| Deck / robot | final well volume, dead volume / pipette dead-space → concrete µL per well |

---

## 3. Schema changes (all additive; nothing breaks)

These reuse existing types instead of inventing new ones (DRY):

### 3.1 Step kinds gain optional `working_concentration` (reusing `concentration.schema.yaml`)

- `StepAddMaterial` — add optional `working_concentration`; relax `required` to
  `[kind, target, wells, material]` (a step must have `volume_uL` OR `working_concentration`).
- `StepTransfer` — optional `working_concentration` (the transferred material's target in the target well).
- `StepWash` — typically no concentration (a wash volume, not a dilution); leave `washVolume_uL` as-is (YAGNI).
- `StepMix` / `StepIncubate` / `StepRead` / `StepHarvest` / `StepOther` — no change (duration/temp/modality).

### 3.2 A new optional `ReferenceRatio` datatype (advisory, never the invariant)

Add small `schema/core/datatypes/reference-ratio.schema.yaml`: `{ numerator: number, denominator: number,
basis_label?: string }` — an authoring/provenance note ("sample : DNA/RNA Shield = 1 : 2.5") that documents
the dilution, and can be *checked* against `working_concentration` at compile, but is not what the resolver
uses. Keeping it advisory means a step with a ratio but no resolvable C_target degrades gracefully.

### 3.3 `setting.schema` — add `concentration` type

`setting.type` enum becomes `[string, number, boolean, duration, temperature, volume, concentration, ratio, select]`.
- `concentration` reuses the `concentration.schema.yaml` unit/basis enum for the widget.
- `ratio` (numeric proportion) remains available for advisory fields.
No breaking change: new enum values only.

### 3.4 `protocol.schema.yaml` `$defs` additions

- `$ref` `concentration.schema.yaml` for `working_concentration`.
- `ReferenceRatio` `$def`.
- Optional `working_concentration` + `ratio` on the step payloads listed in 3.1.
No new REQUIRED field anywhere; legacy `volume_uL`-only steps still validate.

---

## 4. Compiler behavior (the resolution seam)

Add to the `planned-run` → `execution-plan` compile pass (`server/src/execution/compilers/`, spec 50 §11):

```
for each step in plan.steps:
  if step.working_concentration present:
    C_target = step.working_concentration
    C_stock  = resolveStockConcentration(step.material)   # from material-spec.formulation.concentration
    if no C_stock: → compile BLOCKED with diagnostic "no stock concentration for <material>"
    for each target well (from run.sampleMap / well expansion):
      V_well    = wellVolume(well)                 # deck layer + sampleCount
      V_stock   = V_well × C_target / C_stock
      V_diluent = V_well − V_stock
      emit add_material(stock: V_stock) + (V_diluent > 0 ? add_material(diluent: V_diluent) : nothing)
    masterMixTotal per component = Σ per_well × sampleCount   (+ dead volume)
  elif step.ratio present:
    resolve via ReferenceRatio → advisory V_stock/V_diluent (C₁V₁=C₂V₂ given V_well); warn if C_target unknown
  else:
    use legacy step.volume_uL unchanged
```

**Missing-stock behavior:** if a `working_concentration` step has no resolvable stock concentration
(e.g. the material has no `formulation.concentration` and no `source` stock), the compile is `blocked`
with a diagnostic naming the material — never silently default to a fabricated concentration. This enforces
the "concentration is the invariant" rule and surfaces the gap visibly.

---

## 4A. Well-state propagation — the deterministic composition tracker

The resolver above gets a recipe to concrete volumes. The **well-state tracker** (`server/src/compiler/math/WellStateTracker.ts`
+ `eventReducers.ts`) is the deterministic state machine that carries each well's **composition** forward
through the ordered event graph, so the run's wells can be *proven* to reach their target concentrations
without hand math. It is the "analogous-to-the-deterministic-compiler" backbone the AI review dialogue
(`after add + bind + wash×2 + elute, well A1 contains 10 nM at 100 µL`) consumes.

### 4A.1 What a well carries

```
WellState {
  volume_ul: number
  components: Map<materialRef, ComponentAmount>
}
ComponentAmount {
  soluble: number    // amount in the free solution (dilutable / mixable / removable by decant)
  bound:   number    // amount immobilized on the solid phase (beads / pellet); NOT removed by discarding supernatant
  basis, template    // amount unit basis + a template Concentration for re-expressing derived concentrations
}
```

Amount (moles / g / cells / fraction) is the tracking unit, **not** concentration. Concentration is *derived*,
never stored: `C_soluble = soluble / volume_ul`, whereas after an elution the retained concentration is
`bound / elution_volume` — a different denominator that a purely volumetric C₁V₁=C₂V₂ model gets wrong.

### 4A.2 The explicit `phase` field (self-documenting, never inferred)

Every plate event (and protocol step) carries an optional `phase: 'soluble' | 'adsorbed'`
(absent → `'soluble'`). The tracker **never infers** which analytes are bound from context — the event
*declares* it. `magnetize`/`elute`/`resuspend` are structural hints that pair with this explicit phase
(rather than the tracker guessing intent from the event kind).

### 4A.3 The event → reducer map (the semantic core)

| Event kind | Reducer effect |
|---|---|
| `add_material` | incoming amount + volume; `volume_ul` grows; amount = conc × volume (base); carries into `soluble` (or `bound` when `phase: 'adsorbed'`). |
| `transfer` | splits the source freely: soluble moves proportionally to the transferred volume fraction; **bound stays with the solid** (a partial liquid transfer does not carry the pellet). |
| `mix` | no net volume/amount change; marks the well homogenized. |
| `dilute` | add pure solvent; every soluble amount unchanged, `volume_ul` grows → C₁V₁=C₂V₂. |
| `wash` | for each cycle: add buffer → mix → discard supernatant. Soluble impurities diluted then removed; **bound retained**. Net: soluble → 0, bound untouched. |
| `magnetize` / `magnetize_incubate` | bind soluble → bound (optionally only the `materialRefs` declared as the bound set, so non-binding impurities stay soluble and wash away). |
| `remove_supernatant` / `decant` / `discard` | remove the entire liquid phase: soluble → 0, `volume_ul` → residual; bound retained. **This is what makes SPE correct.** |
| `resuspend` | bound → soluble at the resuspension volume. |
| `elute` | bound → soluble at the elution volume → concentration = `bound / elution_vol` — an **increase**, not a dilution. |
| `harvest` | emit the well's final derived composition as the produced artifact. |

**Why this is right (the Zymo MagBead case):** add sample (200 µL @ 10 nM) + shield (500 µL) → the DNA is
fully soluble at 700 µL ≈ 2.857 nM. Magnetize (bind DNA) + discard supernatant + wash×2 → the DNA is the full
retained amount `2e-12 mol` on the beads. Elute into 50 µL → `2e-12 / 50e-6 = 40 nM` — a **10× enrichment**,
the *opposite* of a dilution. A volumetric-only model would compute the discard as removing the analyte and
never produce the correct elution concentration.

### 4A.4 Public API & determinism

`trackRunningComposition({ events, initialWells }) → Map<wellId, WellFinal>` walks the ordered event list,
adapting each PlateEvent to its reducer. Non-physical inputs (negative amounts, unknown bound refs, missing
elution volume) never silently drop: they set `well.dirty = true` and append a warning. Amounts are always
additive per basis (the same-basis invariant). Well volume overrun is a warning, never a clamp. Implemented at
`server/src/compiler/math/WellStateTracker.ts` (type + core + reducers) and `eventReducers.ts` (the event walk),
reusing `formulationMath.concentrationToBase` / `concentrationFromBase` for unit/base math.

---

## 5. Implementation tasks (post-sign-off)

Bite-sized, TDD, each independently committable:

### 5.1 `ReferenceRatio` datatype (schema)
`schema/core/datatypes/reference-ratio.schema.yaml` + schema-validation test (valid ratio passes; missing
numerator fails; unknown field fails `unevaluatedProperties`).

### 5.2 step `working_concentration` + `ratio` refs (schema)
Add to `StepAddMaterial` / `StepTransfer`; relax `required` on `StepAddMaterial` so a step has volume OR
concentration. Tests: a `working_concentration` step validates; a legacy `volume_uL` step still validates;
a step with neither fails.

### 5.3 `setting` `concentration` type (schema)
Add `concentration` (and keep `ratio`) to the enum; test.

### 5.4 compile resolver (server, TDD)
Pure function `resolveWorkingConcentration({ workingConcentration, stockConcentration, wellVolume,
sampleCount, deadVolume })` → `{ V_stock, V_diluent, perWellActive, batchTotal }`. Unit tests for
fenofibrate at 10 nM from 1 mM / 1 µM / 100 nM / 100× stocks, and for the blocked-no-stock case.

### 5.5 extraction emits concentration (server, TDD)
When the extractor "distills" a vendor step, prefer emitting `working_concentration` (base + unit + basis)
when the source gives a concentration/dilution, else fall back to legacy `volume_uL`. Wire `formulation.
concentration` population when the extractor identifies a stock strength.

### 5.6 frontend surfacing (app)
- A step with `working_concentration` displays "fenofibrate — 10 nM" instead of a bare µL.
- `setting` `concentration` type renders a value+unit+basis control.
Tests for the render helper.

---

## 6. YAGNI / explicitly out

- No change to the run's scale model — sample count stays a run property (established).
- No new REQUIRED schema fields — every addition is optional.
- No mass (g/kg) concentration basis in scope beyond what `concentration.schema.yaml` already enumerates.
- No automatic well-list expansion writing explicit wells back into the protocol.
- No support for multi-material *simultaneous* working concentrations in one step (each step = one active
  material's C_target; a cocktail is multiple steps). If needed later, a `working_concentration[]` array is
  a trivial generalization.

---

## 7. Open questions for Brad

1. **Per-step `working_concentration` vs a protocol-level defaults block** — recommend per-step (each
   dispensing step declares its own target); a top-level `defaults` is a convenience fallback, not required.
2. **Well volume source:** should V_well come from the deck's labware geometry (`well_max_volume_uL`, then a
   default fill fraction like 80%), or must the local protocol pin an explicit per-well volume? Recommend
   deck geometry + a default fill fraction, overridable by the local protocol.
3. **Dead volume:** blanket protocol-level `%` vs per-platform/pipette dead-space tables. Recommend per-platform
   (deck layer), consistent with the existing `execution-plan`/`robot-plan` split.
4. **Is C_target ever mass/activity-based in real kits (e.g. U/mL for an enzyme)?** The datatype already
   supports U/mL and `% w/v` — confirm you want those enabled for `working_concentration` (recommendation: yes,
   they're in the enum already).

**Sign-off gates implementation (section 5).** No existing record changes; `working_concentration` and
`ratio` are additive and optional throughout.