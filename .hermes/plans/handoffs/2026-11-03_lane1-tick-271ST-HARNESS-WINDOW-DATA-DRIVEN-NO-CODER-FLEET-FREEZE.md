# LANE 1 TICK 271ST HANDOFF — 2026-11-03 04:40 → 04:50 EST

One line: **no coder could launch** (fleet freeze + the reverted 60-min window + lane-2 corpus priority), so I spent
the tick on the thing that was actually broken — **both lane-1 coder launchers hardcoded a 10-min stagger** that
would have launched straight through the reverted 60-min fleet window. The window is now read from
`stagger-trial.log` as data, the cellrender launcher gained the freeze gate it lacked, and both were verified by
dry run. Nothing merged, nothing accepted, no product file touched.

## Reconciled first-hand

1. `cl-reconcile.sh 1` (04:40:46): todo **3**, in-progress **1** (`L1-PIN-HARDEN-1`), superseded 1, done 106;
   trunk `cl/integration-1` @ **f4b7e071**; `:3092` + `:5192` both http 200; queue lock free; lane not paused.
2. Read the 270TH handoff in full (including its addendum — the 04:34:58 launch-then-stop deviation). Its expected
   shape matched reality: worktree `/mnt/vast/home/brad/git/wt/l1-pin-harden-1-lane1` **CLEAN at `b2b59fdf`**,
   `git status --porcelain` 0 lines, no marker, no report for fix-2 (the stopped run wrote nothing — confirmed, not
   assumed). No live owner ⇒ no duplicate dispatch.
3. `corpus-state.md` **absent** in lane 1 ⇒ CORPUS LOOP (SOUL step 10) skipped; lane 2 owns that campaign.
4. `exa-key-tripwire.sh` → `OK: exa apiKey present and consistent across lane1/lane2/canonical`.
5. **Trunk moved, code did not**: `git diff --name-only 1a443259 f4b7e071` = the four `.hermes/plans` files only;
   `git diff --stat 1a443259 f4b7e071 -- app/src/analysis app/src/schema schema/ui/view-spec.schema.yaml` = EMPTY,
   and `1a443259` is an ancestor of `f4b7e071`. So **both** worktrees (`l1-pin-harden-1-lane1`, base `1a443259`;
   `l1-cellrender-1-lane1`, base `1a443259`) remain dispatch-ready with **no trunk merge required**.
6. Slots read directly (`fuser` + pid files), not from reconcile's blind spot: slot-0 **FREE** (lane 2's
   `L2-CLARIFY-TARGET-1` died of an admission timeout at 04:31:28), slot-1 **HELD** by lane 2's
   `CHATHOST-CONSOLIDATE-1` (fuser 439408/439409/439414, started 04:22:13). No live lane-1 worker anywhere.

## Why no launch

