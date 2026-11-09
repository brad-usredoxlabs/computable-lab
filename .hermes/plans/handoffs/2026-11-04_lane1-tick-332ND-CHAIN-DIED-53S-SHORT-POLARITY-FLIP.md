# LANE 1 TICK 332ND — 2026-11-04 06:00–06:4x EST (11:00–11:4x Z)

One line: **No dispatch was lawful (gate ROTATION-DEFERRED rc 14). The 330TH/331ST "earliest 11:33:01Z"
fire forecast was measured and FALSIFIED at 11:33:24Z: slot-1's lane-2 coder exited rc=0 at 11:32:08Z —
53 seconds before its chain would have matured — so the polarity flipped, slot-1 is now FREE, and the
binding clock became slot-0's chain, maturing 12:11:52Z with only 18.1 min of arm budget left.**

## Reconciled first-hand (`cl-reconcile.sh 1` @ 06:00:09)

- Queue **todo 2 / in-progress 0 / superseded 1 / done 109**; `task-list.lock` FREE; **no PAUSE in either
  lane**; **no lane-1 `corpus-state.md`**; **no live lane-1 worker** ⇒ nothing to recover or adopt.
- Trunk `cl/integration-1` @ **cf5665fb** (docs-only over `1b89fe69` → `51c14f35`); product-path diff
  `51c14f35..cf5665fb` outside `.hermes/plans` is **EMPTY**.
- Stack `:3092` `/api/health` **200**, `/api/records` **200**, `:5192` **200**; **not restarted**.
- Exa tripwire: `OK: exa apiKey present and consistent across lane1/lane2/canonical`.
- Fleet (measured): **slot-0 HELD** `L2-CHATHOST-CONSOLIDATE-1` launcher **3693103** (10:11:52Z);
  **slot-1 HELD** `L2-CLARIFY-TARGET-1` launcher **3600006** (09:33:01Z). Both live
  (`live_lane2_coder_pairs=2`).
- Lane-2 queue: **todo 7 / in-progress 2** / `corpus-state.md` ACTIVE (SPECS-QUEUED) ⇒ CORPUS PRIORITY
  (Brad 2026-11-02T17:05) still governs lane-1 fleet claims.

## Gate — both readings, measured

| invocation | verdict | binding detail |
|---|---|---|
| `dispatch-window-1.py` | **BLOCKED-CORPUS (10)** | corpus work present, rotation not requested |
| `dispatch-window-1.py --rotation --item-severity HIGH` | **ROTATION-DEFERRED (14)** | checks 1/2/5 PASS; **3 FAIL** `lane2_launches_since_filed=15` ✓ but `other_slot_continuous_hold=0h00m`; **4 FAIL** `free_slots=[] held_slots=[0,1]` |

Both failures have the one root cause already documented at 331ST: with both slots held the script
computes no "other slot" (`single_free=false`, `:336-352`). No lane-1 claim was made and none was lawful.

## Fire forecast — measured, not inherited

Source: `~/.hermes/cl/coder-launches.jsonl` (58 rows, **30 start / 28 exit**, every timestamp
**`+00:00`**; unknown/beyond-window intervals absent). Slot intervals recomputed this tick:

```
slot-0 (the churn slot)             slot-1
10:11:52Z -> LIVE  49.6m           09:33:01Z -> LIVE  88.5m   <-- CHAIN COVERS NOW
09:25:35 -> 09:45:25  19.8m        08:59:51 -> 09:25:30  25.6m
07:01:31 -> 09:11:36 130.1m        08:24:52 -> 08:41:52  17.0m
06:05:07 -> 06:27:42  22.6m        05:30:41 -> 08:18:08 167.4m
04:52:46 -> 05:31:32  38.8m        01:54:41 -> 04:08:51 134.2m
04:04:33 -> 04:41:08  36.6m
02:03:28 -> 03:47:37 104.2m
01:54:41 -> 02:01:53   7.2m
01:01:45 -> 01:24:35  22.8m
```

- **slot-1 contiguous chain start 09:33:01Z ⇒ ≥2 h at 11:33:01Z (06:33:01 EST)** — 32 min after this
  tick's open, **56m59s** before the armed unit's deadline **12:30:00Z (07:30:00 EST)**.
- slot-0 contiguous chain start 10:11:52Z ⇒ ≥2 h at 12:11:52Z — so a fire on the *other* polarity
  (slot-1 freeing first) could not mature before 12:11:52Z, leaving 18 min.
- **Lawful fire therefore requires: a slot-0 FREE window at some poll after 11:33:01Z, while the
  slot-1 chain stays continuous (lane-2 handoff gap ≤60 s).**
- **Re-claim latency measured** (this is what makes the window reachable): slot-0 stood free
  `09:11:36→09:25:35` = **13m59s** and `09:45:25→10:11:52` = **26m27s**, and earlier
  `05:31:32→06:05:07` = **33m35s**, `06:27:42→07:01:31` = **33m49s**. Lane 2 re-claims in
  **14–34 min**, far longer than the arm's **45 s** poll ⇒ the arm will see a free slot-0.
