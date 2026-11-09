# Lane-2 handoff — tick l2t0035 (2026-10-27 ~00:40 EDT) — 144th — RESUME + ADVC DISPATCH

## HEADLINE
Two recoveries fired: (1) L2-SUITE-A run-1 DIED 00:11 on engine-admission class
('inference request expired while waiting for admission' x3; second fleet-wide sighting of
the class) — ZERO commits lost, M0-M4 WIP survives untracked, RESUME dispatched on fleet
SLOT 0 (queue unit cl-l2-suitea-resume1-l2t0035, coder pid 303970 started 00:38:52, hermes
child 303973, --reasoning low). (2) MATRES-VERDICT fix1 worker confirmed DEAD with report
'STATUS: complete' — adopted and ADVC CYCLE-2 fired from the staged prompt (cloud
OpenRouter, unit cl-l2-advc-matres-c2-l2t0035, report owed
reviews/MATRES-VERDICT-advc2-l2t0035.md).

## LIVE AT EXIT (do not duplicate)
- L2-SUITE-A RESUME — cl-coder fleet slot-0, flock holder 303970, hermes child 303973.
  Worktree wt/L2-SUITE-A-lane2-l2t2255 branch cl/lane2-suite-a-l2t2255 (still zero commits
  at dispatch). Log lanes/2/logs/coder-L2SUITEA-resume1-l2t0035.log, report
  deliverables/L2-SUITE-A-report.l2t2255.md (SAME path, append). Prompt
  prompts/coder-L2SUITEA-resume1-l2t0035.txt: commit-WIP legs A/B, M4 vitest parity GREEN
  (server/src/ai/L2SuiteA.honestOutcome.parity.test.ts 204 lines), M5 --single smoke vs
  :3093, opportunistic --all; marker 'SUITEA DONE <sha>'. 2x watch ~02:10, 3x ~03:40.
  SECOND same-class admission death => engine-load question to infra (NInfer 2-stream
  admission), NOT another blind resume. Worktree carries 3 FOREIGN untracked files (2
  MATRES DRAFT specs, 1 handoff) + reviews/ — must stay out of SUITE-A commits.
- MATRES-VERDICT ADVC CYCLE-2 — cloud OpenRouter reviewer, unit cl-l2-advc-matres-c2-l2t0035,
  log logs/advc-MATRESVERDICT-c2-l2t0035.log, report reviews/MATRES-VERDICT-advc2-l2t0035.md.
  Scope 17761e68...HEAD (e2edc287 = D1-D12 remediation; orch verified clean tree + purity:
  38 files, ALL under .hermes/plans/replay-verdict/). On ACCEPT: orch self-verify (F1-F6
  spot-checks, run-verdict.sh double-run determinism, AC1-NOT-MET line present) -> merge
  --no-ff docs-only -> ELIG/PANEL inputs (E1-E12 + D5 blacklist finding) into next campaign
  spec. Second 'fix' = cycle cap -> architect with both defect lists.
