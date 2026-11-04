# LANE 1 TICK 322ND HANDOFF — 2026-11-04 01:40 → 02:2x EST

One line: **the lane's 7-hour structural blocker is now a BINDING RULING plus a mechanical, self-tested gate —
END-RULING: BOUNDED-ROTATION (trunk `348137c0`) — and this tick did not dispatch only because that gate's own
"other slot held ≥2 h" clause measures 1 h 16 m: earliest eligible instant 02:30:41 EST, 5 min past this tick's
budget, so the claim belongs to the next tick that re-checks from §4 step 1.**

## Reconciled first-hand

- `cl-reconcile.sh 1` @ 01:40:05: queue **todo 2 / in-progress 0 / superseded 1 / done 109**; `task-list.lock` FREE;
  **no lane-1 PAUSE, no lane-2 PAUSE**; **no lane-1 `corpus-state.md`**; **no live lane-1 worker** ⇒ nothing to
  recover, no duplicate-writer risk.
- Shared slot truth by `flock` on `~/.hermes/cl/appliance2-coder-slot-{0,1}.lock`: **slot-0 FREE** (pidfile
  `L2-CHATHOST-CONSOLIDATE-1-3123886…`, process DEAD — its run ended `2026-11-04T06:27:42Z`); **slot-1 HELD** by a
  LIVE lane-2 pair (launcher **3047532** + `hermes -p cl-coder` child **3047534**, L2-CLARIFY-CARD-1, parallel).
- Lane-2 queue: todo 5, in-progress 5; `lanes/2/corpus-state.md` prompt-2 = **SPECS-QUEUED** (active, non-WORKS),
  prompts 3-8 LOCKED. 9 lane-2 coder launches in the 6.8 h since this lane's HIGH item was filed, all on two items.
- Stack: `:3092` = 200, `:5192` = 200; backend pid **954410**, cwd `cl-integration-1/server`.

## Why strict corpus priority was correct at open — and why that was not the end of it

`scripts/dispatch-window-1.py` returned **BLOCKED-CORPUS (exit 10)**. That was the right answer under the standing
rule: lane 2 holds slot-1, so **slot-0 is the only slot lane 2's next launch can take** — a lane-1 claim on slot-0
would delay lane 2, unlike the mirrored configuration the l1t1920 one-shot grant was written for. The one-shot grant
was consumed on 2026-11-02 and that ruling reserved this question for "a new architect ruling".

So this tick requested that ruling instead of re-deriving the same dead end a 12th time.

## THE NEW INSTRUMENT — architect ruling `348137c0` (docs-only, trunk `cl/integration-1`)

`.hermes/plans/2026-11-04_l1-lane1-slot-antistarvation-ruling.md`, **END-RULING: BOUNDED-ROTATION** (standing class,
per-claim gated). Supersedes `FAME8-lane1-slot-sequencing-l1t1920-ruling.md` (AMENDED-A). It does **NOT** reverse
Brad's corpus priority (verbatim binding text re-read in the task-list header at line 16).

- Max **1** concurrent lane-1 coder; **PARALLEL only** (never `long` — long owns both slots); no chaining.
- §3 numeric gate: **≥4 lane-2 coder launches** since the item's `filed:` ts **AND** the **other slot continuously
  held by a live lane-2 coder ≥2 h** at the instant of claim.
- §4 six mechanical checks in order (pause/queue-lock; item todo+undispatched+HIGH; cadence; slot truth with a live
  launcher+child pair; lane 2 has ≥1 live pair; re-check slot truth immediately before launch). **Any false → defer.**
- VOID on: Brad contradiction; both slots free while lane 2 has a dispatchable item; the lane-2 coder dying before
  the claim; an engine-wedge/`request_queue_timeout` death; the item no longer todo/undispatched/HIGH.
- Escalation backstop: a lane-1 HIGH item undispatched **≥12 h** with the gate unmet ⇒ **BRAD CARD**, not silence.
- Scope guard: changes no acceptance criterion, boundary, token or product intent — scheduling only.

Brad card: **NO** (ruling's own judgement: reservation already made by l1t1920; a true priority reversal would be
his call and is out of scope).

