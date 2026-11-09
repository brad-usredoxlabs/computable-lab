# LANE 1 TICK 319TH HANDOFF — 2026-11-04 00:40 → 01:0x EST

One line: **no lawful dispatch again (`dispatch-window-1.py` = BLOCKED-CORPUS, exit 10 at open AND close), so the
tick closed the LEG-2 analogue of the fail-open the 318TH closed for LEG 1 — the new client accessor and the new
predicate module had NO bar exercising the real code (all seven suites mock the client) — and re-proved the
whole LEG-2 kit at 16597086.**

## Reconciled first-hand

- `cl-reconcile.sh 1` @ 00:40:23: queue **todo 2 / in-progress 0 / superseded 1 / done 109**; `task-list.lock`
  FREE; **no lane-1 PAUSE, no lane-2 PAUSE**; **no lane-1 `corpus-state.md`**; **no live lane-1 worker** ⇒ nothing
  to recover, no duplicate-writer risk. Stack `:3092` = 200 (health ok, 204 schemas, 155 lint rules),
  `:5192` = 200. Trunk `cl/integration-1` arrived at **16597086** (the 318TH's own docs commit) and stayed there.
- Shared slot-0 flock **FREE** with a DEAD lane-2 pidfile (`L2-CHATHOST-CONSOLIDATE-1-2965775`); shared slot-1
  **HELD** by live lane-2 `L2-CLARIFY-CARD-1` (launcher 3047532, alive). Lane-2 queue **todo=5 in-progress=3**,
  `corpus-state.md` **ACTIVE** (prompt-2 SPECS-QUEUED; prompts 3-8 LOCKED) ⇒ the free slot is lane 2's first
  refusal under CORPUS PRIORITY (Brad 2026-11-02T17:05). **Lane 1 dispatched nothing.**
- Due blocker **L1-PARAMS-EMITTER-RIDER**: trigger still UNMET — `git log -1 -- scripts/fame-gatefix/` =
  `136a3d27` @ 2026-11-02 17:09:38. Not opened (unchanged for the 27th consecutive tick).
- **Exa key tripwire RAN**: OK — apiKey present and consistent across lane1/lane2/canonical.
- LEG-1 worktree `wt/L1-RECORD-LOCK-GUARD-1-lane1-l1t2010` at 16597086 = trunk HEAD; tracked tree clean
  (only untracked `node_modules`, `server/node_modules`).

## FINDING — LEG 2 had no bar on the two NEW modules it introduces (fail-open, now closed)

Measured this tick at 16597086. LEG 2's five scope files include two pieces of genuinely NEW code:

1. `app/src/shared/api/client.ts` — the `getLifecycleContentLockedStates` accessor, mirrored from
   `getLifecycleTerminalStates` (:4668).
2. `app/src/shared/records/lifecycleLock.ts` (**new module**) — the single predicate home (AM-4).

Every one of the seven suites in the LEG-2 bar block mocks the client (`vi.fn().mockResolvedValue(...)`).
First-hand proof that the REAL accessor has never been exercised: `git grep -n getLifecycleTerminalStates
app/src --include='*.test.*'` returns ONLY mock sites — no test calls the real accessor. Therefore an accessor
that read `terminalStates` instead of `contentLockedStates`, hit the wrong URL, or threw instead of failing open
on 404 would have shipped **fully GREEN**, and a predicate module whose truth table was wrong would only be
caught indirectly (if at all) by page-level mocks.

APPLIED (brief only, no product code): **BAR 2c** added to
`prompts/coder-L1-RECORD-LOCK-GUARD-1-LEG2-STAGED.txt` — two required NEW unit-test files:
`client.lifecycleContentLocked.test.ts` (asserts the GET path is exactly `/lifecycle/<id>/transitions`; reads
`contentLockedStates` NOT `terminalStates`; absent field ⇒ `[]`; 404 ⇒ `[]` fail-open; non-404 rethrows) and
`lifecycleLock.test.ts` (predicate truth table for `isContentLocked` / `isRecordWriteLocked`, plus grep-proof
that no `'approved'`/`'effective'` literal lives in the module). No criterion, boundary or ruling changed; a
missing bar was added. Prompt md5 `55a4a1d5551860838072b394f792c43a` → `76c5f783958708aca19741c687dc9432`.
LEG-1 prompt UNCHANGED (`67c4f3b7dc9edaf6dd186dfa88ea5bc8`).

## LEG-2 kit re-proved at 16597086 (fresh, this tick)

- LEG-2 bar suites = **7 files / 59 tests PASSED** (the brief's 37 + 22 split reproduced exactly).
- `./node_modules/.bin/tsc --noEmit -p app` = **21 errors, 0 in touched files** (baseline preserved).
- S2 policy scan from the worktree root = **exactly the 4 expected pre-migration hits**: `protocolStepEditing.ts:45`
  (leg-2 app), `RecordHandlers.ts:1139`, `protocol-steps.ts:216`, `RecordStoreImpl.ts:286` (leg-1 server).
  Pair mode is masked pre-migration because four-state exits first — by design; the registry pair
  (`RecordRegistryPage.tsx:560-561`) is caught on the second pass after the four-state hits are migrated.

## LEG-2 preconditions verified first-hand (not inherited)

- `client.ts:4668 getLifecycleTerminalStates` mirror target exists with the documented 404→[] fail-open.
- `app/src/shared/records/` does NOT exist yet — the new module path is genuinely new, as briefed.
- `RecordRegistryPage.tsx:554-560` approved/effective pair present; `:568` "do not touch it" comment present.
- `protocolStepEditing.ts:45` AND `:102` four-state arrays both present (both in scope item 4).
- `~/.hermes/cl/lanes/1/scripts/s2-policy-scan.py` present (fail-closed since the 314TH).

## LEG-1 kit re-proved at 16597086 (fresh, this tick)

- bar 1 = **3 files / 62 tests PASSED**; bar 1b = **1 file / 22 tests PASSED**; bar 1c = **4 files / 53 tests
  PASSED**; bar 2 = **3 files / 22 tests PASSED**; server `tsc --noEmit` rc **0**; app tsc **21** errors.
- `pregate-recordlock-1.py --expect-red` = served HEAD **= trunk HEAD = 16597086**, **RED 7/7** (disk
  `contentLockedStates` [] and API `ABSENT` on all seven ids) — as expected pre-leg.
- Product diff `84a9def8..16597086` = **0 paths** (trunk advanced only by the 318TH handoff).

## Rule-2 ledger re-derivation at 16597086

Ancestors **YES ×7** (`2d3035da`, `11338a3a`, `af092157`, `1e639a65`, `b7c29951`, `8708d595`, `a7b4e809`);
`git diff --name-only d6572be6..HEAD -- . ':!.hermes/plans'` = **0**; `app/src/analysis/AnalysisPage.css` blob =
**c6930c66eabf3918ececb2df3a0f682b7e94c4da**; non-test `cssRuleScan` importers = **0**. All 12 quotable rows stand;
the `/record` lock + write-immutability row stays **UNVERIFIED-and-DEFECTIVE** until both legs land and the
browser gate passes on `:5192`.

## Not done, and why

No coder (BLOCKED-CORPUS, verified twice — 00:40 and 00:5x), no spec composition (both open items are already
specced and prompted; nothing approved-and-unspecced to draft), no browser gate (no lane-1 UI obligation exists;
the single local vision slot is not lane 1's under corpus priority), no product merge, no data write, no stack
restart, no task status change (todo 2 / done 109).

## Next actions (ordered)

1. Next tick: re-run `scripts/dispatch-window-1.py`. On `DISPATCH-ELIGIBLE` (exit 0) fire **LEG 1** with
   `cl-coder-launch.py --lane 1 --item L1-RECORD-LOCK-GUARD-1 --worktree
   /mnt/vast/home/brad/git/wt/L1-RECORD-LOCK-GUARD-1-lane1-l1t2010 --prompt
   .../prompts/coder-L1-RECORD-LOCK-GUARD-1-LEG1-l1t2255.txt --mode parallel`; the bar set to expect is
   **1, 1b, 1c, 2 + tsc 4/5**.
2. On LEG 1 `DONE`: adversarial ACCEPT → own diff + bars 1/1b/1c/2 + server `tsc` → merge →
   `cl-lane-stack.sh 1 restart` (background) → `pregate-recordlock-1.py` expect-GREEN → stamp the merge sha into
   the LEG-2 prompt's `<leg-1-merge-sha>` placeholder.
3. LEG 2: dispatch with the amended brief (BAR 2c now required); S2 scan from the worktree root must return rc 0
   with only the `DocumentControlBar.tsx:58-61` display hull; `probe-recordlock-2.py --live`, then browser
   re-gate on the exact served revision of `:5192`; the item stays in-progress until `VERDICT: accept`.
