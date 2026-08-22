# Concentration Propagation Engine — Deterministic Well-State Tracker over the Event Graph

**Date:** 2026-08-15
**Status:** Plan mode (design + breakdown; no code changed).

> **For Hermes:** Use subagent-driven-development to execute task-by-task after approval.

**Goal:** Build the "analogous-to-the-deterministic-compiler" concentration mechanism Brad described:
a **deterministic well-concentration state tracker** that carries each well's composition
(materials × concentrations × volumes) through the event graph as materials are added, mixed,
diluted, and transferred — AND correctly handles the non-C₁V₁=C₂V₂ steps (solid-phase extraction /
magnetic binding, supernatant removal / decant, pellet resuspension / elution).

**Architecture:** Two-part.
1. **WellStateTracker** — a pure, step-wise state machine: for a given labware well, maintain
   `{ volume_ul, components: Map<analyteId, { soluble: amountMol-or-conc, solidBound: amountMol }> }`.
   Walking the event graph in order, each event kind updates the state deterministically.
2. **Event→Semantics map** — each event kind dispatches to a reducer that knows whether the analyte is
   **soluble** (add/dilute/mix/wash → C₁V₁=C₂V₂) or **partitioned** (magnetize → bind to beads;
   discard-supernatant → remove soluble, keep pellet; wash → repeat; elute → transfer bound analyte
   into the elution volume). This is the key that makes SPE/decant/resuspend correct.

**Reuse (DRY):** `server/src/materials/formulationMath.ts` already implements `target_concentration`
→ volume (`resolvedAmount`), `concentrationToBase`, `mergeCompositionEntries`, and
`MaterialCompiler.ts` already has a `concentrationSemantics: 'formulation' | 'event'` branch. The new
engine is the **composition-carrying state machine** these seam into — not a replacement for them.

**Tech Stack:** TypeScript server (`server/src/compiler/math/`), pure functions + TDD (Vitest), reusing
`concentration.ts` (units/basis) + `formulationMath.ts` (C₁V₁=C₂V₂ helpers).

---

## 1. The conceptual model you're describing (made precise)

A protocol/event-graph is a **deterministic program**; the thing it computes is the **composition of
each well at each step**. Just as `formulationMath.computeFormulation` takes ingredients + total
volume and returns resolved amounts + output composition, the **WellStateTracker** takes an *ordered
event list* and returns a per-well composition timeline. The volumes/volumes are inputs; the tracking
unit is **amount of each active component** (moles or the appropriate basis), because concentration
alone can't split "how much" from "in what volume."

The tracker state for a well:

```
WellState {
  volume_ul: number
  components: Map<string, ComponentAmount>      // keyed by analyte/material ref
}
ComponentAmount {
  soluble: { amount, basis }    // amount in the free solution (dilutable/mixable/removable)
  bound:   { amount, basis }    // amount immobilized on solid-phase (beads/pellet); NOT removable by decant
}
```

Concentration is **derived, not stored**, and differs by compartment:
- `C_soluble(analyte) = soluble_amount / volume_ul`
- `C_bound_on_beads(analyte) = bound_amount / bead_slurry_volume` (a different denominator — the elution/immunobenzene reality)

This is the "concentration/swapping steps" the user flagged: **dilution is not the only operation.**
Solid-phase extraction is a **partitioning** between compartments, not a volumetric dilution.

---

## 2. The failure mode we are preventing

A naive `C₀ = C_target` from `formulationMath` gets every non-dilution step wrong:

- **Magnetic binding → discard supernatant:** If the analyte is bound to beads and you discard the liquid,
  the *culture broth* you removed carried ~0 analyte; the retained **elution** concentration is *not*
  `C₁V₁=C₂V₂` — it's `amount_bound / elution_volume`, which can be 100× higher. A volumetric-only model
  would (a) calculate the pellet discarded the analyte, or (b) silently dilute it, both wrong.
- **Add sample (200 µL) to shield (500 µL):** this one IS C₁V₁=C₂V₂ → `new_conc = conc_sample × 200/700`.
- **Wash (add buffer → mix → discard):** soluble impurities are diluted each wash and removed with the
  discard; bound analyte is retained. Net effect: soluble component concentration → ~0, bound maintained.
