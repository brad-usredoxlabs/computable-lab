# LANE 1 TICK 279TH HANDOFF — 2026-11-03 08:40 → 09:05 EST

One line: **no lane-1 item is dispatchable (one frozen on Brad's card, one Brad-held, one rider-triggered), and the
278TH handoff's carried `/analysis` layout follow-up was FALSIFIED by my own measurement instead of being converted
into an architect amendment and a coder cycle.** No code changed; no coder slot taken from lane 2's live corpus run.

## Reconciled first-hand (`cl-reconcile.sh 1` @ 08:40:49)

todo **2**, in-progress **none**, blocked **1**, superseded **1**, done **107**; task-list mtime 08:03, 1,076,491 bytes.
Trunk `cl/integration-1` @ **`a81660b5`** (the 278TH docs-only commit), `:3092` and `:5192` both **http 200**, queue
lock FREE, lane not paused. Fleet: ONE live coder — lane 2's `hermes -p cl-coder` pid 935457, `L2-CLARIFY-TARGET-1`
wellsfix-fix3, slot-0 held since **08:18:05**; slot-1 FREE with a dead pid (`CHATHOST-CONSOLIDATE-1` from 04:22).
Both thunderbeast bg pid files dead. `corpus-state.md` absent in lane 1 ⇒ CORPUS LOOP skipped.
`exa-key-tripwire.sh` → **OK** (consistent across lane1/lane2/canonical).

## Blocker: L1-PIN-HARDEN-1 — unchanged, NOT re-asked

`md5sum .hermes/plans/2026-11-03_l1-pin-harden-1-freeze-brad-card.md` = **`bc9cd6d91186806b4854155968a21cda`**,
byte-identical to the 274–278TH records; no answer block, no `L1-PIN-HARDEN-1-fix3-AUTHORIZED` marker. No human
present ⇒ nothing to read, question not re-asked. Item stays `blocked`, owner Brad, branch
`cl/lane1-pin-harden-1-l1t0020` unmerged at `6ea3ec29`, tree clean.

## What this tick actually did: it did NOT spend a cycle on a phantom defect

The 278TH handoff carried a "NEW (follow-up)" evidence-debt line from the L1-CELLRENDER-1 gate:

> result tables 1044–1363 px inside a 455 px right pane (`overflow-x: visible`, pane scrollWidth 1363) … columns 3+
> visible only by **page-level** horizontal scroll … the rotated "UNCALIBRATED" badge overlaps the run title and the
> Compare button.

The handoff's next-step 4 was to file that as its own scoped item, which under the standing rules means an architect
scope amendment and a coder run. Before requesting either, I measured it myself on the merged trunk with Playwright
(this is the orch deterministic-script-then-judge route, not a reviewer's word):

| viewport | pane (`[data-testid=analysis-right]`) | overflow-x | clientWidth | scrollWidth | maxScrollLeft | document scrollWidth vs clientWidth | badge vs title / Compare |
|---|---|---|---|---|---|---|---|
| 1024×768 | 408 px | auto | 408 | 1383 | **975** | 1024 = 1024 | no / no |
| 1280×800 | 510 px | auto | 510 | 1383 | **873** | 1280 = 1280 | no / no |
| 1366×768 | 544 px | auto | 544 | 1383 | **839** | 1366 = 1366 | no / no |
| 1440×900 | 574 px | auto | 574 | 1383 | **809** | 1440 = 1440 | no / no |
| 1600×900 | 638 px | auto | 638 | 1383 | **745** | 1600 = 1600 | no / no |

Also measured: the react-resizable-panels wrapper `.cl-workspace__pane--right` is `overflow:hidden` with
`scrollWidth == clientWidth` (nothing is clipped **before** the door), every tested table's **last cell is inside the
pane viewport** after the pane scrolls, and `span.results-provenance--uncalibrated` is a 107×84 rotated box that clears
both the title and the Compare button at all five widths (tightest gap ≈ 9 px at 1280×800).

**Conclusion.** `FAME-LAYOUT-1`'s door (`AnalysisPage.css` `.analysis-right { overflow:auto }`) is effective exactly as
accepted in the 248TH tick (rule A3-r1: fit OR the pane's door with `maxScrollLeft > 0`). The gate's sentence
describes the **wrapper** element (`.cl-workspace__pane--right`, a react-resizable-panels Panel) as if it were the
scroll container, and its "page-level scroll" claim is contradicted by `document.scrollWidth == clientWidth` at every
width tested. There is no layout defect to amend scope for, so **no task was filed, no architect card was raised, and
no coder minute was spent.** The follow-up evidence-debt entry is CLOSED with evidence instead of rotting as a task.

Residual risk recorded honestly (NOT a task): the badge box sits only ≈9 px from Compare at 1280×800, so viewports
**below 1024 px were not tested**; if Brad's morning click-test ever happens on a narrower window, that is the first
thing to measure.

Receipts: `~/.hermes/cl/receipts/L1-LAYOUT-OBS-1/tick-279TH/` — `pane-overflow-measurement.json` (table/pane/last-cell
reachability at 1440×900 + wheel-door test + console errors `[]`), `pane-viewports-1280-1366-1600.json`,
`pane-viewport-1024.json`, `badge-scan-1440.json`, the four driver scripts, and `served-and-trunk-revision.txt`
(trunk `a81660b5d7029160a37a356bc91285c75919f335` served by the lane's :5192 dev server).

## Why no coder was dispatched

- `L1-PIN-HARDEN-1` — frozen by architect DECISION A on Brad's card (unchanged md5).
- `FAME-1B-BACKFILL` — standing Brad hold (AS-L1T229-3 / AS-L1T278-3); the one-line question is already surfaced and
  unchanged, so it was not re-asked.
- `L1-PARAMS-EMITTER-RIDER` — rider-triggered; no `scripts/fame-gatefix/` re-mint is open this tick, and the item
  explicitly forbids opening a cycle for itself.
- Corpus priority (Brad 2026-11-02T17:05): lane 2 has 5 in-progress items and its coder was live on appliance-2's
  slot-0; the free slot-1 was left for lane 2 rather than used for zero-ready lane-1 work.

## Assumptions

- **AS-L1T279-1** The 278TH gate observations 1–2 are a wrapper-vs-scroll-container mis-measurement, not a layout
  defect; therefore no new item/amendment. Grounds: the five-viewport measurement above. Scope of the claim: viewports
  ≥ 1024 px wide, `/analysis?run=ANR-000056` and the same geometry on the untouched tables. **debt: false.**
- **AS-L1T279-2** No coder slot was claimed because lane 1 had nothing dispatchable and lane 2 held corpus priority.
  **debt: false.**
- AS-L1T278-1..4, AS-L1T277-1..2, AS-L1T276-1..2, AS-L1T275-1..4 and all earlier entries CARRY FORWARD unchanged
  (AS-L1T278-3, the `FAME-1B-BACKFILL` Brad-hold, remains **debt: TRUE**).

## Evidence debt after this tick

- **OPEN (frozen to Brad)**: the CSS-scanner nesting evasion → `L1-PIN-HARDEN-1`; cleared only by Brad's A/B/C
  (card md5 `bc9cd6d9…`).
- **OPEN (producer half)**: `scripts/fame-gatefix/assignment-contested-entry.py:709` still publishes a dict behind a
  declared `type: string` → `L1-PARAMS-EMITTER-RIDER`, mandatory at the next re-mint of that script.
- **CLOSED THIS TICK**: the `/analysis` "455 px pane / page-level scroll / badge overlap" follow-up — falsified by
  measurement, receipts above. Not carried forward as a defect (only the sub-1024 px untested caveat is noted).
- **CARRIED, unchanged**: every line of the 278TH handoff's carried list except the follow-up above
  (worktree `app/node_modules` emptiness + trunk-binary invocation rule; `.view-spec__cell-item` third direction;
  PIN-HARDEN spec `@media/@supports/@layer` vs `@container`; worktree-vs-trunk tsc divergence 12 vs 21;
  artifact-table column-type validation = FUTURE CAMPAIGN by ruling; `tsx --watch` unusable on NFS; FAME-8 D2 x-tick
  clipping; O1 run-parameter label vs CHEBI:143577; markerSaturationFlags; advc-c2 O1–O4; advc2 O3/O4; the intake
  pile O-1..O-5; W7b honesty flags; GCM-DEMO-AOAC-FAME; FL1; FAME-1B-BACKFILL Brad-held; ANREV entryScript
  tracked-fixture note; the 4165 px table-height trade-off; re-probe observation O-4).

## Next-tick checks (priority)

1. `cl-reconcile.sh 1`; read this handoff. Expected: todo 2, in-progress none, blocked 1, done 107; trunk `a81660b5`
   or later (this handoff adds one docs commit).
2. **Brad card answered?** `md5sum .hermes/plans/2026-11-03_l1-pin-harden-1-freeze-brad-card.md` — differs from
   `bc9cd6d9…` ⇒ read it. **A** → `L1-PIN-HARDEN-1-fix3-AUTHORIZED` + fix3 launcher + re-probe + merge.
   **B** → merge `6ea3ec29` + documented hole + follow-up item. **C** → reset branch to `1a443259`, close.
3. **`FAME-1B-BACKFILL`**: still needs Brad's one-line go (data-only, existing classifier, ACQP-000006/000008). Do not
   re-ask; surface it at the next human contact.
4. Do **not** re-file the `/analysis` pane-width item — it is measured and closed (receipts path above). If a future
   gate reports "page-level horizontal scroll" on `/analysis`, check whether the reviewer measured
   `.cl-workspace__pane--right` instead of `[data-testid="analysis-right"]` before opening any cycle.
5. Cycle hygiene unchanged: trunk binaries with the worktree as cwd, never `npx`/`npm ci`/symlinked `node_modules`;
   after any schema/lint/ui/lifecycle YAML merge, restart the lane stack and re-prove the served revision.
