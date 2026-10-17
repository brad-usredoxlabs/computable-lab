# Handoff — lane 1 tick 20261013T1540–1600 (ISEQ-2 :5192 e2e PASSED first-hand; DOCINGEST-A coder LIVE; OLIGO t4 at 3x — tier decision due next tick)

Author: orchestrator cron tick — 2026-10-13 ~15:40–16:00 EDT — lane 1. :3001/:5174 never
touched. :3092/:5192 200 throughout. Read handoff 20261013T1500 too — carried items live there.

## What happened since handoff 20261013T1500

1. ISEQ-2 §6 MERGED-STATE E2E RUN FIRST-HAND — half (a) of AS-ORCH-L1-087 CLOSED.
   From trunk app/ (cl/integration-1 @ 0a4dc3f8):
   PLAYWRIGHT_BASE_URL=http://localhost:5192 npx playwright test ingestion-sequences
   --project=chromium -> 1 passed (12.4s). Live NCBI search 871 ms, import 4883 ms,
   captured recordId SEQ-a2bb2b06b34066813f8d934e; verified via GET
   :3092/api/records/SEQ-a2bb2b06b34066813f8d934e (F. prausnitzii 16S payload). One more
   real lane record written = expected (all lane records are test data).
   ISEQ-2 remains in-progress ONLY pending the queued browser gate (half (b)).
2. DOCINGEST-A CODER IS LIVE (fleet single-coder rule held with zero violation):
   - Lane 2's THREAD-ASK-1 coder exited rc=0 at 15:43:05 (DONE d5e388a0, QUEUE-RELEASED);
     the fleet flock passed to our launcher queue-docingest-a.sh pid 2330563, whose guard
     had already cleared (ISEQ-2 present in trunk 15:29).
   - Worktree /mnt/vast/home/brad/git/wt/DOCINGEST-A-lane1-l1t1520 built off trunk HEAD
     (post-merge, base 0a4dc3f8; verified app/e2e/ingestion-sequences.spec.ts present).
     lane-exclude/materialization + node_modules symlinks applied by the launcher.
   - DISPATCHED 15:48:43 (log logs/coder-DOCINGESTA-l1t1520.log; hermes -p cl-coder pid
     2407986 = child of launcher 2330563). Coder pid file
     /home/brad/.hermes/cl/appliance2-coder.pid = DOCINGEST-A(l1t1520) dispatch-pid:2330563.
     Expected duration 45-90 min. On exit: adversarial gate (spec §10 baits verbatim),
     orch-verify with post-ISEQ-2 baselines (server sequences 10 files 72p/2s, app fail-files
     61, app tsc 23, server tsc 0), merge, stack restart (touches schema/handlers/UI),
     browser gate spec §12 S1-S5.
3. OLIGO-AI-3 GATE RETRY 4 — REAL MOTION, but at 3x boundary: pid 2213141 alive, started
   ~14:37, ~78 min at 16:00. The receipts dir shows an ACTIVE harness: plan.json 15:08,
   runner.spec.ts rewritten 15:27, test-results/runner-OLIGO-AI-3-browser-gate---Retry-4
   error-context.md at 15:48 — its Playwright runner hit a harness bug (ReferenceError:
   RECIPT_DIR is not defined — reviewer's own typo in runner.spec.ts), page snapshot proves
   the app itself rendered fine (full navbar). The reviewer is iterating on its own runner,
   NOT hung. DOCTRINE NOTE: two attempts on this revision have now failed in the HARNESS,
   not the UI — per SOUL 6c the next failure is a HARNESS defect, not another blind UI retry.
   If t4 exits with no report.md VERDICT at next tick: do NOT tier-2 blind-shot; use the
   orch-authored route (I write the Playwright runner against spec §10 states S1-S6, run it
   against :5192, judge artifacts, record ORCH-as-judge in the task block) or fix-forward
   the reviewer's own runner via a bounded re-shot with the typo pre-fixed.
4. OWN-13 rule-9: trunk CLAUDE.md md5 cc43d17766d5606ee3d532c5356cbff4 UNCHANGED -> silent.
   OWN-14: no new approval file under decisions/ (only old QMS ruling) -> silent. OWN-12
   unchanged. 0 due/changed blockers (gate confirmed).
5. ISEQ-2 gate queue launcher ALIVE (script pid 2364496; loops on t4 pid): VISION-BUSY
   lines current through 15:53. When t4 exits it dispatches tier-1 itself with prompt
   prompts/browergate-iseq2-l1t1540.txt -> receipts/ISEQ-2/20261013T1540/. Do NOT
   hand-dispatch a second ISEQ-2 gate.

## Live at checkpoint (do NOT duplicate)

1. DOCINGEST-A coder pid 2407986 (launcher 2330563, holds fleet flock via fd 9). Report
   path (unique): /home/brad/.hermes/cl/lanes/1/docingest-a-report-l1t1520.md. Motion
   signal: worktree commits on branch wt/DOCINGEST-A-lane1-l1t1520.
2. OLIGO-AI-3 gate t4 pid 2213141 — see doctrine note above.
3. ISEQ-2 gate queue (script pid 2364496) queued behind t4.
4. Lane 2's coder slot is FREE (their THREAD-ASK-1 exited; their queue owns its own
   reacquisition — not my lane, record only).

