# LANE 1 TICK 324TH — 2026-11-04 07:20Z–08:05Z (02:20–03:05 EST)

One line: **§4 gate measured and deferred for a 4th consecutive tick (both fleet slots HELD at open), so instead of
recording another deferral I ARMED THE DISPATCH — a fail-closed dispatcher that polls the encoded gate every 45 s and
fires LEG 1 the moment it holds — and pre-drafted the mandatory 06:53 EST BRAD CARD. Readiness re-proved at the new
trunk `12becda1` (product diff `42df75eb..12becda1` = 0 paths; pregate `--expect-red` rc 0, 7/7 ABSENT).**

## Reconciled first-hand

- `cl-reconcile.sh 1` @ 02:20:08: queue **todo 2 / in-progress 0 / superseded 1 / done 109**; `task-list.lock` FREE;
  no lane-1 PAUSE, no lane-2 PAUSE; no lane-1 `corpus-state.md`; **no live lane-1 worker** ⇒ nothing to recover.
- Stack: backend `:3092` = 200, frontend `:5192` = 200; served HEAD = trunk HEAD = `12becda1`, backend pid 954410
  cwd `cl-integration-1/server`. Exa tripwire OK (apiKey present + consistent lane1/lane2/canonical).
- Lane 2: todo 5 / in-progress 3, `corpus-state.md` ACTIVE (prompt-2 SPECS-QUEUED), 2 live coder pairs.

## §4 gate — measured twice this tick, 02:20 and 02:24 (ROTATION-DEFERRED, exit 14)

| # | check | result |
|---|---|---|
| 1 | not paused; queue lock free | PASS |
| 2 | item todo + `dispatched: none` + HIGH | PASS |
| 3 | cadence ≥4 lane-2 launches **and** other slot held ≥2 h | FAIL — 10 launches (✓) but `other_slot_continuous_hold=0h00m` (both slots held ⇒ no counterpart) |
| 4 | exactly one free slot; other held by a live lane-2 pair | FAIL — `free_slots=[] held_slots=[0,1]` |
| 5 | lane 2 has ≥1 live coder pair | PASS (2) |

Slot truth (flock on `~/.hermes/cl/appliance2-coder-slot-{0,1}.lock`, both `flock -n` refused): slot-0 HELD
`CHATHOST-CONSOLIDATE-1` launcher 3246602 started 07:01:31Z (02:01:31 EST); slot-1 HELD `L2-CLARIFY-CARD-1`
launcher 3047532 started 05:30:41Z (00:30:41 EST, 1 h 54 m at measurement). Prober `--selftest`: **PASS** (decision
table + rotation gate + host parse), so the deferral is the host state, not a prober defect (AS-L1T323-1 closed for
this tick).

## What this tick PRODUCED (not another deferral)

