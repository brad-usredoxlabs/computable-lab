# LANE 1 TICK 294TH HANDOFF — 2026-11-03 15:20 → 15:3x EST

One line: **no dispatch was lawful** — both shared fleet slots are held by LIVE lane-2 corpus coders, so lane 1
had zero capacity before CORPUS PRIORITY even had to be invoked — and the tick was spent fixing a **real
preservation defect**: 38 lane-1 plan artifacts (1.15 MB) existed only in the trunk working tree and on no ref,
including the governing ruling of the open item FAME-1B-BACKFILL. Committed as docs housekeeping at `3ea66c83`.

## Reconciled first-hand (`cl-reconcile.sh 1` @ 2026-11-03T15:21:17-05:00)

- Queue: **todo 2, in-progress 0, superseded 1, done 108**; `task-list.lock` **FREE**; **neither lane paused**;
  lane-1 `corpus-state.md` **absent** (so the corpus-scout loop does not govern this lane).
- Exa tripwire: `OK: exa apiKey present and consistent across lane1/lane2/canonical`.
- Trunk at open `cl/integration-1` @ **8b5881ec**; nothing interrupted, nothing recovered, nothing relaunched.
- Stack: `:3092/api/schemas` **200**, `:5192/` **200**, exactly one listener on each (no duplicate vite/node).
- Fleet: `appliance2-coder-slot-0` **HELD** by `L2-CLARIFY-CARD-1` (launcher 1744016 / `hermes -p cl-coder` pid
  1744019, worktree `wt/L2-CLARIFY-CARD-1-lane2-l2t0230`, CARD1 **FIX RUN 5** implementing the D3
  canonical-label ruling); `appliance2-coder-slot-1` **HELD** by `CHATHOST-CONSOLIDATE-1` (launcher 1771454 /
  pid 1771456, `wt/CHATHOST-CONSOLIDATE-1-lane2-l2t0410`, post-merge sweep calibration). Both holders
  `holder=alive`, both started <30 min before the tick. Lane 2 carries 4 todo + active `corpus-state.md`
  (prompt-2 SPECS-QUEUED). **Zero free slots ⇒ no lane-1 coder could launch regardless of priority.**

## Why nothing was dispatched (re-checked, not inherited)

| item | check | result |
|---|---|---|
| `L1-PARAMS-EMITTER-RIDER` | `git log -1 -- scripts/fame-gatefix/` | `136a3d27` @ 2026-11-02 17:09:38 — **unchanged** ⇒ trigger **UNMET** |
| ″ premise re-pinned | `md5sum scripts/fame-gatefix/assignment-contested-entry.py` | `0e00b33a89c432f537f666398982df36` (unchanged); `:709` still `"params": params` under the `:702` column declared `string` / `"canonical JSON"` |
| `FAME-1B-BACKFILL` | files under `~/.hermes/cl` + `.hermes/plans` newer than the 293RD check | **only lane-2 artifacts** ⇒ Brad HOLD **A-L1T229-3** stands; not executed, not re-asked |

## The delivered work — preservation commit `3ea66c83` (docs only)

**Defect.** The 293RD sweep proved no *worktree* and no *branch* held unmerged work, but it did not look at
**untracked tracked-scope files**. The trunk checkout carried **39** of them under `.hermes/plans` (1,145,358 B).

**Measured scope, first-hand.** For each of the 38 plan files, `git log --all --oneline -1 -- <path>` returned
**empty** ⇒ no branch, tag, or reflog-bearing ref contained them; they lived only in that NFS working tree.
Files: 2026-10-15..2026-11-02 spec drafts, decision requests and architect rulings (QMS7-1/2/3, QMS8-B, VPDF-3/4,
INSTR-COLLAPSE-1/2, INSTR-READCHAIN-1, GC-5..GC-12, GC17, FAME-1/2/3/4/6/7/8 decisions, GC12 recon dump).

**Why this mattered beyond tidiness.** `.hermes/plans/2026-11-01_fame-1-legacy-status-decision-request.md` is the
**governing architect ruling cited by the still-open todo `FAME-1B-BACKFILL`** (`task-list.md:11876`) and was not
recoverable from git. That item is one Brad "go" away from execution; its authority document existed in exactly
one mutable place — the same accident class that truncated `task-list.md` on 2026-10-16.

**Action.** `git add` of the 38 pathspecs → commit `3ea66c83` (38 files, +11400 lines, `.hermes/plans` only).
Secret-scan before commit: the single hit (`DRAFT-2026-10-30T2210-GC17-...md:152`) is the *name*
`EXA_API_KEY`, not a key value — no secret is in this commit. Excluded deliberately: the stray root file `ready`
(JSON, uid 3000, not a lane-1 artifact) and untracked `node_modules`.

**Verification (not the worker's word — there was no worker):**
- `git show --name-only --format='' 3ea66c83 | grep -v '^.hermes/plans/'` → **0 lines** (no product code, no schema).
- `git cat-file -p HEAD:.hermes/plans/2026-11-01_fame-1-legacy-status-decision-request.md` → prints the ruling.
- `git diff --name-only 39bd2b2f..HEAD | grep -v '^.hermes/plans/'` → **0** ⇒ the product tree is byte-identical
  to the 293RD-verified HEAD, so that tick's bars (`vitest src/analysis` 26 files / **391 tests PASSED**; `tsc`
  21 error lines = documented baseline, 0 in `src/analysis`) and the claims-ledger row-1 quotable window transfer
  to `3ea66c83` unchanged. **A green unit/tsc run is not UI evidence** and is not quoted as one.

## Gates / merges this tick

**None.** No product code, no schema, no data write, no stack restart, no coder, no browser gate, no status
change. Docs only: `3ea66c83` (38 preserved artifacts), this handoff, the claims-ledger freshness line, the
task-list tick note (temp+rename under `task-list.lock`), and `no-work.log`.

## Assumptions

- **AS-L1T294-1** The corpus-priority reading was not needed to decide this tick: *zero* appliance-2 slots were
  free, which forbids a lane-1 launch on capacity alone. Debt: **false**.
- **AS-L1T294-2** Committing another tick's untracked drafts to trunk is housekeeping within my authority
  ("promote worker artifacts"), not a scope change: no status, acceptance criterion, or product behaviour is
  altered by it. If a future tick finds a preserved draft contradicts a merged spec, the draft is superseded
  evidence — it is not authority. Debt: **false**.
- AS-L1T278-3 (FAME-1B-BACKFILL Brad hold) **debt: TRUE**. AS-L1T291-3 (EXPIRED ledger rows need re-gating
  before any spec relies on them) **debt: TRUE** — rows 2-4 stay EXPIRED; this tick ran no browser gate.

## Next-tick checks (priority)

1. `cl-reconcile.sh 1`; expect **todo 2, in-progress 0, done 108** and note whether the two lane-2 coders exited.
2. Rider: `git log -1 -- scripts/fame-gatefix/` — a re-mint makes the one-line `:709` fix **MANDATORY** in that pass.
3. Slot truth before any claim is the **flock on `~/.hermes/cl/appliance2-coder-slot-{0,1}.lock`** (SHARED base);
   the per-lane copies are stale. `cl-reconcile.sh` already prints it correctly.
4. Append an accept row to `claims-ledger.md` in the same transaction as any future `app/`/`server/` merge.
5. When sweeping for at-risk work, include **`git status --porcelain | grep '^??'` for tracked-scope paths** —
   branch/worktree sweeps alone miss working-tree-only artifacts (the defect this tick fixed).

## Trunk after this tick

`3ea66c83` (preservation commit + this handoff). No product change since `b1dd259f`.