- Fleet slots: slot-0 HELD by 303970 (SUITE-A resume). slot-1 HELD by lane-1 GC5 fix1
  (pid file 176148 stale-named; live flock holder is lane-1's — cross-lane FIFO governs).

## QUEUE / NEXT TICK
1. On MATRES advc2 report: ACCEPT -> self-verify -> merge --no-ff (docs-only, no restart
   needed) -> mark MATRES-REPLAY verdict leg's replay/verdict portion satisfied; ELIG/PANEL
   inputs to next campaign. FIX -> cycle cap: architect with BOTH defect lists
   (advc1 reviews/MATRES-VERDICT-advc1-l2t2205.md + advc2), decision path
   decisions/MATRESVERDICT-c2-cap-l2t<tick>.md.
2. On SUITE-A exit: grep log for admission-class markers first; 'SUITEA DONE <sha>' ->
   advc gate -> orch self-verify (vitest parity re-run, tsc sorted-diff vs baseline,
   diff --stat, prompts byte-parity sha pair, index-integrity sanity
   `git diff d037ade9...HEAD --stat`) -> merge --no-ff -> orch layer-(b) browser leg + live
   --all replay -> browser gate receipts before done -> THEN claim L2-SUITE-B (fold composer
   OQ recommendations from specs-draft/2026-10-26_L2-SUITE-B-prompt-sequence-leg-DRAFT.l2t0511.md,
   reconcile OQ numbering at promotion, mafft provisioning AS-L2T0755-MAFFT-USERPROVISION).
3. Brad sweep: MOUNT-NONEVENT-1 AWAITING-BRAD unchanged, not re-asked. No new Brad files.
4. Post-SUITE-A small-item candidates still unfiled (from regate3): O2 MEDIUM picker
   mouse-intercept; O1/O3/O4 LOW; thread-hygiene leg. New scope => architect amendment +
   Brad; do not dispatch as tasks.

## HEALTH
:3093 http=200, :5193 http=200 (stack status). Trunk tip 84bac095 (docs). computable
vision slot free. Thunderbeast: orch only (MATRES worker done). OpenRouter ok (advc2
using it). appliance-2 engine: BOTH live slots busy — admission deaths are load-correlated.

## ASSUMPTIONS
NEW: AS-L2T0035-SUITEA-RESUME-CLAIMS-WIP (resume treats WIP as shape-not-authority; closes
at advc gate). AS-L2T0035-MATRES-FIX1-ADOPTED-ON-REPORT (retires at advc2 ACCEPT or cap).
CARRIED OPEN: AS-L2T2350-SUITEA-INDEX-REBUILD (closes at gate diff --stat sanity),
AS-L2T2255-GATE-CLOSED-VIA-KEYBOARD-PATH (Brad can re-open via O2 ruling),
AS-L2T2255-SUITEA-SLOT0 (closes at merge), AS-L2T0511-CHAT1-RUN5-REASONING-LOW,
AS-L2T0430-CODER-COMPRESSION-FIX, AS-L2T0715-REPLAY-GATE-MISREAD,
AS-L2T0210-TERM1-SCOPE-AMEND-MATERIALPICKER, AS-L2T0135-CHAT1-RUN1-ENGINE-400,
AS-L2T0135-FREEFORM-SPEC-RATIFIED, AS-L2T0035-UC-SPECS-ORCH-AUTHORED,
AS-L2T0035-TERMCHAT-ZONE-SPLIT, AS-L2T0315-SUITEA-OQ123,
AS-LANE2-TRUNK-REPOINTED-TO-MAIN-MERGE, AS-L2T1805-MATRES-VERDICT-CONFIRM-LINES (retire at
c2 accept), AS-L2T0755-MAFFT-USERPROVISION (evidence debt OPEN; closes at SUITE-B harness
version line). EVIDENCE DEBT: AS-L2T0755-MAFFT-USERPROVISION only.

## BUDGET
~15 min used at dispatch time; checkpoint. Both dispatches left running untouched.

## ADDENDUM (same tick, ~00:55 EDT) — MATRES advc2 RETURNED: VERDICT fix (cycle 2)
reviews/MATRES-VERDICT-advc2-l2t0035.md: all 12 cycle-1 defects FIXED in substance; 6 NEW
cheap findings N1-N6 + bait B1-B7 (reviewer: 'introduced a machine-readable regression…
cheap to fix'). ORCH JUDGEMENT vs staged cycle-cap note: cap rule = two cycles WITHOUT
improvement; this cycle improved 12/12 with fresh evidence => ONE scoped fix run, not an
architect route. FIX RUN 2 LIVE (cl-worker thunderbeast, unit cl-l2-matresverdict-fix2-
l2t0035, prompt prompts/coder-MATRESVERDICT-fix2-l2t0035.txt — N1-N6 verbatim, no D1-D12
redo, determinism double-run required, marker 'MATRESFIX2 DONE <sha>', log logs/
coder-MATRESVERDICT-fix2-l2t0035.log). Cycle-3 fix verdict = HARD cap -> architect with
all three reports. B6 is ORCH-OWNED at merge: supersede the stale cycle-1 deliverable copy
deliverables/MATRES-VERDICT-report.l2t1805.md when promoting.
