# Handoff — lane 1 tick 2026-10-17 17:20 → 18:0x EDT (OWN-15 coder DONE → adversarial VERDICT: fix → FIX RUN 1 live)

Author: orchestrator cron tick — lane 1. :3001/:5174 never touched.

## What happened (first-hand)

1. RECONCILE: OWN-15 original coder COMPLETED 17:44 (launcher 3920800 and hermes 3920866
   gone; report own15-report-l1t1545.md present with end-marker
   "OWN15 CODER DONE 99eb201dc28a9ca0259c3f6d16921ce0e8fa68fd"; branch wt/OWN-15-lane1-l1t1545
   has the commit; fleet lock released, pid file cleared).
2. ORCH PRE-VERIFICATION on candidate 99eb201d (all first-hand):
   - Touched suites: LocalAuthorization(20) OwnershipPolicyService(10) OwnershipPolicySchema(3)
     AccessControlService(5) -> 38/38 PASS (my own run, npm run test:run -w server).
   - applyOwnershipDefaults + RecordHandlers.filing -> 8/8 PASS.
   - tsc -p server/tsconfig.json --noEmit at HEAD: exit 0, ZERO error lines
     (tsc-own15-head-raw.txt) vs base b35da0bc ZERO (tsc-b35da0bc-raw.txt) — zero new.
   - Commit stage-set = exactly the 7 in-scope files; the records/seed/group/ deviation was
     later validated by the reviewer against RecordStoreImpl.ts:525 + seedRecordsDir.ts:17
     (kind-named merge dir — records/seed/identity/ would NOT have merged kind:group). Good call.
   - Diff is server + seed/lint YAML only; no app/ files (browser gate currently N/A —
     re-confirm after FIX-1 run since FIX-2 response wiring could touch handlers).
3. ADVERSARIAL GATE (cl-adversarial-reviewer, OpenRouter deepseek family; prompt
   prompts/own15-advreview-l1t1720.txt, report reviews/own15-advreview-l1t1720.md):
   VERDICT: fix — 2 FIX, 4 NOTE (NOTEs carried, listed in the review).
   - FIX-1 [major / privilege escalation]: ownerOfReferencedRecord's meta.createdBy fallback
     (AuthorizationService.ts:178-179 + delegation at :122) lets a NON-owner pass admin on an
     ACL row explicitly re-pointed at a different owner — revocation-bypass via the generic
     PUT at RecordHandlers.ts:943 (route writes ownerUserId through). Reviewer PROVED it with
     a real-service probe (non-owner createdBy -> canAccess true; committed tests can't catch
     it). Orch spot-checked the escalation route in source: TRUE.
   - FIX-2 [major]: mint refusals are console.warn-only; OQ2(c) adjudication requires a
     RESPONSE-level observable refusal. ensureOwnerPolicy has no refusal channel; call sites
     RecordHandlers.ts:395/:860, IdentityHandlers.ts:372 ignore it. Test comment at
     LocalAuthorization.test.ts:706 claims "surfaced in the result" — untrue.
