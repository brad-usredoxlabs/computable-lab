# PROTO-AI-12 report — WIP lane2 token l2t2031 (PARTIAL: §1 + §3 only)

Worker: cl-senior · branch `wt/PROTO-AI-12-lane2-l2t2031` off
`cl/integration-2` (base tip ec875fe8) · **commit `4748b1d77989d4e1748f77a7e001b3eec5ba19c2`**

Scope honored: §1 (serving) + §3 (telemetry + kill-switch) implemented. §2 is the
pre-registration document awaiting Brad's signature — untouched. §4 (shadow
adapter at AgentOrchestrator.ts:1845) deliberately NOT implemented;
`git show --name-only HEAD` proves AgentOrchestrator.ts is not among the changed
files. Record store, schema envelope, applier, app/ UI untouched. No merges.
No installs run.

## §1 — SERVING (appliance-2, CPU, D6) — DONE, proven by real curl evidence

- Artifact: **LFM2.5-350M-QAD-Q4_0.gguf** (219,312,832 B)
  sha256 `3d10b6ab8fc91a919534b9558e266255aca0bbc7f6d015963599aa9e74e05b1d`
  at appliance-2 `/home/brad/models/lfm2.5-350m/`
  (from huggingface.co/LiquidAI/LFM2.5-350M-GGUF).
  - Also fetched first: `LFM2.5-350M-Q4_K_M.gguf` sha256
    `7e6f72643caafc9a68256686638c4d7916f2cec76d1df478d4c3ddcd95a6aed4` — kept
    on disk, NOT the served artifact. Reason: Q4_K_M never produced a valid
    bracket/tool-call for the classification task (refusal prose; garbled tags
    under tool_choice=required — observed, logged in serving notes). The QAD
    checkpoint from the SAME official repo emits the native bracket form. Same
    model (LFM2.5-350M), variant chosen by measured behavior — not a
    substitution of a different model.
- Pre-existing artifact check: none usable. Dev host has only LFM2.5-**2.6B**
  GGUFs; the config.example.yaml:163 profile targets a nonexistent path on a
  :8899 server that is not running; appliance-2 had no LFM files.
- Runtime: llama-server **version 9450 (73eb521da)** (box build w/ CUDA backend;
  launched `CUDA_VISIBLE_DEVICES="" --n-gpu-layers 0 --device none` — the
  unconstrained launch CUDA-OOM'd because the existing vision/Qwen service
  holds the GPU; CPU-only launch succeeded).
- Port: **:8900** (new; `ss -tln` confirmed free; `:11434` vision service
  untouched and still healthy, no service displaced; 12 cores, ~10GB avail,
  load ~0, model RSS ~0.5GB, load <1s).
- Observed latency (timed curl, fresh server start, first call = cold):
  cold **76 ms**, warm **46/47/48 ms**; classification calls with a tools
  payload 262–700 ms wall. Cross-host reachability from dev host verified
  (`http://100.69.173.99:8900/health` → ok, and still ok at report time).
- Parser contract + real completions captured in
  `.hermes/plans/PROTO-AI-12-serving-notes.md` (worktree). Native success form:
  `finish_reason=tool_calls` with
  `tool_calls[0].function.arguments = {"intent":"create_record"}`; raw surface
  form `<|tool_call_start|>[classify_intent(intent="event_graph")]<|tool_call_end|>`.
  Failure mode is refusal prose → must map to `parse_failure`. Serving contract:
  plain `tools` + auto (never `tool_choice:"required"`).
  One honest data point: the 350M classified a protocol-edit request as
  `create_record` — exactly the disagreement signal §2's gate measures.

## §3 — TELEMETRY + kill-switch — DONE, RED-first

New files (owned paths only):
- `server/src/ai/shadowTelemetry.ts` — append-only JSONL writer mirroring the
  foundry precedent (`appendFile` of one JSON/line at a configured path —
  EventEditorFixItJobManager.ts:347-352 / FoundryAcquisitionJobManager.ts:255-259,
  anchor :107/:150 `eventsPath: join(jobRoot,'events.jsonl')`). No new infra,
  nothing near the record store.
  - Hard whitelist record shape: `{ ts, correlationId, routerPick,
    authoritativePick, routerModel, bigModel, routerLatencyMs,
    bigModelLatencyMs?, errorClass? }`. Fields outside the whitelist are
    DROPPED even if smuggled past the type contract (tested). NO prompts,
    NO payloads.
  - Kill-switch: MISSING config = OFF (block absent, `enabled` absent, or
    false ⇒ no-op, file never created — tested).
  - `record()` NEVER throws; write failures swallowed to `console.warn`
    (tested with an un-creatable path).
  - exactOptionalPropertyTypes respected: optional keys absent, never undefined.
