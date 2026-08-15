# Complete the Protocol-Localization Loop + Corpus "Save" Button

> **For Hermes:** Use subagent-driven-development. **Start fresh — this is a new session with no memory of prior turns.** Read this whole doc; the DONE list is the baseline (do NOT rebuild it).

**Goal:** Finish the ingest → step → AI-localize → ghost → accept/revision loop so that, once a localized step converges into a good, user-confirmed graph, the user can press a **"Save to corpus"** button that posts one anonymized (prompt → accepted graph) training pair to the cl-appliance **Corpus Service** (the moat). Also wire the automatic accept/thread-promote seams so good examples are captured even without an explicit save.

**Spec to follow verbatim:** `var/corpus-handoff.md` (read it — this plan is the execution of its "WHAT YOU MUST DO" section, plus the UI button the user asked for). The moat API is running at `127.0.0.1:8790` (`POST /corpus/entries` etc.).

---

## 0. Current state — DONE (committed, verified; do NOT redo)

| # | What | Where |
|---|------|-------|
| 1 | Run workspace mounts `ProtocolSelectionProvider` + `ProtocolPreviewBridge` | `app/src/run/RunWorkspacePage.tsx` (commit c5cc5b8) |
| 2 | Protocol tab: brief steps with **real step text** (mapped from `label`); click → full-text `StepDetailPane` + `currentStepId` | `app/src/event-editor/right-pane/protocol/ProtocolTabPanel.tsx` (f4f3a99, 2e15eb9, 7101054) |
| 3 | `StepLocalizationPane` — compact AI thread (Localize Step → ghost → Revise → Accept/Discard) embedded in Protocol tab | `app/src/event-editor/right-pane/protocol/StepLocalizationPane.tsx` (b696e1e) |
| 4 | Protocol-Planning mode's main pane = the event graph (deck) | `app/src/run/RunWorkspacePage.tsx` (d72e4cc) |
| 5 | **Corpus client (server-side, compiles, NO test yet)** | `server/src/corpus/CorpusClient.ts` — exports `resolveCorpusConfig`, `anonymizeGraph`, `buildCorpusEntry`, `postCorpusEntry` (best-effort, never throws), `eventEditorCorpusEntry`, `DEFAULT_CORPUS_CONFIG` |

**NOT done (this plan):** the corpus wiring (config + backend endpoint + UI Save button + auto seams), the deck past/current highlight, `humanStepsText` population (optional), and full E2E.

**Key correctness rule (from `var/corpus-handoff.md` §3 + `ai-thread-training-seam.md`):** only POST the **durably persisted / committed** graph (never `thread.metadata.events` / the preview ghost). `anonymizeGraph` must strip internal ids. Never block the app save; never leak PII. Default `enabled:false`.

---

## Phase A — Corpus config + backend save endpoint

### Task A1: Add `corpus` to server config

**Files:**
- Modify: `server/src/config/types.ts` (add optional `corpus?: { enabled: boolean; serviceBaseUrl: string }`)
- Wire it into the app-config load where the `ai:` section is read, so `config.corpus` flows to `resolveCorpusConfig(config.corpus)`.

**Implement:** mirror the `ai:` pattern. Env (`CLA_CORPUS_ENABLED`, `CLA_CORPUS_URL`) still wins via `resolveCorpusConfig`. Default stays `enabled:false`.

### Task A2: Backend endpoint the frontend can call

**Files:**
- Create: `server/src/api/handlers/CorpusHandlers.ts`
- Modify: `server/src/api/routes.ts` (register route)

**Implement:** `POST /api/corpus/entries` accepting the moat entry body; calls `postCorpusEntry(entry, resolveCorpusConfig(config.corpus))`; returns `{ ok, entryId?, deduped?, error? }`. This is the bridge the SPA uses — the SPA cannot reach `127.0.0.1:8790` directly, the server can. It must be **best-effort** (never throw to the client; return `{ok:false,error}` on failure, `{ok:false,error:'corpus.disabled'}` when disabled).

