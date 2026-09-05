# Model Switcher (lfm2.5 ⇄ Ornith) + One-Shot → Ornith

Date: 2026-09-03

## Goals (user-requested)
1. Connect the **one-shot local protocol compiler** to the **Ornith** model on
   appliance-2 (currently falls back to lfm2.5 on :8899).
2. Add a **model switcher in the AI chatbox** so the user can toggle between
   `lfm2.5` (127.0.0.1:8899) and `ornith` (appliance-2:11434).

## Architecture facts (traced)
- AI chat = `AiTabPanel` → `useChatThread.send` → `runAssistStream` →
  POST `/api/ai/assist/stream` → `AIHandlers.assistStream` →
  `orchestrator.run(AgentRequest)`.
- **Orchestrator + inference config are built ONCE in `server.ts
  initializeAiRuntime()`** from `resolveAiProfile(aiConfig)`. The `inferenceClient`
  + `inferenceConfig` are closures captured inside `run()` (~8 references:
  lines 872, 930, 1188, 1201-1204, 1237, 1467-74). Model is NOT per-request.
- **The app already has a full AI-profile system**: `AIConfig.profiles`
  (`config/types.ts`), `GET /config/ai/profiles`, and
  `POST /config/ai/profiles/:name/activate` which copies the profile into
  `ai.inference`, persists config.yaml, and calls `onConfigUpdate` →
  `initializeAiRuntime(updated)` → **rebuilds the orchestrator with the new
  model**. This is the intended, declarative switch lever (repo rule #1/#2:
  config-as-data, no hardcoded domain logic in TS).
- One-shot compiler = `IntentCompileFromPromptHandlers.toInferenceConfig`
  prefers `smallModel` config (none set) else hardcodes `127.0.0.1:8899/lfm2.5`.

## Decision
- **One-shot:** update `toInferenceConfig` to prefer the ACTIVE profile's
  inference config (Ornith) over the hardcoded 8899 fallback — so the one-shot
  rides whatever model is active, defaulting to Ornith.
- **Switcher:** add a model dropdown to the AI chat header that calls
  `activateAiProfile(name)` and refreshes. Since re-init rebuilds the
  orchestrator, the next chat send uses the new model. This is purely a UI
  addition on top of existing backend plumbing — no new backend wiring needed.

## Implementation
1. `config.yaml` — add `ai.profiles`:
   - `ornith`: inference { baseUrl http://appliance-2:11434/v1, model
     ornith-1.5-35b-a3b, provider openai-compatible, enableThinking false }
   - `lfm`: inference { baseUrl http://127.0.0.1:8899/v1, model lfm2.5-2.6b,
     provider openai-compatible, enableThinking false }
   Set `ai.activeProfile: ornith` (so UI shows Ornith active by default).
2. `server/src/api/handlers/IntentCompileFromPromptHandlers.ts` — change
   `toInferenceConfig` to resolve the active `ai` profile (Ornith by default)
   instead of hardcoding 8899; keep `smallModel` config as an override.
3. Frontend `AiTabPanel.tsx` — add a `<select>` model dropdown in the header.
   On mount fetch `apiClient.listAiProfiles()`; on change call
   `apiClient.activateAiProfile(name)` and update local labeled list. Render
   current `aiActiveProfile` (from config) as the default. Show the active
   model's label.
4. `client.ts` — ensure `listAiProfiles` + `activateAiProfile` exist (they do).
5. CSS for the dropdown in `ai.css`.
6. Tests: full server + app suites; live-browser pass.

## Verification matrix (live-browser rule)
- curl `GET /config/ai/profiles` → shows both profiles.
- In browser: AI chat dropdown renders both; switch → activate → chat send uses
  the new model (observable via backend log `model=` line).
- One-shot: with `activeProfile: ornith`, one-shot calls Ornith (log proves it).
## Verification results (2026-09-03, live)
- Backend boots with `AI agent initialized (model: ornith-1.5-35b-a3b)` — activeProfile
  ornith from config.yaml (profiles added; NOTE config.yaml is gitignored, the file was
  already populated with profiles externally).
- `GET /api/config/ai/profiles` → ornith (ACTIVE) + lfm2.5; activate ornith → 200.
- `POST .../profiles/lfm2.5/activate` via the live browser dropdown → backend log shows
  `AI agent initialized (model: /home/brad/models/lfm2.5/LFM2.5-2.6B-Q4_K_M.gguf)` and the
  selector value flips to lfm2.5 with no error. Switch back to ornith ✓. Live-browser pass
  (SOUL rule) DONE for both directions.
- One-shot now rides Ornith: Zymo compile returns 31 macro actions / 34 events / 16
  labwareAdditions (vs 9/8/4 on the 2.6B) in ~33s. So far richer intent (Ornith surfaces
  the real a/b branch ambiguities as gaps rather than collapsing them). NOTE: more gaps
  (unresolved_ref/clarification) surface as a result — a localization-quality tradeoff to
  tune later, not a wiring failure.
- `IntentCompileFromPromptHandlers.toInferenceConfig` now prefers the active AI profile
  (Ornith) over the hardcoded 127.0.0.1:8899 fallback; `smallModel` config still wins as
  an explicit override.
- Tests: server handler 4/4, app ModelSwitcher 5/5 + AiTabPanel 12/12. App tsc 0 errors;
  server tsc only the pre-existing slugify error. The ModelSwitcher component + AiTabPanel
  wiring were already present (uncommitted prior session); this session verified them live
  and made the one-shot profile-aware (the missing link the earlier plan assumed wrongly).
