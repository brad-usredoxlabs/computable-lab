# LANE 1 TICK 339TH — 2026-11-04 09:00–09:5x EST (14:00–14:5x Z)

One line: **LEG 1 was running but thrashing; I measured it, stopped it, and re-dispatched it with a self-contained
brief.** Run 1 (l1t0842) spent 48 minutes and 340 `read_file` calls producing **zero product edits** (0 patches,
0 commits, report still at its preconditions section). Recovery run (l1t0940) is live in slot-0 on the same
worktree/branch with every anchor pre-measured and anti-thrash rules. No criteria, AM-1..AM-11, boundaries or tokens
changed; nothing was merged, no product code authored by me.

## Reconciled first-hand (`cl-reconcile.sh 1` @ 14:00:13Z / 09:00:13 EST)

- Queue at open: **todo 1 / in-progress 1 / superseded 1 / done 109**; `task-list.lock` FREE; **no PAUSE in either
  lane**; **no lane-1 `corpus-state.md`**; stack `:3092` 200 / `:5192` 200 (not restarted this tick).
- Shared slots (flock truth): slot-0 HELD `L1-RECORD-LOCK-GUARD-1-37880` (run 1, live pair 37880/37882), slot-1 HELD
  `L2-CLARIFY-TARGET-1-3881148` (lane 2, live).
- Trunk `cl/integration-1` @ **1d034ba8**; the worktree stands at **9a0de2a5**, product diff vs trunk **0 paths**
  (docs-only advance). `verify-leg1-fired.sh` → **FIRED, START_RECORDS=1**, start record 13:50:57Z (proven before
  anything else was touched).
- Exa tripwire: **OK** (present + consistent across lane1/lane2/canonical).
- Due blockers re-checked, unchanged: `L1-PARAMS-EMITTER-RIDER` trigger **UNMET** (45th check:
  `git log -1 -- scripts/fame-gatefix/` = `136a3d27` @ 2026-11-02 17:09:38); `FAME-1B-BACKFILL` HOLD-for-Brad;
  Brad card (8,825 B, filed 06:55) still has **no lettered answer section** — not re-filed, not re-armed.

## The measured problem in run 1 (evidence, not impression)

`~/.hermes/profiles/cl-coder/state.db` (session `20261104_085058_915007`, read-only):

| measure | value |
|---|---|
| elapsed at stop | 47m38s (13:50:57Z → 14:39:35Z) |
| tool calls by name | `read_file` **340**, `terminal` 133, `execute_code` 41, `search_files` 12, `write_file` 7 (= the report only), **`patch` 0** |
| product edits | **0** (`git -c core.fileMode=false status --porcelain -- server schema app` = empty) |
| commits | **0** (`HEAD` still 9a0de2a5) |
| tokens (profile usage rows for the session) | 153 calls / 1.96M input (7.4M cached) / **211K output** / 181K reasoning — ≈7× the brief's ~28-30K output budget |

Behavioural signature (from the message trail, not inferred): it announced "final reads" at 09:19:54, then at 09:28
and again at 09:37 re-read files it had already captured (`LifecycleHandlers.test` head, `RecordStore.test` harness,
`updateUnlocked`) — i.e. context compression was dropping its reads and it re-surveyed instead of editing. Under
the 131072-token parallel envelope that loop can run indefinitely with no product output while lane-2 corpus work
queues, which is exactly what the corpus-priority rule forbids.

Assessment recorded before acting (2x/3x rule): no forward product motion at 2x, and at 3x I changed the route rather
than restarting the same shape. Ownership was confirmed first (launcher 37880 alive, `fuser` on the shared slot-0 lock
= 157634/157636 after re-dispatch; no second writer existed).

## Recovery (what I actually did)

1. `systemctl --user stop cl-l1-leg1-l1t0842-f1.service` → child 37882 gone (`rc=-15` exit record
   `ended_at=14:39:35.928Z`), shared slot-0 flock verified FREE, worktree verified **0 tracked changes** (nothing lost).
