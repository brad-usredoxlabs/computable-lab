# LANE 1 TICK 307TH HANDOFF — 2026-11-03 21:01 → 21:2x EST

One line: **no fleet dispatch again — CORPUS PRIORITY, measured this time by a new reproducible prober
instead of by hand.** Lane 2 carries 5 todo + 3 in-progress + an ACTIVE `corpus-state.md`
(prompt-2 SPECS-QUEUED), so lane 1 does not claim the slot-0 that freed mid-tick. The tick spent its budget
on the *dispatch kit* rather than on another readiness note: I audited the architect's split-parallel ruling
against the leg-1 prompt myself, re-measured the RED baseline against the served build, re-derived the claims
ledger, and removed the per-tick trunk-stamp churn from the prompt. No product code, no merge, no stack
restart, no data write, no task-status change, no slot claimed.

## Reconciled first-hand (`cl-reconcile.sh 1` @ 21:01)

- Queue: **todo 3 / in-progress 0 / done 108**. `task-list.lock` FREE. Neither lane paused.
- Lane-1 `corpus-state.md` **absent** ⇒ the corpus loop still governs lane 2 only.
- No live lane-1 worker, no interrupted work ⇒ nothing to recover, no resume candidate.
- Trunk `cl/integration-1` @ **cfdc904f** (2 docs commits past 8d722d17: f92fce54, cfdc904f — both 306TH docs).
- Stack `:3092` 200 / `:5192` 200; served HEAD **cfdc904fd0af == trunk HEAD** (pid 954410 → cwd → git HEAD).
- Both SHARED slot locks at reconcile: slot-0 HELD (L2-CLARIFY-CARD-1 launcher 2583797), slot-1 HELD
  (CHATHOST-CONSOLIDATE-1 launcher 2583809).

## Capacity — measured twice, and the measurement moved

`scripts/dispatch-window-1.py` (new this tick, see below) at 21:0x:

| probe | 21:01 (reconcile) | 21:08 (prober) |
|---|---|---|
| shared slot-0 | HELD (L2-CLARIFY-CARD-1) | **FREE** (that coder exited mid-tick) |
| shared slot-1 | HELD (CHATHOST-CONSOLIDATE-1) | HELD |
| lane-2 queue | — | todo 5, in-progress 3, corpus-state **ACTIVE** SPECS-QUEUED |
| verdict | — | **BLOCKED-CORPUS (exit 10)** |

CORPUS PRIORITY (Brad 2026-11-02T17:05) binds on lane-2 *dispatchable work*, not on a live lane-2 tick: lane 2
has eight items to serve, so the slot that just freed is lane 2's to claim, not mine. (AS-L1T306-1 still holds.)

## What the tick produced — first-hand, not inherited

1. **New tool: `~/.hermes/cl/lanes/1/scripts/dispatch-window-1.py`** — one reproducible verdict per tick
   (exit 0 eligible / 10 corpus / 11 no-slot / 12 paused / 13 no-item). It encodes what three ticks re-derived
   by hand, including the trap that has already cost a tick: **slot truth is `flock` on the SHARED locks
   `~/.hermes/cl/appliance2-coder-slot-{0,1}.lock`; the per-lane copies under `lanes/N/` always probe FREE.**
   `--selftest` PASSES and prints the live disagreement (4/4 per-lane copies FREE while a shared lock was HELD).
   It lives in the lane runtime dir, NOT the repo — no product-tree commit from the orchestrator.

2. **Dispatch kit audited against the ruling, file-for-file.** I read
   `.hermes/plans/2026-11-03_l1-recordlock-dispatchshape-ruling.md` (161 lines, ends `RULING: split-parallel`)
   and the leg-1 prompt against it:
   - boundary matches ruling §1 LEG 1 exactly — meta-schema, `lifecycle/types.ts`,
     `LifecycleEngine.contentLockedStates()`, `LifecycleHandlers` echo, the FOUR lifecycle YAMLs,
     `store/types.ts` `RecordStoreConfig`, `RecordStoreImpl` no-op + resolver, **all three** `createRecordStore`
     sites, `RecordHandlers.ts:1139` consumer; nothing from `app/`;
   - AM-1..AM-10 binding, with the mandatory pins AM-6 (a)(b)(c), AM-9 (d)(e)(f) and the AM-10 production-wiring
     pin all named; S1/S2/S4 sequencing verbatim; S3 named as the orchestrator's resume condition;
   - the AM-3 transition-swallow trap stated as non-negotiable in both halves.
   **Anchors still resolve at cfdc904f** (checked by reading them, not by grep -q): `RecordHandlers.ts:1139`
   still carries the literal `['approved','effective','superseded','archived']` (so leg 1 must divest it — the
   prompt's ":1139 consumer" instruction is exactly that work, and it is inside leg-1's grep-gate scope);
   `RecordStoreImpl.ts:285-290` `contentLockError` + its `:744-745` call; `server.ts:527` already passing a
   config object literal (the `appendOnlyKinds` precedent for one more key); and
   `RecordRegistryPage.tsx:554-560` still holding the old `approved`/`effective` pair that leg 2 rewrites.

