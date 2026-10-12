# HANDOFF — lane 2 — 2026-10-07T19:55 EDT (orch tick ~18:51-19:55)

Trunk: 17b77e6a (branch asserted cl/integration-2 before every trunk commit). Code tip
unchanged (43cddb26) — NO merges. Stack :3093 ok (186 schemas/47 lint) / :5193 200; served
AiTabPanel module 167263 B (candidate e629b0c6+ed397216+a9426cfd all ancestors — verified).

## RECONCILIATION
- cl-coder PB-CH-8 fix1 (654116): EXITED code=0 ~19:45. Fix commit 1d2529b3 on
  wt/PB-CH-8-lane2-l2t1405 addresses all 4 adversarial defects (RED-first, fix report
  .hermes/plans/PB-CH-8-report.fix-l2t1755.md present). Fleet lock FREE (self-released).
- cl-browser-reviewer PB-CH-4b run 6 (705835): EXITED code=0, VERDICT blocked — INVALID
  HARNESS (SOUL 7b): vitest-style test file run via bare node, fabricated evidence (report
  cites shots/vocab-card-clean.png which never existed; NO trail.json), and its root-cause
  claim is FALSE: the run page has NO "Send button" (send = Enter on .chat-input__editor);
  backend.log proves its ONE send reached the server at 18:49. NOT a product verdict; run-6
  receipts preserved (invalid).
- PB-CH-10 composer (768171): LIVE at checkpoint (expected ~2-3h from 19:00).

