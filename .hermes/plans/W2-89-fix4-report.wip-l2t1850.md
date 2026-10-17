# W2-89 CYCLE-4 CODER REPORT (FIX-6 + FIX-7, l2t1850)

- Worktree: /mnt/vast/home/brad/git/wt/W2-89-fix-lane2-l2t0230 (branch cl/W2-89-fix-lane2-l2t0230)
- Base: abef6c1b (cycle-3 tip; fix commit 04970485). All git ops with `-c core.fileMode=false`.
- Authority executed: /home/brad/.hermes/cl/lanes/2/decisions/W289-c3-wall-residual-ruling-l2t1235.md
  (read in full; ends 'W289-C3-RULING DONE'). Scope: FIX-6 + FIX-7 ONLY.
- Fix commit: 8615b4787e0e5eb98012a439cbdb69e224d907d9
  `fix(W2-89c4): governed-answer ask-wall routing (FIX-6) + interrogativePatterns dead-knob deletion (FIX-7) per c3 ruling`
  4 files changed, 98 insertions(+), 18 deletions(-).
- Trunk untouched; no merges; :3001/:5174/:3093/:5193 untouched; no schema/lint/ui YAML; no client changes.

## 0. Baseline recapture at abef6c1b (BEFORE first edit)

- server `npx tsc --noEmit`: 19 error lines (raw /tmp/w289c4-base-server-tsc.txt) — matches pin 19.
- app `npx tsc --noEmit`: 34 error lines (raw /tmp/w289c4-base-app-tsc.txt) — matches pin 34.
- server suites: AgentOrchestrator.reviewWriteWall.test.ts 8 passed (8); reviewWriteWall.test.ts 18 passed (18).
- named others: InferenceClient.reasoningChannel 3, IntentCompileFromPromptHandlers.apiKey 4,
  IntentCompileFromPromptHandlers 11 → 44 total across the 5 named server suites.
- app suites: ReviewAiPanel.writeWall.test.tsx 6 + reviewAiPanel.writeWall.test.ts 5 +
  assistStream.test.ts 11 + AiTabPanel.protocolEdit.test.tsx 9 = 31 passed (31).
  (NOTE: assistStream/AiTabPanel live at app/src/event-editor/right-pane/ai/, not the review dir.)
- MANIFEST blob: `git hash-object server/src/compiler/scientistIntent/goldens/MANIFEST.yaml`
  = 58c447ebd8dc62b111fc35ee5cd04d6e7c4aba35 (matches pin).
- ReviewAiPanel.tsx blob at HEAD: 8fea09e54c9ace377aeb93e6c48edbba470957ca.

## 1. RED-FIRST evidence (tests 9+10 written first, observed failing at abef6c1b)

Only the test file was changed at RED time (`git diff --name-only` =
server/src/ai/AgentOrchestrator.reviewWriteWall.test.ts). Raw: /tmp/w289c4-red.txt.

```
❯ src/ai/AgentOrchestrator.reviewWriteWall.test.ts  (10 tests | 1 failed) 479ms
   ❯ ... > DEFECT-2(c3): a gap>3 leading-verb answer smuggled via clarificationAnswers is refused before the model
     → expected undefined not to be undefined
AssertionError: expected undefined not to be undefined
 ❯ src/ai/AgentOrchestrator.reviewWriteWall.test.ts:277:28
    277|     expect(result.refusal).toBeDefined();
 Test Files  1 failed (1)
      Tests  1 failed | 9 passed (10)
```

RED log line proving the smuggle ran the model at base:
`[agent 7e1pp5] start surface=protocol-review ... promptLen=23 effectivePromptLen=358 clarificationAnswers=2`
then `turn 1 finish=tool_calls` — the gap>3 answers reached the model (no refusal).
Test 10 (honest multi-field boundary) passed at base as expected (it pins behavior
that FIX-6 must not break); test 9 is the RED pin.

## 2. FIX-6 — governed-answer routing (AgentOrchestrator.ts)

LINE-DRIFT REPORT (anchors located by content):
- The single line the ruling numbers :1253 was at line 1253 at abef6c1b (verified) and was
  REPLACED there; after the comment-block extension it now begins at line 1256 of the
  committed file:
  `const askWall = reviewAskWallFor(surfaceName, prompt)` followed by the ruling's verbatim
  chain: `?? reviewAskWallFor(surfaceName, effectivePrompt) ?? (request.clarificationAnswers ?? [])`
  `.map(...[a.optionId, a.label, a.mentionToken, a.value, a.ref ? JSON.stringify(a.ref) : '']...join('\n'))`
  `.map((segment) => reviewAskWallFor(surfaceName, segment))`
  `.find((w): w is ReviewWallRefusal => w !== null) ?? null;`
