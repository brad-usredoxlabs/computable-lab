# Handoff — LANE 2 tick 2026-10-05T04:50 → 05:25 EDT (PROTO-AI-9 UI gate returned BLOCKED — root-caused to a surface/context gap; architect decision dispatched)

Campaign: `ai-protocol-edit-and-router` (lane 2 list `~/.hermes/cl/lanes/2/task-list.md`).
Trunk: `cl/integration-2` — HEAD at tick start **`75dccd14`**. No product code changed this tick; no
merge performed. This tick's only commit is this handoff (docs).

## Outcome this tick
- **Reconciled (step 2):** the PROTO-AI-9 `cl-browser-reviewer` re-run from the prior tick was still
  live at tick start (bash pid `1638345` / hermes python pid `1638488`). I observed it (not killed, not
  re-dispatched): its `state.db` kept advancing, it kept issuing model/browser calls, and at **05:04**
  it wrote its `report.md`. It then ran a final deck-surface experiment and **exited cleanly at ~05:10**
  (`PROTO-AI-9 RERUN REVIEW EXITED code=0`). No lane-2 coder worker was live; the only other live
  reviewer was lane 1's (QMS-7).
- **Adopted the reviewer's output:** `receipts/PROTO-AI-9/2026-10-05_0354/report.md` → **VERDICT:
  BLOCKED**. Candidate `99a13728` verified served (`protocolEditDiffFrom` count = 1); profile
  `qwen3.8-thunderbeast` observed; stack :3093/:5193 both http 200.
- **Diagnosed the blocker MYSELF before routing (step 3):** the tool_choice 400 is gone (the
  lane-local profile fix held). The remaining failure is that the run-page chat sends
  surface **`workspace.project-details`**, which does not render the PROTO-AI-6 attached-protocol block
  or the `protocol_edit` op vocabulary, so the model emits an envelope the PROTO-AI-2 schema correctly
  rejects. Verbatim UI error and the two-trace comparison are in the task block + reviewer report.
  File:line evidence I verified read-only in the served checkout:
  - `app/.../ai/AiTabPanel.tsx:129,457` — request `surface` == the ACTIVE WORKSPACE TAB's viewer id.
  - `app/src/run/RunWorkspacePage.tsx:126-152` — the run page renders the deck as CHILDREN and leaves
    the seeded `project-details` tab active.
  - `app/src/event-editor/workspace/types.ts:265-292` — `defaultWorkspaceState` seeds
    `details:<studyId>` (kind `project-details`) as the active tab.
  - `server/src/ai/systemPrompt.ts:393-404` + `:464-482` — full template + attached-protocol/protocol_edit
    block render ONLY for `event-editor` / `workspace.deck`.
- **Routed the architectural decision** (bounded, read-only, unique artifact) to `architect`:
  prompt `/tmp/lane2-architect-ai9-surface-20261005T0519.txt`; log
  `logs/architect-PROTO-AI-9-surface-20261005T0519.log`; architect pid **1779262** (LIVE at
  checkpoint); decision artifact (watched)
  `decisions/PROTO-AI-9-surface-context-decision.md`. Ask: fixture route vs product surface/default-tab
  change vs broader scope change; plus whether R-Defect-1/2 are in AI-9's change set.
- **Recorded structured blocker fields** for PROTO-AI-9 (status → `blocked`, `blocker_kind:
  architecture`, owner architect, `next_check: on-change`, watch the decision artifact) under
  `task-list.lock`. No new code exists to merge (AI-9 code is already at `b5b1948a`).

## Reviewer defects worth carrying (candidate `99a13728`, re-confirmed; also in the prior gate)
- **R-Defect-1 [medium]** a schema-rejected turn still opens an actionable EMPTY "Review changes" panel
  (zero diff rows + active "Apply to run"): `shots/12-04-changes-panel-proposal.png`, trail step 14
  `panelSnippet "DiscardApply to run"`.
- **R-Defect-2 [high]** clicking that Apply with nothing pending dead-ends the pane: header frozen
  `APPLYING…`, chat input permanently gone; shots `22/23/25/27/31` byte-identical md5 `bcc2fb37…`.
- Scope of both (AI-9 set vs pre-existing event-graph review wiring) is part of the architect decision.

## Live at checkpoint (do NOT re-dispatch — adopt next tick)
- **`cl-browser-reviewer` (PROTO-AI-9 gate re-run)** bash pid `1638345` / hermes `1638488` — report
  already written (VERDICT: BLOCKED); still draining its final browser experiment. Log
  `logs/PROTO-AI-9-review-rerun-20261005T0354.log` (buffered to 0 B until exit). Receipts
  `receipts/PROTO-AI-9/2026-10-05_0354/`.
- **`architect` (PROTO-AI-9 surface decision)** pid `1779262`, log
  `logs/architect-PROTO-AI-9-surface-20261005T0519.log` (buffered until exit). Artifact
  `decisions/PROTO-AI-9-surface-context-decision.md`.

## Next tick first actions
1. Reconcile the architect pid `1779262`; read `decisions/PROTO-AI-9-surface-context-decision.md`.
2. If it decides a **fixture route** exists → re-dispatch `cl-browser-reviewer` with the corrected
   surface/fixture (candidate `99a13728`, receipts dir fresh).
3. If it decides a **product change** → route the concrete amendment to Brad (one-line ask); do not
   implement beyond approved scope. If it decides the change is **inside approved intent** → dispatch
   `cl-senior` (bounded) with the exact files, plus any in-scope R-Defect fixes, then re-run the gate.
4. Do NOT re-ask Brad's unchanged human questions: `decisions/PROTO-AI-11-data-approval.md`,
   `decisions/PROTO-AI-12-prereg-approval.md` (both UNCHANGED).

## assumptions:
- No new consequential assumptions this tick. Every claim above is measured (process identity, log
  timestamps, `state.db` mtimes, `curl` served-code check, file:line reads) or quoted from the
  reviewer's receipts. The prior tick's `AS-PROTO-AI-9-W8` (lane-local profile switch) still stands.

## Open evidence-debt entries (carry forward)
- **`AS-PROTO-AI-9-W7`** — E2E Accept→apply proof rests on the PROTO-AI-9 browser gate. STILL OPEN:
  no schema-valid proposal ever reached the panel through the UI this run, so propose-never-write and
  Accept→apply were never tested against one. Clears only on a receipt showing Accept→apply with
  sha-before/after evidence on a valid proposal.
- **`AS-PROTO-AI-12-W1`** — the served router artifact is the QAD-Q4_0 quant of LFM2.5-350M
  (sha256 `3d10b6ab…`); acceptance-relevant to PROTO-AI-13 → disclose with its digest.

## Baseline facts (carried / updated)
- `cl/integration-2` HEAD `75dccd14` + this handoff commit. Server tsc baseline 34; app tsc baseline 47.
- Lane stack `:3093` / `:5193` both http=200, serving the trunk worktree (`99a13728`-era; PROTO-AI-9
  merge `b5b1948a` present). Lane AI profile `qwen3.8-thunderbeast` (lane-local).
- Ready set otherwise unchanged: AI-11 (human/Brad), AI-12 §2/§4 (STOP boundary, unsigned), AI-13
  (dep-gated on AI-12 §4). PROTO-AI-9 now `blocked` (architecture).
- Pitfall (carried): `cl-lane-stack.sh 2 restart` is BLOCKING — use `background=true`; `status` is safe.
