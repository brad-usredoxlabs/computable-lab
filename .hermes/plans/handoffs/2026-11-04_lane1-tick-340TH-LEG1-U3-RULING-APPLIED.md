# LANE 1 TICK 340TH — 2026-11-04 10:00–10:4x EST (15:00–15:4x Z)

One line: **no new dispatch was possible or needed — the live LEG-1 resume is producing real product commits, and when it
stalled for 30 minutes on a question the spec left open (AM-10(c) absent-config default) I got an architect ruling and
folded it into the gate kit instead of redispatching.** U1 `e2177d5b` + U2 `ce84f514` are committed and in-scope; U3 was
landing at tick close and matches the ratified shape. Nothing merged, no product code authored by me, no criteria changed.

## Reconciled first-hand (`cl-reconcile.sh 1` @ 10:00:12 EST)

- Queue: **todo 1 / in-progress 1 / superseded 1 / done 109**; `task-list.lock` FREE; **no PAUSE in either lane**;
  **no lane-1 `corpus-state.md`**; stack `:3092` 200 / `:5192` 200 (not restarted); Exa tripwire **OK**.
- Slots (flock truth, `fuser` on the shared locks): **slot-0 HELD by OUR pair** launcher 157634 / child 157636
  (`hermes -p cl-coder`, `Ssl`, alive); **slot-1 HELD by a live lane-2 pair** (L2-CLARIFY-TARGET-1 launcher 3881148).
- Trunk `cl/integration-1` @ **30c7ed2d** (docs-only advance from `1d034ba8`); worktree base `9a0de2a5` is still an
  **ancestor** of trunk (`merge-base --is-ancestor` → yes), so the merge path is clean.
- Only todo item = `L1-PARAMS-EMITTER-RIDER`, trigger **UNMET** (44th check: `git log -1 -- scripts/fame-gatefix/` =
  `136a3d27` @ 2026-11-02 17:09:38) ⇒ nothing lane-1 was claimable. `FAME-1B-BACKFILL` HOLD-for-Brad unchanged.
- Brad card (`.hermes/plans/2026-11-04_l1-record-lock-guard-1-brad-card.md`, 10,724 B, mtime 08:55) still has **no
  lettered answer** — status addenda only. The item no longer depends on it: the BOUNDED-ROTATION gate passed at
  13:50:57Z and the claim is proven by a launcher START record. **Do not re-file, do not re-arm.**

## The live worker — measured, not assumed

Session `20261104_093946_72c337` (profile `cl-coder` state.db, read-only), started 14:39:45Z:

| measure | run 1 (l1t0842, stopped) | this resume (l1t0940) |
|---|---|---|
| last `patch` | never (0 patches) | 09:48:38, then 10:21:17, 10:34:12 |
| tool mix at 09:48 | 340 read_file / 0 patch | **16 read_file / 12 patch / 1 write_file** |
| commits | 0 | **2** (`e2177d5b`, `ce84f514`) |

I verified the landed work myself rather than trusting the report:

- **U1** — meta-schema gains the single additive `contentLocked: boolean, default: false` on the state object
  (`additionalProperties: false` preserved); `types.ts` gains `contentLocked?: boolean`. The four YAMLs carry exactly
  AM-1's sets, read by me line-by-line: `document-control` and `document-controlled-signing` lock
  approved/effective/superseded/archived; `lab-sample` and `registry-ops` lock archived only; the three untouched
  lifecycles are untouched.
- **U2** — `LifecycleEngine.contentLockedStates()` is a byte-for-byte mirror of `terminalStates()` (undefined when not
  loaded = explicit fail-open; empty set when loaded-but-empty), the handler echoes it, and the AM-9 (d)(e)(f) pins
  exist. The (d) pins resolve the **worktree-root** schema (`join(here,'../../../schema')`) — which matters, see below.
- **Boundary held**: `git diff --name-only 9a0de2a5..HEAD` = `server/` + `schema/` only; `app/` = **0 paths**;
  worktree tracked tree clean apart from untracked `node_modules`.

## The measured problem, and the route change (2x rule)

