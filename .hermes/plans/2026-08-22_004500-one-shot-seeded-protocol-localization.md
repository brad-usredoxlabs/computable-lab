# Chat-Driven One-Shot Protocol Localization Loop (small-model, whole-flow trained)

> **For Hermes:** Use subagent-driven-development to implement task-by-task.

**Goal:** The user localizes a universal protocol **in AI chat**. The AI produces a **one-shot local macro protocol** (scientist-intent), the deterministic compiler drafts the **full event graph** onto the deck, the user browses the steps and refines them in the **same back-and-forth AI convo**, then **accepts** and the **protocol is saved**. The training unit is the **whole accepted flow** — `(chat thread → one-shot macro → accepted local protocol + accepted event graph) — NOT per-step snapshots** — and it flows to the cl-appliance Corpus (the moat) to train the intent model.

**Architecture:** This is an evolution of the per-step `StepLocalizationPane` ghost-loop we already built into a **protocol-scoped chat thread**:
- **One-shot macro** is the chat's first AI response: `extractBranchQuestionsFromSmallLlm` → human answers → `compileFromSmallLlm` → a **local macro protocol** (the scientist-intent document, persisted as the protocol being localized).
- **Deterministic compile** drafts the full event graph from that macro → ghosted to the deck.
- **Refinement** rides the SAME chat thread (existing `useChatThread` + re-draft loop): user says "this step in 15mL conical tubes, Thermomixer water bath, Beckman centrifuge" → the macro is revised per-step → recompiled.
- **Accept** → local protocol saved + the whole pair `(thread → accepted macro → accepted graph)` captured to the corpus.

**Tech Stack:** TypeScript (server + React app), existing scientistIntent modules + `/intent/compile`-style seam, existing `StepLocalizationPane`/`ProtocolTabPanel`/`useChatThread`/`buildPreviewFromDraft`, `--cl-*` tokens, Vitest.

---

## The design decisions this plan locks (Brad, this session)

**D1 — The training unit is the WHOLE accepted flow, not per-step.**
The data we want to train the model on is: a scientist typing "localize this Zymo protocol for my lab" → the one-shot local macro → the compiled event graph → the human's refinements → **the accepted local protocol**. That accepted artifact IS the ground-truth pair (`prompt ↔ accepted local protocol + accepted event graph`), mirroring the existing `metadata.events`/PairExporter seam and the repo's "human gold = ground truth" corpus rule. Per-step snapshots are throwaway intermediates — only the accepted end-state is saved for training.

**D2 — One-shot is a CHAT response, not a black-box button.**
The user does not click "Run one-shot." They localize in chat; the AI's first answer is the one-shot local macro. This reuses the existing chat thread + `EditableProtocolText` ghost machinery exactly — no new streaming system, no second reducer. It's the `protocol-step-localization` surface widened to protocol scope.

**D3 — Canonical-graph quality for the TRAINING corpus uses a LARGER model.**
The 2.6B is right for the *interactive loop* (fast, cheap, good enough to seed + refine). But the corpus is the moat — its training pairs should be **gold**. So: the accepted local protocol that gets saved for training is **re-compiled/verified with a strong model (e.g. the 122B architect or a gold qwen3.6-35b)** to produce a *canonical* macro graph, OR at minimum the accepted pair is checked by the deterministic compiler + human accept (the ground-truth gate). The 2.6B drives UX; the gold model guarantees corpus quality. (Weighted strongly for the corpus save path; the interactive loop stays 2.6B.)

**D4 — The saved artifact is the protocol, and it's revisable.**
On accept, persist a **local-protocol record** (the localized macro, `kind: 'local-protocol'`, referencing the universal source via `variantRef`/steps). This is the durable object; the event graph is its compilation. A later re-open recompiles.

---

## The pipeline the UI must surface

```
[universal protocol + "localize this for my lab"]
   → [AI chat, first turn] extractBranchQuestions → human answers
   → [2.6B] compileFromSmallLlm → ONE-SHOT LOCAL MACRO (scientist-intent)
   → [deterministic] compileScientistIntent → FULL EVENT GRAPH ghosted
   → [user browses steps] edits flagged steps in the SAME convo
       "this step in 15mL conical, Thermomixer, Beckman centrifuge"
       → macro revised per-step → recompiled (ghost rides thread)
   → [accept] local-protocol saved
   → [corpus] whole pair (thread → accepted macro → accepted graph) POSTed
       re-verified with a GOLD model for canonical quality
