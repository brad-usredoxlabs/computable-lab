# Handoff: DFlash 8GB Experiment + Universal→Local Protocol Loop
**Session:** 2026-08-03/04 (Hermes architect, computable box)
**Resume from anywhere — this doc is self-contained.**

---

## 1. What this thread produced (two pieces of work)

### A. DFlash-on-8GB experiment — COMPLETE
Qwen3.6-35B-A3B with DFlash speculative decoding on an **RTX 4070 Mobile 8 GB**,
specialized for the Computable Lab event-editor's structured JSON/YAML output.

### B. Universal→Local Protocol Loop — PLANNED, Phase 0 done
Vision: ingest vendor PDFs → AI turns into steps → user iterates step-by-step to a
confirmed local protocol (deterministic compiler + event-editor UI) → capture
(prompt → accepted graph) pairs → train a faster DFlash draft model.

---

## 2. Hardware / runtime state (computable box — all verified)

| Item | State |
|---|---|
| GPU | RTX 4070 Laptop 8 GB (8188 MiB), driver 580.178.04, CUDA 13.0. **LIVE** |
| Runtime | **BeeLlama.cpp v0.4.2** at `/home/brad/git/beellama.cpp/build/bin/llama-server` (CUDA, sm_89/90/100/120). Has `draft-dflash` |
| Target models | `~/.local/share/llamacpp-bench/` — Qwen3.6-35B-A3B-UD-{Q4_K_M (22.1GB), IQ3_S (13.7GB), MTP-UD-Q4_K_XL (22.9GB)} |
| DFlash draft | `qwen36-35b-a3b-dflash-Q4_K_M.gguf` (235 MB, Anbeeld) |
| Bench dir | `/home/brad/.local/share/llamacpp-bench/` (models, corpus, harness, results, `DFlash-experiment.md`) |

### The load-bearing config lesson (do NOT repeat the old mistake)
- **8 GB card:** `-ngl 99 --n-cpu-moe 999` → dense/attention to GPU, ALL MoE
  experts in system RAM. This is what makes 35B fit and run.
- **NEVER reuse the 16 GB recipe's `--n-cpu-moe 24`** (keeps 24 experts on GPU) on
  the 8 GB card — Q4_K_M oversubscribes and OOMs.
- Add `--reasoning off` so Qwen3.6 emits structured JSON directly (otherwise output
  goes to `reasoning_content` and `content` is empty).
- Draft horizon: `--spec-draft-n-max 2` or 3 (8→segfault, 16→OOM on 8 GB).

---

## 3. DFlash experiment results (final, definitive)

### Acceptance rate by draft-n (median, 6 event-editor prompts each)
| draft-n | IQ3_S | Q4_K_M |
|---|---|---|
| 2 | 0.728 | **0.784** |
| 3 | 0.652 | **0.697** |
| 4 | 0.575 | 0.577 |
| 5 | 0.489 | **0.511** |
| overall mean | 0.649 | **0.718** |

**Highlights:** p3-seq 0.986 (Q4_K_M n2), p2-transfer 0.945 (n3), p5-plate-map 0.79
(n2). Decode ~26-34 t/s (flat across workload); prefill ~70-160 t/s.

**KEY content-quality finding:** quant choice barely changes *speed*, but it
**changes output quality a lot**. On this structured workload, **IQ3_S (3-bit) is
measurably degraded** — it bails to tool-call preamble instead of drafting the
JSON, and refuses some verbs (e.g. temperature mapping on p5). **Q4_K_M drafts the
JSON correctly and follows the system prompt.** So: use Q4_K_M, not IQ3_S.

**Bottom line:** high DFlash acceptance (~0.78) on predictable event-editor JSON
makes keeping the 35B's MoE experts in RAM on an 8 GB card **feasible, not stupid**.

### Recommended 8 GB production config
```
Qwen3.6-35B-A3B-UD-Q4_K_M.gguf + qwen36-35b-a3b-dflash-Q4_K_M.gguf
-ngl 99 --n-cpu-moe 999 --spec-draft-n-max 2 --reasoning off --flash-attn on
```

---

## 4. The protocol-loop plan (the thing you'll pick up)

### The loop
```
vendor PDF → [ingest/parse] → protocol steps
           → [AI draft per step] → event graph
           → [deterministic compile + accept] → CONFIRMED local protocol
           → [user iterates in event-editor UI] → re-draft (loop)
           ↓
      capture (user prompt ←→ accepted graph) pairs → train DFlash draft
           ↓
      swap faster draft into BeeLlama → snappier decode at same VRAM
```

### Phase 0 VERIFIED (findings — read before building)
1. **Vendor ingestion pipeline is DONE + green**: `server/src/ingestion/vendor-protocol/`
   (candidate extractor → sectioner → normalizer → event-graph draft → promotion),
   22/22 tests pass. `cd server && npx vitest run src/ingestion/vendor-protocol`.
