# PB-CH-4 coder report — lane 2, worktree `wt/PB-CH-4-lane2-l2t0150`

- Item: "Wave-1 mount in run chat + two-device workstate acceptance proof (and focus goes into the request)"
- Spec (contract): `.hermes/plans/2026-10-07_0120-PB-CH-4-wave1-mount-spec.md`
- Claim HEAD: `dcf2de3f` (trunk tip, includes PB-CH-3 merge `1f466b8b`)
- Commit: `c3c29a69e90605558aa64c1aee1df39d7654de06` — `feat(PB-CH-4): mount the workstate executor in run chat + focus into the request`
- Ancestry check (verbatim): `ANCESTOR-OK: PB-CH-3 merge 1f466b8b is an ancestor of HEAD`

## 1. What was built (spec §§1-6)

Tier 1 (applies on arrival, post-server-compile — AR-1/AR-2 tier-1):
- `assistStream.ts` — `agent_action` + `workstate_proposal` join `AssistStreamEvent`; `dispatchFrame` gains both cases; the `default:` return stays intact (verified by test).
- `useChatThread.ts` — the exhaustive switch gains `case 'agent_action'` and `case 'workstate_proposal'`; the `never` arm is KEPT, no `default` added. `onAgentAction` / `onWorkstateProposal` ride the same never-break-the-turn try/catch wrapper as `onDraftResult`. `workingFocus` threads in as a hook option and is conditionally spread into the request (mirrors `protocolStepContext`).
- `chatReducer.ts` — `TraceEntry.kind` gains `'action'` (one additive change, nothing else).
- `MessageLog.tsx` — one icon-map entry so the `action` kind renders with the trace icon.
- `AiTabPanel.tsx` — consumes `useWorkstateExecutor` AS-IS (no focus callback passed; the hook wires `useProtocolSelection` internally per the resolved OQ3). `onAgentAction -> executeTier1` applies on arrival; outcome text goes to the trace; `ok:false` shows its diagnostic with no dialog, no retry, no mount-side `replaceState`/store dispatch.

Tier 2 (AR-2 — never push an unaccepted workstate):
- `WorkstateProposalCard.tsx` + `.css` — actionable ONLY from a `POST /api/drafts/compile` response with `canAccept:true`. Compiling slot and blocked compile render NO accept control. Tab names come from the surfaces registry (`useSurfaceRegistry`), never hardcoded. Applied state is spent (controls disappear).
- `AiTabPanel.tsx` — at most one pending draft identity `{draftId, revision, reviewHash}`; a late response for a superseded compile is discarded; Accept posts the identity and hands the FLAT body to `applyAcceptedWorkstate(body, {accepted:true}, identity)`; Reject touches nothing.
- `client.ts` — `compileWorkstateDraft` / `acceptWorkstateDraft` (the first `/api/drafts/*` client methods; spec verified zero existed).

Server emission (`compose_workstate` as the sixth intent):
- `submitSuggestionTool.ts` — six-intent enum + `workstate` envelope; the envelope is retained verbatim (by reference, the `protocol_edit`/`workspace_action` discipline). The server never client-side-compiles here.
- `AgentOrchestrator.ts` — `compose_workstate` emits exactly ONE `workstate_proposal` event with zero store writes; a missing envelope corrects through the existing error channel (`success:false` + corrective `error`, the `create_record` precedent) and emits no event.
- `types.ts` — `AgentEvent` gains `workstate_proposal`; `EditorContext` gains `workingFocus?`.
- `AIHandlers.ts` — `AssistBody.workingFocus` (form + JSON paths), threaded into `editorContext` by conditional spread.
- `systemPrompt.ts` — one `formatWorkingFocus` block: `### WORKING FOCUS (what the user is looking at right now)` citing `protocolId` + `stepId`; absent focus renders nothing (byte-stable prefix otherwise).

## 2. Matrix mapping (spec "Red-first test matrix" row -> test name)

