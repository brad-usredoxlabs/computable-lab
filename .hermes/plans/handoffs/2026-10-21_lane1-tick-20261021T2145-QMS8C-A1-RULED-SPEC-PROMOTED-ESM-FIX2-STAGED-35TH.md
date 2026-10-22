# Handoff — lane 1 tick 2026-10-21 20:40 → QMS8-C UNBLOCKED: Brad ruled BRAD-A1 (full clean break); spec PROMOTED with binding A1 amendments; ESM-DIRNAME-1 fix-run-2 stays staged (fleet coder busy); QMS8-C honest-create sub-ruling still pending

Author: orchestrator cron tick l1t2040 — lane 1 only. :3001/:5174 never touched.
All git via -c core.fileMode=false. Budget 20:40→~21:45.

## Reconcile (first-hand)

1. QMS8-C: todo, NOW SPEC-READY (was Brad-blocked 34 ticks; the answer landed).
   - WATCH PATH CHANGED: .hermes/plans/2026-10-21_qms8c-cleanbreak-decision.md
     md5 6b693986a491eef8da0160e34332aa9b — Brad ruled 2026-10-21T18:45 EDT
     interactive: BRAD-A1 FULL CLEAN BREAK, rationale verbatim "we are not
     protecting any legacy data." Honest-create (i|ii|iii) explicitly still
     pending — NOT re-asked, carried as A1-6 hold.
   - SPEC PROMOTED (my action): composer draft DRAFT-2026-10-20_2210 copied to
     canonical .hermes/plans/2026-10-21_QMS8-C-retire-domain-status-spec.md with
     PROMOTION BLOCK A1-1..A1-8 overwriting the A2-default design where they
     conflict. Committed 3b5c21b7 (docs-only; trunk was 0814cd6a; no product
     files, no YAML — no stack restart needed; :3092/:5192 both 200 after).
   - ORCH FIRST-HAND VERIFICATION (mine, at tip 0814cd6a/3b5c21b7):
     lifecycleMiddleware.ts:38-39 and LifecycleHandlers.ts:53 fallbacks live;
     RecordSearchHandlers.ts:238 prompt line live; EquipmentHandlers.ts:117
     status:'active' hardcode live; LabCollectionView.tsx:32 label live;
     equipment/instrument schemas already declare `state` (:109/:120);
     material/material-spec/term schemas declare status with NO state property
     under unevaluatedProperties:false (material.schema.yaml:8/30-37) — this is
     why A1-2 requires the optional-state DECLARATION in the sibling commit or
     the stamp leg's own writes fail validation;
     lab-vocabulary-control lifecycle states are EXACTLY the material status
     enum (identity stamp, A1-3);
     LIVE vocab-control corpus via :3092 GET: material 8 records / 1 governed
     carrying status no state; material-spec 8 / 1 governed; term 0. The
     composer's "≤13" bound was schema-wide; the runtime window is 2 records.
     Dep QMS8-B done (9a51c1f2 ancestor of trunk).
   - Task list updated under task-list.lock: spec path now canonical,
     tick_reconcile_20261021T2105 block written.
2. ESM-DIRNAME-1: in-progress, fix-run-2 STAGED, still NOT dispatched.
   - Fleet gate: lane-2 MATRES-ELIG cl-coder pid 1311956 ALIVE at 20:41 AND
     21:39 (started 14:59, ~6h40m at last check) — fleet rule ONE live coder,
     so no dispatch despite flock -n succeeding (the lane-2 run never took the
     lock; governance flag carried from l1t1940 stands — lane-2 dispatch
     bypassed /home/brad/.hermes/cl/appliance2-coder.lock).
   - NOTE for next tick: the lane-2 coder's log has been FROZEN at 4373 bytes
     since 20:48 with "Status: implementation complete" as its final lines —
     content-wise it may be exiting slowly (or writing its report). Its own
     lane's tick owns that call; lane 1 does not touch it. If it is gone AND
     flock free, fire the STAGED fix-run-2 brief FIRST
     (/home/brad/.hermes/cl/lanes/1/dispatch-esm-dirname-1-fix2-l1t1940.md,
     log coder-ESMDIRNAME1-l1t2015-fix2.log, report
     esm-dirname-1-report-l1t2015-fix2.md), verify launch by pgrep+log
     (a silently skipped flock -n leaves no log at all).
   - ESM worktree stays 9017e965 (fix-run-1), clean of product edits, awaiting
     fix-run-2. Cycle discipline unchanged: cycle-3 re-review = ACCEPT-or-
     architect (two review reports at
     /home/brad/.hermes/cl/lanes/1/advreview-esm-dirname-1-l1t1920.md and
     advreview-esm-dirname-1-l1t1940-recheck.md; staged-fallback note in the
     architect packet if fix-2 also fails).
3. Queue: ESM-DIRNAME-1 (in-progress, gates outstanding) and QMS8-C (todo,
   spec-ready, dispatch-gated on the same slot — ESM fix-run-2 first). Nothing
   else non-done.

