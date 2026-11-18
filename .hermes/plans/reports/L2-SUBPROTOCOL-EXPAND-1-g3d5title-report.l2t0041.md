# L2-SUBPROTOCOL-EXPAND-1 / unit g3d5title — report (lane 2, l2t0041)

Worktree: /home/brad/cl-wt/L2-SUBPROTOCOL-EXPAND-1-g3d5title-lane2
Branch: cl/lane2-subproto-expand-1-g3d5title-0041
Base: 48001490f27bbeddaae6e5b4b0bde45094c12ccb
Commit: 9eff5a586480f71cc2a81da8749693e2fce086d7

## What changed
- app/src/graph/BindingMode/BindingModeEditor.tsx
  - new exported pure helper `planHeadingTitle(title: string): string` — strips only an
    anchored `/^\s*plan\s*:\s*/i` prefix; falls back to the original string when the
    remainder is empty after trim.
  - heading now renders `Plan: {planHeadingTitle(title)}` (one line changed).
  - `const title = prPayload.title || 'Untitled Plan'` unchanged; no write/normalize of the
    record, no API/server/schema/CSS change.
- app/src/graph/BindingMode/BindingModeEditor.plantitle.test.tsx (new) — 5 tests:
  4 pure-helper assertions from the brief plus 1 render assertion of the real h2 through
  the actual `BindingModeEditor` (the render case is what makes the mutation probe bite).

## Deviation worth flagging to the orchestrator
The brief asked for `// @vitest-environment node` "helper is pure" AND a mutation probe that
fails when only the h2 call-site is reverted to `Plan: {title}`. Those two are mutually
exclusive: a helper-only pin stays green under the probe (reviewer bait #6). I kept the four
helper assertions exactly as specified but moved the file to the default jsdom environment and
added one full-component render assertion so the pin observes the call site. Cost: ~10.3 s once
for that file (2.5 s warm), not 15 s per run. File is ~76 lines vs the 45-line budget; the extra
is the standard mock boilerplate (5 module mocks, one fixture, one render).

## Verification (raw)
RED first (before the fix), `npx vitest run src/graph/BindingMode/BindingModeEditor.plantitle.test.tsx`:
    FAIL  src/graph/BindingMode/BindingModeEditor.plantitle.test.tsx > planHeadingTitle > strips a leading "Plan: " prefix so the heading does not stutter
    TypeError: planHeadingTitle is not a function
    ...
    Test Files  1 failed (1)
          Tests  4 failed (4)

GREEN after the fix:
    ✓ src/graph/BindingMode/BindingModeEditor.plantitle.test.tsx  (5 tests) 92ms
    Test Files  1 passed (1)
          Tests  5 passed (5)

Frozen compile test (untouched, `git diff` shows no change to it):
    ✓ src/graph/BindingMode/BindingModeEditor.compile.test.tsx  (6 tests) 8086ms
    Test Files  1 passed (1)
          Tests  6 passed (6)
    Duration  10.39s

MUTATION PROBE (tree clean at 9eff5a58, then only the h2 line reverted to `Plan: {title}`;
`git status --short` showed exactly `M app/src/graph/BindingMode/BindingModeEditor.tsx` and no
other product path):
    FAIL  src/graph/BindingMode/BindingModeEditor.plantitle.test.tsx > bindings page heading > renders a single "Plan:" prefix when the record title already begins with it
    Error: expect(element).toHaveTextContent()
    Expected element to have text content:
      /^Plan: 2026-09-06 Run template$/
    Received:
      Plan: Plan: 2026-09-06 Run template
    ...
            <h2 class="binding-mode-editor__title">
              Plan:
              Plan: 2026-09-06 Run template
            </h2>
Pin is not vacuous. Heading restored; re-run 5/5 green and `git status --short` empty.

TYPECHECK (`cd app && npx tsc --noEmit`, run once): 13 pre-existing lines, none in owned files —
module resolution failures in this worktree's install (`ajv` MISSING, `prosemirror-view` MISSING
per `require.resolve`), e.g.
    src/editor/taptab/tabNavPlugin.ts(7,33): error TS2307: Cannot find module 'prosemirror-view'
    src/validation/AjvValidator.ts(17,21): error TS2307: Cannot find module 'ajv/dist/2020.js'
    ../server/src/validation/AjvValidator.ts(18,73): error TS2307: Cannot find module 'ajv'
No BindingModeEditor diagnostic. The brief's 0-line baseline does not reproduce in this
worktree (dependency install, not code); flag for the orchestrator, no code action taken.

## Acceptance mapping
- AC1/AC2: heading now yields `Plan: 2026-09-06 Run template`; `Test Protocol Plan` renders
  verbatim with a single prefix (both covered by tests). Visual re-grade is the milestone bundle
  per the item note; no gate dispatched by this unit.
- AC3: no record/schema/server path touched — `git diff --stat` is two files under
  app/src/graph/BindingMode/. The six frozen heading assertions pass unmodified.
- Hardcode boundary respected: the lone "Plan" literal is the prefix in the regex and the
  existing heading label; test fixtures use generic ids (`PLR-TEST-HEADING`).

## Next actions / blockers
- None for code track. Orchestrator: review commit 9eff5a58; AC1 visual check happens in the
  milestone browser bundle. Pre-existing tsc environment failures are outside this unit's scope.

L2-SUBPROTOCOL-EXPAND-1 UNIT 1 DONE 9eff5a586480f71cc2a81da8749693e2fce086d7
