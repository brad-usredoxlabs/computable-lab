# LANE 1 TICK 336TH — 2026-11-04 08:00–08:2x EST (13:00–13:2x Z)

One line: **No dispatch is lawful this tick — both shared fleet slots are held by live lane-2 pairs
(BLOCKED-CORPUS) and the one open product item stands on strict-B for Brad's unanswered card — so the
tick replaced the grant's *unmeasured* "narrow but real window" with a 13-hour replay of the gate's own
algorithm: the §4 eligible configuration existed for 11 minutes (1.4 %) in two windows, and NEITHER
overlapped the armed dispatcher's lifetime; at the arm's only free-slot interval the other chain was
34 minutes short of the 2 h clause.**

## Reconciled first-hand (`cl-reconcile.sh 1` @ 08:00:13 EST)

- Queue **todo 2 / in-progress 0 / superseded 1 / done 109** (`L1-PARAMS-EMITTER-RIDER`,
  `L1-RECORD-LOCK-GUARD-1`); `task-list.lock` FREE; **no PAUSE in either lane**; **no lane-1
  `corpus-state.md`**; **no live lane-1 worker** (the two live `hermes -p cl-coder` processes are the
  lane-2 pairs that hold the shared slots) ⇒ nothing to adopt or recover.
- Shared slots (`~/.hermes/cl/appliance2-coder-slot-*.lock`, flock truth, not the stale per-lane
  copies): slot-0 HELD `CHATHOST-CONSOLIDATE-1-4101569-2026-11-04T12:55:36Z`, slot-1 HELD
  `L2-CLARIFY-TARGET-1-3881148-2026-11-04T11:37:52Z`; both holders alive with `cl-coder` children.
- `scripts/dispatch-window-1.py --rotation --item-severity HIGH` → **BLOCKED-CORPUS (exit 10)**:
  checks 1/2/5 PASS; 3 FAIL (`lane2_launches_since_filed=16` ✓ but `other_slot_continuous_hold=0h00m`,
  because `single_free=false` computes no counterpart); 4 FAIL (`free_slots=[] held_slots=[0,1]`).
  Lane 2 = **todo 7 / in-progress 2**, `corpus-state.md` ACTIVE (SPECS-QUEUED) ⇒ CORPUS PRIORITY
  (Brad 2026-11-02T17:05).
- Trunk `cl/integration-1` @ **9b1fc988**; worktree `wt/L1-RECORD-LOCK-GUARD-1-lane1-l1t2010` at the
  **same sha, 0 commits ahead, product diff none**.
- Stack `:3092` `/api/health` 200 (pid 954410, cwd `cl-integration-1/server`), `:5192` 200 —
  **not restarted**. Exa tripwire: `OK: exa apiKey present and consistent`.
- Duplicate-writer sensor first action: `scripts/verify-leg1-fired.sh` @ 08:01:07 → **NOT-FIRED**
  (armed unit `inactive/dead`, `START_RECORDS=0`, 0 ahead, product diff none).
- `/record` RED baseline still present on the SERVED build: `pregate-recordlock-1.py --expect-red` →
  `contentLockedStates` **disk=[] and api=ABSENT on 7/7** lifecycle ids → *expect-red: AS EXPECTED*.

## Why no dispatch, and why NOT re-armed

- Fleet: both shared slots are held by live lane-2 pairs and lane 2 is mid-corpus ⇒ the BOUNDED-ROTATION
  gate cannot pass (check 4 needs exactly one free slot; check 3 needs a ≥2 h chain on the *other*).
- Item: `L1-RECORD-LOCK-GUARD-1` is still `todo | dispatched: none`; the Brad card
  (`.hermes/plans/2026-11-04_l1-record-lock-guard-1-brad-card.md`, mtime **06:53**, md5
  `5b79355f2b44a44fffe2e5b071936ba6`, **6,905 B, unchanged**) carries **no answer section, no reply
  file, no appended thread** — 1 h 22 m unanswered.
- **Not re-armed, deliberately.** The card's own text commits to this: *"If that passes without a fire,
  the item goes back to strict-B queue waiting with **no further automation**."* An arm started this
  tick would also contradict the 333RD ruling's standing note in the item block (`DO NOT RE-ARM`).
  Re-arming is a decision for the answer (a)/(c), not for a tick.

