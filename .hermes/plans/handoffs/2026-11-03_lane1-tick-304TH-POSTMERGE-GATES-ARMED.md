# LANE 1 TICK 304TH HANDOFF — 2026-11-03 19:41 → 20:0x EST

One line: **no lane-1 dispatch again — both fleet slots went FREE at 19:44 for the first time in ~10 ticks,
but a live lane-2 orchestrator tick plus lane 2's dispatchable corpus work keep the slots in lane 2's first
refusal, and the one ready lane-1 item needs LONG mode (both slots). So the tick turned the item's post-merge
checks from prose into ARMED EXECUTABLES, each verified against the live stack: a pre-gate with a captured RED
baseline and a self-test, an ordered criterion-2 probe that cannot corrupt the gate fixture, and a browser
re-gate brief. No product code, no merge, no restart, no data write, no status change.**

## Reconciled first-hand (`cl-reconcile.sh 1` @ 19:41:04)

- Queue: **todo 3, in-progress 0, superseded 1, done 108**; `task-list.lock` FREE; neither lane paused;
  lane-1 `corpus-state.md` **absent** (corpus loop governs lane 2). Nothing interrupted ⇒ nothing to recover.
- Trunk `cl/integration-1` @ **84ebdf46**, no tracked modifications.
- Stack `:3092` 200 / `:5192` 200, served HEAD **84ebdf46** (== trunk, verified via pid → cwd → git HEAD).
  Nothing restarted. Exa tripwire **OK**.

## Capacity — measured, and the change since the 303RD

| check | 303RD | this tick |
|---|---|---|
| SHARED `appliance2-coder-slot-0.lock` | HELD (L2-CLARIFY-CARD-1) | **FREE** (flock probe 19:44) |
| SHARED `appliance2-coder-slot-1.lock` | HELD (CHATHOST-CONSOLIDATE-1) | **FREE** |
| live `hermes -p cl-coder` processes | 2 | **0** |
| lane-2 orchestrator tick | not recorded | **LIVE: pid 2271830, started 19:10:55** |
| lane 2 queue | 5 todo / 3 in-progress + corpus-state | 5 todo / 5 in-progress + active `corpus-state.md` |

**Why no claim:** CORPUS PRIORITY (Brad 2026-11-02T17:05) is a conditional on live state — lane 2 has
dispatchable work AND slots are free AND its own orchestrator tick is running to claim them. Independently,
`L1-RECORD-LOCK-GUARD-1` is pre-staged for **LONG mode (both slots)**; taking both would starve the corpus
outright. Deciding otherwise would have been a priority override, not a judgement call. Re-check next tick:
if lane 2's tick exits leaving a slot free *and* lane 2 has no live coder, lane 1 may still be refused by
the same rule — the gate is lane 2's work being served, not merely a free lock.

## What the tick produced (all verified, not asserted)

1. **`~/.hermes/cl/lanes/1/scripts/pregate-recordlock-1.py`** — the AM-9 pre-gate as code.
   Reports served revision (pid on :3092 → `/proc/<pid>/cwd` → git HEAD vs trunk), the API echo of
   `contentLockedStates` for **all seven** lifecycle ids, and the on-disk `states[].contentLocked` parse —
   so *YAML wrong* / *server stale* / *endpoint unwired* are three separable outcomes. A 404 is reported as
   an HTTP error, not silently as "field absent".
   - **RED baseline captured pre-merge** at 84ebdf46: `contentLockedStates` ABSENT on **7/7** ids,
     `--expect-red` rc=0 → `receipts/L1-RECORD-LOCK-GUARD-1/pregate-l1t1944/expect-red.txt`.
   - **Self-test** (`pregate-recordlock-1-selftest.py`) against a throwaway in-process mock and a **private
     copy** of the YAML tree: green path rc=0, superset echo → MISMATCH rc=1, `contentLocked` on a
     nonexistent state id → rc=1. `SELFTEST: PASS`. The trunk YAML was never edited (md5 re-checked == HEAD).
