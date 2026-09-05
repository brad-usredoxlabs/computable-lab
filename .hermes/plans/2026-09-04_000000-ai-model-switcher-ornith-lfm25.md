# AI Model Switcher: Ornith + lfm2.5 profiles in computable-lab

Date: 2026-09-04
Owner: architect-ds4 (self-directed; delegated 27B investigation failed this session)

## Goal / requirements (from Brad)

1. Connect the **one-shot local protocol compiler** to the **Ornith** model.
2. Add a **switcher to the AI chatbox** so Brad can toggle between **lfm2.5 on
   127.0.0.1:8899** and **ornith on appliance-2:11434** while chatting.

## Environment facts (verified this session)

- **ornith** = `ornith-ai/Ornith-1.5-35B-A3B-GGUF` (post-trained Qwen3.6-35B-A3B),
  served on **appliance-2 at `http://appliance-2:11434/v1`**, model alias
  `ornith-1.5-35b-a3b` (from cl-appliance `host_vars/appliance-2.yml`).
- **lfm2.5** = `LFM2.5-2.6B-Q4_K_M.gguf` served **locally on `127.0.0.1:8899`**
  (beellama.cpp llama-server, `--reasoning off`). Its `/v1/models` id is the
  bare gguf basename-less path — the full path `/home/brad/models/lfm2.5/LFM2.5-2.6B-Q4_K_M.gguf` is what llama-server reports as the model id.
- **computable-lab config.yaml** currently points `ai.inference` + `ai.extractor` at
  `http://appliance-2:8080/v1`, model `qwen3.8-27b`. **No profiles defined.**
- The server ALREADY supports **named AI profiles** end-to-end:
  - `AIConfig.profiles` + `activeProfile` (config/types.ts `resolveAiProfile`)
  - `ConfigHandlers` `listAiProfiles` / `saveAiProfile` / `activateAiProfile` / `deleteAiProfile`
  - routes: `GET/PUT/DELETE /config/ai/profiles(/...)`, `POST .../:name/activate`
  - `activateAiProfile` copies the profile's inference+agent into top-level
    `ai.*`, sets `activeProfile`, writes config.yaml, and calls `onConfigUpdate`
    → `initializeAiRuntime(updated)` which **hot-rebuilds the InferenceClient +
    orchestrator** at the new baseUrl/model. So switching is LIVE (no restart).
  - frontend `apiClient` already has `listAiProfiles` / `saveAiProfile` /
    `activateAiProfile`.
  - **Gap:** NO frontend UI consumes these methods — no switcher widget exists.

## Design decisions

- Model switching is **per-profile activation**, reusing the existing (working,
  server-side, hot-reload) machinery. Do NOT add per-request model override.
- The "AI chatbox" = the `AiTabPanel` (workspace right-pane AI tab). Add the
  switcher to THAT panel's header.
- The "one-shot local protocol compiler" (the `runChatbotCompile` pipeline /
  AI chat) already routes all LLM traffic through the single `inferenceClient`
  + orchestrator that `initializeAiRuntime` rebuilds on profile activation.
  ⇒ Activating the `ornith` profile makes BOTH the chatbox AND the one-shot
  compiler use Ornith. Satisfies requirement 1 through the same mechanism.
- **Default active profile = `ornith`** (requirement 1 = compiler should use
  Ornith by default). lfm2.5 is available as the other choice.
- Keep `ai.extractor` at its current qwen3.8-27b endpoint? EXTRACTOR is a
  separate config (`ai.extractor`), NOT swapped by profile activation
  (activation only touches top-level `inference`/`agent`). Leave extractor as
  configured — it's for PDF/prose extraction, not the compiler/chat. NOTE:
  `ai.inference` top-level gets overwritten by activation, so its old value is
  replaced by whichever profile is active. Initial config below sets it to the
  ornith profile values so boot matches the intended default.

## Implementation

### Phase 1 — Define profiles in config.yaml (+ example)
Add under `ai:` (keep `extractor` + `warmup` as-is):
```yaml
  activeProfile: ornith
  profiles:
    ornith:
      inference:
        provider: openai-compatible
        baseUrl: http://appliance-2:11434/v1
        model: ornith-1.5-35b-a3b
        temperature: 0.1
        enableThinking: false
      agent:
        maxTurns: 15
        historyTurns: 4
    lfm2.5:
      inference:
        provider: openai-compatible
        baseUrl: http://127.0.0.1:8899/v1
        model: /home/brad/models/lfm2.5/LFM2.5-2.6B-Q4_K_M.gguf
        temperature: 0.1
        enableThinking: false
      agent:
        maxTurns: 15
        historyTurns: 4
```
Mirror in `config.example.yaml` (documented, not enabling).
Acceptance: `GET /api/config/ai/profiles` lists both with ornith active.

### Phase 2 — Frontend model switcher in AiTabPanel header
Add a small `ModelSwitcher` component (in `right-pane/ai/`):
- On mount: `apiClient.listAiProfiles()` → select the `activeProfile`.
- Render a compact `<select>` labelled with the active model name in the panel
  header row (next to `WarmIndicator`).
- On change: `apiClient.activateAiProfile(name)` → update local active state.
  Show a brief "switching…" / error state; refetch model list after activation.
- Style with `--cl-*` tokens in `ai.css` (`.ai-tab__model-switch`).
Acceptance: selector present + live-verifiable in browser; toggling calls
activate endpoint; active matches config.

### Phase 3 — Tests + typecheck + commit
- Add/adjust `AiTabPanel.test.tsx` (mock `apiClient.listAiProfiles`/
  `activateAiProfile`, assert the select renders + calls activate).
- `npm run typecheck -w app`, `npm run test:unit -w app`
  (run from `app/` cwd per vitest worktree pitfall).
- Commit meaningful.

## Live verification (blocked partly this session)
- app dev server (Vite 5174) + backend (3001) must be running; use a
  browser-reviewer pass. Confirm served module contains the switcher and the
  selector shows ornith active.
- Toggling lfm2.5 → API call hits activate → aiStatus reflects new model.
- Note: appliance-2 probing was gated this session (network blocked); verify
  ornith reachability when the user's environment allows. lfm2.5 is local and
  was confirmed reachable (curl /v1/chat/completions returned a response).

## Open considerations
- The model id for lfm2.5 is the FULL gguf path (llama-server defaults to that
  when no alias). If reliability is an issue, serve it with `--alias lfm2.5` on
  that llama-server and use `model: lfm2.5` here.
- Reasoning: lfm2.5 runs `--reasoning off`; ornith is a thinking-arch model but
  the compiler/chat force `enableThinking:false` per request anyway. Both
  profiles set `enableThinking: false` at inference-config level for JSON
  output (matches existing Qwen practice).