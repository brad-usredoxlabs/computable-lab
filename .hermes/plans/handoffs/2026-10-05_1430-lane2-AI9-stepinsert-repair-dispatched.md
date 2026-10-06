# Handoff — LANE 2 tick 2026-10-05T13:50 → 14:30 EDT (worker completed; arch decision landed; repair dispatched)

Campaign: `ai-protocol-edit-and-router` (lane 2 list `~/.hermes/cl/lanes/2/task-list.md`).
Trunk: `cl/integration-2` — HEAD **`bb48b96e`** (unchanged; docs/specs left UNCOMMITTED as usual, no worker checks HEAD).

## Outcome
The AI-9 **UI proposal-persistence diagnose-then-fix** worker (`l2t1225`) **exited code=0** (~14:03, ran
~1h08m): a **diagnosis, NO app code** (worktree diff `bb48b96e..e8af502a` = the docs report only). I
verified its claims, adopted the diagnosis → found a real out-of-scope contract defect that blocks AI-9's
verbatim acceptance. I **routed it to the architect**, the **decision landed within this tick** (in-scope,
no Brad amendment), and I **dispatched the bounded repair**. AI-9 is `in-progress` with the repair live.

## Reconcile (step 2) — worker completed, adopted
- AI-9 uiDx worker `cl-senior` bash `2652952` / hermes python `2653008` **exited code=0**; log
  `logs/PROTO-AI-9-uiDx-l2t1225.log` ends with `PROTO-AI-9 UIDX EXITED code=0`. Worktree HEAD
  **`e8af502a`**, `git status` clean. Report `.hermes/plans/PROTO-AI-9-uiDx-report.wip-l2t1225.md`.
- No other lane-2 worker alive at start. Scouts A/B returned earlier (SCREENING only, not evidence).
- Lane stack `:3093`/`:5193` both HTTP 200. Trunk clean at `bb48b96e`.

## Verification I performed myself (step 6)
- **Real diff:** `bb48b96e..e8af502a` = ONE added file (the report). No product code, nothing to merge.
- **Refuted the prior gate** by re-reading the gate's OWN `receipts/PROTO-AI-9/2026-10-05_1205/flowA/trail.json`:
  Accept click step 20 **ok**; `awaitPanelClose` FAIL "still mounted 30s"; `assertText` = "REVIEW CHANGES";
  `doubleAcceptCheck` `applyBtn:true,panelGone:false`. The panel did NOT vanish — an apply ERROR the gate
  plan never probed. "pre-fill failed" = benign `WarmIndicator` chip; warm-400 touches only `setWarm`.
- **Source-verified the root cause:** `StepInsertOp` (protocol-edit-op.schema.yaml:170-200, fields only
  label/kind/description/anchor, `unevaluatedProperties:false`) cannot carry payload; `StepWash`
  (protocol.schema.yaml:946-960) requires `[kind,target,wells,cycles]`; prompt `event-graph-agent.md:125`
  mirrors the envelope, kind unrestricted; applier `protocolEditOps.ts` builds `{stepId,label,kind,description?}`.
  → `step_insert kind:wash` is envelope-VALID but UNAPPLIABLE (PUT 422 deterministic, zero write).

## Root blocker → architecture → RESOLVED this tick
- Decision request `decisions/PROTO-AI-9-stepinsert-payload-decision.request.md`; architect log
  `logs/architect-PROTO-AI-9-stepinsert-20261005T1415.log` (bash pid 2786037, exited code=0).
- **Decision artifact `decisions/PROTO-AI-9-stepinsert-payload-decision.md`** (written 14:17): **Option
  (i)** — extend `StepInsertOp` with per-kind payload fields, Ajv enforcing per-kind completeness at
  proposal-validation time, prompt + applier following. Ruled **WITHIN approved intent — no Brad
  amendment** (changes no acceptance criterion / D1-D6 / domain policy; it makes the verbatim-approved
  wash-insert acceptance achievable). Architect also confirmed EVERY kind except `other` is unappliable
  today (not just wash) and flagged the adjacent **StepUpdateOp.kind kind-change gap** as a SEPARATE item.
- Task block: AI-9 `blocked` → `in-progress`, blocker fields CLEARED; repair recorded under AI-9 as an
  in-scope repair (persistence §Decision routing 3).

