# L2-SUBPROTOCOL-EXPAND-1 — unit `danglingplan` — report

- Worktree: /home/brad/cl-wt/L2-SUBPROTOCOL-EXPAND-1-danglingplan-lane2
- Branch: cl/lane2-subproto-danglingplan-1214 (base 74f11d8f06d8771d4e021f4eda488998ff0afecb)
- Lane 2, tier normal. Unit: danglingplan (1 of 1).
- Head at report time: 23e8f1c722ac4b3bba4985e8acaf978659b95764

## What the unit does (G3-D4, carried from g2 F6)
When a run's `methodEventGraphId` 404s, the editor no longer paints the full-surface red
"Failed to load: ... NOT_FOUND" splash. A 404 is a STALE POINTER, not a transport failure, so
the load path now classifies the failure:

- `EventEditorContext.tsx`
  - `LoadState` union gains `'missing'` (was `'idle' | 'loading' | 'ready' | 'error'`).
  - New optional state field `missingGraphId?: string | null` (optional so the existing
    full-state test fixtures in out-of-scope files keep compiling untouched).
  - New `load_graph_missing` action + reducer case: sets `loadState: 'missing'`, stores the
    graph id, CLEARS `loadError`.
  - `load_start` and `load_error` reset `missingGraphId` to null so a later retry/success
    cannot resurrect the banner; `load_success` clears it too.
  - New exported `isGraphNotFound(message)` — strict test on the NOT_FOUND wire wording:
    `/\bNOT_FOUND\b/` or `/\bRecord not found:/` or `/\b404\b`. The catch in the load effect
    dispatches `load_graph_missing` ONLY when this matches; every other failure keeps the
    existing `load_error` dispatch VERBATIM (byte-identical message).
- `EventEditorShell.tsx` and `viewer/deck/DeckViewer.tsx`
  - Each gains ONE early `if (state.loadState === 'missing')` branch that renders the graph id
    and the plain line "This surface points at plan graph <id>, which does not exist yet.
    Rebuild the plan graph from the run workspace." plus a link back to `/runs/<runId>` when
    `state.runId` is present (run id arrives from the separate `set_run` effect, which runs
    independently of the graph load). No new fetch, no polling, no auto-retry. Reuses the
    existing neutral `.splash` / `.viewer-placeholder` CSS (the red colour lives only in the
    untouched `--error` variants) — no CSS file added (4-file budget).

## What did NOT change (verified)
- The `'error'` splash in shell and DeckViewer is byte-identical to base (no +/- on those lines
  in `git diff <base> HEAD`).
- `loadAcceptedEventGraph` still imported (line 3) and called (line 1532); the load effect body
  is unchanged apart from the catch's failure classification.
- The undo/hydration guard (now ~line 1566) still begins `if (state.loadState !== 'ready') return`.
- No write to the run record: `apiClient.updateRecord` is spied in the test and asserted never
  called; no new code path writes `methodEventGraphId`.
- No `server/**`, `schema/**`, `app/src/graph/**`, API-client, or existing-test edits.
  Files changed vs base (exactly the 4 owned):
  `app/src/event-editor/EventEditorContext.danglingPlan.test.ts` (+74),
  `app/src/event-editor/EventEditorContext.tsx` (+26/-4),
  `app/src/event-editor/EventEditorShell.tsx` (+21),
  `app/src/event-editor/viewer/deck/DeckViewer.tsx` (+19). Added=140, budget <=140. Files=4, budget <=4.

## Commits (oldest → newest, base..HEAD)
- 0a3b9ade test(danglingplan): RED — ... (test file first, fails at HEAD)
- 387603d0 feat(danglingplan): a NOT_FOUND ... degrades to a named 'missing' load state ...
- 99a852c5 fix(danglingplan): make missingGraphId optional + typecheck-clean test harness ...
- 23e8f1c7 refactor(danglingplan): compress test harness + trim comments to hit output budget ...

## RED (raw, final test file run against base 74f11d8f context — no 'missing' in the union)
Command: `cd <worktree-at-base>/app && npx vitest run src/event-editor/EventEditorContext.danglingPlan`
```
⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯

 FAIL  src/event-editor/EventEditorContext.danglingPlan.test.ts > danglingplan — a NOT_FOUND on the run plan graph degrades honestly > a 404 on the plan graph lands in loadState missing with the named graph id (no red splash)
Error: Test timed out in 5000ms.
If this is a long-running test, pass a timeout value as the last argument or configure it globally.

 FAIL  src/event-editor/EventEditorContext.danglingPlan.test.ts > danglingplan — a NOT_FOUND on the run plan graph degrades honestly > a genuine server failure (500) keeps the existing error splash (not swallowed)
AssertionError: expected undefined to be null
 ❯ src/event-editor/EventEditorContext.danglingPlan.test.ts:71:30
     69|    expect(s.loadState).toBe('error')
     70|    expect(s.loadError).toContain('event graph')
     71|    expect(s.missingGraphId).toBeNull()
       |                              ^
     72|    expect(apiClient.updateRecord).not.toHaveBeenCalled()

 Test Files  1 failed (1)
      Tests  2 failed (2)
```
Why it is RED: at base a NOT_FOUND-shaped rejection lands in `loadState: 'error'` (the catch
formats every failure as `load_error`), so the 'missing' test never settles and times out; and
`missingGraphId` does not exist on the state type at base, so the guard assertion fails
(`undefined` vs `null`).

