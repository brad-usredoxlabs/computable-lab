# Handoff — LANE 2 tick 2026-10-07T06:00 EDT
## (PB-CH-4 gate run 2 -> ONE product defect D1 FOUND with server+source+screen evidence; bounded fix1 CODING on the fleet coder; PB-CH-5 spec drafted + reviewed + OQs ruled)

Campaigns: `ai-protocol-edit-and-router` + `page-builder channel`. Trunk
`cl/integration-2`: **1bdba22d** (docs; code tip still ed397216, PB-CH-4).
Brad's :3001/:5174 untouched. Stack :3093=200, :5193=200. Fleet coder lock:
ACQUIRED this tick for PB-CH-4 fix1 (pid file pinned `item=PB-CH-4-fix1`).

## RECONCILE
- Gate run 2 (orch script, bash pid 3208376): EXITED ~05:31 (code 0,
  `GATE BLOCKED (no card)`). Trail + 4 screenshots complete
  (`receipts/PB-CH-4/2026-10-07_orchgate2/`). Its RESULT was a REAL finding —
  see D1 below — not a script bug this time.
- PB-CH-5 spec-composer (pid 2757783): EXITED code=0; draft landed on disk
  05:42 (44,849 B). Reviewed by orchestrator (see QUEUE).
- No other workers were live at tick start (verified ps). Human artifacts
  unchanged, not re-asked.

## GATE RUN 2 DIAGNOSIS (orchestrator-verified; server-side was HEALTHY)
Evidence chain: backend.log traces **vw4pml/x8xfgr** = `done compose_workstate
emitted`; **req-bl/req-bq** = `POST /api/drafts/compile` 200 (2.4s); yet
`45-card-state cardVisible:false`. Source read of the served checkout:
1. `useChatThread.ts` :203 — on the `done` event the hook ALWAYS calls
   `onDraftResult(event.result)`, even when the SAME stream emitted
   `workstate_proposal` (:265-269 forwards it to the card mount).
2. `AiTabPanel.tsx` `onDraftResult` (:338-436) — a compose_workstate result has
   no error / no protocolEdit / no clarifications and empty events, so it falls
   to the final else: `sidebarDispatch({type:'draft-ready', changes:
   changesFromDraftEvents([])})` — an EMPTY actionable review.
3. draft-ready -> sidebar mode 'reviewing' -> `activeSubTab` (:839-848)
   auto-switches to 'changes' -> the chat section that renders
   `<WorkstateProposalCard>` (:1114-1135) UNMOUNTS. Screenshot
   `wave1-pending-card.png` shows exactly the false empty 'Apply to run'
   ChangesPanel with no card. That is the R-Defect-1 class the existing
   `result.error` guard already forbids — the same discipline was never
   extended to workstate turns.

**D1 [high] = the ONLY required fix.** FIX1 dispatched 05:50 EDT (below).

REFUTED prior suspicions (measured, keep out of the fix scope):
- ChatContextHeader focus bug: REFUTED — `wave1-tier1-focus.png` shows
  'EDITING: Step 3 — Add 180 µl Lysis Buffer' after the direct testid click;
  the trail's `12-header-after-focus=None` was my script's case-sensitive
  /WORKING FOCUS/ regex (header renders the 'EDITING' label). Run-3 script must
  match /EDITING|WORKING FOCUS/i.
- Model-compliance gap for the workstate ask: REFUTED for the last two sends
  (vw4pml/x8xfgr emitted the intent and the client compiled it). The earlier
  'open the Records tab' x4 registry diagnostic ('records' is not a registered
  surface id — surfaces.yaml lists find/run-plan/run-design/run-execute/results/
  analysis/knowledge/project/ingestion/protocol-review) is CORRECT product
  behavior; run 3 should target 'the analysis surface' or another registry id.
- Retained positives from run 2: unresolved-target sends left /api/session and
  ctxB tabs byte-equal (35/47 eq:true), network counters clean
  (draftsAccept 0, sessionPut 1 = initial load).

## FIX1 IN FLIGHT (the ONLY live worker; fleet-single honored)
- cl-coder via `hermes -p cl-coder`, bash pid **3315874** (flock 3315929 holds
  the appliance-2 lock pinned `item=PB-CH-4-fix1`; hermes child 3317367), log
  `lanes/2/logs/PB-CH-4-fix1-l2t0550.log`, worktree
  `/mnt/vast/home/brad/git/wt/PB-CH-4F-lane2-l2t0550` off trunk, prompt
  `lanes/2/prompts/PB-CH-4-fix1-l2t0550.txt` (D1 chain verbatim, RED-first test
  in AiTabPanel.workstate.test.tsx, invariants pinned, minimal-file pin),
  unique report `.hermes/plans/PB-CH-4-report-fix1.wip-l2t0550.md` IN
  WORKTREE. Exit marker: `PB-CH-4 FIX1 DONE <sha>`. Expected duration ~90 min
  (bounded fix); 2x band ~07:30, 3x ~09:00.
- NEXT TICK after exit: adversarial gate (unique review-report path, e.g.
  `.hermes/plans/PB-CH-4-review-fix1-l2t<ts>.md`) -> on ACCEPT verify myself
  (real diff, targeted app suites, app tsc file-set pin 34) -> merge --no-ff ->
  gate RUN 3 (reuse tmp-orch/gate-pbch4-run2.mjs with: header regex /EDITING|
  WORKING FOCUS/i; workstate ask keeps PRT-4iaey2; open-surface ask changes to
  'open the analysis surface') -> reviewer judges artifacts -> VERDICT accept
  -> mark PB-CH-4 done. Do NOT re-dispatch while 3315874 alive.

