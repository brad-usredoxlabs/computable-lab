# Concentration-First, Four-Layer Protocol Architecture — Gap Analysis & Plan

**Date:** 2026-08-15 (revised — north star corrected from *ratio* to *concentration*)

> **For Hermes:** Use subagent-driven-development to implement task-by-task. Plan mode — no code was
> changed for this document.

**Goal:** Answer Brad's architecture question — "are there 4 layers, do our schemas already account for
conditional vendor logic and ratio-first recipes, and where are the gaps?" — and produce a concrete,
incremental plan to close the real gaps (working-concentration-as-first-class, preserved vendor branches,
and get the authoring order back to universal → local → deck → run).

**The north star is CONCENTRATION, not ratio.** A protocol's essence is "the final assay well contains
fenofibrate at 10 nM" — irrespective of whether the stock is 1 mM, 1 µM, 100 nM, or 100×. Ratio is the
**mechanism** (C₁V₁=C₂V₂: `V_stock = C_target × V_well / C_stock`), scale and stock strength are **free
knobs**. Even the bakery comparison is a concentration: scaling "10X flour" works because the *flour:water
hydration (a concentration, `% w/v`)* stays constant, not because flour weight per se is invariant.

**Architecture (the recommended model):** Three *biologist-authoring* layers plus one *hardware-targeting*
layer. The protocol is a **per-sample recipe whose load-bearing invariant is the final working
concentration of each active component in the well** (with ratio/volume derived, scale and stock free); the
local layer realizes it for OUR lab (matrix branch, substituted reagents — stock concentration comes from
`material-spec.formulation.concentration`); the deck/automation layer compiles it onto a specific
robot/pipette (well volumes, dead volume); the run instantiates it with N samples. The load-bearing
invariant (already in spec 50 §6) is **"same verbs, same order"** across every layer — volume, duration,
temperature, deck are refinement knobs or compile artifacts, and concentration is the true conserved
quantity.

**Already in the schemas to REUSE (DRY — do not invent a parallel concentration type):**
- `schema/core/datatypes/concentration.schema.yaml` — `{value, unit, basis}`; bases molar /
  mass_per_volume / activity_per_volume / count_per_volume / volume_fraction / mass_fraction; units
  fM…M + `% v/v` / `% w/v`. **This is the concentration datatype.**
- `schema/lab/material-spec.schema.yaml` `formulation.concentration` — the STOCK concentration
  ("this stock is 1 mM"). The run/local binding provides this per material.
- `schema/lab/datatypes/amount.schema.yaml` — `{value, unit}` (untyped amount, for non-conc quantities).

**Tech Stack:** YAML JSON-schemas (`schema/workflow/*`, `schema/studies/*`, `schema/core/datatypes/*`),
Fastify server, React app, compiler specs (`compiler-specs/50-protocol-lifecycle.md`,
`81-protocol-extraction-shape.md`).

---

## 1. The question distilled — how many layers?

Your instinct is right, and the terminology matters. The repo today speaks of **three layers** in
`compiler-specs/50-protocol-lifecycle.md`:

```
GLOBAL  (platform-agnostic recipe, from vendor PDF)
   ↓
LOCAL   (lab-specific realization — "we do it in the 5810R in the 4°C walk-in")
   ↓
ACTUAL  (this run, this day — "Angel did it 08:34→08:39")
```

But your operational breakdown is really **four**, and the spec already agrees with you if you read
§3 and §11 together:

| # | Biologist-facing layer | Record kind(s) | What it holds |
|---|---|---|---|
| 1 | **Universal** (vendor, profit-optimized, conditional) | `protocol` (`protocolLayer: universal`) | roles, ratio-based steps, abstract well selection, **per-variant branches** |
| 2 | **Local** (OUR lab) | `local-protocol` (`protocolLayer: lab`) | matrix-variant chosen, substitutions (our cheaper binding buffer), parameter values |
| 3 | **Deck / automation platform** | `planned-run` + compile artifacts `execution-plan` / `robot-plan` | deck slots, pipettes, placements, tip/channelization — Opentrons/Integra |
| 4 | **Run** (N samples, actual) | `studies/run`, `event-graph` (materialized), `execution-run` | well-to-sample map, executed events, deviations |

