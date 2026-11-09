# SPEC DRAFT — SEQ-ANSWER-CONTRACT-1 (lane 2, product) — composer l2t1912

Status: DRAFT for orchestrator review. Every pin below was re-opened by me at
`cl/integration-2` @ `5e5c8e8ff7ea3edb5169ec2102fe387979e72be0` (branch `cl/integration-2`, worktree
`/mnt/vast/home/brad/git/cl-integration-2`) on 2026-11-03 ~19:12-19:18 EST, with
`git -c core.fileMode=false`. Nothing here is inherited from the ruling's line numbers; where they
differ the measured lane-2 numbers are given and the drift is flagged PIN-MOVED.

Authority (in order):
1. `.hermes/plans/decisions/CROSSLANE-lane1-l1t1700-SEQ-HARNESS-CONTRACT-ruling.md` (END-RULING present)
2. `.hermes/plans/2026-11-03_crosslane-seq-harness-action-contract-defect.md` (lane-1 defect packet)
3. `~/.hermes/cl/receipts/L1-SEQ-QA-PROBE-1/l1t1645/` (17 real `POST /api/ai/assist/stream` turns)
4. The `SEQ-ANSWER-CONTRACT-1` block in `~/.hermes/cl/lanes/2/task-list.md` (starts line 17442; its
   SPEC STEP 1 pre-answer, measured by the orchestrator at this same trunk tip, is reproduced in §4 and
   independently re-verified here).

## GOAL (one sentence)

On every forced-tool surface — `/sequences` first — a question must get a user-visible answer emitted
by the SAME forced `agent_intent` call (new `answer` intent), and a target-less `open-surface` naming
the requesting turn's own surface must be a compiler diagnostic `MISSING_TARGET` whose text names the
surface's DECLARED tabs from the registry — never "Action sent", never raw Ajv text.

## 0. STEP-0 AT CLAIM (mandatory, before any edit)

`server/src/ai/AgentOrchestrator.ts` is owned at draft time by a LIVE item: L2-CLARIFY-CARD-1
fix5-resume (handoff `2026-11-03_1852-lane2-tick-l2t1852.md`, "Slot-0: CARD-1 fix5-resume LIVE (89 min,
no marker)"; trunk tip message: "CARD-1 fix5-resume live 89m no marker"). Another item,
L2-PROMPT2-SCIENCE-CHAIN-1, also cites the same file.

At claim, in the worker worktree:

1. `git -c core.fileMode=false fetch . cl/integration-2` (or merge the lane trunk per the launcher).
2. `git -c core.fileMode=false merge --no-ff cl/integration-2` and record the resulting base sha.
3. Re-open EVERY row of §1 at that base. Any moved row is reported in the handoff as
   `PIN-MOVED <old>-><new>` and the spec's numbers are superseded by the measured ones. Do not
   silently adopt either set.
4. `git -c core.fileMode=false diff --stat <spec-tip>..<claim-base> -- server/src/ai/AgentOrchestrator.ts`
   — if CARD-1 landed, re-read the intent dispatch chain (§5 U3/U5 insert points) before editing.

If the base differs from `5e5c8e8f`, the tsc baselines in §7 must be re-measured at the claim base and
the measured number recorded; do not reuse the numbers below blindly.

## 1. PIN TABLE (all measured at 5e5c8e8f)

