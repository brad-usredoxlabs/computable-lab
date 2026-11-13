# L2-L2-VACUOUS-PINS-DEBT — unit menupin2 (1 of 1)

Worktree: /home/brad/cl-wt/L2-L2-VACUOUS-PINS-DEBT-menupin2-lane2
Branch: cl/lane2-vacpins-menupin2-0001
Base: 46029f8b096feb6ebde2026f99e9473b627fd67a (verified via `git rev-parse HEAD` at start)
Code commit (the fix): 8477b3cba57f8ce8c98acf4a7a49e39c6f7f300f

## Outcome

DONE. The stale receiving-side mirror of the forced intent-menu enum now pins the 13-id list
including `answer` LAST, byte-identical in shape to `server/src/ai/submitSuggestionTool.test.ts:308`.
Trunk's only red test (pin-debt from SEQ-ANSWER-CONTRACT-1, not a product defect) is GREEN.

## The change (entire diff, 1 file, +2/-1)

```
diff --git a/server/src/receiving/ReceiveElicitation.test.ts b/server/src/receiving/ReceiveElicitation.test.ts
@@ -525,7 +525,8 @@
     const props = (AGENT_INTENT_TOOL_DEF.function.parameters as { properties: Record<string, { enum?: string[] }> }).properties;
     // MATRES-CHAIN (OQ-3(a) RATIFIED, DELIBERATE golden diff): compose_execute_chain
     // joins the menu tail — the one-tool lock is about the tool, not a frozen enum.
-    expect(props.intent?.enum).toEqual(['event_graph', 'deck_layout', 'create_record', 'protocol_edit', 'workspace_action', 'compose_workstate', 'compose_analysis', 'query_workstate_history', 'event_shorthand', 'compose_record_draft', 'compose_receiving', 'compose_execute_chain']);
+    // SEQ-ANSWER-CONTRACT-1: `answer` joined the menu as the last element (deliberate golden diff).
+    expect(props.intent?.enum).toEqual(['event_graph', 'deck_layout', 'create_record', 'protocol_edit', 'workspace_action', 'compose_workstate', 'compose_analysis', 'query_workstate_history', 'event_shorthand', 'compose_record_draft', 'compose_receiving', 'compose_execute_chain', 'answer']);
```

Nothing else changed: no product file, no other test file, no reformat. `git -c core.fileMode=false diff --stat 46029f8b096feb6ebde2026f99e9473b627fd67a..8477b3cb` →
`server/src/receiving/ReceiveElicitation.test.ts | 3 ++-  (1 file changed, 2 insertions(+), 1 deletion(-))`

## Environment repair (disclosed, NOT part of the commit)

The assigned worktree shipped with NO node_modules (brief's step 2 `cd server && npx vitest run`
failed with `sh: line 1: vitest: command not found`) and without the gitignored
`server/schema/` data tree that `submitSuggestionTool.ts` loads at runtime (first real run died with
"scientist-intent vocabulary vocabulary file not found: .../server/schema/scientist-intent/scientist-intent-vocabulary.yaml").
This is an environment gap, not a product defect; the composer's measured baseline implies both were present in their environment.
Repaired by the lane's established pattern (sibling lane-2 worktrees do exactly this):
1. `ln -s /mnt/vast/home/brad/git/cl-integration-2/server/node_modules server/node_modules`
   — the shared fleet node_modules that `L2-L2-VACUOUS-PINS-DEBT-menupin-lane2` and
   `L2-JOURNEY-POLICY-1-psschema-lane2` already link; vitest 1.6.1, `server/package.json` IDENTICAL to base (diff: PKG-IDENTICAL).
2. `cp -r /mnt/vast/home/brad/git/cl-integration-2/server/schema server/` — `server/schema` is
   gitignored (`.gitignore:52`), and the copy is byte-identical to the sibling menupin worktree's copy
   (`diff -q` SAME on all three scientist-intent files; full tree `diff -rq` clean).
Both are untracked-and-ignored: `git -c core.fileMode=false status --short` is empty after them; they are NOT in the commit.
No dependencies were installed (no pnpm/npm install, no scaffold). This repair is what pushed tool calls before
the first commit above the brief's ≤8 budget (the brief's step 2 was impossible as written on this worktree);
no anti-thrash rule was violated: no file read twice, no file read that was not edited, no repo-wide enum grep,
no re-derivation, no brief re-read.

## Mutation probe (both raw summaries)

