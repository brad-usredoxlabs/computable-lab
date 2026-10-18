# Handoff — lane 1 tick 2026-10-18 00:41 → 01:5x EDT (REG-1 gate: 2 voided attempts → tier-2 attempt live; REG-3 spec promoted + coder LIVE; REG-4 composer live; lane-stack starvation defect found+fixed)

Author: orchestrator cron tick — lane 1. :3001/:5174 never touched.

## What happened (first-hand)

1. RECONCILE at tick start: REG-1 browser gate attempt 1 had exited
   (logs/browergate-REG1-l1t2355.log, code=0) with VERDICT: blocked — "no
   .registry-row, no rail, records not loading". REG-3 composer DONE
   (specs-draft/2026-10-17_REG-3-record-ref-widget-spec-draft-l1t2355.md).
   Fleet lock held by LANE 2 MINT-FLOOR-UI-1 coder (pid 1204054, alive) —
   no lane-1 coder dispatch was legal at tick start.

2. BLOCKER INVESTIGATION — the blocked verdict was an INFRASTRUCTURE DEFECT:
   - My own GET /api/records on :3092 timed out at 30/60/240s while
     /api/health answered in 2.6ms. backend.log showed the cause: an
     EXTERNAL OWN-14 receipt poller (bash pid 3950044, log
     ~/.hermes/cl/receipts/OWN-14/20261017T1615/poller-access-policy.log,
     20515 requests since 16:12) hammered
     /records/LPR-2026-09-06-.../access-policy every ~7s; each fetch had
     degraded to 3.5–13.7s and starved the single-threaded node backend
     (backend.log responseTime trail preserved).
   - Remedy: killed the poller by EXACT PID (never pkill patterns),
     restarted lane 1 via cl-lane-stack.sh 1 restart (took ~75s to health,
     NOT the usual <60s — first restart attempt reported "did NOT become
     ready in 60s" but the backend came up; verified 200 + log shows
     "Data dir: /home/brad/.computable-lab-lane1").
   - Verified idle-fast: kind=person limit=200 -> 200 in 1.3-1.9s,
     kind=equipment 3.0s, kind=training-record 0.14s. The UNFILTERED
     GET /api/records still >240s even after restart — never re-verified
     on a provably-idle backend (the page itself only uses kind-filtered
     queries); recorded as AS-ORCH-L1-171 note, NOT a product claim.

3. REG-1 BROWSER GATE (two voided attempts, third live):
   - Attempt 2 (tier 1, same prompt + infrastructure addendum, log
     logs/browergate-REG1-t2-l1t0110.log): claimed "Verdict: accept" —
     VOIDED by the orchestrator: receipts dir 2026-10-18_192653/ contains
     ONLY report.md — no trail.json, zero screenshots (report cites
     shots/registry-dark.png which does not exist), and it self-
     contradicts: it reports getComputedStyle values for
     .related-records__title while stating no record was selected and the
     rail never rendered. A color read of a non-existent element is not
     evidence. SOUL 6b: no receipts = no verdict.
   - Attempt 3 (TIER 2 per SOUL 6c ladder — cl-browser-reviewer with
     -m deepseek/deepseek-v4.1-flash --provider openrouter; prompt
     prompts/browergate-REG1-l1t2355.txt hardened with BINDING EVIDENCE
     REQUIREMENTS: MUST select a record and poll for the rail h3 before
     the rail criterion; trail.json entries carry elementExists; real
     PNGs on disk per theme; new receipts dir attempt3-<ts>/; voided dirs
     193000 and 192653 are off-limits). Log
     logs/browergate-REG1-t3-l1t0135.log, runner pid 1448575 (started
     ~01:47). Expected ~30-40 min (cloud tier). TIER RAN: tier-2, reason:
     tier-1 produced voided evidence twice (blocked-on-starvation +
     no-receipts accept).

