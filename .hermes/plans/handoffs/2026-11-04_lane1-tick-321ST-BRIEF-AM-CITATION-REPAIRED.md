# LANE 1 TICK 321ST HANDOFF — 2026-11-04 01:20 → 01:4x EST

One line: **no lawful dispatch again (both shared slots flock-HELD by live lane-2 coders at open and at close,
corpus priority), so the tick repaired a REAL dispatch-readiness defect in BOTH coder briefs: the LEG-1 brief sent
the coder to an "AM-1..AM-10" binding block when AM-11 — the anti-fail-open placement rule this lane spent three
ticks establishing — sits after it, and cited a non-existent "AM-14".**

## Reconciled first-hand

- `cl-reconcile.sh 1` @ 01:20:09: queue **todo 2 / in-progress 0 / done 109**; `task-list.lock` FREE; **no lane-1
  PAUSE, no lane-2 PAUSE**; **no lane-1 `corpus-state.md`**; **no live lane-1 worker** ⇒ nothing to recover, no
  duplicate-writer risk.
- Stack: `:3092` = 200, `:5192` = 200; served backend pid **954410**, `/proc/954410/cwd` →
  `/mnt/vast/home/brad/git/cl-integration-1/server`, that checkout's HEAD = **trunk HEAD = 9ab8bb07** (asserted by
  the pregate's own served-revision block, not inferred).
- Trunk `cl/integration-1` arrived at **9ab8bb07** (the 320TH's handoff commits; `.hermes/plans/` only).
- **Exa key tripwire RAN**: OK — apiKey present and consistent across lane1/lane2/canonical.
- Due blocker **L1-PARAMS-EMITTER-RIDER**: trigger still UNMET — `git log -1 -- scripts/fame-gatefix/` =
  `136a3d27` @ 2026-11-02 17:09:38 (29th consecutive tick unchanged). Not opened.
- Due blocker **FAME-1B-BACKFILL**: Brad HOLD A-L1T229-3 still standing; no new Brad-authored activity (commit
  authors since 2026-11-03 20:00 are the agent identities only). Not opened.

## Capacity — measured, not inherited (this is why lane 1 dispatched nothing)

- `flock -n` on BOTH shared locks `~/.hermes/cl/appliance2-coder-slot-{0,1}.lock` = **HELD**, and the holders are
  live lane-2 launchers, not stale pidfiles:
  slot-0 = `L2-CHATHOST-CONSOLIDATE-1` launcher **3123886** (18:18 elapsed at open, `--mode parallel`);
  slot-1 = `L2-CLARIFY-CARD-1` launcher **3047532** (52:43, hermes child **3047534** alive, fix-4 round).
- Lane 2 also had a **live orchestrator tick** (pid 3086508) at open.
- Lane-2 `corpus-state.md`: prompt-1 WORKS, **prompt-2 SPECS-QUEUED (active, non-WORKS)**, prompts 3-8 LOCKED
  ⇒ a dispatchable corpus-loop action is pending a free slot ⇒ **CORPUS PRIORITY (Brad 2026-11-02T17:05)** binds:
  lane 1 does not claim a fleet slot. No lane-1 claim was lawful at any point in this tick.

## FINDING — the LEG-1 brief's citation to its own binding block was stale, in the paragraph that governs the fix

Measured at 9ab8bb07 in `prompts/coder-L1-RECORD-LOCK-GUARD-1-LEG1-l1t2255.txt` (23,653 B, md5 `6a0854b1…`):

1. Line 49 told the coder to read `"READ FIRST — ORCHESTRATOR AMENDMENT (AM-1..AM-10)"` as the BINDING block.
   The spec now carries **AM-1..AM-11**, and **AM-11 is the amendment that fixes the no-op's PLACEMENT** (it must
   sit immediately before `serializeRecord`, i.e. after all four typed rejection walls). A coder that takes the
   parenthetical literally stops one amendment short of the only rule that prevents it from re-introducing the
   third fail-open surface the 320TH closed. Line 36 carried the same stale range.
