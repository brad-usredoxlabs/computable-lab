# LANE 1 TICK 256TH HANDOFF — 2026-11-02 ~19:00–19:45 EST

Every claim below is the orchestrator's first-hand observation unless marked worker-report.

## Reconciled first-hand
1. `cl-reconcile.sh 1` (19:00:38): todo 1 (FAME-1B-BACKFILL — Brad-held, NOT re-asked), in-progress 1
   (FAME-8), superseded 1, done 105. Live workers: none of THIS lane. Stack :3092 http=200,
   :5192 http=200. Queue lock FREE; lane not paused. Trunk `cl/integration-1` @ `29ec4be3` (a
   docs-only commit above the last gated candidate `746edf67`).
2. Semaphore truth re-checked by hand at 19:00, 19:03 and 19:05: `appliance2-coder-slot-0` HELD by
   `CARD1-FIXBROWSER-3305342-2026-11-02T18:17:34-05:00` and `-slot-1` HELD by
   `TARGET1-3335333-2026-11-02T18:34:08-05:00`; `ps` shows both launcher PIDs ALIVE (lane-2
   `cl-coder` processes, 46 / 30 min elapsed). `pgrep -f 'hermes -p cl-coder'` shows two coder
   processes. thunderbeast bg slots FREE (dead holders). => **no lane-1 coder dispatch was possible**,
   and lane 2 still carries 4 todo items, so the list header's BRAD-BINDING corpus priority
   (2026-11-02T17:05) independently bars a lane-1 claim even if a slot frees.
3. No lane-1 worker was live at any point in this tick; nothing to adopt, nothing to kill, no
   duplicate dispatched.
4. `corpus-state.md` absent in lane 1 → CORPUS LOOP skipped (lane 2 owns the corpus campaign).
5. FAME-8 remains the only open in-progress item and its remaining work is exactly one coder run
   (GATEFIX4). Spec was already written at the 255TH tick; this tick advanced the DISPATCH state.

## Produced this tick (real artifacts, all first-hand)
- **Worktree pre-created**: `/mnt/vast/home/brad/git/wt/FAME-8-GATEFIX4-lane1`, branch
  `cl/lane1-fame8-gatefix4-l1t1855`, off trunk tip **29ec4be3** (verified `rev-parse HEAD` =
  29ec4be3c6195d20d6e727a8560a4f8c219f3e44). Created by background unit
  `cl-l1-wt-gatefix4-l1t1900`; marker `/mnt/vast/home/brad/git/wt/.checkout-gatefix4-l1t1900.log`
  (NFS checkout is slow — ~4 min to 23% at 19:04; it completes on its own and does not touch any
  stack). Reason: take the slow checkout off the next tick's critical path.
- **Coder prompt**: `/home/brad/.hermes/cl/lanes/1/prompts/fame8-gatefix4-l1t1855.txt` — self-contained
  contract (worktree/branch/base, spec path, D1 verbatim, verified orientation, genericity rules,
  boundary `app/src/analysis/**`, required before/after evidence incl. `tableH`, turn discipline,
  end marker `FAME-8-GATEFIX4 DONE <sha>`).
- **Launcher**: `/home/brad/.hermes/cl/lanes/1/scripts/launch-fame8-gatefix4-l1t1855.sh` (`bash -n`
  clean; verified). Outer = 10-min fleet stagger gate, then FIRST-FREE-SLOT selection (slot-0 then
  slot-1, `flock -n`); inner = WT-tip pin 29ec4be3 + slot pidfile write + `hermes -p cl-coder`.
  Exits STAGGER-BLOCKED / NO-SLOT **without launching** — it can never create a third coder.
