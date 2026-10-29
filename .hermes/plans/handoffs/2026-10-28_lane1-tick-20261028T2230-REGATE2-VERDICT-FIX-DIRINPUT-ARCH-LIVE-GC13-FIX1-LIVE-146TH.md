# Handoff — lane 1 tick 2026-10-28 22:20-23:05 · GC-12 re-gate VERDICT: fix (sole blocker = pre-existing dir-input gap) · architect ruling DECIDED + dirfix leg queued · GC-13 adv c1 FIX -> fix-run LIVE slot-1 — 146th

## Reconciliation (first-hand)

- Slot truth at tick start: slot-1's GC-13 coder had exited rc=0 21:55 (log says
  CODER_EXITED) but its launcher still held the flock briefly; slot-0 HELD by lane-2
  WELLSET (PID 2289297 alive, 53m). Browser regate2 live (PID 2331421). GC-13 adv
  cycle-1 had already rendered its verdict to its log.
- GC-12 REGATE2 (tier-1) RENDERED: VERDICT: fix, receipts
  /home/brad/.hermes/cl/receipts/GC-12/20261028T2155-regate2/report.md. Criteria (a)-
  (e),(g),(h),(i) PASS — the StrictMode sheet-renders regression (the reason for the
  re-gate) is FIXED, verified create path + cold load, served-code probe re-verified by
  the reviewer at open. SOLE blocker: (f) execute->results — directory-kind analysis
  input. The reviewer PROVED it pre-existing and out-of-diff UI-free: create+execute
  with inputs {package: DREF-000028} -> EISDIR (ANR-000021); {signal: DREF-000008}
  file-dref -> success (ANR-000022). I spot-checked the code myself: analysisRunner.ts
  provisionInputs streams EVERY dref via provider.read (~:221); DREF-000028 payload is
  dataKind signal-collection + a directory path (live record read). phase2/ of the
  receipts fell inside my 21:56-21:59 leg-B-YAML restart outage — disclosed in the
  report, not product evidence; phases 3-10 are the re-drives.
- Per the reviewer's own routing request (NOT silently to the GC-12 coder) I filed
  decision-request + options A/B/C at
  .hermes/plans/2026-10-28_lane1-gc12-directory-input-decision-request.md and dispatched
  the architect via systemd-run bare-path form (unit run-p2600007, log
  logs/arch-GC12-dirinput-l1t2235.log). RULING RECEIVED 22:46 (rc=0): composition —
  (B) handoff pins {signal} only + (A-named-error) INPUT_IS_DIRECTORY guard in
  provisionInputs; (C) already exists (registration mints per-member file DREFs,
  role-map selects the signal member — no member-name hardcoding, provenance hierarchy
  untouched). Minors 2/3/5/6 fold into the coder leg; 4 (layout) and 7 (carried noise)
  deferred; dir expansion deferred (no engine reads collections). Full ruling:
  .hermes/plans/2026-10-28_lane1-gc12-directory-input-decision.md.
