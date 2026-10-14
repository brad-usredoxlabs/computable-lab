# Handoff — lane 1 tick 20261013T1120 (ISEQ-1 resume dispatched; OLIGO-AI-3 gate tier-2 retry; DOCINGEST-A composer live)

Author: orchestrator cron tick — 2026-10-13 ~11:20–12:00 EDT — lane 1. Within budget.
No kills. :3001/:5174 never touched. :3092/:5192 200 throughout.

## What happened this tick

1. RECONCILED both 1120-checkpoint workers first-hand:
   - OLIGO-AI-3 tier-1 browser gate EXITED rc=0 11:36 with **VERDICT: blocked** — and the
     block is a HARNESS error, falsified first-hand before re-shooting: the reviewer uploaded
     the fixture via curl, then navigated `/ingestion/oligo-orders?jobId=ING-OTHER-6OLW4H`
     expecting a deep link. The app has NO url-param job loading — SequenceImport.tsx has no
     useSearchParams (grep verified in the served checkout); job state = component state +
     sessionStorage `cl-oligo-job`; the reopen flow is the Reopen-field + "Reopen review"
     button. The job is healthy server-side: GET :3092 /api/sequences/order/ING-OTHER-6OLW4H
     -> 200 with full extracted text. S1 pass, S2 pass-via-API only, S3-S6 never exercised
     through the real UI. Receipts OLIGO-AI-3/20261013T1110/ (report.md, trail.json; NO
     screenshots S2-S6 of real states).
   - ISEQ-1 coder run l1t1020 DIED: log "CODER EXIT rc=137 11:19:35", launcher 1552953 gone,
     lock released (lane-2 retaken it 11:27 for SHORTHAND-COMP-1-FIX2). Kill source
     unidentified: no kernel OOM entry for the window, cl-coder sequential_call=0 rules out
     the harness deadline. PARTIAL WORK PRESERVED in wt/ISEQ-1-lane1-l1t1020: committed RED
     cfe63a66 (BiosourceHandlers.test +133, NcbiNucleotideTools.test +299) + UNCOMMITTED
     ncbiTools.ts +163 (sequenceTitleTerm/organismClause/esearchIds/shared registration —
     matches OQ1/OQ2 adjudications on inspection of the diff head) + test +5. Report
     iseq-1-report-l1t1020.md documents the prep repair (32 stale-symlink materializations)
     and the baseline re-measurements @95d340a8 (server tsc 0, app tsc 23, sequences 10 files
     72p/2s, ExaTools 3, IngestionPage 3, fail-files 59, list file saved).
2. ISEQ-1 RESUME DISPATCHED (adopt-first): launcher proc_2545e6ecebad pid 1695812
   (queue-iseq-1-resume.sh; flock-queued BEHIND lane 2's coder — pidfile currently names
   SHORTHAND-COMP-1-FIX2, retakes on acquire). SAME worktree/branch l1t1020 (guard skips
   worktree add; base 95d340a8 holds), prompt prompts/coder-ISEQ1-l1t1150resume.txt
   (first action = status/diff confirm + RED run with quoted failing output; the +5 test edit
   must be reconciled, never weaken assertions; §9 continues from C2 GREEN), log
   logs/coder-ISEQ1-l1t1150resume.log, NEW report iseq-1-report-l1t1150resume.md, end-marker
   "ISEQ-1 CODER DONE <sha>". Expected ~60-90 min AFTER lock acquire.
3. OLIGO-AI-3 GATE TIER-2 RETRY (SOUL-6c ladder — harness was the suspect, tier raises):
   launcher proc_beff4fd6531e pid 1695825, `hermes -p cl-browser-reviewer
   -m deepseek/deepseek-v4.1-flash --provider openrouter`, prompt
   prompts/browergate-oligoai3-l1t1150-t2.txt embeds the exact UI mechanics from the served
   SequenceImport.tsx (setInputFiles on the .pdf/.txt input in the order-confirmation
   fieldset, one page context across reload for sessionStorage, reopen-with-empty-field =
   last job, fresh upload — never reuse ING-OTHER-6OLW4H, real-model-call waits,
   negative-claim re-verification). Receipts OLIGO-AI-3/20261013T1150/ — fixture already
   staged, shots/ landing at checkpoint (live, forward motion). Log
   logs/browergate-oligoai3-l1t1150-t2.log. Expected ~30-45 min.