2. Line 105 cited **"(AM-14)"** for the declared-set resolver's fail-open. **AM-14 does not exist** — the spec's
   amendments end at AM-11. The label is inherited from
   `.hermes/plans/2026-11-03_l1-recordlock-policy-copies-ruling.md:119` and two handoffs (315TH:47, 317TH:41), so
   the dangling citation is corpus-wide, not a one-off typo in the brief. The SUBSTANCE is correct and is stated
   in AM-1 item 3 (`undefined` when the lifecycle is not loaded ⇒ fail-open, mirroring `terminalStates()`) and
   restated in AM-10 line 148.
3. The LEG-2 staged brief had the same `(AM-1..AM-10)` range at line 41.
4. Verified the substance rather than assuming it: `grep -o "AM-[0-9]*"` over the spec = `AM-1 … AM-11`; over the
   LEG-1 brief before the fix = `AM-1,2,3,5,6,8,9,10,14` — i.e. **AM-11 was cited nowhere in the brief by number**
   (its content is present as the "SECOND trap" section, but not as a reference the coder can look up).

## APPLIED (brief text only — zero product code, zero criterion/boundary/token change)

- LEG-1 line 36: `AM-1..AM-10` → `AM-1..AM-11`.
- LEG-1 line 49: `"…(AM-1..AM-10)" block FIRST` → `"READ FIRST — ORCHESTRATOR AMENDMENT" block FIRST (AM-1..AM-11
  — AM-11 is the LAST amendment and it governs the no-op's PLACEMENT, so read it before you write any code)`.
- LEG-1 line 105: `(AM-14)` → `(AM-1 item 3 — the resolver's explicit undefined-when-not-loaded fail-open;
  restated in AM-10)`.
- LEG-2 line 41: `(AM-1..AM-10)` → `(AM-1..AM-11; AM-11 is leg 1's placement rule and states the append-only/seed
  invariants your leg must not regress)`.
- New pins: LEG-1 `6a0854b17ff99329e1cc0a0b662ba4f5` (23,653 B) → **`6ceddf7ddfaae09cf32fa97b77a380df` (23,856 B)**;
  LEG-2 `76c5f783958708aca19741c687dc9432` (13,396 B) → **`1e473afb3c0665c3f485e5da6521b0b9` (13,501 B)**.
  LEG-2's `<leg-1-merge-sha>` guard is STILL a literal placeholder (2 occurrences) ⇒ still fail-closed.
- `grep -n "AM-14\|AM-1\.\.AM-10"` over both briefs now returns **none**.
- The superseded 320TH pins are recorded, not erased: they remain in handoff 320TH, in trunk commits
  `aa35da2d`/`8d258ba9` messages, and in the list's 320TH block. This handoff is the supersession.

## Readiness re-proved at 9ab8bb07 (fresh, this tick — the dispatch kit is fire-ready)

- **RED pre-gate, live on `:3092`**: `pregate-recordlock-1.py --expect-red` → served HEAD = trunk HEAD =
  `9ab8bb07`, `contentLockedStates` **ABSENT 7/7** ids (disk `[]` 7/7), `expect-red: AS EXPECTED`, rc 0.