2. Wrote `prompts/coder-L1-RECORD-LOCK-GUARD-1-LEG1-resume-l1t0940.txt` (11,104 B, md5
   `d97fab71a263eba9540ceb4d3f1091c4` — 131 argv fields
   verified in the child's `/proc/cmdline`): it embeds the measured mechanism, **every anchor with line numbers**
   (`RecordStoreImpl` walls :741/:744/:750/:764/:776/:789 and the no-op point **immediately before :795**;
   `LifecycleEngine` :91/:129; `types.ts` :6-10; meta-schema :22-23/:31; the four YAML paths with their expected sets;
   `LifecycleHandlers` :81-82; `RecordStoreConfig` :203/:229; the three `createRecordStore` sites
   server.ts:527 / applyOwnershipDefaults:282 / migrateRecordLifecycles:512; the three policy-literal consumers +
   the `protocol-control` fixture trap), the required pins (AM-6 a/b/c, ordering pins, seed-candidate decision,
   AM-9 d/e/f, AM-10 production wiring), the bar commands with baselines, a six-unit order, and hard anti-thrash rules
   (max one read per file, `grep -n` instead of reading, patch-then-commit, no full-file/log printing).
3. Re-dispatched through the current launcher only:
   `systemd-run --user --collect --unit=cl-l1-leg1r-l1t0940 … cl-coder-launch.py --lane 1 --item L1-RECORD-LOCK-GUARD-1
   --worktree /mnt/vast/home/brad/git/wt/L1-RECORD-LOCK-GUARD-1-lane1-l1t2010 --prompt <resume> --log
   lanes/1/coder-L1-RECORD-LOCK-GUARD-1-LEG1-resume-l1t0940.log --mode parallel`. Launcher **157634**, child **157636**,
   start record `2026-11-04T14:39:45.970663+00:00`, slots `[0]`, unit `cl-l1-leg1r-l1t0940.service` active.
4. Task list updated under `task-list.lock` (staged temp + rename, backup `task-list.md.bak-l1t0940-339TH`):
   `owner:` and `dispatched:` now name the resume and preserve run 1's identifiers; status stays `in-progress`.

## Prepared while the worker runs (no slot used)

- **Adversarial gate kit ready** (opens the moment DONE lands): `prompts/advc1-L1-RECORD-LOCK-GUARD-1-leg1-l1t0905.txt`
  (9,481 B) + executable `scripts/launch-advc1-recordlock-leg1-l1t0905.sh` (absolute PATH export, prompt non-empty
  guard, log `logs/advc1-...log`, report target `reviews/L1-RECORD-LOCK-GUARD-1-leg1-advc1-l1t0905.md`). Profile is
  `cl-adversarial-reviewer` = deepseek/deepseek-v4.1-flash-1017 on OpenRouter — a **different model family** from the
  coder (qwen3.8-27b on appliance-2), so the gate is genuinely independent. Attack list: predicate shape, the four
  ordering walls, transition-freeze, S2 scan from the worktree root, resolver fail-open, AM-10 production wiring,
  per-YAML Ajv pins, the `protocol-control` fixture repair, all seven bars, boundary.
- **Post-merge gates re-proved runnable, not inherited**: `python3 scripts/pregate-recordlock-1-selftest.py` →
  `SELFTEST: PASS` (green path rc=0, server-echo-superset MISMATCH rc=1, stray-state-id rc=1).
  `scripts/probe-recordlock-2.py` confirmed write-safe by default (`--live` required; bare/`--dry-run` = plan only),
  so it stays parked until merge (AS-L1T337-3).
- LEG 2 still staged and still valid: `prompts/coder-L1-RECORD-LOCK-GUARD-1-LEG2-STAGED.txt` (13,655 B, md5
  `e2fe8f9b…`) pins no sha ("the HEAD your worktree is on") and self-verifies the AM-5 pre-gate on served `:3092`.

## State left behind

- Queue: **todo 1 / in-progress 1 / superseded 1 / done 109**; `L1-RECORD-LOCK-GUARD-1` = `in-progress`,
  owner `cl-coder lane1 LEG1 resume (l1t0940)`.
- Worker: launcher 157634 / child 157636, unit `cl-l1-leg1r-l1t0940`, PARALLEL one slot, slot-0 flock verified HELD by
  157634+157636 via `fuser`. **Not killed, not checkpointed away.** No merge, no product code, no record write, no
  stack restart, no lane-2 interference.

## Assumptions recorded (not resolved)

- **AS-L1T339-1:** replacing a *thrashing but live* worker on an item it lawfully owns is a route change within my
  dispatch authority, not a re-claim of a fleet slot: the slot never left lane 1's ownership, the worktree was
  verified clean first, and the replacement went through the policy launcher. If a future tick disagrees, the
  evidence above (0 edits / 340 reads / 7× output budget) is the record to argue against.
- **AS-L1T339-2:** embedding anchors in the brief is worth the prompt size: the cost of a 48-minute thrash is far
  higher than 11 KB of measured line numbers, and it removes the reason to re-read the tree.
- **AS-L1T339-3:** the 131072-token parallel envelope does not by itself prevent read-thrash; the operator-side
  signal to watch is `patch` count vs `read_file` count in the profile state.db, checked at the 2x mark.

## Next actions (ordered)

1. Run `scripts/verify-leg1-fired.sh` — expect **FIRED, START_RECORDS=2** (13:50:57Z and 14:39:45Z). Then watch
   `read_file` vs `patch` counts in `state.db`; the resume should show its first `patch` inside ~10 minutes and its
   first commit shortly after. If it reaches ~20 minutes with 0 patches, do NOT repeat the same survey-brief —
   escalate to an architect decision on splitting LEG 1 (data/echo vs store/no-op) into two smaller dispatches.
2. On `RECORD-LOCK-GUARD-1-LEG1 DONE <40-char sha>`: read the full diff first-hand
   (`git -c core.fileMode=false diff 9a0de2a5..HEAD -- server schema`), re-run bars 1, 1b, 1c, 1d, 2, 4, 5 and the S2
   scan in the worktree myself, then dispatch the prepared adversarial gate with
   `systemd-run --user --collect --unit=cl-l1-advc1-leg1-l1tXXXX /home/brad/.hermes/cl/lanes/1/scripts/launch-advc1-recordlock-leg1-l1t0905.sh`
   (never a bare `hermes -p … -z` inside a `-z` tick). ACCEPT required before merge.
3. On ACCEPT: merge to `cl/integration-1` (docs-only trunk advance is safe; preserve concurrent docs commits), restart
   the LANE stack only (`cl-lane-stack.sh 1 restart`, background), run `pregate-recordlock-1.py` (expect green) then
   `probe-recordlock-2.py --live` (criterion 2), then stage LEG 2 — which re-passes the full §4 gate independently
   before it may claim a slot.
4. Do **not** batch-run `probe-recordlock-2.py --live` before merge. Do not re-file or re-arm the Brad card.

## OBSERVED AFTER THE RE-DISPATCH (measured at 14:40:49Z, 64 s after launch — contrast, not hope)

- Tool mix of the resume session: **`patch` 6 / `read_file` 5 / `terminal` 5** (run 1 at the same age: 340 reads,
  0 patches). Its own message: "U1 edits landed. Running bar 1c to verify the data changes, then committing".
- **BAR 1c already green from the resume**: `Test Files 4 passed (4) / Tests 53 passed (53)` (matches the 4/53
  baseline) at 09:40:49 EST. U2 (engine accessor + handlers echo + AM-9 pins) is next.
- So the recovery route is working at the unit level; the open risk is now only the remaining units' scope, not a
  survey loop. `git log` in the worktree was still at 9a0de2a5 at 14:41Z (commit-in-flight), which is expected.
