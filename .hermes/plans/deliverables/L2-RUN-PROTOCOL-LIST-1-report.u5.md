# L2-RUN-PROTOCOL-LIST-1 — unit u5 (run-surface render leg)

- Item: L2-RUN-PROTOCOL-LIST-1 (lane 2)
- Unit: u5 of 5 — ordered read-only protocol list on the run surface
- Worktree: /home/brad/cl-wt/L2-RUNPROTO-u5-lane2
- Branch: cl/lane2-runproto-u5-render-l2t2145
- Base: b854c18c6bf60224ad92713c44f24b7c9fa085dd
- Product commit: 50bc4cb4f6d945d84a5cb370d1e71195e14f8408
  ("RUNPROTO u5: render attached protocols as an ordered list on the run surface")
- Status: implementation complete and committed; unit exit marked BLOCKED because the mandated
  mount check (`RunWorkspacePage.surface.test.tsx`) is red **at base, independently of u5** (see
  "Mount check" below). No u5 product rework is required to clear it.

## Changed files (4 files, 242 insertions; 240 source lines by wc)

- `app/src/run/runProtocolRefs.ts` (NEW, 57 lines) — pure client reader `protocolRefsOf`,
  `ReadProtocolRef`.
- `app/src/run/RunProtocolList.tsx` (NEW, 80 lines) — the list component.
- `app/src/run/RunProtocolList.test.tsx` (NEW, 103 lines) — 9 tests covering both.
- `app/src/run/RunWorkspacePage.tsx` (EDIT, +2 lines) — import + one mount line after
  `<ModeToggle … />` inside `.run-workspace-toolbar`.

No server/schema/config/record/event-editor file touched. `RunProtocolStepsLoader.tsx`,
`RunProtocolStepsLoader.test.tsx`, `RunWorkspacePage.surface.test.tsx`,
`RunWorkspacePage.gc-section.test.tsx`, `RunWorkspacePage.css`, `RunWorkspaceShell.tsx`,
`RunNavPane.tsx` untouched (verified by `git status --short` before commit: only the 4 paths).

## Decisions

- Reader precedence per brief: non-empty `localProtocolRefs` is authoritative (order preserved,
  id-dedupe first-occurrence-wins, objects or bare id strings normalised to `{id, label?}`);
  otherwise legacy `localProtocolRef`; otherwise `protocolRef`, then `sourceRef` (the loader's
  existing pre-list fallback); nothing => `[]`. When the canonical list is present the legacy
  singular is NOT re-appended — the list is the answer (documented in the reader docstring).
- `label` is omitted, never `undefined` (`...(label ? { label } : {})`), matching the repo's
  exactOptionalPropertyTypes posture; the test pins `'label' in refs[1] === false`.
- Docstring names the reader as a local MIRROR of `server/src/protocol/runProtocolList.ts`
  (server ESM must not be imported by the app) and says WHY the client additionally accepts
  `protocolRef`/`sourceRef` (RunProtocolStepsLoader read-compat for pre-list PLRs).
- Component resolves run → `plannedRunRef.id` → PLR payload with `apiClient.getRecord`, reuses the
  loader's `cancelled` unmount idiom, publishes nothing, renders `null` on error/empty. No
  attach/detach affordance, no sorting, no truncation, no collapse. Lead is `<li data-lead="true">`
  with visible `(lead)`; entries show label when present, id otherwise. Heading names the count.
- Styling is inline with `--cl-*` tokens only (no new CSS file allowed by the brief; the toolbar is
  `display: contents`, so the list is a compact inline-flex row).
- No protocol ids / vendor names / `PRT-`/`LPR-`/`MAT-` literals in product code (grep clean);
  literals exist only in the test.

## RED (before implementation)

`cd app && npx vitest run src/run/RunProtocolList.test.tsx`

```
 FAIL  src/run/RunProtocolList.test.tsx [ src/run/RunProtocolList.test.tsx ]
Error: Failed to resolve import "./runProtocolRefs" from "src/run/RunProtocolList.test.tsx". Does the file exist?
 Test Files  1 failed (1)
      Tests  no tests
```

## Mutation probe (teeth check)

Applied exactly: the reader's `localProtocolRefs` branch replaced with `return []`.
`cd app && npx vitest run src/run/RunProtocolList.test.tsx`:

```
 FAIL  src/run/RunProtocolList.test.tsx > RunProtocolList > renders three attached protocols in order with the first marked lead
TestingLibraryElementError: Unable to find role="listitem"
...
 FAIL  src/run/RunProtocolList.test.tsx > protocolRefsOf (pure reader) > returns localProtocolRefs in order, normalising objects and bare ids; the list wins
...
 FAIL  src/run/RunProtocolList.test.tsx > protocolRefsOf (pure reader) > de-duplicates by id keeping the first occurrence position
 Test Files  1 failed (1)
      Tests  3 failed | 6 passed (9)
```

