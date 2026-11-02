# Handoff — lane 2 · 2026-11-01T21:40 EDT (l2t2110 — PICKER-1 spec RATIFIED+promoted; GHOST-1 fix-2 QUEUED behind stagger gate; CARD-1 spec-composer LIVE)

## Reconcile (all first-hand; digest cl-reconcile.sh l2t2110)
- Trunk a544a2a5 (docs tip above ebeda58c), tree clean of tracked changes.
- In-progress per list: GHOST-1 (fix-2 owed), LABSTATE-CONTENTS-1 (FIXRUN3 card,
  md5 8fdc840f UNCHANGED — brad-answer tag empty), WELLSET-TOKEN-EMIT-1 (TOKENSITE
  question cf7ea14e UNCHANGED — reconfirms last tick's mis-baselined 74692e8b note;
  nothing re-asked). MOUNT f65d32b6, LEG-G b13139b7 UNCHANGED.
- Fleet slots: slot-0 FREE (stale PROMPT1GHOST pid marker, PID dead — flock is truth,
  AS-FLEETSLOT-PIDFILE-STALE again); slot-1 HELD by lane-1 FAME4G (flock pid 718498
  ALIVE, started 21:00:01, ps-confirmed; lane-1's FAME-3 re-gate closed 20:58 before
  its new dispatch — legit stagger owner). Stagger gate CLOSED until ~22:00.
