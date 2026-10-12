# SPEC DRAFT — SHORTHAND-CHAT (lane 2, l2t1550)

Composed by: cl-spec-composer, 2026-10-10 ~16:15 EDT
Trunk: cl/integration-2 @ 958703e1 (all line numbers re-verified first-hand at this HEAD)
Status: DRAFT — orchestrator review required before dispatch. Never dispatch unreviewed.

## Goal (one sentence)

Switch the event-editor run chat from "model composes event JSON" to "model emits scientist-intent shorthand": the single forced `agent_intent` tool grows ONE new intent value whose payload is a scientist-intent document, the server compiles it through the frozen deterministic pipeline into the run's event-graph proposal, and the AI panel shows the shorthand VERBATIM above the proposal with edits re-compiling deterministically.

## Binding decisions (reproduced verbatim from the task block)

```
# BINDING DECISIONS (architect, grounded at trunk eda3d170):
#   - ONE forced tool stays (agent_intent). New intent value routes event drafting through
#     the scientist-intent path; NEVER a second forced tool, NEVER free-prose (lane locked
#     decisions apply). The old event_graph key-set guidance at AgentOrchestrator.ts:778 and
#     the draft-tool instructions must change to demand shorthand, not events.
#   - The compiled event graph is produced ONLY by the deterministic pipeline (SPINE-4 pass /
#     realizeAndCompile surface, W2-7 report: realizeScientistIntent.ts:697). Code following
#     the approved spec must not maintain a second event-composition path; retire the raw-
#     events path when the last surface moves over.
#   - The harness gates (material grounding, clarification loop, well binding via SPINE-7
#     labels) re-attach at the INTENT boundary: clarifications ride ScientistIntentUnresolvedFact
#     (the 422 contract already exists), not hand-rolled event policing. Where a gate has no
#     intent-level equivalent yet, the task keeps it by compiling intent -> graph -> the SAME
#     existing gate, never by trusting the model's graph.
#   - UI: the AI panel shows the shorthand VERBATIM (the one-line/structured render of the
#     ScientistIntent) above the graph proposal; scientist edits to the shorthand re-compile
#     deterministically. Render-only one-liner — never a second grammar (memo ruling 2026-10-07).
```

## Acceptance criteria (verbatim from the task block, `verified by:`)

```
Headless: an end-to-end test on the run-chat surface where the stubbed model emits ONLY
shorthand ("add 100 ul DMEM to A1:A12"-class) and the accepted result is a bound event
graph produced by the deterministic compiler (compare against direct compileScientistIntent
output — identical); a model attempting raw events is refused/repaired per spec; the 422
clarification round-trip works through chat; goldens extended, pipeline freeze respected,
MANIFEST untouched. Browser gate (:5193): prompt "add 100uL of DMEM" on a selected row
shows the shorthand verbatim in the panel + graph proposal; an edit to the shorthand
re-renders the proposal; VERDICT: accept.
```

## Architecture summary (first-hand verified @ 958703e1)

The run chat rides `POST /ai/assist/stream` (`server/src/api/routes.ts:648` → `AIHandlers.ts` → `createAgentOrchestrator(...).run`). Today the forced-draft loop demands raw events:

