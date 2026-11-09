# LANE 1 TICK 331ST — 2026-11-04 05:40–06:0x EST (10:40–11:0x Z)

One line: **No dispatch was lawful (both SHARED appliance-2 slots held by live lane-2 pairs ⇒ gate
ROTATION-DEFERRED rc 14), so the tick closed a measured fail-open in the ARMED DISPATCHER: its
"launcher refused ⇒ keep polling" arm was dead code, which would have turned a refused launch into a
false "ARMED DONE" and forfeited the whole 06:33–07:30 fire window. v2 enforces fire-proof from a real
launcher START record and keeps polling when the launcher never started.**

## Reconciled first-hand (cl-reconcile.sh 1 @ 05:40:11)

- Queue **todo 2 / in-progress 0 / superseded 1 / done 109**; `task-list.lock` FREE; **no PAUSE in either
  lane**; **no lane-1 `corpus-state.md`**; **no live lane-1 worker** ⇒ nothing to recover or adopt.
- Trunk `cl/integration-1` @ **51c14f35** (docs-only commits over `894824c8`).
- Stack `:3092` 200 on `/api/health` and `/api/records` (root `/` is 404 by design), `:5192` 200; **not
  restarted**. Served pids 954410 (server) / 953556 (app), both `cwd` = the integration checkout.
  Exa tripwire: `OK — apiKey present and consistent across lane1/lane2/canonical`.
- Fleet (measured, not inherited): **slot-0 HELD** `L2-CHATHOST-CONSOLIDATE-1` launcher 3693103
  (10:11:52Z); **slot-1 HELD** `L2-CLARIFY-TARGET-1` launcher 3600006 (09:33:01Z). Both live.
- Lane-2 queue: **todo 7 / in-progress 2** / `corpus-state.md` ACTIVE (SPECS-QUEUED) ⇒ CORPUS PRIORITY
  (Brad 2026-11-02T17:05) still governs lane-1 fleet claims.

## Gate — ROTATION-DEFERRED (rc 14) at open (05:41:13) and again at 05:43:59

Checks 1/2/5 PASS; **3 FAIL** (`lane2_launches_since_filed=15` ✓, `other_slot_continuous_hold=0h00m`)
and **4 FAIL** (`free_slots=[] held_slots=[0,1]`). Both failures share the same root cause: with both
slots held the script computes no "other slot" (`single_free=false`, :336-352) — a correct reading, not
a measurement bug. No lane-1 claim was made and none was lawful.

- `L1-PARAMS-EMITTER-RIDER` — trigger **UNMET (37th tick)**: `git log -1 -- scripts/fame-gatefix/` is
  still `136a3d27` @ 2026-11-02 17:09:38.
- `L1-RECORD-LOCK-GUARD-1` — `todo|none|none`, armed, **NOT-FIRED** (see below).

## The defect found and closed this tick (first-hand measurement, not inference)

The 324TH tick recorded "seven fail-closed guards, each verified", including *G7: launcher rc=75 keeps
polling; other non-zero → 7*. **That arm was dead code.** Measured this tick with a throwaway unit:

```
$ systemd-run --user --collect --unit cl-probe-exit-$$ /bin/sh -c 'exit 75'
$ echo $?                     -> 0
$ systemctl --user show cl-probe-exit-… -p Result -p ExecMainStatus  -> Result=success ExecMainStatus=0
```

`systemd-run` returns when the unit's **start job** completes (Type=simple); the transient unit's exit
status is never propagated to the caller. Consequences in `armed-dispatch-recordlock-l1t0220.sh` (v1):

- its `LRC == 75` branch (busy → keep polling) and `LRC == 7` branch (refused) **cannot fire**;
- a launcher that REFUSES (slot taken in the ~1 s gap after the pre-launch re-check, or PAUSE appearing)
  is logged **"ARMED DONE — LEG 1 dispatched at …"** and the unit **exits 0**, forfeiting the rest of
  its budget — in the worst case the entire 06:33–07:30 window, exactly the window the 330TH's forecast
  says is the realistic one.

