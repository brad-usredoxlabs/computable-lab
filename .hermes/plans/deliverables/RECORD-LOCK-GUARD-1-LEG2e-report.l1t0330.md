# RECORD-LOCK-GUARD-1 LEG2E — Unit 2e Report

## Scope
- Item: L1-RECORD-LOCK-GUARD-1-LEG2E (unit 2e)
- Lane: 1
- Worktree: /mnt/vast/home/brad/git/wt/L1-RECORD-LOCK-GUARD-1-leg2-lane1-l1t1645
- Base commit: bb6be7ba

## Problem (DEFECT 1, BLOCKER)
The test case in contentLockedStatesCache.test.ts asserted the OLD fail-open contract:
after a fetch rejection, a second prime would NOT re-fetch (toHaveBeenCalledTimes(1)).
The production code (commit 023f0a3a) behaves fail-closed: failed lifecycle is never
marked resolved, so subsequent primes retry.

## Fix
Rewrote the stale test case to pin the fail-closed contract:
- Added `isContentLockedSetResolved` import
- After rejection: `isContentLockedSetResolved` is false
- Second prime issues a second fetch (toHaveBeenCalledTimes(2))
- Third prime after successful fetch is a cache hit (still 2)

## Changed Files
- app/src/shared/records/contentLockedStatesCache.test.ts (1 file, +15/-3 lines)

## Verification
- cd app && npx vitest run src/shared/records → 9/9 passed (was 1 failed/8 passed)
- git status: clean (only node_modules untracked)

## Commit
A: 9ef44dc4 L1-RECORD-LOCK-GUARD-1 2e: rewrite stale fail-open test to pin fail-closed contract

L1-RECORD-LOCK-GUARD-1-LEG2E UNIT unit DONE 9ef44dc4253eae0356d431aa5d7cb57651eaa431
