# Universal→Local Protocol Loop + Trained DFlash Draft Model — CONSOLIDATED

**Status:** Canonical resume doc. Supersedes the two 2026-08-04 sources:
- `.hermes/plans/2026-08-04_protocol-loop-dflash-handoff.md`
- `.hermes/plans/2026-08-04_000000-protocol-loop-dflash-draft.md`

The third 2026-08-04 plan (`8gb-model-testing-plan.md`) is a SEPARATE concern
(the 8GB hardware benchmark harness) and is intentionally NOT merged here — it is
an input/sibling, not part of the loop plan.

**Goal:** Build a closed loop that (1) ingests vendor PDFs → AI turns them into
protocol steps, (2) lets the user iterate step-by-step, converging on a confirmed
*local* protocol validated by the deterministic compiler + event-editor UI, and
(3) captures every (user prompt → accepted event graph) pair to train a fast
DFlash draft model so the same 35B gives snappier decode at the same GPU/VRAM.

**Architecture:** Three composable stages — the existing ingestion→draft
pipeline, the existing AI/compiler/accept loop (the iteration surface), and a
new training-data exporter that turns accepted threads into prompt/graph pairs,
then DFlash draft-training + swap-in. Nothing forced; each stage independently
testable.

**Tech stack:** server TypeScript (computable-lab), BeeLlama.cpp + DragonFlash
(DraftFlash) for inference, HF datasets + z-lab/DFlash training, event-editor UI.

---

## What already exists (verified 2026-08-04)

- **Vendor ingestion pipeline GREEN:** `server/src/ingestion/vendor-protocol/`
  (candidate extractor → sectioner → normalizer → event-graph draft → promotion).
  **22/22 tests pass** (`cd server && npx vitest run src/ingestion/vendor-protocol`).
- **AI event-drafting + deterministic compiler + accept loop exists:**
  event-editor AI dock (`useAiChat` / `AiTabPanel`) → `POST /ai/draft-events/stream`
  → `AgentOrchestrator` → `runChatbotCompile` (26-pass deterministic pipeline) →
  accept-gate → event-editor UI. Prompt resolution-assurance already built here.
- **Training-capable persistence seam exists:** `server/src/ai-threads/`
  (`AiThreadStore.ts`) persists threads to `var/ai-threads/{user}/{endpoint}.json`;
  `ThreadMessage` has `role`, `content` (prompt), `metadata` (open object —
  `events`, `labwareAdditions`, `clarification`).
- **Inference/hardware verified:** BeeLlama v0.4.2 CUDA on RTX 4070 8 GB,
  Qwen3.6 35B-A3B (Q4_K_M w/ experts in RAM, DFlash draft) → ~0.78-0.99
  acceptance on event-editor JSON, ~26-34 t/s decode.

## The loop
```
vendor PDF → [ingest/parse] → protocol steps
         → [AI draft per step] ─→ event graph
         → [deterministic compile + accept] ─→ CONFIRMED local protocol
         → [user iterates in event-editor UI] ─→ re-draft (loop)
         ↓
    capture (user prompt ←→ accepted graph) pairs ──→ train DFlash draft
         ↓
    swap faster draft into BeeLlama ──→ snappier decode at same VRAM
```

## The load-bearing design facts (from Phase 0)

1. **The thread's `metadata.events` is the PREVIEW/ghost, NOT the accepted graph.**
   `useAiChat.ts` writes `metadata.events = normalizedPreviewEvents` at stream-`done`.
   The accepted/committed graph lives separately in event-graph persistence
   (`app/src/event-editor/eventGraphPersistence.ts`, server-side `EVG-xxx` records,
   via `persistAcceptedEventGraph` / `commitPreview`), surfaced as `eventGraphSave`
   in `EventEditorContext`. The exporter MUST join thread prompt + persisted
   accepted EVG graph — never the preview (would poison training with ghosts).
2. **Where "accepted" is stamped:** `commitPreview` / `persistAcceptedEventGraph`
   in the event editor (writes accepted `PlateEvent[]` + placements keyed by
   `eventGraphId`). The AI-thread `promote` is a SEPARATE later act and is NOT the
   accept signal. Accepted graph lives in event-graph persistence; prompt lives in
   the thread.
3. **NEW GAP (2026-08-04, thread-end): the protocol STEP TEXT is not saved in the
   thread.** User's typed `prompt` → saved as `content`; but the incoming protocol
   step text + surface context (labwares, volumes, equipment, deck, wells) live in
   `ctx.surfaceContext` — sent to backend as request context, never persisted back.
   Training pairs are incomplete without both prompt AND step text.

**Verdict:** Stages 1 (ingest→steps) + 2 (AI draft→compile→accept→editor) are
largely DONE. Genuinely new work: (A) PairExporter, (B) DeterministicFitCheck,
(C) thin UI affordance, (D) draft training, (E) swap-in benchmark.

---

## Phases

### Phase 1 — Capture protocol-step context into the thread [NEW gap fix]
Persist the resolved step/context as structured metadata in `useAiChat`'s user-
message write so the thread self-contains prompt + step text.
- **Files:** `app/src/shared/hooks/useAiChat.ts`, `app/src/types/aiContext.ts`
- **Method:** recommend structured `metadata.consumedContext` / `metadata.step`
  from `surfaceContext` (vs content prefix — structured preferred).
