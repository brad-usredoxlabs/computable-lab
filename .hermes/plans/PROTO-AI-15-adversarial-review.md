# ADVERSARIAL REVIEW — PROTO-AI-15 (lane 2)

Item: convert `server/src/ai/promptBudget.test.ts` into a two-way ratchet
(ceiling = measured-at-claim +5%, moves DOWN only). Policy edit; no prompt shrink.
Reviewer: cl-adversarial-reviewer (deepseek/deepseek-v4.1-flash). Static review; nothing changed.

Artifacts under review
- Worktree: /mnt/vast/home/brad/git/wt/PROTO-AI-15-lane2-l2t1121
- Branch: wt/PROTO-AI-15-lane2-l2t1121, HEAD = 6e51197ff30ef0aab42071983b65aae0af1c654c
- Base: cbacebab294d7bfea2b6eeed0296cb9c652ceb66 (trunk cl/integration-2), confirmed ancestor of HEAD
- Spec: /mnt/vast/home/brad/git/cl-integration-2/.hermes/plans/2026-10-06_1025-PROTO-AI-15-promptbudget-ratchet.md
- Coder report: /mnt/vast/home/brad/git/cl-integration-2/.hermes/plans/PROTO-AI-15-report.wip-l2t1121.md

## 1. Full diff read

`git -C <worktree> -c core.fileMode=false diff cbacebab...HEAD --stat`
    server/src/ai/promptBudget.test.ts | 83 +++++++++++++++++++++++++++++++++++---
    1 file changed, 78 insertions(+), 5 deletions(-)

