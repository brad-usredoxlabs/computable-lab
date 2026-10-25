# Handoff — lane 1 tick 2026-10-17 01:40 → 01:5x EDT (re-gate attempt-1 BLOCKED on stale lane index.lock → orch cleared + proved writes → attempt-2 LIVE same pinned sha)

Author: orchestrator cron tick — lane 1. :3001/:5174 never touched.

## What happened (first-hand)

1. RECONCILED: attempt-1 combined re-gate (tier-2 deepseek-v4.1-flash, wrapper log
   logs/browergate-QMS77reg-l1t0130.log) EXITED code=0 at 01:29:04 with real full receipts
   QMS7-7-REGATED/20261017T0121/gate/ (trail.json, report.md, g1/g2/g3 shots, g4-response.txt).
   VERDICT: blocked — the reviewer proved the cause is INFRASTRUCTURE, not product code:
   a stale 0-byte git index.lock at
   /home/brad/.computable-lab-lane1/worktrees/main/.git/index.lock (mtime 01:20:13, written at
   the ~01:19 stack restart; lsof empty; no git process) → AuthorizationService.ensureOwnerPolicy
   returned null → FormDraftService.ts:51 DraftError 503 → POST /api/drafts/compile 503 → the
   G1 proposal card mounted in the blocked phase (Reject-only, no Accept). G2 untestable (no
   Accept control), G3 rendered the same blocked card (reject persisted nothing, fresh GET
   total=1), G4 PASS (422 DRAFT_FAILED, raw body captured). Reviewer explicitly: do NOT route to
   a coder — the failure is below the compiler/policy logic.
2. ORCH RECOVERY (my own inspection): the lock was verifiably stale (0 bytes, mtime 01:20:13,
   lsof no holder, no git process) → removed it. PROVED writes work again, first-hand: git
   status/rev-parse clean on the lane data repo (HEAD 8778e98c, normal API churn present), POST
   /api/drafts/accept {"draftId":"DRAFT-NOPE"} as USR-QMS-ADMIN → 422 DRAFT_FAILED integrity
   shape (never a 503 again), :3092/api/health 200.
3. PIN STILL VALID: trunk tip cb73c784 (docs above fix-2 merge d9420fd7 — merge-base verified
   ancestor), config/drafting/adapters.yaml:62 `humanReviewedCreate: true` present in the served
   checkout, code repo porcelain clean (-uno), POL-REGULATED + aiStatus.available=true re-curls
   saved raw in the attempt-2 preflight dir, TM baseline total=1.
4. ATTEMPT 2 DISPATCHED 01:46 EDT (this is the runbook's own recommended resolution: clear the
   lock, re-run the gate UNCHANGED). Same TIER-2 (attempt 1 proved the tier renders a full valid
   trail — its blocked verdict was fully evidenced; SOUL 6c forbids a BLIND repeat, this is a
   diagnose-then-retry, not a blind re-shot), same runbook, SAME pinned sha, NEW unique paths:
   receipts QMS7-7-REGATED/20261017T0544/gate/, wrapper pid 1937255 (hermes child 1937316), log
   logs/browergate-QMS77reg2-l1t0145.log, end-line 'BGATE-QMS77REG2 EXITED code='. Harness
   correction from attempt 1 baked into the prompt (pw.config.ts is stale; drive via
   pw-cfg-ext.ts). TRUNK FROZEN for gate duration (ruling D4).
5. OWN-14: decisions/ newest L1-qms-field-defects-ruling-20261010.md md5
   1f41d8818f8864410281a79f5a40fb75 UNCHANGED — silence is not approval; NOT re-asked
   (on-change watch; stamped the check in the task block).
6. No coder dispatched: nothing ready behind the gate (wave 3 in campaign-close; OWN-14 is the
   only todo and it is Brad-blocked; fleet lock free and stayed free).

## Queue state

- QMS7-7: in-progress — fix-2 MERGED (d9420fd7), closes ONLY on attempt-2 accept receipts.
- QMS7-8: in-progress — laps 1-5/8 + N1-N6 receipts stand; laps 6-7 closure = attempt 2.
- OWN-14: blocked (Brad, on-change).

## Resume condition (next tick, in order)

1. Poll attempt 2: log end-line 'BGATE-QMS77REG2 EXITED code='. Expected duration 30-50 min
   (dispatched 01:46 → due-check ~02:36; 2x ~03:16; at 3x escalate per SOUL 6b/6c — the
   orch-authored Playwright + artifacts route is the fastest correct answer after another loss).
2. If attempt 2 ALSO dies/blocks on the same index.lock witness: that is two infrastructure
   failures around lane restarts — escalate as a harness/environment defect: investigate WHY the
   ~restart writes an index.lock that survives (backend startup git-commit race vs shutdown
   kill), fix at that root (lane environment repair, orchestrator authority), not a coder run.
3. On VERDICT accept: close QMS7-7, close QMS7-8, close AS-ORCH-L1-147 as superseded-by-ruling,
   UNFREEZE trunk, wave-3 close-out handoff, surface AS-ORCH-L1-145 to Brad as the queue
   proposal. Follow runbook §On VERDICT accept order.
4. On VERDICT fix: defect list (absolute screenshot paths) → coder fix run on
   wt/QMS7-7-lane1-l1t1500 via the fleet lock, max 2 cycles, re-gate each cycle with NEW receipts
   dir + NEW pinned sha. Do NOT re-run laps 1-5/8 (ruling forbids full campaign re-gate).
5. OWN-14: keep on-change watch; handle per Brad's ruling text only if the file changes.

## assumptions

- AS-ORCH-L1-153 (NEW, evidence-debt FALSE): the 0-byte index.lock removed at 01:45 was STALE —
  evidence: zero size, mtime 01:20:13 ≈ the restart window, lsof empty, no git process, and
  first-hand post-removal proof that git writes work (data repo status/rev-parse clean, accept
  probe 422 not 503). Nothing was running that needed it. Owner: orchestrator. Reversible: n/a
  (removal of a stale lock is not a value substitution; recorded for auditability).
- AS-ORCH-L1-152 carried (ai.available resolves as aiStatus.available; verified in preflight
  again at attempt-2 dispatch).
- AS-ORCH-L1-151 carried unchanged (combined one-packet gate).
- AS-ORCH-L1-150 DISCHARGED (merge landed clean at d9420fd7).
- Carry-forward: AS-ORCH-L1-102 baselines (23-error app tsc / 61|65 app vitest); AS-ORCH-L1-145
  (D2, awaiting Brad-queue decision); AS-ORCH-L1-147 (open until accept receipts); AS-ORCH-L1-149.

## evidence-debt / carried

OPEN: AS-ORCH-L1-042; 068 (OWN-14's gate); 082; 087 PARTIAL; 088; 089; 096; 097; 099;
101; 119 (+post-QMS76 ext); 137 residual; 145; 147; 149; 151; 152.
CARRIED: AS-ORCH-L1-102 baselines. RUN-3 observation for a future wave (not scope):
empty "Review changes" panel with enabled Apply after stray workspace_action.
NEW ENV NOTE for a future wave (not scope): a lane-stack restart can leave a stale
index.lock in the lane DATA repo's embedded git, which turns every record write into a
503 with a confusing DRAFT_FAILED surface — next restart should verify no lock survives.
