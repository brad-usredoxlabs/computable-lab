# LANE 1 TICK 334TH — 2026-11-04 07:20–07:36 EST (12:20–12:36 Z)

One line: **The armed dispatcher expired NOT-FIRED at its 12:30:00Z budget (exit 8 BUDGET-EXPIRED,
410 gate polls, every one ROTATION-DEFERRED rc 14) — the 18.1-min window opened at 12:11:52Z exactly
as forecast and slot-1 never freed inside it. `L1-RECORD-LOCK-GUARD-1` is now strict-B waiting on the
Brad card filed 06:53; it was NOT re-armed. The tick's work: post-landing hardening of the fire sensor
(`verify-leg1-fired.sh`), whose stale `ARM_ISO` + string timestamp compare could have read a REAL fire
as NOT-FIRED (defect reproduced, fix proved, live verdict unchanged).**

## Reconciled first-hand (`cl-reconcile.sh 1` @ 07:20:12)

- Queue **todo 2 / in-progress 0 / superseded 1 / done 109**; `task-list.lock` FREE; **no PAUSE in
  either lane**; **no lane-1 `corpus-state.md`**; **no live lane-1 worker** ⇒ nothing to recover/adopt.
- Trunk `cl/integration-1` @ **80fca81f**; worktree `wt/L1-RECORD-LOCK-GUARD-1-lane1-l1t2010` @
  **80fca81f**, **0 commits ahead**, product diff none (the 333RD's ad-hoc ff held).
- Stack `:3092` `/api/health` 200, `:5192` 200 — **not restarted**.
- Exa tripwire: `OK: exa apiKey present and consistent across lane1/lane2/canonical`.

## Why no dispatch (unchanged, measured twice)

Both SHARED appliance-2 slots HELD by LIVE lane-2 pairs at open, at 07:26 and at 07:31:

```
slot-0: HELD L2-CHATHOST-CONSOLIDATE-1-3693103-2026-11-04T10:11:52.898417+00:00
slot-1: HELD L2-CLARIFY-TARGET-1-3881148-2026-11-04T11:37:52.089531+00:00
lane 2: todo 6 / in-progress 2, corpus prompt-2 = SPECS-QUEUED  ⇒ CORPUS PRIORITY (Brad 2026-11-02T17:05)
```

## The arm's own record (this tick's primary evidence)

| instant (UTC) | unit | gate | note |
|---|---|---|---|
| 12:21:20 | active/running, MainPID 3762406 | rc 14 | first sensor run of the tick |
| 12:21:46 → 12:28:47 | active/running | rc 14 ×10 polls | `free_slots=[] held_slots=[0,1]` every time |
| **12:30:00** | **inactive/dead, Result=success, ExecMainStatus=0** | — | log: `BUDGET-EXPIRED at 2026-11-04T05:43:14-0500 without an eligible gate -> exit 8` |
| 12:31:32 | inactive/dead | — | `verify-leg1-fired.sh` → **NOT-FIRED**, `START_RECORDS=0` |

Poll count went 401 → 410 in the observed window; the log's only `LEG 1 dispatched` string is the
**332ND annotation at line 2182** (documenting the dead rc-branch), *not* a fire. Confirmed by
`grep -n` before any conclusion.

The 333RD's forecast resolved exactly and adversely: slot-0 matured the §3 hold at **12:11:52Z**, but
check 4 still failed because slot-1 stayed held, and it stayed held for the whole 18.1 min. Note for
future ticks: while both slots are held, check 3 reports `other_slot_continuous_hold=0h00m` /
`holder=None` because the probe computes no counterpart when `single_free=false` — that read is a
consequence of check 4 failing, **not** independent evidence that the 2 h hold was never reached.

## Work done: fire-sensor hardening (the item's own recorded obligation, discharged)

`scripts/verify-leg1-fired.sh` carried the 332ND-deferred defect. Read end-to-end, then fixed:

1. **`ARM_ISO` was a stale constant** `2026-11-04T07:24:00Z` — the *v1* unit's start, 3 h 19 m earlier
   than the v2 arm's real start (`10:43:14Z`). Now derived from the unit's `ActiveEnterTimestamp`
   (`date -d` → UTC), with the old constant demoted to an explicit **fallback** used only when the
   unit has left systemd, and the effective value + its source printed on every run.
2. **The "since arm" test was a STRING compare** (`str(started_at) >= arm`). The ledger writes
   `+00:00` offsets and the constant wrote `Z`, so it was never a time comparison — a fire recorded
   with a negative offset sorts *before* the arm and would have been **silently dropped, i.e. a real
   fire read as NOT-FIRED**. Both Python blocks now parse to aware datetimes.

Proof rather than assertion (`scripts/test-leg1-arm-compare.py`, kept on disk):

```
arm=2026-11-04T10:43:14Z  row started_at=2026-11-04T05:43:20-05:00  (= 10:43:20Z, 6 s after arm)
OLD string-compare says fired: False
NEW parsed-compare says fired: True
DEFECT_REPRODUCED
```

Live behaviour after the change is **byte-identical in verdict**: `bash -n` clean; run prints
`arm=2026-11-04T02:24:15-05:00 (source: fallback-constant (unit has no ActiveEnterTimestamp))` and
**NOT-FIRED / START_RECORDS=0 / 0 ahead / product diff none**. Original preserved as
`verify-leg1-fired.sh.bak-l1t0731`.

## Brad card

Filed and committed at `9e93b1aa` — `.hermes/plans/2026-11-04_l1-record-lock-guard-1-brad-card.md`
(6,905 B, mtime 06:53, unchanged this tick). **No answer in it** (no appended thread, no reply file),
so `blocker_kind: human` / `blocker_owner: Brad` / `blocker_next_check: on-change` all still stand.
The card's own wording is explicit that a fire before 12:30 would make the answer moot for this item;
that did not happen, so **the answer is now the only unblocking path**.

## Due blockers

- `L1-PARAMS-EMITTER-RIDER` — trigger **UNMET (40th check)**: `git -c core.fileMode=false log -1 --
  scripts/fame-gatefix/` = `136a3d27` @ 2026-11-02 17:09:38. Rider rule stands; it never justifies a
  cycle of its own.
- `L1-RECORD-LOCK-GUARD-1` — **strict-B on the card**. Arm outcome recorded in-item
  (`blocker_arm_outcome`). **Do not re-arm**: an identical arm cannot reach §3 before its own
  deadline under the same two-held-slots state, and the 333RD already ruled re-arming out.
- `FAME-1B-BACKFILL` HOLD-for-Brad standing; no holder.

## Assumptions recorded (not resolved)

- AS-L1T334-1: I did **not** delete the 303RD note's "Next free capacity: dispatch LONG mode (both
  slots)" line. The 332ND correction (LONG is unlawful under ruling §3; PARALLEL only) is already
  recorded twice — in the list's top block and in the item's 332ND note — so striking the original
  would remove provenance for no gain. The 334TH note in the item block carries the strike
  explicitly. *(Assumption: append-preserving beats editorial deletion in a queue that is the
  durable record.)*