- `server/src/ai/AgentOrchestrator.ts:774-788` — `buildForcedDraftJsonPrompt`; line **:778** verbatim: `'For event drafting, use intent "event_graph" and allowed top-level keys: events, labwareRequirements, labwareAdditions, clarification, unresolvedRefs, notes.'`
- `server/src/ai/AgentOrchestrator.ts:494-513` — `FORCED_DRAFT_TOOL_INSTRUCTION` (event_graph bullets at :498, :508).
- `server/src/ai/submitSuggestionTool.ts` — the ONE forced tool: `AGENT_INTENT_TOOL_NAME` :428, intent enum :443 (`event_graph|deck_layout|create_record|protocol_edit|workspace_action|compose_workstate|compose_analysis|query_workstate_history`), event args reused verbatim `DRAFT_ARGS_PROPERTIES` :405, decode `parseAgentIntentArgs` :726.
- `server/src/ai/coerceAgentIntent.ts` — prose-recovery table: `AgentIntentName` :17 (narrow 4-way union), `INTENT_KEYS` :19-27 (`event_graph: ['events','labwareRequirements','labwareAdditions','clarification','unresolvedRefs']` at :20), never-guess `inferAgentIntent` :46, `coerceToAgentIntentArgs` :61.
- `server/src/ai/AgentOrchestrator.ts:~2600-2990` — the event_graph branch hand-polices raw events: `normalizeDraftMaterialRefs` ~:2606, `bindMaterialAnswersToEvents` ~:2614, `resolveDraftMaterials` ~:2628 (lab spine), `forceMaterialClarifications` ~:2688 (import :43), layer follow-ups, `shadowRoute('event_graph', ...)` :2976, `draftTermManifest` ~:2987.
- Legacy post-tool re-compile `runChatbotCompile` (`server/src/ai/runChatbotCompile.ts:239`, call :2852) is skipped in `draftFlowMode === 'forced-tool'` (default :955).

The shorthand pipeline exists, merged, green (task block: 146/146):
- `server/src/compiler/scientistIntent/`: `parseScientistIntent` (Ajv sole authority), `liftScientistIntent`, `normalizeScientistIntent`, `compileScientistIntent` (`ScientistIntentCompileDeps` :81 — store-backed `spine` REQUIRED, fail-loud without it; `ScientistIntentCompileResult` :102 — `outcome`, `terminalArtifacts`, `diagnostics`, `clarifications: ScientistIntentUnresolvedFact[]`).
- `realizeScientistIntent.ts:697` — `realizeAndCompile` = lower → `parseScientistIntent` → `compileScientistIntent`, zero route/pipeline edits (the W2-7 surface pattern to copy).
- `intentCompile.ts` — `compileFromSmallLlm` (small model → intent YAML; system prompt GENERATED from the vocabulary YAML).
- `server/src/api/handlers/IntentCompileFromPromptHandlers.ts` — the SPINE-5 response contract at :200-314: 200 `{outcome: complete|gap, terminalArtifacts, localMacro, axes}` (+`clarifications` additive only on a gap carrying them, conditional spread — key ABSENT not undefined); **422 `NEEDS_CLARIFICATION`** `{error, outcome, clarifications (VERBATIM — the route mints no labels/candidates/ids), localMacro (held), terminalArtifacts (zero-artifact bundle)}` :274-288; **502 `MALFORMED_MODEL_OUTPUT`** on a `ScientistIntentValidationError` escaping the model CALL SITE (origin-based CLASSIFICATION SEAM :239-242 — never message-substring); 500 `INTENT_COMPILE_FAILED`/`INTENT_COMPILE_PROMPT_FAILED` for compile-machinery faults.
- `server/src/api/handlers/IntentCompileHandlers.ts` — `POST /intent/compile` already accepts `{intent: <yaml string>}` and compiles with the store-backed spine (`createResolveSpineFromContext`, server.ts:733 pattern) — **the exact seam the UI edit-recompile should reuse; no new route needed.**
- `types.ts:115-120` `ScientistIntentUnresolvedFact {label, reason, candidates?, actionLocation?}`.

UI today (`app/src/event-editor/right-pane/ai/`): `AiTabPanel.tsx` (1248 lines) receives the assist stream (`assistStream.ts`), converts draft events → `EventGraphChange[]`, dispatches `draft-ready` into `sidebarState.ts` reducer (`reviewing` variant carries `{draftId, interpretation, changes, warnings, terms?, protocolDiff?}`), renders `ChangesPanel.tsx` ("Apply to run" Accept; `protocolDiff` rides the SAME panel as a review card — the reuse precedent for a second proposal kind in one panel).

## Corrections to the architect grounding (line/name drift at HEAD 958703e1)