The 325TH tick appended a note to `armed-dispatch-l1t0220.log` claiming the opposite mechanism
("`launcher rc=0` ⇒ the coder RAN and exited 0"). Its *conclusion* (never infer a fire from this log;
use `verify-leg1-fired.sh`) stands and is now structurally enforced; its *mechanism* is wrong and has
been corrected by an appended note in that log (v1's note is not deleted — history is preserved).

### Applied

`scripts/armed-dispatch-recordlock-v2.sh` (new file; **v1 untouched on disk for provenance**):

- every v1 guard preserved in intent: PAUSE→3, item `todo|none|none`→4, LEG-1 prompt md5
  `6ceddf7d…`→5, prober rc 0 required (rc 12→3), product diff `12becda1..HEAD` outside `.hermes/plans`
  must be empty→6, `request_queue_timeout` in any lane log <6 h→9, pre-launch slot-truth re-check,
  ff-only worktree bring-up, node_modules presence;
- dispatch uses an explicit `--no-block` and a named transient unit;
- **FIRE PROOF**: after launching it waits up to 180 s for a real launcher **START** record
  (`{"event": "start", "item": "L1-RECORD-LOCK-GUARD-1"}`) in the coder log the launcher was told to
  write (`cl-coder-launch.py:75-76`) or in `coder-launches.jsonl` (:95-96), **byte-offset windowed to
  this attempt** so a same-minute retry or a historical record cannot masquerade as a fire;
- no START record and the unit gone ⇒ log the refusal and **keep polling** (v1 exited 0 here).

Testing (real, not asserted): `bash -n` clean; `--selftest` rc 0 (item-state parse `todo|none|none`,
prompt pin OK, ledger reachable); and four fixture cases on the extracted detector — historical record
before the offset **ignored**, newly appended start record **matched**, a new *exit* record **rejected**,
Python-spaced JSON **matched**.

### Swapped in place

`systemctl --user stop cl-l1-armed-dispatch-0228.service` (was MainPID 3297306) then
`systemd-run --user --collect --unit cl-l1-armed-dispatch-0228 --working-directory=/home/brad /bin/bash
…/armed-dispatch-recordlock-v2.sh`. **Same unit name** so `scripts/verify-leg1-fired.sh` (which
hardcodes `cl-l1-armed-dispatch-0228.service`) stays valid. Now: ActiveState **active/running**,
MainPID **3762406**, started 05:43:14 EST, two polls logged, both `rc=14 ROTATION-DEFERRED`, cadence 45 s
measured (05:43:14 → 05:43:59).

## Pre-fire readiness (re-measured, unchanged)

- `verify-leg1-fired.sh` @ 05:43:5x: **NOT-FIRED** — 0 launcher start records for the item, worktree
  branch `cl/lane1-recordlockguard-1-l1t2010` @ `12becda1`, **0 commits ahead of trunk**, product diff
  none, unit active.
- Worktree is **ff-clean**: `git status --porcelain` = 2 entries, both untracked `node_modules`
  (`./` and `server/`, plus `app/node_modules` present) ⇒ v2's `merge --ff-only 51c14f35` will succeed.
- `12becda1` is an **ancestor** of trunk `51c14f35`; product diff `12becda1..HEAD` outside
  `.hermes/plans` is **empty** ⇒ GUARD4 stays empty and bars proved at `12becda1` (326TH: 62/62, 22/22,
  53/53, 99/99, 22/22, server tsc rc 0, app tsc 21) are not invalidated by docs-only trunk movement.
- Pre-gate `--expect-red` live on `:3092` @ 05:42: **RED SHAPE, AS EXPECTED** —
  `contentLockedStates ABSENT` on **7/7** lifecycle ids; served product tree at boot == trunk product
  head (`9e455216…`), checkout HEAD == trunk HEAD.
- Fire mode is **`--mode parallel`** and that is correct: the current LEG-1 prompt is stamped
  "PARALLEL mode (one slot, 131072 total / 32768 output)" and line 13835 of the task list records the
  parallel shape. The 303RD–305TH "LONG mode" notes are superseded — no change made.

## Rule-2 ledger

`git diff --name-only 12becda1..51c14f35` outside `.hermes/plans` is empty ⇒ **all 12 claims-ledger rows
stand unchanged**; `/record` lock row stays **UNVERIFIED-and-DEFECTIVE** until this item lands.

## Due blockers — NONE

- Rider trigger UNMET (37th tick, above). `FAME-1B-BACKFILL` is `status: done`; no open Brad holds.
- Brad card **06:53 EST** — still a FUTURE obligation, **NOT filed**. Draft refreshed this tick with an
  authoritative 331ST measured block (gate state 05:43:59, the v2 change, and the explicit statement
  that the 06:33 forecast is neither confirmed nor refuted before 11:33:01Z).

## State left behind

No coder dispatched, no slot claimed, no product code, no merge of product code, no data write, no
stack restart, no task-status change (**todo 2 / in-progress 0 / superseded 1 / done 109**). Armed unit
**active** on v2. Brad card still **DRAFT**.

## Next actions (ordered)

1. `scripts/verify-leg1-fired.sh` **first**, every tick — never the armed log's wording (now doubly
   true; v2 makes the log honest, but the verify script is still the ground truth).
   - **FIRED** → stamp the queue claim under `task-list.lock`; reconcile commits; run bars 1/1b/1c/1d/2
     + `server tsc` rc 0 + `app tsc` 21; dispatch `cl-adversarial-reviewer`; merge only on ACCEPT;
     restart the lane stack; then `python3 scripts/restamp-leg2-l1.py --sha <merge-sha> --apply-tasklist`.
   - **NOT-FIRED, unit active** → do nothing about the arm; do not stamp the queue (GUARD2 needs
     exactly `todo|none|none`).
   - **NOT-FIRED and the unit is gone** → re-arm with the v2 shape:
     `systemd-run --user --collect --unit cl-l1-armed-dispatch-<HHMM> --working-directory=/home/brad
     /bin/bash /home/brad/.hermes/cl/lanes/1/scripts/armed-dispatch-recordlock-v2.sh`
     (expiry costs ~one tick; the gate is stateless).