- PICKER-1 spec-composer (PID 573120, tb-bg slot-0) EXITED rc=0 20:15 — draft landed,
  audited below. tb-bg slots FREE at tick time. Backend :3093 healthy ("Failed
  running" count 0 in .run/backend.log), :5193 200. exa tripwire OK.

## PICKER-1 spec AUDITED + RATIFIED (orch l2t2110)
- Draft (215 lines, composer log ends rc=0) reviewed first-hand; ALL load-bearing
  pins re-verified by orch at ebeda58c: MATERIAL_CATEGORY_RANK resolvers.ts:706-712
  (exact keys), comparator :746-763 (sort-by-rank-then-localeCompare, dedupe AFTER
  sort confirmed), ClarificationPicker.tsx path + canMint :403-404 + showMintRow
  :427-432 + "resolver runs only when open" :85-87, ChatLog.css:153-167 (the
  scroll-recoverability reason comment verbatim), registry clarification block :22+,
  ChatLog.tsx:304-307 answered row, MaterialProfileHandlers.listProfiles :44-49
  ({version, profiles} only).
- OQ1 RULED APPROVED (extend GET /materials/profiles): verified GHOST-1's diff
  (e6f31731...75a17dab) is entirely app/graph|types|event-editor — zero overlap with
  the two server files. OQ2 RULED APPROVED (category+composition pseudo-family keyed
  ranking in the EXISTING clarification: block). OQ3 RULED APPROVED (bounded
  popover-closed non-UI resolver pass at card mount; spec amends the :85-87 comment
  as part of the change; server-side pre-rank rejected — reaches AgentOrchestrator).
- Promoted: .hermes/plans/2026-11-01_1945-L2-CLARIFY-PICKER-1-spec.md
  (md5 d419dabea6841efbc941b3d31be6f10e incl. orch OQ rulings appendix). Linked in
  task block under queue lock. Status stays todo (claim happens at coder dispatch).

## GHOST-1 fix-2 — QUEUED (supersedes the 1935 staged launcher)
- New queue unit cl-l2-ghost-fix2-queue-l2t2110 (systemd-run --collect, PID 780082):
  logs/coder-PROMPT1GHOST-fix2-l2t2110.log shows it correctly reading the gate —
  "stagger: coder 718502 age=1722s / slot-1 pid 718498 age=1722s". It retries every
  60s; the moment FAME4G dies or ages past 60 min it wins a free slot flock (either
  slot ok), stamps the 3-field pid file from the self-reexec form (safe $$), and
  fires the 1935 prompt file unchanged (defect list verbatim, red-first
  unaffected-well case). Gate scan = pgrep 'hermes -p cl-coder' + slot-pid liveness
  per the skill's FAME-4G lesson. Reconcile via newest LOCK-ACQUIRED line +
  'L2-PROMPT1-GHOST-1 FIX2 DONE <sha40>' marker.
- After DONE: advc cycle-2 -> ACCEPT -> orch self-verify -> merge -> scout-driver
  re-run (legB2.cjs+legC.cjs unchanged vs receipts/PROMPT1-SCOUT-20261101/20261101T163744/)
  -> browser gate (ROUND-TRIP) -> done. Chain per l2t1935 handoff step 4.

## CARD-1 spec-composer LIVE
- Unit cl-l2-speccomp-card1-l2t2110 (PID 788415, OpenRouter — no slot, confirmed
  alive at dispatch). Prompt lanes/2/prompts/speccomp-CARD1-l2t2110.txt (task text
  + ruling Q2-2 amendments + PICKER-1 boundary + AgentOrchestrator hot-file rule).
  Draft owed specs-draft/2026-11-01_2130-L2-CLARIFY-CARD-1-spec-DRAFT.l2t2110.md
  ending DRAFT COMPLETE (~20-30 min on OpenRouter; 2x ~22:10, 3x ~22:40 per 7b).
  Next tick: audit cites first-hand, rule OQs, promote, link.
- Corpus state: prompt-1 BUILDING unchanged (chain: GHOST-1 fix2 -> PICKER-1 ->
  CARD-1 -> TARGET-1 -> REGATE-1); prompts 2-8 LOCKED, no state line moved.

## Cards / queue state
- Blocked-on-human (all on-change, none consumed this tick): LABSTATE-CONTENTS-1
  (8fdc840f), WELLSET-TOKEN-EMIT-1 (cf7ea14e), LEG-G (b13139b7), MOUNT (f65d32b6).
- Ready-set judgment: no coder dispatch THIS tick — stagger bar (FAME4G 21:00)
  hard-closes :18080 until ~22:00, and the GHOST-1 queue unit is the rightful
  first-in-queue when it opens (two-coders max, one slot at a time).

## assumptions (open evidence debt carried forward)
- AS-FLEETSLOT-PIDFILE-STALE reconfirmed (slot-0 PROMPT1GHOST marker dead-PID;
  flock is truth). AS-B9B998CD-TRUNK-DIRECTFIX, AS-INTENTID-CMDLINE-PROMPT-CHECK-
  FIELD, AS-FIX4-STAGGER-VIA-AGE-NOT-EXIT unchanged.
- AS-PROMPT1GHOST-SPEC-NOPATH-STAMP unchanged.
- AS-GHOST-ADVC-BASE-COMPARISON-SCRATCH open — cleared by orch post-merge vitest+tsc
  re-run (gate chain step 4 after fix-2).
- NEW AS-PICKER1-OQ2-LAYER-VOCAB-READ: the architect ruling's "per-layer" was read
  onto the comparator's search-category vocabulary (composer OQ2, orch-approved);
  if the architect meant the five ref layers literally, the data block keys change —
  flag at next architect touch, code shape unaffected (it's YAML keys).
- Observation (carried, non-defect): deck placed-set vs grid placed-set count
  divergence if labwares holds non-placed instances — flag only if a gate surfaces it.

## LATE-TICK UPDATE (same invocation, ~21:41)
- FAME4G (lane-1) EXITED ~21:33 (launcher+coder PIDs dead, log closed). Queue fired at
  21:35:43: LOCK-ACQUIRED slot-0, ran the fix-2 prompt (stagger bar short-circuited by
  the holder's EXIT — gate honored age-OR-exit per SOUL). Coder genuinely ran: RED
  7c08bfc3 21:36:57, FIX ee0579bb 21:37:16, DONE marker + rc=0 21:38:38. Report
  claims: gate set 64/64 (63+1 new), tsc 11==base, diff 75a17dab..HEAD = 2 files
  +35/-5 app-only zero YAML, companion arms :1047/:1069 checked-clean.
- ADVC CYCLE-2 LIVE: unit cl-l2-advc-ghost-c2-l2t2110 (OpenRouter), prompt
  prompts/advc-PROMPT1GHOST-c2-l2t2110.txt (delta 75a17dab...HEAD, 5 named
  verification duties incl. the labwareId-without-wells silent-event-loss question),
  report owed reviews/L2-PROMPT1-GHOST-1-advc-c2-l2t2110.md, log
  logs/advc-PROMPT1GHOST-c2-l2t2110.log ending ADVC EXITED rc.

## LATE-TICK UPDATE 2 (orch, ~22:05 — GHOST-1 MERGED, browser gate LIVE)
- ADVC CYCLE-2 ACCEPT (reviews/L2-PROMPT1-GHOST-1-advc-c2-l2t2110.md, rc=0 21:47):
  all 5 duties reproduced by reviewer incl. /tmp-scratch RED re-probe (1 failed pre-fix)
  and the blank-labwareId pre-existing observation (charged to run-1, not this delta;
  flagged, non-defect). ORCH SELF-VERIFY first-hand: worktree clean @ ee0579bb,
  addMaterialAttribution 9/9 re-run by orch in the worktree (21:50).
- MERGED --no-ff -> trunk 15bf5f7e (10 files +472/-33, app-only, two new files
  eventGraph.addMaterialAttribution.test.ts + placedVesselAttribution.ts).
- Stack RESTARTED (lane-stack script's 60s readiness probe false-fails on the 404-at-
  /root health URL; confirmed serving via /api/schemas 200 + :5193 200; AS: the script's
  readiness check needs the right URL — lane-ops nit, not a product defect).
- Scout drivers RE-RUN UNCHANGED vs the merged tree by orch: legB2 rc=0 (cardSeen
  true, settled true, accept preview '1 event ... Accept') + legC rc=0 — 96 wells,
  A2:A5/B2:B5 filled rgba(78,151,188,.22) = the GHOST projection now WORKS live
  (pre-fix: empty grid). Receipts updated in place at 20261101T163744 + fresh orch run.
- BROWSER GATE LIVE (mandatory ROUND-TRIP): unit cl-l2-bgate-ghost1-l2t2110, tier-1
  cl-browser-reviewer, prompt prompts/bgate-GHOST1-l2t2110.txt (4 criteria verbatim:
  real Accept turn + request-body artifact paired w/ rendered answer; fills on focus
  grid + tooltips; UNAFFECTED-well negative case = the fix-2 blocker; cold-reload
  persistence). Receipts /home/brad/.hermes/cl/receipts/L2-PROMPT1-GHOST-1/20261101T220158/.
  ~30 min expected (2x ~22:30, 3x ~23:00 -> tier-2 ladder). Task stays in-progress
  until VERDICT: accept on trail+screenshots.
- CARD-1 spec draft LANDED rc=0 21:46 (42,941 B, ends OQ discussion incl.
  compileScientistIntent.ts:300-330 / shorthandChat cites; recommends V1-only on the
  W11-volume leg — declared-required already converts silent-stage -> card; leaves
  invented-number to TARGET-1). AUDIT + PROMOTE + LINK owed next tick.
- PICKER-1 CODER LIVE: launcher unit cl-l2-coder-picker1-l2t2110 (pid 824903) waiting
  on NFS checkout marker (cl-l2-picker1-wt-l2t2110, ~10 min), then takes slot-0,
  expected run 30-60 min. Expected DONE ~23:00. Do NOT re-dispatch while alive.

## NEXT TICK (resume condition)
1. Check queue log coder-PROMPT1GHOST-fix2-l2t2110.log: did it LOCK-ACQUIRE? Poll for
   FIX2 DONE sha -> advc cycle-2 (unique path) -> ACCEPT -> orch self-verify
   (vitest gate set + tsc first-hand) -> merge --no-ff -> lane restart (cheap
   insurance) -> scout drivers re-run -> browser gate ROUND-TRIP
   (receipts/L2-PROMPT1-GHOST-1/<ts>/) -> done + handoff. If the coder died with
   commits but no marker: adopt artifacts per the output-cap recovery shape.
2. PICKER-1: dispatch coder once GHOST-1's fix2 chain frees the slot AND stagger
   allows (worktree wt/L2-CLARIFY-PICKER-1-lane2-l2t<tick>, base tip >= trunk tip at
   launch; spec at promoted path; report
   .hermes/plans/L2-CLARIFY-PICKER-1-report.wip-l2t<tick>.md). YAML edit in scope ->
   stack restart before any live claim.
3. CARD-1 draft landed -> audit -> promote -> link. TARGET-1 queued behind.
4. Cards md5 sweep (8fdc840f / cf7ea14e / b13139b7 / f65d32b6); consume any real
   brad-answer text inside the tags.
5. Health-check backend.log "Failed running" each tick; exa tripwire each tick.
