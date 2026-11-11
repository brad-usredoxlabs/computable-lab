# L2-SPEC-SHEET-INGEST-1 d3d4fix1 Report

## Unit
L2-SPEC-SHEET-INGEST-1, unit d3d4fix1, lane 2, worktree /home/brad/cl-wt/L2-SPECSHEET-d3d4prov-lane2
Branch: cl/lane2-specsheet-d3d4prov-0410
Base: 596859d9aef83e767a6dc9dd0419e2b4a6962925

## Review of Record
/home/brad/.hermes/cl/lanes/2/reviews/L2-SPECSHEET-d3d4prov-advc-c1-l2t0400.md
VERDICT: FIX — 2 MAJOR (DEFECT 1, DEFECT 2), 2 MINOR (DEFECT 3, DEFECT 4)

## Defects Addressed
- DEFECT 1 (MAJOR): D4 kind/type/source.kind assertions are vacuous/self-copying
- DEFECT 2 (MAJOR): D3 "prefer first proposal.sourceUrl" is not exercised
- DEFECT 3 (MINOR): D3 fallback uses ??, so empty-string sourceUrl drops provenance
- DEFECT 4 (MINOR): D4 source.kind else branch is untested (folded into DEFECT 1 fix)

## Changes
- app/src/collections/LabLabwareNewPage.tsx:85 — provenanceUrl expression fix
- app/src/collections/LabLabwareNewPage.test.tsx — new tests + de-vacuumed D4 fixture
- docs/d3d4prov-fix1-report.md — this report

## Progress
[In progress — test patches applied]
