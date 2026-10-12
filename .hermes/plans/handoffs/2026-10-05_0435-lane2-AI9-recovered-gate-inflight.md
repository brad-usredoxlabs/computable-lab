# Handoff — LANE 2 tick 2026-10-05T03:50 → 04:35 EDT (PROTO-AI-9 blocker RECOVERED lane-locally; gate re-run in flight; architect amendment filed)

Campaign: `ai-protocol-edit-and-router` (lane 2 list `~/.hermes/cl/lanes/2/task-list.md`).
Trunk: `cl/integration-2` — HEAD at tick start **`99a13728`** (docs checkpoint atop the AI-9 merge
`b5b1948a`). No product code changed this tick; no merge performed.

## Outcome this tick
- **Reconciled (step 2):** no lane-2 worker was live at tick start; nothing to adopt. Lane 1 owned the
  only live reviewer (`QMS-6B`). The single in-progress item PROTO-AI-9 was `blocked`.
- **Root-caused the blocker MYSELF, then fixed the LANE side (step 3, recovery before idle).** The
  forced-tool draft turn returns HTTP 400 for every intent on the active OR profile
  (`qwen3.8-flash-OR`) — product-wide (Brad's live stack too), not a lane or AI-9 code defect.
  The product's supported profile-switch route (`POST /api/config/ai/profiles/<name>/activate`, the
  route the UI's `ModelSwitcher` calls) was used on the **lane instance only** to activate the
  existing declared profile `qwen3.8-thunderbeast`. Proof it is lane-local: lane worktree
  `config.yaml` md5 `a8c121fd…` → `23b405bc…`; Brad's live `config.yaml` md5 **unchanged**
  `a8c121fd…` (backup `/tmp/lane2-config.yaml.bak-20261005T0355`). Recorded as `AS-PROTO-AI-9-W8`.
- **Verified the gate is exercisable BEFORE spending the reviewer** (real endpoint
  `POST /api/ai/assist/stream`, surface `workspace.deck`, PROTO-AI-6 attached context, fixture
  `PRT-4iaey2`): proposal
  `{"ops":[{"op":"step_insert","afterStepId":"step-3","label":"Wash","kind":"wash"},{"op":"step_delete","stepId":"step-6"}],"protocolId":"PRT-4iaey2"}`
  — schema-valid and exactly the ops the criterion names. Evidence:
  `logs/PROTO-AI-9-precheck-20261005T0354.log`.
- **NEW product-level evidence:** on the product's local default `qwen3.6-appliance-2` the SAME turn
  emits `intent: protocol_edit` with a **malformed envelope** (`settings` as array-of-{key,value},
  no `afterStepId`, unevaluated props) → correctly rejected by the PROTO-AI-2 validator. The schema
  is right; the 35B local model does not follow the prompt's op contract. `protocol_edit` usability
  is model-dependent (PROTO-AI-6 prompt is adequate for `qwen3.8-flash-next`, not for the 35B local).
- **Architect decision filed (bounded scope amendment, exit code=0)** at
  `decisions/PROTO-AI-9-or-reasoning-amendment.md`: declares scope-change → **needs Brad**. Proposes a
  per-profile declared field `ai.profiles.<name>.inference.thinkingTransport:
  'chat_template_kwargs' | 'reasoning'` (default = today's behaviour, byte-pinned by test T5; no host
  sniffing, no model regex), 9 named RED-first tests, behaviour matrix for local/OR/OpenAI, and named
  unverified gaps. One-line approval request at its §7.
- **Verified myself (read-only, never written):** Brad's LIVE tree carries an **uncommitted competing
  fix** `M server/src/ai/InferenceClient.ts` (+76/-36) with
  `isOpenRouter = new URL(baseUrl).hostname === 'openrouter.ai'`, `/^qwen\//i` regex, and a silent
  downgrade of forced `tool_choice` → `'auto'`. The amendment recommends dropping that shape in favour
  of the declared field and salvaging only the 400-retry idea as a separate bounded task.
- **PROTO-AI-9 returned to `in-progress`** and its cleared blocker fields replaced by a recovery note
  (under `task-list.lock`); the residual product question lives in the watched decision artifact.

## Live at checkpoint (do NOT re-dispatch — adopt next tick)
- **`cl-browser-reviewer` re-run (PROTO-AI-9 gate) is LIVE**: bash pid `1638345`, hermes python pid
  `1638488`, session started 03:54, ~34 min elapsed at 04:28. Log (buffered until exit, so 0 bytes now):
  `~/.hermes/cl/lanes/2/logs/PROTO-AI-9-review-rerun-20261005T0354.log`. Prompt:
  `~/.hermes/cl/lanes/2/review-PROTO-AI-9-rerun-20261005T0354.txt`. Receipts (in progress):
  `/home/brad/.hermes/cl/receipts/PROTO-AI-9/2026-10-05_0354/` — `trail.json` (22 KB, 03:58),
  `shots/` with `12-04-changes-panel-proposal.png`, `16-05-protocol-diff-zoom.png`,
  `18-06-accept-clicked.png`, `19-07-after-accept-panel-closed.png` (it reached the proposal + Accept
  flows), plus `flowAC/` (04:10) and several `*-fail-*` shots (its own selector retries).
  Left RUNNING per budget policy — NOT killed, NOT re-dispatched.

## Next tick first actions
1. Reconcile the live reviewer by pid `1638345`/`1638488`; read
   `receipts/PROTO-AI-9/2026-10-05_0354/report.md` + `trail.json` when present.
2. On `VERDICT: accept` → promote the canonical report to `.hermes/plans/PROTO-AI-9-report.md`,
   mark PROTO-AI-9 **done**, handoff. (The AI-9 code is already merged at `b5b1948a`; there is no new
   code to merge. Nothing schema/lint/ui-YAML changed, so no stack restart needed — only the lane
   `config.yaml` profile changed, which the backend picks up hot.)
3. On `VERDICT: fix` → send the defect list (with absolute screenshot paths) back to the SAME worker;
   on `VERDICT: BLOCKED` → read why; if it is the model/profile rather than the UI, record it against
   the open evidence debt rather than re-running blind.
4. Do NOT re-ask Brad's product questions: `decisions/PROTO-AI-11-data-approval.md` (mtime Oct 4
   16:56:52) and `decisions/PROTO-AI-12-prereg-approval.md` (mtime Oct 4 16:54:16) are UNCHANGED.
   `decisions/PROTO-AI-9-ai-draft-toolcall-blocker.md` now carries the lane-local resolution + the
   architect amendment + the live-tree finding.

