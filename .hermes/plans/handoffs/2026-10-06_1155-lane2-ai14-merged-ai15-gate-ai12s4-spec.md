# Handoff — LANE 2 tick 2026-10-06T11:55 EDT
## (AI-14 adversarial ACCEPT + merged + verification; AI-15 coder DONE, gate in flight; AI-12 §4 spec authored; PB-CH-1 spec-composer in flight)

Campaigns: `ai-protocol-edit-and-router` + `page-builder channel`. Trunk `cl/integration-2` HEAD
**`cbacebab`** (merge of PROTO-AI-14 fc85d998). Lane stack :3093/:5193 **200**. Brad's :3001/:5174
untouched. Coder lock: HELD during the AI-15 adversarial run (bash 993443; pid file cleared on
exit — the reviewer itself runs on OpenRouter, the lock was taken only as a spare-capacity guard).

## Reconcile at tick start (verified with real output)
- Handoff 10:58 resume: AI-11 run-3 reviewer LIVE (bash 874832, still live at 11:50, log buffered
  0 B until exit — NOT re-dispatched). AI-14 adversarial report present: **VERDICT: accept**,
  zero defects; 3 non-blocking observations recorded (see assumptions).
- No coder live at tick start; lock was free. Readiness: 0 due/changed blockers; human artifacts
  unchanged vs signed baselines (AI-11/AI-12 answered 2026-10-06 per earlier handoffs) — not re-asked.

## PROTO-AI-14 — ADVERSARIAL ACCEPT -> MERGED -> self-verified -> browser gate PENDING (vision slot)
- Opened the real three-dot diff myself: 7 files +510/-19 as reported; ChangesPanel.tsx change is
  the single `import './ChangesPanel.css'`; sessionYaml dedupe = last-wins Map after id
  re-derivation, follows the reducer convention (comment cites OpenTabsContext.tsx ~136-168);
  CSS is token-only: 0 hex/rgb literals, 52 var(--cl-*) usages.
- MERGE: `git -c core.fileMode=false merge --no-ff wt/PROTO-AI-14-lane2-l2t1020` clean ->
  trunk 4a4ed74f -> **cbacebab**. No YAML touched -> no stack restart needed.
- SERVED CHECK (myself, curl): :5193 serves ChangesPanel.css (vite HMR module) + ChangesPanel.tsx
  from the trunk checkout. App tsc at merged cbacebab: 47 error lines over 24 files, NONE in any
  merged file (ChangesPanel/sessionYaml/OpenTabsContext/WorkspaceTabStrip) -> zero new.
- BROWSER GATE NOT YET RUN: computable vision slot held by AI-11 run 3 (single slot). Prompt
  authored and READY: /home/brad/.hermes/cl/lanes/2/prompts/review-PROTO-AI-14-20261006T1130.txt
  (candidate cbacebab, served-check greps, criteria verbatim: both-theme distinct Accept/Reject,
  alert-styled error, console free of duplicate-key warning on the reload-dedupe repro).
  **NEXT TICK: dispatch cl-browser-reviewer with that prompt + receipts dir
  /home/brad/.hermes/cl/receipts/PROTO-AI-14/<timestamp>/. AI-14 stays in-progress until VERDICT:
  accept.**

## PROTO-AI-15 — claimed, dispatched, coder DONE; adversarial gate IN FLIGHT
- Claimed in-progress/owner cl-coder under the queue lock. Worktree
  wt/PROTO-AI-15-lane2-l2t1121 off **cbacebab** (node_modules symlinked — bootstrap now needs it).
- cl-coder dispatched 11:25 under fleet lock (bash 946297), exited code=0 ~11:40. ONE commit
  **6e51197ff30ef0aab42071983b65aae0af1c654c**, diff = exactly
  server/src/ai/promptBudget.test.ts (+78/-5). Report
  .hermes/plans/PROTO-AI-15-report.wip-l2t1121.md ends DONE.