| Matrix criterion | Test name(s) | File |
| --- | --- | --- |
| union/parse of PB-CH-1's emission | `an agent_action SSE frame parses into the typed envelope (surface/contextNote OMITTED when absent, never undefined)`; `an open-surface agent_action keeps its surface + contextNote when the server compiled them`; `an unknown frame type still parses to nothing (default branch intact)` | `app/.../assistStream.agentAction.test.ts` |
| exhaustive seam | `onAgentAction fires exactly once per event and the never-default still compiles (source-pin: the switch keeps the never arm, no swallowing default)`; `onWorkstateProposal forwards the intent verbatim without touching the tab store or the trace` | `app/.../useChatThread.agentAction.test.tsx` |
| tier-1 applies on arrival | `an agent_action event causes exactly one executor.executeTier1 call with the payload — no dialog, no second call, no mount-side store dispatch` | `app/.../AiTabPanel.workstate.test.tsx` |
| tier-1 diagnostic = visible, no movement | `an ok:false executor outcome returns its diagnostic message for the trace and opens no dialog / makes no second call`; plus `a throwing onAgentAction never breaks the chat turn (same wrapper as onDraftResult)` | panel + hook |
| no actionable card from raw output / schema-validity alone | `a workstate_proposal event alone renders NO accept control (compiling slot) until the compile response arrives`; `compile response canAccept:false renders summary + diagnostics and NO accept control`; card-level: `the compiling slot shows prompt progress and NO accept/reject control`, `a blocked compile (canAccept:false) renders summary + diagnostics beside the review and NO accept control` | panel + `WorkstateProposalCard.test.tsx` |
| no push before accept | `with a pending card, advancing 600 ms fires ZERO putSession and the tab store reference-identity is unchanged (AR-2)` | panel |
| accept = executor-only path | `Accept posts exactly {draftId,revision,reviewHash}; the FLAT body goes to applyAcceptedWorkstate with {accepted:true} + identity; ZERO /ai/assist/stream fetch during accept`; plus `a failed accept (executor ok:false) shows diagnostics, keeps the card rejectable, and moved nothing` | panel |
| reject touches nothing | `Reject drops the card, clears the pending identity, zero apiClient calls, zero store dispatches` | panel |
| revision bump | `a second proposal while one is pending compiles with draftId+revision; a late response for a superseded compile is DISCARDED` | panel |
| context gap fix on the wire | `with workingFocus set, the request body carries {protocolId,stepId,label,ordinal}; with none focused the key is ABSENT (not undefined)`; `context stays byte-identical when only focus changes (warm-prefix stability)`; panel-level `with focusedStep set, the mount threads workingFocus into the chat options; with none focused the key is ABSENT` | hook + panel |
| trace renders the action kind | `stream-trace accepts a kind:"action" entry with evidence and appends it`; `a kind:"action" trace entry renders with the trace icon and its evidence text` | `chatReducer.actionTrace.test.tsx` |
| server emission | `compose_workstate intent retains the workstate envelope VERBATIM`; `emits exactly ONE workstate_proposal event carrying the envelope verbatim + tool_result success:true + a review-card note`; `spies on the store prove ZERO mutation calls — the emission runs nothing else`; `an invalid workstate envelope STILL emits verbatim — /api/drafts/compile owns the diagnostic (no client-side compile here)` | `server/src/ai/submitSuggestionTool.workstate.test.ts`, `server/src/ai/AgentOrchestrator.workstateProposal.test.ts` |
| workingFocus reaches the prompt | `renders the block only when workingFocus is present, citing protocolId + stepId`; `renders no WORKING FOCUS block when workingFocus is absent (byte-stable prefix otherwise)` | `server/src/ai/systemPrompt.workingFocus.test.ts` |
| pins | `exposes a SIX-intent menu, exactly (...)` (new file) + deliberate DIFF in `submitSuggestionTool.test.ts` and `submitSuggestionTool.protocolEdit.test.ts` (five -> six) | server suite |

Extra pins beyond the matrix (reviewer-bait list): `the applied state is spent: controls disappear (no dead buttons)`, `Accept and Reject are distinct, keyboard-operable native buttons`, `window.confirm is never called` (spy asserted in every panel test), `a compose_workstate call with no workstate object is corrected through the existing error channel, emitting NO event`, `unknown intents still fall to intent:"unknown" (compose_workstate did not widen the accept set)`.

