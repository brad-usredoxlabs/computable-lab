# LANE 1 TICK 320TH HANDOFF — 2026-11-04 01:00 → 01:2x EST

One line: **no lawful dispatch again (`dispatch-window-1.py` = BLOCKED-CORPUS, exit 10 verified at open AND at
close), so the tick closed the THIRD and last fail-open surface in the LEG-1 kit: the new content-equal no-op is a
THIRD early return inside `updateUnlocked`, and any placement before the function's four existing typed rejection
walls would turn a governance/schema/concurrency rejection into a 200 — on paths no existing pin constrains.**

## Reconciled first-hand

- `cl-reconcile.sh 1` @ 01:00:04: queue **todo 2 / in-progress 0 / done 109**; `task-list.lock` FREE; **no lane-1
  PAUSE, no lane-2 PAUSE**; **no lane-1 `corpus-state.md`**; **no live lane-1 worker** ⇒ nothing to recover, no
  duplicate-writer risk.
- Stack: `:3092` = 200 (`/api/health`: 204 schemas, 155 lint rules, ai available), `:5192` = 200. Served backend
  pid **954410**, `/proc/954410/cwd` → `/mnt/vast/home/brad/git/cl-integration-1/server`, that checkout's HEAD =
  **trunk HEAD** (verified by `pregate-recordlock-1.py`'s own served-revision block, below).
- Trunk `cl/integration-1` arrived at **53109901** (the 319TH's own docs commit) and advanced once this tick to
  **f16bea49** (my AM-11 spec commit, `.hermes/plans/` only).
- **Exa key tripwire RAN**: OK — apiKey present and consistent across lane1/lane2/canonical.
- Capacity, measured (not inherited): shared **slot-0 FREE**, shared **slot-1 HELD** by live lane-2
  `L2-CLARIFY-CARD-1` (launcher 3047532 / hermes child 3047534, claimed 05:30:41Z, ~30 min in), a **live lane-2
  orchestrator tick** (3086508) and a **live lane-2 adversarial reviewer** (3090726). Lane-2 queue **todo=5
  in-progress=3**, `corpus-state.md` **ACTIVE** (prompt-2 SPECS-QUEUED; prompts 3-8 LOCKED) ⇒ the free slot is
  lane 2's first refusal under **CORPUS PRIORITY (Brad 2026-11-02T17:05)**. **Lane 1 dispatched nothing.**
- **The rule bound empirically during the tick**: at open (01:00) slot-0 was FREE; by 01:05:07 EST lane 2 had
  claimed it (`L2-CHATHOST-CONSOLIDATE-1`, launcher 3123886), so at close BOTH slots were HELD. The 01:05 stamp is
  ~4 minutes after the free slot appeared — the same outcome the 314TH measured (lane 2 claimed a free slot-0 within
  ~3 min). No lane-1 claim was lawful at any point in the tick.
- Due blocker **L1-PARAMS-EMITTER-RIDER**: trigger still UNMET — `git log -1 -- scripts/fame-gatefix/` =
  `136a3d27` @ 2026-11-02 17:09:38. Not opened (28th consecutive tick unchanged).

## FINDING — the no-op's POSITION is unpinned, and the wrong position weakens a governance wall

Measured this tick at 53109901 in the pre-warmed LEG-1 worktree:

1. `server/src/store/RecordStoreImpl.ts` `updateUnlocked` already has **FOUR** typed rejection walls before it
   writes, in this order: `appendOnlyWallError` (:741-742 — the hardcoded `record-revision`/`signature`/
   `audit-event` triple **plus** `config.appendOnlyKinds`, i.e. the very knob AM-2/AM-10 model the new resolver
   on), `contentLockError` (:744-745), the `expectedSha` mismatch check (:761-765, `SHA mismatch: expected …,
   got …`), and `validate`/`lint` (:772-777 / :786-791). The lifecycle-bypass previous-payload snapshot sits
   between them (:747-753); `serializeRecord` is at :796.
2. The AM-3 content-equal no-op is a **third** early return in the same function, so its position is a semantic
   decision. The lawful position is **immediately before `serializeRecord`** (what AM-3 already says). Any earlier
   position silently converts an existing typed rejection into a 200: before the append-only wall ⇒ an
   equal-content PUT on an append-only record returns 200 instead of `APPEND_ONLY: immutable records cannot be
   updated`; before the SHA check ⇒ a failed optimistic-concurrency precondition returns 200 with the stored
   record; before validate/lint ⇒ schema drift or a lint error stops surfacing on a no-edit save.
3. **Why no existing pin catches it — this is the load-bearing measurement.** Every append-only pin in the tree
   uses a CONTENT-DIFFERENT payload, so none constrains the ordering:
   `AppendOnlyWall.attestation.test.ts:72` updates with a tampered `claims[0].claimStatus` (content differs);
   `RecordStore.test.ts:665` updates a seed append-only record to `"(edited)"` (content differs). `grep -l
   APPEND_ONLY` over all 11 files in the pre-existing bars returns only those two, and both are content-different.
   An equal-content update on an append-only kind is pinned **nowhere**.
4. Same class on the SEED path: `RecordHandlers.seedPromotion.test.ts` pins promotion with a CHANGED title in every
   case (R2/R7/R3/first-second), so a no-op that fires on `target.mode === 'seed'` would silently stop QMS7-2
   promotion and no pin would notice.
5. Scope of the coverage hole, measured: `grep -rl RecordStoreImpl src --include='*.test.ts'` = **35 suites**, and
   `buildServer` appears in **0** suites — which is why AM-10's production-wiring pin has to be newly written
   rather than borrowed. `applyOwnershipDefaults.test.ts` and `migrateRecordLifecycles.test.ts` (the own suites of
   AM-10 sites #2 and #3) were in no bar; so was `store/LifecycleBypassAudit.test.ts`.

APPLIED (brief + spec, no product code):

- **BAR 1d** added to `prompts/coder-L1-RECORD-LOCK-GUARD-1-LEG1-l1t2255.txt`, and deliberately expressed as two
  DIRECTORIES so no un-enumerated suite can be missed: `vitest run src/store src/scripts
  src/integration/W25CandidateImmutability.test.ts src/api/handlers/RecordHandlers.seedPromotion.test.ts`
  => **9 files / 99 tests PASSED**, measured by me in the worktree at 53109901 in **4.8 s**. It structurally covers
  the append-only wall, `store/LifecycleBypassAudit.test.ts`, and the own suites of BOTH AM-10 script sites
  (`migrateRecordLifecycles`, `applyOwnershipDefaults`). None of those was in any prior bar. (My first cut was a
  four-file list, 4 files / 28 tests; the directory form superseded it in the same tick because the file list missed
  `LifecycleBypassAudit.test.ts` — a wall inside the very function being rewritten.)
- **"The SECOND trap"** section added to the LEG-1 brief: the required position (immediately before
  `serializeRecord`, i.e. after all four walls) with the three typed rejections an earlier placement would swallow,
  the required NEW pin (equal-content PUT on `kind: 'attestation'` still `APPEND_ONLY` + writes nothing — and the
  honest statement that this case is NEW BEHAVIOR and cannot be shown RED-before-fix), and the required explicit
  decision + pin for the seed-candidate path.
- **AM-11** added to `.hermes/plans/2026-11-03_l1-record-lock-guard-1-spec.md` (committed to trunk **f16bea49**,
  `.hermes/plans/` only) so the durable contract matches the brief. No acceptance criterion, no AM-1..AM-10, no
  boundary, no token changed.
- LEG-1 brief re-stamped to 53109901 (it still asserts ancestor/diff facts, never a moving HEAD). Prompt md5
  `67c4f3b7dc9edaf6dd186dfa88ea5bc8` → **`6a0854b17ff99329e1cc0a0b662ba4f5`** (23,653 B, final for this tick).
  LEG-2 prompt UNCHANGED (`76c5f783958708aca19741c687dc9432`), its `<leg-1-merge-sha>` guard still a literal
  placeholder ⇒ fail-closed.

## Readiness re-proved at 53109901 (fresh, this tick)

- **RED pre-gate, live on `:3092`**: `pregate-recordlock-1.py --expect-red` → served HEAD = trunk HEAD =
  `53109901`, `contentLockedStates` **ABSENT 7/7** ids (disk `[]` 7/7), `expect-red: AS EXPECTED`, rc 0. The
  defect still reproduces on the served build.
- LEG-1 worktree `wt/L1-RECORD-LOCK-GUARD-1-lane1-l1t2010` fast-forwarded **16597086 → 53109901 → f16bea49**
  (docs-only both times); tracked tree clean (untracked `node_modules` only); branch
  `cl/lane1-recordlockguard-1-l1t2010`.
- `git diff --name-only 16597086..HEAD -- app server schema config scripts` = **0 paths** ⇒ the product tree is
  byte-identical to where the 319TH re-proved bars 1/1b/1c/2 (62/62, 22/22, 53/53, 22/22) and server tsc rc 0; those
  were not re-run because there is no product delta to invalidate them.

## Rule-2 ledger re-derivation at f16bea49

Ancestors **YES ×7** (`2d3035da`, `11338a3a`, `af092157`, `1e639a65`, `b7c29951`, `8708d595`, `a7b4e809`);
`git diff --name-only d6572be6..HEAD -- . ':!.hermes/plans'` = **0**; `app/src/analysis/AnalysisPage.css` blob =
**c6930c66eabf3918ececb2df3a0f682b7e94c4da**; non-test `cssRuleScan` importers = **0**. All 12 quotable rows stand.
The `/record` lock + write-immutability row stays **UNVERIFIED-and-DEFECTIVE** until both legs land and the browser
gate passes on `:5192`.

## Not done, and why

No coder (BLOCKED-CORPUS, verified twice — 01:00 and 01:1x), no spec composition (both open items are already
specced and prompted; nothing approved-and-unspecced exists to draft), no adversarial review (no coder delta
exists), no paperwork run (no evidence-trail defect open), no browser gate (no lane-1 UI obligation; the single
local vision slot is not lane 1's under corpus priority), no product merge, no data write, no stack restart, no task
status change (todo 2 / done 109).

**Assumption AS-L1T320-1**: AM-11 was added by me, not the architect. It changes no criterion, boundary or product
intent — it forbids a placement that would weaken an existing governance wall and names the pins that make the
placement non-vacuous — so it is an orchestrator-resolved detail under the 2026-11-02 approval directive. If the
architect disagrees with the ordering constraint, the LEG-1 brief is the only place to change it and no product code
has been written against it.

## Next actions (ordered)

1. Next tick: re-run `scripts/dispatch-window-1.py`. On `DISPATCH-ELIGIBLE` (exit 0) fire **LEG 1** with
   `cl-coder-launch.py --lane 1 --item L1-RECORD-LOCK-GUARD-1 --worktree
   /mnt/vast/home/brad/git/wt/L1-RECORD-LOCK-GUARD-1-lane1-l1t2010 --prompt
   .../prompts/coder-L1-RECORD-LOCK-GUARD-1-LEG1-l1t2255.txt --mode parallel`; the bar set to expect is
   **1, 1b, 1c, 1d, 2 + server tsc rc 0 + app tsc 21**.
2. On LEG 1 `DONE`: adversarial ACCEPT → own diff + all five bars + server `tsc` → merge → `cl-lane-stack.sh 1
   restart` (background) → `pregate-recordlock-1.py` expect-GREEN → stamp the merge sha into the LEG-2 prompt's
   `<leg-1-merge-sha>` placeholder.
3. LEG 2: dispatch with the amended brief (BAR 2c required); S2 scan from the worktree root must return rc 0 with
   only the `DocumentControlBar.tsx:58-61` display hull; `probe-recordlock-2.py --live`, then browser re-gate on
   the exact served revision of `:5192`; the item stays in-progress until `VERDICT: accept`.
4. The fail-open audit class is now CLOSED by enumeration for both legs: LEG-1 bars 1/1b/1c/1d/2 cover every file
   in ruling §1's LEG-1 list, and LEG-2 bars 2/2b/2c cover every file in its list. Stop hunting one-offs; the next
   tick should spend on dispatch readiness only.
