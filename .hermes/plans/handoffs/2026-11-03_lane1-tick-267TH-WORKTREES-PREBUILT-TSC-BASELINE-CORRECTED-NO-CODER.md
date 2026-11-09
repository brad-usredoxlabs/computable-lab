# LANE 1 TICK 267TH HANDOFF — 2026-11-03 01:40 → 02:15 EST

Lane 1 again dispatched no coder — and this tick produced the evidence that settles why: lane 2 took the
first free `:18080` slot within ten minutes of it opening (01:51:54, `L2-CLARIFY-TARGET-1-wellsfix`, pid
130357/130362), exactly the capacity Brad's 2026-11-02T17:05 corpus priority reserves. So the budget
went to the one thing that makes the eventual lane-1 dispatch start instantly and not waste a slot on
environment failure: **both coder worktrees are now pre-built at trunk `1a443259`, and every baseline
the two specs assert was MEASURED inside them** — which immediately exposed a wrong number in both
specs (the app tsc baseline is per-worktree, not a single fleet number) and corrected it before any
coder could inherit it.

Every claim below is my own first-hand observation unless marked otherwise.

## Reconciled first-hand
1. `cl-reconcile.sh 1` (01:40:44): todo **4**, in-progress **none**, superseded 1, done 106; fleet live
   workers **none**; both `:18080` slot pid files DEAD-holder (`TARGET1-CONT-3850850-2026-11-02T22:32:49`,
   `L2-PROMPT2-DATA-DUP-RECORDS-1-4083023-2026-11-03T00:13:23`); thunderbeast bg slots free/dead; trunk
   `cl/integration-1` @ **1a443259**; `:3092` + `:5192` both http 200; queue lock free; lane not paused.
2. Read the 266TH handoff in full (its expected shape matched reality: 4 todos, none in-progress, trunk
   one docs commit further on).
3. `corpus-state.md` **absent** in lane 1 ⇒ CORPUS LOOP (SOUL step 10) skipped; lane 2 owns the campaign.
4. `exa-key-tripwire.sh` → `OK: exa apiKey present and consistent across lane1/lane2/canonical`.
5. Brad-answer sweep: no new file in `~/.hermes/specs/inbox/` (newest 2026-10-03) and no new decision or
   answer since the 266TH close. `FAME-1B-BACKFILL` stays HOLD-for-Brad and was **not re-asked**
   (unchanged question; silence is not approval).

## Why no coder again — and why that is now measured, not assumed
1. **Lane 2 owns the slot and used it.** Lane 2's own 01:30 handoff names its next action as the
   TARGET-1 continuation coder run (the dead continuation left app-side work uncommitted). It launched
   that run at **01:51:54** into slot-0: `pgrep -af 'hermes -p cl-coder'` → pid 130362, and
   `appliance2-coder-slot-0.pid` = `TARGET1-WELLSFIX-130357-2026-11-03T01:51:54-05:00`; lane-2 log
   `logs/coder-TARGET1-wellsfix-l2t2320.log` shows `LAUNCH outer 130349` + `LOCK-ACQUIRED 130357 slot=0`.
   Slot-1 held only the DEAD DATA-DUP pid file.
2. Therefore the corpus-priority rule (list header, Brad-binding 2026-11-02T17:05) applies at full
   strength: a slot was free, lane 2 had coder-ready corpus work, and lane 1 does not claim. Two idle
   ticks with the slots held by *live* lane-2 coders plus this tick's 10-minute reuse is consistent,
   direct evidence that the priority is protecting real consumption — not idling capacity.
3. **Stagger window restored to 10 minutes (the 266TH revert lapsed).** No NEW
   `request_queue_timeout` death and no >200K payload after the 01:11:52 admission expiry (the 01:16:12
   TARGET-1 death is the separate output-budget class the 266TH already classified); `STAGGER_SECS=600`
   in both lane-1 launchers was never changed. Logged to `stagger-trial.log`.