| # | anchor | measured file:line | exact expression / text relied on | note |
|---|---|---|---|---|
| P1 | `agent_intent` enum (the offered menu) | `server/src/ai/submitSuggestionTool.ts:453` | array literal beginning `'event_graph', 'deck_layout', 'create_record', 'protocol_edit', 'workspace_action', ...` (12 members; `sequence_action` is NOT in the static enum) | ruling's `:447` is lane-1; orchestrator's `:452` is the property key — PIN-MOVED +1 for the array literal |
| P2 | intent enum description (the house pattern for a new intent) | `submitSuggestionTool.ts:455` | one long string; contains `query_workstate_history: ask the server for the user's stored WORKSTATE HISTORY ...` | append one clause for `answer` here |
| P3 | tool def / doc comment | `submitSuggestionTool.ts:421-437` | `agent_intent — the single forced emission tool in draft mode ... (never a free prose answer)`; `AGENT_INTENT_TOOL_NAME` at `:438`, `AGENT_INTENT_TOOL_DEF` at `:440`, `required: ['intent']` at `:449`, `additionalProperties: false` at `:448` | a new `text` property MUST be declared here or the model's call is schema-invalid |
| P4 | parser | `submitSuggestionTool.ts:891-940` | `parseAgentIntentArgs` — the `if (intent === ... 'compose_execute_chain')` chain at `:893`, returns `{ intent: 'unknown' }` at `:939` | add `'answer'` to the chain + a `text` extraction |
| P5 | `AgentIntentArgs` type | `submitSuggestionTool.ts:817` | union ending `'sequence_action' | 'unknown'` | add `'answer'` |
| P6 | tool_choice pin | `server/src/ai/AgentOrchestrator.ts:1254-1256` | `tool_choice: forceDraftTool ? { type: 'function', function: { name: AGENT_INTENT_TOOL_NAME } } : 'auto'` | NEVER modified |
| P7 | second tool_choice site | `AgentOrchestrator.ts:2103` | `completionReq.tool_choice = forceDraftTool ...` | never modified |
| P8 | forced single-tool array | `AgentOrchestrator.ts:1154-1166` | `return [deps.sequenceActionSchema ? sequenceIntentTool(intentToolDef, deps.sequenceActionSchema) : intentToolDef];` | the "no second forced tool" rule is structural here |
| P9 | `sequence_action` enum widening | `server/src/sequences/sequenceIntent.ts:5-7` | `parameters.properties.intent.enum.push('sequence_action')` on a `structuredClone(base)` | `answer` goes in the BASE enum (P1), not here |
| P10 | force flag (prefix path) | `AgentOrchestrator.ts:1196` | `args.surface === 'sequences' ? true : args.forceDraftTool ?? defaultForceDraftTool` | unchanged |
| P11 | force flag + preflight (run path) | `AgentOrchestrator.ts:1274-1279` | `forceDraftTool = surface === 'sequences' ? true : ...`; `runPreflight = surface === 'sequences' ? false : ...` | unchanged; this is why prose is impossible |
| P12 | sequences guidance block | `AgentOrchestrator.ts:1212-1231` | block entered on `args.surface==='sequences' && deps.sequenceActionSchema`; `const declaredTabs = deps.surfaces?.get(args.surface)?.tabs ?? []` at `:1219`; the tab/navigation bullet at `:1228` | R3's ONE routing rule is appended inside this block |
| P13 | sequences guidance block, `aiRole` | NOT READ TODAY — `SurfaceSpec.aiRole` exists at `server/src/surfaces/surfaces.ts:28`, `SurfaceSpec.tabs` at `:35`; sequences entry `schema/registry/surfaces/surfaces.yaml:92-98` (`aiRole: "sequence authoring and reproducible analysis"`, `tabs: [ Editor, Assay, Analysis, Setup, Import, Knowledge ]`) | R3's rule reads `aiRole` from the same registry entry (data) |
| P14 | compiler step 2 (surface check) | `server/src/ai/compileWorkspaceAction.ts:630-653` | registry membership only; `UNSUPPORTED_SURFACE` for unregistered/absent surface; NO target requirement | R2 inserts the same-surface MISSING_TARGET here |
| P15 | compiler step 1 (malformed envelope) | `compileWorkspaceAction.ts:604-625` | `message: 'agent-action envelope rejected by the registered agent-action schema: ${formatAjvErrors(rawCheck)}'` at `:621` | the raw-Ajv leak to fix |
| P16 | diagnostic code union | `compileWorkspaceAction.ts:173-184` | includes `'MISSING_TARGET'` at `:175` | no new code |
| P17 | compiler deps | `compileWorkspaceAction.ts:154-171` | `resolveSpine`, `surfaces`, `store`, `visibility?` | NO requesting-surface field today → R2 must add one |
| P18 | compile call site + deps construction | `AgentOrchestrator.ts:3408-3433` | `const compileDeps: WorkspaceActionCompilerDeps | null = deps.resolveSpine && deps.surfaces && deps.store ? {...} : null;` then `compileWorkspaceAction(agentIntent.action, compileDeps)` at `:3433` | wire the requesting surface here |
| P19 | valid-compile result note | `AgentOrchestrator.ts:3494-3496` | `surface === 'sequences' ? { success: true, notes: ['Action sent — see the workspace.'] } : ...` | PIN-MOVED vs ruling's `:3046` (lane-1 cite); the line itself is UNTOUCHED (SEQ2FIX2 D4) |
| P20 | gap-turn notes path | `AgentOrchestrator.ts:3518-3529` | `diagnostics.map(d => ({pass_id:'workspace-action-compile', code, severity:'error', message:d.message}))`; `agent_action` NOT emitted; `const wsResult: AgentResult = { success: true, notes: diagnostics.map((d) => d.message) }` | the user-visible answer on gap turns |
| P21 | intent dispatch chain | `AgentOrchestrator.ts:2853-3966` | `const agentIntent = parseAgentIntentArgs(submitArgs)` at `:2853`; branches at `:2854` (sequence_action), `:3407` (workspace_action), `:3966` (query_workstate_history) | insert the `answer` branch before / after these per §5 |
| P22 | forced-tool suppresses text_delta | `AgentOrchestrator.ts:2421-2428` | comment at `:2425-2426`: "(Streamed events for the dead attempt — the transient status lines only, since forced-tool mode suppresses text_delta — are NOT retracted ...)" | the ruling's reason R3 cannot ride narration |
| P23 | doc-discussion prose precedent | `AgentOrchestrator.ts:2759` | `{ success: true, clarificationNeeded: docDiscussionContent, events: [], usage: docUsage, proseDeliverable: true }` | the exact result shape R3 copies |
| P24 | `AgentResult` fields | `server/src/ai/types.ts:730-757` | `clarificationNeeded?: string` at `:742`; `proseDeliverable?: boolean` at `:756` (doc comment: "the ONLY deliverable channel is `clarificationNeeded` (the prose body)") | no new result field needed |
| P25 | client assistant-body builder | `app/src/shared/hooks/useAiChat.ts:2378-2434` | `text_delta` accumulates `modelText` (:2384-2386); `status` -> parts (:2387-2389); `done` notes -> parts (:2407-2409); `clarificationNeeded` promoted to `modelText` WHEN `modelText` empty (:2410-2414); "No events generated." guard (:2415-2417); `sections.join` (:2429-2433) | the channel decision in §4 |
| P26 | empty-wall suppression | `useAiChat.ts:1652-1657` | `askedQuestion = Boolean(result.clarification?.prompt) || Boolean(result.clarificationNeeded?.trim()) || ...` | an answer suppresses "AI completed the task but did not propose any changes" (:1724-1735) |
| P27 | pipeline_diagnostics IS user-visible | `useAiChat.ts:1266-1280` | system bubble `Pipeline did not produce events (outcome=...)\n- ${d.pass_id}.${d.code} (${d.severity}): ${d.message}` | validator text must not ride ANY diagnostic message |
| P28 | pane mount | `app/src/sequences/SequencesPage.tsx:150` | `rightPane={<HarnessChatPane onReviewProposal={onSequenceProposal}/>}` | orchestrator's answer confirmed |
| P29 | chat pane render | `app/src/agent/HarnessChatPane.tsx:327,:361` | `<ChatPreviewCard chat={chat} />` and `<ChatLog ... />` | same universal pane as every host |
| P30 | assistant body render | `app/src/agent/ChatLog.tsx:500` | `<p>{clarificationBubbleText(message.content)}</p>` | the answer text lands here |
| P31 | done frame parse | `app/src/event-editor/right-pane/ai/assistStream.ts:489` | `case 'done': onEvent({ type: 'done', ...(parsed.result ? { result: parsed.result } : {}) })`; `clarificationNeeded?: string` at `:181`; `proseDeliverable?: boolean` at `:191` | payload already carries the field |
| P32 | ledger_answer (the "precedent" the ruling cites) | `assistStream.ts:551-558` (parse), `app/src/event-editor/right-pane/ai/useChatThread.ts:349` (render) | parsed into a typed event; rendered ONLY by the event-editor chat thread | measured: `grep -rn "ledger" app/src/agent/ChatLog.tsx app/src/agent/HarnessChatPane.tsx` = ZERO matches — ledger_answer is NOT rendered on `/sequences` |
| P33 | client refusal (FROZEN) | `app/src/sequences/applyAgentAction.ts:82-88` | `reason: 'The workspace action carried no target, so nothing could be routed. Nothing was changed.'` (string at `:86`) | do not touch |
| P34 | client refusal pin (FROZEN) | `app/src/sequences/applyAgentAction.test.ts:209-215` | `it('a target-less action is a NAMED refusal, not a silent no-op', ...)` | do not touch |
| P35 | amending pin (same-surface case) | `server/src/ai/compileWorkspaceAction.test.ts:306-315` | `it('a registered surface id compiles open-surface with no target')` with `surface: 'analysis'` and `deps()` (no requesting surface) | ruling's `:305` — PIN-MOVED +1 (`it(` at 306) |
| P36 | existing "Action sent" pin (must stay green) | `server/src/ai/AgentOrchestrator.sequencesAgentAction.test.ts:210-231` | targeted `sequence-tab` frame -> note `'Action sent — see the workspace.'` at `:231` | targeted frames remain valid |
| P37 | no-surface orchestrator test (must stay green) | `server/src/ai/AgentOrchestrator.workspaceAction.test.ts:290-303` | `open-surface surface:'analysis'`, and `runIntentTurn` passes NO `surface` (harness at `:166-176`) | the different-surface / no-surface negative leg |
| P38 | instructions | `submitSuggestionTool.ts:56-64` | `SUBMIT_SUGGESTION_INSTRUCTION`, incl. `:60` "Finish by calling the `agent_intent` tool exactly once, choosing ONE intent from its menu ..." | no edit needed; hygiene pins 1-5 (`submitSuggestionInstructionHygiene.test.ts:22-47`) must stay green |
| P39 | exact enum pin (must be amended) | `server/src/ai/submitSuggestionTool.test.ts:308` | `expect(props.intent?.enum).toEqual([...12 ids...])` | amend to include `'answer'` |
| P40 | coercion table | `server/src/ai/coerceAgentIntent.ts:17-41` | `AgentIntentName` union at `:17`; `INTENT_KEYS` at `:19-41`; `isAgentIntentName` at `:62-64`; `coerceToAgentIntentArgs` returns `args` only when `isAgentIntentName(args.intent)` | add `answer: ['text']` (see OQ2 / §5 U2) |