So: **yes, there are 4 operational layers**, but note layer 3 (`execution-plan`/`robot-plan`) is a
**compile-time artifact, not a biology-authoring layer** — spec 50 §11 explicitly says the biologist
"authors C; doesn't author `.o`." You configure the deck, but you don't author biology there. That is
the precise correction to the step you're worried you jumped: adding steps in the **event-graph editor**
during universal→local binding was putting **layer-3 work in the layer-2 phase.** The order must be:

1. Universal → Local  (reduce to ratios + materials + matrix + substitutions)
2. Local → Deck/automation  (compile onto a platform: wells, pipettes, placements)  ← the event-graph editor lives HERE
3. Deck → Run  (pick 80 samples, bind them to wells)

The event-graph editor is the **layer-2→3 compiler surface**, not part of universal→local binding.

---

## 2. What the schemas ALREADY handle (verified — do not rebuild)

| Concern | Where it's handled | Status |
|---|---|---|
| Universal → Local inheritance | `local-protocol.inherits_from`; `overrides.{bindings,parameters,substitutions}` (§5.4) | ✅ solid |
| Reagent substitution (our cheaper buffer) | `local-protocol.overrides.substitutions[]` `{role, material_ref, rationale}` | ✅ solid |
| Per-sample scale is a RUN property | `planned-run.sampleMap`, `execution-scale-plan.sampleLayout.sampleCount`, `laneGroups` — NOT on protocol | ✅ solid |
| Abstract well selection (no hardcoded plate geometry) | `protocol.WellSelector` (`all`/`explicit`/`range`/`region`) + explicit comment | ✅ solid |
| Structural integrity across layers | spec 50 §6 "same verbs, same order" invariant | ✅ solid |
| Deck/pipette targeting | `planned-run.deckPlatformId`, `executionPlan.pipetteMode`, `PipetteConstraint`, `execution-plan`/`robot-plan` | ✅ solid |
| Parameterizable volumes | `Expr` (`literal` | `{param: name}`) on `volume_uL`/`duration_min`/`temperature_C` | ✅ partial |

---

## 3. The REAL gaps (this is the substance of your question)

These are the three things your example exposes that the current schemas do **not** capture:

### Gap A — Ratios are NOT first-class. Volumes are.
Your core scientific point is: *the essence of the recipe is the ratio, not the volume* —
"200µL sample : 500µL DNA/RNA Shield, then 200 : 400 binding buffer = preserves a 2:5 then 1:2
dilution chain." Scaling 20:50 then 20:40 must be the SAME protocol.

Today `StepAddMaterial.volume_uL` is a single `Expr` — it can only say "550 µL", parameterized or
literal. **There is no `ratio`/`proportion`/`dilution` field, and no notion of a dilution chain.** A
localizer that "distills the essence" would have to bake absolute µL values into steps (exactly the
4→96 trap from the previous plan, but at the volume level). This is the biggest gap.

### Gap B — Vendor conditional logic is FISSIONED, not preserved.
Spec 81 §3.1 says: *"One Protocol Candidate Per Variant."* So the vendor's "if bacterial DNA / if
mammalian cell culture" conditional is split into **separate universal protocols** at extraction time.
You lose the fact that they share one parent protocol and one branch axis — the relationship is
implicit, and the local layer can't say "this is the mammalian-cell **variant** of the Zymo protocol."
There is no `variants[]` array, no `variantRef`, no step-level `condition`/`gate`. For a biologist the
branch structure is essential biology, not a detail.