- Refusal handling (ruling :1254-1269) UNCHANGED — verified in the diff context.
- Import (ruling note): line 67 now `import { reviewAskWallFor, reviewOpsWallFor, type ReviewWallRefusal } from './reviewWriteWall.js';`
- Comment block (ruling :1224-1252) extended with ONE sentence (now at :1249-1252):
  "Per the W2-89 cycle-4 ruling (FIX-6), each clarification answer the user submitted is
  itself a governed turn: the ask wall reads the answer's RAW request fields alongside the
  ask and the appended prompt."
- ZERO new YAML keys for FIX-6; predicate `reviewAskWallFor` and ALL policy data untouched
  by FIX-6 (the only YAML change in the run is the FIX-7 deletion, §3).
- No phrase literals added: string literals on added TS lines are only
  `'./reviewWriteWall.js'`, `'string'`, `'\n'`, `''` (JSON serialization / type guard / join)
  — checked programmatically over the committed diff (/tmp/w289c4-ts-diff.txt).

## 3. FIX-7 — dead-knob deletion

config/drafting/review-write-wall.yaml (ONLY YAML changed; DELETIONS-ONLY):
- Stale TURN-FORM bullet (ruling :24-27): deleted verbatim (4 lines, at 24-27 at abef6c1b).
- `interrogativePatterns:` + its 4 entries (ruling :65-69): deleted verbatim (5 lines, at
  65-69 at abef6c1b; located by content — after the bullet deletion they sat at 61-65).
- Diff proof: `git diff -- config/drafting/review-write-wall.yaml` shows two hunks, all `-`
  lines; count of added non-header lines = 0 (raw /tmp/w289c4-yaml-diff.txt).
- `maxGapWords: 3` (now :60) and remaining `matching:` keys (leadingVerb,
  interrogativeStripPatterns, negationTokens) unchanged.

server/src/ai/reviewWriteWall.ts:
- Load/validate lines (ruling :200-201): deleted (were at 200-201 at abef6c1b, verified).
- Assignment `interrogativePatterns,` (ruling :224): deleted (was at 224, verified).
- Interface field `interrogativePatterns: string[];` + its doc comment: deleted (was at 90-91).
- `optionalStringList` KEPT — still used by blockerWords (:207), interrogativeStripPatterns
  (:215), negationTokens (:217). No import removed (no import became unused).
- Header comment :37 reworded `interrogativePatterns` → `interrogative-pattern-list` so the
  grep-zero battery check passes; comment-only, no behavior/data change.

server/src/ai/reviewWriteWall.test.ts: NOT EDITED. It contains no reference to
`interrogativePatterns` (grep verified); test 3's three honest-interrogative behavioral pins
survive unchanged. Suite stays 18 tests (18) — no test dropped, no test edited.

## 4. GREEN counts per suite (after FIX-6 + FIX-7, at 8615b478)

Server (from package dir, `cd server && npx vitest run <file>`):
- src/ai/AgentOrchestrator.reviewWriteWall.test.ts — 10 passed (10) [was 8; +tests 9,10]
  (raw /tmp/w289c4-green-orch.txt, /tmp/w289c4-green-wall.txt)
- src/ai/reviewWriteWall.test.ts — 18 passed (18) UNCHANGED
- src/ai/InferenceClient.reasoningChannel.test.ts — 3 passed (3)
- src/api/handlers/IntentCompileFromPromptHandlers.apiKey.test.ts — 4 passed (4)
- src/api/handlers/IntentCompileFromPromptHandlers.test.ts — 11 passed (11)
  Combined run of the 5 named suites: 5 files, 46 passed (46) = 44 baseline + 2 new (raw
  /tmp/w289c4-server-suites.txt).

App (UNCHANGED, green): ReviewAiPanel.writeWall.test.tsx 6 + reviewAiPanel.writeWall.test.ts 5
+ assistStream.test.ts 11 + AiTabPanel.protocolEdit.test.tsx 9 = 31 passed (31)
(raw /tmp/w289c4-app-suites.txt).

Regression pins green UNCHANGED: test 4 (ops-wall blocker/provenance payload), test 5
(six legit + four gate asks in reviewWriteWall.test.ts), test 8 (benign option-label answer
in AgentOrchestrator.reviewWriteWall.test.ts), plus test 6 (DEFECT-2 honest question) and
test 7 (DEFECT-3(c2) gap<=3 smuggle).

## 5. Smuggle-closure re-probe (battery item 2)