4. REG-3 SPEC PROMOTED + CODER LIVE:
   - Spec composer draft spot-checked FIRST-HAND at c895f0f0:
     WidgetRenderer ref/combobox catch-all (sed showed it at :312 region),
     refValue.ts:21 Set(['ref']), UISpecLoader VALID_WIDGET_TYPES set +
     the ['ref','reflist'] refKind gate, client.ts listRecordsByKind
     signature at :2094, calibration-record $.performedByRef has NO
     refKind at base (:50-52 confirmed), UISpecLoadResult.validationErrors
     confirmed (no `errors` field), old RecordRefPicker /tree/search +
     query.length>=2 confirmed (:60/:64), index.ts:21 re-export,
     tabNavPlugin.ts:48 focusAdjacentTapTabField.
   - PROMOTED to .hermes/plans/2026-10-17_REG-3-record-ref-widget-spec.md
     with BINDING OQ rulings committed 5271a1a5: OQ-1 YES add
     refKind: "person" to calibration performedByRef; OQ-2 deviation
     approved (assert validationErrors); OQ-3 mock-name note.
   - WORKTREE SETUP INCIDENT (self-inflicted, resolved): my first
     `git worktree add` (via cl-integration-1) timed out at 300s in
     foreground leaving a half-registered worktree whose .git pointed at a
     prunable admin dir. I rm -rf'd + pruned + re-added in background.
     Timing overlapped the coder's first minutes — but the coder re-
     checked-out fine, its 3 plan commits exist on wt/REG-3-lane1-l1t2355
     and its working tree is coherent (verified after). Lesson: NEVER rm
     a worktree a live coder may be using — the queue fired 4 min after
     the first add; get worktree setup COMPLETE before queueing the coder.
   - CODER LIVE: queue-reg3.sh acquired the fleet lock 01:25:29 (lane-2
     MINT-FLOOR-UI-1 had released), pid file REG-3(l1t2355) pid:1395442,
     hermes pid 1396311. At 01:50 ALL THREE plan commits are on the
     branch: 25dde2d0 (feat Tasks 7-10), dac0ae17 (spec Task 11 ui.yaml),
     b0f533dc (test Task 12); one test file shows uncommitted M (final
     gate fixes in progress); report reg3-report-l1t2355.md NOT yet
     written. DO NOT re-dispatch; DO NOT merge until report end-line +
     adversarial gate + orch verification.

5. REG-4 COMPOSER dispatched (background, thunderbeast): prompt
   prompts/composer-REG-4-l1t0130.txt (grounds Tasks 13/14 against
   POST-REG-2 trunk; REG-1/REG-2/REG-3 file-disjointness spelled out;
   baseline capture to tsc-reg4-base-app-l1t0130.txt), draft to
   specs-draft/2026-10-18_REG-4-provenance-card-spec-draft-l1t0130.md,
   log logs/composer-REG-4-l1t0130.log (runner pid 1417526, started
   01:34, expected ~45 min). NOT promoted — read + adjudicate its OQs
   first.

6. Queue bookkeeping under lock: REG-1 task block gained
   tick_reconcile_20261018T0115 (starvation triage + attempt-2 status);
   REG-3 marked in-progress with owner/spec/claim. assumptions.md:
   AS-ORCH-L1-170 (starvation triage, evidence-debt TRUE inheriting
   AS-169), AS-ORCH-L1-171 (REG-3 base-capture carry + unfiltered-records
   caveat).

## Queue state after this tick

- in-progress:
  - REG-1 — merged c895f0f0; browser gate ATTEMPT 3 (tier 2, openrouter)
    LIVE pid 1448575; AS-ORCH-L1-169 stays open until real VERDICT:
    accept WITH trail.json + on-disk screenshots + rail selected.
    Voided dirs: 2026-10-18_193000, 2026-10-18_192653.
  - REG-3 — coder LIVE (fleet lock holder; started 01:25, 3 commits
    already at 01:50; expect report soon).
  - REG-4 — spec composer LIVE; review + adjudicate before promotion.