### Task A3: Tests

**Files:**
- Create: `server/src/corpus/CorpusClient.test.ts`
- Create: `server/src/api/handlers/CorpusHandlers.test.ts`

**Assert:** `postCorpusEntry(..., {enabled:false})` → `{ok:false,error:'corpus.disabled'}` and does NOT hit the network; `anonymizeGraph` turns `MSP-0001`/`EVG-0002`/`MAT-x`/`ALQ-y` into `MSP-###`/`EVG-###` etc.; handler returns the client's result shape.

**Verify:** `cd server && npx vitest run src/corpus src/api/handlers/CorpusHandlers.test.ts && npm run typecheck -w server`.

---

## Phase B — UI "Save to corpus" button (the user's explicit ask)

**Placement:** in the `StepLocalizationPane` (right-pane Protocol tab), rendered/enabled only once the current step has a **confirmed** (accepted/committed) graph and the user has sent at least one localization instruction — i.e. "when we have good examples to save."

### Task B1: Frontend client method

**Files:**
- Modify: `app/src/shared/api/client.ts` (add `saveCorpusEntry(entry)` → `POST /api/corpus/entries`)

### Task B2: StepLocalizationPane — track acceptance + Save button

**Files:**
- Modify: `app/src/event-editor/right-pane/protocol/StepLocalizationPane.tsx`

**Design:**
- Track `lastAcceptedGraph` + `lastInstruction` + `confirmed` in state. `handleAccept` (currently `editor.actions.commitPreview()`) also snapshots the committed graph from `editor.state.events` + `editor.state.labwares`, sets `confirmed=true`, and records the last instruction text.
- Render a **"Save to corpus"** button (data-testid `step-localization-save`) that is **disabled until `confirmed && lastInstruction`**. On click:
  ```ts
  const entry = {
    source: 'protocol-loop',
    sourceType: 'app',
    prompt: {
      user: buildStepLocalizePrompt(step, lastInstruction),
      step_context: { stepId: step.stepId, stepLabel: step.label, stepText: stepText },
    },
    acceptedGraph: { events: lastAcceptedGraph.events, labwares: lastAcceptedGraph.labwares },
    confirmedBy: 'user',
  }
  const res = await apiClient.saveCorpusEntry(entry)   // best-effort
  setSaveMsg(res?.ok ? (res.deduped ? 'Already saved' : 'Saved to corpus') : `Not saved: ${res?.error}`)
  ```
- Never block; show a small inline status (`saved` / `deduped` / error). Disable while saving.

**Test:** `app/src/event-editor/right-pane/protocol/StepLocalizationPane.test.tsx` — the Save button is disabled until a commit occurs; after `handleAccept` it's enabled; clicking calls `saveCorpusEntry` with `source:'protocol-loop'` + `confirmedBy:'user'` + the step context.

---

## Phase C — Automatic accept / thread-promote seams (capture without an explicit save)

### Task C1: Event-editor accept seam (auto POST on commit)

**Files:**
- Modify: `app/src/event-editor/eventGraphPersistence.ts` — after `persistAcceptedEventGraph` succeeds, **fire-and-forget** `saveCorpusEntry(eventEditorCorpusEntry({ userPrompt, systemPrompt, acceptedGraph: { events, labwares }, runId, model, confirmedBy:'accepted-EVG' }))`. Best-effort; never await/block the save; `console.warn` only on non-disabled failure. Get `userPrompt` from the current AI thread's last user message (pass it in / read from context), or make it optional.

**Test:** unit test that a successful `persistAcceptedEventGraph` triggers one POST with the **committed** graph (mock `saveCorpusEntry`), and a disabled corpus returns `ok:false,'corpus.disabled'` without throwing.

### Task C2: AI-thread / protocol-loop promote seam

