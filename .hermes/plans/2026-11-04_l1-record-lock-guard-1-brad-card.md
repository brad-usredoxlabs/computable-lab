# BRAD CARD — FILED 2026-11-04T06:53:43 EST (lane 1, 333RD tick)

Authority for filing: lane-1 architect BOUNDED-ROTATION ruling 2026-11-04
(`.hermes/plans/2026-11-04_l1-lane1-slot-antistarvation-ruling.md`, §"Escalation backstop"):
*"If a lane-1 HIGH item remains `dispatched: none` with the §4 gate unmet continuously for ≥12 h
from its `filed:` ts while lane 2 shows sustained multi-item corpus cycling, the lane-1 orchestrator
MUST file a BRAD CARD naming the item, the gate state, the cadence evidence and the product
consequence."* Item filed **2026-11-03T18:53 EST**; 12 h elapsed **2026-11-04T06:53 EST**. Gate
measured unmet at **06:53:43 EST** (55 s past the due instant), so this card is filed, not drafted.

## The one question

**Is corpus priority absolute against a HIGH product defect that falsifies a documented
data-integrity guarantee — i.e. may lane 1 take ONE fleet slot to land `L1-RECORD-LOCK-GUARD-1`, or
does corpus2 keep both slots until it drains?**

## The item

`L1-RECORD-LOCK-GUARD-1` (status `todo`, `dispatched: none`, HIGH, filed 2026-11-03T18:53) —
*Lock enforcement on `/record/<id>`: an effective, signed controlled document must not be writable.*

Two measured defects, both first-hand at trunk product tree `af092157` (byte-identical to the current
`12becda1`…`4c4a64ca` product tree; `git diff --stat` over `app server schema` is EMPTY):

1. `/record/DOC-DEMO-SOP` (lifecycle state `effective`, double-signed) renders an **enabled Save**
   with no draft-copy route — `app/src/event-editor/create/RecordEditPanel.tsx:177/195/205/215` gates
   Save only on saving/loading/error, never on lifecycle state.
2. A **no-edit PUT is not a no-op**: `RecordHandlers.ts:1195-1216` stamps `updatedAt` unconditionally
   and `controlledContent` strips it, so both content-lock walls pass and `meta.contentSha` drifts
   (`16db862a…` → `1cd98318…`, updatedAt 2026-11-03T23:49:44Z) on a signed, effective QMS document.
   (A content-CHANGING PUT is already refused at two layers — `RecordHandlers.ts:1139-1141`,
   `RecordStoreImpl.ts:285-290` → 409 `CONTROLLED_RECORD_LOCKED`; the hole is the no-edit path.)

## Gate state at filing (measured 2026-11-04T06:53:43 EST, my own run)

`scripts/dispatch-window-1.py --rotation --item-severity HIGH` → **ROTATION-DEFERRED (exit 14)**:

| §4 check | result |
|---|---|
| 1 not paused / queue lock free | **PASS** (`paused=False/False`, `queue_lock_free=True`) |
| 2 item todo + `dispatched: none` + HIGH | **PASS** (`todo\|none\|none`, severity authority: ruling §4 step 2) |
| 3 cadence | **FAIL** — 16 lane-2 launches ✓ (need ≥4), but `other_slot_continuous_hold=0h00m` (need ≥2 h): both slots held, so the probe computes no counterpart |
| 4 slot truth | **FAIL** — `free_slots=[] held_slots=[0,1]`, both held by live lane-2 pairs |
| 5 lane 2 has a live coder | **PASS** (2 live pairs) |

Slot truth at filing: slot-0 HELD `L2-CHATHOST-CONSOLIDATE-1` launcher 3693103, chain start
**10:11:52Z**; slot-1 HELD `L2-CLARIFY-TARGET-1` launcher 3881148, chain start **11:37:52Z**.

## Cadence evidence (launcher ledger `~/.hermes/cl/coder-launches.jsonl`, starts since the item's filed ts)

