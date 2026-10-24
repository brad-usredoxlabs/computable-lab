# LANE 2 HANDOFF — l2t1115 (2026-10-24T11:50 EDT) — MENU-CANDIDATES-1 RATIFIED+QUEUED; READING-CARD LIVE 2h16m (motion-proven, H2 watch); advc c1 prompt pre-staged

Trunk: 154746ef (docs tip; code tip 6d64154b). Stack UP :3093 (/api/health 200) /:5193 200.
Brad's stack untouched; no model services touched. Fleet rule held: ONE live coder
(READING-CARD); fleet lock held by that coder. Readiness: 0 due/changed blockers.

## RECONCILE (tick start ~11:10)
- READING-CARD coder LIVE (hermes 3184993, queue unit cl-l2-readingcard1-queue-l2t0915):
  forward motion proven continuously — CPU time advancing across samples (10:06 -> 12:19),
  cl-coder state.db touched 11:44, worktree diff GROWING (2 files/214 lines at 11:27 ->
  4 files/321 lines at 11:45, app/ hunks now present), 3 RED test files on disk. Report not
  yet written. 2x (~10:45) and 3x (~11:15) wall thresholds PASSED, but rule 7b's change-
  approach trigger is idle-past-deadline WITH NO motion; motion is proven, so left RUNNING.
  AI-9 precedent ran ~2h35m with the same shape. Elapsed 2:16 at checkpoint.
  ORCH LIVE-DIFF WATCH (feeds advc bait H2): working tree shows a NEW `answeredClarification-
  Labels` param threaded through compileShorthandDeterministically deps into the compiler bar
  loop with a role-gap skip guard. That is BEYOND the spec's Scope text (fold-answer leg +
  map + UI); the spec's honest-survivor clause said a still-tripping role-gap bar stays the
  honest visible state. Whether the guard is an EXISTING MIXROLE-1 producer-side guard merely
  threaded, or NEW unauthorized suppression, is the #1 gate question — pre-staged as bait H2
  in the advc prompt (must be judged against the ruling lines, not my observation).
- CHAIN FIX-3 queue (cl-l2-chainfix3-queue-l2t0945): FIFO second on the flock. Unchanged.
- ROLE-AXES-1 queue (cl-l2-roleaxes1-queue-l2t1015): FIFO third, worktree ready at 6d64154b.
  Unchanged.
- MATRES-REPLAY in-progress = worksheet legs deferred to MATRES-0; no action owed.

## WORK THIS TICK
1. MENU-CANDIDATES-1 composer draft (l2t1030 unit, landed 11:37) reviewed + RATIFIED.
   Load-bearing cites re-verified first-hand by orch: MATERIAL_PAGE=12 (resolvers.ts:30),
   slice-before-dedup-by-key gap (:59-61 + materialSuggestions recordId-only dedup
   :611-617), ClarificationPicker merge-by-key (:68-79) + query seed (:164), query: fact.label
   (shorthandChat.ts:552), MSP-DRAFT per-event mint (AddMaterialSupport.ts:165) +
   componentLabels.join(' + ') (:227), ontology-tier local-record drop (resolvers.ts:322-325).
   OQ1-OQ5 RULED (see task block; recommendations accepted: app-side resolvers.ts only,
   entityKind+title dedup key, write-side banked, cap/rank out, RED keyed on role-gap shape).
   Spec promoted to .hermes/plans/2026-10-24_1140-MENU-CANDIDATES-1-spec.md (cp; source draft
   keeps l2t1030 provenance).
2. MENU-CANDIDATES-1 CLAIMED + QUEUED 11:47 FIFO fourth: queue unit cl-l2-menucand1-queue-
   l2t1145 (first attempt run-p3525634 died 203/EXEC — queue script lacked +x; chmod fixed,
   re-run succeeded — lesson: chmod +x queue scripts BEFORE systemd-run), worktree
   wt/MENU-CANDIDATES-1-lane2-l2t1145 (checkout bg pid 3524664, log logs/wt-menucand-
   checkout.log), branch cl/lane2-menu-candidates-1-l2t1145, log logs/coder-MENUCAND1-
   l2t1145.log, prompt prompts/coder-MENU-CANDIDATES-1-l2t1145.txt, report deliverables/
   MENU-CANDIDATES-1-report.l2t1145.md. NO second coder dispatched (lock held).
3. ADVC c1 PROMPT PRE-STAGED for READING-CARD exit: prompts/advc-READINGCARD1-c1-l2t1115.txt
   (full bait list A-J incl. H2 compiler-threading watch above; report path
   reviews/READING-CARD-ANSWER-1-advc-c1-l2t1115.md). Dispatch on coder exit:
   systemd-run --user --collect hermes -p cl-adversarial-reviewer -z "$(cat <that prompt>)"
   >> logs/advc-READINGCARD1-c1-l2t<tick>.log 2>&1
4. Task-list updated under queue lock (MENU-CANDIDATES-1 ratified/claimed/in-progress).
   no-work.log untouched (queue not idle).

## NEXT TICK (priority order)
1. READING-CARD coder exit -> advc c1 (pre-staged prompt; unique log suffix l2t<tick>) ->
   ACCEPT -> orch self-verify (new server map + fold-answer tests, app QuestionsPanel test,
   regression scoped suites, tsc server 0 + app sorted-diff vs baseline 28, fold byte-identical)
   -> merge --no-ff -> stack RESTART background=true -> ORCH live canonical-utterance drive
   (2-card hold -> answer both via UI controls -> batch 2/2 -> preview mounts -> revise ->
   ghosts remount) -> REVISE-GHOST-1 attempt-6 FULL F1 browser gate (tier ladder 6c; scripts/
   revise-ghost-a5.mjs is the attempt-5 harness to adapt; F2-head stays WAIVED per Ruling 3).
   If coder still live next tick: check motion again (CPU delta + state.db + diff growth);
   NO motion + past 3x -> change approach (inspect appliance-2 endpoint / consider re-dispatch
   route, never duplicate while alive).