2. **`probe-recordlock-2.py`** — acceptance criterion 2, ordered so it cannot corrupt the fixture: leg A
   (no-edit PUT of the record's own payload) gates leg B (content-changing PUT); if A drifts, the script
   aborts before B. PUT shape confirmed from `client.ts:2609-2618` (`{payload: ...}`), read shape from the
   live response (`meta.contentSha`, `payload.state`). `--dry-run` against live :3092: state **effective**,
   contentSha **1cd98318…** (a fresh baseline — deliberately NOT l1t1845's 16db862a).
3. **`.hermes/plans/2026-11-03_l1-record-lock-browser-regate-brief.md`** — the browser re-gate, pre-staged:
   criteria 1-5 verbatim, corrected lifecycle ids, transition-swallow trap, ACL-404 trap, fresh-baseline rule,
   receipts layout, `VERDICT:` requirement.

## Assumptions

- **AS-L1T304-1** Turning post-merge checks into executable, self-tested scripts is the right use of a
  capacity-blocked tick: every later tick that runs them gets a machine verdict instead of a prose re-read,
  and the RED baseline proves the check is not vacuous. Debt: false.
- **AS-L1T304-2** Not claiming the two free slots was required by the corpus-priority binding as written
  (lane 2 dispatchable + slots free), and independently by the item's LONG-mode requirement. Debt: false.
- AS-L1T278-3 (FAME-1B-BACKFILL Brad hold) **debt: TRUE**, unchanged.

## Open obligations / structured blockers

- **READY, dispatch next tick (lane 1 owns): `L1-RECORD-LOCK-GUARD-1`** — LONG mode, still gated on lane 2
  being served; prompt `~/.hermes/cl/lanes/1/prompts/coder-L1-RECORD-LOCK-GUARD-1-l1t1924-STAGED.txt`
  (re-pin the runstamp in the report filenames). Command in the item block + the 303RD handoff.
- **Post-merge, in this exact order** (armed): pre-gate → criterion-2 probe `--live` → adversarial ACCEPT →
  own diff/tests/tsc → merge `--no-ff` → `cl-lane-stack.sh 1 restart` → re-run pre-gate (expect-green) →
  browser re-gate per the brief. Item stays `in-progress` until `VERDICT: accept` on the served revision.
- **Gated, unchanged:** `L1-PARAMS-EMITTER-RIDER` (trigger UNMET: `scripts/fame-gatefix/` still `136a3d27`
  @ 2026-11-02 17:09:38); `FAME-1B-BACKFILL` (Brad hold A-L1T229-3).
- Never treat an ACL 404 for `DOC-20660FF4E9734191` / `DOC-A56FD77A9B124087` as fixture loss.

## Next-tick checks (priority)

1. `cl-reconcile.sh 1`; expect todo 3 / in-progress 0 / done 108.
2. Lane 2 served AND a slot free AND lane 2 has no live coder → dispatch LONG mode with the staged prompt.
3. Re-check `git log -1 -- scripts/fame-gatefix/`; re-read the FAME-1B hold.
4. On coder DONE: the ordered chain above.

## Evidence index (observed, not asserted)

- pre-gate RED + self-test: `~/.hermes/cl/receipts/L1-RECORD-LOCK-GUARD-1/pregate-l1t1944/`
  (`expect-red.txt`, `selftest.txt`, `probe2-dryrun.txt`)
- scripts: `~/.hermes/cl/lanes/1/scripts/pregate-recordlock-1.py`,
  `pregate-recordlock-1-selftest.py`, `probe-recordlock-2.py`
- `contentLockedStates` absent on 7/7 at 84ebdf46 (curl `:3092/api/lifecycle/<id>/transitions`)
- lifecycle ids from `schema/core/lifecycles/*.yaml` `id:` fields; YAML untouched (md5 == `git show HEAD:`)
- PUT/read shapes: `app/src/shared/api/client.ts:2609-2618`; live GET `/api/records/DOC-DEMO-SOP`