## New work: the §4 grant's reachability, measured instead of asserted

**Method (reproducible, uses the gate's own algorithms):** replayed
`/home/brad/.hermes/cl/lanes/1/scripts/dispatch-window-1.py`'s `slot_intervals()` +
`hold_start(HANDOFF_GAP_TOLERANCE=60 s)` over `~/.hermes/cl/coder-launches.jsonl` (62 rows, 32 starts,
span 2026-11-03T14:40Z → 2026-11-04T12:55Z, all timestamps `+00:00`), sampling **every minute** from
the item's `filed:` instant (`2026-11-03T23:53Z`) to now, and asking at each sample the two questions
the gate asks: (i) is exactly ONE shared slot unoccupied, and (ii) is the OTHER slot's lane-2
occupancy chain ≥ 2 h?

**Result — the eligible configuration is rare and short:**

```
window 2026-11-03T23:53Z -> 2026-11-04T13:02Z   790 min
eligible minutes                                11  (1.4 %)
run A  2026-11-04T00:34:00Z -> 00:35:00Z         1 min
run B  2026-11-04T03:55:00Z -> 04:04:33Z        10 min  (ends when 2865802 claims slot-0)
```

**Fidelity check (replay vs first-hand gate runs).** The replay must not be trusted on its own, so it
was calibrated against three instants at which a tick recorded a real verdict:

| instant | replay | recorded verdict |
|---|---|---|
| 09:01:31Z (326TH gate run) | both slots busy → not eligible | `ROTATION-DEFERRED`, `free_slots=[]` ✓ |
| 11:53:43Z (card filing) | both busy → not eligible | checks 3+4 FAIL ✓ |
| 12:40:00Z (335TH) | both busy → not eligible | BLOCKED-CORPUS / arm rc 14 ✓ |

**The arm's lifetime, decomposed (this is the load-bearing finding).** The armed dispatcher lived
10:43:14Z → 12:30:00Z (05:43:14–07:30:00 EST). Inside that window the gate was eligible for **zero**
minutes — and the reason is arithmetic, not luck: slot-1's lane-2 pair `3600006` exited at
**11:32:08Z** and lane 2 re-claimed at **11:37:52Z**, so the only free-slot interval was **5 m 44 s**,
during which slot-0's chain (`3693103`, start **10:11:52Z**) was **1 h 20 m – 1 h 26 m** old, i.e.
**34 minutes short** of the 2 h clause at the interval's close. Every other poll in the arm's life had
both slots held. So the arm did not miss a coin-flip; **the configuration it was watching for never
existed while it was alive**.

**Consequence for the pending decision (stated as evidence, not as a new ask):** option (c) on the card
— "a slot held <2 h still counts once BOTH slots are busy" — would have made 11:32:08Z–11:37:52Z
eligible and fired LEG 1 there. Option (a) makes the gate irrelevant. Option (b) leaves the item
waiting until lane 2 stops double-booking, which the replay says did not happen for 13 h. No new card
is filed (the existing one is unanswered and <2 h old) and no architect dispatch is made (the §3 clause
is the architect's to amend, and only after Brad's letter).

## Erratum recorded (paperwork only, no status change)

The 326TH tick's note in the item block says lane 2 "claimed slot-1 at **03:59:51Z** (L2-CLARIFY-CARD-1
3520015)". The launcher ledger says that record's `started_at` is **08:59:51Z** — the note wrote an EST
value with a `Z` suffix. Its *conclusion* is unaffected (the 326TH's own gate instant 04:01:31 EST =
09:01:31Z is replay-confirmed non-eligible above); only the timestamp label was wrong. Recorded so no
future tick inherits a 5-hour offset.

## Ledger (Rule 2, `~/.hermes/specs/verification-claims.md`)

`git diff --name-only 42ffa11e..HEAD -- . ':!.hermes/plans'` = **0 paths** (the only changed path since
the 335TH block is a `.hermes/plans` doc), product window `app server schema config scripts` = **0
paths** ⇒ Rule 2's expiry condition is **NOT met**, **all twelve quotable rows stand**, `/record` lock +
write-immutability stays **UNVERIFIED-and-DEFECTIVE**. One-line freshness addendum appended to
`~/.hermes/cl/lanes/1/claims-ledger.md`. No browser gate ran — lawful ones need a candidate revision,
and lane 1 has none.

