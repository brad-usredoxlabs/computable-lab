# L2-SUBPROTOCOL-EXPAND-1 — unit railpending — run report

- worktree: /home/brad/cl-wt/L2-SUBPROTOCOL-EXPAND-1-railpending-lane2
- branch: cl/lane2-subproto-railpending-1214
- base: 74f11d8f06d8771d4e021f4eda488998ff0afecb
- unit: railpending (1 of 1 in this leg)
- defect addressed: G3-D3 (MAJOR, browser gate g3, addendum F5)

## Summary
The run workspace's Protocol rail must never claim "No protocol attached" for a run whose
protocol identity is already known but whose steps are still in flight. It now renders a
pending rail while the loader settles, and an honest read-failure line if the step read
fails — never a live "Attach to run" affordance that could replace the attached protocol.

The root cause was that `RunProtocolStepsLoader` publishes the protocol identity
(`sel?.setProtocol`) BEFORE the steps fetch lands, while `ProtocolNavPanel` keyed its single
empty branch on `steps.length === 0` alone, so the pending window fell through to the attach
panel. A protocol record requires >= 1 step (schema/workflow/protocol.schema.yaml:320
`minItems: 1`), so "identity known AND steps empty" can only mean pending-or-failed — never a
genuinely step-less protocol.

## Change (4 owned files)
1. `app/src/event-editor/protocol/ProtocolSelectionContext.tsx` (+8)
   Added `stepsPending: boolean` (default `false`) and `setStepsPending(next: boolean)` to
   `ProtocolSelectionState`; wired into the provider value.
2. `app/src/run/RunProtocolStepsLoader.tsx` (+4)
   Publishes `sel?.setStepsPending(true)` immediately after the identity is resolved and
   BEFORE the steps fetch; clears it to `false` in a `finally` that runs on success, on
   !res.ok, and on throw. Guarded by `if (!cancelled)` so a superseded load never clears the
   flag a newer load just published. The existing publish-only-when-non-empty rule
   (:207-213) is left byte-for-byte (race protection against ProtocolTabPanel — not mine to
   change). No server call added.
3. `app/src/event-editor/right-pane/protocol/ProtocolNavPanel.tsx` (+35)
   Split the single `steps.length === 0` branch three ways:
     (a) `sel?.protocol && sel?.stepsPending` -> identity header + "Loading steps for
         <title/recordId>…" (data-testid `protocol-nav-pending`), NO attach affordance.
     (b) `sel?.protocol && !sel?.stepsPending` -> honest read-failure line "The attached
         protocol's steps could not be read — open the run workspace to retry"
         (data-testid `protocol-nav-read-error`), NO attach affordance.
     (c) no known protocol -> the EXISTING `AttachProtocolPanel` branch, unchanged.
   The change-protocol (`changing`) branch is untouched. No server call added.
4. `app/src/event-editor/right-pane/protocol/ProtocolNavPanel.pending.test.tsx` (+69, NEW)
   Renders the panel inside `ProtocolSelectionProvider` with a helper that publishes the
   identity (`sel.setProtocol({recordId:'LPR-1', title:'Cell Seeding'})`) + the pending state
   with steps empty. Asserts the rail does NOT render "No protocol attached" and does NOT
   render the attach surface (`attach-protocol` testid). The no-protocol case still shows the
   attach hint (AC3).

## Commit chain (each named unit railpending)
- 33713bba452c21ba41269ea8214962d99f3d54ae  step 1 RED (new test; setStepsPending absent -> throws)
- 77e5c6e77d47906effb402e900ff5543d63ea215  step 2 (stepsPending state + loader publish)
- b419d5e2bbd90bbe53231af1872269b296d2673f  step 3 (rail splits pending/failed/attach — GREEN)
- c595b5f3d76430fe4cf2aa280f164f8126184ff1  step 3 (cont.) trim to OUTPUT BUDGET  (== HEAD)

