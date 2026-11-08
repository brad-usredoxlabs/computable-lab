# L2-PROMPT2-FIXTURE-BOARD-1 UNIT 6 — board-gate

## Scope
Add a fail-closed `board-gate` step to the pre-run wrapper that re-seeds the board
a second time (delete+re-seed path) and asserts the cold E2 tooltip payload against
`board.expect.e2` from the board YAML.

## Changed Files
1. `.hermes/plans/harness/corpus2-board/board-gate.py` (new, 183 lines)
   - `load_expect(board_path)` reads `board.gate_url` + `board.expect.e2`
   - `_format_volume(volume_uL)` derives expected tooltip volume text via `f"{v:.1f} µL"`
   - `assert_e2(probe_payload, expect)` returns named failures for volume, rows, name, events
   - CLI: `python3 board-gate.py --board <yaml> [--probe-json <json>]`
   - Prints `BOARD-GATE PASS` or `BOARD-GATE FAIL <reason>` and exits 1 on failure

2. `.hermes/plans/harness/corpus2-board/run-gate-legs.py` (edited, 128 lines)
   - Added `BOARD_GATE` and `BOARD_YAML` constants
   - `plan()` returns 9 steps: seed-board, verify-board, reset-board, board-gate,
     workspace-reset, verify-workspace, legAB, leg3, leg4
   - Updated docstring from "exactly 7 steps" to "exactly 9 steps"

3. `.hermes/plans/harness/corpus2-board/test-run-gate-legs.py` (edited, 321 lines)
   - Updated T1: expects 9 steps with full ordered name list
   - Updated T3: verify-workspace at call 6, expects 6 invocations
   - Updated T5: 9 invocations all-green, leg indices 6-8
   - Added T7: board-gate rejects wrong volume ("200.0 µL" vs expected "100.0 µL")
   - Added T8: board-gate rejects wrong event count ("2 events" vs expected "1 event")
   - Added T9: board-gate accepts correct payload
   - Added T10: board-gate step exists at plan position 3
   - Added T11: reset-board step exists at plan position 2

## Verification Results
- Baseline (before change): `26 passed, EXIT=0`
- After change: `38 passed, EXIT=0` (12 new assertions)
- Dry-run proof: 9 JSON lines with `board-gate` at position 4 (0-indexed 3)
  Steps: seed-board, verify-board, reset-board, board-gate, workspace-reset,
  verify-workspace, legAB, leg3, leg4

## Reviewer Bait Checks
- No `100` or `Thermo DMEM` hardcoded in board-gate.py logic (grep clean)
- Volume format uses `f"{volume_uL:.1f} µL"` (U+00B5 MICRO SIGN, not U+03BC)
- Expectations read fresh from YAML per invocation (no module-level cache)
- LEG_ORDER tuple unchanged: `("legAB", "leg3", "leg4")`
- No product code modified (app/src/** untouched)
- seed-board.py, tooltip-probe.cjs, c2p1-baseline.board.yaml untouched
- Python stdlib only (json, os, sys, argparse, subprocess, importlib) + PyYAML

## Commit
`68f169e7ac87d3a73cc97afad22b0914f96d3072`
Message: "L2-PROMPT2-FIXTURE-BOARD-1 UNIT 6: add board-gate step and assertion helper"

L2-PROMPT2-FIXTURE-BOARD-1 UNIT 6 DONE 68f169e7ac87d3a73cc97afad22b0914f96d3072