- **Elute (add elution buffer, magnetize, collect flow-though / elution):** bound analyte enters solution
  at `amount / elution_volume` — an increase, not a dilution.
- **Resuspend pellet:** bound → soluble at the resuspension volume.

So the model splits every event's effect per-compartment. That is the gap.

---

## 2. Files

### New
- `server/src/compiler/math/WellStateTracker.ts` — the pure state machine (types, init, step, finalize).
- `server/src/compiler/math/WellStateTracker.test.ts` — TDD unit tests.
- `server/src/compiler/math/eventReducers.ts` — the event-kind → reducer map (add/dilute/mix/transfer/wash/magnetize/discard-supernatant/elute/resuspend). Could live in the same file; separate = cleaner.

### Modify (seams, minimal)
- `server/src/materials/formulationMath.ts` — export `concentrationToBase` / `concentrationFromBase` if
  not already exported (they're `function`-scoped today → export). Reuse in reducers.
- Compiler pass: pick where the tracker runs over the extracted event graph. Likely
  `server/src/compiler/pipeline/passes/` (a new `WellStateTrackingPass`) or the 
  `protocolIntent`/`LocalProtocolBuilder` path. **Determine at implementation.** For now, plan says: it
  reads a compiled event list (from `POST /runs/:id/compile` output) and emits a per-well final-state +
  diagnostics. Not yet wired to a public endpoint.

(Docs) `compiler-specs/working-concentration-quantity.md` — add a "well-state propagation" section.

---

## 3. Event kind → reducer map (the semantic core)

| Event kind | Reducer (what happens to components) |
|---|---|
| `add_material` (add material/conc) | mix: take incoming `amount` + its volume; recompute `volume_ul`; if stocked with a concentration, `amount = conc × vol_added` (as a base), carry soluble. |
| `transfer` | split the source well composition: move `volume_ul × (each comp amount)` into the target. Both wells implicitly equal if whole-well transfer; partial transfer splits soluble proportionally, **not** bound (bound stays with solid). |
| `mix` | no net volume/amount change; reconcile soluble phase homogeneously (copy of the well's sum). Real change: none; marks the well as "homogenized" for later steps. |
| `dilute` (a `transfer` into a known carrier volume, or an explicit `add volume_uL` of a no-analyte solvent) | scale `conc` only via C₁V₁=C₂V₂ → `new_amount` unchanged, `volume_ul` grows, `concat` recomputed. |
| `wash` | sequence: `add(buffer)` → `mix` → `remove supernatant`. For soluble components, each wash dilutes ×(buffer_vol/(vol+buffer)) and the discard removes ×the discarded fluid; for bound components, `amount_bound` untouched, so C (volume) rises. |
| `magnetize` / `magnetize_incubate` | bind: move soluble of magnetizable analytes → `bound`; mark supernatant depleted. (This is the arr that makes `discard-sn` correct.) |
| `decant` / `remove_supernatant` / `discard` | remove the current liquid phase: `volume_ul` → `residual_bound_slurry_vol`; soluble components → 0 (removed); bound components retained. |
| `resuspend (pellet)` | `bound → soluble` at a given resuspension volume; `volume_ul = resuspension_vol`. |
| `elute` | `magnetize` → `remove_sn` → `add(elution buffer)` to the pellet/beads → `magnetize` again → collect: bound → soluble in `elution_vol` (conc = bound_amount / elution_vol). |
| `harvest` | output the well's final state as a produced artifact (record the Concentrations at harvest. |

**This map is the deliverable of Task B (below).** It encodes everything the user enumerated:
"concentration/swapping steps, solid-phase extraction, removing supernatant, re-solubilizing a pellet."

---

## A — bite-sized tasks (TDD, each committable, 2–5 min each)

> **DECIDED (Brad, 2026-08-15): the soluble/adsorbed partition is EXPLICIT — each event carries a
> declared `phase: 'soluble' | 'adsorbed'` (or per-analyte-phase) hint. The tracker does NOT infer it
> from context.** This is self-documenting, avoids the tracker guessing magnetize/resuspend intent, and
> keeps the reduction deterministic against the declared biology rather than the tracker's assumptions.
> Consequences threaded through the tasks below: the event/step schema carries `phase`, the reducers
> read it, and `magnetize`/`elute`/`resuspend` become structural hints that pair with an explicit phase.

### A0: Add an explicit `phase` field to the event/step schema (schema, additive)

**Objective:** Give the event and protocol-step shapes an optional, explicit compartment hint so the
tracker never has to guess soluble-vs-adsorbed.

**Files:**
- Explore: `schema/workflow/events/plate-event*.schema.yaml` (per-kind details) + `ProtocolStep`/step
  payloads where a step implies a phase (specifically add/mix/elute/etc.).
- Modify: the shared event-details base + the step payload(s) with an optional
  `phase?: 'soluble' | 'adsorbed'` (or a per-material map `phases?: Record<materialRef, 'soluble'|'adsorbed'>`
  when a single event partitions multiple analytes differently). Keep additive + back-compat
  (absent = `'soluble'` default).
- Modify: `app/src/types/events.ts` `BaseEventDetails` (and step mapper) with the same optional field.

**Step 1 (TDD):** schema test — an event with `phase: 'adsorbed'` validates; a step with
`phase: 'soluble'` validates; an unknown phase value fails. Existing events without `phase` still validate.
**Step 2:** implement the schema + frontend type additions.
**Step 3:** `cd server && npx vitest run <schema-test> && npx tsc --noEmit` green; `cd app && npx tsc --noEmit` green.
**Step 4:** commit `feat(schema): explicit phase (soluble|adsorbed) on events/steps`.

### A1: `ComponentState` + `WellState` types + pure init/step skeleton

**Files:** `server/src/compiler/math/WellStateTracker.ts`.

**Step 1 (test):** `wellState(volume)` → `{volume_ul, components: Map }`; `addComponent(w, ref, amount)` adds/reconciles.
**Step 2:** Implement the `WellState` type + `initWell(volume_ul)`, and a `finalize` that returns
`{volume_ul, componentNames, finalConcentrations: Map<analyte, Concentration>]}`.
**Step 3:** commit `feat(compiler): WellState + init + finalize skeleton`.

---

### A2: `eventReducer` for the volumetric C₁V₁=C₂ (add / dilute / mix / transfer)
**Files:** `server/src/compiler/math/eventReducers.ts`.

Test: adding a known volume of a target conc → `volume_ul` grows, `concentration` computed from
`amount/volume`; transfer splits fractionally preserving per-comp amounts.
**Step 1:** failing test for `reduceAdd` / `reduceMix` / `reduceTransfer` / `reduceDilute`.
**Step 2:** implement those (pure, uses `formulationMath.concentrationFromBase`), and have each read the
declared `phase` (soluble for add/dilute/transfer by default; `adsorbed` routes into the bound compartment).
**Step 3:** commit `feat(compiler): volumetric add/mix/transfer reductions`.

---

### A3: Partitioning reducers — magnetize / discard / elute / resuspend / wash
**The SPE correctness core.**
Files: `server/src/compiler/math/eventReducers.ts`.
Test scenario = the Zymo MagBead flow:
- `magnetize` — a **structural hint** that pairs with an explicit `phase: 'adsorbed'` binding: analytes
  declared `adsorbed` move `soluble → bound`.
- after `discard-supernatant` (declared to remove the liquid phase) the soluble amount → 0, **`bound`
  retains the full amount** (this is what makes SPE correct).
- `elute` — declared `phase: 'adsorbed'` on the beads + an elution volume: `bound → soluble` at
  `elution_vol` → concentration = `bound / elutionVol` (high, **not** C₁V₁=C₂).
- `wash(×k)` — declared `soluble` impurities ×(dilution^k) and removed by each declared discard; bound retained.
- `resuspend` — declared `phase: 'adsorbed' → 'soluble'` at the resuspension volume.
**Step 1:** failing tests (Zymo scenario), each pairing the reducer with its declared `phase`.
**Step 2:** implement `reduceMagnetize / DiscardSupernatant / Elute / Resuspend / Wash`, driven by the
declared `phase`.
**Step 3:** commit `feat(compiler): explicit-phase SPE/magnetize/elute reducers`.

---

### A4: `trackRunningComposition(events[])` public API
Files: `server/src/compiler/math/WellStateTracker.ts`.
`trackRunningComposition({ events: PlateEvent[], initialWells }) → Map<wellId, WellStateFinal>`.
**Step 1:** failing golden test on a small real protocol chain (add sample→shield→bind→wash×2→elute).
**Step 2:** implement walk-the-chain loop.
**Step 3:** commit.

---

### T5: diagnostics endpoint/no-op pass + input seam
Files: compiler pass (investigate where the compiled event list lives — likely a
`precompile` / `protocolIntent` pass or a new `passes/WellStateTrackingPass.ts`), wired to read the
`validation`-time notifications without breaking existing passes.
Low priority wrapper. Might collapse into A4. Keep minimal (go/no + a `diagnostics[]` gloss);
do not yet change `/compile` output contract.

---

### T6: docs — spec update
`compiler-specs/working-concentration-quantity.md` bid `Well-state propagation` section (the event map
ME from Task 3), so the model to Carrie's spec is durable.

---

## 5. What this unlocks / why it's the right north star

The concentration tracker is the deterministic backbone that makes the whole earlier vision real:
- The **local protocol → compile** step can validate "the run's wells actually reach 10 nM fenofibrate
  (or bind → elute) without any hand math."
- It powers the **AI "review / does the run look right"** dialogue post-Complete §7(6): "after add + bind
  + wash×2 + elute, well A1 contains 10 nM at 100 µL" is the proof the run matches the recipe-math.
- It bridges the "recipe (ratio/conc) → run actualization (count, tubes, volumes)" seam: the tracker
  consumes the *event graph* (not the recipe), so at...examples, 4-ear or 96-ear or "tubes-in-rack"
  all come out right per-sample.

---

## 6. Risks / trade-offs / open questions

- **Analyte "amount" basis.** amounts are molar by default; mass % / activity / cells work too (the
  `concentration.ts` bases). Amounts are always additive per basis — the Same-basis invariant in the
  reducer is a must.
- **The `phase` field is explicit (DECIDED: explicit).** Per-event `phase: 'soluble' | 'adsorbed'`
  declared on the event/step, not inferred. Default `'soluble'` when absent → back-compat.
- **Real labware `well_volume_ul`** (which the tracker needs for overrun ≤ cap) — reuse the deck
  geometry/working volumes known to `VolumeResolver`/`LABWARE_WORKING_VOLUMES_UL`; keep a cap check
  flagged as a warning, not a failure.
- **Integration point is still TBD** (a new pass vs inside an existing one). This is the only real
  unknown; start pure, keep the graph-to-list seam a thin adapter so we can move it cheaply.
- **Concentration reactions:** the tracker must not silently clamp negative/over-100% — a negative
  amount or a well that exceeds labware working volume = warning + the composition is marked `dirty`.

---

## 7. Suggested sequencing

1. **A0** (explicit `phase` field on the event/step schema + frontend type) — the declared-compartment
   decision, additive and back-compat; lands first so every reducer test below reads a real field.
2. **A1 + A2** (types + just the C₁V₁ volumetric reducers) — pure, no risk, establishes the shape.
3. **A3** (SPE/magnetize/discard/elute/resuspend/wash, explicit-phase driven) — the correctness core
   that no one else gets right.
4. **A4** (walk + golden Zymo test) — proves it end-to-end on the real protocol.
5. **T6 (docs)** — durability.
6. **T5 (integration call-site)** only after 1–5, since its shape depends on where events actually come
   from at compile time.

Plan complete and saved. Ready to execute via subagent-driven-development; A0 + A1 + A2 first (pure,
low-risk), then A3 which is the correctness core.