4. DOCINGEST-A SPEC-COMPOSER dispatched (next ready item behind ISEQ-2 in FIFO; ISEQ-2 spec
   is already promoted so DOCINGEST-A is the next to need one): proc_4f6e1f170723 pid
   1700131, thunderbeast, draft path
   .hermes/plans/drafts/2026-10-13_docingest-a-stage-a-spec.l1t1155.draft.md, log
   logs/composer-DOCINGEST-A-l1t1155.log, end-marker "COMPOSER DONE DOCINGEST-A <bytes>".
   It re-measures baselines at 95d340a8 and reconverges on decodeAttachment.ts + the 4
   bypass sites. Review + promote before any coder sees it.
5. Silent checks: OWN-13 DEV-1 — trunk CLAUDE.md md5 still
   cc43d17766d5606ee3d532c5356cbff4 (rule-9 absent, never re-asked). OWN-14 — decisions/
   newest still L1-qms-field-defects-ruling-20261010 (blocker stands, silent).
   computable :8080 vision endpoint healthy (the 11:10 cudaMalloc-OOM journal spam is a
   DIFFERENT llama-server instance restart-loop, not the pinned pid-1256 server now
   serving /health ok).

## Live at checkpoint (do NOT duplicate)

1. ISEQ-1 resume coder launcher 1695812 / proc_2545e6ecebad (may still be flock-queued —
   check the lock pidfile line for ISEQ-1-resume(l1t1150) before concluding it started).
   On exit: ADVERSARIAL GATE (spec §11 12-bait list, unique path
   reviews/iseq-1-advreview-l1t<ts>.md); FIX -> fix run same worktree (max 2 cycles);
   ACCEPT -> orch-verify (server NcbiNucleotideTools+BiosourceHandlers, ExaTools 3,
   sequences byte-arms, app IngestionPage+SequenceSearch, tsc 0/23, fail-file 59->60 only,
   server tools/ncbiTools ARE in scope, app/e2e pill spec expected), merge --no-ff, RESTART
   lane stack (SOURCE_MAP server change), LIVE PROBES §10 curls on :3092, then BROWSER GATE
   §13 on :5192 (receipts ISEQ-1/<ts>/; pill contrast before/after; confirm served checkout
   contains the merge sha first).
2. OLIGO-AI-3 gate tier-2 proc_1695825 / launcher 1695825. VERDICT: accept -> mark
   OLIGO-AI-3 done (code track already merged 95d340a8; closes AS-ORCH-L1-070) + handoff.
   VERDICT: fix -> defect list with absolute screenshot paths to a fix run off trunk.
   Death/hang/no-trail past ~75 min OR another harness-class failure -> AS-ORCH-L1-078 says
   the suspect becomes the served frontend: run the orch-route (own Playwright script
   driving the mechanics in the t2 prompt, judge artifacts) instead of a tier-3 shot.
3. DOCINGEST-A composer proc_1700131 (~45 min). On delivery: anchor spot-verify at trunk
   (post-ISEQ-1 trunk if it moved), adjudicate OQ1-OQ3, promote, link in task block.

## Next tick (ordered)

1. Reconcile the tier-2 gate (proc 1695825 + receipts 20261013T1150 trail/report). Accept
   -> OLIGO-AI-3 done + assumptions AS-ORCH-L1-070/078 closed. Fix -> fix run (FIFO behind
   ISEQ-1 if it holds the lock). Harness-class again -> orch-route deterministic Playwright
   per AS-ORCH-L1-078.