- **Fix direction PRE-VALIDATED in-browser** (this is the substantive win of the tick): orchestrator
  Playwright probe against the SERVED candidate (http://localhost:5192, worktree at 29ec4be3,
  :3092/api/health 200), 1440x900, DEFAULT 574 px pane, route `/analysis` → run
  `GATEFIX3 D1 replay` → `.view-spec[assignment_results_view]`. Script
  `scripts/fame8-gatefix4-prerecon2-l1t1915.js`; artifacts
  `/home/brad/.hermes/cl/receipts/fame-8-gatefix4-prerecon-l1t1900/` (`measure.json`,
  `00-baseline.png`, `01-<variant>.png`, `02-variantN-fullpage.png`).

  BASELINE (independently reproduces the gate's D1 numbers EXACTLY): pane clientW 574 / scrollW 1743,
  table width 1723, table height 1120, flags `td` index 9 at x 1878..2609 (730 px),
  `clientWidth 729 == scrollWidth 729`, fullyInsidePane **FALSE**.

  | variant (CSS only, injected probe style) | tableW | tableH | pane scrollW | flags cell | inside |
  |---|---|---|---|---|---|
  | A `th,td{overflow-wrap:anywhere;white-space:normal}` | 534 | 4089 | 574 | 141 px @1279..1420 | **TRUE** |
  | B `overflow-wrap:break-word;word-wrap:break-word` | 1723 | 1120 | 1743 | 730 px | FALSE |
  | C `table-layout:fixed` + anywhere | 534 | 6373 | 574 | **53 px** | TRUE (unusable column) |
  | D anywhere on `td` ONLY | 830 | 7267 | 944 | 49 px | FALSE |
  | E anywhere + `max-width:26em` | 534 | 4165 | 574 | 86 px | TRUE |
  | F anywhere + `max-width:18em` | 534 | 4451 | 574 | 74 px | TRUE |

  Conclusions recorded into the spec: **variant A alone satisfies the gating criterion**;
  `break-word` is a PROVEN no-op (byte-equal to baseline); `th` must break too (td-only leaves the
  table 830 px wide); bare `table-layout:fixed` is actively harmful; the honest cost of A is row
  height 1120 → 4089 px, which is why `tableH` is now a REQUIRED metric in the coder's evidence.
- Spec amended: `.hermes/plans/2026-11-02_fame-8-gatefix4-readability-spec-l1t1855.md` gained a final
  "Pre-validation — orchestrator-measured" section carrying the table above and the `tableH`
  requirement.
- Task list updated under the queue lock by temp-file + `os.replace` (never truncate-write): new
  `prerecon_20261103T0000Z` block on FAME-8, `blocker_next_check` → `2026-11-03T00:55:00-05:00`,
  `blocker_completed` extended, `handoff_latest` repointed. FAME-8 stays `in-progress`.
- `assumptions.md` appended (AS-L1T256-1..3).
- No coder launch → **no stagger-trial launch line**; no advc verdict → no advc line. No thunderbeast
  slot used. Brad's `:5174`/`:3001` untouched. No stack restart needed (no YAML change).

## Late-tick change in slot truth (19:08–19:11, recorded before exit)
At 19:07:57 lane-2's slot-1 coder `TARGET1` EXITED `rc=0` with
`API call failed after 3 retries: inference request expired while waiting for admission`
(33m49s into its session; its launcher log records LOCK-ACQUIRED 18:34:08 → CODER_EXITED 19:07:57).
Verified by hand: `flock -n` on `appliance2-coder-slot-1.lock` **succeeds** (slot-1 genuinely FREE,
holder dead); slot-0's `CARD1-FIXBROWSER` is still alive (PID 3305342 + hermes 3305346, 53 min).

Consequence for lane 1 — still NO dispatch:
- Lane 2 has dispatchable work and will need that slot itself (a coder death in TARGET-1 means lane 2
  must re-dispatch or recover it before anything else). The BRAD-BINDING corpus priority therefore
  still bars a lane-1 claim on the free slot. Taking it would be exactly the starvation of corpus work
  the header forbids, on the tick where lane 2 lost its coder.
- DEATH CLASS: this is a `request_queue_timeout`-class death, so per the stagger-trial rule the
  fresh-launch window **REVERTS to 60 minutes effective this tick** and no coder is launched by this
  tick. Recorded in `/home/brad/.hermes/cl/stagger-trial.log` (new last line). Honest caveat for the
  architect/Brad: the death happened 33 minutes INTO a session, not at prefill, so the 60-min window
  is not an obviously causal remedy — but the rule is mechanical and is applied as written, and the
  revert also costs lane 1 nothing this tick since priority already bars a launch.
- Worktree checkout completed cleanly and is verified: marker ends
  `CHECKOUT rc=0 head=29ec4be3c6195d20d6e727a8560a4f8c219f3e44`; the GATEFIX4 worktree is ready.
- `exa-key-tripwire.sh` run per tick: `OK: exa apiKey present and consistent across
  lane1/lane2/canonical`.

## Why no dispatch (blocker re-stated with fresh evidence)
Both fleet coder slots live-held by lane 2 (PIDs 3305342 / 3335333, verified alive 19:00–19:05) and
lane 2 has 4 dispatchable todo items ⇒ corpus priority bars lane 1. This is the **2nd consecutive
deferral** (255TH, 256TH). Recorded as AS-L1T256-3 with an explicit counter: on a 3rd consecutive
deferral this becomes a sequencing question for the architect, because the lane-1 campaign terminus
cannot close while lane 2 always has queued work.

## assumptions (256TH)
- AS-L1T256-1: GATEFIX4's worktree was created AHEAD of dispatch off 29ec4be3 to remove the slow NFS
  checkout from the next tick's critical path; the launcher pins WT HEAD to 29ec4be3 and refuses to
  launch otherwise, so a stale worktree cannot be dispatched. Falsified if a coder is ever launched
  from that worktree with HEAD != 29ec4be3.
- AS-L1T256-2: the in-browser CSS pre-validation is SPEC ORIENTATION, not gate evidence — the coder
  must still produce its own before/after measurement and a fresh cycle-3 re-gate. Falsified if
  FAME-8 is ever closed on orchestrator measurements alone.
- AS-L1T256-3: deferral correct this tick (both slots live-held by lane 2 + 4 lane-2 todos + corpus
  priority); escalation threshold = 3rd consecutive deferral. Falsified if the header rule means
  "lane 1 may take any slot that is merely free".
- AS-L1T255-1..2, AS-L1T253-1..2, AS-L1T252-1..4, AS-L1T254-1..2 CARRY FORWARD unchanged.

## evidence debt
- OPEN (gating): FAME-8 A3 readability — D1 fix not implemented. Dispatch is now a single command
  (launcher above) once priority permits. Re-gate cycle 3 owed AFTER the fix merges: legs A3-manual +
  A2-geometry + ANR-000068 regression spot, FRESH receipts dir (`receipts/FAME-8/gate3-<ts>/`), with
  the new candidate sha named. Both prior gate trails attach to any architect packet if it fails.
- OPEN (low): D2 x-tick clipping — fix-if-one-liner in the same run, else follow-up.
- OPEN follow-up: D3 `[object Object]` params cell on frozen ANR-000056 (pre-existing).
- CARRIED from 255TH unchanged: O1 run-parameter label vs CHEBI:143577 CURIE label mismatch; O3
  flag-format test-pin candidate; gate-2 observations 1-7 (incl. pre-existing red
  "Cannot render 'null_area_policy' (const)" chrome on a succeeded landed run, and A8 refusal
  rendering in the page-bottom error area rather than beside Bind); markerSaturationFlags; advc-c2
  O1-O4 close-out notes; palmitate-walk OQ-1; FAME-6 S2 narrative; intake pile O-1..O-5; W7b honesty
  flags; AS-L1T223-1 band note; AS-L1T238-4 revision-lineage; GCM-DEMO-AOAC-FAME; FL1;
  FAME-1B-BACKFILL Brad-held; gate-observations 1-6 routing; ANREV entryScript tracked-fixture note.

## Next-tick checks (priority)
1. Reconcile slot truth AND lane 2's queue. If a free coder slot exists **and** lane 2 has no
   dispatchable item → run
   `/home/brad/.hermes/cl/lanes/1/scripts/launch-fame8-gatefix4-l1t1855.sh` detached (systemd-run
   bare-path `--user --collect`); it self-gates stagger + slot + WT tip. Before launching, confirm the
   worktree checkout marker ends `CHECKOUT rc=0` and the branch HEAD is 29ec4be3; if trunk has
   advanced, re-create the worktree and re-pin. Append the stagger-trial launch line on success.
2. If priority still bars lane 1: this is the 3rd consecutive deferral → **route a sequencing
   question to the architect** (decision path
   `.hermes/plans/2026-11-03_fame8-lane1-slot-sequencing-decision-request.md`) stating: lane 2 always
   has queued work; FAME-8 is lane 1's terminus; ask whether a lane-1 terminus fix may take one slot
   ahead of lane-2 queue items, or whether FAME-8 stays parked until the corpus campaign drains. Do
   NOT re-ask the Brad-held FAME-1B-BACKFILL.
3. On GATEFIX4 DONE: advc gate (`reviews/FAME8-GATEFIX4-adv1-l1t<ts>.md`; focus: boundary exactly
   `app/src/analysis/**`, no record/artifact mutation, no flag-text change, FAME-LAYOUT-1 scroll door
   intact, before/after measurement reproducible and `tableH` reported) → orch verify the diff and
   RE-MEASURE MYSELF with the prerecon script → merge `--no-ff` → dispatch re-gate cycle 3.
4. On re-gate ACCEPT: mark FAME-8 done under the queue lock, close-out handoff, route the follow-ups.
   On FAIL: STOP — architect packet with BOTH gate-2 and gate-3 trails; no fourth blind A3 attempt.
