# Handoff — lane 1 tick 20261013T0650 (OLIGO-AI-3 fix cycle 1 LIVE; ISEQ-2 composer LIVE; ISEQ-1 spec promoted)

Author: orchestrator cron tick — 2026-10-13 ~05:20–07:20 EDT — lane 1.
Overran the 45-min soft budget on productive gate work (coder finished mid-tick);
no new launches after this checkpoint. No kills. :3001/:5174 never touched.

## What happened this tick

1. RECONCILED both workers from the 0445 checkpoint first-hand:
   - OLIGO-AI-3 coder COMPLETED: pid gone, report
     oligo-ai-3-report-l1t0330.md ends "OLIGO-AI-3 CODER DONE
     5ea783fb79b9f2824bce0aa8d12834dc197f85d3"; 6->7 commits per spec §11; fleet
     lock verified FREE by the orchestrator. Coder prep incident (32 tracked files
     were stale symlinks into the main checkout; repaired by materializing
     dispatch-HEAD blobs) independently CONFIRMED fixed by the reviewer
     (`git diff HEAD` empty). PDF hygiene verified twice (coder + reviewer + orch):
     no .pdf in any commit; fixtures/ holds only the .txt.
   - ISEQ-1 composer DELIVERED: draft 35748 bytes + "COMPOSER DONE ISEQ-1" + EXIT
     rc=0 (long run ~2h40m but with continuous state.db motion; no rule-7b action).
2. ADVERSARIAL GATE ran (cl-adversarial-reviewer, OpenRouter deepseek-v4.1-flash,
   launcher proc_956435c6bb83 pid 1025495, EXIT rc=0 07:03). VERDICT: fix —
   exactly ONE major defect (full detail in
   /home/brad/.hermes/cl/lanes/1/reviews/oligo-ai-3-advreview-l1t0640.md):
   SequenceImport.tsx aiNotice/offer NOT scoped per-job — second upload in the
   SAME mount suppresses the new offer and misattributes the old AI notice; the
   app suite missed it because arm (b) remounts via cleanup(). All 13 §15 bait
   bullets CLEAN with reviewer-run evidence; 404-vs-422 deviation accepted;
   candidate_refs reverse-index note = record-only, spec-consistent.
3. ISEQ-1 SPEC PROMOTED (orch-promoted 20261013T0650) to
   .hermes/plans/2026-10-13_iseq-1-ncbi-sequences-tab-spec.md after first-hand
   re-verification of every load-bearing anchor at 406d4376 (SOURCE_MAP/
   SourceMapping ncbiTools bug :263 fetch-enum :291 tabs :26-32 alphabet trap
   sequenceSources.ts:44 pill CSS tokens.css:62/151 — all quoted values
   confirmed) AND an INDEPENDENT live eutils probe reproducing the acceptance:
   refseq-filtered typo-wildcard -> count 1 idlist [265678656] (NR_028961);
   unfiltered -> 822 without it in the top ids. OQ1/OQ2/OQ3 all ACCEPTED at
   composer defaults (drop taxonomy; two-pass RefSeq pin; local pill config).
   Task block updated under queue lock with the erratum
   (server/src/api/handlers/BiosourceHandlers.ts).
4. FIX RUN 1 (of max 2) DISPATCHED: launcher pid 1157030
   (queue-oligo-ai-3-fix1.sh, fd-flock on appliance2-coder.lock — pidfile now
   "OLIGO-AI-3-FIX1(l1t0710) dispatch-pid:1157030"), SAME worktree
   wt/OLIGO-AI-3-lane1-l1t0330 @ 5ea783fb, prompt
   prompts/coder-OLIGOAI3-fix1-l1t0710.txt (defect verbatim, RED = same-mount
   second-upload test, C8 RED + C9 GREEN, scope locked to the 2 app files), log
   logs/coder-OLIGOAI3-fix1-l1t0710.log, report
   oligo-ai-3-fix1-report-l1t0710.md, end-marker "OLIGO-AI-3 FIX1 DONE <sha>".
5. ISEQ-2 SPEC-COMPOSER DISPATCHED (background, thunderbeast): launcher pid
   1186491 (proc_77323a97aebd), prompt prompts/composer-ISEQ2-l1t0715.txt, log
   logs/composer-ISEQ2-l1t0715.log, unique draft
   .hermes/plans/drafts/2026-10-13_iseq-2-headline-e2e-spec.l1t0715.draft.md,
   end-marker "COMPOSER DONE ISEQ-2 <bytes>". Prompt instructs it to state
   explicitly whether ISEQ-1 is on disk at its HEAD and to mark not-yet-merged
   anchors "per ISEQ-1 spec §N".
6. Silent checks: OWN-13 DEV-1 — trunk CLAUDE.md md5 still
   cc43d17766d5606ee3d532c5356cbff4 (rule-9 absent, never re-asked). OWN-14 —
   decisions/ newest still L1-qms-field-defects-ruling-20261010 (no approval).
   Health: :3092 200, :5192 200.

## Live at checkpoint (do NOT duplicate)