- Coder claims (per its log): ceiling 47180 hardcoded w/ provenance, integer two-way guards via
  ratchetViolation helper, 3 red-first proofs, GREEN 6/6, src/ai 11/22 -> 10/21, tsc 33=33, no
  prompt shrunk. ALSO: it replicated trunk's ~50 gitignored root/hoisted node_modules + symlinks
  into its worktree to reach the 11/22 baseline (reviewer told to verify nothing of Brad's tree
  was touched).
- TRUNK BASELINE re-measured by me THIS tick at cbacebab: src/ai = **11 failed files / 22 failed
  tests** (matches spec) — so post-merge expectation for AI-15 is 10/21.
- ADVERSARIAL GATE IN FLIGHT: cl-adversarial-reviewer bash **993443**, log
  lanes/2/logs/review-run-PROTO-AI-15-20261006T1147.log, report
  lanes/2/logs/review-PROTO-AI-15-20261006T1147.md, prompt
  lanes/2/prompts/review-PROTO-AI-15-20261006T1147.txt.
- NEXT TICK: read verdict. ACCEPT -> merge --no-ff into trunk, re-run src/ai on merged trunk
  (expect 10/21), no YAML -> no restart, promote report, mark done. FIX -> defect list to a new
  coder run on the SAME worktree/branch (cycle 1/2).

## PROTO-AI-12 §4 — spec AUTHORED, queued next after AI-15
- .hermes/plans/2026-10-06_1152-PROTO-AI-12-s4-shadow-adapter.md (linked in the AI-12 task block).
  Orientation verified first-hand this tick: ShadowRouterConfig (config/types.ts:218), writer API
  (shadowTelemetry.ts:28-134), adapter site (AgentOrchestrator.ts:1842-1862 selectSubmitCall ->
  intent branches :1876/:1915/:1954), :8900 serving restored. p95 clause needs ≥50 real calls to
  appliance-2 :8900 — report that clause BLOCKED alone if the endpoint is down; never fabricate.

## PB-CH-1 — spec-composer IN FLIGHT (thunderbeast)
- bash **955044**, log lanes/2/logs/spec-composer-PBCH1-l2t1126.log, unique draft path
  .hermes/plans/2026-10-06_1126-PB-CH-1-agent-action-compiler-spec-DRAFT.md, prompt
  /tmp/lane2-pbch1-speccomposer-task.txt (orientation claims a-f flagged as hypotheses to verify).
  NEXT TICK: review draft before any coder sees it; promote to canonical path if it meets the bar.

## PROTO-AI-11 — run-3 browser receipt still the ONLY open clause
- Reviewer bash 874832 LIVE at 11:50 (~55 min; buffered log, expected). Receipts
  /home/brad/.hermes/cl/receipts/PROTO-AI-11/2026-10-06_1055/. Do NOT re-dispatch while alive.
  If it returns blocked AGAIN with a correct premise -> escalate per persistence (no 4th run
  without a changed diagnosis). On accept -> promote report, mark done (data-repo only; trunk
  untouched by AI-11).

## Queue / dispatch order (resume exactly here)
1. AI-11 run 3 verdict (874832 exits on its own) -> close AI-11 or escalate.
2. AI-15 adversarial verdict -> merge/fix as above. Then coder slot -> **AI-12 §4** (spec above).
3. AI-14 browser gate the moment the computable vision slot frees (prompt ready at
   lanes/2/prompts/review-PROTO-AI-14-20261006T1130.txt).
4. PB-CH-1 draft review + promote; then PB-CH-1 claims after the ai-protocol-edit queue drains
   (single coder slot — keep the order above; PB-CH-8 stays blocked, gate fires on-change).

## Live at checkpoint (NOT killed; do NOT duplicate)
- cl-browser-reviewer AI-11 run 3: bash 874832 -> receipts/PROTO-AI-11/2026-10-06_1055/
- cl-adversarial-reviewer AI-15: bash 993443 -> logs/review-PROTO-AI-15-20261006T1147.md
  (holds the coder lock transiently; releases on exit)
