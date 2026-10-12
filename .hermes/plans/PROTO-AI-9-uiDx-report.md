PROTO-AI-9 UI proposal-persistence — DIAGNOSE report (wip, token l2t1225)
=========================================================================
Worker: cl-senior, lane 2. Worktree /mnt/vast/home/brad/git/wt/PROTO-AI-9-uiDx-lane2-l2t1225
@ bb48b96e (cl/integration-2). Stack: `cl-lane-stack.sh 2 status` -> backend :3093 http=200,
frontend :5193 http=200 (status only; no restart). Fixture RUN-2026-09-19-run-vwr8,
protocol PRT-4iaey2, lane store CL_DATA_DIR=/home/brad/.computable-lab-lane2 (lane-local).

VERDICT: the gate's claimed defect ("Changes panel disappears before Accept lands / UI loses
the protocolEdit result from the SSE stream") is FALSE — refuted by the reviewer's OWN
trail.json AND by three fresh instrumented browser runs. The residual real failure — Flow A
Accept returning 422 — is NOT a UI-persistence bug; it is an out-of-scope schema-contract
mismatch between the PROTO-AI-2 envelope and protocol.schema.yaml's step kind-payloads
(case c). NO CODE CHANGED. Details and evidence below.

---------------------------------------------------------------------------
1. WHAT THE REVIEWER'S OWN ARTIFACTS ACTUALLY SHOW (re-read of
   /home/brad/.hermes/cl/receipts/PROTO-AI-9/2026-10-05_1205/flowA/trail.json)
---------------------------------------------------------------------------
The narrative in report.md ("panel briefly appeared then disappeared before the click")
contradicts the machine trail in the same folder:
- step 20 `click` on [data-testid='changes-apply'] -> status **ok** (the click landed).
- step 21 `awaitPanelClose` -> FAIL "changes-panel still mounted after 30000ms" —
  i.e. the panel did NOT disappear; it stayed mounted 30+ s AFTER the click.
- step 24 assertText FAIL with "got \"REVIEW CHANGES\"" — header still in review mode.
- step 26 doubleAcceptCheck: `applyBtn: true, panelGone: false` — panel + Accept still there.
- step 15 proposalState: full protocol-diff rendered, hdr "REVIEW CHANGES", input ready.
- Their screenshot 20-fail-awaitPanelClose.png is described by the reviewer themselves as
  "panel still open, error-state header" — consistent with an apply ERROR, not a vanishing panel.
So: proposal persisted, click landed, apply produced an error the plan never captured
(their plan had no probe for `.changes-panel__apply-error`). "pre-fill failed" is the benign
background-warmup chip (AiTabPanel.tsx:106-115, WarmIndicator) — confirmed present, not an
error state of the draft turn. "DOM refs changed between snapshot and click" never entered my
runs: the receipt harness re-resolves the CSS selector at click time (capture.ext.spec.ts:103-105),
which is the required click discipline; it worked deterministically 3/3.

---------------------------------------------------------------------------
2. MY REPRODUCTION (real browser tooling: the same capture.ext.spec.ts Playwright harness)
---------------------------------------------------------------------------
Backend log tailed at /mnt/vast/home/brad/git/cl-integration-2/.run/backend.log
(pid 2552964; fd/1). Every run: goto /runs/RUN-2026-09-19-run-vwr8, chat ask EXACTLY
"add a wash step after step 3 and delete the redundant centrifuge step".

Flow A2 — fetch-instrumented Accept (plan+trail:
/home/brad/.hermes/cl/receipts/PROTO-AI-9/2026-10-05_uidx-l2t1225/flowA2/):
- Proposal PERSISTS: waitFor changes-panel ok (~7 s), +3 s still there, proposalState shows
  the exact diff ("+step ... Wash the pellet with 70% ethanol ... kind wash | after step-3",
  "-step step-6 ... Centrifuge ..."), hdr "REVIEW CHANGES". shaBefore == shaAfterProposal ==
  94e1096b0ddb6a593a837bbedcc516f765ea59cc (propose never writes — PASS).
