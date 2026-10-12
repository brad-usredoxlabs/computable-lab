# Handoff — LANE 2 tick 2026-10-05T10:30 → 10:55 EDT

Campaign: `ai-protocol-edit-and-router` (lane 2 list `~/.hermes/cl/lanes/2/task-list.md`).
Trunk: `cl/integration-2` — HEAD **`85669570`** (UNCHANGED this tick; docs left UNCOMMITTED on purpose so any
gate checking `rev-parse HEAD == 85669570` still matches).

## Outcome — AI-9 UI gate returned BLOCKED; orchestrator rooted it to a PRODUCT DEFECT; repair dispatched
- **Reconcile (step 2):** the live `cl-browser-reviewer` gate (bash pid `2230971` / hermes `2231114`) was
  reconciled ALIVE and progressing through the tick; it **exited code=0** and its report is
  `receipts/PROTO-AI-9/2026-10-05_0930/report.md` → **`VERDICT: BLOCKED`**. Adopted, not re-dispatched.
- **My own verification of the gate's load-bearing claims (step 6):**
  1. Served candidate confirmed: trunk `85669570`; `:5193` serves the fix (`AiTabPanel.tsx` `systemPromptForViewer("deck")` @144, `ChangesPanel.tsx` `protocolEditDiffFrom` — both >=1).
  2. Backend `.run/backend.log`: real run-page turns send `surface=workspace.deck` with `promptChars` **53300–54309** (~53k), zero `project-details` turns this run → the surface fix holds. **Criteria 4–8 PASS.**
  3. Replayed the reviewer's evidence myself: `precheck-assist-turn.py` (53253 shape) **PASS** (valid protocol_edit, 1–2 ops); `replay-browser-body.py replay` **6/6** of the exact run-page body returned a valid `{intent:protocol_edit, ops:[step_insert afterStepId=step-3, step_delete step-6]}` in the SSE `tool_call` — yet `done` reported `pe:false, "no usable draft arguments"`.

## Root cause (orchestrator-owned, file:line) — a PRODUCT DEFECT in protocol_edit recovery
On the local appliance the forced-draft turn arrives **`finish=stop`, no native tool call** (the code says
the recovery path is the NORMAL path — `AgentOrchestrator.ts:1596-1598`). The recovery's FAST path
(`:1599-1630`) correctly coerces to `agent_intent`; the **SLOW path (second inference call, `:1631-1690`)
wraps the recovered args as `compile_event_graph_draft` unconditionally (`:1675`)** → the recovered
`protocol_edit` call matches no dispatch branch → "no usable draft arguments" / "I ignored `ops`" →
routed `via compile_event_graph_draft`, 0 events. `coerceAgentIntent.ts:17` also never learned the
`protocol_edit` intent (PROTO-AI-7 added it to `submitSuggestionTool.ts:443` only). This is exactly the
failure the codebase's own `coerceAgentIntent.ts:6-9` header documents and fixed in the fast path.
Full evidence: `decisions/PROTO-AI-9-recovery-coercion-finding.md`.

## Action taken (step 3/4/5) — in-scope repair under PROTO-AI-9
- Classified as a **necessary in-scope repair** recorded under the existing task PROTO-AI-9 (mirrors the
  existing fast-path pattern; no change to product intent, domain policy, acceptance criteria, or file
  boundaries). Spec: `.hermes/plans/2026-10-05_1037-PROTO-AI-9-recovery-coercion-fix.md`.
- **Dispatched ONE cl-senior worker:** bash pid `2402057` / hermes python `2402115`, worktree
  `/mnt/vast/home/brad/git/wt/PROTO-AI-9-recovery-lane2-l2t1037` (branch `wt/PROTO-AI-9-recovery-lane2-l2t1037`
  off trunk `85669570`), log `logs/PROTO-AI-9-recovery-l2t1037.log` (0 B, buffered until exit),
  report `.hermes/plans/PROTO-AI-9-recovery-report.wip-l2t1037.md`, prompt
  `/home/brad/.hermes/cl/lanes/2/fix-PROTO-AI-9-recovery-20261005T1037.txt`.
  Worktree verified bootable: node_modules symlinked to the trunk; `coerceAgentIntent.test.ts` 5/5 green.
- Human blockers **AI-11** and **AI-12 §2** byte-UNCHANGED (mtime Oct 4) → **not re-asked**.
- Ready set otherwise empty: AI-1…AI-10 done; AI-11 human-blocked; AI-12 §2 human STOP; AI-13 dep-gated.

## Live at checkpoint (do NOT re-dispatch — adopt next tick)
- **cl-senior recovery worker** bash `2402057` / hermes `2402115`; release condition: `PROTO-AI-9 RECOVERY
  EXITED code=0` in `logs/PROTO-AI-9-recovery-l2t1037.log`. Lane stack `:3093`/`:5193` both 200.
  Shared senior endpoint: one lane-2 senior only (no lane-1 seniors) → well inside 4 slots.

## Next tick first actions
1. Observe `logs/PROTO-AI-9-recovery-l2t1037.log` for `PROTO-AI-9 RECOVERY EXITED code=0` → reconcile →
   open the REAL diff (server/src/ai/) → targeted server suite + `tsc -p server` (baseline 34) → confirm
   `:3093` turns now reach the protocol_edit branch → `git -c core.fileMode=false merge --no-ff` into
   `cl/integration-2` (inspect trunk first) → **re-run `cl-browser-reviewer` vs `:5193`** on the UNCHANGED
   `flowAC/plan.json` acceptance prompt (criteria verbatim). Only then mark AI-9 done.
2. Do NOT re-ask Brad's unchanged human questions (AI-11, AI-12 §2).
3. Secondary (non-blocking, recorded from the gate, NOT acted on): the reviewer noted the UI renders a
   `compile_event_graph_draft · protocol_edit · 1 field: ops` tool line for a turn that produced nothing
   (the salvage path's coerced-args UX) — worth a look once the recovery is honest.

## assumptions: (none new this tick — the finding is a diagnosed defect with reproducible evidence, not an assumption)
- Standing: **AS-PROTO-AI-9-W8** (lane-local AI profile `qwen3.8-thunderbeast`; Brad's config byte-identical),
  **AS-PROTO-AI-9-SURFACE-MOUNTED**, **AS-PROTO-AI-9-RDEFECT2-PLACEMENT**,
  **AS-PROTO-AI-9-DRAFTCHANGES-LANE-LOCAL**, **AS-PROTO-AI-9-ISOLATED-STACK** — all reversible, evidence_debt false.

## Open evidence-debt entries (carry forward)
- **`AS-PROTO-AI-9-W7`** — E2E Accept→apply proof rests on the browser gate. **STILL OPEN:** clears only on a
  receipt showing Accept→apply with sha-before/after evidence on a schema-VALID proposal. The gate now cannot
  even surface a proposal until the recovery repair merges; re-run it against the fixed trunk.
- **`AS-PROTO-AI-12-W1`** — the served router artifact is the QAD-Q4_0 quant of LFM2.5-350M (sha256 `3d10b6ab…`);
  acceptance-relevant to PROTO-AI-13 → disclose with its digest.

## Baseline facts (carried)
- `cl/integration-2` HEAD `85669570` (UNCHANGED). Server tsc baseline 34; app tsc baseline 47.
- Lane AI profile `qwen3.8-thunderbeast` (lane-local; Brad's config byte-identical). Lane stack `:3093`/`:5193` up.
- Pitfall (carried): `cl-lane-stack.sh 2 restart` is BLOCKING — use `background=true`; `status` is safe.
