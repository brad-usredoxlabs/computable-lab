# Universal-Protocol → Local-Protocol Loop + Trained DFlash Draft Model

> For Hermes: execute via subagent-driven-development, per-task with spec+quality review.
> Companion experiment this builds on: `~/.local/share/llamacpp-bench/DFlash-experiment.md`.

**Goal:** Build a closed loop that (1) ingests vendor PDFs → AI turns them into
protocol steps, (2) lets the user iterate step-by-step, converging on a confirmed
*local* protocol validated by the deterministic compiler + event-editor UI, and
(3) captures every (user prompt → accepted event graph) pair to train a fast
DFlash draft model so the same 35B gives snappier decode at the same GPU/VRAM.

**Architecture:** Three composable stages — an existing ingestion→draft pipeline,
the existing AI/compiler/accept loop (the iteration surface), and a new
training-data exporter that turns accepted threads into prompt/graph pairs, then
a DFlash draft-training + swap-in of the quicker draft model. Nothing forced; each
stage is independently testable.

**Tech stack:** server TypeScript (computable-lab), BeeLlama.cpp + DragonFlash
(DraftFlash) for inference, HF datasets + z-lab/DFlash training, event-editor UI.

---

## Current context / what already exists (verified)

- **Vendor ingestion pipeline exists:** `server/src/ingestion/vendor-protocol/`
  (`VendorProtocolCandidateExtractor/Sectioner/DraftService/PromotionService`,
  `ZymoNormalization`, with goldens + tests). Vendor PDF → candidate → normalized
  protocol → proposed event graph is already scaffolded and tested.
- **AI event-drafting + deterministic compiler + accept loop exists:** the
  event-editor AI dock (`useAiChat` / `AiTabPanel`) → `POST /ai/draft-events/stream`
  → `AgentOrchestrator` → `runChatbotCompile` (26-pass deterministic pipeline) →
  accept-gate → event-editor UI. We built prompt resolution-assurance on this path.
- **Training-capable persistence seam exists:** `server/src/ai-threads/`
  (`AiThreadStore.ts`, `AiThreadHandlers.ts`) persists each thread's
  `messages[].metadata` incl. `events`, `clarification`, `labwareAdditions` to
  `var/ai-threads/{userId}/{endpoint}.json`. This is where (prompt, outcome graph)
  pairs already live.
- **Inference/hardware verified:** BeeLlama v0.4.2 CUDA on RTX 4070 8 GB, Qwen3.6
  35B-A3B (Q4_K_M w/ experts in RAM, DFlash draft) → ~0.78-0.99 acceptance on
  event-editor JSON, ~26-34 t/s decode. A faster/specialized draft model directly
  raises this.

## The three-staged loop

```
vendor PDF → [ingest/parse] → protocol steps
             → [AI draft per step] ─→ event graph
             → [deterministic compile + accept] ─→ CONFIRMED local protocol
             → [user iterates in event-editor UI] ─→ re-draft (loop)
             ↓
        capture (user prompt ←→ accepted graph) pairs  ──→  train DFlash draft
             ↓
        swap faster draft into BeeLlama ──→ snappier decode at same VRAM
```

---

## Phased plan

### Phase 0 — Trace + verify the data seam (read-only survey)
**Objective:** Confirm the end-to-end path vendor-PDF → accepted-graph is actually
traversable and that threads already carry the (prompt, events) pair, before any
code.

**Files:** `server/src/ingestion/vendor-protocol/*`, `server/src/ai-threads/`,
`server/src/api/handlers/AiThreadHandlers.ts`, `server/src/ai/runChatbotCompile.ts`

**Tasks:**
1. Run the vendor ingestion test suite: `cd server && npx vitest run src/ingestion/vendor-protocol` — confirm pass.
2. Confirm the AI-thread JSON shape carries `prompt` (user message content) + `metadata.events` (accepted graph) by reading `AiThreadStore.ts` + one sample thread file.
3. Write acceptance note: the pair export needs the **accepted** graph — verify where "accepted" is stamped (thread promote vs event-graph persistence vs accept-gate).

---

### Phase 1 — Training-pair exporter
**Objective:** Turn accepted threads into a curated `(prompt, accepted_event_graph)`
dataset in JSONL, the ground truth for the draft trainer.

**Files:**
- Create: `server/src/ingestion/vendor-protocol/training/PairExporter.ts`
- Create: `server/src/ingestion/vendor-protocol/training/PairExporter.test.ts`
- Test cmd: `npx vitest run src/ingestion/vendor-protocol/training`

**Step 1 (RED):** test that a thread message with `role:'user'` + a follow-on
`metadata.events` yields one `{prompt, graph_id, events}` record; a thread with NO
accepted events yields nothing.

