# Protocol Chaining — Context Handoff between Protocols (RNA Extraction → rtPCR)

**Date:** 2026-08-16
**Status:** Plan mode (design + breakdown; no code changed).
**Owner:** Architect (122B)

> **For Hermes:** Use subagent-driven-development to execute task-by-task after approval.

**Goal:** Let a run chain protocols — e.g. RNA extraction → rtPCR — where **the thing that flows between them is a *context* (a plate, with each well's event history + volume + derived concentrations), not a material-instance or aliquot teardown.** The downstream protocol consumes the plate as its **source** via an **explicit gate**, and the plate-context can be **elevated to a reusable component** (kept for a second run / fed to a *different* protocol, possibly via aliquots).

**Architecture:** This is the "computable-lab way" made concrete: the event graph creates a **context**; the well-state tracker computes the per-well composition; **context promotion** (§30-12) elevates a context into a named reusable artifact. Chaining = **context → context**: protocol A's end-state plate-context is bound as protocol B's source plate. Three coupled parts: (1) the input contract + explicit consumption gate, (2) elevation/reuse of the source context, (3) per-run realization of A→B (with aliquot fan-out to *different* downstream protocols).
**Tech Stack:** YAML JSON-schema (`schema/workflow/protocol.schema.yaml`, `planned-run.schema.yaml`, `event-graph.schema.yaml`), context promotion (`server/src/context/PromotionCompiler.ts`), well-state tracker (`server/src/compiler/math/eventReducers.ts` `trackRunningComposition`), run/planned-run compile + `PlannedRunEventsEmitPass`. TDD (Vitest). Backend/data-model first; UI deferred.

## LOCKED decisions (from the chaining interview)
1. **Handoff = context, not material/aliquot.** The plate-context (per-well volume + derived concentrations + shared event-graph lineage) is what enters the next protocol as its **source plate**. No material-instance/aliquot re-declaration as the primary handoff.
2. **Explicit gate/consumption.** The downstream protocol declares an input binding (source = plate-context), and consumption is an explicit gesture — its first action is a **transfer off the source plate**.
3. **Elevation/reuse = context promotion** (§30-12): the plate-context is promotable to `context-snapshot` (keep for tomorrow / reuse) and `plate-layout-template` (reuse the map in a different protocol).
4. **One source → many downstreams, via aliquots.** E.g. an RNA-purification plate feeds rtPCR(genes 1–4) today and rtPCR(genes 5–8) tomorrow; a cell-culture plate's well context is **aliquoted** — one aliquot → rtPCR, a separate aliquot → GC-MS. This is the primary "reuse in a different protocol" shape.
5. **PUNTS:** RNA-concentration read decoration (observed metadata on the plate context) — later; **plate lifecycle bookkeeping states** (in_use/saved/consumed/discarded) — explicitly NOT MVP (fridge-stack reality, last-in-first-out throwaway); N:M pooling — later (1:1 per-sample + aliquot fan-out first); UI — deferred.

## Existing pieces (verified — reuse)
- Context model + **context promotion** → `CTX-*`, `context-snapshot`, `plate-layout-template`, `assay-definition` (`compiler-specs/30-context.md` §12; `server/src/context/PromotionCompiler.ts`).
- `protocol.producedArtifacts[]` — a protocol declares what it produces (`protocol.schema.yaml:199`).
- Well-state tracker: `trackRunningComposition` → per-well final `{volume_ul, finalConcentrations, ...}` — this IS the per-well `contents[]` for a context.
- Event-graph `derived_from` lineage + `aliquot` kind + `ltest_within`/`lineage_includes` predicates.
- Run compile: `runRunPlanCompile` + `PlannedRunEventsEmitPass` (the seam where a run realizes steps → events → and now a context).

---
## Phase A — Input contract + explicit consumption gate (schema)

### Task A1: a protocol may declare an input/source binding ("consumes a plate-context")
**Objective:** a `protocol` (or its run binding) can declare an **input source** — the plate-context it consumes — so chaining is declarative.
**Files:** `schema/workflow/protocol.schema.yaml` — add optional `inputContexts[]` / `sourceRequirement` (a role like "source plate" that a run binds to a promoted plate-context); `planned-run.schema.yaml` — the run-level binding (`sourceContextRef` → a CTX).
**Step 1 (TDD):** schema test — a protocol with a `sourceRequirement` validates; a run binding a source plate-context validates; unknown sibling fails.
**Step 2:** implement.
**Verify:** `npx vitest run <schema test> && npx tsc --noEmit`.

### Task A2: explicit consumption gate in the event graph
**Objective:** consumption is a first-class event — the downstream protocol's first action is a **transfer off the source plate-context** (a `transfer` whose source is the bound plate-context).
**Files:** `PlannedRunEventsEmitPass` / run compile — emit the consumption transfer when the run binds a `sourceContextRef`; event-graph schema already has `transfer` with source wells.
**Verify (TDD):** a run that binds A's plate-context to B's source emits B's first event as a transfer sourcing that plate.

---
## Phase B — Elevation & reuse of the source context

### Task B1: promote the end-state plate-context to a reusable snapshot
**Objective:** after protocol A's run, promote its plate-context to a `context-snapshot` (reusable), reusing context promotion + the well-state tracker's final composition.
**Files:** `server/src/context/` — wire `trackRunningComposition` output into the plate-context `contents[]`, then promotion → `context-snapshot`.
**Step 1 (TDD):** tracker final state → context contents (volume + derived concentrations) maps 1:1.
**Verify:** `npx vitest run` + promote produces a `CTX-*`/`context-snapshot` whose `contents[]` match the tracker output.

### Task B2: reuse in a different protocol = the snapshot is a source for any downstream
**Objective:** model "reuse tomorrow / in a different panel" as: any downstream run may bind the same promoted snapshot as its `sourceContextRef`. Free once Phase A's binding exists.
**Verify:** two different rtPCR panels (genes 1–4, genes 5–8) both bind the same RNA-purification snapshot.

---
## Phase C — Aliquoting a source context to multiple downstream protocols

### Task C1: aliquot a well-context → feed distinct downstream protocols
**Objective:** a cell-culture plate's well context can be **aliquoted** — one aliquot → rtPCR, a separate aliquot → GC-MS — reusing the existing `aliquot` + `derived_from` lineage.
**Files:** extend `sourceRequirement` binding to accept an **aliquot split** (one source context → multiple `derived_from` aliquots, each a downstream source).
**Step 1 (TDD):** schema — a split binding validates; lineage: each downstream's source ref `derived_from` the parent well-context.
**Verify:** promote the plate → aliquot → rtPCR + GC-MS each consume their own alley.

---
## Phase D — Per-run realization of the chain

### Task D1: run sequencing A→B
**Objective:** a run realizes extraction then rtPCR; A's plate-context is bound as B's source; 1:1 per-sample (each sample's lineage flows through).
**Files:** `runRunPlanCompile` — sequence the two sub-protocols; bind A's promoted snapshot to B's `sourceContextRef`.
**Verify:** a golden A→B run: extraction events → plate-context → rtPCR first step = transfer off that plate.

### Task D2: deferrals documented + minimal run skeleton
**Objective:** a thin run-planning skeleton for the chain (no UI), deferring RNA-read decoration, pooling, and lifecycle states.
**Files:** a short spec note in `compiler-specs/50-protocol-lifecycle.md` §"Protocol chaining (context handoff)" capturing the model + the explicit non-goals.

---
## Out of scope (YAGNI / explicitly later)
- **Plate lifecycle bookkeeping states** (in_use/saved/consumed/discarded) — fridge-stack reality; not MVP.
- **RNA concentration read-out decoration** on the plate context (observed metadata) — later; computed composition is enough for v1 handoff.
- **N:M pooling** (pool several A wells into one B reaction) — later; 1:1 per-sample + aliquot fan-out first.
- **UI** for chaining — backend/data-model + minimal run skeleton first.

## Tests / validation
- Every new pure piece TDD'd (server cwd): schema contracts (A1), consumption-gate emit (A2), tracker→context contents mapping (B1), aliquot-split lineage (C1), golden A→B run (D1).
- `npx tsc --noEmit` server; app untouched in this epic (UI deferred) — keep app green anyway.
- Full-suite: zero new failing tests over baseline (76 failed / 3294 passed / 2 pre-existing errors / 1 pre-existing `slugify` tsc error).

## Risks / trade-offs / open questions
- **Context vs material tension:** the model deliberately says the handoff is context, not material-instance. Where the user *does* want a concrete tube/aliquot (cell-culture → GC-MS), that's handled via explicit **aliquoting** (C1), not by redefining the primary handoff. Keep the two distinct.
- **Promotion is naming, not pooling** (§12.9): promoting/snapshotting the plate never claims the physical wells merged — preserve this.
- **The run realizes the chain; the protocols declare the contract** — keep contract vs realization separate so a snapshot is reusable across entirely different downstream protocols.

---
Plan complete and saved. This is the **second plan**. Ready to execute via subagent-driven-development — recommended order Phase A → B → C → D. Binds directly to the well-state tracker (context contents) and context promotion (elevation/reuse) already in the tree.
