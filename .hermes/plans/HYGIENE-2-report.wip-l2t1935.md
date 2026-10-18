# HYGIENE-2 coder report — lane 2, worktree wt/HYGIENE-2-lane2-l2t1935

Branch `cl/HYGIENE-2-lane2-l2t1935`, base `b6eddd7d` of `cl/integration-2`.
Spec: `.hermes/plans/2026-10-17_HYGIENE-2-surface-neutral-instruction-spec.md` (read in full,
including the PROMOTION NOTE; OQ adjudications followed).
Item: rename the two residual `event_graph` vocabulary mentions in
`server/src/ai/submitSuggestionTool.ts` (:60 instruction bullet, :321 records description)
onto surface-neutral wording. Prompt TEXT only; zero new TS policy branches.

## §0 Baselines recorded AT MY BASE (b6eddd7d, before any edit)

- **tsc baseline (CODER-CAPTURED):** `npm run typecheck -w server` (= `tsc --noEmit`) ->
  **0 errors, exit 0**. Matches the composer's measured baseline (OQ-3 ruling: delta-0
  against my own worktree base). Raw: empty output, exit 0.
- **Baseline family run (8 files, pre-edit):**
  `npx vitest run src/ai/promptBudget.test.ts src/ai/submitSuggestionTool.test.ts src/ai/submitSuggestionTool.equipment.test.ts src/ai/shorthandContractDisclosure.test.ts src/ai/workstateComposeRules.test.ts src/ai/AgentOrchestrator.forcedDraftSurface.test.ts src/ai/equipmentVocabulary.test.ts src/ai/equipmentAdditions.test.ts`
  -> `Test Files  8 passed (8)` / `Tests  69 passed (69)` — matches the spec's composer baseline.
- **Base ratchet line (from the detach-base full-suite run, §4):**
  `draft prompt budget: 47090 chars (agent 24543 + material-rules 5500 + instruction 3061 + schema 13986) — ceiling 47180 (headroom 90)`

## §1 Worktree-environment repair (AS-1, prerequisite, zero diff footprint)

The fresh worktree checkout initially failed tsc with **25 errors** — all `TS2307: Cannot find
module './materialBinding.js' / './clarificationLoop.js' / './mintLabelFidelity.js' /
'./recoverInventedMaterialFields.js' / './enrichMaterialDomains.js' / './materialRefFields.js' /
'./materialIdentity.js'` (+ cascading TS7006/TS18048/TS2379 in AgentOrchestrator.ts). Root cause:
lane-2 `core.excludesFile = /home/brad/.hermes/cl/lanes/2/lane-exclude-a6fix-l2t0430` git-IGNORES
67 trunk-working-tree source files (symlinks into `/mnt/vast/home/brad/git/computable-lab/` in the
trunk checkout) that TRACKED code imports; a fresh `worktree add` therefore lacks them. Same
condition the SH-PROMPT-HYGIENE-1 coder recorded (its AS-5). Repair: byte-copied all 67 existing
lane-excluded source files from `cl-integration-2` via `cp -L` (dereferenced symlinks). They stay
git-ignored: `git status` shows only my owned files and they appear in NO diff
(`git check-ignore` confirms). After restore: tsc 0 errors at base.

## §2 RED-first proof (pin file landed BEFORE any product edit)

`cd server && npx vitest run src/ai/submitSuggestionInstructionHygiene.test.ts` at base
(submitSuggestionTool.ts byte-identical to b6eddd7d — verified by `git show b6eddd7d:... >` redirect):

```
 FAIL  src/ai/submitSuggestionInstructionHygiene.test.ts > submit_suggestion instruction hygiene (HYGIENE-2) > pin 1: the instruction carries no event_graph vocabulary
 FAIL  src/ai/submitSuggestionInstructionHygiene.test.ts > submit_suggestion instruction hygiene (HYGIENE-2) > pin 2: the submit_suggestion tool def serialization carries no event_graph vocabulary
 Test Files  1 failed (1)
      Tests  2 failed | 3 passed (5)
```

Pins 1-2 RED at base (the located residue IS the residue); pins 3-5 GREEN at base. RED re-captured
a second time during the detach-base full-suite run (§4) with identical result.