1. **ARMED DISPATCHER** — `scripts/armed-dispatch-recordlock-l1t0220.sh`, running as
   `cl-l1-armed-dispatch-0228.service` (`systemd-run --user --collect`, so it outlives this tick), polling the
   ENCODED gate every 45 s until 2026-11-04 07:30 EST and firing LEG 1 the instant it holds. This is the mechanical
   form of the 323RD's own "Next actions" step 1 — it makes no judgement the ruling has not already encoded.
   Fail-closed guards, each independently exercised/verified this tick:
   - G1 any PAUSE file (either lane) → exit 3;
   - G2 item still `status: todo` + `dispatched: none` + `owner: none` (parsed from the list; verified output
     `todo|none|none`) → else exit 4;
   - G3 LEG-1 prompt md5 **must equal** `6ceddf7ddfaae09cf32fa97b77a380df` → else exit 5;
   - G4 prober verdict must be `DISPATCH-ELIGIBLE{,-ROTATION}` (rc 0) → anything else keeps polling, `PAUSED`
     exits 3;
   - G5 product tree unchanged since `12becda1` (`git diff --name-only 12becda1..HEAD -- . ':!.hermes/plans'` must
     be empty) → else exit 6 (the brief's pins assume that product tree);
   - G6 no `request_queue_timeout` engine-wedge in any lane log newer than 6 h (ruling §1 / VOID) → exit 9;
   - G7 pre-launch slot-truth RE-CHECK (§4 step 6) immediately before firing; launcher `rc=75` keeps polling,
     any other non-zero exits 7.
   Launch path: `cl-coder-launch.py --lane 1 --item L1-RECORD-LOCK-GUARD-1 --worktree
   wt/L1-RECORD-LOCK-GUARD-1-lane1-l1t2010 --prompt <LEG-1, md5 6ceddf7d…> --log <unique> --mode parallel`, wrapped
   in `systemd-run --user --collect`. CLI shape verified against `cl-coder-launch.py --help`. Observed live: 6+
   gate evaluations logged, all `ROTATION-DEFERRED`, **zero launches** — the deferral path is what is running.
2. **BRAD CARD PRE-DRAFTED** (not filed) — `2026-11-04_l1-brad-card-L1-RECORD-LOCK-GUARD-1-DRAFT.md`. The ruling §5
   backstop falls due **2026-11-04 06:53 EST** (the 323RD's corrected arithmetic, re-derived: filed 18:53 + 12 h).
   The draft names the item, gate state, cadence evidence, product consequence and one decision question. If the
   armed dispatcher fires first, the card is not filed.
3. **Readiness re-proved at the CURRENT trunk** — worktree FF'd `42df75eb` → `12becda1` (docs-only commit of the
   323RD handoff), 0 behind, tracked tree CLEAN (untracked `node_modules` only); product diff
   `42df75eb..12becda1` = **0 paths**; `pregate-recordlock-1.py --expect-red` live on `:3092` ⇒ served HEAD =
   trunk HEAD `12becda1`, `contentLockedStates` ABSENT **7/7**, `expect-red: AS EXPECTED`, rc 0. Brief pins
   unchanged: LEG-1 `6ceddf7ddfaae09cf32fa97b77a380df` (23,856 B); LEG-2 `1e473afb3c0665c3f485e5da6521b0b9` with its
   `<leg-1-merge-sha>` placeholders still literal (fail-closed).
4. **Rule-2 ledger** — `git diff --name-only 348137c0..HEAD -- . ':!.hermes/plans'` = 0 ⇒ all 12 quotable rows
   transfer unchanged. The `/record` lock + write-immutability row stays **UNVERIFIED-and-DEFECTIVE**.

## Due blockers — both re-measured, both still externally gated

- **L1-PARAMS-EMITTER-RIDER**: trigger UNMET for the **32nd** consecutive tick — `git log -1 -- scripts/fame-gatefix/`
  = `136a3d27` @ 2026-11-02 17:09:38; `assignment-contested-entry.py` md5 `0e00b33a89c432f537f666398982df36`
  (unchanged); `:709` still raw `"params": params` under the `:702` declared string/"canonical JSON" column. Not
  opened (must never justify a cycle alone).
- **FAME-1B-BACKFILL**: Brad HOLD A-L1T229-3 standing; a scan of every `.md/.yaml/.txt` under `.hermes` and the
  trunk's `.hermes` touched since 22:00 found only my own artifacts ⇒ no answer. Not opened.

## Assumptions recorded

- **AS-L1T324-1**: the armed dispatcher executes only the ruling's encoded gate; it grants no new authority and has
  no judgement of its own. Every guard is fail-closed, so a stale/partial state stops it rather than launching.
- **AS-L1T324-2** (the reason the window is narrow): with both slots live, the ONLY gate-satisfying transition is
  **slot-0 freeing while slot-1 stays HELD** (free=[0], held=[1] ≥2 h from 02:30:41 EST). If slot-1 frees first,
  check 3 fails (slot-0 held only ~30 min); if both free, check 4 fails (strict B). Since the live lane-2 tick
  reclaims any freed slot within minutes, a ≥45 s poll is the minimum cadence that can catch it.
- **AS-L1T324-3**: the card draft is preparation only; filing authority and the 06:53 trigger are unchanged.

## Next actions (ordered)

1. If `cl-l1-armed-dispatch-0228.service` reports `ARMED DONE` before 06:53 EST, LEG 1 is live: on `DONE` →
   adversarial ACCEPT → my own diff + all five bars (1/1b/1c/1d/2) + server `tsc` rc 0 + app `tsc` 21 → merge →
   `cl-lane-stack.sh 1 restart` (background) → pregate expect-GREEN → stamp the merge sha into LEG-2's 2
   placeholders and re-pin its md5. LEG 2 is a fresh §4 claim, not a chained one.
2. If it never fires and 06:53 EST arrives, **file the BRAD CARD** (draft is ready) — mandatory under ruling §5.
3. A future lane-1 tick must NOT launch while the armed unit is alive: check
   `systemctl --user is-active cl-l1-armed-dispatch-0228.service` first; the launcher's slot/worktree ownership is
   the backstop against a double dispatch (second launch exits 75).
4. Do not re-litigate slot sequencing. Spend ticks on the gate and the item.