2. CHAIN fix-3 coder exit (FIFO second) -> advc -> ACCEPT -> self-verify (g1c D1: assistStream
   chain_proposal case) -> merge -> g1d tier-2 browser re-gate with D1-closure check.
   MATRES-CHAIN done only on g1d receipts accept.
3. ROLE-AXES-1 coder exit (FIFO third) -> advc -> ACCEPT -> self-verify incl. grep-clean +
   byte-pin goldens -> merge -> restart -> NO browser gate (ratified ruling).
4. MENU-CANDIDATES-1 coder exit (FIFO fourth) -> advc (bait list is IN the spec's Reviewer
   bait section; reuse verbatim) -> ACCEPT -> self-verify (resolvers suite incl. byte-
   stability pin, app tsc sorted-diff) -> merge -> restart -> scripted row-count evidence-
   drive per spec Verification (picker SURFACE unchanged -> no full browser gate owed).
5. W2-11 D4 architect re-consult: still gated on REVISE attempt-6 acceptance.
6. MIXFRAC-1 gate obligations — carry unchanged.
7. Backlog candidate (NOT to claim without spec-phase): DISPLAY-TIER participation display
   card. NEW banked (OQ3): write-side MSP-DRAFT dedupe/idempotency (MINT-IDEM-1 precedent).

## Open obligations (carried)
- READING-CARD-ANSWER-1: coder live; then advc -> merge -> live drive -> attempt-6 gate.
- MATRES-CHAIN: fix-3 queued; gate g1d OPEN (tier-2) after its merge.
- REVISE-GHOST-1: attempt-6 full-F1 gate awaits READING-CARD merge.
- ROLE-AXES-1: coder queued FIFO third.
- MENU-CANDIDATES-1: claimed, coder queued FIFO fourth; post-merge row-count evidence-drive owed.
- W2-11 D4 re-consult: OPEN (gated on attempt-6).
- MIXFRAC-1 gate obligations: carry unchanged.

## assumptions:
- NEW: AS-LANE2-MENUCAND-OQ-RULINGS (OQ1 app-side-only, OQ2 entityKind+title, OQ3 write-side
  banked, OQ4 cap/rank out, OQ5 role-gap-shaped RED — orch ratified from composer recommend-
  ations; cites verified first-hand at trunk).
- NEW: AS-LANE2-MENUCAND-NO-BROWSER-GATE (picker SURFACE unchanged per spec; scripted row-
  count evidence-drive against live :5193 post-merge is the accepted proof; evidence-debt
  rule: task not done until that drive's receipts exist).
- NEW: AS-LANE2-READCARD-ROLEGUARD-THREADED (orch live-diff observation, NOT verdict: coder
  threading answeredClarificationLabels into the compiler guard may exceed spec scope;
  evidence debt OPEN — advc c1 bait H2 must render the ruling against spec+ruling lines
  before merge).
- CARRIED: AS-LANE2-CHAING1C-TIER2-DIRECT, AS-LANE2-CHAIN-CARD-LOCATION, AS-APP-TSC-BASELINE-28,
  AS-LANE2-PLAYWRIGHT-EXEC-PIN, AS-PANEL-GATE5-DRIVE-RECON, AS-PANEL-AC3-RESOLVER-HOME-FIX,
  AS-PANEL-SPEC-LEVEL-FORMULATION-OBS, AS-LANE2-PANEL-TSC-DIFF-PROVISIONING,
  AS-LANE2-PANEL-GATE-NEWRUN-ON-FIX, AS-LANE2-CHAIN-DEFECTS-ORCH-VERIFIED,
  AS-LANE2-CHAIN-OQ2-CORRECTION, AS-ANSWERFOLD-FIXTURE-FRACTIONS, AS-LANE2-FULFIL-CWD-CONVENTION,
  AS-LANE2-FIX2-FIFO-ORDER, AS-LANE2-GAPCARD-PARAMINPUT-TRACKED-COPY,
  AS-CELLRATE-OQ1-PRECLEARED-TRACKED-COPY, AS-PROTOAI13-MENU-DRIFT-NEW-PREREG,
  AS-LANE2-CHAIN-G1B-VISION-FIFO, AS-ANSWERFOLD-BASE-PRECELLRATE,
  AS-LANE2-SPECCOMP-EMPTYARG-QUIRK.
- Open evidence debts: AS-LANE2-READCARD-ROLEGUARD-THREADED (advc c1 H2 adjudication owed
  before merge).

## live-worker checkpoint at exit (~11:50 EDT; ~40 min wall)
- READING-CARD CODER LIVE (appliance-2, fleet lock): hermes 3184993, session
  20261024_092908_482bf2; 2h16m elapsed, motion-proven (CPU 12:19 and rising, state.db 11:44,
  diff 4 files/321 lines growing incl. app/); no report yet. Next tick: motion check governs.
- CHAIN FIX-3 QUEUED FIFO second (cl-l2-chainfix3-queue-l2t0945 on flock).
- ROLE-AXES-1 QUEUED FIFO third (cl-l2-roleaxes1-queue-l2t1015 on flock; WT ready).
- MENU-CANDIDATES-1 QUEUED FIFO fourth (cl-l2-menucand1-queue-l2t1145 on flock; WT checkout
  bg pid 3524664).
- MENU-CAND composer unit exited (draft delivered; ratified) — systemd unit gone.
- Trunk HEAD 154746ef (code tip 6d64154b); :3093 /api/health 200, :5193 200.
