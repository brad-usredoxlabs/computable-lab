# SCIENCE-CHAIN-1 u2fix Report

## Defects Fixed
- **B1**: Derived `fractionOfMixture` was attached to every fractionless row instead of only the single candidate carrier row. Fix: identity-gate attachment via `componentKey` match against `carrierCandidateKey`.
- **M1**: When participation convention is absent (`loadParticipationConvention` returns `undefined`), derivation should be OFF. Fix: removed `?? 'solvent'` hardcoded fallback; wrap candidate filter + derivation in `if (participationConv)` guard.

## Changed Files
1. `app/src/graph/lib/eventGraph.ts` — GREEN fix in `syncDerivedMaterials()` (lines 507-546): gated derivation behind `if (participationConv)`, captured `carrierCandidateKey`, passed derived value only when `component.componentKey === carrierCandidateKey`.
2. `app/src/graph/lib/eventGraph.mixtureShare.test.ts` — RED C-7 and C-8 tests appended to the existing `describe('syncDerivedMaterials...')` block.

## Commits
1. `957ec488` — RED: add C-7 and C-8 tests (failing)
2. `df560ae1` — GREEN: fix B1 and M1 in eventGraph.ts
3. `85830f8c` — M2: git rm --cached app/node_modules

## Verification
- RED baseline: 12/14 pass (C-7, C-8 fail) — confirmed at 19:43:03
- GREEN: 14/14 pass — confirmed at 19:44:26 (duration 3.44s)
- Regression: no eventGraph.test.ts file (no separate regression suite exists)
- Typecheck: 10 errors (unchanged from trunk baseline)
- Tree clean: `git status --porcelain` shows only `?? app/node_modules` (working-tree symlink preserved, untracked per precedent)

## Acceptance Criteria Met
- B1: derived share attaches ONLY to carrier row by componentKey identity — PASS (C-7)
- M1: no hardcoded 'solvent' fallback when convention absent — PASS (C-8)
- C-1..C-6 regression: all still PASS (14/14)
- Scope: exactly 2 owned files edited, no prohibited files touched

L2-PROMPT2-SCIENCE-CHAIN-1-u2fix UNIT unit DONE c2885032bf6399246d44f283d916769f17060554
