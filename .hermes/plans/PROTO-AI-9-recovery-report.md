# PROTO-AI-9 recovery-path repair — worker report (l2t1037, cl-senior)

Branch: `wt/PROTO-AI-9-recovery-lane2-l2t1037` @ 9ed7f3ee (off cl/integration-2 @ 85669570).
Spec: `.hermes/plans/2026-10-05_1037-PROTO-AI-9-recovery-coercion-fix.md` (canonical copy in cl-integration-2 tree).
Finding: `/home/brad/.hermes/cl/lanes/2/decisions/PROTO-AI-9-recovery-coercion-finding.md`.
No blockers. Not merged (orchestrator merges).

## 1. Reproduction (before fix, against live lane stack :3093)

`cd /home/brad/.hermes/cl/receipts/PROTO-AI-9/2026-10-05_0930 && python3 replay-browser-body.py replay`

    R1 exact-browser-body -> [('tool', "{'intent': 'protocol_edit', 'ops': [{'op': 'step_insert', 'label': 'Wash', 'kind': 'wash', 'afterStepId': 'step-3'}, {'op': 'step_delete','stepId':'step-6'}]}"), ('done', '{"pe": false, "err": "no proposal: the model\u2019s tool call carried no usable draft arguments. Nothing wa"}')]
    R2 exact-browser-body -> (identical)

`/mnt/vast/home/brad/git/cl-integration-2/.run/backend.log` (agents 9rhaac, dwxgna — my two replays):

    [agent 9rhaac] turn 1 finish=stop contentLen=41 toolCalls=0
    [agent 9rhaac] model ignored forced tool call; coerced JSON args after stop contentPreview="[AgentUI error: message type must be set]"
    [agent 9rhaac] no proposal: the model’s tool call carried no usable draft arguments. Nothing was applied — try rephrasing, or name the material explicitly.
    [agent 9rhaac] I ignored `ops` (not a draft argument): `ops` is not part of this tool’s arguments and was ignored — use the event fields documented for the verb.
    [agent 9rhaac] done success=true via compile_event_graph_draft turns=1 events=0 elapsedMs=8363

2/2 replays reproduced the exact chain from the finding: recovery recovered the right
ops (visible in the SSE tool_call), the server wrapped them as `compile_event_graph_draft`,
`ops` was reported "not a draft argument", the proposal was dropped.

## 2. The fix (git diff --stat @ 9ed7f3ee)

    server/src/ai/AgentOrchestrator.protocolEditRecovery.test.ts | 182 +++++++++++++++++++++
    server/src/ai/AgentOrchestrator.test.ts                      |   8 +-
    server/src/ai/AgentOrchestrator.ts                           |  36 +++-
    server/src/ai/coerceAgentIntent.test.ts                      |  35 ++++
    server/src/ai/coerceAgentIntent.ts                           |  15 +-
    server/src/ai/coerceDraftArgs.test.ts                        |  23 +++
    server/src/ai/draftArgDiagnostics.ts                         |   2 +
    7 files changed, 292 insertions(+), 9 deletions(-)

Spec items, in order:
1. `coerceAgentIntent.ts`: `AgentIntentName` += `'protocol_edit'`; `INTENT_KEYS.protocol_edit = ['ops']`
   (deliberately narrow — `protocolId` is an optional target, not content, so a `{protocolId}`-only
   blob stays ambiguous-null). Exports `PROTOCOL_EDIT_ARG_KEYS` so the fast-path guard reads the same
   intent table (spec item 3: "reuse coerceToAgentIntentArgs' table, one place").
2. `AgentOrchestrator.ts` slow path (~:1675): `coerceToAgentIntentArgs(coercedArgs)` when
   `forceDraftTool`, wrap as `AGENT_INTENT_TOOL_NAME`; compile-draft wrap kept ONLY when
   `forceDraftTool` is false; null coercion falls to the existing failed-to-coerce diagnostic.
   Mirrors the fast-path pattern verbatim; log line now names the tool it wrapped as (+ "(intent inferred)").
3. `coerceDraftArgsFromContent` (fast path): after the DRAFT_ARG_KEYS check, also accept
   `PROTOCOL_EDIT_ARG_KEYS` keys — DRAFT_ARG_KEYS itself NOT widened (it drives the unknown-field
   diagnostic and stays event-only); the strict guard is kept (no substantive key → null).
