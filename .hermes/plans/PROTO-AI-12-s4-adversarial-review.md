# ADVERSARIAL REVIEW — PROTO-AI-12 §4 (lane 2) shadow-router adapter

Reviewer: cl-adversarial-reviewer (deepseek/deepseek-v4.1-flash, decorrelated from coder).
Item: PROTO-AI-12 §4 — log-only shadow-router classification telemetry at the submit-selection site.
Worktree: /mnt/vast/home/brad/git/wt/PROTO-AI-12-4-lane2-l2t1225
Branch: wt/PROTO-AI-12-4-lane2-l2t1225, HEAD f472f0c5daeb71f9603e8fdc6839012c4c6d7fa4, base 7c418e36.
Spec: /mnt/vast/home/brad/git/cl-integration-2/.hermes/plans/2026-10-06_1152-PROTO-AI-12-s4-shadow-adapter.md
Coder report: found at worktree-relative .hermes/plans/PROTO-AI-12-s4-report.wip-l2t1225.md (committed on the branch; NOT at the cl-integration-2 path named in the task — the report documents this deliberately).

Static review only. Nothing changed.

## Commands I ran (real output)

1) Diff scope
  git -C <wt> -c core.fileMode=false diff 7c418e36...HEAD --name-only
  -> .hermes/plans/PROTO-AI-12-s4-report.wip-l2t1225.md
     server/src/ai/AgentOrchestrator.shadowRouter.test.ts
     server/src/ai/AgentOrchestrator.ts
     server/src/ai/shadowRouterAdapter.test.ts
     server/src/ai/shadowRouterAdapter.ts
     server/src/server.ts
  git ... --shortstat -> 6 files changed, 1235 insertions(+), 2 deletions(-)

2) Targeted tests (spec Verification-1)
  cd <wt>/server && npx vitest run src/ai/shadowRouterAdapter src/ai/AgentOrchestrator.shadowRouter
  -> " ✓ src/ai/shadowRouterAdapter.test.ts  (21 tests) 308ms"
     " ✓ src/ai/AgentOrchestrator.shadowRouter.test.ts  (6 tests) 555ms"
     " Test Files  2 passed (2) / Tests  27 passed (27)"
  27 green, matching the coder claim.

3) Typecheck (spec Verification-5)
  cd <wt>/server && npm run typecheck 2>&1 | grep -c "error TS"  -> 33
  grep new/touched files for "error TS"                          -> ZERO
  grep AgentOrchestrator.ts for "error TS"                       -> 8 (pre-existing, line-shifted)
  server/tsconfig.json:13 "exactOptionalPropertyTypes": true

