# L2-MATERIAL-SELECTION-POLICY-1 — u2fix6 Report

## Cycle 4 Defects Closed

### F1 (paperwork, MAJOR): Unit report and DONE marker
- Created this report file

### F2 (hygiene, MINOR): Test stub hygiene
- Moved `vi.stubGlobal('fetch', fetchSpy)` from test body into `beforeEach`
- Added `vi.unstubAllGlobals()` in `afterEach`
- Pattern mirrors neighboring describe at :563-579

### F3 (budget, MINOR): Budget trim
- Removed 8-line prose comment header from test block
- Total delta: 10 insertions, 13 deletions (net -3, well under 60 budget)

## Commits
- Functional fix: 9d1795dd (u2fix5 — PolicyGuardError propagation)
- F2/F3 test hygiene: b2f2d8b3cc29eb9228319aa3d25f0228b34207a8

## Verification
### VERIFY-1: Tests pass
- `cd app && npx vitest run src/shared/taptab/slashMenu` -> 108 passed (8 files)

### VERIFY-2: Typecheck passes
- `cd app && npx tsc -p tsconfig.json --noEmit` -> exit 0

### VERIFY-3: Mutant check
- Removed `if (err instanceof PolicyGuardError) throw err` from policy.ts
- Test went RED: "expected AssertionError to be an instance of PolicyGuardError"
- Restored policy.ts via `git checkout --`

L2-MATERIAL-SELECTION-POLICY-1 (L2-MATSEL-u2fix6) UNIT u2fix6 DONE 9d5236e47cb552a9a7bc6e2259275da7b183b8e7

## Paperwork Fix (u2fix6 — cycle 5)

- **Defect:** DONE marker cited orphaned pre-amend commit `21cfc862` (`git branch --contains` returned empty).
- **Fix:** Amended marker to cite reachable commit containing the content lineage.
- **Verification:** `git merge-base --is-ancestor <named sha> HEAD` returned 0.

## Marker Token Fix (u2fix6b — RUN u2fix6b)
- **Defect:** marker line named only the canonical id, so `cl_marker_scan.marker_verdict()` for dispatch token `L2-MATSEL-u2fix6` returned `('missing', '')` (strict needs the item literally; loose needs family `MATSEL`).
- **RED:** `find_marker(worktree, 'L2-MATSEL-u2fix6')` -> `('missing', '')`.
- **Fix:** line 33 now names both ids, canonical first: `L2-MATERIAL-SELECTION-POLICY-1 (L2-MATSEL-u2fix6) UNIT u2fix6 DONE 9d5236e4...`. Sha unchanged, reachable, no product/test/policy edits.
- **GREEN:** dispatch token -> `('found', '...report.u2fix6.md: L2-MATERIAL-SELECTION-POLICY-1 (L2-MATSEL-u2fix6) UNIT u2fix6 DONE 9d5236e4...')`; canonical `L2-MATERIAL-SELECTION-POLICY-1-u2fix6` -> `found-loose`.
- **Cause:** token mismatch in paperwork only, not a code defect.

L2-MATSEL-u2fix6 UNIT u2fix6b DONE e13536f0b219b37ed0766fbedcf1d48d0959071b