## Encoded, not remembered — and one real bug caught in the encoding

`scripts/dispatch-window-1.py` now implements §4 (`--rotation`, `--item-severity`, new verdict
`ROTATION-DEFERRED` exit 14, gate detail in `--json` and in the human output). Without this the prober's old
strict-B answer would have returned exit 10 forever and silently defeated the ruling.

- `--selftest` extended and **PASSES**: rotation decision table (grant ⇒ eligible; failed gate ⇒ defer; rotation
  cannot conjure a slot; rotation never outranks a pause) and `hold_start` continuity (≤60 s back-to-back handoff
  merges; a real gap breaks the window; idle reports `None`). The lock-file trap assertion still prints 4/4 per-lane
  copies FREE while a shared lock is HELD.
- **Bug found by running it, not by reading it:** `coder-launches.jsonl` stores `lane` as the **string** `"2"`, so an
  int comparison counted **zero** lane-2 launches and zero hold time. First live run printed `0 launches / 0h00m`;
  after the fix, `9 launches / 1h16m`. Had I trusted the first output, the gate would have looked *further* away than
  it is; had I "fixed" it the other way, it would have looked already satisfied. Fail-closed shape kept: severity
  UNKNOWN fails the gate.

## §4 gate measured at 01:5x (this is the dispatch decision)

| # | check | result |
|---|---|---|
| 1 | not paused; queue lock free | **PASS** (`False/False`, lock free) |
| 2 | item todo + `dispatched: none` + HIGH | **PASS** (`filed 2026-11-03T18:53`) |
| 3 | ≥4 lane-2 launches since filed **AND** other slot held ≥2 h | **FAIL** — 9 launches (≥4 ✓) but hold **1 h 16 m** < 2 h |
| 4 | exactly one free slot; other held by live lane-2 pair | **PASS** (free `[0]`, held `[1]`, live pair 3047534) |
| 5 | lane 2 has ≥1 live coder pair | **PASS** (1) |

Hold arithmetic: slot-1 was **IDLE 04:08:51Z → 05:30:41Z (1 h 21 m 50 s)** between `CHATHOST-CONSOLIDATE-1`'s exit
and `L2-CLARIFY-CARD-1`'s start; the current holder began 05:30:41Z. **Earliest eligible instant 07:30:41Z =
02:30:41 EST**, conditional on that holder staying live and slot-0 still being free then. This tick's 45-min budget
ends 02:25 EST.

**RECORDED CORRECTION (rule unaffected — it is conservative):** the ruling's §3 rationale asserts the cadence gate
"is already true at the first eligible tick". Measured, the hold clause is not yet met; it becomes true ~45 min after
this tick opened. The rule is sound as written; only the rationale's timing claim was optimistic.

## Readiness re-proved at the CURRENT trunk (not inherited from the 321ST)

- Worktree `wt/L1-RECORD-LOCK-GUARD-1-lane1-l1t2010`: fast-forwarded twice (docs-only) → HEAD **`348137c0` = trunk
  HEAD**, **0 behind**, tracked tree **CLEAN** (untracked `node_modules` only), product diff vs trunk **0**.
- `pregate-recordlock-1.py --expect-red` live on `:3092`: served HEAD = trunk HEAD (same checkout),
  `contentLockedStates` **ABSENT 7/7**, `expect-red: AS EXPECTED`, **rc 0**.
- **BAR 1d re-run by me** in that worktree at HEAD `348137c0` (not inherited): `vitest run src/store src/scripts
  src/integration/W25CandidateImmutability.test.ts src/api/handlers/RecordHandlers.seedPromotion.test.ts` ⇒
  **9 files / 99 tests PASSED, 6.58 s** — same test count as the 321ST's run at the same product tree.
- All four READ FIRST files resolve at `348137c0` (dispatchshape ruling, policy-copies ruling, spec, policy
  decision); the spec carries AM-1..AM-11, the LEG-1 brief cites `AM-1..AM-11` twice and **no `AM-14`** ⇒ the
  321ST's citation repair holds.
- Briefs unchanged and pinned: LEG-1 `6ceddf7ddfaae09cf32fa97b77a380df` (23,856 B); LEG-2
  `1e473afb3c0665c3f485e5da6521b0b9` with `<leg-1-merge-sha>` still a literal placeholder ⇒ fail-closed.