## Assumptions recorded (not resolved)

- AS-L1T336-1: the replay treats a launcher interval as the slot's exclusive occupancy and cannot see a
  lock held without a ledger row, a launcher that spawned no child, or a handoff shorter than the 60 s
  tolerance. Three recorded gate instants agree with it, which bounds the error; the 1.4 % figure should
  be read as "rare and short", not as a precise rate.
- AS-L1T336-2: "free" in the replay is inferred (no covering interval) rather than probe-observed, so a
  free slot could in principle have been missed by a stale ledger; `verify-leg1-fired.sh` (START_RECORDS
  = 0, product diff none, 0 commits ahead) independently shows no lane-1 claim happened during any of it.

## Due blockers

- `L1-RECORD-LOCK-GUARD-1` — **strict-B on the card**; `blocker_next_check: on-change`; do **not**
  re-file the draft, do **not** re-arm.
- `L1-PARAMS-EMITTER-RIDER` — trigger **UNMET** (42nd check): `git log -1 -- scripts/fame-gatefix/` =
  `136a3d27 @ 2026-11-02 17:09:38`, unchanged.
- `FAME-1B-BACKFILL` — HOLD-for-Brad standing, no holder, not re-asked.

## State left behind

No coder dispatched, no slot claimed, no re-arm, no product code, no merge of product code, no data
write, no stack restart, **no status change** (todo 2 / in-progress 0 / superseded 1 / done 109 —
asserted inside the queue transaction). Queue transaction: append-only temp+rename under
`task-list.lock` (backup `task-list.md.bak-l1t0815-336TH`), one 336TH note in the item block +
`handoff_latest` repointed here. Artifacts: this handoff; `claims-ledger.md` addendum; the replay was
computed in-session (no new script kept — the method is four lines of the gate's own functions over
`coder-launches.jsonl`).

## Next actions (ordered)

1. `scripts/verify-leg1-fired.sh` first each tick (NOT-FIRED is the expected reading; anything else is a
   reconciliation emergency).
2. Read `.hermes/plans/2026-11-04_l1-record-lock-guard-1-brad-card.md` for a lettered answer. **(a)** →
   fire LEG 1 in parallel on the first free slot (`cl-coder-launch.py --lane 1 --item
   L1-RECORD-LOCK-GUARD-1 --worktree /mnt/vast/home/brad/git/wt/L1-RECORD-LOCK-GUARD-1-lane1-l1t2010
   --prompt ~/.hermes/cl/lanes/1/prompts/coder-L1-RECORD-LOCK-GUARD-1-LEG1-l1t2255.txt --mode
   parallel`, under `systemd-run --user --collect`). **(b)** → stay parked, stop re-litigating.
   **(c)** → the §3 clause is amended by the architect, not by a tick.
3. If the card is still unanswered after a full working day, move it into `lanes/1/decisions/` (a
   discoverability change only, never a re-ask) per AS-L1T335-1 — do not duplicate it.

## Addendum 08:05 EST — post-commit trunk state

This tick's trunk commit is **docs-only** (this handoff, 1 file, +146). After committing at
**5b8fb705**, the pre-warmed worktree `wt/L1-RECORD-LOCK-GUARD-1-lane1-l1t2010` was fast-forwarded to
trunk and re-measured: **0 commits ahead**, **product diff over `app server schema config scripts` =
0 paths**, tracked tree clean (only the two expected untracked `node_modules`, plus the long-known
stray root file `ready`, which is untracked and untouched by this tick). `scripts/verify-leg1-fired.sh`
re-run *after* the ff → **NOT-FIRED / START_RECORDS=0 / worktree == trunk / 0 ahead / product diff
none**. Nothing is silently writing, and the fire-ready tree now starts from 5b8fb705.
- CORRECTION (08:07): the commit carrying this handoff was **amended** to fold in the paragraph above,
  so its final sha is the current trunk HEAD, not the `5b8fb705` label used in that paragraph (that is
  the pre-amend sha, now unreferenced). The worktree was re-pointed to the amended commit; measured 0
  commits ahead, product diff none, `verify-leg1-fired.sh` NOT-FIRED / START_RECORDS=0.
