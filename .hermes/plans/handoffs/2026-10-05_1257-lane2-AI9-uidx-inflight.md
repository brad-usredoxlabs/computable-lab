# Handoff — LANE 2 tick 2026-10-05T12:33 → 12:57 EDT (dispatched; budget checkpoint)

Campaign: `ai-protocol-edit-and-router` (lane 2 list `~/.hermes/cl/lanes/2/task-list.md`).
Trunk: `cl/integration-2` — HEAD **`bb48b96e`** (unchanged this tick; docs left UNCOMMITTED as usual,
no worker is checking HEAD).

## Outcome
The prior tick prepared (but did not launch) an AI-9 **diagnose-then-fix** brief after the UI gate
returned `VERDICT: fix` with AMBIGUOUS evidence. This tick **created the worker worktree, synced it,
and DISPATCHED** that worker. It is live and will outrun this budget; the next tick observes it.

## Reconcile (step 2) — no prior worker alive
- No lane-2 `cl-senior`/`cl-browser-reviewer` process from a previous invocation (only this
  orchestrator tick, an unrelated long-lived `-p orchestrator` and an old `-p architect`, none lane-2).
- Worktrees/artifacts from l2t1037 (recovery) and the earlier AI-9 attempts are idle; nothing to adopt.
- Lane stack :3093/:5193 both HTTP 200. Trunk clean at bb48b96e.

## Recovery before idle (step 3) — cheap gate 0 due/changed
- **PROTO-AI-11** (human) and **PROTO-AI-12 §2** (human) watched artifacts byte-UNCHANGED
  (`decisions/PROTO-AI-11-data-approval.md` mtime Oct 4 16:56; `PROTO-AI-12-prereg-approval.md`
  Oct 4 16:54) → NOT re-asked (silence ≠ approval). **PROTO-AI-13** dep-gated on AI-12 → not dispatchable.
- **PROTO-AI-1…AI-10: done.** Ready work this tick = the prepared AI-9 diagnose-then-fix.

## Dispatched (steps 4,5) — PROTO-AI-9 UI proposal-persistence diagnosis (l2t1225)
- Worktree **`/mnt/vast/home/brad/git/wt/PROTO-AI-9-uiDx-lane2-l2t1225`**, branch
  `wt/PROTO-AI-9-uiDx-lane2-l2t1225` off trunk `bb48b96e` (`HEAD bb48b96e`). node_modules symlinked
  (root/app/server); 124 untracked lane-exclude paths synced (schema copies, src symlinks into the
  live tree); per-worktree `core.excludesFile` set + node_modules appended → `git status` CLEAN.
- Worker **`cl-senior`**: bash pid `2652952` / hermes python **`2653008`** (cwd = the worktree), launched
  background with stdout+stderr → **`logs/PROTO-AI-9-uiDx-l2t1225.log`** (0 B, buffered until exit).
  ONE worker (≤2 lane-2; no lane-1 senior live → 1/4 shared thunderbeast slots used).
- Brief/spec: `.hermes/plans/2026-10-05_1229-PROTO-AI-9-ui-persistence-diagnosis.md`
  (== `~/.hermes/cl/lanes/2/fix-PROTO-AI-9-uiDx-20261005T1229.txt`). Report (unique):
  `.hermes/plans/PROTO-AI-9-uiDx-report.wip-l2t1225.md`.
- Orientation recon: `cl-scout` A + B dispatched 12:37 (spark-4b endpoint healthy `/health ok`);
  logs `logs/scout-uiDx-{A,B}-20261005T1237.log` (still running, buffered at checkpoint — left alive,
  read-only, not blocking). Screening only; not cited as evidence.
- **DO NOT re-dispatch while pid 2653008 is alive.** Release condition: `PROTO-AI-9 UIDX EXITED code=0`
  in the worker log.

## Orchestrator's own grounding (independent, for judging the verdict next tick)
- `sidebarState.ts` (merged): `draft-ready` sets `mode:'reviewing'` with the optional `protocolDiff`;
  `cancel`/`reset` → `initialSidebarState` (ready). Reducer is clean.
- `AiTabPanel.tsx`: proposal stored at `:375-389` (refs + `draft-ready`); **`:599-606`** is a
  candidate reset path — an effect that dispatches `reset` when the OPEN proposal's
  `attachedRecordId !== attachedProtocolId` (`protocolSel?.protocol?.recordId ?? null`). If the run
  page transiently loses/remounts `protocolSel` (or the panel remounts), this — or a full panel
  remount — would clear the review state. The worker must decide (a)/(b)/(c) with real evidence.

## Next tick (prepared, not launched)
- Observe `logs/PROTO-AI-9-uiDx-l2t1225.log` for `PROTO-AI-9 UIDX EXITED code=0`.
- Adopt scouts if they returned; else bounded local inspection.
- Open the REAL diff. If code changed: targeted app suite + app tsc (baseline **47**) → merge `--no-ff`
  into trunk (inspect trunk first) → `cl-browser-reviewer` vs :5193 (criteria verbatim, `flowAC/plan.json`,
  fresh receipts dir). If no code changed: adopt the (a)/(c) diagnosis and re-run the gate with the
  re-read-then-click harness discipline. Then promote report + mark AI-9 done, or write the blocker.

## assumptions: (none new this tick)
- Standing (carried, reversible, `evidence_debt: false`): **AS-PROTO-AI-9-W8**,
  **AS-PROTO-AI-9-SURFACE-MOUNTED**, **AS-PROTO-AI-9-RDEFECT2-PLACEMENT**,
  **AS-PROTO-AI-9-DRAFTCHANGES-LANE-LOCAL**, **AS-PROTO-AI-9-ISOLATED-STACK**.

## Open evidence-debt entries (carry forward)
- **`AS-PROTO-AI-9-W7`** — E2E Accept→apply proof rests on the browser gate. **STILL OPEN:** clears only
  on a receipt showing Accept→apply with sha-before/after evidence on a schema-VALID proposal.
- **`AS-PROTO-AI-12-W1`** — served router artifact is the QAD-Q4_0 quant of LFM2.5-350M (sha256
  `3d10b6ab…`); acceptance-relevant to PROTO-AI-13 → disclose with its digest.

## Baseline facts (updated)
- `cl/integration-2` HEAD **`bb48b96e`**. Server tsc baseline **33**; app tsc baseline **47**.
- Lane AI profile `qwen3.8-thunderbeast` (lane-local; Brad's config byte-identical). Stack :3093/:5193 200.
- Pitfall (carried): `cl-lane-stack.sh 2 restart` is BLOCKING — use `background=true`; `status` is safe.
- Pitfall (new): a bare `git worktree add` for a lane worker on this NFS takes ~8–10 min to populate
  3196 files and WILL exceed a 300s foreground timeout — run it with `background=true` and poll; if it
  is killed mid-checkout the admin dir is missing (`fatal: not a git repository`) → `git worktree prune`
  + `branch -D` + `rm -rf` + retry.
