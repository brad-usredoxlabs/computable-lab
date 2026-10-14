# Handoff — lane 1 tick 20261013T0940 (OLIGO-AI-3 MERGED + browser gate live; ISEQ-1 coder live; ISEQ-2 spec promoted)

Author: orchestrator cron tick — 2026-10-13 ~09:40–11:15 EDT — lane 1.
Overran the 45-min soft budget on productive gate work (adversarial re-review, orch
verification, merge, restart, two dispatches); no new launches after this checkpoint.
No kills. :3001/:5174 never touched.

## What happened this tick

1. RECONCILED both 0720-checkpoint workers first-hand:
   - OLIGO-AI-3 fix-1 coder COMPLETED: launcher 1157030 gone, log "CODER FIX1 EXIT
     rc=0 08:07", report ends "OLIGO-AI-3 FIX1 DONE
     ba7002e52cf432c3feafd64bdbf9a8e41ef9a90b" (7c6ee9f7 RED + ba7002e5 GREEN, noticeJobId
     gating, scope = 2 app files +31/-5 verified by orch diff --stat). Fleet lock
     verified FREE by the orchestrator.
   - ISEQ-2 composer COMPLETED 10:44 (EXIT rc=0, "COMPOSER DONE ISEQ-2 24903").
2. ADVERSARIAL CYCLE-2 RE-REVIEW (cl-adversarial-reviewer OpenRouter, prompt
   prompts/advreview-oligoai3-fix1-l1t0945.txt, bounded to the fix + defect 1):
   VERDICT: accept, 0 defects (reviews/oligo-ai-3-advreview2-l1t0945.md). Reviewer
   verified defect-1 fixed for upload+reopen, RED non-vacuity (C8 mock amendment is
   consumed only after the failing assertions), scope discipline, cycle-1 accepted
   behaviors preserved (offer spent per-job, notice on failed read retained). Residual
   notes record-only: C8 finalized with fix in view (static trace, read-only constraint);
   pre-existing manual-reopen-input shared-state quirk (cycle-1 fallback, not introduced).
3. ORCH-VERIFIED first-hand (own runs in the worktree): SequenceImport.test.tsx 7/7;
   server src/sequences 10 files 72p/2s; server tsc 0 error TS; app tsc 23 = baseline,
   zero in SequenceImport files.
4. MERGED: git -c core.fileMode=false merge --no-ff wt/OLIGO-AI-3-lane1-l1t0330 ->
   trunk 95d340a8 (clean ort, 9 files +636/-5 vs prior trunk 406d4376). Lane stack
   RESTARTED (server.ts + app in the diff): :3092/:5192 200, served checkout confirmed
   at 95d340a8, noticeJobId present in the served trunk file.
5. OLIGO-AI-3 BROWSER GATE §10 DISPATCHED (tier-1 cl-browser-reviewer, SOUL-6c ladder):
   launcher 1559310, prompt prompts/browergate-oligoai3-l1t1110.txt (S1-S6 verbatim,
   fixture copy staged, negative-claim re-verification rule embedded), log
   logs/browergate-oligoai3-l1t1110.log, receipts
   /home/brad/.hermes/cl/receipts/OLIGO-AI-3/20261013T1110/ (fixture.pdf + trail.json
   already landing at checkpoint — live, forward motion confirmed).
6. ISEQ-1 CODER DISPATCHED (fleet lock free): queue launcher 1552953 acquired the lock
   11:02 (pidfile "ISEQ-1(l1t1020) dispatch-pid:1552953"); wt/ISEQ-1-lane1-l1t1020 built
   off trunk 95d340a8 (contains OLIGO-AI-3 — the spec §12 base gate holds); prompt
   prompts/coder-ISEQ1-l1t1020.txt (OQ1/OQ2/OQ3 binding adjudications, §9 C1-C5 sequence,
   §10 gates, live :3092 probes reserved to the orch post-merge gate, cwd trap,
   lane-exclude stale-symlink repair instruction from the AI-3 prep incident), log
   logs/coder-ISEQ1-l1t1020.log, report iseq-1-report-l1t1020.md, end-marker
   "ISEQ-1 CODER DONE <sha>". Expected ~60-90 min (5 commits, 2 workspaces + 1 e2e).
7. ISEQ-2 SPEC PROMOTED (orch-promoted 11:20) to
   .hermes/plans/2026-10-13_iseq-2-headline-e2e-spec.md after first-hand anchor
   verification at 95d340a8: SequencesPage.tsx:16 reads only ?source; /lab/sequences
   route App.tsx:210; playwright.config baseURL default :5174 + retries 0; no
   ingestion-sequences.spec.ts in app/e2e; sequence-chat-scroll.spec.ts:3-6 pattern.
   OQ1/OQ2/OQ3 ACCEPTED at composer defaults (deep-link ?record= effect ships with the
   mandatory once-only deepLinkRef guard; hard-fail on 429 with ONE re-run >=10 s;
   local-admin fallback, 401 -> addInitScript real seeded user named in report).
   Task block updated under queue lock.
8. Silent checks: OWN-13 DEV-1 — trunk CLAUDE.md md5 still
   cc43d17766d5606ee3d532c5356cbff4 (rule-9 absent, never re-asked). OWN-14 — decisions/
   newest still L1-qms-field-defects-ruling-20261010 (no approval; blocker stands,
   silent). Health: :3092 200, :5192 200, isolation env check inconclusive by pgrep
   (lane restart script printed backend pid 1548407; data-dir line not re-grepped —
   cheap next-tick check).

## Live at checkpoint (do NOT duplicate)

