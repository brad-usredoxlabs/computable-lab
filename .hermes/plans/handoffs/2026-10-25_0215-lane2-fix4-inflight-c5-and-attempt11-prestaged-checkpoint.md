# LANE 2 HANDOFF — l2t0130 (2026-10-25T02:15 EDT) — fix4 mid-run (RED test written, no commits yet); advc-c5 + attempt-11 gate + driver PRE-STAGED; ready set 0; checkpoint exit

Trunk: 9284a57b unchanged this tick (no merge). Stack :3093 /api/health 200, :5193 200, served
checkout = trunk @ 9284a57b. Brad's stack (:3001/:5174) untouched. Proxy unit cl-l2-orproxy-l2t2130
active — DO NOT stop.

## RECONCILE (first-hand)
- fix run 4 LIVE and healthy: flock unit cl-l2-rg1-fix4-l2t0040 pid 1504522 (holder since
  01:14:48; the stale MATRESCHAIN label in appliance2-coder.pid is known residue — the live flock
  holder IS this unit), coder child pid 1504529, 35:49 elapsed of the 60-90 min expectation
  (76 min at checkpoint — under the 2x watch at ~02:15/3x ~03:45; cpu accumulating, state Sl —
  NOT stalled). Tree: RED test server/src/api/handlers/AIHandlers.foldStreamTerminal.test.ts
  written UNTRACKED, no fix4 commits yet at c5f76b49, no report, no evidence files yet. NOT killed
  — checkpointed per budget. Sole fleet coder; no duplicate dispatched.
