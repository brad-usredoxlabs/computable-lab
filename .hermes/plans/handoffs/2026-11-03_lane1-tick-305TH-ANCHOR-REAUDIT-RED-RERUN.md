# LANE 1 TICK 305TH HANDOFF — 2026-11-03 20:00 → 20:2x EST

One line: **no lane-1 fleet dispatch — the one ready lane-1 item needs LONG mode (both slots) and lane 2
holds corpus first refusal on measured capacity (slot-0 HELD by a live lane-2 coder, slot-1 free, lane-2
orchestrator tick live, lane 2 carrying todo + in-progress + an active corpus-state.md). The tick instead
re-armed the item's dispatch: re-verified every load-bearing spec/code anchor first-hand at the NEW trunk
HEAD, re-ran the RED pre-gate against the live stack (still red for the right reason, served HEAD == trunk),
re-pinned the pre-staged LONG prompt, re-derived the claims ledger at HEAD, and pinned a NEW binding
spec amendment (AM-10) after finding that AM-2's store resolver could ship test-only (3 production
`createRecordStore` sites, 38 config-less test stores). No product code, no merge,
no restart, no data write, no task status change, no slot claimed.**

## Reconciled first-hand (`cl-reconcile.sh 1` @ 20:01)

- Queue: **todo 3 / in-progress 0** (FAME-1B-BACKFILL [Brad HOLD], L1-PARAMS-EMITTER-RIDER [trigger gated],
  L1-RECORD-LOCK-GUARD-1 [ready, pre-staged]). `task-list.lock` FREE. Neither lane paused.
  Lane-1 `corpus-state.md` **absent** (corpus loop governs lane 2 only). Nothing interrupted ⇒ nothing to
  recover, no resume candidate.