### Gap C — No explicit matrix/branch pointer on the local layer.
When our lab picks "mammalian cells" and "our proprietary binding buffer," the local protocol carries
the substitutions but **no way to say which universal branch it realizes** (`variant_id` / `condition
resolution`). Right now you'd just create an LPR that inherits the whole universal protocol and hope
the branch pick is implicit. An LPR should record: universal parent + which variant + the substitution
rationale, as first-class.

---

## 4. Recommended design — concentration-first quantity model

Make the **final working concentration** the load-bearing invariant of a step, and let ratio + volume be
**derived** at compile from it. Reuse the existing `concentration.schema.yaml` datatype (do NOT invent a
parallel one):

```yaml
# conceptual — a step's amount, concentration-first
StepAddMaterial:
  ...
  # NORTH STAR: the final assay-well concentration of the active material.
  # Fenofibrate → 10 nM in the well, whatever the stock (1 mM / 1 µM / 100 nM / 100×).
  working_concentration:
    $ref: "./datatypes/concentration.schema.yaml"     # { value: 10, unit: nM, basis: molar }
  # OPTIONAL derived convenience / authoring proxy: the dilution ratio this step achieves.
  # "sample:diluent = 1:2.5" is the mechanism; it is DERIVED from (or checked against)
  # working_concentration + target well volume + stock concentration.
  ratio: ReferenceRatio                                # optional, advisory
  # well volume is a scale/compile fact, NOT authored here (deck layer owns dead volume)
```

**The resolution rule (bakery-by-weight made precise, with concentration as the invariant):**

```
Given:
  C_target   = working_concentration            (recipe — the north star, e.g. 10 nM)
  C_stock    = material-spec.formulation.concentration   (lab/run binding — e.g. 1 mM)
  V_well     = final well volume                (deck layer + run sampleCount-derived)
Derive:
  V_stock    = C_target × V_well / C_stock      (volume of stock to dispense — the ratio in disguise)
  V_diluent  = V_well − V_stock
  master mix = per-well active amount × run.sampleCount   (batch total, + dead volume)
```

- **North star locked:** `working_concentration` (10 nM) never changes as stock strength or batch size
  changes.
