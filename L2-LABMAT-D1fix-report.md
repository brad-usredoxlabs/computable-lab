# L2-LAB-MATERIAL-CREATE-1 / u5fixD1 — D1 idempotent vendor-product write

Base: 1c878a9479ccb2c555a6c40d406b964902ce055e (trunk cl/integration-2 tip)
Branch: cl/lane2-labmat-d1fix-l2t0158
Defect: reviews/L2-BROWSER-l2t0136.md D1 (MAJOR) — re-adding the same
(vendor, catalog number) minted a NEW random-suffix VPR- id and created a
duplicate vendor-product row instead of updating the existing one.

## Change
- app/src/shared/api/client.ts (+22): `apiClient.findVendorProductByCatalog(vendor, catalogNumber)`
  lists `vendor-product` records (limit 200) and returns the first whose payload
  vendor matches case-insensitively/trimmed AND whose catalog_number matches the
  trimmed target. Uses existing endpoint; no new route, no server change.
- app/src/editor/material/VendorProductBuilderModal.tsx (+12/-2): upsert probe
  consults the catalog match before minting; when found it reuses that recordId
  and UPDATEs it (existing payload preserved). Fresh VPR- id + createRecord only
  when no match exists.
- app/src/editor/material/VendorProductBuilderModal.idempotence.test.tsx (+83, NEW):
  two cases — (1) second modal visit for same vendor (case-insensitive Sigma-Aldrich)
  and catalog D6429-500ML (stored payload vendor deliberately upper-cased) updates the first-created id and never creates a second;
  (2) empty workspace mints a fresh VPR- id and creates once.

Diff: 3 files, 115 insertions(+), 2 deletions(-) — within 4 files / 120 lines.

## Commits
e0b85e40 test(material): pin vendor-product idempotence on vendor+catalog (u5fixD1)
e078a628 fix(material): reuse vendor-product by vendor+catalog before minting id (u5fixD1)
(this report and the DONE marker are committed last, after the two code commits)

## Verification (raw)
RED on base sources with the committed test (source files checked out from
1c878a94; test kept):
  $ cd app && npx vitest run src/editor/material/VendorProductBuilderModal.idempotence.test.tsx
  exit=1  Test Files 1 failed (1) | Tests 1 failed | 1 passed (2)
  (failed case: "updates the existing record for the same vendor + catalog
   number instead of creating a second" — on HEAD the second save called
   createRecord with a new VPR- id, updateRecord never ran.)

GREEN on fix:
  $ cd app && npx vitest run src/editor/material/VendorProductBuilderModal.idempotence.test.tsx
  exit=0  Test Files 1 passed (1) | Tests 2 passed (2)

Typecheck:
  $ cd app && npx tsc --noEmit
  exit=0 (no output)

Related suite:
  $ cd app && npx vitest run src/editor/material
  Test Files 4 passed (4) | Tests 19 passed (19)

## Environment note (not committed)
The worktree's app/node_modules symlink initially pointed at an EMPTY
/mnt/.../computable-lab/app/node_modules (no vitest/jsdom => `npx` downloaded
vitest 5 and failed). Repointed the untracked symlink to the populated
/mnt/vast/home/brad/git/cl-integration-2/node_modules (same package.json
versions, vitest 1.6.x) and added server/node_modules (same target) because
app/tsconfig references server sources; both untracked scaffolding symlinks
are recorded in .git/info/exclude so the tracked tree stays clean.

## Blocker
None. Independent browser review still owns live acceptance of D1.

L2-LAB-MATERIAL-CREATE-1-u5fixD1 UNIT unit DONE e078a628846bce4ad5ca33eb92a9557bd1228dec
