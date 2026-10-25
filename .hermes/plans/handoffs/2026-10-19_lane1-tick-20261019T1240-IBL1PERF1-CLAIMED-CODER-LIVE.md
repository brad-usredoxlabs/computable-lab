# Handoff — lane 1 tick 2026-10-19 12:40 → IB-L1-PERF-1 CLAIMED, CODER LIVE

Author: orchestrator cron tick — lane 1. :3001/:5174 never touched. All git via -c core.fileMode=false.

## What happened (first-hand)

1. RECONCILE: no live lane-1 workers at start. Wave 5 confirmed complete (trunk
   c98957c1, VPDF-2 merge 6ade6e8b intact, task tree shows todo=NONE except
   IB-L1-PERF-1). decisions/ md5s UNCHANGED (1f41d881 / dcc03382) — no new intake,
   nothing re-asked. readiness gate: 0 due/changed blockers. Stack :3092 200 / :5192 200.
   Fleet coder PID 2420490 (lane-2 W28STAGHEDGE1-fix2) GONE — lock stale-held only by
   the dead pid; marker cleared.
2. NEW INTAKE FOUND: IB-L1-PERF-1 (architect-authored task block, Brad-authorized
   20261019T1210 "make IB-L1-PERF-1 somebody's task"). This is wave-6-equivalent
   authorized work — not an invented task.
