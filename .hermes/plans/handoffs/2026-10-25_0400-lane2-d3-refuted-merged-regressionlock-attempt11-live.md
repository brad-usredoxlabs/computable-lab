# LANE 2 HANDOFF — l2t0315 (2026-10-25T04:00 EDT) — D3 REFUTED as server class (c5 + orch replay), regression lock merged e86b0283, attempt-11 gate LIVE (tier-2), checkpoint exit

Trunk: code tip e86b0283 (fix4 regression lock merged --no-ff this handoff). Stack :3093
/api/health 200, :5193 200, served checkout = trunk @ e86b0283 (test file present). Brad's stack
(:3001/:5174) untouched. Proxy unit cl-l2-orproxy-l2t2130 active — DO NOT stop.
Fleet coder lock FREE (fix4 exited 02:57:50; no queued units).

## RECONCILE (first-hand)
- fix4 (unit cl-l2-rg1-fix4-l2t0040, coder child 1504529): EXITED rc=0 02:57:50. NO report file
  (appliance-2 output-cap class again; INFRA, not a code defect — evidence burden transferred).
  Worktree wt/REVISE-GHOST-1-lane2-l2t2050 clean; delta c5f76b49..dea3d3a5 = ONE test-only commit
  (+224, AIHandlers.foldStreamTerminal.test.ts), zero product lines; scratch __debug_fold did NOT
  survive (verified: find + log --stat). No duplicate dispatch was made while it was live.
- Ready todo set: 0. In-progress: W2-11-ZYMO-GOLDEN-DEMO (waiting its own gate cadence),
  MATRES-REPLAY (Brad worksheet ruling filed — do NOT re-ask), REVISE-GHOST-1 (this item).
  Cheap gate 0 due/changed blockers. no-work.log NOT appended (real recovery work done).

## WHAT LANDED THIS TICK
1. ADVC CYCLE-5 (cloud, unit cl-l2-advc-revise-ghost-c5-l2t0315, EXITED rc=0 ~03:27):
   VERDICT fix with exactly two defects: (1) [blocker, mandate non-conformance] the mandated RED-
   at-base + smallest fix DO NOT EXIST — D3 is REFUTED, not closed; remedy = explicit ORCH
   reclassification, then the regression lock is the correct artifact (NO code). (2) [major] the
   gate's user-visible symptom (pane stranded UPDATING after fold) is unclosed by executed
   evidence — remedy = one browser re-gate polling past 2x elapsedMs, send ledger to 2.
   Reviewer ran myore: test PASSES at HEAD and at base; mutation control proves the lock has
   TEETH (injected hypothesised arm in a scratch copy -> fails at T1); full-suite fail-set a
   strict SUBSET of base; tsc 0; scope audit clean.
2. ORCH RULING (this tick, execution-level within approved acceptance per persistence routing;
   NOT a domain-policy change): D3 RECLASSIFIED server-SSE-non-termination -> HARNESS/CLIENT-
   INFLIGHT ARTIFACT. Independent corroboration I produced myself:
   scripts/replay-fold-serverterm-l2t0315.py (never-aborting python client, canonical utterance,
   answers 5/5) -> evidence/fold-serverterm-2026-10-25T07-26-18: BOTH fold-window requests
   req-r9/req-ra have matching 'request completed' lines, client-side EOF True. attempt-10's
   req-2m missing-completion = fastify client-abort signature. First run (07-23-14) same shape.
   The fold fell to extraction re-ask (arm=slot-not-string role-gap) — the known out-of-remit
   ANSWERFOLD role-gap jurisdiction, already ruled, not a D3 relapse.
3. MERGED --no-ff dea3d3a5 -> trunk e86b0283 (test-only; no YAML => no stack restart needed).
   Self-verify before merge: foldStreamTerminal 1/1 (my own vitest run cwd=server), tsc -p .
   zero lines at HEAD AND trunk.
4. Gate prompt filled + dispatched: prompts/gate-REVISEGHOST1-a11-l2t0315.txt (CANDIDATE
   e86b0283fbb09a5b81e7c67eaba3a37d8b5692c7; appended ORCH RULING ON D3 block making advc-c5
   defect 2 the binding proof: patient polling, never measure/close mid-turn; genuine-client-
   strand condition preserved verbatim as the re-open clause). Tier-2 cloud per the 6c ladder.
5. Task-list tick note inserted under REVISE-GHOST-1 (queue lock held, insert-only).

