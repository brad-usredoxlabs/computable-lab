# CROSS-LANE FINDING (lane 1 -> lane 2 owner) — `/sequences` harness: no turn can answer a question, tab switches never land

Filed by lane-1 orchestrator tick 297TH, 2026-11-03T16:50 EST. Read-only evidence; **no lane-1 code
was touched and no lane-1 task was opened.** The sequences harness belongs to lane 2
(`HARNESS-SEQ-1/2`, `L2-CHAT-UI-1`, `CHATHOST-SWEEP-1`), so this document is a defect packet, not a scope
claim. Receipts: `~/.hermes/cl/receipts/L1-SEQ-QA-PROBE-1/l1t1645/` (README + 15 raw SSE transcripts).

Probed surface: lane-1 stack `:3092` served from trunk `cl/integration-1` @ `4a7111c4` (no lane-1 product
commit since `2d3035da`). Revision scope, checked: `app/src/sequences/applyAgentAction.ts` is byte-identical
between `cl/integration-1` and `cl/integration-2`; `server/src/ai/AgentOrchestrator.ts` differs (lane-2 trunk
carries +467 lines not yet on lane-1's), but the three structural points below are still present there
(grep at `cl/integration-2`: forced-tool branch :1753, `tool_choice` pin :1254, `'Action sent — see the
workspace.'` :3495). Line numbers below are lane-1 trunk's.

## Measured (15 real `POST /api/ai/assist/stream` turns, no mocking)

- "Switch to the assay tab." with the real client context shape
  (`SequencesPage.tsx:77` records + selectedRecordId): **5/5** turns returned
  `agent_action {action:"open-surface", surface:"sequences"}` with **no `target`**.
- The same prompt with an empty context: 2 `MALFORMED_ENVELOPE`, 2 `UNRESOLVED_TERM` ("Assay"),
  1 `AMBIGUOUS_TERM` ("x"). 0/10 turns switched a tab.
- "In one short sentence, say what this sequences workspace is for.": **0/6** turns answered.
  5 emitted a target-less action (or a malformed one); **1 emitted
  `target {kind:"sequence-tab", tab:"Editor"}`** — a question silently navigated the user.
- Every turn ended `done {success:true}`. Gap turns surface the raw validator text as the user-visible
  answer; target-less turns surface the note `"Action sent — see the workspace."`

### Breadth (added after the table): not a sequences-only problem

The same question on `surface:"analysis"` — 2/2 turns returned `agent_action {open-surface,
surface:"analysis"}` plus `done notes ["Opened analysis — nothing was written."]` and **zero `text` frames**.
So a question is unanswerable on every surface that takes the forced-tool path; only the client-side
reaction to a target-less action differs per surface (`/analysis`'s handler was not exercised in a browser,
so its visible outcome is UNVERIFIED; the absence of answer text is verified from the frames).

## The contradiction, with anchors

| layer | behaviour | anchor |
|---|---|---|
| server routing | `surface==='sequences'` skips preflight and pins `tool_choice` to `agent_intent` — prose answers are structurally impossible | `server/src/ai/AgentOrchestrator.ts:1635` |
| server guidance | system prompt names the six `declaredTabs` and demands `target {kind:"sequence-tab", tab:"<tab>"}` | `AgentOrchestrator.ts:1204,1213` |
| server compile | target-less `open-surface` to a registered surface is a VALID result | `server/src/ai/compileWorkspaceAction.test.ts:306-313` |
| server messaging | valid compile -> `notes: ['Action sent — see the workspace.']` | `AgentOrchestrator.ts:3047` |
| client adapter | target-less action is a NAMED REFUSAL: "The workspace action carried no target, so nothing could be routed." | `app/src/sequences/applyAgentAction.ts:80-88`, pinned at `applyAgentAction.test.ts:208-213` |

Both sides are deliberately tested. The live model reliably produces the one envelope on which they disagree,
so the surface silently degrades to: narration + a refusal line, or narration + a validator dump.

This is the same class as the fix2 finding (server note contradicting what the page did,
`.hermes/plans/reports/HARNESS-SEQ-2-fix2-report.l2t1535.md` D4) with a second, independent cause.

## What lane 2 (or the architect) has to decide — three remedies, mutually exclusive for the note text

- **R1 — client tolerates target-less `open-surface` as a no-op confirmation.** Cheap, honours
  `compileWorkspaceAction`'s contract, but it contradicts the client's deliberate "named refusal" pin and
  leaves ALL of these turns as dead ends with a cheerful note. Fixes messaging only.
- **R2 — server rejects a target-less `open-surface` for a surface that requires a target, with an
  actionable diagnostic** ("Name the tab or record"), and stops emitting "Action sent". Makes the
  contract single-valued; still leaves the scientist with no answer.
- **R3 — restore a prose/answer path on `/sequences`** (do not pin `tool_choice` when the turn is not an
  action request, or add an `answer` intent that streams text). This is the only remedy that makes
  "what is this workspace for?" answerable — but it is a product-intent change for the surface and needs
  Brad/architect authority, not an orchestrator call.

R1 and R2 are correctness repairs; R3 is the one that matches the north star (an AI that drives
prominence/context AND explains the lab). I am not choosing between them — that is lane 2's / the
architect's ruling. If Brad is asked, the question is a single one: *should the sequences chat be able to
answer a question, or is it action-only by design?*

## Not claimed

- Partly graded: `/analysis` shares the forced-tool shape for questions (2/2, zero text frames);
  event-editor (different endpoint `/ai/draft-events/stream`) and the remaining surfaces are NOT probed.
- `/analysis`'s client-side reaction to a target-less action was not exercised in a browser — its visible
  outcome there is UNVERIFIED.
- The model used is whatever the server config resolves to (same as the browser); no per-turn thinking
  flag or history was supplied.
