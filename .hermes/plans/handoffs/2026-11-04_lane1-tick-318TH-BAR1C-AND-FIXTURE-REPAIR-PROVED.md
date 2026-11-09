# LANE 1 TICK 318TH HANDOFF — 2026-11-04 00:20 → 00:35 EST

One line: **no lawful dispatch again (`dispatch-window-1.py` = BLOCKED-CORPUS, exit 10 at open AND close), so the
tick closed a real fail-open in the LEG-1 brief — the four suites that pin the modules leg 1 rewrites were in NO
bar — and PROVED (rather than assumed) that the two 409 fixtures' prescribed repair really produces a locked
`approved` record after the migration.**

## Reconciled first-hand

- `cl-reconcile.sh 1` @ 00:20:05: queue **todo 2 / in-progress 0 / superseded 1 / done 109**; `task-list.lock`
  FREE; **no lane-1 PAUSE, no lane-2 PAUSE**; **no lane-1 `corpus-state.md`**; **no live lane-1 worker** ⇒ nothing
  to recover, no duplicate-writer risk. Stack `:3092` = 200, `:5192` = 200.
- Shared slot-0 **HELD** by live lane-2 `L2-CHATHOST-CONSOLIDATE-1` (launcher 2965775 / child 2965777); shared
  slot-1 **FREE** with a DEAD pidfile (`CHATHOST-CONSOLIDATE-1-2583809`). Lane-2 queue **todo=5 in-progress=3**,
  `corpus-state.md` **ACTIVE** (prompt-2 SPECS-QUEUED; prompts 3-8 LOCKED) ⇒ the free slot is lane 2's first
  refusal under CORPUS PRIORITY (Brad 2026-11-02T17:05). **Lane 1 dispatched nothing.**
- Due blocker **L1-PARAMS-EMITTER-RIDER**: trigger still UNMET — `git log -1 -- scripts/fame-gatefix/` =
  `136a3d27` @ 2026-11-02 17:09:38. Not opened (unchanged for the 26th consecutive tick).
- **Exa key tripwire RAN**: OK — apiKey present and consistent across lane1/lane2/canonical.
- Trunk `cl/integration-1` arrived at **84a9def8** (the 317TH's own docs commit, plans-only) and stayed there.
  LEG-1 worktree `wt/L1-RECORD-LOCK-GUARD-1-lane1-l1t2010` is at the SAME sha 84a9def8
  (`diff bb7fea40..84a9def8` = 1 path, the 317TH handoff; `-- app server schema config scripts` = **0**).

## FINDING 1 — LEG-1 had no bar on the four suites that pin the modules it rewrites (fail-open, now closed)

Measured this tick at 84a9def8, in the LEG-1 worktree. Leg 1's file boundary contains the meta-schema, the FOUR
lifecycle YAMLs, `LifecycleEngine.ts` and `LifecycleHandlers.ts`. The brief's bars were 1 (RecordHandlers/
RecordStore), 1b (protocol-steps), 2 (archivedAssignment/SignatureIntegrity/RevisionStorage) and tsc 4/5 —
**no bar named a single suite covering the engine, the echo endpoint, or the meta-schema**. So a malformed
`contentLocked` addition, a wrong echo shape, or a `contentLocked: true` on a non-existent state id could have
shipped fully green.

Why each is load-bearing (all verified by reading the source, not inferred):

1. `server/src/governance/registryOpsLifecycle.test.ts:666-676` — *"registry-ops.lifecycle.yaml validates against
   lifecycle.meta.schema.yaml via the real Ajv validator"* — `expect(errors).toEqual([])` + `valid === true`. It
   is the **ONLY** such test in the repo, it uses ONE of the four YAMLs leg 1 edits, and `LifecycleLoader.ts:13-39`
   does **not** validate at all (the brief says so at its own line 84-86). This is the sole automatic catcher of a
   malformed meta-schema edit or a typo'd `contentLocked` target.
2. `server/src/api/handlers/LifecycleHandlers.test.ts:141+` — pins `terminalStates: string[]` on
   `GET /lifecycle/:id/transitions`: the exact echo pattern leg 1 mirrors for `contentLockedStates`.
3. `LifecycleEngine.test.ts` + `LifecycleEngine.roles.test.ts` — the module being extended (`block-contentLocked`
   scan mirroring `terminalStates()`).

APPLIED (brief only, no product code): **BAR 1c** added to
`prompts/coder-L1-RECORD-LOCK-GUARD-1-LEG1-l1t2255.txt` —
`vitest run src/lifecycle/LifecycleEngine.test.ts src/lifecycle/LifecycleEngine.roles.test.ts
src/api/handlers/LifecycleHandlers.test.ts src/governance/registryOpsLifecycle.test.ts` = **4 files / 53 tests
PASSED at 84a9def8, 2026-11-04T00:22** — with the per-suite rationale above written into the brief, and the
report checklist now requiring the `Test Files/Tests` tail of bars 1, 1b, 1c, 2 (+ tsc 4/5). No criterion,
boundary or ruling changed; a missing bar was added.

## FINDING 2 — the 317TH's prescribed fixture repair is now PROVEN sufficient, not merely plausible

The 317TH wrote the lawful repair into the brief (re-point both `lifecycleId: 'protocol-control'` fixtures at
`document-controlled-signing`, keep `state: 'approved'`) but never showed that the repaired fixture would still
be LOCKED after the migration. Verified first-hand this tick:

- `schema/core/lifecycles/document-controlled-signing.lifecycle.yaml:16-37` declares states
  `draft, in_review, approved, effective, superseded, archived` — **`approved` exists**.
- `.hermes/plans/2026-11-03_l1-record-lock-guard-1-spec.md:39-40` requires for that file exactly
  *"`contentLocked: true` on approved, effective, superseded, archived"* — the **same four** as
  `document-control`, deliberately, because omitting it "SILENTLY UNLOCKS a live surface".
- Mechanism is `state.contentLocked === true` scanned by `LifecycleEngine.contentLockedStates()`
  (spec :32-34, policy-decision :24) — **not** a `contentLockedStates:` YAML key (grep in `schema/`+`config/` = 0).

⇒ After leg 1 lands, a `document-controlled-signing` record at `state:'approved'` resolves into the declared
locked set, so `RecordHandlers.writeGates.test.ts:250` and `protocol-steps.test.ts:312` keep asserting
`409 CONTROLLED_RECORD_LOCKED` / zero writes **for the right reason**, assertions byte-identical. The repair is
sound; the erratum chain (315TH → 316TH → 317TH §2.E) is now closed end-to-end.

## Checked and NOT a gap — LEG 2

The analogous question for the client leg is whether the predicate it rewrites
(`RecordRegistryPage.tsx:558-561`) is pinned. It is: `RecordRegistryPage.test.tsx:499-516` builds an
`state: 'approved'` controlled document and asserts Save is **replaced** by the draft-revision affordance, and
that suite is already bar 3 in the LEG-2 brief. No LEG-2 change made; its md5 is unchanged
(`55a4a1d5551860838072b394f792c43a`).

## Bars re-proved at 84a9def8 (fresh, this tick, in the LEG-1 worktree)

- bar 1 `RecordHandlers.writeGates / .lifecycle / RecordStore` = **3 files / 62 tests PASSED**
- bar 1b `src/api/routes/protocol-steps.test.ts` = **1 file / 22 tests PASSED**
- bar 1c (NEW) = **4 files / 53 tests PASSED**
- bar 2 `archivedAssignment / SignatureIntegrity / RevisionStorage` = **3 files / 22 tests PASSED**
- `cd server && tsc --noEmit` = **rc 0**
- `pregate-recordlock-1.py --expect-red` = served HEAD **= trunk HEAD = 84a9def8** (served build is current),
  **RED 7/7** (disk `contentLockedStates` [] and API `ABSENT` on all seven ids) — as expected pre-leg.

PROMPT RESTAMP: `prompts/coder-L1-RECORD-LOCK-GUARD-1-LEG1-l1t2255.txt` md5
`eaa7a7a45f4e6d020adf64f2a1bb94c4` → **`67c4f3b7dc9edaf6dd186dfa88ea5bc8`** (staging sha bb7fea40 → 84a9def8;
bar 1/1b timestamps re-stamped to this tick's measurements; BAR 1c + report checklist added).

## Rule-2 ledger re-derivation at 84a9def8

Ancestors **YES ×7** (`2d3035da`, `11338a3a`, `af092157`, `1e639a65`, `b7c29951`, `8708d595`, `a7b4e809`);
`git diff --name-only d6572be6..HEAD -- . ':!.hermes/plans'` = **0**; `app/src/analysis/AnalysisPage.css` blob =
**c6930c66eabf3918ececb2df3a0f682b7e94c4da**; non-test `cssRuleScan` importers = **0**. All 12 quotable rows stand;
the `/record` lock + write-immutability row stays **UNVERIFIED-and-DEFECTIVE** until both legs land and the
browser gate passes on `:5192`.

## Not done, and why

No coder (BLOCKED-CORPUS, verified twice — 00:21 and 00:33), no spec composition (both open items are already
specced and prompted; the composer has nothing approved-and-unspecced to draft), no browser gate (no lane-1 UI
obligation exists; the single local vision slot is not lane 1's under corpus priority), no product merge, no data
write, no stack restart, no task status change (todo 2 / done 109).

## Next actions (ordered)

1. Next tick: re-run `scripts/dispatch-window-1.py`. On `DISPATCH-ELIGIBLE` (exit 0) fire **LEG 1** with
   `cl-coder-launch.py --lane 1 --item L1-RECORD-LOCK-GUARD-1 --worktree
   /mnt/vast/home/brad/git/wt/L1-RECORD-LOCK-GUARD-1-lane1-l1t2010 --prompt
   .../prompts/coder-L1-RECORD-LOCK-GUARD-1-LEG1-l1t2255.txt --mode parallel`; re-stamp report/log paths with the
   new runstamp; the bar set to expect in the report is **1, 1b, 1c, 2 + tsc 4/5**.
2. On LEG 1 `DONE`: adversarial ACCEPT → my own diff + bars 1/1b/1c/2 + server `tsc` → merge →
   `cl-lane-stack.sh 1 restart` (background) → `pregate-recordlock-1.py` expect-GREEN.
3. LEG 2: stamp leg 1's merge sha into `<leg-1-merge-sha>`, S2 scan from the worktree root expecting rc 0 with
   only the `DocumentControlBar.tsx:58-61` display hull, `probe-recordlock-2.py --live`, then browser re-gate on
   the exact served revision of `:5192`; the item stays in-progress until `VERDICT: accept`.
4. No architect erratum is owed for this item; no lane-1 spec composition is pending.
