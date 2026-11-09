# ARCHITECT RULING — lane-1 fleet-slot anti-starvation (the "new ruling" reserved by l1t1920)

Ruling tick: l1t0145, issued 2026-11-04 ~01:45 EST.
Ruling by: architect (read-only; no code, no dispatch, no task-list edits). All git via `-c core.fileMode=false`.
Supersedes the l1t1920 one-shot grant (`FAME8-lane1-slot-sequencing-l1t1920-ruling.md`, END-RULING: AMENDED-A), which
explicitly reserved this ruling for the now-occurring mirrored configuration: lane 2 holding one slot with a live
coder while the OTHER slot is the only one lane 2's next launch can take.

Deliverable per request. Committed to `cl/integration-1` (docs-only; trunk fc15772c, only this file staged).

END-RULING: BOUNDED-ROTATION (standing class, per-claim gated)

## VERDICT

Lane 1 MAY claim one fleet coder slot (never both) under the mechanical gate in §4, with the numeric bounds in §3.
This is a **bounded anti-starvation rotation inside an already-binding priority rule — NOT a change to Brad's corpus
priority.** Lane 2 yields nothing it wants: whenever lane 2 has a dispatchable item AND a slot it can take, lane 1
does not claim that slot. Lane 1 fills only the window where lane 2 is actively cycling its own coder on the other
slot and has demonstrably been doing so for a sustained period, which is exactly the condition that turns strict B
into "starvation by redefinition" (the failure l1t1920 §rejection already named).

