# LANE 1 TICK 272ND HANDOFF — 2026-11-03 05:00 → 05:15 EST

One line: **no coder could launch** — lane 2 holds slot-1 with a LIVE coder and lane 2 measured on 04:58 that the
engine serves **one coder at a time**, which the 60-min stagger window cannot express — so I fixed the thing that
would have killed the next launch: **both lane-1 coder launchers now carry a SERIAL GUARD** (any live slot pid ⇒
`SERIAL-BLOCKED`, exit 7), verified by sandbox dry runs. Nothing merged, nothing accepted, no product file touched.

## Reconciled first-hand

1. `cl-reconcile.sh 1` (05:00:48): todo **3**, in-progress **1** (`L1-PIN-HARDEN-1`), superseded 1, done 106;
   trunk `cl/integration-1` @ **cf4275df**; `:3092` + `:5192` both http 200; queue lock free; lane not paused;
   **no live lane-1 worker**.
2. Slots: **slot-0 FREE** (its 04:34:58 pid file `L1-PIN-HARDEN-1-466887-…` holds a **DEAD** pid),
   **slot-1 HELD** by lane 2's `CHATHOST-CONSOLIDATE-1` (pid **439409**, alive, started **04:22:13**) — read from
   `fuser` + the pid file, not from reconcile's summary.
3. `L1-PIN-HARDEN-1` worktree `/mnt/vast/home/brad/git/wt/l1-pin-harden-1-lane1` **CLEAN at `b2b59fdf`**, 0 dirty
   paths ⇒ the 04:34:58 run that was stopped at 04:36:40 wrote nothing (confirmed, not assumed). No report, no marker.
   No live owner ⇒ no duplicate dispatch.
4. **Trunk moved, code did not**: `git diff --name-only 1a443259 cf4275df` = 9 paths, all under `.hermes/plans/`
   (specs + handoffs 267TH–271ST); `git merge-base --is-ancestor 1a443259 cf4275df` = **yes**. So BOTH pre-built
   worktrees (`l1-pin-harden-1-lane1`, `l1-cellrender-1-lane1`, base `1a443259`) remain dispatch-ready with **no
   trunk merge required** — this corrects nothing in the 271ST handoff but re-proves it at a new trunk.
5. `corpus-state.md` **absent** in lane 1 ⇒ CORPUS LOOP (SOUL step 10) skipped; lane 2 owns that campaign.
6. `L1-CELLRENDER-1` evidence debt re-verified first-hand at trunk: `app/src/analysis/ViewRenderer.tsx:93` is still
   `return String(value ?? '')` — the `[object Object]` defect is real and untouched.

## Why no coder

- **New measured fleet fact (lane 2, 04:58:00, `stagger-trial.log`)**: both coder deaths were engine HTTP 503
  `request queue timeout`, not client admission. One 32,768-output-token coder turn holds the engine's **single**
  decode slot **2m50s–3m50s** while `--pending-timeout-ms` is **unset** (~30 s), so a second in-flight long-context
  coder 503s → 3 client retries → death. Evidence:
  `cl-integration-2/.hermes/plans/2026-11-03_0500-L2-appliance2-coder-serialization-evidence.md`. Lane 2 now enforces
  **one coder session at a time fleet-wide** in its launchers (serial guard, proven live rc=7).
- Slot-1 is that live lane-2 coder. Under the serial rule **and** corpus priority (Brad 2026-11-02T17:05) lane 1
  does not launch. The 04:34:00 freeze line would also still refuse until **05:34** — but the freeze expiry alone is
  no longer the launch condition (see AS-L1T272-2).
- Engine-side remedy (`--pending-timeout-ms 300000` and/or `--default-max-tokens <32768` on `ninfer-serve.service`)
  is **available but not applied** — engine owner / Brad's call. Nobody in lane 1 touched the engine.

## Harness repair — the real defect this tick

