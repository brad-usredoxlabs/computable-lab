# Handoff — LANE 2 tick 2026-10-04T19:10 → 19:45 EDT (PROTO-AI-7 DONE + MERGED; AI-5 + AI-10 in flight)

Campaign: `ai-protocol-edit-and-router` (lane 2 list `~/.hermes/cl/lanes/2/task-list.md`).
Trunk: `cl/integration-2` @ **`c3bb31ec`** (clean tracked; only untracked node_modules in worktrees).
Worker profile: `cl-senior` (thunderbeast `:8080`, shared 4-slot endpoint).

## Outcome this tick
1. **PROTO-AI-7 adopted, independently verified, and MERGED** (was in-progress from a worker that
   had already exited). Trunk `60599846` → **`c3bb31ec`** (`--no-ff` of `be88c5c0`). Marked done.
2. **PROTO-AI-10 dispatched** into the slot AI-7 freed (bash `464226` / hermes `464282`).
3. AI-5 reconcilied: still ALIVE and actively progressing (private-port E2E run in flight).

## Reconciliation (step 2)
- **PROTO-AI-7**: bash `51869` / hermes `51975` **GONE**. Its log ends `AI7 WORKER EXITED code=0`,
  worktree committed `be88c5c0`, wip report written. Previous worker confirmed dead → adopted.
- **PROTO-AI-5**: bash `72429` / hermes `72485`, elapsed **3:10+**, ALIVE and PROGRESSING (worktree
  files touched 18:51 / 18:56; a private-port E2E server `APP_BASE_PATH=/tmp/proto-ai5-e2e PORT=3193`
  started 19:13). **DO NOT re-dispatch while alive.**

## PROTO-AI-7 — evidence I produced myself (not the worker's summary)
Diff opened: `AgentOrchestrator.ts` +50 (protocol_edit branch beside deck_layout, **returns early** =
no compiler / no store read-modify-write), `protocolEditValidation.ts` NEW (validates the model payload
against the PROTO-AI-2 REGISTERED envelope through the repo's own SchemaLoader→SchemaRegistry→AjvValidator
boot order), `submitSuggestionTool.ts` +74 (enum now exactly `[event_graph, deck_layout, create_record,
protocol_edit]`), `types.ts` +12, `assistStream.ts` +24 (payload **TYPE only**), 2 new RED-first suites.

- Targeted `npx vitest run` (cwd `server/`) over the 8 tracked files → **8 files / 81 tests passed**.
  (Worker's 9-file/92 figure = 81 + createRecordIntent's 11; see FINDING.)
- App `assistStream.test.ts` → **11 passed**; `AiProtocolEditProposal` emitted on `AssistDraftResult`.
- `npx tsc --noEmit -p server/tsconfig.json` → **33 errors before and after**, set-diff empty.
- **NEW-FAILURE PROOF (real baseline run, not eyeball):** a detached worktree at the pre-merge commit
  `60599846`, provisioned exactly like a lane worktree (node_modules symlink + main's *dynamic* untracked
  list + the untracked `server/schema` dir-symlink), ran `src/ai src/schema` → **13 failed files / 27
  failed tests**, IDENTICAL to HEAD `c3bb31ec` (13 / 27). **Set-diff empty in both directions: zero new
  regressions, zero repaired.** (The baseline worktree was removed after the comparison.)

## FINDING (durable — carried in "Baseline facts" from now on): symlinked lane tests execute against MAIN
`cl-integration-2/server/src/ai/createRecordIntent.test.ts` is a gitignored **symlink** into Brad's live
tree. Vite resolves symlinks to their real path, so that test executes from computable-lab's directory and
imports **main's** `submitSuggestionTool.ts`. Proof: the TRACKED `submitSuggestionTool.test.ts` pins the
enum to 4 and passes, while the SYMLINKED `createRecordIntent.test.ts` pins it to 3 and **also** passes —
two contradictory assertions against "the same module" can only both pass if they resolve to different
module instances. Consequences: (a) the AI-7 worker's prediction that this file would go RED post-merge was
**wrong** — it cannot see lane code; (b) main's one-line enum pin must be updated at **promotion** time (it
is Brad's untracked file, outside lane authority); (c) a lane suite must not be cited as covering files whose
tests are lane-excluded symlinks. Recorded as `AS-LANE2-ENV-1`.

## Merge
`git -c core.fileMode=false merge --no-ff wt/PROTO-AI-7-lane2-l2t1605` → `c3bb31ec`. Clean, no conflicts;
the 8 trunk doc commits (`47c19004`..`60599846`, all `.hermes/plans` docs) preserved. No schema/lint/ui/
lifecycle YAML changed → no lane-stack restart required.

