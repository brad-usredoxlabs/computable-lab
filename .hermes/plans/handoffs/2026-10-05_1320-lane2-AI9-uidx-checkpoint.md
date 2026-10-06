# Handoff — LANE 2 tick 2026-10-05T13:10 → 13:20 EDT (budget checkpoint; worker live)

Campaign: `ai-protocol-edit-and-router` (lane 2 list `~/.hermes/cl/lanes/2/task-list.md`).
Trunk: `cl/integration-2` — HEAD **`bb48b96e`** (unchanged this tick; docs/worktrees left UNCOMMITTED,
no worker is checking HEAD).

## Outcome
No new work dispatched. The prior tick's AI-9 **UI proposal-persistence diagnose-then-fix** worker
(`l2t1225`) is **STILL LIVE and actively streaming**; it will outrun this budget, so this tick
reconciled, adopted the returned scout screening, and **checkpointed**. Next tick observes it.

## Reconcile (step 2) — no dead workers to recover, one live worker to adopt
- **PROTO-AI-9 uiDx worker LIVE:** hermes python **`2653008`**, cwd
  `/mnt/vast/home/brad/git/wt/PROTO-AI-9-uiDx-lane2-l2t1225`, elapsed **~24 min**;
  `~/.hermes/profiles/cl-senior/state.db{,-wal,-shm}` touched <10 min ago → actively streaming.
  Log `logs/PROTO-AI-9-uiDx-l2t1225.log` **0 B** (buffered until exit, expected). Worktree HEAD
  `bb48b96e`, `git status` **CLEAN** (orientation/repro phase; AI-9 precedents ~90 min–2h35m).
  **NOT stalled, NOT killed, NOT re-dispatched.** Release condition: `PROTO-AI-9 UIDX EXITED code=0`.
- No other lane-2 `cl-senior`/`cl-browser-reviewer` process from a previous invocation.
- Lane stack `:3093`/`:5193` both HTTP 200. Trunk clean at `bb48b96e` (only untracked docs).

## Recovery before idle (step 3) — cheap gate 0 due/changed
- **PROTO-AI-11** (human) + **PROTO-AI-12 §2** (human) watched artifacts byte-UNCHANGED → NOT re-asked
  (silence ≠ approval). **PROTO-AI-13** dep-gated on AI-12 → not dispatchable. **AI-1…AI-10 done.**
- Ready set = only the in-flight AI-9 worker. No other executable portion exists.

## Scout screening adopted (step 4) — NOT evidence
- **Scout B RETURNED**: `logs/scout-uiDx-B-20261005T1237.log`. Finding: the `protocol_edit` diff
  **persists** in sidebar state; the ONLY code paths that clear it are **Accept** (`reset`,
  `AiTabPanel.tsx:620-622`), **Reject** (`cancel`, `:699-701`), and the **protocol-swap `useEffect` on
  `attachedProtocolId`** (`:599-606`). Later SSE events (done/cancelled/reset/clear-protocol-candidate)
  do **not** touch `protocolDiff`.
- Orchestrator **independently read `AiTabPanel.tsx:596-606`** (verbatim) — confirms the effect:
  `if (open && open.attachedRecordId !== attachedProtocolId) → reset`. A transient `protocolSel` flap
  (loader remount / re-fetch → `attachedProtocolId` null) WOULD fire `reset` and close the panel.
  **This is the live candidate for case (b).** The worker brief already carries this hint.
- Scout A (pid `2617099`) still running ~35 min, 0 B output — left **ALIVE** (read-only, non-blocking).
- `cl-scout` output is SCREENING only; not cited as evidence. The load-bearing read above is the
  orchestrator's own.

## Next tick (prepared, not launched)
- Observe `logs/PROTO-AI-9-uiDx-l2t1225.log` for `PROTO-AI-9 UIDX EXITED code=0`.
- Open the REAL diff. **If code changed:** targeted app suite + app tsc (baseline **47**) → merge
  `--no-ff` into trunk (inspect trunk first) → `cl-browser-reviewer` vs `:5193` (criteria verbatim,
  `flowAC/plan.json`, fresh receipts dir, re-read-then-click harness discipline). **If no code
  changed:** adopt the (a)/(c) diagnosis and re-run the gate with the hardened harness. Then promote
  the report + mark AI-9 done, or write the blocker.

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
- Lane-2 logs live at `~/.hermes/cl/lanes/2/logs/` (NOT under the trunk worktree).
- Pitfall (carried): `cl-lane-stack.sh 2 restart` is BLOCKING — use `background=true`; `status` is safe.
- Pitfall (new, cost ~10 min this tick): a broad `find` across `/mnt/vast/home/brad/git` on this NFS
  **exceeds a 600s foreground timeout** — never walk the vast tree; list known directories directly.