Exactly one file. Full diff read line by line. The 5 deletions are all the expected
retirements (no accidental content loss):
    - * 12,000 chars is a STARTER. Method for finding the real number: lower it in
    -const CORE_BUDGET_CHARS = 12_000;
    -  it('core instruction + templates + tool schema fit the budget', () => {
    -        `instruction ... — budget ${CORE_BUDGET_CHARS}`,
    -    expect(total).toBeLessThan(CORE_BUDGET_CHARS);

## 2. Acceptance criteria (spec lines 63-64, verbatim)

> Test GREEN at trunk with the ratchet constant; red-first proof that +1 char of prompt
> content over the ceiling fails; ceiling-lowering path exercised by test; vitest run of
> src/ai suite shows this test passing and no new failures.

## 3. Checks I ran (real output)

### 3a. Targeted test — `cd .../server && npx vitest run src/ai/promptBudget.test.ts`
    RUN  v1.6.1 /mnt/vast/home/brad/git/wt/PROTO-AI-15-lane2-l2t1121/server
    ✓ src/ai/promptBudget.test.ts  (6 tests) 15ms
    stdout | ... > core instruction + templates + tool schema fit the ratchet ceiling
    draft prompt budget: 44934 chars (agent 24038 + material-rules 3849 + instruction 3061 + schema 13986) — ceiling 47180 (headroom 2246)
    Test Files  1 passed (1)
         Tests  6 passed (6)
→ GREEN, 6 tests. Console line matches the provenance comment composition byte-for-byte.

### 3b. src/ai suite — `npx vitest run src/ai`
    Test Files  10 failed | 59 passed (69)
         Tests  21 failed | 508 passed (529)
→ Exactly the spec's expected post-change count (10/21). Failed-file set extracted:
AgentOrchestrator.bypass, AgentOrchestratorForwarding, AgentOrchestrator.golden,
AgentOrchestrator.goldenWithSeeds, AgentOrchestrator.tubeGate, ChatbotCompileDeckSlot,
chatbotCompile.e2e, InferenceClient.config, materialFollowUp, submitSuggestionTool.tubeSchema.
promptBudget.test.ts is NOT in the failure set. Set identical to the spec's named 10. No new failures.

### 3c. Typecheck — `npm run typecheck -w server` (worktree root)
    src/ai/AgentOrchestrator.ts(276,11): error TS2322 ...
    ... (33 error lines total) ...
    npm error code 2
→ Counted 33 error TS lines, byte-comparable to the spec's 33-line baseline. ZERO lines
mention promptBudget.test.ts.

### 3d. Scope gate
    git diff --name-only cbacebab...HEAD   → server/src/ai/promptBudget.test.ts   (only)
    git diff cbacebab...HEAD -- server/prompts server/src/ai/submitSuggestionTool.ts  → (empty)
    git diff --name-only HEAD~1 HEAD       → server/src/ai/promptBudget.test.ts   (only)
→ server/prompts/** and submitSuggestionTool.ts are byte-unchanged vs base. Transient
prompt edits (red-first proofs) were restored.

### 3e. Live-tree integrity (environment claim)
    find /mnt/vast/home/brad/git/computable-lab -maxdepth 8 \( -name node_modules -o -name .git \) -prune \
         -o -type f -newermt "2026-10-06 11:25:00" -print   → (empty)
    live createRecordIntent.test.ts mtime = 2026-10-04 18:30 (unchanged)
    live-tree status grepped for lane2/PROTO-AI-15/wt/ → (empty)
→ No file in Brad's live tree was written during the coder's session window. Claim holds.

## 4. Reviewer-bait attack (each attacked, not merely quoted)

F1 float trap — ATTAKED, CLEAN. Ceiling is the hardcoded literal 47_180 (= floor(44934*1.05),
Math.floor per spec, not ceil). Both guards use integer arithmetic: bloat `measured > ceiling`;
ratchet `ceiling * 100 <= measured * 105`. No float comparison anywhere. At trunk numbers
4718000 <= 4718070 ✓. A Math.ceil ceiling (47181) would have made guard2 fire (4718100 > 4718070),
so the floor choice is load-bearing and correct.

F2 tautology cheat — ATTACKED, CLEAN. `CORE_PROMPT_CEILING_CHARS = 47_180` is a literal DATA
constant with a provenance block (measured value, composition, formula, claim-time SHA cbacebab).
It is never computed at runtime from `total`.

F3 both guards exist AND unit-tested — ATTACKED, CLEAN. Guard 1 (bloat) at line 49; Guard 2
(ratchet) at line 57. Five committed helper tests cover both directions: (47181,47180)→violation,
(60000,47180)→violation, (44933,47180)→violation (ceiling-lowering path), (47180,47180)→null,
(44934,47180)→null.

F4 equality edge — ATTACKED, CLEAN. Guard 1 uses strict `>` (not `>=`); unit test
`ratchetViolation(47_180, 47_180)` asserts `.toBeNull()`. At equality the band is degenerate but legal.

F5 scope — ATTACKED, CLEAN. One-file diff; prompts and submitSuggestionTool byte-unchanged (3d).

F6 symlink landmine — ATTACKED, CLEAN. `server/src/ai/createRecordIntent.test.ts` is still a
symlink into the live tree (lrwxrwxrwx), untracked (not in HEAD), and its target's mtime is
Oct 4 — untouched.

F7 header vandalism — ATTACKED, CLEAN. The 2026-09-20 ~67k-vs-~10-token story (lines 4-8) and
Brad's "the smallest amount that gets it right" ruling (line 10) are preserved. Only the
retired "12,000 chars is a STARTER" clause was replaced (per the spec's explicit retirement
instruction); nothing was deleted to shorten the file.

F8 null/undefined consistency — ATTACKED, CLEAN. Helper signature is `string | null`, always
returns one or the other; no optional properties and no `undefined`-valued fields in the change.

(i) helper directions genuinely fail on stated inputs — ATTACKED, CLEAN. Read the code path:
(47181,47180) hits guard 1 and returns the "grew past the ceiling" string; (44933,47180) passes
guard 1 (44933<47180) then fails guard 2 (4718000 > 4717965) and returns the "prompt shrank" string.
Both are real violations, not tautologies. The red-first stub proof in the report is consistent with
this (3 tests red against `return null`).

(ii) provenance comment records claim-time SHA + measured value — CLEAN. Line 31 records
"claim-time trunk cl/integration-2 @ cbacebab" and 44,934 with full composition.

(iii) live test uses the helper (one code path) — CLEAN. Line 117
`const violation = ratchetViolation(total, CORE_PROMPT_CEILING_CHARS);` then line 118 asserts null.
No parallel ad-hoc expects.

(iv) environment claim — see 3e. Verified: no tracked file changed (one-file diff), no live-tree
write. Symlinks only, read-only. The ~43 symlinks under server/src are untracked/ignored pointers
into the live tree; the 3 node_modules symlinks point into the lane-2 parent worktree
(cl-integration-2), not Brad's live tree.

## 5. Non-blocking observation (NOT counted as a defect)

The coder report (line 147) says the worktree `git status` shows "only untracked node_modules
symlinks (gitignored)." The symlinks ARE untracked, but they are NOT gitignored:

    $ git check-ignore -v node_modules server/node_modules app/node_modules
    rc=1                       # no match
    $ git status --porcelain
    ?? app/node_modules
    ?? node_modules
    ?? server/node_modules

`.gitignore:5` is `node_modules/` — the trailing slash matches directories only, and these are
symlinks, so the pattern does not apply. This is a wording inaccuracy in the handoff, not a defect
in the deliverable: the committed artifact is one file (HEAD~1..HEAD), and correcting it would
require editing .gitignore — itself out of the approved one-file scope. I am flagging it so the
orchestrator is not surprised if a future `git add -A` in this worktree would stage the symlinks.

## 6. Criterion-by-criterion disposition

- Test GREEN at trunk with ratchet constant ......... PASS (3a, 6 passed)
- Red-first +1 char over ceiling fails .............. PASS (helper test (47181,47180); report proof 2)
- Ceiling-lowering path exercised by test ........... PASS (helper test (44933,47180))
- src/ai suite passing, no new failures ............. PASS (3b, 10/21 = expected)
- One-file diff / no prompt or source shrink ........ PASS (3d)
- typecheck 33 lines, zero new ..................... PASS (3c)
- Provenance SHA + measured value ................... PASS (ii)
- Live test uses helper ............................. PASS (iii)
- F1..F8 ............................................ PASS (section 4)
- Environment claim (live tree untouched) ........... PASS (3e)
- Report "gitignored" wording ....................... minor inaccuracy, non-blocking (section 5)

VERDICT: accept