## Fleet state (load-bearing, first-hand 21:39)

- ONE live cl-coder fleet-wide (lane-2 MATRES-ELIG pid 1311956). flock FREE
  (file shows only my released ESMDIRNAME1-FIX1). Lane-1 tick does not kill
  lane 2's worker.
- Dispatch queue for the next free slot: (1) ESM-DIRNAME-1 fix-run-2 (staged
  brief, fires verbatim), (2) QMS8-C coder run (spec now canonical; brief from
  the spec's Worker contract + the A1 promotion block; worktree
  /mnt/vast/home/brad/git/wt/QMS8-C-lane1-l1t<tick>, branch
  cl/lane1-qms8c-l1t<tick> off trunk tip AT CLAIM (3b5c21b7 or later);
  report qms8c-report-l1<tick>.md; the spec's coder-NEVER list incl. no
  --apply, no stack restart, no lane-data writes is binding).
- Also due per SOUL: dispatch cl-spec-composer for QMS8-C's replacement only if
  a new ready item appears; queue has no third item — no composer needed now.

## QMS8-C orch laps owed (when C1 merges — do not skip)

A1-4 ORDER: merge C1 -> IMMEDIATELY run strip+stamp dry-run
(CONFIG_PATH=/home/brad/.hermes/cl/lanes/1/lane1-config.yaml npx tsx
src/scripts/migrateRecordLifecycles.ts from the trunk server/), expect the
vocab-stamp leg planning exactly the 2 governed records + strip leg planning
the covered corpus (draft's expected 51 lane records), then --apply, re-dry
(expect 0), RESTART stack (YAML declarations shipped in C1 — tsx --watch does
NOT reload YAML), re-probe :3092: 0 vocab records status-no-state, 0 covered
records with status. The merge->apply minutes-scale fail-open window is
AS-ORCH-L1-232 evidence debt — closed only by the apply+re-probe receipts.
Then C3 (the flip) after the strip apply; C4 last; browser gate
(verified-by 5: /registry EQP-NEW-7LS1 Draft pill, no Status field) async per
ruling 6b, tier ladder per 6c.

## assumptions:

New: AS-ORCH-L1-231 (identity stamp status:=status, enums 1:1, schema-read
evidence); AS-ORCH-L1-232 (minutes-scale vocab fail-open window between C1
merge and orch apply; EVIDENCE DEBT — closes with apply+re-probe receipts);
AS-ORCH-L1-233 (honest-create D8 HELD pending Brad i|ii|iii — silence is never
approval; coder must not pick label wording).
Validated+closed: none.
Carried open (unchanged from l1t1920): AS-ORCH-L1-042; 082; 087 PARTIAL; 088;
089; 096; 097; 099; 101; 119 (+post-QMS76 ext); 137 residual; 154; 201
(posture-watch); 206; 209; 210; 211; 212; 217; 218; 219; 221; 227 (VPDF-4
fail-branch unit-only posture); 228 (ESM spec loss-reconstruction); 229; 230.
Evidence debt: AS-ORCH-L1-232 NEW OPEN (apply receipts); AS-ORCH-L1-227
posture stands. ESM-DIRNAME-1 gates: adversarial cycle-3 pending (fix run 2
STAGED, unfired — fleet coder busy); live lap + browser gate outstanding BY
DESIGN; nothing merged; trunk 3b5c21b7 (docs-only commit this tick).

## Next tick checklist

1. FLEET CHECK: pgrep -f 'hermes -p cl-coder'. If MATRES-ELIG (1311956) gone
   AND flock -n succeeds -> fire ESM fix-run-2 staged brief (see above). Only
   AFTER fix-run-2 exits -> QMS8-C dispatch (spec canonical; unique tick token
   everywhere).
2. On ESM fix-2 exit + "STATUS: complete": cycle-3 re-review ACCEPT-or-
   architect (never a 3rd fix cycle). On ACCEPT: orch verify (name-only
   9017e965..HEAD = guard test file only; 3 suites incl. counts 760/26; raw
   tsc spot), merge --no-ff cl/lane1-esm-dirname-1-l1t1700, LIVE LAP (POST
   /api/extraction/vendor-candidates/CAN-vendorpdf-b87b94e312ce5462/
   semantic-draft on :3092; PASS = 200 or honest SEMANTIC_PASS_* token),
   browser gate tier-1 on http://localhost:5192/ingestion/vendor-pdf/
   VPDF-6C821D307E98 receipts ~/.hermes/cl/receipts/ESM-DIRNAME-1/<ts>/.
   No YAML in the ESM diff -> no restart unless trunk moved otherwise.
3. QMS8-C watch path md5 6b693986... — if the (i|ii|iii) honest-create answer
   is added, lift the D8 hold via a spec amendment; unchanged -> do NOT re-ask.
4. If lane-2 MATRES-ELIG is gone but its lane never cleared the flock pid-file,
   note it in the handoff; do not edit lane 2's queue.
