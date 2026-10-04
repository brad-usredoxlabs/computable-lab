# Handoff — LANE 2 tick 2026-10-04T15:50 → 2026-10-04T16:50 EDT (2 items accepted+merged; 2 workers IN FLIGHT)

Campaign: `ai-protocol-edit-and-router` (lane 2 list `~/.hermes/cl/lanes/2/task-list.md`).
Trunk: `cl/integration-2` @ `47c19004` (clean apart from untracked node_modules).
Worker profile: `cl-senior` (thunderbeast `:8080`, shared 4-slot endpoint).

## Outcome
- **PROTO-AI-4** (role-integrity lint) — worker completed, VERIFIED by orchestrator, MERGED, marked done.
- **PROTO-AI-6** (attached-protocol context) — worker completed, VERIFIED, MERGED, marked done.
- **PROTO-AI-5** (server write gates) and **PROTO-AI-7** (`protocol_edit` intent) — CLAIMED, specs written, workers DISPATCHED and still live at checkpoint. Not accepted. Next tick reconciles.

## Reconciliation (step 2)
- At tick start the two previous-tick workers (PROTO-AI-4 pid 3436401/3436457, PROTO-AI-6 pid 3454136)
  were GONE (exited), each having reported `STATUS: done` and committed its branch:
  - `wt/PROTO-AI-4-lane2-l2t0940` @ `27584902`
  - `wt/PROTO-AI-6-lane2-l2t0940` @ `daa75ea8`
  No orphaned live worker; artifacts adopted after confirming exit.
- Lane 1 had no `cl-senior` worker alive at any point this tick (its live process was a
  `cl-browser-reviewer` on the appliance-2 vision model — not the shared thunderbeast endpoint).
  So lane-2 running 2 workers kept the shared 4-slot endpoint within capacity.

## Verification (step 6) — orchestrator-run, not worker self-report
**PROTO-AI-4** (branch diff opened):
- `npx vitest run server/src/lint/` in the worker worktree → **5 files passed, 105/105 tests**
  (ProtocolLintRules 42, LintEngine 27, CrossCollectionPredicate 19, studyRunRules 8, mentionKind 9).
- Diff reviewed: `schema/workflow/protocol.lint.yaml` activates exactly R1/R2/R3 (the 8 other
  sketched rules stay commented); `schema/lint/lint-v1.schema.yaml` adds generic `everyItem` +
  `noneIn` branches and widens `nonEmpty.path` to accept `[*]`; `server/src/lint/{types.ts,
  PredicateEvaluator.ts}` add generic evaluators with ZERO domain field names in TS.
- **Live E2E on the merged lane stack (:3093 after restart):** POST /api/lint with the dangling
  fixture → `valid:false`, summary errors:1 warnings:2 (step-role-closure error naming `add-dye` +
  `ghost-plate-7`; identity-bearing warning; cross-category warning); clean fixture → `valid:true`,
  violations [] (3/3 passed). Reproduced the worker's private-port (3095) result on :3093.

**PROTO-AI-6** (branch diff opened):
- Server targeted (from `server/`): `attachedProtocol.test.ts` + `systemPrompt.test.ts` +
  `residentContext.test.ts` + `AgentOrchestrator.test.ts` → **4 files passed, 36/36 tests**.
- App targeted (from `app/`): `AiTabPanel.test.tsx` + `assistStream.test.ts` +
  `ProtocolSelectionContext.test.tsx` + `protocolStepEditing.test.ts` → **4 files passed, 41/41 tests**.
- Diff reviewed: `server/prompts/event-graph-agent.md` gains a `<!-- protocol-edit:begin/end -->`
  marker-gated section; `systemPrompt.ts` strips it when nothing is attached (byte-identical render,
  test-pinned) and appends `formatAttachedProtocol(context)`. App plumbing publishes real step
  `kind`/role design refs/sha from the existing `ProtocolSelectionContext`. Neither item is a UI change,
  so no browser gate applies (UI gate belongs to PROTO-AI-9/10).

Both merged with `git -c core.fileMode=false merge --no-ff`; trunk advanced cleanly
`51419ada → e2ba5414 (specs/handoff) → 33659439 (merge AI-4) → 7e656c63 (merge AI-6) → specs commit → 47c19004`.
Worker wip reports promoted: `.hermes/plans/PROTO-AI-4-report.md`, `.hermes/plans/PROTO-AI-6-report.md`.

## Live stack / environment notes
- Restarted the lane stack after the schema/lint YAML merge. First restart attempt left the backend
  down with a **transient** error: `GitError: could not lock config file .git/config: File exists`
  (the lane data repo `/home/brad/.computable-lab-lane2`); the lock was gone on retry and the backend
  came up cleanly (`Loaded 21 lint specs, 47 rules`; `/api/schemas` → 200). Flagging in case it recurs —
  the restart script's readiness loop swallows it as a generic "not ready".
- The `cl-lane-stack.sh restart` call HANGS the terminal tool (the backgrounded `npx tsx --watch`
  inherits fds), so run `start`/`start` with the terminal in background mode and poll `:3093/api/schemas`.
- Worktree creation on `/mnt/vast` (NFS) is very slow (~6-8 min for a 3149-file checkout). Budget for it.

