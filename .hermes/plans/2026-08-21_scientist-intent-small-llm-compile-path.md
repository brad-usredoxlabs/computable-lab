# Scientist-Intent Compile Path (small-LLM → scientistIntent YAML → deterministic EVG)

**Status:** Design decision locked 2026-08-21 (Brad + architect). Supersedes no prior plan;
this is a NEW parallel input surface, not a rewrite of the 26-pass chatbot-compile.

**Goal:** Let a very SMALL LLM (e.g. lfm2.5-class 3B on Thunderbeast/DFlash daily
driver) author an experiment by emitting a *compact, constrained scientist-intent
YAML*, and have the existing deterministic compiler expand that intent into the
full low-level event graph. The 35B (qwen3.6-35b-a3b) gets the SAME contract — the
two models differ only in which upstream stage produces the intent, never in the
downstream machinery.

## Load-bearing decision (Brad)
Expose a **dedicated `POST /intent/compile`** endpoint, cleanly decoupled from the
existing chat-resolve loop and from `ai_precompile`. Input = `scientistIntent` YAML.
Output = the existing `TerminalArtifacts` contract (events, gaps, directives,
deckLayoutPlan, etc.) exactly as the chat pipeline emits it. Small model → emit
intent → POST → same deterministic lower+expand used today.

## Why this already half-exists (verified)
- `server/src/compiler/protocolIntent/` is an intent layer ALREADY: StatePlanner →
  Validation → Lowering → PatternExpanders. Pattern expanders deterministically
  expand `serial_dilution`, `media_swap_duplicate_columns`,
  `source_wells_to_duplicate_target_columns`, `repeat_rows` → primitive
  transfer/mix/incubate events.
- `incubate` + `read`/`readout` verb expanders exist (`simpleVerbs.ts`).
- Assurance / resolve-or-confirm already has a confirm gate for unresolved /
  ambiguous noun bindings (`server/src/ai/assurance.ts`). Reused for symbolic
  noun resolution.

## The gap being closed
1. `scientistIntent` is a NEW, much smaller and more abstract schema than the
   rich `ai_precompile` JSON. Current precompile prompt demands resources + ops +
   patterns + assumptions + unresolved + candidateActions + mintMaterials +
   directives + patternEvents — a small model cannot emit that.
2. `serial_dilution` currently lowers from `rows`/`ratio`/`targetColumn`/
   `transferVolumeUl` — it has NO `factor`, `points`, or `replicates`
   semantics. The user-facing vocabulary wants `factor: 2, points: 8,
   replicates: 2`.
3. `read_plate` is not a first-class intent verb today (it's `read` event_type or
   a `downstreamCompileJob` readout).
4. No standalone `intent YAML → EVG` entry point decoupled from the chat loop.

## scientistIntent schema (new, Phase 0)
A FIRST new declarative YAML record type following repo rule #1/#8 (declarative,
Ajv-validated, lint-DSL business rules, controlled vocabulary, ontology over free
text). Sketch:

```yaml
kind: scientist-intent
version: 0.1.0
intentId: example-001
actions:              # ordered; each is a high-level scientist verb
  - action: serial_dilution
    source: standards        # SYMBOLIC label, never a resolved ID
    factor: 2
    points: 8
    replicates: 2
    targetHint: "96-well plate"      # optional natural hint, not a deck slot
  - action: incubate
    duration: "10 min"               # natural value, parsed downstream
    temperature: 37
  - action: read_plate
    mode: absorbance
    wavelength: "450 nm"             # natural value, parsed downstream
unresolved:           # explicit "I couldn't decide X" — NOT a crash
  - label: source
    reason: "ambiguous — standards vs sample"
    candidates: []
```

**Noun policy (load-bearing, REAL value of small-model viability):** `source`,
`target`, `labware` fields are SYMBOLIC NAME PHRASES, never resolved IDs or deck
slots. Downstream Tier-2 (existing ontology resolver + `resolve_labware` +
`resolve_references` + assurance loop) binds them: exact hit → resolved;
ambiguous / new → `new_local_proposed` / `Gap`, survives into the confirm gate.
The small model is NEVER expected to know record IDs or deck geometry.

**Typed access:** durations ("10 min"), volumes, wavelengths, counts/factors are
kept as natural strings and normalized by the existing strict parsers
(`ParameterGrammar`, time/duration parsing) — the small model does not need a
strict numeric grammar.

## `/intent/compile` contract (Phase 2)

- **Request:** `{ intent: <scientistIntent YAML document> }` (also accepts the
  JSON form; YAML preferred — it is what a small model emits more reliably).
- **Response:** `TerminalArtifacts` — same envelope as the chat pipeline
  (`events`, `gaps`, `directives`, `deckLayoutPlan`, `labStateDelta`,
  `resourceManifest`, ...). So the event-editor UI consumes it without change.