1. **Client method names**: the architect cites `compileFromPrompt (client.ts:3946)` and `saveIntentTrainingPair (client.ts:3979)`. Real names at HEAD: `intentCompileFromPrompt` (client.ts:3947; :3946 is its doc comment) and `intentTrainingPair` (:3980).
2. **"ZERO app-side callers" is STALE**: `ProtocolLocalizationThread.tsx` (landed via W2-8, merged 6c4d98c0) calls `intentCompileFromPrompt` at :317/:362/:393 and `intentTrainingPair` at :460. The claim holds ONLY for the **run-chat surface**: verified first-hand there are ZERO callers under `app/src/event-editor/right-pane/ai/` (AiTabPanel/assistStream never touch the shorthand endpoint). The spec's problem statement is therefore "the run chat never got rewired", not "the endpoint has zero callers".
3. **ReviewAiPanel is NOT in trunk**: `app/src/ingestion/protocol-review/ReviewAiPanel.tsx` exists only on the unmerged W2-9 branch (dd4bee0d, adv c1 = report-fix pending). The in-trunk review precedent for this item is `ChangesPanel.tsx` (+ the `protocolDiff`-in-ChangesPanel pattern). W2-9's ReviewAiPanel "verbatim display + accept" shape is a pending precedent to align naming with, NOT a dependency.
4. `realizeScientistIntent.ts:697`, `AgentOrchestrator.ts:778`, `coerceAgentIntent.ts:20` confirmed EXACT — no drift.

## Design (what the coder builds)

### Server — one forced tool, one new intent value

1. `submitSuggestionTool.ts`: add intent enum value **`event_shorthand`** (name per AS-1; orchestrator may rule otherwise) with ONE new arg `shorthand: string` — a scientist-intent YAML document (top-level `intentId`, `actions`, optional `unresolved`; the closed vocabulary is owned by `schema/scientist-intent/` — **no verb additions this item**). Update the tool `description` and `AgentIntentArgs` + `parseAgentIntentArgs` (:726) to decode it. The tool stays the ONLY forced call; no prose path is added.
2. `AgentOrchestrator.ts`:
   - Rewrite the event-drafting guidance: `FORCED_DRAFT_TOOL_INSTRUCTION` (:494-513) and `buildForcedDraftJsonPrompt` (:774-788, the :778 line) now demand the shorthand document, NOT events/key-sets. Keep the never-invent-CURIE / never-empty-call rules; drop the event/labware field coaching that only made sense for raw events.
   - New branch for `event_shorthand`: `parseScientistIntent` (Ajv sole authority, validate-in-place, **never a repaired re-parse**) → `compileScientistIntent` with the SAME production deps as `IntentCompileHandlers`/`IntentCompileFromPromptHandlers` (store-backed `spine` via `createResolveSpineFromContext` — already threaded into the orchestrator as `deps.resolveSpine`, server.ts:740/1087; `searchLabwareByHint`; `termsForSuggestions` where available). Compile result → the existing proposal/draft emission shape so `ChangesPanel` keeps working unchanged, PLUS the verbatim shorthand carried on `AgentResult` (new optional field `shorthand?: string` in `server/src/ai/types.ts:691+`, conditional-spread sites).
   - **Gate re-attachment**: `outcome: 'needs-clarification'` (the internal analogue of the 422 contract) → emit clarifications as a PURE structural map `ScientistIntentUnresolvedFact[] → AiClarificationRequest[]` (server mints no labels/candidates/ids — mirror the 422 verbatim rule at IntentCompileFromPromptHandlers.ts:274-287); hold the validated intent per conversation (precedent: `getDefaultLabStateCache`, and the held `localMacro` per SPINE-5 OQ4(a)). Well binding needs NO new gate: it lives inside the frozen compile (SPINE-7 labels). Material grounding already runs inside `compileScientistIntent`'s resolve_nouns; where a run-chat gate has no intent-level equivalent, keep-by-compile (compile → graph → the SAME existing gate), never by trusting the model's graph.
   - `ScientistIntentValidationError` from the model payload = MALFORMED MODEL OUTPUT: re-ask ONCE with a repair prompt that quotes the contract (mirrors the 502 class; origin-based, never substring-sniffing prose).
   - **Raw-events refusal/repair**: on the run-chat surface, an `event_graph` call is REFUSED — the turn re-asks with the (rewritten) forced prompt demanding shorthand; it is NEVER compiled. Scope the refusal by the existing surface name (the same scoping the deck/protocol branches use); the `event_graph` enum value and the legacy `runChatbotCompile` paths STAY for surfaces not yet moved (`ProtocolIdeHandlers.ts:1134`, `ProtocolIntakeHandlers.ts:89`) — retirement is when the LAST surface moves, per the binding decision.
   - Shadow-router classification: give the new intent its own pick; the `:2976` `shadowRoute('event_graph')` site stays for the legacy path only.
