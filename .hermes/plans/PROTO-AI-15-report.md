# PROTO-AI-15 report (wip-l2t1121) — promptBudget.test.ts converted to a ratchet

Worker: cl-coder, lane 2, worktree `/mnt/vast/home/brad/git/wt/PROTO-AI-15-lane2-l2t1121`
Branch: `wt/PROTO-AI-15-lane2-l2t1121` off `cl/integration-2` @ claim-time SHA **cbacebab294d7bfea2b6eeed0296cb9c652ceb66**
Commit: **6e51197ff30ef0aab42071983b65aae0af1c654c** — `test(ai): ratchet promptBudget ceiling (PROTO-AI-15)`
Spec: `.hermes/plans/2026-10-06_1025-PROTO-AI-15-promptbudget-ratchet.md`

## Disposition statement (explicit)

**This is a policy edit. No prompt was shrunk.** No hunk under `server/prompts/` or any
source file exists in the commit; the transient prompt-file edits used for the red-first
proofs were `git restore`d immediately (verified: `git diff --stat server/prompts` empty,
`event-graph-agent.md` back to 24,131 bytes). "The smallest amount that gets it right"
remains the header's stated direction; real prompt reduction stays the separate future
snappiness task.

## Chosen ceiling + provenance

Measured at MY checkout (claim-time trunk cbacebab), by the test's own measurement path:

    draft prompt budget: 44934 chars (agent 24038 + material-rules 3849 + instruction 3061 + schema 13986)

Composition (identical to spec-time baseline — measured value did NOT drift):
- `server/prompts/event-graph-agent.md` readFileSync: 24,131 bytes on disk / 24,038 UTF-8 chars
- `server/prompts/material-system-rules.md`: 3,873 bytes / 3,849 chars
- `SUBMIT_SUGGESTION_INSTRUCTION` (imported): 3,061
- `JSON.stringify(SUBMIT_SUGGESTION_TOOL_DEF)`: 13,986

Formula: `floor(44934 x 1.05) = floor(47180.700000000004) = 47180` (Math.floor per F1;
float product noted, comparison shipped in integers).
**Ceiling: `CORE_PROMPT_CEILING_CHARS = 47_180`** — hardcoded DATA constant with the
provenance comment recording measured value, composition, formula, and claim-time SHA
cbacebab (open question 2: worker records claim-time SHA; orchestrator may append merge
SHA post-merge).

## Design implemented

- Constant renamed `CORE_BUDGET_CHARS` (12,000, retired) -> `CORE_PROMPT_CEILING_CHARS` (47,180).
- Pure in-file helper `ratchetViolation(measured, ceiling): string | null` — one code path:
  - Guard 1 (bloat): `measured > ceiling` -> "prompt grew past the ceiling ... reduce it or, with Brad's sign-off, re-ratchet UP deliberately in a separate decision"
  - Guard 2 (ratchet, integer): `ceiling * 100 <= measured * 105` required; else "prompt shrank ... lower CORE_PROMPT_CEILING_CHARS to floor(newTotal x 1.05) in this commit"
  - Trunk numbers: 47180 x 100 = 4,718,000 <= 44934 x 105 = 4,717... 4,718,070 ✓
- Live test calls the helper with the real measured total: `expect(violation, violation ?? 'ratchet clean').toBeNull()`.
- Helper unit tests (committed, no file surgery needed on future runs): bloat +1 (47181/47180) -> violation; bloat far over (60000/47180) -> violation; stale-high after 1-char shrink (44933/47180) -> violation (the "ceiling-lowering path exercised by test" criterion); equality edge (47180/47180) -> clean (F4: `>` not `>=` on guard 1); trunk state (44934/47180) -> clean.
- Header: historical 2026-09-20 67k-vs-10-tokens story and Brad's "smallest amount that gets it right" ruling preserved verbatim; ratchet semantics + 12,000 retirement + separate-task warning appended. `console.log` extended: `— ceiling 47180 (headroom 2246)`.

## Environment note (before-count reconciliation)