4. FIX RUN 1 DISPATCHED 17:55 to the SAME worktree/branch under the fleet lock:
   flock fd held by hermes 61670 (lsof confirms lock fd on the running process); pid file
   names OWN-15-fix1(l1t1755); prompt prompts/own15-fix1-l1t1755.txt; log
   logs/coder-OWN-15-fix1-l1t1755.log; report own15-fix1-report-l1t1755.md; end-marker
   "OWN15 FIX1 DONE <sha>". Rules given: RED-FIRST per defect, createdBy fallback removed
   (or constrained to never contradict the row's ownerUserId) + non-owner-403 regression
   test; refusals threaded out via a typed channel into the RESPONSE envelope (never stored
   on the record); if response wiring forces app/ changes -> STOP and report.
   Expected ~60-90 min; due-check ~19:15, stale-by ~20:30. Do NOT re-dispatch while alive.
5. Hygiene: removed the reviewer's leftover untracked probe server/src/security/__probe_own15.test.ts
   (reviewer claimed deleted; it persisted). Lane stack healthy (:3092 200, :5192 200).
   decisions/ sweep: both files md5-unchanged (nothing new from Brad). lane-data index.lock:
   clean. No new trunk plans except my own handoffs. tsc base worktree
   /mnt/vast/home/brad/git/wt/tsc-baseline-own15 RETAINED for the merge-step verification.

## Queue state

- in-progress: OWN-15 only (FIX RUN 1 live, fleet lock held). Cycle 1 of max-2 fix cycles;
  a second FIX verdict with no improvement routes to architect with evidence.
- NEXT ready item: none — OWN-15 is the last approved item; new intake needs architect/Brad.

## NEXT TICK CHECKLIST (resume conditions)

1. FIX1 reconcile: own15-fix1-report-l1t1755.md + end-marker + log motion + fixer pid 61670
   liveness. On exit + report: re-run adversarial review (cycle 2, unique paths
   reviews/own15-advreview2-l1t<ts>.md, prompts/own15-advreview2-l1t<ts>.txt, log
   logs/advreview-OWN15-fix1-l1t<ts>.log). Tell the reviewer FIX-1/FIX-2 verbatim + tell it
   to re-run the probe scenario (non-owner createdBy must be FALSE; owner-of-referenced must
   still pass; non-owner still 403; refusal present in the HTTP response body for a planted
   unresolvable principal).
2. On ADV ACCEPT: orch verify — re-run suites (38-suite set above + applyOwnershipDefaults +
   RecordHandlers.filing), tsc base-vs-head raw (base ZERO, retained base worktree; copy the
   ~46 ignored trunk files into any fresh base tree or you get 25 bogus TS2307s), stage-set
   check (exact in-scope files; FIX-2 may legitimately add RecordHandlers/IdentityHandlers +
   their tests — confirm NO app/ files).
3. MERGE --no-ff into cl/integration-1 (inspect trunk first; OWN-14 already merged — rebase
   check: the branch base b35da0bc already contains it). YAML changed (seed group +
   ownership-policy lint) -> cl-lane-stack.sh 1 restart (background=true; the script BLOCKS)
   then LIVE journey closing AS-ORCH-L1-145: POST a record as a NON-admin user on :3092 ->
   minted ACL owner = session user; creator ACL PUT 200; a planted unresolvable group in the
   policy yields a refusal visible in the RESPONSE; a non-owner createdBy gets 403 on the ACL
   row; zero lane-data hand-repairs. Then mark done + handoff + close AS-ORCH-L1-145.
4. Cleanup owed after merge-verification: git -c core.fileMode=false worktree remove --force
   /mnt/vast/home/brad/git/wt/tsc-baseline-own15.
5. Standing checks: lane-data index.lock residue; decisions/ md5 sweep
   (L1-qms-field-defects-ruling-20261010.md = 1f41d881..., L1-wave3-followup-rulings-20261017.md
   = dcc03382... — any change = Brad spoke, act on it before anything else).
6. Post-OWN-15 intake candidates (needs architect/Brad, not orch authority):
   (a) AS-ORCH-L1-158 single-tab record-open nulls activeProject / disables project preset;
   (b) duplicate persisted project tabs; (c) role-grant authoring gate unwired on trunk
   (server.ts never passes getAuthoringPolicy — carried since OPS-1); (d) bulk repair of
   already-minted bad ACLs (main 23 + lane-1 inventory, OWN-15 spec stop-boundary).

## assumptions

- AS-ORCH-L1-157 (OWN-15 OQ adjudications, in flight).
- AS-ORCH-L1-158 (carried; OWN-14 follow-up intake candidate).
- AS-ORCH-L1-159 (tsc baseline at b35da0bc = ZERO, not 33; verified again this tick: head
  also ZERO, zero new).
- AS-ORCH-L1-160 (NEW, l1t1720, evidence-debt FALSE): FIX-1 accepted as a true defect
  (reviewer probe + orch source spot-check of RecordHandlers.ts:943); FIX-2 accepted (OQ2(c)
  says response-level); ruling to coder: refusals in the response envelope, never on the
  record. Orch removed reviewer's leftover probe file.

## evidence-debt / carried

OPEN: AS-ORCH-L1-042; 082; 087 PARTIAL; 088; 089; 096; 097; 099; 101; 119
(+post-QMS76 ext); 137 residual; 145 (OWN-15 in flight — closes only on the no-hand-repair
live round trip after merge); 154 (interpretive only).
CLOSED: AS-ORCH-L1-102 baseline claim SUPERSEDED by AS-ORCH-L1-159.
ENV NOTE: index.lock residue — CHECKED CLEAN this tick; standing check.