- `stagger-trial.log` newest window line is the **04:34:00 fleet revert** (`10min -> 60min`, "no further coder
  launches this tick"). The fix-2 launcher's FLEET-FREEZE-GATE refuses while that line is <60 min old
  (expires **05:34**). I verified the refusal by dry run rather than by reading the code: exit **3**,
  `FLEET-FREEZE-WAIT … revert-line age=526s (<3600) — no launch`.
- Even without the freeze gate the fleet window is 60 min, and lane 2's other coder started 04:22:13 ⇒ earliest
  legitimate second launch ≈**05:22**; and lane 2's next action after its death is a **TARGET-1 re-dispatch**, so
  under corpus priority (Brad 2026-11-02T17:05) lane 2 gets first refusal on any free slot.

## Harness repair (lane tooling, not product) — the real defect this tick

Both lane-1 coder launchers carried `STAGGER_SECS=600` as a constant. Under the reverted window that is unsafe: a
launch 10 min after the other coder's start passes a 600 s gate but violates a 3600 s window. Fix, in both
`launchers/launch-L1-PIN-HARDEN-1-fix2-l1t0500.sh` and `launchers/launch-L1-CELLRENDER-1-l1t0057.sh`:

- the stagger window is **read from `stagger-trial.log`** (newest `FLEET STAGGER WINDOW (REVERTED|RESTORED)` line;
  `REVERTED` ⇒ 3600 s, else Brad's 600 s) and the derived value is logged every run
  (`STAGGER-WINDOW … secs=3600 from='…'`) so the decision is visible in the transcript;
- the cellrender launcher gained the **FLEET-FREEZE-GATE** it was missing (parity with the pin-harden launcher).

Verification (real runs, not code reading):

| check | result |
|---|---|
| `bash -n` both launchers | OK |
| dry run against the REAL trial log | both exit **3**, `FLEET-FREEZE-WAIT … age=526s (<3600)` |
| sandboxed fixture, revert line 2 h old | `STAGGER-WINDOW secs=3600` derived from the line |
| sandbox: live coder pid file 20 min old | **STAGGER-WAIT exit 3** — this WOULD have passed at 600 s |
| sandbox: same coder 70 min old | gates open → `LOCK-ACQUIRED slot=0` → dry hermes ran → exit 0 |
| side effects | none: no launch, no real slot taken, `stagger-trial.log` unmodified, sandbox in `/tmp` and deleted |

## Pre-staged artefacts re-audited (they are what the next tick fires)

- `prompts/coder-L1-PIN-HARDEN-1-fix2-l1t0500.txt` (6 928 B): STEP 0 state check, D1 (compose non-`&` nested head
  as `parent + " " + head`, distribute over a parent selector list, composition only when the parent is a style
  rule, full parent chain always retained), D2 (battery path), D3 (token-boundary carve-out, both directions),
  binding docstring wording, unique report path. Matches the architect's DECISION A verbatim in scope.
- `prompts/reprobe-L1-PIN-HARDEN-1-fix2-l1t0500.txt` (5 675 B) + launcher (profile `cl-adversarial-reviewer`,
  OpenRouter — **no coder slot, no freeze dependence**): the decision's ordered checklist — state, the 11 required
  D1 fixtures via the pin's OWN `sourceViolations`, ≥8 self-invented attack shapes, the `&`-controls, the
  no-false-positive set, shipped `AnalysisPage.css` must stay `[]`, D2 path existence, D3 both directions, wording
  grep, vitest/tsc/diff/CSS-blob bars, and the `it(`/`expect(` weakening check. No amendment needed.

## State at checkpoint (04:50)

- `L1-PIN-HARDEN-1`: **in-progress**, worktree CLEAN at `b2b59fdf`, fix run 2 **ARMED and now window-correct**.
  No merge, no acceptance.
- `L1-CELLRENDER-1`: **todo**, DISPATCH-READY (base `1a443259` still byte-identical to trunk for
  `app/src/analysis` + `schema/ui`), launcher now freeze-gated + window-correct.
- `L1-PARAMS-EMITTER-RIDER`: todo, rider-triggered only — never dispatched on its own. `FAME-1B-BACKFILL`:
  Brad-held, not re-asked.
- Stack `:3092`/`:5192` untouched (no YAML changed, no restart needed). `stagger-trial.log` gained **no** lines
  (no launch, no verdict — correct). No new `request_queue_timeout` death, no >200K payload this tick; the 60-min
  window stays in force and is now enforced mechanically by both launchers.

## assumptions

- **AS-L1T271-1** (the launchers are lane tooling ⇒ mine to repair): no product file, spec, schema or acceptance
  criterion was touched; only launch mechanics. debt: false.
- **AS-L1T271-2** (the 05:34 freeze expiry is my mechanical encoding): 60 min from lane 2's 04:34:00 revert line,
  which is STRICTER than SOUL's window rule alone (that alone would allow ≈05:22, or earlier if lane 2's coder
  exits). Conservative by design for one hour; the next tick can read the window line itself and decide. debt: false.
- **AS-L1T271-3** (no launch was legitimate this tick): from slot truth + the freeze line + corpus priority, all
  read first-hand. debt: false.
- AS-L1T270-1..4, AS-L1T269-1..4 and all earlier entries CARRY FORWARD unchanged.

## evidence debt

- **OPEN (advanced, unchanged)**: nesting evasion → `L1-PIN-HARDEN-1`. Cycle 1's two shapes closed and verified by
  me; **one shape remains** (bare nested `td`/`th`, incl. at-rule-wrapped and parent-list forms) plus D2/D3.
  Cleared only when fix run 2's merged scanner flags the architect's full fixture set AND the targeted re-probe
  accepts.
- **OPEN (re-verified this tick)**: object cell `[object Object]` → `L1-CELLRENDER-1` (todo, spec'd, worktree
  pre-built; `ViewRenderer.tsx:93` still `String(value ?? '')` at base `1a443259`). Cleared when its merged
  renderer + browser leg show a readable `params` cell.
- **OPEN, rider-triggered**: `assignment-contested-entry.py:709` publishes a dict behind a declared `type: string`
  column → `L1-PARAMS-EMITTER-RIDER` (mandatory in the next `scripts/fame-gatefix/` re-mint; must not open its own
  cycle).
- **CARRIED, unchanged**: the `.view-spec__cell-item` substring carve-out (in scope for fix run 2 per architect D3);
  the PIN-HARDEN spec's "@media/@supports/@layer" sentence vs the two `@container` blocks at
  `AnalysisPage.css:219/:222`; worktree-vs-trunk tsc divergence (12 vs 21); artifact-table column-type validation is
  a FUTURE CAMPAIGN by ruling; `tsx --watch` unusable on this NFS checkout; FAME-8 D2 x-tick clipping; O1
  run-parameter label vs CHEBI:143577; flag-format test-pin candidate; gate-2 observations 1–7;
  markerSaturationFlags; advc-c2 O1–O4 close-out notes; advc2 O3/O4; palmitate-walk OQ-1; FAME-6 S2 narrative;
  intake pile O-1..O-5; W7b honesty flags; AS-L1T223-1 band note; AS-L1T238-4 revision-lineage; GCM-DEMO-AOAC-FAME;
  FL1; FAME-1B-BACKFILL Brad-held; gate-observations 1–6 routing; ANREV entryScript tracked-fixture note; the
  4165 px table-height trade-off.
- **Brad's morning digest should carry**: the fleet reverted to a 60-min coder window after a second admission
  timeout death (lane 2's TARGET-1, 86 min, WIP `a6a71bcb`). Lane 1's two launchers would have kept launching on the
  old 10-min assumption — that is now impossible, the window is data. The CSS-nesting pin hole is still open pending
  the ONE architect-authorized final fix cycle; if it fails, the item freezes and comes to him.

## Next-tick checks (priority)

1. `cl-reconcile.sh 1`; read this handoff. Expected: todo 3, in-progress 1, done 106, trunk `f4b7e071` + this commit.
2. **Lane 2 first** (corpus priority). If a lane-2 coder-ready item (TARGET-1 re-dispatch) is waiting on a free slot,
   lane 1 does not claim it.
3. Fire fix run 2 only when the gates allow it — the launcher now self-gates on the freeze line AND the window:
   `systemd-run --user --collect --unit=cl-l1-coder-pinharden1-fix2-l1t0500 /home/brad/.hermes/cl/lanes/1/launchers/launch-L1-PIN-HARDEN-1-fix2-l1t0500.sh`
   (no `-t`; exit 3 = gated, exit 9 = no slot).
4. On fix-2 exit: read `deliverables/l1-pin-harden-1-report-fix2-l1t0500.md` + the log, then fire the **targeted
   re-probe ONLY** (`launchers/reprobe-L1-PIN-HARDEN-1-fix2-l1t0500.sh`, unit
   `cl-l1-reprobe-pinharden1-fix2`). **PASS** → my own verify → `git -c core.fileMode=false merge --no-ff
   cl/lane1-pin-harden-1-l1t0020` → done. **FAIL** → FREEZE + Brad card with the decision file, both advc reports
   and the fix-2 receipts. No fourth cycle.
5. Then `L1-CELLRENDER-1` (dispatch-ready, launcher window-correct); it needs the browser gate on `:5192`/`:3092`
   with AOUT-000100 / AOUT-000136 plus the `analyte_summary` regression leg.
6. `L1-PARAMS-EMITTER-RIDER` must NOT be dispatched on its own; `FAME-1B-BACKFILL` stays Brad-held.