4. `buildForcedDraftJsonPrompt`: one added compact line for the protocol_edit case (cite only
   stepIds/roleIds from the ATTACHED PROTOCOL block; proposes, writes nothing).
5. Dispatch branch (:1932-1972) and schema validator: untouched (verified via git diff).

One extra in-scope change the spec implies: `draftArgDiagnostics.ts` `SUBMISSION_ENVELOPE_KEYS` +=
`ops`, `protocolId`. Rationale: that list's stated rule is "keys the tool itself REQUIRES or
documents … the diagnostic must not tell a model off for sending a field its own tool schema marks
required" — the agent_intent schema (submitSuggestionTool.ts:463) documents `ops`, and the
reproduction log literally shows the false scolding "I ignored `ops`". The event-draft key list
(DRAFT_ARG_KEYS) is unchanged.

One existing test updated: `AgentOrchestrator.test.ts` "coerces compiler draft JSON when the model
ignores forced tool_choice" asserted the OLD buggy wrap (`tool_call.toolName ===
compile_event_graph_draft`). It now asserts `agent_intent` (the corrected wrap) plus the same
outcome assertions (success, deckSlot B2) — the spec's required behaviour change, with the draft
result still proven identical. Comment in the test cites the finding.

## 3. Tests (RED-first, all real output)

RED (before implementation, from `server/`):
`npx vitest run src/ai/coerceAgentIntent.test.ts src/ai/coerceDraftArgs.test.ts src/ai/AgentOrchestrator.protocolEditRecovery.test.ts`

    Tests  6 failed | 17 passed (23)
    FAIL coerceAgentIntent.test.ts  > keeps intent protocol_edit untouched                       (expected null …)
    FAIL coerceAgentIntent.test.ts  > infers protocol_edit from a bare ops envelope
    FAIL coerceDraftArgs.test.ts    > recovers a prose {intent:"protocol_edit",ops:[…]} envelope
    FAIL coerceDraftArgs.test.ts    > recovers a bare prose {ops:[…]} envelope
    FAIL AgentOrchestrator.protocolEditRecovery.test.ts > …emits the proposal, not the empty-draft error
         → expected 'no proposal: the model's tool call ca…' not to match /no usable draft arguments/
    FAIL AgentOrchestrator.protocolEditRecovery.test.ts > …zero store mutations, zero tool executions, no compiler

The event_graph-regression and ambiguity-null tests PASSED in RED (baseline behaviour, unchanged —
proven).

GREEN (after fix), same command + neighbours:
`npx vitest run src/ai/coerceAgentIntent.test.ts src/ai/coerceDraftArgs.test.ts src/ai/AgentOrchestrator.protocolEditRecovery.test.ts src/ai/AgentOrchestrator.protocolEdit.test.ts src/ai/AgentOrchestrator.test.ts src/ai/submitSuggestionTool.protocolEdit.test.ts`

     ✓ src/ai/coerceAgentIntent.test.ts                (9 tests)
     ✓ src/ai/submitSuggestionTool.protocolEdit.test.ts (5 tests)
     ✓ src/ai/coerceDraftArgs.test.ts                  (10 tests)
     ✓ src/ai/AgentOrchestrator.protocolEdit.test.ts   (9 tests)
     ✓ src/ai/AgentOrchestrator.protocolEditRecovery.test.ts (4 tests)
     ✓ src/ai/AgentOrchestrator.test.ts                (11 tests)
     Test Files  6 passed (6)   Tests  48 passed (48)

Full-suite regression comparison (`npx vitest run src/ai` in worktree vs trunk cl/integration-2):

    worktree: 22 FAIL lines   trunk: 22 FAIL lines
    diff /tmp/vitest-trunk.txt /tmp/vitest-wt2.txt → identical failure set

All 22 are pre-existing on trunk at 85669570 (verified individually; e.g. promptBudget fails on BOTH
with the same "41781 chars — budget 12000"; goldenWithSeeds fails identically on both). No failure is
introduced or masked by this change. Note `promptBudget.test.ts` measures the core prompt
(template+instruction+schema), NOT `buildForcedDraftJsonPrompt`; my +300-char retry-prompt line is
outside its measurement (Brad's compactness ruling respected).

## 4. Typecheck (`npm run typecheck -w server`)

Trunk cl/integration-2 baseline: 33 errors (spec says 34; live trunk is 33 today).
This worktree pre-fix: 44. The +11 delta is NOT my change: `server/src/sequences/*` and
`server/src/drafts/*` are SYMLINKS into Brad's live computable-lab tree, excluded from the worktree
via `/home/brad/.hermes/cl/lanes/2/lane-exclude-recovery-l2t1037`, so tsc typechecks files that are
not in either git tree. The 8 AgentOrchestrator.ts errors are byte-identical to trunk's.

After the fix: 44 errors — `diff /tmp/tc-wt.txt /tmp/tc-wt-after.txt` shows ONLY line-number shifts
of the same pre-existing AgentOrchestrator.ts errors (+22 lines from my insertions). Zero new error
kinds, files, or counts. No NEW errors introduced by this change.

## 5. End-to-end (own evidence)

The lane stack's :3093 runs trunk code (85669570) and I am forbidden to restart it, so a live
protocol_edit proposal there would be false evidence. Instead I ran MY branch code exactly as the
lane runs it, on a scratch port, with the identical environment:
`APP_BASE_PATH=.. PORT=3099 CL_DATA_DIR=/home/brad/.computable-lab-lane2 CONFIG_PATH=<copy of the
lane's config.yaml> npx tsx src/server.ts` (same worktree layout, same data dir, same model profile
qwen3.8-thunderbeast → thunderbeast:8080; temp copy deleted, temp backend killed after; :3093/:5193
NEVER touched — lane-stack status: both http=200 throughout; :3001/:5174 never touched).

Replay of the exact browser body (`BASE=http://localhost:3099`, same script):

    R1 exact-browser-body -> [('tool', "{'intent': 'protocol_edit', 'ops': [{'op': 'step_insert', 'label': 'Wash step', 'kind': 'wash', 'afterStepId': 'step-3'}, {'op': 'step_delete', 'stepId': 'step-"}), ('done', '{"pe": true, "err": null}')]
    R2 exact-browser-body -> (identical)

Backend log (my fix's new lines verbatim):

    [agent 48njqk] turn 1 finish=stop contentLen=103 toolCalls=0
    [agent 48njqk] model ignored forced tool call; coerced JSON args after stop as agent_intent contentPreview="[DeferProposal] protocol_edit deferred: {"ops":[{"op":"step_insert","label":"Wash","kind":"wash","after"
    [agent 48njqk] done protocol_edit success=true ops=2 elapsedMs=27333
    [agent ydvn0a] turn 1 finish=stop contentLen=804 toolCalls=0
    [agent ydvn0a] model ignored forced tool call; coerced JSON args after stop as agent_intent contentPreview="[thinking] The user wants protocol edits: insert a wash step after step-3, and delete a "redundant centrifuge step"…"
    [agent ydvn0a] done protocol_edit success=true ops=2 elapsedMs=13057

The stop+degenerate path now reaches `done protocol_edit` with 2 schema-valid ops (the envelope is
validated by the registered protocol-edit-op Ajv schema inside the untouched dispatch branch), and
the SSE `done` carries `protocolEdit` (`pe: true, err: null`) — the ChangesPanel payload. The
failure-mode log lines ("no usable draft arguments", "I ignored `ops`", "via
compile_event_graph_draft") are gone on this path.

Propose-never-write (sha over `GET /api/records/PRT-4iaey2` content, canonical JSON, sha256):

    pre-replay  :3099: 93b7c3c579a3e867358249c5dff2fcc149b472b3b4a841e569682874cb5e63c4
    post-replay :3099: 93b7c3c579a3e867358249c5dff2fcc149b472b3b4a841e569682874cb5e63c4
    reference   :3093: 93b7c3c579a3e867358249c5dff2fcc149b472b3b4a841e569682874cb5e63c4   UNCHANGED

## 6. Notes for the orchestrator

- After merge, cl-browser-reviewer should be pointed at :3093/:5193 following YOUR stack restart —
  the running :3093 process is still trunk code; a review run before restart would re-observe the old
  defect.
- The live model's degenerate content varies turn to turn (`[AgentUI error: …]`, `[DeferProposal]`,
  `[thinking]…`); all reproduced cases took the slow recovery path and now reach protocol_edit. The
  fast prose path is unit-covered (`coerceDraftArgs.test.ts`).
- No YAML touched, no stack restarted, no profile/model settings changed, nothing outside
  server/src/ai/, not merged.