- **Pipeline:** wraps the EXISTING passes, not a fork. `scientistIntent`
  → normalizer → `ProtocolIntent` → `protocol_intent_state_plan` →
  `validate_protocol_intent` → `lower_protocol_intent` →
  `expand_protocol_intent_patterns` → (`resolve_roles`, `compute_volumes`) →
  emit passes. Reuse resolve-or-confirm for unresolved nouns.

## Serial dilution semantics (closes factor/points/replicates gap)
Extend `ProtocolIntentPatternExpanders.expandSerialDilution` (and the schema) to
express serial dilutions via concentration state, not raw rows:
`factor` (per-step fold, e.g. 2 = 1:2), `points` (number of dilution positions),
`replicates` (physical replicates → target column/well duplication). Volume per
point still from `transferVolumeUl`/defaults. Add a failing test FIRST per repo
rule #5 (TDD), and a golden test that walks the well-state composition tracker
(Volumic Protocols existing well-state pass) to assert concentrations after each
point = stock / factor^i.

## Vocabulary: 3-verb MVP (Phase 1), then broaden
- **Phase 1 verbs:** `serial_dilution`, `incubate`, `read_plate` — exactly Brad's
  example carried end-to-end. Proves the whole path with the smallest surface.
- **Phase 2/3 verbs:** `seed`, `transfer`, `media_swap`, `stain`, `harvest`,
  `repicate_rows`; then the standard set. Each is just (a) a schema enum member,
  (b) a normalizer line scatter→ a `ProtocolPatternIntent`/`ProtocolOperationIntent`
  kind, (c) a deterministic expander. Reuses existing pattern/verb expanders.

## Phases (each independently testable — a kanban card spec, NOT a monolith)

**Phase 0 — ScientistIntent schema + Ajv + lint (foundation).**
New `schema/scientist-intent.schema.yaml` + `scientist-intent.lint.yaml` in
`server/src/schema/`; registry registration; parse/normalize helpers. Acceptance:
valid doc loads; unknown `action` → validation error; `unresolved` round-trips;
Ajv is single authority; lint DSL enforces e.g. `serial_dilution` requires
`source`, requires `points>=2`, `factor>1`.

**Phase 1 — serial dilution law closure (TDD).**
- Failing test first: `expandSerialDilution` with `factor`/`points`/`replicates`
  → assert per-point concentrations = stock × factor^(-i) × replicate structuring.
- Extend `ProtocolIntentPatternExpander` + normalizer edge.
- Golden test walking well-state concentration tracker.

**Phase 2 — `/intent/compile` endpoint.**
- New route in `server/src/api/` calling the existing pipeline with a
  `scientistIntent→ProtocolIntent` normalizer seam as the only new input stage.
- Returns TerminalArtifacts. Integration test `POST /intent/compile` round-trips
  the 3-action example into a well-formed EVG with no gaps.

**Phase 3 — Symbolic noun resolution via confirm gate.**
- `source: standards` with no record → `Gap`/`unresolved` → confirm gate (reuse
  `assurance`/`clarificationRequestsFromAssurance`). No fake resolution in code
  (rule #10 hard stop); resolution comes from the ontology/resolver records.
- Test: unresolved source → `outcome:'gap'` + confirm request, not a fabricated
  binding.

**Phase 4 — small-model driver + prompt/route.**
- `server`-side emission route (e.g. `/intent/compile` fronted by a thin
  LLM-adapter that calls the configured small model with a compact prompt that
  only outputs scientistIntent YAML — no other JSON sections).
- A dedicated small-LLM system prompt template in `schema/registry/prompt-templates/`
  (e.g. `intent.compile.system`) teaching ONLY the closed vocab + the schema.
- Verify on a real 3B (lfm2.5 / Thunder beast qwen3.6 as fallback) — acceptance
  = reliable schema-valid YAML for the MVP verbs + the unresolved branch.

**Phase 5 — review + browser + training seam.**
- Reviewer pass; select model; browser-verify event-editor renders the EVG from
  `/intent/compile` identically to the chatbot compile. Rational the
  intent→accepted-graph (prompt,intent,accepted EVG) triples map into the
  existing `metadata.events`/PairExporter seam for later intent-model training.

## Verification gates
- `pnpm -w server test:run` — all new + existing green (run from `server/` cwd;
  root `-w server` hits stale `.worktrees/t_*`).
- `-w server typecheck` clean.
- No hardcoded domain logic; Ajv single authority; the small model never guesses
  IDs/decks.

## Open items flagged for review (not blockers)
- Whether `read_plate` should also exploit the existing `assayId`→assay-spec
  population when the label resolves to an assay record. Likely yes (readExpander
  already supports it).
- Whether the intent schema lives as a recorded-kind (round-trips to `records/`)
  or stays a wire document. Ship as wire-doc Phase 0–4; promote to a record only
  if Brad wants human authoring/editor after.