# 8GB DFlash Model-Testing Plan — recap + how to extend

**Status:** recap of completed work (2026-08-03/04) + forward plan for testing more
models/setups. IQ4_NL + IQ4_XS arms DONE 2026-08-05 (see DFlash-experiment.md). See also
`~/.local/share/llamacpp-bench/DFlash-experiment.md` (results)
and `2026-08-04_protocol-loop-dflash-handoff.md` (the loop it feeds).

**Goal:** A reproducible method for benchmarking how well a model + speculative-
decoding setup performs on the Computable Lab event-editor's structured JSON/YAML
workload, on an **8 GB RTX 4070**, measuring **speed, acceptance, and accuracy** —
and a repeatable harness to keep testing new quants, targets, and drafters.

**Hardware baseline:** RTX 4070 Mobile 8 GB, driver 580, CUDA 13.0, BeeLlama v0.4.2
CUDA (sm_89). Runtime at `/home/brad/git/beellama.cpp/build/bin/llama-server`.

---

## Part 1 — RECAP: the six prompts (the corpus)

The workload is the leader JSON envelope the event editor produces:
`events[] / notes[] / unresolvedRefs[]` (shape from `server/prompts/event-graph-draft.md`).
Six prompts span increasing expected output length. Corpus file:

```
~/.local/share/llamacpp-bench/event-corpus/corpus.json
```

Each entry = `{ id, name, output_len, expected_min_events, user }` plus a shared
`context.system` (a trimmed real `event-graph-agent.md` prefix with stable labware /
well-state / vocab).

| id | name | output_len | user turn (condensed) |
|---|---|---|---|
| p1-single-add | single add_material | short | "Add 5 uL of 1 mM clofibrate in DMSO to wells A1 and A2 of plate-1." |
| p2-transfer | transfer + mix | medium | "Transfer 100 uL from reservoir-1 A1 to wells B1-B4 of plate-1, then mix." |
| p3-seq | add/dilute/incubate/read | medium-long | "Add 50 uL DMEM to C1-C6, transfer clofibrate stock into C1, 1:2 serial dilution C2-C6, incubate 37C 30min, read fluorescence." |
| p4-dilution-sweep | serial dilution 96-well | long | "8-point 3-fold serial dilution in row A from 1 mM A1, transfer 50 uL to B1-H1, media blank col 12, measure A340." |
| p5-plate-map | full 96-well load_plate | longest | "Temperature-gradient scan: load 200 uL buffer all 96 wells, set per-column temp 4C(col1)..42C(col12) in 3.45C steps." |
| p6-multi-read | multi-read + centrifuge | long | "Add 10 uL reporter to A1-D12, incubate 5 min, read luminescence every 5 min for 30 min, centrifuge 1000 rpm 2 min." |

Design notes:
- Prompts escalate output length short→longest to stress decode-vs-prefill and
  long-repetitive-JSON acceptance (the hardest case for a drafter).
- Same system/protocol prefix for all → we're isolating model/config differences,
  not prompt-construction noise.
- Greedy sampling (`--temp 0 --top-k 1`) for determinism; `--reasoning off` so the
  model emits structured JSON directly (not `reasoning_content`).

---

## Part 2 — RECAP: what we measured and how

### Metrics
Three axes the user cares about:
1. **Speed** — *decode* throughput in tokens/s. IMPORTANT: two columns exist in
   logs — **prefill** (~70-160 t/s, flat, does NOT vary with draft) vs **true
   generation `tg`** (~26-34 t/s, DOES vary with draft). Measure `tg` / decode, not
   prefill, for speculative-decoding conclusions.
2. **Acceptance** — DFlash draft **acceptance rate** (`accept_rate`, accepted /
   generated) + mean accept length. The load-bearing variable: it decides whether
   expert-offload to RAM is feasible.
3. **Accuracy / quality** — NOT a scalar; judged by **reading the produced content**:
   does it emit the structured JSON, follow the system prompt, resolve verbs, avoid
   bailing to tool-preamble? (The IQ3_S-vs-Q4_K_M content diff proved this axis is
   decisive even when speed/acceptance look close.)

### Harness
`~/.local/share/llamacpp-bench/run-dflash-sweep.sh`
- Outer loop: for each `--spec-draft-n-max` value, for each prompt: launch a fresh
  BeeLlama server (target + DFlash draft, `-ngl 99 --n-cpu-moe 999`, `--reasoning
  off`, greedy), wait for `/v1/models`, POST one chat completion, parse the log for
  `draft acceptance = X` + the `tg`/decode timing, kill server.
- Output: per-config `.log` files + `sweep-<TARGET>.tsv`
  (`prompt, output_len, draft_n, accept_rate, accepted, generated, mean_len, tokens_s, total_s`).
- Curated content capture (side script) writes the produced text per config so the
  accuracy/quality axis can be read.

### Completed runs (8 GB)
- **IQ3_S target** (13.7 GB), draft-n 2/3/4/5/8/16 × 6 prompts (8 and 16 hit 8 GB
  limits: n16=OOM, n8=segfault).
