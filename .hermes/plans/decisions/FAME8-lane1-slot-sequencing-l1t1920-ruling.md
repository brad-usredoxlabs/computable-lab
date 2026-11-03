# ARCHITECT RULING — lane-1/lane-2 fleet-coder slot sequencing (FAME-8 terminus)

Ruling tick: l1t1920 request, issued 2026-11-02 ~19:25 EST.
Ruling by: architect (read-only; no code, no dispatch, no task-list edits).
Request: `.hermes/plans/2026-11-02_fame8-lane1-slot-sequencing-decision-request-l1t1920.md`

END-RULING: AMENDED-A

## Amended option (A + anti-starvation tightening, one-shot scope)

A lane-1 TERMINUS item may claim a genuinely free fleet coder slot ahead of lane-2 queue
items ONLY when lane 2's own live coder is holding the other slot at the instant of claim —
because in that state lane 2's dispatch rate is unchanged: its armed TARGET-1 recovery cannot
launch until slot-0 frees regardless of who holds slot-1. The exception is granted for exactly
ONE pre-built run (FAME-8-GATEFIX4, l1t1855 artefacts); after that launch is consumed, strict
corpus priority (option B behaviour) resumes for lane 1 until a new architect ruling.

Option B rejected as written: lane 2 ALWAYS has queued work, so B parks the lane-1 campaign
terminus indefinitely and leaves the D1 readability defect live in the merged product forever —
that is starvation by redefinition, not by Brad's rule. Option C rejected: tick-counted quotas
are blind to slot truth and would let lane 1 claim a slot lane 2 is actively waiting for.

## Rationale (grounded)

Brad's binding sentence, verbatim (lane-1 header, BRAD-BINDING 2026-11-02T17:05):
"The North Star of this project, as I've said is now driving corpus2. THOSE prompts
should have priority."
Priority means corpus work is not starved — it does not mean a slot sits idle when lane 2
cannot use it. Lane 2 holds slot-0 with its own LIVE coder (CARD1-FIXBROWSER, PID 3305342)
and its TARGET-1 recovery waits on slot-0, not slot-1; a lane-1 claim on slot-1 delays lane 2
by exactly zero seconds. Fleet cap stays TWO coders (the launcher cannot make a third); the
60-min stagger revert from tonight's two request_queue_timeout deaths still applies mechanically
and the launcher self-gates it. GATEFIX4 is one CSS-only run in `app/src/analysis/**`,
pre-validated in-browser — the cheapest possible terminus closure.

## Mechanical rule for the lane-1 orch (next tick; no judgement needed)

Claim slot-1 ONLY IF ALL of these are true at dispatch time, checked in this order:
1. `cl-reconcile.sh 1`: FAME-8 still in-progress, lane not paused, queue lock FREE.
2. Slot truth by hand: exactly ONE coder slot HELD and its holder is a LIVE lane-2 process
   pair (launcher PID + `hermes -p cl-coder` child both present in `ps`); the OTHER slot
   passes `flock -n` (genuinely free, holder dead). If BOTH slots are free while lane 2 has
   any dispatchable item, lane 1 does NOT claim — the header rule applies strictly.
3. Worktree marker `/mnt/vast/home/brad/git/wt/.checkout-gatefix4-l1t1900.log` ends
   `CHECKOUT rc=0` AND branch HEAD == 29ec4be3; if trunk advanced, re-create/re-pin first
   (existing next-tick check).
4. Re-check (2) immediately before launch — if lane 2 dispatched into the free slot in the
   interim, stand down.
All true → run unchanged, detached:
`/home/brad/.hermes/cl/lanes/1/scripts/launch-fame8-gatefix4-l1t1855.sh`
(it self-gates stagger/slot/WT-tip and exits STAGGER-BLOCKED / NO-SLOT without launching).
On success: append the stagger-trial launch line, record this ruling's path in the handoff,
continue the tick. Any check false → defer, next tick re-checks from 1. After the launch is
consumed, lane 1 returns to strict B for all further coder dispatch.

## This ruling is VOID if (any one)

- Brad contradicts it (his words outrank this file; morning click-test is the backstop).
- Lane 2 becomes slot-idle while its queue has a dispatchable item (both slots free, or lane
  2's slot-0 coder dies before lane 1 claims) → strict corpus priority, lane 1 does not claim.
- A THIRD `request_queue_timeout`-class death occurs before the launch → engine-wide pause,
  re-route to architect; do not launch.
- Trunk has advanced past 29ec4be3 and the worktree has not been re-pinned.
- GATEFIX4 has already launched (exception is one-shot; nothing further is claimed under it).

## Brad card?

NO card. This is routine slot sequencing inside an already-APPROVED campaign (FAME-8) and does
not change product intent, domain policy, scope boundaries, or acceptance criteria — per the
APPROVAL POLICY (BRAD-BINDING 2026-11-02), a card is filed only for irreducible ambiguity, and
this ambiguity is resolved by Brad's own header sentence plus first-hand slot evidence. Record
as an assumption in the next lane-1 handoff (cite this ruling's path). FAME-1B-BACKFILL remains
HOLD-for-Brad and is NOT re-asked by this ruling.

ARCH-RULING: AMENDED-A
