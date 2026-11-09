# LANE 1 TICK 325TH — 2026-11-04 08:00Z–08:15Z (03:00–03:15 EST)

One line: **No dispatch was possible or lawful (both shared fleet slots HELD by live lane-2 corpus coders), so the tick
verified the armed dispatcher first-hand, found and mitigated a real duplicate-dispatch hazard in its evidence trail,
and corrected a stale "due blocker" that three consecutive handoffs had been carrying as live.**

## Reconciled first-hand

- `cl-reconcile.sh 1` @ 03:00:10: queue **todo 2 / in-progress 0 / superseded 1 / done 109**; `task-list.lock` FREE;
  **no PAUSE in either lane**; no lane-1 `corpus-state.md`; no live lane-1 worker ⇒ nothing to recover or adopt.
- Stack: `:3092` 200, `:5192` 200 (pids 954410 / 953556); trunk `cl/integration-1` @ `6b7a9d45`; no tracked
  modifications. Exa tripwire: `OK — apiKey present and consistent across lane1/lane2/canonical`.
- Lane 2: **todo 5 / in-progress 3**, `corpus-state.md` ACTIVE (prompt-2 SPECS-QUEUED) ⇒ CORPUS PRIORITY
  (Brad 2026-11-02T17:05) still bars a lane-1 slot claim, independently of capacity.
- Capacity measured on the SHARED locks, not inherited: `slot-0` HELD `CHATHOST-CONSOLIDATE-1` launcher 3246602
  started 07:01:31Z, child 3246604 alive 1 h 02 m at 4.3 % CPU; `slot-1` HELD `L2-CLARIFY-CARD-1` launcher 3047532
  started 05:30:41Z, child 3047534 alive 2 h 33 m at 3.5 % CPU. Both genuinely working, neither wedged.

## FINDING 1 — the armed dispatcher's evidence trail could cause a DOUBLE DISPATCH (mitigated, not edited)

The 324TH armed `scripts/armed-dispatch-recordlock-l1t0220.sh` (unit `cl-l1-armed-dispatch-0228.service`, alive since
02:24:15, still polling every 45 s, last verdict `ROTATION-DEFERRED` rc 14, **zero launches**). I audited it rather
than trusting the handoff, and one guard is semantically wrong:

`cl-coder-launch.py` **blocks on `child.wait()` and returns the CHILD CODER's exit code** (`cl-coder-launch.py:98-106`).
The armed script calls it through `systemd-run` **without `--no-block`**, so its `LRC=$?` is the coder's exit status
after the coder *finishes* — not a launch code. Consequences:
- `rc=0` ⇒ "ARMED DONE — LEG 1 dispatched at <time>" where the timestamp is the coder's **end**, not its start;
- `rc!=0 && rc!=75` ⇒ logs **"launcher refused (rc=N) -> exit 7"** even though the coder RAN. A later tick trusting
  that line could conclude LEG 1 never fired and re-dispatch into the same worktree (duplicate writer).

Mitigation applied (no edit to the running script — `bash` reads scripts lazily, so editing a live script can corrupt
execution):
1. **`scripts/verify-leg1-fired.sh`** (new, `bash -n` clean, executed): ground truth from (a) `coder-launches.jsonl`
   start/exit records for this item since the arm timestamp, (b) the systemd unit's `ActiveState/Result/ExecMainStatus`,
   (c) the worktree branch vs trunk and its product diff. Verdicts: FIRED / AMBIGUOUS / NOT-FIRED.
2. **Semantic warning appended** to `armed-dispatch-l1t0220.log` so the rule sits next to the lines it governs.

**Measured result at 03:03:46 — NOT-FIRED**: 0 launcher start records; worktree branch
`cl/lane1-recordlockguard-1-l1t2010` @ `12becda1`, 0 commits above trunk, product diff none; unit active/running.

