# Compile Pipeline Universals — Overnight Spec Plan

Planning document for an overnight ralph-loop coding session that builds
out the universal compile-pipeline infrastructure recommended by the
rule catalog in
`agent-workbench/docs/compiler-pipeline-layer-patterns.md`.

This plan is the spec outline. Individual spec markdown files are
generated into the session directory (see "Session framing" below).

**Revision note.** This plan was revised once to incorporate the
recommendations appended at the bottom of this document. The revisions:
front-loaded an explicit contracts-and-alignment phase (Phase 0);
made `TerminalArtifacts` the primary pipeline product rather than an
additive side bundle; adopted the existing `when` DSL term throughout;
added a pipeline schema/runtime alignment spec early; and split the
run into thin vertical slices (Prompt 1 green, then cross-turn
Prompt 2 lookup) before committing to the full infrastructure build.

## Session framing

- **Session id:** `2026-04-24-compile-pipeline-universals`
- **Target repo:** `computable-lab`
- **Coder:** Qwen 3.5 122B via thunderbeast (vLLM)
- **Critic:** Claude Opus 4.7
- **Design stance:** build universal infrastructure; the four game
  prompts (from the rule catalog) are the *first* regression fixtures,
  not special cases. Stamps are registry entries. Assays are registry
  entries. Protocols are registry entries. No `if assay === "FIRE"`
  branches anywhere.

## Constraint: generalizability

Every spec must pass this smell test:

- If we later add Prompt 5 (e.g. a Seahorse XF assay) and Prompt 6
  (e.g. a Western blot), **no new passes should need to be written** —
  only new registry entries and possibly one new stamp pattern.
- Registry loaders are polymorphic over entity kind. Adding a new
  kind is a YAML file and a schema, not code.
- `when` clauses on passes keep them idle when they have nothing to
  do, so the same pipeline handles "mint 96 samples" and "run a
  20-step protocol." (We use the pipeline runner's existing `when`
  term throughout this plan — no new `shouldRun` term is introduced.)

## Phase 0 — Contracts & alignment (4 specs)

Front-loaded infrastructure. These specs define the shapes everything
else slots into. Without this phase, later specs would either invent
non-existent state slots or quietly inherit the existing
`events.length > 0` routing bug.

1. **spec-001** Canonical `CompileRequest` and `CompileResult` shapes.
   Request: `{prompt, attachments, history?, conversationId?,
   priorLabState?}`. Result: always
   `{terminalArtifacts: TerminalArtifacts, outcome: "complete" |
   "gap" | "error"}`. Minimal `TerminalArtifacts` stub now: `{events[],
   gaps[]}`. Later phases extend the stub; no phase replaces it. All
   pipeline passes read/write through `state.input`, `state.context`,
   `state.meta`, `state.outputs` (existing runner slots) — we do NOT
   invent new state slots.
2. **spec-002** Pipeline schema/runtime alignment: add
   `chatbot-compile` to the entrypoint enum in
   `compile-pipeline.schema.yaml`, fix loader validation, update
   pipeline tests so the schema and loader agree.
3. **spec-003** `when` DSL consistency pass: audit existing code and
   prior specs for any `shouldRun` references, normalize to `when`,
   document the semantics once in one place. No new DSL term is
   introduced by any later spec in this plan.
4. **spec-004** AgentOrchestrator chatbot-compile forwarding decides
   on `outcome` + artifact presence, not `events.length > 0`.
   Validation-only, gap-only, and downstream-only compiles no longer
   get silently routed to the prose-LLM fallback.

## Phase A — Fixture harness & scoreboard (3 specs)

Measurable "green fixtures" target that every later spec is graded
against. Runs in parallel with Phase 0 as a dependency of most later
phases.

5. **spec-005** Fixture harness: YAML fixture schema + fixture runner
   calling `runChatbotCompile` with a mocked LLM client
   (deterministic). Diff tool that compares produced artifacts to
   expected. CLI: `pnpm tsx server/scripts/run-compile-fixtures.ts`.
