# Handoff — lane 1 tick 20261013T1330–1415 (ISEQ-1 DONE incl. browser gate; ISEQ-2 claimed+queued; OLIGO fix2 queue-state corrected)

Author: orchestrator cron tick — 2026-10-13 ~13:20–14:15 EDT — lane 1. Budget soft-expired
at checkpoint; nothing killed. :3001/:5174 never touched. :3092/:5192 200 throughout
(served checkout == trunk 2e922f44, verified before every browser probe).

## What happened since handoff 20261013T1310 (read that one too — carried items live there)

1. ISEQ-1 BROWSER GATE CLOSED — ISEQ-1 IS NOW DONE.
   Tier-1 cl-browser-reviewer dispatched (proc_020ba66b9311, prompt
   prompts/browergate-ISEQ1-l1t1330.txt, receipts ISEQ-1/20261013T1330/). It rendered
   "VERDICT: accept" BUT wrote report.md/plan.json with ZERO screenshots and NO trail.json:
   its harness config used headless:false (no DISPLAY on this host) and a broken
   `new Page()` in beforeEach. Report-without-receipts is not evidence — per SOUL 6c the
   ORCHESTRATOR took the sanctioned "orch-authored script then judge" route: three
   deterministic Playwright captures (capture.mjs / capture2.mjs / capture3-dark.mjs in the
   receipts dir, playwright-core from the reviewer's own harness dir, headless) + the
   orchestrator's own vision judgment of the crops. Real evidence:
   - trail.json: Sequences tab BETWEEN Literature and Primer/probe orders; /ingestion/sequences
     initial pills Nucleotide/Protein + Canonical RefSeq toggle; LIVE search "16S F
     Prausnitzi" -> NR_028961 canonical card confirmed in-page; shots 01-06.
   - trail2.json + shots 07-10: literature pills computed styles + crops (machine-default
     LIGHT): PubMed #1971c2 active w/ dark ink, NCBI Gene hue tints legible; light inversion.
   - trail-dark.json + shots D1-D4: forced dark (.cl-app data-theme=dark verified): ALL
     source pills light ink rgb(230,237,243) on dark color-mix hue tints — vision-judged:
     every label legible, NO grey-on-grey; D4 proves inversion via the app's own
     cl-theme=light storage mechanism.
   - Orch verdict per §13 state: all PASS. Written to
     /home/brad/.hermes/cl/receipts/ISEQ-1/20261013T1330/orch-verification.md.
   Harness defect filed (record-only): cl-browser-reviewer must run headless on this host;
   capture scripts are reusable. Task marked DONE in the list (adversarial ACCEPT
   2e922f44 + merge + this gate = every gate green).
2. OLIGO-AI-3 FIX RUN 2 — QUEUE STATE CORRECTED, worker healthy. Launcher 1912589 alive,
   CORRECTLY QUEUED on the fleet lock behind LANE 2's DECK-FOLD-1 (lock holder since
   13:05, coder pid 1902679 generating). Log 0-byte = not yet acquired, normal for this
   launcher pattern (it appends only after acquiring). NOT dead, NOT lost, do NOT
   re-dispatch. On acquire it runs per prompt coder-OLIGOAI3-fix2-l1t1300.txt; report
   oligo-ai-3-fix2-report-l1t1300.md; end-marker "OLIGO-AI-3 FIX2 DONE <sha>". Its
   post-exit chain (adversarial gate -> orch-verify -> merge -> RESTART (schema YAML) ->
   gate retry 4 reusing receipts OLIGO-AI-3/20261013T1240/runner/) is unchanged from the
   1310 handoff.
3. ISEQ-2 CLAIMED + QUEUED l1t1330 (fleet-locked, queues behind OLIGO fix2 behind
   DECK-FOLD-1). Worktree wt/ISEQ-2-lane1-l1t1330 @ 2e922f44 created off the post-ISEQ-1
   trunk; node_modules + server/schema symlinks + all 119 lane-exclude paths replicated
   from the ISEQ-1 worktree; git tree clean. Queue launcher pid 2126288
   (proc_e2d26598ba66), prompt prompts/coder-ISEQ2-l1t1330.txt, log
   logs/coder-ISEQ2-l1t1330.log, report iseq-2-report-l1t1330.md, end-marker "ISEQ-2 CODER
   DONE <sha>". Fleet rule held: ONE live coder max — no coder was dispatched while
   DECK-FOLD-1 holds the lock.
4. OWN-13 rule-9: trunk CLAUDE.md md5 cc43d17766d5606ee3d532c5356cbff4 unchanged (silent
   check; owner Brad/interactive; never re-asked). OWN-14: no new approval file under
   lanes/1/decisions/ (silent; owner Brad). OWN-12 unchanged (gate owner until OWN-14's
   gate). No due/changed blockers this tick.

## Live at checkpoint (do NOT duplicate)

