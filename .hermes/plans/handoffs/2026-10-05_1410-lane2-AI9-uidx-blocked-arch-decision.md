# Handoff — LANE 2 tick 2026-10-05T13:50 → 14:10 EDT (worker completed; AI-9 now blocked on an architectural decision)

Campaign: `ai-protocol-edit-and-router` (lane 2 list `~/.hermes/cl/lanes/2/task-list.md`).
Trunk: `cl/integration-2` — HEAD **`bb48b96e`** (unchanged; docs/specs left UNCOMMITTED as usual, no worker checks HEAD).

## Outcome
The AI-9 **UI proposal-persistence diagnose-then-fix** worker (`l2t1225`) **exited code=0** (~14:03, ran
~1h08m). Its deliverable is a **diagnosis, NO app code** (worktree diff `bb48b96e..e8af502a` = the docs
report only, 1 file +190). I verified its core claims myself and **adopted** the diagnosis:
- The prior UI gate's `VERDICT: fix` is **REFUTED** (see below).
- The real residual failure is an **out-of-scope schema-contract defect** that makes AI-9's own
  acceptance criterion unachievable → **AI-9 status `in-progress` → `blocked`**, routed to `architect`.

## Reconcile (step 2) — worker completed, adopted
- AI-9 uiDx worker `cl-senior` bash pid `2652952` / hermes python `2653008` **exited code=0**; log
  `logs/PROTO-AI-9-uiDx-l2t1225.log` (2442 B) ends with `PROTO-AI-9 UIDX EXITED code=0`. Worktree
  `wt/PROTO-AI-9-uiDx-lane2-l2t1225` HEAD **`e8af502a`**, `git status` clean. Report
  `.hermes/plans/PROTO-AI-9-uiDx-report.wip-l2t1225.md`. No dead worker left to recover.
- No other lane-2 senior/browser process from a prior invocation. Scouts A/B returned earlier (both
  SCREENING only, not evidence; A's log `logs/scout-uiDx-A-20261005T1237.log` = the full sidebarState
  clear-path table — consistent with the worker's finding that only Accept/Reject/protocol-swap clear
  `protocolDiff`).
- Lane stack `:3093`/`:5193` both HTTP 200. Trunk clean at `bb48b96e`.

## Verification I performed myself (step 6)
- **Real diff:** `git -c core.fileMode=false diff --name-status bb48b96e..e8af502a` = ONE added file, the
  report. No product code, nothing to merge. Base `bb48b96e` == trunk → three-dot clean.
- **Read the report** and **re-read the prior gate's own trail**
  (`receipts/PROTO-AI-9/2026-10-05_1205/flowA/trail.json`): Accept click step 20 **ok**; `awaitPanelClose`
  FAIL "still mounted after 30000ms"; `assertText` got "REVIEW CHANGES"; `doubleAcceptCheck`
  `applyBtn:true, panelGone:false`. So the panel did NOT disappear — an apply ERROR the gate plan never
  probed (no `.changes-panel__apply-error` probe). "pre-fill failed" = the benign `WarmIndicator` chip
  (AiTabPanel.tsx ~:106-115). The warm-context 400 (`server/src/ai/warm/*`) touches only `setWarm`.
- **Source-verified the root cause** (load-bearing, not taken from the worker):
  `protocol-edit-op.schema.yaml:170-200` `StepInsertOp` (required `[op,label,kind]`,
  `unevaluatedProperties:false`, fields only label/kind/description/anchor) vs `protocol.schema.yaml:949`
  `StepWash` (required `[kind,target,wells,cycles]`); prompt `event-graph-agent.md:125` mirrors the
  envelope and does not restrict `kind`; applier `protocolEditOps.ts` builds the step from
  {stepId,label,kind,description?} only. → a `step_insert kind:wash` is envelope-VALID but UNAPPLIABLE
  (PUT 422 deterministic, zero write).

