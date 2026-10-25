# WIRE-TEMP-1 — coder report (wip-l2t2315)

LANE 2 | worktree /mnt/vast/home/brad/git/wt/WIRE-TEMP-1-lane2-l2t2315
Branch wt/WIRE-TEMP-1-lane2-l2t2315 (off cl/integration-2 @ 26cf478c)
CODE COMMIT: dd32b7f3adf7ced7809e37f8221e2f28bf174f68
Spec: .hermes/plans/2026-10-17_2250-WIRE-TEMP-1-inference-temperature-forwarding.md

## 1. What changed

server/src/ai/InferenceClient.ts (+14 lines, the ONLY product file touched):
- :66-70 — factory destructure now captures `temperature` from config (alongside
  enableThinking), with a comment naming the drop.
- :92-96 — comment documenting the merge doctrine applied to temperature.
- :100 — `const effectiveTemperature = rest.temperature ?? temperature;` —
  request-level wins on collision, mirroring the existing
  `requestEnableThinking ?? enableThinking` at :99 (the :83-85 doctrine).
  `rest.temperature` is the request's own value (temperature is NOT destructured
  out of `rest`, so when a request sets it, it already flows through the `...rest`
  / `...cloud` spreads; the ??-fall only ADDS the config value when the request
  omits it — the written key then equals the request value, so precedence is exact).
- :107 — OpenRouter arm: `...(effectiveTemperature !== undefined ? { temperature: effectiveTemperature } : {})`
  into the cloud-derived body.
- :123 — local arm: same conditional spread after `...rest` / max_completion_tokens.
  Absent-on-both-sides writes NOTHING — never an explicit `temperature: undefined`
  (exactOptionalPropertyTypes is on, server/tsconfig.json:13).

server/src/ai/InferenceClient.temperature.test.ts (NEW, 183 lines, 10 pins) —
follows the existing mocked-fetch/captured-body pattern of
InferenceClient.config.test.ts and InferenceClient.openrouter.test.ts (no new harness).

NO call-site changes (intentCompile.ts untouched — config carries the value),
NO new policy values, NO top_p/seed/other sampling knobs, NO prompt/golden edits.
`grep -n temperature` on the product file before the change was EMPTY (spec claim
confirmed at 26cf478c).

## 2. RED evidence (new tests run against the UNMODIFIED product file)

$ npx vitest run src/ai/InferenceClient.temperature.test.ts
 Test Files  1 failed (1)
      Tests  4 failed | 6 passed (10)

Failures name the defect symptom, not test wiring:
- "local arm: declared config temperature 0 reaches the serialized body"
  -> AssertionError: expected false to be true  (`'temperature' in body` was false)
- "OpenRouter arm: declared config temperature 0 reaches the serialized body"
  -> AssertionError: expected false to be true
- "config temperature survives a second complete() call"
  -> AssertionError: expected undefined to be +0
- "streaming path forwards the declared config temperature as well"
  -> AssertionError: expected undefined to be +0

The 6 that already passed at base are the pins that must NOT regress
(absent-stays-absent x2 arms, request-level-wins x2 arms, falsy request 0 wins,
request-only 0.42 passthrough) — they prove the ??-precedence and
absent-stays-absent behavior was already correct for request-level values and
that my change only adds the config fall.

## 3. GREEN evidence (after implementation)

New file alone:
 Test Files  1 passed (1)
      Tests  10 passed (10)

Full targeted suite = every `rg -l InferenceClient server/src` test file (46)
+ the new file (47 total):
 Test Files  9 failed | 38 passed (47)
      Tests  11 failed | 377 passed (388)
     Errors  2 errors   (pre-existing unhandled-exception debt, present in BOTH runs)

## 4. Base-comparison evidence (zero-new-fail proof)

Base targeted run (same 46 files, product file UNMODIFIED, same worktree after
bootstrap):
 Test Files  9 failed | 37 passed (46)
      Tests  11 failed | 367 passed (378)
     Errors  2 errors

