# Handoff — LANE 2 tick 2026-10-05T11:48 → 12:33 EDT (budget checkpoint)

Campaign: `ai-protocol-edit-and-router` (lane 2 list `~/.hermes/cl/lanes/2/task-list.md`).
Trunk: `cl/integration-2` — HEAD **`bb48b96e`** (advanced this tick from `85669570`). Docs (specs/handoffs/
report) left UNCOMMITTED as usual; no worker is checking HEAD now.

## Outcome
The in-flight AI-9 recovery worker finished; I verified and MERGED its fix. The follow-on UI gate then
ran and returned `VERDICT: fix` — but its evidence is AMBIGUOUS and its two claimed root causes are, on
inspection, BENIGN pre-existing surfaces. Budget expired before I could dispatch the diagnose-then-fix,
so the next action is prepared and recorded, not launched (no dangling worktree left).

## Done + verified + merged (steps 2, 6, 8) — PROTO-AI-9 recovery repair
- Worker `cl-senior` l2t1037 (bash `2402057`) exited **code=0**; commits `9ed7f3ee` (fix) + `81b65994`
  (report). REAL diff (7 files, +292/-9, all `server/src/ai/`) mirrors the existing fast-path pattern;
  no new mechanism; dispatch branch + schema validator untouched; no YAML; no hardcoded policy.
- My own tests: 6 files / **48 PASS**. My own tsc: worktree 44 vs trunk 33 — all +11 are the known
  `src/drafts/*`+`src/sequences/*` lane-exclude symlink artifacts; non-drafts/sequences set IDENTICAL;
  `AgentOrchestrator.ts` 8==8 → zero new owned-file errors.
- MERGED `--no-ff` → **`bb48b96e`** (clean). :3093 tsx --watch auto-reloaded (no YAML, no restart).
- Independent E2E on merged :3093: replay of `browser-body.json` 2/2 → `coerced JSON args after stop as
  agent_intent` → `done protocol_edit success=true ops=2`; SSE `pe:true err:null`; sha UNCHANGED.
- Canonical report promoted `.hermes/plans/PROTO-AI-9-recovery-report.md`.

## UI gate (step 7) — ran, returned `VERDICT: fix` (evidence AMBIGUOUS)
- `cl-browser-reviewer` (bash `2557683`) exited code=0 at 12:25. Receipts
  `receipts/PROTO-AI-9/2026-10-05_1205/` (report.md, trail.json, 10 PNGs).
- It CONFIRMED the merged backend end-to-end (candidate bb48b96e; surface=workspace.deck promptChars
  54309; recovery trace; sha 94e1096b unchanged) — the recovery fix is proven.
- It CLAIMED a UI defect: the Changes panel appears then disappears before Accept lands; page reverts
  to a "pre-fill failed" state; attributes it to the warm-context 400.
- **ORCHESTRATOR FINDING (bounded, in code): both claimed root causes are BENIGN surfaces, not AI-9
  state resets.** (1) "pre-fill failed" is the background-warmup status chip (AiTabPanel.tsx:111-113,
  tooltip "drafting still works, the first request just pays full prefill"). (2) the
  `Inference error 400: No user query found in messages` is the DETACHED background prompt warmer
  (`server/src/ai/warm/*`, `server.ts` warmContext), not the draft turn. The reviewer also self-noted
  "DOM refs changed between the snapshot and the click" — a harness/timing smell. So the fix verdict is
  NOT sufficient evidence of a product defect: (a) harness artifact / (b) real persistence defect /
  (c) out-of-scope. Do NOT accept and do NOT blindly "fix".

## Prepared next action (NOT launched — budget expiry; no dangling worktree)
- Diagnose-then-fix brief: `.hermes/plans/2026-10-05_1229-PROTO-AI-9-ui-persistence-diagnosis.md`
  (also `~/.hermes/cl/lanes/2/fix-PROTO-AI-9-uiDx-20261005T1229.txt`) for `cl-senior` token **l2t1225**:
  reproduce the run-page accept flow with a re-read-then-click discipline; decide (a)/(b)/(c) with
  evidence; fix ONLY a proven in-scope AI-9 wiring defect (RED-first); else report as harness failure /
  out-of-scope blocker. Intended branch `wt/PROTO-AI-9-uiDx-lane2-l2t1225` off `bb48b96e`; report
  `.hermes/plans/PROTO-AI-9-uiDx-report.wip-l2t1225.md`.

## Recovery before idle (step 3) — nothing due
- Cheap gate: 0 due/changed blockers. **AI-11** + **AI-12 §2** byte-UNCHANGED/unsigned → not re-asked.
  **AI-13** dep-gated on AI-12 §4 (needs §2 signature) → not dispatchable. **AI-1…AI-10: done.** Ready
  set otherwise empty. Shared senior endpoint: 0 cl-senior live at exit (reviewer does not hold a slot).

## assumptions: (none new this tick)
- Standing entries unchanged and carried: **AS-PROTO-AI-9-W8**, **AS-PROTO-AI-9-SURFACE-MOUNTED**,
  **AS-PROTO-AI-9-RDEFECT2-PLACEMENT**, **AS-PROTO-AI-9-DRAFTCHANGES-LANE-LOCAL**,
  **AS-PROTO-AI-9-ISOLATED-STACK** — reversible, evidence_debt false.

## Open evidence-debt entries (carry forward)
- **`AS-PROTO-AI-9-W7`** — E2E Accept→apply proof rests on the browser gate. **STILL OPEN:** clears only
  on a receipt showing Accept→apply with sha-before/after evidence on a schema-VALID proposal.
- **`AS-PROTO-AI-12-W1`** — served router artifact is the QAD-Q4_0 quant of LFM2.5-350M (sha256
  `3d10b6ab…`); acceptance-relevant to PROTO-AI-13 → disclose with its digest.

## Baseline facts (updated)
- `cl/integration-2` HEAD **`bb48b96e`**. Server tsc baseline **33**; app tsc baseline **47**.
- Lane AI profile `qwen3.8-thunderbeast` (lane-local; Brad's config byte-identical). Lane stack :3093/:5193
  both 200.
- Pitfall (carried): `cl-lane-stack.sh 2 restart` is BLOCKING — use `background=true`; `status` is safe.
- Observation for the next tick: the background warm-context call logs a 400 ("No user query found in
  messages") on this lane stack — benign for drafting (deferred warmer), but worth a Brad-visible note if
  it keeps appearing; not an AI-9 defect.