Reverted before commit; the committed reader is the pre-mutation version
(`git diff 50bc4cb4 -- app/src/run/runProtocolRefs.ts` is empty).

## Verification (final tree)

1) `cd app && npx vitest run src/run/RunProtocolList.test.tsx`

```
 ✓ src/run/RunProtocolList.test.tsx  (9 tests) 118ms
 Test Files  1 passed (1)
      Tests  9 passed (9)
```

2) `cd app && npx vitest run src/run/RunProtocolStepsLoader.test.tsx` (regression)

```
 ✓ src/run/RunProtocolStepsLoader.test.tsx  (6 tests) 332ms
 Test Files  1 passed (1)
      Tests  6 passed (6)
```

3) `cd app && npx tsc --noEmit` — 0 output lines, exit 0 (baseline preserved).

## Mount check — RED, pre-existing at base (BLOCKED reason)

`cd app && npx vitest run src/run/RunWorkspacePage.surface.test.tsx`

```
Error: [vitest] No "useOptionalEventEditor" export is defined on the "../event-editor/EventEditorContext" mock. Did you forget to return it from "vi.mock"?
 ❯ src/run/RunWorkspacePage.surface.test.tsx  (1 test | 1 failed) 3020ms
   ❯ ... > registers the universal chat INSIDE the editor provider, with the ghost seam + accept wired (Apply applies, proposals mount)
     → expected undefined to be truthy
AssertionError: expected undefined to be truthy
 Test Files  1 failed (1)
      Tests  1 failed (1)
      Errors  1 error
```

Diagnosis (evidence, not inference):

- `app/src/agent/HarnessChatPane.tsx:289` calls `useOptionalEventEditor()`, added by commit
  `cd0f237c` (2026-11-04, "TARGET1 fix1/D2"), which IS an ancestor of base `b854c18c`.
- The surface test's `vi.mock('../event-editor/EventEditorContext', …)` factory
  (`RunWorkspacePage.surface.test.tsx:240-247`) exports only `EventEditorProvider`,
  `useEventEditor`, `isDeckSetupLocked`; the test file was last touched 2026-10-26 (`296ad038`).
- Empirical baseline: with ONLY u5's two `RunWorkspacePage.tsx` lines temporarily removed (page
  byte-identical to base), the same command still returns
  `Test Files 1 failed (1) / Tests 1 failed (1) / Errors 1 error`. Restored immediately.
- Therefore this is not a u5 regression, and it cannot be fixed from owned files: the mock factory
  replaces the module, so no product-side change can supply the missing export. The brief forbids
  editing `RunWorkspacePage.surface.test.tsx`.

Full log retained outside git: /home/brad/.runproto-u5-scratch/surface.log (scratch dir removed at
exit; the raw excerpt above is the complete failure summary).

Resume condition / next action (owner: orchestrator): open a separate unit to add
`useOptionalEventEditor` to the surface test's `EventEditorContext` mock (test-only, prohibited for
u5), then re-run the mount check. No u5 code change is needed; the 2-line mount in
`RunWorkspacePage.tsx` is already committed and the targeted tests are green.

## Environment note (launcher)

`app/node_modules` was materialized pointing at `<trunk>/app/node_modules`, which is empty (the
brief's known trap), so `npx vitest` was `command not found`. Repointed the untracked symlink to
`<trunk>/node_modules` (= /mnt/vast/home/brad/git/cl-integration-2/node_modules) per the brief.
Both launcher symlinks (`app/node_modules`, `server/node_modules`) were present as `??` at entry;
`.git/info/exclude` now excludes them locally so the tree is clean and the launcher's WIP
auto-commit cannot commit absolute-path symlinks. They remain in place so the reviewer can run tests.

## Exit state

- Product commit 50bc4cb4f6d945d84a5cb370d1e71195e14f8408 is on
  `cl/lane2-runproto-u5-render-l2t2145`, parent b854c18c.
- Report commit follows this file (report-only).
- `git -c core.fileMode=false status --short` — clean (verified after the report commit).
- No scratch files in the worktree; probe scratch under /home/brad/.runproto-u5-scratch removed.

L2-RUN-PROTOCOL-LIST-1 UNIT u5 BLOCKED pre-existing surface-test mock failure at base (cd0f237c), not u5; product commit 50bc4cb4f6d945d84a5cb370d1e71195e14f8408 green
L2-RUN-PROTOCOL-LIST-1-u5 UNIT unit BLOCKED pre-existing surface-test mock missing useOptionalEventEditor at base; u5 code+tests green at 50bc4cb4f6d945d84a5cb370d1e71195e14f8408
