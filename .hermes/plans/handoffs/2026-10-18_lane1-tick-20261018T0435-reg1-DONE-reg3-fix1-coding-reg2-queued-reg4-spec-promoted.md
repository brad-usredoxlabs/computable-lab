# Handoff — lane 1 tick 2026-10-18 03:41 → 04:35 EDT (REG-1 DONE re-gate accept; REG-3 gate fix -> fix1 CODING; REG-2 claimed+queued; REG-4 spec promoted)

Author: orchestrator cron tick — lane 1. :3001/:5174 never touched. All git via -c core.fileMode=false.

## What happened (first-hand)

1. RECONCILE at tick start: both tier-2 browser gates had EXITED with real verdicts.
   REG-3 gate (receipts/REG-3/20261018T065824Z/) = VERDICT: fix. REG-1 re-gate
   (receipts/REG-1/2026-10-18_071729/) = VERDICT: accept. Fleet lock held by lane-2
   UCX-1 coder (pid 1753175) at tick start — no lane-1 coder dispatch was legal until 03:59.

2. REG-1 ACCEPTED — DONE. Re-gate evidence verified myself: report.md first+final
   VERDICT: accept; trail.json 42 steps 0-fail consoleErrors[] pageErrors[]; 5
   md5-distinct PNGs; served checkout verified = 69a8c0ff; R1 dark / R2 light /
   R3 in_review / R4 rail+registry regression all PASS with computed rgb. Marked done
   in task list (completed 20261018T0400). AS-ORCH-L1-169/170/172 CLOSED in
   assumptions.md. Worktree wt/REG-1-lane1-l1t2305 + branch deleted. Reviewer's
   out-of-scope NOTE (recorded, non-blocking): SignOffReceipt renders empty so its
   latent text-gray-* literals were never exercised — third candidate entry for the
   future contrast wave (with N2 --cl-text-faint 2.85:1 and N3 guard-regex breadth).

