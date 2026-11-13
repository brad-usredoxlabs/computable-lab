# L2-SUBPROTOCOL-EXPAND-1 / unit d1railpending2 — report

Item: L2-SUBPROTOCOL-EXPAND-1-d1railpending2 (1 of 1)
Lane: 2 · worktree: /home/brad/cl-wt/L2-SUBPROTOCOL-EXPAND-1-d1railpending2-lane2
Branch: cl/lane2-subproto-expand-1-d1railpending2-1546 · base: 0d02e31fc01a973b453bb96e25c556ff58df1387

## Decisions

- D-1 (gate g4, MAJOR): on `/runs/RUN-2026-09-06-run-kt2a` the rail rendered "No protocol
  attached / Attach to run" with live attach buttons during the resolve window, because
  `RunProtocolStepsLoader.tsx` published `stepsPending=true` only AFTER
  `await resolveRunProtocol(runId)` returned (old :140 → :160); meanwhile `ProtocolNavPanel.tsx`
  fell past both the pending branch and the failed branch into the attach surface.
- Fix (smallest, 2 product edits):
  1. Loader: `sel?.setStepsPending(true)` hoisted to the FIRST statement of `doLoad`, before the
     first await. The existing settle (`finally` → `if (!cancelled) sel?.setStepsPending(false)`)
     is untouched and not moved/duplicated — a superseded load cannot clear a newer load's flag.
  2. Panel: new `!proto && stepsPending` branch inside the `steps.length === 0` block renders the
     pending rail (`data-testid="protocol-nav-pending"`, copy "Resolving this run's protocol…")
     instead of falling through to `AttachProtocolPanel`. The existing `proto && stepsPending`
     branch and the `proto` read-error branch are byte-identical (untouched).
- Scenario soundness: a protocol record requires >=1 step (schema/workflow/protocol.schema.yaml:320
  `minItems: 1`), so "no identity and no steps" can only be resolving — never a settled empty
  protocol. No YAML touched, nothing to reload; no browser claims (gate owns that).
- No new context state (`stepsPending` already exists, one owner); `ProtocolSelectionContext.tsx`
  read-only; no dataset/run/protocol id literals in product code; no caching/prefetch (the 6–8 s
  window is not shortened by this unit — the rail is made honest about it).

## Files changed (owned, exactly 4; diff vs base 0d02e31f: 88 insertions, 5 deletions)

- app/src/run/RunProtocolStepsLoader.tsx (+6/-1)
- app/src/event-editor/right-pane/protocol/ProtocolNavPanel.tsx (+14)
- app/src/event-editor/right-pane/protocol/ProtocolNavPanel.pending.test.tsx (+23/-4)
- app/src/run/RunProtocolStepsLoader.test.tsx (+46)

Commits:
- ea5cbc08 d1railpending2: RED - no-identity-yet pending pin (resolve window must not show the attach door)
- ada718f4 d1railpending2: GREEN - publish stepsPending before first await; rail reads 'Resolving this run's protocol' with no identity yet

## RED (raw, step 1 — panel pin on unmodified product code)

```
 ❯ src/event-editor/right-pane/protocol/ProtocolNavPanel.pending.test.tsx:76:19
     74|       </MemoryRouter>,
     75|     )
     76|     expect(screen.getByTestId('protocol-nav-pending').textContent).toC…
       |                   ^
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
 Test Files  1 failed (1)
      Tests  1 failed | 3 passed (4)
```
Failing render: `attach-protocol__search` + "Loading available protocols…" — the live attach
surface rendered while `sel.protocol === null` and `sel.stepsPending === true`.

## Mutation probes (raw; each mutation RED on its own, both reverted)

