# PROTO-AI-12 spec — Router spike: serve LFM2.5-350M on appliance-2, pre-registered gate, log-only shadow

Lane 2 · campaign `ai-protocol-edit-and-router` · dep PROTO-AI-7 (NOT yet merged) · **requires Brad's
signature on §2 BEFORE §4 begins** (see the decision artifact named below).
Branch off `cl/integration-2` in your OWN worktree. ONE worker on this item.

> This document IS the pre-registration. Per D5 the thresholds below are fixed BEFORE any shadow
> evidence is collected; changing them after evidence is a re-registration and needs Brad again.

## Goal
Settle the router question with CL's own measured data. Four parts: (1) serve LFM2.5-350M on the
APPROVED host appliance-2 (CPU); (2) pre-register the evaluation spec (this doc, §2); (3) append-only
paired telemetry with a kill-switch whose MISSING config = OFF; (4) a log-only shadow adapter at the
intent dispatch site — the big model keeps FULL authority, the tiny model never drafts payloads and
never writes records.

## Orientation — verified anchors (orchestrator read on trunk `883155ea`; confirm by reading)
- **Dispatch site (PART 4 hook)**: `server/src/ai/AgentOrchestrator.ts` — the `AGENT_INTENT_TOOL_NAME`
  branch (`:1845`); `create_record` at `:1853`, `deck_layout` at `:1892`. The four intents are
  `event_graph | deck_layout | create_record | protocol_edit` (the last added by PROTO-AI-7). The
  router classifies over exactly these four. Fire the shadow on the SAME turn, never awaited for the
  dispatch decision.
- **Turn correlation id**: `AgentOrchestrator.ts:921` mints `traceId()`; it is logged as
  `[agent ${tid}]` (`:1015`) and rides each `AgentSummary.traceId`. **Reuse `tid` as the correlation
  id** — do not mint a second one.
- **Endpoint config surface**: `InferenceConfig` in `server/src/config/types.ts:213`
  (`provider?`, `baseUrl`, `model`, `apiKey?`, `timeoutMs?`, `maxTokens?`, `temperature?`, …);
  profiles resolved by `resolveAiProfile` (`:204`). The named-profile pattern
  (`ai.profiles.<name>.inference`) already exists and is exemplified in `config.example.yaml:147-165`
  (an existing `lfm2.5` example profile points at a gguf path on `:8899`). **The router endpoint +
  kill-switch are DATA here — a new `AIConfig` field, never a hardcoded URL.**
- **Append-only durable log precedent (PART 3 destination)**: the foundry job managers write
  append-only JSONL under a job root — `EventEditorFixItJobManager.ts:150` and
  `FoundryAcquisitionJobManager.ts:107` (`eventsPath: join(jobRoot, 'events.jsonl')`), appended via
  `appendEvent`. **Mirror THIS pattern** (append-only JSONL at a configured path); do NOT invent new
  infra. Do not write into the record store.
- **Prompt / payload boundary**: telemetry records carry NO raw prompts and NO payloads (hard
  boundary). Only ids, picks, versions, latencies, error class.

## §1 — SERVING (host appliance-2, CPU — D6)
- Serve `LiquidAI/LFM2.5-350M` GGUF via llama.cpp (or Ollama) on appliance-2, CPU, a NEW port.
  NEVER displace an existing model service; NEVER touch thunderbeast `:8080` or the dev host `:8080`.
- Record: runtime + version, artifact digest (sha256 of the GGUF), the port, warm/cold latency.
- Capture the model's ACTUAL output framing. LFM natively emits bracket-notation calls —
  **the parser contract is part of the deliverable artifact**; record real example completions.
- Proof: repeated `curl` against the endpoint, cold + warm latency logged in the handoff.

