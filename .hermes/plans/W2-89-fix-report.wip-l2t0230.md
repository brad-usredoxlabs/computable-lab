# W2-89 combined fix run — coder report (l2t0230)

- Task: W2-89-COMBINED-FIX — W2-8-SAID-MEANT-SURFACE (A5) + W2-9-REVIEW-AI-PANEL (g2b-1..4), browser-gate defects cycle 1
- Worktree: `/mnt/vast/home/brad/git/wt/W2-89-fix-lane2-l2t0230` (branch `cl/W2-89-fix-lane2-l2t0230`)
- Branch base: `e354abd6e2adba26e91f6766e1eec897cf20d50c` (cl/integration-2 tip at start; `47a4f706` verified ancestor via `git merge-base --is-ancestor`)
- Commits (NOT merged): `c3098d4f`, `21f1b791`, `2a7abb8d` (tip; see §8)
- Gate reports read in full: `/home/brad/.hermes/cl/receipts/W2-9-REVIEW-AI-PANEL/2026-10-11_0110-g2b/REPORT.md`, `/home/brad/.hermes/cl/receipts/W2-8-SAID-MEANT-SURFACE/2026-10-11_0110-a5b/REPORT.md`
- Specs read: `.hermes/plans/2026-10-10_0630-W2-8-said-meant-surface-spec.md`, `.hermes/plans/2026-10-10_0110-W2-9-review-ai-panel-spec-DRAFT-l2t0030.md` (§10 criteria verbatim, §0.6 write walls, §5 proof map)
- Evidence raws (CODER-CAPTURED): `.hermes/plans/evidence/w289-l2t0230/` in this worktree (base/head tsc + vitest raws)

## 0. Lane setup + pin re-derivation at branch base

Worktree created from cl/integration-2 tip e354abd6. Lane-synced ignored/untracked files replicated 1:1 from the TRUNK worktree per the lane-2 pattern (`core.excludesfile = /home/brad/.hermes/cl/lanes/2/lane-exclude` is inherited by the new worktree automatically): all 62 lane-exclude entries copied with `cp -a`, the three untracked lane residue files (`app/e2e/gate-pbch6.spec.mjs`, `app/e2e/pbch4b-accept-leg.test.ts`, `app/test-pb-ch-5.mjs`) copied, `node_modules`/`app/node_modules`/`server/node_modules` symlinked to the TRUNK, `server/schema` symlinked to the WORKTREE's own `schema/` (qms-8/OWN-1 pattern), `.env` symlinked to Brad's live tree, `config.yaml` copied.

Pins re-derived at base (all CODER-CAPTURED, raws in evidence dir):

| Pin | Base re-derivation | Matches brief? |
|---|---|---|
| server tsc | 19 `error TS` lines (`/tmp/base-server-tsc.txt`) | YES (19) |
| app tsc | 34 `error TS` lines (`/tmp/base-app-tsc.txt`) | YES (34) |
| app full failing-FILE src-set | 35 files (`grep '^src/'` of FAIL lines, `/tmp/base-app-failfiles-src.txt`); headline 58 failed = 35 src + 23 e2e Playwright specs collected under vitest | YES (35, SET-equality discipline) |
| server scoped fail-set | 11 files (`src/schema src/lint src/integration src/api/handlers src/store src/revisions src/governance`, `/tmp/base-server-scoped-vitest.txt`) | YES (11) |
| MANIFEST blob | `git hash-object server/src/compiler/scientistIntent/goldens/MANIFEST.yaml` = `58c447ebd8dc62b111fc35ee5cd04d6e7c4aba35` | YES |
| lintRules :3093 | `curl http://localhost:3093/api/health` -> `"lintRules":{"loaded":81}` (read-only; stack NOT touched) | YES (81, report-only) |

## 1. W2-9 g2b-1/2 — deterministic write-wall refusal (criterion-hard-fail)

Ruling honored: model discretion failed twice on both asks, so the refusal is STRUCTURAL, not prompt guidance. Policy is DATA (lane rule: business rules in data, TS follows data) — new `config/drafting/review-write-wall.yaml` (the `config/drafting/shorthand-drafting.yaml` precedent: loaded PER call, never process-cached; absent file => wall OFF; malformed => honest throw). Interpreter `server/src/ai/reviewWriteWall.ts` contains ZERO surface-name or phrase literals.