6. **spec-006** Baseline fixtures: freeze the four prompts as
   `prompt-01-mint.yaml` … `prompt-04-fire-assay.yaml`. Each has
   `input{prompt, attachments, history}`,
   `mocked_ai_precompile_output` (hand-written to match what the LLM
   should tag), and `expected{...}` placeholders.
7. **spec-007** Fixture scoreboard: `pnpm run compile:fixtures`
   prints a per-fixture table of which expected fields are matched,
   partial, or missing. Not a pass/fail; a dashboard. The critic
   consults this to judge each later spec's effect.

## Phase B — Lab-state projection (3 specs)

The foundation for cross-turn reasoning. Built against the Phase-0
contracts, so threading is well-defined.

8. **spec-008** `LabStateSnapshot` schema + pure
   `applyEventToLabState(snapshot, event)` function. No persistence.
   Unit tests per event type.
9. **spec-009** `labState` threaded through the `CompileRequest` /
   `CompileResult` contracts. Incoming `priorLabState` becomes
   `state.input.labState`; outgoing `labStateDelta` lands in
   `terminalArtifacts`. Terminal pass folds compiled events into the
   outgoing snapshot.
10. **spec-010** Session-keyed snapshot cache keyed by
    `conversationId`. New compiles receive prior snapshot. Unit test:
    Prompt 1 compiles → snapshot persisted → Prompt 2 compile
    receives that snapshot as input.

## Phase C — Thin vertical slice: Prompt 1 green end-to-end (3 specs)

Before committing to the full registry and pattern infrastructure,
prove the Phase-0 contracts and Phase-B state projection work end-to-end
with the simplest prompt. If this phase is rocky, stop and fix the
contracts before Phase D+.

11. **spec-011** Minimal `mint_materials` directive + narrow
    material-mint pass. One naming template, one-shot fanout from
    a count. Not the full mint_materials semantics — just what
    Prompt 1 needs.
12. **spec-012** Deck-slot binding on labware-resolve: parse
    `deckSlot` hints from the ai_precompile output, write them into
    `terminalArtifacts.deckLayoutPlan` (stub form).
13. **spec-013** Prompt 1's `expected-01.yaml` filled in; fixture
    harness asserts green. Graduation check: labStateDelta shows
    96 materials minted, deepwell plate on deck, zero gaps.

## Phase D — Thin cross-turn slice: Prompt 2 "we already have" lookup (2 specs)

Smallest possible test of the cross-turn story. Not the full Zymo
protocol — just the reference-resolution primitive.

14. **spec-014** `resolve_prior_labware_references` narrow pass:
    given a natural-language reference in the ai_precompile output
    (e.g. `priorLabwareRef: "96-well deepwell plate of fecal
    samples"`), resolve against `state.input.labState`. Match on
    labware kind + contained-material hint. Emit
    `resolvedLabware` on success, `gap` on miss.
15. **spec-015** Mini cross-turn fixture test: compile Prompt 1,
    persist snapshot, compile a trivial second prompt
    ("use that deepwell plate, add 10uL buffer to well A1"),
    assert the second compile resolves the plate reference via
    labState and emits a valid transfer event. This is a gate for
    the rest of the plan — if it fails, the cross-turn contract is
    broken.

## Phase E — Reference-entity registries (5 specs)

All share one polymorphic loader (spec-016). Each kind adds a schema
+ seed entries, not code.

16. **spec-016** Generic `RegistryLoader<Kind, Spec>` with YAML file
    discovery, schema validation via zod, in-memory cache. Infra
    only — no specific kinds wired yet.
17. **spec-017** `stamp-pattern` kind + seed entries for
    `column_stamp`, `triplicate_stamp`, `quadrant_stamp`,
    `column_stamp_differentiated`. Schema defines `input_topology`,
    `output_topology`, `per_position_fields`.
18. **spec-018** `protocol-spec` kind + minimal seed (one test
    protocol). Schema: `{id, name, steps[], requirements,
    layout_hints}`.
