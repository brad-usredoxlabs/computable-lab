# Spec — PROTO-AI-9 recovery-path repair: honour a recovered `protocol_edit` agent_intent

Status: dispatch-ready (orchestrator, lane 2, 2026-10-05T10:40 EDT)
Owner: cl-senior (worker l2t1037). Repair under PROTO-AI-9 (its UI gate is blocked by this).
Deps: PROTO-AI-7 (merged), PROTO-AI-9 (merged UI). Trunk base: `cl/integration-2` @ 85669570.

## Problem (evidence: ../decisions/PROTO-AI-9-recovery-coercion-finding.md)
On the local appliance the model often answers the forced-draft turn with `finish=stop` and no native
tool call. The orchestrator's recovery then recovers the correct `protocol_edit` envelope but wraps it
as `compile_event_graph_draft`, so it matches no dispatch branch and is dropped
("no proposal … no usable draft arguments"). Reproduced 8/8 by replaying
`/home/brad/.hermes/cl/receipts/PROTO-AI-9/2026-10-05_0930/browser-body.json`.

## Goal
A recovered `agent_intent` envelope whose intent is `protocol_edit` must route to the SAME
`protocol_edit` dispatch branch a native tool call reaches, and emit the proposal — identically for
the fast (inline-prose) and slow (second-call) recovery paths. No behaviour change for the other
three intents; no change to propose-never-write.

## Required changes (server/src/ai — mirror the EXISTING pattern, do not invent one)
1. `coerceAgentIntent.ts`: extend `AgentIntentName` with `'protocol_edit'` and add its key signature
   to `INTENT_KEYS` (`protocol_edit: ['ops']`). Keep `inferAgentIntent` deterministic (never guess
   between intents). `isAgentIntentName`/`coerceToAgentIntentArgs` then honour `{intent:'protocol_edit',
   ops}` and infer `protocol_edit` from a bare `{ops:[…]}` envelope.
2. `AgentOrchestrator.ts` slow path (~:1668-1684): apply the SAME coercion the fast path uses —
   when `forceDraftTool`, run the extracted JSON through `coerceToAgentIntentArgs` and wrap the
   recovered call as `AGENT_INTENT_TOOL_NAME` (not `compile_event_graph_draft`); only fall back to
   `COMPILE_EVENT_GRAPH_DRAFT_TOOL_NAME` when `forceDraftTool` is false. On `null` coercion, keep the
   existing "failed to coerce" diagnostic path (do not invoke a tool with unhonourable args).
3. `coerceDraftArgsFromContent` / `DRAFT_ARG_KEYS` (`AgentOrchestrator.ts:738-758`,
   `draftArgDiagnostics.ts:24`): let the FAST path recover a prose `{intent:'protocol_edit', ops:[…]}`
   envelope too. Keep the guard strict — an unrelated prose-JSON blob must still return null. Prefer
   reusing `coerceToAgentIntentArgs` (so the "is this a draft at all" decision lives in one place) over
   widening `DRAFT_ARG_KEYS` by hand; add the minimal key set deliberately and document why.
4. `buildForcedDraftJsonPrompt` (~:760): add the `protocol_edit` case — return ONLY the JSON arguments
   for `agent_intent` with `intent:"protocol_edit"` and `ops:[…]` (cite only stepIds/roleIds from the
   ATTACHED PROTOCOL block; write nothing). Keep the prompt compact (Brad's standing prompt-budget
   ruling).
5. Do NOT touch the protocol_edit dispatch branch (`AgentOrchestrator.ts:1932-1972`) or the schema
   validator; they are correct and already tested.

## Acceptance (RED-first; the worker proves each)
- Unit (vitest, `npm run test:run -w server` scoped to the touched suites):
  - `coerceToAgentIntentArgs({intent:'protocol_edit', ops:[…]})` returns it unchanged;
    `coerceToAgentIntentArgs({ops:[…]})` infers `protocol_edit`; a genuinely ambiguous object still
    returns null; the three existing intents unchanged (existing `coerceAgentIntent.test.ts` green).
  - A prose `{intent:'protocol_edit',ops:[…]}` in `content` is recovered by the fast path as an
    `agent_intent` call; unrelated prose-JSON still returns null.
  - Orchestrator test: a forced-draft turn where the model returns `finish=stop` + degenerate content
    and the second (coercion) call returns a valid protocol_edit envelope ⇒ the turn emits the
    proposal (protocolEdit present) rather than "no usable draft arguments"; and the event-graph
    coercion path is unchanged when the recovered args are `event_graph`-shaped.
- `npm run typecheck -w server`: no NEW errors vs the trunk baseline (34).
- End-to-end proof the worker must capture itself: with the lane stack on :3093/:5193, replay
  `browser-body.json` (or the run page) and show the backend now logs the turn reaching the
  `protocol_edit` branch and returning a schema-valid proposal with 2 ops; and that PRT-4iaey2's
  content sha is UNCHANGED (propose-never-write). Paste the log lines.

## Out of scope
Any change to the model/serving endpoint, the lane AI profile, acceptance criteria, or the UI. The
gate re-run (cl-browser-reviewer) is the ORCHESTRATOR's step after merge.

## Deliverable
Unique report: `.hermes/plans/PROTO-AI-9-recovery-report.wip-l2t1037.md` (the orchestrator promotes the
canonical path after acceptance). Commit on the worktree branch; do not merge (the orchestrator
merges into `cl/integration-2`).
