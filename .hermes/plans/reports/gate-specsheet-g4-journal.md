# Gate g4 journal — L2-SPEC-SHEET-INGEST-1 (l2t2005)

Served rev: 89b5912c91bedf5b90637981da847b308032a554 (trunk cl/integration-2), matches dispatch.
Frontend :5193 200, backend :3093 200. Read-only: no record created/mutated.

## Progress
- [x] Server arm check 5: vendor-product 25200056 -> 2 proposals, each with sourceUrl + passage + specId;
      catalog_number=25200056 / package_size=100 mL, passage "| 25200056 | 100 mL |" (g3 header defect FIXED here).
- [x] Door A UI journey (plan.json, 18 steps ok): /lab/materials/new -> trypsin -> mesh:D014357 -> Add Vendor
      Product -> Extract Spec Sheet -> 2 rows, both with passage+sourceUrl visible. No console errors.
- [x] Door B UI journey (run2/plan.json, 22 steps ok): /lab/labware -> lab-category-new-labware ->
      /lab/labware/new -> cotaus URL -> 2 proposals with citation cells. Door B is REAL now (g3 BLOCKED resolved).
- [x] Check 3 header leg: nestscientific 96-trough reservoir -> topology.rows AND topology.columns =
      "Number of Wells" (the HEADER cell), passage "| Number of Wells | Single Channel |" -> g3 D1 class STILL LIVE
      in the labware map. Reproduced on 2 distinct nest pages (server) + on screen (run2 shot 21).
- [x] Vision pass on shots (5 images: door A citation panel; labware category; door B empty state;
      door B cotaus proposals; door B nest header leg).
- [x] report.md written -> VERDICT: fix. D1 major (labware header-as-value, criterion 3 FAIL),
      D2 major (vendor = "Manufacturer" nav label), D3 minor (door B no input/button chrome),
      D4 minor (duplicate React key = specId). Checks 1,2,4,5 PASS. No record writes.