## GREEN (raw, after the fix)
Command: `cd app && npx vitest run src/event-editor/EventEditorContext`
```
 ✓ src/event-editor/EventEditorContext.materialRefs.test.ts  (4 tests) 3ms
 ✓ src/event-editor/EventEditorContext.offerbinding.uifix2.fix4.test.ts  (5 tests) 4ms
 ✓ src/event-editor/EventEditorContext.test.ts  (8 tests) 6ms
 ✓ src/event-editor/EventEditorContext.danglingPlan.test.ts  (2 tests) 72ms

 Test Files  4 passed (4)
      Tests  19 passed (19)
   Start at  12:58:44
   Duration  2.68s (transform 494ms, setup 257ms, collect 1.52s, tests 85ms, environment 1.77s, prepare 395ms)
```
The 3 baseline files (17 tests) pass UNEDITED; the new file adds 2 tests. Baseline at base was
Test Files 3 passed (3), Tests 17 passed (17) — both preserved.

## Typecheck (raw)
Command: `cd app && npx tsc --noEmit`
The output ends with the pre-existing error the item documents:
`src/editor/taptab/RefCombobox.ontologyref.test.tsx(32,4): error TS2322` (the searchField
'string' vs '"keywords" | "tags"' mismatch) — NOT fixed, not mine.
ZERO LINES ADDED by this change, proven on an identical pipeline (same node_modules) against a
scratch checkout of base 74f11d8f:
  base: 14 error sites, head: 14 error sites, `diff` identical → "my change adds ZERO tsc lines".
Honest caveat: this worktree's pnpm store is incomplete (missing `prosemirror-view`, `ajv`,
`yaml` type declarations), so the full `tsc --noEmit` run also prints 13 environment module-
resolution errors (7 in `src/editor/taptab/**`, 4 in out-of-scope `src/event-editor/create/*`
test fixtures, plus 1 in `../server/src/validation/types.ts`). All 13 are present at base too
(verified by the identical-pipeline diff above) and touch files this unit must not edit. The
documented "exactly ONE pre-existing error, 6 output lines" baseline was measured in a
complete-store environment; in this worktree the pre-existing error set is the 14 sites listed
by the pipeline, and my change adds none of them.

## AC status (code-level; browser gate owns live acceptance)
- AC1 (404 names the graph id + way back to the run, no red splash): covered by the new test 1
  (state `missing`, `missingGraphId === <exact id>`, `loadError === null`, `runId === RUN_ID`,
  `updateRecord` never called) + the missing branch in shell/DeckViewer rendering the id, the
  exact line, and `/runs/<runId>` anchor. Not graded yet by the live browser lane.
- AC2 (genuine 500 keeps the existing splash): covered by the new test 2 (`loadState === 'error'`,
  `loadError` contains 'event graph', `missingGraphId === null`); the error-splash JSX is
  byte-identical to base.
- AC3 (no write to the run record): `updateRecord` spied + asserted never called in both tests;
  no code path in this unit writes `methodEventGraphId`. A live API read-back is the browser
  gate's to perform.

## Known risks / next actions
- Browser gate: run the AC1/AC2/AC3 live checks on the lane stack (fixture
  `EVG-2026-09-06-run-template-4fb3621f` on `RUN-2026-09-06-run-kt2a`, force a 500, read the run
  record back). Screenshots for the independent browser reviewer as usual.
- If the reviewer wants the missing banner styled (e.g. a `--cl-*`-tinted warning box), a small
  CSS rule is the follow-up — CSS files are outside this unit's 4-file ownership, so it was
  deliberately left to neutral existing classes.
- `missingGraphId` is optional (`string | null | undefined`) by design; a future schema pass can
  tighten it once out-of-scope fixtures are updated.

## Verification commands (reproducible)
- `cd app && npx vitest run src/event-editor/EventEditorContext` → 4 files / 19 tests pass.
- `cd app && npx tsc --noEmit` → pre-existing RefCombobox error + 13 env module errors, none from
  this change (identical-pipeline diff vs base 74f11d8f = zero added lines).
- `git -c core.fileMode=false status --short` → clean (empty) at exit.
- `git diff --numstat 74f11d8f06d8771d4e021f4eda488998ff0afecb HEAD -- app/src/event-editor/`
  → 74/26(-4)/21/19 added across the 4 owned files (added total 140).

Scratch worktree /home/brad/.subproto-danglingplan-scratch (base checkout + tsc baselines) was
deleted at exit; nothing left in /tmp or the NFS mount.
