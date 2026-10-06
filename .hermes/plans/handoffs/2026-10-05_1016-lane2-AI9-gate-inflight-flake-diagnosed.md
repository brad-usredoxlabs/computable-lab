# Handoff — LANE 2 tick 2026-10-05T09:30 → 10:16 EDT (checkpoint: adopt AI-9 UI gate; surface fix independently verified; gate still live, intermittent model flake diagnosed)

Campaign: `ai-protocol-edit-and-router` (lane 2 list `~/.hermes/cl/lanes/2/task-list.md`).
Trunk: `cl/integration-2` — HEAD **`85669570`** (UNCHANGED this tick; the PROTO-AI-9 fix merge).
**NOTE:** this handoff is left UNCOMMITTED so trunk HEAD stays `85669570` — the live `cl-browser-reviewer`
was told to confirm `rev-parse HEAD == 85669570`. Commit the docs-only handoffs next tick AFTER the gate reports.

## Outcome — nothing merged; gate still in flight; the fix's core criterion is orchestrator-verified
- **Reconcile (step 2):** `cl-browser-reviewer` (PROTO-AI-9 UI gate) — bash pid **`2230971`** / hermes python
  `2231114` — **LIVE at tick end (~56 min elapsed, session streaming)**. Log
  `logs/PROTO-AI-9-review-surfacefix-20261005T0930.log` (0 B, buffered until exit); receipts
  `receipts/PROTO-AI-9/2026-10-05_0930/` now contains `flowAC/` (trail.json + 32 shots through 41-11),
  `probe/` (trail.json + shots), `defect1/`, `defect2/` (plan.json), `diag-ab.py`,
  `browser-body.json` + `replay-browser-body.py`. **Adopted; NOT killed, NOT re-dispatched.** No duplicate worker.

## Independent orchestrator verification this tick (step 6 — my own evidence, not the worker's)
1. **The FIX works (surface):** from `:3093` `.run/backend.log`, the run-page turns now report
   `surface=workspace.deck` with `promptChars=54309 / 54429` (~54k) — vs the pre-fix
   `workspace.project-details` / `31060`. This is the whole point of the merged fix; CONFIRMED.
2. **Bounded precheck (mine, 09:32):** `POST /api/ai/assist/stream` — deck surface, PROTO-AI-6
   attached-protocol context built from fixture `PRT-4iaey2`, the exact acceptance prompt —
   **SUCCEEDED**: `protocol_edit` `{step_insert afterStepId=step-3 kind=wash, step_delete stepId=step-6}`.
   Log: `logs/PROTO-AI-9-precheck-20261005T0932.log`. (Reused `precheck-assist-turn.py`; read-only, no write.)
3. **The reviewer's browser draft turns FAIL INTERMITTENTLY — diagnosed as ENDPOINT/MODEL nondeterminism,
   not a UI/code defect.** Failure signature: `turn 1 finish=stop contentLen=41 toolCalls=0` →
   content `"[AgentUI error: message type must be set]"` → server "no proposal … no usable draft arguments"
   (traces d7p577, 5f77ro; probe turn). The reviewer's A/B/C diag (`diag-ab.py`) + **replay of the EXACT
   captured browser body** (`browser-body.json`) **SUCCEEDED** (trace `jmuymu`, `protocol_edit success ops=1`)
   while three sibling attempts (rnws11/tnronp/88ce0b) failed with the same signature → the failure is
   **NOT payload-shape-deterministic**; it is intermittent thunderbeast `qwen3.8-flash-next` serving behaviour
   (the model sometimes returns a message with no usable type → no forced tool call). The active profile IS
   the required lane-local `qwen3.8-thunderbeast` (model string `qwen3.8-flash-next`), `enableThinking:false`
   (verified via `GET /api/config/ai/profiles`).
- In the `flowAC` harness run, **flow A** never surfaced the `changes-panel` (its turn hit the intermittent
  failure; sha stayed `94e1096b…`, 16 steps → propose-never-write held trivially), while **flow C** did produce
  a labware proposal (shots `32-09-labware-proposal.png`, `35-10-labware-accept-clicked.png`,
  `41-11-labware-rail-after-accept.png`). The reviewer is now bisecting/retrying; its final verdict is pending.