Fresh worktree initially measured src/ai at 23 failed files / 7 failed tests because the
worktree lacked trunk's gitignored infrastructure: (a) root `node_modules` symlink
(`yaml` is hoisted at trunk root; missing it caused 25 collection errors) and (b) ~50
gitignored symlinks into Brad's live tree (e.g. `server/src/ai/materialRefFields.ts`,
`createRecordIntent.test.ts`). I replicated both read-only (symlinks only; nothing under
the symlink targets was touched; all remain untracked/gitignored). After replication the
before-baseline matches the spec exactly: **11 failed files / 22 failed tests / 502
passed**, same 11 named files. This is the baseline used below.

## RED-first proof 1 — helper unit tests fail against the stub (verbatim)

Helper shipped as `return null;` stub; the three violation-direction unit tests went red:

    $ npx vitest run src/ai/promptBudget.test.ts
     ❯ src/ai/promptBudget.test.ts  (6 tests | 3 failed) 47ms
       ❯ src/ai/promptBudget.test.ts > the ratchet guards (pure helper — both directions) > bloat +1 over the ceiling is a violation
         → expected null not to be null
       ❯ src/ai/promptBudget.test.ts > the ratchet guards (pure helper — both directions) > bloat far over the ceiling is a violation
         → .toMatch() expects to receive a string, but got object
       ❯ src/ai/promptBudget.test.ts > the ratchet guards (pure helper — both directions) > stale-high ceiling after a 1-char shrink is a violation (ceiling-lowering path)
         → expected null not to be null
     ⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯
     FAIL  src/ai/promptBudget.test.ts > the ratchet guards (pure helper — both directions) > bloat +1 over the ceiling is a violation
     AssertionError: expected null not to be null
      ❯ src/ai/promptBudget.test.ts:57:19
     FAIL  src/ai/promptBudget.test.ts > the ratchet guards (pure helper — both directions) > bloat far over the ceiling is a violation
     TypeError: .toMatch() expects to receive a string, but got object
      ❯ src/ai/promptBudget.test.ts:62:46
     FAIL  src/ai/promptBudget.test.ts > the ratchet guards (pure helper — both directions) > stale-high ceiling after a 1-char shrink is a violation (ceiling-lowering path)
     AssertionError: expected null not to be null
      ❯ src/ai/promptBudget.test.ts:68:19
     Test Files  1 failed (1)
          Tests  3 failed | 3 passed (6)

## RED-first proof 2 — bloat direction on real source (verbatim)

