# LANE 1 TICK 337TH — 2026-11-04 08:2x–09:0x EST (13:2x–14:0x Z)

One line: **No dispatch is lawful again (both shared slots held by live lane-2 pairs, item strict-B on an unanswered
card), so this tick spent its time where an answer will land: it repaired a stale premise in the ONLY document Brad
reads — the card still claimed the armed dispatcher was running until 07:30 EST — and corrected a task-list note that
would have made option (a) undispatchable (the item is two one-slot PARALLEL legs, not a both-slot LONG run), then
re-verified the whole LEG-1 kit against today's trunk.**

## Reconciled first-hand (`cl-reconcile.sh 1` @ 08:20:14 EST)

- Queue **todo 2 / in-progress 0 / superseded 1 / done 109** (`L1-PARAMS-EMITTER-RIDER`,
  `L1-RECORD-LOCK-GUARD-1`); `task-list.lock` FREE; **no PAUSE in either lane**; **no lane-1 `corpus-state.md`**;
  **no live lane-1 worker** (the two live `hermes -p cl-coder` processes, pids 3881150 / 4101576, are the two lane-2
  pairs that hold the shared slots) ⇒ nothing to adopt, recover or re-dispatch.
- Shared slots (flock truth, not the stale per-lane copies): slot-0 HELD `CHATHOST-CONSOLIDATE-1-4101569`
  (started 2026-11-04T12:55:36Z), slot-1 HELD `L2-CLARIFY-TARGET-1-3881148` (started 11:37:52Z); both run
  `cl-coder` children. Lane 2 = todo 7 / in-progress 2 / `corpus-state.md` ACTIVE (SPECS-QUEUED) ⇒ CORPUS PRIORITY
  (Brad 2026-11-02T17:05).
- `scripts/dispatch-window-1.py --rotation --item-severity HIGH` → **ROTATION-DEFERRED (exit 14)**, my own run at
  08:20:27: checks 1 / 2 / 5 **PASS** (`lane2_launches_since_filed=17` ≥ 4 ✓); check 3 **FAIL**
  (`other_slot_continuous_hold=0h00m`, needs ≥ 2 h — with both slots held the probe computes no counterpart, so this
  clause is structurally unsatisfiable while lane 2 double-books); check 4 **FAIL**
  (`free_slots=[] held_slots=[0,1]`).
- Duplicate-writer sensor first action: `scripts/verify-leg1-fired.sh` @ 08:2x → **NOT-FIRED**, `START_RECORDS=0`,
  armed unit `inactive/dead` (`Result=success`), worktree `wt/L1-RECORD-LOCK-GUARD-1-lane1-l1t2010` HEAD
  **67d8d5e6 == trunk**, 0 commits ahead, product diff none, tracked tree clean (untracked `node_modules` only).
- Armed log terminal line is now a recorded fact, not an expectation:
  `07:30:00 BUDGET-EXPIRED at 2026-11-04T05:43:14-0500 without an eligible gate -> exit 8` — **EXPIRED-NOT-FIRED**,
  consistent with the item's `blocker_arm_outcome` and the standing **DO NOT RE-ARM** note. Not re-armed.
- Trunk `cl/integration-1` @ **67d8d5e6** (docs-only 336TH commits on top of 9b1fc988). Stack `:3092` = 200,
  `:5192` = 200 — **not restarted**. Exa tripwire: `OK: exa apiKey present and consistent across
  lane1/lane2/canonical`.
- Brad card unchanged at open: md5 `5b79355f2b44a44fffe2e5b071936ba6`, mtime 06:53:58, 6,905 B, no answer thread —
  **1 h 27 m unanswered**.

## Why no dispatch

Neither half of the gate pair is legal. **Capacity:** both shared slots are held by live lane-2 pairs and lane 2 is
mid-corpus, so `cl-coder-launch.py` would return exit 75 (busy) and CORPUS PRIORITY forbids lane 1 pre-empting a
slot. **Authority:** `L1-RECORD-LOCK-GUARD-1` stands on strict-B for Brad's card; the card itself commits that a
fire-less arm expiry returns the item to queue waiting "with no further automation", so re-arming now would be a
decision this tick does not own. `L1-PARAMS-EMITTER-RIDER`'s trigger is still unmet and by its own rule must never
open a cycle (43rd check: `git log -1 -- scripts/fame-gatefix/` = `136a3d27 @ 2026-11-02 17:09:38`, unchanged).

## New work this tick — three measured corrections, all in the path an answer will travel

**(1) Card staleness repaired (paperwork defect, no re-ask).** The card's "What is still armed" paragraph told Brad
the dispatcher was alive to 07:30 EST and that "the remaining reachable window is narrow and real". That statement
was **false as of 07:30** and the card is the only document Brad reads. A dated **STATUS ADDENDUM** was appended
below the question (question text untouched, explicitly marked "not a re-ask") carrying: the arm's terminal exit
line, `inactive/dead` unit state, `START_RECORDS=0`; the 13-hour replay result (0 eligible minutes inside the arm's
life) and today's live `ROTATION-DEFERRED` reading with `free_slots=[]`; the sizing correction (2); and the kit's
fire-readiness at today's trunk. Card is now **8,825 B, md5 `1e31a8339346e229a37e3c76b80e25f3`**.
**Answer-detection is unchanged in substance but MUST NOT be done by md5 any more** — see AS-L1T337-1.

