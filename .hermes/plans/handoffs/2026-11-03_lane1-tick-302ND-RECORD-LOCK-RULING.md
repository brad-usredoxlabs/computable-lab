# LANE 1 TICK 302ND HANDOFF — 2026-11-03 19:00 → 19:3x EST

One line: **no fleet slot (both held by live lane-2 coders, corpus priority) — so the tick spent itself on the one
ready lane-1 item instead: I corrected a quotable WRONG defect claim with a one-line data-repo receipt, got an
architect ruling on the policy-placement gap, and promoted a reviewed, dispatch-ready spec for
`L1-RECORD-LOCK-GUARD-1` (composer draft + my binding AM-1..AM-8 amendment). No product code, no merge, no restart.**

## Reconciled first-hand (`cl-reconcile.sh 1` @ 19:00:59)

- Queue: **todo 3, in-progress 0, superseded 1, done 108**; `task-list.lock` FREE; **neither lane paused**;
  lane-1 `corpus-state.md` **absent** (corpus loop governs lane 2).
- Trunk `cl/integration-1` @ **819a2f44** at entry (the 301ST tick's own handoff commit; `git diff --stat
  af092157..HEAD -- app server schema` EMPTY). Tracked tree clean (only untracked `node_modules`/`ready`).
- Stack `:3092` 200 / `:5192` 200; **nothing restarted**. Exa tripwire **OK**.
- Nothing interrupted: no lane-1 worker/reviewer in flight (0 in-progress), so nothing to recover.

## Capacity (why no coder was dispatched — re-checked, not inherited)

| check | result |
|---|---|
| SHARED `appliance2-coder-slot-0.lock` | **HELD** (flock) — launcher pid 2049969, `L2-CLARIFY-CARD-1` fix5resume, 1h40m |
| SHARED `appliance2-coder-slot-1.lock` | **HELD** (flock) — launcher pid 2233284, `CHATHOST-CONSOLIDATE-1` d1fix, 9m |
| lane 2 queue | 4 todo + 3 in-progress + active `corpus-state.md` ⇒ **CORPUS PRIORITY** (Brad 2026-11-02T17:05) |
| vision slot | not used this tick (no lane-1 item in browser review) |

Both externally gated items re-verified, unchanged: `L1-PARAMS-EMITTER-RIDER` trigger **UNMET**
(`git log -1 -- scripts/fame-gatefix/` = `136a3d27` @ 2026-11-02 17:09:38; emitter md5 `0e00b33a…`,
mint successor `6d142b6c…`); `FAME-1B-BACKFILL` Brad HOLD A-L1T229-3 stands (no answer on disk).

## Finding 1 — the 301ST defect claim was WRONG, and the real cause is one line

The 301ST handoff (and the claims ledger) inferred "no content-immutability guard on plain PUT" from
`git grep LIFECYCLE_IMMUTABLE`. **False.** The guard exists under another token, at two layers:

- `server/src/api/handlers/RecordHandlers.ts:1139-1141` → 409 `CONTROLLED_RECORD_LOCKED` when stored
  `lifecycleId` is set, state ∈ {approved, effective, superseded, archived}, and
  `controlledContent(previous) !== controlledContent(proposed)`.
- `server/src/store/RecordStoreImpl.ts:285-290` (`contentLockError`, called `:744-745`) — same predicate,
  store wall (API-bypass proof).

What the gate observed was a **no-edit** save. Measured cause (mine): `RecordHandlers.ts:1195-1216` injects
`updatedAt: new Date().toISOString()` into the payload unconditionally; `controlledContent`
(`RecordRevisionService.ts:32-36`) **strips** updatedAt by design, so both guards pass, `serializeRecord`
re-emits the file and `meta.contentSha` (= the persisted **file's** byte sha, `RecordStoreImpl.ts:354/380/506`)
drifts.

Receipt (the lane data repo's own commit for the gate's click):

```
dbda2eda Update DOC-DEMO-SOP   1 file changed, 1 insertion(+), 1 deletion(-)
-updatedAt: 2026-10-19T19:22:03.106Z
+updatedAt: 2026-11-03T23:49:44.028Z
```

⇒ Real defects are (a) `/record` renders an ENABLED Save on a locked record (dead chrome, no draft-copy
route) and (b) a no-edit PUT is not a no-op. **Acceptance criteria 1-5 unchanged.** Claims ledger corrected
in place (two appended correction blocks).

## Finding 2 — architect ruling on the gap I could not settle from repo evidence

`lifecycle.meta.schema.yaml` declares only `id/label/initial/terminal/description` per state
(`additionalProperties:false`); there is **no** declared content-lock set, and the item forbids a second TS
policy list. Ruling: `.hermes/plans/2026-11-03_l1-record-lock-policy-decision.md`.

- **Q1 = (A)** declare `contentLocked: true` per state in lifecycle DATA; mirror the reviewed
  `terminalStates` mechanism end-to-end (meta-schema → `types.ts` → `LifecycleEngine.contentLockedStates()`
  `:129-137` → echo beside `terminalStates` at `LifecycleHandlers.ts:81-82` → client accessor) and populate
  **four** YAMLs: `document-control` (4 states), **`document-controlled-signing` (same 4 — omitting it silently
  loses a live lock)**, `lab-sample` + `registry-ops` (`archived`, preserves today's global list).
  `lab-vocabulary-control` / `service-request` / `tyf-order` untouched. No golden/MANIFEST pin covers these
  YAMLs. (B) reusing `terminal` **refuted** (approved/effective are not terminal); (C) dedupe-only rejected.
- **Q2** no-op = **200 returning the existing record, NO write, in the STORE** (before `serializeRecord`), no
  new token; `CONTROLLED_RECORD_LOCKED` keeps meaning "content changed while locked".
- **Q3** minimum touch set + 4 RED pins + residual-gap clauses.

**My independent verification of the ruling's load-bearing facts:** `terminalStates()` engine precedent ✓,
endpoint echo ✓, client `getLifecycleTerminalStates` ✓ (`client.ts:4668`), the 4 YAML state sets ✓, no
golden/treeState pins on lifecycle YAMLs ✓, store has no engine and is only constructed via
`createRecordStore` (`RecordStoreImpl.ts:1048-1055`) with a `RecordStoreConfig` that already carries
`appendOnlyKinds` ⇒ **config injection is the clean seam** (my amendment AM-2; architect said "constructor
injection" — config achieves the same without touching every call site).

## Finding 3 — spec promoted, with a trap neither upstream artifact caught

`cl-spec-composer` (unit `cl-l1-composer-recordlock-l1t1905`, `systemd-run --user --collect`, rc=0, 6m51s)
produced a strong draft and **falsified my own serialization-order hypothesis** with the `dbda2eda` receipt
(recorded, not hidden). Reviewed, then promoted with a binding amendment because it conflicted with the ruling
on two points (it deferred the DATA declaration as "A2 out" and put the no-op in the handler only).

- Canonical: `.hermes/plans/2026-11-03_l1-record-lock-guard-1-spec.md` (draft kept at `…-DRAFT-l1t1905.md`).
- **AM-3 trap (mine, mandatory pin):** `controlledContent` strips `state`, so **every lifecycle transition**
  (`approved→effective`, `effective→superseded`) is also "content-equal"; a short-circuit keyed on content alone
  would **freeze the state machine**. The no-op predicate must include state equality, and a transition-write
  RED pin is mandatory.
- AM-6 adds the QMS7-3 coverage bars; AM-7 adds reviewer bait (silent unlock via unpopulated YAML, forgotten
  `document-controlled-signing`, fail-open resolver guesses); AM-8 closes the composer's debt-bearing
  assumption (AS-L1T1905-2) — debt now false.

## Queue / ledger changes (this tick)

- `L1-RECORD-LOCK-GUARD-1`: **still todo / unclaimed / not dispatched**; annotated in place with the defect
  narrowing, the ruling, the promoted spec and the dispatch mode (LONG, both slots, on first free capacity).
- `handoff_latest` updated; `claims-ledger.md` gained two correction blocks (guard exists; store mirror + no
  byte short-circuit); this tick record at the task-list EOF.
- No task status changed; no coder slot claimed; no product code; no data write; no stack restart; no merge.

## Assumptions

- **AS-L1T302-1** Narrowing the defect statement (guard exists; drift cause is the unconditional `updatedAt`)
  while leaving all 5 acceptance criteria verbatim is defect-narrowing, not criterion weakening. Debt: false.
- **AS-L1T302-2** Resolving the composer-vs-architect conflict in favour of the architect ruling (DATA-declared
  `contentLocked` + store-level no-op) is correct sequencing: the ruling answered the exact question the
  composer flagged as unresolved. Debt: false.
- **AS-L1T302-3** Not dispatching anything while both shared slots are held by live lane-2 coders under CORPUS
  PRIORITY is queue hygiene, not deferral of owned work. Debt: false.
- AS-L1T278-3 (FAME-1B-BACKFILL Brad hold) **debt: TRUE**, unchanged.

## Open obligations / structured blockers

- **READY (lane 1 owns): `L1-RECORD-LOCK-GUARD-1`** — spec approved; dispatch **long mode** on the first free
  appliance-2 capacity AFTER lane 2's dispatchable work is served:
  `python3 /home/brad/.hermes/cl/scripts/cl-coder-launch.py --lane 1 --item L1-RECORD-LOCK-GUARD-1
  --worktree <fresh wt/l1-record-lock-guard-1-lane1-<ts>> --prompt <prompt> --log <log> --mode long`.
  The coder prompt MUST point at the spec's amendment block (AM-1..AM-8), not the draft.
- **Orchestrator-only pre-gate after merge:** `cl-lane-stack.sh 1 restart`, then confirm
  `GET :3092/api/lifecycle/document-control/transitions` carries
  `contentLockedStates: ['approved','effective','superseded','archived']`, `document-controlled-signing` the
  same four, `lab-sample`/`registry-ops` `['archived']`. If absent, the YAML did not reload — do not re-grade
  the UI.
- **STAGED (lane 1 owns):** re-run the record-editor gate after the repair merges — new runstamp, fresh brief
  pinned to the new served HEAD, and a fresh `DOC-DEMO-SOP` contentSha baseline (never reuse `l1t1845`).
- **CARRIED (lane 2 owns) `SEQ-ANSWER-CONTRACT-1`:** still 0 occurrences in `lanes/2/task-list.md`;
  post-delivery lane-2 ticks = **1** (started 18:10:55). Re-surface ONCE after the SECOND post-delivery tick.
- **Gated, unchanged:** `L1-PARAMS-EMITTER-RIDER` (rides the next `scripts/fame-gatefix/` re-mint);
  `FAME-1B-BACKFILL` (Brad hold A-L1T229-3; spec pre-staged, dry-run receipted twice).

## Next-tick checks (priority)

1. `cl-reconcile.sh 1`; expect todo 3 / in-progress 0 / done 108.
2. If a slot frees AND lane 2 has nothing dispatchable → claim `L1-RECORD-LOCK-GUARD-1` in **long** mode with a
   prompt built from the amended spec.
3. Re-check `git log -1 -- scripts/fame-gatefix/` for the rider trigger.
4. Re-check lane-2 post-delivery tick count for `SEQ-ANSWER-CONTRACT-1`.
5. Do **not** treat the ACL 404 for `DOC-20660FF4E9734191` / `DOC-A56FD77A9B124087` as fixture loss.

## Evidence index (observed, not asserted)

- `8f9dc438` lane1 302ND: tick handoff + L1-RECORD-LOCK-GUARD-1 spec (amended) + policy decision doc
- `2b1fca62` lane1 302ND: mark promoted spec header (reviewed, amendment binding, not yet dispatched)
- spec: `.hermes/plans/2026-11-03_l1-record-lock-guard-1-spec.md` (2,393-word draft + AM-1..AM-8)
- draft (provenance): `.hermes/plans/2026-11-03_l1-record-lock-guard-1-spec-DRAFT-l1t1905.md`
- ruling: `.hermes/plans/2026-11-03_l1-record-lock-policy-decision.md`
- composer log `composer-RECORD-LOCK-GUARD-1-l1t1905.log` (rc=0, 6m51s); architect log
  `arch-record-lock-policy-l1t1910.log` (rc=0, 2m29s); prompts sha256-pinned in both logs.
- drift receipt: lane data repo `/home/brad/.computable-lab-lane1/worktrees/main` commit `dbda2eda`.