**Step 2 (implement):** read `AiThreadStore`, filter to accepted graphs, normalize
the event graph to the canonical `PlateEventPrimitive[]` shape, write JSONL
`{ "system": <event-graph-agent.md>, "user": <prompt>, "accepted_events": [...] }`.
Include the deterministic-parse round-trip check: only keep pairs whose graph is
itself accepted by the deterministic parser (tight-fit guarantee).

**Step 3:** verify output counts; commit.

---

### Phase 2 — Deterministic compiler ↔ AI tight-fit confirmation harness
**Objective:** Prove the exported pair's graph is reproducible by the deterministic
path alone, quantifying "the AI and the deterministic compiler agree."

**Files:**
- Create: `server/src/ingestion/vendor-protocol/training/DeterministicFitCheck.ts` + test
- Modify: reuse `runChatbotCompile` + the acceptance harness

**Step 1 (RED):** for a sample pair, `runChatbotCompile(prompt)` must reproduce the
accepted graph's event set (or be within a defined tolerance). Assert agreement
rate >= threshold.

**Step 2 (implement):** a scorer: deterministic-compile(prompt) vs accepted-events;
report per-graph match (exact / partial / mismatch). Gate the training set: only
pairs with agreement above threshold enter the trainer (YAGNI: exclude noisy pairs).

**Step 3:** run over the full exported set; produce agreement histogram.

---

### Phase 3 — Iterative step-level refinement UI (loop surface)
**Objective:** Give the user the per-step iterate-in-editor experience (already
mostly present) and capture the refinement turns so edits enrich the training set.

**Files:** `app/src/event-editor/right-pane/ai/*` (AiTabPanel, ChatInput), useAiChat,
and any per-event accept/commit already present.

**Tasks:**
1. Confirm each accepted event already round-trips through `acceptPreview` /
   `commitAcceptedPreviewEvents` (it does). Ensure the final committed graph is the
   one captured in Phase 1 (not a phantom).
2. Add minimal UI: a "Save as local protocol + training example" affordance on the
   confirmed graph (creates the protocol record + tags the thread for export).
3. Test via existing app test suite (`cd app && npx vitest run src/event-editor/right-pane/ai`).

---

### Phase 4 — DFlash draft training
**Objective:** Train a faster draft model from the (prompt, accepted-graph) pairs so
the 35B decodes faster at the same VRAM — the payoff of the whole loop.

**Files:** standalone ML work in `~/.local/share/llamacpp-bench/dflash-train/`
(z-lab/DFlash training pipeline), NOT in computable-lab repo.

