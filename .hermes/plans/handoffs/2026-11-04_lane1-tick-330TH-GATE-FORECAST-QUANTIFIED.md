# LANE 1 TICK 330TH — 2026-11-04 05:20–05:5x EST (10:20–10:5xZ)

One line: **No dispatch was lawful (both SHARED appliance-2 slots held by live lane-2 pairs ⇒ gate
ROTATION-DEFERRED rc 14), so the tick spent its budget turning the armed unit's fire prediction into
measured arithmetic: the earliest lawful fire instant, the single point of failure that could move it
past the 12:30Z deadline, and the exact recovery route if the unit expires.**

## Reconciled first-hand (cl-reconcile.sh 1 @ 05:20:11)

- Queue **todo 2 / in-progress 0 / superseded 1 / done 109**; `task-list.lock` FREE; **no PAUSE in either
  lane**; **no lane-1 `corpus-state.md`**; **no live lane-1 worker** ⇒ nothing to recover or adopt.
- Trunk `cl/integration-1` @ **faa4c87b** (= 5ed87e11 + the 329TH handoff doc, 1 path, **zero product
  paths**).
- Stack `:3092` 200 / `:5192` 200; **not restarted**. Exa tripwire: `OK — apiKey present and consistent
  across lane1/lane2/canonical`.
- Fleet (measured, not inherited): **slot-0 HELD** `L2-CHATHOST-CONSOLIDATE-1` launcher **3693103**
  claimed `10:11:52.898Z`, child **3693105** live (`hermes -p cl-coder`, 10m30s, 4.1% CPU);
  **slot-1 HELD** `L2-CLARIFY-TARGET-1` launcher **3600006** claimed `09:33:01.552Z`, child **3600008**
  live (49m21s, 3.8% CPU). Both are real lane-2 assignments (prompt text read from `/proc`), not stale
  pidfiles.
- Lane-2 queue: todo 5 / in-progress 3 / `corpus-state.md` **ACTIVE (SPECS-QUEUED)** ⇒ CORPUS PRIORITY
  (Brad 2026-11-02T17:05) still governs.

## Gate — ROTATION-DEFERRED (rc 14), measured at open AND at close

Own runs of `scripts/dispatch-window-1.py --rotation --item-severity HIGH` (05:20:2x, 05:21:4x):

| §4 check | result |
|---|---|
| 1 not paused / queue lock free | PASS |
| 2 item todo + `dispatched: none` + HIGH | PASS (`todo\|none\|none`) |
| 3 cadence | **FAIL** — `lane2_launches_since_filed=15` ✓ (need ≥4); `other_slot_continuous_hold=0h00m` (need ≥2 h) |
| 4 slot truth | **FAIL** — `free_slots=[] held_slots=[0,1]` |
| 5 lane 2 has a live coder | PASS (2) |

Checks 3 and 4 collapse to the same root cause: when BOTH slots are held, the script computes no "other
slot" (`single_free` false at :338), so the hold arm reads 0h00m by construction — that is the correct
reading here, not a measurement bug (verified by reading :336-352).

## The fire prediction, now arithmetic instead of inherited

Read from the launcher ledger (`~/.hermes/cl/coder-launches.jsonl`, 58 records; **all 28 exit records
carry `ended_at`**, so `slot_intervals`/`hold_start` are not fail-open on missing end times — checked
because a missing `ended_at` would have overstated hold):

- **slot-1 lane-2 occupancy chain start = `2026-11-04T09:33:01.552683Z`** (L2-CLARIFY-TARGET-1, still
  live). ⇒ 2 h completes at **`11:33:01.55Z` = 06:33:01 EST**. Handoff tolerance is 60 s
  (`HANDOFF_GAP_TOLERANCE`, :68), so a lane-2 re-claim within 60 s preserves the chain; a >60 s gap
  resets it.
- slot-1 timeline since 05:30Z: `05:30:41→08:18:08` CARD-1, gap 6m44s, `08:24:52→08:41:52`, gap 18m,
  `08:59:51→09:25:30`, gap 7m31s, `09:33:01→(live)` TARGET-1. Two of those three gaps exceeded the
  tolerance, i.e. the chain has reset twice today already.
- slot-0 is the churn slot: `07:01:31→09:11:36`, gap **14m00s**, `09:25:35→09:45:25`, gap **26m30s**,
  `10:11:52→(live)`. Measured over the last 5 h: slot-0 **free 36 %** (6 471 s of 18 000 s), slot-1
  free 11 %.

**Therefore:** the armed unit's earliest lawful fire is `11:33:01.55Z` (06:33:01 EST), and it needs only
one poll in which slot-0 is free — a state slot-0 has occupied 36 % of the last 5 h with 14–26 min
contiguous windows. That leaves a realistic window from 06:33 to the unit's 07:30 EST deadline.

## Single point of failure, named

The whole forecast hangs on **slot-1's 09:33 chain surviving to 11:33:01Z**. If `L2-CLARIFY-TARGET-1`
exits and lane 2 does not re-claim slot-1 within 60 s, the chain resets to the next claim and the next
2 h maturity moves to ~13:00Z — **past the 12:30Z deadline**. slot-0 cannot substitute: its own chains
have never survived past ~2 h 10 m before a 14–26 min gap.

This is a *timing* dependency, not a defect and not a reason to touch the gate. It is the concrete
input to the 06:53 EST Brad-card filing decision (due only if the gate is still unmet then).

## Expiry / recovery path (verified this tick, so the next tick does not have to re-derive it)