19. **spec-019** `assay-spec` kind + seed entries for
    `16S-qPCR-panel` and `FIRE-cellular-redox`. Schema:
    `{panel_constraints, channel_maps, analysis_rules}`.
20. **spec-020** `compound-class` kind + seed for `AhR-activator`,
    `PPARa-activator`. Schema maps class → list of specific
    compounds with inventory hints.

## Phase F — Rich ai_precompile output (2 specs)

21. **spec-021** Extend `AiPrecompileOutput` with `directives[]`,
    `downstreamCompileJobs[]`, `mintMaterials[]`, `patternEvents[]`.
    All optional. Update the system prompt to teach the new
    vocabulary. Preserve backward-compat: old outputs still valid.
22. **spec-022** Teach role-coordinate emission in the
    ai_precompile prompt. LLM must emit `{role: "cell_region"}`
    instead of `[B2, B3, …, G11]`. Add a lint in the pass that warns
    if an event carries more than 3 physical well addresses (signal
    the LLM regressed to enumeration).

## Phase G — Core deterministic passes (8 specs)

The "compiler computes" layer. Each is narrow, one-pass, ≤3 files.

23. **spec-023** `resolve_references` pass: consumes
    `unresolvedRefs`, dispatches to registry loader by kind, emits
    `resolvedRefs[]` and `unresolvableRefs[]` (the latter feed
    `ai_clarify`).
24. **spec-024** `apply_directives` pass: applies
    `reorient_labware`, `mount_pipette`, `swap_pipette` to the
    in-compile labState snapshot in emission order.
25. **spec-025** `expand_patterns` dispatcher: reads events with
    `pattern: <id>`, looks up the pattern spec, invokes the
    appropriate expander from a registered expander map.
26. **spec-026** Expanders for `column_stamp` and
    `triplicate_stamp`. Pure coordinate math. Unit tests with
    fixtures.
27. **spec-027** Expanders for `quadrant_stamp` and
    `column_stamp_differentiated`. Same shape, more complex
    topology.
28. **spec-028** `expand_protocol` pass: given resolved
    `run_protocol` reference, unrolls the step graph into primitive
    events with parameter substitution. Uses labState for
    pipette/labware context.
29. **spec-029** `resolve_roles` pass: role coordinates → physical
    wells via current orientation from labState. Re-binds after
    reorientation naturally because labState holds orientation.
30. **spec-030** `mint_materials` pass generalization: supersedes
    the thin-slice spec-011 path with the full semantics (arbitrary
    templates, multiple mint calls per compile, labState update
    integration).

## Phase H — Math and planning (3 specs)

31. **spec-031** `compute_volumes` pass: resolves `"just_enough"`,
    `{percent: N, of: <ref>}`, explicit uL. Surfaces unresolvable
    as gap.
32. **spec-032** `compute_resources` pass: tip counts per pipette,
    reservoir volume summation, consumables list. Emits
    `ResourceManifest`.
33. **spec-033** `plan_deck_layout` pass: respects user pins,
    auto-fills rest, conflict detection. Emits `DeckLayoutPlan`
    (supersedes the thin-slice stub).

## Phase I — Unified validation (3 specs)

34. **spec-034** `validate` pass skeleton: pluggable check
    categories, structured `ValidationReport` output with actionable
    findings (problem, suggested fix, blocking/warning).
35. **spec-035** Intra-event + deck-geometry checks (pipette caps,
    well counts, slot conflicts). Replaces any scattered validators
    found today.
36. **spec-036** Cross-turn + panel-constraint checks:
    pipette-vs-volume feasibility using prior labState; edge
    exclusion from assay-spec.

## Phase J — Non-liquid-handling outputs (3 specs)

37. **spec-037** `read` verb extended with `{instrument,
    channel_map, analysis_rules}` structured metadata.
    Generalizable — not qPCR-specific.
