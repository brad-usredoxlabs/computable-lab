# L2-P1-THREAD-RESTORE-1 u4scope — implementation report

Lane 2, item L2-P1-THREAD-RESTORE-1, unit u4scope (k=1 of 1).
Branch: cl/lane2-threadrestore-u4scope-l2t2634. Base: 268124e480822077bb30a1b9f1b22a4783b6def1.

## Defect (r12 gate legB, reproduced)
On the RUN surface (/runs/RUN-...), after reload the thread picker mounts
populated but does NOT auto-resume the persisted thread — the deck stays empty
and the reviewer had to hand-select (10-thread-reselected.png).

## Root cause (source-located l2t2633, re-verified l2t2634)
The threadTabIds sessionStorage map is keyed by (tab, scope), and the hook +
aiThreadClient always pass `scope` — but HarnessChatPane's resume check called
`getThreadTabId()` with NO argument. On a scoped host (the run door resolves
scope = the run's record identity via SurfaceChatBridge/collectSurfaceContext)
the no-arg read hits the no-scope bucket ("") and returns a stale/absent id, so
`row.threadId === persisted` never matches and switchThread never fires.

## Fix (D4 seam, ruling l2t2633)
One seam, 2 source files + the owned test file. The hook already knows its
resolved scope (`activeThread.scope`, useAiChat.ts:965) and holds a stable ref
(`activeThreadRef`, :969-970); the fix exposes the resolved tab id through the
hook and consumes it in the pane.

File A — app/src/agent/HarnessChatPane.tsx (ThreadPicker resume arm, inside
`load`):
- Added `const tabThreadId = chat.tabThreadId` beside the other captured
  const (with a comment naming the r12 legB reason: the bare read hits the
  no-scope bucket).
- Resume check now reads `const persisted = (tabThreadId ? tabThreadId() :
  undefined) ?? getThreadTabId()` — the hook accessor, FALLING BACK to the bare
  `getThreadTabId()` only when the accessor is absent (non-thread-scoped stubs).
  The `import { getThreadTabId }` is KEPT for the fallback.
- Comment phrase updated to name the hook accessor.
- `load` deps array gains `tabThreadId` (stable identity — no churn,
  exhaustive-deps honest).

File B — app/src/shared/hooks/useAiChat.ts:
- Interface `UseAiChatReturn` (anchor line 237): added ONE OPTIONAL member
  `tabThreadId?: () => string | undefined` right after the `listThreads`
  doc-block (thread-scoped section). Optional only — the hand-rolled legacy
  stub literals predate required additions.
- Accessor defined as a `useCallback` near the lazy-mint effect (ONE seam):
  `() => (activeThreadRef.current ? resolveTabThreadId(activeThreadRef.current
  .scope) : undefined)`. It reads the STABLE REF at CALL TIME (not render-time
  `activeThread` state) because the pane's `load` closure is stale by
  construction (it captures the first-render chat — the pane's activeIdRef
  comment documents exactly this), and keeps a STABLE IDENTITY (useCallback on
  the ref) so the pane's load-dep array never re-fires on accessor churn.
  Absent until the lazy-mint has run (activeThread null -> undefined).
- Return object: added `tabThreadId: tabThreadId` inside the
  `...(endpoint ? { ... } : {})` thread-scoped spread, beside switchThread /
  newThread / listThreads.

  NOTE: the brief's verbatim snippet
  `tabThreadId: () => (activeThread ? getThreadTabId(activeThread.scope) :
  undefined)` would read RENDER-TIME `activeThread` state — stale in the
  pane's captured closure (same trap the pane comment at :76-80 warns of for
  `chat.threadId`). `activeThread` is only populated one render AFTER the
  lazy-mint effect, so a render-time read would return undefined inside the
  first load. The stable-ref form is the faithful implementation of the same
  seam ("the resolved tab id for this chat's (tab, scope)"); `resolveTabThreadId`
  is the already-imported alias of `getThreadTabId` (single mint site,
  threadTabIds.ts:100 — READ-ONLY, untouched).

Test — app/src/shared/hooks/useAiChat.threadSelect.test.tsx:
- Added `ScopedHookHost` (real useAiChat with endpoint + scope, no pane) and a
  4th test: render with scope `run:RUN-1`, wait for the accessor to resolve,
  assert `tabThreadId() === getThreadTabId(SCOPE)` (the scoped bucket, NOT the
  bare no-scope bucket — asserted distinct), and that the persisted map entry
  under the scope equals it. A ThreadPicker-level assertion is not required
  (jsdom sessionStorage bucket check via the hook accessor suffices, per brief).

## Prohibited files — untouched
threadTabIds.ts, aiThreadClient.ts, SurfaceChatBridge.tsx,
collectSurfaceContext.ts, all server files: NOT edited (verified by git
status: only the 3 owned files changed).

## Verification (all run from app/ workspace cwd, per brief)
Commands and REAL output:

1. `npx vitest run src/shared/hooks/useAiChat.threadSelect.test.tsx`
   - RED (before the accessor, at base+test): `1 failed | 3 passed (4)` — the
     new test fails with `tabThreadId` undefined (member absent). Confirmed.
   - GREEN (final commit): `Test Files 1 passed (1); Tests 4 passed (4)`.
2. `npx vitest run src/agent`
   - Final: `Test Files 35 passed (35); Tests 202 passed (202); Errors 1 error`.
     The single unhandled fetch error (ClarificationPicker.tsx:738, a live
     fetch in a module init) is PRE-EXISTING at base (verified: identical
     `202 passed, 1 error` on the stashed base tree).
3. `npm run typecheck`
   - 17 error lines at base, 17 error lines after the change — the sets are
     BYTE-IDENTICAL (diff of sorted error lists is empty). ZERO NEW errors;
     none in the 3 changed files. The pre-existing RefCombobox TS2322
     (src/editor/taptab/RefCombobox.ontologyref.test.tsx:32) is present in
     both. The other 16 are environmental (missing ../server node_modules:
     yaml/ajv/ajv-formats) and unrelated pre-existing test-file errors —
     identical at base.

## Changed files (final diff --stat)
- app/src/agent/HarnessChatPane.tsx: +11/-4
- app/src/shared/hooks/useAiChat.threadSelect.test.tsx: +32/-0
- app/src/shared/hooks/useAiChat.ts: +28/-0
(3 files, 71 insertions, 4 deletions — within budget: files <= 3, lines <= 80.)

## Commits
- Code (RED test + accessor + pane consumption): 9458e188dfd97c344ac3522211c19ba14cf23867
  "L2-P1-THREAD-RESTORE-1-u4scope (GREEN): ..."
- Report (this file): second commit.

## Acceptance map
1. threadSelect = 4 passed (new test asserts the accessor returns the scoped
   tab id). DONE.
2. HarnessChatPane resume check reads chat.tabThreadId() with getThreadTabId()
   fallback; app/ agent suites green (202 passed). DONE.
3. app typecheck: zero NEW errors (17 pre-existing identical set, including the
   pre-existing RefCombobox TS2322). DONE.
4. Browser gate is the PROMPT1 recert milestone (this item closes on
   code-track evidence plus that verdict). PENDING (browser recert).

## Marker
L2-P1-THREAD-RESTORE-1 u4scope DONE: PENDING_MARKER