Mutation A — `setStepsPending(true)` moved back below `await resolveRunProtocol(runId)`
(product `ProtocolNavPanel.tsx` fix in place; loader file only mutated):
```
 ❯ src/run/RunProtocolStepsLoader.test.tsx:409:41
    407|     // the initial false: it lands before the loader's effect publishe…
    408|     await waitFor(() => {
    409|       expect(settle[settle.length - 1]).toBe(true)
 ❯ waitFor / Timeout.checkRealTimersCallback
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
 Test Files  1 failed (1)
      Tests  1 failed | 8 passed (9)
```

Mutation B — `!proto && stepsPending` branch deleted from `ProtocolNavPanel.tsx`
(loader fix in place):
```
 ❯ src/event-editor/right-pane/protocol/ProtocolNavPanel.pending.test.tsx:76:19
     74|       </MemoryRouter>,
     75|     )
     76|     expect(screen.getByTestId('protocol-nav-pending').textContent).toC…
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
 Test Files  1 failed (1)
      Tests  1 failed | 3 passed (4)
```

Revert of BOTH product files before final verification —
`git -c core.fileMode=false status --short` after `git checkout --` of both product files:
```
(empty — no output)
```
and `git -c core.fileMode=false diff --stat 0d02e31f..HEAD -- <both product files>` shows only the
committed fix; the mutation edits were never committed.

## Final verification (raw)

Targeted tests:
`cd app && npx vitest run src/event-editor/right-pane/protocol/ProtocolNavPanel.pending.test.tsx src/run/RunProtocolStepsLoader.test.tsx`
```
 ✓ src/event-editor/right-pane/protocol/ProtocolNavPanel.pending.test.tsx  (4 tests) 50ms
 ✓ src/run/RunProtocolStepsLoader.test.tsx  (9 tests) 493ms

 Test Files  2 passed (2)
      Tests  13 passed (13)
   Start at  15:55:47
   Duration  2.63s
```
Baseline at 0d02e31f was 2 files / 11 tests; now 2 files / 13 tests (11 + 2 new legs: panel
no-identity-yet pin, loader before-first-await ordering leg).

Typecheck: `cd app && npx tsc --noEmit 2>&1 | grep -c 'error TS'` → `14`. Composer baseline was 1
at 0d02e31f. All 14 are pre-existing in files this unit does not touch (missing `ajv`/`yaml`/
`prosemirror-view` module declarations in `src/editor/taptab/*`, `src/event-editor/create/
RecordCreatePanel.gc16*`, `RefCombobox.ontologyref.test.tsx`, and `../server/**`); ZERO errors
reference the 4 changed files, and the change adds no imports/signatures, so it cannot introduce
type errors elsewhere. Count increase attributable to this unit: 0.

Tree clean at exit: `git -c core.fileMode=false status --short` → empty (verified after final commit).

## Acceptance mapping (browser gate to grade)

- AC1: pending flag now publishes before the first await (loader) and the panel renders the
  pending rail (not attach) while `proto === null && stepsPending` — no "No protocol attached",
  no live attach control in the resolve window; once identity + steps land, the rail shows the
  protocol and its steps (unchanged settled path).
- AC2: settled no-protocol run: `resolveRunProtocol` → null → `setProtocol(null)` → steps 404 →
  `finally` settles `stepsPending=false` → attach surface (`runId && studyId` branch, untouched).
  Existing test "no known protocol -> the attach hint" + the attach branch keep covering this.
- AC3: `protocol-nav-read-error` branch untouched (existing test "identity known + steps failed"
  passes); settle in `finally` clears the flag when steps land, so the pending rail is not a
  permanent wall.

## Next actions

- Browser gate: re-run g4 on `/runs/RUN-2026-09-06-run-kt2a` cold reload; confirm the rail never
  reads "No protocol attached" / shows live attach during the resolve window (AC1–AC3).
- No other owner actions known.

L2-SUBPROTOCOL-EXPAND-1-d1railpending2 UNIT d1railpending2 DONE 8f53dce6bb300f6a412ea50f71e31f83136e5b49
L2-SUBPROTOCOL-EXPAND-1-d1railpending2 UNIT unit DONE 8f53dce6bb300f6a412ea50f71e31f83136e5b49
