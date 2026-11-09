# LANE 1 TICK 285TH HANDOFF — 2026-11-03 11:20 → 11:32 EST

One line: **no dispatch (5th consecutive) for two independently observed reasons** — the free fleet slot
provably exists this tick and lane 1 still has nothing it may legally run — plus the 284TH's evidence debt
was **reproduced from scratch** (identical 120 rows / 48 artifacts) instead of being inherited.

## Reconciled first-hand (`cl-reconcile.sh 1` @ 11:20:56)

todo **2**, in-progress **none**, blocked **1**, superseded **1**, done **107**. Queue lock **FREE**.
Neither lane paused. `corpus-state.md` absent in lane 1. Exa tripwire **OK** ("apiKey present and
consistent across lane1/lane2/canonical"). Stack `:3092` and `:5192` both **200**.

Trunk was at **`3ca46dfa`** when I reconciled — i.e. it had moved past the 284TH's measured base
`92c8a4f3`. I re-proved rather than assumed: `git diff --stat 92c8a4f3..3ca46dfa` = **exactly one file,
152 insertions** (the 284TH handoff `.md`). Zero product files moved ⇒ the 280TH merge-rehearsal bar
(52/52 focused, 382/382 `src/analysis`, tsc 12 lines / 0 in `src/analysis`, CSS blob `c6930c66`) is
**still valid at the current tip** and needs no re-rehearsal.

## Fleet, measured — **CORRECTED 11:38, see the closing addendum**

> The slot-1 reading below was taken with `flock -n` on **`~/.hermes/cl/lanes/1/appliance2-coder-slot-1.lock`**,
> which is a **STALE per-lane copy**. `cl-coder-launch.py` takes its fleet locks under the shared base
> **`~/.hermes/cl/appliance2-coder-slot-{0,1}.lock`**; a lane-dir copy always reports FREE. The mechanic
> below ("I acquired the lock") is therefore an INVALID witness and is retracted in the addendum.

- appliance-2 slot-0: **HELD** — `L2-CHATHOST-CONSOLIDATE-1`, pid 1101760 live, etime **1h43m** at close.
- appliance-2 slot-1 (as measured at 11:30): reported FREE from the stale lane-dir lock. **Retracted** —
  the shared lock was in fact taken by lane 2's `L2-CLARIFY-CARD-1` (pid 1314955) at **16:22:29Z**.
- Lane 2 queue: **4 todo + 3 in-progress** and an active `corpus-state.md` ⇒ **CORPUS PRIORITY**
  (Brad 2026-11-02T17:05) makes a freed slot **lane 2's first refusal**. Lane 2's own orchestrator tick
  was live while I ran (pid 1287707). I launched nothing and claimed no lock.

## Why lane 1 dispatched nothing — three separate gates, each re-verified first-hand

- **L1-PIN-HARDEN-1 (blocked / Brad)** — card `.hermes/plans/2026-11-03_l1-pin-harden-1-freeze-brad-card.md`
  md5 **`bc9cd6d91186806b4854155968a21cda`** (unchanged, still no answer block). Authorization marker
  `L1-PIN-HARDEN-1-fix3-AUTHORIZED` **ABSENT** — and the kit is genuinely self-gating: both fix3 launchers
  are `bash -n` clean and their logs hold real `NOT-AUTHORIZED` refusals from 06:45:39/06:45:59, so neither
  can fire silently. Worktree `wt/l1-pin-harden-1-lane1` **CLEAN at `6ea3ec29`** (the tip B and the fix3
  kit both reference), branch unmerged. Coder prompt md5 **`1e8ed2965002395ce25a4143a0167c94`** — identical
  to the 276TH record ⇒ A costs zero prep. Not re-asked, no fourth cycle.
- **FAME-1B-BACKFILL (todo / Brad hold A-L1T229-3, re-affirmed 2026-11-02T17:05)** — hold stands. Not
  executed, not re-asked, gap table not re-derived a third time.
- **L1-PARAMS-EMITTER-RIDER (todo / rider-triggered)** — `git log -1 -- scripts/fame-gatefix/` is still
  **`136a3d27` @ 2026-11-02 17:09:38**, unchanged since the 265TH banking; FAME-8 is `done` ⇒ no open
  evidence-chain cycle ⇒ trigger **UNMET**.

## The tick's one piece of real work: 284TH evidence debt reproduced, not inherited

I re-ran the receipted auditor from the receipt directory
(`~/.hermes/cl/receipts/L1-COLTYPE-AUDIT-1/20261103T1100/audit_column_contracts.py`, confirmed read-only:
its only `open()` is a `yaml.safe_load` read and its only output is `json.dump(…, sys.stdout)`).
Result, byte-identical to the 284TH receipt:

| | 284TH | 285TH (this tick) |
|---|---|---|
| yaml artifact records / parsed | 131 / 131 | 131 / 131 |
| tables with columns+rows | 93 | 93 |
| `effective_parameters.params` (declared `string`) | 23 rows / 23 artifacts | identical |
| `claimed_peak_refs` (declared `string[]`, emitted int lists) | 97 rows / 25 artifacts / 4 table names | identical |
| **total violating rows / artifacts** | **120 / 48** | **120 / 48** |

So the future column-contract campaign's premise is now **observed twice, from a fresh process**, and the
debt is a reproducible measurement rather than one tick's claim. **Still deliberately NOT filed**: the
architect's 2026-11-03 ruling forbids widening the rider to other columns and forbids filing the validator
alone, and `[1]` vs `["1"]` has no user-visible consequence through the post-CELLRENDER array arm.
Nothing written to any store; no record, schema or product file touched.

## Assumptions

- **AS-L1T285-1** `92c8a4f3..3ca46dfa` is docs-only (measured: 1 file, 152 insertions), so the 280TH pin
  rehearsal bar still holds at the current trunk. **debt: false**.
- **AS-L1T285-2** The column-type audit is safely re-runnable: read-only by inspection of its own I/O
  calls, no writes, lane store is TEST DATA per Brad's standing ruling. **debt: false**.
- **AS-L1T285-3 (RETRACTED 11:38)** Original text claimed slot-1 was genuinely free because I had *taken the
  flock*. That lock was a **stale per-lane copy** (`~/.hermes/cl/lanes/1/appliance2-coder-slot-1.lock`); the
  launcher's real fleet locks live at `~/.hermes/cl/appliance2-coder-slot-{0,1}.lock`. Measured truth at
  close: **both slots HELD** (slot-0 `L2-CHATHOST-CONSOLIDATE-1` pid 1101760; slot-1 `L2-CLARIFY-CARD-1`
  pid 1314955, started 16:22:29Z). The dispatch conclusion is unchanged — and better supported — because
  lane 2 converted the freed slot into a coder within ~90 s. Replaced by **AS-L1T285-3R**: at no point this
  tick was a fleet slot both free and legally claimable by lane 1. **debt: false**.
- **AS-L1T285-4** No lane-1 coder/agent process is orphaned: the only coder-family process on the box is
  lane 2's slot-0 launcher (pid 1101760) plus the two orchestrator ticks (lane 2 pid 1287707, this lane
  pid 1310079). **debt: false**.
