# LANE 1 TICK 317TH HANDOFF — 2026-11-04 00:00 → 00:20 EST

One line: **no lawful dispatch again (`dispatch-window-1.py` = BLOCKED-CORPUS, exit 10 at open AND close), so
the tick closed the one architect erratum this lane still owed — the policy-copies ruling's claim that "every
existing 409 pin stays green without amendment" was FALSE for two fixtures that build a locked protocol on the
UNDECLARED id `protocol-control` — and re-proved the whole LEG-1 dispatch kit first-hand at the new trunk HEAD.**

## Reconciled first-hand

- `cl-reconcile.sh 1` @ 00:00:05: queue **todo 2 / in-progress 0 / superseded 1 / done 109**; `task-list.lock`
  FREE; no lane-1 `PAUSE`, no lane-2 `PAUSE`; **no lane-1 `corpus-state.md`**; **no live lane-1 worker** ⇒
  nothing to recover, no duplicate-writer risk. Stack `:3092` = 200, `:5192` = 200.
- `scripts/dispatch-window-1.py` @ 00:00 and again @ 00:15 → **BLOCKED-CORPUS (exit 10)** both times: shared
  slot-0 **HELD** by live lane-2 `L2-CHATHOST-CONSOLIDATE-1` (launcher 2965775 / child 2965777); shared slot-1
  FREE with a **DEAD** pidfile (`CHATHOST-CONSOLIDATE-1-2583809`); lane-2 queue **todo=5 in-progress=3**,
  `corpus-state.md` **ACTIVE** (SPECS-QUEUED) ⇒ the free slot is lane 2's first refusal under CORPUS PRIORITY
  (Brad 2026-11-02T17:05). Lane 1 dispatched nothing.
- Trunk `cl/integration-1`: 8689d2e0 → **03c420e1** on arrival and → **bb7fea40** at close (this tick's single
  docs commit). `git diff --name-only 8689d2e0..HEAD -- . ':!.hermes/plans'` = **0**; product diff
  `8708d595..HEAD -- app server schema config scripts` = **EMPTY**.
- Due blocker **L1-PARAMS-EMITTER-RIDER**: trigger still UNMET — `git log -1 -- scripts/fame-gatefix/` =
  `136a3d27` @ 2026-11-02 17:09:38. Not opened.
- **Exa key tripwire RAN this tick** (the 316TH skipped it): `exa-key-tripwire.sh` → OK, apiKey present and
  consistent across lane1/lane2/canonical.

## THE FIX — the owed erratum is now in the BINDING ruling (docs only)

The 316TH handoff carried "Architect erratum still owed (one line, no card)". It was not cosmetic: the LEG-1
brief's READ-FIRST order is ruling → brief, and the ruling told the coder the opposite of the brief.

Measured by me at 03c420e1 (fresh process, this tick):

1. `grep -rn "protocol-control" schema/ config/ server/src app/src` outside `*.test.*` = **0 hits**; the only
   hits in the tree are the two fixtures — `server/src/api/handlers/RecordHandlers.writeGates.test.ts:250` and
   `server/src/api/routes/protocol-steps.test.ts:312`.
2. Declared lifecycles = exactly the seven YAML files in `schema/core/lifecycles/`: `document-control`,
   `document-controlled-signing`, `lab-sample`, `lab-vocabulary-control`, `registry-ops`, `service-request`,
   `tyf-order`. **`protocol-control` is declared nowhere** — fixture-only id.
3. Both fixtures assert `409 CONTROLLED_RECORD_LOCKED` + zero writes on `state: 'approved'`. Post-migration the
   declared-set resolver answers `undefined` for an undeclared lifecycle and the gate fail-opens **by design
   (AM-14)** ⇒ those pins would expect 409 and get 200, reading as "the migration broke the lock".

APPLIED (docs only, no product code): `2026-11-03_l1-recordlock-policy-copies-ruling.md` §1 gains a bracketed
EXCEPTION pointing at a new **§2.E ORCHESTRATOR ERRATUM (2026-11-04)** that records the measurement, the
mechanism, and the lawful repair already written into the LEG-1 brief (re-point both fixtures at the DECLARED
`document-controlled-signing`, keep `state: 'approved'`, assertions byte-identical; never add a `protocol-control`
YAML, never special-case an undeclared id in product code). **No acceptance criterion, boundary or ruling
changed** — one false sentence corrected. Committed `bb7fea40` (1 file, +37/-2).

