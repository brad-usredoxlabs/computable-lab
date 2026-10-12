# Handoff — LANE 2 tick 2026-10-07T01:05 EDT
## (HARNESS-1 DONE on mechanical evidence; PB-CH-3 coder live, PB-CH-4 composer live)

Campaigns: `ai-protocol-edit-and-router` + `page-builder channel`. Trunk
`cl/integration-2` HEAD 62470338 (docs tip; this handoff's commit follows). Lane
stack :3093/:5193 both 200. Brad's :3001/:5174 untouched.

## LIVE AT CHECKPOINT (do NOT re-dispatch while alive)
1. **PB-CH-3 coder (cl-coder)**: hermes python pid **2512495** (fleet lock held;
   pid file records it), dispatched 23:59:28 EDT, elapsed ~62 min at checkpoint —
   WITHIN the ~45–90 min expected window. Worktree
   `/mnt/vast/home/brad/git/wt/PB-CH-3-lane2-l2t2357` branch same, off trunk 85a16976.
   Confirmed PROGRESSING at 00:4x: all four deliverable files exist (workstateExecutor
   .ts/.test.ts, useWorkstateExecutor .ts/.test.tsx) + the two sanctioned narrow edits
   (sessionYaml.ts, useSessionSync.ts) — i.e. past RED, in implementation. Log
   `logs/PB-CH-3-l2t2357.log` (buffered 0 B until exit, normal). Report (unique):
   `.hermes/plans/PB-CH-3-report.wip-l2t2357.md` IN THE WORKTREE. No commit yet on the
   branch (HEAD still 85a16976) — expected before exit.
   NEXT: log 'PB-CH-3 CODER DONE <sha>' + pid exit -> ADVERSARIAL GATE
   (cl-adversarial-reviewer, unique report path, point at spec "Reviewer bait") -> on
   ACCEPT verify myself (real diff; targeted shared session/surfaces/lib/shell 21
   files/106 PASS + new files; app tsc 34 set-identity; server/schema/config diff
   EMPTY) -> merge --no-ff -> mark done -> handoff. NO browser gate (no UI mount, per
   spec + PB-CH-2 precedent). If FIX: new coder run SAME worktree/branch, defect list
   verbatim, re-acquire fleet lock, max 2 cycles.
2. **PB-CH-4 spec-composer (cl-spec-composer, thunderbeast)**: hermes python
   **2518409**, elapsed ~59 min at checkpoint (expected ~45–60 — AT the bound, not
   yet 2x; not stale). Draft NOT yet written
   (`.hermes/plans/2026-10-07_0005-PB-CH-4-wave1-mount-spec-DRAFT-l2t0005.md` absent),
   log `logs/spec-composer-PB-CH-4-l2t0005.log` (0 B, buffered). NEXT tick: if still
   live at ~2x (≈01:00+ elapsed beyond bound with no draft), treat per SOUL 7b: the
   orchestrator writes the PB-CH-4 spec itself from PB-CH-2/3 contracts and flags it
   PROVISIONAL for architect ratification. Composer does NOT block the coder track.
   PB-CH-4 coder does not run until PB-CH-3 merges.

## DONE THIS TICK — HARNESS-1 (closed on mechanical evidence, task's own gate)
Full evidence note is on the HARNESS-1 block in the task list. Summary:
- `capture.ext.spec.ts` gained `retryUntilVisible` (per-attempt trail entries,
  attemptSteps, non-fatal exhaustion), `clickAndType` (ProseMirror discipline), and a
  step-execution refactor; `README.md` documents the new steps + plan-library
  convention.
- Plan library created at `~/.hermes/cl/browser-receipts/plans/`:
  `run-workspace.json` (canonical run-page -> chat turn -> ChangesPanel, reject-only,
  harvested from the proven AI-14 gate-run9 probe),
  `changes-panel-accept-reject.json` (full accept lifecycle; MUTATES fixture
  PRT-4iaey2 — caution field), `deck-opens.json`.
- Verification (all real, receipts under `~/.hermes/cl/receipts/HARNESS-1/`):
  self-test fail-fast (3 attempts + EXHAUSTED + run continued); self-test
  retry-success (attempt action mounts target); `run-workspace.json` ran TWICE
  against :5193 — pass1 EXIT 0 absorbing a REAL flake in plan data (panel on attempt
  3 of 4, per-attempt entries + fail shots), pass2 EXIT 0 first-try; both complete
  trail+shots, protocol-diff present, no Draft-failed, sha 30a353a8.. unchanged after
  reject. Product repo `git status` shows NO harness-caused changes (harness lives
  only under ~/.hermes/cl/browser-receipts/).
- NOTE: run-workspace pass1 proves the live-turn flake rate is real (~2/3 first-attempt
  miss tonight) — future gates dispatch with this plan id and a >=4-send budget.

## QUEUE STATE / NEXT TICK
1. PB-CH-3 in-progress (above). PB-CH-4 draft review/promotion pending composer exit.
2. PROTO-AI-13 (shadow router): corpus `/home/brad/.computable-lab-lane2/shadow-router/
   events.jsonl` — pre-registered minimum 500/50 not met; nothing actionable.
   Evidence debt AS-PROTO-AI-12-W1 (QAD-Q4_0 quant, sha256 3d10b6ab…) STILL OPEN,
   due at its verdict.
3. PB-CH-5/6/9 dependency-gated behind PB-CH-3/4; PB-CH-8 gated on PB-CH-4..6.
   No other ready item this window.

## Human artifacts (watched; NOT re-asked)
All three CLOSED, md5s pinned at the 00:20 handoff (AI-11 f86d9e33…, AI-12
615cfa9a… signed as written, BACKLOG ff9d2144… admitted all three). No change
re-measured needed — dispositions executed.

## Reconciliation notes
- Coder worktree confirmed writing (untracked new files + sanctioned edits at 00:4x).
- architect pid 416507 = Brad's interactive session — untouched.
- Fleet lock held by 2512495 (verified process alive, not just pid file).
- Harness self-test pitfall: `text=Runs` nav selector does NOT match on /settings —
  plan attempt actions should use `goto` (deterministic) not text-nav; recorded in
  selftest-retry-success (v1) trail vs v2 pass.

## assumptions:
- AS-LANE2-HARNESS1-CLOSE-MECHANICAL (this tick): HARNESS-1 closed by the orchestrator
  on mechanical evidence per the task's own verified-by clause (explicitly waives the
  browser gate for harness-only work); no product-code diff. reversible true;
  evidence_debt false. owner: orchestrator.