Mechanism:
- **Ask wall** (`AgentOrchestrator.run`, before any model call): on a guarded surface (`surfaces: [protocol-review]` — data), an ask matching a wall's verb AND noun (both required, so a legitimate MEANT-only ask never trips) returns `AgentResult.refusal = {code, message}` with the server-built wording. Zero inference, zero writes, NO proposal payload.
- **Ops wall** (protocol_edit dispatch branch, defense-in-depth): an op object carrying a forbidden key (`provenance`, `source_artifact`, `vendorTruth`, `rung`, … — data) is refused with the honest wording BEFORE the envelope is consulted. The protocol-edit-op schema envelope is NOT extended; its `unevaluatedProperties:false` stays the structural half (spec §0.4).
- **Client**: `AssistDraftResult.refusal` (assistStream.ts); `ReviewAiPanel.onDraftResult` renders `[data-testid=review-ai-refusal]` and CLOSES any prior card — an Apply/Accept card over a refused ask is impossible.
- Criterion coverage: (a) SAID_IMMUTABLE, (b) PROVENANCE_FALSIFICATION (ask + ops), (c) VALIDATION_CANNOT_BE_BYPASSED, (d) PROMOTION_NOT_ON_THIS_SURFACE (commit 2), (e) retarget was already deterministic client-side (protocolId mismatch -> named refusal, bait 3 test).

RED (captured before implementation):
- `server/src/ai/reviewWriteWall.test.ts` — interpreter GREEN immediately (the policy file + interpreter are the new unit; RED is proven at the orchestrator level below).
- `server/src/ai/AgentOrchestrator.reviewWriteWall.test.ts` at pre-fix tree: `Tests 4 failed | 1 passed (5)` — `AssertionError: expected undefined not to be undefined` on `result.refusal` for asks (a), (b), the ops wall, and the refusal-wording test (raw tail in session; the 1 pass was the legitimate-ask control).
- `app/src/ingestion/protocol-review/ReviewAiPanel.writeWall.test.tsx` + `reviewAiPanel.writeWall.test.ts` at pre-fix tree: `Test Files 2 failed (2) / Tests 7 failed | 1 passed (8)` — refusal envelope ignored by the panel, bubble committed `(no response)`, CSS `overflow: hidden`.

GREEN (verbatim tails):

```
 ✓ src/ai/AgentOrchestrator.reviewWriteWall.test.ts  (5 tests) 1474ms

 Test Files  5 passed (5)
      Tests  32 passed (32)
   Start at  04:52:21
   Duration  12.58s (transform 4.28s, setup 1ms, collect 14.66s, tests 2.07s, environment 2ms, prepare 1.34s)
```
(`cd server && npx vitest run src/ai/reviewWriteWall.test.ts src/ai/AgentOrchestrator.reviewWriteWall.test.ts src/ai/InferenceClient.reasoningChannel.test.ts src/api/handlers/IntentCompileFromPromptHandlers.apiKey.test.ts src/api/handlers/IntentCompileFromPromptHandlers.test.ts`)

```
 Test Files  4 passed (4)
      Tests  29 passed (29)
   Start at  04:55:47
   Duration  28.22s (transform 2.71s, setup 11.00s, collect 6.86s, tests 1.13s, environment 72.38s, prepare 4.42s)
```
(`cd app && npx vitest run src/ingestion/protocol-review/ReviewAiPanel.writeWall.test.tsx src/ingestion/protocol-review/reviewAiPanel.writeWall.test.ts src/event-editor/right-pane/ai/assistStream.test.ts src/event-editor/right-pane/ai/AiTabPanel.protocolEdit.test.tsx`)

