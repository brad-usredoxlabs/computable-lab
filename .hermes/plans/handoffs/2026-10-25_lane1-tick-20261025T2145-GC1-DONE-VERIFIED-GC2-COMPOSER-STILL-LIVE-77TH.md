# Handoff — lane 1 tick 2026-10-25 21:45 → GC-1 DONE (orch-verified); GC-2 composer still live past 3x — 77th

Author: orchestrator cron tick l1t2020 (this session) — lane 1 only.
All git via -c core.fileMode=false. :3001/:5174 untouched.
Trunk cl/integration-1 @ 493794bc (docs-only since b7a3dd8c; code base b7a3dd8c unchanged).

## GC-1 CLOSED — done, orchestrator-verified first-hand

- Coder r2 (unit cl-l1-coder-gc1-r2-l1t1935) exited rc=0 20:12:49 with end-marker
  "GC1 DONE 8b75efe3", slot-0 released (both coder slots verified FREE at 20:27 tick start).
- Report: /home/brad/.hermes/cl/lanes/1/gc-1-report-l1t1730-r2.md (22,915 B, sections a-f
  answered verbatim). PROMOTED by orchestrator to canonical
  .hermes/plans/2026-10-26_GC-1-gc-feasibility-spike-report.md.
- ORCH VERIFICATION (first-hand, not worker word):
  (1) worktree diff vs b7a3dd8c = 1 file +191 inside .hermes/ ONLY, 0 files outside
      .hermes/ — verified by git diff --stat + name-only grep count = 0.
  (2) Re-ran /tmp/gc1-decA.py on RES35077-4.D with /usr/bin/python3: n=28812, esc=2013,
      rt 0.000..9.604 min, scale=0.0001302083401242271, intercept 0.0, units pA,
      first5 [10.671,10.758,10.805,10.964,10.872], max 400113 — every number byte-matches
      the report. decA's area/FWHM=0 defect independently confirmed (matches report's
      honest self-report; report's authoritative metrics come from corrected decD).
  (3) Re-ran venv proof: /tmp/gc1-venv-prove/bin/python imports numpy 2.5.4 + scipy 1.18.1.
  (4) Re-read ACQ.TXT UTF-16LE: "Acq. Method: AOAC_FAME_NO_INJECTION.M".
- Gate routing: adversarial code gate N/A (zero product diff — verified, not assumed);
  the spec's own verified-by (report contents + re-run proof) was the acceptance route
  (recorded as AS-L1T2145-1 in assumptions.md).
- KEY VERDICTS the wave consumes:
  * venv: python3 -m venv + ensurepip, pins numpy==2.5.4 scipy==1.18.1 on /usr/bin/python3
    (3.14.7); production venv path /home/brad/.computable-lab-lane1/analysis-venv
    (GC-5 provisions; /tmp is spike-only).
  * DEFAULT_PYTHON resolution: config-declared analysis.python -> CLA_ANALYSIS_PYTHON env
    -> /usr/bin/python3 fallback (mirrors CLA_ANALYSIS_SDK_DIR precedent). GC-5 implements.
  * Engine: scipy core + pybaselines 1.2.1 (BSD-3-Clause, deps already pinned) as pluggable
    baseline backend; chromatopy REJECTED (empty license, PyQt5/hard pins); "chromatographics"
    does not exist on PyPI.
  * .M: opaque preservation + scientist-entered data; ONLY ACQ.TXT method-name extraction
    worth doing now; IQ1.MTH keys parseable but semantics vendor-undocumented -> record as
    imported key-values, never invent meaning.
  * Tolerances (GC-10): RT <= 0.02 min, height <= 5%, area <= 10%, per-point max(1%,5pA);
    saturated peaks excluded from area compare, flag saturated:true.
  * Trace sizes: worst case 72,801 pts / 155,016 B; render decimate <= 4-8k pts.
  * Corpus truth NOW: 12 .D dirs, ACQUIRING.TXT absent (all complete);
    20201023-WEGMANS-BUTTER.D is a PARTIAL .D (no ACQ.M/DA.M) — handlers must tolerate.

## GC-2 composer — STILL LIVE, past 3x expected duration, SHOWING FORWARD MOTION

