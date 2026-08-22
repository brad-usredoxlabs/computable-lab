# Sample Count is a Run Property, not a Protocol Property — Architecture Plan

**Date:** 2026-08-15

**Goal:** Answer the conceptual question — "where does the n-samples count live and how
does it flow universal → local → actualized run?" — and scope the (deliberately small)
enforcement/surfacing changes so the tool makes this correct for biologists, not just coders.

**Architecture (the answer):** A protocol (universal or local) is a **per-sample recipe**,
NOT a recipe for a fixed count. It declares *per-well / per-sample* operations (550 µL per
well), abstract well selection, and parameter references — and carries **NO sample count**.
The sample count is a **property of the PLAN/RUN** (the actualization instance): it lives in
`planned-run.sampleMap` / `execution-scale-plan.sampleLayout.sampleCount` and drives which
wells get populated on the deck. So you do NOT change a protocol parameter "from 4 to 96" —
you create a run whose sample map populates 96 wells, and the per-sample recipe scales unchanged.

**Tech Stack:** YAML JSON-schemas (`schema/workflow/*`, `schema/studies/*`), TypeScript React
frontend (`app/src/graph/BindingMode/`, `app/src/run/`), Fastify server, live-browser verify.

---

## 0. Current state — the model already separates recipe from scale (verified)

| Layer | Record | Holds | Sample count? |
|---|---|---|---|
| Universal protocol | `schema/workflow/protocol.schema.yaml` | roles, steps, per-well `volume_uL` as `Expr` (literal **or** `{param: name}`), abstract `WellSelector` (all/explicit/range/region), `Setting` step params | **No** — scale-agnostic by design |
| Local protocol | `schema/workflow/local-protocol.schema.yaml` | `setup` rows (labwares/equipment/materials), `overrides.{bindings,parameters,substitutions}` | **No** — realizes roles, not counts |
| Planned run | `schema/workflow/planned-run.schema.yaml` | `sampleMap` (well→label, else implicit A1=sample1, B1=sample2…), `executionPlan.laneGroups`, `deckLayout` | **YES — this is the layer that carries it** |
| Run (actualized) | `schema/studies/run.schema.yaml` | event graph of executed wells, deviation/execution tracking | **YES — derived from planned-run sample map / event graph** |
| Scale plan | `schema/workflow/execution-scale-plan.schema.yaml` | `sampleLayout.sampleCount`, `wellGroups`, lanes | **YES — the dedicated count carrier** |

**Proof the count is NOT in the protocol:** grep across `schema/` for `sampleCount`/`numSamples`/
`replicates` hits only `protocol-ide-session` (an authoring aid), `planned-run` lanes, and
`execution-scale-plan` — never on the `protocol` or `local-protocol` record. Step `StepAddMaterial`
requires `{kind, target, wells, material, volume_uL}`; `volume_uL` is an `Expr` (can be a `param`
reference) and `wells` is an abstract `WellSelector` — the comment on `WellSelector` says:
*"must be resolvable by the execution layer given a bound labware instance… avoid hardcoding
plate geometry."* That is the intended seam: scale resolves at the run, not the recipe.