## 2. BINDING CONSTRAINTS (from the ruling; not suggestions)

- **NO second forced tool.** `buildToolDefs` returns exactly one tool in forced mode (P8). `answer`
  is a MENU member of the existing `agent_intent`, nothing else.
- **NEVER unpin `tool_choice`.** P6/P7 are byte-untouched. No prose arm, no `'auto'` on forced
  surfaces, no per-turn downgrade.
- **ZERO extra inference calls.** The answer text is authored inside the SAME forced call that was
  already happening (the tool args). No second completion, no post-answer summarisation call, no
  repair turn. The receipt's request bodies must show one `POST /api/ai/assist/stream` per turn.
- **No TS per-surface branching where YAML/registry data is the home.** The MISSING_TARGET message and
  the answer routing rule both read `tabs`/`aiRole` from the surfaces registry entry (`SurfaceSpec`,
  `surfaces.ts:15-38`). Zero `'sequences'`, `'Assay'`, `'Editor'` literals in the new server code.
  Existing `surface === 'sequences'` branches (P10/P11/P19) are the pre-existing design and are not to
  be multiplied.
- **R1 is REJECTED.** `app/src/sequences/applyAgentAction.ts` and
  `app/src/sequences/applyAgentAction.test.ts` are FROZEN. The named refusal stays and its pin stays
  green. A diff touching either file is an automatic reject.
- **No new YAML key is required** (ruling §0 add.4). If a future "open-surface requires target"
  declaration is wanted, `surfaces.yaml` is its home — not this item, not a TS branch.

## 3. R2 DESIGN — the server owns the envelope contract

### 3.1 The rule (single-valued)

A target-less `open-surface` whose `surface` EQUALS the requesting turn's surface is a compiler
diagnostic `MISSING_TARGET`; the message names the surface entry's DECLARED tabs. A target-less
`open-surface` to a DIFFERENT registered surface (or from a request that names no surface) remains
`ok: true`.

### 3.2 The mechanical gap that must be closed first

`WorkspaceActionCompilerDeps` (P17) has no requesting-surface field, so the compiler cannot implement
the rule today. Add:

```
  /**
   * The surface of the REQUESTING turn (AgentRequest.surface), when the request
   * named one. DATA: the compiler only compares it against the proposed
   * `surface`; it never branches per surface name.
   */
  requestingSurface?: string;
```

Wire it at P18 with a CONDITIONAL SPREAD (exactOptionalPropertyTypes — the field must be ABSENT, never
`undefined`):

```
...(surface !== undefined ? { requestingSurface: surface } : {}),
```

`surface` is in scope in `run()` (destructured at `:1269`).

### 3.3 The check (in step 2, after registry membership)

```
const requestSurface = trimmedString(deps.requestingSurface);
if (
  verb === 'open-surface' &&
  proposalObj.target === undefined &&
  surface !== undefined &&
  requestSurface !== undefined &&
  surface === requestSurface
) {
  const declaredTabs = deps.surfaces.get(surface)?.tabs ?? [];
  return { ok: false, diagnostics: [{ code: 'MISSING_TARGET', message: missingTargetMessage(surface, declaredTabs) }] };
}
```

`missingTargetMessage(surface, tabs)` (one helper, in `compileWorkspaceAction.ts`):

- tabs non-empty:
  `You are already on ${surface} — name the tab (one of ${tabs.join(', ')}) or a real record id.`
- tabs empty:
  `You are already on ${surface} — name a tab or a real record id.`

No literal surface or tab names; the message is built from the registry entry (P12/P13 pattern).

### 3.4 Step 1: stop leaking Ajv text (P15, P20, P27)

Replace the `MALFORMED_ENVELOPE` message at P15 with user-language text built through the SAME helper
family, then log the validator detail to the server log ONLY:

- Proposal names a registered surface (or the request has `requestingSurface`) whose entry declares
  tabs:
  `I could not read that as a workspace action. Say what to open — a tab (one of ${tabs.join(', ')}) or a real record id.`
- Otherwise:
  `I could not read that as a workspace action. Say what to open (a tab name) or name a record id.`
- `console.warn('[compileWorkspaceAction] MALFORMED_ENVELOPE detail: ' + formatAjvErrors(rawCheck));`

Rationale, measured: `pipeline_diagnostics` is rendered as a user-visible system bubble
(useAiChat:1266-1278, P27), so moving the dump "to diagnostics" would NOT hide it. The message field is
the only thing either channel prints; the raw detail must therefore leave the wire entirely (the
server log keeps it for debugging).

### 3.5 What R2 must NOT change

- P19 (`'Action sent — see the workspace.'`) stays verbatim. After R2 a sequences turn can only reach
  it with a routeable frame; the D4 invariant (server does not narrate an unconfirmed effect) holds.