3. REG-3 FIX CYCLE 1 (gate returned fix; widget itself verified correct — C1/C2 PASS,
   C4 substance PASS: canonical ref OBJECT committed AND persisted with exact-sha
   restore). Defects (both proven PRE-EXISTING by the reviewer's attribution):
   D1 high — schema/lab/training-record.ui.yaml completedAt/expiresAt widget "date"
   commits YYYY-MM-DD while training-record.schema.yaml requires format: date-time ->
   POST /api/records 422, the create leg (C3 + literal C4-new-record) cannot pass;
   D2 high — Create while a record is open carries the open record's values, and
   abandoning the create FLUSHED a write back to TRR-DEMO-1 (draft-on-leave);
   D3 low — ref display label consistency/clipping.
   FIX1 DISPATCHED: prompt prompts/coder-REG-3-fix1-l1t0400.txt (D1 declarative-first
   datetime route with Ajv proof — schema format must NEVER be weakened; D2
   smallest-root-cause fix in the registry create flow with requires-rescope escape for
   shared editor machinery; D3 constrained). Worktree wt/REG-3-lane1-l1t2355 RESET to
   trunk tip (125221bd), lane-sync re-applied, bootstrap verified. queue-reg3-fix1.sh
   took the fleet lock at 04:14:37 (queue pid 1834952, hermes child 1834960), log
   logs/coder-REG-3-fix1-l1t0400.log, report reg3-fix1-report-l1t0400.md, end-line
   REG3-FIX1 DONE <sha>. AS-ORCH-L1-174 records the fix-scoping decision.

4. REG-2 CLAIMED + QUEUED: worktree wt/REG-2-lane1-l1t0400 created @ 033b7194 (trunk
   tip), node_modules symlinks + lane-exclude bootstrapped via
   reg2-worktree-sync-l1t0400.sh (linked=60 noise=0) BEFORE queueing — the last-wave
   lesson applied. Prompt prompts/coder-REG-2-l1t0400.txt (spec binding, delta-zero
   gates, clamp-on-restore, app-only, RED-first DocumentShell describes). queue-reg2.sh
   QUEUED at 04:28:47 behind live REG-3 fix1 (fleet single coder). Claim recorded in
   task list + AS-ORCH-L1-175.

5. REG-4 SPEC PROMOTED: composer draft l1t0130 adjudicated + grounded. OQ rulings (all
   verbatim-plan): OQ-1 rail renders whenever a record is selected (create-mode empty
   aside accepted); OQ-2 NO RecordSearchCombobox widening (pre-existing empty-until-
   refresh quirk = carried finding); OQ-3 browser gate uses an API/UI-created record,
   card invents NO fallbacks. Grounding spot-checked first-hand at 125221bd:
   handleSelectRecord meta-drop RecordRegistryPage.tsx:288-293, refreshSelectedRecord
   re-drop :521-525, meta re-derivation server/src/store/RecordStoreImpl.ts:348-357,
   create createdBy stamp server/src/api/handlers/RecordHandlers.ts ~:788, client
   listRecordRevisions app/src/shared/api/client.ts:2404. (Composer cited paths
   server/src/records/ and server/src/handlers/ were slightly off; real paths verified.)
   Promoted to .hermes/plans/2026-10-18_REG-4-provenance-card-spec.md, committed
   033b7194, linked in task block. Coder dispatch waits on REG-2 dep.

## Queue state after this tick

- done: REG-1 (merged c895f0f0 + fix1 69a8c0ff; re-gate accepted at 69a8c0ff).
- in-progress:
  - REG-3 — merged 01c17087; gate fix1 CODING (lock holder pid 1834952 since 04:14:37;
    wt/REG-3-lane1-l1t2355 @ trunk-reset; expected ~60-90 min). AS-173 + AS-174 open.
  - REG-2 — claimed; coder QUEUED (queue-reg2.sh wrapper pid 1867845, QUEUE-WAIT
    04:28:47; wt/REG-2-lane1-l1t0400 @ 033b7194 bootstrapped). Dispatches when fix1 exits.
- todo: REG-4 (spec promoted; dep REG-2).

## NEXT TICK CHECKLIST

1. REG-3 fix1: when logs/coder-REG-3-fix1-l1t0400.log shows EXITED + report
   reg3-fix1-report-l1t0400.md end-line REG3-FIX1 DONE <sha>: adversarial gate
   (reviews/reg3-fix1-advreview-<ts>.md), then orch verify (RED/GREEN re-run, tsc
   delta-zero, D1 Ajv proof, D2 pins). MERGE; if YAML touched RESTART :3092/:5192;
   live curl re-check; re-gate tier-2 (SOUL 6c ladder; prompt must require the C3
   create-leg POST-body evidence + D2 abandon-no-write proof). accept -> REG-3 DONE,
   close AS-173/174 + coder assumptions. fix -> fix cycle 2/2 max, then architect.
2. REG-2 coder: LOCK-ACQUIRED should follow fix1's QUEUE-RELEASED. When EXITED +
   reg2-report-l1t0400.md end-line REG2 DONE <sha>: same gate chain. app-only ->
   no restart expected.
3. REG-4: coder dispatch ONLY after REG-2 merges (dep + rail-render composition).
   Worktree wt/REG-4-lane1-<ts> + lane-sync bootstrap FIRST, then queue.
   No next item queued for the spec-composer: REG-4 is the last item on the list.
4. Fleet lock: check /home/brad/.hermes/cl/appliance2-coder.pid identity before
   claiming.
5. Housekeeping: REG-3 worktree deletable only after re-gate accepts; index.lock
   residue check; OWN-14 poller stays dead; specs-draft/ old untracked drafts under
   .hermes/plans/ are historical (leave).
6. decisions/: no new Brad answers (intake A/B still unapproved; never re-ask).

## assumptions

- AS-ORCH-L1-174 (NEW, evidence-debt TRUE): REG-3 gate defects D1/D2 scoped as fix1
  inside REG-3 rather than new campaign tasks; requires-rescope escape for D2 root
  cause; closes only when the re-gate accepts.
- AS-ORCH-L1-175 (NEW, evidence-debt FALSE): REG-2 baselined at own base 033b7194;
  FIFO queue discipline (never two live coders).
- AS-ORCH-L1-173 (carried, evidence-debt TRUE): REG-3 merge-before-gate; pinned to
  01c17087, now plus fix1 pending re-gate.
- AS-ORCH-L1-169/170/172 CLOSED this tick (re-gate accept at receipts/REG-1/
  2026-10-18_071729/).

## evidence-debt / carried

OPEN: AS-ORCH-L1-042; 082; 087 PARTIAL; 088; 089; 096; 097; 099; 101; 119 (+post-QMS76 ext);
137 residual; 154 (interpretive only); 173; 174 (NEW).
CLOSED this tick: 169, 170, 172.
CONTRAST-WAVE CANDIDATES (notes, not tasks): N2 --cl-text-faint 2.85:1; N3 styling-guard
regex breadth; SignOffReceipt latent text-gray-* (rendered-empty during REG-1 re-gate).
ENV: lane backend boot-to-ready ~25s; :3092 single-threaded — /api/records timeouts ->
check backend.log responseTime trail FIRST (OWN-14 pattern). Lane stack currently
serving trunk 125221bd-era code (033b7194 is docs-only; no restart needed).
