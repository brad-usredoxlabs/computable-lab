# Small-LLM Portable Protocol YAML → Canonical Event Graph Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Let a very small LLM (lfm2.5-class 3B on Thunderbeast / DFlash daily driver) author an experiment by emitting a *closed-vocabulary, portable scientist-intent YAML*, which the existing deterministic compiler expands into the canonical event graph, then lowers to platform-specific execution. The 35B (qwen3.6-35b-a3b) gets the same contract — models differ only in which stage emits the intent, never in the downstream machinery.

**Pipeline (the load-bearing shape):**
```
English
  ↓  small LLM (lmf2.5 3B / qwen3.6-35b as fallback)
portable high-level protocol YAML   (scientist-intent)
  ↓  deterministic expansion (reuse protocolIntent machinery)
canonical event graph               (PlateEventPrimitive[] / TerminalArtifacts)
  ↓  existing platform-lowering passes (plan_deck_layout, emit_instrument_run_files, localization)
platform-specific execution
```

**Architecture:** A new, deliberately dumbed-down declarative `scientist-intent` record type (Ajv + lint-DSL, natural-string values, *symbolic* noun labels). A thin normalizer folds it into the existing `ProtocolIntent` (StatePlanner → Validation → Lowering → PatternExpanders), then the existing resolve/compute/emit passes produce `TerminalArtifacts`. A dedicated `POST /intent/compile` endpoint is the decoupled entry surface; a small-LLM adapter sits in front of it.