## NEXT TICK (priority order)
1. attempt-11 gate exit? (log logs/gate-REVISEGHOST1-a11-l2t0315.log 'EXITED rc='; report.md in
   /home/brad/.hermes/cl/receipts/REVISE-GHOST-1/2026-10-25-attempt11/ ending VERDICT: accept|fix|
   blocked). Read trail.jsonl FIRST: the a4-fold-re-hold-recovery step is the D3-class binding
   measurement; verify the fold-turn reqId has BOTH incoming AND request completed; verify the
   driver did not close the page mid-turn (last-step timestamp vs fold elapsedMs).
   - accept + A1/A2 ghosts measurements real -> self-verify served revision contained e86b0283
     during the run -> mark REVISE-GHOST-1 done + final handoff (carried acceptance-debt note:
     attempts 6-10 partial evidence).
   - fix naming a CLIENT arm (cards=0 chatInput=0 honestWall=0 WITH done-line + completed req) ->
     D3 re-opens genuine-client class: fix run 5 app-leg dispatch (fleet flock, same worktree/
     branch) + app-leg trace rule (report must carry the client-strand trace).
   - second fix verdict on the D3 class WITHOUT new evidence -> architect with c5 + attempt-11
     packs (cycle cap).
   - died with no trail -> tier ladder per 6c (tier-3 only if OpenRouter unavailable); suspect
     the harness, not the UI.
   Expectation: ~30-40 min (gate history a9/a10); 2x ~04:35, 3x ~05:15 (rule 7b — at 3x with no
   trail motion, re-shoot at a different tier after confirming the unit is dead).
2. Fleet coder lock is FREE and ready set is 0 — do NOT invent work; W2-11 and MATRES-REPLAY own
   their next steps (W2-11: precheck stable-subset then gate-14 cadence; MATRES-REPLAY: Brad's
   worksheet ruling, on-change).
3. Standalone candidate still unfil ed (file after a11): composition reading-card testid selector
   mismatch (readingOptions render as buttons, [data-testid^=reading-option-] finds 0).

## Blockers / open obligations (carried)
- REVISE-GHOST-1: in-progress; sole gate = browser F1/F2 accept (attempt-11 live). attempt-6/7/8
  acceptance debt carries; a9 = D1/D2 fix-class evidence (code-merged); a10 = D3 evidence
  (NOW reclassified harness/client-inflight per c5 + orch replay); a11 = binding D3 end-state.
- MIXFRAC-1 gate obligations carry unchanged. GAPCARD/CELLRATE main-promotion debts carry.
- MATRES-REPLAY worksheet ruling: Brad's, filed, on-change — silence is not approval.

## assumptions:
- CLEARED/CLOSED THIS TICK: AS-LANE2-FIX4-SSE-SUSPECT-SCREENED (CLOSED FALSIFIED),
  AS-LANE2-D3-PREMISE-FALSIFIED-SCREENED (CLEARED — adversarially reproduced by c5 + orch replay).
- NEW: AS-LANE2-D3-CLIENT-INFLIGHT-SCREENED (OPEN, evidence-debt TRUE): the attempt-10 strand is
  attributed to mid-fold sampling + page close; attempt-11's patient-poll receipts adjudicate. Do
  NOT weaken A4 — if it strands with a completed request it re-opens as a real client defect.
- CARRIED (no change): AS-LANE2-DRIVE-GAP-READING-CARDS, AS-LANE2-STACK-RESTART-STALE-HOLDER,
  AS-LANE2-EQUIPMENT-WIP-SYMLINK-RESIDUAL, AS-LANE2-TASKLIST-EDIT-INSERT-ONLY,
  AS-LANE2-ADVC-C2-PROMPTS-RATIFICATION-EMBED, F4-1/2/3, QUEUE-PIDWATCH-BELT,
  ADVC-PRESTALL-PROMPTS, D1C3-STRAY-RECEIPTS, QUEUELOCK-FILE-RESIDUE, FIXQUEUE-FIFO-ORDER,
  MENU CAND set, READCARD set, CHAING1C-TIER2-DIRECT, CHAIN set, APP-TSC-BASELINE (23 lines,
  comm-diff discipline), PLAYWRIGHT-EXEC-PIN, PANEL set, ANSWERFOLD set,
  SPECCOMP-EMPTYARG-QUIRK, ROLEAXES-COMPRESSION-EXIT-COMPLETE, BACKEND-HEALTH-ROUTE,
  FLOCK-NOFIFO-RACE, TASKLIST-STATUS-NOT-LANDED-TWICE, ATTEMPT6-TRUNK-NOFIX,
  ROWCOUNT-MATCHER-CALIBRATION, AS-LANE2-ARCH-SUPERSEDES-PRESTAGED-GATE,
  AS-LANE2-FLOCKPIDFILE-STALE-LABEL.

## live-worker checkpoint at exit (~03:55 EDT; tick started ~03:11, ~45 min)
- LIVE: browser gate attempt-11 (unit cl-l2-gate-revise-ghost-a11-l2t0315, tier-2 cloud
  deepseek-v4.1-flash, started 03:34; log logs/gate-REVISEGHOST1-a11-l2t0315.log; receipts
  /home/brad/.hermes/cl/receipts/REVISE-GHOST-1/2026-10-25-attempt11/). NOT killed. No fleet coder
  live; fleet lock free.
- LIVE INFRA: cl-l2-orproxy-l2t2130 (Restart=always; DO NOT stop).
- Trunk HEAD e86b0283; :3093 200, :5193 200. Brad's stack untouched.
