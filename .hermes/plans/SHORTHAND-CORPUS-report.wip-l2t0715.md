# SHORTHAND-CORPUS — coder report (lane 2, l2t0715)

Worktree: /mnt/vast/home/brad/git/wt/SHORTHAND-CORPUS-lane2-l2t0715
Branch: cl/SHORTHAND-CORPUS-lane2-l2t0715 @ base e354abd6
Spec: /mnt/vast/home/brad/git/cl-integration-2/.hermes/plans/2026-10-11_0140-SHORTHAND-CORPUS-spec.md (canonical, incl. PROMOTION RECORD OQ1-OQ4 rulings)
Workstreams shipped: WS1, WS2, WS3 (no-op per OQ4), WS4. WS5 = patch block below (orchestrator-owned). WS6 = orchestrator/browser-reviewer.

## 0. CAMT bind — SATISFIED

`git merge-base --is-ancestor f9b75f2e HEAD` → SHORTHAND-CHAT (f9b75f2e) IS an ancestor of base e354abd6. Merged shape verified first-hand in this worktree:
- `AgentResult.shorthand?: string` — server/src/ai/types.ts:762 (conditional spread, key ABSENT when absent)
- `sidebarState.ts` — `reviewing.shorthand?: string` and `clarifying.shorthand?: string` (+ `draft-ready`/`clarifications-needed` action variants)
- `holdShorthandIntent`/`takeHeldShorthandIntent` — server/src/ai/shorthandChat.ts:104/:113
- chat Accept = `onApply` → `editor?.actions.commitPreview()` — AiTabPanel.tsx (event-graph branch)
- client holds the shorthand STRING in the reviewing state → WS1 posts it as the YAML-string arm (OQ1 ruling).

## 1. Bootstrap pitfall found + fixed (lane-local symlink)

Fresh worktree lacked the gitignored `server/schema` symlink (`.gitignore:44 server/schema`). Without it the scientist-intent vocabulary load fails (`defaultVocabularyDataPath()` = `cwd/schema/...`, vocabulary.ts:40) and corpus/IntentTrainingPair suites fail spuriously (first run: 2 files / 7 tests failed with `loadScientistIntentVocabulary ... vocabulary.ts:240` frames). Fix: `ln -s <wt>/schema server/schema` (matches sibling-lane pattern). All baselines below were captured AFTER the fix. Symlink is gitignored — zero diff impact.

## 2. First targeted check (approach proof, BEFORE code)

```
cd server && npx vitest run src/corpus src/api/handlers/IntentTrainingPairHandlers.test.ts
 Test Files  5 passed (5)
      Tests  31 passed (31)
cd server && npx vitest run src/corpus src/api/handlers/IntentTrainingPairHandlers.test.ts src/api/handlers/CorpusHandlers.test.ts
 Test Files  6 passed (6)
      Tests  35 passed (35)
```
Capture baseline 35/35 GREEN at base — matches the spec's grounding 9.

## 3. RED-FIRST evidence (CLAUDE.md rule 5)