## 3. RED evidence (BEFORE implementation, both modules)

RED was captured deterministically in a scratch worktree at the claim HEAD (`git worktree add --detach /mnt/vast/home/brad/git/wt/PB-CH-4-redcheck dcf2de3f`) with ONLY the new test files copied in — zero implementation hunks. The scratch worktree was removed after capture.

### App RED (verbatim)

```
 FAIL  src/event-editor/right-pane/ai/AiTabPanel.workstate.test.tsx [ src/event-editor/right-pane/ai/AiTabPanel.workstate.test.tsx ]
 FAIL  src/event-editor/right-pane/ai/WorkstateProposalCard.test.tsx [ src/event-editor/right-pane/ai/WorkstateProposalCard.test.tsx ]
⎯⎯⎯⎯⎯⎯ Failed Tests 10 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/event-editor/right-pane/ai/assistStream.agentAction.test.ts > assistStream — agent_action frame (PB-CH-1 transport mirror) > an agent_action SSE frame parses into the typed envelope (surface/contextNote OMITTED when absent, never undefined)
 FAIL  src/event-editor/right-pane/ai/assistStream.agentAction.test.ts > assistStream — agent_action frame (PB-CH-1 transport mirror) > an open-surface agent_action keeps its surface + contextNote when the server compiled them
 FAIL  src/event-editor/right-pane/ai/assistStream.agentAction.test.ts > assistStream — agent_action frame (PB-CH-1 transport mirror) > a workstate_proposal frame carries the model intent VERBATIM (not a compiled draft, not actionable alone)
 FAIL  src/event-editor/right-pane/ai/chatReducer.actionTrace.test.tsx > MessageLog — action trace chip (PB-CH-4) > a kind:"action" trace entry renders with the trace icon and its evidence text
 FAIL  src/event-editor/right-pane/ai/useChatThread.agentAction.test.tsx > useChatThread — agent_action / workstate_proposal cases (PB-CH-4) > onAgentAction fires exactly once per event and the never-default still compiles (source-pin: the switch keeps the never arm, no swallowing default)
 FAIL  src/event-editor/right-pane/ai/useChatThread.agentAction.test.tsx > useChatThread — agent_action / workstate_proposal cases (PB-CH-4) > the agent_action trace entry carries the mount-returned executor outcome text
 FAIL  src/event-editor/right-pane/ai/useChatThread.agentAction.test.tsx > useChatThread — agent_action / workstate_proposal cases (PB-CH-4) > without mount text, the trace evidence is the payload verb + resolved label
 FAIL  src/event-editor/right-pane/ai/useChatThread.agentAction.test.tsx > useChatThread — agent_action / workstate_proposal cases (PB-CH-4) > onWorkstateProposal forwards the intent verbatim without touching the tab store or the trace
 FAIL  src/event-editor/right-pane/ai/useChatThread.agentAction.test.tsx > useChatThread — agent_action / workstate_proposal cases (PB-CH-4) > with workingFocus set, the request body carries {protocolId,stepId,label,ordinal}; with none focused the key is ABSENT (not undefined)
 FAIL  src/event-editor/right-pane/ai/useChatThread.agentAction.test.tsx > useChatThread — agent_action / workstate_proposal cases (PB-CH-4) > context stays byte-identical when only focus changes (warm-prefix stability)
 Test Files  5 failed (5)
      Tests  10 failed | 3 passed (13)
```

Collection failure for the not-yet-existing component (verbatim):

```
 FAIL  src/event-editor/right-pane/ai/WorkstateProposalCard.test.tsx [ src/event-editor/right-pane/ai/WorkstateProposalCard.test.tsx ]
Error: Failed to resolve import "./WorkstateProposalCard" from "src/event-editor/right-pane/ai/WorkstateProposalCard.test.tsx". Does the file exist?
```

### Server RED (verbatim)

