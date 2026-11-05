# RECORD-LOCK-GUARD-1 LEG 2a — declared-set predicate seam

Lane 1 · branch cl/lane1-recordlockguard-1-leg2-l1t1645 · base 2483ebd6 (trunk post leg-1 merge)
Unit 1 of 1: the declared-set predicate + the client accessor that feeds it. No page/component changes.

## Scope (3 files, 119 lines)

| File | Lines | Content |
|---|---|---|
| `app/src/shared/records/lifecycleLock.test.ts` (new) | 79 | P-a..P-e RED pins |
| `app/src/shared/records/lifecycleLock.ts` (new) | 21 | `isContentLocked`, `isRecordWriteLocked` |
| `app/src/shared/api/client.ts` | +19 | `getLifecycleContentLockedStates` (immediately after `getLifecycleTerminalStates`, verbatim mirror: same endpoint, 404 -> [], reads `contentLockedStates`) |

Budget: files = 3 (<= 3), lines = 79 + 21 + 19 = 119 (<= 120).

## Commit graph

1. `a80a0ed09b7d1ad64c1b3add96c019a7bb9924c0` — `LEG2a RED: declared-set predicate pins` (test file alone)
2. `e65320fd75a84a0c93f60ad1130f051d00d0ab42` — `LEG2a: lifecycleLock declared-set predicate + client accessor` (module + accessor)
3. (this report, committed after)

## Verification (raw)

### tsc baseline — measured BEFORE first edit
`cd app && npx tsc --noEmit` -> 12 `error TS` lines (known baseline; task text said 21, measured 12 at 2483ebd6 — recorded both; diff against baseline is the authoritative check). ZERO in any touched file.

### RED (module + accessor absent, raw from /tmp/leg2a-red.txt)
```
RUN  v1.6.0 /mnt/vast/.../app
stderr | unknown test
LEG2a P-d LOUD SKIP: lifecycleLock.ts unreadable: Error: ENOENT: no such file or directory, open '.../app/src/shared/records/lifecycleLock.ts'
 ❯ src/shared/records/lifecycleLock.test.ts  (5 tests | 4 failed | 1 skipped) 8ms
   ❯ P-a ... > a set that does NOT contain the legacy pair: member true, legacy states false
     → Failed to load url ./lifecycleLock (resolved id: ./lifecycleLock). Does the file exist?
   ❯ P-b ... > true when state is in terminalStates but not in contentLockedStates
     → Failed to load url ./lifecycleLock (resolved id: ./lifecycleLock). Does the file exist?
   ❯ P-c ... > false everywhere, no throw
     → Failed to load url ./lifecycleLock (resolved id: ./lifecycleLock). Does the file exist?
   ❯ P-e ... > [] on 404; parsed contentLockedStates from the transitions endpoint otherwise
     → apiClient.getLifecycleContentLockedStates is not a function
 FAIL  ... P-a ... TypeError: apiClient.getLifecycleContentLockedStates is not a function
 Test Files  1 failed (1)
      Tests  4 failed | 1 skipped (5)
```

### GREEN (raw)
```
 Test Files  1 passed (1)
      Tests  5 passed (5)
   Start at  19:54:25
   Duration  3.70s (transform 148ms, setup 335ms, collect 119ms, tests 10ms, environment 1.48s, prepare 252ms)
```

### tsc after (raw)
`npx tsc --noEmit | grep -c "error TS"` -> 12 (identical to pre-edit baseline); `grep -E "shared/(api/client|records/)"` -> no match -> ZERO errors in touched files; `diff baseline after` -> identical.

### git status (raw)
`git -c core.fileMode=false status --short` (excluding untracked node_modules symlinks) -> only the three owned files at commit time; after the report commit the tree is clean of in-scope changes.

## Pin coverage

- P-a: `['archived']` + state `'approved'` -> FALSE (kills the hardcoded pair); member `'archived'` -> TRUE.
- P-b: state in terminalStates but not contentLockedStates -> TRUE (both directions); non-member -> FALSE.
- P-c: null/undefined payload, non-string state (42, object, 0), empty sets -> all FALSE, no throw.
- P-d: reads `lifecycleLock.ts` source; asserts no quoted `'approved'`/`'effective'` literal; `it.skipIf` with a loud `console.warn` when unreadable (never silent pass). In RED the skip fired loud; in GREEN the pin executes and passes.
- P-e: global-fetch stub (mirrors `client.intentCompileDeck.test.ts` idiom; `request` is module-private). 404 -> `[]`; 200 with `contentLockedStates` -> parsed array; URL assertion on `/lifecycle/lc-1/transitions`.

## Decisions

- `request` is module-private in `client.ts`, so P-e stubs global `fetch` (repo idiom) rather than mocking the symbol.
- Dynamic import of `./lifecycleLock` in the test keeps RED per-test (no collection crash) and keeps the module absent from the RED commit.
- No policy, no literals, no fallback set in any of the three files; declared sets always arrive as arguments.

## Remaining blockers

None for this unit. LEG 2b/2c (page/component consumers) and the browser gate are separate items.

RECORD-LOCK-GUARD-1-LEG2a DONE e65320fd75a84a0c93f60ad1130f051d00d0ab42
