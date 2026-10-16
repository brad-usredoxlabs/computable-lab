# HANDOFF — QMS7-2 seed copy-on-write promotion COMPLETE (lane 1, l1t0050)

Branch: wt/QMS7-2-lane1-l1t0050 (off trunk 829e514e)
Worktree: /mnt/vast/home/brad/git/wt/QMS7-2-lane1-l1t0050
Commits: 4a599829 (RED pins) → d436b250 (implementation) → 71a6d31d (test import cleanup)
Full report + raw logs: /home/brad/.hermes/cl/lanes/1/qms7-2-report-l1t0050.md
Raw suite logs: /tmp/qms72-base-fullsuite.log, /tmp/qms72-head-fullsuite.log,
/tmp/qms72-head-fullsuite2.log, /tmp/qms72-red-final.log

## What landed (all four orchestrator rulings implemented)

- updateUnlocked: findRecordPath miss + seedDir configured → read-only seed
  candidate (readSeedCandidate); SAME walls (append-only, content lock, SHA)
  run against the SEED payload, then validate+lint the incoming envelope; only
  a fully authorized valid write promotes via ONE repo.createFile at the
  generatePath convention. Commit message: `Promote seed record <id> from <seed path> (seed content <fp>)`.
  Refusals leave zero residue (nothing before the durable step touches the repo).
- OQ3: expectedSha === 'seed' accepted as matching the seed fingerprint
  (sha256-40 adapter derivation); foreign shas → 'SHA mismatch: expected X, got <fp>'.
  No meta.contentSha stamping added to seed reads.
- OQ2: handler-side audit append in updateRecord success path on result.promotion:
  action 'seed_record_promoted', real actor, data {seed_path, seed_content_sha,
  promoted_path, commitSha}, best-effort AFTER durability (lifecycle_transition
  pattern). RecordHandlers.ts touched ONLY there (+28 lines).
- OQ1: deleteUnlocked message-only: 'Record <id> resolves from seed; seed records
  cannot be deleted'. Behavior unchanged (still refused).
- OQ4: create-shadowing untouched.
- StoreResult.promotion?: SeedPromotion {seedPath, seedContentSha} in
  server/src/store/types.ts (conditional spreads, exactOptionalPropertyTypes-safe).
- get()/list()/IndexManager: zero changes; exactly-once pinned by tests.

## Pin tests (R1-R7 + OQ pins) — all GREEN at tip

R1 store promotion + marker; R2 handler PUT 400→200 (mirrors live probe);
R3 list/get/index exactly-once (store + IndexManager.rebuild with seedDir override);
R4a-d residue-freedom (validation / append-only config-injected kind /
content-lock / wrong sha — data-dir file list identical before/after, seed file byte-identical);
R5 concurrency: two unawaited updates → exactly one promotion marker, one working file;
R6 nonexistent id: store 'Record not found: <id>' + handler 404;
R7 audit: promoted PUT appends seed_record_promoted (actor, seed_path,
seed_content_sha, promoted_path); refused PUT appends NOTHING; marker one-shot.

## Evidence summary

- RED at base (final tests vs base impl): 16 failed | 40 passed — every failure
  'Record not found: <id>' (walls never saw the seed payload). Handler leg: 400 + body text.
- GREEN: 56/56 pair; 79/79 five-suite targeted check; handler-path regression suites 22/22.
- Full server suite: base 119 failed tests / head run2 119 failed tests; comm of
  FAIL lists: NEW = [] (157 named failing tests identical). Head run1's two extra
  fails were load timeouts that pass in isolation. LifecycleBypassAudit.test.ts
  fail→pass via lane repair (below).
- tsc: 3 errors in the worktree, PROVEN pre-existing (identical at base with my
  impl stashed; caused by lane symlinks for oligoOrder.ts/sequenceRoutes.ts
  resolving to the lagging computable-lab checkout). cl-integration-1 trunk
  server tsc = 0. Zero new errors from this item.
- Seed untouched: sha256 eqc-quantstudio5.yaml = 9163d1a3...974cf before/after;
  `git status --porcelain -- records/seed/` = 0 lines; worktree status clean.

## Lane-environment notes for the orchestrator

1. server/src/store/LifecycleBypassAudit.test.ts in THIS worktree was repaired:
   the computable-lab symlink target is corrupted (contains a lane-2 exclude
   list, not TS — esbuild syntax error, fails at base full-suite). Replaced with
   a real copy of the healthy 184-line test (from wt/editor-2-lane1-20261004T030515).
   Path is lane-excluded (lane-exclude:119) so git stays clean. The corrupted
   computable-lab original was NOT touched — it poisons every other lane
   worktree's copy too (DOCINGEST-B, OLIGO-AI-*, CUE-EXEMPT-1 all carry the
   124-line exclude-list version). Recommend a separate housekeeping item to
   restore /mnt/vast/home/brad/git/computable-lab/server/src/store/LifecycleBypassAudit.test.ts.
2. Same symlink-lag class of issue affects server tsc in this worktree
   (oligoOrder.ts, sequenceRoutes.ts resolve to computable-lab, which lags
   trunk). Trunk typecheck is 0; merge verification should run tsc in
   cl-integration-1, not the worktree.

## Orchestrator-side remaining gates (worker never restarts :3092)

7-11 of the spec's verification bars: post-merge lane-stack restart, live GET/PUT
EQC-QUANTSTUDIO5 one-shot, exactly-once via list + POST /api/search/jsonld,
promotion commit + seed_record_promoted grep in /home/brad/.computable-lab-lane1/
worktrees/main, seed hash + code-repo status re-check.