**Tech Stack:** TypeScript (server), Ajv 2020 + lint-DSL (schema authority, repo rule #3/#8), existing `server/src/compiler/protocolIntent/` + 26-pass PipelineRunner, Fastify route, same UI/event-editor consumer.

---

## Current context / assumptions (verified this session)

- `server/src/compiler/protocolIntent/` already is an intent→EVG layer: `ProtocolIntentStatePlanner.ts`, `ProtocolIntentValidation.ts`, `ProtocolIntentLowering.ts`, `ProtocolIntentPatternExpanders.ts`. Pattern expanders deterministically expand `serial_dilution`, `media_swap_duplicate_columns`, `source_wells_to_duplicate_target_columns`, `repeat_rows` → primitive transfer/mix/incubate events.
- `incubate` + `read`/`readout` biology-verb expanders exist (`server/src/compiler/biology/verbs/simpleVerbs.ts`).
- `ProtocolPatternIntent` (`ProtocolIntent.ts:201-218`) already carries an open `params?: Record<string, unknown>` — so `factor`, `points`, `replicates` can ride there without a breaking type change.
- The 26-pass chatbot pipeline is wired via `server/src/ai/runChatbotCompile.ts` using `PassRegistry` + `runPipeline` (`PipelineRunner.ts`). No standalone intent→EVG entry exists yet.
- Assurance / resolve-or-confirm (`server/src/ai/assurance.ts`) already has a CONFIRM gate + `clarificationRequestsFromAssurance`. Reused verbatim for symbolic-noun confirmation.
- Terminal `emit_instrument_run_files` pass + `plan_deck_layout` (platform-specific execution) already exist; intent-compile reuses them.

**Load-bearing decisions (Brad, locked):**
1. **Dedicated `POST /intent/compile` endpoint** — cleanly decoupled from chat-resolve + `ai_precompile`. Input = scientistIntent YAML. Output = the SAME `TerminalArtifacts` envelope the chat pipeline emits.
2. **Symbolic noun labels, never record IDs/deck slots.** `source: standards` stays a phrase. Downstream ontology resolver + `resolve_labware` + `resolve_references` + the existing confirm gate bind it. The small model never guesses IDs/decks. Unknown/ambiguous → `Gap`/`unresolved` → CONFIRM, NEVER a fabricated binding (hard-stop rule #10).
3. **Natural-string values.** Durations ("10 min"), volumes, wavelengths, factors as strings; normalized by existing strict parsers downstream. Small model does not need a numeric grammar.
4. **3-verb MVP** (`serial_dilution`, `incubate`, `read_plate`) proven end-to-end; vocabulary broadens in later phases.

---

## Task List (bite-sized, TDD, committed-in-order)

### Task 1: ScientistIntent schema — structural (Ajv)

> **For Hermes:** This task is 100% data (schema YAML), no TS.

**Objective:** New `scientist-intent.schema.yaml` validating the portable intent document shape.

**Files:**
- Create: `schema/workflow/scientist-intent.schema.yaml`
- Create: `schema/workflow/scientist-intent.lint.yaml`
- Test: `server/src/schema/ScientistIntentValidation.test.ts` (verify against existing Ajv harness — mirror `server/src/ai/assurance.test.ts` or an existing schema test's setup)

**Step 1: Write the schema.** Keep it a `record` with `actions[]`, optional `unresolved[]`, metadata via existing `FAIRCommon` pattern (see plan-skill note: mixin lives in `schema/core/common.schema.yaml`, `$defs/FAIRCommon`). Sketch:

```yaml
$id: https://computable-lab.com/schema/computable-lab/scientist-intent.schema.yaml
$schema: https://json-schema.org/draft/2020-12/schema
title: Scientist Intent
description: Portable high-level scientist protocol intent, the small-LLM output contract.
allOf:
  - $ref: "./common.schema.yaml#/$defs/FAIRCommon"
type: object
unevaluatedProperties: false
properties:
  intentId: { type: string, minLength: 1 }
  sourcePrompt: { type: string }
  actions:
    type: array
    minItems: 1
    items:
      type: object
      required: [action]
      unevaluatedProperties: false
      properties:
        action:
          type: string
          enum: [serial_dilution, incubate, read_plate]
        # symbolic labels — NEVER resolved ids
        source: { type: string }
        target: { type: string }
        targetHint: { type: string }
        factor: { type: number, minimum: 1.000001 }
        points: { type: integer, minimum: 2 }
        replicates: { type: integer, minimum: 1 }
        duration: { type: string }
        temperature: { type: number }
        mode: { type: string }
        wavelength: { type: string }
  unresolved:
    type: array
    items:
      type: object
      required: [label, reason]
      unevaluatedProperties: false
      properties:
        label: { type: string }
        reason: { type: string }
        candidates: { type: array, items: { type: object, unevaluatedProperties: false, properties: { label: { type: string }, confidence: { type: number, minimum: 0, maximum: 1 } } } }
required: [intentId, actions]
```

**Step 2: Iron the schema.** Register it with the schema registry (server loads recursively from `schema/`), then run a load-sanity check in `server/` (all 141 schemas load — see plan note).
Expected: validation passes for the 3-action example; fails for unknown `action`, missing `actions`, or `factor: 1`.

**Step 3: Lint rules** (`scientist-intent.lint.yaml`) — declarative, not TS:
- `serial_dilution` requires `source` (exists predicate)
- `serial_dilution` requires `factor > 1` and `points >= 2`
- `incubate` requires `duration` or `temperature`
- `read_plate` requires `mode`
- any `source`/`target` present must be a string ≥1 char (no empty symbolic label)

**Step 4: No code commit yet — just schema + lint + a validation test.** Run:
`cd server && pnpm test:run src/schema/ScientistIntentValidation.test.ts`
Expected: green.

**Step 5: Commit.**
```bash
git add schema/workflow/scientist-intent.schema.yaml schema/workflow/scientist-intent.lint.yaml server/src/schema/ScientistIntentValidation.test.ts
git commit -m "feat(schema): scientist-intent schema + lint for 3-verb intent contract"
```

---

### Task 2: Parse/normalize helpers + judgment daemon

> **For Hermes:** First TS that reads the data. TDD.

**Objective:** `parseScientistIntent(yamlText): ScientistIntentDocument` and a parser that errors on schema violations (Ajv sole authority).

**Files:**
- Create: `server/src/compiler/scientistIntent/parseScientistIntent.ts`
- Create: `server/src/compiler/scientistIntent/types.ts`
- Test: `server/src/compiler/scientistIntent/parseScientistIntent.test.ts`

**Step 1: Write failing test.**

```ts
import { expect, test } from 'vitest';
import { parseScientistIntent } from './parseScientistIntent.js';

test('parses the 3-action example', () => {
  const yaml = `
intentId: example-001
actions:
  - action: serial_dilution
    source: standards
    factor: 2
    points: 8
    replicates: 2
  - action: incubate
    duration: "10 min"
    temperature: 37
  - action: read_plate
    mode: absorbance
    wavelength: "450 nm"
`;
  const doc = parseScientistIntent(yaml);
  expect(doc.actions).toHaveLength(3);
});

test('rejects unknown action via Ajv', () => {
  const yaml = `intentId: x\nactions:\n  - action: evaporate\n`;
  expect(() => parseScientistIntent(yaml)).toThrow();
});
```

**Step 2: Run → FAIL.**

Run: `cd server && pnpm vitest run src/compiler/scientistIntent/parseScientistIntent.test.ts`
Expected: FAIL — module not found.

**Step 3: Implement.** `parseScientistIntent` uses `yaml` parse + the Ajv-validated schema from Task 1; throws a structured `IntentValidationError` when the load fails. Wire Ajv via the existing validator (single authority) — do NOT re-implement validation in TS.

**Step 4: Run → PASS.**

**Step 5: Commit.**
```bash
git add server/src/compiler/scientistIntent/ server/src/schema/ScientistIntentValidation.test.ts
git commit -m "feat(compiler): parseScientistIntent validates via Ajv (MVP)"
```

---

### Task 3: Serial-dilution law closure — the correctness core (TDD)

**Objective:** Extend `expandSerialDilution` in the existing pattern expander so a serial dilution is expressed via `factor`/`points`/`replicates` (concentration state), not just raw `rows`/`ratio`.

**Files:**
- Modify: `server/src/compiler/protocolIntent/ProtocolIntentPatternExpanders.ts` (add `factor`/`points`/`replicates` read + expansion; keep legacy `rows`/`ratio` path — backward compatible)
- Modify: `server/src/compiler/protocolIntent/ProtocolIntent.ts` — `ProtocolPatternIntent` already has open `params`; add optional typed `factor?: number; points?: number; replicates?: number` to make the contract explicit.
- Test: `server/src/compiler/protocolIntent/ProtocolIntentPatternExpanders.test.ts` (new cases)

**Step 1: Write failing test (concentration law).**

```ts
test('serial_dilution with factor/points/replicates preserves concentration', () => {
  const evts = expandProtocolIntentPattern({
    id: 's', kind: 'serial_dilution', targetLabware: 'plate_D',
    ratio: undefined,
    params: { factor: 2, points: 4, replicates: 2, transferVolumeUl: 50 },
  });
  // 4 points × 2 replicates → structured transfer events; assert count and
  // that per-point wells carry a serial-dilution index reflecting factor^i
  expect(evts.length).toBeGreaterThan(0);
});
```

(Full concentration-law golden via the existing well-state pass is Task 4.)

**Step 2: Run → FAIL** (currently `factor`/`points`/`replicates` unhandled → silently yields no/last events).

**Step 3: Implement.** In `expandSerialDilution`, when `params.factor` set: `points` rows as dilution points down the target column, `replicates` → target column/well duplication (replicate each row into `replicates` adjacent wells), with `transferVolume` defaulting when absent. Emit `serialDilutionRatio: '1:<factor>'` and a `serialDilutionPoint: i-1` (0-based depth) on each transfer detail. Legacy `rows`/`ratio`/`targetColumn` path unchanged.

**Step 4: Run → PASS.**

**Step 5: Commit.**
```bash
git add server/src/compiler/protocolIntent/ProtocolIntentPatternExpanders.ts server/src/compiler/protocolIntent/ProtocolIntent.ts server/src/compiler/protocolIntent/ProtocolIntentPatternExpanders.test.ts
git commit -m "feat(compiler): serial_dilution factor/points/replicates enrichment (concentration law)"
```

---

### Task 4: Well-state concentration golden test

**Objective:** Prove the dilution law through the existing well-state composition tracker (Volumic reduction), not just flat event counts.

**Files:**
- Test: `server/src/compiler/.../wellState.serialDilution.golden.test.ts` (place beside existing well-state tests; if wellState pass emits, find its test dir via `git ls-files 'server/src/**/*concentr*'` + `wellState` tests)
- Modify: none (assert only, unless golden catches a real bug → fix in Task 3)

**Step 1: Write failing test that runs the local-compile/well-state pipeline on a scientist-intent-driven serial_dilution and asserts each point's `concentration = stock / factor^depth`.**

**Step 2: Run → FAIL (if well-state not yet fed by intent path) or PASS (if already composes correctly).** If FAIL is purely "no intent entry point", that's legitimately deferred — the compose path is Task 5. Mark this test `skip` gate: it asserts the *law*, requires Task 5 wiring. Put it here so the law is proven before the endpoint.

**Step 3: Commit.**
```bash
git commit -m "test(compiler): serial-dilution concentration-law golden (x).
```

---

### Task 5: `POST /intent/compile` endpoint (decoupled surface)

**Files:**
- Create: `server/src/api/handlers/IntentCompileHandlers.ts`
- Create: `server/src/compiler/scientistIntent/normalizeScientistIntent.ts` (scientistIntent → `ProtocolIntent`)
- Modify: `server.ts` (register route; re-use the existing `runChatbotCompile`-style deps: `ontologyResolver`, `searchLabwareByHint`, `llmClient`, `store`)
- Test: `server/src/api/handlers/IntentCompileHandlers.test.ts` (round-trips the 3-action example to `TerminalArtifacts` with no gaps)

**Step 1: normalizer.** For each `action`, map to the matching `ProtocolPatternIntent`/`ProtocolOperationIntent`:
- `serial_dilution` → `PatternIntent(kind:'serial_dilution', sourceLabware: <symbol>, params:{factor,points,replicates, targetLabware: <symbol>})`
- `incubate` → `OperationIntent(kind:'incubate', durationSeconds: parseDuration('10 min'), temperatureC: 37)`
- `read_plate` → `OperationIntent(kind:'read', mode, wavelengthNm: parseWavelength('450 nm'))` (feed `read` intent type; `instrument` stays null → resolves later)
- Symbolic `source`/`target` labels are placed in `op.labwareId`/`sourceLabware`/`targetLabware` as the SYMBOL, NOT resolved — never call the resolver inside the normalizer.

**Step 2: TDD the handler.** The handler does: parse intent → normalize → run the existing `ProtocolIntentStatePlanner → Validation → Lowering → PatternExpanders → resolve_labware → resolve_roles → compute_volumes` passes → assemble `TerminalArtifacts` → return JSON. Return `{ successful: true, terminalArtifacts }` or `{ confirmed: true, gaps }` when any symbolic noun is unresolved (mirror chat contract).

**Step 3: Wire the route** in `server.ts`, e.g. `app.post('/api/intent/compile', intentCompileHandler)`.

**Step 4: Integration test** posts the 3-action YAML, asserts `terminalArtifacts.events` length > 0, has `incubate` and `read` and ≥1 `transfer`, and no `gaps` (all symbols resolve against fixtures) — OR asserts `confirmed` with a clear `gap` when `source` is ambiguous.

**Step 5: Run `cd server && pnpm test:run src/api/handlers/IntentCompileHandlers.test.ts` → PASS.**

**Step 6: Commit.**
```bash
git commit -m "feat(api): POST /intent/compile — scientist<intent→TerminalArtifacts via protocolIntent"
```

---

### Task 6: Small-model driver + dedicated system prompt

**Files:**
- Create: `server/src/compiler/scientistIntent/intentCompile.ts` — `function compileFromSmallLlm(prompt, deps): Promise<CompileResult>` that (a) renders the compact prompt, (b) calls the configured small model (the `llmClient` already used elsewhere, `config`-seeded model), (c) takes the YAML and calls `POST /intent/compile` internals.
- Create: `schema/registry/prompt-templates/intent.compile.system.yaml` — a ~40-line prompt teaching ONLY the closed 3-verb vocab + the schema + "never invent a record id or deck slot — emit a symbolic label and add an `unresolved` entry" + "output ONLY YAML".
- Test: `server/src/compiler/scientistIntent/intentCompile.test.ts` — mocked small-LLM returns the 3-line YAML; assert it flows to `TerminalArtifacts` (drives through Task 5 normalizer).

**Step 1: Write failing test** (mock LLM returns valid intent YAML → assert compile succeeds with `outcome:'complete'`).

**Step 2: Run → FAIL.**

**Step 3: Implement** `intentCompile.ts` + prompt template + register the template so `renderPromptTemplate('intent.compile.system')` resolves.

**Step 4: Run → PASS.**

**Step 5: Commit.**
```bash
git commit -m "feat(compiler): intentCompile small-LLM driver + closed-vocab system prompt"
```

---

### Task 7: End-to-end on a real small model (verification)

**Files:**
- Modify: none (verification + possibly prompt tweaks)
- Instrument: `.run/backend.log` (watch) ; possibly a one-off vitest-mocked or a real infra call to lfm2.5 (per the speed-laptop note) or qwen3.5 small in Thunderbeard.

**Step 1:** Point `ai.inference.baseUrl`/`model` at the small model; restart server (`./start-app.sh` or `cd server && APP_BASE_PATH=.. npx tsx --watch src/server.ts`).
**Step 2:** POST the 3-line English prompt to the small-LLM emission path; assert it returns valid `scientistIntent` YAML.
**Step 3:** POST that YAML to `/api/intent/compile`; assert `TerminalArtifacts` with correct events.
**Step 4:** Document the acceptance evidence (the actual small-model output) in a comment or `docs/` note. Do NOT hardcode the output.
**Step 5:** Commit nothing unless a prompt now must ship (e.g. adding a phrase like "never emit rejected fields").

---

### Task 8 (optional, only if Brad confirms): browser-verify event-graph editor

Use the `browser-testing-react-components` / dogfood approach: load the event-graph editor, POST a serial_dilution intent, confirm the EVG renders the SAME transfer/incubate/read events as the chatbot compile. Requires the app to surface an intent-compile path. **Deferred** — do not build UI this plan.

---

## Files summary (all the surfaces this touches)

| Kind | Path |
|------|------|
| schema | `schema/workflow/scientist-intent.schema.yaml`, `.lint.yaml` |
| types+parse | `server/src/compiler/scientistIntent/` (`types.ts`, `parseScientistIntent.ts`, `normalizeScientistIntent.ts`, `intentCompile.ts`) |
| handler+route | `server/src/api/handlers/IntentCompileHandlers.ts`, `server.ts` |
| pattern enrich | `server/src/compiler/protocolIntent/ProtocolIntentPatternExpanders.ts`, `ProtocolIntent.ts` |
| prompt | `schema/registry/prompt-templates/intent.compile.system.yaml` |
| tests | `server/src/{schema,compiler/scientistIntrintent,api/handlers,compiler/protocolIntent}` + well-state golden |

## Verification gates

- `cd server && pnpm test:run` (run from `server/` cwd — root `-w server` hits stale `.worktrees/t_*` — phantom fails)
- `cd server && pnpm typecheck` clean
- Ajv single validation authority — no hand-built validation in TS (rule #3/#1)
- Symbolic labels only; the small model never emits a resolved record ID (rule #2/#8, rule #10 hard stop)
- TDD: failing test before each behavior change

## Risks, tradeoffs, open questions

- **R1 (correctness):** The dilution law (Task 3–4) is the only hard correctness risk. Mitigated by TDD + well-state golden.
- **R2 (noun resolution):** symbolic labels must not silently resolve wrong. Mitigated by the confirm gate (reuses assurance).
- **Q3:** Should `read_plate` also exploit `assayId`→assay-spec population (readExpander `instrument` + assay specs already exist)? Yes likely — flag for the implementer of Task 5 normalizer. Mark with a code comment, ship in a follow-up after wrappers.
- **Q4 (wire doc vs record):** intent ships as a wire document for this plan; promote to a real recorded kind with an editor only if Brad wants humans typing intent by hand. Not in scope here.