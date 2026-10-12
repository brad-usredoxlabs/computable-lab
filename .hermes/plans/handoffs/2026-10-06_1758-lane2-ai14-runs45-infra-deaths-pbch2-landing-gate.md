# Handoff — LANE 2 tick 2026-10-06T17:58 EDT
## (AI-14 gate run 4 off-script + run 5 hung-to-death; premise PROVEN by orchestrator's own Playwright probe; PB-CH-2 spec DRAFT reviewed -> architect landing decision commissioned)

Campaigns: `ai-protocol-edit-and-router` + `page-builder channel`. Trunk `cl/integration-2` HEAD
**`2bac2219`** (code tip unchanged `68cd97df`-series; docs-only merges since). Lane stack :3093
(records 200) / :5193 (200). Brad's :3001/:5174 untouched. Fleet coder lock FREE, ZERO live cl-coder
(pid 1254929 in the stale .pid file is DEAD — verified with ps; flock -n probe = FREE). No coder was
dispatched this tick (nothing dispatchable — see queue).

## Reconcile at tick start (verified with real output)
- PB-CH-2 spec-composer pid 1260414: LIVE at 17:13 (wal advancing), then COMPLETED — DRAFT delivered
  17:33, log flushed the PB-CH-2 SPEC-DRAFT DONE summary. Reviewed this tick (below).
- AI-14 gate run 4 (pid 1655576): EXITED ~17:13 — the aux-compression PIN WORKED (clean termination,
  receipts written). But the verdict was an OFF-SCRIPT premise error (below).
- Shadow corpus: 4 lines (was 2 — the run-4 probe turns added pairs; still far below the
  pre-registered AI-13 minimum).
- Human artifacts md5-UNCHANGED (AI-11-data-approval f86d9e33…, PB-CH-7 6b9f7e3c…): not re-asked.

## AI-14 gate — runs 4 and 5 both fell to REVIEWER-side failures; premise now PROVEN by my own probe
- RUN 4 (receipts/PROTO-AI-14/2026-10-06_1655/): VERDICT: BLOCKED claiming a 404 on
  /project/STU-123/protocol/PRT-4iaey2. FALSE PREMISE: that route does not exist in this UI (no
  protocol detail page; the 404 is the app's designed not-found shell) and the instructed run-page
  chat flow was never attempted; ZERO screenshots -> not a valid verdict either way.
- ORCHESTRATOR PROBE (change-of-diagnosis evidence, mine, real): bounded Playwright script
  `/home/brad/.hermes/cl/lanes/2/tmp-orch/orch-probe.mjs` (+ probe-panel.png): on
  /runs/RUN-2026-09-19-run-vwr8 a real protocol_edit turn OPENED the changes-panel; Accept = real
  BUTTON with distinct rect 70x36, bg rgb(9,105,218), bordered; Reject separate BUTTON beside it;
  ZERO duplicate-key console warnings; record sha 30a353a8… UNCHANGED after the turn
  (propose-never-write held). Candidate confirmed served: cbacebab ancestor of HEAD;
  ChangesPanel.css + sessionYaml byId both served by :5193.
- RUN 5 dispatched 17:25 with a run-page-EXCLUSIVE prompt (names the protocol-route 404 as expected
  non-defect; screenshots-before-verdict rule): bash 1715750 / python 1715806, receipts
  receipts/PROTO-AI-14/2026-10-06_1725/. IT DIED ~17:54 with VERDICT: BLOCKED, EMPTY receipts dir,
  empty trail — its final message describes its own wrapper as "stuck 3 hours" (a confused
  self-report; actual elapsed ~25 min). It completed the served-checks + run-page load, then hung
  BEFORE the chat turn (no incremental trail.json at all). Process gone (verified).
  => run 4 proves the pinned aux route CAN complete; run 5's hang is a new failure mode (browser
  tool / single-slot vision serving stall mid-session), not the old compression death.