- **Q4_K_M target** (22.1 GB), draft-n 2/3/4/5 × 6 prompts, with the CORRECTED
  8 GB split `-ngl 99 --n-cpu-moe 999`. (First Q4_K_M run used the wrong 16 GB
  `--n-cpu-moe 24` and OOM'd — a harness/config bug we fixed, not a hardware limit.)

### Key results (see DFlash-experiment.md for full tables)
- Acceptance by draft-n (median): n2≈0.73-0.78, n3≈0.65-0.70, n4≈0.58, n5≈0.49.
  Q4_K_M ≥ IQ3_S at every draft-n.
- Per-prompt ceiling: p3-seq 0.986, p2-transfer 0.945 (Q4_K_M); p5-plate-map 0.79@n2.
- Decode ~26-34 t/s (Q4_K_M), flat across prompt length; prefill ~70-160 t/s.
- Quality: Q4_K_M drafts JSON correctly; IQ3_S (3-bit) bails to tool-preamble and
  refuses verbs — so Q4_K_M is the recommend on 8 GB despite near-equal speed.

### Hard limits found on 8 GB
- draft-n=8 → segfault in llama_decode CUDA path.
- draft-n=16 → OOM (draft buffer + target + RAM experts).
- Valid draft horizon on 8 GB: **2-5**, sweet spot **2-3**.

---

## Part 3 — FORWARD: how to test more models / setups

### Step 1 — make the harness measurement-clean (baseline + repeatability)
- **Add a no-spec baseline arm** to every run (`--spec-type none`) so speedup is
  measured against a real baseline, not assumed. Report `speedup = tg_dflash / tg_baseline`.
- **Record decision-relevant columns**: separate `decode_tps` (from `tg`) from
  `prefill_tps`; add `vram_used`, `ctx`, `batch/ubatch`, quant, `commit_id`, and the
  exact command so results are reproducible.
- **Emit versioned config fingerprint** in each log/TSV (Bee commit, model file+quant,
  flag set) — per BeeLlama AGENTS.md, benchmark claims need exact model/command/commit.

### Step 2 — expand the model/target matrix
New arms to test on the 8 GB card (each × draft-n 2/3/4/5, × 6 prompts, baseline
included):
- **Targets:** Qwen3.6-35B-A3B-UD-Q4_K_M (current best) vs IQ3_S vs a new
  **IQ3_XXS / Q3** vs **MTP-bundled Q4_K_XL** (tests whether MTP-as-draft beats the
  Anbeeld DFlash drafter on this workload)
- **Drafters (DFlash):** Anbeeld Q4_K_M (current) vs williamliao GGUF (dflash schema)
  vs Q5/Q8 draft quants — does draft fidelity change acceptance?
- **Draft-simple arm:** a small autoregressive drafter (e.g. Qwen3.5-4B) via
  `--spec-type draft-simple` + sweep `--spec-draft-n-max` — the fallback-training
  target for the protocol loop.
- **Sampling:** greedy (default) + a `--temp 0.6 --top-p 0.95` arm — does acceptance
  hold under production sampling?

### Step 3 — formalize the accuracy/quality axis (currently the gap)
We read content manually this time. To scale:
- **Extract the structured portion** of each response (the `events[]` JSON) and
  **validate it against the event-graph schema** → pass = structurally valid.
- **Diff against a golden/canonical graph** per prompt (exact/partial/mismatch) →
  a scalar `accuracy` score. Reuse the DeterministicFitCheck idea from the protocol
  loop: `runChatbotCompile(prompt)` vs accepted graph as the reference.
- Add these as harness columns so accuracy is quantified alongside t/s + acceptance,
  not eyeballed.

### Step 4 — gather a larger, more representative corpus
The 6 prompts are a strong starter but small. Grow it:
- Pull **real** accepted event-editor sessions from `var/ai-threads/` + persisted EVG
  records (once the protocol-loop capture is wired) → hundreds of real prompt→graph
  pairs.
- Add per-event-type coverage (centrifuge, serial dilution, plate -> plate transfers,
  multi-read timings) and failure/refusal cases.
- Keep the escalating-length structure but increase n (e.g. 6 → 30+ prompts).

### Step 5 — automate the sweep + reporting
- Drive the harness from a config table (target/draft/draft-n/sampling) instead of
  CLI args; emit one summary TSV + a compact HTML/Markdown report table.
- Add a **candidate gate**: any new model/config is "adoptable" only if it beats the
  current champ on (a) decode t/s, (b) median acceptance at its best draft-n, and
  (c) schema-valid output, at equal-or-lower VRAM — else reject with the evidence.

---

## Acceptance criteria (for the extended harness)
1. Every run includes a no-spec baseline; speedup is reported, not assumed.
2. `decode_tps`, `accept_rate`, `mean_len`, `vram`, and config fingerprint are in
   every output row — no ambiguity about what was measured.
3. Accuracy is quantified (schema-valid + diff vs reference), not just eyeballed.
4. Results are reproducible: exact model file, quant, flags, BeeLlama commit, date.

## Files
- Corpus: `~/.local/share/llamacpp-bench/event-corpus/corpus.json` (+ grow in Step 4)
- Harness: `~/.local/share/llamacpp-bench/run-dflash-sweep.sh` (modify in Steps 1/5)
- Results: `~/.local/share/llamacpp-bench/results/`
- Write-up: `~/.local/share/llamacpp-bench/DFlash-experiment.md`
- Runtime: `/home/brad/git/beellama.cpp/build/bin/llama-server`

## Open questions
- Should accuracy reference be the manually-confirmed graph (human gold) or the
  deterministic compiler's output (auto, cheaper)? Recommend: both, compare.
- GPU budget per sweep: a full matrix on 8 GB is slow (Q4_K_M loads ~40s+ each).
  Recommend batching runs in the background overnight.
- Do we formalize this as a reusable skill (benchmark harness + acceptance) for
  future model additions? Recommend yes.
