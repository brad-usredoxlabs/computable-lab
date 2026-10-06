# Handoff — LANE 2 tick 2026-10-05T11:10 → 11:42 EDT

Campaign: `ai-protocol-edit-and-router` (lane 2 list `~/.hermes/cl/lanes/2/task-list.md`).
Trunk: `cl/integration-2` — HEAD **`85669570`** (UNCHANGED this tick; docs left UNCOMMITTED so any gate
checking `rev-parse HEAD == 85669570` still matches, and the in-flight worker's branch base stays valid).

## Outcome — no new dispatch; adopted the in-flight AI-9 recovery worker and verified it is progressing
Everything else in the lane is externally blocked or dependency-gated, so this tick's work is
reconciliation + observation of the ONE live item, plus ready-to-verify prep.

## Reconcile (step 2) — the only in-progress item
- **PROTO-AI-9 recovery repair (cl-senior, token l2t1037):** bash pid **`2402057`** / hermes python
  **`2402115`** — **ALIVE and progressing** through every check this tick:
  - elapsed ~21 min at first check → **~48 min** at the 11:37 check; `cl-senior/state.db-wal` mtime
    advanced on each sample (11:04 → 11:10 → 11:17 → 11:28 → **11:37:04**) = actively streaming.
  - worktree `/mnt/vast/home/brad/git/wt/PROTO-AI-9-recovery-lane2-l2t1037` HEAD **`85669570`** (== trunk
    == branch base; three-dot diff clean). Phase ADVANCED during the tick: clean at 11:18 → **RED tests
    written at ~11:37**, TWO tracked files modified — `server/src/ai/coerceAgentIntent.test.ts` and
    `server/src/ai/coerceDraftArgs.test.ts` (exactly the suites the spec names).
  - log `logs/PROTO-AI-9-recovery-l2t1037.log` still **0 B** (redirected stdout, buffered until exit —
    expected; the orchestrator's only observability is the process + worktree + state.db).
  - **NOT stalled, NOT killed, NOT re-dispatched.** Release condition: `PROTO-AI-9 RECOVERY EXITED code=0`
    appended to the log.
- No other in-progress worker anywhere: no lane-1 cl-senior live (endpoint **1/4 slots** used by this
  lane's one worker); no scouts/reviewers live.

## Recovery before idle (step 3) — nothing due
- The cheap gate reported 0 due/changed blockers. Independently confirmed: **AI-11**
  (`decisions/PROTO-AI-11-data-approval.md`) and **AI-12 §2** (`decisions/PROTO-AI-12-prereg-approval.md`)
  are byte-UNCHANGED/unsigned (mtime Oct 4) → **not re-asked** (unchanged human questions).
- **AI-13** (`todo`, `deps: PROTO-AI-12`) is dependency-gated on AI-12's §4 shadow evidence, which requires
  Brad's §2 signature → not dispatchable. **AI-1…AI-10: done.** Ready set is empty apart from the live item.

## Ready-to-verify prep done this tick (read-only, orchestrator)
So the next tick can accept/merge fast, I opened the actual code the fix touches and confirmed the root
cause end-to-end against trunk `85669570`:
- `server/src/ai/coerceAgentIntent.ts` — `AgentIntentName` at :17 lacks `protocol_edit`; `INTENT_KEYS`
  (:19) has no `ops` entry → `coerceToAgentIntentArgs` returns null for a `{intent:'protocol_edit',ops}`
  envelope. Fix point 1 confirmed exact.
- `server/src/ai/AgentOrchestrator.ts` — fast path :1607-1613 already does
  `forceDraftTool ? coerceToAgentIntentArgs(...)` + `AGENT_INTENT_TOOL_NAME`; the SLOW path :1669-1678 wraps
  the recovered args as `COMPILE_EVENT_GRAPH_DRAFT_TOOL_NAME` **unconditionally** (:1675) → recovered
  `protocol_edit` matches no branch. Fix point 2 confirmed exact. (Note: the slow block at :1631-1691 is
  nested inside the `forceDraftTool && !isDocDiscussionTurn` guard at :1592, i.e. `forceDraftTool` is
  always true there — the spec's "fall back to compile only when forceDraftTool is false" is
  vacuously satisfied inside that block.)
- `coerceDraftArgsFromContent` :738-758 requires a `DRAFT_ARG_KEYS` key (:756) → the FAST path can never
  recover a prose `{intent,ops}` envelope today; `buildForcedDraftJsonPrompt` :760 documents only
  event_graph/deck_layout/labware. Fix points 3-4 confirmed exact.

## Verification plan for the next tick (when the worker exits code=0)
1. Open the REAL diff (`server/src/ai/` only; expect `coerceAgentIntent.ts`, `AgentOrchestrator.ts`,
   `coerceAgentIntent.test.ts`, `coerceDraftArgs.test.ts` + maybe an orchestrator suite).
2. Run targeted vitest in the worker's worktree: `coerceAgentIntent` + `coerceDraftArgs` + the
   protocol_edit orchestrator suite; then `npm run typecheck -w server` (baseline **34**).
3. Independent E2E: replay `receipts/PROTO-AI-9/2026-10-05_0930/replay-browser-body.py replay` against
   `:3093`, grep `.run/backend.log` for the turn reaching the protocol_edit branch with a schema-valid
   2-op proposal, and `curl -s http://localhost:3093/api/records/PRT-4iaey2` sha UNCHANGED
   (propose-never-write).
4. `git -c core.fileMode=false merge --no-ff wt/PROTO-AI-9-recovery-lane2-l2t1037` into `cl/integration-2`
   (inspect the trunk first; it may have moved).
5. Re-run `cl-browser-reviewer` vs `:5193` on the UNCHANGED `flowAC/plan.json` acceptance prompt
   (criteria verbatim, receipts dir `receipts/PROTO-AI-9/<ts>/`). Only then mark **AI-9 done** and
   promote the canonical report.

## Live at checkpoint (do NOT re-dispatch — adopt next tick)
- **cl-senior recovery worker** bash `2402057` / hermes `2402115`, worktree
  `wt/PROTO-AI-9-recovery-lane2-l2t1037` (HEAD `85669570`), log `logs/PROTO-AI-9-recovery-l2t1037.log`
  (0 B, buffered), report `.hermes/plans/PROTO-AI-9-recovery-report.wip-l2t1037.md`.
- Lane stack `:3093`/`:5193` both **200**. Shared senior endpoint: **1/4 slots** (this lane only).
- Human blockers **AI-11** + **AI-12 §2** unchanged → not re-asked.

## assumptions: (none new this tick — the recovery item is a diagnosed defect with reproducible evidence, not an assumption)
- Standing entries unchanged and carried: **AS-PROTO-AI-9-W8** (lane-local AI profile
  `qwen3.8-thunderbeast`; Brad's config byte-identical), **AS-PROTO-AI-9-SURFACE-MOUNTED**,
  **AS-PROTO-AI-9-RDEFECT2-PLACEMENT**, **AS-PROTO-AI-9-DRAFTCHANGES-LANE-LOCAL**,
  **AS-PROTO-AI-9-ISOLATED-STACK** — all reversible, evidence_debt false.

## Open evidence-debt entries (carry forward)
- **`AS-PROTO-AI-9-W7`** — E2E Accept→apply proof rests on the browser gate. **STILL OPEN:** clears only on
  a receipt showing Accept→apply with sha-before/after evidence on a schema-VALID proposal. The recovery
  repair must merge first; re-run the gate against the fixed trunk.
- **`AS-PROTO-AI-12-W1`** — the served router artifact is the QAD-Q4_0 quant of LFM2.5-350M (sha256
  `3d10b6ab…`); acceptance-relevant to PROTO-AI-13 → disclose with its digest.

## Baseline facts (carried)
- `cl/integration-2` HEAD `85669570` (UNCHANGED). Server tsc baseline **34**; app tsc baseline **47**.
- Lane AI profile `qwen3.8-thunderbeast` (lane-local; Brad's config byte-identical). Lane stack up.
- Pitfall (carried): `cl-lane-stack.sh 2 restart` is BLOCKING — use `background=true`; `status` is safe.
