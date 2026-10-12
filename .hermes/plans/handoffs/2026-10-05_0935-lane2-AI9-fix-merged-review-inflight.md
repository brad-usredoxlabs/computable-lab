# Handoff — LANE 2 tick 2026-10-05T08:30 → 09:35 EDT (adopt AI-9 fix worker; verified + merged; UI gate re-dispatched)

Campaign: `ai-protocol-edit-and-router` (lane 2 list `~/.hermes/cl/lanes/2/task-list.md`).
Trunk: `cl/integration-2` — HEAD moved `475db486` → **`85669570`** (the PROTO-AI-9 fix merge; clean, no YAML).
**NOTE:** this handoff file is intentionally left UNCOMMITTED so trunk HEAD stays `85669570` — the live
`cl-browser-reviewer` was told to confirm `rev-parse HEAD == 85669570`. Commit it (docs-only) next tick
after the gate reports.

## Outcome — PROTO-AI-9 fix adopted, verified, merged; browser gate in flight
- **Reconcile (step 2):** the PROTO-AI-9 fix worker (bash `1915117` / hermes `1915219`, session
  `20261005_062146_e6f896`) was LIVE at tick start (elapsed 2:08) and **EXITED code=0** at ~09:15 (ran
  ~2h51m). Adopted its completed artifact; **no duplicate worker dispatched.**
- **Verified myself (step 6):** opened the REAL diff — 3 files, +353/-3, all under
  `app/src/event-editor/right-pane/ai/` (`AiTabPanel.tsx` +49, `sidebarState.test.ts` +10, NEW
  `AiTabPanel.runPageSurface.test.tsx` +297). Base `dc180b58` is an ancestor of trunk (three-dot clean).
  - Targeted suites in the worktree: **43/43 PASS** (runPageSurface 7, protocolEdit 7, sidebarState 15,
    ChangesPanel 14).
  - `app` tsc: branch error-file set (24) is a **strict SUBSET** of trunk's (34) → **ZERO new errors**.
  - Diff substance: surface derivation now `editorState !== null ? systemPromptForViewer('deck') :
    <active-tab>`; `activeEventGraphId` falls back to `editorState.eventGraphId`; R-Defect-1 (error
    result → `reset`, no empty review panel) and R-Defect-2 (`!previewActive` → `reset`; bounded
    same-turn reset after commit) in `onApply`. No `schema/`, `lint/`, `server/`, or YAML change.
- **MERGED (step 8):** `git merge --no-ff wt/PROTO-AI-9-lane2-l2t0615` → trunk **`85669570`** (clean).
  No YAML changed → no stack restart needed; `:5193` serves the fix via HMR. Confirmed:
  `curl :5193/src/event-editor/right-pane/ai/AiTabPanel.tsx` shows `systemPromptForViewer("deck")`
  (line 144) and the `editorState?.eventGraphId` fallback (line 197).
- **Criterion 2 (worker trace, own isolated :3095 stack, now deleted):** `surface=workspace.deck`,
  `promptChars=54385`, `protocol_edit success ops=2`; record `PRT-4iaey2` `updatedAt` UNCHANGED
  (propose-never-write proven). Pre-fix contrast on `:3093` = `workspace.project-details` / `31060`.
- **UI gate re-dispatched (step 7):** `cl-browser-reviewer` bash pid **`2230971`**, log
  `logs/PROTO-AI-9-review-surfacefix-20261005T0930.log`, receipts
  `receipts/PROTO-AI-9/2026-10-05_0930/`, prompt `review-PROTO-AI-9-surfacefix-20261005T0930.txt`
  (adds the R-Defect-1/2 probes + the surface/promptChars trace check). **STATUS stays `in-progress`
  until `VERDICT: accept`.**
- Report promoted to canonical `.hermes/plans/PROTO-AI-9-report.md` (from the worker's
  `PROTO-AI-9-report.wip-l2t0615.md`).
- Task list updated under `task-list.lock` (a `# FIX ACCEPTED+MERGED 09:20` note appended to the
  PROTO-AI-9 block). Temp artifacts disposed: `/home/brad/.computable-lab-l2t0615`,
  `/tmp/l2t0615-config.yaml` (secret-bearing), `/tmp/l2t0615-c2-driver.cjs`, `/tmp/{red,green}-l2t0615.txt`
  — all confirmed gone; no ephemeral worker processes remain.
- **Endpoint capacity:** only this lane's reviewer live on the shared endpoints; **no lane-1 senior
  workers live**; spare senior capacity, but **no ready item to use it** (see below).
- Lane stack `:3093` / `:5193` both http=200.