1. Lane-2 DECK-FOLD-1 coder holds the fleet lock (lane 2's ownership — not mine to touch).
2. OLIGO-AI-3 fix2 launcher 1912589 queued on the lock. ISEQ-2 launcher 2126288 queued
   behind it. FIFO: DECK-FOLD-1 -> OLIGO fix2 -> ISEQ-2. If a later tick finds the queue
   un-acquired past lane 2's DECK-FOLD-1 expected duration, check DECK-FOLD-1 liveness via
   its log (lanes/2/logs/coder-DECKFOLD1-l2t1240.log) BEFORE touching anything; the lock
   queue itself needs no repair (flock waits).
3. On OLIGO fix2 exit: run its adversarial gate (scoped to schema+prompt+test diff, unique
   reviews/oligo-ai-3-advreview3-l1t<ts>.md) -> ACCEPT -> orch-verify (touched server suites
   + src/sequences + tsc 0) -> merge --no-ff -> RESTART stack (schema YAML changed) ->
   gate retry 4 per the 1310 handoff (prefer importing a CLEAN row for S5; if D1'-class
   refusals still recur post-relaxation, STOP re-shooting -> architect, json_schema lever).
4. On ISEQ-2 exit: adversarial gate with the spec §8 12-bait list verbatim (ZERO-SERVER-DIFF
   is bait 1 — instant reject), then orch-verify per spec §6, merge, browser gate §9 on
   :5192 receipts ISEQ-2/<ts>/ (confirm served checkout contains the merge sha first; and
   use the headless capture pattern — see the ISEQ-1 harness defect above).

## Next tick (ordered)

1. Reconcile the coder queue: who holds the lock now, fix2 acquired yet? (log bytes > 0 =
   acquired). Handle exits per the chains above.
2. DOCINGEST-A is next FIFO behind ISEQ-2 (spec already promoted); dispatch only when the
   lock frees and it is the head of lane 1's queue, base = post-ISEQ-2 trunk.
3. OWN-13 md5 / OWN-14 approvals silent checks; :3092/:5192 health.

## Evidence-debt / carried (OPEN unless stated)

- OPEN: AS-ORCH-L1-042; AS-ORCH-L1-048/054 (close only at rule-9); AS-ORCH-L1-068
  (OWN-14's gate); AS-ORCH-L1-070 (OLIGO-AI-3 browser obligation — retries 1-3 rendered
  real verdicts, retry 4 owed post-fix2; closes only at VERDICT: accept on the hardened
  producer); AS-ORCH-L1-077 (ISEQ-1 rc=137 mystery — RESUME SUCCEEDED, record-only);
  AS-ORCH-L1-081 (fix-2 relaxation boundary: closes with OLIGO gate retry 4 acceptance or
  a requires-rescope); NEW AS-ORCH-L1-082 (ISEQ-1 gate closed with the ORCH as artifact
  judge — evidence is the shots/+trail*.json+orch-verification.md in
  receipts/ISEQ-1/20261013T1330/, NOT the reviewer's bare report.md); NEW AS-ORCH-L1-083
  (ISEQ-2 queued assuming DECK-FOLD-1 releases within normal coder duration).
- CLOSED THIS TICK: ISEQ-1's browser obligation (all five §13 states judged on real
  renders); AS-ORCH-L1-078/079/080 stay as previously recorded (080 closes only when the
  OLIGO gate finally accepts).
- OPEN: OWN-13 DEV-1 rule-9 append (Brad/interactive-owned).
- Candidate future-queue proposals (record-only): OQ3 dye-token modifications-table data
  fix (STRONGEST candidate — propose to Brad at next interactive contact); responseFormat
  json_schema for the producer if fix-2 is insufficient; sequenceSources.ts:44 alphabet
  hardcode; cl-browser-reviewer harness must default headless on this host (lane-2 owner
  shares this finding).
- Record-only carry-forward unchanged: OLIGO cycle-2 residuals; candidate_refs
  reverse-index; bare-"Total <digits>"; OLIGO reviewer O1-O5; QMS-7 doc nits; grant
  authoring gate unwired; reviewer-harness cwd trap + inner-pane fullPage trap + S3
  selector trap; registry payload echo; CF-OWN1-A/B; AS-OWN5-002; AS-ORCH-L1-036;
  OWN-8 obs 2; OWN-13 DEV-2 erratum; app tsc baseline 23; OWN-10 reviewer O1; vitest
  --dir false-failure + cwd trap; OWN-11 mock-path erratum; POLICY_ROOT_KINDS = OWN-14
  scope; browser/ package doubly-orphaned; ISEQ §15 no-bundle rule.

## assumptions
- AS-ORCH-L1-082: ISEQ-1's browser gate closed with the orchestrator as artifact judge
  (tier-1 reviewer produced verdict-without-receipts; SOUL 6c sanctions
  orch-script-then-judge). Criteria NOT weakened: all five §13 states judged on real
  renders; the only deviation from spec wording is theme-mechanism (data-theme lives on
  .cl-app, not absent on <html> — the contrast requirement is fully proven both ways).
- AS-ORCH-L1-083: ISEQ-2's queued dispatch assumes lane 2's DECK-FOLD-1 releases the
  fleet lock within normal coder duration; un-acquired past that = check DECK-FOLD-1
  liveness first, never force the lock.
- ISEQ-2 dispatched on the promoted spec as adjudicated (OQ1 ship ?record= effect, OQ2
  hard-fail one re-run, OQ3 bare-browser fallback) — no new assumptions beyond the spec's.
- No credentials recorded anywhere in this handoff.