- **BAR 1d re-run by me** in the pre-warmed LEG-1 worktree at HEAD `9ab8bb07`: `vitest run src/store src/scripts
  src/integration/W25CandidateImmutability.test.ts src/api/handlers/RecordHandlers.seedPromotion.test.ts`
  ⇒ **9 files / 99 tests PASSED, 4.37 s** (matches the 320TH's 4.68 s at the same product tree).
- Worktree `wt/L1-RECORD-LOCK-GUARD-1-lane1-l1t2010`, branch `cl/lane1-recordlockguard-1-l1t2010`:
  HEAD = `9ab8bb07` = trunk HEAD, **0 commits behind**, tracked tree CLEAN (untracked `node_modules`,
  `server/node_modules` only), `merge-base --is-ancestor 8708d595 HEAD` = YES,
  `git diff --name-only 8708d595..HEAD -- app server schema config scripts` = **0 paths**, and
  `git diff --name-only f16bea49..HEAD -- . ':!.hermes/plans'` = **0 paths** (trunk moved docs-only).
- All four READ FIRST files resolve in the worktree (dispatchshape ruling, policy-copies ruling, spec, policy
  decision).

## Rule-2 ledger

`f16bea49..HEAD` non-plans diff = **0**, so the 320TH's re-derivation at `f16bea49` transfers unchanged to
`9ab8bb07`: ancestors YES ×7, `d6572be6..HEAD` non-plans 0, `AnalysisPage.css` blob `c6930c66`, zero non-test
`cssRuleScan` importers ⇒ all 12 quotable rows stand. The `/record` lock + write-immutability row stays
**UNVERIFIED-and-DEFECTIVE** until both legs land and the browser gate passes on `:5192`.

## Not done, and why

No coder (no lawful slot — corpus priority, measured twice), no spec composition (both open items are already
specced and prompted; nothing approved-and-unspecced exists), no adversarial review (no coder delta), no paperwork
run (no evidence-trail defect open), no browser gate (no lane-1 UI obligation; the one local vision slot is not
lane 1's under corpus priority), no product merge, no data write, no stack restart, no task status change
(todo 2 / done 109).

**Assumption AS-L1T321-1**: the brief-range correction is an orchestrator-resolved detail under the 2026-11-02
approval directive — it changes no acceptance criterion, boundary, token or product intent; it makes the coder's
pointer match the spec I already committed (AM-11, trunk `f16bea49`). If the architect prefers the ruling's
"(AM-14)" label to be kept as-is, the only place to change it is the two briefs, and no product code has been
written against either.

## Next actions (ordered)

1. Next tick: re-check capacity first-hand (flock on the two SHARED locks + launcher liveness + lane-2
   `corpus-state.md`). On a free slot with lane 2 served, fire **LEG 1** with
   `cl-coder-launch.py --lane 1 --item L1-RECORD-LOCK-GUARD-1 --worktree
   /mnt/vast/home/brad/git/wt/L1-RECORD-LOCK-GUARD-1-lane1-l1t2010 --prompt
   /home/brad/.hermes/cl/lanes/1/prompts/coder-L1-RECORD-LOCK-GUARD-1-LEG1-l1t2255.txt --mode parallel`
   (pin md5 **6ceddf7d…**); bars to expect: **1, 1b, 1c, 1d, 2 + server tsc rc 0 + app tsc 21**.
2. On LEG 1 `DONE`: adversarial ACCEPT → own diff + all five bars + server `tsc` → merge →
   `cl-lane-stack.sh 1 restart` (background) → `pregate-recordlock-1.py` expect-GREEN → stamp the merge sha into
   the LEG-2 brief's `<leg-1-merge-sha>` (2 placeholders) and re-pin its md5.
3. LEG 2: dispatch (BAR 2c required); S2 shape-scan rc 0 with only the `DocumentControlBar.tsx:58-61` display
   hull; `probe-recordlock-2.py --live`; browser re-gate on the exact served revision of `:5192`; the item stays
   in-progress until `VERDICT: accept`.
4. Dispatch readiness is now CLOSED as a work class: kit re-proved, both briefs' citations repaired. Future ticks
   should spend on capacity observation and due-blocker triggers only, not on further kit archaeology.

## Close of tick (measured after the commit)

This handoff was committed to trunk as **`e983afc2`**, so at close trunk HEAD = `e983afc2` while the **served**
backend (pid 954410) still runs `9ab8bb07`. The gap is my own `.hermes/plans/` commit only:
`git diff --name-only 9ab8bb07..e983afc2 -- app server schema config scripts` = **0 paths**, so the served build
IS the product tree the kit was proved against and no restart is owed. The pregate's equality assertion will read
`served HEAD != trunk HEAD` until the next docs-only advance — that is expected, and the fail-safe form (product
diff, not sha equality) is what the LEG-1 brief asks the coder to check.
