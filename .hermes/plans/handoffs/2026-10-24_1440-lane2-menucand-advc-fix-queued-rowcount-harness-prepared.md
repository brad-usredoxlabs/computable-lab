# LANE 2 HANDOFF — l2t1420 (2026-10-24T14:40 EDT) — MENU-CAND advc FIX VERDICT PROCESSED (FIX-1 QUEUED), ROW-COUNT DRIVE HARNESS BUILT + NEGATIVE-CONTROL PROVEN, CHAIN FIX-4 CODER STILL LIVE

Trunk: e4ff7105 (unchanged this tick; no merges). Stack UP :3093/:5193 (200/200). Brad's stack
untouched; no model services touched. Fleet rule held: exactly ONE live coder (CHAIN-FIX4 since
13:53, still live at checkpoint, CPU-active). Readiness: 0 due/changed blockers; no human question
re-asked. No ready todo items — queue saturated with 4 in-flight units + 2 waiting.

## RECONCILE (first-hand, 14:10-14:38)
- MENU-CANDIDATES-1 ADVC CYCLE-1 COMPLETED rc=0 14:15:56 — VERDICT: fix, TWO MINOR defects,
  ALL FUNCTIONAL MANDATES PASS (scope 2-files-only, dedup key entityKind+normalized-title with
  row key entityKind:recordId, dedup after rank-sort before slice, byte-stability additions-only
  200/0, three joiners only, abort-guard, exactOptional, RED-credibility, 22/22 green, tsc zero
  new error lines in diff, worktree clean). Report:
  reviews/MENU-CANDIDATES-1-advc-c1-l2t1355.md.
  - D1 (minor, REPORT-TEXT ONLY): cycle-1 report claimed 'existing 19 tests'; true 18+4=22.
    ORCH RULING: correction rides the FIX-1 report text (the delivered cycle-1 report path is
    an immutable artifact) — prompt says so explicitly. No code change for D1.
  - D2 (minor, TEST-CODE): component-expansion mocks not routed per-token; only first token's
    search gets the mocked body, rest fall through unmocked — per-token attribution untested.
    Fix: route by q param, assert search-count == token-count.
- FIX RUN 1 QUEUED 14:20 FIFO behind CHAIN-FIX4 + READCARD-FIX1: unit cl-l2-menucandfix1-queue-
  l2t1420 (systemd --user --collect, MainPID 3992818, VERIFIED waiting — tmp-pid file absent, no
  premature flock grab), prompt prompts/coder-MENUCAND1-fix1-l2t1420.txt (defect list VERBATIM
  from the review + orch D1 ruling), unique report deliverables/MENU-CANDIDATES-1-fix1-report.
  l2t1420.md, log logs/coder-MENUCAND1-fix1-l2t1420.log. Task block annotated under queue lock
  (status line grepped back after write — AS-LANE2-TASKLIST-STATUS-NOT-LANDED-TWICE lesson held).
- ROW-COUNT DRIVE HARNESS PREPARED + PROVEN (post-merge obligation prep): scripts/
  menucand-rowcount-drive-l2t1420.mjs — orch-authored Playwright: opens run page, chat tiptap
  editor, types '/m <role-gap aggregate label>' (NOTE: '/m' REQUIRES a trailing SPACE or the
  suggestion query is empty and no rows render — discovered first-hand), waits rows, asserts
  aggregate-titled rows <=2 AND >=1 per-component row ('Thermo DMEM'/'Thermo FBS'/'Thermo
  trypsin-EDTA'), receipts with trail.json/report.md/rows.json/menu-rows.png, exit-0 only on
  VERDICT accept.
  NEGATIVE CONTROL RUN (pre-merge, trunk): VERDICT fail — 7 aggregate-titled rows, 0
  per-component — the defect reproduces live AND the harness bites
  (receipts/MENU-CANDIDATES-1/dryrun-premerge-1436/). Post-merge, re-run against merged trunk;
  accept closes AS-LANE2-MENUCAND-NO-BROWSER-GATE evidence debt.
  Observation from the dry run: live row set at trunk = 4x Formulation rows + 2x Ontology rows
  (aggregate-titled) + mint. The Ontology-badge rows ALSO carry the identical aggregate label —
  ontologySuggestions is NOT covered by the fix's dedup (app-side materialSuggestions ledger may
  not share the label ledger with the ontology tier; the fix keeps ontology via a separate
  path). If the post-merge drive still counts ontology-badge rows with the identical aggregate
  label toward >2, that is a REAL residual-defect finding, NOT a harness bug — escalate to the
  coder, do not soften the criteria.
