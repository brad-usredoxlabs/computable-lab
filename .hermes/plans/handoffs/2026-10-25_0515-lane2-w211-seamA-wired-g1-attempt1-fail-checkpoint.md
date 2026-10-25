# LANE 2 HANDOFF — 2026-10-25_0515 (2026-10-25T05:15 EDT) — W2-11 closure leg ATTEMPTED: SEAM A wired on the orch stack, G1 ran and FAILED at settleThread (remount-wipe, orch-stack data drift class); fleet idle, ready set 0, checkpoint exit

Trunk: 0acc2141 (docs tip; code tip e86b0283). Brad's stack (:3001/:5174) untouched.
Proxy unit cl-l2-orproxy-l2t2130 active — DO NOT stop. Fleet coder lock FREE (flock -n
verified this tick; pidfile content 'l2t2350 MATRESCHAIN-FIX1' is the known stale-label
class). No live lane-2 workers (ps grep of all cl-* profiles: none).

## !! STACK STATE CHANGE (revert-aware) — READ FIRST !!
W2-11 closure requires the MACH-1 browser leg (spec §Browser gate; W211-GATE-RESHAPE
amendment: closure = MACH-1 browser VERDICT: accept + QUAL-1 report). Per the coder-authored
ORCH-OWNED seam (app/e2e/fixtures/w211-golden/README-replay-seam.md) I THIS TICK:
1. Retired the STALE GAPCARD-era replay server that squatted :43117 (pid 1035450, dead
   worktree W211-GAPCARD-1-l2t0055) and re-seated the trunk replay producer as a hermes
   background proc (proc_fe6cc79e40af pid 2084407, log trunk .run/w211/replay.log;
   /replay-health OK, fixture w211-golden-zymo-bench-prep).
