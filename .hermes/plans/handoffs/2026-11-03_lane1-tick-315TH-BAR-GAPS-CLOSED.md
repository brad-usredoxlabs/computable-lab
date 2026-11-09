# LANE 1 TICK 315TH HANDOFF — 2026-11-03 23:20 → 23:5x EST

One line: **no lawful dispatch again (`dispatch-window-1.py` = BLOCKED-CORPUS, exit 10), so the tick removed a
fail-OPEN hole that spanned BOTH legs of the LEG-1/LEG-2 kit: the two source files the policy-copies ruling added
to scope have their own test suites, and neither suite was in either brief's bar — one of them asserts the exact
throw-gate leg 2 rewrites, the other pins the route gate leg 1 rewrites. Both are now bars, with measured
baselines.**

## Reconciled first-hand (`cl-reconcile.sh 1` @ 23:20:06, `scripts/dispatch-window-1.py` @ 23:22)

- Queue: **todo 2 / in-progress 0 / superseded 1 / done 109**; `task-list.lock` FREE; neither lane paused; **no
  lane-1 `corpus-state.md`**; no lane-1 worker live ⇒ nothing to recover, no duplicate-writer risk.
- Trunk `cl/integration-1` @ **d6572be6** (= a7b4e809 + 2 docs commits, both `.hermes/plans/`). Stack `:3092` =
  **200**, `:5192` = **200**. Exa tripwire **OK** (lane1/lane2/canonical consistent).
- `dispatch-window-1.py` → **BLOCKED-CORPUS (exit 10)**: slot-0 **HELD** by live lane-2 `L2-CLARIFY-CARD-1`
  (launcher 2865802 / child 2865804, claimed 04:04:33Z, etime 16m at check); slot-1 FREE; lane-2 queue
  **todo=5 in-progress=3, corpus-state ACTIVE (prompt-2 SPECS-QUEUED)** ⇒ the free slot is lane 2's first
  refusal (CORPUS PRIORITY, Brad 2026-11-02T17:05). Lane 2's own orchestrator tick (pid 2836993) was live.
- Due blocker **L1-PARAMS-EMITTER-RIDER**: trigger still UNMET — `git log -1 -- scripts/fame-gatefix/` =
  `136a3d27` @ 2026-11-02 17:09:38, unchanged. Nothing to do.

## DEFECT found (measured, both legs) — the amended scope files had NO bar suite

The policy-copies ruling (`2026-11-03_l1-recordlock-policy-copies-ruling.md`, `RULING: extend-scope`) added two
files to the two legs. Both files carry their own test suite; neither brief ran it:

| leg | amended file | its own suite | in the brief's bar? | baseline I measured |
|---|---|---|---|---|
| 1 | `server/src/api/routes/protocol-steps.ts:216-227` | `server/src/api/routes/protocol-steps.test.ts` | **NO** (`grep -c` = 0) | **1 file / 22 tests PASSED** @ 23:24 |
| 2 | `app/src/event-editor/right-pane/protocol/protocolStepEditing.ts:45/:102` | `protocolStepEditing.test.ts` + `applyDraftProtocolEdit.test.ts` | **NO** (`grep -c` = 0) | **2 files / 22 tests PASSED** @ 23:23 |

Why that matters, first-hand: `protocol-steps.test.ts:315-345` holds the ONLY pins on the route gate leg 1
migrates (`PATCH`/`POST step on a locked protocol → 409 CONTROLLED_RECORD_LOCKED, persists nothing`), and
`protocolStepEditing.test.ts:59-61` / `:179-181` are the ONLY tests asserting the two throw-gates leg 2 rewrites
(`insertProtocolStep`/`deleteProtocolStep`/`addLabwareRole`/`deleteInstrumentRole` throw `'locked'`). A coder
could migrate either file to a wrong predicate, keep all five/six listed bar files green, and hand back a
green-looking leg. The S2 shape scan does NOT close this: it proves the state literals are GONE, not that the
declared set is consulted correctly.

## DEFECT 2 found — the "locked protocol" fixtures use a lifecycle id that does not exist

Measured at d6572be6: `RecordHandlers.writeGates.test.ts:250` and `protocol-steps.test.ts:312` build their
locked fixture with `lifecycleId: 'protocol-control'`, and **`grep -rn "protocol-control" schema/` = 0 hits** —
the id exists only in those two test files. Today both gates are hardcoded state lists
(`RecordHandlers.ts:1138`, `RecordStoreImpl.ts:286`, `protocol-steps.ts:216-219`), so the fixtures lock. After
migration the resolver answers `undefined` for an undeclared lifecycle and the gate fail-opens **by design**
(AM-14), so both pins would go RED for the WRONG reason — which reads exactly like "the migration broke the
lock" and invites the two worst repairs (restore a literal ⇒ AM-7 bait-15 automatic reject; or declare a new
lifecycle YAML). Note this also means the policy-copies ruling's consistency note ("every existing 409 pin
stays green without amendment", which cites `archivedAssignment.test.ts:453-457`) is **incomplete**: it does not
cover these two `protocol-control` fixtures. Recorded here as an erratum for the architect at next contact; the
repair itself is decidable from repo evidence and is stated in the brief.