- CHAIN FIX-4 CODER LIVE (pid 3917749, fleet lock 13:53, elapsed 45 min at checkpoint, CPU
  actively advancing, session time advancing between samples). Worktree server/app files
  touched after dispatch. Report not yet owed-due. DO NOT re-dispatch; expected coder duration
  ~60-90 min; escalation watch at 2x (~130 min = 16:03) per rule 7b.
- QUEUE MAP AT CHECKPOINT: LIVE coder = CHAIN fix-4. Flock-waiting: readcardfix1 (flock 3917745).
  Pid-waiting FIFO: roleaxes1-resume1 (3918844) — wait-list STALE (watches dead unit 3534463,
  harmless no-op; then 3746049, 3746051). NEW pid-waiting: menucandfix1 (3992818) watches
  3746051+3746049. ORDERING RISK at next wake: three flock waiters (readcard, menucand-fix1,
  roleaxes-resume1) race the kernel — flock has no FIFO (AS-LANE2-FLOCK-NOFIFO-RACE); whichever
  wins runs, others queue; do NOT preempt.
- advc MENU-CAND log: cloud run completed, no residue processes.

## DECISIONS MADE THIS TICK
1. D1 closed by fix-report text (delivered reports are immutable artifacts).
2. Row-count drive harness built + negative-control validated NOW (pre-merge fail is the
   defect's live proof), so the post-merge gate is a single command next tick.
3. Menu trigger needs '/m ' with space — harness corrected before delivery.

## NEXT TICK (priority order)
1. CHAIN FIX-4 (LIVE): on exit -> advc fix4-diff-scoped (g1d defect text D2(a)/(b)/(c) + D3) ->
   ACCEPT -> self-verify -> merge wt/MATRES-CHAIN-fix3-lane2-l2t0945 branch -> RESTART
   background=true -> g1e re-gate tier-2 cloud (criteria verbatim). Same-defect repeat at g1e =
   architect.
2. READING-CARD fix1 / MENU-CAND fix1 / ROLE-AXES resume1 — whichever wins the flock first:
   on exit -> advc scoped to the NEW commits (readcard: 147b00e0...HEAD; menucand-fix1:
   c67c4d8c...HEAD; roleaxes: 6d64154b...HEAD w/ bait list + byte-pin GREEN + grep-clean legs)
   -> ACCEPT -> self-verify -> merge -> RESTART -> drives:
   - menucand: `node scripts/menucand-rowcount-drive-l2t1420.mjs /home/brad/.hermes/cl/
     receipts/MENU-CANDIDATES-1/<ts>` (curl the served module for aggregateComponentTokens
     first).
   - readcard: live canonical 2-card drive -> REVISE-GHOST attempt-6 FULL F1 gate
     (scripts/revise-ghost-a5.mjs; tier ladder 6c; F2-head WAIVED per Ruling 3).
3. W2-11 D4 architect re-consult: still gated on REVISE attempt-6 acceptance.
4. MIXFRAC-1 gate obligations — carry unchanged.
5. Backlog candidates unchanged (+ trunk hygiene card for revision-ref.schema.yaml $ref —
   AS-LANE2-SCHEMA-3FAIL-BASELINE).

## Blockers / open obligations (carried)
- READING-CARD-ANSWER-1: fix-1 (flock-waiting) -> advc c2 -> merge -> live drive -> attempt-6 gate.
- MATRES-CHAIN: fix-4 (LIVE) -> advc -> merge -> g1e gate. Done only on receipts accept.
- REVISE-GHOST-1: attempt-6 awaits READING-CARD merge. F2-head waiver stands.
- ROLE-AXES-1: resume1 pid-waiting; D-A/D-B/D-C gate-blocking defects ride its prompt.
- MENU-CANDIDATES-1: fix-1 queued; post-merge row-count drive owed (harness READY +
  negative-control proven).
- W2-11 D4 re-consult: OPEN (gated on attempt-6).
- MIXFRAC-1 gate obligations: carry unchanged.

## assumptions:
- NEW: AS-LANE2-MENUCAND-D1-REPORTTEXT-CLOSURE (orch ruling: cycle-1 report immutability ->
  D1 correction rides fix-1 report text; evidence debt false — the substantive claim was
  already verified true by advc).
- NEW: AS-LANE2-MENUCAND-ROWCOUNT-ONTOLOGY-AMBIGUITY (criteria counts AGGREGATE-titled rows
  across badges; whether ontology-tier rows are in the fix's dedup remit is unresolved in the
  ratified spec — pre-merge drive shows 2 ontology-badge aggregate rows; if post-merge drive
  fails ONLY on those, route back to coder as residual defect, do not soften).
- CARRIED (no change): AS-LANE2-QUEUELOCK-FILE-RESIDUE, AS-LANE2-READCARD-D1-RATIFIED,
  AS-LANE2-FIXQUEUE-FIFO-ORDER, AS-LANE2-MENUCAND-OQ-RULINGS, AS-LANE2-MENUCAND-NO-BROWSER-GATE
  [row-count drive owed], AS-LANE2-MENUCAND-CHECKOUT-REDO, AS-LANE2-READCARD-CODER-SELFREPAIR,
  AS-LANE2-CHAING1C-TIER2-DIRECT, AS-LANE2-CHAIN-CARD-LOCATION, AS-APP-TSC-BASELINE-28,
  AS-LANE2-PLAYWRIGHT-EXEC-PIN, AS-PANEL-GATE5-DRIVE-RECON, AS-PANEL-AC3-RESOLVER-HOME-FIX,
  AS-PANEL-SPEC-LEVEL-FORMULATION-OBS, AS-LANE2-PANEL-TSC-DIFF-PROVISIONING,
  AS-LANE2-PANEL-GATE-NEWRUN-ON-FIX, AS-LANE2-CHAIN-DEFECTS-ORCH-VERIFIED,
  AS-LANE2-CHAIN-OQ2-CORRECTION, AS-ANSWERFOLD-FIXTURE-FRACTIONS, AS-LANE2-FULFIL-CWD-CONVENTION,
  AS-LANE2-FIX2-FIFO-ORDER, AS-LANE2-GAPCARD-PARAMINPUT-TRACKED-COPY,
  AS-CELLRATE-OQ1-PRECLEARED-TRACKED-COPY, AS-PROTOAI13-MENU-DRIFT-NEW-PREREG,
  AS-LANE2-CHAIN-G1B-VISION-FIFO, AS-ANSWERFOLD-BASE-PRECELLRATE, AS-LANE2-SPECCOMP-EMPTYARG-QUIRK,
  AS-LANE2-ROLEAXES-WIP-PRESERVE, AS-LANE2-SCHEMA-3FAIL-BASELINE, AS-LANE2-FLOCK-NOFIFO-RACE,
  AS-LANE2-TASKLIST-STATUS-NOT-LANDED-TWICE.
- Open evidence debts: AS-LANE2-MENUCAND-NO-BROWSER-GATE (row-count receipts owed post-merge;
  NEGATIVE-CONTROL raws exist at dryrun-premerge-1436), AS-LANE2-ROLEAXES-WIP-PRESERVE (resume-
  branch advc ACCEPT owed), attempt-6 acceptance debt on REVISE-GHOST-1,
  AS-LANE2-GAPCARD-PARAMINPUT-TRACKED-COPY + AS-CELLRATE-OQ1-PRECLEARED-TRACKED-COPY
  (main-promotion reconciliation).

## live-worker checkpoint at exit (~14:42 EDT; ~32 min wall)
- LIVE CODER (fleet lock since 13:53): MATRES-CHAIN FIX RUN 4 — hermes 3917749 under unit
  cl-l2-chainfix4-queue-l2t1245 (bash 3746051); log logs/coder-MATRESCHAIN-fix4-l2t1245.log;
  worktree wt/MATRES-CHAIN-fix3-lane2-l2t0945; report owed deliverables/MATRES-CHAIN-fix4-
  report.l2t1245.md. Elapsed 45 min, CPU-active. Do NOT re-dispatch. Escalation watch 2x ~16:03.
- FLOCK-WAITING: cl-l2-readingcardfix1-queue-l2t1245 (unit 3746049, flock 3917745).
- PID-WAITING: cl-l2-roleaxes1-resume1-l2t1355 (bash 3918844; stale watch on dead 3534463 is a
  harmless no-op); cl-l2-menucandfix1-queue-l2t1420 (systemd MainPID 3992818).
- Trunk HEAD e4ff7105; :3093 /api/health 200, :5193 200. ROLE-AXES branch carries orch wip
  commit b0f72ce2 (NOT merged). MENU-CAND branch at c67c4d8c (NOT merged; fix-1 pending).
