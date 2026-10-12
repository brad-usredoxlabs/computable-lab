# Handoff — LANE 2 tick 2026-10-05T19:50 → 20:32 EDT
## (PROTO-AI-9 CLOSED — kind-change UI gate VERDICT: accept on bec054b0; campaign segment AI-1..AI-10 done;
##  only the human-blocked AI-11 / AI-12 (and dep-gated AI-13) remain)

Campaign: `ai-protocol-edit-and-router` (lane-2 list `~/.hermes/cl/lanes/2/task-list.md`).
Trunk: `cl/integration-2` — HEAD **`bec054b0`** (unchanged this tick; no code merged — the kind-change
repair was merged last tick; docs/handoffs left UNCOMMITTED so HEAD stays at the reviewed candidate).
Lane stack `:3093`/`:5193` both **200**. Lane AI profile `qwen3.8-thunderbeast`. No Brad stack touched.

## Outcome
1. **Cheap pre-check GREEN** (real endpoint `POST /api/ai/assist/stream`, surface `workspace.deck`,
   fixture `PRT-4iaey2`, ask "change step 4 from wash to incubate overnight"): emitted a schema-VALID
   proposal `{step_update, stepId=step-e7e21d5227d32c16e6f809aa (ordinal 4, wash, "Wash the lysate"),
   kind:"incubate", label:"Incubate overnight", duration_min:960}`; record contentSha UNCHANGED
   (`0a623e2b…`) — propose-never-write held. Log `logs/PROTO-AI-2-kindchange-precheck-20261005T1955.log`.
2. **Kind-change UI gate returned `VERDICT: accept`** (cl-browser-reviewer, candidate `bec054b0`, ran
   ~32 min, exited code=0). Receipts `receipts/PROTO-AI-2/2026-10-05_1955/` (`report.md` 7137 B, root
   `trail.json` embedding per-flow trails, `f1-c1/ f1b-c1-retry/ f2-c2/ f3-c3/ f4-c4/` + shots).
   **No code to merge** — the candidate (kind-change repair l2t1730) was already merged last tick.
3. **PROTO-AI-9 marked `done`** (task-list line 315 `in-progress`→`done`). Its own gate accepted on
   `a89719df` last tick; its last tracked in-scope repair (kind-change) now merged + gate-accepted →
   the campaign's AI-1..AI-10 segment is CLOSED.

## Reconcile (step 2)
- No lane-2 workers were live at tick start: only the architect gateway daemon + this orchestrator.
  The prior tick's AI-9 UI gate (pid 3333195) had already exited code=0 (`VERDICT: accept`), the
  l2t1730 worker had exited code=0 and was MERGED (`bec054b0`) — both adopted. No dangling worktrees.
- Human blockers unchanged (byte-identical): AI-11 `decisions/PROTO-AI-11-data-approval.md`, AI-12 §2
  `decisions/PROTO-AI-12-prereg-approval.md` → NOT re-asked (silence is never approval).

## Verification I performed myself (steps 6–7)
Read the gate's `report.md` AND the raw per-flow `trail.json` `evaluate` results (not the reviewer's prose),
then re-read the live record:
- **C1 PASS** (f1b-c1-retry): wash(step-e7e21d, ordinal 4) → incubate overnight; proposal carried
  kind+duration_min; shaBefore==shaAfterProposal (`0a623e2b`); Accept → `.changes-panel__apply-error`
  NULL ~0.4 s and ~3 s, panel unmounted, header back to AI ASSISTANT, input ready; record step4
  kind=incubate duration_min=480, target+wells KEPT, cycles+washVolume_uL DROPPED; sha advanced EXACTLY
  ONCE (`0a623e2b`→`8ad75aa4`); rail "4Incubate the lysate overnight" WITHOUT reload; double-Accept
  impossible (applyBtn false, panelGone true).
- **C2 PASS** (f2-c2): wash(step-746d, ordinal 5) → mix; Accept → sha `8ad75aa4`→`760c427f` EXACTLY ONCE,
  step5 kind=mix, **cycles=1 KEPT** (per-kind allow-set, not a blanket wipe), no washVolume_uL, rail
  "5Mix the lysate" without reload.
- **C3 PASS** (f3-c3): negative — the model emitted `{kind:'wash', duration_min:30}`; the ENVELOPE rejected
  it (backend `done protocol_edit success=false ops=1`), the rejection fed the review dialogue (red
  "agent_intent failed" line, header back to AI ASSISTANT, **NO changes panel mounted** → no half-open
  Accept); record UNCHANGED (`760c427f` before==after; ZERO record PUTs on this flow).
- **C4 PASS** (f4-c4): ordinary text edit (step-10/ordinal 11 label → "Move to Binding DNA"); Accept →
  sha `760c427f`→`30a353a8` EXACTLY ONCE, kind still other, description untouched, NO payload keys leaked.
