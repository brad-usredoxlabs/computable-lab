# Handoff — lane 1 tick 2026-10-18 02:45 → 03:2x EDT (REG-3 adv-ACCEPT + ORCH-VERIFY + MERGED + live curl proof + browser gate LIVE; REG-1 fix1 adv-ACCEPT + MERGED + re-gate LIVE; REG-4 composer DONE, draft awaiting adjudication)

Author: orchestrator cron tick — lane 1. :3001/:5174 never touched. All git via -c core.fileMode=false.

## What happened (first-hand)

1. RECONCILE at tick start: REG-1 fix1 coder DONE (end-line REG1-FIX1 DONE 5ddf98cd,
   report reg1-fix1-report-l1t0155.md, coder process gone). REG-3 adv gate report
   (reviews/reg3-advreview-l1t0158.md) = VERDICT: accept. REG-4 composer still live.
   Fleet lock held by LANE 2 (launch-coder-mintidem1 pid 1567962) — no lane-1 coder
   dispatch was legal all tick; REG-2 coder stays queued.

2. REG-3 ORCH VERIFICATION (my own runs in wt/REG-3-lane1-l1t2355 at head 42d7f3e8):
   - diffstat first-hand: 18 files +279/-124 (base 5271a1a5).
   - `cd app && npx vitest run src/editor/taptab` -> 3 failed | 13 passed / 6 failed |
     153 passed; FAIL-line set EXACTLY the 6 pre-existing debt failures
     (documentMapper x2, RefCombobox x2, ChipComboboxWidget x2) — delta-0 confirmed.
   - `cd server && npx vitest run src/ui/UISpecRecordRef.test.ts` -> 2/2 pass.
   - app tsc: 23 error-TS lines, sorted-file diff vs base capture
     (tsc-reg3-base-app-l1t2355-recap5271a1a5.txt) EMPTY -> delta-0. server tsc 0 errors.
   - MERGED no-ff: 01c17087 into cl/integration-1. N1 adopted: binding table is 17
     conversions, not 16 (spec/report miscount; coder followed the table exactly).
   - Stack RESTARTED (Task 11 edits YAML): backend :3092 healthy 25s, FE :5192 200,
     Data dir = /home/brad/.computable-lab-lane1 (.run/backend.log).
   - LIVE CURL PROOF (my own): GET /api/ui/record/TRR-DEMO-1/editor -> $.personRef
     widget=record-ref refKind=person; $.trainingMaterialRef refKind=training-material;
     $.trainerRef refKind=person; diagnostics only the 2 known info entries.
   - BROWSER GATE LIVE (tier 2, OpenRouter deepseek-v4.1-flash; SOUL 6c ladder — tier-1
     voided twice on this wave; runner pid 1657256, started ~03:00, log
     logs/browergate-REG3-l1t0300-tier2.txt path prompts/browergate-REG3-l1t0300-tier2.txt;
     prompt carries BINDING EVIDENCE REQUIREMENTS: per-check elementExists + real PNGs +
     API-verified canonical-ref check). Receipts dir forming:
     ~/.hermes/cl/receipts/REG-3/20261018T065824Z/ (trail.json + 9+ shots at last look,
     C1/C2/C3 shots present; still running at budget). TASK STAYS in-progress until real
     VERDICT: accept (AS-173 evidence debt).

3. REG-1 FIX1 ADVERSARIAL GATE ACCEPT (reviews/reg1-fix1-advreview-l1t0250.md,
   cloud tier; exit 0 02:56): zero palette literals in touched files; zero scope creep
   (3 files, all DocumentControlBar.*); guard test PROVEN NON-VACUOUS by the reviewer's
   own injection probe (bg-gray-50 reintroduced -> test FAILS); tsc base==head delta-0.
   NOTES: N1 23-vs-27 base-count discrepancy is a baseline-worktree ignored-file artifact,
   same-worktree delta-zero; N3 guard regex not exhaustive (misses bg-white/arbitrary
   values) — noted for the future contrast wave, non-blocking.
   ORCH VERIFY: own grep = zero palette literals in tsx/css; diffstat 3 files +203/-19.
   MERGED no-ff: 69a8c0ff into cl/integration-1 (trunk tip; no YAML touched — no restart
   needed; REG-3 merge already restarted the stack this tick).
   RE-GATE LIVE (tier 2, runner pid 1707167, log logs/browergate-REG1-regate-l1t0320-
   tier2.log, started ~03:20): R1 dark-theme control-bar legibility w/ computed rgb,
   R2 light theme, R3 in_review buttons legible no-modal, R4 rail/registry/console
   regression; receipts REG-1/regate-<ts>/. REG-1 stays in-progress until that accepts
   (then AS-169/170/172 close and REG-1 is DONE + REG-2 coder may be dispatched).

