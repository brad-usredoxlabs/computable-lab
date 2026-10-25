# LANE 2 HANDOFF — 2026-10-25_0615 (l2t0530) — W2-11 G1 drift ROOT-CAUSED first-hand (MATRES-PANEL testid swap), SEAM A reverted on orch stack, coder W211-G1DRIFT-1 LIVE on fleet lock, private stack kept up for the post-merge determinism gate

Trunk: e1c443e2 (docs tip; code tip 0acc2141-era; no code merges this tick).
Brad's stack (:3001/:5174) untouched. Fleet coder lock HELD by THIS lane:
flock-holder pid 2218965, coder pid 2218966 (hermes -p cl-coder), pidfile
label 'W211-G1DRIFT-1-l2t0530'.

## ROOT CAUSE (first-hand, this tick) — W2-11's G1 blocker is HARNESS DRIFT
1. G1 on the orch stack (l2t0430) failed at settleThread: 'late thread remount
   wiped the chain (cards=false nonceKept=true)' then attempts 2-3 never
   re-settled. Data-drift was the open hypothesis.
2. THIS TICK ran G1 with the coder's own proven mechanics ON TRUNK
   (scripts/w211-private-stack.sh, identical bytes to the green-environment
   script, same data dir /home/brad/.computable-lab-lane2-w211,
   :3193/:5293/:43117): BYTE-IDENTICAL failure (lanes/2/logs/
   g1-private-l2t0530.log). Data drift REFUTED.