```
 FAIL  src/ai/AgentOrchestrator.workstateProposal.test.ts [ src/ai/AgentOrchestrator.workstateProposal.test.ts ]
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 7 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/ai/submitSuggestionTool.workstate.test.ts > agent_intent — compose_workstate intent (PB-CH-4) > exposes a SIX-intent menu, exactly (event_graph | deck_layout | create_record | protocol_edit | workspace_action | compose_workstate)
 FAIL  src/ai/submitSuggestionTool.workstate.test.ts > agent_intent — compose_workstate intent (PB-CH-4) > carries the workstate envelope on the tool schema so the model can fill it
 FAIL  src/ai/submitSuggestionTool.workstate.test.ts > agent_intent — compose_workstate intent (PB-CH-4) > parses compose_workstate and retains the workstate envelope VERBATIM
 FAIL  src/ai/submitSuggestionTool.workstate.test.ts > agent_intent — compose_workstate intent (PB-CH-4) > an invalid workstate envelope still parses verbatim — /api/drafts/compile owns the diagnostic (the server never client-side-compiles here)
 FAIL  src/ai/submitSuggestionTool.workstate.test.ts > agent_intent — compose_workstate intent (PB-CH-4) > a compose_workstate call with no workstate object falls to the intent with no envelope (still not a compile)
 FAIL  src/ai/systemPrompt.workingFocus.test.ts > buildSystemPrompt — WORKING FOCUS block (PB-CH-4) > renders the block only when workingFocus is present, citing protocolId + stepId
 FAIL  src/ai/systemPrompt.workingFocus.test.ts > buildSystemPrompt — WORKING FOCUS block (PB-CH-4) > renders the ordinal as ? when the focus carries none (no invented number)
 Test Files  3 failed (3)
      Tests  7 failed | 2 passed (9)
```

### Forcing seam observed live (the spec's proof)

After adding the two union members to `assistStream.ts` but BEFORE adding the switch cases, the editor/compiler flagged `useChatThread.ts` at the `never` arm — the new server members broke the app compile exactly as the spec predicted. The cases were then added; no `default` was introduced.

### First targeted check (spec's "First targeted check", run before touching the panel)