- Scratch watch: __debug_fold.test.ts untracked in the worktree (coder's own debug probe). The
  c5 prompt now pins a SCRATCH CHECK: if it lands in a commit or the final tree, that is a defect.

## WHAT LANDED THIS TICK
1. advc cycle-5 prompt PRE-STAGED: prompts/advc-REVISEGHOST1-fix4-c5-prestage-l2t0130.txt —
   scope c5f76b49..HEAD fix4-only, D3 verbatim with the req-2m/4r4leb backend.log facts, RED-at-
   base re-production demanded on the real assistStream path, payload-carries-surviving-
   clarifications check, bait list (force-end skipping frames, mocked vacuous RED, UPDATING-header
   suppression), scratch-file check, report owed reviews/REVISE-GHOST-1-advc-c5-l2t0130.md.
2. ATTEMPT-11 driver PREPARED: /tmp/rg1/drive10-attempt11.mjs (from the proven attempt-10 driver;
   adds the strengthened A4 block: after the fold done-line in backend.log the pane must escape
   updating/interpreting mode within 30s — trail step 'a4-fold-re-hold-recovery' with escaped +
   measurements + a4-fold-recovery screenshot; node --check SYNTAX-OK; default receipts dir
   .../2026-10-25-attempt11, RG1_RECEIPTS override retained).
3. attempt-11 gate prompt PRE-STAGED: prompts/gate-REVISEGHOST1-a11-prestage-l2t0130.txt — A4(ii)
   declared the BINDING assertion if the fold re-holds; reqId-completion check added as an
   adversarial-reviewer NOTE (fold done-line without 'request completed' = FAIL regardless of DOM);
   reading-card testid OBS carried as observation-only; CANDIDATE sha = fill at dispatch.
4. Task-list carry note inserted under REVISE-GHOST-1 (queue lock held; insert-only).

## READY SET / RECOVERY
- Ready todo set: 0 (unchanged; only W2-11-ZYMO-GOLDEN-DEMO, MATRES-REPLAY, REVISE-GHOST-1 are
  non-done, all in-progress/blocked-on-evidence). no-work.log NOT appended (real work done:
  reconciliation + both follow-on artifacts pre-staged).
- MATRES-REPLAY worksheet ruling: still Brad's, already filed — do NOT re-ask.
- Equipment-schema gap note + W2-11 D4 re-deferral to attempt-11: unchanged carries.

## NEXT TICK (priority order)
1. Fix4 exit? (log 'RG1-FIX4 DONE' / report deliverables/REVISEGHOST1-fix4-report.l2t0040.md ends
   STATUS: complete) -> fire the PRE-STAGED c5 prompt as-is (cloud deepseek-v4.1-flash; amend ONLY
   if the fix delta shape differs — e.g. no client leg vs trace claim). If fix4 died with no
   report: commits-first review, check flock holder first; fleet coder-single.
2. On c5 ACCEPT: self-verify (cwd=server vitest touched files + full-suite FAIL-set comm vs base,
   tsc -p .; app only if touched, 23-line tsc baseline) -> merge --no-ff (inspect trunk first) ->
   stack RESTART background=true (cl-lane-stack.sh 2 is BLOCKING; never foreground) -> verify
   served checkout contains the new sha AND the fix4 arm -> fire attempt-11 gate prompt (tier-2
   cloud, fill CANDIDATE sha; receipts .../2026-10-25-attempt11/; driver /tmp/rg1/
   drive10-attempt11.mjs). Second fix verdict on the SAME D3 class -> architect with both lists.
3. On attempt-11 VERDICT: fix -> per-class two-fix cap check before dispatching fix5.
4. If fix4 is STILL live next tick: elapsed watch (>=2x ~02:15+, record in tick summary; >=3x
   ~03:45 -> re-dispatch the deliverable via a different route per rule 7b, but only after
   confirming the owner is dead-in-practice — log shows no motion).

## Blockers / open obligations (carried)
- REVISE-GHOST-1: in-progress; sole gate = browser F1/F2 accept with ghosts mounting + no stranded
  pane. attempt-6/7/8 acceptance debt carries; a9 = D1/D2 fix-class evidence (code-merged);
  a10 = D3 evidence (fix4 in flight).
- MIXFRAC-1 gate obligations carry unchanged. GAPCARD/CELLRATE main-promotion debts carry.
- OPEN evidence debt: AS-LANE2-FIX4-SSE-SUSPECT-SCREENED (closes at fix4 RED-at-base + advc c5).

## assumptions:
- CARRIED (no change): AS-LANE2-FIX4-SSE-SUSPECT-SCREENED (OPEN), AS-LANE2-DRIVE-GAP-READING-
  CARDS, AS-LANE2-STACK-RESTART-STALE-HOLDER, AS-LANE2-EQUIPMENT-WIP-SYMLINK-RESIDUAL,
  AS-LANE2-TASKLIST-EDIT-INSERT-ONLY, AS-LANE2-ADVC-C2-PROMPTS-RATIFICATION-EMBED, F4-1/2/3,
  QUEUE-PIDWATCH-BELT, ADVC-PRESTALL-PROMPTS, D1C3-STRAY-RECEIPTS, QUEUELOCK-FILE-RESIDUE,
  FIXQUEUE-FIFO-ORDER, MENU CAND set, READCARD set, CHAING1C-TIER2-DIRECT, CHAIN set,
  APP-TSC-BASELINE (current 23 lines, comm-diff discipline), PLAYWRIGHT-EXEC-PIN, PANEL set,
  ANSWERFOLD set, SPECCOMP-EMPTYARG-QUIRK, ROLEAXES-COMPRESSION-EXIT-COMPLETE, BACKEND-HEALTH-
  ROUTE, FLOCK-NOFIFO-RACE, TASKLIST-STATUS-NOT-LANDED-TWICE, ATTEMPT6-TRUNK-NOFIX,
  ROWCOUNT-MATCHER-CALIBRATION, AS-LANE2-ARCH-SUPERSEDES-PRESTAGED-GATE.
- NEW THIS TICK: AS-LANE2-FLOCKPIDFILE-STALE-LABEL (appliance2-coder.pid shows a stale prior
  holder's label while the live flock holder is the fix4 unit; treated as known QUEUELOCK-FILE-
  RESIDUE-class residue — ownership decided from live ps + queue log, not the pid file). Not
  evidence-debt: verify-the-holder discipline already governs it.

## live-worker checkpoint at exit (~02:15 EDT; tick started ~01:31, ~44 min)
- LIVE: cl-coder fix run 4 (unit cl-l2-rg1-fix4-l2t0040; flock pid 1504522; coder child pid
  1504529, 76 min elapsed, RED test present, no commits, report owed
  deliverables/REVISEGHOST1-fix4-report.l2t0040.md). NOT killed. Sole fleet flock holder.
- LIVE INFRA: cl-l2-orproxy-l2t2130 (Restart=always; DO NOT stop).
- READY-TO-FIRE: prompts/advc-REVISEGHOST1-fix4-c5-prestage-l2t0130.txt (on fix4 exit);
  prompts/gate-REVISEGHOST1-a11-prestage-l2t0130.txt + /tmp/rg1/drive10-attempt11.mjs (on c5
  accept + merge + restart).
- Trunk HEAD 9284a57b; :3093 /api/health 200, :5193 200; served checkout = trunk @ 9284a57b.
  Brad's stack untouched.