- Trunk `cl/integration-1` @ **af301799** (was 84ebdf46 at the 304TH, then the 304TH's own docs commit).
  Tracked tree clean (only the known untracked `node_modules`, `ready`).
- Stack `:3092` 200 / `:5192` 200. Served HEAD **af301799 == trunk HEAD**, proved via pid 954410 →
  `/proc/954410/cwd` → git HEAD by `scripts/pregate-recordlock-1.py`. Nothing restarted.

## Capacity — measured, not inherited

| check | value this tick |
|---|---|
| SHARED `appliance2-coder-slot-0.lock` | **HELD** — launcher 2443161 / `cl-coder` child 2443163, lane-2 `L2-CLARIFY-CARD-1` fix5-fix2 |
| SHARED `appliance2-coder-slot-1.lock` | **FREE** (flock probe) |
| local VISION slot | flock-free, but a lane-2 `cl-browser-reviewer` (pid 2421641, CHATHOST 6-host re-gate) is live |
| lane-2 orchestrator tick | **LIVE** pid 2398907 (started ~19:5x) |
| lane 2 queue | todo + several in-progress + active `corpus-state.md` |

**Why no claim:** CORPUS PRIORITY (Brad 2026-11-02T17:05) — lane 2 has dispatchable work and a live tick to
claim the free slot-1, so lane 1 takes no fleet slot. Independently, `L1-RECORD-LOCK-GUARD-1` is pre-staged
for **LONG mode (both slots, 256K)** — ~10 files across `app/` + `server/`, lifecycle DATA + engine +
handler + store + client. Taking both slots would starve the corpus outright; downgrading to parallel
(128K) would be a quality cut the 302ND/303RD measurement does not support. So: no dispatch, and no
second BEST-effort lane-1 browser gate while lane 2's reviewer occupies the vision tier.

## What the tick produced (all first-hand, verified not asserted)

1. **Anchor re-audit at af301799 — every load-bearing path in the promoted spec still resolves, and the
   two defects still reproduce.** Read at HEAD, not from the doc:
   - `server/src/store/types.ts:203` = `export interface RecordStoreConfig {` (AM-2's injection home, with
     `appendOnlyKinds` as the stated precedent) — EXISTS.
   - `LifecycleEngine.terminalStates(lifecycleId)` present as AM-1's declared-set precedent; echo of
     `terminalStates` at `LifecycleHandlers.ts:81-82` (the shape `contentLockedStates` will sit beside).
   - `RecordHandlers.ts:1138-1141` content guard (`CONTROLLED_RECORD_LOCKED`, gated on
     `controlledContent(previous) !== controlledContent(proposed)`) and `:1195` unconditional
     `updatedAt: new Date().toISOString()` injection — the measured drift cause, unchanged.
   - `RecordStoreImpl.ts:285-290` `contentLockError` + its call at `:744-745` — the store-layer mirror.
   - `LifecycleLoader.ts`, `registryOpsLifecycle.test.ts:666-676` (still the ONLY meta-schema pin, and it
     validates `registry-ops` only ⇒ AM-9 (d)(e)(f) remain mandatory), all four lifecycle YAMLs present.
   - **Defect (a) still live:** `app/src/event-editor/create/RecordEditPanel.tsx:177/195/205/215` gate Save
     only on `isSaving`/`loading`/`loadError`/`useProjection` — no lifecycle-state gate.
   - **Criterion-3 reuse target still exists:** `RecordRegistryPage.tsx:898` renders
     `'Create draft revision'` in the registry shell.
2. **RED pre-gate RE-RUN against the live lane stack** (`scripts/pregate-recordlock-1.py --expect-red`):
   `contentLockedStates` ABSENT on **7/7** lifecycle ids from the API and `disk=[]` on 7/7 YAMLs ⇒
   `expect-red: AS EXPECTED (red on 7 ids)`, rc=0, at served revision af301799. The 304TH's RED baseline is
   therefore still valid after the trunk moved (docs only), and the served build is current.
3. **Pre-staged LONG prompt re-pinned**: `prompts/coder-L1-RECORD-LOCK-GUARD-1-l1t1924-STAGED.txt` now
   names trunk `af301799` and states, with the proof command, that the product tree is byte-identical to
   `ccec9e2d` where its baselines were measured (`git diff --name-only 11338a3a..HEAD` has zero paths
   outside `.hermes/plans/`, 15 commits). No criterion, boundary or baseline was changed.
4. **Rule-2 claims-ledger freshness re-derived at HEAD af301799** (`~/.hermes/cl/lanes/1/claims-ledger.md`,
   305TH block): `11338a3a` is an ancestor, 15 commits, ZERO non-`.hermes/plans/` paths ⇒ all twelve
   quotable rows keep their verdicts/receipts; row 1 re-proved on reachability (same 3-file analysis delta,
   `cssRuleScan.ts` still ZERO non-test importers, `AnalysisPage.css` blob `c6930c66` unchanged).

5. **NEW finding → binding spec amendment AM-10 (the store half could have shipped test-only).**
   Measured at af301799: `createRecordStore(repo, validator, lintEngine, config?: RecordStoreConfig)`
   (`server/src/store/RecordStoreImpl.ts:1048-1056`) — config is OPTIONAL — and there are exactly **three
   production call sites**: `server/src/server.ts:527` (the one web path),
   `scripts/applyOwnershipDefaults.ts:282`, `scripts/migrateRecordLifecycles.ts:512`. **38** test files
   construct stores with no config at all. Consequence: a coder could wire the AM-2 resolver only into a
   hand-built test store and every pin would be green while production stayed unlocked. AM-10 now requires
   (a) one pin asserting the PRODUCTION wiring at `server.ts:527` (a fake-resolver pin is vacuous),
   (b) the two bulk-write scripts wired or declared out-of-scope with a comment, (c) the absent-config
   default explicit and commented. Written into the spec and into the pre-staged prompt.

## Due blockers checked

- **L1-PARAMS-EMITTER-RIDER — trigger STILL UNMET:** `git log -1 -- scripts/fame-gatefix/` = `136a3d27`
  @ 2026-11-02 17:09:38. No re-mint since FAME-8 closed. Not dispatchable.
- **FAME-1B-BACKFILL — Brad HOLD A-L1T229-3 standing.** No answer in any channel: the only file touched
  outside `lanes/1/` since 20:00 is lane 2's own coder prompt. Not executed, not re-asked.
- Exa tripwire: not re-run this tick (no config touched); unchanged since the 304TH's OK.

## Next actions (ordered, for the next wake)

1. Re-probe capacity FIRST. Dispatch the item with
   `python3 /home/brad/.hermes/cl/scripts/cl-coder-launch.py --lane 1 --item L1-RECORD-LOCK-GUARD-1
   --worktree /mnt/vast/home/brad/git/wt/L1-RECORD-LOCK-GUARD-1-lane1-l1t<HHMM> --prompt
   /home/brad/.hermes/cl/lanes/1/prompts/coder-L1-RECORD-LOCK-GUARD-1-l1t1924-STAGED.txt
   --log /home/brad/.hermes/cl/lanes/1/logs/coder-RECORD-LOCK-GUARD-1-l1t<HHMM>.log --mode long`
   — run it in the BACKGROUND via `systemd-run --user --collect` (tick-exit kills raw children), ONLY when
   BOTH shared slots are free and lane 2 has no dispatchable/live work; rename the prompt runstamp if the
   ts moves. Exit 75 = busy/paused, retry later.
2. On `RECORD-LOCK-GUARD-1 DONE <sha>`: review the diff + run the gates myself, then post-merge in order —
   `scripts/pregate-recordlock-1.py` (expect-green) → `scripts/probe-recordlock-2.py --live` (criterion 2,
   ordered legs; it aborts before the content-changing leg if the no-op leg drifts) → restart lane 1
   (lifecycle YAML + schema changed ⇒ `cl-lane-stack.sh 1 restart`, background=true) → browser re-gate per
   `.hermes/plans/2026-11-03_l1-record-lock-browser-regate-brief.md` with a fresh runstamp. Item stays
   in-progress until browser `VERDICT: accept` on the exact served revision.
3. Adversarial review of the coder diff is mandatory before merge (different model family); two cycles
   without progress ⇒ change approach, never waive.

## Assumptions recorded

- AS-L1T305-1: the LONG-mode choice for this item stands (measured in 302ND/303RD: ~10 files across
  app+server, `exactOptionalPropertyTypes` traps). Not re-litigated this tick, not downgraded for capacity.
- AS-L1T305-2: "byte-identical product tree" is asserted from `git diff --name-only` emptiness, i.e. no
  tracked non-docs path differs — sufficient for baseline transfer, since both bars are test suites over
  tracked source.

## 6. NEW ENVIRONMENT FINDING (MAJOR, first-hand) + the coder worktree is now PRE-WARMED

Attempting to remove the ~20-minute cold-start from the next LONG run exposed that **`cl-integration-1` is a
HYBRID checkout**: a clean `git worktree add` of the same commit CANNOT run the item's bars.

- **56 untracked symlinks** exist in the trunk worktree (42 under `server/src`, 9 under `app/src`, plus
  `server/schema`, `config.yaml`, `cl-lane-stack.sh`, and two node_modules-internal ones). They are
  **ignored** via `~/.hermes/cl/lanes/1/lane-exclude`, so they are invisible to `git status` and absent from
  any new worktree. 51 of them point into `/mnt/vast/home/brad/git/computable-lab` (Brad's main checkout).
- **4 untracked FILES** that are not symlinks also matter: `schema/core/datatypes/revision-ref.schema.yaml`,
  `schema/registry/labware-definitions/80x2ml-tube-rack.yaml`, `schema/registry/tube-sizes/tube-size-presets.v1.yaml`.
- Evidence that this is load-bearing, not cosmetic: a clean worktree at the same commit failed
  `RecordStore.test.ts` / `archivedAssignment.test.ts` / `RevisionStorage.test.ts` at **module-load**
  (`Failed to load url ../lifecycle/BypassAudit.js` — `RecordStoreImpl.ts:35` imports it) and, once the
  symlinks were mirrored, still failed `RevisionStorage.test.ts` on
  `can't resolve reference ./datatypes/revision-ref.schema.yaml`. After mirroring both classes the worktree
  reproduces the baselines exactly.

**Actions taken (all in `wt/L1-RECORD-LOCK-GUARD-1-lane1-l1t2010`, branch `cl/lane1-recordlockguard-1-l1t2010`
@ trunk a7ab041e):** mirrored the 56 symlinks to their identical targets, copied the 4 untracked schema/config
files, and mirrored the trunk's node_modules layout (`app/node_modules` copied, `server/node_modules` symlinked
to the main repo — exactly as trunk does). Scripts: `scripts/prep-worktree-recordlock-1.sh` and
`...-1b.sh`; log `worktree-prep-L1-RECORD-LOCK-GUARD-1-l1t2010.log`.

**Verified in the prepared worktree, by me, just now:**

| bar | prepared worktree | trunk baseline |
|---|---|---|
| bar 1 `writeGates + lifecycle + RecordStore` | **3 files / 62 tests PASSED** | 3 / 62 |
| bar 2 `archivedAssignment + SignatureIntegrity + RevisionStorage` | **3 files / 22 tests PASSED** | 3 / 22 |
| `tsc --noEmit -p app` error lines | **21** | 21 |

=> The next tick can dispatch with `--worktree /mnt/vast/home/brad/git/wt/L1-RECORD-LOCK-GUARD-1-lane1-l1t2010`
and skip install/checkout entirely. Two cautions carried forward: (i) the worktree is at trunk **a7ab041e**;
if trunk moves with PRODUCT changes before dispatch, re-check `git diff --name-only a7ab041e..trunk -- app
server schema`; (ii) this hybrid-checkout fact means "product tree identical" claims are about TRACKED files
only — a fresh clone or CI would fail the same two ways, which is a pre-existing lane-infrastructure defect
recorded here, NOT created by this tick and NOT in this item's scope to fix.

## 7. Tick close — capacity at exit

Both SHARED appliance-2 slot locks were **FREE** at 20:27-20:34 (lane 2's CARD-1 coder exited), but lane 2's
own orchestrator tick lives and lane 2 still carries dispatchable queue work + an active `corpus-state.md`,
so CORPUS PRIORITY (Brad 2026-11-02T17:05) still governs the next claim: **lane 1 does not take the slots
first**. No worker of mine was live at expiry; nothing to checkpoint.
