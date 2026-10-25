# Handoff — lane 1 tick 2026-10-18 06:00 → 06:20 EDT (REG-2 gate VERDICT: fix — D1 real defect + D2 ruled plan mis-spec; FIX1 queued; REG-4 still fleet-queued)

Author: orchestrator cron tick — lane 1. :3001/:5174 never touched. All git via -c core.fileMode=false.

## What happened (first-hand)

1. RECONCILE at tick start: REG-2 browser gate LIVE and producing (tier-2 openrouter
   reviewer pid 2056294, receipts growing, trail.json 91 steps when first inspected).
   REG-4 coder QUEUED: fleet lock is held by lane-2's UCX-2 coder (pid 2033121,
   launch-coder-ucx2-l2t0400.sh, healthy at 30 min) — REG-4's queue wrapper 2038704 +
   flock 2038770 correctly in QUEUE-WAIT, FIFO respected. No Brad answers (decisions/
   md5 sweep: 1f41d88..., dcc0338... unchanged; silence != approval, not re-asked).

2. WAITED IN-TICK for the gate: it rendered a REAL VERDICT at 06:05 — VERDICT: fix,
   receipts/REG-2/20261018T094027Z/ (trail 93 steps 0-fail, checks.json, report.md,
   13 md5-distinct PNGs, md5s.txt; pre-flight candidate-check.txt proves served HEAD was
   pinned 0ddbe20b + railResizable x4 in the served module; mid-run trunk movement to
   ee0338f7 is docs-only, reviewer disclosed it, served code byte-identical). Read the
   full report myself.

3. D1 (REAL DEFECT, coder-fixable): restore-on-mount clamps the rail width against a
   PRE-SETTLE body rect (body settles 574.47 -> 549.5 -> 637px in ~50ms; per-frame
   sampler shows the applied 229.7875px == 0.4 x 574.46875). Stored 255 -> restored
   229.8 (criterion +/-2px); second repro stored 230 -> 219.9. Fix direction: re-clamp on
   settled layout (ResizeObserver), keep persisted value authoritative; plus O1 guard:
   a press+release with no movement must not persist a pointer-derived width
   (rendered 320 / stored 347 observed).

4. D2 (PLAN MIS-SPEC, ruled by ME as plan owner, AS-ORCH-L1-179): the verbatim criterion
   "at 1600px viewport .taptab-editor-container width > 900" is arithmetically
   unreachable on /registry — the registry's own 320px list column + rail >=220px + pane
   chrome leave <=~792px (measured widest user-reachable 792px). The gate PROVED the
   mechanism itself works (computed max-width none; 792 renders where the 720 cap would
   bind). Precedent EDITOR-1 "exit 0" reword. Amended binding criterion for the re-gate:
   default-layout computed max-width == none AND widest-reachable >= 720 with trail
   numbers. The coder is explicitly told D2 is NOT their defect.

5. FIX1 QUEUED (fleet FIFO): contract
   .hermes/plans/2026-10-18_REG-2-fix1-gate-defects.md (RED-first tests for settle-clamp
   + no-move-press persist guard, DocumentShell 25/25 + tsc 23-comm-empty gates, end-line
   REG2-FIX1 DONE). queue-reg2-fix1.sh wrapper pid 2145417 (queue proc 2145477, log
   logs/coder-REG-2-fix1-l1t0635.log QUEUE-WAIT since 06:16), report
   reg2-fix1-report-l1t0635.md, prompt prompts/coder-REG-2-fix1-l1t0635.txt. Adv-gate
   auto-firer staged: queue-advreview-reg2fix1.sh pid 2146269 -> prompt
   prompts/advreview-REG2fix1-l1t0635.txt -> reviews/reg2-fix1-advreview-l1t0635.md
   (waits for EXITED marker; requires REG2-FIX1 DONE in the log).

6. HOUSEKEEPING: wt/REG-3-lane1-l1t2355 worktree removed + branch deleted (re-gate
   accepted last tick). REG-2 worktree retained (fix1 runs there). Trunk clean at
   ee0338f7; :3092 200 + :5192 200.

## Queue state after this tick