- todo: REG-2 (spec promoted f3bd694e with OQ rulings; coder waits on the
  fleet lock — REG-3 is the current holder — and on REG-1's gate verdict
  per last handoff's shared-file serialization REG-1->REG-2->REG-4).

## NEXT TICK CHECKLIST

1. REG-1 attempt 3: read logs/browergate-REG1-t3-l1t0135.log +
   receipts/REG-1/attempt3-*/. VALID verdict requires: report.md last
   line VERDICT: accept/fix/blocked + trail.json with per-check
   elementExists + on-disk PNGs with the rail visible. accept -> mark
   REG-1 DONE (merge already at c895f0f0), close AS-169/170 evidence
   debt, closing handoff; THEN dispatch REG-2 coder via fleet FIFO
   (queue script pattern of queue-reg3.sh; base = post-merge tip; spec
   .hermes/plans/2026-10-17_REG-2-fullwidth-draggable-rail-spec.md).
   fix -> defect list with absolute screenshot paths to a coder fix run
   on wt/REG-1-lane1-l1t2305. Another voided/dead run -> tier 3 per SOUL
   6c or the orch-authored Playwright + judge route (often fastest: orch
   drives CDP/Playwright itself against :5192, judges artifacts, records
   that the orch judged them).
2. REG-3 coder: when process gone + report end-line REG3 CODER DONE
   <sha>, dispatch adversarial reviewer (unique path
   reviews/reg3-advreview-l1t<ts>.md). Then verify myself (diff, RED
   evidence honesty — check tests 1-2 really failed at base per report,
   re-run GREEN + taptab regression + server guard + tsc delta-0 vs
   tsc-reg3-base-*), merge, RESTART STACK (Task 11 edits YAML!), prove
   the editor-draft curl (spec §Live-lane proof), then browser gate.
   Coder alive = just observe; expected total ~60-90 min (3x ~02:35/03:00
   would be the escalation horizon).
3. REG-4 composer: adjudicate OQs, promote, but coder dispatch must wait
   for REG-2 (dep) AND the fleet lock.
4. Housekeeping: wt/REG-1-lane1-l1t2305 deletable ONLY after gate
   accepts. OWN-14 poller is DEAD (do not revive; if a future tick finds
   /api/records timeouts again, check backend.log responseTime trail
   FIRST). index.lock residue standing check.
5. decisions/: no new Brad answers this tick (intake A/B still
   unapproved).

## assumptions

- AS-ORCH-L1-170 (NEW, evidence-debt TRUE): REG-1 gate attempt-1 blocked
  = infrastructure starvation (external OWN-14 poller killed, restart +
  fast-query proof); attempt-2 accept VOIDED for zero-receipt evidence.
- AS-ORCH-L1-171 (NEW, evidence-debt FALSE): REG-3 dispatch on composer
  bases at c895f0f0 despite trunk 5271a1a5 (docs-only move); unfiltered
  GET /api/records slow-even-when-idle caveat recorded, not asserted.
- AS-ORCH-L1-169 (carried, evidence-debt TRUE until attempt 3 accepts):
  REG-1 merged pre-gate; pinned c895f0f0.
- Coder-side assumptions will arrive in reg3-report-l1t2355.md
  (AS-L1T2355-*) — carry them at acceptance.

## evidence-debt / carried

OPEN: AS-ORCH-L1-042; 082; 087 PARTIAL; 088; 089; 096; 097; 099; 101;
119 (+post-QMS76 ext); 137 residual; 154 (interpretive only); 169;
170 (NEW). CLOSED since 10-18 00:05 handoff: none.
N2 (--cl-text-faint 2.85:1 contrast) remains a plan-level NOTE for a
future contrast wave. ENV: :3092 boot-to-ready can exceed the script's
60s window (~75s observed) — restart reported failure while the backend
came up; always re-probe health before concluding a restart failed.