3. `coerceAgentIntent.ts`: widen `AgentIntentName` + `INTENT_KEYS` with the shorthand signature key (`shorthand`), keeping the never-guess rule (`matches.length === 1` or null). `AgentOrchestrator.ts:747-772` `coerceDraftArgsFromContent`: prose recovery must recognise a shorthand payload — add a SHORTHAND_ARG_KEYS-style table entry in `coerceAgentIntent.ts` (one source), do NOT widen `DRAFT_ARG_KEYS` (it drives the unknown-field diagnostic and stays event-only — the existing comment at :765-768 says exactly this).
4. `selectSubmitCall.ts:38` `eventCountOf` reads `args['events']` — a shorthand call scores 0 and can LOSE a two-call tie (the 1955 "first match won and the rest lost" precedent). Make tie-break recognise a shorthand payload as substantive.

### Client — verbatim shorthand above the proposal, edit = recompile

5. `assistStream.ts`: surface the new `shorthand` field from the done-result.
6. `sidebarState.ts`: add optional `shorthand?: string` to the `reviewing` variant (and `clarification` flow unchanged). `AiTabPanel.tsx`: carry it through `draft-ready`.
7. `ChangesPanel.tsx`: render the shorthand VERBATIM (a read-only `<pre>` of the exact YAML the server held — byte-identical to what was compiled) above the changes list, plus an edit affordance. Accept/Apply stays exactly today's flow.
8. **Edit-recompile is render-only at the client**: the edited YAML is POSTed to the EXISTING `POST /intent/compile` route (`{intent: <yaml>}`, IntentCompileHandlers.ts:69-79) — the server re-parses (Ajv sole authority) and re-compiles deterministically; the new proposal replaces the old; **no LLM call on the edit path, ever** (edits re-compile, never re-draft). Invalid edit → the parse error surfaces as a panel diagnostic, proposal untouched. This is the "render-only one-liner, never a second grammar" rule: the client never parses, validates, or summarizes intent semantics.
9. `client.ts`: add a thin `intentCompile(yaml)` wrapper for `/intent/compile` if none exists (checked: none in `app/src/shared/api/client.ts`); do NOT touch `intentTrainingPair`/`intentCompileFromPrompt`.

### SHORTHAND-CORPUS collision (51ac31e3 landed)

The capture seam (`server/src/corpus/shorthandCorpus.ts`, `IntentTrainingPairHandlers.ts` local-JSONL capture on every accepted macro, target = canonical ScientistIntent, graph = provenance only) is MERGED and OFF LIMITS: this item does not modify it, does not re-implement capture, and does not wire the chat Accept → corpus pair (that is SHORTHAND-CORPUS remaining work, explicitly "after SHORTHAND-CHAT"). The only forward-compatible thing this spec does is ensure the chat's accepted intent document is reachable as a value (the held/compiled `localMacro`-class object), so the corpus item can hook Accept later without a re-shape. Corpus pair targets stay ACCEPTED SHORTHAND, never compiled graphs.

## File ownership map