- **Stock strength is a free knob:** swap 1 mM → 1 µM stock and `V_stock` auto-scales; the 10 nM target
  is untouched. This is also exactly where "our cheaper binding buffer" substitutions bind via
  `local-protocol.overrides.substitutions` (each substituted material's `formulation.concentration`).
- **The bakery analogy is a concentration:** "10X flour" scales because hydration (flour:water = a
  `% w/v` concentration) is lock-step; flour weight is not the invariant, the dough's water content is.
- **Scale is a run fact:** `sampleCount` only changes the batch total, never `C_target`.

**Where concentration lives by layer:**

| Layer | What carries the concentration facts |
|---|---|
| Universal protocol | step `working_concentration` (the north star) + optional advisory `ratio` |
| Local protocol | `overrides.substitutions` swap materials (each carries its own stock `formulation.concentration`); `overrides.parameters` may pin C_target |
| Planned run | resolves `V_stock = C_target × V_well / C_stock` against `sampleMap`/`sampleCount` at compile |
| Deck / robot | final well volume, dead volume / pipette dead-space → concrete µL per well |

For conditional/variant logic: add a `variants` concept to the universal `protocol` so the extractor
keeps branch structure, and a `variantRef` on the local layer.

---

## 5. Bite-sized tasks (TDD, independent; do 1–3 first, 4–5 are design sessions not code)

### Task 1: Document the four-layer model + ratio-first invariant in the spec

**Objective:** Make the 4 layers and the ratio-first invariant durable so nobody re-litigates it.

**Files:**
- Modify: `compiler-specs/50-protocol-lifecycle.md`
  - Add a §2 footnote / §3 note: "Operator-authoring is 3 layers + 1 compile layer; event-graph editing
    belongs to Local→Deck (compile), NOT Universal→Local binding."
  - Add a "ratio-first" principle: a protocol step carries ratios / base volumes, never a baked
    absolute well total; scale is resolved at the run, not authored in the recipe.
- Modify: this repo's plan dir as the working note until the spec edit lands.

**Step 1:** Add the "4 layers + ratio-first" subsection.
**Step 2:** Add the authoring-order rule (Universal→Local before Local→Deck before Run).
**Step 3:** Commit `docs(spec): four-layer lifecycle + ratio-first invariant`.

---

### Task 2: Add a forward-only `variants` scaffold to the universal protocol schema (schema-level)

**Objective:** Give the universal `protocol` a structured `variants[]` array (branch label,
starting-material kind-hint, per-variant step pointers) WITHOUT yet changing step volume semantics,
so conditional vendor logic stops being fissioned at extraction.

**Files:**
- Modify: `schema/workflow/protocol.schema.yaml` (add `$defs/ProtocolVariant` + `variants` property,
  `unevaluatedProperties: false` must allow it; keep steps unchanged so nothing breaks).
- Test: `server/test/...` schema-validation test that a protocol with a `variants[]` array validates,
  and an unknown field still fails (guards `unevaluatedProperties`).
- Modify (extraction): `server/src/protocol/ProtocolExtractionService.ts` — when extraction sees
  branched starting-material logic, populate `variants[]` with shared parent + per-branch labels
  instead of (or in addition to) fissioning into separate candidates. Keep fission as fallback until
  the local layer can express a branch pick.

**Step 1 (TDD):** Write schema tests: `variants: [{ label: 'mammalian-cell', stepIds: ['s1','s2'] }]`
validates; a misspelled sibling field fails `unevaluatedProperties`.
**Step 2:** Implement `ProtocolVariant` + `variants` in the schema.
**Step 3:** Wire the extractor to emit `variants[]` (additive; keep existing single-candidate path).
**Step 4:** `cd server && npx vitest run <extraction|schema test> && npx tsc --noEmit` → green.
**Step 5:** Commit `feat(schema): universal protocol variants[] preserves vendor branches`.

---

### Task 3: Add `variantRef` to the local protocol (schema-level)

**Objective:** Let an LPR declare WHICH universal branch + substituted materials it realizes, as
first-class links (the "mammalian + our binding buffer" pick).

**Files:**
- Modify: `schema/workflow/local-protocol.schema.yaml` — add optional `variantRef` (a ref to a
  `protocol` variant) alongside `inherits_from`.
- Modify (frontend): `app/src/editor/taptab/widgets/ProtocolAuthoringWidgets.tsx` (or wherever the local
  protocol authoring form is) — a read-only display of the inherited parent + chosen variant.
- Test: schema test + a frontend test if the widget exposes the label.

**Step 1 (TDD):** schema test — LPR with `variantRef` validates; unknown field fails.
**Step 2:** Implement `variantRef`.
**Step 3:** Wire a display-only `inherits_from / variant` line in the LPR form.
**Step 4:** typecheck server+app, run schema test.
**Step 5:** Commit `feat(schema): local-protocol variantRef links the realized universal branch`.

---

### Task 4: DESIGN SESSION (no code) — working-concentration-first quantity model — **DECISION: APPROVED (2026-08-15, north star corrected from ratio to concentration)**

**Objective:** Decide the exact `working_concentration`-first quantity schema + how the run/compile layer
resolves concentration → stock volume → well volume. **Brad approved going concentration-first** — "the
north star is that in the final assay plate, the concentration is 10 nM, whether the starting stock is
1 mM or 1 uM or 100 nM or 100X" — and the bakery analogy is itself a concentration (hydration), not a raw
ratio. Ratio is the mechanism, not the invariant.

**Deliverable:** `compiler-specs/working-concentration-quantity.md` — WRITTEN (see plan companion). It
defines:
- `working_concentration` on a step, reused from the EXISTING `concentration.schema.yaml` datatype
  `{ value, unit, basis }` (molar / mass_per_volume / … / % w/v / % v/v) — do NOT invent a parallel type.
- Resolution at the `execution-plan` compile step: `V_stock = C_target × V_well / C_stock`, batch total
  = per-well × `sampleCount` (+ dead volume). The C₁V₁=C₂V₂ rule — the exact bakery-by-weight rule.
- Stock concentration comes from `material-spec.formulation.concentration`; substitutions swap materials
  (each carrying its own stock concentration) so "our cheaper binding buffer" keeps C_target untouched.
- Advisory `ratio` stays optional (a derived/authoring proxy for `sample : diluent`), never the invariant.
- `setting.schema` adds a `concentration` type (like `volume`), reusing the same unit enum; no breaking change.
- Migration path: `working_concentration` is **additive** — every step keeps its legacy `volume_uL` for
  backward compatibility; a step declaring `working_concentration` is resolved at compile.

**Acceptance:** Brad reviews `compiler-specs/working-concentration-quantity.md`; it gates implementation
(Task 6+).

---

### Task 5: DESIGN SESSION (no code) — authoring order UX correction

**Objective:** Confirm the event-graph editor surfaces belong at Local→Deck, not Universal→Local, and
plan the minimal UX change so a biologist lands in the right surface per layer.

**Deliverable:** a short design note (add to `compiler-specs/50-protocol-lifecycle.md` §12):
- Where the sample-map / sample-count control lives (already in the previous plan).
- Where the deck/automation editor lives (layer 3 binding).
- What the protocol-planning main pane shows per layer.

---

## 6. Explicitly NOT in scope (YAGNI)

- No schema change to make `protocol`/`local-protocol` store a **sample count** — scale belongs to the
  run (established in the prior plan).
- No new backend execution pipeline for ratio→volume resolution until Task 4's design is approved.
- No deep refactor of the existing `volume_uL` steps — NF ratio is an **additive** new option with a
  migration path, not a breaking replacement.
- No multi-run aggregate planning.

---

## 7. Verification

1. `cd server && npx vitest run <affected test files> && npx tsc --noEmit` → green (Tasks 2–3).
2. `cd app && npx tsc --noEmit` (Task 3 frontend).
3. Confirm Task 1's spec text reads clearly and Task 4/5 design notes exist for Brad's review.
4. Regression: schema-validate all existing records after adding `variants`/`variantRef` (must remain
   optional so nothing existing breaks).

## Risks / tradeoffs / open questions

- **Open — the big one:** is RatioQuantity (Task 4) the right abstraction, or do you want to keep steps
  volume-based but add an "at dilution/ratio" hint? The NF-ratio design is my recommendation because it
  makes the recipe literally scale-invariant; but it is the largest change and deserves your design sign-off.
- **Risk:** `unevaluatedProperties: false` on `protocol`/`local-protocol` means adding fields must be
  additive and optional, or every existing record fails validation. Tasks 2–3 are scoped exactly to avoid that.
- **Tradeoff:** preserving `variants[]` vs. keeping "one protocol per variant" extraction. Keeping the
  fission path as fallback avoids a risky extraction rewrite while we add the structured branch.
- **Ordering:** Tasks 1–3 (doc + two additive schema fields) are low-risk and ready to execute. Tasks
  4–5 are design sessions that gate the ratio-first and authoring-order work — they need your input.

## Execution handoff

Plan complete. Ready to execute via subagent-driven-development. Recommended sequence:
1. Execute Tasks 1–3 (doc + additive schema: `variants[]`, `variantRef`) — low risk.
2. Pause for your review of the Task 4 (RatioQuantity) and Task 5 (authoring order) design notes before
   any untangling of step volumes or the event-graph placement.

Shall I proceed with Tasks 1–3?