## Ready set (step 3) — still nothing else dispatchable
AI-1…AI-10 **done**; AI-11 human-blocked (Brad); AI-12 blocked (§2 signature STOP boundary); AI-13 `todo` but
dependency-gated on blocked AI-12 → not dispatchable. Human blockers **AI-11**
(`decisions/PROTO-AI-11-data-approval.md`) and **AI-12 §2** (`decisions/PROTO-AI-12-prereg-approval.md`) are
**byte-UNCHANGED → not re-asked.** No lane-1 senior worker live; shared senior endpoint free (spare capacity,
but no ready item to use it).

## Live at checkpoint (do NOT re-dispatch — adopt next tick)
- **`cl-browser-reviewer` (PROTO-AI-9 UI gate)** bash pid `2230971` / hermes `2231114`; log
  `logs/PROTO-AI-9-review-surfacefix-20261005T0930.log` (0 B until exit); receipts
  `receipts/PROTO-AI-9/2026-10-05_0930/`. Release condition: `REVIEW EXITED code=0` in the log + `report.md`.
- Lane stack `:3093` / `:5193` both serving (backend `/api/health`=200; frontend=200). Trunk `85669570`.

## Next tick first actions
1. Reconcile pid `2230971`; read `receipts/PROTO-AI-9/2026-10-05_0930/report.md`:
   - **`VERDICT: accept`** → promote outcome into the AI-9 block, mark **done**, commit this + the prior tick's
     handoffs (docs-only — HEAD moves at that point, which is fine once no gate is checking `85669570`).
   - **`VERDICT: fix`** → send the defect list (with ABSOLUTE screenshot paths) back to `cl-senior` resuming the
     `9f4bb06c` branch/worktree; re-review. Do not weaken criteria.
   - **`VERDICT: BLOCKED`** and it names the intermittent model flake → **re-dispatch the gate (fresh run)**:
     the endpoint demonstrably emits valid protocol_edit proposals (my precheck + the reviewer's own `jmuymu`
     replay) and the surface fix is verified, so the executable portion exists. Record it as environment/
     transient, NOT a product defect. If it names a served-code/candidate mismatch → investigate the served
     checkout before re-running.
2. Do NOT re-ask Brad's unchanged human questions (AI-11, AI-12 §2).
3. Housekeeping (non-blocking, carried): merged trunk's lane-exclude files (e.g.
   `app/src/event-editor/right-pane/ai/draftChanges.ts`) are SYMLINKS into Brad's live tree → decide
   commit-vs-exclude at campaign promotion (`AS-PROTO-AI-9-DRAFTCHANGES-LANE-LOCAL`).

## assumptions: (none new this tick — no value was supplied that a source did not provide)
- Standing: **AS-PROTO-AI-9-W8** (lane-local AI profile `qwen3.8-thunderbeast`; Brad's config byte-identical),
  **AS-PROTO-AI-9-SURFACE-MOUNTED**, **AS-PROTO-AI-9-RDEFECT2-PLACEMENT**,
  **AS-PROTO-AI-9-DRAFTCHANGES-LANE-LOCAL**, **AS-PROTO-AI-9-ISOLATED-STACK** — all reversible,
  evidence_debt false. The intermittent-endpoint finding is EVIDENCE, not an assumption.

## Open evidence-debt entries (carry forward)
- **`AS-PROTO-AI-9-W7`** — E2E Accept→apply proof rests on the browser gate. **STILL OPEN:** clears only on a
  receipt showing Accept→apply with sha-before/after evidence on a schema-VALID proposal. The live gate
  (candidate `85669570`) is that attempt; its flow A hit the intermittent model flake this window.
- **`AS-PROTO-AI-12-W1`** — the served router artifact is the QAD-Q4_0 quant of LFM2.5-350M
  (sha256 `3d10b6ab…`); acceptance-relevant to PROTO-AI-13 → disclose with its digest.

## Baseline facts (carried / updated)
- `cl/integration-2` HEAD **`85669570`** (UNCHANGED this tick). Server tsc baseline 34; app tsc baseline 47.
- Lane stack `:3093` / `:5193` up. Lane AI profile `qwen3.8-thunderbeast` (lane-local; Brad's config byte-identical).
- Pitfall (carried): `cl-lane-stack.sh 2 restart` is BLOCKING — use `background=true`; `status` is safe.
