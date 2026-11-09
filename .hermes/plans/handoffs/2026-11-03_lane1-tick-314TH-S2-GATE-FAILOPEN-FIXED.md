# LANE 1 TICK 314TH HANDOFF — 2026-11-03 23:01 → 23:2x EST

One line: **no lawful dispatch again (dispatch-window-1.py = BLOCKED-CORPUS, exit 10), so the tick removed two
fail-OPEN defects from the LEG-1 dispatch kit that would have either stopped the coder on a false premise or
laundered a false green into the leg-2 acceptance gate.** The worktree is now fast-forwarded to trunk HEAD with
all four READ-FIRST files, every baseline re-proved there, and the master S2 gate hardened to fail closed.

## Reconciled first-hand (`cl-reconcile.sh 1` @ 23:01:06, `dispatch-window-1.py` @ 23:0x)

- Queue: **todo 2 / in-progress 0 / superseded 1 / done 109**; `task-list.lock` FREE; neither lane paused; **no
  lane-1 `corpus-state.md`**; no lane-1 worker live ⇒ nothing to recover, no duplicate-writer risk.
- Trunk `cl/integration-1` @ **a7b4e809** (= 8708d595 + the 313TH handoff, docs-only). Stack `:3092`/`:5192`
  both **200**, nothing restarted. Exa tripwire **OK**.
