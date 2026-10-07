# Handoff — LANE 2 tick 2026-10-07T00:20 EDT
## (PB-CH-3 CLAIMED + CODER DISPATCHED under fleet lock; PB-CH-4 spec-composer drafting)

Campaigns: `ai-protocol-edit-and-router` + `page-builder channel`. Trunk `cl/integration-2` HEAD
`85a16976` (docs tip; code tip = PB-CH-2 merge chain, 236228fc included). Lane stack :3093/:5193
both 200 (restarted 23:20 EDT last tick, no YAML change since — no restart needed). Brad's
:3001/:5174 untouched.

## LIVE AT CHECKPOINT (do NOT re-dispatch while alive)
1. **PB-CH-3 coder (cl-coder)**: hermes python pid **2512495** (fleet lock pid file records it;
   lock held), dispatched 23:59:28 EDT. Worktree `/mnt/vast/home/brad/git/wt/PB-CH-3-lane2-l2t2357`
   branch `PB-CH-3-lane2-l2t2357` off trunk **85a16976**. node_modules symlinked from trunk
   (app + root; server/node_modules removed — workspace-hoisted, vitest smoke-verified 6/6 PASS in
   the worktree before dispatch). Log `logs/PB-CH-3-l2t2357.log` (buffered 0 B until exit, normal).
   Report (unique): `.hermes/plans/PB-CH-3-report.wip-l2t2357.md` IN THE WORKTREE.
   Prompt `/tmp/lane2-pbch3-task.txt` = spec + binding promotions: OQ1 flat accept body +
   identity as separate params (applyAcceptedWorkstate(body, attestation, identity)), OQ2/OQ3
   conservative as drafted. NO UI mount -> NO browser gate; no server/YAML diff required
   (byte-empty proof demanded); no stack restart.
   Expected duration ~45-90 min (PB-CH-2 coder took ~45 min, AI-8 ~96 min). Due check ~01:30 EDT.
2. **PB-CH-4 spec-composer (cl-spec-composer, thunderbeast)**: bash pid 2518338 / hermes python
   **2518409**, dispatched 00:02 EDT. Draft (unique): `.hermes/plans/
   2026-10-07_0005-PB-CH-4-wave1-mount-spec-DRAFT-l2t0005.md`, log
   `logs/spec-composer-PB-CH-4-l2t0005.log`. Expected ~45-60 min. Orchestrator reviews+promotes;
   PB-CH-4 coder does NOT run until PB-CH-3 merges.

