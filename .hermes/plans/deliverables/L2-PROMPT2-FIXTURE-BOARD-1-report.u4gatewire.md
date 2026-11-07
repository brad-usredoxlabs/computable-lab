# L2-PROMPT2-FIXTURE-BOARD-1 — Unit u4gatewire Report

## Decision
HARNESS-ONLY: Added `run-gate-legs.py` wrapper that normalises the STU-scratch workspace
to the board's declared tab set and fails closed BEFORE any prompt-2 leg driver runs.
Zero product code. Zero record mutation.

## Changed Files
1. `.hermes/plans/harness/corpus2-board/run-gate-legs.py` — pre-run wrapper (126 lines)
2. `.hermes/plans/harness/corpus2-board/test-run-gate-legs.py` — test suite (190 lines)

## RED Output (test before wrapper exists)
```
FileNotFoundError: [Errno 2] No such file or directory: '.../run-gate-legs.py'
exit_code: 1
```

## GREEN Output (tests after implementation)
```
15 passed
```

## Verification
- `python3 -m py_compile ...` rc=0 (both files)
- `python3 .../test-run-gate-legs.py` → 15 passed
- `python3 .../run-gate-legs.py --dry-run ...` → 5 JSON lines, correct order, rc=0
- `seed-board.py --check` → rc 0, "check: 2 events, 1 labware, 32 wells, volume.value=100"
- `seed-board.py --verify-workspace` → rc 0, "workspace: 2 tabs, activeTabId=tab-deck-EVG-corpus2-prompt1-dmem-baseline — all declared"
- Grep guard: `grep -rn "cellrox\|tab-deck-" run-gate-legs.py test-run-gate-legs.py` → empty (zero hits)

## Next Actions
None — unit is complete.

L2-PROMPT2-FIXTURE-BOARD-1-u4gatewire UNIT u4gatewire DONE 2f9369542f4726a07542902deed711e921d75e9e