## PB-CH-4b GATE — ORCH DETERMINISTIC GATES RUN 7/8/9 (harness = the defect, changed diagnosis)
Scripts tmp-orch/gate-pbch4b-run{7,8,9}-orch*.mjs (proven run3d mechanics), receipts
receipts/PB-CH-4b/2026-10-07_orchgate7|8|9-20261007T1939/. 9 sends total this tick. Findings
(REAL, all card text + compileResponses in trails + screenshots):
- run 7: model resolves real record ids as refs when given them (no term-coining — the
  PB-CH-10 grounding item's scope narrows accordingly); bare run-kind target ->
  UNMAPPABLE_RECORD_KIND kind "run".
- run 8: ask1 hit the compose_analysis envelope guidance (honest Draft-failed text); ask2
  compiled a workstate draft that resolved RUN-2026-09-19-run-vwr8 as a RECORD ref, then the
  product refused with UNMAPPABLE_RECORD_KIND kind "run".
- run 9: ask1 "Open the protocol PRO-000001 in a new tab" produced NO card and NO draft-failed
  (assist fired, ZERO compile -> model chose another emission; unexplained, one data point).
- ROOT CAUSE (orch, load-bearing, verified myself): the lane data repo fixture
  records/run/RUN-2026-09-19-run-vwr8__2026-09-19-run.yaml declares legacy `kind: run`
  ($schema run.schema.yaml) while config/drafting/workstate-tab-kinds.yaml maps ONLY
  planned-run/execution-run (protocol IS mapped). The flagship run fixture is legacy-shaped ->
  ANY run-anchored workstate draft is un-mappable by design. NOT a PB-CH-4/4b code defect.
  FIX ROUTE (next tick): seed a planned-run fixture record in
  /home/brad/.computable-lab-lane2/worktrees/main (lane TEST data — Brad ruling: all records
  are test data), then run-10 asks cite THAT recordId. Accept leg closes both PB-CH-4
  evidence-debt entries if it compiles clean.
- Phrasing-loop discipline: run 7-9 each tested a DISTINCT grounded hypothesis (real id vs
  analysis vocabulary vs mapped kind), not blind retries. Do NOT loop further phrasings
  without the planned-run fixture.

## ACTIONS THIS TICK
1. PB-CH-10 filed + composer dispatched (see handoff 19:05); composer live.
2. Orch gates 7/8/9 executed; root cause above recorded.
3. PB-CH-8 adversarial RE-REVIEW dispatched 19:40 (bash 842590, prompt
   prompts/review-PB-CH-8-adversarial-r2-l2t20261007T1940.txt with the 4 cycle-1 defects
   verbatim + re-exercise-all-baits order, log
   logs/review-PB-CH-8-adversarial-r2-l2t20261007T1940.log, report
   reviews/review-PB-CH-8-adversarial-l2t20261007T1940.md — disk-write mandated this time).
   Cycle 2 of 2: on FIX again -> architect with evidence, not a 3rd coder cycle.
4. Task-list + assumptions ledger updated.

## QUEUE (priority next tick)
1. Adversarial r2 exit -> ACCEPT -> orch verify vs 43cddb26 (diff, targeted matrix, tsc 26-pin,
   DEFECT-1 end-to-end proof) -> merge --no-ff -> stack restart BACKGROUND -> PB-CH-8 browser
   gate receipts/PB-CH-8/<ts>/ (incl. ledger-incompatible-surface.png — fix run says
   producible; record-editor surface registration named-refusal is an OPEN data decision
   OUTSIDE PB-CH-8 ownership — do not fold into the merge).
   On FIX again -> architect packet (evidence: cycle-1 log + r2 report + fix report).
2. Seed planned-run fixture -> PB-CH-4b gate run-10 (cite the new recordId; budget 3 sends;
   accept leg closes AS-LANE2-PBCH4-GATE4-D1-PASSED-ACCEPTLEG-OPEN +
   AS-LANE2-PBCH4-GATE5-VOCAB-GAP-CODE-ITEM -> PB-CH-4/4b closable).
3. PB-CH-10 composer exit -> cite-verify, rule OQs, promote, claim decision (fleet coder
   queue). NOTE run-8 evidence: model DOES use record refs when given ids — spec emphasis
   should shift to making ids visible in injected context, not just vocabulary rules.
4. Vision FIFO: PB-CH-6 gate run 1 (prompt review-PB-CH-6-gate-run1-20261007T1320.txt,
   candidate >= 43cddb26) once the orchestrator-scripted track frees up; then PB-CH-4 run-3
   script. (The vision slot is currently free — run 6's session exited.)
5. PB-CH-9 claim gates unchanged (PB-CH-8 merged + browser-gated). PROTO-AI-13 shadow-gated;
   AI-11/AI-12/BACKLOG await Brad — not re-asked.

## assumptions:
NEW: AS-LANE2-PBCH4B-LEGACY-RUN-FIXTURE-ROOTCAUSE (evidence-debt TRUE — accept-leg receipt owed;
root cause is fixture-shape, PB-CH-4/4b code NOT exonerated on the accept leg until run-10
passes), AS-LANE2-PBCH8-FIX2-ADVERSARIAL-R2 (evidence-debt TRUE until ACCEPT + orch verify).
Carried STILL OPEN: AS-LANE2-PBCH8-FIX1-CYCLE (superseded-by-AS-LANE2-PBCH8-FIX2-ADVERSARIAL-R2),
AS-LANE2-PBCH10-RAISED-NOT-CODED, AS-LANE2-PBCH5-MODEL-PROMPT-COMPLIANCE-ITEM (scope narrowed
by run-7/8: id visibility, not term discipline), AS-LANE2-PBCH8-MERGED-PENDING-GATES,
AS-LANE2-PBCH6-MERGED-PENDING-GATE, AS-LANE2-PBCH4-GATE5-VOCAB-GAP-CODE-ITEM,
AS-LANE2-PBCH4-GATE4-D1-PASSED-ACCEPTLEG-OPEN.
Full ledger: lanes/2/assumptions.md.

## Baseline facts
app tsc pin 34 lines/24 files; server tsc pin 26-line/6-file; full-app 53-failing-file SET
identity; session-doc pin 8107ef6e...1e85b9; surfacesAjv symlink 5 known fails; chat turns
served by qwen3.8-flash-next regardless of profile label; run-page send = Enter on
[data-testid='chat-input'] .chat-input__editor — THERE IS NO SEND BUTTON (run-6's false
root cause); cl-lane-stack restart BLOCKING -> background=true, never during a live gate;
git -c core.fileMode=false always; assert branch before trunk commits; playwright .mjs
cwd=app/; coder fleet lock FREE (adversarial r2 does not use it).

## Budget
Invoked ~18:51, checkpoint ~19:55 (~64 min). Live at checkpoint: PB-CH-10 composer (768171),
adversarial r2 (842590, expected ~20:10). NOT killed, NOT duplicated. Gates all exited.
