# L2-FIXTURE-RIDER — workspace.deck fixture refresh (test-only rider)

STATUS: orch-authored spec, dispatch-ready. Base/trunk: 90c34284 (cl/integration-2).
Worktree: /mnt/vast/home/brad/git/wt/L2-FIXTURE-RIDER-lane2-l2t1610
Branch:   cl/lane2-fixture-rider-l2t1610

## Why (provenance)
L2-INTENTID-REDRAFT-1 answered-channel fix 0257123d replaced the DEAD surface id
`workspace.deck` in config/drafting/shorthand-drafting.yaml with the live ids
[run-workspace, event-editor] (no client ever sent workspace.deck; the app AiSurface
union has run-workspace/event-editor). Two legacy fixture files still send the dead id,
so the shorthand fold arm silently no-ops in their own scenarios and their
zero-model-call pins fail:

- server/src/api/handlers/AIHandlers.foldStreamTerminal.test.ts:153 (`const surface = 'workspace.deck';`)
  -> FAILS at :222 `expect(model.callCount()).toBe(1)` got 2 (fold never fires: the
  re-hold turn pays a real model call).
- server/src/api/handlers/AIHandlers.shorthandCancel.test.ts:123 (`surface: 'workspace.deck',`)
  -> R4 regression pin FAILS at :320 (same class).

Verified first-hand by orch at trunk 90c34284 (vitest run: 2 failed | 7 passed).
This is the cleanup promised by AS-INTENTID-LEGB-BASEDRIFT-ACCEPT (assumptions.md:6208).

## Scope (test-only, EXACTLY these changes)
1. In the two files above, change ONLY the fixture surface value
   `workspace.deck` -> `event-editor` (the live shorthand surface for the deck/event
   chat; matches what the bridge actually posts). Do not touch anything else.
   Other occurrences of workspace.deck in OTHER test files are OUT OF SCOPE — many are
   deliberate negative pins (workstateComposeRules.test.ts asserts workspace.deck is
   NOT listed) or belong to surfaces that legitimately keep the legacy id
   (systemPrompt.ts still accepts workspace.deck for protocol-review/analysis
   grounding — analysisReferenceGrounding.test.ts stays as-is).
2. Verify (cwd=server):
   npx vitest run src/api/handlers/AIHandlers.foldStreamTerminal.test.ts \
     src/api/handlers/AIHandlers.shorthandCancel.test.ts   -> 9/9 green
   npx vitest run src/api/handlers/AIHandlers.draftEventsStreamSurface.test.ts \
     src/api/handlers/AIHandlers.attachments.test.ts \
     src/api/handlers/AIHandlers.deckStreamError.test.ts   -> unchanged green
3. One comment line in each touched file noting WHY the fixture is event-editor
   (one sentence, citing 0257123d / shorthand-drafting.yaml DATA list). No other prose edits.
4. Commit as ONE commit on the branch. No YAML, no product code, no app/ files.

## Gate expectations (for advc + orch)
- Boundary: diff touches exactly the 2 test files.
- Zero model-call semantics are now actually exercised (the pin's stated intent),
  not weakened: the fix must NOT be changing the assertion.

## End marker
Report file (unique): /home/brad/.hermes/cl/lanes/2/deliverables/L2-FIXTURE-RIDER-report.l2t1610.md
Final line of report + final stdout line of the session: `FIXTURE-RIDER DONE <full-40-sha>`
or `FIXTURE-RIDER BLOCKED <reason>`.