IN SCOPE (may edit):
- `server/src/ai/submitSuggestionTool.ts` (menu enum, description, AgentIntentArgs, parseAgentIntentArgs)
- `server/src/ai/coerceAgentIntent.ts` (intent table + shorthand keys, one source)
- `server/src/ai/AgentOrchestrator.ts` (prompts :494-513 + :774-788, new branch, refusal/repair, clarification mapping, AgentResult shorthand, shadow pick)
- `server/src/ai/types.ts` (AgentResult optional field)
- `server/src/ai/selectSubmitCall.ts` (tie-break recognises shorthand)
- `app/src/shared/api/client.ts` (one new wrapper method ONLY)
- `app/src/event-editor/right-pane/ai/{assistStream.ts, sidebarState.ts, AiTabPanel.tsx, ChangesPanel.tsx}` (+ their tests)
- New test files: server e2e chat-shorthand spec, golden fixture colocated with it; client component tests.

OUT OF SCOPE (do not touch):
- `server/src/corpus/shorthandCorpus.ts`, `server/src/api/handlers/IntentTrainingPairHandlers.ts` (51ac31e3 corpus territory)
- `server/src/compiler/scientistIntent/**` (pipeline freeze: parse/lift/normalize/compile/realize + `goldens/`), `schema/scientist-intent/**` (vocab/schema = pipeline freeze; `vocabularyMirrorDrift.test.ts` will fail loudly on drift)
- `server/src/compiler/scientistIntent/goldens/MANIFEST.yaml` — MUST stay at blob 58c447ebd8dc62b111fc35ee5cd04d6e7c4aba35 ("goldens extended" per verified-by = NEW chat-e2e golden fixtures colocated with the new chat e2e test, per AS-2 — NOT new entries in the blessed SPINE-6 manifest)
- `server/src/ai/runChatbotCompile.ts` + other surfaces' raw-events callers (`ProtocolIdeHandlers.ts`, `ProtocolIntakeHandlers.ts`) — other surfaces move in a later item
- `app/src/event-editor/right-pane/protocol/ProtocolLocalizationThread.tsx` (already shorthand; W2-8 territory), `IntentCompileFromPromptHandlers.ts` (the contract is done; ride it, don't edit it), `server/src/ai/forceMaterialClarifications.ts` et al. (keep-by-compile reuses them, no edits)

## First targeted check (proves the approach early — run BEFORE writing any code)

```bash
cd /mnt/vast/home/brad/git/cl-integration-2/server && npx vitest run src/compiler/scientistIntent
```
Expected: all scientist-intent suites green (baseline incl. goldens 15/15 under `goldens/`). Then RED-FIRST per CLAUDE.md rule 5: write the chat e2e (stubbed `completeStream` yielding ONLY an `agent_intent` `event_shorthand` call with an "add 100 uL DMEM to A1:A12"-class document, orchestrator deps stubbed per the `AgentOrchestrator.test.ts` precedent) asserting the proposal events deep-equal a direct `compileScientistIntent` run on the same YAML + spine fixture. It fails now; that failing file IS the approach proof and stays as the acceptance test.

## Verification commands (with expected output)

All from the coder worktree. ALWAYS `git -c core.fileMode=false` for any git plumbing.

```bash
# 1. Server typecheck — must match the lane pin EXACTLY (normalized multiset, at HEAD >= b19949fd)
cd server && npx tsc --noEmit 2>&1 | grep -c "error TS"          # expect: 19 (pin /tmp/l2t1440-tsc-server.txt)

# 2. App typecheck — base-debt pin
cd app && npx tsc --noEmit 2>&1 | grep -c "error TS"             # expect: 34 (no NEW errors: diff the SET vs base)

# 3. Server scoped suites (run FROM the server/ pkg dir — vitest workspace-root pitfall)
cd server && npx vitest run src/ai src/compiler/scientistIntent
#   expect: base-debt fail-SET of 11 files, SET-equal to the lane's pinned base-debt list, zero new failures;
#   ALL new shorthand suites green

# 4. App unit — FULL run, fail-SET must be SET-equal to the 35-file base-debt set (counts drift; the SET is authoritative)
cd app && npx vitest run

# 5. Goldens + pipeline freeze
cd server && npx vitest run src/compiler/scientistIntent/goldens  # expect: "15 tests, 0 failures"
git -c core.fileMode=false hash-object src/compiler/scientistIntent/goldens/MANIFEST.yaml
#   expect: 58c447ebd8dc62b111fc35ee5cd04d6e7c4aba35  (MANIFEST untouched)
git -c core.fileMode=false diff --name-only <base>...HEAD -- src/compiler/scientistIntent schema/scientist-intent
#   expect: EMPTY (pipeline freeze)

# 6. lintRules count unchanged (health surface)
curl -s localhost:3093/api/health | jq '.components.lintRules.loaded'   # expect: 81
```

Browser gate (:5193, run by the browser-reviewer, not the coder): on the run page with a row selected, prompt "add 100uL of DMEM" → the panel shows the shorthand verbatim (byte-identical YAML) above the graph proposal; editing the shorthand and submitting re-renders the proposal WITHOUT a new model call (network shows one `/intent/compile`, zero `/ai/assist/stream`); VERDICT: accept.

## Worker contract

- Worktree: `/mnt/vast/home/brad/git/wt/SHORTHAND-CHAT-lane2-l2t<tick>`
- Branch: `cl/SHORTHAND-CHAT-lane2-l2t<tick>` off `cl/integration-2` trunk (HEAD >= 958703e1; do NOT branch off an older handoff HEAD — 51ac31e3 + b19949fd are load-bearing).
- Deliverable report: `.hermes/plans/SHORTHAND-CHAT-report.wip-l2t<tick>.md` (unique path, in-lane pattern of the W2-*-report.wip-* files); every verification command's VERBATIM tail in the report.
- Lane pins to honor: server tsc 19 (`/tmp/l2t1440-tsc-server.txt`, valid at HEAD >= b19949fd), app tsc 34, app FULL fail-SET 35 files (set-equality, not count), server scoped 11 (base-debt set), MANIFEST blob 58c447eb, lintRules 81. ALWAYS `git -c core.fileMode=false`. Server tests run FROM the `server/` pkg dir. No stack restarts (lane-stack is orchestrator-owned).

## Reviewer bait (the adversarial review WILL probe these — pre-empt in code and report)

1. **exactOptionalPropertyTypes (server/tsconfig.json:13 is TRUE; app tsconfig does NOT set it)**: every new server-side optional (`AgentResult.shorthand`, clarification mapping) must use the repo's conditional-spread idiom `...(v !== undefined ? {v} : {})` — key ABSENT, never `undefined`. The 422/gap success shape (IntentCompileFromPromptHandlers.ts:305-313) is the byte-shape precedent. Add a test asserting the frame has NO `shorthand` key when absent.
2. **YAML-reload traps**: shorthand round-trips through the model and through user edits; EVERY entry into the compiler goes through `parseScientistIntent` (Ajv sole authority, validate-in-place, NEVER a repaired re-parse — realizeScientistIntent.ts:668-680 is the precedent, "never a repaired re-try"). The client's re-serialized textarea value must be re-parsed server-side at `/intent/compile`; a client-side parse that "fixes" YAML is a hard stop.
3. **Never trust client-side compile**: if the edit-recompile renders a proposal computed in TS on the client, STOP — the deterministic compiler is the server's `/intent/compile`; the client is render + POST only. Reviewer will grep the app diff for `parseScientistIntent`-class logic.
4. **Ontology terms / closed vocabulary**: the shorthand verbs come from `schema/scientist-intent/scientist-intent-vocabulary.yaml` (prompt verb block GENERATED — `vocabularyMirrorDrift.test.ts` fails on drift). New prompt text must not smuggle in verbs, CURIE-recall ("no ontology CURIE you were not given"), or record-ids the model can't know. Any treeState line move under `schema/scientist-intent/` = pipeline-freeze violation = STOP declared in the report, not silently re-blessed.
5. **Hardcode boundary**: the stubbed model lives in TEST deps (completeStream injection, AgentOrchestrator.test.ts precedent); the stub shorthand lives in a test fixture. Any shorthand/DMEM string inside `src/` is a hard stop (CLAUDE.md rip-out rule). The raw-events refusal must key on the STRUCTURED intent discriminator (origin-based, like the CLASSIFICATION SEAM at IntentCompileFromPromptHandlers.ts:239), never on message-substring sniffing.
6. **Second forced tool / free prose**: reviewer greps for a second `tool_choice`/forced def and for any prose-draft path — one forced tool, enum widened only.
7. **Prose-recovery + tie-break blind spots**: `coerceDraftArgsFromContent` (AgentOrchestrator.ts:747-772) must recover a `{intent:'event_shorthand', shorthand:'...'}` prose payload via a table entry in `coerceAgentIntent.ts` (DRAFT_ARG_KEYS stays event-only); `selectSubmitCall.eventCountOf` must not silently drop the shorthand call in a two-call turn (the :1955 precedent).
8. **Verbatim clarifications**: the chat-side clarification card must be a pure structural map of `ScientistIntentUnresolvedFact` (label/reason/candidates/actionLocation) — server mints no labels, confidences, ids beyond the join id (precedent: the material-<eventIndex+1> join id); candidates ride through untouched so the 422 round-trip test and the chat test see the SAME facts.
9. **Term panel truth**: `draftTermManifest` (~:2987) classified the whole raw draft; the shorthand path must either supply the term manifest from the intent boundary server-side or omit it explicitly — the client must never re-derive (the "panel and harness cannot disagree" rule).
10. **Corpus collision**: any diff hunk touching `shorthandCorpus.ts`/`IntentTrainingPairHandlers.ts` or capturing a corpus pair from chat Accept is scope creep into SHORTHAND-CORPUS — reject.

## Open questions (with recommendations)

- **OQ1 — How clarification ANSWERS fold back into the held intent.** Checked: the 422 contract re-POSTs `protocolText + answers` to re-run `compileFromSmallLlm` (IntentCompileFromPromptHandlers.ts:216-236); the chat loop already plumbs `clarificationAnswers` end-to-end (types.ts:~203, AIHandlers :184-470, client assistStream :51-52). No merged code folds a pick into an intent document deterministically. Recommendation: deterministic splice when the answer maps 1:1 onto an `unresolved` fact by index/label (replace the fact, re-parse via Ajv, re-compile — no model call); fall back to one small-LLM RE-EXTRACTION with the held shorthand + answers as grounded context (the SPINE-5 shape; extraction-only is allowed — the model still only writes shorthand). Orchestrator should rule which arm is mandatory for this item (recommend: both, deterministic-first).
- **OQ2 — Name of the new intent value.** Recommendation `event_shorthand`, arg `shorthand: string`. Checked: the existing enum (submitSuggestionTool.ts:443) is snake_case per capability; `scientist_intent` collides conceptually with the tool's `intent` discriminator. This is a naming ruling for the orchestrator; everything else is name-independent.
- **OQ3 — Fate of `deterministicOnly` chat when the shorthand path is active.** Checked: with no LLM configured, chat falls to the deterministic raw-prompt compile (types.ts:195-198, runChatbotCompile.ts:251-265, AgentOrchestrator :1106-1118). With run-chat event drafting moved to shorthand, there is NO deterministic authoring path (an intent document requires extraction). Recommendation: keep the deterministic fallback ONLY for the non-forced legacy modes as-is, and have the forced-tool run-chat path surface a loud "no model configured — cannot draft" note instead of silently event-compiling; do NOT delete the legacy modes (other surfaces). This keeps the 11-file server scoped fail-set stable (some orchestrator tests construct `preflight-llm` explicitly, e.g. AgentOrchestrator.test.ts:36).

## Assumptions

- AS-LANE2-SHORTHANDCHAT-1: the new intent value is named `event_shorthand` carrying one `shorthand: string` YAML document arg; if the orchestrator rules another name, rename only — no shape change.
- AS-LANE2-SHORTHANDCHAT-2: "goldens extended" (verified-by) means NEW chat-e2e golden fixtures colocated with the new chat e2e test, NOT new entries in the blessed SPINE-6 `goldens/MANIFEST.yaml`, which must stay at blob 58c447eb (verified first-hand via `git hash-object` at 958703e1). If the orchestrator intends a real SPINE-6 bless, that contradicts "MANIFEST untouched" and needs a ruling.
- AS-LANE2-SHORTHANDCHAT-3: the 422 ride on chat = pure structural map of `ScientistIntentUnresolvedFact[]` → the existing `AiClarificationRequest` channel (ClarificationPicker keeps working); answer-fold per OQ1.
- AS-LANE2-SHORTHANDCHAT-4: raw-events code (`runChatbotCompile` + `event_graph` enum) remains for non-run-chat surfaces; refusal/repair is scoped to the run-chat surface only; retirement is a later item when the last surface moves.
- AS-LANE2-SHORTHANDCHAT-5: pins 19/34/35/11/81 are as handed by the orchestrator; the coder re-derives the failing SETs at their branch base and asserts SET-equality (a count that happens to match but a different SET is a defect).
- AS-LANE2-SHORTHANDCHAT-6: scout output used only for screening (flow shape); every load-bearing line above was re-verified first-hand with read/grep at 958703e1.

---
**DRAFT — this spec is NOT canonical.** Orchestrator: review the OQ rulings (esp. OQ1 fold-mechanism and AS-2's goldens reading), fix or approve, then promote to the canonical spec path. Do not dispatch a coder against this file as-is.

## PROMOTION RECORD (orchestrator, 2026-10-10T19:55 EDT, tick l2t1810)

Promoted to canonical at trunk tip 16985fbf (code fa3ca817). Draft md5 f93d4d648521813de74282dd26c09505
(composer l2t1550, exited clean). ORCH OQ RULINGS (binding for the coder):
- OQ1 = RECOMMENDATION APPROVED, both arms, deterministic-first: clarification answers fold by
  deterministic splice onto the held intent (replace the unresolved fact, Ajv re-parse, re-compile
  — no model call) as the MANDATORY arm whenever the answer maps 1:1 onto an unresolved fact by
  index/label; the SPINE-5-shaped small-LLM RE-EXTRACTION (held shorthand + answers as grounded
  context, extraction-only) is the permitted fallback when no 1:1 mapping exists. The model still
  only writes shorthand, never events.
- OQ2 = APPROVED: intent value `event_shorthand`, single `shorthand: string` YAML-doc arg.
- OQ3 = RECOMMENDATION APPROVED: deterministicOnly legacy modes stay as-is for non-forced
  surfaces; the forced-tool run-chat path with no model configured surfaces a loud "no model
  configured — cannot draft" note and NEVER silently event-compiles.
- AS-2 APPROVED: "goldens extended" = NEW chat-e2e fixtures colocated with the new chat e2e test;
  SPINE-6 blessed goldens/MANIFEST.yaml stays at blob 58c447eb — untouched. No re-bless.
- AS-4 APPROVED: refusal/repair scoped to the run-chat surface; raw-events code stays for other
  surfaces; retirement is a later item.
- Composer grounding corrections ACCEPTED (first-hand spot-checked by orch): client methods are
  intentCompileFromPrompt/intentTrainingPair; zero callers is run-chat-surface-only
  (ProtocolLocalizationThread calls both); in-trunk UI precedent = ChangesPanel protocolDiff
  pattern (ReviewAiPanel is on the unmerged W2-9 branch until it merges).
Coder contract pins as listed in §worker contract; branch base = trunk tip at dispatch.
