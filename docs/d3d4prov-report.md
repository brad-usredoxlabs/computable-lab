L2-SPEC-SHEET-INGEST-1 UNIT d3d4prov Report
=============================================

Item: L2-SPEC-SHEET-INGEST-1, unit d3d4prov (DEFECT 3 MAJOR + DEFECT 4 MINOR)
Branch: cl/lane2-specsheet-d3d4prov-0410, Lane: 2

DEFECTS FIXED:
D3 (MAJOR): Provenance URL frozen at extraction time via extractedFromUrl state.
D4 (MINOR): kind/type/read_only/source.kind derived from schema properties.

FILES CHANGED:
- app/src/collections/LabLabwareNewPage.tsx
- app/src/collections/LabLabwareNewPage.test.tsx
- docs/d3d4prov-report.md

VERIFICATION:
1. LabLabwareNewPage.test.tsx: 1 file passed, 16 passed (16)
2. LabCollectionView.test.tsx: 1 file passed, 8 passed (8)
3. Typecheck: exit 0, zero errors
4. git status: clean
5. Mutation probe: D3 freeze pin went RED with live sheetUrl

L2-SPEC-SHEET-INGEST-1-d3d4prov UNIT d3d4prov DONE fc3d921e9b7b5b9377cfb9cced9ed960dfb42788