The 271ST tick made the stagger **window** data-driven, but a 60-min window is still blind to the measured
one-decode-slot reality: a peer coder **70 min old passes a 60-min gate and still kills the new run**. Both lane-1
launchers therefore gained, in the outer shell (section `1a2`, immediately after the freeze gate and before the
window check):

- `SERIAL GUARD` — for each `appliance2-coder-slot-*.pid`, extract the PID with the launcher's existing
  ISO-anchored awk parser (the first-numeric-field rule mis-reads `…-RECORDS-1-…`) and if `kill -0` succeeds,
  log `SERIAL-BLOCKED <ts> live-coder <pidfile>=<contents>` and `exit 7`.

Files: `launchers/launch-L1-PIN-HARDEN-1-fix2-l1t0500.sh`, `launchers/launch-L1-CELLRENDER-1-l1t0057.sh`.

Verification — **real runs, not code reading**:

| check | result |
|---|---|
| `bash -n` both launchers | OK |
| sandbox: LIVE peer (lane 2's real pid 439409) + pid file mtime **2 h old** — the exact case a 60-min window passes | `SERIAL-BLOCKED …` → **exit 7** |
| sandbox: same pid file, pid **999999** (dead), pre-existing pgrep fresh-coder check neutralized | **exit 0** — `LOCK-ACQUIRED slot=0`, stubbed hermes ran, `CODER-EXITED rc=0` |
| sandbox: no pid files at all | **exit 0**, full launch path |
| sandbox: live peer again, pgrep check neutralized | **exit 7** (guard fires on its own) |
| real fleet dry run, both launchers | **exit 3** at the FREEZE gate (revert line age 1767 s), no launch |
| side effects | none: no real slot taken, real pid files byte-identical (`slot-0` 04:34, `slot-1` 04:22), slot-0 lock had **no holders**, sandbox in `/tmp` and deleted |

## State at checkpoint (05:15)

- `L1-PIN-HARDEN-1`: **in-progress**, worktree CLEAN at `b2b59fdf`, fix run 2 **ARMED** — prompt
  `prompts/coder-L1-PIN-HARDEN-1-fix2-l1t0500.txt` (6 928 B, architect DECISION A verbatim) and targeted re-probe
  `prompts/reprobe-L1-PIN-HARDEN-1-fix2-l1t0500.txt` (5 675 B, OpenRouter, no coder slot) both present. No merge,
  no acceptance.
- `L1-CELLRENDER-1`: **todo**, DISPATCH-READY, launcher now serial-guarded + freeze-gated + window-correct.
- `L1-PARAMS-EMITTER-RIDER`: todo, rider-triggered only — never dispatched on its own.
  `FAME-1B-BACKFILL`: Brad-held, not re-asked.
- Stack `:3092`/`:5192` untouched (no YAML changed, no restart needed). `stagger-trial.log` gained exactly **one**
  narrative line (the harness repair); **no** launch line and **no** verdict line — correct, since neither happened.
  No new `request_queue_timeout` death caused by lane 1, no >200K payload: the 60-min window stays in force.

## assumptions

- **AS-L1T272-1** (the serial guard is mine to add): lane tooling only — no product file, spec, schema or acceptance
  criterion touched. It is *stricter* than SOUL's two-slot semaphore, encoding lane 2's measured 04:58 finding.
  debt: false.
- **AS-L1T272-2** (freeze expiry ≠ permission to launch): the next tick must also require no live peer coder;
  the launchers now enforce that mechanically. debt: false.
- AS-L1T271-1..3, AS-L1T270-1..4, AS-L1T269-1..4 and all earlier entries CARRY FORWARD unchanged.

## evidence debt

- **OPEN (advanced)**: nesting evasion → `L1-PIN-HARDEN-1`. One shape (bare nested `td`/`th`, incl. at-rule-wrapped
  and parent-list forms) plus D2/D3 remain; cleared only when fix run 2's merged scanner flags the architect's full
  fixture set AND the targeted re-probe accepts.
- **OPEN (re-verified this tick)**: object cell `[object Object]` → `L1-CELLRENDER-1`; `ViewRenderer.tsx:93` still
  `String(value ?? '')` at trunk `cf4275df`.
- **OPEN, rider-triggered**: `assignment-contested-entry.py:709` publishes a dict behind a declared `type: string`
  column → `L1-PARAMS-EMITTER-RIDER` (mandatory in the next `scripts/fame-gatefix/` re-mint).
- **CARRIED, unchanged**: the `.view-spec__cell-item` substring carve-out (in fix-2 scope per architect D3); the
  PIN-HARDEN spec's "@media/@supports/@layer" sentence vs the two `@container` blocks at `AnalysisPage.css:219/:222`;
  worktree-vs-trunk tsc divergence (12 vs 21); artifact-table column-type validation is a FUTURE CAMPAIGN by ruling;
  `tsx --watch` unusable on this NFS checkout; FAME-8 D2 x-tick clipping; O1 run-parameter label vs CHEBI:143577;
  flag-format test-pin candidate; gate-2 observations 1–7; markerSaturationFlags; advc-c2 O1–O4; advc2 O3/O4;
  palmitate-walk OQ-1; FAME-6 S2 narrative; intake pile O-1..O-5; W7b honesty flags; AS-L1T223-1 band note;
  AS-L1T238-4 revision-lineage; GCM-DEMO-AOAC-FAME; FL1; FAME-1B-BACKFILL Brad-held; gate-observations 1–6 routing;
  ANREV entryScript tracked-fixture note; the 4165 px table-height trade-off.
- **Brad's morning digest should carry**: the fleet is now **one coder at a time** by measurement, not by policy
  preference — the engine's `--pending-timeout-ms` is unset, so a second long-context coder dies in ~3 retries.
  Lane 1's launchers now refuse mechanically. The one-line engine fix (`--pending-timeout-ms 300000` and/or
  `--default-max-tokens <32768`) would restore safe two-slot concurrency and is his / the engine owner's call.
  The CSS-nesting pin hole is still open pending the ONE architect-authorized final fix cycle.