- AS-LANE2-HARNESS1-ACCEPT-PLAN-UNRUN (this tick): `changes-panel-accept-reject.json`
  is authored+linted but NOT executed end-to-end (it mutates fixture PRT-4iaey2; the
  reject-only canonical was the verified one). First real accept-lifecycle gate will
  run it for the first time — expect first-run calibration. reversible true;
  evidence_debt TRUE (disclose on first accept-gate use). owner: orchestrator.
- Carried (unchanged): AS-PROTO-AI-12-W1 (**EVIDENCE DEBT — disclose QAD-Q4_0 quant,
  sha256 3d10b6ab…, with the PROTO-AI-13 verdict digest; STILL OPEN**),
  AS-LANE2-DETERMINISTIC-GATE-RENDER, AS-LANE2-AI11-RUN4-CLAIM-REFUTED,
  AS-LANE2-PBCH2-LANDING-SEQSCHEMA (do not silently revert sequence.schema.yaml),
  AS-LANE2-REVIEWER-AUX-COMPRESSION-PINNED, AS-LANE2-PBCH2-RECEIPT-ACTOR-RESOLUTION,
  AS-LANE2-SERVER-TSC-PIN-26, AS-LANE2-PBCH3-ACCEPT-BODY-FLAT,
  AS-LANE2-SHADOW-CORRECTED-CONFIG-PATH, AS-LANE2-WORKTREE-BOOTSTRAP-NODELINKS,
  AS-PROTO-AI-11-LANE2-STORE-SEED-TESTDATA, AS-PROTO-AI-11-AMEND-LOCAL-ONLY,
  AS-PROTO-AI-11-LBW-MATCH-REVIEW, AS-PROTO-AI-11434-VISION-SERVICE-ALREADY-DOWN,
  AS-PROTO-AI-2-C1-ANCHOR, AS-PROTO-AI-9-C5-ROLENAME, AS-PROTO-AI-9-LANE2CONFIG-RECREATE,
  AS-PROTO-AI-9-W8, AS-PROTO-AI-9-SURFACE-MOUNTED, AS-PROTO-AI-9-RDEFECT2-PLACEMENT,
  AS-PROTO-AI-9-DRAFTCHANGES-LANE-LOCAL, AS-PROTO-AI-9-ISOLATED-STACK,
  AS-PBCH7-OUT-OF-SCOPE-SESSION-AUTHZ-GAP, AS-PBCH1-AMBIGUITY-MINIMAL-RULE,
  AS-LANE2-PBCH3-WORKTREE-HOIST, AS-LANE2-DECISION-MD5-REGENERATION.

## Open evidence-debt entries
- **AS-PROTO-AI-12-W1** — served router artifact is the QAD-Q4_0 quant of LFM2.5-350M
  (sha256 3d10b6ab…); disclose with the PROTO-AI-13 verdict digest. STILL OPEN.
- **AS-LANE2-HARNESS1-ACCEPT-PLAN-UNRUN** — accept-lifecycle plan not yet executed;
  disclose + calibrate on first use. OPEN.

## Baseline facts (unchanged; trunk code tip within 85a16976 chain)
- server tsc 26 lines; app tsc 34; targeted shared session/surfaces/lib/shell 21
  files/106 PASS; full app suite 53 failing-file baseline; drafts 3 files/39 PASS.
  PRT-4iaey2 sha 30a353a8… unchanged (re-measured via harness pass1/pass2, 01:00).
- Shadow corpus 28 lines (measured 00:05 prior tick).
- Playwright import path /mnt/vast/home/brad/git/cl-integration-2/node_modules/
  playwright/index.mjs; lane-stack restart BLOCKING -> background=true;
  git -c core.fileMode=false on NFS; NEVER git add -A in coder worktrees.
- HARNESS USE FOR FUTURE GATES: cd ~/.hermes/cl/browser-receipts/harness;
  RECEIPT_PLAN=plans/<id>.json RECEIPT_DIR=<receipts dir> PLAYWRIGHT_BASE_URL=
  http://localhost:5193 npx playwright test --config pw-cfg-ext.ts --project=chromium
