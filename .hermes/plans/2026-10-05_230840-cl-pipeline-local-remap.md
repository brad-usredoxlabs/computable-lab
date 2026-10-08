# Plan: Fully-local CL pipeline remap (appliance-2 coder + adversarial reviewer + thunderbeast orchestration)

## Goal

Remap the computable-lab Hermes pipeline to a fully-local scheme: coder + adversarial reviewer run single-concurrency on appliance-2's fast 3-bit model; orchestrator, architect, browser-reviewer, and a new spec-composer run on thunderbeast's vision-capable vLLM endpoint; no paid OpenRouter calls remain in the loop.

## Current context / assumptions (all verified live on 2026-10-05)

Endpoints:

| Endpoint | Server | Model | Concurrency | Vision | Status |
|---|---|---|---|---|---|
| `http://appliance-2:18080/v1` | llama.cpp | `qwen3.8-flash-next-iq3_xxs` (3-bit GGUF) | **1 slot**, 128K KV, 8-bit KV | **NO** — server started without vision encoder; image requests return HTTP 400 | LIVE, API-key auth (401 without key) |
| `http://thunderbeast:8080/v1` | vLLM | `qwen3.8-flash-next` | continuous batching, `max_model_len: 262144` | **YES** — verified: a generated 96x96 solid-red PNG sent as a `data:image/png;base64` `image_url` part returned `content: "\n\nRed"` with `finish_reason: stop` (88 prompt tokens, 50 reasoning tokens) | LIVE, no auth |
| `http://appliance-2:11434/v1` | ollama | `qwen3.6-35b-a3b` | — | — | **DEAD** (`/api/tags` returns empty). cl-junior, cl-browser-reviewer, cl-browser-scout currently point here. |
| `http://100.111.141.22:8080/v1` (computable) | llama.cpp | `spark-4b-thinking` (`Spark-X2.5-4B-Q4_K_M.gguf`, `-c 131072 -np 2`, q8_0 KV) | 2 slots, 65536/slot | **NO** — image request returns HTTP 500 `image input is not supported - hint: if this is unexpected, you may need to provide the mmproj`. Spark-X2.5-4B is a text-only model with its own architecture (`spark2_5`); no vision variant exists to attach an mmproj to. | LIVE — cl-scout stays here, untouched |

GPU headroom (measured, decides whether a local vision model is even possible):

| Host | GPU | Total | Used | Free |
|---|---|---|---|---|
| computable | RTX 4070 Laptop | 8188 MiB | 5860 MiB | **1976 MiB** |
| appliance-2 | RTX 5090 | 32607 MiB | 31688 MiB | **460 MiB** |

Consequence: neither box can host an ADDITIONAL small vision model alongside what already runs. computable has 1976 MiB free (spark-4b + its q8_0 KV owns the rest of the 8 GB card) and appliance-2's 5090 is fully consumed by the 3-bit coder. The resolution (Brad's call, adopted): **replace** spark-4b-thinking on computable with `Qwen3.5-4B` (vision-capable, hybrid attention+Gated DeltaNet) + its `mmproj-F16.gguf` — see Task 10. Q4_K_S weights 2.59 GB + 0.67 GB mmproj fits the 8 GB card with q8_0 KV at a reduced context; scout AND browser-reviewer can both run there, keeping thunderbeast free for the smart long-context work. Thunderbeast remains the fallback vision endpoint (verified working) if the local swap does not fit.

Thunderbeast concurrency (measured live 2026-10-06, benchmark `/tmp/tb_bench2.py`, zero preemptions in every phase):

- Hardware: DGX Spark, 128 GB unified memory, vLLM serving `qwen3.8-flash-next` (`max_model_len: 262144`). The model is a hybrid attention+Mamba/SSM architecture (vLLM cache config exposes `mamba_block_size: 16`, `mamba_cache_dtype`, `replayssm` knobs) — only a subset of layers consume KV blocks, and SSM state is constant-size per sequence. This is why real concurrency is far better than the naive `kv_cache_max_concurrency: 1.77` figure (that number assumes every request fills the full 262K window).
- KV pool: `num_gpu_blocks: 320`, `block_size: 8`, `kv_cache_size_tokens: 463459`, `gpu_memory_utilization: 0.8`, `enable_prefix_caching: True`.
- Cold 128K prefill: 133,506-token prompt processed in 12.6 s (~10.6K tok/s prefill). A 128K-context orchestrator is comfortably supported.
- Decode speed: 1 concurrent ≈ 40-170 tok/s range depending on output length; 4 concurrent × 512-token outputs: 26 s wall, ~20 tok/s per request, 78.6 tok/s combined; 8 concurrent: 37.9 s wall, ~13.7 tok/s per request, 108 tok/s combined. No preemption, no thrash at 8-way.
- Mixed load (1×128K + 3×8K concurrent): completed with zero preemption.

Conclusion: Brad's memory of "4 concurrencies with longer context was fine" is correct. The orchestrator (128K+) plus 3 ephemeral subagents fit simultaneously. **Rule: orchestrator gets the long window; ephemeral roles (architect, spec-composer, browser-reviewer) stay under ~64K each.** Screenshots cost ~1-2K KV tokens each — browser review is not the constraint.