- cl-spec-composer PB-CH-1: bash 955044 -> .hermes/plans/2026-10-06_1126-...-DRAFT.md

## assumptions:
- NEW **AS-PROTO-AI-14-REVIEW-OBSERVATIONS-ACCEPTED**: adversarial reviewer's 3 non-blocking
  observations (activeTabId fallback semantics on [A,B,A]-no-active docs; persisted `history` may
  keep duplicate ids; worktree-provisioning gap) accepted as-is, no code change. reversible true;
  evidence_debt false; if a future item touches tab fallback, revisit. Owner: orchestrator.
- NEW **AS-PROTO-AI-15-WORKTREE-SYMLINK-REPLICATION**: coder replicated trunk's gitignored
  node_modules/hoisted symlinks into its worktree to match the 11/22 baseline; reviewer verifies
  nothing of Brad's live tree was written. reversible true; evidence_debt TRUE until the review
  verdict lands — clear or escalate on ACCEPT. Owner: cl-coder (verified by orchestrator).
- NEW **AS-LANE2-WORKTREE-BOOTSTRAP-NODELINKS**: future bare worktrees on NFS skip install —
  symlink trunk node_modules at creation (done for AI-15; add the ~50 gitignored root links too
  if src/ai runs in-worktree). reversible true; evidence_debt false. Owner: orchestrator.
- Carried (unchanged): **AS-PROTO-AI-12-W1** (see evidence debt),
  AS-PROTO-AI-11-LANE2-STORE-SEED-TESTDATA, AS-PROTO-AI-11-AMEND-LOCAL-ONLY,
  AS-PROTO-AI-14-TSC-BASELINE-25-VS-34 (now MOOT — merged; set-identity re-measured: 47 lines,
  zero in merged files), AS-PROTO-AI-11-LBW-MATCH-REVIEW (final trail),
  AS-PROTO-AI-11-BROWSER-CLAUSE-DEFERRED (resolved, run 3 in flight),
  AS-LANE2-11434-VISION-SERVICE-ALREADY-DOWN, AS-PROTO-AI-2-C1-ANCHOR,
  AS-PROTO-AI-9-C5-ROLENAME, AS-PROTO-AI-9-LANE2CONFIG-RECREATE, AS-PROTO-AI-9-W8,
  AS-PROTO-AI-9-SURFACE-MOUNTED, AS-PROTO-AI-9-RDEFECT2-PLACEMENT,
  AS-PROTO-AI-9-DRAFTCHANGES-LANE-LOCAL, AS-PROTO-AI-9-ISOLATED-STACK.

## Open evidence-debt entries
- **AS-PROTO-AI-12-W1** — served router artifact is the QAD-Q4_0 quant of LFM2.5-350M (sha256
  3d10b6ab...); disclose with the PROTO-AI-13 verdict digest. STILL OPEN (due at AI-13).
- **AS-PROTO-AI-15-WORKTREE-SYMLINK-REPLICATION** — open until the AI-15 adversarial verdict
  confirms Brad's live tree untouched; clear on ACCEPT.

## Baseline facts (updated)
- Trunk HEAD **cbacebab** (contains AI-14). tsc: server 33 lines; app 47 lines / 24 files at
  cbacebab, zero in AI-14 files — keep SET-IDENTITY comparisons.
- server src/ai at cbacebab: 11 failed files / 22 failed tests (re-measured by orchestrator);
  post-AI-15 expectation 10/21. promptBudget GREEN once AI-15 merges.
- Vitest trunk run ~16 s — cheap to re-measure.
- Carried pitfalls: lane-stack restart BLOCKING (background=true); bare git worktree add ~1-4 min
  + node_modules symlinks; NFS git -c core.fileMode=false; never git add -A in the data repo;
  hermes -z one-shots: poll logs, no notify support in -z sessions; lint schemaId full https form;
  lane SPA record route /record/<recordId>; lane test-data store
  /home/brad/.computable-lab-lane2/worktrees/main.
