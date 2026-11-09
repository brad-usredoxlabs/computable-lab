# Post-verdict consolidation — merge both lanes into main and push

Brad, 2026-11-08 20:20: *"IFF prompt 2 is a pass, we should pause, merge lanes 1 and 2 and push to
origin main."*

Status: ARMED — waiting on the PROMPT2-REGATE verdict. Nothing here runs before `PASS 3/3`.

## The condition, stated so it cannot drift

A receipt under `~/.hermes/cl/receipts/PROMPT2-REGATE-20261109/<ts>/REPORT.md` whose verdict line is
`PROMPT2-REGATE: PASS` with 3/3 legs, naming the served revision it was run against. `PARTIAL`, a
flake, or a missing leg is **not** a pass; the plan stays armed and the lane keeps working.

## Measured state at planning time (2026-11-08 20:20 EST)

| ref | tip | note |
|---|---|---|
| `origin/main` | `b7a3dd8c` (2026-10-25) | 14 days stale; **is** the merge base of both lanes |
| `cl/integration-1` | lane-1 trunk | **824 commits ahead of main**, 0 behind |
| `cl/integration-2` | lane-2 trunk | **1754 commits ahead of main**, 0 behind |

- Both lanes share merge-base `b7a3dd8c`, so this is a clean three-way from a common ancestor — no
  history rewriting, no rebase.
- Changed files since the base: lane-1 **740**, lane-2 **1312**, **overlap 9**. The 9:
  - `app/src/event-editor/right-pane/protocol/ProtocolNavPanel.actions.test.tsx`
  - `app/src/run/RunWorkspacePage.tsx`
  - `app/src/shared/ai/useWorkstateProposalFlow.ts`
  - `app/src/shared/api/client.ts`
  - `app/src/shared/hooks/useAiChat.ts`
  - `server/src/ai/submitSuggestionTool.ts`
  - plus 3 further paths listed by `comm -12 /tmp/l1s /tmp/l2s` at planning time.
- Lane-1 worktree had **8 uncommitted files**. Commit or revert before merging: never merge a
  branch whose worktree is dirty, and never let the merge swallow unattributed work.
- History warning: `origin/main` already carries three `merge-fix:` commits from the last dual-lane
  auto-merge. The failure mode is known — a mechanical auto-merge that builds but does not agree
  semantically. Hence the verification gate below.

## Order (sequential, not octopus)

Lane 1 first: it is the older trunk, paused since 2026-11-05, and it carries the QMS/editor work
lane 2 has been building on top of. Then lane 2. An octopus merge would hide which lane introduced a
conflict, which is exactly the information needed to fix one.

```
# 0. freeze (do not merge under a live gate or a dirty tree)
#    pause is written by the user/orchestrator as lanes/1/PAUSE + lanes/2/PAUSE — the architect
#    records the decision, it never writes or removes a pause file.
git -C /mnt/vast/home/brad/git/cl-integration-1 status --porcelain   # must be empty
git -C /mnt/vast/home/brad/git/cl-integration-2 status --porcelain   # must be empty

# 1. safety ref: tag what main points at now, so the push has an undo
git tag pre-consolidation-20261108 b7a3dd8c && git push origin pre-consolidation-20261108

# 2. integration branch off main
git switch -c consolidation/20261108 b7a3dd8c
git merge --no-ff cl/integration-1 -m "consolidate: lane 1 (QMS/editor) into main"
#    resolve the overlap files above; for each, decide which lane's semantics win — a green build
#    is not agreement.

# 3. verify lane 1 alone before adding lane 2 (bisectable)
pnpm -w run typecheck
npm run test:run -w server
npm run test:unit -w app

# 4. then lane 2
git merge --no-ff cl/integration-2 -m "consolidate: lane 2 (protocol edit, prompt-2 bedrocks) into main"

# 5. verify the merged tree, then push
pnpm -w run typecheck && npm run test:run -w server && npm run test:unit -w app && npm run build -w server
git switch main && git merge --ff-only consolidation/20261108
git push origin main
```

## Verification that has to pass before the push

- `pnpm -w run typecheck` — both workspaces.
- `npm run test:run -w server` and `npm run test:unit -w app` — full suites, not the touched files.
- `npm run build -w server` — a build catches what typecheck alone does not.
- One boot: `./start-app.sh` on the merged tree, one page loads, one record reads. A merge that
  typechecks but cannot serve is not consolidated.
- The four overlap files reviewed by hand, each with a one-line note on which lane's semantics won.

## Rollback

`pre-consolidation-20261108` names the pushed state. If the merged tree is wrong after the push:
`git revert -m 1 <merge>` on main, push, and the lanes are untouched — the merge never modifies
either lane branch, only main.

## 6. Re-base both lanes onto the consolidated main (Brad, 2026-11-08 20:35)

*"then we should rebase all changes back over lane 1 abd lane 2 and we should rebase and restart my
dev setver at :5174."*

After the push, both lane trunks are **behind main by construction** — main now contains both lanes'
work, so leaving `cl/integration-1`/`-2` at their old tips makes every later lane commit replay work
that is already on main. So the trunks are re-pointed at main:

```
# main is the new truth; the lane trunks become main + nothing (they had no unpushed work by
# definition — the merge contained all of it)
git -C /mnt/vast/home/brad/git/cl-integration-1 fetch origin
git -C /mnt/vast/home/brad/git/cl-integration-1 rebase origin/main        # expect: "up to date" or 0 conflicts
git -C /mnt/vast/home/brad/git/cl-integration-2 fetch origin
git -C /mnt/vast/home/brad/git/cl-integration-2 rebase origin/main        # same
```

Rules that make this safe rather than hopeful:

- **Rebase, never reset.** If a lane somehow carries a commit main does not have, rebase keeps it and
  surfaces the conflict; `reset --hard origin/main` would delete it. Check first with
  `git -C <lane> rev-list --count origin/main..HEAD` after the merge — the expected answer is 0.
- **A non-zero count is a stop, not a squash.** That would mean a lane commit missed the merge; that
  gets reported and fixed as its own unit, never silently dropped.
- Both worktrees must be clean before rebasing (lane 1 had 8 uncommitted files at plan time).
- After the rebase, both lanes' next tick builds worktrees off the consolidated main, so the two-lane
  split stops re-introducing the seam this campaign spent a week closing.

## 7. Restart the dev server at :5174 (Brad's, after the rebase)

The :5174 app dev server (and its :3001 API) is the user's own stack — separate from the lane stacks
on :519x/:309x. Restart it on the consolidated tree so what he clicks is the merged product, not a
stale Vite process serving pre-merge modules:

```
ss -tlnp | grep -E ':(5174|3001)'      # exact PIDs, never pkill
# stop those exact PIDs, then from the consolidated checkout:
./start-app.sh
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:5174/    # expect 200
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3001/api/records?limit=1
```

Restarting a dev server is pre-authorized; killing by pattern is not (standing rule: exact PIDs via
`ss -tlnp`).

## What this does not do


- It does not delete either lane, its trunk, or its worktree. Both stay for the next campaign.
- It does not re-run prompt 2. The WORKS row is written on the served revision named in the PASS
  receipt; the merge does not invalidate it, and a re-run after consolidation is a separate decision.
