# L2-PROMPT2-FIXTURE-BOARD-1 UNIT u2 Report

## Unit: 2 of 3 (cold tooltip probe = AC-1 instrument)

## Status: BLOCKED

## RED Phase Evidence

Direct hover without clicking lawn tile times out as expected:
```
RED PASSED: deck did not appear - must click lawn tile first
Error: page.waitForSelector: Timeout 3000ms exceeded.
```

This confirms R16: the deck must be opened from the lawn before hovering.

## Probe Script

Created `.hermes/plans/harness/corpus2-board/tooltip-probe.cjs` (85 lines).
- Uses `playwright chromium` with fresh `browser.newContext()` per run (cold context)
- Accepts `--url`, `--wells`, `--out` arguments
- Clicks `.lawn__tile-anchor .tile` before hovering (R16)
- Reads `.well-tooltip__volume`, `.well-tooltip__material-name/-conc/-vol`, `.well-tooltip__meta`
- Emits JSON `{well, tipVolume, tipRows, tipMeta}` per well
- Takes one PNG screenshot per well to `shots/`
- Exits nonzero if any well produced no tooltip

## Verification Results

Run: `node .hermes/plans/harness/corpus2-board/tooltip-probe.cjs --url http://localhost:5193/project/STU-scratch/event-graph/EVG-corpus2-prompt1-dmem-baseline --wells E2,A2,D5,H5,A1 --out /home/brad/.hermes/cl/receipts/CORPUS2-BOARD-20261105T151500/tooltip.json`

Results:
- E2: volume="304.0 µL", 4 rows, 7 events applied (EXPECTED: 100.0 µL, 1 row, 1 event)
- A2: volume="100.0 µL", 1 row, 1 event applied (CORRECT)
- D5: volume="100.0 µL", 1 row, 1 event applied (CORRECT)
- H5: volume="100.0 µL", 1 row, 1 event applied (CORRECT)
- A1: volume="0 µL", 0 rows, no meta (CORRECT)

## Blocker: E2 Shows 304.0 uL Instead of 100.0 uL

The E2 well displays 304.0 µL with 4 material rows and 7 events instead of the expected 100.0 µL / 1 row / 1 event.

Root cause: The app merges events from `EVG-cellrox-flow-cytometry-assay-kits-method-bda3685b` (in the same run `RUN-2026-09-07-run-nzrs`, sharing `labwareId: lbw-seed-plate-96-flat`). This legacy graph has events that specifically target E2:
- evt-add_material-3to51ucp: Clofibrate, 1 uL (E2 only)
- evt-add_material-klh1bpqc: 1 mM Clofibrate in DMSO, 1 uL (E2 only)
- evt-add_material-ojuttom3: 1 mM Clofibrate in DMSO, 1 uL (E2 only)
- evt-add_material-qnt9l5he: Clofibrate, 1 uL (E2 only)

The fixture board itself is correct:
- `seed-board.py --verify` passes: events=2, labwares=1, volume.value=100, wells=32
- Record payload has only the baseline events

## Changed Files

- `.hermes/plans/harness/corpus2-board/tooltip-probe.cjs` (new, 85 lines)

## Git State

```
git commit 78bc29ef: L2-PROMPT2-FIXTURE-BOARD-1 u2: add tooltip-probe.cjs
```

## Next Actions (Orchestrator Required)

1. Determine whether the app's merging of events from multiple graphs in the same run is intended behavior or a defect
2. If intended: decide whether E2 should be excluded from AC-1 or the board should use a different labwareId
3. If defect: fix in product code (outside this unit's scope)
4. Alternative: use a different run/study context where the legacy graph doesn't exist

## Receipt Artifacts

- `/home/brad/.hermes/cl/receipts/CORPUS2-BOARD-20261105T151500/tooltip.json`
- `/home/brad/.hermes/cl/receipts/CORPUS2-BOARD-20261105T151500/shots/` (5 PNGs)

L2-PROMPT2-FIXTURE-BOARD-1-u2 UNIT unit BLOCKED E2 shows 304.0 uL due to merged events from bda3685b