## Ready set (step 3) — nothing else dispatchable
AI-1…AI-10 **done**; AI-11 human-blocked (Brad); AI-12 blocked (§2 signature STOP boundary); AI-13
`todo` but dependency-gated on blocked AI-12 → **not dispatchable**. Human blockers **AI-11**
(`decisions/PROTO-AI-11-data-approval.md`, mtime 2026-10-04 16:56) and **AI-12 §2**
(`decisions/PROTO-AI-12-prereg-approval.md`, mtime 2026-10-04 16:54) are **byte-UNCHANGED → not re-asked.**

## Live at checkpoint (do NOT re-dispatch — adopt next tick)
- **`cl-browser-reviewer` (PROTO-AI-9 UI gate)** bash pid `2230971`; log
  `logs/PROTO-AI-9-review-surfacefix-20261005T0930.log` (0 B until exit); receipts
  `receipts/PROTO-AI-9/2026-10-05_0930/`.

## Next tick first actions
1. Reconcile pid `2230971`; expect `REVIEW EXITED code=0` in the log + a `report.md` in the receipt dir.
2. Read `receipts/PROTO-AI-9/2026-10-05_0930/report.md`:
   - **`VERDICT: accept`** → promote the receipt's outcome into the AI-9 block, mark **done**, commit
     THIS handoff (docs-only) + the receipt notes.
   - **`VERDICT: fix`** → send the defect list (with ABSOLUTE screenshot paths) back to `cl-senior`
     resuming the `9f4bb06c` branch/worktree; re-review. Do not weaken criteria.
   - **`BLOCKED`** → if it is an infra/model-profile failure, keep it `in-progress`/`blocked` with the
     exact status; it is not a product defect.
3. Do NOT re-ask Brad's unchanged human questions (AI-11, AI-12 §2).
4. **Housekeeping (non-blocking, flagged this tick):** the merged trunk's lane-exclude files (e.g.
   `app/src/event-editor/right-pane/ai/draftChanges.ts`) are **symlinks into Brad's live tree**, so a
   from-git worktree/CI cannot build without the lane sync. Decide commit-vs-exclude at campaign
   promotion (see assumptions ledger `AS-PROTO-AI-9-DRAFTCHANGES-LANE-LOCAL`).

## assumptions: (new this tick — appended to `~/.hermes/cl/lanes/2/assumptions.md`)
- **AS-PROTO-AI-9-SURFACE-MOUNTED** — sent surface = `workspace.deck` whenever `editorState !== null`
  (mounted→deck generalized from the architect's run-page condition); pdf/document/other tabs pinned
  byte-identical by control tests. reversible; evidence_debt false.
- **AS-PROTO-AI-9-RDEFECT2-PLACEMENT** — R-Defect-2 enforced in `AiTabPanel.onApply` (`!previewActive`
  → reset) rather than `sidebarReducer` (the reducer cannot see the mounted preview; a `changes.length`
  guard would strand the legitimate labware-only draft). reversible; evidence_debt false.
- **AS-PROTO-AI-9-DRAFTCHANGES-LANE-LOCAL** — `./draftChanges` resolves only via the lane-exclude
  symlink into Brad's live tree; a from-git build fails without the lane sync. reversible;
  evidence_debt false (merge unaffected). cleanup = orchestrator/trunk housekeeping.
- **AS-PROTO-AI-9-ISOLATED-STACK** — criterion-2 trace captured on the worker's own `:3095` stack
  (deleted this tick) because `:5193` restart is BLOCKING; the `:5193` receipt is the gate evidence.
  reversible; evidence_debt false.
- Standing: **AS-PROTO-AI-9-W8** (lane-local AI profile `qwen3.8-thunderbeast`; Brad's config
  byte-identical) still stands.

## Open evidence-debt entries (carry forward)
- **`AS-PROTO-AI-9-W7`** — E2E Accept→apply proof rests on the browser gate. **STILL OPEN:** clears
  only on a receipt showing Accept→apply with sha-before/after evidence on a schema-VALID proposal.
  The live gate (candidate `85669570`) is exactly that attempt.
- **`AS-PROTO-AI-12-W1`** — the served router artifact is the QAD-Q4_0 quant of LFM2.5-350M
  (sha256 `3d10b6ab…`); acceptance-relevant to PROTO-AI-13 → disclose with its digest.

## Baseline facts (carried / updated)
- `cl/integration-2` HEAD **`85669570`**. Server tsc baseline 34; app tsc baseline 47 (trunk error-file
  set measured 34; branch subset 24 → zero new).
- Lane stack `:3093` / `:5193` both http=200. Lane AI profile `qwen3.8-thunderbeast` (lane-local;
  Brad's config byte-identical).
- Other lane-2 tasks unchanged: AI-11 (human/Brad, blocked), AI-12 (§2 signature STOP boundary,
  blocked), AI-13 (dep-gated, todo). AI-1..AI-10 done.
- Pitfall (carried): `cl-lane-stack.sh 2 restart` is BLOCKING — use `background=true`; `status` is safe.
