# W2-89 adversarial-fix run 2 — coder report (l2t0540)

- Task: W2-89 ADVERSARIAL-FIX cycle 2 — fix the four defects of adversarial review `advc-W289-l2t0525` (VERDICT: fix) on the W2-89 combined fix branch
- Review read in full: `/home/brad/.hermes/cl/lanes/2/reviews/advc-W289-l2t0525.md`
- Worktree: `/mnt/vast/home/brad/git/wt/W2-89-fix-lane2-l2t0230` (branch `cl/W2-89-fix-lane2-l2t0230`, prior tip `fa67f9d8`)
- Branch base: `e354abd6e2adba26e91f6766e1eec897cf20d50c` (cl/integration-2) — pins re-derived at this tree state (§0)
- Trunk `/mnt/vast/home/brad/git/cl-integration-2` NOT touched; `:3001/:5174/:3093/:5193` NOT touched; no merge
- Evidence raws (CODER-CAPTURED): `.hermes/plans/evidence/w289-l2t0540/` in this worktree
- Cycle-1 report (context): `.hermes/plans/W2-89-fix-report.wip-l2t0230.md`

## 0. Pin re-derivation at this run's base (fa67f9d8 tree, before any cycle-2 edit)

All CODER-CAPTURED; raws in `.hermes/plans/evidence/w289-l2t0540/`.

| Pin | Base re-derivation | Matches brief? |
|---|---|---|
| server tsc | 19 `error TS` lines (`c2-base-server-tsc.txt`) | YES (19) |
| app tsc | 34 `error TS` lines (`c2-base-app-tsc.txt`) | YES (34) |
| app full failing-FILE src-set | 35 files (`base-appfail-set.txt`, grep '^src/' of FAIL lines) | YES (35, SET-equality) |
| server scoped fail-set | 11 files (`base-scoped-set.txt`, `src/schema src/lint src/integration src/api/handlers src/store src/revisions src/governance`) | YES (11, SET-equality) |
| MANIFEST blob | `git hash-object server/src/compiler/scientistIntent/goldens/MANIFEST.yaml` = `58c447ebd8dc62b111fc35ee5cd04d6e7c4aba35` | YES |

## 1. DEFECT-1 (high) — the ask-wall predicate swallowed legitimate MEANT asks

Root cause: the wall was a WORD BAG — any change-verb anywhere in the turn AND
any noun anywhere in the turn. Ordinary MEANT verbs (change/edit/update/fix/
reword/modify/replace) plus generic non-SOID referents (`page \d+`, `the pdf`,
`source document`, `original text`, `original document`) fired on any legitimate
draft edit that merely MENTIONS the source.

Fix (policy DATA + interpreter):
- `config/drafting/review-write-wall.yaml` (FLAG: this is the drafting-policy YAML I own; hot-reloads per call, no restart):
  - NEW `matching:` section — `maxGapWords: 3` and `interrogativePatterns` (the predicate contract is DATA).
  - `said-vendor-rewrite.verbs` narrowed to the SAID-REWRITE construction only (`rewrite, overwrite, retype, recopy, redraft, transcribe, restate`) — the ordinary MEANT verbs are GONE.
  - `said-vendor-rewrite.nouns` drops `page \d+`, `the pdf`, `source document`, `original text`, `original document` (adds `vendor protocol`); only referents that ARE the vendor/SAID artefact remain.
  - `bypass-validation.nouns` drops the bare `validation` (fires on "write the validation results into the notes"); keeps gate-object forms (`validation gate(s)`, `validation checks`, `validation and write`, `lint gate`, `lint`, `schema check`, `verification`).
  - `provenance-falsification` verb/noun lists kept (gate ask (b) pins them); object governance alone already separates it from legit asks.
