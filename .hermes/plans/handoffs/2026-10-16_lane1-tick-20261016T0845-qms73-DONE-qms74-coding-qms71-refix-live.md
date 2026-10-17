# Handoff — lane 1 tick 2026-10-16 06:20–08:50 EDT (QMS7-3 DONE full live gate; QMS7-9 DONE; QMS7-4 CODING; QMS7-1 refix gate live)

Author: orchestrator cron tick — lane 1. :3001/:5174 never touched.
Trunk cl/integration-1 tip: f7ad6700 (code tips: 8b6c5ff6 = QMS7-1 fix1 merge, fedbc17c = QMS7-3
merge). porcelain -uno clean. Lane stack RESTARTED after both schema-YAML merges
(logs/stack-restart-l1t0805.log, backend READY http 200); :3092 + :5192 healthy.

## DONE this tick

- **QMS7-9 DONE** (prior handoff carried it; finalized here): crit-5 tier-2 gate VERDICT: accept
  — receipts 20261016T061351-crit5-tier2 (I re-read trail.json: in-study uploadButton domCount 0
  x2 passes incl. full reload, positive-control standalone =1). All 5 criteria receipted
  (round-1 dir 20261016T045057 = 1-4). Marked done in THE LIST.
- **QMS7-3 DONE**: adv-review round 2 ACCEPT (reviews/qms7-3-advreview2-l1t0745.md — both round-1
  defects closed, pins non-vacuous). MY verify: fix diff == 2 owned files; full item diff vs
  7137b1c0 = 16 files +1331 in ownership; KindLifecycleRegistry+registryOpsLifecycle 33/33 MY
  run. Merged no-ff fedbc17c. LANE RESTART. LIVE GATE on :3092 (orchestrator-run, spec §live):
  POST equipment-class -> registry-ops/draft stamped generically; PUT draft->active 200 as
  USR-QMS-ADMIN; undeclared active->draft -> generic LIFECYCLE_TRANSITION_DENIED wording;
  USR-BRAD -> FORBIDDEN at ACL; controlled-document kinds still document-controlled-signing.
  Probe EQC-LIVEGATE-QMS73 left ARCHIVED (terminal, readable — ruling-B residue, test data).
- **QMS7-1 fix1 merged** (8b6c5ff6): adv-review ACCEPT (reviews/qms7-1-fix1-advreview-l1t0745.md);
  MY verify: diff = exactly schema enum +1 line & test +27 lines; session suites 9/9 MY run.
  Live proof by me: PUT /api/session kind registry -> HTTP 200 + round-trip on :3092 post-restart.
