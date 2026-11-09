# Handoff — lane 1 tick 365TH (2026-11-05 ~07:50 EST, orchestrator l1t0710)

## Verdict line
L1-REGISTRY-LOCKSTATE-RACE-1 DISPATCHED (deferred bring-up) — first ready-brief dispatch since the
defect was filed; task-list claimed in-progress, base f40047a2 (= trunk HEAD, verified).

## Queue at open
todo 1 (this item) / in-progress 0 / done 109. No PAUSE. Stack up :3092+:5192 (reconcile healthy).
Lane 2 live: L2-PROMPT2-GHOSTPAINT-1 coder pid 3020560 slot-0, ~21min in, healthy — not mine, untouched.
Fleet truth (flock, SHARED base): slot0 HELD (lane 2 ghostpaint), slot1 HELD (stale lane-2 writer),
slot2/3 FREE.

## What happened — measured, with the incident
1. Composer brief brief-L1-REGISTRY-LOCKSTATE-RACE-1-u1-l1t0700.txt 0.1h old; I re-graded it:
   brief-check COMPLETE. Dispatched it per READY-BRIEFS-FIRST — no hand-written brief this tick.
2. WORKTREE INCIDENT: cl-worktree-new.sh hit the known NFS failure mode TWICE because of MY
   timeout, not the script: my first call wrapped it in `timeout 120`, killing checkout -b mid-tree
   -> 0 tracked files / 6,370 staged-deletions debris (the exact symptom the 11-05 policy warns
   about). The script's exists-guard then made every retry a no-op (rc=0, "exists", broken index).
   My direct `git checkout -f -b` attempts (240s, 300s) each timed out on the NFS materialization
   too. Debris was a git tree, so per the WORKTREES rule I did NOT delete it; I REPAIRED in place:
   `git checkout -f f40047a2 -- .` (pathspec form skips index/HEAD churn) under a DEFERRED unit.
3. DEFERRED DISPATCH (survives tick exit per the 11-05 cgroup lesson):
   systemd-run --user --collect cl-l1-deferred-dispatch-l1t0710.service
   -> /home/brad/.hermes/cl/lanes/1/scripts-run/dispatch-deferred-l1t0710.sh
   Steps: checkout -- . (timeout 900) -> branch rename to
   cl/lane1-registry-lockstate-race-1-l1t0710 -> tracked==HEAD-tree self-verify (6,370 expected) ->
   app/node_modules symlink -> cl-coder-launch.py --mode parallel (fleet slot; launcher log
   /home/brad/.hermes/cl/lanes/1/logs/L1-REGISTRY-LOCKSTATE-RACE-1-l1t0710-launcher.log) ->
   auto-stop after coder exits. Status file:
   /home/brad/.hermes/cl/lanes/1/dispatch-deferred-l1t0710.status.
   RESOLVED SAME TICK (07:59): checkout rc=0, tree-ok tracked=6370 (== HEAD tree), branch renamed;
   launcher LIVE (pid 3153039), coder LIVE (cl-coder pid 3153041), fleet slots [0] acquired
   (lane-2 ghostpaint slot freed meanwhile), coder-launches.jsonl "start" row written,
   brief_check=complete. NO blocker remains on the dispatch itself; next evidence = coder DONE
   marker + commits.
4. Queue transaction under task-list.lock: status in-progress, owner + dispatched line with
   worktree/branch/log (lines 14426-14428).

## Learning for the fleet (binding going forward)
cl-worktree-new.sh on this repo needs >4 min for the checkout step; NEVER wrap it in a <600s
foreground timeout — run it backgrounded/deferred, and NEVER let `timeout` kill its checkout -b
(the exists-guard will then silently reuse a 0-file index). A 0-tracked tree whose HEAD-tree is
full repairs via `git checkout -f <sha> -- .` under a long-enough window.

## Pending obligations (unchanged)
- GC-16 branch cl/gc16-knowledge-door-l1t2100 STILL UNMERGED -> L1-WIDGET-R1 stays BLOCKED
  (escalated to architect/Brad at 364TH). No merge authority taken.
- L1-DEFECT6-DISCOVERY-REVIEW stays done with browser obligation VOIDED per ruling (advc5 +
  targeted browser regate on 393b78f4 stand as the real receipt).
- Roster lines still show "in-progress done+archived" for RECORD-LOCK-GUARD-1 (cosmetic, prior tick).

## Next tick
1. Read dispatch-deferred-l1t0710.status + coder-launches.jsonl: confirm the coder is LIVE with a
   slot; if failed, repair/re-dispatch per the incident notes above (do not blind-relaunch).
2. On coder DONE: first-hand verify (RED pin flip, RecordRegistryPage.test 18/18, tsc 29 baseline),
   then FULL-HEAD advc; UI item -> browser gate on served revision.
3. Keep checking GC-16 merge state each tick (unblocks WIDGET-R1).
No product code, no merge, no restart by orchestrator this tick.
