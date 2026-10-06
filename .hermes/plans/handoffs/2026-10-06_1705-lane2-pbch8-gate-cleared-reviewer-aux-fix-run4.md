# Handoff — LANE 2 tick 2026-10-06T17:05 EDT
## (PB-CH-8 hard gate CLEARED — option (a) recorded; reviewer compression-death ROOT-CAUSED + FIXED; AI-14 gate run 4 dispatched on the fixed route)

Campaigns: `ai-protocol-edit-and-router` + `page-builder channel`. Trunk `cl/integration-2` HEAD
**`68cd97df`** (code tip unchanged; docs-only since 1a9aa893). Lane stack :3093 (records 200) /
:5193 (200). Brad's :3001/:5174 untouched. Fleet coder lock **FREE**, zero live cl-coder (pgrep).

## Reconcile at tick start (verified with real output)
- PB-CH-2 spec-composer: python **1260414** ALIVE, wal advancing (17:00:58), ~3:05 elapsed;
  DRAFT file `.hermes/plans/2026-10-06_1355-PB-CH-2-workstate-draft-adapter-spec-DRAFT.md`
  still absent (written near exit; prior composers ran 2.5-3h). NOT re-dispatched.
- AI-14 gate run 3 (pid 1561766) EXITED ~16:45 — see infra post-mortem below.
- No coder live; stack healthy; corpus 2 pairs (AI-13 far below pre-registered min).

## PB-CH-8 BLOCKER CLEARED (the tick's due/changed blocker)
The architect delivered the decision packet: **CHOSEN OPTION: a** at
`/home/brad/.hermes/cl/lanes/2/decisions/PB-CH-7-ledger-storage.md:297` (md5 6b9f7e3c unchanged
since the 13:40 spot-verification — the architect authored it then; the watch fired on delivery).
Option (a) = append-only content-hashed workstate-snapshot journal under
`var/sessions/{userId}/journal/`, declarative capture/tag/retention YAML, audit-event linkage by
server-known canonical ids only, honest asOf "no history stored then", reattachment only via the
tier-2 card + shared executor; transport values only, NEVER knowledge records.
Queue transaction (under task-list.lock): PB-CH-8 `status: blocked` -> **todo**, inline blocker
fields replaced with a CLEARED note, DECISION CLEARED note appended to the PB-CH-7 block.
PB-CH-8 remains dependency-gated (deps PB-CH-2..6 open) — do NOT pre-dispatch.
Packet §5 FLAGS to carry into PB-CH-8's spec later: no audit hook on the session PUT path today
(`workspace-session.ts:32-33` builds its own store); unauthenticated cross-user
`GET /session/:userId` exists (architect ruled OUT of ledger scope -> lane-2 backlog candidate for
Brad, AS-PBCH7-OUT-OF-SCOPE-SESSION-AUTHZ-GAP); audit appends best-effort (links optional);
retention policy YAML is genuinely new data.

## REVIEWER COMPRESSION DEATHS — ROOT CAUSE FOUND + FIXED (change-of-diagnosis honored)
Runs died identically 3x (AI-11 run 3, AI-14 runs 2 and 3): session ends with 'Context compression
timed out without reducing this conversation', ZERO receipts. Run-3 post-mortem from the session DB
(cl-browser-reviewer state.db, session 20261006_161133_a8de40): 381 msgs / 191 tool calls, died at
mid-session compression; browser tooling was working (browser_console/browser_vision results
present) — NOT a hygiene failure, NOT product. ROOT CAUSE (source-read
`agent/auxiliary_client.py::_get_auxiliary_task_config` + profile config): with
`auxiliary.compression: provider auto`, the compression summary rides the SAME saturated local
131K model as the session, blowing the 120s default aux timeout every time the trail grows big.
FIX APPLIED: `hermes -p cl-browser-reviewer config set auxiliary.compression.provider openrouter`
+ `.model deepseek/deepseek-v4.1-flash` + `.timeout 300` (verified via `config get`; profile .env
already carries OPENROUTER_API_KEY; cheap model, same family as the adversarial reviewer).
Recorded as **AS-LANE2-REVIEWER-AUX-COMPRESSION-PINNED** (supersedes
AS-LANE2-REVIEWER-COMPRESSION-DEATH-RETRY-OK). NOTE: run-3's nohup log never materialized at the
planned path (log-observability gap when launched via `cd && nohup ... &` inside a hermes background
terminal); run 4 launched the same way but pgrep confirms liveness.

