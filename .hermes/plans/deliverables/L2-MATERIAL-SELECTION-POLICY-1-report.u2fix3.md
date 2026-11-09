# L2-MATERIAL-SELECTION-POLICY-1 — Unit u2fix3 Report

## Summary
Fixes the post-collapse rendering residual from u2fix2 (D3 open): after the
`only` policy collapsed to a single row, the ClarificationPicker still showed
extra rows from client-side ontology re-merge at `ClarificationPicker.tsx:815`
and the always-appended mint floor (`pinBottom`). The fix stops those rows when
the policy result is an `only` collapse. The `preselected` field is also declared
on `SlashSuggestion` in `types.ts` (closing D7).

## Changed files (4, +136/−3)
1. `app/src/shared/taptab/slashMenu/ClarificationPicker.tsx` | 5+− — gate
   client-side ontology re-merge and `pinBottom` behind a flag so post-collapse
   rows are suppressed when the policy yields an only result.
2. `app/src/shared/taptab/slashMenu/clarifyPickerRanking.test.ts` | 111+ —
   3 new tests validating post-collapse suppression and `preselected` typing.
3. `app/src/shared/taptab/slashMenu/resolvers.ts` | 15+− — signal the
   `only` collapse state so the picker can act on it.
4. `app/src/shared/taptab/slashMenu/types.ts` | 8++ — declare `preselected`
   on `SlashSuggestion` (D7 closure).

## Verification (as measured by the orchestrator at f34218c2, 2026-11-09 16:50 EST)
- `clarifyPickerRanking.test.ts`: 27 passed (24 baseline + 3 new)
- `resolvers.test.ts`: 26 passed, byte-stable
- `app tsc --noEmit -p .`: 0 lines
- Coder run exited rc=0; exit_marker was missing — this unit supplies it.

## Commits
- f34218c2 — fix product code
- (this report commit)

L2-MATERIAL-SELECTION-POLICY-1-u2pw UNIT u2fix3 DONE f34218c2efbac763ae33cb0187b553808193bc19