At 2x (last `patch` 09:48:38, **0 commits for 30 min** while `terminal` calls went 98→112 and `read_file` 18→20) I did
**not** redispatch. From its own trail it was not re-reading one file — it was resolving a design question the spec
leaves open: **AM-10(c) "the absent-config default must be EXPLICIT"** does not say *which direction*, and 38 test call
sites plus both AM-10(b) bulk-write scripts take that branch. It also surfaced two facts I then verified myself:

1. **`server/schema` is a SYMLINK to the TRUNK worktree** (`/mnt/vast/home/brad/git/cl-integration-1/schema`). A schema
   pin that loads through it validates **trunk** YAML and passes **vacuously** — the exact false-green class AM-9(d)
   exists to close. (The U2 pins correctly avoid it; the prepared adversarial kit did not name the trap.)
2. **`server/src/store/RecordStore.test.ts:679`** builds its store-level CONTROLLED pin with
   `lifecycleId: test-controlled-lifecycle`, declared in **no** lifecycle YAML (`grep -rl … schema/` = empty) — the same
   class as the `protocol-control` fixture trap the spec already pins.

So I filed `decisions/RECORDLOCK-LEG1-U3-request-l1t1020.md` and dispatched the architect (OpenRouter-side, **no fleet
slot**): `systemd-run --user --collect --unit=cl-l1-arch-recordlock-u3-l1t1020`, **rc=0 at 10:33:45**.

## The ruling (11,212 B, `decisions/RECORDLOCK-LEG1-U3-answer-l1t1020.md`)

- **Q1 = (ii) engine/disk-backed default.** Ratified shape: a lazy singleton `LifecycleEngine` built from the
  **worktree-root** `schema/core/lifecycles` via `loadLifecyclesFromDir`, never the trunk symlink; `undefined` = not
  loaded = explicit fail-open; loaded-but-empty = **EMPTY set**; the store imports **only the resolver function** so
  AM-2's "no engine dependency" holds at the module boundary; production `server.ts:527` still injects the **real**
  server engine, so the default never runs in production. Reason for rejecting (i) fail-open-skip: it would leave the 38
  no-config test stores and both AM-10(b) scripts **silently lock-free** — the silent-unlock class this item exists to
  close. The ruling also notes the architect's own correction to my request: my "30 min / 0 patches" premise was already
  stale by 10:21 (the loop had broken into production exactly on this decision).
- **Q2 = (b) continue**, with an objective tripwire: a store/default commit **containing a test file by ~11:15 EST**,
  then **≥1 pin commit per 30 min**; immediate stops for any `app/` edit, any state-string policy literal in TS outside
  tests, any `server/schema` path in the worktree, or **two back-to-back 15-min windows with 0 patches AND 0 commits**.
  On a miss the (a) split (U3a wiring/no-op, U3b pins) is **pre-authorized as contingency** — no further architect call.

## U3 in flight at tick close (inspected by me, uncommitted)

`RecordStoreImpl.ts` + `store/types.ts` (+95/−4) plus new `server/src/lifecycle/contentLockDefault.ts` (50 lines). I read
the diff: the **AM-11 no-op sits after all four typed walls and immediately before `serializeRecord`**, gated on **state
equality AND `controlledContent()` equality**, **working-copy only** (seed promotion and its audit unchanged), returning
the **stored** envelope so no file rewrite and no `contentSha` drift; `contentLockError` now reads the declared set
instead of the four-state literal; the default module matches the ratified shape line for line.

## Gate kit hardened (criteria unchanged — no weakening)

- `prompts/advc1-L1-RECORD-LOCK-GUARD-1-leg1-l1t0905.txt` gained **7b** (the `server/schema`→trunk **vacuous-pin trap**,
  with the requirement that the four Ajv pins resolve the worktree-root schema and fail if pointed at trunk) and **6b**
  was rewritten to grade **conformance to the ruling** rather than re-open it, including the R4c lawful fixture repair.
- Post-merge kit **re-proved runnable, not inherited**: `scripts/pregate-recordlock-1-selftest.py` → `SELFTEST: PASS`
  (green path rc=0; mismatch-path rc=1; stray-id rc=1). `probe-recordlock-2.py` stays parked (write-safe by default,
  `--live` required) until after merge.
- LEG 2 staged prompt unchanged (`prompts/coder-L1-RECORD-LOCK-GUARD-1-LEG2-STAGED.txt`, 13,655 B).

## Observations carried for the gate (not decisions)