1. OLIGO-AI-3 fix-1 coder via launcher 1157030 (HOLDS the fleet lock until its
   worker exits). Expected ~30-50 min (single-file RED/GREEN). On exit:
   ADVERSARIAL RE-REVIEW cycle 2 (unique path
   reviews/oligo-ai-3-advreview2-l1t<ts>.md; tell the reviewer the fix scope = the
   2 app files + the defect it found; a fix-cycle re-review is bounded, not the
   full §15 re-run). On ACCEPT: orch-verify first-hand (vitest app
   SequenceImport.test.tsx + server src/sequences/, tsc 0/23, diff scope
   9+2 files), merge --no-ff into cl/integration-1, RESTART lane stack (server.ts
   in the diff), then BROWSER GATE §10 on :5192 /ingestion/oligo-orders (receipts
   /home/brad/.hermes/cl/receipts/OLIGO-AI-3/<ts>/; confirm served checkout
   contains the merge sha first; tier ladder SOUL 6c if the gate dies).
   On a second FIX verdict: cycle 2 fix allowed; after that route to architect.
2. ISEQ-2 composer pid 1186491. On delivery: review, verify anchors, promote,
   update task block. ISEQ-2 dispatch_gate: fleet lock + ISEQ-1 merged + ISEQ-2
   spec — AND ISEQ-1 must code first (FIFO: OLIGO-AI-3 -> ISEQ-1 -> ISEQ-2;
   ISEQ-1 dispatch prep is the next coder slot after OLIGO-AI-3 merges).

## Next tick (ordered)

1. Reconcile fix-1 coder (pid from pidfile 1157030 + logs/coder-OLIGOAI3-fix1-l1t0710.log +
   report end-marker). Exited -> cycle-2 review -> verify -> merge -> restart ->
   browser gate (see above). Alive past ~2x -> rule-7b.
2. ISEQ-1 coder dispatch prep ready to go once OLIGO-AI-3 merges AND the lock is
   free: build wt/ISEQ-1-lane1-l1t<ts> off post-merge trunk via a
   queue-iseq-1.sh cloned from queue-oligo-ai-3.sh; prompt from the promoted spec
   (PROMOTION NOTE bindings: OQ1 no-taxonomy-call-is-a-defect, OQ2 two-pass,
   OQ3 BIO_SOURCES untouched; §9 C1-C5 commit sequence; §10 gates incl the
   59->60 e2e fail-file allowance; scratch-port e2e discipline; report
   iseq-1-report-l1t<ts>.md end-marker "ISEQ-1 CODER DONE <sha>").
3. ISEQ-2 composer delivery -> review/promote.
4. OWN-13 md5 / OWN-14 approvals silent checks; :3092/:5192 health check.

## Evidence-debt / carried (OPEN unless stated)

- OPEN: AS-ORCH-L1-042; AS-ORCH-L1-048/054 (close only when rule-9 applied);
  AS-ORCH-L1-068 (closes only at OWN-14's gate).
- OPEN: OWN-13 DEV-1 rule-9 append (Brad/interactive-owned; text in
  own13-report-l1t1900resume.md DEV-1).
- NEW carried finding (filed, NOT fixed, per ISEQ-1 §15): sequenceSources.ts:44
  ncbi-arm alphabet hardcode 'iupac_dna' breaks rRNA imports via GET
  /sequences/source — real separate defect; SequenceSearch derives alphabet from
  residues to dodge it.
- NEW record-only note from adversarial review: OLIGO AI-read candidates are not
  appended to the job bundle's candidate_refs reverse index (spec-consistent;
  avoids a guaranteed 409; candidates reachable via GET job_ref filter).
- CARRIED: bare-"Total <digits>" class acceptable-as-shipped; OLIGO-AI-3 OQ3
  dye-leak config fix = future queue proposal, NOT auto-enqueued; OLIGO reviewer
  O1-O5, QMS-7 doc nits, grant authoring gate unwired (OPS-1 b), reviewer-harness
  cwd trap, registry pre-transition payload echo, CF-OWN1-A/B, AS-OWN5-002,
  AS-ORCH-L1-036, OWN-8 reviewer obs 2, OWN-13 DEV-2 erratum, app tsc baseline
  23, OWN-10 reviewer O1, vitest --dir false-failure + server-suite cwd trap,
  OWN-11 mock-path erratum, POLICY_ROOT_KINDS = OWN-14 scope, browser/ package
  doubly-orphaned, ISEQ-1 path erratum (now in the promoted spec).

## assumptions
- Fix-cycle scope assumption (recorded for the reviewer): scoping the fix to
  per-job notice/offer state in the 2 app files fully satisfies spec §6 + OQ1
  "spent after one click" — per the reviewer's own fix direction. Evidence-debt:
  none new; cycle-2 review will confirm first-hand.
- ISEQ-1 promotion facts are this tick's own sed/grep/curl outputs at 406d4376,
  not scout or composer word. The 59->60 app fail-file allowance for the new
  e2e spec is the composer's measured baseline, restated in the promoted spec;
  coder must re-measure. No credentials recorded.
