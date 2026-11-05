# L2-THREADSCOPE-FLIP-1 UNIT u8-d5 — D5 (MINOR) — scope: undefined fix

## Task
Remove two explicit `scope: undefined` optional-key literals from door-test fixtures
and replace with a scopeless fixture that OMITS the scope key entirely.

## DEFECT
`scope: undefined` in fixtures at lines 263 and 327. The contract says `scope?: string`
is ABSENT when unsaved. Under `exactOptionalPropertyTypes`, absent and undefined are
different. The fixtures pinned a shape the product cannot emit.

## Changes

### File: app/src/shared/shell/SurfaceChatBridge.door.test.tsx
- Added `scopelessDeckSliceFixture()` helper after `deckSliceFixture()` (line ~120)
  that spreads the full fixture and deletes `scope`, returning the object with no
  scope key at all.
- Replaced line 263: `{ ...deckSliceFixture(), scope: undefined }` -> `scopelessDeckSliceFixture()`
- Replaced line 327: `{ ...deckSliceFixture(), scope: undefined }` -> `scopelessDeckSliceFixture()`

## Verification (u8-d5b — 2026-11-05)

### Vitest — GREEN
```
cd app && npx vitest run src/shared/shell/SurfaceChatBridge.door.test.tsx
Test Files  1 passed (1)
Tests       6 passed (6)
Duration    14.43s
```

### Typecheck — GREEN
```
cd app && npx tsc --noEmit 2>&1 | grep -c 'error TS'
10
```
Matches baseline of 10 error TS lines.

### grep — GREEN
```
grep -c 'scope: undefined' app/src/shared/shell/SurfaceChatBridge.door.test.tsx
0
```
Zero `scope: undefined` literals — confirmed at u8-d5b verification.

### Baseline HEAD
```
git rev-parse HEAD
2de75500c7d2f7df63ee3b0ab777952175da9521
```

### Summary
All three verification checks pass against measured baselines.
The D5 fixture fix is confirmed correct: 6/6 tests pass, typecheck at baseline 10,
zero `scope: undefined` literals in the door test file.

L2-THREADSCOPE-FLIP-1-u8d5b UNIT unit DONE 7f5c0ebdf81a8ad561b190178610a0a5b0302562