## assumptions:
- **`AS-PROTO-AI-9-W8`** (new this tick, `evidence_debt: false`): the lane instance's active AI
  profile was switched to the already-declared profile `qwen3.8-thunderbeast` via the product's own
  activate route, to give the lane's mandatory UI gate a working forced-tool turn. Value is *sourced*
  (both profiles are declared in the lane's `config.yaml`), reversible in one call, lane-worktree-only,
  and disclosed in the gate's receipts; the acceptance claim is about UI behaviour, not model identity.
  Full entry in `~/.hermes/cl/lanes/2/assumptions.md`.
- No other new assumptions: the fix, the pre-check result, the md5 comparisons and the live-tree
  finding are all measured, not inferred.

## Open evidence-debt entries (carry forward)
- **`AS-PROTO-AI-9-W7`** — E2E Accept→apply proof rests on the PROTO-AI-9 browser gate. STILL OPEN:
  the gate is in flight (this tick's re-run). Clears only on a receipt showing Accept→apply with
  sha-before/after evidence.
- **`AS-PROTO-AI-12-W1`** — the served router artifact is the QAD-Q4_0 quant of LFM2.5-350M
  (sha256 `3d10b6ab…`); acceptance-relevant to PROTO-AI-13's verdict → must be disclosed with its
  digest.

## Baseline facts (carried / updated)
- `cl/integration-2` HEAD `99a13728` + this handoff commit. Server tsc baseline 34; app tsc baseline 47.
- Lane stack `:3093` / `:5193` both http=200, serving the trunk worktree.
- **Lane AI state changed this tick:** active profile is now `qwen3.8-thunderbeast` (was
  `qwen3.8-flash-OR`), `qwen3.6-appliance-2` proven NOT compliant for `protocol_edit` envelopes.
- New lane artifacts: `probe-local-toolchoice.sh`, `precheck-assist-turn.py`,
  `logs/PROTO-AI-9-precheck-20261005T0354.log`, `architect-PROTO-AI-9-or-reasoning-20261005T0401.txt`,
  `decisions/PROTO-AI-9-or-reasoning-amendment.md`.
- Ready set otherwise unchanged: AI-11 (human/Brad), AI-12 §2/§4 (STOP boundary, unsigned), AI-13
  (dep-gated on AI-12 §4).
- Pitfall (carried): `cl-lane-stack.sh 2 restart` is BLOCKING — use `background=true`; `status` is safe.
