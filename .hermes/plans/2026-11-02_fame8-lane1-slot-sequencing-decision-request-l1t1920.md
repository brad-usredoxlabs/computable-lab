# DECISION REQUEST — lane 1 / lane 2 fleet-coder slot sequencing (FAME-8 terminus)

Requested by: lane-1 orchestrator tick l1t1920 (2026-11-02 ~19:25 EST)
Decision needed by: architect (bounded written ruling; PROVISIONAL orch rule applied meanwhile)
Unique decision path (architect writes here): `.hermes/plans/decisions/FAME8-lane1-slot-sequencing-l1t1920-ruling.md`

## Question (one sentence)
Under Brad's BRAD-BINDING corpus-priority rule (2026-11-02T17:05, "THOSE prompts should have
priority"), may a lane-1 TERMINUS fix that needs exactly ONE coder run take a genuinely free fleet
coder slot ahead of lane-2 queue items — or does lane 1 stay parked until the lane-2 corpus campaign
drains?

## Facts (all first-hand, this tick 19:20 EST, `cl-reconcile.sh 1` + `ps` + `git` + worker logs)

1. Lane-1 queue: todo 1 (FAME-1B-BACKFILL — HOLD-for-Brad, not re-asked), in-progress 1 (**FAME-8**),
   superseded 1, done 105. FAME-8 is the lane-1 campaign terminus and its ONLY remaining work is one
   coder run (GATEFIX4, a CSS-only readability fix in `app/src/analysis/**`) followed by one re-gate.
2. Coder semaphore at 19:20:
   - slot-0 HELD by lane 2 `CARD1-FIXBROWSER` (PID 3305342 launcher + hermes 3305346, launched
     18:17:34, **63 min elapsed, still alive**).
   - slot-1 **FREE** — `flock -n` succeeds; previous holder `TARGET1-3335333` (lane 2) died 19:07:57
     with `API call failed after 3 retries: inference request expired while waiting for admission`
     (33m49s into session, ZERO commits; 269 untracked lines preserved by lane 2 at
     `lanes/2/evidence/TARGET1-death-20261102T1907/`).
3. Lane 2 has dispatchable work right now: TARGET-1 recovery/re-dispatch is armed, plus 5 `todo`
   items (CHATHOST-CONSOLIDATE-1, L2-PROMPT2-GHOSTPAINT-1, L2-PROMPT2-COMPOSITION-BIND-1,
   L2-PROMPT2-SCIENCE-CHAIN-1, L2-PROMPT2-FIXTURE-BOARD-1). So by the letter of the corpus rule,
   lane 2 has a claim on any free slot.
4. Lane-1 GATEFIX4 is fully pre-built and idle-ready: worktree
   `/mnt/vast/home/brad/git/wt/FAME-8-GATEFIX4-lane1` (branch `cl/lane1-fame8-gatefix4-l1t1855`,
   HEAD 29ec4be3 pinned, checkout verified `CHECKOUT rc=0`), prompt
   `lanes/1/prompts/fame8-gatefix4-l1t1855.txt`, launcher
   `lanes/1/scripts/launch-fame8-gatefix4-l1t1855.sh` (self-gates stagger + first-free-slot + WT tip;
   exits STAGGER-BLOCKED / NO-SLOT without launching — it cannot create a third coder).
5. The fix direction is PRE-VALIDATED in-browser against the served candidate: variant A
   (`th,td{overflow-wrap:anywhere;white-space:normal}`) is sufficient — pane clientW 574 /
   scrollW 1743 / `fullyInsidePane=false` baseline flips to scrollW 574 / inside=true / flags cell
   141 px; `break-word` is a measured no-op; `table-layout:fixed` is actively harmful; honest cost is
   row-height growth 1120 → 4089 px (recorded as a required `tableH` metric in the spec). Artifacts:
   `/home/brad/.hermes/cl/receipts/fame-8-gatefix4-prerecon-l1t1900/`, spec
   `.hermes/plans/2026-11-02_fame-8-gatefix4-readability-spec-l1t1855.md`.
6. Deferral history: this is the **3rd consecutive** lane-1 tick (255th, 256th, 257th) in which lane 1
   declined a free slot because lane 2 had queued work. The 256th handoff set this as the escalation
   threshold.
7. Engine-health context: two lane-2 `request_queue_timeout`-class deaths on :18080 this evening
   (TARGET1 at 19:07; the class also triggered a stagger-window revert last tick). Lane-1's tick has
   NOT launched any coder since the FAME-8 GATEFIX3 run, so lane 1 is not the source of that pressure.

## Options (orch does NOT pick; architect rules)
- **A — terminus exception (recommended for throughput):** a lane-1 item that is the campaign
  TERMINUS and needs exactly ONE coder run may claim a free slot when lane 2's OWN live coder already
  holds the other slot (i.e. lane 2 is not idle-starved by the choice). Lane 2 keeps slot continuity
  and waits for slot-0 to free for its recovery, exactly as it would today.
- **B — strict reading:** no lane-1 coder dispatch at all while any lane-2 item is dispatchable;
  FAME-8 parks until the lane-2 corpus campaign drains. Consequence: FAME-8 stays in-progress
  indefinitely; the readability defect (D1, the campaign's last gate blocker) remains live in the
  merged product.
- **C — quota:** lane 1 gets one slot per N lane-1 ticks (e.g. every 3rd) regardless of lane-2 queue.

## Constraints any ruling must respect
- Fleet-wide hard cap stays TWO live `cl-coder` sessions (slot-0 / slot-1); never a third.
- 10-min fresh-launch stagger between :18080 coder launches, reverting to 60 min on any NEW
  `request_queue_timeout` death class (mechanical, already in `stagger-trial.log`).
- Brad's live tree (`:5174`/`:3001`, `/mnt/vast/home/brad/git/computable-lab`) untouched;
  FAME-1B-BACKFILL stays HOLD-for-Brad; no approval card for this routine sequencing choice unless the
  ruling changes product intent (it does not).

## Orch action while the ruling is pending
PROVISIONAL, conservative: lane 1 does NOT claim slot-1 this tick (option B behaviour), because a
lane-2 coder death plus armed recovery is the strongest case for lane 2 needing the slot. If the
ruling lands as A, the next tick runs the pre-built launcher unchanged — no re-work is wasted.
