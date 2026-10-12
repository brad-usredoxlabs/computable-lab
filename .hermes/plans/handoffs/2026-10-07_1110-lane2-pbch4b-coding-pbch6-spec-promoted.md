# Handoff — LANE 2 tick 2026-10-07T11:10 EDT
## (PB-CH-4b CODING (fleet lock held); PB-CH-5 browser gate LIVE (29 min); PB-CH-6 spec PROMOTED + OQ1/2/3 ruled -> claim gated on PB-CH-4b merge)

Campaigns: `ai-protocol-edit-and-router` + `page-builder channel`. Trunk
`cl/integration-2`: **be3b2742** (docs; code tip a9426cfd = PB-CH-5). Stack
:3093=200, :5193=200 (untouched this tick — NO YAML change made, restart NOT
needed and the gate is mid-run on the stack: do NOT restart it while the
browser gate runs). Fleet coder lock: HELD by PB-CH-4b (pid file
`coder-launch 3842879`; hermes cl-coder pid **3842879**).

## RECONCILE (tick start 10:31)
- PB-CH-5 browser gate LIVE and progressing (bash 3795303 / hermes 3795360,
  ~29 min in; receipts dir has its receipt-test.mjs harness at 10:26; log
  buffered until exit — normal). Left running, never duplicated.
- No coder was live at tick start (PB-CH-5 coder exited 09:42, merged).
- Human decision artifacts md5 UNCHANGED (AI-11 f86d9e33…, AI-12 615cfa9a…) —
  not re-asked. Readiness: 0 due/changed blockers.