## FIXES APPLIED (staged prompts only — no product code, no dispatch)

1. `prompts/coder-L1-RECORD-LOCK-GUARD-1-LEG1-l1t2255.txt` (md5 `e105cdf7597e8a3d9c25c44cd0bd282b`):
   **BAR 1b** = `vitest run src/api/routes/protocol-steps.test.ts` (1 file / 22 tests, measured 23:24), plus the
   **FIXTURE TRAP** block naming `protocol-control` as undeclared and authorizing exactly one repair — change
   that fixture's `lifecycleId` to the declared `document-controlled-signing` (state `approved` stays),
   assertions byte-identical; no new lifecycle YAML, no product special-case, no restored literal; STOP
   `requires-rescope` if a declared locked lifecycle cannot produce its 409.
2. `prompts/coder-L1-RECORD-LOCK-GUARD-1-LEG2-STAGED.txt` (md5 `55a4a1d5551860838072b394f792c43a`):
   **BAR 2b** adds `protocolStepEditing.test.ts` + `applyDraftProtocolEdit.test.ts` (2 files / 22 tests,
   measured 23:23; the first five bar files re-measured at 37 tests PASSED the same minute) and states the pins'
   role; a **sync-seam constraint** (the two predicates stay synchronous; the declared set comes through a
   cache primed by the async accessor; do not convert call sites to `async`, do not add a literal fallback);
   and a fail-closed guard for the `<leg-1-merge-sha>` placeholder (if it is still literal at dispatch, leg 1
   did not merge ⇒ `BLOCKED pre-gate-not-green`).
   No acceptance criterion was weakened; both edits only ADD coverage and close fail-open paths.

## LEG-2 readiness re-proved at d6572be6 (not inherited)

In `wt/L1-RECORD-LOCK-GUARD-1-lane1-l1t2010` (@ a7b4e809; product diff `a7b4e809..HEAD` = **0**): five LEG-2 bar
files **5 files / 37 tests PASSED**; app `tsc --noEmit -p app` = **21** error lines (= baseline, none in any
touch-list file); the two `protocol/` suites **22 PASSED**; S2 scan from the worktree root = **rc 1** with
exactly the 4 expected pre-leg hits (`protocolStepEditing.ts:45`, `RecordHandlers.ts:1139`,
`protocol-steps.ts:216`, `RecordStoreImpl.ts:286`) — i.e. the hardened script still fails closed in the
direction it must. Script md5 unchanged: `60d9dd4cb4e67a01c5dec3819b048a63`.

## Rule-2 ledger re-derivation at d6572be6

Ancestors YES ×7 (`2d3035da`, `11338a3a`, `af092157`, `1e639a65`, `b7c29951`, `8708d595`, `a7b4e809`);
non-`.hermes/plans/` paths in `a7b4e809..HEAD` = **0**; `app/src/analysis/AnalysisPage.css` blob
**c6930c66eabf3918ececb2df3a0f682b7e94c4da** at HEAD; `git grep -l cssRuleScan HEAD -- app/src ':!*.test.*'
':!*.test.tsx'` = **EMPTY**. All 12 quotable rows stand, same verdicts, same receipts. No new UI evidence
claimed; the `/record` lock + write-immutability row stays UNVERIFIED-and-DEFECTIVE until both legs land.

## Not done, and why

No coder (BLOCKED-CORPUS, verified at open and again at close), no spec composition (both open items are
already specced + prompted), no browser gate (the only lane-1 UI obligation is the one this item repairs; and
the single local vision slot is not lane 1's to claim under corpus priority), no merge of product code, no data
write, no stack restart, no task status change (todo 2 / done 109).

## Next actions (ordered)

1. Next tick: re-run `dispatch-window-1.py`. On `DISPATCH-ELIGIBLE` (exit 0) fire **LEG 1** immediately with
   `cl-coder-launch.py --lane 1 --item L1-RECORD-LOCK-GUARD-1 --worktree
   /mnt/vast/home/brad/git/wt/L1-RECORD-LOCK-GUARD-1-lane1-l1t2010 --prompt
   .../prompts/coder-L1-RECORD-LOCK-GUARD-1-LEG1-l1t2255.txt --mode parallel` (re-stamp report/log paths with the
   new runstamp; re-prove bars 1/1b/2 at dispatch and rewrite the "measured by me <time>" lines).
2. On LEG 1 `DONE`: adversarial ACCEPT → my own diff + bars 1/1b/2 + server `tsc` → merge → `cl-lane-stack.sh 1
   restart` (background) → `pregate-recordlock-1.py` expect-GREEN.
3. LEG 2: stamp leg 1's merge sha into the `<leg-1-merge-sha>` line, S2 scan from the trunk/worktree root
   expecting **rc 0 with only the `DocumentControlBar.tsx:58-61` display hull**, `probe-recordlock-2.py --live`,
   then browser re-gate on the exact served revision of `:5192`; item stays in-progress until `VERDICT: accept`.
4. Architect erratum (one line, no card): the policy-copies ruling's "every existing 409 pin stays green without
   amendment" needs the two `protocol-control` fixtures added to its caveat list.
