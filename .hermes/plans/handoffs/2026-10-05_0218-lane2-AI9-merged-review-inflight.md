# Handoff — LANE 2 tick 2026-10-05T01:30 → 02:30 EDT (AI-9 worker DONE+MERGED; UI gate IN FLIGHT)

Campaign: `ai-protocol-edit-and-router` (lane 2 list `~/.hermes/cl/lanes/2/task-list.md`).
Trunk: `cl/integration-2` — HEAD this tick: **`b5b1948a`** (merge of PROTO-AI-9).

## Outcome this tick
- **Reconciliation (step 2):** the ONE in-progress item was PROTO-AI-9. Its worker was **STILL LIVE**
  at tick start (session `20261004_225933_1d150e`, 138 msgs/76 calls, last activity 01:29:50,
  "receiving stream response") and actively in the RED→implement phase. No adoption possible, no
  duplicate dispatched.
- **Worker completed mid-tick.** Watched it through implementation (all 4 targets touched:
  `AiTabPanel.tsx`, `ChangesPanel.tsx`, `sidebarState.ts` + tests), then commit, then a clean exit:
  log ended `PROTO-AI-9 WORKER EXITED code=0`. Commits **`7a3202e9`** (feat) + **`e6db21c9`** (report).
- **Verified myself (step 6):** opened the REAL diff (6 files, +1073/−7, all under
  `app/src/event-editor/right-pane/ai/`). Additive-only (optional `protocolDiff`/`applying`/
  `applyError`; `EventGraphChange` byte-unchanged). Ran the targeted suite **4 files / 50 tests PASS**
  in the worker worktree **and** on the merged trunk. `app` tsc on merged trunk = **47 lines ==
  pre-merge trunk 47 → ZERO new errors** (the 9 "extra" worktree-tip lines are pre-existing
  `src/sequences/*` errors from base drift, outside owned files).
- **MERGED (step 8):** `git -c core.fileMode=false merge --no-ff wt/PROTO-AI-9-lane2-l2t2252`
  → trunk `04f8fcb9` → **`b5b1948a`** (clean). Lane stack restarted; `:5193` serves `b5b1948a` from
  `/mnt/vast/home/brad/git/cl-integration-2/app` (curl of the served `ChangesPanel.tsx` module
  returns `protocolEditDiffFrom`).
- **UI gate IN FLIGHT (step 7) — dispatched, then budget expiry:** `cl-browser-reviewer`
  bash pid **1464468** / hermes pid **1464563**, log
  `logs/PROTO-AI-9-review-20261005T0218.log`, receipts `receipts/PROTO-AI-9/2026-10-05_0218/`.
  Prompt `/tmp/lane2-ai9-review-task.txt`. STATUS stays **in-progress** until `VERDICT: accept`.
- **Blockers (step 3):** 0 due/changed. Both watched decision artifacts UNCHANGED —
  `decisions/PROTO-AI-11-data-approval.md` (mtime 2026-10-04 16:56:52, 3152 B) and
  `decisions/PROTO-AI-12-prereg-approval.md` (mtime 2026-10-04 16:54:16, 1231 B) → still
  unanswered; NOT re-asked.
- **Ready set:** nothing else dispatchable — AI-11 (blocked/Brad), AI-12 §2/§4 (blocked/Brad),
  AI-13 (dep-gated on AI-12 §4). AI-9's browser gate is the only live work.

## Budget / checkpoint note
- 45-min soft budget was **exceeded** finishing the merge + dispatching the mandatory UI gate for the
  only in-flight item; no fresh *worker* work was launched beyond the required gate (appliance-2
  browser profile, does not consume the shared senior endpoint). Next tick must **adopt the reviewer**.

## Live at checkpoint (ADOPT NEXT TICK — do not re-dispatch while alive)
- **cl-browser-reviewer** for PROTO-AI-9: bash pid **1464468** / hermes pid **1464563**. Log is the
  ONLY completion signal (0 bytes until the trailing `PROTO-AI-9 REVIEWER EXITED code=N`).
  Receipts dir `receipts/PROTO-AI-9/2026-10-05_0218/` (report.md, trail.json, PNGs).
- Lane-1 senior endpoint: QMS-6E (pid 1086228) + QMS-6F (pid 1232210) live this window → shared
  senior capacity 3/4 (incl. this lane's now-exited AI-9). No lane-2 worker live.

## Next tick first actions
1. **Read the AI-9 review receipts first.** On `VERDICT: accept` → promote
   `.hermes/plans/PROTO-AI-9-report.wip-l2t2252.md` to canonical
   `.hermes/plans/PROTO-AI-9-report.md`, mark PROTO-AI-9 **done** in the task list, write handoff.
   On `VERDICT: fix` → re-dispatch **cl-senior** (resume, new owned run) with the defect list and
   ABSOLUTE screenshot paths, then re-review. On `blocked` → record the structured blocker
   (owner/evidence/resume) and continue.
2. AI-12 §2/§4 remain STOPPED on Brad's pre-registration signature; AI-11 parked on Brad (`on-change`);
   PROTO-AI-13 dep-gated on AI-12 §4 evidence. Do not re-ask either human question.

## Pitfall recorded this tick (IMPORTANT)
- `cl-lane-stack.sh 2 restart` runs **blocking** — it hit the 600s foreground timeout and left BOTH
  the lane backend and frontend DOWN. Recovered by launching `cl-lane-stack.sh 2 start` with
  `background=true` (came up ~65s later: frontend `:5193` 200, backend `:3093` 200). Use
  `background=true` for `start`/`restart`; only `status` is safe in the foreground.

## Baseline facts (carried / updated)
- `cl/integration-2` HEAD = **`b5b1948a`**. Server tsc baseline = 34 lines; app tsc baseline (measured
  this tick on trunk) = **47** lines.
- Lane stack: backend `:3093`, frontend `:5193` (both http=200 at checkpoint); serves trunk only.
- Worker worktree tips lag trunk; re-measure tsc/suites ON THE MERGED TRUNK.

## assumptions:
- **PROTO-AI-9 (7 entries)** appended to the lane ledger and detailed in
  `.hermes/plans/PROTO-AI-9-report.wip-l2t2252.md` §"Consequential assumptions":
  AS-PROTO-AI-9-W1 (handleDeckLayout discipline implemented from prose — symbol absent),
  W2 (Accept sends envelope `ops` verbatim), W3 (target = envelope protocolId ?? attached recordId),
  W4 (additive display-type divergence from grounding-map §(e)), W5 (conflict keeps review open, no
  auto-reset), W6 (no deck ghost preview for protocol edits),
  **W7 (evidence_debt: true — AI-9's real E2E Accept→apply is proven ONLY by the :5193 browser gate,
  not by unit mocks; the gate must not accept that flow on the strength of the wiring tests).**
- No new orchestrator assumptions beyond the merge verification (all facts measured on trunk).

## Open evidence-debt entries (carry forward)
- **`AS-PROTO-AI-9-W7`** — E2E Accept→apply proof rests on the PROTO-AI-9 browser gate receipt
  (in flight). Clear when the reviewer returns `VERDICT: accept` with the sha-before/after evidence.
- **`AS-PROTO-AI-12-W1`** — the SERVED router artifact is the QAD-Q4_0 quant of LFM2.5-350M
  (sha256 3d10b6ab…); acceptance-relevant to PROTO-AI-13's verdict → MUST be disclosed with its
  digest in §13's report; re-run on Q4_K_M if the gate is close. Carried forward until §13 clears it.
