L2-CLARIFY-TARGET-1 UNIT D2-2 report (l2t0325)

Evidence:
- PreviewActionBar.test.tsx: 9 passed (6 baseline + 3 new)
- DeckStage.twoplate.uifix2.fix2.test.tsx: 1 passed (unchanged)
- tsc --noEmit: pre-existing errors only (no new errors introduced)

Changed files:
- app/src/event-editor/deck/PreviewActionBar.tsx (+8 lines: chatCommitSurface guard wrapping Discard and Accept buttons)
- app/src/event-editor/deck/PreviewActionBar.test.tsx (+30 lines: 3 new tests for commit verb visibility)

Commit: 1c2a66ead472cd21da8bea208f16f71bdde38ec6

L2-CLARIFY-TARGET-1-D2 UNIT D2-2 DONE 1c2a66ead472cd21da8bea208f16f71bdde38ec6
