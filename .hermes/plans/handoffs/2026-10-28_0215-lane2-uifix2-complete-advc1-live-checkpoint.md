# HANDOFF lane-2 2026-10-28T02:15 EDT (orch l2t0115 CHECKPOINT-B; supersedes §LIVE/NEXT of the 0155 handoff)

## Since 0155 handoff
1. uifix2 RESUME FINISHED CLEAN: report ends 'STATUS: complete' + 'L2SUITEA-UIFIX2 DONE
   5bba9c27'. Process exited; slot-0 RELEASED (FREE). Five legs on 64d266af: E 8f1c5645,
   B db1ce062, C 6adccc84, A d85ef7eb, D 5bba9c27. Report discloses: (i) leg D third
   sub-symptom (clofibrate label doubling) REQUIRES-RESCOPE — claimed minted into data
   record MAT-1-mm-clofibrate1-mm-clof-l84l.yaml; (ii) leg A P7 mix arm left to WELLSET
   per standing ruling (correct).
2. ORCH PRE-GATE CHECK on the RESCOPE claim: found NO MAT-1-mm-clofibrate1-mm-clof-l84l
   .yaml under /home/brad/.computable-lab/worktrees/main/records/ (closest:
   MAT-clofibrate-1mm-10tf__clofibrate-1mm.yaml, name 'clofibrate 1mM' — NO doubling)
   -> the minted-record claim looks UNCONFIRMED; flagged as MAJOR verify-or-refute
   mandate 3 in the advc prompt. (Caveat: searched the data-repo main worktree only;
   reviewer re-checks incl. other material dirs.)
3. ADVERSARIAL GATE CYCLE-1 DISPATCHED ~02:07 (cloud OpenRouter deepseek-v4.1-flash,
   no slot contention): unit run-p300747-i59012716, pid 300752, log
   logs/advc-SUITEA-uifix2-c1-l2t0115.log, prompt advc-SUITEA-uifix2-c1-l2t0115.txt,
   report owed reviews/L2-SUITE-A-uifix2-advc1-l2t0115.md. Mandates: leg D unaudited
   mutation-check; leg A offer-binding real-attribution + app/-only diff-stat; RESCOPE
   verify-or-refute; suite+tsc(12) reproduction; leg C weakened-pin sweep; cleanliness.
   Expected exit ~02:40-03:10.

## NEXT TICK STARTS HERE
A. ADVC-1 on reviews/L2-SUITE-A-uifix2-advc1-l2t0115.md (marker 'ADVC DONE accept|fix').
   - ACCEPT -> self-verify (open diff 64d266af...HEAD, targeted app suites cwd=app,
     tsc==12, RED+GREEN per leg incl. the two RESCOPE arms) -> merge --no-ff into
     cl/integration-2 (trunk has docs commits 4fbe68b5/ec4b66fd on top — inspect first;
     app-diff must not conflict) -> stack RESTART (background=true; no YAML expected) ->
     RE-GATE 3 on merged tip: criteria verbatim legs A/B/C/D/E + P7-footprint AMENDED
     (mix arm post-WELLSET only) + restored-turns discount + leg E may cite unit pins +
     screenshot; receipts /home/brad/.hermes/cl/receipts/L2-SUITE-A/<ts>/. Clofibrate
     doubling: if advc refutes the mint claim, it rides back as a fix-run defect BEFORE
     merge, not into re-gate.
   - FIX -> fix run on SAME worktree/branch with defect list verbatim (grab slot-0 —
     FREE now), max 2 cycles, then architect.
B. SUITE-A CLOSE on re-gate-3 accept -> task-list flip under lock + close-out trail ->
   fire launchers/launch-WELLSET-l2t17xx.sh (systemd-run --user --collect BARE-PATH,
   self-waits for a free slot; P8-flip rider + vacuous-green-is-failure rule).
C. THEN L2-THREAD-SCOPED-1 claim (spec .hermes/plans/2026-10-28_L2-THREAD-SCOPED-1.md,
   OQs RULED §14; §9 hot-file rule: branch tip MUST contain merged uifix2 — verify
   before branching). Then L2-CHAT-UI-1 composition from re-gate-3 receipts.

## LIVE AT CHECKPOINT (do not duplicate)
- cl-adversarial-reviewer uifix2 cycle-1 LIVE (pid 300752, cloud).
- Fleet: slot-0 FREE (do NOT dispatch: WELLSET + THREAD-SCOPED both gated on SUITE-A
  merge/flip — dispatching either now would branch off a tip missing uifix2, violating
  spec §9 / the WELLSET launcher gates). Slot-1: lane-1 GC-11 fix1 (not ours).
- computable vision slot FREE (unused). Trunk ec4b66fd (docs tip; product tip e706359e).
  :5193 200; :3093 alive.

## assumptions
- Carried: all entries from the 0155 handoff unchanged. AS-L2T2255-CLIENT-ATTRIBUTION-
  REACHABLE narrows further at re-gate 3. NEW candidate fact pending gate: leg-D
  RESCOPE mint-claim UNCONFIRMED by orch record-search — if refuted at advc, the
  clofibrate doubling re-enters client remit (track as potential fix-run defect, not an
  assumption).
- NEW: AS-L2T0115-CLOFIBRATE-MINT-CLAIM-UNCONFIRMED (evidence debt, OPEN): coder's
  MAT-1-mm-clofibrate1-mm-clof-l84l.yaml not found in the data-repo main worktree;
  clears when advc mandate-3 lands (confirmed elsewhere or refuted).

## HEALTH / BUDGET
Trunk ec4b66fd. SUITE-A: coder-complete, advc-1 live, then merge+re-gate-3. Budget:
entered 01:10, checkpoint 02:15 (two dispatch-equivalents: spec promotion + advc
gate; no coder possible — fleet 2/2 at entry, gated-at-exit). Durable: advc
prompt/launcher/log, this checkpoint handoff.