4. **Trial log correction, appended not rewritten.** My first 01:57:58 line said "both slots free/dead"
   — true at 01:40, stale by then: slot-0 was taken at 01:51:54. A second line at 01:58:08 corrects it
   with the pgrep + pid-file evidence. Append-only was honoured; the wrong sentence stays visible.

## Work done this tick (no product code, no merges)
1. **Both coder worktrees pre-built** at trunk `1a443259`, detached from the tick so they survive its
   exit: `systemd-run --user --collect --unit=cl-l1-precheckout-l1t0140 /tmp/l1-precheckout-1.sh`
   running the two existing checkout units in sequence. Results read from the units' own logs:
   `checkout-L1-PIN-HARDEN-1-l1t0020.log` → `CHECKOUT rc=0 2026-11-03T01:51:40` (BASE=1a443259…),
   `checkout-L1-CELLRENDER-1-l1t0057.log` → rc=0, harness aggregate `CELL rc=0` /
   `PRECHECKOUT-END 2026-11-03T02:01:12`. Both worktrees verified clean and at `1a443259`
   (`/mnt/vast/home/brad/git/wt/l1-pin-harden-1-lane1`, `…/l1-cellrender-1-lane1`). This removes the
   two dispatch-time failure modes the lane has actually suffered: a ~10-minute NFS checkout inside the
   dispatch window, and the FAME-4G precedent where a launcher fired against a half-copied tree.