38. **spec-038** Instrument run-file artifact emitter: a generic
    `InstrumentRunFile` shape, plus a specific emitter for
    QuantStudio driven by assay-spec channel_maps. Adding a new
    instrument = a new emitter + registry entry.
39. **spec-039** `downstreamCompileJobs` channel: emits queue
    entries to `TerminalArtifacts.downstreamQueue[]`. AgentOrchestrator
    surfaces them as suggested follow-ups.

## Phase K — TerminalArtifacts expansion + pipeline wire-up (2 specs)

The Phase-0 stub is now extended to its full shape, and the pipeline
YAML is updated to invoke the new passes.

40. **spec-040** Extend `TerminalArtifacts` canonical fields:
    `{events, directives, resourceManifest, deckLayoutPlan,
    instrumentRunFiles, analysisRules, labStateDelta,
    downstreamQueue, validationReport, unresolvedGaps}`. All new
    fields optional; consumers degrade gracefully.
41. **spec-041** Update `chatbot-compile.yaml` pipeline definition:
    add all new passes in the canonical order from the catalog,
    each with `when` gates so it no-ops when it has nothing to do.
    Pipeline-schema validation passes (spec-002 gate).

## Phase L — Remaining fixtures go green (3 specs)

The graduation tests for Prompts 2, 3, 4. (Prompt 1 already went
green in Phase C, spec-013.)

42. **spec-042** Prompt 2 expected output (full Zymo): protocol
    expanded, "just enough" volumes resolved to concrete uL,
    tip-rack count computed, deck layout respects user pins,
    "96-well deepwell plate" resolves via prior labState.
43. **spec-043** Prompt 3 expected output: quadrant_stamp expansion
    to 384 transfers, QuantStudio run-file artifact, normalization
    analysis rule, cross-turn conflict on 1000uL pipette for qPCR
    flagged.
44. **spec-044** Prompt 4 expected output: directives applied
    (reorient, pipette swap) with two phases, role coordinates
    resolved, triplicate patterns expanded, edge exclusion
    enforced, AhR activator surfaces as compound-class gap, five
    downstreamCompileJobs queued.

---

## Total: 44 specs

### Estimated runtime

- Narrow-slice specs (one file each): ~10–15 min coder + 2–5 min
  critic. Most of these.
- Broader specs (multi-file, e.g. 001 contracts, 016 registry loader,
  040 terminal artifacts): ~20–30 min coder + 5 min critic.
- Average ~15 min × 44 ≈ **~11 hours one-shot**. With critic retries
  (avg 1.3×), **~14–15 hours**. Tight for overnight. If any phase
  drags, the gate after Phase D (spec-015) is the natural place to
  pause and review progress before committing to the remaining
  ~29 specs.

### Risk list (resolve before launching)

1. **Does `runChatbotCompile` accept a mocked LLM cleanly?** If not,
   spec-005 may need a small mockability refactor spec first (slot
   into Phase 0 as spec-004a).
2. **Is there an existing registry loader pattern?** If yes,
   spec-016 reuses it (smaller). If no, it's a fresh infrastructure
   spec.
3. **Are `ChatMessage` / `CompletionRequest` types stable** enough
   that spec-021 doesn't need to touch 5+ files?
4. **`TerminalArtifacts` starts as a Phase-0 stub** — that de-risks
   spec-040 entirely compared to the previous revision.
5. **Do any prompts require verbs beyond the 25-verb set?** E.g.
   `reorient_labware` is a directive (fine); `mint_materials` is
   handled as a directive in spec-011/030, not a new verb.

### Dependency graph

```
Phase 0 (001-004) ──┐
                    ├──> B (008-010) ──> C (011-013) ──> D (014-015) ──> E (016-020) ──┐
Phase A (005-007) ──┘                                                                   │
                                                                                        ▼
                                                                              F (021-022) ──> G (023-030)
                                                                                                   │
                                                                                                   ▼
                                                                                            H (031-033)
                                                                                                   │
                                                                                                   ▼
                                                                                            I (034-036)
                                                                                                   │
                                                                                                   ▼
                                                                                            J (037-039)
                                                                                                   │
                                                                                                   ▼
                                                                                            K (040-041)
                                                                                                   │
                                                                                                   ▼
                                                                                            L (042-044)
```

