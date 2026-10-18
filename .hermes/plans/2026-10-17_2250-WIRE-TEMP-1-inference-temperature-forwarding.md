# WIRE-TEMP-1 — InferenceClient must forward the declared temperature (spec)

Lane 2 | owner: cl-coder | minted by architect decision
.hermes/plans/decisions/W28-A5d-reshoot-mint-idempotency-decision.md (V7, Q2, Q3, Q4;
task "WIRE-TEMP-1"). Orchestrator re-verified every load-bearing citation FIRST-HAND at
trunk 032b4af1 before dispatch (2026-10-17T22:45 EDT). Server-only — NO browser gate.

## Why

The scientist-intent one-shot (the spine's determinism-critical call) declares
`temperature: 0` — and the wire never sees it. `toInferenceConfig` returns
`temperature: 0` (server/src/api/handlers/IntentCompileFromPromptHandlers.ts:82) and it
flows into `createInferenceClient(toInferenceConfig(deps, ctx))` (:336), but
server/src/ai/InferenceClient.ts NEVER reads `config.temperature`: the factory
destructures only `{apiKey, timeoutMs, streamIdleTimeoutMs, streamMaxMs, enableThinking}`
(:55-65 — orchestrator-verified: `grep -n temperature InferenceClient.ts` = EMPTY) and
`normalizeRequest` (:86-110) builds the body from REQUEST fields only. The call site
`compileFromSmallLlm` builds `baseRequest` = {model, messages, max_tokens} with no
temperature (server/src/compiler/scientistIntent/intentCompile.ts:249-269 — verified).
Net: the one-shot runs at the serving stack's DEFAULT SAMPLING. This is the code not
following declared data, and the A5d gate's 8/8-draw noun drift (identical prompt +
answers, different unresolved arrays per draw) is its observed cost.

The precedent shape already exists in-repo: the chat path forwards it per request
(server/src/ai/AgentOrchestrator.ts:1857 `temperature: inferenceConfig.temperature ??
0.1`).

## Scope (exactly this, nothing more)

In server/src/ai/InferenceClient.ts:
- Capture `temperature` from the config in the factory destructure (alongside
  enableThinking).
- In `normalizeRequest`, forward `config.temperature` into the request body WHEN the
  per-request body does NOT already set it. Request-level values keep winning on
  collision — this is the EXISTING documented merge doctrine (:83-85 comment:
  "Request-level values win on key collision so callers can override per-call"),
  mirroring how `enableThinking` is resolved (`requestEnableThinking ?? enableThinking`,
  :89).
- Apply to BOTH arms of normalizeRequest (OpenRouter and local/open-compatible). For
  the local arm the natural shape is including it in the spread via the same ??-fall
  used for enableThinking; for the OpenRouter arm the same `?? ` precedence into
  `cloud`-derived body. Absent-on-both sides must stay ABSENT in the body (never send
  `temperature: undefined` — exactOptionalPropertyTypes is on for the backend: optional
  means absent OR value, never undefined).
- ZERO new policy values: the client only forwards what the config data already
  declares. No call-site changes required (compileFromSmallLlm needs no edit — config
  carries it). If you believe a call-site change is needed, STOP and report; do not
  invent values.

## Non-goals / out of scope

- No changes to intentCompile.ts, IntentCompileFromPromptHandlers.ts, AgentOrchestrator,
  or any prompt. No behavior change when no temperature is declared (byte-stable).
- No top_p/seed/sampling knobs — temperature ONLY (it is the declared value).
- No app/ changes. No YAML changes. No MINT-IDEM-1 territory (separate task).

## Acceptance criteria (RED-first)

1. New/extended pin file (follow existing InferenceClient test conventions; if none
   exists beside the client, server/src/ai/InferenceClient.temperature.test.ts is the
   canonical name): using the existing mocked-fetch/mocked-transport pattern the repo
   already uses for this client (inspect neighboring tests first; do not invent a new
   harness if one exists):
   - declared config.temperature=0 + request without temperature -> serialized body
     contains `"temperature": 0` (NOT absent — 0 is falsy, a `??`/`||` bug dies here);
   - declared config.temperature=0 on the OpenRouter arm -> same assertion for that
     body;
   - config without temperature + request without temperature -> body has NO
     temperature key;
   - request-level temperature=0.7 + config.temperature=0 -> body carries 0.7
     (request wins);
   - config temperature only + second complete() call -> still forwarded (no
     one-shot state).
2. `npm run test:run -w server` targeted: the new file + every existing test file that
   exercises InferenceClient (enumerate: `rg -l InferenceClient server/src`) green;
   zero NEW failing files vs the pre-change baseline on the same worktree.
3. `npm run typecheck -w server`: no new type errors (lane baseline is 0 at the current
   trunk; keep it 0).
4. Report written to the UNIQUE deliverable path below: what changed, test output,
   typecheck output, and any assumption made.

## Reviewer-bait (the shortcuts an adversarial reviewer must reject)

- Adding `temperature` to `baseRequest` in intentCompile.ts (call-site patch instead of
  the client seam — leaves every other consumer of declared config still broken).
- `temperature: config.temperature ?? undefined` or any write of explicit undefined
  into the body (breaks absent-stays-absent + exactOptionalPropertyTypes).
- Forwarding without the request-level-wins precedence (a hardcoded zero would override
  the chat arm's per-call 0.1 if that path ever routes here).
- Forwarding other sampling params "while in there" (scope violation, undeclared values).
- Editing prompts, goldens, or the A5d fixture to make the gate look deterministic.

## Environment facts

- Trunk worktree (integration target): /mnt/vast/home/brad/git/cl-integration-2,
  branch cl/integration-2, tip 032b4af1 at spec time. Worker works in its OWN worktree
  branched off that tip; all git via `git -c core.fileMode=false` (NFS mode-bit noise).
- Lane stack backend :3093 / frontend :5193 (do not restart; TS-only change; do not
  touch :3001/:5174).
- Full server suite carries ~89 pre-existing failing files at base — NOT your gate;
  gate = targeted suites + at-base comparison for any file you touch.

COMPOSED-BY: orchestrator l2t2155 (l2t2245 promotion). ARCHITECT SOURCE:
W28-A5d-reshoot-mint-idempotency-decision.md (adopted after first-hand V7/precedent
verification by the orchestrator).