Transient: ceiling temporarily pinned to 44,934 (zero slack) + `printf 'x' >>
server/prompts/event-graph-agent.md`; then `git restore` (prompts diff confirmed empty):

    draft prompt budget: 44935 chars (agent 24039 + material-rules 3849 + instruction 3061 + schema 13986) — ceiling 44934 (headroom -1)
     ❯ src/ai/promptBudget.test.ts  (6 tests | 1 failed) 15ms
       ❯ src/ai/promptBudget.test.ts > the draft prompt stays small enough for a small model > core instruction + templates + tool schema fit the ratchet ceiling
         → prompt grew past the ceiling (44935 > 44934) — reduce it or, with Brad's sign-off, re-ratchet UP deliberately in a separate decision: expected 'prompt grew past the ceiling (44935 >…' to be null
     ⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
     FAIL  src/ai/promptBudget.test.ts > the draft prompt stays small enough for a small model > core instruction + templates + tool schema fit the ratchet ceiling
     AssertionError: prompt grew past the ceiling (44935 > 44934) — reduce it or, with Brad's sign-off, re-ratchet UP deliberately in a separate decision: expected 'prompt grew past the ceiling (44935 >…' to be null
      ❯ src/ai/promptBudget.test.ts:118:53
     Test Files  1 failed (1)
          Tests  1 failed | 5 passed (6)

## RED-first proof 3 — ratchet direction, simulated 1-char shrink, UNCHANGED ceiling 47180 (verbatim)

Transient: `truncate -s -1 server/prompts/event-graph-agent.md`; then `git restore`
(file back to 24,131 bytes, prompts diff empty):

    draft prompt budget: 44933 chars (agent 24037 + material-rules 3849 + instruction 3061 + schema 13986) — ceiling 47180 (headroom 2247)
     ❯ src/ai/promptBudget.test.ts  (6 tests | 1 failed)
       ❯ ... > core instruction + templates + tool schema fit the ratchet ceiling
         → prompt shrank (44933) — the ceiling 47180 is stale-high; lower CORE_PROMPT_CEILING_CHARS to floor(44933 x 1.05) in this commit: expected 'prompt shrank (44933) — the ceiling 4…' to be null
     ⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
     FAIL  src/ai/promptBudget.test.ts > the draft prompt stays small enough for a small model > core instruction + templates + tool schema fit the ratchet ceiling
     AssertionError: prompt shrank (44933) — the ceiling 47180 is stale-high; lower CORE_PROMPT_CEILING_CHARS to floor(44933 x 1.05) in this commit: expected 'prompt shrank (44933) — the ceiling 4…' to be null
      ❯ src/ai/promptBudget.test.ts:118:53
     Test Files  1 failed (1)
          Tests  1 failed | 5 passed (6)

(44933 x 105 = 4,717,965 < 47180 x 100 = 4,718,000 — the stale-high guard fires exactly
as the spec's math predicts.)

## GREEN at trunk (verbatim)

    $ npx vitest run src/ai/promptBudget.test.ts
    draft prompt budget: 44934 chars (agent 24038 + material-rules 3849 + instruction 3061 + schema 13986) — ceiling 47180 (headroom 2246)
     Test Files  1 passed (1)
          Tests  6 passed (6)

## src/ai suite before/after (identical environment, symlinks replicated)

Before (trunk cbacebab, unmodified test): **11 failed files / 22 failed tests / 502 passed (524)**
After (committed ratchet): **10 failed files / 21 failed tests / 508 passed (529)**
promptBudget.test.ts gone from the failing set; remaining 10 failing files identical:
AgentOrchestrator.bypass, AgentOrchestratorForwarding, AgentOrchestrator.golden,
AgentOrchestrator.goldenWithSeeds, AgentOrchestrator.tubeGate, ChatbotCompileDeckSlot,
chatbotCompile.e2e, InferenceClient.config, materialFollowUp, submitSuggestionTool.tubeSchema.
No pre-existing failure was "helpfully" repaired (F6).

## Typecheck

`npm run typecheck -w server` (repo root of worktree): **33 error lines** before and
after; `diff` of the error lines is empty (byte-comparable to baseline); **zero** lines
mention `promptBudget.test.ts`.

## Commit gate

    $ git -c core.fileMode=false diff --stat HEAD~1 HEAD
     server/src/ai/promptBudget.test.ts | 83 +++++++++++++++++++++++++++++++++++---
     1 file changed, 78 insertions(+), 5 deletions(-)

Exactly one file. `git status` shows only untracked node_modules symlinks (gitignored).
No hunk under `server/prompts/` or `submitSuggestionTool.ts` (F5 clean).

## Reviewer-bait self-audit

- F1: `Math.floor` semantics, integer guard `c*100 <= m*105`; test GREEN at the very trunk numbers it was measured from.
- F2: ceiling is a literal DATA constant (47_180) with provenance; never computed at runtime.
- F3: +5% headroom present (2,246 chars); BOTH guards implemented AND unit-tested.
- F4: equality edge unit-tested clean (`measured > ceiling` strict; `47180/47180 -> null`).
- F5: one-file diff gate verified; transient prompt edits restored and verified.
- F6: `createRecordIntent.test.ts` symlink and everything it resolves to untouched.
- F7: historical 67k story + "smallest amount that gets it right" preserved; only appended to.
- F8: helper returns `string | null` consistently; no optional/undefined-valued properties anywhere.

## Open items for orchestrator

- Merge SHA may be appended to the provenance comment post-merge (cosmetic, per spec open question 2).
- Baseline drift note: fresh worktrees need the root node_modules symlink + gitignored symlink replication to reproduce the 11/22 baseline; worth adding to worktree bootstrap.

DONE — commit 6e51197ff30ef0aab42071983b65aae0af1c654c