- Accept click (selector re-resolved at click time) -> 1.5 s later the page had fetched:
  GET /api/records/PRT-4iaey2 then **PUT /api/records/PRT-4iaey2** (fetch log, acceptProbe1) —
  the click DID reach handleProtocolAccept -> applyProtocolEdit (AiTabPanel.tsx:608-633 ->
  protocolEditOps.ts:206-232). The PUT returned **422** (backend log req-8p, statusCode 422,
  20 ms). Panel then shows the server's validation message VERBATIM in
  .changes-panel__apply-error and stays open (the merged D4-style failed-apply design),
  input stays usable. panel-open-after-apply is BY DESIGN on failed apply, not a lost proposal.
- 422 text (acceptProbe2, verbatim head): "Validation failed: /steps/3: Missing required
  property: volume_uL; ... /steps/3: Missing required property: target; /steps/3: Missing
  required property: wells; ... /steps/3/kind: Must equal: wash..." (all StepWash/other-branch
  complaints; RecordHandlers.ts:580 emits 'Validation failed' 422s).
- sha after failed Accept: UNCHANGED (94e1096b) — zero-write behavior correct.
- Screenshot of the visible error: .../flowA2/shots/19-05-after-accept-probe.png.

Flow A3 — SSE + PUT-body capture (same receipt root, flowA3/):
- The envelope the model emitted, read from the SSE `done` in-page:
  {"ops":[{"op":"step_insert","label":"Wash the pellet with 70% ethanol.","kind":"wash",
  "afterStepId":"step-3"},{"op":"step_delete","stepId":"step-6"}]}
- The PUT payload's inserted step (applier output): {"stepId":"step-1e4f6df18d7b94e5868b674d",
  "label":"Wash the pellet with 70% ethanol.","kind":"wash","ordinal":4} — NO
  target/wells/cycles. PUT status 422. Root cause pinned (§4).

Flow B2 — Reject (flowB2/): proposal persisted; Reject click -> awaitPanelClose **ok**
(panel unmounts), sha UNCHANGED 94e1096b, hdr back to "AI Assistant", chat input ready.
Reject flow FULLY WORKS (this passes cleanly; the reviewer never exercised it).

Flow C2 — labware-role Accept (flowC2/), ask "add a labware role for a sterile 15ml conical
tube used for pellet resuspension":
- Proposal persisted, diff "+labware role sterile-15ml-conical-tube ...".
- Accept click -> sha 94e1096b... -> **40cb686692317b07578dae7702fe43229ec81a65 ONCE**
  (steps still 16, labwareRoles 3 -> 4, roleId appended), panel unmounted, hdr
  "AI Assistant", input ready, no error text.
- This IS the end-to-end proof that the ENTIRE UI chain (SSE -> sidebarState draft-ready
  with protocolDiff -> ChangesPanel render -> persist -> Accept click -> applyProtocolEdit ->
  one updateRecord -> sidebar reset) WORKS. There is no lost-state defect.
