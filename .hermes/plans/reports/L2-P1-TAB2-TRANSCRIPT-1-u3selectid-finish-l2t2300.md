# L2-P1-TAB2-TRANSCRIPT-1 / u3selectid-finish — report

Unit: L2-P1-TAB2-TRANSCRIPT-1-u3finish
Worktree: /home/brad/cl-wt/L2-P1-TAB2-TRANSCRIPT-1-u1tab2render-lane2 (lane 2)
Branch: cl/lane2-p1-tab2-transcript-u1tab2render-1950
Base at entry: 148a0b80fd92853d3af200fd00748f939e0ccdc0 (launcher auto-commit of the
predecessor's WIP; PROBE line confirmed verbatim at aiThreadClient.ts:211)

## Change (1 file, 1 line)
- app/src/shared/api/aiThreadClient.ts:211
  - before: `  headers['x-cl-thread-id'] = getThreadTabId(scope) /* PROBE: explicit threadId override removed */`
  - after:  `  headers['x-cl-thread-id'] = threadId || getThreadTabId(scope)`
  - ABSENT-NOT-UNDEFINED preserved: `threadId?: string`, so undefined/empty falls to the mint.
  No other files touched. useAiChat.ts, threadTabIds.ts, HarnessChatPane*, server/**, and the
  test file were not edited (test file not needed — it parsed and ran as-is).

## Verification (exact commands, run from app/)

### 1. Mutation probe — RED before the edit
`pnpm exec vitest run src/shared/hooks/useAiChat.threadSelect.test.tsx` (PROBE line in place):
```
❯ src/shared/hooks/useAiChat.threadSelect.test.tsx  (3 tests | 1 failed) 178ms
   ❯ ... > u3selectid — a second tab selects a listed thread: the wire carries the SELECTED id > WIRE (step 2): the explicit threadId rides x-cl-thread-id; absent => the tab mint (unchanged contract)
     → expected 'd81462fe-0057-42df-b59b-55f78c6f16c7' to be 'tid-tab1-journey' // Object.is equality

 Test Files  1 failed (1)
      Tests  1 failed | 2 passed (3)
   Start at  23:55:41
   Duration  4.28s
```
The header carried the minted id instead of the selected `tid-tab1-journey` — exactly the
mutation the probe described.

### 2. After the restore — GREEN
`pnpm exec vitest run src/shared/hooks/useAiChat.threadSelect.test.tsx`:
```
 ✓ src/shared/hooks/useAiChat.threadSelect.test.tsx  (3 tests) 105ms

 Test Files  1 passed (1)
      Tests  3 passed (3)
   Start at  23:56:26
   Duration  8.80s
```

### 3. Regressions
`pnpm exec vitest run src/shared/api/aiThreadClient.promote.test.ts`:
```
 ✓ src/shared/api/aiThreadClient.promote.test.ts  (2 tests) 2ms

 Test Files  1 passed (1)
      Tests  2 passed (2)
   Start at  23:56:36
   Duration  908ms
```
`pnpm exec vitest run src/shared/hooks/useAiChat.hydrationClobber.test.tsx`:
```
 ✓ src/shared/hooks/useAiChat.hydrationClobber.test.tsx  (5 tests) 246ms

 Test Files  1 passed (1)
      Tests  5 passed (5)
   Start at  23:56:37
   Duration  1.49s
```

### 4. Typecheck (once, pre vs post)
`npx tsc --noEmit`:
- BEFORE the edit: 7 lines (full text saved at /tmp/tsc-before-l2tab2u3.txt) — 5 lines from the
  pre-existing RefCombobox.ontologyref.test.tsx error (TS2322) +
  `src/shared/api/aiThreadClient.ts(205,40): error TS6133: 'threadId' is declared but its value is never read`
  (induced by the PROBE line dropping the only use of `threadId`).
- AFTER the restore: 6 lines (full text at /tmp/tsc-after-l2tab2u3.txt) — only the pre-existing
  RefCombobox error; the TS6133 is gone. Count decreased by 1; no increase vs tip.

## Exit state
- One commit naming the unit (message: "L2-P1-TAB2-TRANSCRIPT-1 u3selectid: restore
  selected-thread-id override (mutation probe closed) — second tab read carries the listed id").
- `git -c core.fileMode=false status --short` clean except this report's marker line, which is
  appended as the mandated LAST action after reading the commit sha (a marker cannot be
  committed in the same commit it names).

## Next actions / blockers
- None. Nothing else in this unit's scope; the WIP commit's rest (aiThreadClient.ts +23,
  useAiChat.ts +97, useAiChat.threadSelect.test.tsx 199 lines) was already delivered in 148a0b80
  and is untouched here.

L2-P1-TAB2-TRANSCRIPT-1-u3finish UNIT L2-P1-TAB2-TRANSCRIPT-1-u3finish DONE 69687061f948c486da5d954fbb4ad14f6a1b4598
