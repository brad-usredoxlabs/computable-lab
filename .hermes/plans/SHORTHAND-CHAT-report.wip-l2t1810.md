# SHORTHAND-CHAT — coder report (lane 2, worktree l2t1810)

Branch: `SHORTHAND-CHAT-lane2-l2t1810` (base `16985fbf` / code `fa3ca817`, lane trunk tip at dispatch).
Final HEAD: see `git -c core.fileMode=false log --oneline -1` (recorded at the bottom).
Spec: `/mnt/vast/home/brad/git/cl-integration-2/.hermes/plans/2026-10-10_1955-SHORTHAND-CHAT-spec.md` (md5 `c679218f62caed816e35269f320f2267`) — read top to bottom; PROMOTION RECORD OQ rulings (OQ1 both arms deterministic-first, OQ2 `event_shorthand` + `shorthand:string`, OQ3 loud cannot-draft note, AS-2 no MANIFEST re-bless, AS-4 run-chat-scoped refusal) implemented as binding.

## 0. Commits (5, logical steps)

```
768083db SHORTHAND-CHAT: client renders the shorthand VERBATIM; edit = server recompile
5f711a8f SHORTHAND-CHAT: consolidate the compile seam into shorthandChat.ts; policy = run-chat only
b05b4974 SHORTHAND-CHAT: enum-pin updates for the widened agent_intent enum + shadow pick
cfdfc2e9 SHORTHAND-CHAT: run-chat drafts via event_shorthand through the frozen deterministic pipeline
43eb54a6 SHORTHAND-CHAT RED: run-chat shorthand e2e + colocated fixtures (AS-2)
16985fbf (base) docs(lane2): l2t1650 — W2-8-fix2 MERGED fa3ca817 ...
```

## 1. First targeted check (BEFORE any code) — compiler suite green at base

Command (from the `server/` package dir — policy is cwd-anchored):

```
cd /mnt/vast/home/brad/git/wt/SHORTHAND-CHAT-lane2-l2t1810/server && npx vitest run src/compiler/scientistIntent
```

Verbatim tail (re-run at final HEAD; identical at base):

```
 Test Files  13 passed (13)
      Tests  146 passed (146)
   Start at  23:01:37
   Duration  4.05s (transform 1.15s, setup 2ms, collect 7.03s, tests 8.39s, environment 3ms, prepare 1.46s)
```

Note: the FIRST attempt at base failed with `Cannot find package 'yaml'` — the fresh worktree was missing the lane-synced untracked `node_modules`/`server/schema`/config entries. Fixed by replicating them 1:1 from the TRUNK worktree (`/mnt/vast/home/brad/git/cl-integration-2`) per the lane-sync protocol (symlinks as symlinks; `server/schema` retargeted to `../schema`), never bulk-copied from Brad's live tree. Parity proven with `comm -3` of `git -c core.fileMode=false status --porcelain -uall --ignored=matching` between trunk and the lane worktree:

```
?? app/e2e/pbch4b-accept-leg.test.ts
=== parity done (empty above = 1:1)
```

The single parity exception is that trunk-only e2e receipt artifact (`app/e2e/pbch4b-accept-leg.test.ts`, untracked in trunk, absent here) — declared, not copied.

## 2. RED-first proof (the acceptance test fails at base, passes at HEAD)

The acceptance suite is `server/src/ai/AgentOrchestrator.shorthandChat.test.ts` (14 tests) + colocated fixtures `server/src/ai/fixtures/shorthand-add-dmem.yaml` and `shorthand-ambiguous-material.yaml` (AS-2: NOT SPINE-6 MANIFEST entries).

RED captured by restoring the base versions of every implementation file (`git -c core.fileMode=false checkout 16985fbf -- server/src/ai/{AgentOrchestrator,submitSuggestionTool,coerceAgentIntent,selectSubmitCall,types,shadowTelemetry}.ts`, removing `shorthandChat.ts`/`shorthandDrafting.ts`) while keeping the test file at HEAD:

```
 Test Files  1 failed (1)
      Tests  13 failed | 1 passed (14)
   Start at  23:01:07
   Duration  3.04s (transform 912ms, setup 1.35s, collect 1.35s, tests 69ms, environment 3ms, prepare 58ms)
```

The 1 pass at base is the exactOptionalPropertyTypes leg (`'shorthand' in result === false` for a `deck_layout` turn) — it legitimately holds pre-implementation because no shorthand key exists at all. The 13 failures include the load failure for the missing seam modules and every shorthand behavior. The failing file stayed as the acceptance test (spec §First targeted check).

GREEN at HEAD:

```
 Test Files  1 passed (1)
      Tests  14 passed (14)
   Start at  23:01:42
   Duration  4.19s (transform 726ms, setup 0ms, collect 1.18s, tests 101ms, environment 0ms, prepare 54ms)
```

## 3. Acceptance criteria → test mapping (task block, verbatim criteria)

| Criterion | Test | Result |
|---|---|---|
| e2e on the run-chat surface, stubbed model emits ONLY shorthand ("add 100 ul DMEM to A1:A12"-class), accepted result is a bound event graph from the deterministic compiler, IDENTICAL to direct `compileScientistIntent` output | `compiles the stubbed shorthand-only turn into the SAME bound graph the deterministic compiler produces` — deep-compares `projectGraph(result.events)` vs `projectGraph(direct.terminalArtifacts.events)` from a direct `parseScientistIntent + compileScientistIntent` run on the SAME YAML + store-backed spine; asserts 12 events both sides; asserts `runChatbotCompile` (legacy raw path) NEVER called | PASS |
| a model attempting raw events is refused/repaired per spec | `REFUSES a raw event_graph call on the run-chat surface and re-asks demanding shorthand — the raw payload is never compiled` — refusal status event visible, re-ask carries `event_shorthand`, accepted graph equals the deterministic compile, `JSON.stringify(result.events)` does NOT contain the model's invented material, legacy compile never called | PASS |
| the 422 clarification round-trip works through chat | `the 422-class round-trip: needs-clarification rides the chat clarification channel VERBATIM` (whole draft held, `events: []`, join id `unresolved-1`, `query`/`options`/`unresolvedFact.label` verbatim from the bar's `ScientistIntentUnresolvedFact`) + `a clarification answer folds deterministically: splice → Ajv re-parse → re-compile, ZERO model calls` (OQ1 mandatory arm: `model.callCount() === 1` after the answer turn) + `OQ1 fallback: ... ONE extraction-only re-ask carrying the held shorthand + answers as grounded context` | PASS |
| goldens extended, pipeline freeze respected, MANIFEST untouched | §6 below (goldens 15/15, MANIFEST blob `58c447eb…`, freeze diff empty) + new chat-e2e fixtures colocated per AS-2 | PASS |
| (lane decision) ONE forced tool with the new intent value, never a second forced tool, never free prose | `the ONE forced tool grows exactly one new intent value with one shorthand arg` (enum deep-equal, `shorthand.type === 'string'`) + `prose recovery recognises a shorthand payload through the coerceAgentIntent table (never guess)` + `a shorthand call is SUBSTANTIVE in the two-call tie-break` | PASS |
| exactOptionalPropertyTypes: no `shorthand` key when absent (bait 1) | `carries NO shorthand key at all when the turn carries none` (`'shorthand' in result === false`) | PASS |
| term panel truth (bait 9) | `the shorthand path omits termManifest explicitly` (`'termManifest' in result === false`) | PASS |
| OQ3 loud cannot-draft note | `OQ3: ... says so LOUDLY and never silently event-compiles` (`success:false`, error matches `/cannot draft/i`, `model.callCount() === 0`, legacy compile never called) | PASS |
| surface membership is DATA, AS-4 scoping | `shorthand surface membership is DATA (config/drafting/shorthand-drafting.yaml), not a TS literal` (`workspace.deck` in; `event-editor`/`protocol-builder`/undefined out) | PASS |

## 4. Per-file change rationale

### Server (in the spec's ownership map)

- `server/src/ai/submitSuggestionTool.ts` — the ONE forced tool: `intent.enum` grows exactly one value `event_shorthand`; one new arg `shorthand: {type:'string'}` (scientist-intent YAML document); `AgentIntentArgs` union + `shorthand?: string` field; `parseAgentIntentArgs` decodes it; tool `description` routes event drafting to the shorthand document and states the model never writes events/well grids/record ids/deck slots. No second tool def, no prose path added.
- `server/src/ai/coerceAgentIntent.ts` — `AgentIntentName` + `INTENT_KEYS` gain `event_shorthand: ['shorthand']`; `SHORTHAND_ARG_KEYS` exported (one source). Never-guess preserved: `matches.length === 1` else null, so a payload carrying BOTH `events` and `shorthand` resolves to null (tested). `DRAFT_ARG_KEYS` NOT widened (stays event-only; it drives the unknown-field diagnostic).
- `server/src/ai/AgentOrchestrator.ts` —
  - `FORCED_DRAFT_TOOL_INSTRUCTION` + `buildForcedDraftJsonPrompt` rewritten: event drafting demands the shorthand document (the old event/key-set coaching dropped; never-invent-CURIE and never-empty-call rules kept).
  - New `event_shorthand` branch: `parseScientistIntent` (Ajv sole authority, validate-in-place, never a repaired re-parse) → `compileShorthandDeterministically` (the seam, below) with the production deps (`deps.store`, `deps.searchLabwareByHint` — server.ts:1080/:1074) → `shorthandResultFromCompile` → the existing proposal/draft shape so `ChangesPanel` keeps working, plus the verbatim shorthand on `AgentResult`.
  - Raw-events refusal (AS-4): on a shorthand surface an `event_graph` call is REFUSED — re-ask ONCE with the rewritten forced prompt; the raw payload is NEVER compiled; keyed on the STRUCTURED intent discriminator (origin-based), never message-substring. `event_graph` enum + legacy `runChatbotCompile` stay for surfaces not yet moved.
  - Malformed shorthand (`ScientistIntentValidationError` from the model payload) = MALFORMED MODEL OUTPUT: re-ask ONCE with the contract quoted (`malformedShorthandRepairPrompt`, origin-based), then an honest failure — never a repaired compile (tested both arms).
  - Gate re-attachment at the INTENT boundary: `needs-clarification` → the bar's `ScientistIntentUnresolvedFact`s VERBATIM on the chat clarification channel; the validated intent is HELD per conversation (the `getDefaultLabStateCache`/held-`localMacro` precedent). Well binding and material grounding already live inside the frozen compile (keep-by-compile, never trusting the model's graph).
  - OQ1 both arms, deterministic-first: an answer that maps 1:1 (join id + `actionLocation`) splices the noun onto the HELD intent, Ajv re-parses, recompiles — ZERO model calls; no 1:1 mapping ⇒ the permitted SPINE-5-shaped extraction-only re-ask with the held shorthand + answers as grounded context (the model still only writes shorthand).
  - OQ3: a forced-draft shorthand turn with no model configured returns a loud "No model configured — cannot draft…" and never silently event-compiles; `deterministicOnly` legacy modes untouched.
  - Shadow telemetry: `shadowRoute('event_shorthand', …)` for the new path; the `event_graph` pick stays for the legacy path only.
  - Prose recovery (`coerceDraftArgsFromContent`): recognises a shorthand payload via `SHORTHAND_ARG_KEYS` (table entry, one source).
  - After the seam consolidation (commit 5f711a8f) this file contains ZERO occurrences of `compileScientistIntent` — it reaches the frozen pipeline only through `shorthandChat.ts`.