## Root blocker (architecture) — routed to `architect`
AI-9's acceptance criterion verbatim ("add a wash step after step 3 … **Accept → rail renumbers, sha
advances once**") cannot be met: the inserted wash step validates against no `protocol.schema.yaml` kind
payload, so the apply PUT 422s (`/steps/3: Missing required property: target … wells … cycles`;
RecordHandlers.ts:580). This spans PROTO-AI-2 (envelope vocabulary) / PROTO-AI-6 (prompt) / PROTO-AI-8
(applier) + `protocol.schema.yaml`. The coder correctly STOPPED (schema YAML is outside its scope; forcing
`kind:'other'` would launder a real wash step into schema-mush — forbidden).
- Decision request: `decisions/PROTO-AI-9-stepinsert-payload-decision.request.md`.
- **Decision artifact (watched):** `decisions/PROTO-AI-9-stepinsert-payload-decision.md` (not yet written).
- Architect log `logs/architect-PROTO-AI-9-stepinsert-20261005T1415.log`; architect **bash pid `2786037`
  LIVE** at checkpoint.
- Task fields updated under `task-list.lock`: AI-9 `blocked`, `blocker_kind: architecture`,
  `blocker_owner: architect`, `blocker_next_check: on-change`, watch = the decision artifact.

## What is proven about AI-9 code (not the gate's verdict)
The worker's 3 harness runs (receipts `receipts/PROTO-AI-9/2026-10-05_uidx-l2t1225/`): Flow A2 proposal
PERSISTS, sha `94e1096b` UNCHANGED pre-accept; Flow B2 Reject → panel closed, sha UNCHANGED; Flow C2
labware-role Accept → sha `94e1096b` → `40cb6866` **EXACTLY ONCE**, labwareRoles 3→4, panel closed, input
ready. 4 unit suites / 52 tests PASS at `bb48b96e`. This is coder evidence; it is **not** a substitute for
the `cl-browser-reviewer` gate (see AS-PROTO-AI-9-W7).

## Next tick (prepared, not launched)
1. Read the architect decision `decisions/PROTO-AI-9-stepinsert-payload-decision.md`.
   - If it names an IN-SCOPE change: write the spec, dispatch the bounded schema/prompt/applier change
     (cl-senior), verify, merge `--no-ff`.
   - If a Brad amendment is required: record one concrete question + watch artifact; do NOT implement.
2. Then re-run `cl-browser-reviewer` vs `:5193` with a plan that probes `.changes-panel__apply-error`
   after Accept and baselines sha `40cb6866` (labwareRoles=4); criteria verbatim; fresh receipts dir.
   Only then mark AI-9 done (or record the precise blocker).
3. Human blockers AI-11 / AI-12 §2 remain `on-change` (md5 unchanged) → not re-asked.

## assumptions: (none new this tick)
- Standing (carried, reversible, `evidence_debt: false`): **AS-PROTO-AI-9-W8**,
  **AS-PROTO-AI-9-SURFACE-MOUNTED**, **AS-PROTO-AI-9-RDEFECT2-PLACEMENT**,
  **AS-PROTO-AI-9-DRAFTCHANGES-LANE-LOCAL**, **AS-PROTO-AI-9-ISOLATED-STACK**.
- Fixture note (lane-local TEST DATA, not an assumption): the lane store's `PRT-4iaey2` is now at sha
  `40cb6866…`, labwareRoles=4, steps=16 (Flow C2 accept). Brad's tree and `:3001/:5174` untouched.

## Open evidence-debt entries (carry forward)
- **`AS-PROTO-AI-9-W7`** — E2E Accept→apply proof rests on the browser gate. **STILL OPEN:** clears only
  on a `cl-browser-reviewer` receipt showing Accept→apply with sha-before/after on a schema-VALID proposal
  in the real gate (the coder's Flow C2 is suggestive, not the gate).
- **`AS-PROTO-AI-12-W1`** — served router artifact is the QAD-Q4_0 quant of LFM2.5-350M (sha256
  `3d10b6ab…`); acceptance-relevant to PROTO-AI-13 → disclose with its digest.

## Baseline facts
- `cl/integration-2` HEAD **`bb48b96e`**. Server tsc baseline **33**; app tsc baseline **47**.
- Lane AI profile `qwen3.8-thunderbeast` (lane-local; Brad's config byte-identical). Stack `:3093`/`:5193` 200.
- Lane-2 logs live at `~/.hermes/cl/lanes/2/logs/` (NOT under the trunk worktree).
- Pitfall (carried): `cl-lane-stack.sh 2 restart` is BLOCKING — use `background=true`; `status` is safe.
- Pitfall (carried): a bare `git worktree add` on this NFS needs ~8–10 min for 3196 files; a mid-checkout
  kill leaves no admin dir → `git worktree prune` + `branch -D` + `rm -rf` + retry.
