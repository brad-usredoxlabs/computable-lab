# L2-PROMPT2-COMPOSITION-BIND-1 — Unit c1precfix2b Report

## Step 0: Base Gate
Tip of worktree (3 commits):
  fa4efe17 report(lane2): L2-PROMPT2-COMPOSITION-BIND-1 c1precfix2a report
  3425fe19 test(lane2): repoint shipped-order and no-rebless pins to blessed d39fd67b (c1precfix2a)
  1a72f5ec WIP AT EXIT (launcher auto-commit)
c1precfix2a IS on base. Tree clean apart from node_modules symlinks.

## Step 2: Measured Split (Raw Numbers)
Pre-repoint failures (baseline at 1a72f5ec):
  goldenIntentToGraph.test.ts:96 — expected -3 to be +0
  goldenRolesSeam.test.ts:184 — expected -2 to be +0

Probe measurements (absolute counts, run from server/):
  goldenIntentToGraph:
    n = 3 (hint-eligible labeled args: transfer.source, transfer.target, read.labware)
    labwareListCalls = 4
    materialListCalls = 4
    delta (labware - material - n) = 4 - 4 - 3 = -3
    searchLabwareByHintCalls (derived) = 4 - 4 = 0

  goldenRolesSeam:
    n = 2 (hint-eligible labeled args: transfer.source, transfer.target)
    labwareListCalls = 3
    materialListCalls = 3
    delta (labware - material - n) = 3 - 3 - 2 = -2
    searchLabwareByHintCalls (derived) = 3 - 3 = 0

Branch taken: DOWN-LABWARE. The precedence arm bound before the hint arm, so
these args issued NO labware-only hint searches. Labware went DOWN by exactly n
(3 fewer at goldenIntentToGraph, 2 fewer at goldenRolesSeam) while material
stayed unchanged. This is the acceptable consequence described in the brief.

## Step 3: Pin Repoint
goldenIntentToGraph.test.ts:96:
  OLD: expect(run.spies.labwareListCalls - run.spies.materialListCalls - n).toBe(0);
  NEW: expect(run.spies.labwareListCalls).toBe(4);
  NEW: expect(run.spies.materialListCalls).toBe(4);

goldenRolesSeam.test.ts:184:
  OLD: expect(run.spies.labwareListCalls - run.spies.materialListCalls - n).toBe(0);
  NEW: expect(run.spies.labwareListCalls).toBe(3);
  NEW: expect(run.spies.materialListCalls).toBe(3);

## Step 4: Comments Updated
Both sites replaced with comments naming ruling 11a181c0 Q1, the mechanism
(declaration_precedence binds before hint arm), the absolute counts, and the
reference to replayKernel.ts:236-238 for the pre-flip identity.

## Step 5: Probe Verification
grep -n "console.log" on both files: NO OUTPUT (exit code 1 = no matches)
git diff --stat: only the two test files changed (16 insertions, 7 deletions)

## Test Results
cd server && ./node_modules/.bin/vitest run src/compiler/scientistIntent/goldens/goldenIntentToGraph.test.ts src/compiler/scientistIntent/goldens/goldenRolesSeam.test.ts
  Test Files  2 passed (2)
       Tests  13 passed (13)
Baseline was: Test Files 2 failed (2) | Tests 2 failed | 11 passed (13)

## Changed Files
1. server/src/compiler/scientistIntent/goldens/goldenIntentToGraph.test.ts (lines 91-96)
2. server/src/compiler/scientistIntent/goldens/goldenRolesSeam.test.ts (lines 180-184)

L2-PROMPT2-COMPOSITION-BIND-1 UNIT c1precfix2b DONE 7bec50158baf23315e614b4ae6e998a7c850eabe
