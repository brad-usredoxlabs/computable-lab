# LANE 1 TICK 316TH HANDOFF — 2026-11-03 23:40 → 23:5x EST

One line: **no lawful dispatch again (`dispatch-window-1.py` = BLOCKED-CORPUS, exit 10), so the tick closed a
fail-open in the LEG-1 brief: it pinned the MECHANISM of the /record defect through the code path — the
handler's unconditional `payload.updatedAt` stamp versus `controlledContent()`'s deletion of it — which proves a
store no-op built on raw payload equality can never fire from the real editor and would ship a green leg with
the defect intact.**

## Reconciled first-hand

- `cl-reconcile.sh 1` @ 23:40:04: queue **todo 2 / in-progress 0 / superseded 1 / done 109**; `task-list.lock`
  FREE; no lane-1 `PAUSE`, no lane-2 `PAUSE`; **no lane-1 `corpus-state.md`**; **no live lane-1 worker** ⇒ nothing
  to recover, no duplicate-writer risk. Stack `:3092` = 200, `:5192` = 200.
- `scripts/dispatch-window-1.py` @ 23:40 and again at close (23:5x) → **BLOCKED-CORPUS (exit 10)**: shared
  slot-0 **HELD** by live lane-2 `L2-CLARIFY-CARD-1` (launcher 2865802 / child 2865804, claimed 04:04:33Z, etime
  35m at open); shared slot-1 FREE with a **DEAD** pidfile (`CHATHOST-CONSOLIDATE-1-2583809`); lane-2 queue
  **todo=5 in-progress=3**, `corpus-state.md` **ACTIVE** (prompt-2 SPECS-QUEUED) ⇒ the free slot is lane 2's first
  refusal under CORPUS PRIORITY (Brad 2026-11-02T17:05). Lane 1 dispatched nothing.
- Trunk `cl/integration-1`: d6572be6 → **8689d2e0**, and the only path in that range is the 315TH handoff
  (`git diff --name-only d6572be6..HEAD -- . ':!.hermes/plans'` = **0**). No product drift since the 315TH bars.
- Due blocker **L1-PARAMS-EMITTER-RIDER**: trigger still UNMET — `git log -1 -- scripts/fame-gatefix/` =
  `136a3d27` @ 2026-11-02 17:09:38. Nothing to do, correctly not opened.

## THE FINDING — why the no-op must be built on `controlledContent()`, not payload equality

Measured first-hand in the trunk checkout at 8689d2e0 (read, not inferred):

1. `server/src/api/handlers/RecordHandlers.ts:1206-1216` — every non-inventory save is stamped:
   `{...payloadObj, updatedAt: new Date().toISOString()}`. It is UNCONDITIONAL; a no-edit Save gets a fresh stamp.
2. `server/src/revisions/RecordRevisionService.ts:32` — `controlledContent()` deletes
   `state, createdAt, createdBy, updatedAt` before canonicalising.
3. Therefore a no-edit Save is content-EQUAL: the handler lock (`RecordHandlers.ts:1139`) and the store lock
   (`RecordStoreImpl.ts:286`) both PASS it, the write proceeds, the YAML bytes differ by that stamp alone, and
   `meta.contentSha` — which is the **file blob sha** (`RecordStoreImpl.ts:354/380/506`) — changes. That is
   precisely the L1-EDITOR-QMS-REGATE-1 defect (16db862a.. → 1cd98318..), now explained by code path.
4. Corollary that was NOT written down anywhere: a store short-circuit keyed on `JSON.stringify`/deep equality of
   the whole payload can NEVER fire from the real `/record` path (updatedAt always differs), so LEG 1 could go
   green while the defect survives. AM-6(a) alone ("contentSha unchanged") is also weak on its own because
   today's code already returns 200 — the pin must prove no write happened.

Also measured: `version` is **not** stripped by `controlledContent`, so a version bump is content-DIFFERENT and
correctly 409s on a locked record — no behavior change expected, and a caller that needs a legitimate locked
write is a `BLOCKED requires-rescope`, not a reason to widen the predicate.

