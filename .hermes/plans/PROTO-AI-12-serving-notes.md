# PROTO-AI-12 §1 — Serving notes (router spike, lane 2)

Campaign `ai-protocol-edit-and-router`. Worker: cl-senior, token l2t2031.
All numbers below are observed outputs from real curl calls (2026-10-04/05 EDT);
none are estimated.

## Artifact

- **Model**: `LiquidAI/LFM2.5-350M-GGUF` — **served artifact:
  `LFM2.5-350M-QAD-Q4_0.gguf` (219,312,832 bytes)**
  - sha256 `3d10b6ab8fc91a919534b9558e266255aca0bbc7f6d015963599aa9e74e05b1d`
  - path on appliance-2: `/home/brad/models/lfm2.5-350m/LFM2.5-350M-QAD-Q4_0.gguf`
  - downloaded from `https://huggingface.co/LiquidAI/LFM2.5-350M-GGUF/resolve/main/LFM2.5-350M-QAD-Q4_0.gguf`
- **Why the QAD variant**: the first-served `LFM2.5-350M-Q4_K_M.gguf`
  (sha256 `7e6f72643caafc9a68256686638c4d7916f2cec76d1df478d4c3ddcd95a6aed4`,
  still on disk) **does not reliably emit bracket-notation tool calls** — with
  native OpenAI `tools`, the spec-accurate system prompt, and `tool_choice:
  required`, it answered conversationally (with garbled pseudo-tool tags at
  `finish_reason=length`). The QAD (quantization-aware-distilled) checkpoint
  from the same repo emits the native bracket form (see Parser contract).
  The spec explicitly documents the QAD GGUF (`--hf-file
  LFM2.5-350M-QAD-Q4_0.gguf`); this stays within "fetch LiquidAI/LFM2.5-350M
  GGUF" — no different model was substituted.
- **No usable pre-existing LFM2.5-350M GGUF existed.** The dev host
  `/mnt/vast/home/brad/models/` carries only LFM2.5-**2.6B** variants (wrong
  size, out of spec), and the `config.example.yaml:163` example profile points
  at a `:8899` server + a 2.6B path that does not exist and is not running.
  appliance-2 had no LFM artifact before this task.

## Runtime + host

- Host: **appliance-2** (Tailscale `100.69.173.99`), CPU-only (decision D6).
- Runtime: **llama.cpp `llama-server` version 9450 (73eb521da)**, built with
  GNU 16.2.1, at `/usr/local/bin/llama-server`. (The box's build has a CUDA
  backend; with the vision/Qwen service occupying the GPU it dies with a CUDA
  OOM at load unless constrained — launched with `CUDA_VISIBLE_DEVICES=""
  --n-gpu-layers 0 --device none`, CPU pure.)
- Launch command (as run):
  `CUDA_VISIBLE_DEVICES="" llama-server --model
  /home/brad/models/lfm2.5-350m/LFM2.5-350M-QAD-Q4_0.gguf --host 0.0.0.0
  --port 8900 --ctx-size 8192 --threads 4 --temp 0.1 --top-k 50
  --repeat-penalty 1.05 --n-gpu-layers 0 --device none --jinja --alias
  lfm2.5-350m`
- **Port :8900** — new; nothing else listens on it (`ss -tln` confirmed before
  start). Health: `{"status":"ok"}`. Reachable from the dev host over
  Tailscale (`curl http://100.69.173.99:8900/health` → ok in ~9ms).
- **Capacity check (D6 constraint)**: appliance-2 has 12 cores, 31GB total /
  ~10GB available; the existing llama-server (Qwen3.6-35B vision service on
  :11434) was NOT displaced and load average is ~0. The 350M Q4 model loads in
  <1s with ~0.5GB RSS. No service was restarted or displaced.

## Latency (observed wall-time via `date +%s%3N` around curl)

Server freshly (re)started, health-ok, first completion = cold:

| call | ms |
|---|---|
| COLD (first completion after model load) | **76 ms** |
| WARM 1 ("Say OK", max_tokens=4) | 46 ms |
| WARM 2 | 47 ms |
| WARM 3 | 48 ms |