- DISPOSITION: NOT a product defect; criteria remain UNproven-by-gate (my probe is premise evidence,
  not the acceptance gate — do not count it as accept). NEXT TICK: dispatch run 6 with the SAME
  prompt file prompts/review-PROTO-AI-14-gate-run5-20261006T1725.txt + a fresh receipts dir, PLUS a
  new instruction: drive the chat turn FIRST (before any other exploration), write trail.json
  entry-by-entry, and if the browser tool call itself hangs > 5 min, reload the page and retry once
  before declaring BLOCKED. If run 6 ALSO hangs pre-turn, the failure is the reviewer's browser
  stack or the vision endpoint — investigate cl-browser-reviewer browser tooling / computable
  :8080 liveness BEFORE any further dispatch (do NOT burn slot runs blindly).
- AI-11 run 4 (browser clause; prompt prompts/review-PROTO-AI-11-rail-20261006T1055.txt) stays
  QUEUED behind AI-14 on the single vision slot.

## PB-CH-2 — composer DONE, spec reviewed, GATED on host-landing decision (new blocker)
- DRAFT at .hermes/plans/2026-10-06_1355-PB-CH-2-workstate-draft-adapter-spec-DRAFT.md
  (md5 7cb6348b160aa8cd0c755ea819acf2a7). Adapter-capability verdict YES (projection-only +
  actor-binding inside the existing contract; no stop-boundary). NOT yet promoted to canonical —
  the worker contract depends on the landing route.
