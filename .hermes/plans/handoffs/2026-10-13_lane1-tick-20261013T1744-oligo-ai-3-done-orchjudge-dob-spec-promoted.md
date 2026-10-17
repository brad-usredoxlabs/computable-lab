# Handoff — lane 1 tick 20261013T1744–1835 (OLIGO-AI-3 CLOSED via orch-judge gate; DOCINGEST-B spec promoted; DOCINGEST-A still coding; ISEQ-2 gate auto-dispatched)

Author: orchestrator cron tick — 2026-10-13 ~17:44–18:35 EDT — lane 1. :3001/:5174 never
touched. :3092/:5192 200 throughout. Read handoffs 20261013T1620, 1540, 1500 — carried items
live there.

## Reconciliation at tick start (verified first-hand: ps + git + receipts + state.db)

1. DOCINGEST-A coder ALIVE pid 2407986 (launcher 2330563 holds the fleet flock): real commit
   motion through 17:18 (32f5bc93 the UI GREEN; worktree files touched again ~17:30-17:59 —
   §7 gate-block work). 7 commits track spec §9. NOT re-dispatched. Report path
   lanes/1/docingest-a-report-l1t1520.md not yet written.
2. OLIGO t4 (tier-1, pid 2213141/2213202): STALL CONFIRMED — last session message 17:59, CPU
   time frozen across a 20 s sample, ~5h wall, receipts dir stuck at a 120 s blind
   waitForTimeout runner (its own last-mile rewrite). Per 6c: NO blind tier-1 re-shot; took the
   prepared ORCH-runner route.
3. DOCINGEST-B composer pid 2540301 finished during the tick (COMPOSER DONE DOCINGEST-B 35042).
4. ISEQ-2 gate queue pid 2364496 correctly slept on VISION-BUSY, then auto-dispatched tier-1 at
   18:33:56 (pid 2888288 running now against :5192, receipts ISEQ-2/20261013T1540/).
5. OWN-13: trunk CLAUDE.md md5 cc43d17766d5606ee3d532c5356cbff4 UNCHANGED -> silent. OWN-14: no
   new file under lanes/1/decisions/ (only the Oct-10 ruling) -> silent, not re-asked.
   0 due/changed blockers (cheap-gate dash confirmed).

## Work done this tick

1. OLIGO-AI-3 BROWSER GATE CLOSED (SOUL 6c orch-route, ORCH-as-judge — recorded). Ran the
   prepared deterministic runner (receipts OLIGO-AI-3/20261013T1744/, report.md ends
   VERDICT: accept; log shows two harness-bug failures fixed — diagnostic CODE strings never
   render in the DOM (messages do, SequenceImport.tsx:56) and a broken ancestor-xpath — then
   a clean "1 passed rc=0" on a FRESH upload, job ING-OTHER-FRFTFP, revision 0a4dc3f8 with
   fix2 9bb1758c null-union precondition verified on-disk first).
   Outcomes: S1/S2 PASS. S3: the real model call SUCCEEDED ~20 s — the D1/D1' JSON-refusal
   class is gone with fix2; 4 AI rows appended with verify-warning + sourceQuote disclosures +
   row-count banner, zero alerts. Verbatim-quote provenance re-verified FIRST-HAND from lane
   data (IAR-SC513I excerpt contains 4/4 AI sourceQuotes) — my DOM hay locator missed, the
   data check is stronger. S4 PASS. S5 BLOCKED-by-OQ3 exactly as pre-adjudicated: ALL 8 rows
   (4 deterministic + 4 AI) carry the leaked dye-token symbols ('6' from 6FAM-, 'I' from
   Cyanine- at base 5) and the UNCHANGED alphabet gate (sequenceEngine.ts:13) refuses both
   producers identically — save path verified to the validator boundary; full-save impossible
   on this fixture, rides the OQ3 data fix. S6 per adjudicated fallback: offer absent after
   reopen (no dead chrome). No product defect surfaced.
   ACTIONS: marked OLIGO-AI-3 DONE (first orchestrator-closed gate via orch-judge on this
   campaign; AS-ORCH-L1-070/081/084 CLOSED); terminated the redundant stalled t4 (NO report.md
   existed at kill time — confirmed first; its writes were fenced to 20261013T1450, which has
   no report.md; this freed the vision slot and the ISEQ-2 queue dispatched on it within
   minutes). NEW open evidence debt AS-ORCH-L1-088 (orch-judge visuals eyeball + OQ3-gated
   full-save leg) in assumptions.md.
2. DOCINGEST-B SPEC PROMOTED: composer draft reviewed — load-bearing cites spot-verified
   first-hand (oligo-order.yaml:58-65 ocr block exact; upload route server/src/api/routes.ts
   exists as cited; §0 structural gate requires the A merge + re-anchor). Promoted to
   .hermes/plans/2026-10-13_docingest-b-image-ocr-spec.md (md5 5b1bb796 match) + PROMOTION
   NOTE adjudicating OQ1 (dpi 200 / maxPages 40 / timeout 120 — config data, kit manuals
   exceed the oligo 20-page cap), OQ2 (no page-image cleanup in Stage B; record-only follow-up
   — no cleanup exists for pdf blobs either), OQ3 (photographed images ride the SAME upload
   route). Task block linked spec_ready; dispatch remains gated on the DOCINGEST-A merge.
