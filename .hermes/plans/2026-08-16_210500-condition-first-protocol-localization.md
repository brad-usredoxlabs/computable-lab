# Condition-First Protocol Localization — Resolve Branches BEFORE Starting Steps

**Date:** 2026-08-16
**Status:** ✅ COMPLETE — all tasks (1, 2, 3, 4, 5, 6) implemented, committed & green.
**Owner:** Architect (122B)

> **For Hermes:** Use subagent-driven-development to execute task-by-task after approval.

**Goal:** Make vendor **if/then/else logic** (choice of sample type — e.g. bacterial vs mammalian DNA — or
labware type — e.g. tubes-in-rack vs 96-well) a **first-class, executable** part of the protocol pipeline,
not a passive label. On universal → local instantiation, **begin with resolving the high-level branch axes**
(sample type, labware format); that resolved choice then **determines the resultant starting step set**.
At ingestion, capture branches as a **basic condition template** (a reusable predicate shape), instead of
opaque strings that dump every step into every branch.

**Architecture:** Two moves, one on each side of the localization seam:

1. **Ingestion — a lightweight, templated condition primitive.** The extractor already preserves
   `protocol.variants[]` and a per-step `branches[]`/`conditions` on the vendor candidate — but `branches`
   are opaque strings and `conditions` only describe physical quantities (volume/duration/temp/speed). Add a
   small, declarative **`IfThenElse` / `Condition` template** (reusing the reserved `preconditions`
   predicate-DSL from `compiler-specs/20-event-graph-ir.md` §6 where the vocabulary overlaps) so the source's
   decision — *"if sample_type == 'mammalian cell culture' then steps [A,B]; else steps [C]"* — is captured
   structurally, per branch axis.
2. **Localization — branch resolution is phase 0.** Restructure the universal → local step so that the
   first action is **resolving each branch axis to a concrete choice** (sample type, labware format), which
   **filters the universal step set** to the selected branch(es) to produce the local protocol's starting
   steps. `variantRef` stops being a passive pointer and becomes a **resolved decision that materially gates
   steps**.