## PB-CH-4b — CLAIMED + DISPATCHED (fleet coder, single slot)
- Worktree wt/PB-CH-4b-lane2-l2t0950 existed off 8bfa6c1f with ZERO tracked
  work -> REBASED (fast-forward, ancestor-checked) onto **a9426cfd**, then
  orch-bootstrapped: 57 sibling symlinks replicated from trunk, node_modules +
  app/node_modules + .env links, worktree core.excludesFile =
  lane-exclude-pbch5 (lane-exclude alone leaves 10 landmine untracked files;
  pbch5's 62-path list is the right one). git status clean.
- Spec cites RE-VERIFIED by orch at a9426cfd before dispatch (const :430,
  descriptions :529/:546, deps.surfaces :905, buildToolDefs :979 + forced
  return :984, UNSUPPORTED_SURFACE workstateCompile :377, surfaces.yaml = 10
  ids, no `protocol` id).
- Fleet lock acquired via flock wrapper; launcher bash proc_a675d4d09fdb
  (3842823), hermes cl-coder **3842879**. Log
  lanes/2/logs/coder-PB-CH-4b-l2t1045.log (buffered), prompt
  lanes/2/prompts/coder-PB-CH-4b-l2t1045.txt, report
  wt/PB-CH-4b-lane2-l2t0950/.hermes/plans/PB-CH-4b-report.wip-l2t1045.md.
  Task block claimed (todo -> in-progress, owner cl-coder) under the queue lock.
- MOTION at 10:5x: AgentOrchestrator.ts + submitSuggestionTool.ts modified;
  submitSuggestionTool.surfaceVocab.test.ts + AgentOrchestrator.surfaceVocab.test.ts
  NEW (red-first matrix files exist). Expected exit ~11:45-12:15 (~60-90 min).
  DO NOT re-dispatch while 3842879 alive; do NOT restart the lane stack while
  3795303's gate runs receipts on it.
- NEXT TICK after exit: adversarial reviewer (unique report path) -> orch
  self-verify (diff, targeted suites, tsc pin re-measure) -> merge --no-ff ->
  stack restart (server .ts only, but restart anyway before the runtime
  receipt) -> orch runtime receipt: live assist turn's offered tool def carries
  the 10 registry ids (backend trace or node-eval of builder with real registry)
  -> gate RUN 6 deterministic script (clean-card accept leg; closes PB-CH-4
  owed evidence + AS-LANE2-PBCH4-GATE4-D1-PASSED-ACCEPTLEG-OPEN +
  AS-LANE2-PBCH4-GATE5-VOCAB-GAP-CODE-ITEM debts).

## PB-CH-5 — BROWSER GATE STILL IN FLIGHT (code track CLOSED, merged a9426cfd)
- Gate live at checkpoint (29 min in; 6-send scripted budget). Receipts
  /home/brad/.hermes/cl/receipts/PB-CH-5/2026-10-07_l2t1015/.
- NEXT TICK: read report/trail -> VERDICT accept ? promote report to canonical
  .hermes/plans/PB-CH-5-report.md + mark done + handoff : fix ? defects +
  absolute screenshot paths to a fresh coder run (fleet lock) :
  blocked-surface-vocab -> PB-CH-4b's job first, then re-gate.

## PB-CH-6 — SPEC PROMOTED + OQ RULED (this tick's spec work; NOT claimed)
- Composer draft l2t0720 reviewed; load-bearing cites orch-re-verified at
  a9426cfd: LiteratureBody.tsx:111 view==='build' -> PdfProtocolBuilder
  (useAiChat :127 endpoint 'literature', LiteratureRightPanel local renderer
  :221); /literature route App.tsx:181; AnalysisPage.tsx:228 author box real;
  chat.panel.literature slot exists (NullSlot on bare host).
- RULINGS (canonical spec .hermes/plans/2026-10-07_1100-PB-CH-6-generic-mount-spec.md,
  committed **be3b2742** with the rulings block): OQ1 = PdfProtocolBuilder is
  THE consumer, <approved-surface-id> = `literature`; OQ2 = layout (a)
  compact right-pane chat column, data-testid=analysis-chat-panel; OQ3 =
  precheck-first, systemPrompt.ts union member only, prose-only precheck =>
  compliance escalation, coder never authors prompt text.
- CLAIM GATE: PB-CH-4b merge SHA (claim-time ancestor check) + a9426cfd +
  88496f2c. Dispatch next tick when the coder frees; bootstrap the worktree
  off claim-time HEAD (pbch5 excludes recipe).

## QUEUE STATE
- Live workers at checkpoint: cl-coder PB-CH-4b (3842879, fleet lock HELD) +
  cl-browser-reviewer PB-CH-5 gate (3795303). Lane 2 worker count 2 = cap.
- PROTO-AI-13 shadow-corpus-gated (54/500 — checked again this tick, no
  change). AI-11/AI-12 human artifacts unchanged — do not re-ask.
- PB-CH-4 stays in-progress: owed evidence = run-6 accept leg ONLY (post
  PB-CH-4b merge). PB-CH-8 deps PB-CH-6 open. PB-CH-9 last.

## Baseline facts
- Trunk HEAD be3b2742 (code tip a9426cfd). app tsc pin 34, server tsc pin 26
  file-set (PB-CH-4b coder re-measures its own base). Registered surface ids:
  find, run-plan, run-design, run-execute, results, analysis, knowledge,
  project, ingestion, protocol-review (NO 'protocol'). Lane AI profile
  qwen3.8-thunderbeast (lane-local).
- Session-doc hash pin: 8107ef6e1b88ee296dd29fc552e1709c8bf844366bfe45fcd5afe6008b1e85b9
  (USR-BRAD/main.yaml, lane data dir). NOTE PB-CH-5's API-leg accept receipts
  created ANR-000001 in the lane data dir (main.yaml content advanced BY DESIGN
  of that verified leg; the hash pin below applies to the *browser-gate*
  pre-accept phase of NEW sessions, gate run-5 pinned it unchanged across
  run-4/run-5 + the PB-CH-5 browser-gate window).
- cl-lane-stack.sh restart BLOCKING -> background=true; git -c core.fileMode=false;
  NEVER git add -A; worktree excludes = lane-exclude-pbch5 (62 paths).

## assumptions:
- NEW: AS-LANE2-PBCH4B-EXCLUDES-PBCH5-RECIPE (debt FALSE): PB-CH-4b worktree
  reused lane-exclude-pbch5 excludes (lane-exclude's 16 paths left 10
  landmine untracked files visible; pbch5 list verified clean). Reversible,
  documented, no assertion affected.
- Carried (ALL prior entries STILL OPEN — see 2026-10-07_1020 handoff list):
  AS-LANE2-PBCH4-GATE5-VOCAB-GAP-CODE-ITEM (debt TRUE — cleared by run-6 after
  PB-CH-4b merges), AS-LANE2-PBCH5-OQ1-COERCION-PRESERVED, AS-LANE2-PBCH5-
  RECEIPT-PAYLOAD-FIXES, AS-LANE2-PBCH5-FIRSTTEST-FLAKE (debt TRUE only on
  reappearance — did not reappear in this tick's runs), AS-LANE2-PBCH4-GATE4-
  D1-PASSED-ACCEPTLEG-OPEN, AS-LANE2-PBCH4-FIX1-MECHANISM-ACCEPTED,
  AS-LANE2-PBCH4-OQ1-OQ2-RULED, AS-LANE2-PBCH5-OQ123-RULED, AS-LANE2-SHADOW-
  CORPUS-REMEASURED (54/500), AS-LANE2-WORKTREE-BOOTSTRAP-NODELINKS, and every
  earlier AS-* from the 08:55/10:20 handoffs.
- PB-CH-6 spec promotion recorded NO new values into code — OQ rulings are
  scope decisions within approved intent (already covered by the OQ-ruling
  assumption convention; they will re-emerge per item under the coder's report).

## Budget
Invoked ~10:31, checkpoint ~11:10 — within the 45-min budget. Dispatches this
tick: PB-CH-4b coder (fleet lock, live). Work done: reconcile (gate live,
coder slot free at start); PB-CH-4b claim+bootstrap+rebase+cites-verify+
dispatch; PB-CH-6 draft review + cite verification + OQ1/2/3 rulings + spec
promotion (committed be3b2742) + task-list link; PROTO-AI-13 corpus gate
re-check (unchanged). Coder lock LEFT HELD by PB-CH-4b (correct — one live
coder). No stack touches (gate owns it).
