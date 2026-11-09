# Handoff — lane 1 tick 2026-10-29 05:20-06:10 · GC-13 browser gate returned FIX — D1/D2 fixture repairs APPLIED by orch — gatefix coder queued — GC-12 minorfix cycle-2 FIX → M3 queued — 153rd

## Reconciliation (first-hand)

- Slot-0 pid file GC12MINFX 2913888: inner COMPLETED 04:44:43 rc=0, coder died after writing
  `GC12 MINORFIX DONE e4be52813c...` (full sha == worktree tip, tree clean apart from the 3
  node_modules symlinks). Slot-1 WELLSET 2617985 inner DEAD (lane-2's; stale pid file harmless —
  queues treat dead pid as expired). No fleet cl-coder live at checkpoint; two lane-2 cl-worker
  systemd units live on thunderbeast (out-of-band, THREADSCOPED1-fix1 l2t0505, WELLSET-fix1
  l2t0510) — invisible to slot locks, visible to the process-floor stagger gate.
- Waiter l0342 auto-fired the GC-12 minorfix cycle-2 DELTA adv gate at tip e4be5281 (04:44:57,
  finished 04:49): VERDICT fix — 3 code minors + 1 report-hygiene minor (reviews at
  /home/brad/.hermes/cl/reviews/GC12dirfix-advreview-l0342-c2.md; reviewer independently
  reproduced REDs, closed the two prior-cycle defects).

## GC-13 browser gate — VERDICT: fix (receipts GC-13/20261029T0355-gate1/, tier-1, real trail+shots)

G1 PASS · G2 FAIL (D1) · G3/G4 UNTESTED (dep G2) · G5 BLOCKED (D1+D2) · G6 PASS-with-defects
(D3/D4) · G7 FAIL (D5) · G8 FAIL (D6). Candidate b89a44d1 verified served. Two trails because
the fixture ACLs split visibility across identities.

## Orchestrator repair — D1 + D2 were FIXTURE/ACL problems, and I owned them (all TEST data)

