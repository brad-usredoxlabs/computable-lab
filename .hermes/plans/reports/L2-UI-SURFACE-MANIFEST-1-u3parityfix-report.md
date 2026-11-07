# L2-UI-SURFACE-MANIFEST-1 — u3parityfix Report

## Summary

Fix `resolve_import()` in `scripts/check-ui-surfaces.py` to strip `.js` from NodeNext-style import specifiers, so `app/src/run/PromoteToProtocolModal.tsx` resolves correctly and is no longer listed as a false orphan. Also make unresolvable imports record a miss instead of silently inventing a `…<spec>.tsx` path.

## Root Cause

`resolve_import()` received `../../run/PromoteToProtocolModal.js` from `app/src/graph/execution/ExecutionView.tsx:15`. `os.path.normpath()` produced `…/PromoteToProtocolModal.js`. No candidate matched that exact path, and the dead arm at line 248 (`if resolved.endswith(".tsx")`) never fired. The fallback returned `…/PromoteToProtocolModal.js.tsx` (nonexistent), so the real edge was lost.

## Changes

### scripts/check-ui-surfaces.py

- Added module-scope `unresolved_imports` list (line 29)
- In `resolve_import()` (line 246): strip trailing `.js` before candidate probes
- Removed dead arm (old line 248, `resolved.endswith(".tsx")`) that never matched
- Changed fallback to append `(source_file, rel_path)` to `unresolved_imports` instead of silently returning an invented path
- Added `UNRESOLVED-IMPORTS=<n>` stderr line after orphan artifact (line 398)

### deliverables/ui-surface-manifest-1/orphans.txt

Regenerated: 43 -> 42 entries. `app/src/run/PromoteToProtocolModal.tsx` removed.

## Delta Explanation (43 vs 32)

The 43 orphans consist of:
- 32 genuine orphan components (imported only by their own tests, deliberately excluded by the artifact rule)
- 1 false orphan: `PromoteToProtocolModal.tsx` — now resolved (was caused by `.js` suffix not being stripped)
- 10 components imported only by their own test files (excluded by the artifact rule)

Expected new count: 42 (the false orphan is rescued).

## Post-Edit Line Ranges

- Walker: `scripts/check-ui-surfaces.py:220` (`for root_dir, dirs, files in os.walk(app_src):`)
- Resolver: `scripts/check-ui-surfaces.py:246` (`def resolve_import(source_file, rel_path):`)
- `find_orphans()`: `scripts/check-ui-surfaces.py:212`
- `unresolved_imports` list: line 29
- `unresolved_imports.append()`: line 264
- `UNRESOLVED-IMPORTS` stderr: line 398

## Verify Outputs

Census (must be byte-identical):
```
ROUTES=41 DECLARED=3 MISSING=38 PHANTOM=0 CATCHALL=1
```

Orphans count: 42
PromoteToProtocolModal in orphans: 0
UNRESOLVED-IMPORTS=3

Negative leg (script reverted): orphans = 43, PromoteToProtocolModal = 1 — confirmed reversion.

## Files Changed

1. `scripts/check-ui-surfaces.py` — resolve_import fix + unresolved tracking
2. `deliverables/ui-surface-manifest-1/orphans.txt` — regenerated (42 entries)

L2-UI-SURFACE-MANIFEST-1 unit u3parityfix DONE e98edd906e3b47b54e2c78d81a65db98626f3433