RED (untouched worktree, base 46029f8b):
```
 FAIL  src/receiving/ReceiveElicitation.test.ts > parse/menu regression (§5.4 mirror of submitSuggestionTool.test) > the menu carries compose_receiving and ALL existing intents stay pinned in order
AssertionError: expected [ 'event_graph', 'deck_layout', …(11) ] to deeply equal [ 'event_graph', 'deck_layout', …(10) ]

- Expected
+ Received
    "compose_execute_chain",
+   "answer",

 ❯ src/receiving/ReceiveElicitation.test.ts:528:32

 Test Files  1 failed (1)
      Tests  1 failed | 21 passed (22)
```
Matches the composer's measured baseline exactly.

GREEN (at delivered code sha 8477b3cb — see runs below). No scratch mutation needed; the RED is the reverse of the fix.

## VERIFY BEFORE EXIT (raw outputs, at code sha 8477b3cb)

Targeted run 1 — the repaired suite:
`cd server && npx vitest run src/receiving/ReceiveElicitation.test.ts`
```
Test Files  1 passed (1)
     Tests  22 passed (22)
  Duration  4.77s (transform 639ms, setup 0ms, collect 1.82s, tests 1.86s, environment 0ms, prepare 494ms)
```

Targeted run 2 — authoritative pin, untouched:
`cd server && npx vitest run src/ai/submitSuggestionTool.test.ts`
```
Test Files  1 passed (1)
     Tests  22 passed (22)
  Duration  985ms (transform 203ms, setup 0ms, collect 403ms, tests 14ms, environment 0ms, prepare 94ms)
```
AC2 satisfied: 22 passed, file untouched (not in the diff).

Targeted run 3 — chat-side menu pin, untouched:
`cd server && npx vitest run src/ai/AgentOrchestrator.shorthandChat.test.ts`
```
Test Files  1 passed (1)
     Tests  21 passed (21)
  Duration  6.45s (transform 2.22s, setup 0ms, collect 3.93s, tests 1.66s, environment 0ms, prepare 127ms)
```

Typecheck: NOT run — not required by the brief (test-only unit, no signature change).

Clean tree at exit (after code commit):
`git -c core.fileMode=false status --short` → (empty output), exit 0.
No product path, no scratch file in the tree. No scratch dir was created
(/home/brad/.vacpins-menupin2-scratch never used, nothing to delete).

## SHA DISCIPLINE (raw outputs, run in the worktree at code sha)

```
$ git rev-parse HEAD
8477b3cba57f8ce8c98acf4a7a49e39c6f7f300f

$ git cat-file -e 8477b3cba57f8ce8c98acf4a7a49e39c6f7f300f
(exit: 0)
```

Marker cites the code commit 8477b3cba57f8ce8c98acf4a7a49e39c6f7f300f — the commit that flips trunk's
one red test to green and that `git cat-file -e` resolves (exit 0 above). Per lane precedent (e.g.
wt-CANONLABEL-u1stageafallback commit 1b1bc59c "report + exit marker" citing the code commit), the
report file itself lands in a subsequent commit, so no self-referential sha is possible.

## Reviewer-bait answers (all N/A or verified clean)

- VACUOUS PIN: assertion is still `toEqual` on the exact ordered 13-id list; `answer` is LAST; no
  `toContain`/sort/`.length`.
- OVER-EDIT: exactly one stale mirror existed (composer-measured; verified by the single-file diff);
  no second edit; `submitSuggestionTool.ts:453` and `submitSuggestionTool.test.ts:308` untouched
  (not in `git diff`; run 2 stays 22/22).
- WRONG DIRECTION: none — the product enum was already correct; only the mirror test was updated.
- exactOptionalPropertyTypes / cast at :526: untouched.
- No YAML in scope; no lane-stack restart; no schema/config/app/records edits (the `server/schema`
  copy is gitignored runtime data restoration, byte-identical, not in the commit).
- Hardcode boundary: the only literal added is `'answer'` inside the test's expected array
  (plus one explanatory comment line); no item id / sha / surface name in product code.

## Decisions & next actions

- Decisions: (1) repair env via shared fleet node_modules symlink + gitignored schema copy (lane
  pattern; documented above). (2) Marker cites the code commit (lane precedent).
- Next actions (owner: orchestrator/reviewer): accept unit; no residual work in this worktree.
  The gitignored `server/schema` and `server/node_modules` symlink remain in place (untracked,
  ignored) so any future test run here works out of the box.

## Marker

L2-L2-VACUOUS-PINS-DEBT UNIT menupin2 DONE 8477b3cba57f8ce8c98acf4a7a49e39c6f7f300f
