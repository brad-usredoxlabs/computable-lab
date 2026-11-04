# LANE 1 TICK 327TH — 2026-11-04 09:20Z–09:5xZ (04:20–04:5x EST)

One line: **No dispatch was lawful (gate deferred on a measured cadence shortfall, not on slot supply), but a real
dispatch-machinery defect was found and fixed: the LEG-2 brief's fail-closed sentinel was ambiguous and would have
stopped a correctly-restamped coder — it now has exactly one dedicated `LEG1_MERGE_SHA:` stamp line, a new pin, and
an automated fail-closed restamper.**

## Reconciled first-hand

- `cl-reconcile.sh 1` @ 04:20:11: queue **todo 2 / in-progress 0 / superseded 1 / done 109**; `task-list.lock` FREE;
  **no PAUSE in either lane**; no lane-1 `corpus-state.md`; **no live lane-1 worker** ⇒ nothing to recover or adopt.
  Live fleet: one lane-2 coder (`hermes -p cl-coder` pid 3520021, L2-CLARIFY-CARD-1).
- Trunk `cl/integration-1` @ `7681111f` (= `12becda1` + the 326TH handoff doc commit);
  `git diff --name-only d96c4caf..7681111f -- . ':!.hermes/plans'` = **0 paths** ⇒ all 12 quotable claims-ledger
  rows stand unchanged (Rule 2 re-derived, not inherited).
- Stack `:3092` 200 / `:5192` 200; not restarted.

## LEG 1 — NOT-FIRED, measured twice (open and close of tick)

`scripts/verify-leg1-fired.sh` @ 04:20:53 and again at end of tick: `START_RECORDS=0`, armed unit
`cl-l1-armed-dispatch-0228.service` **ActiveState=active** (pid 3297306, up since 02:24:15, deadline 07:30 EST),
worktree `12becda1`, **0 commits above trunk**, **product diff none** ⇒ **NOT-FIRED**. The armed log's wording was not
used as evidence.

## Gate — ROTATION-DEFERRED, cadence-bound only (a change from the 326TH)

Probed directly (`scripts/dispatch-window-1.py --rotation --item-severity HIGH`, rc 14):

| check | result |
|---|---|
| 1 not paused / queue free | PASS |
| 2 item todo + undispatched + HIGH | PASS |
| 3 cadence | **FAIL** — `lane2_launches_since_filed=12` (needs ≥4, met) but `other_slot_continuous_hold=0h21m` (needs ≥2h) |
| 4 slot truth | PASS — `free_slots=[0]`, `held_slots=[1]` |
| 5 lane-2 has live coder | PASS — pair 3520021 |

**Correction to the 326TH's framing:** slot-0 is now **FREE** (its holder `CHATHOST-CONSOLIDATE-1` is DEAD) and
slot-1 is HELD by a live `L2-CLARIFY-CARD-1`. So the gate is *cadence*-bound this tick, not supply-bound. If lane 2
does not re-claim first, a 2 h hold on slot-1 matures at ~**05:59:51 EST**. **AS-L1T326-1** (sustained lane-2 backlog
starves the rotation gate) is therefore still plausible but **not demonstrated this tick** — the clock is simply young.
No threshold or first-refusal change was made; that remains an architect question.

## DEFECT FOUND + FIXED (text only; no criterion, boundary or ruling touched)

The LEG-2 coder brief's fail-closed sentinel was **unsatisfiable-ambiguous**. `<leg-1-merge-sha>` appeared **twice**
(both in prose) in a 13,501 B file pinned at md5 `1e473afb...`:

- one mention inside the instruction "the orchestrator stamps … into **the line below**. If the literal
  `<leg-1-merge-sha>` still appears there … STOP" — but **no such dedicated line existed**;
- one mention inside the command ``git diff --name-only <leg-1-merge-sha>..HEAD -- app``.

A coder obeying the brief literally **after a correct restamp** would still find the token in the git command and
STOP with `pre-gate-not-green: leg-1 merge sha not stamped`. The alternative reading — "replace all ×2" — would mangle
the prose guard and invert the sentinel's meaning. This would have bitten at exactly the moment LEG 1 merges, under
time pressure.

