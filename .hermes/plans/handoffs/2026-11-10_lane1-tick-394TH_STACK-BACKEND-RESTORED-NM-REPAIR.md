# Lane 1 — tick 394TH (2026-11-10 ~05:00–05:35 EST) — backend :3092 was DOWN; node_modules layout repair; queue still rider-gated

## State at open (reconcile 05:04)
- Queue: todo 1 (L1-PARAMS-EMITTER-RIDER, rider-gated), superseded 1, done 111, in-progress 0.
  No PAUSE (lane or fleet), lock FREE, no live lane-1 coder (slot-0 held by LANE-2
  L2-MATSEL-u3fix1b pid 1585588; slot-1 pidfile holder DEAD).
- brief-ready: "no ready undispatched brief" (3 stale >4h rows = consumed RACE-1 chain).
- Closeout/respec audits: lane-2 ids only; the lane-1-adjacent rows are the known stale
  RACE-1 o2-chain silent-exit records (landed+merged 62fd1116 — no-duplicate rule holds).

## ACTION THIS TICK: stack recovery (real defect, found first-hand)
- reconcile + cl-lane-stack status both showed backend :3092 http=000 (down) while :5192=200.
  Root cause (backend.log, ERR_MODULE_NOT_FOUND x4): the trunk's
  `server/node_modules -> /mnt/vast/home/brad/git/computable-lab/server/node_modules` symlink
  resolved into pnpm links pointing at `git/node_modules/.pnpm` — a path that DOES NOT EXIST
  (`ls /mnt/vast/home/brad/git` first-hand: no node_modules entry; likely an NFS remount).
  Every dependency link there was dangling.
- FIX (lane-scoped, no -lockfile change): removed the trunk-level `server/node_modules` symlink
  and copied the WORKING layout from cl-integration-2/server/node_modules (29 entries, all
  verified to resolve; relative pnpm links into cl-integration-2's own .pnpm store, 1111 pkgs).
  Also repaired 13 dangling root-store links in computable-lab/node_modules by rebasing each
  `../../node_modules/.pnpm/...` onto its own local `.pnpm` (yaml was the one blocking the
  lane-1 boot). Nothing under :3001/:5174 was touched (main stack was already down before this
  tick — curl 000, not restarted per the never-touch rule); no model service touched.
- One tsx-watch process was wedged mid-crash; killed the crashed child, restart via
  cl-lane-stack.sh 1 restart. FINAL STATE: `lane 1 backend :3092 http=200 frontend :5192
  http=200`; /api/health 200 (schemas 205, lint 156, ai available). Note: the health endpoint
  is /api/health — a bare /health probe 404s; my earlier curl checks used the wrong path.
- Trunk cl/integration-1 @ 15a9ebaf; working tree has only pre-existing untracked rows
  (old handoff .md files, node_modules, ready) — no code drift.

## Queue decision
- Rider trigger re-measured THIS tick: `git log -1 -- scripts/fame-gatefix/` =
  136a3d27 2026-11-02T17:09:38 -0500 UNCHANGED => L1-PARAMS-EMITTER-RIDER UNMET; block
  (:13039) "Do not open a cycle for it." binds. Not briefable under lane-1 authority.
- No brief written, no worktree, no dispatch, no status change (todo 1 / in-progress 0 / done 111).

## Carried obligations (unchanged)
1. Architect notes owed: cl-brief-ready consumed-review detection blind spot; mutation-template
   no-op probe; launcher marker-grep wording. NEW: node_modules self-heal fragility — the shared
   pnpm-link layout under /mnt/vast/home/brad/git breaks if the mount topology shifts; consider a
   per-trunk store or a stack-script layout check (this tick cost the whole budget on it).
2. Worktree retirement wt-RACE1-o2-lane1 + wt-RACE1-mv1-lane1 (landed, clean) — left in place.
3. OBS-1 cosmetic fail-closed header (reviewer observation, no queue authority).
4. L1-RECORD-LOCK-GUARD-1 BRAD-CARD still awaiting Brad.

## Next tick
- Expect idle-slots-correct unless the composer produces a genuinely unowned brief, Brad answers
  the card, or anything lands under scripts/fame-gatefix/ (rider trigger).