## Next-tick checks (priority)

1. `cl-reconcile.sh 1`; read this handoff. Expected: todo 3, in-progress 1, done 106, trunk `cf4275df` + this commit.
2. **Lane 2 first** (corpus priority). Do not launch a lane-1 coder while any lane-2 coder is alive — the launchers
   now enforce it (`exit 7`), so a launch attempt is cheap and safe, but the tick should not spend the decision twice.
3. Fire fix run 2 only when the gates allow:
   `systemd-run --user --collect --unit=cl-l1-coder-pinharden1-fix2-l1t0500 /home/brad/.hermes/cl/lanes/1/launchers/launch-L1-PIN-HARDEN-1-fix2-l1t0500.sh`
   (no `-t`; exit 3 = freeze/window gated, **exit 7 = serial-blocked**, exit 9 = no slot).
4. On fix-2 exit: read `deliverables/l1-pin-harden-1-report-fix2-l1t0500.md` + the log, then fire the **targeted
   re-probe ONLY** (`launchers/reprobe-L1-PIN-HARDEN-1-fix2-l1t0500.sh`). **PASS** → my own verify →
   `git -c core.fileMode=false merge --no-ff cl/lane1-pin-harden-1-l1t0020` → done. **FAIL** → FREEZE + Brad card with
   the decision file, both advc reports and the fix-2 receipts. No fourth cycle.
5. Then `L1-CELLRENDER-1` (dispatch-ready, serial-guarded); browser gate on `:5192`/`:3092` with AOUT-000100 /
   AOUT-000136 plus the `analyte_summary` regression leg.
6. `L1-PARAMS-EMITTER-RIDER` must NOT be dispatched on its own; `FAME-1B-BACKFILL` stays Brad-held.