## LIVE WORKERS (reconcile next tick — do NOT re-dispatch while alive)
- **PROTO-AI-5**: bash pid `72429` / hermes pid `72485`, launched ~16:17.
  worktree `/mnt/vast/home/brad/git/wt/PROTO-AI-5-lane2-l2t1605`, branch `wt/PROTO-AI-5-lane2-l2t1605` @ `47c19004`.
  log `/home/brad/.hermes/cl/lanes/2/logs/PROTO-AI-5-l2t1605.log` (0 bytes until exit — expected).
  unique report path `.hermes/plans/PROTO-AI-5-report.wip-l2t1605.md`.
  spec `.hermes/plans/2026-10-04_1605-PROTO-AI-5-server-write-gates.md`.
- **PROTO-AI-7**: bash pid `51869` / hermes pid `51975`, launched ~16:10.
  worktree `/mnt/vast/home/brad/git/wt/PROTO-AI-7-lane2-l2t1605`, branch `wt/PROTO-AI-7-lane2-l2t1605` @ `47c19004`.
  log `/home/brad/.hermes/cl/lanes/2/logs/PROTO-AI-7-l2t1605.log` (0 bytes until exit — expected).
  unique report path `.hermes/plans/PROTO-AI-7-report.wip-l2t1605.md`.
  spec `.hermes/plans/2026-10-04_1605-PROTO-AI-7-protocol-edit-intent.md`.
Both branches commit to their own worktree; neither is merged.

## Next tick — first actions
1. Re-check pids 72429/72485 (AI-5) and 51869/51975 (AI-7). If gone, adopt: read the two
   `.wip-l2t1605.md` reports, open the real diff, run the targeted suites yourself (from `server/` for
   server tests — running vitest from repo root breaks prompt-template path resolution), then verify per
   each spec before merging (`git -c core.fileMode=false merge --no-ff <branch>`).
2. If still alive, do not re-dispatch; poll and adopt when they exit.
3. After either merges server code, no YAML changes are expected for AI-5/AI-7 — but if any schema/
   lint/lifecycle YAML moves, restart the lane stack and re-verify.
4. After AI-5 & AI-7 merge, PROTO-AI-8 becomes ready (deps AI-5 ✓, AI-7 ✓); PROTO-AI-10 is ready now
   (deps AI-4 ✓, merged); PROTO-AI-11 is ready but carries a HARD human gate (Brad's data-change approval
   must be recorded before any write).

## Blocker / flag — cl-scout still impaired (NOT blocking lane 2)
Carried from the 10:15 handoff: `cl-scout` has `compression.enabled: false` and
`model.context_length: 131072` exceeding the model's real per-slot 32K window, so orientation-length
questions fail (context overflow / output-token exhaustion). `compression.enabled: false` is a SHARED
profile change (lane 1 uses it too), so the orchestrator did NOT edit it — flag for Brad, or an
authorized orchestrator repair to `model.context_length: 32768` + re-enable compression. Lane-2
orientation this tick was done by orchestrator local inspection (the PROTO-AI-1 grounding map + direct
reads), not scout.

## Baseline facts (carried)
- `npm run test:run -w server` is RED at trunk baseline (~125 failed files with the lane-exclude
  modules present; ~91 without). Acceptance = targeted suite green + no NEW baseline failures.
- Lane stack: backend `:3093`, frontend `:5193`. tsx --watch does NOT reload YAML.
- A bare lane worktree cannot boot the server without the lane-exclude synced modules
  (`/home/brad/.hermes/cl/lanes/2/lane-exclude`) — environmental, not the worker's regression.

## assumptions:
- `assumption_id`: AS-PROTO-AI-4-1 (carried) — placing it here again with its cleanup now DONE.
  `assumption_task`: PROTO-AI-4
  `assumption_value`: The orchestrator authorised adding TWO generic lint-DSL predicates (`everyItem`,
    `noneIn`) beyond the single `allIn` primitive the task text names, because R2/R3 are provably not
    expressible with the existing operand set.
  `assumption_where`: `.hermes/plans/2026-10-04_0940-PROTO-AI-4-role-integrity-lint.md`.
  `assumption_why_missing`: Task text assumed `allIn` sufficed; verified reads prove it does not.
  `assumption_affects`: whether R2/R3 can be declared as data; PROTO-AI-4 acceptance.
  `assumption_reversible`: true
  `assumption_evidence_debt`: false
  `assumption_cleanup`: architect review of the two predicates' generic-ness (no domain names in TS).
  `assumption_owner`: orchestrator

Accepted worker assumptions (full entries in `~/.hermes/cl/lanes/2/assumptions.md`):
- AS-PROTO-AI-4-W1 (nonEmpty meta-schema pattern widened to accept `[*]`), W2 (E2E served from a private
  port pre-merge; orchestrator reproduced on :3093 post-merge — cleanup done), W3 (R1 does not sweep
  `steps[*].methodRequirement.instrumentRole` — owner architect), W4 (bare worktree needs lane-exclude
  modules — environment fact).
- AS-PROTO-AI-6-W1 (payload rides in `context.attachedProtocol`), W2 (step `kind` best-effort `-`,
  never invented), W3 (block sha = `meta.contentSha ?? meta.commitSha`, omitted when unknown).
All: `assumption_reversible: true`, `assumption_evidence_debt: false`.

## Open evidence-debt entries: none.