- `dispatch-window-1.py` → **BLOCKED-CORPUS (exit 10)**: slot-0 FREE with a **DEAD** pidfile
  (`L2-CLARIFY-CARD-1-2609668` — lane 2's holder exited), slot-1 **HELD** by live `CHATHOST-CONSOLIDATE-1`
  (launcher 2583809 / child 2583815, etime 2h06m). lane-2 queue **todo=5 in-progress=3 corpus ACTIVE
  (SPECS-QUEUED)** ⇒ CORPUS PRIORITY (Brad 2026-11-02T17:05): the free slot is lane 2's first refusal, so lane 1
  dispatched nothing. No lane-2 tooling was invoked (no `dispatch-window-2.py` exists — not this lane's call).
- Due blocker **L1-PARAMS-EMITTER-RIDER**: trigger still **UNMET** — `git log -1 -- scripts/fame-gatefix/`
  = `136a3d27` @ 2026-11-02 17:09:38, unchanged since FAME-8 closed. Nothing to do.

## DEFECT 1 (fixed) — the master S2 gate could pass without looking at the tree

`s2-policy-scan.py` enumerated files with a bare `git ls-files app/src server/src` and treated empty output as
"no hits". **Measured, not theorised:** run from `/home/brad/.hermes/cl/lanes/1` (not a work tree) it printed
`S2 PASS: every production policy-shape hit is the documented display hull` **on a pre-migration tree**, exit 0.
That is a false green generator at exactly the point leg 2's acceptance depends on (`S2 scan VERBATIM, expect
rc=0, both blocks`).

FIX (orchestrator tooling; **scan logic, W=8 window, state sets and both allowlists are untouched** — only the
enumeration is now fail-closed):

    + production_files(): `git rev-parse --show-toplevel` must succeed, else `S2 BLOCKED` rc≠0;
    + `git ls-files app/src server/src` must yield production files, else `S2 BLOCKED` rc≠0.

Proof, both directions, at a7b4e809:
| invocation | result |
|---|---|
| from `/home/brad/.hermes/cl/lanes/1` (non-repo) | `S2 BLOCKED: not inside a git work tree …`, **rc=1** |
| from the LEG-1 worktree root | **rc=1**, exactly 4 hits — `protocolStepEditing.ts:45-45`, `RecordHandlers.ts:1139-1139`, `protocol-steps.ts:216-216`, `RecordStoreImpl.ts:286-286` = the expected pre-migration shape |

Script md5 **181d5c5c683cb78fb4b9417c7dc844d9 → 60d9dd4cb4e67a01c5dec3819b048a63**. Prior handoffs pin the old
md5 as "the audited one"; that pin is now historical and this block supersedes it. No criterion was weakened —
a gate that cannot see the tree now cannot pass.

## DEFECT 2 (fixed) — the LEG-1 prompt asserted a fixed sha that the trunk outruns every tick

It said "`git rev-parse --short HEAD` = 8708d595" for the worktree and named `cfdc904f` as the re-verify base.
Both rot the moment a docs commit lands: the worktree was 1 commit behind and a coder following the text would
read a false premise at the top of its brief (the same class of rot the 312TH found in "9 paths").

FIX: the preconditions are now self-verifying and count-free — `git merge-base --is-ancestor 8708d595 HEAD`
(exits 0), `git status --porcelain` = 0 **tracked** changes (untracked `node_modules` allowed), and
`git diff --name-only 8708d595..HEAD -- app server schema config scripts` prints NOTHING, with any product path
in that range declared a STOP condition. The S2 instruction now names the worktree root as the required cwd, the
expected 4-hit pre-leg shape, and the new script md5, and it forbids an unverifiable run.

## Worktree readiness, re-proved at HEAD (not inherited from 313TH)

`wt/L1-RECORD-LOCK-GUARD-1-lane1-l1t2010`: `git merge --ff-only a7b4e809` moved **1 file / +119 lines, all
`.hermes/plans/`** (the 313TH handoff). After: HEAD `a7b4e809`, `merge-base --is-ancestor 8708d595` YES, 0
tracked changes, product diff `8708d595..HEAD` = **0**, product diff `ccec9e2d..HEAD` = **0** (the tree where the
baselines were originally measured), all **4** READ-FIRST files present.

| bar | command | result (23:02–23:04) |
|---|---|---|
| 1 | `vitest run RecordHandlers.writeGates / RecordHandlers.lifecycle / RecordStore.test.ts` | **3 files / 62 tests PASSED** |
| 2 | `vitest run archivedAssignment / SignatureIntegrity / RevisionStorage` | **3 files / 22 tests PASSED** |
| 4/5 | `server: tsc --noEmit` / `app: tsc --noEmit \| grep -c "error TS"` | **rc 0** / **21** (= baseline) |
| pre-gate | `pregate-recordlock-1.py --expect-red` | **RED on 7/7 ids**, `contentLockedStates` ABSENT, disk `[]` — AS EXPECTED |

## Rule-2 ledger re-derivation at a7b4e809

Ancestors YES ×6 (`2d3035da`, `11338a3a`, `af092157`, `1e639a65`, `b7c29951`, `8708d595`); non-plans paths in
`af092157..HEAD` = **0** and in `11338a3a..HEAD` = **0**; row 1 on its own terms — `git grep -l cssRuleScan HEAD --
app/src ':!*.test.*'` = **EMPTY**, `AnalysisPage.css` blob `c6930c66eabf3918ececb2df3a0f682b7e94c4da` at HEAD.
**All 12 quotable rows stand**, same verdicts, same receipts. No new UI evidence claimed.

## Not done, and why

No coder (BLOCKED-CORPUS), no spec composition (both open items already specced and prompted), no browser gate
(no lane-1 UI obligation is lawful while L1-RECORD-LOCK-GUARD-1 is unfixed and the item it gates is the one
holding the ledger's `/record` lock row UNVERIFIED), no merge of product code, no data write, no stack restart,
no task status change (todo 2 / done 109).

## Next actions (ordered)

1. Next tick: re-run `dispatch-window-1.py`; on `DISPATCH-ELIGIBLE` (exit 0) fire **LEG 1** immediately:
   `cl-coder-launch.py --lane 1 --item L1-RECORD-LOCK-GUARD-1 --worktree
   /mnt/vast/home/brad/git/wt/L1-RECORD-LOCK-GUARD-1-lane1-l1t2010 --prompt
   .../prompts/coder-L1-RECORD-LOCK-GUARD-1-LEG1-l1t2255.txt --mode parallel` (re-stamp report/log paths with the
   new runstamp; the prompt's assertions are now tree-state based, so a docs-only trunk advance cannot rot them —
   but re-prove bars 1/2 anyway and rewrite the "re-run by me <time>" line).
2. On LEG 1 `DONE`: adversarial ACCEPT → my own diff + bars 1/2 + server `tsc` → merge to `cl/integration-1` →
   `cl-lane-stack.sh 1 restart` (background) → `pregate-recordlock-1.py` expect-GREEN → then LEG 2.
3. LEG 2: S2 scan **from the trunk/worktree root** (new md5) expecting **rc=0 with only the
   `DocumentControlBar.tsx:58-61` display hull**, then `probe-recordlock-2.py --live`, then browser re-gate on the
   exact served revision (`:5192`); item stays in-progress until `VERDICT: accept`.
4. When lane 2 lands SEQ-ANSWER-CONTRACT-1: re-run the `l1t1645` probe suite on `:3092`.

## Tick close (23:07) — the fleet picture moved, and it confirms the call

Re-probe of `dispatch-window-1.py` at close: **still BLOCKED-CORPUS (exit 10)**, but the shape changed — slot-0 is
now **HELD by lane-2 `L2-CLARIFY-CARD-1` (launcher 2865802, claimed 04:04:33Z = 23:04:33 EST)**, i.e. lane 2 took
the slot that had been free-with-a-dead-pidfile within ~3 minutes of it opening, while this tick was doing harness
work. Slot-1 remains `CHATHOST-CONSOLIDATE-1` (2583809). That is the empirical justification for not dispatching:
the free capacity really was lane 2's first refusal, not lane 1's fallback.
Stack `:3092` / `:5192` = **200 / 200** at close; nothing restarted. No worker of any kind left running by lane 1.
Trunk docs-only: `bf104d6d` (handoff) + this close note.