- `server/src/ai/shadowTelemetry.test.ts` — 7 tests, written before the
  implementation (first run RED: module did not exist, file-level failure;
  then GREEN).
- `server/src/config/types.ts` — `AIConfig.shadowRouter?: ShadowRouterConfig`
  (optional block; precedent cited: optional boolean feature-flag
  `WarmupConfig.enabled` types.ts:187 and `ExtractorProfileConfig.enabled`
  :64/:99/:114) + new `ShadowRouterConfig` interface (enabled/baseUrl/model/
  timeoutMs/telemetryPath, ALL optional — DATA, never a hardcoded URL).
- `server/src/config/loader.ts` — optional-block validation in
  `validateAIConfig` mirroring the existing `warmup` block convention
  (loader.ts:331-356 → my block directly after, :359-379). Loader passes `ai`
  through after validation (loader.ts:726-741 `config.ai = partialConfig.ai`),
  so absent stays absent = OFF. +3 loader tests.

Config convention followed (file:line): optional-object validation pattern at
`server/src/config/loader.ts:331-356` (warmup), boolean-flag precedent
`server/src/config/types.ts:187` (`warmup.enabled?: boolean`, default false).

## Test / typecheck evidence

- Targeted GREEN: `npx vitest run src/ai/shadowTelemetry.test.ts --root server`
  → 1 file, **7/7 passed**. `npx vitest run src/config/loader.test.ts --root
  server` → 1 file, **12/12 passed** (9 pre-existing + 3 new).
- Full suite `npm run test:run -w server`:
  - BEFORE my changes: 124 failed | 486 passed | 9 skipped (619 files); 284
    failed | 4365 passed | 70 skipped (4936 tests). (Spec band said ~121-125
    failing files; 124 measured.)
  - AFTER: 124 failed | **487 passed** | 9 skipped (620 files); 283 failed |
    **4377 passed** | 70 skipped (4946 tests).
  - Failing-FILE set diff (`comm` on sorted FAIL-extracted file lists):
    **zero new failing files, zero changed** — identical 124-file set.
    +1 passed file = my new shadowTelemetry suite. (284→283 failed tests:
    1 pre-existing flake flipped pass-side, unrelated file; the FILE sets are
    byte-identical.)
- Typecheck `npx tsc --noEmit -p server/tsconfig.json`:
  **44 errors after, sorted-diff IDENTICAL to the pre-change baseline** (spec
  estimated ~33; measured 44 at this tip). Zero new errors introduced.

## Assumptions recorded (consequential)

1. QAD-Q4_0 chosen as the served quant within LiquidAI/LFM2.5-350M-GGUF after
   measured evidence that Q4_K_M cannot produce the bracket-notation contract
   the spec requires as part of the deliverable. Both digests recorded.
2. Telemetry destination is a configured `telemetryPath` (mirrors foundry
   job-root pattern); §4's wiring will supply it from config — no default path
   invented (absent path + enabled=true ⇒ writer stays OFF, tested-adjacent
   guard in `createShadowTelemetryWriter`).
3. Full-suite baseline measured at my worktree tip (ec875fe8 = cl/integration-2
   tip), not trunk `883155ea`; 124 failing files is within the spec's band.
4. Serving process left RUNNING on appliance-2:8900 (PID 201934 at report
   time) for §4's later use; it is the only listener on :8900 and safe to
   kill; :11434, thunderbeast :8080, dev-host :8080, lane stack :3093/:5174
   untouched throughout.

## Not done (by instruction, not by failure)

- §2 pre-registration signature: Brad's gate, artifact
  `/home/brad/.hermes/cl/lanes/2/decisions/PROTO-AI-12-prereg-approval.md`.
- §4 shadow adapter: gated on §2 signature; AgentOrchestrator.ts untouched.
- Acceptance items that depend on §4 (dispatch bit-identical ON/OFF,
  four-intent correlation integration test) cannot be produced before §4.

STATUS: done
branch commit sha: 4748b1d77989d4e1748f77a7e001b3eec5ba19c2 (branch wt/PROTO-AI-12-lane2-l2t2031, not merged)
test command: `npm run test:run -w server` → 124 failed | 487 passed | 9 skipped files (4946 tests: 283 failed | 4377 passed | 70 skipped); failing-file set identical to baseline (124 before / 124 after, zero new); targeted: shadowTelemetry.test.ts 7/7 pass, loader.test.ts 12/12 pass
typecheck: `npx tsc --noEmit -p server/tsconfig.json` → 44 errors, sorted-diff identical to pre-change baseline, zero new
serving: port 8900 on appliance-2 (llama-server v9450, CPU); artifact LFM2.5-350M-QAD-Q4_0.gguf sha256 3d10b6ab8fc91a919534b9558e266255aca0bbc7f6d015963599aa9e74e05b1d; observed cold 76ms, warm 46/47/48ms, classification-with-tools 262-700ms