- **MY OWN, INDEPENDENT OF THE GATE**: final `GET /api/records/PRT-4iaey2` → contentSha
  `30a353a88254c4f9b1ddb2af2432d662c7cc052d` (== the gate's C4 final sha), 17 steps, ordinals contiguous
  1..17; step4 kind=incubate label "Incubate the lysate overnight" (duration_min present, cycles absent);
  step5 kind=mix cycles present; step11 kind=other label "Move to Binding DNA" keys
  `[stepId,ordinal,kind,label,description]` (no leak). Served `:5193` `protocolEditOps.ts` carries
  `applyOpsToStepKindChange` / `STEP_PAYLOAD_FIELDS_BY_KIND` (count 4). sha chain
  `0a623e2b → 8ad75aa4 → 760c427f → 30a353a8` = exactly one write per Accept.
- **D1 (model/comms class, NOT a candidate defect)**: the BARE ask "change step 4 …" (flow f1-c1) resolved
  to the step whose stepId is literally `step-4` — kind `other`, ordinal 6, no `target` — producing an
  envelope-VALID op that the record PUT correctly rejected (`/steps/5: Missing required property: target`
  …, one 422, ZERO write). That is the relaxed-envelope clarify-then-redraft contract working as designed.
  The re-ask anchored by the step LABEL succeeded immediately. Recorded as **AS-PROTO-AI-2-C1-ANCHOR**
  (evidence_debt false; the claim rests on the independently re-read record write, not the anchoring).
  PROTO-AI-6 follow-up (out of this repair's scope): the attached-protocol block could disambiguate
  stepId vs rail ordinal so a bare "step N" resolves correctly.

## Dispatched this tick
- **cl-browser-reviewer** (the kind-change UI gate): bash/hermes pid 3453452, log
  `logs/PROTO-AI-2-kindchange-gate-20261005T1955.log`, receipts `receipts/PROTO-AI-2/2026-10-05_1955/`,
  prompt `prompts/review-PROTO-AI-2-kindchange-20261005T1955.txt`. EXITED code=0. No cl-senior dispatched
  (nothing to build). Endpoint: 1 reviewer; 0 senior workers lane-wide.

## Ordered next actions (resume exactly here)
1. **Ready set is EMPTY.** AI-11 (blocked, human — disposition) and AI-12 (blocked, human — §2
   pre-registration signature) are `on-change`; AI-13 is `todo` but dep-gated on AI-12. Do NOT re-ask the
   unchanged human questions; do NOT invent campaign scope. A no-work note was appended to
   `~/.hermes/cl/lanes/2/no-work.log`.
2. If a human blocker's watched file changes → investigate the changed evidence, then act (AI-11:
   close-as-superseded vs redefine; AI-12 §2: if signed → dispatch §4 log-only shadow). Never assume
   approval from silence.
3. Non-blocking backlog items (NOT campaign tasks; need a decision before they become work):
   - **D2 [cosmetic] ChangesPanel styling** — Reject/Accept render as jammed plain text "RejectAccept";
     apply-error unstyled despite `role="alert"`; ZERO CSS rules for `.changes-panel__*` exist (component
     added in 7a3202e9). Buttons ARE functional. Brad reviews this surface → worth a small task.
   - **promptBudget.test.ts already fails at trunk** (43015 > 12000 chars); the kind-change + wellsfix
     prompt lines added ~1560 chars to an already-over-budget prompt → Brad/backlog: raise the constant
     or trim the prompt.
   - D3 [console] React duplicate-key warning in WorkspaceTabStrip (duplicated run tabs).

## assumptions:
- **NEW: `AS-PROTO-AI-2-C1-ANCHOR`** — criterion 1 was exercised with the step anchored by label
  ("change step 4, the wash step labeled 'Wash the lysate'…") because the fixture's stepIds do not track
  rail ordinals, so a bare "step 4" is ambiguous (D1). Reversible, `evidence_debt: false` (the claim rests
  on an independently re-read real write, disclosed in the gate report). Full entry in
  `~/.hermes/cl/lanes/2/assumptions.md`.
- Standing (carried, reversible, `evidence_debt: false`): **AS-PROTO-AI-9-C5-ROLENAME**,
  **AS-PROTO-AI-9-LANE2CONFIG-RECREATE**, **AS-PROTO-AI-9-W8**, **AS-PROTO-AI-9-SURFACE-MOUNTED**,
  **AS-PROTO-AI-9-RDEFECT2-PLACEMENT**, **AS-PROTO-AI-9-DRAFTCHANGES-LANE-LOCAL**,
  **AS-PROTO-AI-9-ISOLATED-STACK**.

## Open evidence-debt entries
- **`AS-PROTO-AI-12-W1`** — served router artifact is the QAD-Q4_0 quant of LFM2.5-350M (sha256 `3d10b6ab…`);
  acceptance-relevant to PROTO-AI-13 → disclose with its digest. **STILL OPEN** (AI-12 §2 unsigned, AI-13
  not started).
- `AS-PROTO-AI-9-W7` remains CLEARED (2026-10-05T17:55).

## Baseline facts
- `cl/integration-2` HEAD **`bec054b0`**. tsc pristine baselines on this worktree: server **33** / app **34**.
- Fixture `PRT-4iaey2` (lane TEST DATA) after this tick's gate: **contentSha
  `30a353a88254c4f9b1ddb2af2432d662c7cc052d`, steps 17, ordinals contiguous**; step4 (step-e7e21d)
  kind=incubate duration_min=480; step5 (step-746d) kind=mix cycles=1; step11 label "Move to Binding DNA".
  ALL CL records are Brad-declared TEST DATA; **a fresh gate must re-read the sha first** — every recorded
  baseline in older gate prompts is stale.
- Pitfall (carried): `cl-lane-stack.sh 2 restart` is BLOCKING → run with `background=true`; it ABORTS if
  `lane2-config.yaml` is missing (recreate with `cp -L …/cl-integration-2/config.yaml`, mode 600); `status` safe.
- Pitfall (carried): bare `git worktree add` on this NFS takes ~4–10 min for ~3200 files → background it.
- Pitfall (harness): the reviewer's reused plan asserts literal `AI Assistant` against the
  `ai-tab-system-prompt` testid, which renders uppercase `AI ASSISTANT` → those `assertText` FAILs are
  case-mismatch artifacts, never product defects (also seen in the C5 gate). Fix the plan expectation.