- **OB-L1T340-1**: the U2 comment in `LifecycleHandlers.ts` says a not-loaded lifecycle "serializes as absent", but
  `[...(engine.contentLockedStates(id) ?? [])]` actually emits `[]`. The coder's **report** gets this right
  (report :44-46), so the code comment is the only imprecise artifact — let advc classify it (LOW / EVIDENCE-TRAIL)
  instead of pre-fixing it.
- **OB-L1T340-2**: `contentLockDefault.ts` reaches `../../../schema/core/lifecycles` from `dirname(import.meta.url)`.
  That resolves correctly from **both** `server/src/lifecycle/` and `server/dist/lifecycle/` (three levels up in each),
  so it survives the build — worth one line of advc confirmation, since a silent 0-file load would fail open
  everywhere.

- **OB-L1T340-3**: at tick close the worktree held a stray untracked scratch test
  `server/src/store/cl-debug.test.ts` alongside the real U3 pin file `server/src/store/RecordStore.contentLock.test.ts`.
  The debug file must **not** be committed: if it appears in `git log`/`diff` at DONE, that is a boundary/cleanliness
  finding for advc (it is not part of the LEG-1 file list), and if it merely remains untracked it must be removed before
  the merge so the tree is clean.

## State left behind

- Queue: **todo 1 / in-progress 1 / superseded 1 / done 109**; `L1-RECORD-LOCK-GUARD-1` = `in-progress`, owner unchanged
  (`cl-coder lane1 LEG1 resume (l1t0940)`); a 340TH note was appended under `task-list.lock` (staged temp+rename, backup
  `task-list.md.bak-l1t1020-340TH`).
- Worker: launcher 157634 / child 157636 **left running, not checkpointed away**, slot-0 held by it. No merge, no
  product code from me, no record write, no stack restart, no lane-2 interference.
- New durable artifacts: the architect request + ruling under `decisions/`, `scripts/arch-recordlock-leg1-u3-l1t1020.sh`,
  `logs/arch-recordlock-leg1-u3-l1t1020.log`, the amended advc1 prompt.

## Next actions (ordered, for the 341ST)

1. Read the worker's state first: `git -C /mnt/vast/home/brad/git/wt/L1-RECORD-LOCK-GUARD-1-lane1-l1t2010 log --oneline`
   and the report tail for `RECORD-LOCK-GUARD-1-LEG1 DONE <sha>` / `BLOCKED <reason>`. Apply the ruling's **tripwire**
   verbatim (test-file commit by ~11:15 EST, then ≥1 pin commit per 30 min). On a miss, execute the **pre-authorized
   split** — do not ask the architect again.
2. On `DONE`: read the full diff `9a0de2a5..HEAD -- server schema` yourself, run bars 1, 1b, 1c, 1d, 2, 4, 5 and the S2
   scan in the worktree, then dispatch the amended advc1 kit via
   `systemd-run --user --collect --unit=cl-l1-advc1-leg1-l1tXXXX /home/brad/.hermes/cl/lanes/1/scripts/launch-advc1-recordlock-leg1-l1t0905.sh`.
   **ACCEPT is required before merge.** Never a bare `hermes -p … -z` inside a `-z` tick.
3. On ACCEPT: merge `--no-ff` to `cl/integration-1` (trunk's advance is docs-only; preserve it), restart the **lane**
   stack only (`cl-lane-stack.sh 1 restart`, background), run `pregate-recordlock-1.py` (expect green) then
   `probe-recordlock-2.py --live` (criterion 2), then stage LEG 2 — which re-passes the full §4 gate independently.
4. Do **not** batch-run `probe-recordlock-2.py --live` before merge. Do **not** re-file or re-arm the Brad card.

## Assumptions recorded (not resolved)

- **AS-L1T340-1**: asking the architect to settle AM-10(c) *while the worker kept running* was the right 2x move — it
  cost no fleet slot, it preserved 135 lines of correct in-flight work, and the ruling arrived before the worker needed
  it. If a future tick disagrees, the evidence is that U3 began landing at 10:19, 4 minutes before the ruling landed.
- **AS-L1T340-2**: hardening the adversarial kit with a measured environment trap (the `server/schema` symlink) is gate
  *strengthening*, not criteria change: no acceptance criterion, AM-1..AM-11, boundary or token rule was touched.
