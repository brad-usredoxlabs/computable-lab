## g5d1save (cont)

Unit: L2-SPEC-SHEET-INGEST-1 / g5d1save-cont, lane 2.
Worktree: /home/brad/cl-wt/L2-SPECSHEET-g5d1save-lane2
Base: 328b91dc (launcher WIP AT EXIT; 0a797f44 already carried the RED app tests).
All git commands used `-c core.fileMode=false`.

### What the three defects now pin
a. Schema accepts server-injected provenance keys. The WIP already declared
   createdAt/updatedAt/createdBy on the root of
   schema/workflow/labware-definition.schema.yaml (not required). The pin is
   server/src/schema/LabwareDefinitionAnchor.test.ts
   ("accepts a create payload carrying server-injected provenance timestamps"),
   which validates a full labware payload plus the three ISO-string keys through
   the existing SchemaLoader + AjvValidator harness against the REAL schema file.
   Bite checked out-of-band: compiling the same schema with those three properties
   removed rejects the identical payload with
   "must NOT have additional properties"; with them it validates clean.
b. Unit coercion through the real path (buildPayloadFromProposals, wired at
   handleSave -> apiClient.createRecord). "100mL" -> 100000 in
   capacity.max_well_volume_uL, and an ambiguous "195 mL, 185 mL" is left RAW
   (parseUnitQuantity returns undefined on != 1 matches, so no guess).
   Pins: existing "coerces a single unit-bearing quantity ... (100mL -> 100000)"
   plus new "leaves an ambiguous two-quantity string raw in a number field".
c. handleSave pre-flight. Before the POST, collectInvalidRequiredPaths walks the
   fetched schema's `required` against the built payload; a non-empty list renders
   "Cannot save: missing or invalid: <paths>" in the EXISTING
   data-testid=lab-labware-error surface and returns without calling
   createRecord. Server Ajv remains the sole validator for everything else;
   empty/absent schema means no client gate (existing tests keep passing).

### Changed files
- server/src/schema/LabwareDefinitionAnchor.test.ts  (+25) provenance-key pin.
- app/src/collections/LabLabwareNewPage.test.tsx    (+22) ambiguous-quantity pin.
- app/src/collections/LabLabwareNewPage.tsx         (+10) pre-flight wiring in handleSave.
- deliverables/L2-SPEC-SHEET-INGEST-1-report-l2t2405.md (this file).
No schema edit was needed in this continuation (WIP already fixed D1(b)); no server
source changes; no other files touched.

### Commits (on top of 328b91dc)
- 923dd06d test: pin server-injected provenance keys against labware schema
- cfd7a03f test: pin ambiguous two-quantity string staying raw
- 7a53a145 feat: named save pre-flight refuses missing/invalid required fields before POST
- report commit follows (marker line at EOF)

### Verification (exact commands, measured)
1. `cd app && npx vitest run src/collections/LabLabwareNewPage.test.tsx`
   BEFORE this unit's fix: 21 passed | 2 failed of 23 at 328b91dc
   (the two g5d1save pre-flight legs, missing lab-labware-error).
   AFTER: 24 passed / 0 failed (24 tests), i.e. baseline 20 at 5e40c90f plus the
   RED legs from 0a797f44 plus the new ambiguous-quantity pin. The :179 existing
   no-client-gate pin and the 422 error-surface pin remain green.
2. `cd server && npx vitest run src/schema/LabwareDefinitionAnchor.test.ts`
   5 passed / 0 failed (was 4 before this unit's pin).
   NOTE: this worktree has no server/node_modules; ran against the existing
   install via an untracked node_modules symlink pointing at the same package
   store app/node_modules already uses. Not committed.
3. Typecheck: `cd app && npx tsc --noEmit -p .` (the -p app spelling only works
   from repo root, where no node_modules exists in this worktree).
   Result: exactly one error, pre-existing and unrelated to this unit:
   src/editor/taptab/tabNavPlugin.ts(7,33): error TS2307: Cannot find module
   'prosemirror-view'. No errors in the touched files; no new errors.

### State / next actions
Implementation complete; acceptance (adversarial + browser review) still owned by
the reviewer. Nothing blocked.
