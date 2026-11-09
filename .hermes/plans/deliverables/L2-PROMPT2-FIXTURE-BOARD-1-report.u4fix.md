# L2-PROMPT2-FIXTURE-BOARD-1 — u4fix Report

## Adversarial Review Finding (advc-u4)
The branch appended `, true)` to THREE non-openTab calls, breaking the build:
- Line 180: `.then((env) => {...}, true)` — `true` passed as rejection callback (TS2554)
- Line 183: `.catch(() => {...}, true)` — `true` passed as exception handler (TS2554)
- Line 375: `new CustomEvent('pdf-text-selection', {...}, true)` — third arg not accepted (TS2554)
Plus: `app/node_modules` symlink tracked by mistake.

## Fix Applied
- Reverted `}, true)` to `})` at lines 180, 183, 375
- Untracked `app/node_modules` via `git rm --cached`
- Lines 217 and 235 (`ws.openTab(..., true)`) preserved as intended

## Verification (RAW output)

### Targeted test
```
Test Files  1 passed (1)
     Tests  1 passed (1)
```

### Typecheck
```
Total TS errors: 10 (baseline was 13; reduced by 3 TS2554 fixes)
TS2554 in ProjectWorkspacePage.tsx: 0 (was 2)
```

### Git status
```
Clean tree (app/node_modules untracked — expected)
```

### Commit
```
26e307a4 L2-PROMPT2-FIXTURE-BOARD-1 u4fix: revert over-applied activate flags (:180,:183,:375), untrack app/node_modules
```

L2-PROMPT2-FIXTURE-BOARD-1-u4fix UNIT unit DONE 26e307a475755b0891dfa33e80050cb4bfefb8ab