## Next tick (ordered)

1. OLIGO t4 outcome: report.md exists -> read VERDICT (accept -> mark OLIGO-AI-3 done,
   close AS-ORCH-L1-070/081/084; fix -> per 1410 handoff routing, no third blind fix).
   No verdict + harness-typo class -> ORCH-authored runner route (SOUL 6c).
2. ISEQ-2 gate: on dispatch, read receipts/ISEQ-2/20261013T1540/ on exit; accept -> mark
   ISEQ-2 done + close AS-ORCH-L1-087 fully (half (a) already closed this tick).
3. DOCINGEST-A reconcile at 2x (~16:35+): worktree commit motion + log; do NOT re-dispatch.
4. OWN-13 md5 / OWN-14 approvals silent checks; :3092/:5192 health.

## Evidence-debt / carried (OPEN unless stated)

- OPEN: AS-ORCH-L1-042; AS-ORCH-L1-048/054 (close only at rule-9); AS-ORCH-L1-068 (OWN-14's
  gate); AS-ORCH-L1-070 (OLIGO-AI-3 browser obligation — t4 live, closes only at VERDICT:
  accept or ORCH-judged artifacts); AS-ORCH-L1-077 (ISEQ-1 rc=137 mystery, record-only);
  AS-ORCH-L1-081 (fix-2 relaxation boundary — closes with retry-4 outcome); AS-ORCH-L1-082
  (ISEQ-1 gate closed with ORCH as artifact judge); AS-ORCH-L1-084 (closes with retry-4
  accept); AS-ORCH-L1-086 (DOCINGEST-A DEMO-fixture provenance — coder now live);
  AS-ORCH-L1-087 PARTIAL (half (a) closed 1552 first-hand; half (b) gate accept pending).
- Candidate future-queue (record-only): NCBI keyless pacing server-side backoff in
  ncbiTools.ts; OQ3 dye-token modifications-table data fix (STRONGEST candidate — propose
  to Brad at next interactive contact); sequenceSources.ts:44 alphabet hardcode;
  cl-browser-reviewer harness default headless on this host + NEW: reviewer runner
  self-typo class (RECIPT_DIR) — harness hardening candidate; accession-searchability of
  Library labels = architect decision if ever wanted.
- Record-only carry-forward unchanged: OLIGO cycle-2 residuals; advreview3 provenance nit;
  candidate_refs reverse-index; bare-"Total <digits>"; OLIGO reviewer O1-O5; QMS-7 doc nits;
  grant authoring gate unwired; reviewer-harness traps; registry payload echo; CF-OWN1-A/B;
  AS-OWN5-002; AS-ORCH-L1-036; OWN-8 obs 2; OWN-13 DEV-2 erratum; app tsc baseline 23;
  OWN-10 reviewer O1; vitest --dir false-failure + cwd trap; OWN-11 mock-path erratum;
  POLICY_ROOT_KINDS = OWN-14 scope; browser/ package doubly-orphaned; ISEQ §15 no-bundle rule.

## assumptions
- AS-ORCH-L1-087 PARTIAL CLOSE recorded in ledger: half (a) closed first-hand (:5192 run
  1 passed + API record readback); half (b) open until gate receipts render accept.
- No NEW assumptions this tick. AS-ORCH-L1-086 stays open (DOCINGEST-A running).
- No credentials recorded anywhere in this handoff.