- FIXTURE STATE NOTE for the next gate run: the lane record now carries the accepted
  labware role. Baseline sha = 40cb686692317b07578dae7702fe43229ec81a65, labwareRoles=4,
  steps=16. (Lane-local store; Brad's tree and :3001/:5174 untouched.)

---------------------------------------------------------------------------
3. WHICH CASE IS TRUE
---------------------------------------------------------------------------
Not (a) verbatim and not (b). Verdict: the CLAIMED AI-9 UI defect does not exist
(harness/report failure — the reviewer's trail contradicts their report), and the residual
Flow-A Accept failure is case (c): an out-of-scope schema-contract mismatch (§4). Per
instructions I STOP at (c): no app/schema change.
- (b) is refuted directly: sidebarState is NOT reset between draft-ready and render
  (hdr stays "Review changes" indefinitely — my flowA2 kept it through 30 s of
  awaitPanelClose polling + probes), and the SSE handler does NOT drop protocolEdit
  (the diff renders from exactly the ops in the SSE done event, captured byte-for-byte in A3).
- Warm-context 400 ("No user query found in messages", server/src/ai/warm/*, still
  recurring at backend.log lines 4326/4419): CONFIRMED it cannot affect sidebarState.
  The warm path in AiTabPanel.tsx (lines 519-549) only ever calls setWarm/setWarm-status;
  grep shows no sidebarDispatch on any warm code path; the chip is display-only
  (WarmIndicator, :80-118). Benign, pre-existing, out of scope. It did not block any of
  my 3 turns (backend: `done protocol_edit success=true ops=2` each time, agent 7lgfvt mine).
- The one-time blank page: not reproducible; my 3 full runs + pageErrors arrays all empty.
  Pre-existing console warning (duplicate key `run:RUN-2026-09-19-run-vwr8` in
  WorkspaceTabStrip) is a separate non-AI-9 surface, unchanged.

---------------------------------------------------------------------------
4. THE REAL DEFECT (case c) — BLOCKER, out of my write scope: envelope vs record-schema mismatch
---------------------------------------------------------------------------
A `step_insert` with any kind other than `other` (or `other` without a description) is
VALIDATED and DISPATCHED by the server (PROTO-AI-7: success=true ops=2) but is
UNAPPLIABLE: the resulting step can never validate against protocol.schema.yaml.
- Envelope: schema/workflow/protocol-edit-op.schema.yaml:170-197 `StepInsertOp` —
  `required: [op, label, kind]`, `unevaluatedProperties: false`, and its ONLY propertiable
  fields are afterStepId/beforeStepId/label/kind/description. It CANNOT carry
  target/wells/cycles.
- Record: schema/workflow/protocol.schema.yaml ProtocolStep allOf-oneOf kind payloads —
  `StepWash` (:946-959) requires [kind, target, wells, cycles]; `StepOther` (:1030-1033)
  requires [kind, description]. The inserted step {stepId,label,kind:'wash',ordinal} has
  none of them -> server 422 on updateRecord (RecordHandlers.ts:580). Reproduced 2/2
  (reviewer's run: PUT req-1o also 422; my run: PUT req-8p 422) — DETERMINISTIC, not flaky.
- Applier app/src/event-editor/right-pane/protocol/protocolEditOps.ts:151-163 builds the
  new step from exactly {minted stepId, label, kind, description?} — it cannot invent the
  kind-required fields either (and must not: inventing labware roles/well selectors would
  be fabrication; the schema owns that policy).
- Contrast: the HUMAN editor never hits this — ProtocolStepEditModal.tsx:94 inserts with
  kind 'other' through the modal that collects the real fields.
Why out of scope: the fix is a domain-contract decision crossing PROTO-AI-2 (envelope
vocabulary: let StepInsertOp carry per-kind fields / require description), PROTO-AI-6
(prompt: what the model may propose), or PROTO-AI-8 (applier derivation rules), and the
task forbids me from touching schema/lint/ui YAML. Forcing kind 'other' client-side would
launder a real "wash" step into schema-compliant mush — a biology/policy degradation I am
not authorized to make. Architect + orchestrator decision; likely smallest honest option
is StepInsertOp gaining the per-kind required payload fields (schema change) with the
envelope validator (Ajv, authority) enforcing completeness BEFORE the proposal is shown,
so the UI never offers an unappliable Accept.
Sub-question honestly noted: with this envelope the UI is behaving exactly as designed on
failed apply (error verbatim, panel stays actionable, zero write) — there is nothing in
AiTabPanel/sidebarState/ChangesPanel to RED-fix for the claimed symptom, and a
"panel-closes-on-422" change would VIOLATE the merged D4 design (proposal stays open on a
failed apply). Inventing a client-side change here would be weakening the acceptance
criterion, not meeting it.

---------------------------------------------------------------------------
5. COMMANDS, TESTS, TYPECHECK
---------------------------------------------------------------------------
Runs (repeatable):
  cd ~/.hermes/cl/browser-receipts/harness
  RECEIPT_PLAN=<flowX/plan.json> RECEIPT_DIR=<flowX/> PLAYWRIGHT_BASE_URL=http://localhost:5193 \
    npx playwright test --config pw-cfg-ext.ts --project=chromium
(3 runs, all steps ok except the two expected awaitPanelClose fails on the 422 stays-open path)
Unit suites at bb48b96e (baseline signal, no code changed):
  npm run test:unit -w app -- --run AiTabPanel.protocolEdit.test.tsx ChangesPanel.test.tsx \
    sidebarState.test.ts protocolEditOps.test.ts
  -> Test Files 4 passed (4), Tests 52 passed (52). NO NEW failures.
Typecheck: NOT RUN — zero code changes, so the trunk ~47 baseline comparison does not apply.

NO CODE CHANGED. `git status` in the worktree is clean (no commits made; nothing to merge).

---------------------------------------------------------------------------
6. SHA TRAIL SUMMARY (PRT-4iaey2, lane store)
---------------------------------------------------------------------------
- 94e1096b... baseline (matches gate report baseline).
- Flow A2/A3 Accept (step-insert ask): sha UNCHANGED — PUT 422, zero write (x2, deterministic).
- Flow B2 Reject: sha UNCHANGED — PASS.
- Flow C2 labware-role Accept: sha advanced EXACTLY ONCE to 40cb6866..., labwareRoles 3->4,
  panel closed, input ready — Accept path PROVEN end-to-end.
- Step count 16 throughout (Flow A ops never applied — blocked by the §4 contract defect,
  so "rail renumbering on Accept" cannot be demonstrated until that blocker is resolved).

---------------------------------------------------------------------------
7. SCREENSHOTS (absolute)
---------------------------------------------------------------------------
/home/brad/.hermes/cl/receipts/PROTO-AI-9/2026-10-05_uidx-l2t1225/flowA2/shots/09-03-changes-panel-proposal.png   (diff shown, persists)
/home/brad/.hermes/cl/receipts/PROTO-AI-9/2026-10-05_uidx-l2t1225/flowA2/shots/14-04-accept-clicked.png
/home/brad/.hermes/cl/receipts/PROTO-AI-9/2026-10-05_uidx-l2t1225/flowA2/shots/19-05-after-accept-probe.png       (422 error visible IN the open panel)
/home/brad/.hermes/cl/receipts/PROTO-AI-9/2026-10-05_uidx-l2t1225/flowA3/shots/13-accept-422-evidence.png         (same, with SSE-captured ops)
/home/brad/.hermes/cl/receipts/PROTO-AI-9/2026-10-05_uidx-l2t1225/flowB2/shots/08-proposal-persisted.png
/home/brad/.hermes/cl/receipts/PROTO-AI-9/2026-10-05_uidx-l2t1225/flowB2/shots/13-after-reject.png                 (back to AI Assistant, sha unchanged)
/home/brad/.hermes/cl/receipts/PROTO-AI-9/2026-10-05_uidx-l2t1225/flowC2/shots/09-labware-proposal.png
/home/brad/.hermes/cl/receipts/PROTO-AI-9/2026-10-05_uidx-l2t1225/flowC2/shots/13-after-labware-accept.png         (Accept success: sha once, +1 role)

BLOCKER for orchestrator: Flow A (step_insert Accept) acceptance criteria are unachievable
on ANY candidate until the StepInsertOp-vs-ProtocolStep kind-payload contract (§4) is
adjudicated (schema authority: architect). The UI-persistence gate finding should be
withdrawn as a harness/report failure per §1-§3; the gate should re-run with a plan that
probes `.changes-panel__apply-error` after Accept and baselines against sha
40cb6866... (labwareRoles=4).