- I verified the ruling's code cites first-hand: GcSectionChrome.tsx:206-209 pins BOTH
  signal+package (real site, the ruling's file:line is right);
  acquisitionPackage.ts DEFAULT_ROLE_MAP :56 + manifest-Merkle-hash comment :441-445
  confirm point (C).
- GC-13: adv cycle-1 VERDICT fix (10 defects, 4 blocker). I spot-verified the two
  structural blockers myself (gcProvenance.ts pick() default arm -> null refs for
  ISEN/package/sample/method/engine = static hop table; ClaimWorkspace discovers
  evidence ONLY from the claim's related set, which is single-hop by handler design —
  RelatedRecordsHandlers.ts confirmed). FIX CYCLE 1 dispatched 22:29 to the SAME
  worktree wt/gc13-lane1-l1t1910 (slot-1, launcher PID 2595245, report-first file
  alive at 22:30 with a fact-check block that independently re-derives the fix facts —
  healthy). Expect ~2-3h; adv cycle-2 after.

## Actions this tick

1. Task list updated under the queue lock (GC-12 + GC-13 tick_reconcile_20261028T2230
   notes, handoff_latest). NOTE: the outer `flock -c` + in-script fcntl.flock on the
   SAME lock deadlocked (different fd = self-contend); the python update script takes
   the lock itself — run it WITHOUT an outer flock wrapper.
2. GC-13 fix-run dispatched (above). Fleet at cap while it + WELLSET live.
3. Architect decision packet dispatched -> ruling landed (~11 min, cheap thunderbeast
   route; systemd-run bare-path form worked).
4. GC-12 DIRFIX coder prompt + staggered queue launcher written and armed:
   launchers/queue-GC12dirfix-l1t2250.sh inner PID 2617137 — fresh worktree
   wt/gc12-dirfix-lane1-l1t2250 CREATED off trunk tip; the queue waits for fleet
   stagger (GC13fix started 22:29) + a free slot (prefers 0) and self-fires. NEVER
   re-dispatch manually while its queue is alive (pgrep gate in the script guards too).

## NEXT TICK — in order

1. Observe the two queued/live coder runs (do NOT duplicate):
   - GC-13 fix1: logs/coder-GC13-fix1-l1t2230.log + gc13-fix1-report-l1t2230.md; on
     `GC13 FIX1 DONE <sha>` -> adv cycle-2 (unique path
     reviews/GC13-advreview-l<tick>-c2.md, terminal-background route) then orch verify
     (server vitest src/lint src/api-probe src/run-workspace src/knowledge; app
     src/claims src/run src/shared/ref; both tsc baselines 0/21; lint-invalid CREATE
     probe on the YAML-reloaded :3092 incl. the new result-arm floor) -> merge
     wt/gc-13-lane1-l1t1910 -> browser gate for GC-13 UI legs (receipts
     GC-13/<ts>/, served-revision probe first).
   - GC-12 dirfix: logs/coder-GC12-dirfix-l1t2250.log (queue lines: stagger-open,
     LOCK-ACQUIRED) + deliverables/gc12-dirfix-report-l1t2250.md; on
     `GC12 DIRFIX DONE <sha>` -> adv gate -> orch verify (incl. live probe: hand-run
     pinning DREF-000028 fails NAMED INPUT_IS_DIRECTORY) -> merge -> RESTART stack only
     if YAML touched (expected: no YAML) -> browser re-gate legs per the ruling's
     'Verification the re-gate must show' block (f execute->results on ANREV-000008
     class revision, inputs={signal} file-dref stored, minors 2/3/5/6 visible, DNA
     control byte-identical, ANREV-000006 refusal unchanged).
2. GC-14 promote-at-claim when a slot frees (draft reviewed 145th; re-anchor banner +
   sequences-test remediation slice in its block).
3. Evidence debt OPEN: AS-L1T1940-2 (full re-gate acceptance — now gated on the
   dir-input fix leg, not just re-shot), AS-L1T2015-1 (D7 adjudication — same accept).
   Everything else from regate2 (a-e,g-i) is accepted on real receipts now.
4. Ops notes: (a) flock-in-python + outer flock -c = self-deadlock, use one owner.
   (b) worktree-add progress spam floods the queue log — harmless. (c) systemd-run
   bare-path form + prompt-file pattern worked for the architect packet.

## assumptions:

- AS-L1T2230-1 (orch): the regate2 phase-2 outage frames are excluded as evidence
  (they fall inside MY disclosed restart window); phases 3-10 re-drives are the
  acceptance basis. evidence_debt=false.
- AS-L1T2230-2 (orch): the dir-input gap is PRE-EXISTING infra, not a GC-12 product
  defect — GC-12's merged 3-file diff is exonerated by the reviewer's UI-free repro;
  the V7(f) leg therefore rides the NEW dirfix leg, and GC-12's (a)-(e),(g)-(i)
  acceptance stands on the existing receipts. evidence_debt=true (cleared when the
  ruling-verification re-gate shows execute->results + named-error on new trunk).
- AS-L1T2230-3 (arch, ratified via ruling): the architect's file:line cites I
  re-verified first-hand (GcSectionChrome :206-209, acquisitionPackage.ts role map +
  manifest comment); the ruling is grounded.
- Carried open: AS-L1T1940-2, AS-L1T2015-1. Resolved/standing: AS-L1T2155-1/-2,
  AS-L1T1940-1, AS-L1T1815-2/-3/-4, AS-L1T1610-1, AS-L1T1520-1, AS-L1T1445-1,
  AS-L1T1425-1, AS-L1T1345-1, AS-L1T1235-1/-2.

## CHECKPOINT addendum (same tick, 23:16) — GC-13 fix1 died mid-run; continuation queued; fleet stagger wall to 23:42

- GC-13 FIX1 coder DIED 23:06 ('API call failed after 3 retries: inference request
  expired while waiting for admission'), rc=0 misleading. NOT a total loss: legs FIX1
  (defects 5+6) and FIX3 (defects 1+2) are COMMITTED (1fc916c7, c2ab53b9) with RED/GREEN
  transcripts + baselines in gc13-fix1-report-l1t2230.md; FIX4 (ClaimWorkspace pair) is
  UNCOMMITTED-but-present in the worktree (158+/62-), report's leg plan FIX4-FIX7 intact.
- CONTINUATION queued per SOUL (SAME worktree, never fresh): prompt
  prompts/coder-GC13-fix1c-l1t2315.txt, launcher
  launchers/queue-GC13fix1c-l1t2315.sh inner PID 2628865, log
  logs/coder-GC13-fix1c-l1t2315.log. It waits the fleet stagger + a free slot.
- QUEUE ORDER at checkpoint (both self-fire, never re-dispatch manually): (1) GC12dirfix
  (queue PID 2617137, worktree wt/gc12-dirfix-lane1-l1t2250 already created) prefers
  slot-0; (2) GC13fix1c (PID 2628865) prefers slot-1. Slot-0 held by lane-2
  THREADSCOPED-1 (PID 2307239, started 22:42) -> fleet stagger wall opens ~23:42.
  Slot-1 free since 23:06.
- NEXT TICK: read both logs' LOCK-ACQUIRED lines to know who owns which slot; adopt the
  DONE lines from the two report files (gc13-fix1-report-l1t2230.md 'GC13 FIX1 DONE',
  deliverables/gc12-dirfix-report-l1t2230.md 'GC12 DIRFIX DONE'); then the gate order in
  the main body above. If a queue log shows a launch FAILED again (engine admission),
  re-arm the queue once; two admission deaths on the same leg => check NInfer engine
  health on appliance-2 before re-arming.
