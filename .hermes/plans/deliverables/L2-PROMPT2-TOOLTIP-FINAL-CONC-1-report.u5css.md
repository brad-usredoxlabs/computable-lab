# L2-PROMPT2-TOOLTIP-FINAL-CONC-1 — Unit u5css Report

## Baseline
- Branch: cl/lane2-tooltip-final-conc-1-u1
- Base sha (pre-merge): c4ef4464344474ed064f85e4acdca549c3f3257b
- Post-merge sha measured: c4ef4464 (cl/integration-2 already current)
- Baseline tests: 4 tests / 4 passed (advc-u4css)

## Change Summary
Problem: conc and vol cells in well-tooltip clipped long values (500 cells/uL, 50,000 count, 50% of the mixture) via white-space: nowrap + overflow: hidden + text-overflow: ellipsis. The title attribute on these cells was unreachable because the panel has pointer-events: none, so the tooltip could never fire.

Fix: Replace the clipping trio (white-space: nowrap, overflow: hidden, text-overflow: ellipsis) with wrapping strategy (white-space: normal, overflow-wrap: anywhere) in both .well-tooltip__material-conc and .well-tooltip__material-vol rules. The title attributes remain as secondary affordance where a pointing device exists. Panel pointer-events: none is untouched.

## Files Changed
1. app/src/event-editor/focus/WellTooltip.test.tsx — added u5css RED pin test (50 lines added)
2. app/src/event-editor/styles/eventEditor.css — replaced clipping declarations with wrapping (4 lines added, 6 deleted)

## Commit Log
1. c6d758a6 — u5css RED: add CSS declaration pin for well-tooltip conc/vol wrap test
2. 1e5dd005 — u5css GREEN: wrap conc/vol cells instead of clipping in well-tooltip

## Verification Results
- Test run (after GREEN): 5 tests / 5 passed
  cd app && npx vitest run src/event-editor/focus/WellTooltip.test.tsx
  → Test Files  1 passed (1) / Tests  5 passed (5)
- Negative control (CSS reverted): 1 failed | 4 passed (the new u5css pin went RED)
- git status --short: only ?? app/node_modules (clean tree)

## Invariants Verified
- .well-tooltip pointer-events: none — present and unchanged (asserted in pin)
- title attributes on conc/vol cells — untouched (existing u4css test still green)
- .well-tooltip__title ellipsis rule — unchanged
- Panel width / table-layout: fixed — unchanged (D1 not re-opened)

## Review Bait Addressed
- Comment-satisfiable pin: test strips /* ... */ comments before parsing CSS bodies
- Overlay contract: pointer-events: none explicitly asserted in the pin
- D1 scope: no changes to panel width or table-layout
- Title attributes: preserved as secondary affordance
- No hardcoded pixel measurements in tests — pins CSS declarations, not geometry

L2-PROMPT2-TOOLTIP-FINAL-CONC-1 UNIT u5css DONE 1e5dd0051fad7dd63111aa593fa722fb0c258a25