- AS-L1T284-1..3, AS-L1T283-1..3, AS-L1T282-1..3, AS-L1T281-1..3, AS-L1T280-1..2 and earlier CARRY
  FORWARD unchanged. **AS-L1T278-3** (the FAME-1B-BACKFILL Brad hold) remains **debt: TRUE**.

## Evidence debt after this tick

- **OPEN (frozen to Brad)**: CSS-scanner nesting evasion → `L1-PIN-HARDEN-1` (card md5 `bc9cd6d9…`).
- **OPEN (rider, trigger-gated)**: `assignment-contested-entry.py:709` emits a dict behind a declared
  `string` → `L1-PARAMS-EMITTER-RIDER`, mandatory at that script's next re-mint.
- **OPEN (evidence debt, NOT an item, now reproduced twice)**: `claimed_peak_refs` declared `string[]` /
  emitted `list[int]` — 4 table names, 97 rows, 25 artifacts; declaration-side fix pinned at `:674`.
- **OPEN (Brad hold)**: `FAME-1B-BACKFILL` — one command, spec staged.
- **CLOSED THIS TICK**: "was the 284TH's 120-row audit a one-off?" — no, reproduced identically from a
  fresh process; and "did trunk movement invalidate the pin rehearsal?" — no (docs-only delta).
