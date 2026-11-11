L2-SPEC-SHEET-INGEST-1 UNIT d3d4prov Report
=============================================

Item: L2-SPEC-SHEET-INGEST-1, unit d3d4prov (DEFECT 3 MAJOR + DEFECT 4 MINOR)
Branch: cl/lane2-specsheet-d3d4prov-0410, Lane: 2

DEFECTS FIXED:
D3 (MAJOR): Provenance URL frozen at extraction time via extractedFromUrl state.
  - Added state value captured before extract, reset at top of handleExtract
  - Prefer proposal.sourceUrl for provenance, fall back to frozen URL
  - Never read mutable sheetUrl state for source provenance
D4 (MINOR): kind/type/read_only/source.kind derived from schema properties.
  - kind from properties.kind.const, fallback 'labware-definition'
  - type from properties.type.const, fallback 'labware_definition'
  - read_only:true only when schema declares read_only as boolean
  - source.kind from schema enum, prefer 'imported'

FILES CHANGED:
- app/src/collections/LabLabwareNewPage.tsx (~68 lines changed)
- app/src/collections/LabLabwareNewPage.test.tsx (~121 lines added)

COMMIT HISTORY:
1. RED pins: D3 freeze URL at extraction + D4 derive vocabulary from schema
2. Product fix + pins green (fixed test proposals to exercise fallback)
3. Mutation probe verified + restore fix

VERIFICATION:
1. LabLabwareNewPage.test.tsx: 1 file passed, 16 passed (16)
2. LabCollectionView.test.tsx: 1 file passed, 8 passed (8)
3. Typecheck (tsc --noEmit): exit 0, zero errors
4. git status --short: empty (clean tree)

MUTATION PROBE:
- Applied mutation: replaced extractedFromUrl ?? undefined with sheetUrl
- D3 freeze pin went RED: expected sheet-a, got sheet-b
- D3 clear-URL pin went RED: source undefined (frozen URL not used)
- Restored fix with git checkout -- app/src/collections/LabLabwareNewPage.tsx
- Verified git status --short shows no product path

L2-SPEC-SHEET-INGEST-1-d3d4prov UNIT d3d4prov DONE f08cc2b238356302588254e0b51fe21a1297d9b5