KV headroom levers (if more is wanted): raise `gpu_memory_utilization` 0.8 → 0.9 (+~12% KV); set `kv_cache_dtype: fp8` (roughly doubles KV tokens on Spark's fp8-capable HW); enable `kv_offloading_size` to spill KV to the 128 GB unified RAM. All are vLLM launch-flag changes on thunderbeast, not code changes.

Profiles today (`/home/brad/.hermes/profiles/`): `orchestrator` (paid OpenRouter `deepseek/deepseek-v4.1-flash`), `architect` (thunderbeast), `architect-q38`, `cl-architect`, `cl-senior` (thunderbeast), `cl-worker` (thunderbeast), `cl-junior` (DEAD appliance-2:11434), `cl-scout` (computable spark-4b), `cl-browser-reviewer` (DEAD appliance-2:11434 + OpenRouter vision aux), `cl-browser-scout` (same).

Pipeline mechanics live in three places (all under `/home/brad/.hermes/`):
1. Each profile's `config.yaml` (model/provider/base_url), `SOUL.md` (role contract), `profile.yaml` (description).
2. `profiles/orchestrator/SOUL.md` — the roster + concurrency rules (lines ~24–29).
3. `profiles/orchestrator/scripts/cl-lane-tick.sh` — the cron-launched orchestrator dispatch prompt (steps 1–9 embedded in a heredoc `PROMPT`). Lanes: lane 1 → worktree `/mnt/vast/home/brad/git/cl-integration-1`, branch `cl/integration-1`, ports 3092/5192; lane 2 → `cl-integration-2`, `cl/integration-2`, 3093/5193.

Target architecture (Brad's proposal, adopted):

```
architect            thunderbeast   (unchanged)
orchestrator         thunderbeast   (was paid OpenRouter)
cl-browser-reviewer  thunderbeast   (local vision; OpenRouter aux removed)
cl-browser-scout     thunderbeast   (same)
cl-coder             appliance-2    single-concurrency fleet-wide (renamed cl-senior)
cl-adversarial-reviewer  appliance-2  NEW — same model, adversarial lens
cl-spec-composer     thunderbeast   NEW — writes next item's spec while current coder runs
cl-scout             computable     qwen35-4b-vision (REPLACES spark-4b-thinking — Task 10)
cl-browser-reviewer  thunderbeast   (default; optional computable variant once Task 10 passes)
cl-browser-scout     thunderbeast   (same)
cl-worker            thunderbeast   (kept as overflow coder if appliance-2 is down)
cl-junior            retired        (endpoint is dead; profile left in place, never dispatched)
```

Per-item flow: orchestrator dispatches cl-coder (appliance-2, under a fleet-wide lock) → on coder completion, dispatch cl-adversarial-reviewer (same endpoint, queues after coder) → if FIX verdict, dispatch fix run to the same coder worktree → if UI touched, dispatch cl-browser-reviewer (thunderbeast) → orchestrator verifies diff/tests itself, merges, writes handoff. Meanwhile (parallel): orchestrator dispatches cl-spec-composer for the NEXT ready item while the current coder is running.

Answer to "should the spec creator be another profile?": **Yes — `cl-spec-composer`.** The orchestrator is a one-shot 45-minute session with a small context budget; spec authoring needs deep repo reading (scout fan-out) and must not block the orchestrator's polling loop. A separate background profile keeps orchestrator context lean and makes the pipelining real.

## Hard rules for the implementer

- NEVER touch Brad's dev stacks (`:3001`/`:5174`) or any model server process. No `pkill`. This plan changes only Hermes profile files and one orchestrator script.
- Profile dirs are mode 600 and secret-bearing. The appliance-2 API key lives in `/home/brad/.hermes/config.yaml` under `providers.appliance-2` → `api_key`. Copy its value into profile configs where instructed. NEVER print, echo, commit, or paste the key into receipts, logs, or this plan's outputs.
- Before editing any profile config or SOUL, back it up: `cp <file> <file>.bak-20261005`. These dirs are not in git; the backup IS the commit cadence.
- Preserve exact existing YAML keys not mentioned in this plan. Only touch the blocks given.

---

## Task 0 — Preflight (read-only, 5 min)

Run and confirm each expected output before changing anything:

```bash
curl -s -m 8 http://appliance-2:18080/health
# expect: {"status":"ok","slots":0,...}  (slots busy count may vary)

curl -s -m 8 http://thunderbeast:8080/v1/models | head -c 200
# expect: ..."id":"qwen3.8-flash-next"... "max_model_len":262144 ... "owned_by":"vllm"

curl -s -m 8 http://appliance-2:11434/api/tags
# expect: EMPTY output (confirms cl-junior/reviewer endpoint is dead)

grep -rn "cl-senior" /home/brad/.hermes/profiles/orchestrator/ /home/brad/.hermes/cl/lanes/ 2>/dev/null | grep -v ".bak" | head -20
# expect: matches in orchestrator/SOUL.md and orchestrator/scripts/cl-lane-tick.sh
# (record the list — Task 7 must update every one)
```

If any expectation fails, STOP and report — the endpoint facts this plan is built on have changed.

## Task 1 — Rename cl-senior → cl-coder and point it at appliance-2 (10 min) — DONE 2026-10-06

```bash
cp /home/brad/.hermes/profiles/cl-senior/config.yaml /home/brad/.hermes/profiles/cl-senior/config.yaml.bak-20261005
hermes profile rename cl-senior cl-coder
```

Expected: rename succeeds; `/home/brad/.hermes/profiles/cl-coder/config.yaml` exists.

Edit `/home/brad/.hermes/profiles/cl-coder/config.yaml`. Replace the model block:

```yaml
model:
  default: qwen3.8-flash-next
  provider: custom
  base_url: http://thunderbeast:8080/v1
  api_mode: chat_completions
  api_key: local
```

with:

```yaml
model:
  default: qwen3.8-flash-next-iq3_xxs
  provider: custom
  base_url: http://appliance-2:18080/v1
  api_mode: chat_completions
  api_key: <COPY the api_key value from ~/.hermes/config.yaml providers.appliance-2 — do not print it>
  # appliance-2 llama-server runs 128K n_ctx in ONE slot (relaunched 2026-10-05,
  # 8-bit KV). A single request gets the full 131072 window; there is no second slot.
  context_length: 131072
```

Keep every other key in the file (`plugins`, `_config_version`, `agent`, `kanban`, `timeouts`) unchanged.

Verify:

```bash
hermes -p cl-coder -z "Reply with exactly: OK"
# expect: OK   (exit 0)
```

If you get 401 → wrong key. If connection refused → appliance-2 down; stop and report.

## Task 2 — Update cl-coder SOUL (10 min) — DONE 2026-10-06

`cp /home/brad/.hermes/profiles/cl-coder/SOUL.md /home/brad/.hermes/profiles/cl-coder/SOUL.md.bak-20261005`

In `/home/brad/.hermes/profiles/cl-coder/SOUL.md`:

1. First line: replace `You are the senior coder for computable-lab.` with `You are the coder for computable-lab (formerly senior-coder).`
2. Find the "Reconnaissance offload" section. It currently says you run on a large model that is slow per token and cites the scout endpoint. Replace ONLY the paragraph that begins `You run on a large model that is slow per token` with:

```
You run on appliance-2 qwen3.8-flash-next-iq3_xxs (llama.cpp http://appliance-2:18080/v1, ONE slot, 128K window, ~3x faster than any other local model). You are the fleet's single-concurrency coder: the adversarial reviewer queues on the same slot after you. Scout calls go to a separate host (computable spark-4b at http://100.111.141.22:8080/v1, 2 slots, 65536/slot) and do NOT contend with your inference — run up to 2 concurrently and keep each question's input under 32K. Your model is 3-bit quantized: expect edge errors in strict TypeScript, exactOptionalPropertyTypes, and long multi-file edits — run typecheck and targeted tests after every edit, never trust an unverified edit, and treat the adversarial reviewer's defect list as expected, not insulting.
```

3. Find the sentence `Preserve independently running Qwen on appliance-2:11434 and other model services.` and replace it with `Preserve all model services: appliance-2:18080 (your endpoint), thunderbeast:8080, computable:8080. Never restart or kill them.`

Verify:

```bash
grep -c "appliance-2:18080" /home/brad/.hermes/profiles/cl-coder/SOUL.md
# expect: 1
grep -c "11434" /home/brad/.hermes/profiles/cl-coder/SOUL.md
# expect: 0
```

## Task 3 — Create cl-adversarial-reviewer (15 min) — DONE 2026-10-06, MODIFIED per Brad's ruling (see Risk 2)

```bash
hermes profile create cl-adversarial-reviewer
```

Write `/home/brad/.hermes/profiles/cl-adversarial-reviewer/config.yaml` (full file):

```yaml
model:
  default: qwen3.8-flash-next-iq3_xxs
  provider: custom
  base_url: http://appliance-2:18080/v1
  api_mode: chat_completions
  api_key: <COPY from ~/.hermes/config.yaml providers.appliance-2 — do not print it>
  context_length: 131072
plugins:
  enabled: []
_config_version: 40
agent:
  reasoning_effort: high
kanban:
  dispatch_in_gateway: false
platform_toolsets:
  cli:
    - file
    - session_search
    - skills
    - terminal
    - todo
terminal:
  timeout: 600
```

(No `clarify`, no `memory`, no `browser`, no `vision`: this role is read-and-judge only, and the model has no vision.)

Write `/home/brad/.hermes/profiles/cl-adversarial-reviewer/SOUL.md` (full file):

```
You are the adversarial code reviewer for computable-lab. You run on the SAME 3-bit model as the coder (appliance-2 qwen3.8-flash-next-iq3_xxs) on purpose: your job is to catch the edge errors quantization and speed invite. You are hostile by default: assume the diff contains a defect until proven otherwise. You never fix code, never merge, never commit, never mark anything done. You report to the orchestrator.

Input contract (given in every task): item id, the coder's worktree path (under /mnt/vast/home/brad/git/wt/), its branch, the approved spec path under the lane worktree's .hermes/plans/, the coder's report path, and your unique output report path.

Review procedure, in order:
1. git -C <worktree> diff <base-branch>...<branch> — read the FULL diff. No file in the diff may go unread.
2. Read the spec. List its acceptance criteria verbatim.
3. Run the checks yourself in the worktree: the targeted tests the spec names, plus npm run typecheck. Real output, quoted in your report. A coder claim of "tests pass" is not evidence; your own run is.
4. Hunt specifically for:
   - Hardcoded domain logic in TypeScript (schema-name branching, inline business rules that belong in lint YAML). The hard boundary: if the system could fake it by hardcoding, that is a REJECT.
   - Ajv bypasses or parallel validation logic (Ajv is the single validation authority).
   - exactOptionalPropertyTypes violations: optional fields set to undefined instead of absent.
   - Collapsed materials hierarchy (concept vs formulation vs instance vs aliquot vs composition) or free text where an ontology term / CURIE belongs.
   - Knowledge-layer violations: claim vs context vs assertion conflated, evidence citing well positions instead of the context graph.
   - Tests that assert nothing, or acceptance criteria the diff does not actually exercise.
   - Files touched outside the approved scope / file ownership.
   - YAML changes (schema/lint/ui) that the coder verified without a stack restart (tsx --watch does not reload YAML).
5. Verdict: ACCEPT (no defects found, with your command outputs as evidence) or FIX (numbered defect list: each with path:line, severity blocker|major|minor, the rule it violates, and a suggested fix direction — never a written-out patch).

Write your report to your unique output path. Return to the orchestrator: verdict, defect count, report path, and the exact commands you ran with their results. Silence on a criterion you did not check is a lie: list every criterion and how you checked it.
```

Write `/home/brad/.hermes/profiles/cl-adversarial-reviewer/profile.yaml`:

```yaml
description: 'CL adversarial code reviewer on appliance-2 qwen3.8-flash-next-iq3_xxs
  (same model as the coder, queued on its single slot): reads the full diff, re-runs
  tests and typecheck, hunts hardcode/Ajv/ontology/edge errors, returns ACCEPT or a
  numbered defect list. Read-only; never fixes or merges.'
description_auto: false
```

Verify:

```bash
hermes -p cl-adversarial-reviewer -z "Reply with exactly: OK"
# expect: OK
```

## Task 4 — Create cl-spec-composer (15 min) — DONE 2026-10-06

```bash
hermes profile create cl-spec-composer
```

Write `/home/brad/.hermes/profiles/cl-spec-composer/config.yaml` (full file):

```yaml
model:
  default: qwen3.8-flash-next
  provider: custom
  base_url: http://thunderbeast:8080/v1
  api_mode: chat_completions
  api_key: local
plugins:
  enabled: []
_config_version: 40
agent:
  reasoning_effort: high
kanban:
  dispatch_in_gateway: false
platform_toolsets:
  cli:
    - file
    - session_search
    - skills
    - terminal
    - todo
terminal:
  timeout: 300
```

Write `/home/brad/.hermes/profiles/cl-spec-composer/SOUL.md` (full file):

```
You are the spec composer for the computable-lab pipeline. While the current coder run is executing, you write the implementation spec for the NEXT ready item in the lane's task list, so the coder can start the moment the current item clears. You never write product code, never dispatch workers, never merge, never edit the task list (the orchestrator owns it).

Input contract: lane number, lane list path, lane integration worktree path (e.g. /mnt/vast/home/brad/git/cl-integration-1), the item id you are specifying, the newest handoff path, and your unique output spec path under <worktree>/.hermes/plans/.

Procedure:
1. Read the item block in the lane list, its binding decisions, and the newest handoff under <worktree>/.hermes/plans/handoffs/.
2. Read /mnt/vast/home/brad/git/computable-lab/CLAUDE.md and, if the item touches claim/context/context-role/assertion/evidence/mechanism-model, docs/knowledge-layer-canonical-example.md.
3. Orientation recon: for each bounded question about EXISTING code (where does X live, which files span flow Y, what does schema Z already declare), dispatch `hermes -p cl-scout -z '<one bounded, self-contained question>'` — up to 2 concurrently, input under 32K each. Scout output is SCREENING, not authority (~91% field-accurate, fully correct ~5/8): verify anything load-bearing yourself with read_file/search_files before citing it in the spec.
4. Write the spec to your unique output path. It must contain: goal (one sentence); exact file paths in scope and explicitly out of scope; the acceptance criteria verbatim from the task list; a first targeted check (the single command that proves the approach early); complete verification commands with expected output (test command, typecheck); the worker contract fields (worktree branch name off the lane trunk, unique deliverable path pattern); and — anticipating the adversarial review — an explicit "reviewer bait" section naming the likely edge errors for this item (exactOptionalPropertyTypes sites, YAML-reload traps, ontology terms required, hardcode boundary) so the coder pre-empts them.
5. Return to the orchestrator: spec path, one-paragraph summary, open questions you could not resolve locally (max 3, each with what you checked).

The orchestrator reviews your draft, fixes or approves it, and promotes it to the canonical spec path. Your draft is never dispatched to a coder unreviewed.
```

Write `/home/brad/.hermes/profiles/cl-spec-composer/profile.yaml`:

```yaml
description: 'CL spec composer on thunderbeast Qwen3.8: while the current coder run
  executes, drafts the next ready item''s implementation spec (scout recon, acceptance
  criteria, verification commands, reviewer-bait section) for orchestrator review.
  Never codes, never dispatches, never edits the task list.'
description_auto: false
```

Verify:

```bash
hermes -p cl-spec-composer -z "Reply with exactly: OK"
# expect: OK
```

## Task 5 — Move browser-reviewer and browser-scout — DONE 2026-10-06, MODIFIED: they point at computable qwen35-4b-vision (Brad: "qwen-4B on computable is the browser-reviewer — that's the only vision we need"). OpenRouter aux/fallback blocks deleted; native vision verified (red PNG → "Red").

For EACH of `cl-browser-reviewer` and `cl-browser-scout`:

```bash
cp /home/brad/.hermes/profiles/<name>/config.yaml /home/brad/.hermes/profiles/<name>/config.yaml.bak-20261005
```

In each `config.yaml`, replace the model block:

```yaml
model:
  default: qwen3.6-35b-a3b
  provider: custom
  base_url: http://appliance-2:11434/v1
  api_mode: chat_completions
  api_key: local
```

with:

```yaml
model:
  default: qwen3.8-flash-next
  provider: custom
  base_url: http://thunderbeast:8080/v1
  api_mode: chat_completions
  api_key: local
  context_length: 262144
```

And DELETE the two auxiliary-vision lines:

```yaml
auxiliary:
  vision:
    provider: openrouter
    model: qwen/qwen3.8-flash
```

Keep `fallback_providers` and the `providers.openrouter` block ONLY if the vision smoke test below fails; if it passes (local vision works), delete `fallback_providers` and the `providers:` block too — the point of this migration is zero paid calls. Keep `terminal.timeout: 600`, all toolsets, timeouts unchanged.

Vision smoke test (this is the gate for the whole task):

```bash
python3 - <<'EOF'
import zlib, struct, base64, json, urllib.request
def png(w,h,rgb):
    raw=b''.join(b'\x00'+bytes(rgb)*w for _ in range(h))
    def c(t,d):
        import zlib as z; return struct.pack('>I',len(d))+t+d+struct.pack('>I',z.crc32(t+d)&0xffffffff)
    return b'\x89PNG\r\n\x1a\n'+c(b'IHDR',struct.pack('>IIBBBBB',w,h,8,2,0,0,0))+c(b'IDAT',zlib.compress(raw))+c(b'IEND',b'')
b64=base64.b64encode(png(48,48,(220,30,30))).decode()
body={"model":"qwen3.8-flash-next","max_tokens":64,"messages":[{"role":"user","content":[{"type":"text","text":"What single color name best describes this image? One word."},{"type":"image_url","image_url":{"url":"data:image/png;base64,"+b64}}]}]}
req=urllib.request.Request("http://thunderbeast:8080/v1/chat/completions",data=json.dumps(body).encode()); req.add_header("Content-Type","application/json")
r=json.loads(urllib.request.urlopen(req,timeout=90).read().decode())
m=r["choices"][0]["message"]; print((m.get("content") or m.get("reasoning") or "")[:120])
EOF
```

Expected: output contains the word `red` (it may appear in the reasoning text). Then confirm the profile's own vision tool works:

```bash
hermes -p cl-browser-reviewer -z "Use the vision_analyze tool on /mnt/vast/home/brad/git/computable-lab/tmp/ if a .png exists there, else create one with the python snippet above saved to /tmp/red-test.png and analyze it. Report the color you see."
# expect: a response naming red, with no openrouter call and no vision-provider error
```

If Hermes's vision tool insists on an auxiliary provider and errors without it, restore the `auxiliary.vision` openrouter block, note it in your report to Brad as the one remaining paid dependency, and continue — do not rabbit-hole.

Update each `profile.yaml` description: replace `appliance-2 Qwen3.6-35B-A3B` with `thunderbeast Qwen3.8 (vLLM, local vision)`.

Verify:

```bash
grep -c "11434" /home/brad/.hermes/profiles/cl-browser-reviewer/config.yaml /home/brad/.hermes/profiles/cl-browser-scout/config.yaml
# expect: 0 for both
```

## Task 6 — Move orchestrator to thunderbeast (10 min) — DONE 2026-10-06 (also deleted its dead auxiliary.vision openrouter block; added supports_vision: true)

```bash
cp /home/brad/.hermes/profiles/orchestrator/config.yaml /home/brad/.hermes/profiles/orchestrator/config.yaml.bak-20261005
```

Replace the first 5 lines of `/home/brad/.hermes/profiles/orchestrator/config.yaml`:

```yaml
model:
  default: deepseek/deepseek-v4.1-flash
  provider: openrouter
  base_url: https://openrouter.ai/api/v1
  api_mode: chat_completions
```

with:

```yaml
model:
  default: qwen3.8-flash-next
  provider: custom
  base_url: http://thunderbeast:8080/v1
  api_mode: chat_completions
  api_key: local
  context_length: 262144
```

Keep `database`, `runtime`, everything else. Update `profile.yaml` description: replace `(paid)` with `(local thunderbeast)` and `cl-senior/cl-junior/cl-worker` with `cl-coder/cl-adversarial-reviewer/cl-spec-composer/cl-worker`.

Verify:

```bash
hermes -p orchestrator -z "Reply with exactly: OK"
# expect: OK
```

## Task 7 — Rewrite orchestrator SOUL roster + lane-tick dispatch prompt (20 min) — DONE 2026-10-06

### 7a. `profiles/orchestrator/SOUL.md`

Back it up. Replace the roster bullet list (the block containing the `cl-senior`, `cl-junior`, `cl-scout`, `cl-browser-reviewer`, `cl-browser-scout` bullets — read lines ~22–32 first to get the exact current text) with:

```
- `cl-coder` — the single fleet coder on appliance-2 qwen3.8-flash-next-iq3_xxs (llama.cpp http://appliance-2:18080/v1, API-key auth, ONE slot, 128K window, ~172 tok/s generation). FLEET-WIDE SINGLE CONCURRENCY: at most ONE live cl-coder across BOTH lanes at any time. Before dispatching, acquire the fleet coder lock: `flock -n /home/brad/.hermes/cl/appliance2-coder.lock -c 'echo $$ > /home/brad/.hermes/cl/appliance2-coder.pid'` held for the dispatch command only; if the lock is held, do NOT dispatch a coder — do spec-composition, review, or recovery work instead and retry next tick. Record the coder PID+item in the lock's pid file; a coder is dead only when its PID is gone AND its log shows no completion.
- `cl-adversarial-reviewer` — mandatory code gate on the SAME appliance-2 endpoint (it queues behind the coder's slot — dispatch it only after the coder process exits). Every coder output gets adversarially reviewed before you verify and merge. On FIX verdict, send the defect list to a new coder run on the SAME worktree/branch; max two review cycles, then route to architect.
- `cl-spec-composer` — drafts the NEXT ready item's spec on thunderbeast while the current coder runs. Dispatch it in the background as soon as you claim an item for coding; review its draft before any coder sees it; you promote it to the canonical spec path.
- `cl-worker` — overflow coder on thunderbeast. Use ONLY when appliance-2 is down or the coder queue is blocked past its due check; same dispatch mechanics as cl-coder, minus the fleet lock.
- `cl-scout` — bounded read-only recon on computable Spark 4B (`spark-4b-thinking`, llama.cpp `http://100.111.141.22:8080/v1` over Tailscale, 2 slots, 65536/slot). Run up to 2 concurrently, keep each task under 32K. Screening, not authority (~91% field-accurate, fully correct ~5/8): verify load-bearing findings yourself. Report outages honestly.
- `cl-browser-reviewer` — the mandatory UI acceptance gate on thunderbeast Qwen3.8 (vLLM, local vision, 262K window): Playwright + vision + receipts under ~/.hermes/cl/receipts/. Up to 2 concurrent reviewers across lanes.
- `cl-browser-scout` — browser tour for design-phase assessment, same thunderbeast endpoint.
- `cl-junior` — RETIRED (its appliance-2:11434 endpoint is dead). Never dispatch it.
```

Also in the same file, find the line beginning `Launch them with \`hermes -p <profile> -z` — keep it — and find any remaining `cl-senior` mentions and replace with `cl-coder`.

Thunderbeast capacity note: add one line after the roster:

```
Thunderbeast (vLLM, continuous batching, 262K) hosts orchestrator, architect, spec-composer, browser-reviewer/scout and overflow cl-worker: keep at most 4 concurrent thunderbeast sessions total (yourself included) and reserve headroom for architect decisions.
```

### 7b. `profiles/orchestrator/scripts/cl-lane-tick.sh`

Back it up. Inside the heredoc `PROMPT`, replace step 5 (the paragraph starting `5. Dispatch workers. CONCURRENCY IS SHARED:`) with:

```
5. Dispatch workers. CODER IS FLEET-SINGLE: cl-coder runs on appliance-2's ONE-slot endpoint shared by BOTH lanes — at most ONE live cl-coder across the whole fleet, acquired via the flock at /home/brad/.hermes/cl/appliance2-coder.lock (see SOUL). If held, dispatch no coder this tick; instead advance spec-composition, adversarial review, browser review, or blocker recovery. As soon as you claim an item for coding, ALSO dispatch cl-spec-composer in the background for the next ready item (unique spec path, thunderbeast). Branch each coder off `${BRANCH}` inside its own git worktree under /mnt/vast/home/brad/git/wt/${item}-lane${LANE}. DISPATCH MECHANICS: (a) launch with the terminal tool in BACKGROUND (background=true); (b) redirect stdout+stderr to the worker's own fixed log path — that log is your ONLY observability; (c) observe by bounded polling within your invocation budget; at budget expiry checkpoint process/session identity and artifact paths without killing them; (d) NEVER re-dispatch a worker for the same item while it is alive.
```

Replace step 6 (starting `6. VERIFY YOURSELF`) with:

```
6. ADVERSARIAL GATE, then VERIFY YOURSELF: when a coder's process exits, dispatch cl-adversarial-reviewer (same appliance-2 endpoint — it queues after the coder slot; coder must be gone first) with the item id, worktree path, branch, spec path, coder report path, and a unique review-report path. On FIX verdict, dispatch a fix run to the SAME worktree/branch with the defect list verbatim, then re-review; after two cycles without improvement, route to architect with evidence. Only after ACCEPT: verify yourself — real git diff, real test output, real typecheck. Never accept a worker summary of a diff you have not opened, and never accept before the adversarial gate passes.
```

Keep steps 1–4, 7–9 as-is (step 7's browser-reviewer text stays; it already dispatches against `http://localhost:${FPORT}` and the reviewer's endpoint change is invisible here).

Verify the script is still valid bash and the dry-run gate works:

```bash
bash -n /home/brad/.hermes/profiles/orchestrator/scripts/cl-lane-tick.sh && echo SYNTAX_OK
# expect: SYNTAX_OK
TICK_DRY_RUN=1 /home/brad/.hermes/profiles/orchestrator/scripts/cl-lane-tick.sh 1 | head -5
# expect: a "[dry-run] lane 1: N todo / ..." line followed by the resolved prompt containing
# "CODER IS FLEET-SINGLE" and "ADVERSARIAL GATE"
grep -c "cl-senior" /home/brad/.hermes/profiles/orchestrator/scripts/cl-lane-tick.sh
# expect: 0
```

## Task 8 — Fleet-wide reference sweep (5 min) — DONE 2026-10-06 (also updated cl-scout/cl-browser-* SOUL capacity sections, architect + cl-architect dispatch_profiles and roster text, orchestrator memories)

```bash
grep -rln "cl-senior" /home/brad/.hermes/profiles/ /home/brad/.hermes/cl/ 2>/dev/null | grep -v ".bak"
```

Expected after Task 7: only `cl-coder/SOUL.md` (the "formerly senior-coder" sentence) and `cl-coder/profile.yaml` may mention it; anything else gets the same rename treatment. Also sweep the dead endpoint:

```bash
grep -rln "11434" /home/brad/.hermes/profiles/ 2>/dev/null | grep -v ".bak"
```

Expected: only `cl-junior/config.yaml` (retired profile, left in place). cl-worker/cl-scout/architect SOUL files must not have been touched.

## Task 9 — End-to-end smoke (15 min) — DONE 2026-10-06: CODER-OK → REVIEW-OK serialized, SPEC-OK, browser reviewer answered "Red" natively, lane 1+2 dry runs show CODER IS FLEET-SINGLE + ADVERSARIAL GATE, SCOUT-OK. Cron jobs lane-1/lane-2 (*/20) invoke the updated cl-lane-tick.sh via lane wrappers — no cron changes needed.

1. Coder + adversarial serialization on one slot:

```bash
( hermes -p cl-coder -z "Reply with exactly: CODER-OK" ; hermes -p cl-adversarial-reviewer -z "Reply with exactly: REVIEW-OK" ) 2>&1 | tail -5
# expect: CODER-OK then REVIEW-OK, in order, no 429/queue errors
```

2. Spec composer on thunderbeast while appliance-2 is busy (start a 30-second appliance-2 job in background first if convenient; otherwise just run):

```bash
hermes -p cl-spec-composer -z "Reply with exactly: SPEC-OK"
# expect: SPEC-OK
```

3. Browser reviewer local vision:

```bash
hermes -p cl-browser-reviewer -z "Analyze /tmp/red-test.png with the vision tool and reply with the single color you see."
# expect: red  (file created in Task 5's smoke test)
```

4. Lane tick dry runs for both lanes (Task 7b commands, lane 2 too):

```bash
TICK_DRY_RUN=1 /home/brad/.hermes/profiles/orchestrator/scripts/cl-lane-tick.sh 2 | head -3
# expect: [dry-run] lane 2 line
```

5. Confirm zero paid traffic going forward: after the next real cron tick, check `sqlite3 /home/brad/.hermes/profiles/orchestrator/state.db "SELECT billing_provider, billing_base_url, api_call_count FROM session_model_usage ORDER BY last_seen DESC LIMIT 5;"` — expect `custom` / `http://thunderbeast:8080/v1`, no `openrouter`.

## Task 10 — Swap computable's spark-4b-thinking → Qwen3.5-4B vision (20 min) — DONE 2026-10-06

Brad's decision: the scout model becomes a vision model, so scout AND browser-reviewer can both run on computable and thunderbeast stays free for the smart long-context work.

Files already downloaded and verified on 2026-10-06 (sizes match the HF listing exactly):

```
/mnt/vast/home/brad/models/qwen35/Qwen3.5-4B-Q4_K_S.gguf   2,590,430,368 B
/mnt/vast/home/brad/models/qwen35/mmproj-F16.gguf             672,134,368 B
```

Verified facts:
- mmproj header: `general.architecture=clip`, `clip.projector_type=qwen3vl_merger`, `clip.has_vision_encoder=true`.
- The spark llama.cpp build b11095 (`/mnt/vast/home/brad/llama-spark-b11095/llama-b11095/llama-server`) has `qwen35`/`qwen35moe` in its arch registry AND `qwen3vl_merger` in its libmtmd — the swap is supported there.
- The older build b10820 (`/mnt/vast/home/brad/llama.cpp-src/build-cuda/bin/llama-server`) does NOT know qwen35 — do not use it for this model.

10a. Stop the current spark server (pre-authorized; target the exact PID — never a blanket pkill):

```bash
PID=$(ss -tlnp 2>/dev/null | grep ':8080' | grep -oE 'pid=[0-9]+' | head -1 | cut -d= -f2)
echo "will stop PID $PID (verify it is the llama-server serving spark-4b before killing)"
kill "$PID"
```

10b. Launch the vision scout (AS EXECUTED 2026-10-06 — the b11095 build needs the bundled CUDA runtime on LD_LIBRARY_PATH or it silently falls back to CPU; `-c 262144` OOM'd the compute buffers, `-c 131072 -np 1` fits):

```bash
LD_LIBRARY_PATH=/mnt/vast/home/brad/llama-spark-b11095/cudart-llama-b11095-bin-ubuntu-cuda-12.8-x64:$LD_LIBRARY_PATH \
/mnt/vast/home/brad/llama-spark-b11095/llama-b11095/llama-server \
  -m /mnt/vast/home/brad/models/qwen35/Qwen3.5-4B-Q4_K_S.gguf \
  --mmproj /mnt/vast/home/brad/models/qwen35/mmproj-F16.gguf \
  --alias qwen35-4b-vision --device CUDA0 --n-gpu-layers 99 --fit off \
  -c 131072 -np 1 -fa on --jinja --temp 0 --top-k 0 --top-p 0.95 --repeat-penalty 1.0 \
  --host 100.111.141.22 --port 8080 --reasoning on --reasoning-budget -1 \
  --cache-type-k q8_0 --cache-type-v q8_0 --image-min-tokens 1024 --seed 42 \
  2>&1 | tee /tmp/qwen35-server.log
```

Budget math (measured): weights+mmproj ≈ 3.3 GB, server total 6,398 MiB on GPU with 131K q8_0 KV, ~1.4 GB headroom left on the 8 GB card. Single 131,072-token slot (`n_slots = 1, n_ctx_slot = 131072`) — scout is one-shot recon, one huge slot beats two 64K ones. Prefill ~1,450 tok/s, decode ~55 tok/s.

10c. Verify text + vision on the new endpoint:

```bash
curl -s -m 30 http://100.111.141.22:8080/v1/chat/completions -H 'Content-Type: application/json' \
  -d '{"model":"qwen35-4b-vision","max_tokens":16,"messages":[{"role":"user","content":"Reply with exactly: OK"}]}'
# expect: "OK"
python3 /tmp/vision_probe2.py   # edit its URL/model constants to computable:8080 / qwen35-4b-vision first
# expect: the red-PNG probe answers "Red" on computable
```

10d. Point cl-scout at it — in `/home/brad/.hermes/profiles/cl-scout/config.yaml` (back up first as `config.yaml.bak-20261006`): `default: spark-4b-thinking` → `default: qwen35-4b-vision`; set `context_length` to the server's real per-slot window (32768 if `-c 65536 -np 2`); update the slot-window comment. Keep `compression.enabled: false` and `reasoning_effort: low`.

10e. Smoke test:

```bash
hermes -p cl-scout -z "Reply with exactly: SCOUT-OK"
# expect: SCOUT-OK
```

Rollback: the spark GGUF stays on disk (`/mnt/vast/home/brad/models/Spark-X2.5-4B-Q4_K_M.gguf`); if the new server fails to load (arch unsupported, OOM), relaunch the exact old spark command (captured in 10a's process inspection), leave cl-scout unchanged, and keep browser-reviewer on thunderbeast. Report the failure to Brad; do not rabbit-hole.

## Tests / validation summary

Each task ends with its own verification command and expected output above (smoke-test-per-profile stands in for TDD here: these are config/SOUL artifacts, not product code — the RED/GREEN analogue is "endpoint probe fails before the edit, passes after"). Commit analogue: the `.bak-20261005` copy before each edit. Do not proceed to the next task with a failing verification.

## Risks, tradeoffs, open questions

1. **Fleet-wide single coder halves lane parallelism.** Two lanes now serialize through one appliance-2 slot. That is Brad's explicit choice (single-concurrency is 1.4x faster than 2-slot on that box: 148 vs 107 combined tok/s). Mitigation: spec-composition and browser review overlap the coder run; cl-worker exists as thunderbeast overflow if a lane is blocked past its due check.
2. **Same-model adversarial review — RESOLVED by Brad 2026-10-06 (option c): reviewer on OpenRouter `deepseek/deepseek-v4.1-flash`** — different model family (decorrelated blind spots), fast, and it never contends with appliance-2 or thunderbeast capacity. Task 3's config/SOUL reflect this instead of the appliance-2 plan; the "queues on the coder's slot" clause was dropped from SOUL and Task 7 ordering. This is the ONE remaining paid dependency in the loop, by explicit choice. Reviewer shares the coder's 3-bit model. It is an edge-error net (different prompt stance, fresh context, re-run tests), NOT a substitute for the orchestrator's own diff/test verification (step 6 keeps it) or the browser-reviewer gate (different box, different quantization). Two options, Brad's call:
   - **(a) as planned — reviewer on appliance-2.** Free, fast, queues on the coder's slot. Narrow its mandate to mechanical checks (spec conformance, unverified edits, schema/lint violations, `exactOptionalPropertyTypes`) so it does not pretend to judge taste.
   - **(b) reviewer on thunderbeast** (`qwen3.8-flash-next` NVFP4, different quantization → different blind spots, genuine disagreement). Costs KV contention but decorrelates. Fits: thunderbeast holds ~7 concurrent 64K sessions (see concurrency math above). If Brad picks (b), change only Task 3's `config.yaml` `base_url`/`model` to `http://thunderbeast:8080/v1` / `qwen3.8-flash-next`, drop the appliance-2 `apiKey` from that profile, and delete the "queues on the coder's slot" clause from its SOUL and from Task 7's dispatch ordering.
3. **adversarial-reviewer queues on the coder's slot.** If a coder session hangs, the reviewer blocks behind it. The lock rule (coder PID gone before reviewer dispatch) plus the existing "checkpoint, never kill" rule apply; a wedged appliance-2 request needs Brad's manual attention — the agent must not kill model servers.
4. **Hermes auxiliary-vision routing is unverified.** Task 5's smoke test decides whether local vision fully replaces the OpenRouter aux. If Hermes's vision tool hard-requires an auxiliary provider, one paid dependency survives; flagged, not rabbit-holed.
5. **`hermes profile rename` semantics** — verify it preserves SOUL/skills/state (it should; if it clones-and-leaves the old dir, delete `cl-senior` only after confirming `cl-coder` has the full state.db and SOUL).
6. **OpenRouter fallback removal is irreversible-ish** — the `.bak` files restore it in one copy.
7. **Open question (interpretation):** "the architect does browser-review and finalizes" — this plan keeps the orchestrator dispatching cl-browser-reviewer and merging (existing, proven mechanics) and leaves the architect as the decision escalator. If Brad literally wants the architect profile to run the review/finalize step, that is a one-line dispatch change in step 7 of the tick prompt — ask before executing that variant.
8. **appliance-2 key propagation:** three profile configs will hold the key (cl-coder, cl-adversarial-reviewer; orchestrator/reviewer/composer don't need it). All profile dirs are mode 600; never copy keys into receipts, lane configs, or reports.