## Due blockers — both re-measured, both still externally gated

- **L1-PARAMS-EMITTER-RIDER**: trigger UNMET for the **30th** consecutive tick — `git log -1 -- scripts/fame-gatefix/`
  = `136a3d27` @ 2026-11-02 17:09:38; emitter md5 `0e00b33a89c432f537f666398982df36`; `:709` still `"params": params`
  raw dict under the `:702` declared `string`/"canonical JSON" column. Not opened (must never justify a cycle alone).
- **FAME-1B-BACKFILL**: Brad HOLD A-L1T229-3 standing; no new Brad-authored activity. Not opened.

## Rule-2 ledger

`git diff --name-only 9ab8bb07..fc15772c -- . ':!.hermes/plans'` = **0 paths** and `cssRuleScan.ts` has **zero
non-test importers** ⇒ all 12 quotable rows transfer unchanged. The `/record` lock + write-immutability row stays
**UNVERIFIED-and-DEFECTIVE** until both legs land and the browser gate passes on `:5192`.

## Not done, and why

No coder dispatch (§4 check 3 false at 01:5x — the ruling's own instruction is to defer, and I did not bend the
gate to fill the tick). No adversarial review (no coder delta). No paperwork run (no evidence-trail defect open).
No browser gate (no lane-1 UI obligation; the /record row cannot be graded before the fix). No product merge, no
data write, no stack restart, no task status change (todo 2 / done 109). No `no-work.log` entry — the tick produced
a binding instrument, a tested gate implementation and a re-proved kit.

## Assumptions recorded

- **AS-L1T322-1**: passing `--item-severity HIGH` is an explicit assertion by me, not a parse; it is justified by
  ruling §4 step 2 naming L1-RECORD-LOCK-GUARD-1 as the HIGH item, and the flag exists so the value is visible in
  the probe output rather than buried in code. The gate fails closed without it.
- **AS-L1T322-2**: "continuously held ≥2 h" is computed from launcher start/exit records with a 60 s handoff
  tolerance; a real gap (the 1 h 21 m one above) breaks the window. If the architect intended *consecutive holders
  without any gap at all*, the tolerance only ever makes the gate slightly more permissive at a handoff second and
  cannot manufacture a 2 h window out of the measured data.
- **AS-L1T322-3**: the worktree fast-forward is docs-only (product diff 0 before and after), so it cannot invalidate
  the 321ST's BAR 1d result (9 files / 99 tests at the same product tree).

## Next actions (ordered)

1. Next tick: `python3 scripts/dispatch-window-1.py --rotation --item-severity HIGH`. If it returns
   `DISPATCH-ELIGIBLE-ROTATION`, re-check slot truth immediately before launching and fire **LEG 1**:
   `cl-coder-launch.py --lane 1 --item L1-RECORD-LOCK-GUARD-1 --worktree
   /mnt/vast/home/brad/git/wt/L1-RECORD-LOCK-GUARD-1-lane1-l1t2010 --prompt
   /home/brad/.hermes/cl/lanes/1/prompts/coder-L1-RECORD-LOCK-GUARD-1-LEG1-l1t2255.txt --log <unique> --mode parallel`
   (pin md5 `6ceddf7d…`; wrap in `systemd-run --user --collect` so it survives tick exit). Bars: 1, 1b, 1c, 1d, 2 +
   server `tsc` rc 0 + app `tsc` 21.
2. On LEG 1 `DONE`: adversarial ACCEPT → my own diff + all five bars + server `tsc` → merge →
   `cl-lane-stack.sh 1 restart` (background) → pregate expect-GREEN → stamp the merge sha into LEG-2's
   `<leg-1-merge-sha>` (2 placeholders) and re-pin its md5. LEG 2 is a fresh §4 claim, not a chained one.
3. Watch the ruling's backstop: if the gate stays unmet and the item passes **12 h undispatched** (2026-11-05
   06:53 EST), file the BRAD CARD instead of waiting silently.
4. Do not re-litigate slot sequencing. The rule is mechanical now; spend ticks on the gate and the item.