RED-A — extended IntentTrainingPairHandlers test (WS1 `shorthandYaml` decode), BEFORE the handler change:
```
 Test Files  1 failed (1)
      Tests  2 failed | 8 passed (10)
 FAIL ... > WS1: shorthandYaml + localMacro in one body still captures EXACTLY ONE pair (single write path)
AssertionError: expected 'dmem-feed' to be 'chat-dmem-feed' // Object.is equality
 FAIL ... > WS1: a shorthandYaml body captures exactly ONE local pair whose target is the accepted ScientistIntent
```
(the body's `shorthandYaml` was ignored by the pre-change handler → no pair / wrong target)

RED-B — corpusReplay round-trip test, BEFORE the kernel existed:
```
 FAIL  src/corpus/corpusReplay.test.ts [ src/corpus/corpusReplay.test.ts ]
Error: Failed to load url ./corpusReplay.js ... Does the file exist?
 Test Files  1 failed (1)
      Tests  no tests
```
Both RED files stay in the tree as acceptance tests.

## 4. GREEN evidence (after implementation)

Server seam + replay:
```
cd server && npx vitest run src/api/handlers/IntentTrainingPairHandlers.test.ts
 ✓ src/api/handlers/IntentTrainingPairHandlers.test.ts  (10 tests) 35ms
 Test Files  1 passed (1)   Tests  10 passed (10)
cd server && npx vitest run src/corpus/corpusReplay.test.ts
 ✓ src/corpus/corpusReplay.test.ts  (11 tests) 82ms
 Test Files  1 passed (1)   Tests  11 passed (11)
```
Acceptance surface (baseline 35 + 16 new = 51):
```
cd server && npx vitest run src/corpus src/api/handlers/IntentTrainingPairHandlers.test.ts src/api/handlers/CorpusHandlers.test.ts
 Test Files  7 passed (7)
      Tests  51 passed (51)
```
App-side chat-accept leg (new file AiTabPanel.chatCorpus.test.tsx):
```
cd app && npx vitest run src/event-editor/right-pane/ai/AiTabPanel.chatCorpus.test.tsx
 ✓ src/event-editor/right-pane/ai/AiTabPanel.chatCorpus.test.tsx  (3 tests) 176ms
 Test Files  1 passed (1)   Tests  3 passed (3)
```
WS2 surfacing (both thread test files):
```
cd app && npx vitest run src/event-editor/right-pane/protocol/ProtocolLocalizationThread.test.tsx src/event-editor/right-pane/protocol/ProtocolLocalizationThread.familyAxes.test.tsx
 ✓ ...familyAxes.test.tsx  (7 tests) 89ms
 ✓ ...ProtocolLocalizationThread.test.tsx  (6 tests) 115ms
 Test Files  2 passed (2)   Tests  13 passed (13)
```

Acceptance-criteria coverage (headless list from the spec):
- chat-accept → exactly ONE JSONL pair, target = accepted ScientistIntent not the graph: server test "WS1: a shorthandYaml body captures exactly ONE local pair…" (`lines).toHaveLength(1)`, `pair.shorthand.kind === 'scientist-intent'`, `intentId chat-dmem-feed`, graph only in `acceptedGraph` provenance field) + app test "Accepting a shorthand proposal posts EXACTLY ONE training pair" (`intentTrainingPair` called once, `shorthandYaml` byte-identical to panel content, `localMacro` key ABSENT in body).
- anonymized: pair carries scrubbed provenance (`not.toMatch(/\b(MSP|EVG|MAT|ALQ|PRT|PLR)-[A-Za-z0-9]{2,}\b/)`, replay test asserts `EVG-###`); target deliberately NOT run through anonymizeGraph — it is canonical-vocabulary by schema construction (schema/workflow/scientist-intent.schema.yaml `additionalProperties: false`, required `intentId`/`actions`; the model is barred from record ids/CURIEs, so no internal ids survive lift+Ajv). The belt-and-braces case is pinned as a REFUSAL test instead: "WS1: an undisclosed field inside shorthandYaml never reaches the file".
- `intentShapeVersion:'1'` discriminator: asserted in both server capture test and replay round-trip.
- acceptedGraph provenance-only: asserted (`pair.acceptedGraph` matches events; never promoted in replay — replay test "old acceptedGraph-target line passes through UNCHANGED").
- corpus toggle off captures nothing: server test "WS1: with the toggle unset, a valid shorthandYaml captures NOTHING (file never created)" (env deleted, file never created, request still served) + pre-existing shorthandCorpus.test.ts toggle test untouched.
- malformed/undisclosed field never reaches the file (schema-check BEFORE write): "WS1: malformed shorthandYaml still serves the request and captures NOTHING" (unparseable YAML) and the undisclosed-field test; the ONLY write door remains `captureShorthandPairToLocal` (lift → parseScientistIntent Ajv → write). No replay/chat/debug path appends to the JSONL directly.

## 5. What changed (paths)

WS1 (chat Accept → one pair; OQ1 client-side post-accept, fire-and-forget):
- server/src/api/handlers/IntentTrainingPairHandlers.ts — ONE new optional body field `shorthandYaml` (TrainingPairBody); decode via `parseYamlDoc(stripYamlFence(...))` (the ONE parse site, reusing the compile path's helpers from compiler/scientistIntent/intentCompile.ts) feeding the SAME `captureShorthandPairToLocal` door; `shorthandYamlDoc ?? body?.localMacro` precedence (chat leg wins when both arms present → still EXACTLY one capture, pinned by test). Malformed YAML → parseYamlDoc returns null → door receives nothing → nothing written, request served.
- app/src/shared/api/client.ts — `intentTrainingPair` body widened with the ONE new optional field `shorthandYaml?: string` (nothing else touched).
- app/src/event-editor/right-pane/ai/AiTabPanel.tsx — `captureAcceptedShorthandPair()` (declared after the sidebar reducer so `sidebar` is in scope): fires ONLY when `sidebar.mode === 'reviewing' && sidebar.shorthand !== undefined` AND a shorthand draft exists (`lastShorthandDraftRef`); posts `userPrompt` = the draft's prompt, `shorthandYaml` = the verbatim held string (client NEVER parses — no yaml import, no normalization), `acceptedGraph` = committed preview events + labwares as provenance, `confirmedAt`. Called in `onApply` BEFORE `commitPreview()` (preview must be read before it clears). Fire-and-forget `.then/.catch` mirrors eventGraphPersistence's corpus leg; `corpus.disabled` is not warned as an error.
- NEW app/src/event-editor/right-pane/ai/AiTabPanel.chatCorpus.test.tsx — 3 tests (one pair verbatim + provenance; no-shorthand draft captures nothing; failed POST never touches the Accept).
- server/src/api/handlers/IntentTrainingPairHandlers.test.ts — +5 WS1 tests (see §4).

WS2 (localization-thread surfacing ONLY — capture NOT moved client-side):
- app/src/event-editor/right-pane/protocol/ProtocolLocalizationThread.tsx — `handleAccept` now reads the `intentTrainingPair` response: ok → original message; `corpus.disabled` → "Accepted — protocol saved; remote corpus disabled — pair sent for local capture."; other failure → "…training pair not posted (<error>)." `setLocalMacro`/`handleAccept` flow otherwise byte-stable; no response-shape extension (OQ2 ruling — local-append boolean stays server-side).
- ProtocolLocalizationThread.test.tsx — +3 surfacing tests (disabled → honest local wording + NOT claiming corpus; http_500 → no corpus claim, accept still served; ok → original message preserved). familyAxes test file untouched (its stubbed `intentTrainingPair` resolves undefined → the null-safe `pairRes?.` branch keeps it byte-stable; suite re-run green, 7 tests).

WS3 — NO-OP per OQ4 (no rename; `intentTrainingPair` stays; wiring shipped as WS1+WS2).

WS4 (JSONL → corpus replay):
- NEW server/src/corpus/corpusReplay.ts — PURE kernel: `parseCorpusJsonlLine(line, lineNo)` (JSON + minimal entry shape: prompt/acceptedGraph/confirmedBy; failures carry the 1-based line number), `entryToPostBody(entry)` (entry as captured — discriminator fields preserved as DATA, no re-anonymization, no migration), `replayCorpusJsonl(content, post)` (injected poster, blank lines skipped, every failing line reported). NO fs, NO network in the kernel.
- NEW server/src/corpus/corpusReplay.test.ts — 11 tests: round-trip deep-equal (buildShorthandCorpusEntry → captureShorthandPairToLocal(tmp) → line → parse → body), discriminator preserved, old acceptedGraph-target line passes through UNCHANGED (no migration/rejection), malformed lines reported with line numbers (parse + shape), byte-identical bodies on double replay (dedup-friendly), exactOptionalPropertyTypes absent-key assertions (`'confirmedAt' in body === false`), mocked-corpus post (injected poster), empty file.
- NEW server/scripts/corpus-replay.ts — tsx CLI (golden-replay.ts shape, outside src/, NOT vitest-collected): `--dry-run` prints one POST-body JSON per line with NO network; live mode POSTs via `postCorpusEntry` on the `resolveCorpusConfig`-resolved URL; corpus.disabled → loud exit 1 (no fake success); exit 0/1/2. Paths from argv only — no lane path hardcoded in src/.

WS5 — ORCHESTRATOR-OWNED (no diff hunk; patch block verbatim below).

## 6. WS5 PATCH BLOCK (apply mechanically; orchestrator restarts lane stack)

Inside `start()` in /home/brad/.hermes/profiles/orchestrator/scripts/cl-lane-stack.sh, add to the BACKEND subshell's env line (currently `APP_BASE_PATH=.. PORT=... CL_DATA_DIR=... CONFIG_PATH=...`):

```
CLA_CORPUS_LOCAL_PATH="/home/brad/.computable-lab-lane${LANE}/corpus/pairs.lane${LANE}.jsonl" \
```

(one line, backend ONLY — vite does not need it; WS5 sets ONLY CLA_CORPUS_LOCAL_PATH, never CLA_CORPUS_ENABLED per AS-LANE2-SHORTHANDCORPUS-3. No repo code defaults this path anywhere; `resolveLocalCorpusPath` stays env-driven.)

## 7. Pin re-derivations (base e354abd6 vs head, SET-equality)

Server tsc:
```
cd server && npx tsc --noEmit 2>&1 | grep -c "error TS"   → 19 (pin 19)
```
App tsc:
```
cd app && npx tsc --noEmit 2>&1 | grep -c "error TS"      → 34 (pin 34)
```
SET-equality proof (stash base → capture sorted error-line SETs → pop → diff vs head SETs):
```
diff base-server-tsc head-server-tsc → SERVER TSC SET IDENTICAL
diff base-app-tsc   head-app-tsc   → APP TSC SET IDENTICAL
```
App FULL vitest fail-SET (raws /tmp/l2t0715-base-app-vitest.raw, /tmp/l2t0715-head-app-vitest.raw; SET = sorted unique `FAIL  <file>` extraction):
```
base: Test Files  52 failed | 267 passed (319)   Tests  74 failed | 2138 passed (2212)   Errors  6
head: Test Files  52 failed | 268 passed (320)   Tests  74 failed | 2144 passed (2218)   Errors  6
diff base-failfiles head-failfiles → APP FAIL-SET IDENTICAL (52 files)
```
SET composition: 21 `e2e/*.spec.ts|.mjs` (Playwright specs — always fail under vitest) + 31 `src/*.test.tsx?`. The handed "35 files" pin is the src-only count at an older trunk; at THIS base the src-only count is 31 and the full SET is 52 — the binding rule (SET-equality base vs head, zero new) holds exactly: identical 52-file SET, identical 74 failing tests, +6 passing = my 6 new app tests (3 chatCorpus + 3 WS2), +1 passing file = AiTabPanel.chatCorpus.test.tsx. `src/ai/AgentOrchestrator.bypass.test.ts` is NOT in the app set (it is server-side); untouched.

Server scoped fail-SET (`npx vitest run src/ai src/compiler/scientistIntent`):
```
base: Test Files  10 failed | 89 passed (99)   Tests  19 failed | 812 passed (831)   Errors  2
head: Test Files  10 failed | 89 passed (99)   Tests  19 failed | 812 passed (831)   Errors  2
diff → SERVER SCOPED FAIL-SET IDENTICAL (10 files)
```
10-file SET: AgentOrchestrator.bypass / .golden / .goldenWithSeeds / .tubeGate / AgentOrchestratorForwarding / ChatbotCompileDeckSlot / chatbotCompile.e2e / createRecordIntent / InferenceClient.config / submitSuggestionTool.tubeSchema. The handed "11" pin is the count at an older trunk; at THIS base the SET is 10 — SET-equality base↔head holds with zero new. `AgentOrchestrator.bypass.test.ts` present in the SET, NOT fixed (not mine). `Errors 2` = pre-existing unhandled-exception debt, identical base/head.

Pipeline freeze + goldens:
```
cd server && npx vitest run src/compiler/scientistIntent/goldens → Tests  15 passed (15)
git -c core.fileMode=false hash-object server/src/compiler/scientistIntent/goldens/MANIFEST.yaml
  → 58c447ebd8dc62b111fc35ee5cd04d6e7c4aba35 (exact)
git -c core.fileMode=false diff --name-only e354abd6...HEAD -- server/src/corpus/shorthandCorpus.ts server/src/compiler schema/ app/src/event-editor/eventGraphPersistence.ts app/src/event-editor/deck/PreviewActionBar.tsx server/src/corpus/CorpusClient.ts server/src/corpus/surfaceContextCorpus.ts server/src/corpus/analysisCorpus.ts server/src/api/handlers/CorpusHandlers.ts server/src/ai
  → EMPTY (capture module, pipeline, schema, old deck path, CorpusClient, server/src/ai ALL zero hunks)
```
Health surface (read-only, live lane):
```
curl -s localhost:3093/api/health | jq '.components.lintRules.loaded' → 81
```

Replay CLI dry-run round-trip (hermetic, no network):
```
cd server && npx tsx /tmp/l2-corpus-smoke/capture-once.ts   → captured: true
cd server && npx tsx scripts/corpus-replay.ts --dry-run /tmp/l2-corpus-smoke/pairs.jsonl
{"source":"protocol-loop","sourceType":"app","prompt":{"user":"add 100uL of DMEM to A1"},"acceptedGraph":{"events":[{"eventId":"e1","event_type":"add_material"}],"labwares":{}},"confirmedBy":"user","confirmedAt":"2026-10-11T00:00:00Z","corrections":[],"modelMetadata":{},"intentShapeVersion":"1","shorthand":{"kind":"scientist-intent","version":"0.1.0","intentId":"chat-dmem-feed","actions":[{"action":"add_material","material":"DMEM","targetWells":["A1"],"volumeUl":100}],"unresolved":[]},"shorthandVersion":"0.1.0"}
dry-run: 1 body(ies) printed, 0 failure(s)
exit=0
```
Body carries `"intentShapeVersion":"1"`; two consecutive dry-runs `cmp` → byte-identical.

## 8. Reviewer-bait dispositions

1. exactOptionalPropertyTypes: new server optionals use conditional spread / null-union (`shorthandYamlDoc: Record<string,unknown> | null`; `...(body?.confirmedAt ? {...} : {})` unchanged); replay results are discriminated unions (`{ok:true;entry}` | `{ok:false;lineNo,error}`) — never `undefined` in an optional slot. Pinned by the `'confirmedAt' in body === false` test. Server tsc stays 19 with an identical error SET.
2. Schema-check-before-write: the ONLY local-write door remains `captureShorthandPairToLocal`; WS1 hands it the decoded object; replay never writes JSONL; no direct-append path exists. Invalid-macro tests (malformed + `{nope:true}`) kept AND extended.
3. Toggle-off: no path default anywhere in repo code; env-deleted test added for the YAML arm.
4. Target vs provenance: `.shorthand` = lift-canonical ScientistIntent (natural verbs bridged via the declarative ACTION_SYNONYMS table in schema/scientist-intent vocabulary YAML; canonical closed vocabulary); `.acceptedGraph` provenance-only, never promoted in replay; discriminator is DATA; no second corpus client (replay posts via injected poster riding the CorpusClient contract; chat leg rides `/intent/training-pair`).
5. Anonymization: provenance + surfaceContext anonymized by buildCorpusEntry (untouched frozen module); target canonical-by-schema (pointer: schema/workflow/scientist-intent.schema.yaml additionalProperties:false) — refusal test pinned instead of an anonymizer patch.
6. Historical entries untouched: zero hunks in CorpusClient/surfaceContextCorpus/analysisCorpus/CorpusHandlers/eventGraphPersistence/PreviewActionBar; replay passes old lines through unchanged.
7. Client never parses: app diff contains no yaml/parse near the accept leg (grep-able: AiTabPanel change is `shorthandYaml: sidebar.shorthand` verbatim).
8. Hardcode boundary: DMEM-class fixtures live only in test files; CLI reads paths from argv; no lane path in src/.
9. Never-throw: handler capture stays inside the existing best-effort contract; CLI is loud (exit codes); kernel pure.
10. WS5 scope: zero hunks outside the worktree; patch block is a report artifact only.

## 9. Assumptions

- AS-L2T0715-1: `server/schema` lane symlink created (gitignored, matches sibling lanes) before any baseline; without it the lane's corpus suites fail spuriously (documented §1).
- AS-L2T0715-2: pin SETs re-derived at THIS base: app fail-SET = 52 files (21 e2e + 31 src), server scoped = 10 files. The handed 35/11 counts are older-trunk counts; the binding rule (SET-equality, zero new) is satisfied exactly. No failing file was fixed or added.
- AS-L2T0715-3: OQ3 honored — local shorthand pairs carry NO goldModel (unchanged asymmetry: remote post carries GOLD_MODEL, local capture does not). Noted, not changed.
- AS-L2T0715-4: WS1 capture fires on the event-graph Accept branch only when the draft carried shorthand (SHORTHAND-CHAT's held string); a protocol_edit Accept (handleProtocolAccept) and the deck PreviewActionBar path produce no new pair (historical path untouched).
- AS-L2T0715-5: `shorthandYaml` precedence over `localMacro` when both arms are in one body (chat leg's just-approved document is the target); pinned by test. Single capture per request either way.

## 10. Unresolved / handoff

- WS5 patch application + lane-stack restart: orchestrator. WS6 browser receipt 0→1: browser-reviewer AFTER WS5 applied (contract in spec §WS6).
- No lane-stack restarts or :3093/:5193 touches were made by this coder.
