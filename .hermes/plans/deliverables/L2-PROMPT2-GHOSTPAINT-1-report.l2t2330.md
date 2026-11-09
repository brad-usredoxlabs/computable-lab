# L2-PROMPT2-GHOSTPAINT-1 Report (advc cycle-1 fix)

Unit: L2-PROMPT2-GHOSTPAINT-1 unit fix-1 (cycle 1, leg-2A defects D1-D3 + A6 pin)
Date: 2026-11-05
Branch: cl/lane2-ghostpaint1-u1
Base: b76e5e86

## Summary

Leg-2A (first unit) shipped +155/-11 across 9 files. Advc review identified 3 defects (D1-D3) and 2 report issues (D4/D5). This fix addresses all five:

- **D1 (MAJOR):** Made `placedLabwareIds` a required parameter (removed `= []` default) — the spec and bait R5 require a compiler-forced required param.
- **D2 (MAJOR):** Added `_protocolStepStatus` layering to the fallback arm — a reference-less event with `_protocolStepStatus: 'current'` now correctly sets status map entries.
- **D3 (MINOR):** Fixed `resolvePlacedVesselAttribution([], placedLabwareIds)` to pass the event's own `labwareIds` instead of `[]` (latent trap from bait R3).
- **D4/D5:** Created this report at the correct deliverables path, replacing the misplaced `RECORD-GHOSTPAINT1-u1-legA-report.l2t0045.md`.

## TRUE Changed-File List (9 files total across both legs)

(corrected against `git diff --name-only 94e2e578..HEAD` at cycle-2 paperwork fix)

1. `app/src/event-editor/deck/DeckSlot.tsx` — mechanical pass-through of placedLabwareIds (leg-2A)
2. `app/src/event-editor/deck/LawnSurface.tsx` — mechanical pass-through (leg-2A)
3. `app/src/event-editor/focus/LabwareFocus.tsx` — mechanical pass-through (leg-2A)
4. `app/src/event-editor/lib/previewProjection.ts` — signature + fallback arm status handling (leg-2A + this fix)
5. `app/src/event-editor/lib/previewProjection.ghostpaint1.test.ts` — A1-A5 pins + new A6 (leg-2A + this fix)
6. `app/src/event-editor/lib/previewProjection.test.ts` — two-arg fix at :65 (this fix)
7. `app/src/event-editor/lib/shorthandPreviewGhosting.test.ts` — mechanical [] arg (leg-2A)
8. `app/src/event-editor/EventEditorContext.test.ts` — mechanical [] arg (leg-2A)
9. `.hermes/plans/deliverables/L2-PROMPT2-GHOSTPAINT-1-report.l2t2330.md` — this report

## Commits

- 85046b21 — L2-PROMPT2-GHOSTPAINT-1 unit fix-1: D1 remove default param, D2 add _protocolStepStatus to fallback arm, D3 pass event labwareIds, A6 pin
- db3970ce — L2-PROMPT2-GHOSTPAINT-1 unit fix-1: deliverable report (D4/D5), remove misplaced record
- 986e14cd — L2-PROMPT2-GHOSTPAINT-1 unit fix-1: update report exit marker sha
- 6afda9cb — L2-PROMPT2-GHOSTPAINT-1 unit fix-1: finalize report sha
- d9b324cd — L2-PROMPT2-GHOSTPAINT-1 c2 paperwork: corrected changed-file list + commit list

## Defect -> Fix Table

| Defect | Severity | File | Change |
|--------|----------|------|--------|
| D1 | MAJOR | previewProjection.ts:31 | `placedLabwareIds: readonly string[] = [],` -> `placedLabwareIds: readonly string[],` |
| D1 | MAJOR | previewProjection.test.ts:65 | `buildPreviewWellIndex(null)` -> `buildPreviewWellIndex(null, [])` |
| D2 | MAJOR | previewProjection.ts:66-82 | Added statusMap block inside fallback arm mirroring explicit arm |
| D3 | MINOR | previewProjection.ts:65 | `resolvePlacedVesselAttribution([], ...)` -> `resolvePlacedVesselAttribution(labwareIds, ...)` |
| A6 | TEST | previewProjection.ghostpaint1.test.ts | Added import of `previewStepStatusForLabware` + A6 test pin |

## Verification Results

### vitest (4 targeted test files)
```
Test Files  4 passed (4)
Tests  22 passed (22)
```

### vitest (full lib suite)
```
Test Files  10 passed (10)
Tests  110 passed (110)
```

### TypeScript compiler
```
npx tsc --noEmit -p . 2>&1 | grep -c "error TS" -> 10 (pre-existing, zero new)
```

### grep checks
```
grep -c "= \[\]" src/event-editor/lib/previewProjection.ts -> 1 (pre-existing local variable, not param default)
grep -n "resolvePlacedVesselAttribution(\[\]" src/event-editor/lib/previewProjection.ts -> no output (D3 fixed)
```

### Test count delta
Baseline: 21 passed (before A6). After A6: 22 passed. Full lib: 109 -> 110.

L2-PROMPT2-GHOSTPAINT-1 UNIT fix-1 DONE 986e14cd
L2-PROMPT2-GHOSTPAINT-1 UNIT c2-paperwork DONE d9b324cd