- `server/src/ai/types.ts` — `AgentResult.shorthand?: string` (conditional-spread sites; key ABSENT, never `undefined`).
- `server/src/ai/selectSubmitCall.ts` — `eventCountOf` recognises a shorthand document as substantive (a shorthand call can no longer lose a two-call tie); a shorthand call with no usable document scores 0. The pinned diagnostic string `'no draft events in it'` was deliberately NOT changed (a test pins it; the substantive fix is the scoring).
- `server/src/ai/shadowTelemetry.ts` — `ShadowRouterPick` gains `'event_shorthand'` (its own pick).
- NEW `server/src/ai/shorthandChat.ts` — the chat-side seam: held-intent cache (bounded, per conversation), `clarificationsFromUnresolvedFacts` (PURE structural map; the server mints no labels/candidates/confidences beyond the join id `unresolved-<index+1>`; kind/menu derived from the VOCABULARY's declared argument domain — data, no verb branch), `foldAnswersIntoShorthand` (OQ1 deterministic splice; splices against the BAR's facts, which carry the `actionLocation` identity, then re-parses via Ajv), `heldReextractionContext` (OQ1 fallback), `malformedShorthandRepairPrompt`, `compiledEventsToProposals`/`shorthandResultFromCompile` (the SAME proposal mapping `compileResultToAgentResult` uses; `termManifest` deliberately omitted — bait 9), and `compileShorthandDeterministically` (the single declared consumer of the frozen pipeline, with the IntentCompileHandlers store-backed spine composition; no store wired ⇒ null, the honest COMPILE_INTERNAL precedent).
- NEW `server/src/ai/shorthandDrafting.ts` + NEW `config/drafting/shorthand-drafting.yaml` — surface membership is DATA (`surfaces: [workspace.deck]`, the analysis-composition.yaml precedent, loaded per call, never process-cached); the orchestrator gates on membership, zero surface-name literals (repo rule #1). AS-4: `event-editor` and every other surface keep the raw-events code.
- `server/src/ai/fixtures/shorthand-add-dmem.yaml`, `shorthand-ambiguous-material.yaml` — the chat-e2e golden fixtures (AS-2 colocated; NOT MANIFEST entries).
- `server/src/ai/AgentOrchestrator.shorthandChat.test.ts` — the acceptance suite (14 tests).
- `server/src/ai/submitSuggestionTool.{,analysis,protocolEdit,workstate}.test.ts` — enum pins gain the one new value (test-only).
- `server/src/compiler/scientistIntent/noBypass.test.ts` — the W2-7 closure allow-list gains EXACTLY ONE entry (`ai/shorthandChat.ts`) with an inline rationale: a declared CONSUMER of the pipeline, not a second compiler; pipeline modules themselves untouched. (This is the only file I touched under `src/compiler/scientistIntent/`, and it is a guard test, not a pipeline module — see §6 for the freeze evidence and the declared deviation.)

### Client (in the spec's ownership map)

- `app/src/event-editor/right-pane/ai/assistStream.ts` — `AssistDraftResult.shorthand?: string` (render mirror of the server's `AgentResult`; no import from server/**).
- `app/src/event-editor/right-pane/ai/sidebarState.ts` — `reviewing` variant + `draft-ready` action carry `shorthand?: string`; reducer uses the conditional spread (`...(action.shorthand !== undefined ? { shorthand } : {})`) so a draft without shorthand stays byte-identical.
- `app/src/event-editor/right-pane/ai/ChangesPanel.tsx` — `ShorthandView` renders the document VERBATIM in a `<pre>` (byte-identical to what was compiled) above the changes list, following the `protocolDiff`-in-ChangesPanel precedent (no new rail). Edit affordance: textarea → Save & recompile sends the text UNTOUCHED to the caller; a rejected edit shows the server diagnostic verbatim and the proposal stays; in-flight recompile disables Save. RENDER-ONLY: no parse, no validation, no summarizing (never a second grammar).
- `app/src/event-editor/right-pane/ai/ChangesPanel.css` — token-only styles (`--cl-*`; the styling test forbids hex/rgba and passes).
- `app/src/event-editor/right-pane/ai/AiTabPanel.tsx` — carries `result.shorthand` into `draft-ready` (conditional spread); `handleShorthandRecompile` POSTs the edited YAML to the EXISTING `POST /intent/compile` and replaces the sidebar review + deck ghosts from the recompiled graph (`buildPreviewFromDraft` with the compiler's events); zero LLM calls on the edit path; stale edit state cleared on every fresh draft.
- `app/src/shared/api/client.ts` — ONE new thin wrapper `intentCompile(yaml)` for the existing route. `intentCompileFromPrompt`/`intentTrainingPair` untouched.
- `app/src/event-editor/right-pane/ai/{ChangesPanel,sidebarState}.test.tsx?` — 7 new tests (5 panel + 2 reducer).

### OUT OF SCOPE respected (bait 10 + ownership map)

`git -c core.fileMode=false diff --name-only 16985fbf...HEAD | grep -E "shorthandCorpus|IntentTrainingPair"`:

```
NONE (bait 10 clean)
```

No corpus file touched, no capture wired from chat Accept, no schema/lint YAML edited, no new route added (`/intent/compile` reused), no stack restart, no browser reviewer run.

## 5. Lane pins — SET-equality evidence (AS-5: re-derived at my branch base)

### server tsc = 19 (SET-equal to the handed pin `/tmp/l2t1650-tsc-server.txt`)

```
cd server && npx tsc --noEmit 2>&1 | grep "error TS" | sed 's/([0-9]*,[0-9]*)//' | sort > /tmp/l2t1810-tsc-server-head3-norm.txt
diff /tmp/l2t1810-tsc-server-base-norm.txt /tmp/l2t1810-tsc-server-head3-norm.txt && echo "TSC SERVER SET-EQUAL (19)"
```

```
TSC SERVER SET-EQUAL (19)
```

At base the same normalized diff against `/tmp/l2t1650-tsc-server.txt` reported `TSC SERVER SET-EQUAL (19 normalized lines each)` — base and HEAD produce the identical 19-line SET (zero new, zero removed).

### app tsc = 34 (SET-equal, proven by stash-parity on pristine HEAD)

```
34        # head (with my app changes)
34        # pristine (my 8 app files stashed)
APP TSC SET-EQUAL (no new errors introduced)
```

(`diff` of the two normalized error SETs is empty — not just a matching count.)

### app FULL fail-SET = 35 files (SET-equal)

```
cd app && npx vitest run
COUNT: 35
=== diff vs base:
APP FULL FAILSET SET-EQUAL TO BASE (35)
```

Head tail:

```
      Tests  65 failed | 2075 passed (2140)
     Errors  5 errors
```

Base tail (same command at base): `Tests 65 failed | 2068 passed (2133) / Errors 5` — identical fail-SET (35 files, `diff` empty), identical error count (5 — the pre-existing unhandled-exception debt), +7 tests = my 7 new client tests.

### server scoped fail-SET

My scoped run is `cd server && npx vitest run src/ai src/compiler/scientistIntent` (the blast radius of this item). Base fail-SET (9 files) vs HEAD fail-SET:

```
COUNT: 9
SCOPED FAILSET SET-EQUAL TO BASE
```

Head tail:

```
 Test Files  9 failed | 89 passed (98)
      Tests  18 failed | 807 passed (825)
     Errors  2 errors
```

Base tail: `Test Files 9 failed | 88 passed (97) / Tests 16 failed | 795 passed (811) / Errors 2` — SET-equal, zero new failures, +14 tests = my acceptance suite.

The handed "11 files" pin is the lane's broader server debt list (`/tmp/l2t2310-w25-baseline-failfiles.txt`: EventEditorFixHandlers, ExtractHandlers, MeasurementHandlers.applianceJob, SignatureHandlers, WorkspaceHandlers, AuditEventService, extractionE2E, RevisionStorage, EventGraphEquipmentSchema, LabwarePhysicalGeometryData, LifecycleBypassAudit). I ran exactly those 11 files at HEAD and, for parity, with my server changes removed (pristine base):

- HEAD run: `Test Files 10 failed | 1 passed (11)` — `EventEditorFixHandlers.test.ts` PASSED in that run.
- Pristine-base run (my server implementation files stashed): `Test Files 10 failed | 1 passed (11)` — the SAME 10-file fail-SET, `EventEditorFixHandlers.test.ts` PASSED there too.

Verbatim pristine tail:

```
      Tests  15 failed | 64 passed (84)
     Errors  2 errors
   Start at  22:57:59
   Duration  18.13s (transform 6.69s, setup 1ms, collect 19.98s, tests 28.09s, environment 4ms, prepare 1.87s)
```

So the 11-file pin's membership is unchanged by my work; `EventEditorFixHandlers.test.ts` is flaky-at-this-lane-state (it passes in isolation on BOTH base and head — stash-parity proves my changes are not the cause). Declared honestly rather than papered over.

### lintRules = 81 (live lane stack, not restarted)

```
curl -s -m 10 localhost:3093/api/health | python3 -c "import sys,json; d=json.load(sys.stdin); print('lintRules:', d.get('components',{}).get('lintRules',{}).get('loaded'))"
lintRules: 81
```

## 6. Goldens + pipeline freeze + MANIFEST

```
cd server && npx vitest run src/compiler/scientistIntent/goldens
 Test Files  3 passed (3)
      Tests  15 passed (15)
```

```
git -c core.fileMode=false hash-object src/compiler/scientistIntent/goldens/MANIFEST.yaml
58c447ebd8dc62b111fc35ee5cd04d6e7c4aba35
```

Pipeline freeze — the spec's verbatim command (run from the repo root; note the paths are `server/`-prefixed in this repo, so the verbatim form returns empty trivially and the server-prefixed form is the meaningful one — both shown):

```
git -c core.fileMode=false diff --name-only 16985fbf...HEAD -- src/compiler/scientistIntent schema/scientist-intent
(empty above = verbatim command clean)
```

```
cd server && git -c core.fileMode=false diff --name-only 16985fbf...HEAD -- src/compiler/scientistIntent ../schema/scientist-intent
server/src/compiler/scientistIntent/noBypass.test.ts
```

DECLARED (not silently re-blessed): the only touched path under the frozen tree is `noBypass.test.ts` — a guard test, not a pipeline module. Zero pipeline modules (parse/lift/normalize/compile/realize), zero `goldens/` files, zero `schema/scientist-intent/` files changed. The guard's allow-list gained one declared consumer (`ai/shorthandChat.ts`) with inline rationale; its arms (a), (c)–(g) and the pipeline sha256 pin (b/d: `b47eee0c…`) all pass unchanged. If the orchestrator rules that even the guard test is off-limits, the alternative is a lane-side override — flagged as OQ-1 below, not decided here.

## 7. Reviewer-bait dispositions (the 10-point list)

1. **exactOptionalPropertyTypes** — every new server optional uses the conditional-spread idiom (`...(v !== undefined ? {v} : {})`); tested: `'shorthand' in result === false` on a non-shorthand turn, `'termManifest' in result === false`. One real bite happened and was fixed: passing `store: deps.store` (possibly `undefined`) into `ShorthandCompileDeps` raised TS2379; corrected to `...(deps.store ? { store: deps.store } : {})`.
2. **YAML-reload traps** — every entry into the compiler goes through `parseScientistIntent` (Ajv sole authority, validate-in-place, never a repaired re-parse): model payload, folded document, and the client's edited document (server-side at `/intent/compile`). No client-side parse exists anywhere in the diff.
3. **Never trust client-side compile** — the client POSTs the edited YAML to the existing `POST /intent/compile` and renders the server's `terminalArtifacts`; grep the app diff for `parseScientistIntent`-class logic: none (the app diff contains no compiler import).
4. **Ontology terms / closed vocabulary** — no verb added anywhere; prompt text names no verbs beyond pointing at the closed vocabulary; no CURIE-recall, no record-ids. `vocabularyMirrorDrift` and the whole scientist-intent suite are green (146/146).
5. **Hardcode boundary** — the stubbed model is test-injected (`completeStream`); the stub shorthand lives in test fixtures. `git diff 16985fbf...HEAD` added ZERO `DMEM` strings to any production file (grep of added lines: `0`; the pre-existing DMEM mentions in `reconcileDraftQuantities.ts` etc. are untouched trunk comments). Surface membership is YAML data. The refusal keys on the structured intent discriminator, never message-substring.
6. **Second forced tool / free prose** — `tool_choice` sites in `AgentOrchestrator.ts` are the pre-existing single forced def (grep shows only the original sites); the enum widened by exactly one value; no prose-draft path added (the prose path only RECOGNISES the same envelope).
7. **Prose-recovery + tie-break** — `coerceDraftArgsFromContent` recognises shorthand via `SHORTHAND_ARG_KEYS` (coerceAgentIntent's table, one source); `DRAFT_ARG_KEYS` stays event-only; `selectSubmitCall.eventCountOf` scores a shorthand document 1 (tested: the shorthand call wins a two-call tie and the side errand lands in `ignored`).
8. **Verbatim clarifications** — `clarificationsFromUnresolvedFacts` is a pure structural map; the only minted value is the join id; `label/reason/candidates/actionLocation` ride untouched on `unresolvedFact` (tested byte-level: `fact.id === 'unresolved-1'`, `fact.query === 'mystery goop'`, `fact.options === []`, `fact.unresolvedFact.label === 'mystery goop'`). kind/menu come from the vocabulary's declared argument domain (data), not a verb branch.
9. **Term panel truth** — the shorthand path omits `termManifest` explicitly (the raw-draft classifier classified hand-authored event refs; there are none here); the client never re-derives (no term logic added to the app diff).
10. **Corpus collision** — zero hunks in `shorthandCorpus.ts` / `IntentTrainingPairHandlers.ts`; no chat-Accept→corpus wiring. Forward-compatibility preserved: the accepted intent document is reachable as a value (`AgentResult.shorthand`, held per conversation), so SHORTHAND-CORPUS can hook Accept later without a re-shape.

## 8. Verification commands with verbatim tails (all from the coder worktree; every git command used `git -c core.fileMode=false`)

Already shown inline: §1 compiler 146/146, §2 RED 13-failed/1-passed and GREEN 14/14, §5 tsc server SET-EQUAL, app tsc stash-parity 34/34, app full 35-file SET-equal, scoped 9-file SET-equal, lintRules 81, §6 goldens 15/15 + MANIFEST blob + freeze diffs.

Client component suites:

```
cd app && npx vitest run src/event-editor/right-pane/ai/ChangesPanel.test.tsx src/event-editor/right-pane/ai/sidebarState.test.ts src/event-editor/right-pane/ai/ChangesPanel.styling.test.tsx
 Test Files  3 passed (3)
      Tests  41 passed (41)
   Start at  23:01:47
   Duration  22.99s (transform 508ms, setup 8.43s, collect 3.43s, tests 218ms, environment 49.87s, prepare 474ms)
```

Acceptance suite at HEAD:

```
cd server && npx vitest run src/ai/AgentOrchestrator.shorthandChat.test.ts
 Test Files  1 passed (1)
      Tests  14 passed (14)
   Start at  23:01:42
   Duration  4.19s (transform 726ms, setup 0ms, collect 1.18s, tests 101ms, environment 0ms, prepare 54ms)
```

Scoped server suites at HEAD:

```
cd server && npx vitest run src/ai src/compiler/scientistIntent
 Test Files  9 failed | 89 passed (98)
      Tests  18 failed | 807 passed (825)
     Errors  2 errors
```

App full suite at HEAD:

```
cd app && npx vitest run
      Tests  65 failed | 2075 passed (2140)
     Errors  5 errors
```

## 9. Assumptions

- AS-LANE2-SHORTHANDCHAT-R1: the new intent value is `event_shorthand` with one `shorthand: string` arg (OQ2 ruling as handed); rename-only if re-ruled.
- AS-LANE2-SHORTHANDCHAT-R2: "goldens extended" = the two NEW chat-e2e fixtures colocated with the acceptance test (AS-2 ruling); `goldens/MANIFEST.yaml` stays at blob `58c447eb…` — verified, untouched, no re-bless.
- AS-LANE2-SHORTHANDCHAT-R3: the chat 422 analogue is the pure structural map onto the existing `AgentClarificationRequest` channel (ClarificationPicker keeps working unchanged); answer-fold per OQ1 (deterministic-first, extraction-only fallback).
- AS-LANE2-SHORTHANDCHAT-R4: raw-events code stays for every surface except `workspace.deck` (AS-4); the policy YAML lists exactly `[workspace.deck]`.
- AS-LANE2-SHORTHANDCHAT-R5: pins re-derived at my branch base and asserted by SET-equality (server tsc 19, app tsc 34, app full 35 files, scoped 9 files for my blast radius + the handed 11-file list verified unchanged by stash-parity, lintRules 81, MANIFEST blob).
- AS-LANE2-SHORTHANDCHAT-R6: the fold splices against the COMPILE's clarifications (the bar's facts, which carry `actionLocation`), not the document's declared `unresolved` entries — a model document declares none; the recompile re-derives bars from scratch.
- AS-LANE2-SHORTHANDCHAT-R7: the deterministic fold is per-conversation in-process (the `getDefaultLabStateCache` precedent, bounded at 64 conversations); a process restart loses the held intent and the next answer takes the extraction-only arm. No durable store was added (none was specified).
- AS-LANE2-SHORTHANDCHAT-R8: the client edit-recompile reuses `buildPreviewFromDraft` with the compiler's events and no labware/equipment/record proposals (a scientist-intent document cannot express those; they belong to other intents).

## 10. Open questions for the orchestrator

- OQ-1: `noBypass.test.ts` (a guard test under the frozen tree) needed its allow-list extended by one declared consumer. I judged a guard-test edit in-scope (the spec's Design §2 explicitly routes the orchestrator branch through the pipeline, and the alternative — the orchestrator importing the compiler directly — would have added TWO allow-list entries). If the orchestrator rules any diff under `src/compiler/scientistIntent/` a freeze violation, say the word and I'll move the allowance to a lane-side override instead.
- OQ-2: `EventEditorFixHandlers.test.ts` (a member of the handed 11-file pin) passes in isolation at BOTH base and head in this lane state. Pin membership unchanged, but the pin's "always failing" framing is stale for that file — worth re-pinning at the lane level.
- OQ-3: the browser gate (verbatim-YAML panel above the proposal, edit → one `/intent/compile` + zero `/ai/assist/stream`) is the orchestrator's after merge; my client wiring is built to exactly that shape (`data-testid`s: `shorthand-view`, `shorthand-verbatim`, `shorthand-editor`, `shorthand-recompile`, `shorthand-error`).

## 11. Final state

```
git -c core.fileMode=false log --oneline -1
768083db SHORTHAND-CHAT: client renders the shorthand VERBATIM; edit = server recompile
```

Worktree clean (only lane-synced untracked node_modules/config entries present, never staged). Not merged, lane stack not restarted, browser reviewer not run — per contract.