3. **Trunk-stamp churn removed from the prompt** (root cause of the 305TH/306TH re-pin ritual): the stamp is now
   `cfdc904f` **plus a self-verifying instruction** — "RE-VERIFY AT DISPATCH: `git diff --name-only
   cfdc904f..HEAD -- app server schema scripts` must print NOTHING". Docs commits can keep advancing HEAD
   without invalidating the kit. Proven this tick: `11338a3a..HEAD` = **20 commits, ZERO paths outside
   `.hermes/plans/`**, and `a7ab041e..HEAD` is EMPTY even including plans.

4. **RED baseline re-measured against the live lane stack** (`scripts/pregate-recordlock-1.py --expect-red`):
   served HEAD `cfdc904fd0af` == trunk HEAD, `contentLockedStates` **ABSENT 7/7** ids, `disk=[]` 7/7 YAMLs,
   `expect-red: AS EXPECTED`, rc=0. The pre-merge baseline survives the trunk move.

5. **Pre-warmed worktree verified usable** `wt/L1-RECORD-LOCK-GUARD-1-lane1-l1t2010` @ a7ab041e: clean tracked
   tree (only untracked `node_modules` mirrors), product tree identical to trunk ⇒ no rebase, no install.

6. **Rule-2 claims-ledger freshness re-derived at cfdc904f** (307TH block appended): 20 commits since the
   RE-GATE anchor, zero non-plans paths; row 1 re-proved on reachability (same 3-file `app/src/analysis` delta
   +1089/-60, **zero** non-test `cssRuleScan` importers, `AnalysisPage.css` blob `c6930c66…` at both ends).
   All twelve quotable rows stand. The `/record` lock row remains **UNVERIFIED-and-DEFECTIVE**.

## Due blockers checked

- **L1-PARAMS-EMITTER-RIDER** — trigger STILL UNMET: `git log -1 -- scripts/fame-gatefix/` = `136a3d27`
  @ 2026-11-02 17:09:38. No re-mint since FAME-8 closed. Not dispatchable; must not open a cycle.
- **FAME-1B-BACKFILL** — Brad HOLD A-L1T229-3 standing; live re-read of `GET /api/records/ACQP-000006`
  confirms `payload` still has **NO** `acquisitionStatus`. Not executed, not re-asked.
- **B-L1T306-1** (LONG-vs-corpus starvation) — **RESOLVED yesterday**: superseded by `RULING: split-parallel`;
  leg 1 is now one PARALLEL slot, so lane-2 corpus work no longer blocks lane-1 progress by shape. Only the
  ordinary slot+priority gate remains, now measured by the prober.
- **Exa tripwire**: OK — apiKey present and consistent across lane1/lane2/canonical.

## Next actions (ordered, for the next wake)

1. `python3 ~/.hermes/cl/lanes/1/scripts/dispatch-window-1.py` — dispatch ONLY on `DISPATCH-ELIGIBLE` (exit 0).
2. On eligible, fire leg 1 **immediately** (it is one PARALLEL slot, so a window can exist at any tick):
   `python3 /home/brad/.hermes/cl/scripts/cl-coder-launch.py --lane 1 --item L1-RECORD-LOCK-GUARD-1
   --worktree /mnt/vast/home/brad/git/wt/L1-RECORD-LOCK-GUARD-1-lane1-l1t2010
   --prompt /home/brad/.hermes/cl/lanes/1/prompts/coder-L1-RECORD-LOCK-GUARD-1-LEG1-l1t2105.txt
   --log /home/brad/.hermes/cl/lanes/1/logs/coder-RECORD-LOCK-GUARD-1-LEG1-l1t<HHMM>.log --mode parallel`
   run in the background with `systemd-run --user --collect` (a `-z` tick's plain children die at tick exit).
   Exit 75 = busy/paused, retry later. Item goes in-progress on dispatch.
3. On `RECORD-LOCK-GUARD-1-LEG1 DONE <sha>`: adversarial review (different model family) → my own diff +
   server bars + tsc → merge leg 1 → `cl-lane-stack.sh 1 restart` (lifecycle YAML changed) →
   `pregate-recordlock-1.py` expect-GREEN on all seven ids → **only then** stage and dispatch leg 2 (S3).
   Acceptance is graded ONCE after both legs (S1) and the master four-state grep gate runs after leg 2 only (S2).

## Assumptions recorded

- AS-L1T307-1: the prober's `BLOCKED-CORPUS` reading treats lane-2 todo/in-progress counts as "dispatchable",
  even when a given item may itself be blocked. That is the conservative reading of Brad's corpus directive and
  the one every prior tick applied; it can only delay a lane-1 claim, never cause a wrongful one.
- AS-L1T307-2: a docs-only commit does not stale a dispatch kit as long as `git diff --name-only <stamp>..HEAD
  -- app server schema scripts` is empty — the prompt now checks this itself instead of the orchestrator
  re-pinning each tick.
- AS-L1T307-3: slot-0 going FREE mid-tick is lane 2's to claim under corpus priority; I did not take it.

## Tick close

No worker ever live; nothing to checkpoint. Lane 2 still holds first refusal on fleet capacity. Served build
current at cfdc904f; nothing restarted for a docs commit.