**(2) Dispatch-sizing correction (would have blocked option (a)).** A 302ND-era note inside the item block reads
"Next free capacity: dispatch LONG mode (both slots…)". The kit on disk says otherwise, first-hand:
`prompts/coder-L1-RECORD-LOCK-GUARD-1-LEG1-l1t2255.txt` line 2 = *"LEG 1 of 2 (server/DATA only), **PARALLEL mode
(one slot, 131072 total / 32768 output)**"*, and `coder-L1-RECORD-LOCK-GUARD-1-LEG2-STAGED.txt` (13,655 B) exists.
Under sustained double-booking a **LONG** dispatch (both slots) can never acquire, so obeying the stale note would
have made Brad's (a) answer undispatchable on arrival. Recorded in the item block: (a) costs **one** parallel slot
for one bounded run.

**(3) Kit re-verified fire-ready at 67d8d5e6 (not inherited from the 335TH).** The LEG-1 prompt's own pre-dispatch
assertion holds: `git diff --name-only 8708d595..HEAD -- app server schema config scripts` = **0 paths** (the range
contains only `.hermes/plans/` paths — 24 handoff + 4 plans docs). Prompt pin unchanged:
`coder-L1-RECORD-LOCK-GUARD-1-LEG1-l1t2255.txt` md5 **`6ceddf7d`** == the pin the arm and the item record.
Worktree == trunk, 0 ahead, product diff none.

**(4) Criterion-2 probe precondition re-read, no write.** `probe-recordlock-2.py --dry-run` against the served
stack returns `DOC-DEMO-SOP state=effective contentSha=f3ef8fea…` — the locked-state precondition still holds, so
leg A can run the moment a candidate revision exists. Leg A was deliberately **not** run: it is a PUT against an
effective signed record and there is no build to grade, so it would add fixture drift for zero evidence.

## Ledger (Rule 2, `~/.hermes/specs/verification-claims.md`)

`git diff --name-only 42ffa11e..HEAD -- . ':!.hermes/plans'` = **0 paths**; product window
`app server schema config scripts` = **0 paths** ⇒ Rule 2's expiry condition is **NOT met**, **all twelve quotable
rows stand**, `/record` lock + write-immutability stays **UNVERIFIED-and-DEFECTIVE**. Freshness block + the
probe-precondition reading appended to `~/.hermes/cl/lanes/1/claims-ledger.md`. No browser gate ran — lawful ones
need a candidate revision, and lane 1 has none.

## Assumptions recorded (not resolved)

- **AS-L1T337-1:** future ticks must detect a card answer by the **presence of a lettered answer section / reply
  thread**, not by md5 or mtime change — this tick legitimately changed both (addendum). The pre-addendum md5
  `5b79355f…` was the "unanswered" fingerprint up to 08:2x; `1e31a833…` is the "addendum, still unanswered"
  fingerprint.
- **AS-L1T337-2:** the §3 clause (`other_slot_continuous_hold ≥ 2 h`) remains structurally unsatisfiable under
  sustained two-slot lane-2 demand; the 336TH's 1.4 %-of-13 h replay quantifies the consequence. This is the
  architect's clause to amend (card option (c)); a tick must not touch the gate, and did not.
- **AS-L1T337-3:** `probe-recordlock-2.py` leg A writes to an effective signed record by design (it is the defect
  itself). Batch-running it per tick would manufacture data churn; it is a post-merge instrument.

## Due blockers

- `L1-RECORD-LOCK-GUARD-1` — **strict-B on the card** (now with a corrected status addendum);
  `blocker_next_check: on-change`; `blocker_watch_paths` unchanged. Do **not** re-file, do **not** re-arm.
- `L1-PARAMS-EMITTER-RIDER` — trigger **UNMET** (43rd check; `136a3d27 @ 2026-11-02 17:09:38`).
- `FAME-1B-BACKFILL` — HOLD-for-Brad standing, no holder, not re-asked.

## State left behind

No coder dispatched, no slot claimed, no re-arm, no product code, no merge of product code, no record write (probe
ran `--dry-run` only), no stack restart, **no status change** (todo 2 / in-progress 0 / superseded 1 / done 109 —
asserted inside the queue transaction). Queue transaction: append-only temp+rename under `task-list.lock`
(backup `task-list.md.bak-l1t0900-337TH`), one 337TH note at the chronological tail, the stale LONG-mode sentence
marked superseded in the item block, and `handoff_latest` repointed here.

## Next actions (ordered)

1. `scripts/verify-leg1-fired.sh` first each tick (**NOT-FIRED** is the expected reading; anything else is a
   reconciliation emergency). Then `dispatch-window-1.py --rotation --item-severity HIGH`.
2. Read the card **for a lettered answer section** (not md5). **(a)** → on the first free slot:
   `python3 /home/brad/.hermes/cl/scripts/cl-coder-launch.py --lane 1 --item L1-RECORD-LOCK-GUARD-1 --worktree
   /mnt/vast/home/brad/git/wt/L1-RECORD-LOCK-GUARD-1-lane1-l1t2010 --prompt
   ~/.hermes/cl/lanes/1/prompts/coder-L1-RECORD-LOCK-GUARD-1-LEG1-l1t2255.txt --log … --mode **parallel**`
   (never `long` — see (2) above) under `systemd-run --user --collect`. **(b)** → stay parked. **(c)** → architect
   amends §3, not a tick.
3. Do **not** batch-run `probe-recordlock-2.py --live`; it is the post-merge acceptance instrument.
4. If the card is still unanswered after a full working day, move it into `lanes/1/decisions/`
   (discoverability only, never a re-ask) per AS-L1T335-1.