3. ORCH GROUNDING (mine, before spec): live RED baseline measured — unfiltered
   GET :3092/api/records = **118.06s** wall, 637 records (this tick, raw in shell
   history + baseline json /tmp/l1-perf-baseline.json, ephemeral). Call chain
   opened line-by-line on trunk: RecordHandlers.ts:461-463 per-record canAccess loop
   → AuthorizationService.canAccess:117-127 → resolveEffectivePolicy:282 →
   findPolicyForRecord:304-307 store.list({kind:'access-policy',limit:10000}) +
   loadGroups:348 + loadProjectPolicies:418 (second ACL scan) — ≈3 full-collection
   reads per record. IndexManager investigated: boot-time JSON-LD index, no
   subscription surface — the spec's "reuse the index machinery" is NOT applicable;
   spec says explicitly do not touch it (my verified correction to the architect
   block's suggested shape, decision logic unchanged).
4. SPEC WRITTEN + committed fa1c0974:
   .hermes/plans/2026-10-19_ib-l1-perf-1-acl-request-snapshot-spec.md.
   Binding shape: request-scoped AclSnapshot (buildAclSnapshot + optional snapshot
   param through listRecords→canAccess), NO TTL/LRU cache (invalidation-proof by
   construction — next request rebuilds), zero decision-semantics change, T1-T4
   RED-first tests including freshness pin + snapshot/unsnapshot parity.
5. CLAIMED under task-list.lock (staged replace, md5 be64edbe→9d4a06e6, .bak-l1t1245).
6. WORKTREE: first `git worktree add` was killed by my own 120s timeout mid-checkout
   (dangling .git pointer — cleaned via rm -rf + worktree prune + branch -D, redone
   in background): wt/IB-L1-PERF-1-lane1-l1t1245 @ fa1c0974. Worktree-sync ran
   (ibl1perf1-worktree-sync-l1t1245.sh: linked=60 skipped=59 noise=0).
7. CODER DISPATCHED: queue-ibl1perf1.sh (fleet-lock FIFO) acquired
   appliance2-coder.lock 13:06:30; cl-coder PID 2594874 live, log
   logs/coder-IBL1PERF1-l1t1245.log, prompt prompts/coder-IBL1PERF1-l1t1245.txt,
   report path /home/brad/.hermes/cl/lanes/1/ibl1perf1-report-l1t1245.md,
   end-marker contract 'STATUS: complete <sha>' (or requires-rescope).
8. ADVERSARIAL GATE CHAINED: queue-advreview-ibl1perf1.sh (watcher PID 2601596,
   log logs/advreview-IBL1PERF1-l1t1245.log) fires on coder EXITED + end-marker;
   prompt prompts/advreview-IBL1PERF1-l1t1245.txt → review path
   reviews/ibl1perf1-advreview-l1t1245.md, focus: snapshot staleness = security
   defect, semantics drift, lifetime leak, re-run evidence.
9. NO SPEC-COMPOSER: no next-ready item exists (wave 5 complete; IB-L1-PERF-1 was
   the only todo) — nothing to compose. Expect no-work ticks after this closes
   unless new intake lands.

## Live state at checkpoint (13:15)

- in-progress: IB-L1-PERF-1 — coder PID 2594874 (queue wrapper 2594808), fleet lock
  HELD-FREE for its lifetime, expected duration ~2-3h (coder class; perf refactor +
  RED-first). Watcher queue-advreview PID 2601596 will fire the gate at exit.
- NEXT TICK: reconcile coder by PID + log; if EXITED, read report + review
  (reviews/ibl1perf1-advreview-l1t1245.md — check ADVW-DONE); on ACCEPT verify
  yourself (diff, tests, tsc 33-baseline, delta-ZERO fail files), then merge --no-ff
  to cl/integration-1, RESTART lane stack (server TS change; tsx --watch will reload
  but restart before timing proof), LIVE TIMING PROOF: unfiltered GET :3092/api/records
  well under 10s cold AND warm (baseline 118.06s this tick; /tmp/l1-perf-baseline.json
  response shape: {records:[637]}), then done + handoff. On FIX: fix run to same
  worktree with defect list. On requires-rescope: route to architect with evidence.
- Coder still running at 3x expected (>~9h) = treat as dead for ownership; watcher
  has an 8h timeout that self-exits without dispatching.
- ENV: trunk fa1c0974 (spec doc). No YAML merged — no restart owed yet.
  Stack :3092/:5192 200/200. decisions/ md5s unchanged.

## assumptions

- AS-ORCH-L1-190 (evidence-debt FALSE): live perf baseline 118.06s/637-records
  measured THIS tick on :3092 (corpus ~1335 files / 374 ACLs); post-merge proof
  target is the same call re-timed — numbers comparable only on the same corpus.
- AS-ORCH-L1-191 (evidence-debt FALSE): spec DEVIATES from the task block's hint
  "reuse IndexManager" — verified first-hand that IndexManager is a boot-time
  JSON-LD index with no subscription/invalidation surface; request-scoped snapshot
  chosen instead (invalidation-proof). Architect block's wording was a suggestion
  ("Check the existing index machinery first"); deviation documented in spec §4.5.
  Architect may amend post-hoc; decision logic untouched.
- AS-ORCH-L1-192 (evidence-debt FALSE): request-scoped lifetime satisfies the
  block's verification item (3) "visible to the VERY NEXT list request" trivially;
  pinned by coder test T3 rather than an invalidation-machinery test.
- Carried unchanged: AS-ORCH-L1-187 (PROVISIONAL VPDF spec ratified in action),
  AS-ORCH-L1-188..189, AS-L1T2040-VPDF1-001..004, AS-L1T2245-VPDF2-001..003,
  AS-ORCH-L1-183..186.

## evidence-debt / carried

OPEN: AS-ORCH-L1-042; 082; 087 PARTIAL; 088; 089; 096; 097; 099; 101; 119
(+post-QMS76 ext); 137 residual; 154 (interpretive only). Closed this tick: none.
INFRA BLOCKER IB-L1-PERF-1: now ACTIVELY BEING FIXED (this item) — lane gates keep
the pre-warm/long-first-paint workaround until post-merge re-timing (spec verified-by
item 5). NOTES list unchanged.

## NEXT TICK CHECKLIST

1. Reconcile coder 2594874 (log coder-IBL1PERF1-l1t1245.log: LOCK-ACQUIRED 13:06:30;
   EXITED marker + report end-marker = done coding).
2. Adversarial review at reviews/ibl1perf1-advreview-l1t1245.md (watcher 2601596;
   if watcher died before firing and coder exited, dispatch review manually).
3. ACCEPT → orch verify (diff scope: AuthorizationService.ts + RecordHandlers list
   loop + tests ONLY; own security-suite re-run; own tsc vs 33-line baseline;
   delta-ZERO fail files) → merge --no-ff → stack restart → LIVE TIMING PROOF
   (<10s cold+warm unfiltered GET :3092/api/records) → done + assumptions + handoff.
4. FIX → new coder run SAME worktree, defect list verbatim, new unique paths
   (suffix l1t<new>), re-acquire fleet lock via a fresh queue script.
5. decisions/ md5 sweep (expect unchanged 1f41d881 / dcc03382).
6. No new spec-composer until a new todo exists after IB-L1-PERF-1 closes.