**16 lane-2 coder launches, 100 % lane 2, 4 distinct items** — `L2-CLARIFY-CARD-1` ×8,
`CHATHOST-CONSOLIDATE-1` ×3, `L2-CHATHOST-CONSOLIDATE-1` ×3, `L2-CLARIFY-TARGET-1` ×2
(00:35:50Z → 11:37:52Z). Lane-2 queue: **todo 7 / in-progress 2**, `corpus-state.md` ACTIVE
(SPECS-QUEUED). Lane 2 is cycling, not idle — which is exactly the precondition the backstop names,
and also the reason the §4 hold clause keeps being reset.

## Why the §4 gate keeps failing (measured, not a complaint)

The §3 clause needs one slot **free** *and* the other held **continuously ≥2 h** at the same instant.
Observed this session: slot-0 runs average 47.8 m over 8 completed runs; slot-1's previous chain died
at 1 h 59 m 07 s (**11:32:08Z**) and lane 2 re-claimed it **5 m 44 s** later (11:37:52Z). A >60 s
handoff gap resets the ≥2 h clock (`HANDOFF_GAP_TOLERANCE=60 s`), so under sustained two-slot lane-2
demand the window is rare and short-lived rather than never. **This is a scheduling collision, not a
lane-1 blocker that any further lane-1 work can fix.**

## What is still armed (so this card is not the only path)

`scripts/armed-dispatch-recordlock-v2.sh`, unit `cl-l1-armed-dispatch-0228.service`, ACTIVE,
MainPID 3762406, polling the §4 gate every 45 s until **2026-11-04 07:30:00 EST (12:30:00Z)**. On a
passing gate it fires LEG 1 itself (`cl-coder-launch.py --lane 1 --item L1-RECORD-LOCK-GUARD-1
--mode parallel`, one slot) and proves the fire only from a real launcher START record — verified
NOT-FIRED at 06:41 and 06:53:43 (`START_RECORDS=0`, worktree `12becda1` **0 commits ahead** of trunk
`4c4a64ca`, product diff none, prompt pin `6ceddf7d` unchanged).

The remaining reachable window is narrow and real: slot-0's live chain matures at **12:11:52Z**, which
leaves **18.1 min** to the arm's 12:30:00Z deadline, and it needs slot-1 to be free at one 45 s poll
in that interval. If that passes without a fire, the item goes back to strict-B queue waiting with no
further automation.

## Product consequence (why HIGH, not polish)

`claims-ledger.md` downgrades the `/record` lock + write-immutability row to
**UNVERIFIED-and-DEFECTIVE**, and the task list's long-standing ENVIRONMENT FACT *"Approved/effective
content is LOCKED at HTTP + storage"* is **FALSIFIED for `/record`** (it still holds for the
`/registry` DocumentShell — S10 passes there). Until this lands, no statement that a signed, effective
controlled document is immutable is permitted anywhere in this project. For a QMS-facing lab system
that is the difference between a doc-control guarantee and a claim.

## Options (pick one; (a) is my recommendation)

- **(a) Authorise one lane-1 PARALLEL claim now, one slot, regardless of the §4 hold clause.** The
  ruling's own rationale is that lane 2 is never slot-idle when it wants a slot; the item is already
  split into two small sequential one-slot legs, so the displacement is one parallel run, bounded by
  the 131072/32768 token cap, with no chaining.
- **(b) Keep corpus priority absolute.** Accept that the `/record` lock row stays DEFECTIVE until
  corpus2 drains. No further lane-1 ticks will report progress on this item — this is a deliberate
  choice, not a stall.
- **(c) Amend the §3 clause so a slot held <2 h still counts once BOTH slots are busy** (i.e. measure
  "lane 2 is cycling hard" by launches alone when there is no free slot to claim).

Reply with a letter, or say nothing and I keep (b) with the arm still running to 07:30 EST.

— lane-1 orchestrator, 333RD tick. Evidence: `gate-333rd-l1t0653b.txt`,
`~/.hermes/cl/lanes/1/armed-dispatch-l1t0220.log`, `coder-launches.jsonl`,
`.hermes/plans/handoffs/2026-11-04_lane1-tick-333RD-*.md`.

---

## STATUS ADDENDUM — 2026-11-04T08:3x EST (337TH tick). THE QUESTION ABOVE IS UNCHANGED; this is not a re-ask.

