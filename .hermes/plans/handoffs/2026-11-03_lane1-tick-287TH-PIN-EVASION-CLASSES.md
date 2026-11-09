# LANE 1 TICK 287TH HANDOFF — 2026-11-03 12:00 → 12:20 EST

One line: **7th consecutive tick with no dispatch — one concrete reason, re-checked not inherited: no
dispatchable lane-1 item (all three externally gated) AND no claimable fleet slot (both shared locks held
by LIVE lane-2 coders). The tick's work is the one measurement Brad's pin card still lacked: measured at
the branch tip, the pin catches every realistic override authoring form and misses exactly three
contrived ones.** No product file, no schema, no data write, no merge, no dispatch.

## Reconciled first-hand (`cl-reconcile.sh 1` @ 12:00:53)

todo **2**, in-progress **none**, blocked **1**, superseded **1**, done **107**. Queue lock **FREE**.
Neither lane paused. `corpus-state.md` absent in lane 1. Exa tripwire **OK**. Stack `:3092`
`/api/health` **200** (204 schemas / 155 lintRules / ai available) and `:5192` `/` **200**; backend served
from the trunk checkout (pid 953556 / 3705105 vite on `:5192`, cwd `cl-integration-1`).

Trunk at open **`b0202129`**; `3a970e3a..b0202129` = exactly 1 file, 144 insertions, the 286TH handoff
(`.md` only) ⇒ no prior rehearsal is invalidated.

## Fleet (measured on the SHARED base locks, never the stale per-lane copies)

| lock `~/.hermes/cl/` | flock | holder |
|---|---|---|
| `appliance2-coder-slot-0.lock` | **HELD** | pidfile `L2-CHATHOST-CONSOLIDATE-1-1101760-2026-11-03T14:40:25Z`, holder alive, etime 2h20m |
| `appliance2-coder-slot-1.lock` | **HELD** | pidfile `L2-CLARIFY-CARD-1-1314955-…`, live proc `hermes -p cl-coder` pid 1314957, etime ~39 min |

No lane-1 worker is orphaned or interrupted: the only coder-family processes on the box are those two
lane-2 runs; the only lane-1 process is this tick. `thunderbeast-bg-slot-0` pidfile is DEAD/`FREE`, but
`cl-worker` is overflow-only and is not used while appliance-2 is merely busy by another lane.

## The three gates, each re-checked this tick (not inherited)

- **L1-PIN-HARDEN-1 (blocked / Brad)** — card md5 **`bc9cd6d9…` UNCHANGED**; authorization marker
  `L1-PIN-HARDEN-1-fix3-AUTHORIZED` **ABSENT**; branch `6ea3ec29`, worktree **CLEAN (0 porcelain lines)**.
  The option-B merge rehearsal and the option-A kit were both re-measured, not inherited — see below.
- **FAME-1B-BACKFILL (todo / Brad hold A-L1T229-3)** — hold stands; not executed, not re-asked.
- **L1-PARAMS-EMITTER-RIDER (todo / rider-triggered)** — `git log -1 -- scripts/fame-gatefix/` is still
  **`136a3d27` @ 2026-11-02 17:09:38** ⇒ no open FAME-8 re-mint ⇒ trigger **UNMET**.

### Option B re-measured at today's tip

`git merge-tree --write-tree b0202129 6ea3ec29` → **RC=0, no conflict list, tree `22f7d63d`**.
`git diff 88672a38 22f7d63d -- . ':(exclude)*.md'` = **EMPTY** ⇒ product tree is identical to the green
280TH rehearsal tree, so 52/52 focused, 382/382 `src/analysis`, tsc 12 lines / 0 in `src/analysis` and
`AnalysisPage.css` blob `c6930c66` all transfer verbatim. `ViewRenderer.celljson.test.tsx`
(L1-CELLRENDER-1's accepted surface) is present and untouched in the merged tree. Option B remains an
automatic, conflict-free merge at the current trunk.

### CORRECTION to the 286TH's next-tick step 2 (option A)

The 286TH said "A → fire the two fix3 launchers". **Those launchers are legacy and must not be run under
the current coder policy**: `launchers/launch-L1-PIN-HARDEN-1-fix3-l1t0700.sh` hand-rolls the slot flock
and execs `hermes -p cl-coder` directly (line 162), which the 2026-11-03 policy forbids. Option A is:
1. write `~/.hermes/cl/lanes/1/L1-PIN-HARDEN-1-fix3-AUTHORIZED` containing `A`;
2. dispatch via **`python3 /home/brad/.hermes/cl/scripts/cl-coder-launch.py --lane 1 --item
   L1-PIN-HARDEN-1 --worktree /mnt/vast/home/brad/git/wt/l1-pin-harden-1-lane1 --prompt
   ~/.hermes/cl/lanes/1/prompts/coder-L1-PIN-HARDEN-1-fix3-l1t0700.txt --log <unique>  --mode parallel`**
   (prompt present, 8895 B, md5 `1e8ed2965002395ce25a4143a0167c94` — unchanged from the 286TH), **in the
   background**;
3. after it reports, one targeted re-probe dispatch (same launcher, reprobe prompt) — never the legacy
   reprobe script;
4. then adversarial review + the gates, as usual.
The legacy scripts' self-gating still works (`bash -n` clean, real `NOT-AUTHORIZED 06:45:39` refusals in
their logs), so they cannot fire silently — but they are no longer the dispatch path.