Fix, in `~/.hermes/cl/lanes/1/prompts/coder-L1-RECORD-LOCK-GUARD-1-LEG2-STAGED.txt`:

```
Trunk under test: `cl/integration-1` @ the HEAD your worktree is on. …
LEG1_MERGE_SHA: <leg-1-merge-sha>
At dispatch the orchestrator replaces the angle-bracket token on the `LEG1_MERGE_SHA:` line above …
```

The token now exists **exactly once** and sits on a dedicated machine-stampable line; the STOP test is mechanical.
New pin **`e2fe8f9b56ec2530cfc8a4e373612b2e` (13,655 B)**, superseding `1e473afb3c0665c3f485e5da6521b0b9` (13,501 B).
The two `1e473afb` occurrences still in `task-list.md` (:13731, :13782) are historical tick records and were left as
written; the 327TH block is the current pin.

**LEG 1 brief is UNCHANGED** — md5 `6ceddf7ddfaae09cf32fa97b77a380df` still matches on disk, so the armed unit's
GUARD3 is untouched.

## New artifact — `scripts/restamp-leg2-l1.py` (fail-closed restamper)

Guards, every one exercised this tick:

- exactly ONE token, and it must sit on the `LEG1_MERGE_SHA: ` line;
- prompt md5 must equal the pinned baseline `e2fe8f9b...` (env-overridable only for a deliberate move);
- `--sha` must be 40-char lowercase hex, a real commit, an **ancestor of trunk HEAD**, and
  `git diff --name-only <sha>..HEAD -- app` must be **EMPTY**;
- post-restamp the token count must be **0**; writes are atomic (`os.replace`); task-list re-pinning happens under
  `flock(task-list.lock)`; `--dry-run` is the safe default path.

SELFTEST — all runs mine, this tick:

| case | result |
|---|---|
| guards only (`--dry-run`, no sha) | rc 0, nothing written |
| valid sha `7681111f` `--dry-run` | rc 0 → new md5 `9e88730fec799a805d77643b19b06f8b` (13,678 B) |
| wrong baseline (`LEG2_EXPECT_MD5=deadbeef`) | rc 2 |
| non-commit sha | rc 2 |
| `--sha HEAD` (malformed) | rc 3 |
| end-to-end on a TEMP COPY | 0 sentinel occurrences, stamp line `LEG1_MERGE_SHA: 7681111f…`, second restamp refused rc 2 |

The real brief was **NOT** restamped (LEG 1 has not merged) and remains fail-closed at token count 1.

## Queue transaction

Appended this 327TH block to `task-list.md` under `flock(task-list.lock)`, written to a temp file and `os.replace`d, so
the armed unit could never observe a partial file. Verified after the write: `todo 2 / done 109 / superseded 1`, and the
unit's own **next poll re-parsed GUARD2 as `status=todo dispatched=none` PASS** — the rewrite was safe and observed,
not assumed.

## Due blockers

- **L1-PARAMS-EMITTER-RIDER** — RIDER-TRIGGERED, untouched. `git log -1 -- scripts/fame-gatefix/` still
  `136a3d27` @ 2026-11-02 17:09:38 ⇒ **trigger UNMET (33rd tick)**. It must never open a cycle of its own.
- **FAME-1B-BACKFILL** — Brad HOLD A-L1T229-3 standing; no Brad-authored answer in any file.
- **Brad card** `2026-11-04_l1-brad-card-L1-RECORD-LOCK-GUARD-1-DRAFT.md` — due 06:53 EST, **not this tick**.

## State left behind

No coder dispatched, no slot claimed, no product code, no merge, no data write, no stack restart, no task-status change
(todo 2 / done 109). `cl-l1-armed-dispatch-0228.service` remains **active** (deadline 07:30 EST).

## Next actions (ordered)

1. **First**, run `scripts/verify-leg1-fired.sh` — never the armed log's wording. If **FIRED**: reconcile the commits,
   run bars 1/1b/1c/1d/2 + `server tsc` rc 0 + `app tsc` 21 myself, require adversarial **ACCEPT**, merge `--no-ff`,
   `cl-lane-stack.sh 1 restart` (background), pregate expect-GREEN, then
   `python3 scripts/restamp-leg2-l1.py --sha <merge-sha> --apply-tasklist` and **confirm the printed new md5 is the one
   you record**.
