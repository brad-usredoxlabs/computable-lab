# L2-CANONICAL-LABEL-STAGE-A-FALLBACK unit 2 (app pins) Report

## Scope
- ONE new test file: `app/src/agent/ChatClarificationCard.stageAstring.test.tsx` (196 lines)
- Zero product edits.

## Tests
- 5 tests: AC-3(a) STAGE-B label, AC-3(b) equality case, AC-3(c) answered row, AC-7(d) mint badge word, AC-7(e) single-home grep guard.
- Summary: `Test Files  1 passed (1) | Tests  5 passed (5)`

## Non-vacuity proof
### Mutation 1: badge word change
- Changed `ClarificationPicker.tsx:1022` from `{VOCABULARY_BADGE.mint}` to `{'Local'}`
- Result: 1 failed (AC-7(d) — `expected 'Local' to be 'New'`), 4 passed
- Reverted with `patch` back to `{VOCABULARY_BADGE.mint}`
- Post-revert: 5 passed

### Mutation 2: seed argument change
- Changed `ClarificationPicker.tsx:945` from `apiClient.mintLocalTerm('material', label)` to `apiClient.mintLocalTerm('material', 'MUTATED-SEED')`
- Result: 2 failed (AC-3(a) and AC-3(b) — both caught the wrong mint argument), 3 passed
- Reverted with `patch` back to `apiClient.mintLocalTerm('material', label)`
- Post-revert: 5 passed

## Regression
- `ChatClarificationCard.mint.test.tsx`: 9 tests passed (unchanged baseline)

## Fix run 1 (u2apppins)
### D1 [major] — Remove unused `within` import
- File: `app/src/agent/ChatClarificationCard.stageAstring.test.tsx:12`
- Fix: removed `within` from `@testing-library/react` import (was unused, caused TS6133)
- Evidence: `grep -n 'within' ...` shows 0 matches after fix
- Typecheck: no TS6133 on this file; zero new TS errors vs baseline

### Verification
- Tests: 5/5 GREEN (`ChatClarificationCard.stageAstring`)
- Typecheck: pre-existing errors only; TS6133 for `within` eliminated

## Verification
- `git -c core.fileMode=false status --short`: clean
- `git diff --stat HEAD^..HEAD`: 1 file changed, 196 insertions(+)
- SHA: 8e1b1004f2e4ec7688f4dce150c84ef3de79f5d4