## §3 The deliberate golden diff (the two strings, before/after)

Edit 1 — `submitSuggestionTool.ts:60` (SUBMIT_SUGGESTION_INSTRUCTION bullet):

```
-    '- Finish by calling the `agent_intent` tool exactly once (intent "event_graph" to draft events, or "deck_layout" to switch the deck layout). Do NOT print JSON in your text reply.',
+    '- Finish by calling the `agent_intent` tool exactly once, choosing ONE intent from its menu (the drafting intent this surface supports, or "deck_layout" to switch the deck layout). Do NOT print JSON in your text reply.',
```

Edit 2 — `submitSuggestionTool.ts:321` (records description in SUBMIT_SUGGESTION_TOOL_DEF;
propagates verbatim to agent_intent via DRAFT_ARGS_PROPERTIES['records']):

```
-            'Records the lab does NOT have yet, which the user wants added — the AUTHORING act, for intent "create_record". This is not a placement: putting something you already have on the bench is equipmentRequirements / labwareRequirements inside intent "event_graph", and a record the lab already owns must be PLACED, not re-created. '
+            'Records the lab does NOT have yet, which the user wants added — the AUTHORING act, for intent "create_record". This is not a placement: putting something you already have on the bench is equipmentRequirements / labwareRequirements inside the chosen drafting intent, and a record the lab already owns must be PLACED, not re-created. '
```

**String-fidelity proof (measured programmatically, node script):** my applied strings are
BYTE-EQUAL to the spec's §Exact-edits NEW strings — Edit 1 bullet 218 chars, Edit 2 fragment 220
chars (+ trailing space preserved). NOTE (AS-2): the spec's *labels* ("225 chars", "213 chars +
trailing space", "instruction 3108") miscount its own strings (actual +40 on the bullet, +4 net
inside the stringified schema, instruction 3061->3101), but the spec's *strings themselves* and its
*net/total predictions* (+44 net, total 47134, headroom 46) are exact — I copied the spec's strings
verbatim and the printed ratchet line matches the spec's expected numbers exactly (§5). No reword
was applied; the ceiling was NOT touched.

Protected-pin files show ZERO diff bytes:
`git -c core.fileMode=false diff b6eddd7d -- server/src/ai/AgentOrchestrator.forcedDraftSurface.test.ts server/src/ai/workstateComposeRules.test.ts server/src/ai/promptBudget.test.ts | wc -c` -> `0`.
Line 57 (`'FINALIZING YOUR ANSWER:'`) byte-identical (pin 3 + workstateComposeRules green).
No new TS policy branches; no surface-name literals (`workspace.deck`/`event-editor`) in the new
test or the instruction (grep-verified); no `exactOptionalPropertyTypes` optionals (the new test
composes no run()/buildPrefixRequest args — reads exported strings/defs only); no AgentOrchestrator
import in the new test.

## §4 Verification-1 — 9-file targeted line (at tip)

`cd server && npx vitest run src/ai/submitSuggestionInstructionHygiene.test.ts src/ai/promptBudget.test.ts src/ai/submitSuggestionTool.test.ts src/ai/submitSuggestionTool.equipment.test.ts src/ai/shorthandContractDisclosure.test.ts src/ai/workstateComposeRules.test.ts src/ai/AgentOrchestrator.forcedDraftSurface.test.ts src/ai/equipmentVocabulary.test.ts src/ai/equipmentAdditions.test.ts`

```
draft prompt budget: 47134 chars (agent 24543 + material-rules 5500 + instruction 3101 + schema 13990) — ceiling 47180 (headroom 46)
 Test Files  9 passed (9)
      Tests  74 passed (74)
```

Total 47134 / headroom 46 / ceiling 47180 — exact match to the spec's projected numbers (bait-2:
ceiling untouched, `CORE_PROMPT_CEILING_CHARS` not edited; stale-high guard clean).

## §5 Verification-2 — full server suite + detach-base parity

Post-change `npm run test:run -w server` tail:

```
 Test Files  90 failed | 665 passed | 9 skipped (764)
      Tests  99 failed | 6251 passed | 70 skipped (6597)
     Errors  2 errors
   Duration  280.77s
```

