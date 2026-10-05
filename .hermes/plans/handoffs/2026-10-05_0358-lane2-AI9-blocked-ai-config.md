# Handoff — LANE 2 tick 2026-10-05T02:50 → 04:00 EDT (AI-9 UI gate → BLOCKED; product AI-config defect found)

Campaign: `ai-protocol-edit-and-router` (lane 2 list `~/.hermes/cl/lanes/2/task-list.md`).
Trunk: `cl/integration-2` — HEAD unchanged this tick: **`4086d619`** (checkpoint atop the AI-9 merge `b5b1948a`). No new commits this tick.

## Outcome this tick
- **Reconciled (step 2):** the ONE in-progress item was PROTO-AI-9. Its `cl-browser-reviewer` (bash pid 1464468 /
  hermes pid 1464563, session `20261005_022942_3dea43`) was **LIVE and progressing** at tick start (137 msgs/75 calls);
  adopted and polled — NOT re-dispatched. It ran the full two/three-flow Playwright+vision harness and **exited code=0**
  at 03:35, writing `report.md` (9160 B) + `trail.json` (47 KB) + per-flow shots.
- **VERDICT: blocked** (`receipts/PROTO-AI-9/2026-10-05_0218/report.md`). The served candidate was confirmed
  (`b5b1948a`; curl of the `:5193` `ChangesPanel.tsx` module returns `protocolEditDiffFrom`). Three model-independent
  criteria **PASSED**: propose-never-write (record `PRT-4iaey2` sha `94e1096b…` invariant across before/after/error/apply/discard
  GETs), sidebar never stuck `interpreting`, event-graph review byte-unchanged. The four protocol-mode criteria are
  **untestable** because the AI turn never emits a `protocol_edit` proposal.
- **Root-caused the blocker MYSELF (did not take the reviewer's word, step 6/recovery):** the AI draft (forced tool) turn
  returns **HTTP 400** on the active profile `qwen3.8-flash-OR` (OpenRouter → Alibaba):
  *"tool_choice does not support being set to required or object in thinking mode."* It kills **every** intent (even prompt
  warmup) — see lane `.run/backend.log` (traceIds 709wbl, uqvozw, qakafh, …) **and Brad's LIVE log**
  (`/mnt/vast/home/brad/git/computable-lab/.run/backend.log`, same 400 on `qwen/qwen3.8-flash`; its one `success:true` is on
  `qwen3.6-35b-a3b`). ⇒ **product-wide, not lane-specific.**
- **Proved the fix with a direct OpenRouter probe** (`~/.hermes/cl/lanes/2/probe-or-toolchoice.sh`, model `qwen/qwen3.8-flash`,
  tools + `tool_choice:{type:function,…}`): **A** current app shape → **400**; **B** `+reasoning:{enabled:false}` → **200 with
  tool_calls**; **C** `+chat_template_kwargs.enable_thinking=false` → **400**. Code seam `server/src/ai/InferenceClient.ts:78-86`
  forwards the app's thinking flag as the **local-server** `chat_template_kwargs.enable_thinking`, which OpenRouter ignores.
  Every local profile sets `enableThinking:false`; the OR profile omits it (thinking defaults ON). `config.yaml` is **untracked
  and byte-identical** to Brad's live copy (md5 `a8c121fd…`); lane copy NOT modified.
- **Recorded (step 8 blocker path):** PROTO-AI-9 → `status: blocked`, full `blocker_*` fields written under the lane lock, watched
  artifact `decisions/PROTO-AI-9-ai-draft-toolcall-blocker.md` (the single concrete question + recommendation for Brad).

## Blockers (step 3)
- 0 due/changed from the gate. The two pre-existing watched human artifacts are **UNCHANGED** (not re-asked):
  `decisions/PROTO-AI-11-data-approval.md` (mtime 2026-10-04 16:56:52), `decisions/PROTO-AI-12-prereg-approval.md`
  (mtime 2026-10-04 16:54:16).
- **NEW blocker (this tick):** PROTO-AI-9 UI gate — `blocker_kind: environment`, `blocker_owner: Brad`. It is a product AI-config/code
  defect (model thinking-control incompatible with OpenRouter forced tool calls), NOT an AI-9 code defect.

## Ready set
- Empty. AI-9 code is merged+verified; its E2E gate is blocked on the AI-config decision. AI-11 (human/Brad), AI-12 §2/§4
  (STOP boundary, Brad unsigned), AI-13 (dep-gated on AI-12 §4). Nothing dispatchable.

## Live at checkpoint
- **None.** The AI-9 reviewer exited cleanly. No lane-2 worker live.
- Lane-1 runs its own tick (its own orchestrator + a QMS-6B reviewer session on the shared appliance-2 vision model) — not lane 2.

## Next tick first actions
1. Read the watched artifact `decisions/PROTO-AI-9-ai-draft-toolcall-blocker.md`. If Brad chose **option 1** (add OpenRouter-native
   `reasoning:{enabled:false}` to `InferenceClient`) → route a bounded spec to the architect/worker (NEW SCOPE: scope amendment) then
   **re-dispatch the SAME cl-browser-reviewer** with `plan-flowA.json` unchanged. If Brad chose **option 2** (repoint the active
   profile to a local model) → set the lane's `config.yaml` `activeProfile` (lane-local copy only; never Brad's), `cl-lane-stack.sh 2
   restart` (background=true), confirm the draft turn works in `.run/backend.log`, then re-dispatch the reviewer.
2. Do NOT re-ask AI-11 / AI-12 (unchanged human questions).
3. On reviewer `VERDICT: accept` → promote `.hermes/plans/PROTO-AI-9-report.wip-l2t2252.md` to canonical, mark AI-9 **done**, handoff.

## assumptions: (none new this tick)
- No new orchestrator assumptions: every claim above is measured (logs, probe, md5, served-source curl). The lane `config.yaml`
  was deliberately NOT changed (model choice is Brad's per standing rule).

## Open evidence-debt entries (carry forward)
- **`AS-PROTO-AI-9-W7`** — E2E Accept→apply proof rests on the PROTO-AI-9 browser gate. STILL OPEN: the gate returned
  **blocked**. Clears only when a working AI profile lets the reviewer exercise Accept→apply with sha-before/after evidence.
- **`AS-PROTO-AI-12-W1`** — the served router artifact is the QAD-Q4_0 quant of LFM2.5-350M (sha256 3d10b6ab…); acceptance-relevant
  to PROTO-AI-13's verdict → must be disclosed with its digest.

## Baseline facts (carried / updated)
- `cl/integration-2` HEAD = **`4086d619`** (== AI-9 merge `b5b1948a` + a checkpoint commit). Server tsc baseline 34; app tsc baseline 47.
- Lane stack `:3093` / `:5193` both http=200; serves trunk. Active AI profile = `qwen3.8-flash-OR` (BROKEN for the forced tool turn).
- Receipts: `/home/brad/.hermes/cl/receipts/PROTO-AI-9/2026-10-05_0218/` (report.md, trail.json, shots/, flow{A,B,C}/).
- Pitfall (carried): `cl-lane-stack.sh 2 restart` is BLOCKING — use `background=true`; only `status` is foreground-safe.
