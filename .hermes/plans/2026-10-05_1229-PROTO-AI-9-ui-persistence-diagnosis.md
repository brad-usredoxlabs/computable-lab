You are cl-senior, a coder worker on computable-lab LANE 2 (campaign ai-protocol-edit-and-router).
Work ONLY inside your worktree. Read the spec, the receipts and the gate report BEFORE coding.

TASK ID: PROTO-AI-9 — UI proposal-persistence DIAGNOSE-THEN-FIX (token l2t1225).
The UI gate returned `VERDICT: fix` but its evidence is AMBIGUOUS, so DIAGNOSE FIRST and only fix a
PROVEN in-scope defect. Do not guess; reproduce with real browser tooling.

WORKTREE (yours; branch off cl/integration-2 @ bb48b96e):
  /mnt/vast/home/brad/git/wt/PROTO-AI-9-uiDx-lane2-l2t1225
  node_modules/server/app are symlinked to the trunk worktree — do not install.
REPORT (UNIQUE — write here, never overwrite a canonical report):
  .hermes/plans/PROTO-AI-9-uiDx-report.wip-l2t1225.md

CONTEXT — what is already merged and VERIFIED (do not re-litigate):
- Backend recovery repair merged at bb48b96e: a recovered `{intent:'protocol_edit',ops}` envelope now
  routes to the protocol_edit branch. Orchestrator confirmed on :3093 the log lines
  `coerced JSON args after stop as agent_intent` then `done protocol_edit success=true ops=2`, SSE done
  `pe:true err:null`, PRT-4iaey2 sha UNCHANGED. So the proposal IS produced and streamed.
- The UI review surface (ChangesPanel protocol diff + AiTabPanel accept/reject wiring, R-Defect-1/2) was
  merged earlier (b5b1948a / 9f4bb06c) and its unit suites pass.

THE GATE VERDICT (read it yourself):
  /home/brad/.hermes/cl/receipts/PROTO-AI-9/2026-10-05_1205/report.md   (VERDICT: fix)
  /home/brad/.hermes/cl/receipts/PROTO-AI-9/2026-10-05_1205/trail.json
  screenshots: /home/brad/.hermes/cl/receipts/PROTO-AI-9/2026-10-05_1205/flowA/shots/
    notably 13-04-changes-panel-proposal.png, 19-06-accept-clicked.png,
    20-fail-awaitPanelClose.png, 23-fail-assertText.png, 26-07-rail-after-accept.png
  The reviewer claims: the Changes panel "briefly appeared in the DOM" then disappeared before the
  Accept click could land; the page reverted to a "pre-fill failed" state; the page went blank once.

ORCHESTRATOR FINDING YOU MUST ACCOUNT FOR (verify it yourself, do not take it on faith):
- "pre-fill failed" is NOT an error state — it is a BACKGROUND-WARMUP status chip tooltip in
  app/src/event-editor/right-pane/ai/AiTabPanel.tsx:111-113 whose text is literally
  "Background pre-fill failed — drafting still works, the first request just pays full prefill".
  So that chip is a benign pre-existing surface and is NOT evidence of a lost proposal.
- The `Inference error 400: No user query found in messages` line is the BACKGROUND PROMPT WARMER
  (server/src/ai/warm/*, server.ts warmContext) — a detached warm-up call, not the draft turn. It is
  very likely pre-existing and out of scope; confirm whether it can affect sidebarState at all
  (it must not — if it does, that is a real finding, report it).

YOUR JOB (bounded; diagnose before you change anything):
1. Reproduce the run-page flow yourself with real browser tooling against the lane stack
   (:5193 front / :3093 back; RUN-2026-09-19-run-vwr8; chat ask EXACTLY:
   "add a wash step after step 3 and delete the redundant centrifuge step"). Confirm whether the
   ChangesPanel proposal (protocol-diff) PERSISTS after the SSE `done` — i.e. whether you can actually
   see the diff and click Accept. Use a click discipline that re-reads the element/ref immediately
   before clicking (the reviewer noted "DOM refs changed between the snapshot and the click" — that is a
   harness smell until proven otherwise).
2. Decide which of these is TRUE, with evidence:
   (a) The proposal persists and Accept works → the gate verdict was a HARNESS/TIMING artifact. Then your
       deliverable is a reliable reproduction artefact: a fixed plan.json + the trail + screenshots
       showing the panel persisting, Accept landing, sha advancing ONCE, rail renumbering. Report the
       reviewer's error as a harness failure, do NOT invent a product change.
   (b) The proposal genuinely does NOT persist (sidebarState resets between the draft-ready dispatch and
       render, or the SSE handler drops the protocolEdit result) → a REAL in-scope AI-9 defect. Then:
       RED-first test that fails today, fix the minimal wiring in
       app/src/event-editor/right-pane/ai/{AiTabPanel.tsx,sidebarState.ts,ChangesPanel.tsx}, keep
       EventGraphChange byte-compatible, and prove the flows (Accept→sha once+renumber; Reject→unchanged;
       labware-role→LABWARE +1).
   (c) The disappearance is caused by something OUT of scope (e.g. the warm-context warmer mutating
       state, or a pre-existing non-AI-9 surface). Then STOP, do NOT change it: write it up as a
       blocker with the exact file:line and evidence.
3. If you change app code, run: `npm run test:unit -w app` (targeted suites) and `npm run typecheck -w app`
   (trunk baseline ~47) — report NEW failures/errors only. If you change no code, say so explicitly.

CONSTRAINTS
- Do NOT touch: :3001/:5174, /mnt/vast/home/brad/git/computable-lab (Brad's live tree), the AI
  profile/model settings, the merged backend recovery code, schema/lint/ui YAML, or the event-graph
  review contract.
- Do NOT use `cl-lane-stack.sh 2 restart` (BLOCKING). Only `2 status`. No YAML is expected.
- Commit on your worktree branch; do NOT merge (the orchestrator merges into cl/integration-2).
- If you hit a genuine blocker, STOP and write it (exact command/error) rather than guessing. Never
  weaken a criterion.

REPORT (finish here): write .hermes/plans/PROTO-AI-9-uiDx-report.wip-l2t1225.md with: your
reproduction (commands + observed DOM/state), which case (a)/(b)/(c) is TRUE and why, the real diff
summary (files, +/-) or an explicit "no code changed", every test command + result, the typecheck
compare, sha-before/after per flow, absolute screenshot paths, and any blocker. Then end your FINAL
message with exactly one line:
  PROTO-AI-9 UIDX EXITED code=0