- **Run-length context:** slot-0's 8 completed runs this session mean **47.8 m**
  (22.8/7.2/104.2/36.6/38.8/22.6/130.1/19.8); the live run was **49.6 m** old at 11:01Z. A free
  window inside `[11:33:01Z, 12:30:00Z]` is therefore **likely but not assured** — the specific
  single point of failure is unchanged: if this run outlives 12:30:00Z the arm expires unfired, and
  if slot-1 exits while lane 2 re-claims more than 60 s later the chain resets and slot-0 would then
  need to survive to 12:11:52Z+.

## Sensors (ground truth, in the handoff's prescribed order)

- `scripts/verify-leg1-fired.sh` @ 06:00:54: **NOT-FIRED** — `START_RECORDS=0`, no product-path change.
  Unit `cl-l1-armed-dispatch-0228`: `ActiveState=active`, `SubState=running`, **MainPID 3762406**,
  `ActiveEnterTimestamp` 05:43:14 EST, `Result=success`. Arm log polling at 45 s; last poll
  `06:01:16 gate rc=14 verdict=ROTATION-DEFERRED`.
- Worktree `wt/L1-RECORD-LOCK-GUARD-1-lane1-l1t2010` @ **12becda1**, **0 commits ahead** of trunk
  cf5665fb, **product diff none**; `12becda1` **is** an ancestor of cf5665fb ⇒ v2's `--ff-only` bring-up
  to cf5665fb will succeed.
- Item gate inputs intact: `status: todo`, `dispatched: none`, prompt pin md5 **6ceddf7d** unchanged
  (GUARD3 passes every poll).

### Instrument audit (deliberately no change made)

`verify-leg1-fired.sh` was audited rather than trusted because it is declared ground truth:

- its ledger filter is a **string** comparison against `ARM_ISO=2026-11-04T07:24:00Z`; all 86
  timestamps in the ledger are `+00:00`, so the comparison is sound on this host;
- its `ARM_ISO` is the **original** arm instant (02:24:15 EST), not the 05:43:14 EST v2 swap — stale
  but **conservative**, and provably harmless because the ledger contains **zero** records for this
  item (`item rows: []`), so no historical record can masquerade as a fire;
- **no edit was made mid-flight**: changing the ground-truth instrument minutes before the fire
  window it must judge is a worse risk than the observation. Recorded for hardening *after* the item lands.

## Two documentation traps closed (no product/behaviour change)

1. **"Dispatch LONG mode" advice in the item block is UNLAWFUL, not merely stale.** The item's 302ND
   block says *"Next free capacity: dispatch LONG mode (both slots …)"*. The architect's
   BOUNDED-ROTATION ruling §3 says the opposite: *"Claim shape: **PARALLEL only, one slot.**"* — and
   long mode occupies both slots, which the grant can never authorise. So `--mode parallel` in the arm
   is not an implementation preference; **long mode would be void under the grant**. Recorded here so
   no future tick "repairs" the arm to long and silently converts a lawful claim into an unlawful one.
2. **The arm's hardcoded `--item-severity HIGH` is AUTHORISED, not invented.** `dispatch-window-1.py`
   says to pass HIGH *"only if documented"*, and the item block carried no severity line — so the
   rotation grant rested on an undocumented claim. It is documented: ruling §4 step 2 names
   **L1-RECORD-LOCK-GUARD-1** as *the* HIGH item of this grant. Logged in the queue transaction as a
   `severity:` line **with its authority cited**, so the claim is traceable inside the item itself.
   (Adding a comment field cannot move GUARD2: `item_state` still parses `todo|none|none` — asserted
   in the transaction script.)

## Due blockers — NONE

- `L1-PARAMS-EMITTER-RIDER` — trigger **UNMET (38th tick)**: `git log -1 -- scripts/fame-gatefix/` is
  still `136a3d27` @ 2026-11-02 17:09:38. Rider rule stands: it must never justify a cycle on its own.
- Brad card **06:53 EST** — still FUTURE, **NOT filed** (due instant 8 min past this tick's budget;
  cadence is `*/20`, so the **07:00** tick files it). Draft refreshed this tick with the measured
  332ND block so filing is copy-and-file, not re-derivation.
- No open `FAME-1B-BACKFILL` holder; `corpus-state.md` absent for lane 1.

## State left behind

No coder dispatched, no slot claimed, no product code, no merge, no data write, no stack restart, **no
task-status change** (todo 2 / in-progress 0 / superseded 1 / done 109). Armed unit **active on v2**,
MainPID 3762406, deadline 12:30:00Z. Brad card still **DRAFT**. Queue edit = one tick note + one
`severity:` documentation line in the item block.

## Next actions (ordered)

