# Handoff — lane 2 · 2026-11-01T23:45 EDT (l2t2310 — GHOST-1 DONE (browser gate audited+accepted); PICKER-1 resume run LIVE; CARD-1 spec RATIFIED)

## Reconcile (all first-hand; digest cl-reconcile.sh l2t2310 @ 22:56)
- Trunk ec5a9a97 (docs tip above merge 15bf5f7e), stack :3093/:5193 both 200. exa tripwire OK.
- In-progress at open: GHOST-1 (browser gate owed), PICKER-1 (coder run-1), LABSTATE-CONTENTS-1,
  WELLSET-TOKEN-EMIT-1 (both blocked-on-human; cards re-checked, unchanged, NOT re-asked).
- Fleet slots at reconcile: slot-0 pidfile claimed CLARIFYPICKER1-836329 ALIVE — but the LOG
  proved the coder session EXITED rc=0 22:57:19 with the appliance-2 OUTPUT-CAP death
  ("No visible answer was produced ... output-token limit"); ps + `flock -n` FREE confirmed dead
  owner, slot truly free. slot-1 FAME4GFIX1 pid DEAD (lane-1's, their business). No live
  `hermes -p cl-coder` anywhere. AS-FLEETSLOT-PIDFILE-STALE reconfirmed.
- PICKER-1 worktree (wt/L2-CLARIFY-PICKER-1-lane2-l2t2110, branch cl/lane2-clarifypicker-1-l2t2110):
  real artifacts despite the cap-death — commits a8962b27 (RED comparator) + f05b7b11
  (candidate_ranking DATA block) + valuable uncommitted diff (resolvers.ts +305/-157,
  clarifyPickerRanking.ts 281L, policy.ts 80L, client.ts, types.ts, 2 tests). Orch ran the
  slashMenu suite in-tree: 7 files / 75 PASS (23:05, first-hand output).

## GHOST-1 CLOSED (done) — full chain + receipt audit
- Chain (l2t2110 + this tick): fix-2 ee0579bb -> advc c2 ACCEPT -> orch self-verify 9/9 ->
  MERGE 15bf5f7e -> scout drivers legB2+legC unchanged rc=0 -> BROWSER GATE tier-1
  VERDICT: accept (receipts/L2-PROMPT1-GHOST-1/20261101T220158/).
- ORCH RECEIPT AUDIT FIRST-HAND (skill browser-gate-receipt-audit): trail.json 29 real steps;
  req-05.json body carries clarificationAnswers (MAT-thermo-dmem-1vq1) + context.selectedWells
  A7..D10, surface event-editor — ROUND-TRIP-GATE-1 body+answer pair SATISFIED; live record
  read-back via :3093 confirms evt-add_material-k5ix39zv {material "Thermo DMEM", volumeUl 100,
  wells A7..D10}; unaffected controls A6+A1 "0 µL Empty" (shots 14/15); cold-reload persistence
  (shot 17 + cold hover). md5 sweep: ONLY 07/08 byte-identical — disclosed by the report, and the
  trail's assertVisible .preview-bar (text "1 event Discard View changes Accept", t=25.78) backs
  it (absence-assertion exception). Vision spot-check: hover shot shows A7..D10 filled +
  tooltip "A8 / 100.0 µL / Thermo DMEM — 100.0 µL / 1 event applied", neighbours grey.
  4x 404 console lines reproduce on plain load (pre-existing, disclosed).
- Corpus: prompt-1 stays BUILDING — REGATE-1 needs PICKER-1 merged too; deps unchanged, not widened.

## PICKER-1 RESUME RUN DISPATCHED (slot-0, stagger honored)
- Stagger: prior :18080 coder exited 22:57 (>10 min at launch; skill's age-OR-exit), pgrep clean,
  both slot flocks FREE-probed.
- Unit cl-l2-coder-picker1-resume-l2t2310; launcher 1046517 took slot-0 23:19:11
  (pidfile CLARIFYPICKER1-RESUME-1046517-2026-11-01T23:19:11); hermes child 1046521;
  prompt-carry verified in /proc cmdline. Launcher has NO-SLOT exit-9 shape + pid stamped from
  the --inner self (skill-safe). Log logs/coder-CLARIFYPICKER1-resume-l2t2310.log; prompt
  prompts/coder-CLARIFYPICKER1-resume-l2t2310.txt (orch first-hand state dump + STEP-0
  commit-first + ANTI-CAP small-turn discipline per the output-cap recovery shape); report
  deliverables/L2-CLARIFY-PICKER-1-report.resume-l2t2310.md; marker 'L2-CLARIFY-PICKER-1 DONE
  <40sha>'. Do NOT re-dispatch while 1046517/1046521 alive.
- On DONE: advc (cloud) -> ACCEPT -> orch self-verify (spec's vitest set + tsc zero-new +
  grep-clean MATERIAL_CATEGORY_RANK) -> merge --no-ff -> RESTART (registry YAML changed!) ->
  browser gate ROUND-TRIP (spec's criteria) -> then CARD-1 dispatch becomes due-gate.

## CARD-1 spec RATIFIED + promoted
- Draft (503 ln, specs-draft/...l2t2110.md) audited; pin table spot-verified first-hand at
  ec5a9a97 (ChatLog.tsx:311 map; ClarificationPanel.tsx:147 + title; resolveNounsPass.ts:555;
  vocabulary volumeUl required:false :31-33; ClarificationPicker.tsx:440/:447 mint-from-query;
  clarificationAnswerPrompt.ts:24/:28).
- OQ RULES (appendix in the promoted spec, md5 9b7d6d247200e8eb8e80d729290b693b):
  OQ1 approved (marker of record = unresolved[]/not-stated/resolve_nouns bar; "quoted" language dead).
  OQ2 approved (fixture-replay T1/T2 docs through compileScientistIntent FIRST, then wire gate).
  OQ3 = APPROVED option (a): ONE AgentOrchestrator hunk threading effectivePrompt into the compile.
  Grounds: GHOST-1 merged + gated (serialization condition met); V1-only rejected — an INVENTED
  volumeUl passes a required-flag bar, so amendment (6) (never silently stage an invented number)
  needs the prompt-provenance leg. Coder must stop->BLOCKED if the hunk grows beyond that shape.
- DISPATCH GATE recorded in task block: after PICKER-1 merges, base tip >= that merge.

## Cards / queue state
- Blocked-on-human, all UNCHANGED, none consumed, none re-asked: LABSTATE-CONTENTS-1 fixrun2 card
  (74692e8b — matches the handoff's expected md5; earlier ticks' cf7ea14e tag was the tokensite
  QUESTION file md5, both files checked this tick), WELLSET-TOKEN-EMIT-1 tokensite question
  (cf7ea14e), LEG-G (b13139b7). brad-answer tags EMPTY everywhere (grep sweep). The 2026-10-31
  TOKENSITE RULING (090d473c, END-RULING) exists for LABSTATE — the OPEN item is Brad's Q3
  boundary-extension card, unchanged.
- Ready-set judgment: PICKER-1 resume is the only coder dispatch this tick (fleet max 2; lane-1's
  FAME4G-class runs keep slot-1 contested). CARD-1 is spec-ready but gated on PICKER-1's merge.
  TARGET-1 spec-composition can be commissioned when PICKER-1 lands (queue order per ruling).

## assumptions (open evidence debt carried forward)
- AS-FLEETSLOT-PIDFILE-STALE reconfirmed AGAIN (slot-0 pidfile named dead 836329 post-exit;
  flock is truth).
- AS-GHOST-ADVC-BASE-COMPARISON-SCRATCH CLEARED this tick (orch ran tests in-tree 75/75 for the
  picker tree; GHOST self-verify 9/9 ran l2t2110 + receipt audit closed the browser leg).
- NEW AS-PICKER1-RESUME-ADOPTED-UNCOMMITTED: the resume run STEP-0-commits the previous session's
  uncommitted diff as ITS OWN wip checkpoint (message says so); the diff's authorship is the dead
  run-1 session — advc must review the FULL branch delta (trunk...HEAD), not per-commit authors.
- NEW AS-GHOST1-ACCEPT-NO-LABWAREID-STAMP: the accepted event persists WITHOUT details.labwareId;
  projection rides the computeLabwareStates single-placed-vessel fallback (gate-proven live).
  If a multi-offer deck ever shows this shape, that's a new defect, not a regression of GHOST-1.
- AS-PICKER1-OQ2-LAYER-VOCAB-READ unchanged (architect touch flag stands).
- AS-B9B998CD-TRUNK-DIRECTFIX, AS-INTENTID-CMDLINE-PROMPT-CHECK-FIELD, AS-FIX4-STAGGER-VIA-AGE-
  NOT-EXIT, AS-PROMPT1GHOST-SPEC-NOPATH-STAMP unchanged.

## NEXT TICK (resume condition)
1. Poll logs/coder-CLARIFYPICKER1-resume-l2t2310.log for 'L2-CLARIFY-PICKER-1 DONE <40sha>' or
   BLOCKED; reconcile by marker + launcher PID 1046517 liveness + lock. Another cap-death with
   commits advancing = resume AGAIN with an updated dump (2x no-motion = switch route).
   On DONE: advc c1 (unique report path) -> route by defect class -> orch self-verify ->
   merge -> RESTART (YAML) -> browser gate ROUND-TRIP per spec -> done -> prompt-1 chain moves:
   CARD-1 dispatch becomes due-gate (stagger permitting).
2. CARD-1: spec promoted (.hermes/plans/2026-11-01_2330-L2-CLARIFY-CARD-1-spec.md); when
   PICKER-1 merges, dispatch coder base >= merge; OQ3 hunk approved — hold coder to ONE hunk.
3. TARGET-1: commission cl-spec-composer once CARD-1 is dispatched (queue order PICKER->CARD->
   TARGET->REGATE).
4. Cards md5 sweep (74692e8b / cf7ea14e / b13139b7); consume any real brad-answer text.
5. Health-check backend + exa tripwire each tick. REGATE-1 stays todo until GHOST-1 AND PICKER-1
   are merged (GHOST-1 now met).
