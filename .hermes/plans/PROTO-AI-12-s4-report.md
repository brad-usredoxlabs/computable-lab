# REPORT — PROTO-AI-12 §4: shadow-router adapter at the submit-selection site (log-only, zero authority)

Worker: cl-coder (lane 2, token l2t1225). Worktree: /mnt/vast/home/brad/git/wt/PROTO-AI-12-4-lane2-l2t1225
Branch: wt/PROTO-AI-12-4-lane2-l2t1225 off trunk cl/integration-2 @ 7c418e36. ONE commit (see Diff below).
Spec: .hermes/plans/2026-10-06_1152-PROTO-AI-12-s4-shadow-adapter.md (binding, followed as written).

Note on report path: the orchestrator named `.hermes/plans/PROTO-AI-12-s4-report.wip-l2t1225.md` under the
cl/integration-2 checkout. cl-integration-2 is a linked worktree of the same repo; the report is committed on
MY branch at that repo-relative path (single-commit contract), so it lands at
/mnt/vast/home/brad/git/cl-integration-2/.hermes/plans/PROTO-AI-12-s4-report.wip-l2t1225.md on merge.
Brad's live tree and main were never touched.

## What was built

- NEW `server/src/ai/shadowRouterAdapter.ts` — classification-only adapter:
  - `resolveShadowRouterConfig(config)`: MISSING block / `enabled !== true` / no baseUrl / no model -> null (OFF).
    timeoutMs default 8000 comes from the documented config default (config/types.ts ShadowRouterConfig.timeoutMs
    "default 8_000") — no new policy, no hardcoded endpoint.
  - `classifyWithShadowRouter(deps, turn)`: OpenAI-compatible POST `{baseUrl}/chat/completions`, classification-only
    (no `tools`/`tool_choice` field — asserted in test), AbortController on config `timeoutMs` ONLY (S4: no second
    timer), user turn truncated to `SHADOW_TURN_WINDOW_CHARS = 400`. NEVER throws: exact/bracket/quoted token ->
    intent; anything else -> `parse_failure`; abort -> `timeout`; network/HTTP-fail -> `unreachable`; malformed
    JSON body -> `parse_failure`.
  - `parseShadowRouterPick(raw)`: trim -> lowercase -> strip bracket/quote wrappers -> FIRST-LINE token match with
    token-boundary check (`event_graphx` is garbage, `protocol_edit.` is the token). Never a guess.
  - `shadowRouteIfNeeded(deps, request)`: returns void synchronously; `void classify(...).then(record).catch(()=>{})`.
    Telemetry gets ONLY classification facts (correlationId, picks, models, latencies, errorClass) — no prompt,
    no payload (S3; asserted in tests: telemetry line must not contain the turn text).
  - Imports: `../config/types.js` (type-only) and `./shadowTelemetry.js` only. Nothing that can mutate a record (D5).
- NEW `server/src/ai/shadowRouterAdapter.test.ts` — 21 unit tests (parsing, config resolution, failure paths,
  wrapper telemetry, wrapper kill-switch, throw-insulation).
- NEW `server/src/ai/AgentOrchestrator.shadowRouter.test.ts` — 6 integration tests (4-intent paired telemetry,
  bit-identical on/off, kill-switch x2, failing-fetch errorClass line, S1 hang test).