**Tech Stack:** declarative condition DSL (predicate-DSL vocabulary) + YAML JSON-schema
(`schema/workflow/vendor-protocol-candidate.schema.yaml`, `schema/workflow/protocol.schema.yaml`,
`schema/workflow/planned-run.schema.yaml`), the ingestion extractor/candidate path, and the localization
pass(es) (`local-protocol-compile` pipeline + `ProtocolCompiler.lowerToLabProtocol`). Pure functions + TDD
(Vitest) for the resolution logic (consistent with this repo's `compiler/math/*` conventions).

---

## 0. "Does such a thing exist?" — verified current state

| Concern | Exists today? | Where | Gap |
|---|---|---|---|
| Vendor candidate captures branches | ✅ | `vendor-protocol-candidate.schema.yaml` step `branches: string[]` | opaque refs; no structure |
| Vendor candidate captures conditions | ✅ but physical-only | step `conditions: {volumes, durations, temperatures, speeds}` | **no logical if/then/else** |
| Universal protocol preserves branch axis | ✅ | `protocol.variants[]` (`ProtocolVariant`: `variantId, label, starting_material, kind_hint, stepIds`) | labels + stepIds only; not executable |
| Local protocol names its branch | ✅ | `local-protocol.variantRef` (`variants[].variantId`) | passive pointer |
| Event condition DSL | ⚠️ reserved | event detail `preconditions` (`20-event-graph-ir.md` §6 — "not validated in v1"); plus a separate foundry deck-variants axis (`manual_tubes`/`bench_plate_multichannel`/`robot_deck`) | unused / unrelated to biological branch axis |
| **Executable if/then/else that GATES step selection at localization** | ❌ **NO** | — | **this is the gap to close** |

**Bottom line for Brad:** a *basic templating of conditions* does **not** exist today. The pieces that exist
(branch labels, `variantRef`, reserved `preconditions`) are a data skeleton, not a decision. The safest
primitive to reuse is the **`preconditions` predicate-DSL vocabulary** (`CompoundExpression` / `!`, `&&`, `||`,
`==`, `in`, `exists`, …) already reserved on events — so a condition template on a step and a predicate on an
event speak the same language (DRY). A materialized `preconditions`-style predicate is *semantically* the
condition gate, just currently unvalidated at the pipeline level.

---

## 1. The design, made precise

### 1.1 The branch axes we must separate (important — they are NOT one thing)

Vendor "if/then/else" splits into axes that resolve at **different layers**:

| Axis | Deciding question | Resolution layer |
|---|---|---|
| **Sample-type branch** (bacterial DNA / mammalian cell culture) | biology — changes *steps, materials, volumes* | **Localization** (universal → local) — this is Brad's primary ask |
| **Labware-format branch** (tubes in rack / 96-well) | procedure — vendor changes *well handling & per-volume* | **Localization** first (it alters the recipe), then the deck format is a **run** property (`sampleMap` + `deckPlatformId`) |
| Deck variant (`manual_tubes`/`bench_plate`/`robot_deck`) | automation — compile artifact | Run/deck (existing foundry axis; leave alone) |

**Platform is NOT a branch of the recipe — it is orthogonal.** The same 384-well recipe runs on an Integra
*or* an Opentrons; picking a robot does not change the biology or the starting steps. But the user may still
wish to **open localization by naming a target platform** (an intent/capability scoping step: "I'm localizing
this for our Integra," "…for Opentrons"), so composer/capability checks (pipette constraints, tip/channel
models) apply from the start. That platform selection is recorded as a **localization intent** (a planned-run
`deckPlatformId` forward-pointer / a local-protocol platform intent), NOT as a branch axis — it gates *deck
compilation*, never the *recipe's step set*. §1.1 therefore resolves **sample-type + labware-format** at
localization (they change the starting step set); **platform** is an orthogonal early intent that scopes the
target platform ahead of deck compilation, and **deck variant/format** stay run-time compile facts.

The plan resolves **sample-type + labware-format** branches at localization (they change the *starting step
set*), and leaves deck-variant + deck-format as run-time compile facts as already designed. This separation
is stated explicitly so we don't conflate "which branch of the recipe" with "which robot."

### 1.2 The condition template (ingestion side)

A branch axis on a vendor protocol becomes a small declarative template. Model after the reserved
`preconditions` predicate-DSL so it is one vocabulary everywhere:

```yaml
# conceptual — a branch axis on the universal protocol / vendor candidate
branch_axes:
  - axisId: sample_type              # 'sample-type' universal axis
    label: "Starting sample type"
    conditions:
      - id: bacterial
        predicate: { op: eq, path: "$.sampleType", value: "bacterial dna" }
        then_stepIds: [ lys-bact, bind-1, wash-1, elute-1 ]
      - id: mammalian
        predicate: { op: eq, path: "$.sampleType", value: "mammalian cell culture" }
        then_stepIds: [ lyse-mam, bind-1, wash-1, elute-1, grind-1 ]
```

- Reuse the predicate ops from the **existing `PredicateEvaluator` / `*.lint.yaml` DSL**
  (`exists`, `nonEmpty`, `regex`, `equals`, `in`, `all`, `any`, `not` — `server/src/lint/PredicateEvaluator.ts`).
  That is a *real, already-implemented* condition language in this repo; wiring it for **arch/template
  selection** (not just lint) is the DRY reuse.
- Each branch has a stable `variantId` that converges with the **existing `protocol.variants[].variantId`**
  and the **existing `local-protocol.variantRef`** — so the ingestion template, the universal branch, and the
  local pointer all share one identifier namespace.
- `shared_stepIds` (steps that run on every branch) alongside per-branch `then_stepIds`, so the unified step
  list = shared ∪ selected-branch, in `steps[].order`-declared order. **This is the "starting step set."**

### 1.3 Branch resolution as phase-0 of localization

The localization entry (universal → local, and universal plan → planned-run's lab compilation) gains a
**first** pass: `resolve_branch_axes`.

```
resolve_branch_axes(universalProtocol, choices):
  # choices: { sampleType: 'mammalian cell culture', labwareFormat: 'tubes_in_rack' }
  activeVariantIds = {}
  for axis in universalProtocol.branch_axes:
    for cond in axis.conditions:
      if evalPredicate(cond.predicate, choices): activeVariantIds += cond.then_stepIds
  return {
    activeVariantIds,                       # branch-step ids that are IN
    unresolvedAxes: [...],                  # axes with no matching condition → a review warning (never silent default)
  }
```

- The resultant **starting steps** = `shared_stepIds` ∪ steps whose `stepId ∈ activeVariantIds`, ordered.
- **Unresolved axis** (the user gave a sample type that matches no branch): produce a **blocking diagnostic**,
  not a silent pass-through — exactly the philosophy of `resolveWorkingConcentration`'s `{ok:false, gap}`.
- The resolved choices are recorded on the local protocol as the **resolved** `variantRef` set (one per axis),
  so provenance reads "this LPR realizes sample_type=mammalian of the Zymo kit, tubes-in-rack."

### 1.4 `variantRef` evolves from a single label to a resolved choice set

Today `local-protocol.variantRef` is one string. It becomes the **resolved, per-axis** choice:

```yaml
# local-protocol, after branch-aware localization
branch_resolution:
  - axisId: sample_type
    choice: mammalian
    variantRef: mammalian                   # identical id namespace to universal variants[].variantId
    matched: true
  - axisId: labware_format
    choice: tubes_in_rack
    variantRef: tubes_in_rack
    matched: true
```

Keep the existing `variantRef` field for back-compat (a single-axis protocol still writes one string); add
`branch_resolution[]` as the structured, multi-axis home.

---

## 2. Files

### New
- `schema/workflow/datatypes/condition.schema.yaml` — the declarative `Predicate` (reused ops) + `BranchAxis` /
  `IfThenElse` shape, `$ref`-able from vendor-candidate and protocol. Root: `Predicate` reused from
  `PredicateEvaluator` ops; `BranchAxis { axisId, label, conditions: [{ id, predicate, then_stepIds, else_stepIds? }], shared_stepIds? }`.
- `server/src/protocol/BranchResolver.ts` — pure `resolveBranchAxes(protocol, choices) → { activeStepIds, unresolvedAxes }`.
  Mirrors `WorkingConcentrationResolver` conventions (`{ok:true,…}|{ok:false,gap}`).
- `server/src/protocol/BranchResolver.test.ts` — TDD unit tests.
- `server/src/compiler/pipeline/passes/ResolveBranchAxesPass.ts` — drop-in pass for the `local-protocol-compile`
  and run-plan pipelines.
- `server/src/compiler/pipeline/passes/ResolveBranchAxesPass.test.ts`.

### Modify (additive, back-compat)
- `schema/workflow/vendor-protocol-candidate.schema.yaml` — extend step shape: add `branch_axes` / structured
  `conditions` (logical predicates) alongside the existing physical `conditions`; keep `branches[]` for back-compat.
- `schema/workflow/protocol.schema.yaml` — add step-level `gatedBy?: string[]` (list of `variants[].variantId`
  this step belongs to) + top-level optional `branch_axes` (universal). `stepIds` already on `ProtocolVariant`.
- `schema/workflow/local-protocol.schema.yaml` — add `branch_resolution[]` + stage `variantRef` as back-compat.
- `server/src/protocol/ProtocolExtractionService.ts` (or the foundry path that emits `variants`) — emit
  `branch_axes` with real predicates from the vendor text instead of only `branches[]` strings, mirroring
  how `variants_detected` is already surfaced.
- `server/src/compiler/protocol/ProtocolCompiler.ts` (`lowerToLabProtocol`) — run `resolveBranchAxes` as the
  FIRST action; filter `steps` to shared ∪ selected before emitting the lab-layer protocol.
- (Docs) `compiler-specs/50-protocol-lifecycle.md` — add a "branch axes resolve before starting steps" §.

---

## 3. Bite-sized tasks (TDD, each committable)

### Task 1: `condition` datatype + `branch_axes` on the universal protocol (schema)
**Objective:** give a protocol a declarative, templated branch axis (predicate + per-branch step ids + shared).
**Files:**
- Create: `schema/workflow/datatypes/condition.schema.yaml` (`Predicate` reusing lint ops; `BranchAxis`).
- Modify: `schema/workflow/protocol.schema.yaml` — add optional top-level `branch_axes`; add `gatedBy?: string[]`
  on `ProtocolStep`.
**Step 1 (TDD):** schema test `server/src/schema/...` — a protocol with a well-formed `branch_axes[]` validates;
a `Predicate` with an unknown op fails; a misspelled sibling fails `unevaluatedProperties`.
**Step 2:** implement the datatype + field additions.
**Step 3:** `cd server && npx vitest run <schema test> && npx tsc --noEmit` green.
**Step 4:** commit `feat(schema): declarative branch_axes + step gatedBy on protocol` .

### Task 2: `BranchResolver` (pure) — resolve axes → starting step set (TDD)
**Objective:** the deterministic resolver that maps `{choices}` → ordered `activeStepIds` (+ unresolved axes).
**Files:** Create `server/src/protocol/BranchResolver.ts` + `.test.ts`.
**Step 1:** failing tests: sample-type branch picks the shared∪mammalian set; tubes-vs-96well picks the
labware branch; an unmatched choice → `{ok:false, gap}` (never silent pass-through).
**Step 2:** implement using the **existing `PredicateEvaluator`** (`server/src/lint/PredicateEvaluator.ts`) to
interpret `predicate` (DRY — do not write a second predicate engine).
**Step 3:** `npx vitest run server/src/protocol/BranchResolver.test.ts && npx tsc --noEmit` green.
**Step 4:** commit `feat(protocol): BranchResolver maps branch choices to the starting step set`.

### Task 3: Extraction emits `branch_axes` from vendor text (ingestion templating)
**Objective:** the candidate/universal step carries a real IfThenElse template, not just `branches[]`.
**Files:** Modify `server/src/protocol/ProtocolExtractionService.ts` (+ the `variants_detected` path) to emit
`branch_axes` with extracted predicates; extend the extraction test asserting `variants_detected` now also
produces `branch_axes[*].conditions[*].predicate`.
**Verify:** `npx vitest run <extraction test> && npx tsc --noEmit` green.
**Commit:** `feat(ingestion): template vendor if/then/else as branch_axes predicates`.

### Task 4: Localization begins with branch resolution (the core ask)
**Objective:** `lowerToLabProtocol` (and the run-plan lab compile) resolve `branch_axes` FIRST and derive the
local protocol's starting steps from the resolved branch — not keep every step + a passive pointer.
**Files:**
- Modify `server/src/compiler/protocol/ProtocolCompiler.ts` — run `resolveBranchAxes` before emitting; filter
  `steps` to shared ∪ active.
- Modify `schema/workflow/local-protocol.schema.yaml` — add `branch_resolution[]` (per-axis resolved choice);
  keep `variantRef` back-compat.
**Step 1 (TDD):** a `ProtocolCompiler` test — a protocol with `branch_axes` + `choices:{sampleType:'mammalian…'}`
lowers to a lab protocol whose step list contains only the mammalian branch steps (shared + selected), and an
unresolved axis → a blocking diagnostic.
**Step 2:** implement.
**Step 3:** verify + commit `feat(compiler): localization resolves branch axes before starting steps`.

### Task 5: `ResolveBranchAxesPass` for the local-protocol-compile pipeline
**Objective:** make branch resolution a first-class pass on the compile path (parallel with Task 4's direct
call, so both entry points behave the same).
**Files:** Create `server/src/compiler/pipeline/passes/ResolveBranchAxesPass.ts` + test; register in the
`local-protocol-compile` pass list (same shape as `LocalProtocolPasses`).
**Verify:** pass unit test green; existing compile pipeline tests unchanged.
**Commit:** `feat(compiler): ResolveBranchAxesPass on the local-protocol-compile pipeline`.

### Task 6: Docs — "branches resolve before starting steps" in the lifecycle spec
**Objective:** make the branch-first localization durable.
**Files:** Modify `compiler-specs/50-protocol-lifecycle.md` — new subsection: branch axes (sample-type &
labware-format) resolve at localization phase 0; deck-variant + deck-format stay run/deck facts (per §1.1).
**Commit:** `docs(spec): branch-first localization in the protocol lifecycle`.

---

## 4. What this unlocks
- A biologist ingesting a vendor kit with "if bacterial / if mammalian" sees both branches, picks the one for
  TODAY's run, and the local protocol's starting steps are exactly the chosen branch + shared steps — no hand
  deletion of the other branch, no silent assumption.
- The well-state tracker (already built) then verifies the resulting run's composition *per chosen branch*.
- Labware-format branches ("tubes in rack vs 96-well") resolve into the right per-volume recipe, while deck
  format stays a run knob (`sampleMap` + `deckPlatformId`).

## 5. Risks / trade-offs / open questions
- **Predicate vocabulary reuse:** safest is to interpret `Predicate` with the existing `PredicateEvaluator`.
  Risk: its `evaluatePredicate` is stateless (no store access) — fine for `choices` lookup (`$.sampleType`),
  but a branch on a *record-derived* value would need a value passed in. Plan keeps predicates over the
  `choices` map only (YAGNI).
- **Single vs multi-axis `variantRef`:** keeping `variantRef` as back-compat while adding `branch_resolution[]`
  avoids breaking existing LPRs; recommend the structured array as the real home.
- **Unresolved-branch handling:** must be a visible blocking/review diagnostic, per the repo's "never silently
  fabricate" canon (same as missing-stock-concentration).
- **Scope boundary:** deck-variant (`manual_tubes`, …) and deck format are deliberately OUT — they're run/deck
  facts, not recipe branches.

## 6. Suggested sequencing
1. **Task 1** (condition datatype + `branch_axes`) — the structural primitive everything reads.
2. **Task 2** (pure `BranchResolver`) — deterministic, low-risk, establishes the semantics.
3. **Task 3** (extraction templating) — makes ingestion *emit* the template.
4. **Task 4** (localization resolves-first) — the core ask, worth a design pass on the exact
   `lowerToLabProtocol` seam before coding (it is the highest-touch step).
5. **Task 5** (pass form) — parallelize the behavior onto the compile pipeline.
6. **Task 6** (docs) — durability.

Plan complete and saved. Ready to execute via subagent-driven-development; the recommended first step is
Task 1 (schema) + Task 2 (pure resolver) — low risk, establishes the template primitive and the resolution
semantics — before the more invasive Task 4 (localization rewrite). Shall I proceed, and do you want to
confirm the branch-axis split in §1.1 (biology + labware-format resolve at localization; deck-variant stays a
run fact)?