- **QMS7-4 spec PROMOTED** (f7ad6700): composer retry draft reviewed; all load-bearing claims
  verified by me (29 seed files, zero lifecycleId, `model` defect, modelFamily declared at
  equipment-class.schema.yaml:33); OQ1/OQ2/OQ3 ruled (recommendations approved; recorded in the
  spec's promotion block).

## LIVE at checkpoint (do not duplicate)

1. **QMS7-4 CODER** — wrapper pid 3558038 HOLDS the fleet lock (flock + pidfile
   QMS74/dispatch-pid discipline), worktree /mnt/vast/home/brad/git/wt/QMS7-4-lane1-l1t0830
   (branch same, base f7ad6700, node_modules symlinked), log
   /home/brad/.hermes/cl/lanes/1/logs/coder-QMS74-l1t0830.log, prompt
   prompts/coder-QMS74-l1t0830.txt, report qms7-4-report-l1t0830.md, end-line `QMS7-4 DONE <sha>`.
   Expected duration ~2h (QMS7-3 class). On exit: adv-review (unique path
   reviews/qms7-4-advreview-l1t<ts>.md, worktree diff f7ad6700...HEAD, bait list in spec) ->
   verify -> merge -> RESTART -> run spec live-gate LG1-LG11 (grants ready, see below).
2. **QMS7-1 session-fix RE-GATE** — cl-browser-reviewer tier-1 pid 3561856, log
   logs/browergate-QMS71-refix-<ts>.log, receipts ~/.hermes/cl/receipts/QMS7-1/*-session-fix-refix/,
   prompt prompts/browergate-QMS71-refix-l1t0845.txt. Narrow: session PUT 200 x2 passes + zero
   4xx/console-errors on /registry (C1-C5 rest on the tier-2 dir 20261016T060112). On accept ->
   mark QMS7-1 done + obligation closed. On fix -> fleet queue (coder busy until QMS7-4 exits).
3. **QMS7-4 composer (old, hung)** pid 2968765: superseded (retry draft landed + promoted). Left
   alive per no-kill protocol; ignore its state; if it ever writes the draft path, the promoted
   spec (f7ad6700) is canonical, diff before ever adopting anything.

## Lane data state (lane1 = /home/brad/.computable-lab-lane1)

- GRANT-QMS7-REGOPS: minted with WRONG lifecycleId binding (document-controlled-signing) ->
  inert for registry-ops; role-grants are lifecycle-immutable (LIFECYCLE_IMMUTABLE proven live).
- GRANT-QMS7-REGOPS2: lifecycleId registry-ops, roles [author, approver], USR-QMS-ADMIN — the
  working grant; QMS7-4 live gate LG7 (archive EQC-QUANTSTUDIO5) can run with it.
- EQC-LIVEGATE-QMS73 exists ARCHIVED (gate probe; test data).
- NOTE for QMS7-4 live gate LG6/LG9: seed-resolved records have no meta.contentSha-style edit
  path; EQC-QUANTSTUDIO5 IS a promoted working copy in the lane (QMS7-2), so it is migratable.

## Next tick (ordered)

1. QMS7-1 refix verdict -> accept: mark done (+close its open browser obligation); fix: queue
   coder behind QMS7-4.
2. QMS7-4 coder on exit -> adv-review -> verify -> merge -> restart -> LG1-LG11 live gate ->
   done (no browser gate: server-only). Watch bait #4 hard: the runner must name the LANE dir.
3. QMS7-4 done -> commission QMS7-5 composer (deps QMS7-1/2/3 all done at that point; QMS7-5 is
   UI: Create-per-tab + reliable save + dead CSV chrome removal) while fleet lock frees.
4. OWN-14/OWN-12 silent md5 protocol (last check 06:25, unchanged: 1f41d881).

## Evidence-debt / carried (OPEN unless stated)

- CLOSED: QMS7-9 browser gate (both dirs); QMS7-3 (live-gate evidence in its done block).
- OPEN: AS-ORCH-L1-042; AS-ORCH-L1-068 (OWN-14's gate); AS-ORCH-L1-082 (record-only);
  AS-ORCH-L1-087 PARTIAL; AS-ORCH-L1-088; AS-ORCH-L1-089; AS-ORCH-L1-096; AS-ORCH-L1-097;
  AS-ORCH-L1-099; AS-ORCH-L1-101.
- CARRIED: AS-ORCH-L1-100 (seed model key — being RESOLVED by QMS7-4 coder now);
  AS-ORCH-L1-102 (full-app fail-set drift note).
- QMS7-1 browser-gate obligation: final refix gate LIVE (pinned above; revision = merge
  8b6c5ff6 served on the restarted :5192 — vite serves the trunk worktree, verified via the
  200-response live probe against :3092 + schema on disk).

## assumptions

- AS-ORCH-L1-113: QMS7-3 live gate's grant-binding discovery (grants filter by lifecycleId at
  RoleResolver.ts:23-24) was handled by RE-MINTING GRANT-QMS7-REGOPS2 instead of any code change
  (lane data, test data, reversible: delete the record). The original GRANT-QMS7-REGOPS is inert
  but retained (append-only immutability; notes on REGOPS2 record the correction).
- AS-ORCH-L1-114 (small): QMS7-1 refix gate run at tier-1 (local slot free; the defect it
  verifies is mechanically simple; ladder rule applies to infra-loss retries, not first shots of
  narrowed re-gates).
- AS-ORCH-L1-115: QMS7-4 coder dispatched on the fleet lock held by MY wrapper process rather
  than the queue-script pattern (lock free at dispatch; pidfile names QMS74 + dispatch-pid so
  lane-2 queues see it honestly). Reversible.
