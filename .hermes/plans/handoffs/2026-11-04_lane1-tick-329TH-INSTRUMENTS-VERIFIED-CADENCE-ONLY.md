# LANE 1 TICK 329TH — 2026-11-04 05:00–05:2x EST (10:00–10:2xZ)

One line: **No dispatch was lawful — the §4 BOUNDED-ROTATION gate now fails on ONE clause only
(`other_slot_continuous_hold=0h29m`, maturing 06:33:01 EST), so the tick spent its budget verifying the
armed LEG-1 kit's own *instruments* first-hand (things no earlier tick had run: the S2 policy scan at its
documented md5/line numbers, the post-fire ground-truth verifier) and making the Brad card read correctly
for the 06:53 filing decision.**

## Reconciled first-hand

- `cl-reconcile.sh 1` @ 05:00:10: queue **todo 2 / in-progress 0 / superseded 1 / done 109**;
  `task-list.lock` FREE; **no PAUSE in either lane**; no lane-1 `corpus-state.md`; **no live lane-1 worker**
  ⇒ nothing to recover or adopt.
- Fleet (measured): slot-0 **FREE** (pidfile holder `CHATHOST-CONSOLIDATE-1` **DEAD** — it went free at
  04:46:20, per the 328TH addendum and re-confirmed here by flock + pidfile); slot-1 **HELD by a live lane-2
  pair** (`L2-CLARIFY-TARGET-1`, launcher 3600006 / child 3600008, claimed 09:33:01Z). Thunderbeast slots
  both FREE (holders DEAD) — not usable: lane-2 corpus priority + lane 1 holds no thunderbeast item.
- Trunk `cl/integration-1` @ **5ed87e11**. `git diff --name-only 15c34e32..HEAD` = **1 path**, the 328TH
  handoff doc ⇒ product tree unchanged, all 12 ledger rows still stand by proof (no re-derivation needed).
- Stack `:3092` 200 / `:5192` 200; not restarted.

## Gate — ROTATION-DEFERRED (rc 14), now cadence-bound ONLY

My own run of `scripts/dispatch-window-1.py --rotation --item-severity HIGH` @ 05:02:27:

| §4 check | result |
|---|---|
| 1 not paused / queue lock free | PASS |
| 2 item todo + `dispatched: none` + HIGH | PASS |
| 3 cadence | **FAIL — the only failure.** 14 lane-2 launches ✓ (need ≥4); `other_slot_continuous_hold=0h29m` (need ≥2 h), holder `L2-CLARIFY-TARGET-1`, live pair 3600008 |
| 4 one free slot, other held by a live lane-2 pair | **PASS** — `free_slots=[0] held_slots=[1]` |
| 5 lane 2 has a live coder pair | PASS (1) |

Maturity = 09:33:01Z + 2 h = **11:33:01Z = 06:33:01 EST**, inside the armed unit's 12:30Z/07:30 EST
deadline. The claim target is slot-0. If lane 2 re-claims slot-1 across a >60 s handoff gap the clock
restarts (`HANDOFF_GAP_TOLERANCE=60 s`); if lane 2 takes slot-0 first, check 4 fails again.

`cl-l1-armed-dispatch-0228.service` is **active** (MainPID 3297306, since 02:24:15 EST), polling every 45 s;
its own log shows identical rc=14 verdicts through 05:00:37 and a continuously live GUARD2.

## Armed kit — instruments verified this tick (new, first-hand)

Everything below was **run**, not inherited. `/home/brad/.hermes/cl/lanes/1/scripts/verify-leg1-fired.sh`
@ 05:03:14 reports **NOT-FIRED** (START_RECORDS=0, unit active, worktree 0 commits ahead of trunk, product
diff none) — the ground-truth route the 325TH built, exercised again here.

| item | result |
|---|---|
| worktree `wt/L1-RECORD-LOCK-GUARD-1-lane1-l1t2010` | branch `cl/lane1-recordlockguard-1-l1t2010` @ `12becda1`, **clean** (only untracked `node_modules`) |
| `12becda1` ancestor of trunk `5ed87e11` | **yes** (`git merge-base --is-ancestor`) ⇒ the pre-fire ff-only step will succeed |
| `node_modules` | present at repo / `server/` / `app/` roots |
| LEG-1 brief pin | md5 `6ceddf7ddfaae09cf32fa97b77a380df` = `EXPECT_MD5` (23,856 B) |
| GUARD2 item parse | `todo\|none\|none` |
| **S2 policy scan** `scripts/s2-policy-scan.py` | md5 `60d9dd4cb4e67a01c5dec3819b048a63` = the brief's documented md5; run FROM the worktree root it reports **exactly the 4 documented pre-leg hits at the documented lines**: `app/src/event-editor/right-pane/protocol/protocolStepEditing.ts:45`, `server/src/api/handlers/RecordHandlers.ts:1139`, `server/src/api/routes/protocol-steps.ts:216`, `server/src/store/RecordStoreImpl.ts:286` |