Normalized FAIL-file lists (grep '^ FAIL ' | sed strip ' > ...' AND ' [ ... ]'
variants | sort -u):
  base: 9 files  (/tmp/wt-base-failfiles.txt)
  head: 9 files  (/tmp/wt-head-failfiles.txt)
  comm -3 base head  -> EMPTY (identical sets)

The 9 pre-existing failing files (trunk debt, NOT my gate):
  src/ai/AgentOrchestrator.bypass.test.ts
  src/ai/AgentOrchestratorForwarding.test.ts
  src/ai/AgentOrchestrator.golden.test.ts
  src/ai/AgentOrchestrator.goldenWithSeeds.test.ts
  src/ai/attachedProtocol.test.ts
  src/ai/chatbotCompile.e2e.test.ts
  src/api/handlers/EventEditorFixHandlers.test.ts
  src/ingestion/vendor-protocol/Wave2SemanticFamilyPass.test.ts
  src/integration/Wave2SemanticPassE2E.test.ts
Test-fail counts identical base vs head (11 = 11); head gained exactly the 10 new
passing tests (367 -> 377).

## 5. Typecheck

Before (base, after bootstrap, before any edit): `npx tsc --noEmit` in server/ -> 0 errors.
After: `npm run typecheck -w server` -> exit 0, 0 errors.
Zero new type errors (lane baseline 0 kept at 0).

## 6. Assumptions

- AS-L2T2315-1: Fresh worktree bootstrap. The worktree had no node_modules,
  server/node_modules, or server/schema. package-lock.json sha256 verified
  IDENTICAL to cl-integration-2 (6068d633...), then symlinked root
  node_modules -> computable-lab/node_modules, server/node_modules ->
  computable-lab/server/node_modules, server/schema -> ../schema (worktree's own
  schema dir), per the lane-2 bootstrap precedent. Without this, npx resolved a
  wrong vitest 5.0.5 from the npx cache; after repair `npx vitest --version`
  = 1.6.1.
- AS-L2T2315-2: The 45 lane-excluded-but-present server sources in
  cl-integration-2 (untracked at tip) were copied into the worktree so tsc/vitest
  see the same source set as trunk. Verified lane-excluded in this worktree
  (git status shows only my 2 intended paths; copied files stay ignored).
- AS-L2T2315-3: `rest.temperature ?? temperature` (not a destructure of
  temperature out of req) is the minimal faithful expression of the :83-85
  "request-level values win on key collision" doctrine: the spread already
  carries the request value, and the later conditional spread only fills the key
  when the request omitted it. A request-level 0 therefore beats a config 0.7
  (pinned) — a plain `requestOrConfig` destructure-then-?? would behave
  identically; the chosen shape touches fewer lines.
- AS-L2T2315-4: The streaming path shares normalizeRequest via fetchCompletion,
  so the same fix covers it; pinned (streaming test) though the spec's pins are
  blocking-complete-centric.
- AS-L2T2315-5: Key ORDER in the body (temperature written after max_tokens /
  max_completion_tokens) is cosmetic — JSON semantics are order-independent; no
  existing test pins key order.
- AS-L2T2315-6: The "Errors 2 errors" line in both vitest runs is the known
  pre-existing unhandled-exception debt (identical in base and head runs); not
  chased per the fleet convention.

## 7. Reviewer-bait compliance

- No temperature added to baseRequest in intentCompile.ts (client seam only).
- No `?? undefined` / explicit-undefined write (conditional spreads; key-presence
  pins kill that shortcut).
- Request-level-wins precedence preserved (pinned both arms, incl. falsy-0 request).
- No other sampling params forwarded.
- No prompt/golden/A5d-fixture edits.

## 8. Status

Implementation complete; acceptance pending orchestrator verification.
Server-only change; no browser gate (per spec). Lane stack untouched.