4) Out-of-scope byte-unchanged (spec §Files OUT OF SCOPE)
  git ... diff 7c418e36...HEAD --name-only -- server/src/ai/shadowTelemetry.ts server/src/config/loader.ts
       server/src/ai/selectSubmitCall.ts server/src/ai/submitSuggestionTool.ts | wc -l  -> 0
  server/prompts/*, server/src/schema/* not in the diff at all.

5) Hardcoded host/port in code (S5)
  git ... diff 7c418e36...HEAD -- server/ | grep -nE "appliance-2|8900|127\.0\.0\.1|localhost|10\.[0-9]|192\.168|http://[0-9]"
  -> NONE. (The only "appliance-2:8900" strings are prose in the committed report and a pre-existing
     doc-comment in config/types.ts:221, which is NOT in this diff.)

6) No await of the router (S1)
  grep -nE "await\s+shadowRoute|await\s+shadowRouteIfNeeded" server/src/ai/*.ts -> NO MATCHES
  grep -n "shadowRoute" AgentOrchestrator.ts -> 1 definition (:1060) + exactly 4 call sites
     (:1959 create_record, :1994 deck_layout, :2046 protocol_edit, :2542 event_graph).

7) One commit / no node_modules tracked
  git log 7c418e36..HEAD --oneline -> single commit f472f0c5.
  git show --name-only HEAD | grep -i node_modules -> none.

8) Live tree untouched
  git -C /mnt/vast/home/brad/git/computable-lab status --porcelain | grep -iE "shadow|router|PROTO-AI-12|lane2"
  -> only "?? server/src/ai/InferenceClient.openrouter.test.ts" (a different lane's untracked file, NOT this item).

9) Real-endpoint p95, independent reproduction (spec Verification-3)
  curl -s -m 5 http://appliance-2:8900/health -> {"status":"ok"} (endpoint UP).
  /tmp/adv-review-p95.mjs (my own script, mirrors the adapter prompt + parseShadowRouterPick), 55 calls:
  -> { n:55, fail:0, min:118, median:134, p90:150, p95:157, max:173,
       tally:{ parse_failure:41, create_record:14 } }
  Coder claimed p95=159 ms. My independent p95=157 ms — confirms the gate (<=2000 ms) AND confirms the
  coder's honest corpus-quality finding (the 350M model mostly echoes the token list; agreement is poor).

## Acceptance criteria (verbatim from spec line 36) and how each was checked

> §4: integration test — correlated pairs logged for all four intents,
- CHECKED: AgentOrchestrator.shadowRouter.test.ts:215 "four intents -> four paired telemetry lines";
  asserts correlationId set == the four captured tids, authoritativePick == the executed branch,
  routerPick from the spy, one router call per turn (fetchSpy called 4x). PASS.

> dispatch behaviour bit-identical with shadow on/off,
- CHECKED: test at :256 runs each of the 4 intents twice (OFF vs ON), asserts on.events deep-equals
  off.events and canonicalize(on.result) deep-equals canonicalize(off.result). Real comparison, not a
  tautology: canonicalize only drops eventId/actionGroupId/timestamp (per-run volatile). PASS.

> router timeout/malformed output cannot change user-visible result;
- CHECKED: integration test at :306 proves a failing fetch leaves onEvent + result identical while one
  telemetry line with errorClass=network lands. Timeout is integration-covered by the S1 hang test at :334
  (hanging fetch, result still correct). Malformed output -> parse_failure is unit-covered
  (shadowRouterAdapter.test.ts). Structurally independent: the wrapper returns void, classify never throws.

> kill-switch proof (off -> zero inference calls in log);
- CHECKED: tests at :277 (no config) and :289 (enabled:false) both assert fetchSpy not called AND
  events.jsonl never created. The enabled:false case injects the spy through deps, so the assertion is real.

> p95 pick latency <= 2000 ms measured on appliance-2 CPU and logged in the handoff.
- CHECKED: report logs 159 ms; I independently measured p95=157 ms against the live endpoint (see #9). PASS.

## Attack-surface findings

S1 server.ts wiring-only: CONFIRMED. The hunk (server.ts:1073-1081) only spreads
   `...(appConfig?.ai?.shadowRouter ? { shadowRouter: ... } : {})` into the existing placeholderDeps object
   passed to createAgentOrchestrator. No dispatch logic, no shadowRoute call site there.
S2 no await leak / no unhandled rejection: CONFIRMED. shadowRouteIfNeeded returns void and chains
   `void classify(...).then(record).catch(()=>{})`. All 4 orchestrator call sites are un-awaited. The
   AbortController is the only timer (config timeoutMs). The S1 hang test is real: timeoutMs=5000 hang,
   deck_layout turn completes, asserts elapsed<2000 and the correct variantId.
S3 branch order untouched / once per turn: CONFIRMED. selectSubmitCall.ts and branch order are byte-unchanged
   (0-line diff). Each of the 3 agent_intent branches calls shadowRoute immediately before its `return`, and
   the draft path calls it once at :2542 before its `return result` at :2565. The three branches return, so a
   turn cannot reach two sites. No branch reads shadow state (shadowRoute's return is void and discarded).
S4 prompt text into telemetry: CONFIRMED SAFE. The router's response is used only as routerPick fed to
   telemetry.record; it is never interpolated into a prompt or an onEvent. effectivePrompt is sent to the
   router truncated to 400 chars; telemetry carries only the whitelist facts. Tests assert the turn text
   never appears in the telemetry file.
S5 no hardcoded host: CONFIRMED. Zero hosts/ports in the server/ diff. resolveShadowRouterConfig returns
   null when baseUrl/model are absent — there is no default endpoint, so missing config is structurally OFF.
S6 bit-identical tests real: CONFIRMED (see acceptance #2). Kill-switch tests assert zero fetch calls, not
   merely "no crash".
S7 scope: CONFIRMED. Exactly the 6 claimed files; prompts/, submitSuggestionTool.ts, schema/, loader.ts,
   shadowTelemetry.ts all byte-unchanged. Report committed in-worktree (docs, allowed). No new tracked
   node_modules paths.
S8 writer: CONFIRMED. The adapter uses the existing §3 shadowTelemetry writer (createShadowTelemetryWriter /
   shadowTelemetryWriterFromConfig); it invents no parallel channel and writes no records/files itself.
S9 exactOptionalPropertyTypes: CONFIRMED. tsconfig has it true; new files carry ZERO type errors;
   bigModelLatencyMs/errorClass are conditionally spread (absent OR value). The `: undefined` occurrences at
   adapter:179-180 are locals, not optional-property assignments.

## Non-blocking observations (NOT acceptance failures; no fix required)

O1. AgentOrchestrator.shadowRouter.test.ts:277 (no-config kill-switch): runTurn only injects `fetch: fetchSpy`
    when shadowRouter is truthy, so in the NO-config case the spy is never wired and
    `expect(fetchSpy).not.toHaveBeenCalled()` cannot fail from a shadow-call bug (the orchestrator would use
    globalThis.fetch). The sibling enabled:false test at :289 DOES wire the spy and asserts the same thing,
    so the spec's kill-switch criterion is genuinely proven; this one test is merely weaker than it looks.
O2. The acceptance phrase "router timeout/malformed output" is integration-proven for timeout (hang test) and
    network-fail, but malformed output -> parse_failure is unit-level only. Structurally safe (resolved value,
    never throws), so no user-visible risk.
O3. Report diff-stat says AgentOrchestrator.ts "43 +++" while the commit's --shortstat shows ~60 changed lines
    there. Documentation inaccuracy in the report only; the committed code is the final single commit.

## Verdict

No functional defect found. The four orchestrator call sites are correctly placed after authoritative branch
resolution, the call is fire-and-forget and fully swallowed, the kill-switch is structurally OFF with no
default endpoint, telemetry is whitelist-only via the existing §3 writer, out-of-scope files are untouched,
and the acceptance criteria (including the p95 gate, independently reproduced at 157 ms) are met.

VERDICT: accept