Earlier same-day Q4_K_M run (for reference): cold 132ms, warm 49–111ms on
classification prompts. Classification calls against the QAD artifact with a
tools payload land ~260–700ms round trip (e.g. 262ms, 268ms, 350ms, 517ms
observed) — well inside a shadow-path budget.

Server-side timings for a 5-token classification completion: prompt 100.7ms
(66 tok @ ~655 tok/s), decode 4.6 ms/token (~216 tok/s) on 4 CPU threads.

## Output framing / parser contract (REAL completions)

Native tool-call path: send OpenAI-style `tools` with `--jinja`; the GGUF's
chat template injects them as `List of tools: [<json>]` into the system block.

**Success shape** (observed verbatim, QAD artifact, `finish_reason:
"tool_calls"`):

```json
{"choices":[{"finish_reason":"tool_calls","message":{"role":"assistant","content":"","tool_calls":[{"type":"function","function":{"name":"classify_intent","arguments":"{\"intent\":\"create_record\"}"},"id":"P2RGulXB1VBt6tLNnlRxfMWlisvSgv85"}]}}]}
```

and the same generation surfaced as raw content (bracket notation is the
model's native surface form; llama.cpp parses it into `tool_calls` when it
matches the template):

```
<|tool_call_start|>[classify_intent(intent="event_graph")]<|tool_call_end|>
```

Observed real example (exact reply content, prompt
"I need to change the incubation step in my protocol to 37C for 2 hours"):
`tool_calls=[{"function":{"name":"classify_intent","arguments":"{\"intent\":\"create_record\"}"}}]`
— note: the 350M **misclassified** this as `create_record` where the
big-model reference is `protocol_edit`. (Exactly the kind of signal §2's
agreement gate measures; it is real evidence, not a defect of the serving.)

### Parser contract (for §4, when it is unlocked)

1. **Read `message.tool_calls[0].function.arguments` first.** When
   `finish_reason == "tool_calls"`, the pick is `JSON.parse(arguments).intent`.
2. **Fallback bracket parser on `message.content`**: native surface form is
   `[classify_intent({"intent":"<name>"} )]` — optionally wrapped in
   `<|tool_call_start|>…<|tool_call_end|>`, and arguments may appear as JSON
   (`{"intent":"event_graph"}`) or bracket-key style (`intent="event_graph"`).
   Regex: `\[\s*classify_intent\s*\(\s*(\{.*\}|[^)]*)\)\s*\]` then extract
   `intent` from either `{"intent":"X"}` or `intent="X"`.
3. **Anything else is a parse failure** — including refusal-style prose ("I
   don't have access to tools…"), which this model emits whenever it decides
   the request is not a classification task. Per §2 a parse failure counts
   AGAINST agreement (denominator includes it); the router pick maps to
   `parse_failure` in the telemetry record. Observed failure-mode content
   examples (verbatim, Q4_K_M and QAD): "I don't have access to tools that can
   modify lab protocols…" and, under `tool_choice:"required"`, garbled
   `<final_answer>…</final_answer>**}**}` tails at `finish_reason=length` —
   so **do not use `tool_choice:"required"`**; plain `tools` + auto is the
   serving contract.
4. Classification-only, single tool `classify_intent` with the four-intent
   enum (`event_graph | deck_layout | create_record | protocol_edit`).
   The router NEVER receives write tools and NEVER drafts payloads.

## Reproduction proof (observed)

- `curl http://127.0.0.1:8900/health` → `{"status":"ok"}` (repeatedly, cold
  poll loop + post-load).
- Cold/warm table above from a timed `date +%s%3N` bracketed curl sequence on
  appliance-2 (2026-10-05 00:58 local).
- Cross-host: `curl http://100.69.173.99:8900/health` from the dev host → ok.
- Server process on appliance-2: llama-server PID 201934 on :8900 at time of
  writing (started by this task; safe to kill, it is the ONLY thing on :8900).