## The tick's work: which override shapes does the pin actually miss? (read-only)

Full receipt: `~/.hermes/cl/receipts/L1-PIN-HARDEN-1/tick-287TH/` (`README.md`, `evasion-classes.json`
sha256 `65e42fbe…`, `mechanism.txt`, `probe.mts`). Method: the probe imports the BRANCH's own
`cssRuleScan.ts` and re-implements `sourceViolations()` **verbatim** from
`ViewRenderer.cellrender.test.tsx:83-133` at `6ea3ec29`, then appends each candidate rule to a baseline
that already satisfies the three positive floor claims. 19 shapes measured:

- **CAUGHT (all realistic authorings)**: plain re-declarations (`.view-spec__table td`,
  `table.view-spec__table td`, `tr > td`, `:is(td)`); `@media`-scoped (single and list);
  `@container`, `@supports`, `@layer`-scoped; `& td`, `& > td`; nested bare `td` alone; nested `th, td`.
- **MISSED (3)**: (a) the measured BLOCKER-1 form `.view-spec__table { .wrap, td { … } }`; (b) its
  generalisation `.view-spec__table { .x, th, td { … } }` — both because `resolveNestedSelectors()`
  prefixes the parent onto the WHOLE head string instead of per head part (cssRuleScan.ts:177-179 and the
  ambiguous-`&` arm :170-176), so tail parts emit bare; (c) a bare global `td { overflow-wrap: anywhere }`
  inside an at-rule — a *scope* choice (no `.view-spec__table` token in the part), not the composition bug.
- Live artefact: `sourceViolations(AnalysisPage.css @ 6ea3ec29)` = **[]**; the only `anywhere` in the file
  is on the legal `.view-spec__cell-item` and three out-of-scope `.compare-surface__*` rules. Blob
  `c6930c66` on BOTH branch and trunk ⇒ shipping the branch changes none of the shipped CSS.

**Meaning for the card**: option B's documented hole is narrow and needs an unusual nesting form that the
shipped CSS does not contain; option A's fix direction is one sentence (split the head's selector list
before composing, and rule explicitly on bare global `th|td` inside at-rules) and the existing fix-3
prompt already names the first half. The card itself was **not touched** — its md5 is the "answered?"
sentinel.

## Assumptions

- **AS-L1T287-1** `3a970e3a..b0202129` is docs-only (measured: 1 file, 144 insertions, no non-docs path).
  **debt: false**.
- **AS-L1T287-2** Re-implementing `sourceViolations()` from the test file is faithful because the probe
  copies its exact predicate arms (verified by reading :83-133) and the live-CSS run returns `[]`, matching
  the pin's own green. **debt: false** for the predicate; the *test-file coupling* means a future edit to
  the pin must re-derive the probe.
- **AS-L1T287-3** The pin's family scope deliberately excludes bare `th|td` parts (no table anchor in the
  selector). Recorded as MISS-2; whether that is a defect is a product call for Brad/architect, not mine.
  **debt: true (open question, attached to the card, not re-asked)**.
- **AS-L1T287-4** No lane-1 worker is orphaned; fleet measured on the shared base locks only. **debt: false**.
- AS-L1T286-1..4, AS-L1T285-1..4, AS-L1T284-1..3 and earlier CARRY FORWARD unchanged.
  **AS-L1T278-3** (FAME-1B-BACKFILL Brad hold) remains **debt: TRUE**.

