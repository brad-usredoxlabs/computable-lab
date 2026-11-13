# L2-SEED-LABLOCAL-1 — unit d2 closeout report

Date: 2026-11-09 (America/New_York)
Worktree: /home/brad/cl-wt/L2-SEED-LABLOCAL-1-d2-lane2
Branch: cl/lane2-seedlab-d2-l2t1820 | base: a9408faf65c7b226959f5acbef4ff0660901a68c
Unit: d2closeout — paperwork only. d2 behaviour shipped and orch-verified 14/14.

## SCOPE
- Alias resolution: 0 matches return undefined; exactly 1 returns the spec; 2+ throw
  RegistryAmbiguousAliasError listing every claiming id, sorted.
- One shared matcher is used by both registry factories (no parallel resolver).
- One seed labware instance names the definition-specific alias (reservoir_25ml_single ->
  lbw-seed-reservoir-25ml-single-trough).
- This unit changes no behaviour, test, seed record, schema, or product config.

## COMMITS
- 83fe8094 — RED tests for alias ambiguity detection.
- 4685fbf9 — GREEN fail-closed alias resolution with RegistryAmbiguousAliasError.
- 20b582eb — seed labware instance for reservoir_25ml_single.
- a9408faf — launcher auto-commit of the dirty worktree scaffold (WIP, disposition below).
- 1eccbe09ec24683c5056d56a5e692fd65cc1dc5c — removes server/vitest.test.config.ts.

## WIP DISPOSITION
a9408faf committed `server/vitest.test.config.ts`, a worktree-only environment scaffold. REMOVED in
1eccbe09 (13 deletions). Measured justification, not preference:
- `grep -rn "vitest.test.config" . --include=*.json --include=*.ts` -> zero references (exit 1).
- The committed `server/vitest.config.ts` already supplies globals, node environment and
  include ['src/**/*.test.ts', 'test/**/*.test.ts'] (a superset of the scaffold's src-only glob),
  so the scaffold was not load-bearing; tests still pass 14/14 after removal (VERIFY 2).
- `server/vitest.config.ts` is byte-identical to base (not in `git diff a9408faf --stat`).
No replacement worktree-specific file was added.

## VERIFY
1. Baseline before removal (cwd = <worktree>/server):
   $ npx vitest run src/registry/RegistryLoader.test.ts src/seeds/labware.seed.test.ts
   RUN  v1.6.1 /home/brad/cl-wt/L2-SEED-LABLOCAL-1-d2-lane2/server
    ✓ src/seeds/labware.seed.test.ts  (2 tests) 12ms
    ✓ src/registry/RegistryLoader.test.ts  (12 tests) 44ms
    Test Files  2 passed (2)
         Tests  14 passed (14)
2. After `git rm server/vitest.test.config.ts` (same command):
   RUN  v1.6.1 /home/brad/cl-wt/L2-SEED-LABLOCAL-1-d2-lane2/server
    ✓ src/seeds/labware.seed.test.ts  (2 tests) 8ms
    ✓ src/registry/RegistryLoader.test.ts  (12 tests) 55ms
    Test Files  2 passed (2)
         Tests  14 passed (14)
3. $ git -c core.fileMode=false status --short
   ?? app/node_modules
   ?? server/node_modules
   (both are the expected untracked symlinks; no scratch file left behind)
4. $ tail -n 1 .hermes/plans/deliverables/L2-SEED-LABLOCAL-1-report.d2.md
   L2-SEED-LABLOCAL-1 UNIT d2 DONE 1eccbe09ec24683c5056d56a5e692fd65cc1dc5c
5. $ git cat-file -t 1eccbe09ec24683c5056d56a5e692fd65cc1dc5c
   commit

## NOTES
- exactOptionalPropertyTypes: NOT applicable — this unit changes no .ts file and no type signature.
- No ontology/schema/record change; no tags or naming edits were made to the seed record.
- Whole-directory vitest and worktree `tsc` were not run, per the brief (symlinked-tree artifact).

## MARKERS
L2-SEEDLAB-d2closeout UNIT unit DONE 1eccbe09ec24683c5056d56a5e692fd65cc1dc5c
L2-SEED-LABLOCAL-1 UNIT d2 DONE 1eccbe09ec24683c5056d56a5e692fd65cc1dc5c