- AS-L1T334-2: the hardened fallback arm (`2026-11-04T02:24:15-05:00`) is *earlier* than the true
  v2 arm start, i.e. it over-covers. With zero ledger rows for this item the verdict is unaffected;
  for any future item the wide window can only surface a real earlier launch, never hide one.

## State left behind

No coder dispatched, no slot claimed, no product code, no merge, no data write, no stack restart,
**no re-arm**, **no task-status change** (todo 2 / in-progress 0 / superseded 1 / done 109 — asserted
inside the queue transaction). Queue transaction: append-only temp+rename under `task-list.lock`
(backup `task-list.md.bak-l1t0734-334TH`), one 334TH note + `blocker_arm_outcome` in the item block +
`handoff_latest` repointed. Artifacts: `scripts/watch-arm-334th.sh`,
`scripts/test-leg1-arm-compare.py`, `verify-leg1-fired.sh.bak-l1t0731`.

## Addendum 07:34 EST — dispatch-readiness of the parked item re-verified (no dispatch, item parked)

Everything a future fire needs is intact **at the current trunk**, measured not inherited:

- **Spec anchors still resolve.** `git -c core.fileMode=false diff --stat af301799..2edb698d -- app
  server schema config` is **EMPTY**, i.e. the product tree is byte-identical to the trees the
  302ND/303RD/305TH/320TH measured their pins and baselines at. No anchor re-measurement was needed,
  and every baseline in the LEG-1 prompt (server bar1 3 files/62, bar2 3 files/22, app tsc 21) still
  holds by product-tree identity.
- **Live RED baseline re-measured on `:3092`** (read-only GETs, `scripts/recordlock-red-baseline-334th.py`,
  output kept at `red-baseline-334th-l1t0733.txt`): the four AM-9 ids are real —
  `document-control`, `document-controlled-signing`, `lab-sample`, `registry-ops` all 200 with
  `lifecycleId` echoing, and `contentLockedStates` **ABSENT on all four** ⇒ `RED-BASELINE: AS-EXPECTED`.
- **Worktree fast-forwarded** `80fca81f → 2edb698d` (docs-only; product diff over `app server schema
  config scripts` empty), so the pre-warmed tree is at trunk again and `verify-leg1-fired.sh` after the
  ff reads `0 ahead, product diff none, NOT-FIRED`.
- Prompt pin re-asserted by the arm's own `--selftest`: `SELFTEST prompt pin OK`,
  `item_state OK (todo|none|none)`, `ledger reachable`, rc 0.

Measurement trap recorded for future ticks: the queue transaction prints **character** counts
(`len(text)`) while `ls`/reconcile print **bytes**; the list contains non-ASCII (§ — ✓ ·), so
`1237829 chars == 1241800 bytes`. A tick that compares those two numbers directly will see a phantom
"3971 B lost" and start hunting a duplicate writer that does not exist. Compare like with like.

## Next actions (ordered)

1. `scripts/verify-leg1-fired.sh` first (now trustworthy on offsets). **NOT-FIRED is the expected
   reading** — the unit is dead and no launcher record exists; treat anything else as a reconciliation
   emergency (a duplicate writer may exist).
2. Read the card for Brad's lettered answer on every tick. If **(a)** — one lane-1 PARALLEL slot now —
   the lawful shape is `cl-coder-launch.py --lane 1 --item L1-RECORD-LOCK-GUARD-1 --mode parallel`
   into the pre-warmed worktree with the pinned LEG-1 prompt
   (`prompts/coder-L1-RECORD-LOCK-GUARD-1-LEG1-l1t2255.txt`, md5 `6ceddf7ddfaae09cf32fa97b77a380df`),
   fired under `systemd-run --user --collect`, never a bare `hermes -p` inside a `-z` tick. If **(b)**
   — the item stays parked and ticks stop re-litigating it. If **(c)** — the §3 hold clause gets
   amended by the architect, not by a tick.
3. Post-fire/post-answer order is unchanged and pre-verified: `pregate-recordlock-1.py` (expect-green)
   → `probe-recordlock-2.py --live` → browser re-gate brief with a fresh runstamp; bars server
   3 files/62 + 3 files/22 PASS, app tsc 21 baseline.