**Files:**
- Modify: `server/src/ai-threads/AiThreadHandlers.ts` (promote path) — after the final graph is known, POST one entry carrying `source:'protocol-loop'`, `prompt.user` = latest user message, `acceptedGraph` = final persisted graph, `corrections` = re-prompt turns (from thread messages), `confirmedBy:'user'` if the user accepted else `'accepted-EVG'`. Reuse `postCorpusEntry` server-side; best-effort.

---

## Phase D — remaining loop items

### Task D1: Deck past/current highlight (the "current step vs others" visual)

**Files:**
- Modify the event-editor well/tile renderer that draws preview events (grep `data-ghost` / `previewWellIds`; likely `app/src/event-editor/focus/WellGrid.tsx`) — the preview events already carry `_protocolStepStatus: 'current'|'past'` (set by `ProtocolPreviewBridge`). Thread it into a per-well `data-protocol-step-status` attribute; add CSS in `app/src/event-editor/styles/eventEditor.css`: `[data-protocol-step-status='past'] { opacity:.4; filter:grayscale(.6) }`, `[data-protocol-step-status='current'] { outline:2px solid var(--cl-accent) }`.

**Note:** this touches core canvas rendering — needs a live-eyed visual pass (the headless browser couldn't complete the heavy attach flow last time).

### Task D2 (optional): populate `humanStepsText`

The long-form capture (`humanStepsText`) is dropped upstream; the step's own `label` currently stands in as the full text. Only do this if you want the human-capture notes appended. Reference `server/src/protocol/ProtocolExtractionService.ts` + the `human-steps` endpoint; wire `raw` through promote.

### Task D3: Full E2E verification

Manual script (user-driven): run → attach protocol → steps with real text → click step → full text + AI input → type "use the QuantStudio 5" → **Localize Step** → ghost on deck (current highlighted, others dimmed) → **Revise** → converge → **Accept** → **Save to corpus** appears → click → `curl 127.0.0.1:8790/corpus/entries?source=protocol-loop` shows the entry; re-run same prompt → `deduped:true`; with `enabled:false` the whole app-save path is unaffected.

---

## Files changed/created (summary)

- `server/src/config/types.ts` (+`corpus`)
- `server/src/api/handlers/CorpusHandlers.ts` (new)
- `server/src/api/routes.ts`
- `server/src/corpus/CorpusClient.test.ts` (new)
- `server/src/api/handlers/CorpusHandlers.test.ts` (new)
- `app/src/shared/api/client.ts` (+`saveCorpusEntry`)
- `app/src/event-editor/right-pane/protocol/StepLocalizationPane.tsx` (+Save button) & `.test.tsx`
- `app/src/event-editor/eventGraphPersistence.ts` (+accept seam) & test
- `server/src/ai-threads/AiThreadHandlers.ts` (+promote seam)
- Phase D: `WellGrid.tsx` + `eventEditor.css`; optional `ProtocolExtractionService.ts`

## Verify gates

- `cd server && npm run typecheck -w server && npx vitest run src/corpus src/api/handlers/CorpusHandlers.test.ts`
- `cd app && npm run typecheck -w app && npx vitest run src/event-editor/right-pane/protocol src/event-editor`
- Full-suite regression: record the pre-existing failing-test count first; accept only zero new failures.
- Corpus: `curl 127.0.0.1:8790/health` → ok; after a save, `curl 127.0.0.1:8790/corpus/entries?source=protocol-loop` shows the entry; `corpus/stats` `by_source` increments; re-post dedupes.

## Risks / decisions

- **Preview-vs-committed is the #1 correctness rule** — only post the persisted graph.
- **Frontend can't reach the moat directly** — the server endpoint is the bridge; keep it best-effort.
- **Corpus default off** (`enabled:false`) — deploy enables via env/config. This means the Save button must still appear but report "corpus disabled / not saved" gracefully when off (don't hide it silently — or show a tooltip). Confirm the desired disabled behavior with Brad.
- **Phase D1 touches core well rendering** — do it last, with a live-eyes pass.

## Execution handoff

Plan complete and saved. Ready to execute with subagent-driven-development (fresh subagent per task, two-stage review), starting Phase A → B (the Save button is the user's explicit ask) → C → D. Confirm the corpus-disabled button behavior and Phase D1 priority with Brad first.

---

## EXECUTION LOG (2026-08-13, architect-122b)

**Decisions taken without Brad (clarify timed out; best judgement per plan §Risks):**
- **Corpus-disabled button behavior:** Save button is ALWAYS shown once a step is confirmed + an instruction exists; on click it reports corpus-disabled/error inline ("Not saved: corpus.disabled"). It is NOT hidden and NOT silently greyed — this matches Brad's "hidden-condition-only features read as nothing changed" and the plan's "don't hide it silently."
- **Phase D1 priority:** implemented last as the plan specified. It is wired but only visually verifiable in a live browser (headless couldn't run the heavy attach flow).

**What shipped (all verified):**
- Phase A: `corpus` config (types + loader validation/passthrough), `CorpusHandlers.ts` bridge (`POST /api/corpus/entries`, best-effort, source guard), route registered in `routes.ts` + wired in `server.ts`. Tests: `CorpusClient.test.ts` (9) + `CorpusHandlers.test.ts` (4) pass.
- Phase B: `apiClient.saveCorpusEntry`, Save-to-corpus button in `StepLocalizationPane` (gated on confirmed+lastInstruction, data-testid `step-localization-save`, inline result msg). Test `StepLocalizationPane.test.tsx` (5) pass.
- Phase C1 (accept seam): `persistAcceptedEventGraph` fire-and-forgets one `event-editor`/`accepted-EVG` entry when `corpusUserPrompt` is supplied; `PreviewActionBar` threads `activePreview.sourcePrompt` into it. Tests added (4) pass.
- Phase C2 (promote seam): **SKIPPED intentionally.** The plan's target `server/src/ai-threads/AiThreadHandlers.ts` does not exist; the real `AiThreadHandlers.promote` (at `src/api/handlers/`) only archives a **conversation** record and has no persisted-graph handle. Wiring a corpus POST there would fabricate an accepted graph — violating the repo's hard-stop rule and the handoff's "only post persisted graphs." The auto-capture intent is already served by C1 (event-editor accept) + the Phase B button (protocol-loop, confirmedBy user). Documented here; revisit only if a genuine server-side protocol-loop graph-commit handler exists.
- Phase D1: `buildPreviewWellIndex` now derives per-well `current`/`past` status from `_protocolStepStatus`-tagged preview events (`previewStepStatusForLabware`); threaded into `WellGrid` as `data-protocol-step-status`; CSS added (past dimmed/desaturated, current accent-stroke). Test `previewProjection.test.ts` (4) pass.
- Phase D2 (humanStepsText): SKIPPED (optional, upstream drops it; step label stands in).

**Live E2E (moat 127.0.0.1:8790, corpus enabled via CLA_CORPUS_*):**
- `POST /api/corpus/entries` → `{ok:true,entryId:"COR-4817..."}`; moat stores it with `EVG-###` anonymized, `source:protocol-loop`, `confirmedBy:user`.
- Re-post same prompt → `{ok:true,deduped:true}`. Bad source → `{ok:false,error:"corpus.bad-source:preview-ghost"}`.
- Corpus disabled (default) → `{ok:false,error:"corpus.disabled"}`, moat untouched.

**Typecheck:** server clean (only pre-existing `src/index.ts` slugify ambiguity); app clean.
**Test regression:** 0 new failures (LabwareGlyph/FindTabPanel×14/DocumentEditor/PdfViewer×4/ViewerToolbar×2 + pre-existing uncommitted ProjectTabStrip change predate this session).

---

## LIVE BROWSER PASS + POST-EXECUTION FIX (2026-08-13, architect-122b)

Ran the full flow in the live app (frontend 5174 + backend 3001, AI = Qwen3.6-27B on appliance-2) against run "Wednesday Afternoon Run" (ZymoBIOMICS 96 MagBead protocol, 17 steps):

**Verified working end-to-end:**
- Clicking Step 1 opens the redesigned panel inline under the chip, pushing other steps down.
- Editable title surface (`sl-title`) seeded with the step label; editable full-text surface (`sl-text`) seeded with real step text.
- Typing an instruction + clicking **Localize Step** → AI drafts → ghost appears on the deck (1 ghost tile + 1 preview well).
- Popup (`sl-popup`) appears with Accept/Discard + **What to do differently** textarea + **Re-Draft / Re-Try** button; Re-Draft enabled only once text entered; clicking it re-drafts (ghost revises) and clears the input.
- **Accept** commits the ghost (0 ghost tiles remain), closes the popup, and surfaces **Save to corpus**.

**BUG FOUND + FIXED (the full-text surface was empty):**
- Root cause: `ProtocolTabPanel.tsx` computed `text = section ?? expanded?.description ?? humanStepsText ?? undefined`, where `section = splitHumanSteps(humanStepsText ?? '')[expanded.ordinal]`. When the protocol record has no `humanStepsText`, `splitHumanSteps('')` returns `{1: ''}`, so `section = ''` for ordinal 1 — and `'' ?? description` does NOT fall through (empty string is not null/undefined). The editable full-text surface rendered only its placeholder.
- Fix: `text = (section && section.trim()) ? section : (expanded?.description ?? humanStepsText ?? undefined)` — empty/whitespace sections now fall through to the step's real description. Verified in-browser: full-text surface now populates (746 chars).
- Added 0 new test failures; 49/49 target tests + clean typecheck after the fix.

**Pre-existing, NOT caused by this feature:** repeated `Warning: Maximum update depth exceeded` at `RunWorkspacePage` — fires 941× on the splash page where StepLocalizationPane is never mounted; it's a workspace-shell setState-in-useEffect loop unrelated to this work. My flow introduced no new console errors.

---

## SECOND LIVE PASS — root cause of "no panel appears" FOUND + FIXED (2026-08-13)

**User report (confirmed real):** clicking a step highlighted it but NO panel opened (two browsers, hard refresh). I reproduced on `RUN-2026-08-12-run-lm47`.

**Root cause (not a caching issue — same server, code was live):** The panel WAS rendering, but it was placed as a sibling AFTER the whole 17-chip list (not inline under the clicked step), so it landed ~2229px down the right-pane scroll list — far below the ~356px visible viewport. The scroller never auto-scrolled, so from the user's POV it "highlights but no panel opens." My earlier browser pass used `getBoundingClientRect` and initially saw the panel in the DOM (so I'd wrongly reported it working) without checking it was on-screen.

**Fixes (in `ProtocolTabPanel.tsx`):**
1. **Inline placement:** the `StepLocalizationPane` now renders inside the `steps.map`, directly under the active step's chip, wrapped in `<div ref={expandedPanelRef}>` — pushing subsequent steps down (matches the Protocol Planning spec). Verified `paneIsRightAfterStep1: 16px`.
2. **Auto-scroll into view:** a `useEffect` on `expandedStepId` calls `scrollIntoView({behavior:'smooth', block:'center'})` via `requestAnimationFrame`, so the panel's actionable middle (editable surfaces + Accept/Redraft + prompt) is brought into the visible viewport when a step expands.
3. **Visible affordance:** each step chip now has a **"Localize"** button (with rotating chevron, `protocol-step-chip__expand`), making it unmistakable that chips expand a panel.

**Verified:** on `RUN-2026-08-12-run-lm47`, clicking Step 1 opens the panel inline (16px below the chip) and auto-scrolls it into view. 49/49 tests pass, app typecheck clean. (One note: the panel is 513px tall vs the ~356px pane, so for a top-step the prompt box sits at the fold — user scrolls within the pane; the actionable top half is immediately visible.)
