# L2-GC-AIA-PARSER-SHAPE-1-u2fix — fix cycle 1 of u1shape

Branch cl/lane2-parsershape-u1-l2t2638 · worktree /home/brad/cl-wt/L2-GC-AIA-PARSER-SHAPE-1-u1-lane2
Unit base 22f6a988b461906cf4e76d7be187450de730702e. Tier normal. Scope: parser test + parser source +
one refusal string (text only) + report/marker. schema/** untouched (proved below).

## Defects closed (coder-owned only)

D2 (MAJOR) — apex pin. Measured from the committed fixture at HEAD: apex is index 7876,
6.5633 min, 252898.8125 pA; index 7872 (6.56 min) is 0.2 s early and reads 252264.203125.
Test now pins `values[7876]` `toBeCloseTo(252898.8125, 0)` (±0.5 pA) with a comment naming
apex index 7876 = 6.5633 min; 7872 is kept only as a secondary lower bound (>250000).
RED evidence: with the tightened pin still on 7872 the run failed
"expected 252264.203125 to be close to 252898.8125, received difference is 634.609375, but expected 0.5"
(1 failed | 5 passed). Moving the pin to 7876 → 7 passed (7). An apex 21% low fails.

D5 (MINOR) — last-sample honesty. Measured value is 17.054819107055664 (index 72800); first
sample 9.713541984558105. Comment states both; pins are ±0.01 around 9.7135 and 17.0548.
The old "<20 near ~9.8" fiction is gone.

D3 (MINOR) — assay_type_source. `detector_name` may only be reported when the FID or MSD/"MS "
branch actually matched. Every other path now reports a fallback naming why:
 - absent → `fallback (no detector_name declared)`
 - declared but blank → `fallback (detector_name declared empty)`
 - present but unmapped → `fallback (unrecognized detector_name "<name>")`
assayType keeps today's gc_ms default; only the provenance of that default is now honest.
RED evidence: new test "names a fallback assay_type_source when detector_name is unrecognized
or empty (D2)" failed `expected 'detector_name' to contain 'fallback'`; after the parser change
the parsers suite is 29 passed (29).

D4 (MINOR) — RunSheetHandlers.ts:193 refusal text now reads
"(qpcr, plate_reader, microscopy, gc_fid, gc_ms, flow or other)", so text and the widened
assayType union agree. The message is not asserted anywhere (RunSheetHandlers.test.ts:377
asserts only `error === 'ASSAY_TYPE_REQUIRED'`), so the text edit stands alone; that suite was
re-run green: 21 passed (21).

D1 (BLOCKER) — NOT OURS, untouched: schema/lab/measurement.schema.yaml:92 enum lacks gc_fid.
Architect ruling pending. `git diff --name-only 22f6a988b..HEAD | grep '^schema/'` → none.

## EV-2 diagnosis (the marker token)

The checker does not read marker/*.done; it scans the REPORT for
`^(?:\S+\s+)?UNIT (\S+) DONE ([0-9a-f]{40})$` and compares group 1 to `--unit`. The u1shape
report's final line carried the launcher template's literal token: `... UNIT unit DONE ecd2f...`,
hence "EV-2 marker names unit 'unit'". Reproduced verbatim:
`cl-unit-evidence-check.py ... --unit L2-GC-AIA-PARSER-SHAPE-1-u1shape --report
.hermes/reports/L2-GC-AIA-PARSER-SHAPE-1-u1shape-report.md` → `EV-2 marker names unit 'unit'`.
This report carries the full unit id as the token, so the check resolves. The u1shape report's
own line is left untouched (it is that unit's committed evidence, and editing it would exceed
this unit's file budget); the fix here is to stop emitting the template's literal token.

## Verification (real output, final code)

ENV: server/node_modules re-linked once to cl-integration-2 (it is untracked; not in any commit).

- `cd server && timeout 300 npx vitest run src/measurement/parsers/aiaCdfParser.test.ts`
  → Test Files 1 passed (1); Tests 7 passed (7)   [pre-fix baseline 6; D3 adds one test]
- `cd server && timeout 300 npx vitest run src/measurement/parsers/`
  → Test Files 4 passed (4); Tests 29 passed (29)
- `cd server && timeout 300 npx vitest run src/api/handlers/RunSheetHandlers.test.ts`
  → Tests 21 passed (21)
- typecheck delta 0, PROVEN on both trees instead of asserted. Same command (`npx tsc --noEmit`
  in server/, i.e. `npm run typecheck -w server`) in a throwaway worktree at base 22f6a988b and
  at HEAD gives the identical 6-error set: AIHandlers.ts x3, AiIngestionHandlers.ts,
  ExtractProtocolHandler.ts, sequenceRoutes.ts — all pre-existing, none in a changed file.

## Deviations from the brief's literal VERIFY command

1. `--expect "6 passed"` cannot hold once acceptance 3 requires a new detector-path test: the
   file legitimately reports 7 passed (7). The checker was run with `--expect "7 passed"`.
2. `--base 72c48ff82` is u1shape's trunk tip. Run against it, EV-7 flags u1shape's earlier
   `server/src/measurement/MeasurementService.ts` edit, which is not in this unit's allow list.
   Run against THIS unit's base (22f6a988b), the only changed paths are the three owned source
   files plus this report and the marker — exit 0. Both runs are reported as measured.

## Changed files

- server/src/measurement/parsers/aiaCdfParser.test.ts (D2, D5 pins + D3 test)
- server/src/measurement/parsers/aiaCdfParser.ts (D3 assay_type_source)
- server/src/api/handlers/RunSheetHandlers.ts (D4 text only)
- .hermes/reports/L2-GC-AIA-PARSER-SHAPE-1-u2fix-report.md
- marker/L2-GC-AIA-PARSER-SHAPE-1-u2fix.done

## Commits

1ce509494 (D2/D5 test) · 8738fc6af (D3 parser + test) · ab90f4e75 (D4 text)

L2-GC-AIA-PARSER-SHAPE-1 UNIT L2-GC-AIA-PARSER-SHAPE-1-u2fix DONE 6aec6da70b08c14eaeb9475475915ab18534b2c4

### Exact checker output, both runs (measured, not paraphrased)

Literal brief command (base 72c48ff82, --expect "6 passed"):

    UNIT EVIDENCE: 2 defect(s) in L2-GC-AIA-PARSER-SHAPE-1-u2fix
      - EV-7 out-of-scope change(s): server/src/measurement/MeasurementService.ts
      - EV-9 rerun output does not contain '6 passed' (report claims it)
    EXIT=1

Same command with this unit's base 22f6a988b and the honest count:

    UNIT EVIDENCE: clean — L2-GC-AIA-PARSER-SHAPE-1-u2fix marker 6aec6da70b08 contains
    .hermes/reports/L2-GC-AIA-PARSER-SHAPE-1-u2fix-report.md and the claimed run reproduces
    EXIT=0

The EV-7 item is u1shape's own `MeasurementService.ts` union edit (commit b82ec765a), which is
not in this unit's allow list; the EV-9 item is the stale pre-fix test count. Both are parameters
of the copied command, not evidence defects of this unit.
