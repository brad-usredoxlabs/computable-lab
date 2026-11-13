L2-ONTOLOGY-c1gate Report — c1gate unit (L2-ONTOLOGY-ANCHOR-SOURCES-1-c1gate)

SUMMARY
-------
Added a client-side identity gate to RecordCreatePanel.tsx's submit handler so
an EMPTY required identifier field is refused BEFORE the POST, mirroring the
existing title-required gate. This closes g8 gate DEFECT 1 (C-1, functional).

CHANGES MADE
------------
1. app/src/event-editor/create/RecordCreatePanel.tsx:
   - Added `schemaRequiresId = !isSpine && Boolean(schemaDoc?.required?.includes(idField))`
     line after the title check (:400 → :400). The `!isSpine` guard is REQUIRED
     because spine schemas require `recordId` but the panel CLIENT-MINTS it at save.
   - Added ID gate block immediately after the title gate: if schema requires the id
     field AND the slot is writable (`!identitySlotReadOnly`), check that
     `formData[idField]` is a non-empty string; if not, set error "An identifier is
     required before saving" and return early (no POST).
   - Added `schemaRequiresId` to the useCallback dependency list alongside
     `schemaRequiresTitle`.

2. app/src/event-editor/create/RecordCreatePanel.g7form.test.tsx:
   - Extended existing test "clears the refusal banner on the first author edit" to
     provide an ID value initially, allowing the submission to reach the mocked server
     (so the 422 refusal behavior is still tested).
   - Added new test "empty required Identifier is refused client-side — no POST,
     named identifier banner": renders panel, fills only Display name via typeInto,
     leaves Identifier untouched (empty), submits; asserts createCalls.length === 0
     and banner contains /identifier/i text.

TEST RESULTS
------------
Baseline (base commit): 3 tests passed.
After adding test (RED): 1 test failed (createCalls.length === 1 instead of 0,
                         no error banner appeared).
After implementing gate (GREEN): All 4 tests pass.

RED output (first run of new test):
  ❯ expected [ [ …(2) ] ] to have a length of +0 but got 1

GREEN output (final verification):
  ✓ src/event-editor/create/RecordCreatePanel.g7form.test.tsx  (4 tests) 212ms

ACCEPTANCE VERIFIED
-------------------
✓ New vitest leg passes: empty required Identifier + submit => createCalls.length === 0
  and banner visible matching /identifier/i.
✓ Existing 3 g7form tests still pass (4 total).
✓ No TypeScript errors introduced (typecheck clean).
✓ readonly-mint arm untouched: spine kinds still save with client-minted recordId;
  non-spine kinds with schema-required `id` now get client-side rejection for empty.

COMMIT HASHES
-------------
Test commit: f70238b8 — test(ontology-c1): RED — empty required identifier must not POST
Product commit: 1759d722 — fix(ontology-c1): client gate — empty schema-required identifier refused before POST

L2-ONTOLOGY-ANCHOR-SOURCES-1-c1gate UNIT unit DONE 1759d722c