## ACCEPTANCE CONTRACT
- AC1: On a run with an attached protocol, throttle the first steps request and load
  /runs/<run>: the rail shows the protocol's identity + a loading line, never "No protocol
  attached" at any paint. -> covered by branch (a) + test 1.
- AC2: During that window there is NO clickable "Attach to run" control in the rail. -> covered
  by the absence of the `attach-protocol` surface in branches (a)/(b) + tests 1 & 2.
- AC3: A run with NO protocol still shows the attach surface, unchanged; the settled 4-step
  rail is byte-identical to today's. -> branch (c) is the pre-existing AttachProtocolPanel
  branch, unchanged + test 3; the non-empty settled path was not touched.

## VERIFY (raw)

### Step 1 — RED (at base 74f11d8f, `npx vitest run .../ProtocolNavPanel.pending.test.tsx`)
At HEAD `setStepsPending` does not exist, so the helper throws. Raw:

    ⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯
     FAIL  .../ProtocolNavPanel.pending.test.tsx > ProtocolNavPanel — pending / failed steps rail > identity known + steps pending -> pending rail, no attach surface
     FAIL  .../ProtocolNavPanel.pending.test.tsx > ProtocolNavPanel — pending / failed steps rail > identity known + steps failed -> honest read-failure line, no attach surface
    TypeError: sel?.setStepsPending is not a function
     ❯ src/event-editor/right-pane/protocol/ProtocolNavPanel.pending.test.tsx:34:10
         32|   useEffect(() => {
         33|     sel?.setProtocol({ recordId: 'LPR-1', title: 'Cell Seeding' })
         34|     sel?.setStepsPending(pending)
           |          ^
    ⎯⎯⎯⎯[1/2]⎯⎯⎯⎯
     Test Files  1 failed (1)
          Tests  2 failed | 1 passed (3)

### Targeted test run (after fix) — `cd app && npx vitest run src/event-editor/right-pane/protocol/ProtocolNavPanel`
    Test Files  6 passed (6)
         Tests  33 passed (33)
    (baseline at 74f11d8f was 5 files / 30 tests; the same 5 files still pass UNEDITED and the
     new pending file adds 3 tests -> 6 files / 33 tests)

### Typecheck — `cd app && npx tsc --noEmit`
    Output is byte-identical to the baseline (19 output lines, `diff` empty): the only errors
    are the pre-existing `suggestionPlan`/`valueShape` (RefCombobox.ontologyref.test.tsx) family
    plus pre-existing module-resolution errors in files NOT owned by this unit. ZERO new lines
    added by this change.

### Tree state — `git -c core.fileMode=false status --short`
    (clean — no output)
    HEAD = c595b5f3d76430fe4cf2aa280f164f8126184ff1

## OUTPUT BUDGET
- files <= 4: 4 files changed (exactly the owned set; no prohibited path touched)
- lines <= 120: 116 added lines total across the 4 owned files (8 + 69 + 35 + 4)
- `git diff --numstat 74f11d8f..HEAD -- app/src`:
      8  app/src/event-editor/protocol/ProtocolSelectionContext.tsx
      69 app/src/event-editor/right-pane/protocol/ProtocolNavPanel.pending.test.tsx
      35 app/src/event-editor/right-pane/protocol/ProtocolNavPanel.tsx
       4 app/src/run/RunProtocolStepsLoader.tsx

## Next actions / blockers
- None. Implementation complete. Browser-gate acceptance of AC1–AC3 is owned by the
  independent browser reviewer (live lane stack, not part of this unit's verification).
- No domain-policy (YAML) change, so no orchestrator lane-stack reload is required.

## Exit markers
L2-SUBPROTOCOL-EXPAND-1-railpending UNIT unit DONE c595b5f3d76430fe4cf2aa280f164f8126184ff1
L2-SUBPROTOCOL-EXPAND-1 UNIT railpending DONE c595b5f3d76430fe4cf2aa280f164f8126184ff1
UNIT railpending DONE c595b5f3d76430fe4cf2aa280f164f8126184ff1