Brad card: **NO card.** This is scheduling detail, reservation expressly made by l1t1920 ("after which ... until a
new architect ruling"). It changes no lane-1 acceptance criterion, boundary, token or product intent; it does not
reverse corpus priority; it only caps how long lane 2's sustained cycling may park a HIGH, already-spec'd lane-1
product defect. A TRUE priority reversal (whether corpus may ever yield to lane 1) is Brad's call and is out of
scope here — the escalation path in §5 names when to raise it.

Grounding for the judgement, all first-hand this tick (2026-11-04 01:40-01:45 EST), verified by the architect, not
inherited:
- Slot truth (flock on `~/.hermes/cl/appliance2-coder-slot-{0,1}.lock`): slot-0 FREE (holder launcher 3123886 DEAD,
  log ends 01:27 → a genuine free slot, not a live holder); slot-1 HELD by a LIVE lane-2 pair (launcher 3047532 +
  `hermes -p cl-coder` child 3047534, L2-CLARIFY-CARD-1). VERDICT of the capacity prober
  `~/.hermes/cl/lanes/1/scripts/dispatch-window-1.py`: BLOCKED-CORPUS (exit 10) — correct under strict B.
- Lane-2 cadence (from `~/.hermes/cl/coder-launches.jsonl`, launcher-recorded starts, 23:53Z→06:05Z): **9 coder
  launches, all on two items** — L2-CLARIFY-CARD-1 ×6 (successive fix rounds), L2-CHATHOST-CONSOLIDATE-1 ×3. Lane 2
  is iterating fix cycles, not idle. Lane-2 queue: todo 5, in-progress 5, `corpus-state.md` prompt-2 =
  SPECS-QUEUED (active; prompts 3-8 LOCKED).
- Lane-1 HIGH item **L1-RECORD-LOCK-GUARD-1** (status todo, dispatched none, filed 2026-11-03T18:53) — **6 h 50 m
  undispatched, zero lane-1 coder launches** in that window. Stale `--mode long` notes (302/303rd ticks) are
  superseded by the dispatchshape ruling: the item is split-parallel into two sequential ONE-slot PARALLEL legs
  (LEG 1 server/DATA, LEG 2 client), so each leg fits beside lane-2 corpus work in whatever single slot is free —
  exactly the shape a one-slot bounded rotation serves. Dispatch kit fire-ready and re-proved against current trunk
  (worktree wt/L1-RECORD-LOCK-GUARD-1-lane1-l1t2010 HEAD 9ab8bb07; trunk advanced docs-only, 0 paths changed;
  LEG-1 brief md5 6ceddf7ddfaae09cf32fa97b77a380df; pre-gate `contentLockedStates` ABSENT 7/7, `--expect-red` rc 0).
- Product consequence already recorded in the lane ledger: every lock/immutability claim on `/record` is FORBIDDEN
  until this item lands; the `/record` lock + write-immutability row stays UNVERIFIED-and-DEFECTIVE until then.

## Why BOUNDED-ROTATION, and what is rejected

- **Rejected (A) strict B stands with no exception.** It reproduces the exact starvation l1t1920 already refused:
  lane 2 perpetually holds ≥1 slot and re-claims any free one within minutes, so a HIGH lane-1 product defect waits
  indefinitely — starvation by redefinition, not by Brad's rule. Rules out "wait until lane 2 has no dispatchable
  work": that state does not exist under active corpus cycling.
- **Rejected (C) lane-2 tick authority as the ONLY path.** Lane-2 orchestrator yield adds a coupling and a
  dependency where unambiguous first-hand slot truth already exists; it also lets lane 2 (not the fairest arbiter of
  the shared fleet) decide lane-1 access. The yielded-signal BLOB (`union` of nothing new) is unnecessary.
- **Adopted (B) bounded rotation, mechanical**, because it is calibrated to slot truth (claim only while the other
  slot is LIVE-held by a lane-2 coder, so lane 2 is never slot-idle that it wants), it never delays lane 2 by more
  than one parallel run, it is fully reversible, and it stands down the instant lane 2 needs capacity. It preserves
  Brad's priority while terminating its unbounded failure mode. It extends (not reverses) l1t1920's one-shot grant
  into a bounded standing rule with a hard escalation backstop.

## Numeric bound (asymmetric: heavy on stand-down, lean on claim)

- Max concurrent lane-1 coders: **1**.
- Clock/cadence threshold (BOTH must hold at claim time):
  - lane 2 has consumed **≥4 coder launches** (per `~/.hermes/cl/coder-launches.jsonl`, launcher-recorded) since the
    lane-1 item became dispatchable (its `filed:` timestamp), AND
  - a lane-2 live coder has held the OTHER slot **continuously ≥2 hours** at the instant of claim.
- Claim shape: **PARALLEL only, one slot.** The leg is inherently duration-capped by the parallel token cap
  (131072 total / 32768 output); no chaining — after the claim's leg (or any lane-1 run) finishes, lane 1 returns to
  strict B and must independently re-pass the full gate for any further claim.
- Rationale for the numbers: observed cadence is 9 launches / ~6.8 h, so ≥4 launches + ≥2 h continuous hold is
  already true at the first eligible tick for L1-RECORD-LOCK-GUARD-1 — the gate admits the currently-blocked HIGH
  item immediately while proving lane 2 is genuinely cycling (not a one-off brief hold), so the rotation does not
  fire on noise.

## Mechanical rule for the lane-1 orchestrator (next eligible tick; no judgement needed)

Run these in order; ANY check false → defer, next tick re-checks from 1. Claim the free slot ONLY IF ALL are true.

1. `cl-reconcile.sh 1`: lane-1 not paused; queue lock FREE; no engine wedge / no new `request_queue_timeout`-class
   death since the last ruling.
2. Item gate: the lane-1 item has `dispatched: none`, `status: todo`, and is **HIGH** (this invocation:
   L1-RECORD-LOCK-GUARD-1). This rule grants nothing to a non-HIGH item.
3. Cadence gate (BOTH as in §3): ≥4 lane-2 coder launches since the item's `filed:` ts AND a lane-2 live coder has
   held the other slot continuously ≥2 h. Record the count and the hold start from
   `~/.hermes/cl/coder-launches.jsonl` + pidfile mtimes in the handoff.
4. Slot truth by hand (flock on BOTH `~/.hermes/cl/appliance2-coder-slot-{0,1}.lock`):
   - The claim target slot passes `flock -n` (genuinely free; holder dead/pidfile absent).
   - The OTHER slot is HELD by a LIVE lane-2 process pair (launcher PID + `hermes -p cl-coder` child BOTH present
     in `ps`). If BOTH slots are free while lane 2 has a dispatchable item → strict B, lane 1 does NOT claim.
5. Stand-down guard: lane 2 has ≥1 live coder pair at this instant. If lane 2 has ZERO live coders →  lane 1 does
   not claim (run in strict B; do not take a slot lane 2 must be free to take).
6. Re-check (4) immediately before launch. If lane 2 dispatched into the free slot in the interim → stand down,
   defer to next tick.

All true → launch the claim target's leg in PARALLEL mode, one slot, per the split-parallel dispatchshape ruling
and its S1-S4 sequencing. On leg completion, lane 1 returns to strict B; any second leg (or any future HIGH item)
re-passes the full gate independently.

## VOID conditions (any one voids this ruling for that tick, without needing a fresh ruling)

- **Brad contradicts it** — his words outrank this file; this rule yields immediately on his statement.
- **Both fleet slots free while lane 2 has a dispatchable item** — strict B applies; lane 1 does not claim.
- **Lane 2's live coder dies before lane 1 claims** (or the party holding the other slot is not a live lane-2 pair)
  — strict B; lane 1 does not claim.
- **A new `request_queue_timeout`-class / engine-wedge death** occurs before the claim → engine-wide pause; re-route
  to architect; do not launch.
- **The lane-1 item is no longer HIGH, `todo`, `dispatched: none`** — rule has nothing to grant.
- **Lane 2's cadence drops below the §3 gate** at a later tick and stays below for a further claim — no claim under
  this ruling.

## One-shot or standing?

STANDING class, per-claim gated. This supersedes l1t1920's one-shot exception. Each individual claim must
independently pass all of §4 from step 1; the grant is fully self-limiting and pivotal on slot truth, so it does
not need a hard expiry to stay safe. It can be revoked at any time by Brad or by a new architect ruling.

## Scope guard

This grant changes NO lane-1 acceptance criterion, NO item boundary, NO token allocation, NO product intent. It is
STAGING/scheduling only: it decides WHEN lane-1 dispatch may occupy a fleet slot, not WHAT the item must do. It does
not re-open the split-parallel shape, the AM-1..AM-11 amendments, or the item's scope. ALL of those remain binding
verbatim under their original instruments. The option names (A/B/C/D) in the request are retained here as
"adopted/rejected" records only; they are not menu items.

## Escalation backstop (names the path if rotation never fires)

If a lane-1 HIGH item remains `dispatched: none` with the §4 gate unmet **continuously for ≥12 h** from its
`filed:` ts while lane 2 shows sustained multi-item corpus cycling, the lane-1 orchestrator MUST file a BRAD CARD
naming the item, the gate state, the cadence evidence and the product consequence, rather than silently stalling.
This is the point at which the judgment becomes a priority question (whether corpus priority is absolute against a
HIGH product defect) and therefore Brad's — not the architect's — to decide. It does not arise for
L1-RECORD-LOCK-GUARD-1 now, because the §4 gate is already met at the next eligible tick; it is a standing safety
valve for future recurrence.

Signed: lane-1 architect, 2026-11-04.

END-RULING: BOUNDED-ROTATION