2. Reconcile ISEQ-1 resume (pidfile line + log + report end-marker). Exited -> §11-bait
   adversarial gate. Alive past ~2x (~3h after lock acquire; if it never acquires behind a
   long lane-2 run that is NOT its death — rule-7b applies to the worker, not the queue) ->
   rule-7b.
3. DOCINGEST-A composer review/promote when delivered.
4. OWN-13 md5 / OWN-14 approvals silent checks; :3092/:5192 health.

## Evidence-debt / carried (OPEN unless stated)

- OPEN: AS-ORCH-L1-042; AS-ORCH-L1-048/054 (close only when rule-9 applied);
  AS-ORCH-L1-068 (closes only at OWN-14's gate); AS-ORCH-L1-070 (OLIGO-AI-3 browser
  obligation, pinned 95d340a8); AS-ORCH-L1-077/078 (new this tick).
- OPEN: OWN-13 DEV-1 rule-9 append (Brad/interactive-owned; text in
  own13-report-l1t1900resume.md DEV-1).
- Record-only: OLIGO-AI-3 cycle-2 residual notes (C8 static-trace finalization;
  manual-reopen-input shared-state quirk — future polish, do not bundle);
  OLIGO candidate_refs reverse-index note; bare-"Total <digits>" class; OLIGO-AI-3 OQ3
  dye-leak config fix = future queue proposal; sequenceSources.ts:44 alphabet hardcode
  (ISEQ-1 §15 forbids bundling); OLIGO reviewer O1-O5; QMS-7 doc nits; grant authoring gate
  unwired (OPS-1 b); reviewer-harness cwd trap; registry pre-transition payload echo;
  CF-OWN1-A/B; AS-OWN5-002; AS-ORCH-L1-036; OWN-8 reviewer obs 2; OWN-13 DEV-2 erratum;
  app tsc baseline 23; OWN-10 reviewer O1; vitest --dir false-failure + server-suite cwd
  trap; OWN-11 mock-path erratum; POLICY_ROOT_KINDS = OWN-14 scope; browser/ package
  doubly-orphaned.
- NEW record-only (harness lesson, cl-browser-reviewer prompts generally): the oligo review
  UI has NO url deep-link — any future gate prompt for SequenceImport surfaces MUST forbid
  curl-uploads + ?jobId= navigation and mandate setInputFiles + same-page-context reload.
  Filed into the tier-2 prompt; belongs in a reviewer-harness spec fix if a third incident.
- ISEQ-1 dead-run rc=137 kill source UNIDENTIFIED (no kernel OOM, no harness deadline). If
  the resume also dies rc=137, escalate as an environment defect (runner/watchdog audit)
  rather than re-dispatching a third time.

## assumptions
- AS-ORCH-L1-077: ISEQ-1 resume adopts the dead run's uncommitted ncbiTools.ts +163 and +5
  test edit on the assumption the +5 is a test-only refinement; the resume prompt forces the
  coder to reconcile it against the committed RED contract in the GREEN commit message.
- AS-ORCH-L1-078: the tier-1 VERDICT: blocked is a harness defect (mechanics the app doesn't
  have), falsified first-hand by grep of the served SequenceImport.tsx + a live 200 on the
  job endpoint; the tier-2 prompt's mechanics are complete and sufficient — if they still
  fail, the suspect shifts to the served frontend and the orch deterministic route runs.
- Lane-2 currently holds the fleet lock (SHORTHAND-COMP-1-FIX2 since 11:27); the ISEQ-1
  resume launcher is flock-queued, NOT dead — the pidfile flips to ISEQ-1-resume(l1t1150) on
  acquire.
- DOCINGEST-A composer dispatch is spec-composition only (no coder); dispatch_gate "OLIGO-AI-3
  merged" is satisfied (95d340a8); its CODER launch still waits ISEQ-2 + FIFO.
- No credentials recorded anywhere in this handoff.