tsx probe (server/w289c4-probe.ts, DELETED before commit — not in the diff; raw
/tmp/w289c4-probe-out.txt) rebuilding effectivePrompt per appendClarificationAnswersToPrompt
and applying the ask wall to the rendered prompt AND to each answer's raw-field segment:
- rendered prompt + gap<=3 gate answer "rewrite the vendor text on page 2" → FIRED SAID_IMMUTABLE
- segment gap>3 A "rewrite right now the full vendor text exactly as printed on page 2" → FIRED SAID_IMMUTABLE
- segment gap>3 B "overwrite the whole thing with the vendor document" → FIRED SAID_IMMUTABLE
- segment gap<=3 gate string → FIRED SAID_IMMUTABLE
- NEW evasion 1 (verb in label + referent in value, joined segment): "rewrite right away" +
  "the full vendor text exactly as printed on page 2" → FIRED SAID_IMMUTABLE
- NEW evasion 2 (scaffold-embedded adjacency; attack only reachable via raw segment):
  optionId "opt" + value "please rewrite the vendor text" → FIRED SAID_IMMUTABLE
- NEW evasion 3 (gap<=3 attack in mentionToken only): "overwrite the vendor text" → FIRED SAID_IMMUTABLE
- NEW evasion 4 (gap<=3 attack in serialized ref only): ref {note:"rewrite the vendor text"} → FIRED SAID_IMMUTABLE
- Orchestrator-level (test 9): both gap>3 strings as label AND value → refusal.code
  SAID_IMMUTABLE, completeStream NEVER called, store create/update/delete tripwires untouched.
OBSERVATIONS (priced nulls per ruling R1/R1', NOT misfires):
- "rewrite and right now the full vendor text" (blocker `and`) → null (R1).
- label "vendor text" + value "then rewrite it right away now" (referent-before-verb) → null (R1').
- gap>3 attack buried in mentionToken behind a label prefix (verb not at segment start) → null (R1' class).
Probe verdict: PROBE ALL OK (13/13 as expected).

## 6. Dead-knob grep-zero (battery item 3)

`grep -rn interrogativePatterns config/drafting/review-write-wall.yaml
server/src/ai/reviewWriteWall.ts server/src/ai/reviewWriteWall.test.ts`
→ NO MATCHES (grep exit 1). Repo-wide grep (excluding node_modules and .hermes plans
archives) also returns zero hits in tracked product files.

## 7. tsc pins + MANIFEST + app untouched (battery items 5-6)

- server tsc: 19 error lines; `diff` of sorted base vs head raws = IDENTICAL LINE SET
  (zero new; /tmp/w289c4-head-server-tsc.txt).
- app tsc: 34 error lines; IDENTICAL LINE SET (/tmp/w289c4-head-app-tsc.txt).
- exactOptionalPropertyTypes: FIX-6 attaches nothing optional; deleting the required
  interface field added ZERO errors (identical line sets prove it).
- MANIFEST blob: 58c447ebd8dc62b111fc35ee5cd04d6e7c4aba35 (exact pin, post-commit).
- app/ diff: 0 tracked changes; ReviewAiPanel.tsx blob 8fea09e54c9ace377aeb93e6c48edbba470957ca
  byte-identical. app/ status shows only the pre-existing untracked gate artifacts
  (e2e/gate-pbch6.spec.mjs, e2e/pbch4b-accept-leg.test.ts, test-pb-ch-5.mjs, node_modules)
  that were already untracked at abef6c1b.
- Files changed by the commit (git diff --name-only): config/drafting/review-write-wall.yaml,
  server/src/ai/AgentOrchestrator.ts, server/src/ai/AgentOrchestrator.reviewWriteWall.test.ts,
  server/src/ai/reviewWriteWall.ts. YAML changed = review-write-wall.yaml ONLY.

## 8. Residual pricing — NOT touched (per ruling)

R1 (blocker-token class, ACCEPTED, LOW), R1' (answer-segment ordering, priced by FIX-6),
R2 (over-block "why do you rewrite the vendor text?", FLAGGED NOT RULED), R3 (verb-lexeme
coverage, ACCEPTED) — no 'fixes' attempted; out-of-scope list from l2t0810 stands in full.
The probe reports their nulls as OBSERVATION (§5).

## 9. Commit

- Fix commit: 8615b4787e0e5eb98012a439cbdb69e224d907d9 on cl/W2-89-fix-lane2-l2t0230
  (4 files, +98/-18). Probe file deleted before commit; no stray files staged.
- Report commit follows this file (docs commit on the same branch).

W289-FIX4 CODER PASS COMPLETE — awaiting orchestrator verification + adversarial re-probe.