**LEG-2 side re-checked too** (it must fire immediately after LEG 1 merges): the staged LEG-2 brief
(`coder-L1-RECORD-LOCK-GUARD-1-LEG2-STAGED.txt`, md5 `e2fe8f9b…` = the restamper's pin) has the fail-closed
RESUME CONDITION at the top (it returns `LEG2 BLOCKED pre-gate-not-green: leg-1 merge sha not stamped` if
`LEG1_MERGE_SHA:` is absent), client scope only (`getLifecycleContentLockedStates`, `RecordRegistryPage`,
`RecordEditPanel`, `DocumentControlBar` allowlist, `protocolStepEditing.ts`), and app bars 3/5/6. The chain
LEG1 → restamp → LEG2 is instrumented end-to-end; nothing further to stage before the gate opens.

I also read the pinned LEG-1 brief against the binding spec amendments (§ AM-1…AM-11, policy-copies
ruling): it carries the schema→types→engine→handler-echo→4-YAML ordering, the four-YAML exact set
(`document-control`, `document-controlled-signing`, `lab-sample`, `registry-ops`), `createRecordStore`
config injection, the store `updateUnlocked` no-op placed **immediately before `serializeRecord`** with the
four typed walls enumerated in order, the fifth consumer `protocol-steps.ts:216-227`, `app/` explicitly out
of scope (LEG 2 owns `RecordRegistryPage`/`RecordEditPanel`/client), the AM-6 three-assertion no-op pin, and
the AM-3 state-equality trap. **No contradiction found between the pinned brief (md5-verified) and the
amended spec.** No re-pin needed.

## Real finding — post-fire ownership gap (recorded, not patched)

`cl-coder-launch.py` never touches `task-list.md` (verified by reading all 125 lines), and the armed
dispatcher does not stamp the queue either. So the moment LEG 1 fires, the queue of record will still read
`L1-RECORD-LOCK-GUARD-1 | todo | dispatched: none` while a coder is live and after it commits. Concrete
obligations for the next tick:

1. **Stamp the claim** (`status: in-progress`, `owner`, `dispatched:`) under `task-list.lock` as soon as
   `verify-leg1-fired.sh` says FIRED. Do **not** pre-stamp now: GUARD2/pre-launch re-check require exactly
   `todo|none|none`, so pre-stamping would make the armed unit exit 4.
2. Duplicate-dispatch risk is **bounded** in the meantime: while the coder holds a slot, gate check 4
   (`free_slots`) fails for any other lane-1 dispatch attempt. The exposure is a misstated queue only.
3. **Read the log correctly** (325TH semantics, re-confirmed in the script): the armed dispatcher calls
   `systemd-run --collect` *without* `--no-block`, so it BLOCKS; `launcher rc=N` is the **coder's exit code**
   and its timestamp is the coder's **end**. `rc != 0` therefore means "coder ran and failed", not "refused".
   Ground truth is always `scripts/verify-leg1-fired.sh`.
4. If the unit exits before 07:30 without a start record (`BUDGET-EXPIRED`, exit 8), it is **gone** —
   re-arm with the recorded systemd-run shape (outlives tick exit), never by hand-launching the brief.

## Brad card — refreshed, not filed

`2026-11-04_l1-brad-card-L1-RECORD-LOCK-GUARD-1-DRAFT.md` gains an **AUTHORITATIVE 329TH refresh block**
plus a top-of-file pointer, correcting the 04:41 framing: check 4 now PASSES and the gate is
**cadence-bound only**, maturing 06:33:01 — i.e. it should open unaided 20 min before the 12 h filing
deadline. Filing remains due at **06:53 EST** only if the gate is still unmet then (architect ruling §5).

## Due blockers — NONE

- **L1-PARAMS-EMITTER-RIDER** — RIDER-TRIGGERED, trigger **UNMET (35th tick)**: `git log -1 --
  scripts/fame-gatefix/` still `136a3d27` @ 2026-11-02 17:09:38. It may not open a cycle of its own.
- **FAME-1B-BACKFILL** — `status: done` (task-list:12043). No open Brad holds in lane 1.
- Brad card 06:53 EST — future obligation, tracked above.

## State left behind

No coder dispatched, no slot claimed, no product code, no merge, no data write, no stack restart, no
task-status change (**todo 2 / in-progress 0 / superseded 1 / done 109**). Armed unit remains **active**
(deadline 07:30 EST). Brad card remains **DRAFT**.

## Next actions (ordered)

1. **First**, `scripts/verify-leg1-fired.sh` — never the armed log's wording.
   - **FIRED** → stamp the queue claim under `task-list.lock`; reconcile the coder's commits; run bars
     1/1b/1c/1d/2 + `server tsc` rc 0 + `app tsc` 21 myself; stage and dispatch `cl-adversarial-reviewer`
     on the real diff; merge `--no-ff` only on ACCEPT; **restart the lane stack** (`server/`+`schema/`-touching
     merge ⇒ the AM-5 pregate proves staleness); then `python3 scripts/restamp-leg2-l1.py --sha <merge-sha>
     --apply-tasklist` and confirm the printed md5.
   - **NOT-FIRED at 06:53** → file the Brad card (due) and, if the unit has exited, re-arm.
2. Between those, if the gate opens at 06:33 the armed unit fires by itself — do not race it.