Detach-base run (my two files reverted to b6eddd7d state — product file via `git show`, new test
moved out — suite re-run, then byte-exact restore; restore hashes confirmed:
submitSuggestionTool.ts `8b71cd5d7589e160415898b2d3d42bb06b6588e95334cbc65722a7299b264874`,
hygiene test `dcb017d8fc43fe41347135da083e31623059eb54c4247a607e4693e57ba7075a`):

```
 Test Files  90 failed | 664 passed | 9 skipped (763)
      Tests  99 failed | 6246 passed | 70 skipped (6589)
     Errors  2 errors
```

`comm -3` of the sorted FAIL-file lists (base vs post): **EMPTY — fail-file sets IDENTICAL
(90 = 90), zero new failing files.** The +1 file / +5 tests delta is exactly my new pin file
(`✓ src/ai/submitSuggestionInstructionHygiene.test.ts (5 tests)` in the post run). The 90 failing
files are PRE-EXISTING trunk debt at b6eddd7d (execution/api/mcp/protocol-ide suites,
ZymoCampaignNegatives sha pins, acquisition hook-timeout/ENOENT flappers, etc.) — the spec's
"all green" expectation does not hold at this trunk state; parity is proven by the comm, not by a
headline exit code. `Errors 2` is pre-existing unhandled-rejection debt
(`AgentOrchestrator.golden{,WithSeeds}.test.ts: "Should not be called"`) — identical in both runs.

## §6 Verification-3 — typecheck at tip

`npm run typecheck -w server` at tip -> **0 errors, exit 0**. Base 0 -> tip 0: **delta 0** (OQ-3
canonical rule). Standalone `tsc` on the new test file alone (tsconfig excludes `**/*.test.ts`)
surfaces only the known `js-yaml` TS7016 artifact of single-file invocation (the project declares
`src/types/js-yaml.d.ts`); zero errors attributable to my test file.

## §7 Verification-4 — no-browser-gate proof

`git -c core.fileMode=false diff --stat b6eddd7d...HEAD`:

```
 .hermes/plans/HYGIENE-2-report.wip-l2t1935.md            |  ...
 server/src/ai/submitSuggestionInstructionHygiene.test.ts | 49 +++++++++++++++++++
 server/src/ai/submitSuggestionTool.ts                    |  4 ++--
```

ZERO paths under `app/`. Server-only item; no browser gate.

## §8 OQ-1 sibling residue (named, NOT edited)

Instruction bullets :61 (`each event's materials[]` phrasing) and :62 (`prefer
labwareRequirements[]`) still steer toward the legacy field-menu on migrated surfaces — residue
ACCEPTED per the orchestrator's promotion ruling; named here, nothing edited beyond Edits 1-3.
Also named, not edited: the now-stale header comment at
`AgentOrchestrator.forcedDraftSurface.test.ts:13-20` (protected pin file).

## §9 Assumptions

- AS-1: restoring the 67 lane-excluded trunk files (byte-copies from cl-integration-2, git-ignored,
  zero diff footprint) is the lane-2 convention for a fresh worktree (SH-PROMPT-HYGIENE-1 AS-5
  precedent); without it the base cannot typecheck or load AgentOrchestrator-importing suites.
- AS-2: the spec's per-string char labels (225/213) and its "instruction 3108" prediction miscount
  its own strings; the spec's strings were copied byte-exactly (proof in §3) and the printed
  ratchet line matches the spec's expected total/headroom/ceiling exactly. Strings fixed = none
  needed; ceiling = untouched.
- AS-3: the full-suite 90-file failure set is pre-existing trunk debt at b6eddd7d (proven by
  detach-base comm), not caused by this change; the spec's "all green" line does not match this
  trunk state.
- AS-4: pin 5's single checked enum key `'event_graph'` is the spec's bait-1 allowance ("the one
  checked key"), not a typed-out verb list.
- AS-5: DONE marker cites the code commit sha40; the report is committed after (SH-QC-1-OQ1 /
  SH-PROMPT-HYGIENE-1 precedent).

HYGIENE2 DONE 069e1161fbf88d7004e64aea2d6218c2a4702f2c