1. OLIGO-AI-3 BROWSER GATE tier-1 via launcher 1559310 (hermes -p cl-browser-reviewer).
   Expected ~30-45 min (S1-S6 incl. one real model call). On VERDICT: accept -> mark
   OLIGO-AI-3 done + handoff. On VERDICT: fix -> defect list (absolute screenshot paths)
   back to a new coder run on a FIX worktree off the merged trunk (the OLIGO-AI-3 branch
   is merged; a fix run branches fresh off trunk). On death/hang/no-trail past ~75 min:
   SOUL-6c tier ladder (tier-2 = same profile -m deepseek/deepseek-v4.1-flash
   --provider openrouter; falsify blank-page claims with a deterministic probe first).
2. ISEQ-1 coder via queue launcher 1552953 (HOLDS the fleet lock until its worker
   exits). On exit: ADVERSARIAL GATE (spec §11 12-bait list into the prompt, unique
   path reviews/iseq-1-advreview-l1t<ts>.md); on FIX: fix run same worktree (max 2
   cycles); on ACCEPT: orch-verify (server NcbiNucleotideTools+BiosourceHandlers tests,
   ExaTools 3, sequences byte-arms, app IngestionPage+SequenceSearch, tsc 0/23,
   fail-file 59->60 only, ZERO server-diff-forbidden check is inverted here: server
   tools/ncbiTools ARE in scope, app/e2e new spec expected), merge --no-ff, RESTART
   lane stack (SOURCE_MAP server change), LIVE PROBES §10 curls on :3092 (the
   orchestrator's own gate), then BROWSER GATE §13 on :5192 (receipts
   /home/brad/.hermes/cl/receipts/ISEQ-1/<ts>/; pill contrast before/after; confirm
   served checkout contains the merge sha first).

## Next tick (ordered)

1. Reconcile the browser gate (launcher 1559310 + receipts dir trail/screenshots +
   report verdict). Accept -> OLIGO-AI-3 done + assumptions carried. Fix -> new coder
   fix run (FIFO: ISEQ-1 holds the lock; a small fix run queues behind it only if ISEQ-1
   is still live — else dispatch immediately). Dead -> tier ladder.
2. Reconcile ISEQ-1 coder (pidfile + log + report end-marker). Exited -> §11-bait
   adversarial gate. Alive past ~2x (~3h) -> rule-7b.
3. On ISEQ-1 merge + browser accept: dispatch ISEQ-2 (spec now promoted; dispatch prep
   = clone queue-iseq-1.sh; its first coder action is the on-disk ISEQ-1 confirmation;
   app fail-file baseline is 60 post-ISEQ-1, honest terminal 61).
4. OWN-13 md5 / OWN-14 approvals silent checks; :3092/:5192 health + data-dir log line.

## Evidence-debt / carried (OPEN unless stated)

- OPEN: AS-ORCH-L1-042; AS-ORCH-L1-048/054 (close only when rule-9 applied);
  AS-ORCH-L1-068 (closes only at OWN-14's gate).
- OPEN: OWN-13 DEV-1 rule-9 append (Brad/interactive-owned; text in
  own13-report-l1t1900resume.md DEV-1).
- NEW record-only (cycle-2 review residual notes, OLIGO-AI-3): (a) C8 RED test finalized
  with the fix in view (mock amended in pre-GREEN; non-vacuity verified by static trace;
  live revert re-proof not run — read-only constraint); (b) pre-existing quirk: typing a
  previously-AI-read job id into the Reopen field WITHOUT clicking reopen can surface that
  job's notice against other rows (cycle-1 fallback shared state; not introduced by the
  fix; file for a future polish pass, do not bundle).
- Carried from cycle-1 (unchanged): OLIGO candidate_refs reverse-index note;
  bare-"Total <digits>" class acceptable-as-shipped; OLIGO-AI-3 OQ3 dye-leak config fix
  = future queue proposal, NOT auto-enqueued; sequenceSources.ts:44 ncbi-arm alphabet
  hardcode (filed, ISEQ-1 §15 forbids bundling); OLIGO reviewer O1-O5, QMS-7 doc nits,
  grant authoring gate unwired (OPS-1 b), reviewer-harness cwd trap, registry
  pre-transition payload echo, CF-OWN1-A/B, AS-OWN5-002, AS-ORCH-L1-036, OWN-8 reviewer
  obs 2, OWN-13 DEV-2 erratum, app tsc baseline 23, OWN-10 reviewer O1, vitest --dir
  false-failure + server-suite cwd trap, OWN-11 mock-path erratum, POLICY_ROOT_KINDS =
  OWN-14 scope, browser/ package doubly-orphaned.

## assumptions
- Merge-commit message itself states "BROWSER GATE owed" — the merge of OLIGO-AI-3 to
  trunk before browser acceptance is the SOUL-6b two-track rule (code track merged,
  browser track pending evidence); recorded as an open obligation here and in the
  task-list delta, pinned at revision 95d340a8. NOT softened.
- Cycle-2 fix-scope assumption carried forward from the 0720 handoff: scoping the fix to
  per-job notice/offer state in the 2 app files fully satisfies spec §6 + OQ1 — now
  CONFIRMED by the cycle-2 reviewer first-hand (debt closed).
- ISEQ-1 dispatch base assumption: launcher built wt/ISEQ-1-lane1-l1t1020 off trunk
  95d340a8 AFTER the merge commit landed (git worktree add ran at 11:02, merge landed
  ~10:5x) — the prompt re-states the on-disk base gate for the coder as belt-and-braces.
- ISEQ-2 promotion facts are this tick's own sed/grep outputs at 95d340a8, not scout or
  composer word. No credentials recorded.