3. First-hand source diff: f57c50c9 (MATRES-PANEL §7.1-§7.3, 'sanctioned
   fold-surface swap') replaced the flat held-422 card list with
   <ClarificationPanel>; the CONTAINER testid moved pl-clarification-cards ->
   pl-clarification-panel (ClarificationPanel.tsx:147). The G1 leg queries the
   DEAD container testid at app/e2e/w2-11-campaign-demo.spec.mjs:1439 (chain-
   survival) and :1473 (render gate) -> a CORRECT fold (draw2 422 proves the
   fold works) is misread as a remount-wipe; the re-drive can never re-settle
   because the textarea still holds attempt-1's typed fixture text
   (settleThread demands the family-derived text). Per-card testid
   pl-clarification-card (:163), .pl-held-clarification-menu (:166),
   picker/[data-slash-row] surfaces SURVIVE the swap — the drift is the
   container only (orch read the full panel JSX).

## DISPATCHED (fleet-single coder, lock acquired)
- Item W211-G1DRIFT-1 (e2e-only repair, filed against the W2-11 closure
  obligation — repair inside approved scope, no new campaign).
- Contract: .hermes/plans/W211-G1DRIFT-1-fixrun.l2t0530.md (root cause +
  scope gate + never-weaken rule + honest-re-drive allowance).
- Worktree /mnt/vast/home/brad/git/wt/W211-G1DRIFT-1-lane2-l2t0530,
  branch cl/lane2-w211-g1drift-1-l2t0530 off e1c443e2, node_modules
  symlinked to trunk.
- Log lanes/2/logs/coder-W211G1DRIFT-l2t0530.log; report owed
  .hermes/plans/W211-G1DRIFT-1-report.l2t0530.md IN WORKTREE; end marker
  'W211-G1DRIFT-1 DONE <sha>'. Dispatched via systemd-run survivor unit
  (flock-wrapped). LAUNCHED ~06:05 EDT. Do NOT re-dispatch while
  2218965/2218966 alive.

## SEAM A REVERTED on the orch stack (the state-change from l2t0430 is UNWOUND)
- smallModel block DELETED from /home/brad/.hermes/cl/lanes/2/lane2-config.yaml
  (AS-LANE2-W211-SEAM-A-WIRED-ORCH-STACK CLEARED).
- Orch-stack replay producer (pid 2084407) killed; :43117 freed (the private
  stack now owns :43117 — its script binds that port).
- Stack restarted: :3093=200 (api/schemas), :5193=200. :3093 compile-path
  producer is the REAL model again.

## LIVE AT EXIT (keep)
- PRIVATE STACK UP on trunk mechanics: replay :43117 (own replay.pid),
  backend :3193, frontend :5293, data /home/brad/.computable-lab-lane2-w211.
  scripts/w211-private-stack.sh stop kills only its own pidfiles/ports. KEEP:
  it is the authorized G1 determinism + browser-gate environment (its own
  config already pins ai.smallModel -> :43117; README-replay-seam mechanics).
- Coder unit run-p2218959-i48352255 (systemd --user --collect).
- cl-l2-orproxy-l2t2130 — DO NOT stop.

## NEXT TICK (priority order)
1. If coder exited: adversarial gate FIRST (scope = its one/few commits on
   cl/lane2-w211-g1drift-1-l2t0530; report path unique suffix l2t<tick>;
   scope-gate: diff vs e1c443e2 must be ONLY app/e2e/w2-11-campaign-demo.
   spec.mjs + docs — any app/src hunk = FIX verdict). On ACCEPT: merge
   --no-ff into trunk yourself (trunk may have moved; inspect first).
2. ORCH re-runs G1 on the PRIVATE STACK against the MERGED trunk (restart the
   private stack so it serves the merged code: stop+start, then
   BASE_URL=http://localhost:5293 API_URL=http://localhost:3193
   W211_REPLAY_LOG=$WT/.run/w211/replay-requests.jsonl npx playwright test
   w2-11-campaign-demo.spec.mjs --project=chromium -g "G1" from $WT/app).
   3 consecutive green = the determinism bar re-proven at the new tip
   (deck md5 + canonical sha compare vs coder's run-N/ receipts).
3. GREEN x3 -> cl-browser-reviewer (tier ladder per SOUL 6c) on the 7
   numbered MACH-1 surfaces (spec .hermes/plans/2026-10-18_W211-MACH-1-
   golden-fixture-spec.md :339-357 verbatim) against :5293 (private stack),
   candidate = merged trunk sha PINNED + environment disclosed (replay
   producer at wire boundary, NOT model proof label REQUIRED in prompt).
   Receipts /home/brad/.hermes/cl/receipts/W211-MACH-1/<ts>/. VERDICT accept
   -> mark W2-11 DONE (closure = MACH-1 gate + QUAL-1 report already
   delivered) + private-stack stop + handoff. p_min/promotion stays Brad.
4. If coder STILL fails G1 after its repair on the private stack: drift
   hypothesis WRONG -> escalate to architect with g1-private-l2t0530.log +
   the new log as product-regression evidence (AS-LANE2-W211-G1-DRIFT
   override clause).
5. MATRES-REPLAY: Brad worksheet ruling, on-change only.

## Blockers / open obligations (carried)
- W2-11: G1 x3 + browser gate (path above, no longer open-ended — root cause
  identified, repair in flight). QUAL-1 leg MET. p_min/promotion = Brad.
- MIXFRAC-1 gate obligations carry unchanged. GAPCARD/CELLRATE main-promotion
  debts carry. W2-11 D4 naming-stability finding queued for Brad, unanswered,
  not re-asked.

## assumptions:
- NEW: AS-LANE2-W211-G1-DRIFT-MATRES-PANEL (OPEN; override clause above):
  G1 failure class = e2e harness drift from f57c50c9's sanctioned testid
  swap; repair = coder W211-G1DRIFT-1.
- CLEARED: AS-LANE2-W211-SEAM-A-WIRED-ORCH-STACK (smallModel block deleted,
  orch stack restarted real-producer, replay proc killed — l2t0530).
- CARRIED (no change): AS-LANE2-DRIVE-GAP-READING-CARDS,
  AS-LANE2-STACK-RESTART-STALE-HOLDER, AS-LANE2-EQUIPMENT-WIP-SYMLINK-RESIDUAL,
  AS-LANE2-TASKLIST-EDIT-INSERT-ONLY, AS-LANE2-ADVC-C2-PROMPTS-RATIFICATION-EMBED,
  F4-1/2/3, QUEUE-PIDWATCH-BELT, ADVC-PRESTALL-PROMPTS, D1C3-STRAY-RECEIPTS,
  QUEUELOCK-FILE-RESIDUE, FIXQUEUE-FIFO-ORDER, MENU CAND set, READCARD set,
  CHAING1C-TIER2-DIRECT, CHAIN set, APP-TSC-BASELINE, PLAYWRIGHT-EXEC-PIN,
  PANEL set, ANSWERFOLD set, SPECCOMP-EMPTYARG-QUIRK,
  ROLEAXES-COMPRESSION-EXIT-COMPLETE, BACKEND-HEALTH-ROUTE, FLOCK-NOFIFO-RACE,
  TASKLIST-STATUS-NOT-LANDED-TWICE, ATTEMPT6-TRUNK-NOFIX,
  ROWCOUNT-MATCHER-CALIBRATION, AS-LANE2-ARCH-SUPERSEDES-PRESTAGED-GATE,
  AS-LANE2-FLOCKPIDFILE-STALE-LABEL.

## live-worker checkpoint at exit (~06:15 EDT; tick started ~05:30, ~45 min)
- CODER LIVE: pid 2218966 (unit run-p2218959-i48352255), fleet lock held,
  expected ~60-90 min. Do not duplicate.
- PRIVATE STACK LIVE (:3193/:5293/:43117) — keep for the post-merge gate.
- Trunk HEAD e1c443e2; :3093 200 (real producer), :5193 200. Brad's stack
  untouched.
