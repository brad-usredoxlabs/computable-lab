# LANE 1 TICK 313TH HANDOFF — 2026-11-03 22:41 → 23:0x EST

One line: **still no lawful dispatch (both SHARED appliance-2 slots held by live lane-2 coders, lane-2 queue
non-empty, active corpus-state ⇒ CORPUS PRIORITY), so the tick fixed the thing that would have wasted the next
dispatch: the prepared LEG-1 worktree was missing BOTH binding rulings the prompt orders the coder to read
first. It is now fast-forwarded to trunk HEAD with both rulings present and all baselines re-proved; the
criterion-2 probe was also fixed so it can no longer write without `--live`.**

## Reconciled first-hand (`cl-reconcile.sh 1` @ 22:41)

- Queue: **todo 2 / in-progress 0 / superseded 1 / done 109**; `task-list.lock` was FREE; neither lane paused
  (`lanes/1/PAUSE`, `lanes/2/PAUSE` absent); **no lane-1 `corpus-state.md`**; no live lane-1 worker (both live
  `hermes -p cl-coder` processes are lane 2's: 2583815 etime 1h47m, 2609674 etime 1h38m) ⇒ nothing to recover,
  no duplicate-writer risk.
- Trunk `cl/integration-1` @ **8708d595** (the 312TH handoff commit). Stack `:3092`/`:5192` both **200**,
  nothing restarted. Exa tripwire **OK** (key present, consistent across lane1/lane2/canonical).
- `dispatch-window-1.py` = **BLOCKED-CORPUS (exit 10)**: slot-0 `L2-CLARIFY-CARD-1` (2609668/2609674),
  slot-1 `CHATHOST-CONSOLIDATE-1` (2583809/2583815) both HELD by alive holders; lane 2 = 5 todo / 3
  in-progress / corpus-state ACTIVE (SPECS-QUEUED). Vision slot flock-free, but no lane-1 UI obligation is
  owed while L1-RECORD-LOCK-GUARD-1 is unfixed, so it was not taken.

## BLOCKER FOUND AND FIXED — the LEG-1 worktree could not have run

`wt/L1-RECORD-LOCK-GUARD-1-lane1-l1t2010` stood at `a7ab041e`. First-hand measurement: of the four files the
LEG-1 prompt's READ-FIRST list names, **two were ABSENT** —

    MISSING .hermes/plans/2026-11-03_l1-recordlock-dispatchshape-ruling.md   (READ FIRST #1, binding)
    MISSING .hermes/plans/2026-11-03_l1-recordlock-policy-copies-ruling.md  (READ FIRST #1b, extends scope)
    present 2026-11-03_l1-record-lock-guard-1-spec.md
    present 2026-11-03_l1-record-lock-policy-decision.md

A coder dispatched into that tree would have stopped on its own missing-file condition at the top of its
reading list (or, worse, missed the policy-copies scope extension that adds
`server/src/api/routes/protocol-steps.ts:216-227` to leg 1). The 312TH pin audit checked *pins* and did not
check that the worktree carried the readings.

FIX: `git -c core.fileMode=false merge --ff-only 8708d595` in the worktree (`a7ab041e` is an ancestor).
The FF moved **10 paths, ALL `.hermes/plans/`** — zero product files. After: worktree HEAD `8708d595` == trunk
HEAD, `git status --porcelain` = **0** tracked changes, `git diff --name-only 8708d595 -- app server schema
config scripts` = **0** paths, both rulings present.

## Baselines re-proved AFTER the fast-forward, in the worktree (not inherited)

| bar | command | result |
|---|---|---|
| 1 | `vitest run RecordHandlers.writeGates / RecordHandlers.lifecycle / RecordStore.test.ts` | **3 files / 62 tests PASSED** (22:44:55) |
| 2 | `vitest run archivedAssignment / SignatureIntegrity / RevisionStorage` | **3 files / 22 tests PASSED** (22:44:59) |
| 4 | `cd server && tsc --noEmit` | **rc 0** |

All 11 named test files of both legs exist at `8708d595`. S2 master gate re-run **from the worktree root**
(script md5 `181d5c5c683cb78fb4b9417c7dc844d9` = the audited one): 4 FOUR-STATE hits, exactly the expected
pre-migration shape — `RecordHandlers.ts:1139`, `RecordStoreImpl.ts:286`, `protocol-steps.ts:216` (leg 1) and
`protocolStepEditing.ts:45` (leg 2).

Served revision current: `pregate-recordlock-1.py --expect-red` → served HEAD `8708d595` **==** trunk HEAD
(pid 954410, cwd `.../cl-integration-1/server`), `contentLockedStates` ABSENT 7/7, disk `[]` 7/7 → RED SHAPE
AS EXPECTED. Confirmed independently: `GET /api/lifecycle/document-control/transitions` returns transitions +
terminalStates and **no** `contentLockedStates`.

## Prompt re-staged with measured facts

New dispatch-ready copy `lanes/1/prompts/coder-L1-RECORD-LOCK-GUARD-1-LEG1-l1t2255.txt` (original l1t2105 kept
immutable). Two edits, both factual:
- trunk sha `cfdc904f` → `8708d595`, plus an explicit statement that the worktree is already fast-forwarded
  (with the three verifiable assertions) and that a missing READ-FIRST file is a stop-and-report condition.
- the `a7ab041e..HEAD` sentence no longer keys on a path **count** ("9 paths" had already rotted to 10).
  It now says: the range is `.hermes/plans/` paths ONLY, count deliberately not stated, anything outside that
  prefix is a stop condition.

## Harness defect fixed — the criterion-2 probe was writing without being asked

While checking the LEG-2 acceptance tool I found `scripts/probe-recordlock-2.py:61`:

    dry = not live and "--dry-run" in sys.argv or "--dry-run" in sys.argv      # reduces to a bare-argv test

so a **bare invocation executed LEG A live**. Consequence, measured and disclosed: DOC-DEMO-SOP
(state=`effective`) no-edit PUT → **200**, `meta.contentSha` `1cd983185da3..` → `f3ef8fead2c54a6171d92c3f561879f9cb6d0f84`,
payload byte-identical. LEG B did **not** run (the script aborts when leg A is not green), so no
content-changing write occurred. This is lane TEST DATA (Brad 2026-10-04) and the 301ST gate had already
rewritten the same record's sha. Fixed: `live = "--live" in sys.argv; dry = not live`; bare invocation now
prints `DRY RUN` and the sha is byte-identical before **and** after (proved). `--live` is the only writing path.

**Upside:** this is the first *empirical* witness of criterion 2's RED state at the served revision — the
302ND correction had described the no-op-drift mechanism from code only. Recorded in the ledger as a NON-UI
observation, explicitly not a browser claim.

## Ledger

Rule-2 re-derivation at `8708d595` appended: ancestors YES ×5 (`2d3035da`, `11338a3a`, `af092157`, `1e639a65`,
`b7c29951`); `af092157..HEAD` and `11338a3a..HEAD` non-plans paths = **0**; row 1 on its own terms (zero
non-test importers of `cssRuleScan`; `AnalysisPage.css` blob `c6930c66…` at both HEAD and the gate commit;
`app/src/analysis` delta still the same 3 files). **All 12 quotable rows stand.** No new UI evidence claimed.
Receipts: `~/.hermes/cl/receipts/L1-RECORD-LOCK-GUARD-1/tick-313TH/` (NOTES.md, facts.json).

## Due blockers re-checked

- **L1-PARAMS-EMITTER-RIDER** — trigger still UNMET (`git log -1 -- scripts/fame-gatefix/` = `136a3d27` @
  2026-11-02 17:09:38). Nothing to do.
- **L1-RECORD-LOCK-GUARD-1** — **dispatch-ready, LEG 1 first**, now with a worktree that actually contains its
  instructions. Use prompt `...LEG1-l1t2255.txt`, `--mode parallel`.
- **Cross-lane SEQ-ANSWER-CONTRACT-1** — still `todo` in lane 2; lane 1's `l1t1645` re-run is not yet due.
- **FAME-1B-BACKFILL** — done (308TH), receipt obligation discharged (311TH).

## Next actions (ordered)

1. Re-run `dispatch-window-1.py` next tick; on `DISPATCH-ELIGIBLE` (exit 0) fire **LEG 1** immediately:
   `cl-coder-launch.py --lane 1 --item L1-RECORD-LOCK-GUARD-1 --worktree /mnt/vast/home/brad/git/wt/L1-RECORD-LOCK-GUARD-1-lane1-l1t2010
   --prompt .../prompts/coder-L1-RECORD-LOCK-GUARD-1-LEG1-l1t2255.txt --mode parallel` (re-stamp prompt/log/report
   paths with the new runstamp; keep the three worktree assertions in the prompt true).
2. On LEG 1 `DONE`: adversarial ACCEPT → my own diff + bars 1/2 + server `tsc` → merge to `cl/integration-1` →
   `cl-lane-stack.sh 1 restart` (background) → `pregate-recordlock-1.py` expect-GREEN → then LEG 2.
3. LEG 2 `DONE`: S2 scan VERBATIM (expect rc=0, both blocks) → `probe-recordlock-2.py --live` → browser re-gate
   on the exact served revision (`:5192`); item stays in-progress until `VERDICT: accept`.
4. When lane 2 lands SEQ-ANSWER-CONTRACT-1: re-run the `l1t1645` probe suite on `:3092`.

## Tick close

No coder dispatched, no product code, no merge, no data-schema/config change, no stack restart, no task status
change (todo 2 / done 109 unchanged). Fleet remains lane 2's first refusal.