## QUEUE
- **PB-CH-5 spec DRAFTED + ORCH-REVIEWED** (composer exited code=0, draft
  44,849 B at 05:42; cites spot-verified by orch at 1bdba22d: StagingStore
  create-only :22-30, surfaces.yaml:57-62 no params, AnalysisPage.tsx:198-203
  coercion, FormDraftService.ts:63-67 adapter gate). OQ1/OQ2/OQ3 RULED by
  orchestrator (recorded in task block + AS-LANE2-PBCH5-OQ123-RULED). NOT
  claimed: its own gate demands branching off claim-time HEAD including the
  PB-CH-4 gate-fix chain — claim AFTER fix1 merges; promote draft to canonical
  path then, dispatch cl-coder under the fleet lock.
- PB-CH-6/8/9 gate behind PB-CH-5 (deps). PROTO-AI-13 evidence-gated: shadow
  corpus REMASURED honestly at `/home/brad/.computable-lab-lane2/shadow-router/
  events.jsonl` = **54 lines** vs pre-registered minimum 500 — still gated, no
  fake number. No other ready codables.

## Baseline facts
- Trunk HEAD 1bdba22d (code tip ed397216). app tsc pin 34 error TS (file-set);
  server tsc pin 26. PRT-4iaey2 seeded protocol (16 steps in run rail
  RUN-2026-09-19-run-vwr8). Lane AI profile qwen3.8-thunderbeast
  (qwen3.8-flash-next), lane-local.
- Registered surface ids (for gate asks): find, run-plan, run-design,
  run-execute, results, analysis, knowledge, project, ingestion,
  protocol-review. Kind 'run' is deliberately UNMAPPED in
  workstate-tab-kinds.yaml; protocol -> record-edit tab is mapped.
- cl-lane-stack.sh restart BLOCKING -> background=true; git -c
  core.fileMode=false; NEVER git add -A in coder worktrees; after merges
  re-check :3093 health + schema-dir symlinks.

## assumptions:
- NEW: AS-LANE2-PBCH4-GATE-RUN2-DEFECT-D1 (D1 = single client fix; PB-CH-4
  acceptance owed: fix1 adversarial gate + orch verify + merge + gate run 3 +
  reviewer verdict; evidence_debt TRUE), AS-LANE2-PBCH4-GATE-HEADER-CLAIM-
  REFUTED, AS-LANE2-PBCH5-OQ123-RULED, AS-LANE2-SHADOW-CORPUS-REMEASURED
  (54/500, clears prior UNMEASURED note).
- SUPERSEDES the 'gate run 1 script bugs' partial framing for the workstate
  phase only (rail + regex findings stand; the compliance-gap classification is
  replaced by D1).
- Carried (unchanged, incl. all prior evidence-debt entries — STILL OPEN):
  AS-LANE2-PBCH4-GATE-DETERMINISTIC-ORCH, AS-LANE2-PBCH4-OQ1-OQ2-RULED (code-
  level CONFIRMED; final closure awaits gate run 3), AS-LANE2-HARNESS1-ACCEPT-
  PLAN-UNRUN (OPEN), AS-PROTO-AI-12-W1 (OPEN, QAD-Q4_0 quant sha256
  3d10b6ab…), AS-LANE2-PBCH3-DEDUP-RECORD-ON-SUCCESS, AS-LANE2-DETERMINISTIC-
  GATE-RENDER, AS-LANE2-AI11-RUN4-CLAIM-REFUTED, AS-LANE2-PBCH2-LANDING-
  SEQSCHEMA, AS-LANE2-REVIEWER-AUX-COMPRESSION-PINNED, AS-LANE2-PBCH2-RECEIPT-
  ACTOR-RESOLUTION, AS-LANE2-SERVER-TSC-PIN-26, AS-LANE2-PBCH3-ACCEPT-BODY-
  FLAT, AS-LANE2-SHADOW-CORRECTED-CONFIG-PATH, AS-LANE2-WORKTREE-BOOTSTRAP-
  NODELINKS, AS-PROTO-AI-11-LANE2-STORE-SEED-TESTDATA, AS-PROTO-AI-11-AMEND-
  LOCAL-ONLY, AS-PROTO-AI-11-LBW-MATCH-REVIEW, AS-PROTO-AI-11434-VISION-
  SERVICE-ALREADY-DOWN, AS-PROTO-AI-2-C1-ANCHOR, AS-PROTO-AI-9-C5-ROLENAME,
  AS-PROTO-AI-9-LANE2CONFIG-RECREATE, AS-PROTO-AI-9-W8, AS-PROTO-AI-9-SURFACE-
  MOUNTED, AS-PROTO-AI-9-RDEFECT2-PLACEMENT, AS-PROTO-AI-9-DRAFTCHANGES-LANE-
  LOCAL, AS-PROTO-AI-9-ISOLATED-STACK, AS-PBCH7-OUT-OF-SCOPE-SESSION-AUTHZ-GAP,
  AS-PBCH1-AMBIGUITY-MINIMAL-RULE, AS-LANE2-PBCH3-WORKTREE-HOIST, AS-LANE2-
  DECISION-MD5-REGENERATION.

## Budget
Invoked ~05:30, checkpoint 06:00 — exit. Dispatches this tick: PB-CH-4 fix1
cl-coder (live, sole fleet coder, lock pinned). Work done: run-2 trail + 3
screenshots read with vision, backend.log + client-source root-cause trace
(D1), PB-CH-5 composer draft review + OQ rulings, shadow corpus measurement,
task-list claims/notes, assumptions appended. No merges (trunk unchanged).
