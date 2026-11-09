# LANE 1 TICK 295TH HANDOFF — 2026-11-03 15:41 → 16:1x EST

One line: **no dispatch was lawful** (both shared fleet coder slots held by LIVE lane-2 corpus coders the whole
tick ⇒ zero capacity before corpus priority even applies; both open lane-1 items still externally gated), so the
tick was spent on **real ledger repair**: a tier-1 re-gate at HEAD `5f64b6bf` restored the two `/analysis` claims
that Rule 2 had EXPIRED (table geometry + `/analysis` pane scroll) plus one live AI round-trip receipt, and pinned
exactly what stays UNVERIFIED.

## Reconciled first-hand (`cl-reconcile.sh 1` @ 2026-11-03T15:41:02-05:00)

- Queue: **todo 2, in-progress 0, superseded 1, done 108**; `task-list.lock` **FREE**; neither lane paused;
  lane-1 `corpus-state.md` **absent** (corpus-scout loop does not govern lane 1).
- Exa tripwire: `OK: exa apiKey present and consistent across lane1/lane2/canonical`.
- Trunk at open `cl/integration-1` @ **5f64b6bf** (294TH handoff commit). Nothing interrupted, nothing recovered.
- Stack: `:5192` 200 / `:3092` 200, exactly one listener each — pid 953556 cwd `.../cl-integration-1/app`,
  pid 954410 cwd `.../cl-integration-1/server`; data dir `/home/brad/.computable-lab-lane1` (lane1-config.yaml:5).

## Why nothing was dispatched (re-checked, not inherited)

| item | check | result |
|---|---|---|
| capacity | flock on the SHARED `~/.hermes/cl/appliance2-coder-slot-{0,1}.lock` | **both HELD**; slot-1 holder pid 1771456 = `hermes -p cl-coder` in `wt/CHATHOST-CONSOLIDATE-1-lane2-l2t0410` (sweep calibration, 33 min at open); slot-0 held by lane-2 `L2-CLARIFY-CARD-1` |
| `L1-PARAMS-EMITTER-RIDER` | `git log -1 -- scripts/fame-gatefix/` + `md5sum` | `136a3d27` @ 2026-11-02 17:09:38 (unchanged), emitter md5 `0e00b33a…` ⇒ trigger **UNMET**; `:709` still `"params": params` under the `:702` `string`/"canonical JSON" declaration |
| `FAME-1B-BACKFILL` | files newer than the 294TH check under `~/.hermes/cl` + `.hermes/plans` | **only my own lane-1 artifacts** ⇒ Brad HOLD **A-L1T229-3** stands; not executed, not re-asked |

## Carried verification (cheap, rotted-able only)

- Product-tree freshness: `git diff --name-only 3ea66c83..HEAD` = the 294TH handoff only ⇒ **no** app/, server/,
  schema/ change since the ledger's last derivation. Since gate commit `2d3035da`, non-plans paths = the 3
  cellrender TEST/test-helper files + `deliverables/` text artifacts ⇒ ViewRenderer.tsx itself untouched since
  the cellrender gate.
- Preservation sweep **including untracked tracked-scope** (the 294TH lesson): `git status --porcelain | grep '^??'`
  minus node_modules = **`ready` only** (the known stray root JSON, uid 3000, deliberately excluded from 3ea66c83).
  Zero new at-risk working-tree artifacts.
- 101 lane-1 worktrees: **all 0 commits ahead of trunk** except `gc-1-lane1-l1t1730` (`ahead=1`, docs-only
  `cl/lane1-gc-1-l1t1730`, 2026-10-25). Four 4-week-old QMS7 worktrees show 32 `T` (typechange) entries with a
  `32 files changed, 32 insertions(+), 2758 deletions(-)` diffstat — that is an NFS symlink-mode artifact of those
  old checkouts, not unmerged work (their branches are 0 ahead). No lane-1 work is at risk.

## Gate run — `L1-LEDGER-REGATE-1` (not an item gate)

- Unit `brgate-l1-ledgerregate-l1t1600` (`systemd-run --user --collect`, so it survives the tick), launcher
  `lanes/1/scripts/launch-brgate-ledgerregate-l1t1600.sh`, brief
  `lanes/1/prompts/regate-L1-LEDGER-REGATE-1-l1t1600.txt`, log `lanes/1/brgate-ledgerregate-l1t1600.log`
  (`BRGATE_START 15:44:05` → `BRGATE_EXITED rc=0 15:58:24`), receipts
  `~/.hermes/cl/receipts/L1-LEDGER-REGATE-1/regatel1t1600/`.
