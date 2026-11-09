# HANDOFF ADDENDUM — lane 2 — 2026-10-31T00:45 EDT (coder l2t2355, CHATUI1-LEGD-MERGEFIX)

## CHAT-UI-1 LEG D merge-glue repair (l2t2355): NO CODE CHANGE REQUIRED — measurement artifact
- Worktree wt/CHATUI1-LEGD-MERGEFIX-lane2-l2t2355 @ trunk 7400c5b6 (contains LEG D merge 8ff1892f).
- **The 9 "new post-merge app-tsc errors" are a measurement artifact, not merge glue.** All 9
  come from 4 files that are UNTRACKED in every worktree, have ZERO commit history in any ref,
  and exist only as lane-1 sync debris (listed in /home/brad/.hermes/cl/lanes/1/lane-exclude,
  header: "synced-from-main untracked paths; never stage these"):
    - app/src/event-editor/right-pane/ai/ParameterAnswerInput.test.tsx
    - app/src/event-editor/right-pane/ai/useChatThread.deckLayout.test.tsx
    - app/src/shared/context/useSurfaceContext.ts
    - app/src/shared/hooks/useAiChat.surfaceContext.test.ts
  They are symlinks into /mnt/vast/home/brad/git/computable-lab (the live checkout) present in
  cl-integration-2 (orch's measurement worktree) but absent from the clean lane-2 worktree.
- **GATE MET:** clean-worktree `npx tsc --noEmit` (cwd=app) = 10 distinct errors = the 11-line
  pre-merge baseline MINUS src/event-editor/right-pane/ai/systemPromptForViewer.ts (legitimately
  deleted by the merge, ebbf5d4a LEG D step 4; no tracked file imports it — no TS2307).
  Sorted-set: strict subset, zero new lines. See report deliverables/L2-CHAT-UI-1-report.legD-mergefix-l2t2355.md.
- **Reproduction of orch's 20-line evidence:** re-running the same command in cl-integration-2
  yields byte-identical 20 lines; the 20-10 delta is exactly the 9 debris lines + the
  systemPromptForViewer line that only appears in environments lacking the merge deletion.
- **No tracked file was edited, added, or deleted.** AiTabPanel/QuestionsPanel NOT resurrected.
  onDeckLayout: never existed in tracked useChatThread.ts at any commit (git log -S empty);
  deck-layout wiring lives in tracked useAiChat.ts + DeckSurfaceChat.tsx (compiles clean).
- **Disclosures (for orch):**
  1. The pre-merge baseline (evidence/tsc-premerge-baseline-l2t2250.txt) was measured in
     /tmp/premerge-base-l2t2250 WITHOUT the debris; the post-merge 20-line run was measured in
     cl-integration-2 WITH the debris symlinks. Not an apples-to-apples environment.
  2. cl-integration-2's 4 debris symlinks are untracked and should be removed from that
     worktree before the browser gate so future tsc/vitest measurements there are clean:
     rm cl-integration-2/{app/src/event-editor/right-pane/ai/ParameterAnswerInput.test.tsx,
     app/src/event-editor/right-pane/ai/useChatThread.deckLayout.test.tsx,
     app/src/shared/context/useSurfaceContext.ts, app/src/shared/hooks/useAiChat.surfaceContext.test.ts}
     (NOT done by coder — outside lane-2 worktree boundary; cl-integration-2 hosts the :5193 stack).
  3. The main checkout's root node_modules carries a foreign npm-style nested duplicate
     node_modules/@tiptap/pm/node_modules/prosemirror-view@1.42.6 (pnpm store holds 1.41.8 only;
     lockfile pins 1.41.8). Worktrees whose node_modules resolve through it (via the
     /mnt/vast/home/brad/git/wt -> computable-lab/node_modules symlink) pick up a duplicate
     prosemirror-view and show a spurious tabNavPlugin.ts TS2322 (EditorView identity clash).
     The lane-2 worktree was given its own clean `pnpm install --frozen-lockfile --filter app`
     (node_modules is gitignored) so its tsc is clean. Do NOT touch the main checkout's
     node_modules (shared with Brad's live stack + lane stacks).

## NEXT
1. Orch self-verify: clean worktree tsc sorted-set (strict subset of baseline) + vitest 77/428 green.
2. Optionally remove the 4 debris symlinks from cl-integration-2 (see disclosure 2).
3. Browser gate (spec 8.2) on trunk — unblocked; the "glue defect" did not exist in tracked code.
4. LEG E claim gate can proceed.
