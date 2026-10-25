# CLOSE l2t1230 — lane 2 — 2026-10-17T15:25 EDT (orch tick 12:30)

Trunk tip at start 0c26bebf (docs only since 0c21bfc9); contains 4e3428a3. No merges, no
YAML changes to trunk this tick.

## W2-8-SAID-MEANT-SURFACE (in-progress) — ARCHITECT DECISION LANDED: needs-brad
- Architect run (bash 3196856) exited clean ~12:5x. Decision artifact
  .hermes/plans/decisions/W28-A5-accept-leg-decision-20261017.md ends
  'DECISION: needs-brad'. Options: (a) SPINE-4 bar amendment REJECTED, (c) client adapter
  REJECTED, (d) fixture swap REJECTED-as-stated (held facts are branch-independent —
  freeze-thaw still bars); (b) VOCABULARY DATA fix = PRIMARY but domain policy: adding a
  `bead_beat` verb reverses the adjudicated VERB-SONICATE/VERB-STIR protocol_semantic_only
  posture (schema/registry/wave2-verb-adjudication.yaml) and the Brad-ruled 31-verb union.
  Architect recommendation: YES. => NEW BRAD-PENDING question (recorded; NEVER re-asked
  unattended). No coder fix dispatched (correct: scope choice).
- STEP-0 PROBE EXECUTED (explicitly authorized by the ruling, measurement-only): throwaway
  worktree wt/W28-A5g-probe-lane2-l2t1230 (detached 0c26bebf) + ONE bead_beat entry in its
  vocab copy (loader schema+lint accepted it at boot — no boot break); lane data copied to
  ~/.computable-lab-lane2-probe; probe server :3099 (logs/probe-w28a5g-vocab-3099.log);
  5 gate-exact headless compiles per side vs control :3093. RESULTS (appended to the decision
  artifact §STEP-0 PROBE RESULTS): CONTROL (shipped vocab) 2/5 complete — the held-422 the
  A5d gate drew was ITSELF a draw, not a deterministic bar (completes fold lysis as
  add_material+mix, the workaround the model honestly disclosed); PROBE (+bead_beat) 2/5
  complete and BOTH completes emit a REAL bead_beat action (model uses the verb verbatim;
  full chain loader->prompt->tool-enum->compile->realization accepted the added entry).
  Remaining bar facts are draw-dependent: ambiguous-noun 'microcentrifuge tube' (STRUCTURED,
  card-answerable — fires despite the protocol DECLARING that role: role-vs-store collision
  candidate, follow-up look if A5g ships) + free-form duration/sample-source facts (uncarded).
  Implication for Brad's decision: bead_beat makes the HONEST completion path exist; the
  re-shoot rides the MAX_REDRAW bounded re-draw precedent either way.
- Probe teardown: :3099 killed, verified 000. Probe worktree + lane2-probe-config.yaml +
  ~/.computable-lab-lane2-probe KEPT for re-runs until A5g ships or Brad refuses (cleanup
  obligation on whichever branch lands). Trunk/store NEVER touched by the probe.

## LANE STACK INCIDENT (recovered)
- Lane 2 backend :3093 was found DOWN at 15:21 (crash in backend.log: GitError
  'Unable to create ~/.computable-lab-lane2/worktrees/main/.git/index.lock: File exists' —
  the AS-LANE2-BACKEND-WATCH-GITCONFIG-LOCK trap class; stale lock since cleared itself —
  no live git process held it, no manual rm needed). cl-lane-stack.sh 2 restart ->
  backend 200 + frontend 200, boot 'Server listening' confirmed. No product files touched.

## SHORTHAND-CORPUS -> DONE (queue-state repair)
- Gate r5 tier-2 VERDICT: accept was already audited first-hand at l2t1530 (2026-10-12):
  re-verified today by re-opening all 3 trail.json myself (consoleErrors/pageErrors/
  vendorExaRequests/failedRequests/badResponses ALL [] in every trail), servedRevision
  c9c356f7 ancestor-verified in trunk, report already promoted canonical
  (.hermes/plans/SHORTHANDCORPUS-ws6-r5-report.md), pairs baseline evidence in-file.
  The status flip was simply never written — DONE annotation added under the queue lock.
  Loose end recorded non-blocking: decisions/SHORTHANDCORPUS-raw-events-coercion-l2t1145.md
  was REQUESTED and NEVER LANDED (absent from decisions/); moot for acceptance.

## PROTO-AI-13 (todo)
Recount n=317/500, last ts 2026-10-16T20:22Z — FLAT 5th consecutive. INSUFFICIENT-side, no action.

## BRAD-PENDING (unchanged unless marked NEW; silence != approval; never re-asked unattended)
- NEW: bead_beat verb approval (decision W28-A5-accept-leg-decision-20261017.md, architect
  recommendation YES; probe evidence appended). This is the ONLY thing gating the W2-8 A5
  accept leg's root-cause fix.