1. `scripts/verify-leg1-fired.sh` **first**, every tick.
   - **FIRED** → stamp the queue claim under `task-list.lock`; reconcile the coder's commits; run bars
     1/1b/1c/1d/2 + `server tsc` rc 0 + `app tsc` 21 **yourself**; dispatch `cl-adversarial-reviewer`;
     merge only on ACCEPT; restart the lane stack; then
     `python3 scripts/restamp-leg2-l1.py --sha <merge-sha> --apply-tasklist`.
   - **NOT-FIRED, unit active** → do nothing about the arm; do **not** stamp the queue (GUARD2 needs
     exactly `todo|none|none`).
   - **NOT-FIRED and the unit is gone** → re-arm with the v2 shape under a fresh unit name
     `cl-l1-armed-dispatch-<HHMM>` (`--working-directory=/home/brad`, v2 script). Note: re-arming
     invalidates nothing else, but the 2 h hold clause must be re-measured at the new fire time.
2. If v2 logs `NO START RECORD … => KEEPING POLLING`, read the launcher's refusal reason in the coder
   log before changing anything — the slot went away and the arm is behaving correctly.
3. **06:35 spot-check** (this tick's successor does it earlier than the 330TH could): confirm slot-1's
   chain actually reached ≥2 h at 11:33:01Z *and* that a free slot existed at some poll after that
   instant. If lane 2 re-claimed across a >60 s gap, the clock reset — re-derive, do not assume.
4. **06:53 EST → 07:00 tick**: if the gate is still unmet, file the Brad card from
   `2026-11-04_l1-brad-card-L1-RECORD-LOCK-GUARD-1-DRAFT.md`.
5. After the item lands (any outcome): harden `verify-leg1-fired.sh`'s `ARM_ISO` to derive from the
   unit's `ActiveEnterTimestamp` (observation above), and delete the item block's LONG-mode advice.

## Addendum — 06:33 spot-check: THE PREDICTED CHAIN DIED 53 s SHORT (forecast falsified, window now 18 min)

Run at **06:33:24 EST (11:33:24Z)**, i.e. 23 s after the predicted maturity instant. **The 06:35
projection drafted earlier in this tick was WRONG and is corrected here by measurement** — recorded
rather than quietly rewritten, because the shape of the failure is the lesson.

| measured at 11:33:24Z | value |
|---|---|
| slot-1 (`L2-CLARIFY-TARGET-1`, launcher 3600006 / child 3600008) | **EXITED 11:32:08Z, rc=0** — chain start 09:33:01Z, died **53 s before** it would have reached 2 h (11:33:01Z) |
| slot-1 flock now | **FREE** |
| slot-0 (`L2-CHATHOST-CONSOLIDATE-1`, launcher 3693103 / child **3693105, live**) | HELD; continuous chain start **10:11:52Z** ⇒ age **1h21m**, 2 h at **12:11:52Z** |
| gate `--rotation` | **ROTATION-DEFERRED (14)**: **3 FAIL** `other_slot_continuous_hold=1h21m (need >=2h)`; **4 now PASSES** `free_slots=[1] held_slots=[0] live_lane2_pair=3693105`; 1/2/5 PASS |
| `verify-leg1-fired.sh` | **NOT-FIRED**, `START_RECORDS=0`, unit `active`, MainPID 3762406 |

**What actually happened, versus what three ticks predicted.** The 330TH/331ST derived "earliest
11:33:01Z" from *slot-1's* chain and named the risk as *"slot-1 exits and lane 2 re-claims >60 s later
⇒ clock resets"*. The exit did happen (rc=0, a clean finish) — 53 seconds too early — and lane 2 did
**not** re-claim within the following 76 s. So the arithmetic was right and the consequence was
inverted: **the polarity flipped.** Slot-1 is now the free slot and **slot-0** is the 2 h holder.

**The arm is now bound by check 3 alone, maturing 12:11:52Z — 18.1 min before the 12:30:00Z deadline**,
and it needs all three of these to hold for the next 38 minutes:

1. lane 2 **does not** re-claim slot-1 (a re-claim makes both slots held ⇒ check 4 fails, and a fresh
   slot-1 chain could not reach 2 h before 12:30:00Z ⇒ the arm is dead for the rest of its life);
2. slot-0's coder 3693105 keeps running to 12:11:52Z (an exit breaks the chain);
3. lane 2 keeps ≥1 live pair (check 5).

Observed lane-2 re-claim latency is 14–34 min, so surviving 38 min untouched is **plausible but
against the trend** — this is now the arm's binding uncertainty, and it is a genuinely different
failure mode from the one the forecast named. Nothing is actionable: the arm re-evaluates all five
checks every 45 s on its own and will fire on the first rc=0 poll. **Lane 1 must not touch the free
slot** — with lane 2 holding 7 todo + an ACTIVE corpus, claiming it outside a passing gate is exactly
the strict-B violation the ruling's VOID clause forbids.

**Rule-design observation (for the architect, not a self-help fix):** the §3 cadence clause rewards
lane 2 *finishing* a worker only if the freed slot then stays free for the remainder of the 2 h clock
on the OTHER slot. A lane-2 coder completing at 1h59m therefore sets lane 1 *back*, and the rule has no
notion of a "chain that matured but whose slot went free" credit. Recorded as an assumption this tick:
the rule was applied as written, no reinterpretation, no waiver.

