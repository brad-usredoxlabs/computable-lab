# L2-ONTOLOGY-ANCHOR-SOURCES-1 — unit o3e report

- Lane: 2
- Worktree: /home/brad/cl-wt/L2-ONTO-SRC-o3e-lane2
- Branch: cl/lane2-ontologysrc-o3e-1330
- Base sha: 29f153cdbbcc17252fa266ced34b73bf757a74d1 (as assigned)
- Scope: equipment half of O3; labware `ontology_ref` (a159be34) read only.

## Decision

The existing `equipmentClassRef` ontology arm (`schema/lab/equipment.schema.yaml`)
IS the Lab Equipment Ontology's home. No second field was added. The arm's
`id` pattern was widened from the single-prefix `^CL:` to the explicit
two-prefix allowlist `^(CL|LEQ):`. A free prefix (`^[A-Z]+:`) was rejected as a
reviewer-bait B1 defect (would admit OBI/NCIT lookalikes).

Note: `core/datatypes/ref.schema.yaml` requires `namespace` and `label` on
ontology refs (`allOf` if/then at :57-67). Both test payloads therefore carry
`namespace` + `label` so the pins exercise the prefix pattern, not a missing
field. This is pre-existing schema truth, not a change made here.

No TypeScript/provider/registry edit. `EQC-` record arm, `unevaluatedProperties:
false`, required list and all 7 pre-existing cases are unchanged (only the two
new cases appended before the last existing case).

## Changed files

- schema/lab/equipment.schema.yaml — pattern `^(CL|LEQ):`, comment updated to
  name LEQ and the allowlist rationale.
- server/src/schema/EquipmentFirstClass.test.ts — three appended cases:
  (a) accepts `EQP-LEQ-ROOT` with `{ kind: 'ontology', id: 'LEQ:0000100',
  namespace: 'LEQ', label: 'lab equipment' }`;
  (b) accepts `EQP-CL-ANCHORED` with `CL:0000182` (CL half of the allowlist);
  (c) rejects `OBI:0000112` and asserts a `pattern` error at
  `/equipmentClassRef/id`.

## Verification (raw)

RED before the schema edit (payload initially lacked namespace/label; the
LEQ case failed, the OBI case passed trivially). After adding the ref-required
fields and still on `^CL:`:

    Test Files  1 failed (1)
          Tests  1 failed | 8 passed (9)
    FAIL ... accepts an equipment instance anchored to the Lab Equipment Ontology (LEQ:)
    AssertionError: expected false to be true

MUTATION PROBE — reverting `^(CL|LEQ):` to `^CL:`:

    Test Files  1 failed (1)
          Tests  1 failed | 8 passed (9)
    only the LEQ case RED; OBI negative case stayed GREEN.

Restored widening, graded run from `server/`:

    ✓ src/schema/EquipmentFirstClass.test.ts  (9 tests) 232ms

     Test Files  1 passed (1)
          Tests  9 passed (9)
       Duration  769ms

Baseline was 7 passed; 7 existing + 2 new = 9. Mutation restored before commit.

## Environment note

This worktree had no node_modules and no server/schema (both gitignored). To run
the graded command without installing, `node_modules` and `server/node_modules`
were symlinked from sibling worktree L2-DOC-INTAKE-1-u1-lane2 (identical
package-lock sha b992230e…), and `server/schema -> ../schema` was created
(gitignored at .gitignore:52). No files were added to git by this; no
`npm install` was run.

## Reviewer bait status

- B1 prefix drift: blocked by case (b) asserting keyword `pattern` on
  `/equipmentClassRef/id`.
- B2 second field: none added; `ontology_ref` untouched.
- B3 cross-file edit: config/ontology-sources.yaml not opened for edit.
- B4 seed sweep: no second suite owed (no other file touched).
- B5 marker: written only after the code commit; sha read with rev-parse.

## Next actions (outside this unit)

O4 (bindings file consumption) and O5 (boot wiring) remain separate units.

## Fix1 — advc c1 MINORs D1/D2/D3 (no production change)

- D1 marker token corrected to the unit id (this line, below).
- D2 added the CL: pin: `CL:0000182` still validates after the pattern widened
  to `^(CL|LEQ):`. Probe (temp file, deleted): forcing `^LEQ:` makes that CL
  pin RED with `pattern` at `/equipmentClassRef/id`; forcing `^CL:` makes the
  LEQ pin RED — both halves are load-bearing.
- D3 the LEQ fixture no longer claims "Water Bath": `LEQ:0000100` is the LEO
  root, `name: lab equipment` (leq.base.obo:45-46). Test id/name/label now say so.

    ✓ src/schema/EquipmentFirstClass.test.ts  (10 tests)
         Tests  10 passed (10)

L2-ONTOLOGY-ANCHOR-SOURCES-1-o3e UNIT o3e DONE ea7ee649dfc59cc3e76f90eb55b698af51468df4

L2-ONTOLOGY-ANCHOR-SOURCES-1-o3e-fix1 UNIT o3e-fix1 DONE d6ceda3e739cd7546bcdf166f1f64e182ba98a54