**Frontend seam:** `app/src/graph/BindingMode/SampleBindingPanel.tsx` sets the sample map
(`POST /runs/:id/sample-map`, mode `implicit` or `csv`); `BindingModeEditor.tsx:329` defaults
`sampleCount` to `labContext?.sampleCount ?? 96`. `protocol-ide-session.sampleCount` is only an
authoring override (what you're looking at while drafting), explicitly *not* execution truth.

---

## The conceptual answer (for biologists)

A protocol says: *"put 550 µL into every occupied well of the bashing-bead rack."* It does not
say "4 racks" or "96 wells." The **recipe is throughput-independent.** The number of occupied
wells is a decision you make about a specific **run**, not about the protocol:

- When you bring a universal protocol into THIS lab, the **local protocol** specializes the
  recipe to your actual instruments/labware/materials (the "This assay needs" setup, bindings,
  per-step settings). Still no count.
- When you plan a **run** ("I have 4 samples" or later "96 tubes"), that run binds a
  **sample map** — well→sample label (or implicit well order) — and the deck populates only
  those wells. The same local protocol drives both a 4-sample run and a 96-sample run.

**So: do NOT hardcode 4 into the localized protocol.** If you build the local protocol while
thinking "4 samples," keep the per-sample math as-is (550 µL per well, well selector abstract)
and put the 4 (or 96) into the run's sample setup. Changing scale later = editing the **run's
sample map**, never the protocol. This is what keeps a protocol reusable, versionable, and citable.

**Why this matters for correctness (not pedantry):** if `4` were baked into the local protocol
as a literal, then a 96-well run inheriting it would either silently under-pipette (if the count
divides volumes) or over-pipette. The schema avoids this by making `volume_uL` an `Expr` that can
reference a parameter resolved at the run, and well-selection abstract. The one real hazard to
guard is an agent/author baking a *literal well list or total volume* into a step — enforcement
below keeps that out.

---

## Gap analysis (what actually needs work)

The model is correct; the code mostly honors it. Remaining gaps, smallest-first:

1. **Local-protocol authoring can bake literals.** `protocol-ide-session` lets the AI/user set
   `sampleCount`, and step `settings`/`volume_uL` can hold literal numbers. Nothing today *prevents*
   a localized step from carrying a literal well list (`wells: [A1..A96]`) or a total volume,
   which would re-introduce the "change 4→96 in the protocol" trap. → **Enforcement/lint.**
2. **Sample count is not surfaced in the Protocol-Planning main-pane flow** (the deck the user is
   looking at). It lives in `BindingModeEditor` (a different screen) and the run's event-graph
   population. A biologist in Protocol Planning mode has no visible "this run processes N samples"
   affordance → the default `96` is invisible. → **Surfacing.**
3. **No run-scoped count on the `run` record.** `run.schema.yaml` derives scale from the event
   graph / planned-run sample map but has no independent convenience field. → Optional; add only
   if the surfacing work needs a stable anchor.

Do NOT over-build. The schema already carries the concept (`sampleMap`, `sampleCount`,
`laneGroups`). This is enforcement + one visible affordance, not a schema overhaul.

---

## Concrete semantics the tools should express (target behavior)

- **Universal protocol step volume** = per-well (per-sample) `Expr`; may be a `param` ref, never a
  function of a fixed count.
- **WellSelector** stays abstract (`all` / `range` / `region`) in the protocol; explicit well lists
  are a **run** concern (`sampleMap`), not a recipe concern.
- **Local protocol** may pin roles + parameter *values* but not a well **count**.
- **Run** owns `n`: sample map entries / populated wells count; changing `n` changes only the run.

---

## Proposed changes (each a bite-sized, independent task)

### Task 1: Document the contract — `compiler-specs` note (do first, ships the answer)

**Objective:** Make the "sample count is a run property" decision durable in the repo so nobody
re-litigates it.

**Files:**
- Modify: `compiler-specs/protocol-lifecycle.md` (or the relevant spec; add/replace a §5 note)
  — or create `docs/sample-scale-semantics.md` if no natural home. Verify which exists first.

**Step 1:** Add a "Sample scale semantics" section:
- A protocol is a per-sample recipe; `volume_uL` is per-well; `wells` is abstract.
- `n` samples lives on the planned-run/run (`sampleMap`, `execution-scale-plan.sampleLayout.sampleCount`).
- Localization must NOT bake a literal well count or total volume into a step.
- Changing scale = editing the run's sample map, never the protocol.

**Step 2:** This plan file itself serves as the working note until the spec edit lands.

**Step 3:** Commit `docs(spec): sample scale is a run property, not a protocol property`.

---

### Task 2: Guard — compile/lint rejects run-scale literals in protocol steps (TDD)

**Objective:** Add a schema or lint rule so a protocol/local-protocol step cannot carry a
count-dependent literal that reintroduces the 4→96 trap.

**Files:**
- Explore: `schema/workflow/protocol.schema.yaml` `Step*` + `WellSelector`; the protocol lint rules
  (`schema/lint/`, `server/src/lint/` or wherever the shortSlug / id-shape rules from recent
  commits live — check `git log` for the lint task).
- Test: existing lint test file.
- Modify: the lint rule set.

**Step 1 (investigate):** Find the lint architecture. Recent commits `591fda9 feat(lint): shortSlug…`,
`a5ab375 feat(lint): run-has-parent-link…` — mirror their pattern. Run `git show a5ab375` to see the
rule shape before adding a new rule.

**Step 2:** Write a failing test: a step whose `volume_uL` is a literal AND whose `wells` is an
explicit list spanning more than one well is a **warning** (not an error — a manual 6-well run is
legal). Severity: `warning`, code e.g. `protocol.step.run_scale_literal`.

**Step 3:** Implement the rule: flag steps where `wells.kind === 'explicit'` (a fixed well list)
or `volume_uL` is a plain literal with no `param` reference **and** the step also has a `Setting`
that looks like a well/count override (e.g. a setting whose value equals the well-list length). Keep
it conservative — aim to catch the *localization ghost* baking `[A1..A96]` into a step.

**Step 4:** Run lint tests; green.

**Step 5:** Commit `feat(lint): warn on run-scale literals baked into protocol steps`.

---

### Task 3: Surface scale in the Protocol-Planning main pane (small UI affordance)

**Objective:** In the run the user is looking at (`RUN-wednesday-afternoon-run-2ze0`,
Protocol Planning mode), show a visible, editable "Samples: N" control on the "This assay needs"
panel so a biologist sees that scale is a run decision (and that the pose → plate resolution is
driven by this, not by a protocol parameter).

**Files:**
- Modify: `app/src/event-editor/right-pane/protocol/ProtocolTabPanel.tsx` (setup section header area).
- Modify: `app/src/event-editor/right-pane/protocol/protocolTabPanel.css`.
- Test: `app/src/event-editor/right-pane/protocol/ProtocolTabPanel.test.tsx`.
- Read (edit only if needed): `app/src/graph/BindingMode/SampleBindingPanel.tsx` and its
  `setPlannedRunSampleMap` API as the backend seam.

**Step 1:** Add a compact "Samples" stepper/input under "This assay needs" (e.g.
`data-testid="protocol-sample-count"`), initialized from `plannedRun.sampleMap.entries.length`
or `execution-scale-plan.sampleLayout.sampleCount`, defaulting to `96` when absent.

**Step 2:** On change → POST the sample map (`mode: 'implicit'` — counts are bound by well order)
via the existing `apiClient.setPlannedRunSampleMap`. Do NOT write the count to the protocol or
local protocol.

**Step 3:** Add a caption making the semantics explicit: *"Samples is a run setting, not a
protocol setting — the same protocol runs 4 or 96 samples."*

**Step 4:** Tests: renders the default count; a change calls `setPlannedRunSampleMap` with
`{mode:'implicit'}` and does NOT touch the protocol record.

**Step 5:** typecheck + vitest; live-verify on the run browser.

**Step 6:** Commit `feat(protocol-planning): surface run sample count (a run property, not protocol)`.

---

## Explicitly NOT in scope (YAGNI)

- No schema change to `protocol` / `local-protocol` to ADD a sample count field (wrong direction —
  the count belongs to the run).
- No new backend endpoint beyond the already-existing `POST /runs/:id/sample-map`.
- No automatic well-list expansion writing `[A1..An]` back into the protocol (would re-bake scale).
- No multi-run aggregate planning.

---

## Verification (done at the end)

1. `cd server && npx vitest run <lint-test-file> && npx tsc --noEmit` → green.
2. `cd app && npx tsc --noEmit && npx vitest run src/event-editor/right-pane/protocol` → green.
3. Live browser on `http://computable:5174/runs/RUN-wednesday-afternoon-run-2ze0?mode=protocol-planning`:
   - the "Samples: N" control appears under "This assay needs";
   - changing it POSTs `/runs/:id/sample-map` (verify via network/console) and does NOT alter the
     LPR `labwares`/`equipment`/`materials` rows;
   - the local protocol still declares abstract wells, no baked count.
4. Regression: full app suite failure set unchanged vs baseline.

## Risks / tradeoffs / open questions

- **Open:** Does Brad want the "Samples" count surfaced in the Protocol-Planning main pane
  (Task 3), or is the existing `BindingModeEditor` sample panel enough and only the doc+lint
  (Tasks 1–2) are wanted? Tasks 1–2 are low-risk and recommended regardless; Task 3 is the
  visible-for-biologists piece and can be deferred.
- **Risk:** Lint rule false-positives on legitimate small explicit well lists (e.g. a 6-well
  validation). Mitigated by `warning` severity + conservative matching (only flag when paired with
  a count-looking setting).
- **Tradeoff:** Surfacing scale in the right-pane Protocol tab vs. the deck main pane. Right pane
  keeps it in the pane the user already reads (per the "make it visible where the user looks"
  lesson), and keeps the deck uncluttered.

## Execution handoff

Plan complete. Ready to execute via subagent-driven-development — I'll dispatch a fresh subagent
per task with two-stage review. Tasks 1+2 (doc + lint) first; then confirm scope for Task 3
(sample-count surfacing) before building, since it depends on the "which pane" answer above.