```

---

## Task list (bite-sized, TDD, committed-in-order)

### Task 1: Backend — `POST /intent/compile-from-prompt` (chat-ready one-shot)
One call that drives the whole one-shot and returns **the local macro protocol** + branch axes + compiled events — designed so the chat's first turn can consume it and hold the macro for refinement.

**Files:**
- Create: `server/src/api/handlers/IntentCompileFromPromptHandlers.ts`
- Modify: `server/src/server.ts` (register route, mirror IntentCompileHandlers wiring)
- Test: `server/src/api/handlers/IntentCompileFromPromptHandlers.test.ts`

**Step 1: Failing test.** POST `{ protocolText, answers: { sample_type: 'bacterial', module_type: 'rack' } }` → expect `outcome`, `terminalArtifacts.events.length > 0`, `axes` echoed, AND `localMacro` (the parsed scientist-intent) present. Mock llmClient injected (each tool-call a stub). Assert the verb-lift ran (`centrifuge` → `spin`).

**Step 2:** Implement handler: parse body → `extractBranchQuestionsFromSmallLlm` (skip re-ask when `answers` provided) → else `{ axes, needsAnswers: true }` → when answers present, `compileFromSmallLlm` → assemble `{ outcome, terminalArtifacts, localMacro, axes }`.

**Step 3:** Wire route in `server.ts`.

**Step 4:** Verify: `cd server && npx vitest run src/api/handlers/IntentCompileFromPromptHandlers.test.ts`.

**Step 5:** Commit. `feat(api): POST /intent/compile-from-prompt — chat one-shot with local macro`

### Task 2: Backend — persist `local-protocol` from an accepted one-shot
`POST /intent/accept` — given the accepted local macro (scientist-intent) + accepted event graph + the source universal protocol ref, persist a `local-protocol` record and return it (this is the D4 durable artifact).

**Files:**
- Create: `server/src/api/handlers/IntentAcceptHandlers.ts` (persist via store, map scientist-intent → local-protocol schema `kind: 'local-protocol'`, `variantRef: <universal protocol id>`)
- Modify: `server/src/server.ts`
- Test: `server/src/api/handlers/IntentAcceptHandlers.test.ts`

**Step 1: Failing test.** POST `{ sourceProtocolId, localMacro, acceptedEvents, threadId }` → expect a created local-protocol record with the steps from the macro.
**Step 2:** Implement — validate macro against scientist-intent schema, map to local-protocol payload (mind `exactOptionalPropertyTypes`, `unevaluatedProperties` — see skill), persist.
**Step 3:** Pass + commit. `feat(api): POST /intent/accept — persist accepted local-protocol from one-shot`

### Task 3: Backend — corpus save of the WHOLE accepted flow (gold re-verify)
`POST /intent/training-pair` — accept the whole pair `(thread, sourceProtocolId, localMacro, acceptedEvents, acceptedProtocolId)` and route it to the corpus moat (`saveCorpusEntry`, source `'protocol-loop'`). Re-verify with a GOLD model (larger) to produce the canonical graph for the corpus before persisting — D3.

**Files:**
- Create: `server/src/api/handlers/IntentTrainingPairHandlers.ts`
- Modify: `server/src/server.ts`
- Test: `server/src/api/handlers/IntentTrainingPairHandlers.test.ts`

**Step 1: Failing test.** POST a full pair → expect `saveCorpusEntry` called with `prompt: { user, localMacro, thread }`, `acceptedGraph`, `canonicalGraph` (gold-verified), `confirmedBy: 'user'`.
**Step 2:** Implement — assemble the pair; call the gold-model re-compile (guard: if gold unavailable, fall back to the accepted graph marked `canonical:false` — never block).
**Step 3:** Pass + commit. `feat(ai): POST /intent/training-pair — whole accepted flow → corpus moat (gold re-verify)`

### Task 4: Frontend — protocol-scoped chat thread (the one-shot surface)
The Protocol tab's chat becomes a **protocol-scoped localization thread**. First turn: user pastes/selects the universal protocol, hits localize → `POST /intent/compile-from-prompt` → the whole graph ghosts + the local macro is held in thread state. This is `StepLocalizationPane` widened: one `useChatThread`, `surface: 'protocol-localization'`. Branch answers collected via a slim inline clarifier (reuse `ClarificationPicker` from AiTabPanel).

**Files:**
- Create: `app/src/event-editor/right-pane/protocol/ProtocolLocalizationThread.tsx` (wraps chat.send + macro state + clarify)
- Modify: `app/src/event-editor/right-pane/protocol/ProtocolTabPanel.tsx` (mount it)
- Modify: `app/src/event-editor/right-pane/ai/useChatThread.ts` (accept `surface: 'protocol-localization'` if not already a passed-through string)
- Test: `app/src/event-editor/right-pane/protocol/ProtocolLocalizationThread.test.tsx`

**Step 1:** Failing test — mount thread, click Localize → `setPreview` called with `sourcePrompt: 'one-shot localized draft'`, `previewEvents.length > 0`; `localMacro` state populated.
**Step 2:** Implement — the chat first response → call backend → `buildPreviewFromDraft` → `setPreview`; hold macro; render clarify picker when `needsAnswers`.
**Step 3:** Pass + commit.

### Task 5: Frontend — per-step refinement rides the SAME thread
Flagged steps (D3 gaps, unbound equipment) are editable in the convo: user types "this step in conical tubes + Thermomixer + Beckman" → appends `Correction: <text>` (the existing re-draft pattern) → `compileFromSmallLlm` re-emits macro → recompiles just the affected sub-graph. Reuses `composeFullLocalizePrompt` widening.

**Files:**
- Modify: `app/src/run/protocol-planning/protocolStepSelection.ts` (protocol-scoped prompt builder)
- Modify: `app/src/event-editor/right-pane/protocol/ProtocolLocalizationThread.tsx` (step drill-down → re-draft)
- Modify: `app/src/event-editor/right-pane/protocol/StepLocalizationPane.tsx` (accept `seedMacro`/`thread` so refinement continues the one-shot, not a fresh blank)
- Test: extend `StepLocalizationPane.test.tsx`

**Step 1:** Failing test — drilling into a step sends `Correction:` that revises the macro (not a fresh localize), and recompiles.
**Step 2:** Implement — thread the macro + accept `seedMacro`; re-draft appends correction.
**Step 3:** Pass + commit.

### Task 6: Frontend — accept + save (whole-flow capture)
"Accept" commits the graph (existing `commitPreview`), calls `POST /intent/accept` (persist local-protocol) and `POST /intent/training-pair` (corpus). The UI confirms "Protocol saved + added to training corpus."

**Files:**
- Modify: `app/src/event-editor/right-pane/protocol/ProtocolLocalizationThread.tsx` (Accept handler → both endpoints)
- Modify: `app/src/shared/api/client.ts` (add `intentAccept`, `intentTrainingPair`)
- Test: extend `ProtocolLocalizationThread.test.tsx`

**Step 1:** Failing test — Accept → `commitPreview` + `intentAccept` + `intentTrainingPair` called; success message.
**Step 2:** Implement.
**Step 3:** Pass + commit.

### Task 7: Real LFM2.5 + gold-ish E2E (verification)
Drive Zymo through the chat loop: localize → answer `bacterial`/`rack` → whole graph ghosts → drill into the elute step ("Beckman centrifuge") → re-draft → accept → local-protocol saved + corpus pair re-verified. Confirm the training pair has a canonical (gold) graph.

**Files:** none (verification). Launch recipe in memory.

**Gates:** `npx tsc --noEmit` (app + server, exclude pre-existing `index.ts(26,1)`); `npx vitest run` on new/edited suites; `cd server && npx vitest run src/compiler/scientistIntent/`.

---

## Files summary

| Kind | Path |
|------|------|
| handlers (3) | `server/src/api/handlers/IntentCompileFromPromptHandlers.ts`, `IntentAcceptHandlers.ts`, `IntentTrainingPairHandlers.ts` + tests |
| server wiring | `server/src/server.ts` |
| intent thread | `server/src/compiler/scientistIntent/intentCompile.ts` + test |
| chat surface | `app/src/event-editor/right-pane/protocol/ProtocolLocalizationThread.tsx` + test |
| step refine | `app/src/event-editor/right-pane/protocol/StepLocalizationPane.tsx`, `ProtocolTabPanel.tsx`, `run/protocol-planning/protocolStepSelection.ts` + tests |
| client | `app/src/shared/api/client.ts` |

## Risks / tradeoffs / open questions

- **R1 — draft is provisional:** the whole graph ghosts (never auto-commits); user must Accept. Reuse PreviewActionBar as the only durable-persist path.
- **R2 — TipTap reseed:** `EditableProtocolText` can't reseed imperatively; remount-by-key for a fresh step (frontend skill pitfall).
- **R3 — gold model unavailability:** corpus re-verify must never block or fail the save; fall back `canonical:false` + deterministic-compiler check.
- **Q4 — gold model choice:** I default to the 122B architect (me) or qwen3.6-35b for the corpus canonical graph — but which gold model drives `intent/training-pair` re-verification is Brad's call. Flagged: this could be a config (`ai.goldModel`) rather than hardcoded, per the "no hardcoded config" rule.
- **Q5 — local-macro → local-protocol mapping fidelity:** the scientist-intent schema (closed verbs) vs local-protocol schema (rich StepAddMaterial/etc.) needs a careful normalizer. Task 2 owns it; do NOT shortcut with `kind: 'other'` globally if it loses the macro's meaning — but `kind:'other'` is the honest fallback for steps without a concrete verb.
- **Q6 — does the ACCEPTED local macro get human-edited before save?** D1 says the accepted macro (post-refinement) is saved. Confirm the human's chat refinements are folded back into the macro before `intent/training-pair`, so the corpus pairs the *final* intent, not the first one-shot. This is the crux of "the saved protocol = training data."