## Readiness re-proved at the new HEAD (fresh, not inherited)

Worktree `/mnt/vast/home/brad/git/wt/L1-RECORD-LOCK-GUARD-1-lane1-l1t2010` fast-forwarded a7b4e809 →
**bb7fea40** (docs only) so its READ-FIRST ruling now CONTAINS the erratum. Then, in that worktree:

- bar 1: `vitest run RecordHandlers.writeGates / RecordHandlers.lifecycle / RecordStore` = **62/62 PASSED**
- bar 2: `vitest run archivedAssignment / SignatureIntegrity / RevisionStorage` = **22/22 PASSED**
- bar 1b: `vitest run src/api/routes/protocol-steps.test.ts` = **22/22 PASSED** (the only pins on the route gate
  leg 1 migrates)
- `cd server && tsc --noEmit` = **rc 0**
- `s2-policy-scan.py` from the worktree root = exactly the **4 expected pre-migration hits**
  (`protocolStepEditing.ts:45`, `RecordHandlers.ts:1139`, `protocol-steps.ts:216`, `RecordStoreImpl.ts:286`)
- `pregate-recordlock-1.py --expect-red` = **RED 7/7** (`contentLockedStates` ABSENT), with served HEAD =
  trunk HEAD = 03c420e1 ⇒ the :3092 build is current and pre-leg shaped.

PROMPT RESTAMPS (`prompts/coder-L1-RECORD-LOCK-GUARD-1-LEG1-l1t2255.txt`, md5
`878ea7d0f4f083f7033eec9740cb1f62` → **`eaa7a7a45f4e6d020adf64f2a1bb94c4`**): staging sha a7b4e809 → bb7fea40;
bars 1/1b timestamps re-stamped to this tick's measurements in THIS worktree; FIXTURE TRAP now cites §2.E.
LEG-2 staged prompt **UNCHANGED** (`55a4a1d5551860838072b394f792c43a`). No criterion weakened.

## Rule-2 ledger re-derivation at 03c420e1

Ancestors YES ×7 (`2d3035da`, `11338a3a`, `af092157`, `1e639a65`, `b7c29951`, `8708d595`, `a7b4e809`);
`git diff --name-only d6572be6..HEAD -- . ':!.hermes/plans'` = **0**; `AnalysisPage.css` blob
**c6930c66eabf3918ececb2df3a0f682b7e94c4da**; non-test `cssRuleScan` importers = **0**. All 12 quotable rows
stand; the `/record` lock + write-immutability row stays **UNVERIFIED-and-DEFECTIVE** until both legs land.

## Not done, and why

No coder (BLOCKED-CORPUS, verified twice), no spec composition (both open items are already specced and
prompted), no browser gate (no lane-1 UI obligation exists outside this item's own repair, and the single local
vision slot is not lane 1's under corpus priority), no product merge, no data write, no stack restart, no task
status change (todo 2 / done 109).

## Next actions (ordered)

1. Next tick: re-run `scripts/dispatch-window-1.py`. On `DISPATCH-ELIGIBLE` (exit 0) fire **LEG 1** with
   `cl-coder-launch.py --lane 1 --item L1-RECORD-LOCK-GUARD-1 --worktree
   /mnt/vast/home/brad/git/wt/L1-RECORD-LOCK-GUARD-1-lane1-l1t2010 --prompt
   .../prompts/coder-L1-RECORD-LOCK-GUARD-1-LEG1-l1t2255.txt --mode parallel`; re-stamp the report/log paths with
   the new runstamp and re-rewrite the "measured by me" lines at dispatch only if the product tree moved.
2. On LEG 1 `DONE`: adversarial ACCEPT → my own diff + bars 1/1b/2 + server `tsc` → merge →
   `cl-lane-stack.sh 1 restart` (background) → `pregate-recordlock-1.py` expect-GREEN.
3. LEG 2: stamp leg 1's merge sha into `<leg-1-merge-sha>`, S2 scan from the worktree root expecting rc 0 with
   only the `DocumentControlBar.tsx:58-61` display hull, `probe-recordlock-2.py --live`, then browser re-gate on
   the exact served revision of `:5192`; item stays in-progress until `VERDICT: accept`.
4. No architect erratum remains owed for this item (closed by §2.E this tick).
