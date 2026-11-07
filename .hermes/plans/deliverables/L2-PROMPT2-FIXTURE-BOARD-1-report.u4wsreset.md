# L2-PROMPT2-FIXTURE-BOARD-1 — Unit u4wsreset Report

## Task
Make the fixture-board harness normalise `records/studies/STU-scratch/workspace.yaml` to the board's DECLARED tab set before every pre-run, so the legacy `tab-deck-EVG-cellrox...` tab can no longer appear (or win first paint) in the prompt-2 gate.

## Acceptance Criteria
1. `--seed` resets workspace to exactly the declared tabs
2. `--workspace-reset` standalone mode PUTs the declared state
3. `--verify-workspace` GETs and asserts no undeclared tabs
4. `--check` and `--verify` behavior unchanged
5. No product code changes

## RED Phase

### Pre-Seed Workspace State (Polluted Pre-Image)
```json
{
  "state": {
    "version": 3,
    "studyId": "STU-scratch",
    "tabs": [
      {"id": "details:STU-scratch", "kind": "project-details", "title": "Project"},
      {"id": "tab-deck-EVG-cellrox-flow-cytometry-assay-kits-method-bda3685b", "kind": "deck", "eventGraphId": "EVG-cellrox-flow-cytometry-assay-kits-method-bda3685b", "title": "EVG-cellrox-flow-cytometry-assay-kits-method-bda3685b"},
      {"id": "tab-deck-EVG-corpus2-prompt1-dmem-baseline", "kind": "deck", "eventGraphId": "EVG-corpus2-prompt1-dmem-baseline", "title": "EVG-corpus2-prompt1-dmem-baseline"},
      {"id": "tab-deck-EVG-mvy8xmjf-5fy2", "kind": "deck", "eventGraphId": "EVG-mvy8xmjf-5fy2", "title": "EVG-mvy8xmjf-5fy2"}
    ],
    "activeTabId": "tab-deck-EVG-cellrox-flow-cytometry-assay-kits-method-bda3685b",
    "rightPaneMode": "ai",
    "rightPaneCollapsed": false,
    "paneWidths": {"left": 0.6, "right": 0.4}
  }
}
```

### RED Result: Legacy Tab Survived --seed
After running `--seed`, GET shows 4 tabs with the legacy cellrox tab still present and active.

## --verify Baseline (Pre-Existing, Unchanged)
`--verify` exits 1 with "payload mismatch" — keys match but nested values differ.
Pre-change output:
```
verify: payload mismatch
  stored keys: ['editorLayout', 'events', 'id', 'kind', 'labwares', 'links', 'methodContext', 'name', 'status']
  expected keys: ['editorLayout', 'events', 'id', 'kind', 'labwares', 'links', 'methodContext', 'name', 'status']
```

## Changes Made

### 1. c2p1-baseline.board.yaml — Added `workspace:` block
Added a `workspace:` section declaring the exact workspace state:
- 2 tabs (details and fixture deck)
- activeTabId set to the fixture deck tab
- rightPaneMode: find, rightPaneCollapsed: false

### 2. seed-board.py — Added workspace reset logic
- `do_workspace_reset(api_base)`: reads workspace block from YAML, PUTs it, verifies response
- `do_verify_workspace(api_base)`: GETs workspace, asserts all tabs are declared
- `--workspace-reset` CLI flag
- `--verify-workspace` CLI flag
- `do_workspace_reset` called at end of `do_seed` and `do_reset`

## GREEN Verification

### GREEN After Implementation
After re-PUTting the polluted 4-tab state and running `--seed`:
```
record exists (reused): EVG-corpus2-prompt1-dmem-baseline
workspace: 2 tabs, activeTabId=tab-deck-EVG-corpus2-prompt1-dmem-baseline
```

### --verify-workspace
```
workspace: 2 tabs, activeTabId=tab-deck-EVG-corpus2-prompt1-dmem-baseline — all declared
```

### --workspace-reset idempotence (run twice, byte-identical)
```
workspace: 2 tabs, activeTabId=tab-deck-EVG-corpus2-prompt1-dmem-baseline
workspace: 2 tabs, activeTabId=tab-deck-EVG-corpus2-prompt1-dmem-baseline
Tab arrays: byte-identical (diff returned 0)
```

### --check (unchanged)
```
check: 2 events, 1 labware, 32 wells, volume.value=100
```

### --verify (pre-existing mismatch unchanged)
Before and after: identical output
```
verify: payload mismatch
  stored keys: ['editorLayout', 'events', 'id', 'kind', 'labwares', 'links', 'methodContext', 'name', 'status']
  expected keys: ['editorLayout', 'events', 'id', 'kind', 'labwares', 'links', 'methodContext', 'name', 'status']
```

### py_compile
```
exit 0
```

### grep guard (no hardcoded literals in seed-board.py)
```
No matches — PASS
```

### --verify before/after pair (unchanged)
Before: `verify: payload mismatch` (exit 1)
After: `verify: payload mismatch` (exit 1) — IDENTICAL

### Line count
seed-board.py: 252 lines (+69 lines added to original 183)
c2p1-baseline.board.yaml: 95 lines (+15 lines added to original 80)
Total new lines: 84 (within 120 budget)

L2-PROMPT2-FIXTURE-BOARD-1 UNIT u4wsreset DONE bb436f4ec7bbe298556d589841082d635a0083f0
