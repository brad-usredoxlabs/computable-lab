# L2-SPEC-SHEET-INGEST-1 / u2fix2 — report

Worktree: /home/brad/cl-wt/L2-SPEC-SHEET-1-u2-lane2 (reused; no rebase)
Base: 57897770

## Decision
Closed advc-c1 D1 by adding ONE additive test that asserts the argument
identity passed into resolveExaConfig, using the file's existing
`vi.spyOn(await import('../integrations/exa.js'), ...)` style.

## Changed files
- server/src/ingestion/SpecSheetExtractor.test.ts (+22 lines, new describe
  "Arm (d) — Honest config is threaded through to resolveExaConfig")
  - cfg is an AppConfig-shaped partial (`as unknown as Parameters<typeof extractFromUrl>[2]`)
  - spy mockReturnValue(null) -> returns before any network call
  - `expect(spy).toHaveBeenCalledWith(cfg)`.
Product file server/src/ingestion/SpecSheetExtractor.ts untouched:
`git diff HEAD -- server/src/ingestion/SpecSheetExtractor.ts` => empty (0 lines).

## Mutation evidence (MANDATORY, done)
1. Temporarily changed SpecSheetExtractor.ts:159
   `resolveExaConfig(appConfig)` -> `resolveExaConfig()`.
2. `cd server && timeout 240 npx vitest run src/ingestion/SpecSheetExtractor.test.ts`
   => FAIL 1 failed | 5 passed, failing exactly at
   `SpecSheetExtractor.test.ts:145 expect(spy).toHaveBeenCalledWith(cfg)`
   (received `Array []`), i.e. the empty-arg mutation is caught by the new assertion.
3. `git checkout -- server/src/ingestion/SpecSheetExtractor.ts` (line 159 verified
   restored to `resolveExaConfig(appConfig)`).

## Verification (real results)
- `cd server && timeout 240 npx vitest run src/ingestion/SpecSheetExtractor.test.ts src/api/specSheetRouteMount.test.ts`
  => Test Files 2 passed (2); Tests 8 passed (8).
- `cd server && timeout 300 npx tsc --noEmit -p tsconfig.json` => exit 0, no output.
- `git diff HEAD~1 --stat` => only server/src/ingestion/SpecSheetExtractor.test.ts (22 insertions).
- Tree clean except pre-existing untracked node_modules dirs.

## Commits
- e1e62fb1 test(spec-sheet): pin resolveExaConfig app-config argument (L2-SPEC-SHEET-INGEST-1 u2fix2)

## Remaining
None. Independent review/browser acceptance is out of my scope.

L2-SPEC-SHEET-u2fix2 UNIT unit DONE e1e62fb1d48e1bda23affeb799dd6acefe158104