- `server/src/ai/AgentOrchestrator.ts` — wiring ONLY (dispatch logic, selectSubmitCall, branch order untouched — S6):
  - `AgentOrchestratorDeps.shadowRouter?: ShadowRouterConfig` + `fetch?: typeof fetch` (test seam) at :906-916.
  - `shadowSetup` resolved ONCE at construction from the config block (:941-955); null = fully OFF.
  - `shadowRoute(pick, bigModelLatencyMs)` helper inside `run()` (:1050-1068) — correlationId = the run's `tid`
    (reuse, never re-mint), turn = `effectivePrompt`, bigModelLatencyMs = the orchestrator's own `elapsed`.
  - FOUR call sites, each AFTER the authoritative branch resolved (after its done-log, before its return):
    create_record :1959, deck_layout :1994, protocol_edit :2046, event_graph draft path :2542 (reaching the draft
    path means the agent_intent matched none of the three explicit branches — the spec's orientation).
    Never awaited (S1); guarded by `shadowSetup` (writer.enabled equivalent: config+writer kill-switch resolved once).
- `server/src/server.ts` — construction-site wiring at the `createAgentOrchestrator` call, **server.ts:1068**
  (block at :1073-1081): `...(appConfig?.ai?.shadowRouter ? { shadowRouter: appConfig.ai.shadowRouter } : {})` —
  same deps seam as `ontology` (:1055) and `assuranceThreshold` (:1065). No new mutation semantics needed; clean
  seam existed. MISSING block in config = production behavior byte-identical to before this change.

## RED-first (run BEFORE implementation, verbatim tail)

```
 ❯ src/ai/AgentOrchestrator.shadowRouter.test.ts:263:25
    261|       );
    262|       expect(on.events).toEqual(off.events);
    263|       expect(on.result).toEqual(off.result);
...
 FAIL ... > enabled:true + failing fetch -> user-visible result bit-identical AND one telemetry line with errorClass
Error: telemetry file never reached 1 line(s)
 Test Files  2 failed (2)
      Tests  3 failed | 3 passed (6)
```

Honest note: the adapter unit file failed at import (module did not exist — 21 tests uncollectable). Of the 6
integration tests, the 3 that passed pre-wiring are the trivially-true ones (kill-switch x2, bit-identical with
no wiring, S1 hang with no router); the true RED assertions were the 4-intent pairing test and the
failing-fetch errorClass test.

## GREEN (after implementation)

```
 ✓ src/ai/shadowRouterAdapter.test.ts  (21 tests) 304ms
 ✓ src/ai/AgentOrchestrator.shadowRouter.test.ts  (6 tests) 507ms
 Test Files  2 passed (2)
      Tests  27 passed (27)
```

## Bit-identical on/off proof

Test `dispatch is bit-identical with shadow ON vs OFF`: for each of the four scripted intents, the same fake-model
output is run twice — shadow OFF (no config) and shadow ON (enabled config + mocked router fetch). Asserts the
captured `onEvent` streams deep-equal AND the `AgentResult`s deep-equal after canonicalizing only the fields the
draft path mints per run anyway (eventId / actionGroupId / provenance timestamp — volatile regardless of shadow;
everything else compared verbatim). All four intents pass. The failing-fetch test additionally proves a router
network failure leaves the onEvent stream and result identical while one telemetry line lands.

## Kill-switch outputs (all real test assertions)

- NO shadowRouter config: fetch spy `not.toHaveBeenCalled()` (ZERO inference calls) AND telemetry file never created. PASS.
- `enabled:false` (with baseUrl/model/telemetryPath present): same — zero fetch calls, no file. PASS.
- Adapter-level: disabled writer -> `shadowRouteIfNeeded` returns before any fetch; zero calls, no file. PASS.
- `enabled:true` + failing fetch: user-visible bit-identical + exactly ONE telemetry line
  `{routerPick:"unreachable", errorClass:"network", authoritativePick:"protocol_edit", correlationId:<tid>}`. PASS.

## S1 (never awaited) proof

Test `a router fetch that hangs past the run never delays the user-visible result`: router fetch hangs forever
(abort at config timeoutMs = 5000 ms); the deck_layout turn completes with `elapsed < 2000 ms` and the correct
result. PASS.

## Real p95 (appliance-2 :8900 UP — not blocked)

Script: /tmp/proto-ai-12-s4-p95.mjs (NOT committed; endpoint+model passed as argv — nothing hardcoded).
60 real classification calls (>= 50 required), fixture turn set covering the four intents, adapter's exact prompt
+ parser contract. Authoritative run (parser fixed to mirror parseShadowRouterPick):

```
startedAt: 2026-10-06T16:53:18.090Z (2026-10-06 12:53:18 EDT)   finishedAt: 2026-10-06T16:53:26.520Z
baseUrl: http://appliance-2:8900/v1   model: lfm2.5-350m
requested 60, completed 60, failures 0
min 119 ms | median 143 ms | p90 152 ms | p95 159 ms | max 178 ms
picks: { parse_failure: 42, create_record: 18 }
```

p95 = 159 ms wall — well under the §2 signed 2000 ms gate. Two earlier runs of the same script (before the pick
tally was fixed to the adapter parser) measured p95 172 ms and 161 ms — latency consistent across runs; their
raw-echo tallies are superseded by this run.

FINDING FOR THE ORCHESTRATOR (corpus quality, not a gate failure): with the adapter's classification prompt the
350M model mostly ECHOES the token list instead of selecting (42/60 parse_failure; the 18 "create_record" picks
are the model fixating on the last gloss token — wrong for transfer turns). Probed alternative prompt shapes
(system+user split, terse, few-shot, bracket-notation, question form) — none reliably emitted a single correct
token. The §2 latency gate is met; router-vs-authoritative AGREEMENT will be poor with this prompt, and the
paired corpus will show that honestly. Prompt iteration is a separate item (spec Open-question 2 keeps wording
adapter-internal); I did NOT re-litigate §2 thresholds or invent a tuned prompt.

## Full-suite regression (verification-4)

`npx vitest run src/ai` after wiring:
```
 Test Files  10 failed | 61 passed (71)
      Tests  21 failed | 535 passed (556)
```
Baseline (pre-change, same worktree): 10 failed | 59 passed (69); 21 failed | 508 passed (529). Exactly the
post-AI-15 baseline: same 10 failing files, same 21 failing tests, +2 new green files / +27 new green tests,
no new failing files. Failing files (identical before/after): AgentOrchestrator.bypass, AgentOrchestratorForwarding,
AgentOrchestrator.golden, AgentOrchestrator.goldenWithSeeds, AgentOrchestrator.tubeGate, ChatbotCompileDeckSlot,
chatbotCompile.e2e, InferenceClient.config, materialFollowUp, submitSuggestionTool.tubeSchema.

## Typecheck (verification-5)

`npm run typecheck -w server` -> 33 error lines (grep -c "error TS" = 33), identical per-file counts to the
pre-change baseline (diff of per-file counts: empty). ZERO errors in shadowRouterAdapter.ts,
AgentOrchestrator.shadowRouter.test.ts, shadowRouterAdapter.test.ts, server.ts. AgentOrchestrator.ts carries the
same 8 pre-existing errors as baseline (MaterialProfileRegistry API + one union mismatch), line-shifted only.

## Diff stat (verification-6)

```
 server/src/ai/AgentOrchestrator.ts                  | 43 +++++++++++++++++++
 server/src/ai/AgentOrchestrator.shadowRouter.test.ts | ... (new)
 server/src/ai/shadowRouterAdapter.ts                 | ... (new)
 server/src/ai/shadowRouterAdapter.test.ts            | ... (new)
 server/src/server.ts                                 | 10 +++++-
```
(see commit for exact counts; only in-scope files + this report; node_modules/symlinks untouched, never `git add -A`.)

## Construction-site citation

`server/src/server.ts:1068` — `const orchestrator = createAgentOrchestrator(...)`; shadow block added at
:1073-1081 via the existing deps object. Cited in code comments at AgentOrchestrator.ts deps declaration and at
the shadowSetup block.

## Assumptions (explicit)

1. DEFAULT_SHADOW_TIMEOUT_MS = 8000 — value: the documented config default from config/types.ts
   ShadowRouterConfig.timeoutMs ("default 8_000"). Why no source provided it: the §3 loader validates the field's
   TYPE but does not materialize the default; the adapter is the first consumer that needs a concrete number.
   Where it lives: shadowRouterAdapter.ts (single constant). Reversible: yes (one line; could move to loader).
2. bigModelLatencyMs = the orchestrator's per-run `elapsed` (Date.now() - t0 at the branch's done-log). The
   orchestrator already tracks turn latency; spec says pass it when tracked. Reversible: omit the field instead.