4. REG-4 COMPOSER DONE 03:17 (exit 0, end-line COMPOSER DONE present): draft
   specs-draft/2026-10-18_REG-4-provenance-card-spec-draft-l1t0130.md (~29KB). NOT
   promoted, NOT adjudicated (budget). OQ-1 (rail gate change for create mode, cites
   plan:1364-1366) visible at :356.

5. Queue bookkeeping under task-list.lock: REG-3 block gained tick_reconcile_20261018T0300
   (adv accept + orch verify + merge 01c17087 + live curl + gate live). REG-3 still
   in-progress (browser evidence pending = SOUL 6b).

## Queue state after this tick

- in-progress:
  - REG-1 — merged (REG-1 + fix1 at 69a8c0ff); RE-GATE tier-2 LIVE pid 1707167.
    AS-169/170/172 evidence debt open until real accept with computed-style + PNGs.
  - REG-3 — merged 01c17087; browser gate tier-2 LIVE pid 1657256, receipts forming.
    AS-173 open until accept.
  - REG-4 — spec DRAFT ready for orchestrator adjudication (promote after OQ rulings +
    first-hand spot-check of its grounding at trunk >= 69a8c0ff). Coder dispatch waits on
    REG-2 dep + fleet lock (REG-1->REG-2->REG-4 serialization).
- todo: REG-2 (spec promoted; coder waits on fleet lock + REG-1 gate closure).

## NEXT TICK CHECKLIST

1. REG-3 gate: read logs/browergate-REG3-l1t0300-tier2.log + receipts/REG-3/20261018T065824Z/.
   VALID = report.md VERDICT line + trail.json elementExists + on-disk PNGs + the C4 raw
   JSON snippet showing personRef as an object. accept -> mark REG-3 DONE (merge already
   in at 01c17087), close AS-173, carry AS-L1T2355-001..006 as accepted worker assumptions,
   closing handoff. fix -> defect list to a coder fix run on wt/REG-3-lane1-l1t2355 (fleet
   lock first). Void/dead -> SOUL 6c ladder (tier 3 or orch-driven Playwright + judge).
2. REG-1 re-gate: same rules, receipts/REG-1/regate-*/. accept -> REG-1 DONE: mark in task
   list, close AS-169/170/172, delete wt/REG-1-lane1-l1t2305, THEN dispatch REG-2 coder via
   the fleet-lock FIFO pattern (queue script; worktree wt/REG-2-lane1-<ts> off trunk tip;
   spec .hermes/plans/2026-10-17_REG-2-fullwidth-draggable-rail-spec.md). Remember: complete
   the worktree setup BEFORE queueing the coder (last wave's lesson).
3. REG-4: read the draft, verify load-bearing grounding yourself at trunk >= 69a8c0ff
   (handleSelectRecord/RecordData meta-drop site, revisions client method reuse from
   SignOffReceipt, REG-2 spec composition surface), adjudicate OQs, promote to
   .hermes/plans/, commit, link in task block. Do NOT dispatch its coder (dep REG-2).
4. Fleet lock: check /home/brad/.hermes/cl/appliance2-coder.pid identity before claiming.
5. Housekeeping: index.lock residue check; REG-3 worktree deletable only after its gate
   accepts; OWN-14 poller stays dead.
6. decisions/: no new Brad answers (intake A/B still unapproved; never re-ask).

## assumptions

- AS-ORCH-L1-173 (NEW, evidence-debt TRUE): REG-3 merged on code track only; browser gate
  pinned to revision 01c17087, pending real accept. Coder-side AS-L1T2355-001..006 carried
  from reg3-report-l1t2355.md.
- AS-ORCH-L1-172 (carried, evidence-debt TRUE until re-gate accepts): REG-1 D1 fix scoped
  as styling-only inside REG-1's surface; merged pre-re-gate at 69a8c0ff.
- AS-ORCH-L1-169, AS-ORCH-L1-170 (carried, evidence-debt TRUE): REG-1 merged pre-gate;
  close together on re-gate accept.
- Adv-gate N1 adopted: "16 conversions" corrected to 17 (docs-only record correction).

## evidence-debt / carried

OPEN: AS-ORCH-L1-042; 082; 087 PARTIAL; 088; 089; 096; 097; 099; 101; 119 (+post-QMS76 ext);
137 residual; 154 (interpretive only); 169; 170; 172; 173 (NEW).
CLOSED since 10-18 01:5x handoff: none (169/170 close on the re-gate accept).
N2 (--cl-text-faint 2.85:1 contrast) remains a plan-level NOTE for a future contrast wave;
adv-gate N3 (styling-guard regex not exhaustive) is a second candidate entry for that wave.
ENV: lane backend boot-to-ready ~25s this tick (healthy); :3092 single-threaded — if
/api/records timeouts recur, check backend.log responseTime trail FIRST (OWN-14 pattern).
