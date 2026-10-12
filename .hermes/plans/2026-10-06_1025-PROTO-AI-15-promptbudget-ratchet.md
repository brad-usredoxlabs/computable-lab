# SPEC (draft, wip-l2t0940) — PROTO-AI-15: Convert promptBudget test to a ratchet

Status: PROMOTED by orchestrator 2026-10-06T10:25 EDT. Orchestrator independently re-verified the RED baseline (vitest at trunk 302db3af: 'draft prompt budget: 44934 chars (agent 24038 + material-rules 3849 + instruction 3061 + schema 13986)', assert :45 fails) and the ratchet math (floor(44934*1.05)=47180; integer guard 47180*100=4718000 <= 44934*105=4718070). Open question 1 disposition: prose guidance is correct — no mechanical UP gate (Brad's sign-off is a human gate, not a test). Open question 2 disposition: worker records claim-time SHA; orchestrator appends merge SHA in the handoff.

## Goal
Turn `server/src/ai/promptBudget.test.ts` from a permanently-red tripwire (44,934 measured vs 12,000 starter) into an honest two-way ratchet: ceiling = measured-at-trunk + 5%, bloat beyond the ceiling fails, and a ceiling that has drifted stale-high relative to a shrunk prompt ALSO fails — so the constant only ever moves DOWN, in the same commit as any shrink.

## Brad's disposition (binding, do not re-litigate)
From `~/.hermes/cl/lanes/2/decisions/LANE2-BACKLOG-followup-approval.md` Answer (2026-10-06, recorded by architect):
> F2 admitted — NOT as "raise the constant": re-baseline as a RATCHET. Set the ceiling to current prompt size +5% and make the test assert the ceiling only moves DOWN (bloat fails, shrinkage lowers the bar). Real prompt reduction stays a separate future snappiness task.

Consequences: **do not shrink any prompt** (that is the separate future task — do not absorb it); keep "the smallest amount that gets it right" as the header's stated direction; this commit is a **policy edit** — the handoff must record the chosen ceiling + rationale.

## Verified baseline (spec-composer ran these; re-verify at dispatch — trunk may have moved)
- Trunk at spec time: `cl/integration-2` @ `dcba2cb9` (docs-only tip). Worker branches off trunk HEAD at claim time.
- `cd /mnt/vast/home/brad/git/cl-integration-2/server && npx vitest run src/ai/promptBudget.test.ts` →
  `draft prompt budget: 44934 chars (agent 24038 + material-rules 3849 + instruction 3061 + schema 13986) — budget 12000` → FAIL `expected 44934 to be less than 12000` (test :21 constant, assert :45).
- Composition sources (all read by the test's own measurement path — reuse it verbatim, do not re-invent):
  - `server/prompts/event-graph-agent.md` read via `readFileSync` (24,131 bytes on disk; 24,038 UTF-8 chars)
  - `server/prompts/material-system-rules.md` read the same way (3,873 bytes; 3,849 chars)
  - `SUBMIT_SUGGESTION_INSTRUCTION` imported from `./submitSuggestionTool.js` (3,061)
  - `JSON.stringify(SUBMIT_SUGGESTION_TOOL_DEF)` from the same module (13,986)
- src/ai suite baseline (spec-composer ran `npx vitest run src/ai` at trunk): **11 failed files / 22 failed tests / 502 passed**, promptBudget.test.ts one of the 11. The other 10 failing files are the known pre-existing set (AgentOrchestrator.bypass, AgentOrchestratorForwarding, AgentOrchestrator.golden, AgentOrchestrator.goldenWithSeeds, AgentOrchestrator.tubeGate, ChatbotCompileDeckSlot, chatbotCompile.e2e, InferenceClient.config, materialFollowUp, submitSuggestionTool.tubeSchema). Expected post-change: **10 failed files / 21 failed tests**.
- tsc baseline on this worktree (carried in handoffs): server **33** error lines — pristine comparison, zero new.
- `44934 * 1.05 = 47180.700000000004` (float — see reviewer bait F1). `Math.floor` → ceiling **47180**.

## The ratchet design (exact semantics the worker must implement)
Constants (rename `CORE_BUDGET_CHARS` → `CORE_PROMPT_CEILING_CHARS` to signal ratchet, in-file only):

```ts
/**
 * RATCHET CEILING — provenance:
 * measured 2026-10-06 at trunk cl/integration-2 (re-record the claim-time commit):
 *   44,934 chars = agent 24,038 + material-rules 3,849 + instruction 3,061 + schema 13,986
 *   (measured by THIS test's own path: the two files under server/prompts/ +
 *    SUBMIT_SUGGESTION_INSTRUCTION + JSON.stringify(SUBMIT_SUGGESTION_TOOL_DEF))
 * formula: floor(measured x 1.05) = floor(47180.70) = 47180  (Brad's ratchet: current + 5%)
 * Rule: this number only moves DOWN. Bloat over the ceiling fails; when the measured
 * total shrinks, the stale-high ceiling fails too — lower it in the SAME commit.
 */
const CORE_PROMPT_CEILING_CHARS = 47_180;
```

Two-way assertion (integer arithmetic, no floats), replacing `expect(total).toBeLessThan(CORE_BUDGET_CHARS)`:

1. **Bloat guard:** `expect(total).toBeLessThanOrEqual(CORE_PROMPT_CEILING_CHARS)` — prompt may grow only into the recorded slack; over the ceiling fails.
2. **Ratchet guard:** `CORE_PROMPT_CEILING_CHARS * 100 <= total * 105` — the ceiling must stay within 5% of what is actually measured. At the trunk numbers: 4,718,000 <= 4,718,070 ✓. A 1-char prompt shrink (total 44,933) makes 44,933×105 = 4,717,965 < 4,718,000 → the stale ceiling FAILS → the constant must be lowered in the same commit. This is exactly "the ceiling only moves DOWN"; the band is `[total, floor(total × 1.05)]` pinned at the top.
   Both guards carry actionable failure messages ("prompt grew past the ceiling — reduce it or, with Brad's sign-off, re-ratchet UP deliberately in a separate decision" / "prompt shrank — lower CORE_PROMPT_CEILING_CHARS to floor(newTotal x 1.05) in this commit").
3. Extract the decision as a tiny pure in-file helper (e.g. `ratchetViolation(measured, ceiling): string | null`) so BOTH directions are unit-testable inside the committed file without touching prompt files: cases (bloat +1 over ceiling → violation), (bloat far over → violation), (stale-high ceiling after simulated shrink → violation), (measured at ceiling with band still valid → clean). The live test then calls the helper with the real measured total — one code path, not two ad-hoc expects.

## Header rewrite (required)
Keep the historical 2026-09-20 measurement story and Brad's standing ruling verbatim in spirit — "the smallest amount that gets it right" stays the DIRECTION. Add: this test is now a ratchet per Brad's 2026-10-06 F2 disposition; semantics as above (bloat fails, shrinkage lowers the bar in the same commit); the 12,000 starter is retired, real prompt reduction is a SEPARATE future snappiness task and must not be smuggled into ratchet commits. Keep the `console.log` line (still the headline measurement) extended with `ceiling 47180 (headroom X)` or equivalent.

## Files
**In scope (the ONLY file the commit may touch):**
- `server/src/ai/promptBudget.test.ts` — constant + provenance comment, ratchet logic, header, red-first unit tests of the helper.

**Explicitly OUT of scope:**
- `server/prompts/**` (measure only, never shrink/edit — even a "helpful" trim violates the disposition). Transient proof edits (below) must be `git restore`d immediately; final `git diff` must show ONLY the test file.
- `server/src/ai/submitSuggestionTool.ts` and every other source file.
- The task list, the backlog decision artifact, other tests, any YAML.

## Acceptance criteria (from the task list, verbatim)
> Test GREEN at trunk with the ratchet constant; red-first proof that +1 char of prompt content over the ceiling fails; ceiling-lowering path exercised by test; vitest run of src/ai suite shows this test passing and no new failures.

## First targeted check (run this EARLY, before polishing)
Write the two guards + ceiling 47180, then:
```
cd /mnt/vast/home/brad/git/cl-integration-2/server && npx vitest run src/ai/promptBudget.test.ts
```
Expected: 1 passed, console line `draft prompt budget: 44934 chars (…) — ceiling 47180`. If the ratchet guard is red at the trunk numbers, the constant or the formula is wrong — stop and fix before anything else. (If trunk moved and measured != 44,934, re-derive: ceiling = floor(newMeasured × 1.05), and record the claim-time measured value in the provenance comment.)

## Verification (complete, with expected output)
1. RED-FIRST, bloat direction (real source, transient):
   `printf 'x' >> server/prompts/event-graph-agent.md` → `npx vitest run src/ai/promptBudget.test.ts` → FAIL on the bloat guard (total 44,935 vs a ceiling you temporarily drop to 44,934, or per the helper's unit case — the in-file unit test with `measured = ceiling + 1` must fail first when the helper is unimplemented); then `git restore server/prompts/event-graph-agent.md` and confirm `git diff --stat server/prompts` is empty. Paste the red output in the handoff.
2. RED-FIRST, ratchet direction (simulated shrink):
   truncate exactly 1 char from a prompt file (`truncate -s -1 server/prompts/event-graph-agent.md` or equivalent) → run the test with the UNCHANGED ceiling 47180 → the stale-high guard must FAIL naming the lowering action; `git restore` immediately. Plus the committed unit case `(measured=44933, ceiling=47180) → violation` — this is the "ceiling-lowering path exercised by test" criterion, provable on every future run, no file surgery needed.
3. GREEN at trunk: `npx vitest run src/ai/promptBudget.test.ts` → `1 passed`.
4. No new src/ai failures: `npx vitest run src/ai` → expect exactly **10 failed files / 21 failed tests** (promptBudget gone, everything else identical to the 11/22 baseline above). If the set differs, investigate before reporting.
5. Typecheck: `npm run typecheck -w server` (repo root) → **33 error lines**, byte-comparable to baseline, zero in `promptBudget.test.ts`.
6. `git diff --stat` on the final commit → exactly `server/src/ai/promptBudget.test.ts | +nn/-nn`. ANY prompt-file delta = fail your own gate.

## Worker contract
- Worktree branch `wt/PROTO-AI-15-lane2-l2t<HHMM>` off current `cl/integration-2` HEAD (lane-2 worktree `/mnt/vast/home/brad/git/cl-integration-2`; NEVER Brad's live tree `/mnt/vast/home/brad/git/computable-lab`).
- Deliverable report (unique path): `.hermes/plans/PROTO-AI-15-report.wip-l2t<HHMM>.md` — MUST contain: the chosen ceiling + full provenance (measured value, composition, formula, claim-time trunk SHA), the two red-first proofs as verbatim command output, the green run, the src/ai before/after counts, and an explicit statement that this is a policy edit and no prompt was shrunk.
- One commit: test file only. No stack restart needed (no YAML — the tsx --watch YAML pitfall is N/A here).

## Reviewer bait (pre-empt these — the adversarial review will look exactly here)
- **F1 float trap:** `44934*1.05 = 47180.700000000004`. A `Math.ceil` ceiling (47181) makes the test RED at the very trunk numbers it was measured from (47181 > 44934×1.05). Use `Math.floor`, and keep the comparison in integers (`c*100 <= m*105`) so no future measured value can dance on float precision.
- **F2 tautology cheat:** computing the ceiling at runtime from the measured total (`const ceiling = floor(total*1.05)`) makes the test unable to EVER go red — the ratchet is worth nothing unless the ceiling is a hardcoded DATA constant with provenance. Reject any diff without a literal constant.
- **F3 zero-slack cheat:** ceiling = measured exactly (no +5%) contradicts the disposition; ceiling = measured with headroom computed one-way only misses the shrinkage half. BOTH guards must exist and both must be unit-tested.
- **F4 off-by-one:** at ceiling == measured the first guard must PASS (`toBeLessThanOrEqual`, not `toBeLessThan` — but the shipped ceiling is 47180 with measured 44934, so the shipped state has slack; still test the equality edge in the helper).
- **F5 scope creep / disposition breach:** any diff hunk under `server/prompts/` or `submitSuggestionTool.ts` — even a "free" char shave — is the separate future task leaking in. The git-diff-is-one-file gate is the defence; transient proof edits must be restored.
- **F6 symlink landmine:** `server/src/ai/createRecordIntent.test.ts` is a gitignored SYMLINK into Brad's live tree (recorded in the AI-7 note). It is in the src/ai run set; do NOT touch or "fix" anything it resolves to. Pre-existing failures in the 10-file baseline are baseline — do not "helpfully" repair them in this commit.
- **F7 header vandalism:** the historical 67k-vs-10-tokens story and the "smallest that gets it right" ruling are load-bearing prose; a rewrite that deletes them to shorten the file will be rejected.
- **F8 exactOptionalPropertyTypes:** no optional properties in this change — if the worker's helper returns `string | undefined` where `null` is the contract, that's fine at the type level but pick one consistently; no `undefined`-valued properties anywhere.

## Open questions (could not resolve locally)
1. Ratchet-DOWN discipline when a re-baseline legitimately needs an UP move (Brad raising the bar deliberately): the header message says "with Brad's sign-off, re-ratchet UP in a separate decision" — is that the intended workflow or should the test itself be blind to it? Checked: disposition text says nothing about future raises; left as prose guidance, not a mechanical gate.
2. Whether the provenance comment should pin the claim-time trunk SHA (worker has it; drift risk if orchestrator rebases). Spec instructs the worker to record it; orchestrator may prefer the merge SHA appended post-merge — cosmetic.

Report: DONE — spec drafted at `/mnt/vast/home/brad/git/cl-integration-2/.hermes/plans/PROTO-AI-15-spec-draft.wip-l2t0940.md`; baseline RED, ceiling math (47180 = floor(44934×1.05)), and the 11/22 src/ai baseline all verified with real runs; no scout needed (every orientation question was bounded and answered first-hand from the real files).