The paragraph "What is still armed" above is now **stale in one respect** and is corrected here so your
morning read is accurate:

- **The arm expired WITHOUT firing**, exactly as that paragraph anticipated: armed log's terminal line is
  `07:30:00 BUDGET-EXPIRED at 2026-11-04T05:43:14-0500 without an eligible gate -> exit 8`; systemd unit
  `cl-l1-armed-dispatch-0228.service` is `inactive/dead`; `verify-leg1-fired.sh` at 08:2x = **NOT-FIRED**,
  `START_RECORDS=0`, worktree == trunk `67d8d5e6`, 0 commits ahead, product diff none. **Nothing is running
  and nothing will start on its own.**
- **No §4 window ever appeared.** A 13-hour replay of the gate's own algorithm (336TH handoff) put the eligible
  configuration at 11 of 790 minutes (1.4 %), and **zero** of those minutes fell inside the arm's lifetime. The
  live gate at 08:20:27 EST still reads `ROTATION-DEFERRED` (exit 14): `free_slots=[] held_slots=[0,1]`, both
  slots held by live lane-2 pairs.
- **Sizing correction relevant to option (a):** this item is now **two sequential PARALLEL legs**, one slot each
  (LEG 1 = server/data, prompt `coder-L1-RECORD-LOCK-GUARD-1-LEG1-l1t2255.txt`, md5 `6ceddf7d`, line 2 reads
  "PARALLEL mode (one slot, 131072 total / 32768 output)"; LEG 2 staged). An older note inside the task list said
  "dispatch LONG mode (both slots)" — that note is **superseded**. **Answering (a) costs ONE slot for one bounded
  run**, not both slots.
- **Kit verified fire-ready at today's trunk** `67d8d5e6`: `git diff --name-only 8708d595..HEAD -- app server
  schema config scripts` = 0 paths (only `.hermes/plans/` moved), prompt pin unchanged, worktree clean.

Two measured defects and acceptance criteria are untouched. Option (a) remains my recommendation; (b) remains
the default if you say nothing.

---

## OPERATIONAL RESOLUTION — 2026-11-04T13:5xZ EST (338TH tick). NOT a re-ask; the question above stands.

**The item is no longer blocked, and no answer from you is needed to unblock it.** The gate finally passed on its own
terms and LEG 1 is now running:

- Lane 2's slot-0 coder exited at **13:40:59.775Z**. My §4 gate run at **13:41:30Z** returned
  **DISPATCH-ELIGIBLE-ROTATION (exit 0) — the first 5/5 PASS of this campaign** (slot-0 free; slot-1 held by a live
  lane-2 pair since 11:37:52Z = 2 h 03 m; 17 lane-2 launches since filing).
- That window was lost by **one second**: lane 2 re-claimed slot-0 at **13:41:31.566Z**. My mandatory §4 step-6
  pre-launch re-check found it held and **stood down — nothing was launched**.
- So this is now a *latency* problem, not a policy problem. A 15-second window poller (unit
  `cl-l1-windowpoll-l1t0842`) watched the gate and **fired LEG 1 at 13:50:57Z**: lane-1 launcher 37880 / `cl-coder`
  child 37882, **PARALLEL, one slot**, worktree `wt/L1-RECORD-LOCK-GUARD-1-lane1-l1t2010`, prompt md5 `6ceddf7d`.
  Fire is proven from the launcher's own start record, not from a log line.
- Item is now **status `in-progress`**. Lane 2 held the *other* slot continuously throughout, so Brad's corpus
  priority was never violated; this is the architect's standing BOUNDED-ROTATION grant doing exactly what it says.

**What this means for your three options:** (a) is being executed within the existing grant, so you no longer need to
choose it to unblock work. (b) is no longer the live state. (c) remains a real question only if you want the clause
itself amended for *future* items — that is still yours or the architect's call, not a tick's.

If you do want to answer, a letter is still welcome; it will change how *subsequent* HIGH items are scheduled, not
this one. If you say nothing, LEG 1 continues and LEG 2 follows its own gate.

