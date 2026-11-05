# RECORD-GHOSTPAINT1-u1-legA-report

Unit: L2-PROMPT2-GHOSTPAINT-1 unit 1 (leg-2A)
Date: 2026-11-05

## Summary
Added `placedLabwareIds` parameter to `buildPreviewWellIndex` so reference-less events
attribute to the sole placed vessel. No new policy — purely mechanical signature change
across 8 files (+118/-11).

## Commits
- e7ecbdc4 RED: GHOSTPAINT1 Unit1 - A1-A5 test pins for placed-vessel attribution in preview index
- 08c2e34f GREEN: GHOSTPAINT1 Unit1 - add placedLabwareIds param to buildPreviewWellIndex, attribute reference-less events to sole placed vessel
- af418aab Mechanical: GHOSTPAINT1 Unit1 - pass explicit [] to existing buildPreviewWellIndex calls in test files

## Verification
vitest run (3 files):
  Test Files  3 passed (3)
      Tests  13 passed (13)

git status: clean (only app/node_modules untracked — not part of repo)

## Residual Risk
- Leg-2B (server re-compile and integration) still outstanding — out of scope for this unit.
- `buildPreviewWellIndex` callers outside the committed edit paths still need review in leg-2B.

## Changed Files
1. app/src/event-editor/lib/previewProjection.ts — signature + logic change
2. app/src/event-editor/lib/previewProjection.ghostpaint1.test.ts — 5 new tests (A1-A5)
3. app/src/event-editor/lib/previewProjection.test.ts — mechanical [] arg
4. app/src/event-editor/lib/shorthandPreviewGhosting.test.ts — mechanical [] arg
5. app/src/event-editor/lib/shorthandPreviewGhosting.ts — mechanical [] arg
6. app/src/event-editor/components/EventGraphCanvas.tsx — mechanical [] arg
7. app/src/event-editor/components/EventGraphCanvas.ghostpaint1.test.ts — mechanical [] arg
8. app/src/event-editor/lib/previewProjection.test.ts — mechanical [] arg

L2-PROMPT2-GHOSTPAINT-1 UNIT 1 DONE af418aab