- Reviewer ended **`VERDICT: accept`**; per-claim: R2 **RESTORES**, R4-analysis **RESTORES**, R1-regression
  **RESTORES**. The brief named the original criteria verbatim and forbade rewording or relaxation.
- My audit of the evidence is written into `claims-ledger.md` (RE-GATE block): 31×10 assignment_results_view with
  every numeric cell at 1 line box / 1 token rect; 14/14 `comparison_report_view` columns `widthHonest` with the
  rightmost header inside the pane at `maxScrollLeft 1536`; 36 header pairs over 4 tables with 0 splits; flags cell
  readable after one trusted wheel; `.analysis` 829/4189 reaching `3360 = maxScrollTop` both programmatically and
  by two real wheels with no page h-bar. Screenshots 21, 23, 28, 43 inspected by me directly.
- R1 re-proved **by my own computation**, not quoted: the reviewer's recorded cell text parses as JSON and equals
  the stored `params` dict fetched live from `:3092` for both `AOUT-000100` (757 chars) and `AOUT-000136`
  (1316 chars); `[object Object]` absent.
- ROUND-TRIP-GATE-1 applied: `roundtrip/request-body-ai-assist.json` = real `POST /api/ai/assist/stream` (200,
  `text/event-stream`, body carries the typed question, `surface: analysis`, `activeRunId: ANR-000071`,
  `ANREV-000022`), zero `page.route`/`fulfill`, paired with `shots/43-RT-answer.png`.

## What this tick deliberately did NOT claim

- The AI answer was **pipeline narration**, not the contested flags the question asked for (reviewer O-3). The new
  AI row is scoped to **liveness only**; grounded AI behaviour on `/analysis` is still UNVERIFIED and is not a
  lane-1 item — do not quote the round trip as AI correctness.
- `/ingestion`, `/registry`, `/find`, `/sequences` pane scroll and the `/run` nav rail **remain EXPIRED**.
- `/analysis` layout/chrome/overflow beyond the two graded legs remains UNVERIFIED.
- No coder, no product code, no schema, no data write, no stack restart, no status change.

## Gates / merges this tick

**None.** Docs/ledger only: `claims-ledger.md` (two restored rows, one new scoped AI row, one split EXPIRED row,
RE-GATE block), this handoff, the task-list tick note (temp+rename under `task-list.lock`), `no-work.log`.

## Assumptions

- **AS-L1T295-1** Re-gating EXPIRED ledger rows with no owning task is within the orchestrator's verification
  authority: it changes no acceptance criterion, no product behaviour, no status, and it is the only lane-1 work
  permitted while both fleet slots belong to lane 2 (the corpus-priority clause explicitly allows lane-1 browser
  review). Debt: **false**. If Brad disagrees, the ledger rows are the only thing to revert.
- **AS-L1T295-2** Running the tier-1 reviewer while no other vision worker was live (checked: 0 matching
  processes) did not contend for lane 2's vision slot. Debt: **false**.
- AS-L1T278-3 (FAME-1B-BACKFILL Brad hold) **debt: TRUE**. AS-L1T291-3 (EXPIRED rows need re-gating before a spec
  relies on them) — **partially closed**: the two `/analysis` rows are now quotable; the `/run` and four other
  pane rows stay EXPIRED (**debt: TRUE** for those).

## Next-tick checks (priority)

1. `cl-reconcile.sh 1`; expect todo 2 / in-progress 0 / done 108; note whether lane-2's two coders exited.
2. Rider: `git log -1 -- scripts/fame-gatefix/` — a re-mint makes the one-line `:709` fix **MANDATORY** in that pass.
3. Slot truth is the flock on the SHARED `~/.hermes/cl/appliance2-coder-slot-{0,1}.lock`; per-lane copies are stale.
4. If a spec is next written against `/analysis`, quote the restored rows (geometry / pane scroll / params cells)
   and nothing else on that page.
5. Optional remaining ledger debt (no consumer today): re-gate `/run` nav rail + the four non-`/analysis` panes.

## Trunk after this tick

`5f64b6bf` + this tick's docs commit. No product change since `2d3035da`.