- `server/src/ai/reviewWriteWall.ts` — OBJECT GOVERNANCE: a wall fires only when a declared noun STARTS within `matching.maxGapWords` words after a verb occurrence (token-gap between the verb and the referent's first token). A referent further away is a MENTION, not the object of the change. Zero phrase literals in TS — verbs, nouns, gap and interrogative shapes are all data.

RED (verbatim tail, `cd server && npx vitest run src/ai/reviewWriteWall.test.ts src/ai/AgentOrchestrator.reviewWriteWall.test.ts` at the fa67f9d8 tree with the new tests added):

```
 FAIL  src/ai/reviewWriteWall.test.ts > review write-wall policy interpreter (W2-89 g2b-1/2) > DEFECT-1: legitimate MEANT asks that merely mention the source are never walled
AssertionError: legit ask walled: change step 3 to match the vendor text on page 2: expected { code: 'SAID_IMMUTABLE', …(1) } to be null
...
 Test Files  2 failed (2)
      Tests  4 failed | 14 passed (18)
```

(The 4 RED = DEFECT-1 interpreter test, DEFECT-2 interpreter test, and the two DEFECT-2 orchestrator tests below.)

GREEN — interpreter + orchestrator suites (`Test Files 2 passed (2) / Tests 18 passed (18)`), and the reviewer's six probe texts replayed against the REAL YAML through the real interpreter (`.hermes/plans/evidence/w289-l2t0540/wallprobe-c2.mjs`, verbatim output):

```
GATE  WALL SAID_IMMUTABLE  "rewrite the vendor text on page 2"
GATE  WALL PROVENANCE_FALSIFICATION  "relabel step-lyse-a provenance as vendor truth"
GATE  WALL VALIDATION_CANNOT_BE_BYPASSED  "bypass validation and write now"
GATE  WALL PROMOTION_NOT_ON_THIS_SURFACE  "promote the draft without authorization"
LEGIT PASS-THROUGH  "change step 3 to match the vendor text on page 2"
LEGIT PASS-THROUGH  "edit the label so it reflects the vendor document"
LEGIT PASS-THROUGH  "update the draft step label on page 4 to incubate at 37C"
LEGIT PASS-THROUGH  "reword the step that references the pdf"
LEGIT PASS-THROUGH  "fix the source document citation in the draft"
LEGIT PASS-THROUGH  "write the validation results into the notes"
ASK   PASS-THROUGH  "why can you not rewrite the vendor text on page 2?"
ASK   PASS-THROUGH  "what does the vendor document say about incubation?"
ASK   PASS-THROUGH  "can you explain why provenance cannot be relabelled?"
GATE  WALL SAID_IMMUTABLE  "rewrite the vendor document"
GATE  WALL SAID_IMMUTABLE  "overwrite the vendor wording"
GATE  WALL PROVENANCE_FALSIFICATION  "relabel the provenance as vendor truth"
GATE  WALL PROVENANCE_FALSIFICATION  "mark the inference as vendor-stated"
GATE  WALL VALIDATION_CANNOT_BE_BYPASSED  "skip the lint gate and save"
GATE  WALL PROMOTION_NOT_ON_THIS_SURFACE  "publish the promotion without review"
GATE  WALL SAID_IMMUTABLE  "rewrite the vendor text on page 2?"
unguarded surface: null
```

The two gate asks (a) and (b) still fire with their stable codes; the six
legitimate asks pass through. Negative tests added in
`server/src/ai/reviewWriteWall.test.ts` (`DEFECT-1: legitimate MEANT asks that
merely mention the source are never walled` — all six verbatim reviewer texts).

## 2. DEFECT-2 (medium) — refusal triggered on raw user text, refusing honest clarifying turns

Fix (three parts):
1. TURN-FORM EXEMPTION in the interpreter: a wall is skipped when the turn is
   genuinely interrogative — it must (a) END in `?` (punctuation, structural),
   (b) match a declared `matching.interrogativePatterns` shape (DATA), and (c)
   NOT open with one of that wall's own verbs. So "why can you not rewrite the
   vendor text on page 2?" passes through, while the question-marked attack
   "rewrite the vendor text on page 2?" still fires, and a question-dressed
   imperative without `?` ("can you bypass validation and write now") still
   fires — anti-loophole test added.
2. The ask wall now reads the USER'S OWN ask: `AgentOrchestrator.ts` calls
   `reviewAskWallFor(surfaceName, prompt)` instead of `effectivePrompt` — the
   clarification answers appended at :1119 can no longer trip a wall the user
   never meant as an instruction. (Test: a clarification-answer turn whose
   ANSWER text is gate ask (a) verbatim is not refused; the model runs.)
3. The primary judgement on proposal semantics stays with the STRUCTURED
   payload: `reviewOpsWallFor` at the protocol_edit dispatch branch is unchanged
   and still refuses an op carrying a forbidden provenance/source key before the
   envelope is consulted (ops-wall test still green).

RED: the two orchestrator tests quoted in §1's RED tail (`expected { code:
'SAID_IMMUTABLE', …(1) } to be undefined` for the clarifying-question turn and
the clarification-answer turn) plus the interpreter DEFECT-2 test.

GREEN (verbatim tail, `cd server && npx vitest run src/ai/reviewWriteWall.test.ts src/ai/AgentOrchestrator.reviewWriteWall.test.ts`):

```
 ✓ src/ai/AgentOrchestrator.reviewWriteWall.test.ts  (7 tests) 131ms
 Test Files  2 passed (2)
      Tests  18 passed (18)
