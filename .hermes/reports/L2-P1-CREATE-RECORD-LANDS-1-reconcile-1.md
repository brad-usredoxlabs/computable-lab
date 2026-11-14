# L2-P1-CREATE-RECORD-LANDS-1 — unit L2-P1-CREATE-RECORD-LANDS-1-reconcile-1

Lane 2 · worktree /home/brad/cl-wt/L2-P1-CREATE-RECORD-LANDS-1-onevoice ·
branch cl/lane2-p1-create-record-lands-1-onevoice-0545 · base 08d9d2ef0d46b1d8e2b8b7bc742a20391e9fe414

## What changed (1 file, +86/−24)

app/src/run/RunSurfaceChatBridge.onevoice.test.tsx (test-only; useAiChat.ts NOT touched — the
recordDraftStaged seam at useAiChat.ts:2072-2075 was left as-is because the run surface CAN
mount the staged preview, so the brief's fallback tightening route was not needed):

1. awaitTurnComplete (brief CHANGE-1): completion now = stopGone AND (honest wall OR the staged
   deck-preview marker). The real marker is the deck bar's own markup: PreviewActionBar.tsx:159
   renders <div className="preview-bar" role="region" aria-label="Preview actions"> — no invented
   testid. Wall fallback selector [data-testid="honest-wall"] unchanged (useAiChat.ts:1006
   documents that channel).
2. Test tree (brief CHANGE-1): the run surface's deck seam is now actually mounted —
   <PreviewActionBar /> next to <DeckChatSlice /> inside the same ChatFocusProvider subtree
   RunWorkspacePage.tsx:196-251 wires. The mocked event-editor state carries the fields the REAL
   useDeckGhostMount closure reads (labwares, equipments — useDeckGhostMount passes state.labwares
   verbatim to buildPreviewFromDraft) and actions.setPreview mutates the SAME state object (the
   mock editor has no reducer), so the real bar renders the real staged preview on rerender —
   the assertion is against rendered DOM, not a spy.
3. One-voice assertions (brief CHANGE-2): exactly ONE marker on screen — preview bar OR wall,
   never both, never neither; it NAMES the material (the staged preview's review modal —
   ProposedGraphModal.tsx:312 proposed-records-section, :319 proposed-record-row — lists "Lysis
   buffer" by name, opened via the bar's own "View changes" button); when the wall is the voice
   it still must not say "Nothing was proposed". The no-bubble assertion is UNCHANGED and
   unconditional: document.body.textContent must not contain
   "AI completed the task but did not propose any changes." — never weakened.

Grounding: GOVERNED-WRITE-ADMISSION-l2-20261113.md §3 (ruling item 3): "Document reading produces
a *proposal* ... the person accepts" — the pin asserts the proposal lands as a staged deck
preview (proposal, not commitment), with the wall as fallback only when nothing was staged.
Repository state matched the grounding; no conflict found.

## Verification (all commands run in app/ unless noted)

RED at base (change stashed, then restored):
  npx vitest run src/run/RunSurfaceChatBridge.onevoice.test.tsx
  -> 1 failed, Error: turn never completed   (exactly the brief's stated RED)

GREEN at final state:
  npx vitest run src/run/RunSurfaceChatBridge.onevoice.test.tsx src/shared/hooks/useAiChat.wall.test.tsx src/event-editor/deck/useDeckGhostMount.u1recordsdraft.test.ts
  -> Test Files 3 passed (3) · Tests 9 passed (9)
     RunSurfaceChatBridge.onevoice.test.tsx (1 test) passed
     useAiChat.wall.test.tsx (6 tests) passed
     useDeckGhostMount.u1recordsdraft.test.ts (2 tests) passed
  NOTE: the brief's stated baselines ("5 passed" / "4 passed") do not match the suites at base
  08d9d2ef — the actual per-suite counts there are 6 and 2 (measured, not assumed). Both stayed
  green; I did not touch either file, so the suites are unchanged.

Typecheck (npm run typecheck -w app, i.e. tsc --noEmit) at the FINAL commit:
  exit 2, errors ONLY in server/: ../server/src/validation/AjvValidator.ts(18,73) and
  (19,24), ../server/src/validation/types.ts(8,32) — "Cannot find module 'ajv'/'ajv-formats'".
  Pre-existing: identical 3 errors at base 08d9d2ef with my change stashed (verified by stash
  re-run). ajv is not installed in this worktree's node_modules. No error in app/; my change
  is a single test file and introduces zero app-side type errors. Owner for the server
  install: orchestrator / server workspace — outside this unit's scope (PROHIBITED: all server
  files).

## Changed files
- app/src/run/RunSurfaceChatBridge.onevoice.test.tsx (only file; within OWNED scope, budget files=1<=2, lines +86/-24)

## Next actions / blockers
- None for this unit. Server-side tsc failure (missing ajv) is pre-existing at base and needs a
  dependency install in the server workspace — not caused by, and not fixable within, this unit.
L2-P1-CREATE-RECORD-LANDS-1 UNIT L2-P1-CREATE-RECORD-LANDS-1-reconcile-1 DONE 191252aabce64c3cdd6cf8442ecdf9e81f3243dd