Also verified first-hand that the other guards are real, not fail-open: `/home/brad/.hermes/cl/lanes/{1,2}/logs` both
exist (so G5's `find` actually scans files), LEG-1 prompt md5 = `6ceddf7ddfaae09cf32fa97b77a380df` (matches the pin),
worktree `node_modules` present, prober `scripts/dispatch-window-1.py` present.

## FINDING 2 — a stale blocker three handoffs carried as live (corrected)

The 324TH (and 306TH/315TH/320TH) "Due blockers" section lists **FAME-1B-BACKFILL: Brad HOLD A-L1T229-3 standing**.
It is not standing. `task-list.md:12019` reads **`status: done`** — the 308TH tick (2026-11-03T21:2x) EXECUTED and
VERIFIED it (9 records stamped, readback receipts), lifting the hold on repo evidence and recording AS-L1T308-1.
⇒ **Lane 1 has NO due blockers at this HEAD.** Its only open items are:
- `L1-PARAMS-EMITTER-RIDER` — `status: todo`, **trigger-gated** by design ("must never justify a gate cycle on its
  own"; rides the next re-mint under `scripts/fame-gatefix/`). Trigger still not met.
- `L1-RECORD-LOCK-GUARD-1` — `status: todo`, armed as above.

## Gate arithmetic (why the armed window is still plausible)

Only ONE transition satisfies §4 while both slots are busy: **slot-0 frees while slot-1 stays HELD**. Check 3's
"other slot held ≥ 2 h" is already satisfied by slot-1 (2 h 33 m and climbing); check 4 needs `free_slots=[0]`.
Slot-0's coder is 1 h 02 m in, so an exit before the 07:30 deadline is realistic. If slot-1 frees first, check 3
fails; if both free, check 4 fails (strict B). The 45 s poll is the minimum cadence that can catch the window.

## Readiness re-proved at the current HEAD (my own runs, not the handoff's)

- Worktree `wt/L1-RECORD-LOCK-GUARD-1-lane1-l1t2010` @ `12becda1`: **BAR 1d = 9 files / 99 tests PASSED** (6.58 s),
  run by me at 03:04:11 — also proves the pre-warmed worktree's `node_modules` still works.
- Product tree continuity: `git diff --name-only 42df75eb..6b7a9d45 -- app server schema config scripts` = **0 paths**.
- **Rule 2 (claims ledger)**: independently re-derived `git diff --name-only 348137c0..HEAD -- . ':!.hermes/plans'`
  = **0 paths** ⇒ all 12 quotable rows stand. The 324TH's freshness block is already written at `6b7a9d45`; this
  tick's only commit is docs-only (`.hermes/plans`), so a **one-line HEAD-independent addendum** was appended rather
  than restating row verdicts. The `/record` lock + write-immutability row
  stays **UNVERIFIED-and-DEFECTIVE**; its ENVIRONMENT FACT stays FALSIFIED on that surface.

## Brad card — due 06:53 EST, filing cadence measured

Draft `2026-11-04_l1-brad-card-L1-RECORD-LOCK-GUARD-1-DRAFT.md` is accurate on the item and the gate table. One
precision correction recorded here (draft not rewritten): it says the card is filed "at that instant", but lane-1 ticks
run on `*/20 * * * *` (measured from `profiles/orchestrator/cron/jobs.json`) ⇒ the file that actually files it is the
**07:00 EST tick** (06:53 + 7 min), unless the armed dispatcher fires first. Both paths are live; neither needs a human.

## Assumptions recorded

- **AS-L1T325-1**: the armed log's `launcher rc` is the coder's exit code (proved by reading `cl-coder-launch.py`).
  Future ticks must use `scripts/verify-leg1-fired.sh`, never the log's wording, to decide whether LEG 1 fired.
- **AS-L1T325-2**: the mandatory card lands at the 07:00 EST tick, not at the 06:53 due instant, because filing is
  tick-driven; the 7-minute lateness is within the ruling's intent and is recorded rather than papered over.
- **AS-L1T325-3**: FINDING 2 is a paperwork correction only. FAME-1B-BACKFILL's data result is unchanged and was not
  re-executed this tick.

## Next actions (ordered)

1. **Before anything else**, run `scripts/verify-leg1-fired.sh`. If it says **FIRED**: reconcile the coder's commits,
   run all five bars (1/1b/1c/1d/2) + server `tsc` rc 0 + app `tsc` 21 myself, require adversarial ACCEPT, merge
   `--no-ff`, `cl-lane-stack.sh 1 restart` (background), pregate expect-GREEN, then stamp the merge sha into LEG-2's
   two `<leg-1-merge-sha>` placeholders and re-pin its md5. If **NOT-FIRED**, proceed to step 2.
2. If the unit is still `active` at 06:53 EST, **file the Brad card** from the draft (07:00 tick does it).
3. Do not launch a lane-1 coder by hand while `cl-l1-armed-dispatch-0228.service` is active; the launcher's slot +
   worktree ownership is only the backstop, not the plan.
4. Do not re-open FAME-1B-BACKFILL: it is done. Do not open a cycle for the rider.