3. ISEQ-2 gate NOT hand-dispatched (queue owns it); left running.

## Live at checkpoint (do NOT duplicate)

1. DOCINGEST-A coder pid 2407986 (~2h47m at 18:35, ~2x-3x of the 45-90 min expectation but
   commit cadence stayed real and file motion continued to ~17:59; §9 has ~5 commits left +
   the §7 gate block). If NEXT tick finds NO new commits AND no report AND no session-message
   motion: treat dead per ownership rules, adopt what exists, re-dispatch only the REMAINING
   §9 commits with a new unique report path. On exit: adversarial gate first (unique review
   path, spec §10 baits verbatim), then orch-verify (baselines: app tsc 23, server tsc 0,
   server sequences 72p/2s, app fail-files 61 — re-measure at tip), merge, RESTART stack
   (schema+config+UI touched), browser gate spec §12 on :5192.
2. ISEQ-2 tier-1 gate pid 2888288 (launched 18:33 by the queue; expected ~30-45 min): on exit
   read receipts/ISEQ-2/20261013T1540/report.md VERDICT -> accept closes ISEQ-2 +
   AS-ORCH-L1-087 half (b). 6c ladder applies if it stalls (tier-2 = same profile
   -m deepseek/deepseek-v4.1-flash openrouter; the ORCH-runner pattern is proven and fast).
3. Fleet coder lock: held by OUR launcher 2330563 for DOCINGEST-A. Lane 2's
   THREAD-ASK-1-fix1 flock (pid 2487462) is correctly QUEUED behind it.

## Next tick (ordered)

1. ISEQ-2 gate outcome (above). DOCINGEST-A reconcile (motion test above; on exit -> adv gate).
2. OLIGO t4 is TERMINATED — nothing to reconcile there.
3. OWN-13 md5 / OWN-14 decisions-dir silent checks; :3092/:5192 health.
4. If DOCINGEST-A merged + gated: claim DOCINGEST-B (§0 gate now satisfiable), dispatch coder +
   next composer per SOUL.

## Evidence-debt / carried (OPEN unless stated)

- OPEN: AS-ORCH-L1-042; AS-ORCH-L1-048/054 (close only at rule-9); AS-ORCH-L1-068 (OWN-14's
  gate); AS-ORCH-L1-082 (record-only); AS-ORCH-L1-086 (DOCINGEST-A fixture provenance —
  confirm from its report before merge); AS-ORCH-L1-087 PARTIAL (half (b) = ISEQ-2 gate accept
  pending, now RUNNING); AS-ORCH-L1-088 NEW (OLIGO orch-judge: screenshots un-eyeballed;
  full-save + offer-spent-after-save legs gated on the OQ3 data fix).
- CLOSED this tick: AS-ORCH-L1-070, AS-ORCH-L1-081, AS-ORCH-L1-084 (OLIGO retry-4 outcomes ->
  orch-judge accept on revision 0a4dc3f8).
- Candidate future-queue (record-only, unchanged unless noted): OQ3 dye-token modifications-
  table data fix (STRONGEST — now also the key that unlocks the last OLIGO-AI-3 evidence legs;
  propose to Brad at next interactive contact); NCBI keyless pacing in ncbiTools.ts;
  sequenceSources.ts:44 alphabet hardcode; cl-browser-reviewer harness hardening (headless
  default, blind-waitForTimeout anti-pattern seen in t4's last runner, RECIPT_DIR class);
  accession-searchability of Library labels; DOCINGEST-B page-image retention (OQ2 follow-up,
  NEW).
- Record-only carry-forward unchanged: OLIGO cycle-2 residuals; advreview3 provenance nit;
  candidate_refs reverse-index; bare-"Total <digits>"; OLIGO reviewer O1-O5; QMS-7 doc nits;
  grant authoring gate unwired; reviewer-harness traps; registry payload echo; CF-OWN1-A/B;
  AS-OWN5-002; AS-ORCH-L1-036; OWN-8 obs 2; OWN-13 DEV-2 erratum; app tsc baseline 23;
  OWN-10 reviewer O1; vitest --dir false-failure + cwd trap; OWN-11 mock-path erratum;
  POLICY_ROOT_KINDS = OWN-14 scope; browser/ package doubly-orphaned; ISEQ §15 no-bundle rule;
  AS-ORCH-L1-077 rc=137 mystery.

## assumptions
- AS-ORCH-L1-088 (NEW, above): orch-judge route accepted as the gate for OLIGO-AI-3;
  deterministic + data-grounded proofs; visual-eyeball and full-save legs explicitly owed.
- AS-ORCH-L1-086 stays OPEN (DOCINGEST-A live; fixture-provenance declaration due in its
  report before merge).
- Terminating stalled t4 assumed safe: its deliverable was superseded, no report.md existed,
  and its receipts writes were fenced to its own dir — verified before kill, recorded here.
- DOCINGEST-B OQ adjudications (values/routes) are reversible config/route choices inside
  approved Stage-B scope — recorded in the spec's PROMOTION NOTE.
- No credentials recorded anywhere in this handoff.