Applied via the live API (never hand-forced files; both identities' reads re-probed after):
1. D2 FIX (ACL split): editor grants USR-LOCAL-ADMIN added to ACL-ISEN-D2K8O6, ACL-ISEQ-D2K8O6,
   ACL-RUN-GC-12-REGATE2-SHEET-2026-D2K8O6 (all PUT as USR-BRAD, owner). Admin now sees the GC
   sheet chain (ISEQ list total 0->1, ISEN/RUN 404->200).
2. D1 FIX (AOUT-000020 unreachable): TEST bridge — ISEN-d2k8o6.analysisRunRefs gains ANR-000013
   (the run that declares AOUT-000019/20/21), PUT as owner USR-BRAD; readback confirms the ref
   list now ends ANR-000013. The reviewer's own resolution option 1 ("orch-authorised TEST
   bridge"), not a G2 weakening.
3. G5/G6/G7 loop closure: editor grants USR-BRAD added to all seven ACL-*-TEST-GC13-214258
   policies (owner USR-LOCAL-ADMIN minted them). USR-BRAD now reads the whole chain: sheet chain
   AND TEST chain AND AOUT-000013 outputs — a SINGLE identity (USR-BRAD) can walk G1->G8 end to
   end. Verified 200s across all six probe records.
No schema/YAML changed — no stack restart needed (records are store-side, live immediately).

## GC-13 gatefix coder — QUEUED (queue-GC13gatefix-l1t0500.sh, inner 3039673, unit run-p3039671)

- Fresh worktree /mnt/vast/home/brad/git/wt/gc-13-gatefix-lane1-l1t0500 off trunk efed08f5
  (contains merge b89a44d1); node_modules symlinked per house pattern; worktreeConfig excludes.
- Brief prompts/coder-GC13-gatefix-l1t0500.txt: D3 (ClaimWorkspace stance/kind label run-on),
  D4 (record links lack affordance), D5 HIGH (reciprocal claim->run lands on plate-design canvas
  for an analysis-run — smallest honest route: existing surface/route reuse, stop boundary =
  requires-rescope, NO new surface), D6 (only console errors originating in GC-13 files).
- Report gc13-gatefix-report-l1t0500.md, DONE marker 'GC13GATEFIX DONE <full-sha>'.
- Fleet stagger wall newest-stamp = GC12MINFX 04:24:29 (kept in the pid file — queue no longer
  deletes it; that rm would have erased the stamp for the next queue: harness fix).
  Expected launch ~05:24-06:00.
- PITFALL LEARNED: systemd-run transient units kill setsid'd children on main-exit (first
  launch's inner died silently, log empty). Launch queues with
  `systemd-run --user --collect -p KillMode=process ... <script> --inner` (inner IS the unit).

## GC-12 minorfix cycle-3 — QUEUED (queue-GC12minorfix3-l1t0530.sh, inner 3042881, unit run-p3042880)

Adv c2 minors (verbatim in brief prompts/coder-GC12minorfix3-l1t0530.txt): M3-1 busy-note never
cleared on settle (GcAttachPanel), M3-2 failure arm keyed on message truthiness (Error('')
falls to the empty-state lie), M3-3 Promise.all misattributes equipment-only failure to
gc-methods, M3-4 report RED sections need command lines. S-1 (CSS scope finding) explicitly NOT
a defect. SAME worktree wt/gc12-dirfix-lane1-l1t2250 @ e4be5281, report
gc12-dirfix-minorfix3-report-l1t0530.md, marker 'GC12 M3 DONE <full-sha>'. Queues serialize on
the two slot locks; whichever stagger opens first wins; both carry the process-floor gate.

## NEXT TICK — in order

1. Poll logs/coder-GC13gatefix-l1t0500.log + logs/coder-GC12minorfix3-l1t0530.log for
   LOCK-ACQUIRED / CODER_EXITED / REPORT COMPLETE. On each DONE+full-sha-tip: waiter pattern has
   no auto-adv for these two — DISPATCH cl-adversarial-reviewer MANUALLY (GC13 gatefix: delta
   efed08f5..HEAD, spec .hermes/plans/2026-10-30_GC-13-evidence-assertion.md + gate report;
   GC12 M3: delta e4be5281..HEAD, reviews dir new path). ACCEPT -> orch self-verify (app vitest
   src/claims src/run; tsc 21-line baseline; M3: server untouched) -> merge.
   GC-13 gatefix merges into trunk; GC-12 M3 merges wt/gc12-dirfix-lane1-l1t2250 (re-probe
   merge-tree at final tip).
2. RE-GATES after merges (both are UI): restart lane stack only if YAML in diff (neither should
   be); GC-13 re-gate G1-G8 against trunk tip — the fixture repairs above are ALREADY applied;
   dispatch as a SINGLE-identity USR-BRAD run (G5 now has a reachable path: hand-off from the
   AOUT chips of ANR-000013 on /runs/RUN-gc-12-regate2-sheet-2026-d2k8o6) — and G7 both
   directions on whatever D5's fix lands as. GC-12 V7+regate criteria clears AS-L1T1940-2 +
   AS-L1T2015-1. Receipts dirs GC-13/<ts>-gate2 and GC-12/<ts>.
3. If GC13 gatefix returns requires-rescope on D5 (no honest reuse route): route to architect
   with the gate report + coder evidence; do NOT accept a G7 that stays a dead-end.
4. GC-14 promotion stays gated on GC-13 browser-accept + GC-12 merge. Draft
   drafts/2026-10-28_GC-14-acceptance-dossier.l1t1640.draft.md needs the re-anchor banner
   (post-GC-13 cites) + native_draft vitest#5285 green-first clause + QUALITATIVE-default OQ-3
   fold before promotion (carried from 152nd).
5. Ops notes: queues must NOT rm the slot pid file on exit (stagger stamp); systemd-run needs
   KillMode=process + --inner as the unit's main; reviews land in ~/.hermes/cl/reviews/ (not
   lanes/1/reviews/); waiter DONE lines need FULL sha.

## assumptions:

- AS-L1T0530-1 (orch): the D1/D2 fixture repairs (mutual TEST-identity grants + ISEN-d2k8o6 ->
  ANR-000013 TEST bridge) are orchestrator-owned lane-fixture work per the gate's own D1
  resolution option 1, TEST data only (standing ruling), no product-code or criteria change.
  evidence_debt=false (all mutations read back 200 through the live API).
- AS-L1T0530-2 (orch): the two coder queues cannot duplicate — dup-guards match unique prompt
  tokens against python hermes procs, slot locks serialize, and the process-floor stagger gate
  covers lane-2's out-of-band thunderbeast workers. evidence_debt=false at write time; re-verify
  LOCK-ACQUIRED lines next tick.
- AS-L1T0530-3 (orch): GC-13's G2..G5 will re-exercise cleanly once D5's coder fix lands + merges
  — UNTESTED until gate2 renders verdicts; carried as gate-open, not as passing.
  evidence_debt=true — cleared by the GC-13 gate2 receipts.
- Carried open: AS-L1T1940-2 + AS-L1T2015-1 (clear at the GC-12 browser re-gate),
  AS-L1T0100-4 (gcEvidenceSources.ts pairing — RATIFIED at GC-13 adv c3 accept + gate G6 pass;
  CLOSE IT at GC-13 done), AS-L1T0400-2 (clears if gate2 readback succeeds; the reviewer used
  API readbacks already).