- The `focus`-requires-target branch (P14's sibling at `compileWorkspaceAction.ts:663-667`) is already
  MISSING_TARGET and is untouched.
- No change to `agent_action` emission ordering, the retarget gate (P18 region `:3443-3480`), or the
  `visibility` door.

## 4. R3 DESIGN — ONE `answer` intent, ONE emission channel

### 4.1 Channel decision: `done.result.clarificationNeeded` (server-built plain text)

**Chosen.** The `answer` branch returns
`{ success: true, clarificationNeeded: <text>, events: [], proseDeliverable: true }` — byte-shape
identical to the doc-discussion precedent (P23, P24).

Why this channel and not the alternatives (all line-cited):

- `text_delta` is REJECTED. Forced-tool mode suppresses it by contract (P22) and the dead-attempt
  events are not retracted; synthesising a `text_delta` server-side would break the invariant that
  made the mode's streaming story coherent and reintroduce un-retractable text on a degenerate retry.
- `ledger_answer` is REJECTED as the vehicle. It parses (P32) but has NO render arm in `ChatLog.tsx` or
  `HarnessChatPane.tsx` (`grep -rn "ledger"` on both files returns zero matches; the only renderer is
  `useChatThread.ts:349`, the event-editor thread). On `/sequences` a `ledger_answer` frame would be
  invisible — exactly the silence this item exists to kill.
- `clarificationNeeded` is ALREADY promoted to the assistant body by `buildAssistantContent`
  (P25 `:2410-2414`, "Plain-text answer that didn't come through as streaming chunks"), ALREADY
  suppresses the "did not propose any changes" wall (P26), and ALREADY travels in the `done` frame
  (P31). ChatLog renders `message.content` (P30). Therefore: **zero client product change is required
  for `/sequences` to show the answer.**

Consequence: the ruling's "client, R3 only" file slot needs no product edit. The only app-side
deliverable is a characterization pin (§5 U6) asserting the channel renders, so a future client
refactor cannot silently drop the answer.

Unaffected surfaces, proven: `notes` path untouched (P25 :2407-2409) — the answer deliberately does NOT
use `notes`, else it would render as a second paragraph under the body; `pipeline_diagnostics`
untouched for `answer` (no diagnostics emitted); no events/proposals so `ChatPreviewCard` (P29) mounts
nothing; `ledger_answer`, `agent_action`, `status` paths untouched.

### 4.2 The menu entry (P1/P2/P3/P5/P40)

- Add `'answer'` to the static enum at P1 (position: after `'query_workstate_history'`, before
  `'event_shorthand'` — cosmetic, keeps the answered-intent pair adjacent).
- Add the top-level property after `intent`:

```
        text: {
          type: 'string',
          minLength: 1,
          maxLength: 800,
          description: 'answer only: your short answer to the question, in the user\'s language, grounded ONLY in the surface context you were given (this page\'s aiRole, its DECLARED tabs, and context.records). Never invent a record id, a tab, or a time.',
        },
```

- Extend the P2 description string with one clause:
  `answer: reply to a QUESTION in \`text\` — grounded ONLY in the surface context you were given (aiRole, declared tabs, records); no id, tab or time may be invented.`
- P4 parser: accept `'answer'` in the chain and extract
  `...(intent === 'answer' && typeof args.text === 'string' && args.text.trim().length > 0 ? { text: args.text.trim() } : {})`.
  (Trim is safe here: `text` is prose, not an audited envelope; the `ops`/`action` verbatim discipline
  does not apply.)
- P5 type: add `'answer'` to the union and `text?: string`.
- P40 coercion: add `answer` to `AgentIntentName` and `INTENT_KEYS` with signature key `['text']`.
  Without this, a prose-recovered `{intent:'answer', text:'...'}` returns `null` from
  `coerceToAgentIntentArgs` and the turn dies as "no tool call" — see OQ2.

### 4.3 The guidance rule (P12, ONE rule, data-read)

Inside the existing sequences block, extend the registry read:

```
const surfaceEntry = deps.surfaces?.get(args.surface);
const declaredTabs = surfaceEntry?.tabs ?? [];
const declaredRole = surfaceEntry?.aiRole;
```

and push ONE additional rule string into the same `systemSections.push(...)` array:

```
A QUESTION — anything that does not name an action verb, a declared tab, or a real record id — uses intent=answer with `text` set to a short answer. Ground it ONLY in the surface context you were given: this page's role (<aiRole>); its declared tabs (<tabs joined>); the records in context. Never answer with a workspace_action, never invent a record id or a tab, and never claim something was done.
```

with the `<aiRole>`/`<tabs>` fragments omitted when the entry does not declare them (never a literal
fallback name). The existing bullet at `:1228` and the existing `ROUTING RULE` clause stay verbatim —
the existing pin `AgentOrchestrator.sequencesAgentAction.test.ts:436-449` asserts `system` contains
`'ROUTING RULE'` and the declared-tab negative examples; the new rule is strictly additive.

### 4.4 The orchestrator branch (P21, P23)

Insert before the `workspace_action` branch (P21 `:3407`):

```
if (agentIntent.intent === 'answer') {
  const text = (agentIntent.text ?? '').trim();
  if (text.length === 0) {
    onEvent?.({ type: 'tool_result', toolName: submitCall.function.name, success: false, durationMs: 0 });
    // honest failure, never an empty user-visible answer
    return { success: false, error: 'The answer intent carried no text. Nothing was written and no answer was produced.' };
  }
  onEvent?.({ type: 'tool_result', toolName: submitCall.function.name, success: true, durationMs: 0 });
  const answerResult: AgentResult = { success: true, clarificationNeeded: text, events: [], proseDeliverable: true };
  /* AgentSummary + logAgentSummary + console.log, mirroring the branch neighbours */
  return answerResult;
}
```

Properties this buys, each testable: one inference request (the branch performs no I/O), no
`agent_action` frame, no `pipeline_diagnostics`, `success: true`, `events: []`, `notes` absent.

## 5. IMPLEMENTATION UNITS (ordered, each independently committable)

Baseline before any edit (measured today at 5e5c8e8f, commands in §7): compileWorkspaceAction test
29/29; submitSuggestionTool 17/17; coerceAgentIntent 9/9; AgentOrchestrator.workspaceAction 10/10;
AgentOrchestrator.sequencesAgentAction 14/14; applyAgentAction (app) 19/19; server `tsc` 0 errors; app
`tsc` 10 errors (the pre-existing list in §7).

### U1 — R2: same-surface target-less -> MISSING_TARGET naming declared tabs
Files: `server/src/ai/compileWorkspaceAction.ts` (deps field, step-2 check, message helper),
`server/src/ai/compileWorkspaceAction.test.ts`,
`server/src/ai/AgentOrchestrator.ts` (wire `requestingSurface` at P18 only).
RED-first pin (both in `compileWorkspaceAction.test.ts`, new `describe` beside P35):
1. `it('a target-less open-surface naming the REQUESTING surface -> MISSING_TARGET naming the declared tabs')`
   — call with `{ action: 'open-surface', surface: 'sequences' }` and
   `deps({ requestingSurface: 'sequences' })`; expect `ok === false`, `code === 'MISSING_TARGET'`,
   message contains `'Editor'` and `'Assay'` (the registry's own tabs, not a literal list in the test's
   assertion of *ordering*), and message does NOT contain `'/target:'` or `'Missing required property'`.
2. Negative leg (must be GREEN before and after):
   `it('a target-less open-surface to a DIFFERENT surface still compiles ok:true')` —
   `{ action:'open-surface', surface:'analysis' }` with `deps({ requestingSurface: 'sequences' })`;
   expect `ok === true`.
3. Negative leg: the SAME call with NO `requestingSurface` stays `ok === true` (this is how P37's
   no-surface harness and P35's pin keep passing).
First targeted check:
`cd server && npx vitest run src/ai/compileWorkspaceAction.test.ts -t "REQUESTING surface"` -> RED
(`expected true to be false`) before the fix, GREEN after.

### U2 — R3: menu intent `answer` + `text` (tool def, parser, type, coercion)
Files: `server/src/ai/submitSuggestionTool.ts`, `server/src/ai/submitSuggestionTool.test.ts`,
`server/src/ai/coerceAgentIntent.ts`, `server/src/ai/coerceAgentIntent.test.ts`.
RED-first pins:
1. amend P39 to `['event_graph', ..., 'query_workstate_history', 'answer', 'event_shorthand', ...]`.
2. `it('answer is a menu intent carrying a short text field')` —
   `props.intent.enum` contains `'answer'`; `props.text` exists; `params.required` is still `['intent']`.
3. `it('parseAgentIntentArgs carries answer text verbatim (trimmed) and DROPS a blank text')` — two
   assertions in one pin: `{intent:'answer', text:' it is a sequence workspace '}` ->
   `{intent:'answer', text:'it is a sequence workspace'}`; `{intent:'answer', text:'   '}` ->
   `{intent:'answer'}` with no `text` property (`'text' in parsed === false`).
4. `coerceAgentIntent.test.ts`: `{text:'…'}` with no intent infers `'answer'`;
   `coerceToAgentIntentArgs({intent:'answer', text:'…'})` returns args unchanged.
5. Hygiene: `submitSuggestionInstructionHygiene.test.ts` pins 1-5 must stay green (no edit there).
First targeted check:
`cd server && npx vitest run src/ai/submitSuggestionTool.test.ts src/ai/coerceAgentIntent.test.ts` ->
RED on the amended enum pin before the edit, GREEN after.

### U3 — R3: the `answer` branch emits the visible answer
Files: `server/src/ai/AgentOrchestrator.ts`, `server/src/ai/AgentOrchestrator.sequencesAgentAction.test.ts`.
RED-first pins (append to the existing sequences test file; reuse the `runSequencesTurn` harness,
which already returns `requests`):
1. `it('intent=answer returns the answer as the visible body: clarificationNeeded verbatim, events [], proseDeliverable, ZERO agent_action')`
   — assert `result.success === true`, `result.clarificationNeeded === 'A sequences workspace authors reproducible sequence analyses.'`,
   `result.events` toEqual `[]`, `result.proseDeliverable === true`, `events.filter(e => e.type==='agent_action').length === 0`.
2. `it('the answer turn makes EXACTLY ONE inference call and emits no diagnostics')` —
   `requests.length === 1`; `events.some(e => e.type === 'pipeline_diagnostics') === false`;
   `requests[0].tool_choice` is the `agent_intent` function pin (proves the pin survived).
3. `it('an answer intent with blank text is an honest failure, never an empty answer')` — `success:false`,
   `error` non-empty, `clarificationNeeded` undefined, no `agent_action`.
First targeted check:
`cd server && npx vitest run src/ai/AgentOrchestrator.sequencesAgentAction.test.ts -t "answer"` -> RED
(unknown intent -> `{intent:'unknown'}` fall-through) before, GREEN after.

### U4 — R3: the routing rule in the sequences guidance
Files: `server/src/ai/AgentOrchestrator.ts`, `server/src/ai/AgentOrchestrator.sequencesAgentAction.test.ts`.
RED-first pins:
1. `it('the sequences guidance carries the answer routing rule grounded in the registry aiRole + tabs')`
   — `system` contains `'intent=answer'`, contains the sequences `aiRole`
   (`'sequence authoring and reproducible analysis'`), contains `'Assay'`.
2. Data-swap leg (the P13 discipline): run with an injected surfaces double whose `sequences` entry
   declares `aiRole: 'X role'`, `tabs: ['One','Two']`; assert `system` contains `'X role'` and
   `'One'`, and does NOT contain `'Assay'`. (This pins "data, not literals".)
3. The existing T2 pin at `:436-449` (`'ROUTING RULE'`, declared-tab negative examples) must stay green.
First targeted check:
`cd server && npx vitest run src/ai/AgentOrchestrator.sequencesAgentAction.test.ts -t "answer routing"` ->
RED before, GREEN after.

### U5 — R2/R3: the gap-turn text stops being validator internals
Files: `server/src/ai/compileWorkspaceAction.ts`, `server/src/ai/compileWorkspaceAction.test.ts`,
`server/src/ai/AgentOrchestrator.sequencesAgentAction.test.ts`.
RED-first pins:
1. `compileWorkspaceAction.test.ts`: `it('a malformed envelope names the fix, never the Ajv internals')` —
   `{ target: { kind: 'record', id: 'MAT-1' } }` (no verb); expect `MALFORMED_ENVELOPE`, and the message
   matches `/could not read that as a workspace action/i`, and does NOT match `/Missing required property|^\/|Unknown property/`.
2. `sequencesAgentAction.test.ts` (end-to-end through P20):
   `it('a gap turn surfaces the actionable line as the user-visible note, never the validator dump')` —
   `result.notes` join contains `'could not read that as a workspace action'`, does NOT contain
   `'/target:'` or `'Missing required property'`, and no `agent_action` frame exists.
3. Keep the existing `MALFORMED_ENVELOPE` code pins (`workspaceAction.test.ts:305-325`) green — the CODE
   is unchanged, only the message text.
First targeted check:
`cd server && npx vitest run src/ai/compileWorkspaceAction.test.ts -t "Ajv internals"` -> RED before,
GREEN after.

### U6 — app characterization pin (no product code)
Files: NEW `app/src/shared/hooks/useAiChat.answerBody.test.tsx` (do NOT edit `useAiChat.ts`).
Pin, modeled on `useAiChat.channelEnvelopes.test.tsx` (mock `streamAssist` with a frame generator):
`it('a done result carrying clarificationNeeded renders as the assistant body, with no empty-wall and no "No events generated."')`
— frames: `{type:'status',message:'working'}`, `{type:'done', result:{ success:true, clarificationNeeded:'A sequences workspace authors reproducible sequence analyses.', events: [] }}`;
assert the assistant message content contains the sentence, and no system message contains
`'did not propose any changes'` or `'No events generated.'`.
Label it a CHARACTERIZATION pin (it is GREEN at HEAD by design; it must stay green — it is the guard
that keeps R3's channel decision honest if the client is refactored).
First targeted check:
`cd app && npx vitest run src/shared/hooks/useAiChat.answerBody.test.tsx` -> GREEN at HEAD and after.

### Negative legs as first-class pins (must all be present)
- different-surface target-less `open-surface` still compiles `ok:true` (U1 pin 2, U1 pin 3).
- the frozen client refusal pin stays green: `app/src/sequences/applyAgentAction.test.ts` untouched,
  run in §7, 19/19.
- the targeted sequences frame still yields `'Action sent — see the workspace.'` (P36, untouched).
- a never-asked question does not become a bogus answer: blank `text` is an honest failure (U3 pin 3);
  no record/tab/time is invented because the branch performs no I/O at all (U3 pin 2's
  `requests.length === 1` plus "no diagnostics, no agent_action").

## 6. ACCEPTANCE CRITERIA (verbatim from the task block)

> ROUND-TRIP-GATE-1 on lane 2 (:5193), live, zero interception of /api/ai/**: asking "In one short
> sentence, say what this sequences workspace is for." renders a user-visible AI answer naming what the
> workspace is for; "Switch to the Assay tab." (real records context) visibly lands the Assay tab; and
> on ANY of these turns the pane never shows "Action sent — see the workspace.", a target-less-action
> refusal, or raw validator text with nothing else on screen. Request body captured as a receipt +
> rendered-answer screenshot. Plus unit legs: same-surface target-less open-surface yields
> MISSING_TARGET naming the declared tabs; a different-surface target-less open-surface still compiles
> ok:true; the applyAgentAction refusal pin is unchanged and still green; the answer turn makes ZERO
> additional inference calls (one forced request per turn), which the receipt's request bodies prove.

Ruling §(d) acceptance sentence, verbatim (the browser-gradeable form):

> In a live, zero-interception round trip on the fixed stack's `/sequences` chat (real model, request
> body captured as receipt), asking "In one short sentence, say what this sequences workspace is for."
> renders a user-visible AI answer naming what the workspace is for, and "Switch to the Assay tab."
> (real records context) visibly lands the Assay tab — and on ANY of these turns the pane never shows
> "Action sent — see the workspace.", a target-less-action refusal, or raw validator text with nothing
> else on screen: a question gets a user-visible answer, a navigation gets a real navigation or an
> honest, actionable, user-language refusal — never silence dressed as success.

## 7. VERIFICATION (exact commands, measured baselines)

All `git` on the NFS checkout uses `git -c core.fileMode=false`.

Targeted vitest (server):
```
cd /mnt/vast/home/brad/git/cl-integration-2/server
npx vitest run src/ai/compileWorkspaceAction.test.ts src/ai/submitSuggestionTool.test.ts \
  src/ai/coerceAgentIntent.test.ts src/ai/AgentOrchestrator.sequencesAgentAction.test.ts \
  src/ai/AgentOrchestrator.workspaceAction.test.ts
```
Expected: 5 files pass, 0 failures. Measured pre-change counts: 29 + 17 + 9 + 14 + 10 = 79 tests; the
post-change total is 79 + the new pins in §5 (U1 +3, U2 +3, U3 +3, U4 +2, U5 +2) = 92, with
`submitSuggestionTool.test.ts:308` amended rather than added. Any number other than "all green with the
new count" is a failure to investigate.

Targeted vitest (app, incl. the FROZEN pin):
```
cd /mnt/vast/home/brad/git/cl-integration-2/app
npx vitest run src/sequences/applyAgentAction.test.ts src/shared/hooks/useAiChat.answerBody.test.tsx
```
Expected: applyAgentAction 19/19 (unchanged file, unchanged count) + answerBody 1/1.

Typecheck:
```
cd /mnt/vast/home/brad/git/cl-integration-2/server && npx tsc --noEmit     # expected: 0 errors (measured 0 at 5e5c8e8f)
cd /mnt/vast/home/brad/git/cl-integration-2/app    && npx tsc --noEmit     # expected: EXACTLY the 10 pre-existing errors below
```
Measured app baseline (10 errors, none in files this item touches):
`src/event-editor/EventEditorContext.tsx:1525` TS2339 `equipments`;
`src/event-editor/deck/LawnSurface.moveAcross.test.tsx:47` TS2353 `runDeckLock`;
`src/event-editor/deck/PreviewActionBar.test.tsx:108` TS2353 `runDeckLock`;
`src/event-editor/editorHistory.test.ts:176` and `:199` TS2345 `load_event_graph_success`;
`src/event-editor/focus/LabwareFocus.instrument.test.tsx:47` TS2353 `runDeckLock`;
`src/event-editor/viewer/Viewer.tsx:65` TS2322 `protocol-review`;
`src/event-editor/viewer/ViewerToolbar.tsx:55` TS2322 `protocol-review`;
`src/ingestion/components/IngestionUploadModal.tsx:232` TS2554;
`src/ingestion/protocol-review/ExtractionProgressPanel.test.tsx:9` TS6133 `fireEvent`.
(The count 10 is a hard assertion: 0 new, 0 removed.)

Browser gate (ROUND-TRIP-GATE-1, lane 2 `:5193`), live, zero interception of `/api/ai/**`:
1. Serve the merged revision on :5193/:3093; restart after merge (the guidance block is server code).
2. Turn A: `In one short sentence, say what this sequences workspace is for.` -> the assistant bubble
   contains a sentence naming what the `/sequences` workspace is for (registry `aiRole` language, e.g.
   "sequence authoring and reproducible analysis"). Capture: request body JSON + rendered screenshot.
3. Turn B: `Switch to the Assay tab.` with the real records context (`SequencesPage.tsx:77` shape) ->
   the Assay tab is visibly active. Capture: request body + screenshot of the active tab.
4. Turn C (negative): a deliberately unrouteable request (e.g. `Open the dashboard surface.`) -> the
   pane shows an honest, actionable, user-language line and never a raw validator dump; no
   `agent_action` lands. Capture: request body + screenshot.
5. Receipt check: one `POST /api/ai/assist/stream` per turn (no second inference call), and the
   `agent_intent` request body for Turn A carries `intent: "answer"` with a non-empty `text`.
6. Re-run the `l1t1645` probe shape against the lane stack as a smoke check (17-turn script from
   `~/.hermes/cl/receipts/L1-SEQ-QA-PROBE-1/l1t1645/README.md`); expectation flips from 0/6 answers to
   answers on the question rows and 0/5 raw-Ajv notes.

## 8. BOUNDARIES

MAY touch:
- `server/src/ai/compileWorkspaceAction.ts` (+ `compileWorkspaceAction.test.ts`)
- `server/src/ai/submitSuggestionTool.ts` (+ `submitSuggestionTool.test.ts`)
- `server/src/ai/coerceAgentIntent.ts` (+ `coerceAgentIntent.test.ts`)
- `server/src/ai/AgentOrchestrator.ts` (only: the deps wiring at P18, the `answer` branch before
  `:3407`, the guidance read/rule at P12/P13) (+ `AgentOrchestrator.sequencesAgentAction.test.ts`;
  `AgentOrchestrator.workspaceAction.test.ts` only if a pin genuinely needs the negative-leg split —
  prefer not to touch it)
- NEW `app/src/shared/hooks/useAiChat.answerBody.test.tsx`

MUST NOT touch:
- `app/src/sequences/applyAgentAction.ts`, `app/src/sequences/applyAgentAction.test.ts` (FROZEN).
- `app/src/shared/hooks/useAiChat.ts` (no product change is needed for the chosen channel).
- `app/src/agent/ChatLog.tsx`, `app/src/agent/HarnessChatPane.tsx`, `app/src/sequences/SequencesPage.tsx`
  (ruling allows a client render change only if the channel demanded it; the chosen channel does not;
  they are also owned by live CARD-1/TARGET-1 work).
- `server/src/sequences/sequenceIntent.ts` (the enum is widened in the base def; do not add a second
  append site).
- `schema/registry/surfaces/surfaces.yaml` and any other YAML (no new key is needed).
- `server/src/ai/AgentOrchestrator.ts` regions: P6/P7 (`tool_choice`), P8 (tool array), P19 (the
  sequences note), the retarget gate, and any file owned by a live unit at claim time (STEP-0).

## 9. REVIEWER BAIT (pre-empt these; each is a likely reject)

1. **exactOptionalPropertyTypes (server strict, `server/tsconfig.json:13`).** `requestingSurface`,
   `text`, `proseDeliverable` must be added by CONDITIONAL SPREAD. `{ requestingSurface: surface }` with
   `surface: AiSurface | undefined` is a compile error (0-error baseline is the gate). Same for
   `...(text !== undefined ? { text } : {})`.
2. **YAML/registry-reload trap.** Read `tabs`/`aiRole` from `deps.surfaces.get(...)` at REQUEST-build
   time (P12 pattern). Do not snapshot the entry at module load, do not cache the joined tab string;
   the registry is a live object and a swapped registry (U4 pin 2) must change the guidance and the
   diagnostic text.
3. **Hardcode boundary.** No `'sequences'`, `'Assay'`, `'Editor'`, `'Knowledge'` literal in the new
   compiler message or guidance-rule builder. The U4 data-swap pin and U1's tab assertions are the
   detectors; a literal passes the first and fails the swap.
4. **Amending, not weakening, P35.** `compileWorkspaceAction.test.ts:306` must be re-pointed to the
   same-surface case (`requestingSurface:'sequences'`, `surface:'sequences'`) while a NEW pin keeps the
   different-surface `ok:true` leg. Deleting the `ok:true` expectation instead of moving it is a
   reject (the ruling names that exact anti-pattern).
5. **Do not "fix" P37.** `AgentOrchestrator.workspaceAction.test.ts:290` runs WITHOUT a request surface;
   under R2 it must stay `ok:true`. If a coder makes the rule fire on `requestingSurface === undefined`,
   P37 and P35 both go red — that is the intended tripwire.
6. **Do not touch P19 or P36.** `'Action sent — see the workspace.'` and its pin stay green; R2 removes
   the unapplicable frames that reached it, not the sentence.
7. **Validator text must not ride ANY frame field.** `pipeline_diagnostics` is user-visible
   (useAiChat:1266-1278). Putting `formatAjvErrors` into `pass_id`, `code`, or a new `detail` field that
   the client concatenates is the same defect with a new name. Log-only.
8. **Do not emit `text_delta`.** No new `text_delta` on the forced path (P22). No `clarification`
   object, no `clarificationRequests`: those mount CARDS (ChatLog clarification arms) and would turn an
   answer into a question.
9. **Do not use `notes` for the answer.** `notes` renders as a SECOND paragraph under the body
   (P25 :2407-2409); the answer must be the body (via `clarificationNeeded`).
10. **Empty answer is a failure, not a blank bubble.** `text` minLength 1 + the U3 blank-text pin.
11. **Answer must not fabricate.** No store reads, no resolve calls, no mint in the `answer` branch:
    `requests.length === 1` is the pin that proves zero extra inference, and the absence of any I/O is
    what makes "never invent a record id" structurally true. The model's `text` is grounded by the
    injected context (P12/P13), not by a server-side lookup.
12. **`docDiscussion` side effect is expected.** `useAiChat.ts:1580-1583` will set
    `docDiscussion: true` on the answer message (events empty + clarificationNeeded non-empty). The flag
    has no render arm today (`grep -rn docDiscussion app/src` = only `useAiChat.ts:1580` and
    `types/ai.ts:674`). Do NOT "solve" it by inventing a new field or editing the client.
13. **Enum pin is exact.** `submitSuggestionTool.test.ts:308` uses `toEqual` on the whole array; adding
    `answer` without amending this pin is a red suite, and amending it without adding `answer` to the
    def is a lie. Change both in the same unit (U2).
14. **One branch, one return.** The `answer` branch must `return` (like every neighbour); falling
    through reaches the terminal "no intent matched" handling and would emit a second frame.

## 10. WORKER CONTRACT

- Worktree: a fresh lane-2 worktree off `cl/integration-2` (launcher convention
  `/mnt/vast/home/brad/git/wt/SEQ-ANSWER-CONTRACT-1-lane2-<invocation>`), branch
  `cl/lane2-seq-answer-contract-1-<invocation>` cut from the lane trunk after the STEP-0 merge.
- Deliverable path pattern (per unit): the product commit(s) named above plus a report at
  `.hermes/plans/reports/SEQ-ANSWER-CONTRACT-1-report.<invocation>.md` and a handoff at
  `.hermes/plans/handoffs/<timestamp>-lane2-seq-answer-contract-1-<invocation>.md`.
- DONE marker: `SEQ-ANSWER-CONTRACT-1 DONE <sha>` after: targeted vitest green (§7), server tsc 0, app
  tsc exactly 10, the FROZEN files byte-identical (`git -c core.fileMode=false diff --stat` must not
  list them), and the ROUND-TRIP-GATE-1 receipts committed.
- Report must state: the claim base sha, every PIN-MOVED row from STEP-0, the measured pre/post test
  counts, and the request-body evidence for "one inference call per turn".
- If any pin has moved such that the design no longer fits (e.g. CARD-1 restructured the intent
  dispatch chain), STOP and report — do not re-design the contract locally.

## OPEN QUESTIONS (for the orchestrator; max 3)

**OPEN-QUESTION-1 — requests that name NO surface.** Reading A (spec's choice): the R2 rule fires only
when the request carries a surface (`requestingSurface !== undefined`); a surface-less forced-tool
request (the event-editor dock's `forceDraftTool:true`, and the existing unit harness
`AgentOrchestrator.workspaceAction.test.ts:166-176`) keeps today's behaviour. Reading B: default the
requesting surface from the envelope's `surface` — which would make EVERY target-less open-surface a
diagnostic and break the different-surface leg the ruling explicitly preserves.
Repo evidence for A: `AgentRequest.surface` is optional (`server/src/ai/types.ts:182`) and
`compileWorkspaceAction` is also called by non-surface callers; for B: none found (the ruling's rule is
phrased in terms of "the requesting turn's surface", which only exists when one was named). I have
specified A.

**OPEN-QUESTION-2 — `answer` in the prose-recovery coercion table.** Reading A (spec's choice): add
`answer: ['text']` to `coerceAgentIntent.ts:19-41`, so a prose-emitted `{intent:'answer', text:'…'}` is
recognised instead of being dropped as "no tool call" (measured: `coerceToAgentIntentArgs` returns
`null` for any intent not in `AgentIntentName`, and `'answer'` is absent today). Reading B: leave the
table alone, because the recovery path's job is drafting envelopes and `text` as an inference key is
new vocabulary in a table whose comment calls its keys "signature keys" of drafting intents.
Repo evidence for A: `sequence_action` is in the same union with `['sequenceAction']`, i.e. non-drafting
intents ARE in the table; for B: `submitSuggestionTool.ts:60` tells the model to call the tool, so
recovery is a fallback, not the main path. I have specified A (it costs one table row and prevents a
silent drop).

**OPEN-QUESTION-3 — surfaces that declare NO tabs.** Reading A (spec's choice): the rule is
unconditional for the same surface, and the message degrades to "name a tab or a real record id" when
the entry declares none — `/analysis` target-less turns then also become honest diagnostics (matches
the ruling's breadth note: `/analysis` is 2/2 target-less today, i.e. the same dead end). Reading B:
skip the rule for entries with no declared tabs, on the theory that such a surface may legitimately be
"opened" with no target.
Repo evidence: `schema/registry/surfaces/surfaces.yaml:57-62` — the `analysis` entry declares NO `tabs`
and its `aiRole` is literally `"interrogative goals answered in place"` (measured just now); `sequences`
at `:92-98` declares six tabs. Reading A is specified because the ruling's sentence has no
tab-precondition, and the `analysis` aiRole text makes "answer in place" the declared intent of that
surface too — a target-less `open-surface analysis` from `/analysis` contradicts its own registry data.
DRAFT-END 032e94949fda7060e73d09c27b35e9667f7b00c991ac2e269addd19cd30feffe

---

## §11 ORCH RULINGS (orchestrator, l2t1912, 2026-11-03 19:15 EST) — BINDING

Promotion of `drafts/SEQ-ANSWER-CONTRACT-1-spec-draft-l2t1912.md` (composer unit
`cl-l2-composer-seqanswer1-l2t1912`, rc=0, DRAFT-END `032e9494…30feffe`), authored from architect END-RULING
`decisions/CROSSLANE-lane1-l1t1700-SEQ-HARNESS-CONTRACT-ruling.md`, which is the SOLE cross-lane authority on
this contract. Nothing below re-litigates R1/R2/R3. Promotion is at trunk `5e5c8e8f`, the tip the pin table was
measured at.

**OQ1 — requests that name NO surface → Reading A (as specified).** The R2 rule fires only when the
requesting turn carries a surface. Binding reason: `AgentRequest.surface` is optional (`types.ts:182`) and
`compileWorkspaceAction` has non-surface callers including the existing harness; Reading B would turn EVERY
target-less `open-surface` into a diagnostic and break the different-surface leg the ruling explicitly
preserves. The spec's conditional-spread wiring (`requestingSurface` absent, never `undefined`) is required.

**OQ2 — `answer` in the prose-recovery coercion table → Reading A (as specified).** Add `answer: ['text']` to
`coerceAgentIntent.ts:19-41`. Binding reason: `sequence_action` is already in that union with
`['sequenceAction']`, so non-drafting intents belong there; omitting it would let a prose-emitted
`{intent:'answer'}` be dropped as "no tool call" — a silent failure, which is the defect class this item
exists to remove. The recovery path stays a fallback; the forced tool call remains the main path.

**OQ3 — surfaces declaring NO tabs → Reading A (as specified).** The same-surface rule is unconditional and
the message degrades to "name a tab or a real record id". Binding reason: the ruling's sentence has no
tab-precondition, and `surfaces.yaml:57-62` declares `analysis` `aiRole: "interrogative goals answered in
place"` — a target-less `open-surface analysis` from `/analysis` contradicts its own registry data, and the
ruling's breadth note records `/analysis` as 2/2 target-less today. This also makes the `/analysis` leg of
the ruling's scope note answerable without new scope.

**ACCEPTED with one correction to the ruling's phrasing.** The RULING suggests the answer "likely rides the
notes/text path" and cites `ledger_answer` as precedent. Measured first-hand at `5e5c8e8f`:
`grep -rn "ledger" app/src/agent/ChatLog.tsx app/src/agent/HarnessChatPane.tsx` = ZERO matches —
`ledger_answer` is parsed (`assistStream.ts:551-558`) and rendered only by the event-editor chat thread
(`useChatThread.ts:349`), NOT by the pane `/sequences` mounts. The draft's chosen channel
(`done.result.clarificationNeeded`, the doc-discussion precedent, `types.ts:742` + `useAiChat.ts:2410-2414`)
is therefore ACCEPTED as the emission channel: it is the one path the mounted pane demonstrably renders.
This is the ruling's own instruction ("verify which channel /sequences shows — do not guess") executed.

**Binding execution conditions.**
1. STEP-0 is mandatory at claim: merge `cl/integration-2` (this spec's pin table predates CARD-1's merge) and
   RE-AUDIT every pin. A moved pin that breaks the design = STOP and report, not a local redesign.
2. CARD-1 (`AgentOrchestrator.ts`) and SCIENCE-CHAIN-1 (same file) must not be live on a slot when this
   dispatches — one worker per file.
3. R1 stays rejected; `app/src/sequences/applyAgentAction.ts` + its test are frozen and their pin must be
   green in the delivered delta. A diff touching either file is an automatic reject at review.
4. No second forced tool, no unpinned `tool_choice`, zero extra inference calls: the receipt must show one
   `/api/ai/assist/stream` POST per turn.
5. Acceptance is the ruling §(d) sentence verbatim, browser-graded on `:5193` with ROUND-TRIP-GATE-1
   provenance (zero `/api/ai/**` interception, request-body artifact + rendered-answer screenshot). Code-track
   gates do not substitute for it.