- `lane-watchdog.timer` (fires ~every 10 min, last 05:20:50) runs `lane-watchdog.py`, which **has no
  armed/re-arm logic** (`grep armed|re-arm|systemd-run` → only the generic tick-kick at :227). So if the
  armed unit exits `BUDGET-EXPIRED` (exit 8) at 07:30 EST, **nothing re-arms it automatically**; the
  next lane-1 orchestrator tick must.
- Re-arm is a one-command restore of the current unit shape — `Type=simple`, `CollectMode=inactive-or-failed`,
  `ExecStart=/bin/bash /home/brad/.hermes/cl/lanes/1/scripts/armed-dispatch-recordlock-l1t0220.sh`,
  `WorkingDirectory=!/home/brad`, i.e.
  `systemd-run --user --collect --unit cl-l1-armed-dispatch-<HHMM> /bin/bash /home/brad/.hermes/cl/lanes/1/scripts/armed-dispatch-recordlock-l1t0220.sh`.
- **Expiry is not fatal to the repair**: the gate is stateless and re-evaluates on the next poll, so a
  re-armed unit fires the moment a 2 h lane-2 chain and a free slot coincide. Cost of expiry ≈ one tick
  interval, not the item.
- Current unit: `cl-l1-armed-dispatch-0228.service`, ActiveState **active/running**, MainPID **3297306**,
  since 02:24:15 EST, `Result=success`; 241 gate polls logged, **last 40 all `rc=14 ROTATION-DEFERRED`**,
  last poll 05:21:40 ⇒ polling healthy at 45 s.

## Armed kit ground truth — NOT-FIRED (unchanged)

`scripts/verify-leg1-fired.sh` @ 05:20:51: `START_RECORDS=0` (no launcher record since 07:24:00Z),
worktree `cl/lane1-recordlockguard-1-l1t2010` @ **12becda1**, **0 commits ahead of trunk**, **product diff
none**, unit active ⇒ **NOT-FIRED**. Trunk moved 5ed87e11 → faa4c87b by one docs path only, so the armed
script's GUARD4 (`git diff --name-only $KIT_SHA..HEAD -- . ':!.hermes/plans'`) is still empty and its
ff-only pre-fire step remains safe (`12becda1` is an ancestor of faa4c87b — checked).

## Rule-2 ledger

`git diff --name-only 5ed87e11..faa4c87b` = **1 path, `.hermes/plans/handoffs/` only**; non-plans diff
empty ⇒ **all 12 claims-ledger rows stand unchanged**; `/record` lock row stays
**UNVERIFIED-and-DEFECTIVE** (that is what L1-RECORD-LOCK-GUARD-1 repairs). No re-derivation needed
beyond this statement.

## Due blockers — NONE

- `L1-PARAMS-EMITTER-RIDER` — RIDER-TRIGGERED, trigger **UNMET (36th tick)**: `git log -1 --
  scripts/fame-gatefix/` still `136a3d27` @ 2026-11-02 17:09:38.
- `FAME-1B-BACKFILL` — `status: done`. No open Brad holds.
- Brad card 06:53 EST — still a FUTURE obligation (draft at
  `~/.hermes/cl/lanes/1/2026-11-04_l1-brad-card-L1-RECORD-LOCK-GUARD-1-DRAFT.md`, refreshed by the 329TH);
  **not filed** — it is due only if the gate is unmet at 06:53.

## State left behind

No coder dispatched, no slot claimed, no product code, no merge, no data write, no stack restart, no
task-status change (**todo 2 / in-progress 0 / superseded 1 / done 109**). Armed unit **active**.
Brad card still **DRAFT**.

## Next actions (ordered)

1. `scripts/verify-leg1-fired.sh` **first**, every tick — never the armed log's wording.
   - **FIRED** → stamp the queue claim under `task-list.lock`; reconcile commits; run bars 1/1b/1c/1d/2 +
     `server tsc` rc 0 + `app tsc` 21; dispatch `cl-adversarial-reviewer`; merge only on ACCEPT; restart
     the lane stack; then `python3 scripts/restamp-leg2-l1.py --sha <merge-sha> --apply-tasklist`.
   - **NOT-FIRED and unit active** → do nothing (the unit owns the claim); post-fire ownership stamping
     is still the open obligation (cl-coder-launch.py never touches task-list.md).
   - **NOT-FIRED and unit gone (exit 8)** → re-arm with the exact `systemd-run` shape above, then file the
     Brad card if 06:53 has passed.
2. A spot check worth doing at ~06:35: confirm the fire prediction instead of assuming it — `hold_start`
   for slot-1 lane-2 should read ≥2 h, and the tick must confirm a free slot existed at some poll between
   11:33:01Z and the poll it examines.
3. Do not pre-stamp the queue: GUARD2 requires exactly `todo|none|none`.

## Close-of-tick addendum (05:2x EST)

- Trunk is now `894824c8` = `faa4c87b` + this handoff document (1 path, `.hermes/plans/` only). GUARD4's
  pathspec excludes `.hermes/plans`, so it stays empty; the ff-only pre-fire step stays safe.
- Task-list transaction completed under `task-list.lock` with temp+rename (no `open('w')`); post-write
  reconcile: **todo 2 / in-progress 0 / superseded 1 / done 109**, and GUARD2's own parse of
  `L1-RECORD-LOCK-GUARD-1` still reads `todo|none|none` (the armed unit cannot be knocked out of
  eligibility by the tick record).
- At close: slot-0 still `L2-CHATHOST-CONSOLIDATE-1` (3693103), slot-1 still `L2-CLARIFY-TARGET-1`
  (3600006); unit `cl-l1-armed-dispatch-0228.service` active, MainPID 3297306.