Determinism proof (server-side, the ruling's requirement): the two ask texts assert NO proposal payload reaches the client (`result.protocolEdit` undefined), ZERO model calls (`completeStream` not called — the wall fires before inference), zero store writes (mutation tripwires), and the refusal renders (server envelope + client render test asserting `review-ai-refusal` present and `changes-apply`/`changes-panel` ABSENT). Run-to-run variance is eliminated because the wall is a data predicate, not model discretion.

## 2. W2-9 g2b-3 — raw chain-of-thought rendered as the assistant bubble

Root cause found at the CHANNEL BOUNDARY (the lane assumption file's "suspected server stream-channel merge" confirmed first-hand): `InferenceClient.normalizeReasoningDelta` FOLDED reasoning-only deltas into `delta.content`; `AgentOrchestrator` streams `content` as `text_delta`; `MessageLog.tsx` renders `m.text` verbatim -> CoT became the bubble. The three other streaming consumers (`FoundryCoderPatch.ts:1286+`, `EventEditorFixHandlers.ts:1818+`, `ProtocolBuilderHandlers.ts:797+`) each carried defensive "skip the client's reasoning->content echo" code — the merge was the anomaly, not the consumers.

Fix: the stream path no longer synthesizes `content` from reasoning (reasoning stays on `reasoning`/`reasoning_content`); the BLOCKING `complete()` fallback (`normalizeReasoningContent`) is untouched for callers that only read content. User-visible answer for every turn class: refusal turns bubble the server-built refusal wording (`summarizeDraftResult` outranks all channels with `result.refusal.message`); protocol_edit proposal turns bubble an honest summary line ("Proposed N protocol edit(s) on the draft — review the card; nothing is written until you Accept.") instead of `(no response)`/reasoning.

RED: `server/src/ai/InferenceClient.reasoningChannel.test.ts` pre-fix: `Tests 1 failed | 2 passed (3)` — `expected 'The user wants to change the SAID doc…' to be undefined` (the fold). GREEN: included in the 32-pass tail above (3/3 in that file).

## 3. W2-9 g2b-4 — `.review-ai__log` never scrolls

`app/src/ingestion/protocol-review/reviewAiPanel.css`: `.review-ai__log { overflow: hidden }` -> `overflow-y: auto` (with `flex:1; min-height:0` unchanged; no other panel layout touched; the shared `.message-log` keeps its own `overflow-y:auto`). RED captured in `reviewAiPanel.writeWall.test.ts` (CSS source assertion, failed pre-fix with the verbatim `overflow: hidden` block); GREEN in the 29-pass tail.

## 4. W2-8 A5 — compile-from-prompt apiKey wiring (blocker)

`server/src/api/handlers/IntentCompileFromPromptHandlers.ts` `toInferenceConfig`: now computes `const apiKey = small?.apiKey ?? activeInference?.apiKey` and conditionally spreads `...(apiKey !== undefined ? { apiKey } : {})` — exactOptionalPropertyTypes idiom (key ABSENT, never undefined). Precedence mirrors the existing baseUrl/model precedence: a declared `smallModel` key rides its own endpoint; else the ACTIVE PROFILE's key rides the profile endpoint (mirrors the W2-9 chat path's keyed-client injection). `createInferenceClient` then sets `Authorization: Bearer …` (InferenceClient.ts:52,69-70) and the key-required profile stops answering 401.

RED: `server/src/api/handlers/IntentCompileFromPromptHandlers.apiKey.test.ts` pre-fix: `Tests 3 failed | 1 passed (4)` — `expected undefined to be 'sk-small-KEY'` and the two profile-key assertions (raw in session). GREEN: 15/15 with the existing SPINE-5 contract suite (`IntentCompileFromPromptHandlers.test.ts` 11 tests unchanged): tail in §1's first block.

## 5. Pin re-derivations at HEAD (all CODER-CAPTURED)

- server tsc: 19 errors; `diff` vs base = only the pre-existing `AgentOrchestrator.ts` error line-shifted 296->297 by my import line; normalized diff SET-EQUAL (`SERVER TSC SET-EQUAL (line-shifted)`).
- app tsc: 34 errors; `diff /tmp/base-app-tsc.txt /tmp/head-app-tsc2.txt` -> `APP TSC SET-EQUAL`.
- app full suite (serialized, `/tmp/head2-app-vitest-full.txt`): `Test Files 58 failed | 265 passed (323)` / `Tests 65 failed | 2115 passed (2180)` / `Errors 5` — src fail-SET 35 files, `comm -3` base-vs-head EMPTY (SET-EQUAL); headline 58 = 35 src + 23 e2e Playwright specs (pre-existing collection debt, identical base->head); passed counts rose 2107->2115 (+8 new tests) and 263->265 files (+2 new test files). `Errors 5` is the pre-existing unhandled-exception debt (identical base->head).
- server scoped fail-set (`/tmp/head2-server-scoped.txt`): `Test Files 11 failed | 102 passed | 5 skipped (118)` / `Tests 16 failed | 1069 passed | 53 skipped (1143)` — 11 files, `comm -3` vs base EMPTY (SET-EQUAL); passed rose 1065->1069 (+4 from the new apiKey suite… actually +4 = the 4 apiKey tests; the wall suites live in src/ai, outside this scope).
- server `src/ai` neighborhood (NOT a pinned scope; disclosed): head run `9 failed | 80 passed (89) / 18 failed | 683 passed (701) / Errors 2`. BASE-PARITY PROVEN: with my tracked server changes reverted to e354abd6 (`git checkout e354abd6 -- AgentOrchestrator.ts InferenceClient.ts types.ts`, new test files inert without the product change), the identical 9-file set fails with the IDENTICAL counts `9 failed (9) / 18 failed | 16 passed (34) / Errors 2` — zero new failures from my diff. The 9 files are pre-existing debt (bypass/Forwarding/golden/goldenWithSeeds/tubeGate/ChatbotCompileDeckSlot/chatbotCompile.e2e/InferenceClient.config/submitSuggestionTool.tubeSchema).
- MANIFEST blob: `git hash-object` at HEAD = `58c447ebd8dc62b111fc35ee5cd04d6e7c4aba35` — byte-untouched.
- lintRules: 81 on :3093 health (read-only curl; stack NOT restarted). NOTE: my new policy file is `config/drafting/review-write-wall.yaml` — NOT a lint/schema YAML, so the lintRules count is structurally unaffected; it is loaded per-call by the interpreter (hot-reload, no restart needed — the shorthand-drafting.yaml precedent).

## 6. Changed paths (`git diff --name-only e354abd6 HEAD`)

Product: `server/src/ai/AgentOrchestrator.ts`, `server/src/ai/InferenceClient.ts`, `server/src/ai/types.ts`, `server/src/ai/reviewWriteWall.ts` (new), `server/src/api/handlers/IntentCompileFromPromptHandlers.ts`, `config/drafting/review-write-wall.yaml` (new), `app/src/event-editor/right-pane/ai/assistStream.ts`, `app/src/ingestion/protocol-review/ReviewAiPanel.tsx`, `app/src/ingestion/protocol-review/reviewAiPanel.css`.
Tests: `server/src/ai/reviewWriteWall.test.ts`, `server/src/ai/AgentOrchestrator.reviewWriteWall.test.ts`, `server/src/ai/InferenceClient.reasoningChannel.test.ts`, `server/src/api/handlers/IntentCompileFromPromptHandlers.apiKey.test.ts`, `app/src/ingestion/protocol-review/ReviewAiPanel.writeWall.test.tsx`, `app/src/ingestion/protocol-review/reviewAiPanel.writeWall.test.ts`.
NO schema/lint YAML edits (the new file is a drafting policy under config/drafting/, flagged here per the constraint). No edits to protocol-edit-op.*.yaml, ChangesPanel.tsx, useChatThread.ts, MessageLog.tsx, AiTabPanel.tsx.

## 7. Assumptions and notes

1. **Ask-wall matching semantics** (verb AND noun, both required, case-insensitive, word-bounded verbs + regex nouns) is my design choice within the ruling's "deterministic refusal" mandate; the two gate ask texts are pinned verbatim in tests. Risk: a legitimate ask that happens to name "vendor text" + a change verb is refused — that is the intended wall semantics per criterion 2, and the refusal wording tells the user edits belong on MEANT.
2. **Refusal envelope shape** `AgentResult.refusal = {code, message}` (key ABSENT otherwise) — additive; no existing consumer breaks (no existing test asserts the absence of unknown keys on AgentResult).
3. **g2b-3 fix location**: the ruling said "fix at the channel boundary". I removed the reasoning->content fold on the STREAM path only. The three other stream consumers' defensive echo-skip code becomes redundant but harmless (left untouched — out of assigned scope). The blocking `complete()` fold stays (its consumers, e.g. `InferenceClient.config.test.ts` "normalizes reasoning-only responses into message content", depend on it and still pass).
4. **Residual CoT exposure**: with the fold gone, a reasoning-only model turn now bubbles `(no response)` instead of the CoT. A refusal turn always has visible wording (g2b-1/2 tie satisfied). Making the orchestrator emit a `thinking` event channel and/or a "the model produced only internal reasoning" honest placeholder is a follow-up candidate — flagged, not done (scope).
5. **A5 end-to-end 401 leg**: vitest proves the built config carries the key (the defect); the live 401 -> authenticated compile leg needs the orchestrator's browser re-gate (Playwright is orchestrator-side). No live provider call was made from this run (fleet rule: no stack/endpoint touching).
6. **src/ai 9-file debt** is pre-existing (proven by base-parity revert, §5) — disclosed per rule 7 of report integrity; it is NOT in the pinned server scoped set.
7. Lane-sync residue (`app/e2e/*.spec.mjs` etc.) replicated per the lane pattern; they inflate the app headline by 23 e2e collections base AND head (disclosed, SET-equal).

## 8. Commits (branch `cl/W2-89-fix-lane2-l2t0230`, NOT merged)

- `c3098d4fc971ab5d4c830c97600321cc8105100e` — write-wall refusal + reasoning channel boundary + compile apiKey + D-SCROLL + all RED/GREEN tests
- `21f1b7916701670d50b071ab19213b106cf39d40` — policy DATA completes criterion-2 negatives (c) bypass-validation, (d) promote-unauthorized
- `2a7abb8d643cf0cd77f8642040b36fb087ad80b9` — summarizeDraftResult names a protocol_edit proposal honestly (g2b-3 bubble) — TIP

VERDICT: implementation complete; acceptance pending orchestrator re-gate (g2b re-shoot + a5 re-shoot).