**Step 1 — feasibility gating:** confirm the z-lab DFlash trainer accepts
prompt/response pairs target=Qwen3.6-35B-A3B (small 0.5B drafter, shares target's
tokenizer/embeddings). If the DFlash block-diffusion trainer is not pair-friendly,
fall back to training a **draft-simple** small autoregressive model (distill the
35B's protocol→graph behavior into e.g. a 1.7-4B drafter) — same acceptance benefit,
simpler, already supported by our `draft-simple` path.

**Step 2 — dataset:** feed Phase 1 + Phase 2 gated JSONL (system+prompt → events).
Hold out a validation split from the same loop so we're measuring real
generalization, not overfitting the seed corpus.

**Step 3 — quantize:** Q4_K_M / IQ4_XS GGUF of the new draft (~200-400 MB).

**Step 4 — validate:** run the DFlash skip decoder / our acceptance harness; target
acceptance-rate regressions vs the Anbeeld baseline. Iterate.

---

### Phase 5 — Swap-in + end-to-end benchmark
**Objective:** Put the trained draft into BeeLlama and measure the snappier decode
at identical GPU/VRAM.

**Files:** reuse `~/.local/share/llamacpp-bench/run-dflash-sweep.sh` + corpus.

**Tasks:**
1. Launch BeeLlama with target + trained draft (all experts RAM, `--reasoning off`,
   draft-n sweet spot from DFlash-experiment).
2. Measure tokens/s + acceptance vs Anbeeld baseline; verify decode is faster and
   content quality is unchanged or better (the loop's payoff).
3. Produce the final comparison table; record in a fresh plan/skill.

---

## Acceptance criteria (whole loop)

1. Vendor PDF ingested → normalized steps through the existing pipeline
   (`vendor-protocol` tests pass).
2. A user iterates on a graph in the event editor; each accepted graph is captured
   as a (prompt, graph) pair (Phase 1 exporter green).
3. Deterministic compiler re-derives the accepted graph at agreement >= threshold
   (Phase 2 harness green), proving the AI/compiler tight fit.
4. A trained draft model (DFlash or draft-simple) runs in BeeLlama and shows
   decode-speed-up and/or acceptance gain at the same 8 GB VRAM vs baseline
   (Phase 5).

## Risks / tradeoffs / open questions

- **DFlash trainer pair-compatibility is the big unknown.** z-lab's block-diffusion
  drafter is trained for a target; feeding prompt→graph pairs may need the
  approximation. **Fallback: draft-simple distillation** (small autoregressive
  drafter) is the pragmatic, fully-supported path and still delivers the
  "same VRAM, snappier" payoff. Recommend starting the plan assuming draft-simple
  distillation, DFlash as stretch.
- **Data volume:** draft training needs meaningful (prompt, graph) pairs. The full
  universal→local corpus is the raison d'etre of the loop; expect cold-start small,
  so Phase 1/2 must seed with existing vendor-protocol goldens + synthetic pairs.
- **Deterministic agreement threshold is a policy** — define it (recommend 0.8+) and
  keep it a constant, not a magic number.
- **Exact content:** only the *accepted* (persisted) graph is ground truth. Using a
  phantom/ghost graph would poison training — the exporter must read the committed
  graph, not a preview.
- **"Tight fit" scope:** the deterministic compiler already shares the resolve spine
  with the AI (prior session). Phase 2 makes that *empirical* for these pairs.

## Open questions for Brad (before/while executing)

1. DFlash vs draft-simple distillation as the training target? (I recommend
   draft-simple first — pragmatic; DFlash if the trainer cooperates.)
2. Is the iteration loop a new first-class surface, or thin UI over the existing
   event-editor dock (which already does draft→accept→commit)? Recommend thin.
3. Minimum target corpus size for the draft to be worth training?
4. Where should trained-draft models live long-term (appliance 8 GB box vs shared)?

---

## Phase 0 VERIFICATION FINDINGS (2026-08-04) — the pipeline is largely real

Purpose: determine whether vendor-PDF → steps → accepted-graph is already
traversable, and where the training pair must come from. Read-only.

### Finding 1 — Vendor ingestion pipeline: GREEN (already built + tested)
`server/src/ingestion/vendor-protocol/` has a complete, tested pipeline:
candidate extractor → sectioner → normalizer → event-graph draft service →
promotion. Result: **22/22 tests pass**
(`npx vitest run src/ingestion/vendor-protocol`). Vendor PDF → normalized steps →
proposed event graph is scaffolded and working headlessly. This is ~Phase 3's
"ingest PDF → steps" stage — mostly DONE; the gap is user-facing wiring, not
construction.

### Finding 2 — Thread store carries the prompt + preview events (training seam)
`server/src/ai-threads/AiThreadStore.ts` + `types.ts`: threads are JSON files under
`var/ai-threads/{userId}/{endpoint}.json`. `ThreadMessage` has `role`, `content`
(the user prompt) and `metadata` (open object — carries `events`,
`labwareAdditions`, `clarification`). So the (prompt, events) data is already
persisted per thread; promoted into `conversation` records via
`AiThreadHandlers.promote`.

### Finding 3 — CRITICAL: the thread's `metadata.events` is the PREVIEW, not the ACCEPTED graph
`useAiChat.ts` writes `metadata.events = normalizedPreviewEvents` at the `done`
(stream-complete) event — i.e. the ghost/preview proposed by the AI, BEFORE the
user accepts. The **accepted/committed** graph is persisted separately and durably:
`app/src/event-editor/eventGraphPersistence.ts`
(`persistAcceptedEventGraph` → server-side `EVG-xxx` records with commit SHAs,
loaded via `loadAcceptedEventGraph`, surfaced as `eventGraphSave` in
`EventEditorContext`). 

**Consequence for the training-pair exporter (Phase 1):** it must join the thread's
`user` prompt with the **persisted accepted event graph** (from event-graph
persistence / EVG records), NOT the thread's live preview `metadata.events`.
Using the preview would poison training with un-accepted ghosts. This is the load-
bearing design constraint the exporter must honor.

### Finding 4 — Where "accepted" is stamped
Acceptance = `commitPreview` / `persistAcceptedEventGraph` in the event editor
(writes the accepted `PlateEvent[]` + placements to the server, keyed by
`eventGraphId`). The AI-thread `promote` is a separate, later act (turning the
thread into a `conversation` record) — it is NOT the accept signal. So:
`accepted graph` lives in event-graph persistence; `prompt` lives in the thread.

### Phase 0 verdict / implication for the plan
- Stages 1 (ingest → steps) and 2 (AI draft → compile → accept → editor) are
  **largely DONE**; the genuinely new work is:
  (A) **PairExporter** that joins thread prompt + persisted accepted EVG graph
      (Phase 1) — this is the real new server module;
  (B) **DeterministicFitCheck** (Phase 2);
  (C) a thin "save as local protocol + tag training example" UI affordance
      (Phase 3);
  (D) draft training + swap-in (Phase 4-5).
- No change to the ingestion or AI-draft pipeline is required for Phase 1; we build
  the exporter on top of existing seams.
- Update Phase 1's exporter design: input = thread store + event-graph persistence;
  join on (endpoint, session, user) → (prompt, accepted_graph); filter to accepted
  only.