## QUEUE STATE / NEXT TICK
1. **PB-CH-3 in-progress** (claimed this tick under queue lock; status todo->in-progress in list).
   NEXT: poll log for `PB-CH-3 CODER DONE <sha>` + pid exit -> ADVERSARIAL GATE
   (cl-adversarial-reviewer, unique report path, point it at the spec's "Reviewer bait" section) ->
   on ACCEPT verify myself (real diff, targeted suites vs baselines: session/surfaces/lib/shell
   21 files/106 PASS + new files, app tsc 34 set-identity, server/schema/config diff EMPTY) ->
   merge --no-ff -> mark done -> handoff. No browser gate (no mount, per spec + PB-CH-2 precedent).
   If FIX: new coder run SAME worktree/branch with defect list verbatim (re-acquire fleet lock;
   max 2 cycles). Fleet lock: DON'T trust the pid file alone — verify pid 2512495 gone before
   treating lock free.
2. **PB-CH-4 draft** -> review, verify its baselines myself, resolve its OQs, promote, link in
   task block. Ready only after PB-CH-3 merges.
3. PROTO-AI-13 (shadow router): corpus `/home/brad/.computable-lab-lane2/shadow-router/
   events.jsonl` = **28 lines** (measured 00:05 this tick) vs pre-registered min 500/50 —
   INSUFFICIENT by design until live turns accumulate; nothing actionable. Evidence debt
   AS-PROTO-AI-12-W1 (QAD-Q4_0 quant, sha256 3d10b6ab…) STILL OPEN, due at its verdict.
4. HARNESS-1 (todo, no deps, harness-only outside repo, orchestrator-closable on mechanical
   evidence): deferred — coder lock busy and cl-worker overflow policy doesn't apply
   (appliance-2 healthy). Good fit for an idle tick or post-budget continuation; proven probe
   material is in `lanes/2/tmp-orch/` (gate-run9b-dark.mjs + orch-probe.mjs + probe-trail.json),
   harness base at `~/.hermes/cl/browser-receipts/harness/capture.ext.spec.ts` (has waitFor/
   evaluate steps already; retryUntilVisible + plans/ dir still absent — confirmed this tick).

## Human artifacts (watched; NOT re-asked)
md5s re-measured this tick, dispositions already recorded and executed — all three CLOSED:
- decisions/PROTO-AI-11-data-approval.md f86d9e3374122d2de05df2ef426a21ba
- decisions/PROTO-AI-12-prereg-approval.md 615cfa9a2e49b0dbabaf35aac558af0e (SIGNED AS WRITTEN,
  p95 <=2000 ms — consumed by PROTO-AI-12 §4, done)
- decisions/LANE2-BACKLOG-followup-approval.md ff9d2144e3a12c2e5dc60f5bf309addb (ADMIT ALL THREE
  — executed as PROTO-AI-14 + PROTO-AI-15, both done)
NOTE: stale historical md5 pins (c5fb3276/edce196b/aff25b4a) in old tick notes refer to the
PRE-ANSWER bytes (mtime 08:57-08:58 EDT Oct 6 = Brad's answers landed); do not treat the drift
as a new human change.

## Reconciliation notes
- Previous tick's coder (2298067) confirmed gone; lock was genuinely free (flock -n succeeded).
- architect pid 416507 = Brad's interactive session — untouched, not a lane-2 worker.
- Lane-1 check not needed: fleet lock acquisition proves no other live cl-coder.
- Worktree bootstrap pitfall re-confirmed: `git worktree add` on /mnt/vast MUST run background;
  `server/node_modules` created as empty DIR by add — remove and symlink, or leave hoisted.

## assumptions:
- AS-LANE2-PBCH3-WORKTREE-HOIST (this tick): PB-CH-3 worktree relies on trunk-symlinked
  node_modules incl. app/node_modules; server needs none (hoisted) — vitest smoke 6/6 proves the
  harness works; coder told not to re-copy. reversible true; evidence_debt false. owner: orchestrator.
- AS-LANE2-DECISION-MD5-REGENERATION (this tick): the three watched decision artifacts' current
  md5s differ from the pre-answer pins because Brad's answers were appended Oct 6 08:52-08:58 and
  were dispositioned; future ticks pin the NEW md5s above. reversible false (facts); evidence_debt
  false. owner: orchestrator.
- Carried (unchanged): AS-PROTO-AI-12-W1 (**EVIDENCE DEBT — disclose QAD-Q4_0 quant, sha256
  3d10b6ab…, with the PROTO-AI-13 verdict digest; STILL OPEN**), AS-LANE2-DETERMINISTIC-GATE-RENDER,
  AS-LANE2-AI11-RUN4-CLAIM-REFUTED, AS-LANE2-PBCH2-LANDING-SEQSCHEMA (do not silently revert
  sequence.schema.yaml), AS-LANE2-REVIEWER-AUX-COMPRESSION-PINNED, AS-LANE2-PBCH2-RECEIPT-ACTOR-
  RESOLUTION, AS-LANE2-SERVER-TSC-PIN-26, AS-LANE2-PBCH3-ACCEPT-BODY-FLAT,
  AS-LANE2-SHADOW-CORRECTED-CONFIG-PATH, AS-LANE2-WORKTREE-BOOTSTRAP-NODELINKS,
  AS-PROTO-AI-11-LANE2-STORE-SEED-TESTDATA, AS-PROTO-AI-11-AMEND-LOCAL-ONLY,
  AS-PROTO-AI-11-LBW-MATCH-REVIEW, AS-PROTO-AI-11434-VISION-SERVICE-ALREADY-DOWN,
  AS-PROTO-AI-2-C1-ANCHOR, AS-PROTO-AI-9-C5-ROLENAME, AS-PROTO-AI-9-LANE2CONFIG-RECREATE,
  AS-PROTO-AI-9-W8, AS-PROTO-AI-9-SURFACE-MOUNTED, AS-PROTO-AI-9-RDEFECT2-PLACEMENT,
  AS-PROTO-AI-9-DRAFTCHANGES-LANE-LOCAL, AS-PROTO-AI-9-ISOLATED-STACK,
  AS-PBCH7-OUT-OF-SCOPE-SESSION-AUTHZ-GAP, AS-PBCH1-AMBIGUITY-MINIMAL-RULE.

## Open evidence-debt entries
- **AS-PROTO-AI-12-W1** — served router artifact is the QAD-Q4_0 quant of LFM2.5-350M (sha256
  3d10b6ab…); disclose with the PROTO-AI-13 verdict digest. STILL OPEN (due at AI-13).

## Baseline facts (at trunk 85a16976)
- server tsc 26 lines; app tsc 34; targeted shared session/surfaces/lib/shell 21 files/106 PASS;
  full app suite 53 failing-file baseline; grep agent_action app/src = 0 (re-measured 23:56);
  drafts 3 files/39 PASS. Shadow corpus 28 lines (00:05). PRT-4iaey2 sha 30a353a8… unchanged.
- Playwright import path /mnt/vast/home/brad/git/cl-integration-2/node_modules/playwright/index.mjs;
  lane-stack restart BLOCKING -> background=true; git -c core.fileMode=false on NFS; NEVER git add -A
  in coder worktrees; /mnt/vast worktree add in BACKGROUND.