- LOAD-BEARING FINDING, VERIFIED BY ME: the host mechanism (server/src/drafts/**, form-draft
  schemas/pipeline YAML, server/src/sequences/**, registerDraftRoutes) was NEVER committed to any
  ref (git log --all --diff-filter=A = empty; ls server/src/drafts absent on trunk) and exists ONLY
  as untracked WIP in Brad's live tree, md5-pinned (adapters c8d2ef86…, draftRoutes a90003dc…,
  FormDraftService 13505c34…, StagingStore 321267b5… — all four re-verified matching), excluded
  from lane-2 via lane-exclude (lines 52+, 91-95, 110-123). The live suite is 10/10 PASS there.
- ARCHITECT DECISION COMMISSIONED 17:45: decisions/PB-CH-2-host-landing.md (watched, absent at
  checkpoint), log logs/architect-pbch2-landing-20261006T1745.log, bash pid 1740361 (LIVE at
  checkpoint, ~7 min in). Options (a) wait for Brad's promotion / (b) curated orchestrator copy-in
  commit + lane-exclude amendments + pinned post-landing baselines / (c) hard blocker to Brad.
  Structured blocker fields written in the PB-CH-2 task block (next_check: on-change, watch path =
  the decision file). DO NOT dispatch the PB-CH-2 coder until the decision lands and, if option (b),
  the landing commit is on trunk with post-landing server-tsc + src/drafts baselines pinned.
- Pre-prepped worktree wt/PB-CH-2-lane2-l2t1550 remains (branch @ 1a9aa893, node_modules OK) —
  will need re-base/refresh onto the landing commit at claim time.
- Architect flagged honestly: if the live tree's store/types delta (UpdateRecordOptions.actor) is
  entangled with Brad's ~90 modified tracked files, option (b) is not minimal -> (a).

## Queue / dispatch order (resume exactly here)
1. AI-14 run 6 (see disposition above). On accept: promote report ->
   .hermes/plans/PROTO-AI-14-report.md, mark done. On fix: defects -> coder on
   wt/PROTO-AI-14-lane2-l2t1020 (fix cycle 1/2, queues for the fleet lock).
2. AI-11 run 4 immediately after, on the freed vision slot.
3. PB-CH-2-host-landing decision arrival -> execute landing option -> promote spec -> CLAIM ->
   dispatch cl-coder under the fleet lock (re-base the pre-prepped worktree first).
4. PB-CH-3 spec-composer only after PB-CH-2 promotes (needs its contract).
5. Shadow corpus: wc -l /home/brad/.computable-lab-lane2/shadow-router/events.jsonl each tick
   (4 at checkpoint); AI-13 only at the pre-registered minimum (500 pairs / 50 protocol_edit);
   disclose AS-PROTO-AI-12-W1 QAD-Q4_0 at verdict.
6. Human artifacts UNCHANGED: do not re-ask.

## Thunderbeast capacity at checkpoint
4-session ceiling: orch (this) + architect 1740361 = 2. Headroom OK. Vision slot: FREE at
checkpoint (run 5 gone; nothing queued live).

## Live at checkpoint (NOT killed; do NOT duplicate)
- architect PB-CH-2 landing decision: bash **1740361** -> decisions/PB-CH-2-host-landing.md

## assumptions:
- NEW **AS-LANE2-AI14-ORCH-PREMISE-PROBE** — orchestrator drove one real protocol_edit turn via a
  bounded Playwright probe to prove the AI-14 gate premise (panel reachable, buttons styled, no
  dup-key warnings). It is PREMISE evidence only; the acceptance gate remains cl-browser-reviewer.
  Lane data repo touched ONLY via the ordinary propose path (zero writes; sha 30a353a8… verified
  unchanged). reversible true; evidence_debt false (probe script + png + sha hash exist). Owner:
  orchestrator.
- Carried (unchanged): **AS-PROTO-AI-12-W1** (QAD-Q4_0 quant disclosure — DUE AT AI-13 VERDICT),
  AS-LANE2-REVIEWER-AUX-COMPRESSION-PINNED (run-4 clean exit confirms the pin loads; run-5 hang is a
  DIFFERENT failure — pin stays), AS-LANE2-SHADOW-CORRECTED-CONFIG-PATH,
  AS-LANE2-PBCH2-WTPREPPED-OFF-1A9AA893, AS-LANE2-WORKTREE-BOOTSTRAP-NODELINKS,
  AS-PROTO-AI-11-LANE2-STORE-SEED-TESTDATA, AS-PROTO-AI-11-AMEND-LOCAL-ONLY,
  AS-PROTO-AI-11-LBW-MATCH-REVIEW, AS-LANE2-11434-VISION-SERVICE-ALREADY-DOWN,
  AS-PROTO-AI-2-C1-ANCHOR, AS-PROTO-AI-9-C5-ROLENAME, AS-PROTO-AI-9-LANE2CONFIG-RECREATE,
  AS-PROTO-AI-9-W8, AS-PROTO-AI-9-SURFACE-MOUNTED, AS-PROTO-AI-9-RDEFECT2-PLACEMENT,
  AS-PROTO-AI-9-DRAFTCHANGES-LANE-LOCAL, AS-PROTO-AI-9-ISOLATED-STACK,
  AS-PBCH7-OUT-OF-SCOPE-SESSION-AUTHZ-GAP, AS-PBCH1-AMBIGUITY-MINIMAL-RULE.

## Open evidence-debt entries
- **AS-PROTO-AI-12-W1** — served router artifact is the QAD-Q4_0 quant of LFM2.5-350M (sha256
  3d10b6ab…); disclose with the PROTO-AI-13 verdict digest. STILL OPEN (due at AI-13).

## Baseline facts (carried; unchanged this tick)
- Trunk HEAD 2bac2219 (code tip unchanged). server src/ai: 10 failed files / 21 failed / 565 passed;
  tsc server 33 lines; app tsc 47 (composer re-measured: app 34 on SERVER scope wording — treat the
  canon above as authoritative; PB-CH-2's drafts work is server-side).
- :3093 has NO /health (404) — liveness via GET /api/records/PRT-4iaey2 (now sha 30a353a8…).
- Shadow telemetry: /home/brad/.computable-lab-lane2/shadow-router/events.jsonl; config lives ONLY
  in /home/brad/.hermes/cl/lanes/2/lane2-config.yaml (CONFIG_PATH).
- Playwright for ad-hoc orch probes: import from
  /mnt/vast/home/brad/git/cl-integration-2/node_modules/playwright/index.mjs (NOT app/node_modules).
- Carried pitfalls: lane-stack restart BLOCKING (background=true); worktree add NFS timeouts; bare
  worktree needs node_modules + 43 server/src symlinks; NEVER git add -A in coder worktrees;
  git -c core.fileMode=false on NFS; hermes -z buffers logs until exit; reviewer aux-compression
  FIXED via profile pin (run 4 proof); NEW: reviewer sessions can also HANG mid-session with empty
  receipts (run 5) — treat an empty trail.json at exit as an infra death, not a product verdict;
  NEW: reviewer may self-report confused third-person "stuck" text as its final message — trust the
  receipts dir + timestamps, not the narrative; lint schemaId full https form; SPA record route
  /record/<id>; there is NO /project/.../protocol/... route (404 shell by design); lane data store
  /home/brad/.computable-lab-lane2/worktrees/main.