## §2 — PRE-REGISTERED EVALUATION (fixed before any shadow evidence; Brad signs)
- **Metrics**: overall agreement + `protocol_edit`-class agreement vs the big model's authoritative
  pick (the big model's emitted `intent` on the same turn is the reference).
- **Thresholds**: overall ≥ **95%**; `protocol_edit`-class ≥ **98%**.
- **Denominators**: include timeouts, abstentions AND parse-failures in the denominator. A parse
  failure counts AGAINST; it is never skipped.
- **Minimum sample size**: pre-register it here — default **≥ 500 paired turns** with ≥ **50**
  `protocol_edit` turns; if fewer than the minimum are available, the verdict is INSUFFICIENT
  (never PASS). Brad may set the number at sign-off.
- **Confusion matrix** per intent (4×4).
- **Budget**: CPU latency (per pick) + shadow overhead (added wall-time on the turn; must not make
  chat feel unsnappy). Record a numeric ceiling at sign-off.
- **Correctness spot-checks use human-labelled fixtures — NEVER an LLM judge** (standing posture).
- Brad signs this § before §4 starts. Sign-off recorded in the decision artifact (below).

## §3 — TELEMETRY (paired, append-only)
- Append-only paired records, one per shadowed turn:
  `{ turn correlation id, router_pick, authoritative_pick, router model version, big model version,
  router latency ms, big-model pick latency ms, error class }`. NO raw prompts, NO payloads.
- Destination: an append-only JSONL path, configured (mirror the foundry `events.jsonl` pattern).
- **Kill-switch**: a config flag; **MISSING config = OFF**. Telemetry failure can NEVER alter the
  user-visible result (the shadow is fire-and-forget and its errors are swallowed to the log).

## §4 — SHADOW ADAPTER (log-only)
- At `AgentOrchestrator.ts:1845`, fire the router on the SAME turn; **never awaited** for the
  dispatch decision; the big model keeps FULL authority.
- Classification-only over the four intents; **zero write path**; timeout-safe (a router timeout or
  malformed output cannot change the user-visible result).
- The tiny model NEVER drafts payloads and NEVER writes records in this campaign.

## Scope / ownership
- `server/src/ai/` — shadow-router module (+ tests).
- `server/src/config/types.ts` (+ loader) — the router endpoint + kill-switch fields (DATA).
- appliance-2 serving notes under `.hermes/plans/`.
- Do NOT touch the record store, the schema envelope, the applier, or any app/ UI.
- Do NOT resurrect any prior LFM2.5-* scratch profile as a second forced tool.

## Acceptance criteria (VERIFY, do not assert)
- Serving proven by repeated `curl` (cold + warm latency logged in the handoff).
- Pre-registration §2 signed by Brad BEFORE any shadow logging (approval quoted in the handoff).
- Integration test: correlated pairs logged for all four intents; dispatch behaviour bit-identical
  with the shadow ON vs OFF; a router timeout / malformed output cannot change the user-visible
  result; kill-switch proof (OFF ⇒ zero inference calls in the log).
- `npm run test:run -w server` targeted suites green; no NEW failures vs the trunk baseline.

## Deliverable (UNIQUE path)
- Worker report: `.hermes/plans/PROTO-AI-12-report.wip-<token>.md` (canonical name untouched).
- Serving notes: `.hermes/plans/PROTO-AI-12-serving-notes.md`.
- Commit on your branch `wt/PROTO-AI-12-lane2-<token>` off current `cl/integration-2` HEAD.
  Do NOT merge. Do NOT edit the task list.

## Notes / open items
- **Human gate**: `§2` (thresholds, minimum sample size, latency ceiling) requires Brad's signature
  before §4. Decision artifact:
  `/home/brad/.hermes/cl/lanes/2/decisions/PROTO-AI-12-prereg-approval.md` (watched).
- **Serving capacity note**: appliance-2 CPU already hosts the vision model; serving a 350M CPU model
  alongside must not displace it (D6). Confirm headroom before starting; report if it cannot be
  served without displacing a running service.
- **cl-scout caveat carried for the worker**: scout recon is SCREENING only; the anchors above were
  re-verified by direct reads.
- The task is `todo` (dep AI-7 unmet). No blocker recorded yet — it is dependency-gated, and the §2
  signature is not needed until §4.


## Addendum A — cl-scout orientation recon (SCREENING ONLY, orch 2026-10-04T21:26)
Two cl-scout runs landed after the spec was written; findings are screening, verify before relying.
### A1 config optional-boolean / kill-switch convention
- Type decl: `AppConfig` (server/src/config/types.ts:12) holds nested `corpus?: CorpusConfig` (:27); concrete optional boolean field `CorpusConfig.enabled?: boolean` (:64), doc "Master switch (default false). Can also be flipped via CLA_CORPUS_ENABLED."
- Loader/merge: deepMerge at server/src/config/loader.ts:118-142; `server: deepMerge(DEFAULT_CONFIG.server, partialConfig.server ?? {})` (:706). Absent key -> target default retained (:136-138); whole config.yaml missing -> `{ ...DEFAULT_CONFIG }` (:682). Corpus defaults `DEFAULT_CORPUS_CONFIG {enabled:false}` (CorpusClient.ts:52-55), resolver resolveCorpusConfig :61-70.
- Read site: `if (!config.enabled) return { ok:false, error:'corpus.disabled' }` (CorpusClient.ts:170). MISSING => false/off. THIS is the precedent for the router kill-switch field.
### A2 AgentOrchestrator test mocking (if §4 lands later)
- Contract `InferenceClient` (server/src/ai/types.ts:853-856): complete / completeStream.
- Fake = object literal with vi.fn(); streaming mock `completeStream: vi.fn(async function*(){ yield {id, choices:[{index:0, delta:{...}, finish_reason}]} })` (AgentOrchestrator.test.ts:10-23); passed as FIRST arg to createAgentOrchestrator(client, toolBridge, config, agentConfig, deps?) (:33-38).
- Existing protocol_edit suite `AgentOrchestrator.protocolEdit.test.ts` already present (PROTO-AI-7).