- D1 run-page-Accept-422 / D2 clarification loop / D3 path-fork routing; W2-11 naming-stability;
  THREAD mint-floor OQ; noun-binding fragility follow-up; S5 DECK-FOLD-1 test round;
  PROTO-AI-11/12 S2 signatures; AS-PROTO-AI-12-W1 quant disclosure due at AI-13 verdict;
  SH-PROMPT-HYGIENE-1 OQ-1 + OQ-2.

## LIVE WORKERS AT CHECKPOINT
- None. Architect run exited. No coder live; fleet coder lock FREE (flock -n verified at
  tick start; pid file absent). W2-11 next move = gate 14 iteration per its ruling (needs a
  coder/harness slot; next tick).
- READY-WORK ANALYSIS: W2-8 is blocked on Brad (bead_beat) or an A5g dispatch ONLY on YES;
  W2-11 is in-progress pending the D4 naming-stability loop (gate-14 evidence already earned,
  finding queued for Brad); PROTO-AI-13 blocked on sample. No other todo items. Next tick:
  if Brad answered YES -> author+dispatch W2-8-A5g per the ruling's work plan (probe says the
  remaining facts stay draw-dependent -> keep MAX_REDRAW in the gate plan; consider the
  microcentrifuge-tube ambiguous-noun-vs-declared-role finding as a named sub-investigation).
  If NO -> file the (d) contingency spec.

assumptions (delta this tick):
+ AS-LANE2-W28-A5-ACCEPT-LEG-ARCHITECT-ROUTE — PARTIALLY CLEARED: architect ruled (needs-brad,
  recommendation YES) + step-0 probe measured (both appended to the decision artifact). Debt
  now narrows to: Brad's answer + (if YES) A5g shipped + A5d re-shoot accept.
+ AS-LANE2-A5D-HELD422-WAS-A-DRAW (OPEN, evidence debt: two independent gate runs or
  >=5-draw control series showing the shipped-vocab compile is non-deterministic between
  complete/422 — measured today 2/5 complete, one 5-draw series; a second series is owed
  before this is treated as settled). Bears on ANY A5 re-shoot plan: a single held-422 draw
  is NOT evidence of a deterministic bar; MAX_REDRAW is mandatory, not optional.
+ AS-LANE2-PROBE-ARTIFACTS-RETAINED (OPEN, cleanup debt: rm -rf
  wt/W28-A5g-probe-lane2-l2t1230 + lane2-probe-config.yaml +
  ~/.computable-lab-lane2-probe once A5g merges or Brad refuses).
Carried open: AS-LANE2-MODE2-REPLAY-EMULATION, AS-LANE2-SEQ2-FLAKE-VARIANCE,
AS-LANE2-TASKLIST-SED-HAZARD, AS-LANE2-SHA4-GATE-FIXTURE-EVIDENCE,
AS-LANE2-SHQC1-TSC-BASELINE-TRAP, AS-LANE2-W28-GATE1-INVALID-ACCEPT (clears ONLY on gate
VERDICT: accept), AS-LANE2-A5F-FIXTURE-TEXT-IS-GATE-CONCERN,
AS-LANE2-WORKTREE-ADD-INTERRUPTED-INDEX, AS-LANE2-F4-GATE-FIXTURE-SEEDING,
AS-LANE2-ORCH-JUDGED-T-C-GATE, AS-LANE2-CYCLE1-DRILL-ZERO-WELLS (debt TRUE — cite
trail-freeform.json if minted), AS-PROTO-AI-12-W1 (debt due at AI-13 verdict),
AS-LANE2-OQ1-SERVER-ONLY-NO-CLIENT-LEG, AS-LANE2-OQ1-DONE-ADVC-ACCEPT,
AS-LANE2-OQ1-GATEWAY-HOLD-LIMITATION, AS-LANE2-WORKTREE-ADD-NFS-SLOW-CLEANUP,
AS-LANE2-HYGIENE-MERGE-UNTRACKED-COLLISION, AS-LANE2-REPROA-ANSWER-SHAPE,
AS-LANE2-BACKEND-WATCH-GITCONFIG-LOCK (RE-FIRED 15:21 today — recovered via restart; keep
the boot-success check in every tick).

next checks: (1) BRAD-PENDING bead_beat answered? YES -> author W2-8-A5g spec per ruling
work plan + dispatch coder on fleet lock; NO -> (d)-contingency spec; (2) trunk tip +
stack 200s + backend boot 'Server listening'; (3) AI-13 recount (base 317); (4) fleet lock
free + no pidfile before any coder dispatch; (5) probe artifacts still retained/needed.