## AI-14 browser gate RUN 4 — LIVE (the only vision-slot occupant)
- bash pid **1655521** / hermes python ~1655576, started 16:55. Prompt
  `/tmp/lane2-ai14-run4-prompt.txt` = run-3 contract VERBATIM (candidate >= 7c418e36 containing
  merge cbacebab; criteria unchanged; hygiene override kept) with receipts dir updated to
  `/home/brad/.hermes/cl/receipts/PROTO-AI-14/2026-10-06_1655/`. Log
  `logs/review-PROTO-AI-14-gate-run4-20261006T1625`-pattern file
  `logs/review-PROTO-AI-14-gate-run4-20261006T1655.log` (buffered until exit).
- Premise re-verified healthy by the run-3 session itself before it died (real protocol_edit turn
  evidence in its transcript) + stack 200s.
- DO NOT re-dispatch while pid alive. If it dies with the SAME compression line -> the aux pin
  failed to load at session start: investigate auxiliary route resolution (hermes docs /
  provider-runtime), do NOT blindly re-dispatch a 5th run.
- On VERDICT accept: promote report -> `.hermes/plans/PROTO-AI-14-report.md`, mark AI-14 done,
  then AI-11 run 4 on the freed vision slot (prompt
  `prompts/review-PROTO-AI-11-rail-20261006T1055.txt` + keep-it-small note, fresh receipts dir;
  data commit 63bfab20 already adversarially accepted — the browser clause is AI-11's last gate).
  On fix: defect list + absolute screenshots -> coder on wt/PROTO-AI-14-lane2-l2t1020 (fix cycle
  1/2; queues behind PB-CH-2 coder for the fleet lock).

## Queue / dispatch order (resume exactly here)
1. PB-CH-2 composer exit -> review draft (load-bearing: adapter-capability verdict —
   projection-only + actor-binding within the existing contract, else stop-boundary to architect)
   -> promote -> CLAIM under queue lock -> dispatch cl-coder under the fleet lock into the
   ALREADY-PREPPED `wt/PB-CH-2-lane2-l2t1550` (branch cl/PB-CH-2-lane2-l2t1550 @ 1a9aa893;
   node_modules + 43 server/src symlinks replicated). Report path
   `.hermes/plans/PB-CH-2-report.wip-l2t1550.md`, log `logs/PB-CH-2-l2t1550.log`.
2. AI-14 run 4 verdict -> close or fix-queue. THEN AI-11 run 4 on the vision slot.
3. PB-CH-3 spec-composer commissioned after PB-CH-2 promotes (needs its contract).
4. Shadow corpus: `wc -l /home/brad/.computable-lab-lane2/shadow-router/events.jsonl` each tick
   (2 at checkpoint); AI-13 only at the pre-registered minimum (500 pairs / 50 protocol_edit),
   disclose AS-PROTO-AI-12-W1 QAD-Q4_0 at verdict.
5. Human artifacts UNCHANGED this tick (AI-11-data-approval f86d9e33, PB-CH-7 6b9f7e3c — the
   latter is architect-owned, its delivery is what cleared PB-CH-8): do not re-ask.

## Thunderbeast capacity at checkpoint
4-session ceiling: orch (this) + composer 1260414 = 2. Headroom OK.

## Live at checkpoint (NOT killed; do NOT duplicate)
- cl-spec-composer PB-CH-2: python **1260414** -> `.hermes/plans/2026-10-06_1355-...-DRAFT.md`
- cl-browser-reviewer AI-14 RUN 4: bash **1655521** -> `receipts/PROTO-AI-14/2026-10-06_1655/`

## assumptions:
- NEW **AS-LANE2-REVIEWER-AUX-COMPRESSION-PINNED** — reviewer profile aux compression pinned to
  openrouter deepseek-v4.1-flash @300s to kill the 3x compression-death pattern; run-4 outcome is
  the live verification. reversible true; evidence_debt false (config get shown). Owner:
  orchestrator. CLEARS AS-LANE2-REVIEWER-COMPRESSION-DEATH-RETRY-OK.
- Carried (unchanged): **AS-PROTO-AI-12-W1** (QAD-Q4_0 quant disclosure — DUE AT AI-13 VERDICT),
  AS-LANE2-SHADOW-CORRECTED-CONFIG-PATH, AS-LANE2-PBCH2-WTPREPPED-OFF-1A9AA893,
  AS-LANE2-WORKTREE-BOOTSTRAP-NODELINKS, AS-PROTO-AI-11-LANE2-STORE-SEED-TESTDATA,
  AS-PROTO-AI-11-AMEND-LOCAL-ONLY, AS-PROTO-AI-11-LBW-MATCH-REVIEW,
  AS-LANE2-11434-VISION-SERVICE-ALREADY-DOWN, AS-PROTO-AI-2-C1-ANCHOR, AS-PROTO-AI-9-C5-ROLENAME,
  AS-PROTO-AI-9-LANE2CONFIG-RECREATE, AS-PROTO-AI-9-W8, AS-PROTO-AI-9-SURFACE-MOUNTED,
  AS-PROTO-AI-9-RDEFECT2-PLACEMENT, AS-PROTO-AI-9-DRAFTCHANGES-LANE-LOCAL,
  AS-PROTO-AI-9-ISOLATED-STACK, AS-PBCH7-OUT-OF-SCOPE-SESSION-AUTHZ-GAP,
  AS-PBCH1-AMBIGUITY-MINIMAL-RULE.

## Open evidence-debt entries
- **AS-PROTO-AI-12-W1** — served router artifact is the QAD-Q4_0 quant of LFM2.5-350M (sha256
  3d10b6ab...); disclose with the PROTO-AI-13 verdict digest. STILL OPEN (due at AI-13).

## Baseline facts (carried; unchanged this tick)
- Trunk HEAD **68cd97df** (code tip d6e566e1). server src/ai: **10 failed files / 21 failed /
  565 passed** at d6e566e1; tsc server 33 lines; app tsc 47. Vitest src/ai ~15-30 s.
- :3093 has NO /health (404) — liveness via GET /api/records/PRT-4iaey2.
- Shadow telemetry: /home/brad/.computable-lab-lane2/shadow-router/events.jsonl; config lives ONLY
  in /home/brad/.hermes/cl/lanes/2/lane2-config.yaml (CONFIG_PATH).
- Carried pitfalls: lane-stack restart BLOCKING (background=true); `git worktree add` on NFS can
  exceed 120 s (background=true; on mid-copy timeout rm -rf + `git worktree prune` before re-add);
  bare worktree needs node_modules (3) + 43 server/src symlinks; NEVER `git add -A` in coder
  worktrees; NFS git -c core.fileMode=false; hermes -z buffers logs until exit; reviewer sessions
  die on aux-compression timeout (FIXED this tick via profile aux pin); lint schemaId full https
  form; SPA record route /record/<id>; lane data store
  /home/brad/.computable-lab-lane2/worktrees/main; verify NO live cl-coder session before trusting
  a free lock; NEW: reviewer launched via `cd && nohup hermes -z ... &` inside a background
  terminal may not produce the planned log file — verify liveness by pgrep + profile state.db wal,
  not the log path alone.
