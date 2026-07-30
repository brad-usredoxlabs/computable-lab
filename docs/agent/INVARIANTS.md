# INVARIANTS.md — Computable Lab Invariants

> Rules, conventions, and constraints that must not be violated. Last verified against commit `af32af9`.

---

## Architecture Invariants

| # | Invariant | Citation |
|---|-----------|----------|
| A1 | **Schema-driven**: if expressible as data, must be data. Business logic lives in YAML, not TS. | `CLAUDE.md:70-73` |
| A2 | **Schema triplet**: every record type has `*.schema.yaml` (JSON Schema 2020-12), `*.lint.yaml` (declarative predicate DSL), `*.ui.yaml` (rendering hints). | `CLAUDE.md:75-77`, e.g. `schema/lab/material.{schema,lint,ui}.yaml` |
| A3 | **Declarative > imperative**: code reads data files; code never makes policy decisions. | `CLAUDE.md:137-145` |
| A4 | **Ajv is the single validation authority** — no fake validation, no runtime Ajv mutation. | `CLAUDE.md:151` |
| A5 | **No hard-coded domain logic** in TS: no schema-name branching, no inline business rules. | `CLAUDE.md:150` |
| A6 | **Deterministic compilation**: `ProtocolCompiler` transforms `universal → lab → execution-ready` layers with `Object.freeze()` immutable snapshots. | `server/src/compiler/protocol/ProtocolCompiler.ts:114-115`, `server/src/compiler/pipeline/PipelineRunner.ts:244-247` |

## Data Invariants

| # | Invariant | Citation |
|---|-----------|----------|
| D1 | **Material hierarchy is provenance, not flat**: `concept ≠ formulation ≠ instance ≠ aliquot ≠ composition`. Never collapse layers. | `CLAUDE.md:156` |
| D2 | **Vocabulary lifecycle** (ontology terms): `proposed → active → retracted` — governs noun/verb registry entries. | `CLAUDE.md:155`, `schema/workflow/extraction-promotion.{schema,lint}.yaml:104-35` |
| D3 | **Inventory lifecycle** (material lots): `available → reserved → consumed → expired → discarded` — distinct from vocabulary lifecycle. | `schema/lab/material-lot.schema.yaml:65-66` |
| D4 | **Event immutability after commit**: lab state is folded via pure functions returning new immutable snapshots (`applyEventToLabState`). | `server/src/compiler/state/LabState.ts:6`, `server/src/compiler/directives/Directive.ts:6-7` |
| D5 | **protocolLayer is const per record**: `universal` (protocol), `lab` (local-protocol), `execution-ready` (execution-plan). Set at creation, never changed. | `CLAUDE.md:79`, `server/src/execution/ExecutionOrchestrator.ts:288`, `server/src/compiler/protocol/ProtocolCompiler.ts:114-115` |

## TypeScript Invariants

| # | Invariant | Citation |
|---|-----------|----------|
| T1 | **`exactOptionalPropertyTypes: true`** (backend). Optional means *absent* or *value* — never `undefined`. Use conditional spread: `cond !== undefined ? { cond: val } : {}`. | `server/tsconfig.json:13`, `CLAUDE.md:154`, enforced at `server/src/api/handlers/RecordHandlers.ts:463`, `server/src/api/handlers/ProtocolIdeHandlers.ts:945` |
| T2 | **No type-system resets**: never recreate shared types to silence errors. Fix the call site. | `CLAUDE.md:152` |
| T3 | **`shared/` is strictly for code used by 2+ modules**. Do not add speculatively. | `CLAUDE.md:120` |

## UI Invariants

| # | Invariant | Citation |
|---|-----------|----------|
| U1 | **Two-pane layout**: left pane = canvas/editor, right pane = tabs (preview, fixit, context). Protocol builder uses `RightPanel` tab system with `role="tablist"`. | `app/src/protocol-builder/RightPanel.tsx:29-45`, `app/src/protocol-builder/protocolBuilderPage.css:1` |
| U2 | **`--cl-*` CSS tokens only**: all styling uses `var(--cl-*)` tokens defined in `app/src/shared/styles/tokens.css`. Scoped under `.cl-app`, with `[data-theme='light']` overrides. | `app/src/shared/styles/tokens.css:13-60`, consumed everywhere (e.g. `app/src/shared/shell/AppShell.css:29-30`) |
| U3 | **Dark default, light opt-in**: dark palette is default; `data-theme="light"` on `.cl-app` switches palette. | `app/src/shared/styles/tokens.css:14-15,62` |

## AI Invariants

| # | Invariant | Citation |
|---|-----------|----------|
| I1 | **`enableThinking` config gate**: `InferenceConfig.enableThinking` controls chain-of-thought on reasoning models. Default `undefined` = server default. | `server/src/config/types.ts:176-181` |
| I2 | **Thinking models consume all tokens on reasoning**: Qwen3.5/3.6 with `enableThinking: true` uses tokens on internal reasoning, returns `null` content. Must set `enableThinking: false` for structured output. | `server/src/api/handlers/ProtocolBuilderHandlers.ts:515-519`, `server/src/foundry/FoundryCoderPatch.ts:961-963` |
| I3 | **Controlled vocabularies over free text**: AI should prefer ontology CURIE-style terms (`cf:ROS`, `cf:PPARalpha`) over free text. | `CLAUDE.md:155` |

## Server Invariants

| # | Invariant | Citation |
|---|-----------|----------|
| S1 | **Schema loading must succeed on startup**: `loadAllSchemas()` loads from `schema/`; errors are warned but server continues. Warnings logged per-entry. | `server/src/server.ts:270-289` |
| S2 | **config.yaml is optional at startup**: missing `config.yaml` falls back to `DEFAULT_APP_CONFIG` (local mode). Config auto-created on first PATCH. | `server/src/server.ts:234-265,1046` |
| S3 | **Ajv validator gets topological schema order**: schemas added dependency-first via `schemaRegistry.getTopologicalOrder()`. | `server/src/server.ts:295-301` |
| S4 | **No hardcoding**: no passwords, API keys, test data, stub responses, or mock configs in code. | `CLAUDE.md:160` |
| S5 | **Tests are the gate**: behavioral change requires a failing test first. | `CLAUDE.md:153` |