2. **Baselines MEASURED inside those worktrees — and one spec number proved wrong for a coder.**
   - `l1-pin-harden-1-lane1/app`: `npx vitest run src/analysis/ViewRenderer.cellrender.test.tsx` →
     **8 tests passed (1 file), exit 0** (RUN v1.6.1, duration 16.90 s).
   - `l1-pin-harden-1-lane1/app`: `npx tsc --noEmit -p tsconfig.json` → **exit 2, 12 `error TS` lines,
     0 in `src/analysis/`**.
   - trunk `cl-integration-1/app`, same command → **exit 2, 21 lines, 0 in `src/analysis/`**.
   The two totals are NOT interchangeable: a fresh worktree carries no `app/node_modules` package graph,
   so tsc resolves app-level packages through the `/mnt/vast/home/brad/git/wt/node_modules` symlink (the
   live tree's root) and the error SETS differ — the 6
   `src/shared/hooks/useAiChat.surfaceContext.test.ts` lines exist only in the trunk layout. Both specs
   had pinned "21" as the ceiling a coder "must not exceed", which a coder in a worktree can never see;
   an adversarial reviewer would have called the mismatch a defect. **Corrected in both specs to a
   per-worktree bar** (no NEW lines vs the coder's own start-commit measurement, 0 in `src/analysis/`;
   trunk 21 is the post-merge check). Prior art agrees: the FAME-8-GATEFIX5 coder measured 12/12 in its
   worktree and advc cycle-2 accepted it — the pipeline was already living with this, undocumented.
   - `l1-cellrender-1-lane1/app`: `npx vitest run src/analysis/ViewRenderer` → **5 files / 54 tests
     passed** (compat 5, signal 13, artifact-table 13, cellrender 8, ViewRenderer 15), duration 13.26 s;
     recorded in the spec as the floor the 6 new arms sit on.
3. **Every load-bearing anchor re-verified first-hand at `1a443259`** (not carried from the 266TH):
   `ViewRenderer.cellrender.test.tsx` `parseCssRules` :38, `splitSelectorParts` :71,
   `isTableCellSelectorPart` :100; `ViewRenderer.tsx` `cellContent` :84-95 / `String(e)` :89 /
   `String(value ?? '')` :93 / `TableView` :104 (takes `{ artifact }` only) / `ArtifactTable` :170
   (`{ artifact, bindings }`). Trunk drift is docs-only: `git diff --stat 3363a3fa..HEAD` = the two
   specs + the 266TH handoff, and `git -c core.fileMode=false diff --stat e8ce5621..HEAD --
   app/src/analysis/` is **EMPTY**. `AnalysisPage.css`: **zero** `@media`/`@supports` (the PIN-HARDEN
   premise holds), `break-word` floor at :118, `.analysis-right { overflow: auto }` at :80.
4. **Specs corrected in place (docs only)**: PIN-HARDEN criteria 1 (8-test floor) and 3 (per-worktree
   tsc bar + the measured cause); CELLRENDER orchestrator-verification block (54-test floor + the same
   baseline correction, naming which worktree was measured). Both remain dispatch-ready; no prompt or
   launcher needed a change (the prompts already said "compare to the baseline you measure at your start
   commit").
5. **Task list annotated under the queue lock** (`flock -n task-list.lock`, staged temp + `os.replace`,
   never `open('w')`): a 267TH block under `L1-PIN-HARDEN-1` and `L1-CELLRENDER-1` recording the
   pre-built worktrees, the measured baselines, the spec corrections and the live lane-2 slot evidence.
   1038998 → 1040243 bytes, 12260 → 12271 lines; **still 4 todos, no status changed**, nothing claims a
   slot for a later tick.

## Not done this tick (deliberate, with reasons)
- **No coder** — corpus priority with live evidence (lane 2 launched into the free slot at 01:51:54).
- **No cl-spec-composer** — no item needs a new spec (`L1-PIN-HARDEN-1` and `L1-CELLRENDER-1` are specced
  and now baseline-measured, `L1-PARAMS-EMITTER-RIDER` is rider-triggered and must not open its own
  cycle, `FAME-1B-BACKFILL` is Brad-HOLD).
- **No adversarial review / browser gate / merge** — nothing was produced and no product surface changed.

## assumptions
- AS-L1T267-1 (no coder): the only free slot at launch time was being consumed by lane 2 inside ten
  minutes, so honoring corpus priority cost lane 1 nothing that was actually available. Evidence:
  pgrep + slot-0 pid file + lane-2 log line, all read first-hand. debt: false.
- AS-L1T267-2 (baseline divergence): I attribute the 12-vs-21 tsc split to the missing worktree
  `app/node_modules` package graph (resolution through the `.../wt/node_modules` symlink) because (a) the
  two commands are identical, (b) the commit is identical, (c) the error SETS differ exactly by files
  whose types resolve differently, and (d) the FAME-8-GATEFIX5 coder independently measured 12/12 in a
  worktree at an older base. I did not bisect the node_modules graph itself. If a future coder reports a
  third number, the bar still holds (no NEW lines vs its own start commit, 0 in `src/analysis/`).
  debt: false.
- AS-L1T267-3 (pre-checkout is safe): pre-building the worktrees changes nothing the launchers depend on
  except time — the checkout units exit 0 with "worktree already present", the launchers gate on the
  `CHECKOUT rc=0` marker (now present), and no coder can start while no slot is claimed. Both worktrees'
  HEADs are pinned at `1a443259`; if trunk advances before dispatch the merge is still a no-ff merge of a
  slightly older base, which is this lane's normal pattern. debt: false.
- AS-L1T267-4 (trial log): I appended a correction line instead of editing the wrong one; append-only was
  honoured even at the cost of the record showing its own error. debt: false.
- AS-L1T266-1..5, AS-L1T265-1..4 and all earlier entries CARRY FORWARD unchanged.

## evidence debt
- **OPEN**: advc3 O1 nesting evasion → `L1-PIN-HARDEN-1` (todo, dispatch-ready, **worktree pre-built at
  `1a443259`**, baselines measured). Cleared when its merged test fires on the O1 fixture.
- **OPEN**: object cell `[object Object]` → `L1-CELLRENDER-1` (todo, spec'd, **worktree pre-built**,
  artifact ids AOUT-000100 / AOUT-000136 pinned). Cleared when its merged renderer + browser leg show a
  readable `params` cell.
- **OPEN, rider-triggered**: `assignment-contested-entry.py:709` publishes a dict behind a declared
  `type: string` column → `L1-PARAMS-EMITTER-RIDER` (mandatory in the next `scripts/fame-gatefix/`
  re-mint; must not open its own cycle).
- **NEW, INFORMATIONAL (no item)**: worktree-vs-trunk tsc totals diverge (12 vs 21) because a fresh
  `git worktree` has no `app/node_modules` package graph. Recorded in both specs as the governing bar.
  A future harness improvement could prepare the worktree's package graph at checkout time; it is not a
  correctness issue today and no tick should file it alone.
- **OUT OF SCOPE BY RULING**: artifact-table column-type validation (`ctx.publish`) is a FUTURE campaign
  with a stated prerequisite order. Do not file it alone; do not re-derive it.
- **CARRIED, unchanged**: `tsx --watch` unusable on this NFS checkout (lane 1 runs watch-less); FAME-8
  D2 x-tick clipping; O1 run-parameter label vs CHEBI:143577 CURIE label; flag-format test-pin
  candidate; gate-2 observations 1–7; markerSaturationFlags; advc-c2 O1–O4 close-out notes;
  palmitate-walk OQ-1; FAME-6 S2 narrative; intake pile O-1..O-5; W7b honesty flags; AS-L1T223-1 band
  note; AS-L1T238-4 revision-lineage; GCM-DEMO-AOAC-FAME; FL1; FAME-1B-BACKFILL Brad-held;
  gate-observations 1–6 routing; ANREV entryScript tracked-fixture note; the 4165 px table-height
  trade-off (gate 4 measured 2947 px for 31 rows, −29%, non-gating).
- **Brad's morning digest should carry**: lane 1 has now idled three ticks, and the reason is measured,
  not suspected — lane 2 re-took the free slot within ten minutes (01:51:54) for its corpus
  continuation. Lane 1 is not the bottleneck: `L1-PIN-HARDEN-1` and `L1-CELLRENDER-1` are dispatch-ready
  with pre-built worktrees and measured baselines, so the moment a slot is free with no lane-2 queue,
  dispatch is a single `systemd-run`. If he wants lane 1 to move regardless of the corpus queue, that
  remains a priority ruling only he can make.

## Next-tick checks (priority)
1. `cl-reconcile.sh 1`; read this handoff. Expected: todo 4 (FAME-1B-BACKFILL Brad-HOLD,
   L1-PIN-HARDEN-1, L1-CELLRENDER-1, L1-PARAMS-EMITTER-RIDER), in-progress none, done 106, trunk
   `1a443259` + this docs commit.
2. **Slots**: check `pgrep -af 'hermes -p cl-coder'` AND both pid files (reconcile's "live workers: none"
   is wrong for systemd-hosted coders); lane 2 first (corpus priority).
3. **First free `:18080` slot with no lane-2 coder-ready work**: the checkouts are DONE — go straight to
   `systemd-run --user --collect --unit=cl-l1-coder-pinharden1-l1t0020
   /home/brad/.hermes/cl/lanes/1/launchers/launch-L1-PIN-HARDEN-1-l1t0020.sh` (no `-t`; prompt
   `prompts/coder-L1-PIN-HARDEN-1-l1t0020.txt`; write the trial-log launch line).
4. `L1-CELLRENDER-1` second (same slot discipline, 10-min stagger):
   `--unit=cl-l1-coder-cellrender1-l1t0057`, prompt `prompts/coder-L1-CELLRENDER-1-l1t0057.txt`.
5. After each coder exit: `cl-adversarial-reviewer` (OpenRouter, unique report path) → FIX routed by
   defect class (paperwork-fixer for evidence-trail only, else coder) → my own vitest + tsc + diff →
   `git -c core.fileMode=false merge --no-ff` → `L1-CELLRENDER-1` also needs the browser gate on
   `:5192`/`:3092` using the PINNED legs AOUT-000100 / AOUT-000136 plus the `analyte_summary` regression.
6. If no slot frees again: another no-slot task over an idle spin. `L1-PARAMS-EMITTER-RIDER` must NOT be
   dispatched on its own.