2. **Training seam exists**: `server/src/ai-threads/AiThreadStore.ts` persists
   threads to `var/ai-threads/{user}/{endpoint}.json`. `ThreadMessage` = role +
   `content` (user prompt) + `metadata` (open object). Promoted to `conversation`
   records via `AiThreadHandlers.promote`.
3. **CRITICAL**: the thread's `metadata.events` is the **PREVIEW/ghost** written at
   stream-`done` (`useAiChat.ts`), NOT the accepted graph. The **accepted/committed**
   graph lives separately in event-graph persistence
   (`app/src/event-editor/eventGraphPersistence.ts`, server-side `EVG-xxx` records,
   `persistAcceptedEventGraph` / `commitPreview`). The exporter MUST join thread
   prompt + persisted accepted EVG graph — never use the preview (would poison
   training with un-accepted ghosts).
4. **NEW GAP FOUND (2026-08-04, thread-end): the protocol STEP TEXT is not saved
   in the thread.** Data flow: user's typed `prompt` → saved as `content`. But the
   incoming protocol step text + surface context (labwares, volumes, equipment,
   deck, wells) live in `ctx.surfaceContext`, sent to backend as request context —
   **never persisted back into the thread**. So a thread captures the user's
   clarification prompt but NOT the protocol step it refers to. Training pairs are
   incomplete without both.

### The real implementation work (what Phase 1+ reduces to)
Stages 1 (ingest→steps) and 2 (AI draft→compile→accept→editor) are largely DONE.
Genuinely new work:

- **(A) Capture protocol-step context into the thread** [NEW — from gap found
  today]. In `useAiChat` user-message write, persist the resolved step/context as
  structured metadata (recommend `metering: metadata.consumedContext`/`metadata.step`
  from `surfaceContext`) so the thread self-contains prompt + step text. (Or prefix
  `content`. Recommend structured metadata.)
- **(B) PairExporter** [new server module, `server/src/ingestion/vendor-protocol/
  training/PairExporter.ts` + test]: join thread prompt + persisted accepted EVG
  graph (NOT preview) → JSONL `{system, user, step_text, accepted_events}`. Filter
  to accepted only.
- **(C) DeterministicFitCheck** [new, `.../training/DeterministicFitCheck.ts` +
  test]: for each pair, `runChatbotCompile(prompt)` and score agreement vs accepted
  events (exact/partial/mismatch). This proves the AI↔deterministic "tight fit"
  and gates which pairs train (agreement ≥ threshold, recommend 0.8+).
- **(D) UI affordance** [thin]: "Save as local protocol + tag training example" on
  the confirmed graph.
- **(E) Draft training** [outside repo, `~/.local/share/llamacpp-bench/dflash-train/`]:
  train a fast draft drafter. **Recommend draft-simple small autoregressive drafter
  first** (works with verified path), z-lab DFlash trainer = stretch (may not accept
  arbitrary prompt→graph pairs).
- **(F) Swap-in benchmark**: reuse `run-dflash-sweep.sh` to measure t/s + acceptance
  vs Anbeeld baseline at same 8 GB VRAM.

---

## 5. Files & artifacts to resume from

**Computable-lab repo** (`/home/brad/git/computable-lab`, branch `feat/ai-extension-api`):
- Plan: `.hermes/plans/2026-08-04_000000-protocol-loop-dflash-draft.md`
- Ingestion: `server/src/ingestion/vendor-protocol/`
- Threads: `server/src/ai-threads/` + `server/src/api/handlers/AiThreadHandlers.ts`
- Event graph persistence: `app/src/event-editor/eventGraphPersistence.ts`
- AI chat: `app/src/shared/hooks/useAiChat.ts`, `app/src/types/aiContext.ts`

**ML/bench (8GB box):**
- Experiment write-up: `~/.local/share/llamacpp-bench/DFlash-experiment.md`
- Result TSVs: `~/.local/share/llamacpp-bench/results/sweep-{IQ3_S,Q4_K_M}.tsv`
- Harness: `~/.local/share/llamacpp-bench/run-dflash-sweep.sh`
- Corpus: `~/.local/share/llamacpp-bench/event-corpus/corpus.json`
- Runtime: `/home/brad/git/beellama.cpp/build/bin/llama-server`

---

## 6. Next concrete steps (recommended order at work)

1. **Resume Phase 1 task (A)**: add protocol-step/context capture to `useAiChat`
   thread persistence (structured metadata). Small, unblocks correct training pairs.
2. **Build PairExporter (B)** + test — join prompt + accepted EVG graph.
3. **Build DeterministicFitCheck (C)** + test — the tight-fit proof + train-set gate.
4. **UI affordance (D)** — save-as-local-protocol + tag.
5. **Draft training (E)** — start with draft-simple distillation.
6. **Swap-in benchmark (F)**.

## 7. Decisions to confirm when you resume
- Draft target: draft-simple distillation (recommended) vs z-lab DFlash trainer.
- Thread capture method: structured `metadata.consumedContext` (recommended) vs
  content prefix.
- Deterministic agreement threshold (recommend 0.8+).
- Save-as-local-protocol: new first-class surface vs thin affordance (recommend thin).