2. If v2 logs `NO START RECORD … => KEEPING POLLING`, read the launcher's refusal reason in the coder
   log before changing anything — the arm is doing what it should (the slot went away).
3. **06:53 EST**: if the gate is still unmet, file the Brad card (draft path above) from the 07:00 tick.
4. Spot-check the 330TH forecast at ~06:35: `hold_start` for slot-1 lane-2 should read ≥2 h and a free
   slot must actually have existed at some poll after 11:33:01Z. If lane 2 re-claims slot-1 across a
   >60 s gap the clock resets (`HANDOFF_GAP_TOLERANCE`) and the next maturity is ~13:00Z — past the
   unit's deadline.

## Addendum — v2 fire branch proven end-to-end, both polarities (05:47–05:50 EST)

Not just the detector: the real fire branch was exercised in an isolated harness
(`/tmp/v2e2e/`, throwaway `git worktree` at trunk `1b89fe69`, stubbed gate returning
`VERDICT: DISPATCH-ELIGIBLE-ROTATION` rc 0, stubbed launcher, 6 s fire-proof, 45 s deadline), with a
pre-flight assert that the generated script contains no reference to `cl-coder-launch.py` or the real
lane-1 runtime dir outside comments — i.e. no coder could be started.

| case | launcher behaviour | v2 result |
|---|---|---|
| A | launcher exits non-zero, writes NO start record | `NO START RECORD after 6s (unit=… state=inactive) => launcher did not launch; KEEPING POLLING`, re-fired next poll, `BUDGET-EXPIRED … exit 8`. **v1 in this case would have logged "ARMED DONE — LEG 1 dispatched" and exited 0.** |
| B | launcher writes the real `event=start` record (same shape as cl-coder-launch.py:71-76/:95-96) | `FIRE PROVEN — launcher START record: {"event": "start", … "item": "L1-RECORD-LOCK-GUARD-1" …}` then `ARMED v2 DONE … exit 0` |
| C | worktree not at trunk and not a git repo | `worktree FF failed -> exit 2` (fail-closed, observed before the gate stub was finished) |

Sandbox cleaned up (`git worktree remove --force /tmp/v2e2e/wt`, transient `cl-l1-leg1-*` units reset).
The real arm was never touched by the harness and is still `active/running`, MainPID 3762406.

Residual, accepted: v2 cannot read the launcher's *license* to be slow — if a real launcher took longer
than `FIRE_PROOF_SECS` (180 s) to write its start record, v2 would keep polling and could double-launch.
This is mitigated structurally: `cl-coder-launch.py` takes the locks and writes the start record within
seconds, and its own per-worktree `coder-worktree-<hash>.lock` (plus the slot locks it holds for the
child's whole lifetime) makes a second concurrent launch of THIS worktree exit 75 rather than start.