- done: REG-1, REG-3.
- in-progress:
  - REG-2 — merged 0ddbe20b; gate FIX -> FIX1 queued (FIFO position 2 behind REG-4).
    Flow: fix1 -> adv gate (auto-fire) -> orch verify (settle-clamp test re-run, tsc
    comm, diff scope) -> merge -> re-gate tier-1-or-2 with AMENDED W1 (AS-179 criterion)
    + W6 +/-2. accept -> DONE + close AS-178. NO restart expected (app-only).
  - REG-4 — QUEUE-WAIT behind lane-2 UCX-2 coder for the fleet lock (queue wrapper
    2038704, flock 2038770; log logs/coder-REG-4-l1t0520.log). Adv-gate auto-fire staged
    (queue-advreview-reg4.sh pid 2069735 -> reviews/reg4-advreview-l1t0545.md).
- todo: none else. After REG-4 closes, the wave's follow-up NOTE list goes to intake
  (N4 sibling date widgets, N2/N3 contrast wave, Tab-blur harness quirk + NEW: O4
  first-drag-after-other-resizer swallowed, O6 RelatedRecordsCard "Unknown" labels,
  RawRecordEditor route-reachability gap). NOTES are not tasks; do not self-create.

## NEXT TICK CHECKLIST

1. Fleet lock: `cat appliance2-coder.pid` + ps identity. Lane-2 UCX-2 finishing releases
   it to REG-4 (FIFO). Check logs/coder-REG-4-l1t0520.log for LOCK-ACQUIRED + hermes
   forward motion; if lane-2's coder is a zombie hogging the slot past 3x expected
   duration, escalate per SOUL 7b — do NOT kill anything on lane 2's authority.
2. REG-4 coder exit -> reviews/reg4-advreview-l1t0545.md (auto-fired). accept -> orch
   verify (RecordProvenanceCard.test 4/4 re-run, registry suites, tsc comm vs
   tsc-reg4-base-l1t0520.txt, invent-nothing grep) -> merge -> browser gate tier ladder
   (Provenance disclosure Created by/Created/Updated/Content/File; OQ-3 API-created
   record). fix -> defect list to a fix run on wt/REG-4-lane1-l1t514 (FIFO position 3).
3. REG-2 fix1 exit -> adv review report -> my verification -> merge -> re-gate with the
   AMENDED W1 text from AS-ORCH-L1-179 verbatim + W6. W8 stays structural (RawRecordEditor
   unmounted pre-existing — say so honestly in the gate prompt; do not score it as new).
4. decisions/ md5 sweep; never re-ask.
5. Fleet coder pid file staleness: the .pid file flips between queue owners at lock
   acquisition; identity-of-PID + fuser is the truth, the file alone is not.

## assumptions

- AS-ORCH-L1-179 (NEW, evidence-debt FALSE): D2 plan mis-spec ruling + amended re-gate
  criterion (full text in assumptions.md 20261018T0615).
- AS-ORCH-L1-180 (NEW, evidence-debt TRUE, OPEN): REG-2 merge-before-gate at 0ddbe20b
  stays open until fix1 + re-gate accept.
- AS-ORCH-L1-178 stays open (same obligation, carried).
- Gate W8 note: RawRecordEditor no-splitter criterion verified structurally only —
  App.tsx mounts no route to it (pre-existing reachability gap, outside REG-2's diff).

## evidence-debt / carried

OPEN: AS-ORCH-L1-042; 082; 087 PARTIAL; 088; 089; 096; 097; 099; 101; 119 (+post-QMS76 ext);
137 residual; 154 (interpretive only); 178; 180.
CLOSED (prior ticks): 173, 174, 176.
NOTES (future-wave candidates, NOT tasks): NOTE-N4 sibling date-vs-date-time widget kinds;
N2 --cl-text-faint 2.85:1; N3 styling-guard regex breadth; SignOffReceipt latent
text-gray-*; datetime-widget Tab-blur silent-commit-loss; REG-2 O4 first-drag swallow;
REG-2 O6 "Unknown" related-record labels; RawRecordEditor route reachability.
ENV: trunk ee0338f7; lane stack serving it live (vite HMR; backend unchanged, no restart
pending). :3092 single-threaded. Fleet lock held by lane-2 UCX-2 at tick end; lane-1
coder queue depth 2 (REG-4 then REG-2 fix1, FIFO). Tier-2 cloud gates working; tier-1
computable slot was shared with lane 2 all day.