## Evidence debt after this tick

- **OPEN (frozen to Brad)**: pin-scanner nesting evasion → `L1-PIN-HARDEN-1` (card md5 `bc9cd6d9…`).
  A = one dispatch under the NEW launcher (kit + prompt re-verified this tick); B = automatic merge, tree
  `22f7d63d`, green bar transfers; C = costless reset to `1a443259`. Only Brad's letter is missing.
- **OPEN (rider, trigger-gated)**: `assignment-contested-entry.py:709` dict behind a declared `string` →
  `L1-PARAMS-EMITTER-RIDER`, mandatory at that script's next re-mint.
- **OPEN (evidence debt, NOT an item)**: `claimed_peak_refs` declared `string[]` / emitted `list[int]`.
- **OPEN (Brad hold)**: `FAME-1B-BACKFILL`.
- **CLOSED THIS TICK**: "does the surviving pin hole cover realistic override forms?" — no: 16 of 19
  measured shapes are caught; the 3 misses are the mixed nested list (composition bug) and a bare global
  at-rule `td` (scope choice).
- **CARRIED, unchanged**: `app/node_modules` emptiness + trunk-binary invocation rule (Node v26.8.1 runs
  the `.ts` probe natively — no tsx needed); the `.view-spec__cell-item` third direction; PIN-HARDEN spec
  `@media/@supports/@layer` vs `@container`; worktree-vs-trunk tsc divergence 12 vs 21; `tsx --watch`
  unusable on NFS; FAME-8 D2 x-tick clipping; O1 run-parameter label vs CHEBI:143577;
  markerSaturationFlags; advc-c2 O1–O4; advc2 O3/O4; intake pile O-1..O-5; W7b honesty flags;
  GCM-DEMO-AOAC-FAME; FL1; ANREV entryScript tracked-fixture note; the 4165 px table-height trade-off;
  re-probe observation O-4; sub-1024 px `/analysis` viewport untested.

## Observation for Brad's next contact (not a card, not a re-ask)

Seven consecutive ticks have closed without a dispatch. The engineering queue is empty of unblocked
work; the lane is decision-starved, not blocked by engineering. One letter on the pin card (A/B/C) plus a
go/no-go on `FAME-1B-BACKFILL` clears the whole queue; the alternative is to relax the lane-1 tick cadence
while those two gates stand. This tick deliberately bought the last measurement that could change the
answer to the card — it did not buy another re-derivation.

## Next-tick checks (priority)

1. `cl-reconcile.sh 1`; read this handoff. Expected: todo 2, blocked 1, in-progress 0, done 107.
2. **Brad card answered?** `md5sum` ≠ `bc9cd6d9…` ⇒ read it. **A** → follow the CORRECTION above (marker
   `A`, then `cl-coder-launch.py`, background; never the legacy launchers). **B** → merge `6ea3ec29`
   `--no-ff` (merge-tree RC=0, tree `22f7d63d`); re-run 382/382 `src/analysis` + tsc 12 / 0-in-analysis;
   confirm CSS blob `c6930c66` and `ViewRenderer.celljson.test.tsx` intact; document the hole with the
   three missed shapes from the 287TH receipt; close. **C** → reset branch to `1a443259`, close.
3. If trunk moves under `app/src/analysis` before the answer, re-run `git merge-tree --write-tree <trunk>
   6ea3ec29` and, if the product tree differs from `88672a38`, re-run the full 280TH rehearsal.
4. `FAME-1B-BACKFILL`: on Brad's go, run the pre-staged spec (steps 1–6, idempotent, 9 records).
5. `L1-PARAMS-EMITTER-RIDER`: before any FAME-8 re-mint, re-check `git log -1 -- scripts/fame-gatefix/`;
   if it moved past `136a3d27`, the `params` fix is MANDATORY.
6. Cycle hygiene: trunk binaries with the worktree as cwd; never `npx`/`npm ci`/symlinked `node_modules`;
   restart the lane stack after any schema/lint/ui/lifecycle YAML merge. **Coder dispatches only through
   `cl-coder-launch.py`** — the pre-270th launcher scripts in `lanes/1/launchers/` are historical.

## Trunk after this tick

Docs-only: this handoff + a `# 287TH` note under the three open items. No product file, no schema, no
store write, no merge, no dispatch. Counts unchanged: todo 2, blocked 1, in-progress 0, done 107.