- Unit cl-l1-speccompose-gc2-l1t1730 active since 18:53 (~2h52m at 21:45; expected 20-40 min
  => >4x). Per 7b escalation: inspected state.db — session 20261025_185307_8101af at 101
  messages (was 79 at 20:56), last tool call 21:45:34 (search_files), calls at 21:27, 21:36,
  21:45 => GENUINE forward motion, NOT hung. Do NOT kill.
- Draft path: lanes/1/drafts/2026-10-25_GC-2-gc-method-records-spec.l1t1730.draft.md
  (NOT yet on disk at 21:45). End-marker "COMPOSER DONE GC-2 <bytes>" in
  logs/speccomposer-GC2-l1t1730.log (log still 32 B = stdout flushes at exit).
- HEDGE per 7b(c) since >3x with motion: if the draft is STILL absent at the next tick,
  do not wait again — the next tick composes the GC-2 spec itself from the GC-1 report
  (all verdicts above) + bounded local inspection of the schema triplet conventions,
  flagged PROVISIONAL orch-composed for architect ratification. If the draft appears,
  review its cites against trunk reality, promote or fix, then claim GC-2 + dispatch
  cl-coder on a free slot (slot 0 free since 20:12).
- GC-2 deps (GC-1) are SATISFIED since this tick — GC-2 is dispatchable the moment its
  spec is canonical.

## assumptions:

- AS-L1T1935-GC1-1..7: carried in assumptions.md (v181 header reverse-engineered not
  vendor-documented; escape 64-bit reading inferred; pA/fixed-scale; ACQ.M/DA.M roles
  inferred; local-maxima-not-vendor-peaks; screenshot route unavailable [ORCH-CLOSED:
  orch re-ran decoder A first-hand]; ACQUIRING.TXT disappearance). Evidence-debt entries
  owed: vendor format confirmation (low priority), KERRY escape-tag distribution audit
  (becomes a GC-6 parser rule), saturated-flag lint rule proposal -> GC-2/GC-10 spec text.
- AS-L1T2145-1: GC-1 accepted via spec's own verified-by route (report + orch re-run
  proofs); adversarial code gate N/A — justified by verified zero product diff (1 file
  +191, 0 outside .hermes/), recorded not assumed.
- AS-L1T2145-2: GC-1's worktree (gc-1-lane1-l1t1730) NOT merged — spike commits a report
  copy under .hermes/plans/ only; canonical promotion was an orch cp, no merge needed.
  Branch left in place as evidence.
- pnpm-lock.yaml trunk dirt stands (pre-existing). No new evidence-debt beyond GC-1's above.

## live-worker checkpoint (do NOT kill, do NOT duplicate)

- cl-spec-composer GC-2: unit cl-l1-speccompose-gc2-l1t1730.service (PID 4046236/4046239),
  thunderbeast, NO fleet lock held. Reconcile: systemctl --user is-active + tail log for
  "COMPOSER DONE GC-2" + state.db session 20261025_185307_8101af message growth.
- Both coder slots FREE (slot0 released 20:12:49, verified no pid files at 20:27 and 21:45).
  Fleet-wide live coders: 0.
- GC-1 coder fully exited; ownership closed.

## NEXT TICK checklist

1. GC-2 draft on disk? YES -> verify cites vs trunk (schema/lab triplet conventions,
   readout-definition.schema.yaml:34 enum, registry-kinds), promote to
   .hermes/plans/2026-10-26_GC-2-gc-method-records.md, claim GC-2 under task-list.lock,
   dispatch cl-coder (free slot, worktree wt/gc-2-lane1-l1t<ts>, unique report path,
   end-marker "GC2 DONE <sha>"). NO -> compose the spec yourself from the GC-1 report +
   bounded local inspection, flagged PROVISIONAL (7b hedge, authorized above), then same
   claim+dispatch. Dispatch GC-3 spec-composer in background per protocol.
2. GC-2 coder brief MUST paste in GC-1 verdicts (engine matrix, .M verdict, unknown-is-
   unknown rule, IQ1.MTH semantics-unknown warning, partial-.D tolerance, saturated-flag
   proposal) so the coder starts oriented.
3. INSTR-COLLAPSE-3 ratification orphan: unchanged — propose closing via a handoff
   ratification line if no server item needs the INS- deletions by then.
4. Screenshot RT cross-check optional close-out (orch has vision via openrouter VL if a
   cheap confirmation is ever wanted; two-decoder route already accepted).