2. If **NOT-FIRED**: keep doing read-only / docs work; do not hand-launch (the armed unit owns the item). If the gate's
   cadence clause matures (~05:59:51) the unit fires on its own.
3. If the unit is still active at 06:53 EST, **file the Brad card** at the 07:00 tick.
4. If the unit expires at 07:30 without firing, send **AS-L1T326-1** to the architect as a scoped question
   (threshold vs. first-refusal) — but attach this tick's correction first: the gate was cadence-bound, not
   supply-bound, at 04:2x.
5. Do not re-open FAME-1B-BACKFILL; do not open a cycle for the rider.

## Assumptions

- **AS-L1T327-1**: that a single-token sentinel on a dedicated line is the correct fail-closed shape for a
  machine-stamped brief. Basis: it makes the coder's STOP test mechanical and the restamper's precondition checkable.
  If the architect prefers a different stamp convention, this brief is the only artifact to change.
- **AS-L1T327-2**: the ~05:59:51 maturity estimate assumes lane 2 does not re-claim slot-1 first — the exact failure
  mode the 326TH observed three times. It is an estimate, not a prediction.

---

## SECOND FINDING (same tick) — the AM-5 pre-gate's "served HEAD" was a falsified provenance claim

`scripts/pregate-recordlock-1.py` computed `served HEAD` as: pid listening on :3092 -> `/proc/<pid>/cwd` ->
`git rev-parse HEAD` in that path. That is the **checkout's current HEAD**, not the tree the process booted from, so it
**moves under a running server on every commit**.

Demonstrated directly, this tick: I committed the 327TH handoff (docs-only) and the tool immediately reported
`served HEAD = 8ec5fdd8` for a process that has been running since **2026-11-03 08:26:05** and was never restarted.
Every handoff sentence of the form "served HEAD == trunk HEAD" therefore recorded a statement about the checkout, not
about the build — and the `stale` guard was vacuous in that direction.

Fix — measure the boot, and scope the comparison to what the backend actually loads:

- process start epoch from `/proc/<pid>/stat` field 22 + `/proc/stat` btime (`HZ` via `SC_CLK_TCK`);
- `boot-time rev` = `git rev-list -1 --before=<start>`, explicitly labelled **approximate**;
- **`PRODUCT_PATHS = [server, schema]` only** — `app/` is excluded because `:5192` is Vite-served from source with HMR,
  and `records/` is external data under `CL_DATA_DIR`; neither is a backend boot snapshot;
- `stale := product_head(boot) != product_head(trunk)`; if unmeasurable it reports **UNPROVEN** with a problem — never
  fresh. Output now says `checkout HEAD` (not `served HEAD`) and prints both product heads.

**A real trap was dodged while doing this.** My first cut compared `app+server+schema+records` and flagged STALE on this
host — because `b1dd259f` (PIN-HARDEN-1 fix3, 2026-11-03 14:03:29) touches **app/ only**
(`git diff --stat 9e455216..b1dd259f -- app server schema records` = 3 app files). A naive product comparison would cry
wolf on every frontend merge. Re-scoped, the answer is: boot product head == trunk product head ==
**`9e455216`** (the cellrender change, 07:57:56 — the build that is actually running), so **the backend is genuinely
current**. The 290TH's "no stack restart: no schema/lint/ui/lifecycle YAML changed" reasoning was correct for the
backend; that handoff's *instrument*, not its conclusion, was the defect.

SELFTEST (all runs mine, this tick):

| case | result |
|---|---|
| live `--expect-red` | rc 0, RED 7/7 ABSENT, boot_product == trunk_product, no stale flag |
| simulated boot 2026-11-03 06:00 EST | boot_head `fbb36e7c`, boot_product `957f7d01` != trunk `9e455216` ⇒ **STALE detected** |
| start-time unmeasurable | boot_product `None` ⇒ **UNPROVEN**, not fresh |

Operational rule for future ticks: after a `server/` or `schema/` merge a restart **is** required and this check now
proves it was done; after an `app/`-only merge it is not required, and the check correctly stays quiet.
