# W211-MACH-1 SEAM A — wiring the lane stack's producer at its wire boundary

ORCHESTRATOR-OWNED STEPS ONLY. The coder never restarts the lane stack
(:3093/:5193). This file is the exact config diff + steps the orchestrator
applies so the golden harness leg (G1 in `app/e2e/w2-11-campaign-demo.spec.mjs`)
runs against the REAL lane UI with the natural-language producer replaced at
its own wire boundary (OQ1 ruling: SEAM A — config DATA, zero product code).

## WHAT CHANGES (one key, one file)

File: `/home/brad/.hermes/cl/lanes/2/lane2-config.yaml` (the lane stack's
CONFIG_PATH — verified via `/proc/<pid>/environ` of the :3093 process).

Add ONE block under the existing `ai:` section (sibling of `activeProfile` /
`profiles`):

```yaml
ai:
  activeProfile: qwen3.8-thunderbeast      # UNCHANGED — every other AI path
  profiles:                                 # UNCHANGED
    ...
  # W211-MACH-1 golden harness (SEAM A, spec ruling OQ1): the compile-path
  # producer (POST /api/intent/compile-from-prompt -> extractBranchQuestions
  # + compileFromSmallLlm) resolves its endpoint through ai.smallModel FIRST
  # (IntentCompileFromPromptHandlers.ts toInferenceConfig :84-121 — a declared
  # smallModel key wins with its own endpoint). Point it at the harness replay
  # server; every OTHER AI path (chat, assist/stream, router) keeps the active
  # profile.
  smallModel:
    baseUrl: http://127.0.0.1:43117/v1
    model: w211-golden-replay
```

No other key changes. No product code changes. The replay server is
transport-only (`replay-producer.mjs` — serves the frozen YAML blocks,
interprets nothing).

## EXACT STEPS (orchestrator)

1. Start the replay producer (harness-owned ephemeral port, never a product
   port). It must outlive the harness run and log to a path the harness can
   read back (the G1 leg's SEAM-A proof reads this log):

   ```bash
   cd /mnt/vast/home/brad/git/wt/W211-MACH-1-lane2-l2t1210
   W211_REPLAY_PORT=43117 \
   W211_REPLAY_LOG=/mnt/vast/home/brad/git/wt/W211-MACH-1-lane2-l2t1210/.run/w211/replay-requests.jsonl \
   setsid nohup node app/e2e/fixtures/w211-golden/replay-producer.mjs \
     > .run/w211/replay.log 2>&1 &
   curl -s http://127.0.0.1:43117/replay-health   # {"ok":true,"fixture":"w211-golden-zymo-bench-prep","version":1}
   ```

2. Apply the `ai.smallModel` block above to `lane2-config.yaml`.

3. Restart the lane stack (YAML is read at boot — `tsx --watch` does NOT
   reload YAML; the spec's YAML-reload trap names this the worst failure mode
   of this item): `cl-lane-stack.sh 2 restart` (BLOCKING, background only).

4. Run the harness (the G1 leg asserts the seam itself — it fails honestly if
   the producer calls did NOT land on the replay server's request log):

   ```bash
   cd app && BASE_URL=http://localhost:5193 API_URL=http://localhost:3093 \
   W211_REPLAY_LOG=/mnt/vast/home/brad/git/wt/W211-MACH-1-lane2-l2t1210/.run/w211/replay-requests.jsonl \
   npx playwright test w2-11-campaign-demo.spec.mjs --project=chromium -g "G1"
   ```

   (Without `W211_REPLAY_LOG` the leg defaults to the same path under the
   worktree's `.run/w211/` — pass it explicitly when the producer runs from a
   different cwd.)

5. To REVERT (any non-golden run that needs the real producer on the compile
   path): delete the `smallModel` block and restart the stack again.

## CODER-PROVEN PRECEDENT (this worktree, l2t1330 + l2t1740)

`scripts/w211-private-stack.sh` starts a coder-owned private stack (backend
:3193, frontend :5293, replay :43117, own data dir) with the SAME
`ai.smallModel` override generated into its own config (`.run/w211/config.yaml`,
mode 600, gitignored). The STEP 0 targeted probe
(`.hermes/plans/w211-step0/targeted-3193-check2.json`) and the G1 leg runs
below prove the override rewires the producer at its wire boundary: the
replay server's request log shows `branch-questions` + `intent-draw-tool`
entries served to the product server during real UI runs. The private stack
NEVER touches :3093/:5193/:3001/:5174 and kills only its own pidfiles/ports.

## HONEST LABEL (rides every evidence file)

Workflow-integration test; producer replaced at its wire boundary; NOT model
proof.