- **Test:** `cd app && npx vitest run src/event-editor/right-pane/ai`

### Phase 2 — Training-pair exporter (PairExporter)
Turn accepted threads into curated `(prompt, step_text, accepted_event_graph)`
JSONL — the ground truth for the draft trainer. Join thread prompt + **persisted
accepted EVG graph**, NOT preview. Include deterministic round-trip check.
- **Create:** `server/src/ingestion/vendor-protocol/training/PairExporter.ts` + test
- **Test cmd:** `cd server && npx vitest run src/ingestion/vendor-protocol/training`
- Output record: `{system, user, step_text, accepted_events}`; jsonl.

### Phase 3 — Deterministic compiler ↔ AI tight-fit harness (DeterministicFitCheck)
Prove the exported pair's graph is reproducible by the deterministic path alone.
- **Create:** `server/src/ingestion/vendor-protocol/training/DeterministicFitCheck.ts` + test
- **Method:** `runChatbotCompile(prompt)` vs accepted events → per-graph
  exact/partial/mismatch; gate training set at agreement ≥ threshold (recommend 0.8+,
  keep a named constant).

### Phase 4 — Iterative step-level refinement UI affordance [thin]
- Confirm each accepted event round-trips through `acceptPreview` /
  `commitAcceptedPreviewEvents`; ensure the committed graph is what Phase 2 captures.
- Add minimal "Save as local protocol + training example" affordance on the
  confirmed graph (creates protocol record + tags thread for export).

### Phase 5 — DFlash draft training
Standalone ML work in `~/.local/share/llamacpp-bench/dflash-train/` (NOT in repo).
- **Step 1 feasibility gating:** confirm z-lab DFlash trainer accepts prompt/response
  pairs targeting Qwen3.6-35B-A3B (small 0.5B drafter). If not pair-friendly,
  fall back to **draft-simple** small autoregressive drafter (distill 35B
  protocol→graph into e.g. 1.7-4B). **Recommended default: draft-simple**
  (pragmatic, fully supported); DFlash = stretch.
- **Step 2 dataset:** Phase 2+3 gated JSONL; hold out validation split.
- **Step 3 quantize:** Q4_K_M / IQ4_XS GGUF (~200-400 MB).
- **Step 4 validate:** DFlash skip decoder / acceptance harness; compare vs Anbeeld
  baseline.

### Phase 6 — Swap-in + end-to-end benchmark
- Reuse `~/.local/share/llamacpp-bench/run-dflash-sweep.sh` + corpus.
- Measure t/s + acceptance vs Anbeeld baseline at identical 8 GB VRAM; confirm
  decode faster + content quality unchanged/better. Produce final comparison table.

---

## Acceptance criteria (whole loop)
1. Vendor PDF → normalized steps through existing pipeline (vendor-protocol tests pass).
2. Each accepted graph captured as (prompt, step_text, graph) pair (Phase 2 exporter green).
3. Deterministic compiler re-derives accepted graph at agreement ≥ threshold (Phase 3 green).
4. Trained draft (DFlash or draft-simple) shows decode-speed-up and/or acceptance
   gain at same 8 GB VRAM vs baseline (Phase 6).

## Risks / open decisions
- **DFlash trainer pair-compatibility is the big unknown.** Fallback draft-simple
  distillation is fully supported. Default assumption: draft-simple.
- **Data volume:** cold-start small → Phase 2/3 must seed with existing
  vendor-protocol goldens + synthetic pairs.
- **Deterministic agreement threshold is a policy** — make it a named constant (0.8+).
- **Exact content only:** exporter reads committed graph (never preview/ghost).
- **Open questions for Brad:** draft-simple vs DFlash default; thin vs new-surface
  UI; minimum target corpus size; where trained drafts live long-term.

## Decided defaults (fill in when confirmed)
- Training target: **draft-simple** (default) / DFlash (stretch)
- Thread capture: **structured `metadata.consumedContext`** (default) / content prefix
- Agreement threshold: **0.8+** (default)
- UI: **thin affordance** (default)

## Files & artifacts to resume from
**Repo** (`/home/brad/git/computable-lab`, branch `feat/ai-extension-api`):
- Ingestion: `server/src/ingestion/vendor-protocol/`
- Threads: `server/src/ai-threads/` + `server/src/api/handlers/AiThreadHandlers.ts`
- Event graph persistence: `app/src/event-editor/eventGraphPersistence.ts`
- AI chat: `app/src/shared/hooks/useAiChat.ts`, `app/src/types/aiContext.ts`

**ML/bench (8GB box):**
- Write-up: `~/.local/share/llamacpp-bench/DFlash-experiment.md`
- Result TSVs: `~/.local/share/llamacpp-bench/results/sweep-{IQ3_S,Q4_K_M}.tsv`
- Harness: `~/.local/share/llamacpp-bench/run-dflash-sweep.sh`
- Corpus: `~/.local/share/llamacpp-bench/event-corpus/corpus.json`
- Runtime: `/home/brad/git/beellama.cpp/build/bin/llama-server`

## Recommended execution order
1. Phase 1 (step-context capture) — small, unblocks correct training pairs.
2. Phase 2 (PairExporter) + test.
3. Phase 3 (DeterministicFitCheck) + test.
4. Phase 4 (UI affordance).
5. Phase 5 (draft training) — start draft-simple distillation.
6. Phase 6 (swap-in benchmark).