2. Added the ai.smallModel block (http://127.0.0.1:43117/v1, model w211-golden-replay) to
   /home/brad/.hermes/cl/lanes/2/lane2-config.yaml (exact README block; seam verified
   first-hand at IntentCompileFromPromptHandlers.ts :86-101).
3. Restarted the lane stack; :3093/:5193 200.
THE COMPILE-PATH PRODUCER ON :3093 IS NOW THE REPLAY SERVER, NOT THE REAL MODEL. Any gate
or leg needing the real compile-from-prompt producer MUST first delete the smallModel block
and restart (README step 5). Kept wired deliberately: next-tick G1 retry is the likeliest
next action.

## RECONCILE (first-hand)
- Ready todo set: 0 (script-parsed whole list: only W2-11-ZYMO-GOLDEN-DEMO + MATRES-REPLAY
  non-done). Cheap gate 0 due/changed blockers (readiness-state.json blocked:{}).
- REVISE-GHOST-1 closed last tick (attempt-11 tier-2 accept, D3 class closed).
- MATRES-REPLAY: Brad worksheet ruling filed, on-change — not re-asked.
- W2-11 stale-precheck note (gate-14 cadence) SUPERSEDED by W211-GATE-RESHAPE (Brad
  approved 2026-10-18): do NOT re-run raw-draw gates; closure = MACH-1 browser accept
  (W28-A5D-R3 r6 accepted 10-19 but rode W2-8 A5 criteria — it did NOT cover MACH-1's
  G1 four-planted-card surfaces; no MACH-1 GATE EVER RAN on an orch stack) + QUAL-1
  baseline report (DELIVERED — orch-validated l2t0730, REPORT.md at
  lanes/2/receipts/W211-QUAL-1/2026-10-19T114301Z-l2t0645/, uiwitness leg appended;
  p_min/promotion = BRAD's call, 'p_min=__' literal intact).

## WHAT LANDED THIS TICK
1. Full reconciliation of both open items + closure-path determination above (first-hand:
   amendment header, MACH-1 spec :339-394 + :387-394 acceptance, QUAL-1 DONE note, r6
   REPORT.md containment block — all 9 r6 containment SHAs re-verified ancestors of HEAD).
2. SEAM A applied (see state change above).
3. G1 RUN 1 on the orch stack: FAILED honestly (log lanes/2/logs/g1-seam-orch-l2t0430.log):
   draw1 ask 200 through the seam (replay-requests.jsonl grew 3 entries), draw2 answered
   compile 422, then 'late thread remount wiped the chain' on every re-drive; settleThread
   expect(stable>=3) failed. SEAM PROVEN, leg not green. Cause hypothesis (screened, not
   proven): orch-stack data drift (attempt-11 OBS-2 near-duplicate treadmill) vs the
   determinism 3/3 which ran on the coder's CLEAN private stack with own data dir; the
   thread-remount class itself is the known AS-LANE2-DRIVE-GAP / late-remount family.
   NOT a criteria weakening: G1 green on an orch stack (or an authorized equivalent) is
   the remaining W2-11 obligation either way.

## NEXT TICK (priority order)
1. W2-11 G1 retry, diagnosis-first: (a) read the FULL g1-seam-orch-l2t0430.log for the
   remount-loop cadence; (b) compare against the coder's green evidence
   (wt/W211-MACH-1-lane2-l2t1210 receipts w211-mach1-l2t1740 run-1/2/3 + private-stack
   data dir) — if the difference is data-state, an authorized orch option is seeding the
   lane2 data dir toward the private stack's clean state or a bounded fresh-data orch
   stack for the gate run (harness precedent scripts/w211-private-stack.sh); (c) do NOT
   weaken settleThread; (d) if green -> dispatch cl-browser-reviewer (tier ladder) on the
   7 numbered surfaces of MACH-1 spec §Browser gate, candidate = trunk tip served sha +
   seam active flag stated in the prompt; receipts
   /home/brad/.hermes/cl/receipts/W211-MACH-1/<ts>/. ACCEPT -> mark W2-11 done (closure
   consumes MACH-1 gate + QUAL-1 report) + REVERT the smallModel block + restart.
2. If G1 fails a SECOND time on the orch stack with the same settleThread signature:
   that is two attempts same class -> change approach per persistence: the private-stack
   route (scripts/w211-private-stack.sh on trunk, own data dir) is the coder-proven
   deterministic environment; run G1 there, and if green, gate the browser leg there
   (:5293) with the served-sha pin, disclosing the environment in the reviewer prompt.
3. MATRES-REPLAY: Brad worksheet ruling, on-change only. After G1 closes W2-11: REVERT
   the config block if no gate pending + stop replay proc proc_fe6cc79e40af.

## Blockers / open obligations (carried)
- W2-11: MACH-1 browser gate never run on an orch-grade stack (this tick's G1 attempt 1
  failed at settleThread); QUAL-1 leg MET (report delivered); p_min/promotion = Brad.
- MIXFRAC-1 gate obligations carry unchanged. GAPCARD/CELLRATE main-promotion debts carry.
- MATRES-REPLAY worksheet ruling: Brad's, filed, on-change.
- W2-11 D4 naming-stability finding: queued for Brad (gate-14 evidence), unanswered,
  not re-asked.

## assumptions:
- NEW: AS-LANE2-W211-SEAM-A-WIRED-ORCH-STACK (OPEN, evidence-debt FALSE, reversible true):
  :3093 compile-path producer is the :43117 replay server (lane2-config.yaml smallModel
  block, README-replay-seam.md step 2, applied this tick). Affects: every
  compile-from-prompt call on :3093 replays the frozen fixture instead of calling a model.
  Cleanup: delete block + cl-lane-stack.sh 2 restart (README step 5). MUST be reverted
  before any real-producer gate (stated above and in every handoff until reverted).
- CARRIED (no change): AS-LANE2-DRIVE-GAP-READING-CARDS, AS-LANE2-STACK-RESTART-STALE-HOLDER
  (re-spawned evidence this tick: GAPCARD-era replay server squat :43117 killed+re-seated),
  AS-LANE2-EQUIPMENT-WIP-SYMLINK-RESIDUAL, AS-LANE2-TASKLIST-EDIT-INSERT-ONLY,
  AS-LANE2-ADVC-C2-PROMPTS-RATIFICATION-EMBED, F4-1/2/3, QUEUE-PIDWATCH-BELT,
  ADVC-PRESTALL-PROMPTS, D1C3-STRAY-RECEIPTS, QUEUELOCK-FILE-RESIDUE, FIXQUEUE-FIFO-ORDER,
  MENU CAND set, READCARD set, CHAING1C-TIER2-DIRECT, CHAIN set, APP-TSC-BASELINE,
  PLAYWRIGHT-EXEC-PIN, PANEL set, ANSWERFOLD set, SPECCOMP-EMPTYARG-QUIRK,
  ROLEAXES-COMPRESSION-EXIT-COMPLETE, BACKEND-HEALTH-ROUTE, FLOCK-NOFIFO-RACE,
  TASKLIST-STATUS-NOT-LANDED-TWICE, ATTEMPT6-TRUNK-NOFIX, ROWCOUNT-MATCHER-CALIBRATION,
  AS-LANE2-ARCH-SUPERSEDES-PRESTAGED-GATE, AS-LANE2-FLOCKPIDFILE-STALE-LABEL.

## live-worker checkpoint at exit (~05:15 EDT; tick started ~04:30, ~45 min)
- NO coder/gate workers. LIVE: replay producer proc_fe6cc79e40af (pid 2084407, :43117,
  trunk .run/w211/, log .run/w211/replay.log) — KEEP for next-tick G1 retry.
- LIVE INFRA: cl-l2-orproxy-l2t2130 (DO NOT stop).
- Trunk HEAD 0acc2141; :3093 200, :5193 200, SEAM A ACTIVE. Brad's stack untouched.
