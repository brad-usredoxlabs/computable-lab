# L2-RUNPROTO-SURFACEFIX-1 / u1 — surface-test mock export fix

Item: L2-RUNPROTO-SURFACEFIX-1-u1 (lane 2), branch cl/lane2-runproto-surfacefix-l2t2205,
base b854c18c6bf60224ad92713c44f24b7c9fa085dd.

## Change
app/src/run/RunWorkspacePage.surface.test.tsx, +1 line in the
`vi.mock('../event-editor/EventEditorContext')` factory:

    useOptionalEventEditor: () => null,

Placed next to `useEventEditor`. HarnessChatPane.tsx:289 calls
`useOptionalEventEditor()` (real hook at EventEditorContext.tsx:1711 returns
`ContextValue | null`, so null is contract-legal). Test fixture only; no product
code touched. Commit: ca0079aba0d80d13bb3ac8e6a7fbb995fabf07dc
("test(run): mock useOptionalEventEditor in surface test").

## Environment note
The dispatch-time symlink app/node_modules pointed at
/mnt/vast/home/brad/git/cl-integration-2/app/node_modules, which is an empty
stub (only .vite caches) — `npx vitest` returned "vitest: command not found".
Repointed the untracked symlink to the populated workspace root
/mnt/vast/home/brad/git/cl-integration-2/node_modules (same target another lane
worktree used); server/node_modules already pointed there. No tracked file
affected.

## Verification (all measured this run, logs in /tmp/l2runproto/)
1. RED before fix: `cd app && npx vitest run src/run/RunWorkspacePage.surface.test.tsx`
   -> Test Files 1 failed (1), Tests 1 failed (1), error verbatim:
   `[vitest] No "useOptionalEventEditor" export is defined on the "../event-editor/EventEditorContext" mock`
   at HarnessChatPane.tsx:289. (log: baseline run below / file run)
2. GREEN after fix: same command -> Test Files 1 passed (1), Tests 1 passed (1).
3. `cd app && npx vitest run src/run/`:
   - base (b854c18c, before fix): Test Files 2 failed | 29 passed (31);
     Tests 4 failed | 199 passed (203). Failing files:
     RunWorkspacePage.gc-section.test.tsx (3 tests, `rwp-shell` never renders)
     and RunWorkspacePage.surface.test.tsx (1 test, the mock-export error).
   - after fix: Test Files 1 failed | 30 passed (31);
     Tests 3 failed | 200 passed (203). Only the 3 pre-existing
     RunWorkspacePage.gc-section.test.tsx failures remain — same tests, same
     `Unable to find an element by: [data-testid="rwp-shell"]` errors. No new
     failures.
4. `cd app && npx tsc --noEmit` -> exit 0, no output.

## Remaining / out of scope
RunWorkspacePage.gc-section.test.tsx is RED at base for an unrelated reason
(page shell never mounts; it mocks HarnessChatPane so it is not this defect).
Not touched per scope. Owner: run-surface follow-up.

L2-RUNPROTO-SURFACEFIX-1 UNIT u1 DONE ca0079aba0d80d13bb3ac8e6a7fbb995fabf07dc
L2-RUNPROTO-SURFACEFIX-1-u1 UNIT unit DONE ca0079aba0d80d13bb3ac8e6a7fbb995fabf07dc