3. Router turn text = `effectivePrompt` (prompt + appended clarification answers) — the orchestrator's own view of
   the user turn. Reversible: swap to raw `prompt` in shadowRoute().
4. event_graph authoritative mapping: reaching the draft path means agent_intent matched none of the three
   explicit branches (spec orientation line 14). Reversible: mapping is one call-site argument.
5. `deps.fetch` optional override (default globalThis.fetch) — needed so the orchestrator suite can spy router
   fetch without stubbing globals. Production never passes it. Reversible.
6. NO lane config was changed: no `shadowRouter` block was added to any config.yaml. Production stays OFF
   (kill-switch default). The p95 measurement passed the endpoint as script argv, so no config points at
   appliance-2 from this change. Reversible: adding the block is pure DATA.
7. Report committed on the worker branch at the repo-relative path (see note above) rather than written
   untracked into the cl-integration-2 checkout, to keep ONE commit + clean merge.

## Reviewer-bait self-check

- S1: no `await` of the router anywhere in the dispatch path; wrapper returns void; hang test proves it.
- S2: all four call sites sit AFTER the authoritative branch resolved (after done-log, before return).
- S3: telemetry receives only whitelist classification facts; tests assert the turn text never appears in the file.
- S4: one timer only — AbortController on config timeoutMs (documented default).
- S5: zero hardcoded hosts/ports in committed code (tests use RFC-2606 `.invalid` hosts; the real endpoint lives
  only in script argv / config DATA).
- S6: selectSubmitCall, branch order, dispatch logic untouched — wiring only (diff shows additive lines only).

DONE

Summary:
- Files: server/src/ai/shadowRouterAdapter.ts (new), shadowRouterAdapter.test.ts (new, 21 tests),
  AgentOrchestrator.shadowRouter.test.ts (new, 6 tests), AgentOrchestrator.ts (wiring: deps seam :906-916,
  shadowSetup :941-955, shadowRoute :1050-1068, call sites :1959/:1994/:2046/:2542), server.ts (:1068 construction
  site, block :1073-1081).
- Tests: 27/27 new green; src/ai suite at exact baseline (10 failed files / 21 failed tests) + new green;
  typecheck 33 error lines, zero in new files.
- Real p95: 159 ms (60 calls, 0 failures, 2026-10-06 12:53 EDT) — §2 latency gate met.
- Open finding for orchestrator: router pick AGREEMENT is poor with the current prompt (42/60 parse_failure on
  real endpoint) — corpus will show it; prompt iteration is a separate item.