## APPLIED (staged prompt only — no product code, no dispatch)

`prompts/coder-L1-RECORD-LOCK-GUARD-1-LEG1-l1t2255.txt` gains a **"WHY THE NO-OP IS THE ITEM — mechanism"**
section before `## Scope`, which (a) states the mechanism above with file:line, (b) forbids raw/deep/stringify
equality for the no-op predicate, (c) restates AM-6(a) as **three** assertions — `meta.contentSha` unchanged,
the RETURNED `payload.updatedAt` unchanged (the stored one, not the incoming stamp), and the adapter write
attempted **0 times** (spy count or data-repo commit count), (d) forbids moving/removing the handler's
`:1205-1216` stamp, and (e) records the `version` fact.

- md5 `e105cdf7597e8a3d9c25c44cd0bd282b` → **`878ea7d0f4f083f7033eec9740cb1f62`**
- LEG-2 staged prompt UNCHANGED: `55a4a1d5551860838072b394f792c43a`
- No acceptance criterion weakened, no boundary changed, no new scope. Coverage and pin strength only.

## Readiness re-proved at 8689d2e0 (not inherited)

`git diff --name-only a7b4e809..HEAD -- app server schema config scripts` = **EMPTY**; `pregate-recordlock-1.py
--expect-red` = **RED on 7/7** lifecycles (`contentLockedStates` ABSENT); `GET :3092/api/lifecycle/
document-control/transitions` = **200** without the field (served build current, pre-leg shape confirmed).

## Rule-2 ledger re-derivation at 8689d2e0

Ancestors YES ×7 (`2d3035da`, `11338a3a`, `af092157`, `1e639a65`, `b7c29951`, `8708d595`, `a7b4e809`);
non-`.hermes/plans/` paths in `d6572be6..HEAD` = **0**; `app/src/analysis/AnalysisPage.css` blob
**c6930c66eabf3918ececb2df3a0f682b7e94c4da**; non-test `cssRuleScan` importers = **0**. All 12 quotable rows
stand; the `/record` lock + write-immutability row stays **UNVERIFIED-and-DEFECTIVE** until both legs land.

## Not done, and why

No coder (BLOCKED-CORPUS, verified twice), no spec composition (both open items are already specced and
prompted), no browser gate (no lane-1 UI obligation exists that is not this item's own repair; and the local
vision slot is not lane 1's under corpus priority), no product merge, no data write, no stack restart, no task
status change. **Exa tripwire not re-run this tick** — no key-touching action was taken; flagged here as an
assumption rather than a silent omission.

## Next actions (ordered)

1. Next tick: re-run `scripts/dispatch-window-1.py`. On `DISPATCH-ELIGIBLE` (exit 0) fire **LEG 1** with
   `cl-coder-launch.py --lane 1 --item L1-RECORD-LOCK-GUARD-1 --worktree
   /mnt/vast/home/brad/git/wt/L1-RECORD-LOCK-GUARD-1-lane1-l1t2010 --prompt
   .../prompts/coder-L1-RECORD-LOCK-GUARD-1-LEG1-l1t2255.txt --mode parallel` — re-stamp the report/log paths
   with the new runstamp and re-rewrite the "measured by me <time>" lines (bars 1/1b/2) at dispatch.
2. On LEG 1 `DONE`: adversarial ACCEPT → my own diff + bars 1/1b/2 + server `tsc` → merge → `cl-lane-stack.sh 1
   restart` (background) → `pregate-recordlock-1.py` expect-GREEN.
3. LEG 2: stamp leg 1's merge sha into `<leg-1-merge-sha>`, S2 scan from the worktree root expecting rc 0 with
   only the `DocumentControlBar.tsx:58-61` display hull, `probe-recordlock-2.py --live`, then browser re-gate on
   the exact served revision of `:5192`; item stays in-progress until `VERDICT: accept`.
4. Architect erratum still owed (one line, no card): the policy-copies ruling's "every existing 409 pin stays
   green without amendment" needs the two `protocol-control` fixtures added to its caveat list.