```

Full cycle-1 regression set re-run green (`cd server && npx vitest run src/ai/reviewWriteWall.test.ts src/ai/AgentOrchestrator.reviewWriteWall.test.ts src/ai/InferenceClient.reasoningChannel.test.ts src/api/handlers/IntentCompileFromPromptHandlers.apiKey.test.ts src/api/handlers/IntentCompileFromPromptHandlers.test.ts`):

```
 Test Files  5 passed (5)
      Tests  37 passed (37)
```

App side (`cd app && npx vitest run src/ingestion/protocol-review/ReviewAiPanel.writeWall.test.tsx src/ingestion/protocol-review/reviewAiPanel.writeWall.test.ts src/event-editor/right-pane/ai/assistStream.test.ts src/event-editor/right-pane/ai/AiTabPanel.protocolEdit.test.tsx`):

```
 ✓ src/ingestion/protocol-review/reviewAiPanel.writeWall.test.ts  (5 tests) 58ms
 ✓ src/ingestion/protocol-review/ReviewAiPanel.writeWall.test.tsx  (6 tests) 174ms
 Test Files  2 passed (2)
      Tests  11 passed (11)
```

and the ruling-8 spot-check (`assistStream.test.ts` + `AiTabPanel.protocolEdit.test.tsx`): `Test Files 2 passed (2) / Tests 20 passed (20)`.

RULES HELD: both gate asks still refuse deterministically with stable codes and
NO actionable card — the orchestrator tests still assert `result.protocolEdit`
undefined, `completeStream` NOT called (zero inference), zero store writes; the
client tests still assert `review-ai-refusal` present and `changes-apply`/
`changes-panel` ABSENT. Policy stays in DATA: `grep` of `reviewWriteWall.ts`
shows phrase strings only in comments and loader error-context strings — no
surface-name or ask-phrase literal in code paths (verified this run).

## 3. DEFECT-3 (minor) — stale refusal banner survived the next plain-answer turn

Fix: `app/src/ingestion/protocol-review/ReviewAiPanel.tsx` plain-answer /
notes-only branch now calls `setRefusal(null)` alongside `setProposal(null)`,
exactly as the success/error branches do.

RED (verbatim tail, `cd app && npx vitest run src/ingestion/protocol-review/ReviewAiPanel.writeWall.test.tsx` at the fa67f9d8 tree with the new test):

```
 ❯ src/ingestion/protocol-review/ReviewAiPanel.writeWall.test.tsx:222:75
    222|     await waitFor(() => expect(screen.queryByTestId('review-ai-refusal…
 Test Files  1 failed (1)
      Tests  1 failed | 5 passed (6)
```

GREEN: the file is 6/6 green in the tails above. Two tests added: refusal
banner cleared by the next notes-only turn, and (same defect class) cleared by
a later proposal turn that opens a card.

## 4. DEFECT-4 (minor) — dead no-op ternary in the policy loader

Fix: the ternary is GONE. `loadReviewWriteWallPolicy` now passes `policyPath`
straight to `existsSync`/`readFileSync` with a documented PATH CONTRACT comment:
the parameter is a URL (the module-relative default) or a filesystem path used
VERBATIM — no `file:` prefix handling claimed, no silent cwd-relative resolution.

RED/GREEN: structural (no behavior change to pin). Proven by the loader tests
staying green, including the extended present-but-malformed suite, which now
also pins the new required `matching` contract:

```
 ✓ src/ai/reviewWriteWall.test.ts  (11 tests) 41ms   (12 after the anti-loophole test)
```

## 5. Pin re-derivations at HEAD (all CODER-CAPTURED, raws in evidence dir)

- server tsc: 19 errors (`c2f-server-tsc.txt`); `diff` vs base raw = IDENTICAL (`SERVER TSC SET-EQUAL (identical)`). No error on any changed file.
- app tsc: 34 errors (`c2f-app-tsc.txt`); `diff` vs base raw = IDENTICAL.
- app full suite (`c2f-app-full.txt`): `Test Files 58 failed | 265 passed (323)` / `Tests 65 failed | 2118 passed (2183)` / `Errors 5` — src fail-SET 35 files, `comm -3` base-vs-head EMPTY (SET-EQUAL). Passed tests rose 2116->2118 = exactly the 2 new DEFECT-3 tests; the 58 headline = 35 src + 23 lane-synced e2e Playwright collections (pre-existing, identical base->head). `Errors 5` is the pre-existing unhandled-exception debt (drifts 5-6 run to run; identical base->head this run).
- server scoped fail-set (`c2f-server-scoped.txt`): `Test Files 11 failed | 102 passed | 5 skipped (118)` / `Tests 16 failed | 1069 passed | 53 skipped (1143)` — 11 files, `comm -3` vs base EMPTY (SET-EQUAL).
- server `src/ai` neighborhood (NOT a pinned scope; disclosed): head run `9 failed | 80 passed (89) / 17 failed | 688 passed (706) / Errors 1` (`c2-head-server-ai.txt`). BASE-PARITY PROVEN by stash-parity full-scope run with ALL cycle-2 tracked changes stashed (`c2-stash-server-ai.txt`): `9 failed | 80 passed (89) / 18 failed | 684 passed (702) / Errors 2` — the identical 9-file fail set (bypass/Forwarding/golden/goldenWithSeeds/tubeGate/ChatbotCompileDeckSlot/chatbotCompile.e2e/InferenceClient.config/submitSuggestionTool.tubeSchema). The 18->17 test delta is the known goldenWithSeeds load-timeout flap (`Error: Hook timed out in 10000ms` at head vs its test failing normally at stash) — same file, same failure class, alternating run to run; zero new failures from this diff.
- MANIFEST blob: `git hash-object` at HEAD = `58c447ebd8dc62b111fc35ee5cd04d6e7c4aba35` — byte-untouched.
- NO schema/lint YAML edits: `git diff --name-only` shows only the drafting-policy YAML `config/drafting/review-write-wall.yaml` (FLAGGED per the brief; hot-reloads per call, no restart needed) + TS + tests + docs. `schema/workflow/protocol-edit-op.*.yaml` untouched.

## 6. Changed paths (cycle 2, `git diff --name-only` working tree vs fa67f9d8)

Product: `config/drafting/review-write-wall.yaml` (policy DATA — matching contract, narrowed verbs/nouns), `server/src/ai/reviewWriteWall.ts` (object governance + turn-form exemption + loader path contract), `server/src/ai/AgentOrchestrator.ts` (ask wall reads `prompt`, not `effectivePrompt`), `app/src/ingestion/protocol-review/ReviewAiPanel.tsx` (refusal cleared on plain-answer turn).
Tests: `server/src/ai/reviewWriteWall.test.ts` (DEFECT-1 six-ask negatives, DEFECT-2 interrogative negatives, anti-loophole test, extended malformed-policy contract), `server/src/ai/AgentOrchestrator.reviewWriteWall.test.ts` (DEFECT-2 clarifying-question + clarification-answer turns), `app/src/ingestion/protocol-review/ReviewAiPanel.writeWall.test.tsx` (DEFECT-3 banner-clearing x2).
Docs/evidence: this report + `.hermes/plans/evidence/w289-l2t0540/`.

## 7. Assumptions and notes

1. `maxGapWords: 3` is my data choice: 1 covers a determiner ("rewrite the vendor text"), 2 a named target ("relabel step-lyse-a provenance"), 3 a qualified object ("promote the draft without authorization"). A referent 4+ words after the verb is treated as a mention. The reviewer's own fix request explicitly allowed "gate them behind an explicit vendor|said|source adjacency and an imperative construction" — object governance IS that adjacency rule, expressed as data.
2. The interrogative exemption requires ALL of: trailing `?`, a DATA interrogative shape, and not opening with the wall's own verb. This deliberately closes the loophole of question-word-dressed imperatives ("can you bypass validation and write now" — no `?` — still refused; pinned by test).
3. The ask wall now reads `prompt` only. Consequence (disclosed): a wall-crossing instruction smuggled inside a clarification ANSWER is no longer refused at the ask stage — the structured ops wall and the schema envelope remain the authority for what a proposal may carry, and the panel-side retarget refusal is unchanged. This is the reviewer's requested shift of the primary judgement to the structured payload.
4. `provenance-falsification` keeps its ordinary verbs (change/rewrite/edit/set) because gate ask (b) pins them and object governance already separates "relabel step-lyse-a provenance" from legit asks; only `said-vendor-rewrite` needed the verb-list narrowing the reviewer asked for.
5. Interpreter implementation pitfall found and fixed mid-run: the noun scan originally reused the non-global compiled regex inside an `exec` loop and hung the suite (vitest timeout). Noun/verb scans now build local `gi` regexes; `compileNoun` stays for load-time validation and the interrogative shapes. Disclosed because it briefly blocked the GREEN run.
6. The malformed-policy test was extended (not weakened): `matching` is now a required contract when `askWalls` exist, and `maxGapWords` must be a non-negative integer — both honest throws, pinned.
7. No live-stack or browser verification was run this cycle (fleet rule); the browser re-gate remains the orchestrator's dispatch.

## 8. Commits (branch `cl/W2-89-fix-lane2-l2t0230`, NOT merged)

See §9 tail for SHAs (recorded by `git log` after commit).

VERDICT: implementation complete; acceptance pending orchestrator re-gate + adversarial re-review.