```
 Test Files  2 passed (2)
      Tests  12 passed (12)
```
(`assistStream.agentAction.test.ts` 4 passed + the existing `assistStream.test.ts` 8 passed, untouched-green. `dispatchFrame`'s existing cases needed no change; the `default:` return at the end of the switch is intact and pinned by `an unknown frame type still parses to nothing (default branch intact)`.)

## 4. Verification (verbatim output, post-implementation)

### 4.1 Targeted app suites + new files

```
 FAIL  src/event-editor/right-pane/ai/ParameterAnswerInput.test.tsx [ src/event-editor/right-pane/ai/ParameterAnswerInput.test.tsx ]
 FAIL  src/event-editor/right-pane/ai/draftChanges.test.ts [ src/event-editor/right-pane/ai/draftChanges.test.ts ]
 FAIL  src/event-editor/right-pane/ai/useChatThread.deckLayout.test.tsx [ src/event-editor/right-pane/ai/useChatThread.deckLayout.test.tsx ]
⎯⎯⎯⎯⎯⎯ Unhandled Errors ⎯⎯⎯⎯⎯⎯
 Test Files  3 failed | 33 passed (36)
      Tests  263 passed (263)
     Errors  1 error
```

`cd app && npx vitest run src/event-editor/right-pane/ai src/shared/session`: ZERO test failures (263/263). The 3 failed FILES are the known pre-existing environmental symlink load-errors — they are symlinks into `/mnt/vast/home/brad/git/computable-lab/...` that resolve outside the worktree. The identical 3 files fail identically in the trunk (see 4.2). The 1 unhandled error is the pre-existing `ClarificationPicker.tsx:215` timer error, also present in the trunk baseline. Not touched.

New app files green: `assistStream.agentAction.test.ts` (4), `useChatThread.agentAction.test.tsx` (7), `AiTabPanel.workstate.test.tsx` (10), `WorkstateProposalCard.test.tsx` (5), `chatReducer.actionTrace.test.tsx` (2) = 28 new tests.

### 4.2 Trunk parity for the same targeted run (proof the 3 failures are environmental)

```
 FAIL  src/event-editor/right-pane/ai/ParameterAnswerInput.test.tsx [ src/event-editor/right-pane/ai/ParameterAnswerInput.test.tsx ]
 FAIL  src/event-editor/right-pane/ai/draftChanges.test.ts [ src/event-editor/right-pane/ai/draftChanges.test.ts ]
 FAIL  src/event-editor/right-pane/ai/useChatThread.deckLayout.test.tsx [ src/event-editor/right-pane/ai/useChatThread.deckLayout.test.tsx ]
⎯⎯⎯⎯⎯⎯ Unhandled Errors ⎯⎯⎯⎯⎯⎯
 Test Files  3 failed | 28 passed (31)
      Tests  235 passed (235)
     Errors  1 error
```
(trunk `cl-integration-2/app`. Worktree = trunk + 5 files / +28 tests, same 3 environmental file failures, same 1 unhandled error.)

Symlink evidence (identical in both trees):
```
lrwxrwxrwx ... draftChanges.test.ts -> /mnt/vast/home/brad/git/computable-lab/app/src/event-editor/right-pane/ai/draftChanges.test.ts
lrwxrwxrwx ... ParameterAnswerInput.test.tsx -> /mnt/vast/home/brad/git/computable-lab/app/src/event-editor/right-pane/ai/ParameterAnswerInput.test.tsx
lrwxrwxrwx ... useChatThread.deckLayout.test.tsx -> /mnt/vast/home/brad/git/computable-lab/app/src/event-editor/right-pane/ai/useChatThread.deckLayout.test.tsx
```

### 4.3 App full suite — failing-file SET set-identical to the 53-file baseline

```
TRUNK: 53
WT: 53
comm -3 /tmp/appfull-trunk.txt /tmp/appfull-wt2.txt  -> (empty)
```
One earlier full-suite run listed 54 files with `src/graph/events/forms/AddMaterialForm.biological.test.tsx` extra; that file passes in isolation (`Test Files 1 passed (1) / Tests 2 passed (2)`) and the confirming re-run returned 53 with an empty `comm -3`. Reported as a transient load flake, not a delta.

### 4.4 App tsc pin (34, file-set identical)

```
34            # worktree error TS lines
34            # trunk error TS lines
=== COMM vs trunk (must be empty) ===
COMM-COUNT: 0
```
(`npx tsc --noEmit --pretty false` from `app/` in both trees; error-FILE sets compared with `comm -3`.)

### 4.5 Server targeted suites

```
 Test Files  11 passed (11)
      Tests  99 passed (99)
```
(`src/ai/submitSuggestionTool.workstate.test.ts src/ai/AgentOrchestrator.workstateProposal.test.ts src/ai/systemPrompt.workingFocus.test.ts src/ai/submitSuggestionTool.test.ts src/ai/submitSuggestionTool.protocolEdit.test.ts src/ai/AgentOrchestrator.protocolEdit.test.ts src/ai/AgentOrchestrator.workspaceAction.test.ts src/ai/systemPrompt.test.ts src/drafts`)

```
 Test Files  3 passed (3)
      Tests  39 passed (39)
```
(`cd server && npx vitest run src/drafts` — untouched-green.)

### 4.6 Server `src/ai` failing-file SET unchanged

```
TRUNK:
src/ai/AgentOrchestrator.bypass.test.ts
src/ai/AgentOrchestratorForwarding.test.ts
src/ai/AgentOrchestrator.golden.test.ts
src/ai/AgentOrchestrator.goldenWithSeeds.test.ts
src/ai/AgentOrchestrator.tubeGate.test.ts
src/ai/ChatbotCompileDeckSlot.test.ts
src/ai/chatbotCompile.e2e.test.ts
src/ai/InferenceClient.config.test.ts
src/ai/materialFollowUp.test.ts
src/ai/submitSuggestionTool.tubeSchema.test.ts
COMM (must be empty):
COMM-COUNT: 0
```
Worktree run: `Test Files 10 failed | 66 passed (76) / Tests 21 failed | 578 passed (599) / Errors 2` vs trunk `10 failed | 63 passed (73) / 21 failed | 565 passed (586) / Errors 2` — same 10 failing files, same 21 failing tests, +3 new green files, +13 new passing tests. The deliberate pin deltas (five -> six intent) are shown in the diff of the two pin tests and both now pass.

### 4.7 Server `src/schema` + `src/surfaces`

Worktree: `Test Files 3 failed | 36 passed | 5 skipped (44) / Tests 10 failed | 372 passed | 53 skipped (435)`.
Trunk: 4 failing files. Failing-file DIFF: `src/schema/ControlledDocumentSchemas.test.ts` fails in the TRUNK and PASSES in the worktree (`Test Files 1 passed (1) / Tests 21 passed (21)`). Trunk's failure is an environmental artifact — `ELOOP: too many symbolic links encountered, stat '/mnt/vast/home/brad/git/cl-integration-2/schema/schema/schema/.../core/datatypes/revision-ref.schema.yaml'` (a self-referential `server/schema` symlink chain in the trunk checkout). The worktree is CLEANER than the baseline here; no YAML was touched.

### 4.8 Server tsc pin (26, file-set identical)

```
26            # worktree error TS lines
26            # trunk error TS lines
=== COMM (must be empty) ===
COMM-COUNT: 0
```
exactOptionalPropertyTypes sites honored with conditional spread (`...(workingFocus ? { workingFocus } : {})`, `...(workstate ? { workstate } : {})`, `...(surface ? { surface } : {})`) — never `{x: undefined}`.

### 4.9 Diff vs claim HEAD — only spec-named files

```
 .../right-pane/ai/AiTabPanel.protocolEdit.test.tsx |  51 +-
 .../ai/AiTabPanel.runPageSurface.test.tsx          |  51 +-
 app/src/event-editor/right-pane/ai/AiTabPanel.test.tsx |  30 +-
 app/src/event-editor/right-pane/ai/AiTabPanel.tsx  | 208 +++++++
 .../right-pane/ai/AiTabPanel.workstate.test.tsx    | 529 +++++++++++++++++++++
 app/src/event-editor/right-pane/ai/MessageLog.tsx  |   6 +
 .../right-pane/ai/WorkstateProposalCard.css        | 119 +++++
 .../right-pane/ai/WorkstateProposalCard.test.tsx   | 109 +++++
 .../right-pane/ai/WorkstateProposalCard.tsx        | 150 ++++++
 .../right-pane/ai/assistStream.agentAction.test.ts | 147 ++++++
 app/src/event-editor/right-pane/ai/assistStream.ts |  61 ++-
 .../right-pane/ai/chatReducer.actionTrace.test.tsx |  42 ++
 app/src/event-editor/right-pane/ai/chatReducer.ts  |   4 +-
 .../ai/useChatThread.agentAction.test.tsx          | 166 +++++++
 .../event-editor/right-pane/ai/useChatThread.ts    |  81 +++-
 app/src/shared/api/client.ts                       |  44 ++
 server/src/ai/AgentOrchestrator.ts                 |  76 +++
 .../ai/AgentOrchestrator.workstateProposal.test.ts | 186 ++++++++
 .../ai/submitSuggestionTool.protocolEdit.test.ts   |  11 +-
 server/src/ai/submitSuggestionTool.test.ts         |   8 +-
 server/src/ai/submitSuggestionTool.ts              |  59 ++-
 .../src/ai/submitSuggestionTool.workstate.test.ts  |  88 ++++
 server/src/ai/systemPrompt.ts                      |  19 +
 server/src/ai/systemPrompt.workingFocus.test.ts    |  45 ++
 server/src/ai/types.ts                             |  23 +
 server/src/api/handlers/AIHandlers.ts              |  19 +
 26 files changed, 2261 insertions(+), 71 deletions(-)
```

ZERO hunks in the spec's "Explicitly OUT of scope" list: no `app/src/shared/session/**`, no `app/src/shared/surfaces/**`, no `OpenTabsContext.tsx`, no `useSessionSync.ts`, no `openSurface.ts`, no `AgentChatPane.tsx`, no `ChatContextHeader.tsx`, no `RunWorkspacePage.tsx`, no `ChangesPanel`/protocol-edit paths, no `server/src/drafts/**`, no `/api/session` routes, no `workspace-session.ts`, no YAML (`schema/**`, `config/**`), no `config.yaml`, no `SUBMIT_TOOL_NAMES`/`ToolBridge`, no `form-draft*.yaml`, no `protocolStepContext` semantics change.

## 5. Assumptions

| id | statement | why consequential | reversible | evidence_debt | owner |
| --- | --- | --- | --- | --- | --- |
| AS-PBCH4-THIN-EVENT | `compose_workstate` emits the model's workstate INTENT verbatim as one `workstate_proposal` event; the orchestrator does NOT compile it server-side. | The AR-2 trust anchor therefore lives entirely at `POST /api/drafts/compile` (Ajv + `canAccept`). If a reviewer expects a server-compiled draft in the event, this reads as a gap. | Yes — a server-side compile branch could be added in the same dispatch site. | Browser review must show the card actionable only after the compile response, never on emission. Spec's matrix row itself flags "honest: thin-event design, see OQ1". | coder (design shipped as ruled); orchestrator to confirm against OQ1 ruling. |
| AS-PBCH4-CLIENT-RELAY | The client relays the intent to `POST /api/drafts/compile` via two new `apiClient` methods (`compileWorkstateDraft`, `acceptWorkstateDraft`), reusing the existing `request()` + `x-user-id` plumbing. | First `/api/drafts/*` client callers (spec verified zero existed). Actor binding for accept rides the existing identity header. | Yes | Reviewer should confirm the accept request carries the actor identity (header), not a body-baked actor. | coder. |
| AS-PBCH4-WORKINGFOCUS-BLOCK | `workingFocus` rides `AssistBody` -> `editorContext` -> exactly one `### WORKING FOCUS` block in `buildSystemPrompt`, mirroring how `protocolStepContext` threads today. `protocolStepContext` semantics untouched. | This is the context-gap fix: focus now leaves the DOM. Overloading `protocolStepContext` instead would ghost the deck (spec forbids). | Yes | Prompt-level proof is the unit test; the live proof is the browser review's focus screenshot. | coder. |
| AS-PBCH4-OPENTABS-WRAP | Three EXISTING panel harnesses (`AiTabPanel.test.tsx`, `AiTabPanel.protocolEdit.test.tsx`, `AiTabPanel.runPageSurface.test.tsx`) were wrapped in `OpenTabsProvider`. | The consumed PB-CH-3 hook's `useApplySessionDocument` calls strict `useOpenTabs()` and throws outside a provider. Without the wrap those 3 suites (34 tests) crashed. Production is unaffected: `App.tsx` already mounts `OpenTabsProvider` above every route. These files are not named in the task block's `files:` line. | Yes — pure test-harness change, zero product code. | Reviewer should confirm no behavior change in those suites (all pass: 12/12, 12/12, 12/12). | coder; flag to orchestrator as a scope-adjacent test touch. |
| AS-PBCH4-INTENT-PINS | The five-intent enum pins in `submitSuggestionTool.test.ts` and `submitSuggestionTool.protocolEdit.test.ts` were deliberately updated to six. | The matrix "pins" row requires the update with the DIFF shown; leaving them red would break the failing-file-set pin. | Yes | None — both now green; diff in 4.9. | coder. |
| AS-PBCH4-EXECUTOR-CONSUMED | `AiTabPanel` passes NO focus callback to `useWorkstateExecutor`; the hook wires `useProtocolSelection` internally (resolved OQ3), and the mount reads `focusedStep` from `useProtocolSelection()` for the request only. | Keeps one executor (AR-3) and prevents a second focus channel. | Yes | Browser review: focus a seeded step from chat and confirm it lands. | coder. |
| AS-PBCH4-NO-DEFAULT | The `useChatThread` switch gained two cases and KEPT the `never` arm; no `default` was added. `assistStream.dispatchFrame`'s `default:` return is intact (different switch, same name). | The never-default seam is the forcing function the task exists to prove. | n/a | Source-pin test asserts the `never` arm survives. | coder. |
| AS-PBCH4-ACCEPT-FLAT | Accept posts `{draftId, revision, reviewHash}` and hands the compile response's FLAT body to `applyAcceptedWorkstate(body, {accepted:true}, identity)`; identity is passed separately, never merged into the body. | Matches the PB-CH-3 executor signature; a body-baked identity would break the single-writer contract. | Yes | Reviewer: accept on device A, adoption on device B via attach. | coder. |
| AS-PBCH4-REGISTRY-LABELS | Card tab labels resolve through `useSurfaceRegistry()` (registry `label`), with the id shown as fallback when the registry has no entry. No surface name is hardcoded in TS. | "No hardcoding surface names in TS where the registry declares them." The card test renames registry labels and asserts the card follows. | Yes | Browser review: named surfaces recorded with registry IDs/URLs. | coder. |
| AS-PBCH4-SUPERSEDE | A second proposal bumps `draftId+revision` when a resolved pending identity exists; while a compile is still IN FLIGHT (no `draftId` yet) the new proposal replaces the pending slot with a fresh compile, and any late response for the discarded compile is dropped. | The matrix row names the `draftId+revision` bump; a revision bump is impossible before the server returns a `draftId`. The test covers both phases. | Yes | Reviewer should watch a rapid double-proposal: exactly one card, no resurrected stale card. | coder. |
| AS-PBCH4-TRACE-EVIDENCE | Trace evidence text is the mount-returned executor outcome when present, else a payload-derived `<verb> <resolved label> — nothing was written.` | Keeps the trace honest without inventing outcome claims when the executor returns nothing. | Yes | Visual confirmation in the trace screenshots. | coder. |

## 6. Honest boundary notes

1. **Browser acceptance gate NOT run by me.** The task's `verified by:` requires an INDEPENDENT browser review with named screenshots (`wave1-tier1-focus.png`, `wave1-open-surface.png`, `wave1-unresolved-diagnostic.png`, `wave1-pending-card.png`, `wave1-rejected-unchanged.png`, `wave1-accepted-A.png`, `wave1-attached-B.png`) and the two-device attach proof. That is the orchestrator's `cl-browser-reviewer` dispatch. Implementation is complete; acceptance is pending. No stack was started or restarted (no `:3001`/`:5174` touched).
2. **Three environmental app file failures are pre-existing and identical in the trunk** (broken symlinks into Brad's live tree). Reported, not touched, per the spec's verification note.
3. **One pre-existing unhandled error** (`ClarificationPicker.tsx:215`, `TypeError: Cannot read properties of undefined (reading 'then')` under fake timers) exists in the trunk baseline for the same targeted run. Not introduced, not touched.
4. **Server schema/surfaces is cleaner in the worktree than in the trunk** (trunk's `ControlledDocumentSchemas.test.ts` fails on an ELOOP symlink artifact in the trunk's `server/schema` link). Zero YAML was touched.
5. **`server/src/ai` has 10 pre-existing failing files (21 tests)** — the failing-file SET is unchanged (comm empty). My changes added 3 green files and 13 green tests inside that run.
6. **No merge, no push, one commit.** The branch `PB-CH-4-lane2-l2t0150` holds exactly one commit on top of `dcf2de3f`.
7. **Tier-1 `open-surface` navigation uses the registry route builder** (`surfaceRoute`/`buildSurfacePath` via the executor's `navigate`), not an invented path; a bare/unresolvable ref returns the executor's diagnostic (NO_TAB_STORE honored as-is) and the mount surfaces that text in the trace rather than papering over it.
8. **`window.confirm` is spied and asserted never-called** in every panel test (friction-first proof), and the accept path asserts zero `assist/stream` fetches via a global fetch spy.

PB-CH-4 CODER DONE c3c29a69e90605558aa64c1aee1df39d7654de06
