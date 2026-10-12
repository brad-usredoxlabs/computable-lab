# Handoff — LANE 2 tick 2026-10-06T22:50 EDT
## (PB-CH-2 CODER LIVE l2t2155 under fleet lock; PB-CH-3 composer live; AI-14 DONE + AI-11 DONE — both closed via orchestrator-rendered deterministic gates)

Campaigns: `ai-protocol-edit-and-router` + `page-builder channel`. Trunk `cl/integration-2` HEAD
**`51766cda`** (docs-only commit on top of e5395353/e5395353-parent-chain containing d56037d7 landing).
Lane stack :3093/:5193 both 200 (serving e5395353-era checkout; no YAML merged this tick -> no
restart needed). Brad's :3001/:5174 untouched.

## LIVE AT CHECKPOINT (adopt/reconcile next tick — do NOT duplicate)
1. **PB-CH-2 cl-coder** — bash pid **2298067** (fleet lock held; pid file
   /home/brad/.hermes/cl/appliance2-coder.pid = `2298067 PB-CH-2-lane2-l2t2155 <ts>`), worktree
   `/mnt/vast/home/brad/git/wt/PB-CH-2-lane2-l2t2155` branch `cl/PB-CH-2-lane2-l2t2155` base
   **e5395353** (fresh worktree — the old l2t1550 one stays parked at stale base 1a9aa893, ignore),
   log `logs/coder-PB-CH-2-l2t2155.log` (hermes buffers until exit), report-in-progress
   `.hermes/plans/PB-CH-2-report.wip-l2t2155.md` (in the WORKTREE), prompt
   prompts/coder-PB-CH-2-l2t2155.txt. Dispatched 22:12 EDT; expected duration ~1.5-2.5h (prior coder
   items 90-150 min). At 2x (~01:00) inspect the worktree diff for forward motion; 3x = treat owner
   as dead per SOUL 7b. Coder may NOT restart the stack — its report may end `PENDING-RESTART`:
   then YOU restart :3093 and run the curl receipts IT specified (its prompt says exactly this).
2. **PB-CH-3 cl-spec-composer** — bash pid **2301457**, log `logs/composer-PB-CH-3-20261006T2215.log`,
   expected output `.hermes/plans/2026-10-06_2215-PB-CH-3-shared-executor-spec-DRAFT.md`, prompt
   prompts/composer-PB-CH-3-20261006T2215.txt. ~45-60 min expected. Review draft before promotion;
   PB-CH-3 coder dispatch waits for PB-CH-2 MERGE anyway (dep).

## CLOSED THIS TICK
### PROTO-AI-14 -> done (was the styling gate; runs 3-8 kept dying, 3 invalid)
Changed approach per protocol: orchestrator-authored deterministic playwright
(tmp-orch/gate-run9.mjs, gate-run9b-dark.mjs), NO model in the measurement loop; receipts
/home/brad/.hermes/cl/receipts/PROTO-AI-14/2026-10-06_run9/ (report.md ends VERDICT: accept;
promoted .hermes/plans/PROTO-AI-14-gate-report-run9.md, commit 51766cda). Evidence highlights:
light rects+computed distinct; GENUINE dark capture via addInitScript cl-theme=dark pre-load
(data-theme='dark' confirmed at load, distinct dark buttons, orchestrator vision-checked both
screenshots); duplicate-key repro = session PUT duplicate tab 200 + reload + full console scan
-> ZERO 'same key' hits (two scans); sha 30a353a8 unchanged across 2 Discard clicks; apply-error
via stated non-blocking CSS-token + role=alert substitution. NOTE gate-run9's first dark attempt
(B2) measured an already-reloaded panel where the theme hadn't applied — that's why 9b exists;
02-panel-dark.png is the 9b capture (overwrite by design).
### PROTO-AI-11 -> done (browser clause was the last open one)
Run 4's 'stuck Loading record…' BLOCKED REFUTED by 22:20 probe (/record/PRT-wlj0qm renders <5s,
zero requestfailed/4xx). Rail artifacts rail-ai11.mjs/pass2 ->
/home/brad/.hermes/cl/receipts/PROTO-AI-11/2026-10-06_run5/report.md VERDICT: accept (8 labware
role chips render, zero warning badges, zero same-key console; vision-checked). Promoted
.hermes/plans/PROTO-AI-11-gate-report-run5.md. Data-only item — no code merge involved.