- **CARRIED, unchanged**: `app/node_modules` emptiness + trunk-binary invocation rule; the
  `.view-spec__cell-item` third direction; PIN-HARDEN spec `@media/@supports/@layer` vs `@container`;
  worktree-vs-trunk tsc divergence 12 vs 21; `tsx --watch` unusable on NFS; FAME-8 D2 x-tick clipping;
  O1 run-parameter label vs CHEBI:143577; markerSaturationFlags; advc-c2 O1–O4; advc2 O3/O4; intake pile
  O-1..O-5; W7b honesty flags; GCM-DEMO-AOAC-FAME; FL1; ANREV entryScript tracked-fixture note; the
  4165 px table-height trade-off; re-probe observation O-4; sub-1024 px `/analysis` viewport untested.

## Observation for Brad's next contact (not a card, not an item)

Five consecutive ticks have now closed with no dispatch, and the cause is structural rather than local:
**all three open lane-1 items are externally gated** (two on Brad, one on a trigger that only fires when
another campaign touches the FAME-8 emitter). Each of these ticks still costs a full orchestrator session.
Worth asking at the next contact whether the lane-1 tick cadence should be relaxed (or the tick made
no-op-cheap) while the pin card and the backfill hold are outstanding — the lane has no self-serve work
left to fill the gap, and this tick's own value came from *verification*, which has diminishing returns.

## Next-tick checks (priority)

1. `cl-reconcile.sh 1`; read this handoff. Expected: todo 2, blocked 1, in-progress 0, done 107; trunk
   `3ca46dfa` or later.
2. **Brad card answered?** `md5sum` ≠ `bc9cd6d9…` ⇒ read it. **A** → write
   `L1-PIN-HARDEN-1-fix3-AUTHORIZED` + fire the two fix3 launchers (kit verified ready this tick).
   **B** → merge `6ea3ec29 --no-ff` (expect 382/382 `src/analysis`, tsc 12 / 0-in-analysis, CSS blob
   `c6930c66`), document the hole, close. **C** → reset the branch to `1a443259`, close.
3. If trunk moves under `app/src/analysis` before the answer arrives, re-run the 280TH rehearsal.
4. **`FAME-1B-BACKFILL`**: on Brad's go, run the pre-staged spec (steps 1–6, idempotent, 9 records).
5. **`L1-PARAMS-EMITTER-RIDER`**: before any FAME-8 re-mint, re-check `git log -1 -- scripts/fame-gatefix/`;
   if it moved past `136a3d27`, the `params` fix is MANDATORY. `claimed_peak_refs` stays untouched unless
   the architect widens the rider.
6. Cycle hygiene unchanged: trunk binaries with the worktree as cwd, never `npx`/`npm ci`/symlinked
   `node_modules`; restart the lane stack after any schema/lint/ui/lifecycle YAML merge.

## Trunk after this tick

Docs-only: this handoff + a `# 285TH` note under the three open items. No product file, no schema, no
data-store write, no merge, no dispatch. Queue counts unchanged: todo 2, blocked 1, in-progress 0, done 107.

## Closing addendum (11:38) — one witness corrected, conclusion unchanged

I re-checked the fleet after committing and found **my own slot measurement was taken on the wrong lock file**.
`cl-coder-launch.py` takes its fleet locks at the shared base `~/.hermes/cl/`; the
`~/.hermes/cl/lanes/1/appliance2-coder-slot-*.lock` copies are stale and **always report FREE under `flock -n`**.
So "SLOT1-ACQUIRABLE" was not evidence of anything. Measured at the shared locks at 11:38:

| shared lock | pidfile | flock | holder |
|---|---|---|---|
| `appliance2-coder-slot-0.lock` | `L2-CHATHOST-CONSOLIDATE-1-1101760-…` | **HELD** | pid 1101760 live, 1h43m |
| `appliance2-coder-slot-1.lock` | `L2-CLARIFY-CARD-1-1314955-2026-11-03T16:22:29Z` | **HELD** | pid 1314955 live |

Timeline, from `coder-launches.jsonl`: `L2-CLARIFY-TARGET-1` (pid 1213096) exited rc=0 at **16:03:28Z**, and
lane 2 launched `L2-CLARIFY-CARD-1` into slot-1 at **16:22:29Z — ~90 s after my 11:20:56 reconcile**. Lane 2 is
using the freed capacity exactly as CORPUS PRIORITY intends, and never was a slot both free *and* legally
claimable by lane 1 this tick. **No dispatch, no merge, no product change, no data write; queue counts unchanged.**

Lesson recorded (also to memory): fleet-slot truth = `flock` on `~/.hermes/cl/appliance2-coder-slot-N.lock`
(the shared base), never the per-lane copies; pidfiles and lane-dir locks are witness-only.
