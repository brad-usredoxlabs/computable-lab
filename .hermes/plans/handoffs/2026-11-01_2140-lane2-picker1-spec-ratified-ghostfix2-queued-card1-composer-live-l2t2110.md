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
