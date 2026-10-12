# Handoff — LANE 2 tick 2026-10-05T05:50 → 06:35 EDT (PROTO-AI-9 architect decision adopted; bounded fix dispatched)

Campaign: `ai-protocol-edit-and-router` (lane 2 list `~/.hermes/cl/lanes/2/task-list.md`).
Trunk: `cl/integration-2` — HEAD at tick start **`dc180b58`**. No product code changed this tick; no
merge performed. This tick's commits are docs only (this handoff + the fix spec).

## Outcome this tick
- **Reconciled (step 2):** the `architect` process from the prior tick was LIVE and progressing
  (bash pid `1779262` / hermes python `1779318`; `state.db-wal` mtime advancing). I observed it, did
  NOT re-dispatch. No lane-2 `cl-senior` worker was live; lane stack `:3093`/`:5193` both http 200.
- **Completed the blocker's declared `blocker_independent_work`** (read-only, myself): diagnosed
  **R-Defect-1 / R-Defect-2** and proved by git blame they are PRE-EXISTING event-graph review wiring,
  NOT in AI-9's diff. Evidence artifact:
  `/home/brad/.hermes/cl/lanes/2/decisions/PROTO-AI-9-rdefect-scope-finding.md`. Key cites:
  `AiTabPanel.tsx:369-385` from `72347f3bb` (2026-07-31) / `215138b3c` (2026-09-20);
  `sidebarState.ts` `committing` + `Applying…` + `isChatEnabled` from `1a461e200` (2026-07-31);
  `ChangesPanel.tsx:78-87,102` protocol-mode guards are protocol-mode-only and unreached on this path.
- **Adopted the architect decision** (`decisions/PROTO-AI-9-surface-context-decision.md`, written
  06:13 EDT): **option (d) — a PRODUCT WIRING FIX INSIDE the campaign's approved intent; NO Brad
  amendment required.** The run-page chat pane must send surface `workspace.deck` while its deck editor
  is mounted (`editorState !== null`), instead of the active-tab surface `workspace.project-details`.
  I independently verified the decision's load-bearing claims in the served checkout:
  `setProtocol(` is called ONLY at `RunProtocolStepsLoader.tsx:134,167` (exhaustive grep; no other
  non-test caller) → no fixture route can carry the attached-protocol block; `AiTabPanel.tsx:484`
  `hasDeckEditor = editorState !== null`; `:209-210` `activeEventGraphId` is gated on
  `activeTab.kind === 'deck'` (null on the run page). The architect folded R-Defect-1/2 into the same
  bounded change (§4 disposition), concurring with my blame finding.
- **Wrote the fix spec** `.hermes/plans/2026-10-05_0615-PROTO-AI-9-run-page-surface-fix.md`
  (§1 surface derivation + activeEventGraphId fallback; §2 R-Defect-1/2; acceptance criteria; owned
  files; unique worker paths).
- **Dispatched ONE `cl-senior`** (≤2 lane-2; no lane-1 senior live): bash pid `1915117` / hermes
  python `1915219`, worktree `wt/PROTO-AI-9-lane2-l2t0615` (off trunk `dc180b58`), log
  `logs/PROTO-AI-9-l2t0615.log`, report `.hermes/plans/PROTO-AI-9-report.wip-l2t0615.md`.
  **Do NOT re-dispatch while pid `1915117` is alive.**
- **Observation recon:** 3 `cl-scout` dispatched 06:13 (logs `logs/scout-ai9fix-{A,B,C}-*.log`).
  Scout B returned (screening only — corroborated the orchestrator's own reads); A and C still
  running at checkpoint. Their output is screening, not evidence.
- **Task list updated under `task-list.lock`:** PROTO-AI-9 `status: blocked → in-progress`, blocker
  fields CLEARED (decision recorded), decision + dispatch note appended.

## Live at checkpoint (do NOT re-dispatch — adopt next tick)
- **`cl-senior` (PROTO-AI-9 fix)** bash pid `1915117` / hermes `1915219`. Log
  `logs/PROTO-AI-9-l2t0615.log` (buffered to 0 B until exit). Report
  `.hermes/plans/PROTO-AI-9-report.wip-l2t0615.md`.
- **`cl-scout` A + C** — logs `logs/scout-ai9fix-A-061358.log`, `logs/scout-ai9fix-C-061358.log`.
- The architect (`1779262`) delivered its artifact at 06:13 and was finalizing; it is done.

## Next tick first actions
1. Reconcile pid `1915117`; expect `PROTO-AI-9 FIX EXITED code=0` in the log.
2. Open the REAL diff (expect only `AiTabPanel.tsx`, `sidebarState.ts` + tests). Run the targeted app
   suite and app tsc; require ZERO new failing files / ZERO new tsc errors vs the trunk baseline
   (app tsc baseline **47**).
3. Verify acceptance criterion 2 by BACKEND TRACE: a UI turn on `/runs/RUN-2026-09-19-run-vwr8` must
   show `surface=workspace.deck` and promptChars ≈ 53k (precheck `o112d1` shape), not
   `workspace.project-details` / ~31k. If not demonstrated, the fix is incomplete — do not accept.
4. Merge `--no-ff` into trunk (inspect the trunk first; it may have moved), restart the lane stack if
   any YAML changed (none expected), then dispatch `cl-browser-reviewer` vs `:5193` re-running
   `flowAC/plan.json` UNCHANGED; criteria = spec §Acceptance 4. VERDICT: accept is the gate.
5. Do NOT re-ask Brad's unchanged human questions: `decisions/PROTO-AI-11-data-approval.md`,
   `decisions/PROTO-AI-12-prereg-approval.md` (both UNCHANGED).

## assumptions:
- No new consequential assumptions this tick. Every claim is measured (process identity, `state.db-wal`
  mtimess, git blame, exhaustive `setProtocol(` grep, file:line reads) or quoted from the architect
  artifact. `AS-PROTO-AI-9-W8` (lane-local profile switch) still stands.

## Open evidence-debt entries (carry forward)
- **`AS-PROTO-AI-9-W7`** — E2E Accept→apply proof rests on the PROTO-AI-9 browser gate. STILL OPEN:
  cleared only on a receipt showing Accept→apply with sha-before/after evidence on a schema-VALID
  proposal. The 06:15 fix is aimed at finally producing that valid proposal through the UI.
- **`AS-PROTO-AI-12-W1`** — the served router artifact is the QAD-Q4_0 quant of LFM2.5-350M
  (sha256 `3d10b6ab…`); acceptance-relevant to PROTO-AI-13 → disclose with its digest.

## Baseline facts (carried / updated)
- `cl/integration-2` HEAD `dc180b58`. Server tsc baseline 34; app tsc baseline 47.
- Lane stack `:3093` / `:5193` both http=200. Lane AI profile `qwen3.8-thunderbeast` (lane-local;
  Brad's config byte-identical). New worktree `wt/PROTO-AI-9-lane2-l2t0615` @ `dc180b58`.
- Other lane-2 tasks unchanged: AI-11 (human/Brad, blocked), AI-12 (§2 signature STOP boundary,
  blocked), AI-13 (dep-gated, todo). AI-1..AI-8, AI-10 done.
- Pitfall (carried): `cl-lane-stack.sh 2 restart` is BLOCKING — use `background=true`; `status` is safe.