## Repair DISPATCHED (steps 4,5) — token l2t1420, ONE cl-senior worker
- Spec `.hermes/plans/2026-10-05_1420-PROTO-AI-9-stepinsert-payload-fix.md`.
- One background job (worktree add + sync + launch): bash pid **`2803830`** — now the live worker
  (`cl-senior`, cl-senior state.db-wal mtime 14:29 advancing = streaming). Worktree
  `/mnt/vast/home/brad/git/wt/PROTO-AI-9-stepinsert-lane2-l2t1420` (branch
  `wt/PROTO-AI-9-stepinsert-lane2-l2t1420`, HEAD `bb48b96e`; node_modules symlinked; lane-exclude paths
  synced; excludes file `~/.hermes/cl/lanes/2/lane-exclude-stepinsert-l2t1420`). Log
  `logs/PROTO-AI-9-stepinsert-l2t1420.log` (setup done 14:26, worker launched). Report (UNIQUE)
  `.hermes/plans/PROTO-AI-9-stepinsert-report.wip-l2t1420.md`.
- ONE worker (≤2 lane-2; no lane-1 senior live → well under the shared 4-slot cap). **DO NOT re-dispatch
  while pid 2803830 is alive.** Release condition: `PROTO-AI-9 STEPINSERT EXITED code=0`.

## Next tick (prepared, not launched)
1. Observe `logs/PROTO-AI-9-stepinsert-l2t1420.log` for `PROTO-AI-9 STEPINSERT EXITED code=0`.
2. Open the REAL diff → targeted server+app suites + tsc (baselines server 33, app 47) → verify the
   envelope ACCEPTS a complete `step_insert kind:wash {label,kind,afterStepId,target,wells,cycles}` and
   REJECTS one missing a required payload field with a field-level path → merge `--no-ff` into trunk
   (inspect trunk first).
3. `cl-lane-stack.sh 2 restart` (YAML change; BLOCKING → `background=true`), then re-run
   `cl-browser-reviewer` vs `:5193` with the verbatim wash flow ("add a wash step after step 3 and delete
   the redundant centrifuge step" on PRT-4iaey2), criteria = spec §Acceptance, plan probes
   `.changes-panel__apply-error` after Accept, baseline sha `40cb6866` (labwareRoles=4). VERDICT: accept
   → mark AI-9 done + promote report; fix → defect list (abs shot paths) to the SAME worker.
4. Track the architect's flagged **StepUpdateOp.kind kind-change gap** as its own later decision/task.
5. Human blockers AI-11 / AI-12 §2 remain `on-change` (md5 unchanged) → not re-asked.

## assumptions: (none new this tick)
- Standing (carried, reversible, `evidence_debt: false`): **AS-PROTO-AI-9-W8**,
  **AS-PROTO-AI-9-SURFACE-MOUNTED**, **AS-PROTO-AI-9-RDEFECT2-PLACEMENT**,
  **AS-PROTO-AI-9-DRAFTCHANGES-LANE-LOCAL**, **AS-PROTO-AI-9-ISOLATED-STACK**.
- Fixture note (lane-local TEST DATA, not an assumption): lane store `PRT-4iaey2` now at sha
  `40cb6866…`, labwareRoles=4, steps=16 (from the earlier Flow C2 accept). Brad's tree, `:3001/:5174` untouched.

## Open evidence-debt entries (carry forward)
- **`AS-PROTO-AI-9-W7`** — E2E Accept→apply proof rests on the browser gate. **STILL OPEN:** clears only
  on a `cl-browser-reviewer` receipt showing Accept→apply with sha-before/after on a schema-VALID proposal.
- **`AS-PROTO-AI-12-W1`** — served router artifact is the QAD-Q4_0 quant of LFM2.5-350M (sha256
  `3d10b6ab…`); acceptance-relevant to PROTO-AI-13 → disclose with its digest.

## Baseline facts
- `cl/integration-2` HEAD **`bb48b96e`**. Server tsc baseline **33**; app tsc baseline **47**.
- Lane AI profile `qwen3.8-thunderbeast` (lane-local; Brad's config byte-identical). Stack `:3093`/`:5193` 200.
- Lane-2 logs live at `~/.hermes/cl/lanes/2/logs/` (NOT under the trunk worktree).
- Pitfall (carried): `cl-lane-stack.sh 2 restart` is BLOCKING — use `background=true`; `status` is safe.
- Pitfall (carried): a bare `git worktree add` on this NFS needs ~7–10 min for 3196 files; a mid-checkout
  kill leaves no admin dir → `git worktree prune` + `branch -D` + `rm -rf` + retry.