## LIVE WORKERS (reconcile next tick — do NOT re-dispatch while alive)
- **PROTO-AI-5** (unchanged): bash `72429` / hermes `72485`, launched 16:17. Worktree
  `/mnt/vast/home/brad/git/wt/PROTO-AI-5-lane2-l2t1605`, branch `wt/PROTO-AI-5-lane2-l2t1605`.
  log `logs/PROTO-AI-5-l2t1605.log` (0 bytes until exit); report `.hermes/plans/PROTO-AI-5-report.wip-l2t1605.md`
  (not yet written); spec `.hermes/plans/2026-10-04_1605-PROTO-AI-5-server-write-gates.md`;
  session `20261004_161719_9a93af`.
- **PROTO-AI-10** (NEW, UI): bash `464226` / hermes `464282`, launched 19:13. Worktree
  `/mnt/vast/home/brad/git/wt/PROTO-AI-10-lane2-l2t1715`, branch `wt/PROTO-AI-10-lane2-l2t1715` (off
  `6cfc7e03`). log `logs/PROTO-AI-10-l2t1715.log` (0 bytes until exit); report
  `.hermes/plans/PROTO-AI-10-report.wip-l2t1715.md` (not yet written); prompt `/tmp/lane2-ai10-task.txt`.
  UI task → the `:5193` cl-browser-reviewer gate applies AFTER merge.

## Human gates — UNCHANGED; correctly parked; do NOT re-ask
- **PROTO-AI-11** (`blocked`, `blocker_next_check: on-change`): decision artifact
  `/home/brad/.hermes/cl/lanes/2/decisions/PROTO-AI-11-data-approval.md` — "Answer (Brad)" still empty.
  No new evidence → no action; question unchanged (close as superseded vs. redefine).
- **PROTO-AI-12**: its dependency **AI-7 is now MET** (merged). `§2` pre-registration artifact
  `/home/brad/.hermes/cl/lanes/2/decisions/PROTO-AI-12-prereg-approval.md` is still UNSIGNED, so part §4
  (shadow logging) is gated on Brad; parts 1–3 are startable in principle. No blocker recorded yet — next
  tick (with a free slot) should either record the human blocker for §4 or start the non-§4 portions.

## Next tick — first actions
1. Reconcile pids `72429`/`72485` (AI-5) and `464226`/`464282` (AI-10) + their logs/wip reports.
   ALIVE → leave alone. GONE → adopt: read the `.wip-*.md` report, open the REAL diff
   (`git -c core.fileMode=false diff cl/integration-2..<branch>`), run the targeted suites YOURSELF
   (from `server/`), typecheck, verify per spec, then `git -c core.fileMode=false merge --no-ff <branch>`.
2. **AI-5 done+merged → PROTO-AI-8 becomes ready** (deps AI-5 + AI-7 both met; spec already committed
   `.hermes/plans/2026-10-04_1638-PROTO-AI-8-client-apply-path.md`).
3. **AI-10** merged → `cl-lane-stack.sh 2 restart` → `cl-browser-reviewer` vs `:5193` (lane stack serves
   the TRUNK worktree only).
4. AI-9 (UI) follows AI-8; AI-12 gated on Brad's §2 signature (parts 1–3 startable); AI-11 on Brad.

## Baseline facts (carried)
- `cl/integration-2` HEAD = **`c3bb31ec`**.
- Full server suite RED at baseline (~121 failed files with lane-exclude modules present). The
  `src/ai src/schema` subset baseline (measured at `60599846` this tick) = **13 failed files / 27 failed
  tests**. Acceptance = targeted suite green + **no NEW baseline failures**.
- `npx tsc --noEmit -p server/tsconfig.json` baseline = **33 errors**.
- Lane stack: backend `:3093`, frontend `:5193` — UP.
- tsx --watch does NOT reload YAML ⇒ `cl-lane-stack.sh 2 restart` after any schema/lint/ui/lifecycle edit.
- `cl-lane-stack.sh` serves ONLY the trunk worktree; UI candidates must be merged before `:5193` sees them.
- A plain `git worktree add` off trunk is **NOT self-sufficient**: needs a `node_modules` symlink, main's
  untracked `server/src` / `app/src` files, AND the untracked `server/schema` and `app/schema` **directory
  symlinks** (`git ls-files --others` does not list dir symlinks — add them by hand).
- Symlinked (lane-excluded) test files execute against **MAIN's** sources — see FINDING / AS-LANE2-ENV-1.
- cl-scout "mis-configuration" flag from earlier ticks remains STALE (endpoint reports n_ctx 65536).

## assumptions:
- No NEW assumption from this tick's own work (verification-only; no product value supplied).
- Worker (AI-7) assumptions, accepted: the fresh worktree needed the lane-exclude untracked-module
  bootstrap (covered by `AS-PROTO-AI-4-W4`); `promptBudget.test.ts` RED at baseline and stays RED
  (pre-existing, tool schema already ~3x the budget before this change).
- Carried unchanged (full entries in `~/.hermes/cl/lanes/2/assumptions.md`): `AS-PROTO-AI-4-1`,
  `AS-PROTO-AI-4-W1..W4`, `AS-PROTO-AI-6-W1..W3`, and NEW `AS-LANE2-ENV-1`.

## Open evidence-debt entries: none.