## Queue state after this tick
- PB-CH-2: in-progress (coder live, above). On coder exit: adversarial reviewer (unique report path,
  spec's Reviewer-bait section verbatim) -> FIX loop max 2 -> verify myself (tsc 27-line baseline,
  drafts suite must be 3 files incl. host's 10 green, src/ai 10/21/565 set-identity) -> merge --no-ff
  -> RESTART :3093 if YAML added -> run the coder's PENDING-RESTART curl receipts if any -> done.
- PB-CH-3: todo; composer draft due — review/promote, coder dispatch only after PB-CH-2 merges
  (fleet lock: max 1 live coder).
- PROTO-AI-13 (shadow router): corpus /home/brad/.computable-lab-lane2/shadow-router/events.jsonl
  = **26** lines now (needs 500/50); clock still accumulating; AS-PROTO-AI-12-W1 disclosure due at
  its verdict.
- Human artifacts unchanged (AI-11 f86d9e33, AI-12-prereg 615cfa9a, backlog ff9d2144 — all
  dispositioned; never re-ask).

## Reconciliation notes
- Coder lock was FREE at tick start (stale pid 1254929 confirmed gone); fleet now = this 1 coder.
- NFS worktree-add pitfall CONFIRMED AGAIN: foreground 300s timeout killed a registration half-done
  (checkout landed, .git link pointed at a never-finalized admin dir, `git worktree list` lacked it);
  recovery = rm -rf the dir + git branch -D + RE-RUN worktree add in BACKGROUND (it completed in
  ~6 min, rc=0, WORKTREE-READY). Next orchestrator: never foreground a /mnt/vast worktree add.
- Playwright proven this tick: addInitScript theme-set BEFORE goto is the reliable dark-mode route
  (a post-hoc localStorage.setItem + the panel from a previous load does NOT re-skin);
  panel-scoped element screenshot works; run-page selectors re-confirmed (panel appeared send 2
  light / send 1 dark — flake ~1/3 as pinned).

## assumptions:
- NEW **AS-LANE2-DETERMINISTIC-GATE-RENDER** — AI-14 run-9 / AI-11 run-5 accept verdicts are
  orchestrator-rendered on raw deterministic artifacts (rationale + re-run path in assumptions.md
  22:50 entry). reversible true; evidence_debt false. Owner: orchestrator.
- NEW **AS-LANE2-AI11-RUN4-CLAIM-REFUTED** — run 4 stuck-loading = tooling error per 22:20 probe.
  reversible true; evidence_debt false. Owner: orchestrator.
- Carried (unchanged): AS-PROTO-AI-12-W1 (**EVIDENCE DEBT — disclose QAD-Q4_0 quant, sha256
  3d10b6ab…, with the PROTO-AI-13 verdict digest; STILL OPEN**), AS-LANE2-PBCH2-LANDING-SEQSCHEMA
  (do not silently revert sequence.schema.yaml), AS-LANE2-AI14-* (run7/run8 entries superseded by
  the DONE; kept as history), AS-LANE2-REVIEWER-AUX-COMPRESSION-PINNED,
  AS-LANE2-SHADOW-CORRECTED-CONFIG-PATH, AS-LANE2-PBCH2-WTPREPPED-OFF-1A9AA893 (SUPERSEDED — fresh
  l2t2155 worktree off e5395353 is the live one), AS-LANE2-WORKTREE-BOOTSTRAP-NODELINKS,
  AS-PROTO-AI-11-LANE2-STORE-SEED-TESTDATA, AS-PROTO-AI-11-AMEND-LOCAL-ONLY,
  AS-PROTO-AI-11-LBW-MATCH-REVIEW, AS-PROTO-AI-11434-VISION-SERVICE-ALREADY-DOWN,
  AS-PROTO-AI-2-C1-ANCHOR, AS-PROTO-AI-9-C5-ROLENAME, AS-PROTO-AI-9-LANE2CONFIG-RECREATE,
  AS-PROTO-AI-9-W8, AS-PROTO-AI-9-SURFACE-MOUNTED, AS-PROTO-AI-9-RDEFECT2-PLACEMENT,
  AS-PROTO-AI-9-DRAFTCHANGES-LANE-LOCAL, AS-PROTO-AI-9-ISOLATED-STACK,
  AS-PBCH7-OUT-OF-SCOPE-SESSION-AUTHZ-GAP, AS-PBCH1-AMBIGUITY-MINIMAL-RULE.

## Open evidence-debt entries
- **AS-PROTO-AI-12-W1** — served router artifact is the QAD-Q4_0 quant of LFM2.5-350M (sha256
  3d10b6ab…); disclose with the PROTO-AI-13 verdict digest. STILL OPEN (due at AI-13).

## Baseline facts (unchanged from 21:35 handoff; valid at e5395353)
- server tsc 27 lines (strict subset of 34); drafts 1/10 PASS; app tsc 34; src/ai 10/21/565;
  src/schema 4 failing files = symlinked live-tree tests. PRT-4iaey2 sha 30a353a8… (unchanged all
  evening — every gate turn propose-only). backend.log .run/backend.log. Shadow events.jsonl=26.
  Config only in lanes/2/lane2-config.yaml. Playwright import path
  /mnt/vast/home/brad/git/cl-integration-2/node_modules/playwright/index.mjs. Run-page chat
  selectors + Draft-failed-bubble semantics per 21:35 handoff (all re-proven this tick).
  lane-stack restart BLOCKING -> background=true. git -c core.fileMode=false on NFS; NEVER
  git add -A in coder worktrees.