Phase 0 and Phase A run in parallel (no dependency between them).
Phase C gates further work — if Prompt 1 can't go green end-to-end
on the Phase-0 contracts, stop and fix. Phase D gates the
cross-turn story — if "we already have X" can't resolve against
prior labState, the rest of the plan is premature.

### Proposed sequence

1. Resolve the 5 risk items with Explore-agent checks
   (parallelizable, ~10 min total).
2. Adjust spec boundaries based on findings.
3. Write all 44 spec markdown files into
   `agent-workbench/state/sessions/computable-lab/2026-04-24-compile-pipeline-universals/specs/`.
4. Populate `session.json` with dependency ordering + priorities.
5. User reviews the full spec set.
6. Launch overnight via `./scripts/launch-ralph.sh`.

## Recommendations: what I would do differently

Before implementation, I would adjust the plan in five ways so it fits
the current repo contracts more cleanly and reduces avoidable churn.

1. **Add an explicit entrypoint-contract phase before Phase B.**
   Today `runChatbotCompile` takes `{prompt, attachments}` plus deps,
   and pipeline passes read `state.input`, `state.context`, `state.meta`,
   `state.outputs` — there is no `CompileState`, no `state.inputs`, and
   no conversation/session key on the compile entrypoint. Before adding
   `LabStateSnapshot`, add a small foundation phase that defines:
   - compile request shape (`prompt`, `attachments`, `history?`,
     `conversationId?`, `labState?`)
   - compile result shape (`terminalArtifacts` first, events as one field)
   - where cross-turn state is threaded: input vs context vs meta
   Without this, specs 004-006 are underspecified against the current
   code.

2. **Make `TerminalArtifacts` the primary pipeline product, not an
   additive side bundle.**
   The current AgentOrchestrator short-circuits only when compiled
   `events.length > 0`; otherwise it falls through to the LLM loop. That
   means a compile that successfully emits only validation findings,
   downstream jobs, or a deck layout would currently be discarded.
   I would define `runChatbotCompile()` to always return a canonical
   `terminalArtifacts` object, and make the orchestrator decide based on
   artifact presence / outcome, not only event count.

3. **Use the existing pipeline DSL term `when`, or formally replace it.**
   The plan currently says `shouldRun` in multiple places, but the
   pipeline runner and schema already model conditional execution as
   `when`. I would either:
   - rewrite the plan to use `when` consistently, or
   - introduce a small explicit spec that renames / supersedes `when`
     with `shouldRun`, including loader, schema, runner, and test
     updates.
   Mixing the terms will create spec drift immediately.

4. **Insert a pipeline-schema/runtime alignment spec early.**
   There is already a mismatch in-repo: the loader accepts
   `chatbot-compile` as an entrypoint, while
   `compile-pipeline.schema.yaml` does not list it. I would add an early
   housekeeping spec that aligns:
   - pipeline schema enum
   - loader validation
   - pipeline tests
   - chatbot pipeline fixture expectations
   Otherwise Phase I may "tighten validation" on top of a known contract
   inconsistency.

5. **Split "universal infrastructure" from "fixture-target behavior"
   more aggressively.**
   The plan is directionally correct that the four prompts are fixtures,
   not special cases. But the current repo has a very small chatbot
   pipeline and several of these phases are effectively architecture
   replacement, not narrow additive passes. I would:
   - keep A as the first measurement layer
   - add the contract/alignment phase above
   - make one thin vertical slice go green end-to-end before building
     all registries and planning passes
   - only then broaden to patterns, protocols, assays, and downstream
     jobs
   Concretely: get Prompt 1 and one cross-turn Prompt 2 path green
   before committing to the full 37-spec overnight sequence.

Net: I agree with the universal-design direction, but I would front-load
contract clarity and artifact semantics before expanding the pass graph.
