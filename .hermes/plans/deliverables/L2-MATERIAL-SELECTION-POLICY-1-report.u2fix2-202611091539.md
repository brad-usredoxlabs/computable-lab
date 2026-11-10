# L2-MATERIAL-SELECTION-POLICY-1 — Unit u2fix2 Report

## Summary
Fixes the two halves of the row↔concept attribution seam from adversarial review
`reviews/L2-MATERIAL-SELECTION-POLICY-1-u2-advc-c1-l2t1435.md`:

- D1 (BLOCKER): the vendor-product producer now surfaces its own schema-required
  `material_ref` (`id` + `kind`) on `MaterialSearchItem` as `materialRefId` /
  `materialRefKind` (both optional, omitted not `undefined`). The pure comparator
  threads them item→row, and `applySelectionPolicies` adds
  `${materialRefKind}:${materialRefId}` as an attribution key in ADDITION to the
  existing `ontology:${curie}` / `record:${recordId}` keys. The ref's own
  discriminator decides the namespace — a CURIE is never rewritten into a
  recordId (CLAUDE.md rule 8).
- D4 (MAJOR): the `only` collapse is now (a) concept-scoped — rows attributed to
  other concepts keep their ranked order instead of the whole-array
  `result.length = 0` wipe — and (b) gated on `pickerRows === true` in
  `resolvers.ts`, so the doc-editor `/m` path never calls the policy at all and
  its list stays byte-identical to the no-policy list.

## Changed files (5, +211/−20)
1. `server/src/api/handlers/MaterialLifecycleHandlers.ts` — produce
   `materialRefKind`/`materialRefId` from `payload.material_ref` in the
   `vendor-product` branch; type fields added.
2. `app/src/shared/api/client.ts` — app mirror of the two optional fields.
3. `app/src/shared/taptab/slashMenu/clarifyPickerRanking.ts` — widen
   `MaterialCandidateItem`/`RankedCandidateRow`, thread ref fields, attribution
   key, concept-scoped collapse.
4. `app/src/shared/taptab/slashMenu/resolvers.ts` — `pickerRows === true` gate on
   `applySelectionPolicies` (preselected attachment at :873 untouched).
5. `app/src/shared/taptab/slashMenu/clarifyPickerRanking.test.ts` — producer-shaped
   fixtures (vendor rows carry NO `curie`) + new D4/resolver pins.

## RED evidence (before the change)
Producer-shaped fixtures, raw summary (grep of `red.log`):
```
 FAIL ... > only — collapses to exactly one row (the policy vendor product) with preselected: true
AssertionError: expected [ { …(8) }, { …(8) }, { …(7) } ] to have a length of 1 but got 3
 FAIL ... > default — all rows survive, exactly one is preselected, focus index matches
AssertionError: expected [] to have a length of 1 but got +0
 FAIL ... > only — material_ref kind=record matches the rows carrying that record ref
AssertionError: expected [ { …(8) }, { …(8) }, { …(6) } ] to have a length of 1 but got 3
 FAIL ... > only — rows attributed to a DIFFERENT concept survive the collapse
AssertionError: expected [ 'VP-A', 'VP-B', 'MAT-B', 'VP-C' ] to deeply equal [ 'VP-A', 'MAT-B', 'VP-C' ]
 FAIL ... > pickerRows=true: the same only policy collapses the picker rows of that concept
AssertionError: expected true to be false // Object.is equality
      Tests  5 failed | 19 passed (24)
```
Note pin (c) (editor byte-identical) is GREEN at RED because nothing collapses yet;
it is the pin Mutation B flips.

## Verification (raw)
- `cd app && npx vitest run src/shared/taptab/slashMenu/clarifyPickerRanking.test.ts`
  - baseline at 32296c17: `Tests 21 passed (21)`
  - after: `Test Files 1 passed (1)` / `Tests 24 passed (24)` / `Duration 2.07s`
- Full slashMenu dir (regression): `Test Files 8 passed (8)` / `Tests 100 passed (100)`
- `cd app && npx tsc --noEmit` → `error-ts-count: 0` (exit 0), baseline 0.
- `npx tsc -p server/tsconfig.json --noEmit` → baseline 7 errors, after 7 errors;
  the two logs diff clean after stripping line numbers. All 7 are pre-existing
  fastify-multipart/`request.parts` errors in AIHandlers/AiIngestionHandlers/
  ExtractProtocolHandler/sequenceRoutes/server.ts; `grep MaterialLifecycleHandlers`
  in the after log → no hits.
- Producer proof: `grep -n "material_ref" server/src/api/handlers/MaterialLifecycleHandlers.ts`
  → `279:    const materialRef = isObject(payload.material_ref) ? payload.material_ref : null;`
  inside the `vendor-product` branch (was 0 hits in that file).
- `git -c core.fileMode=false status --short` → only `?? app/node_modules`, `?? server/node_modules`.

## Mutation probes (raw)
- Mutation A — remove the new concept-key push at `clarifyPickerRanking.ts`:
```
 ❯ clarifyPickerRanking.test.ts  (24 tests | 1 failed | 23 skipped)
 FAIL ... > only — collapses to exactly one row (the policy vendor product) with preselected: true
 AssertionError: expected [ { …(8) }, { …(8) }, { …(7) } ] to have a length of 1 but got 3
```
  Restored → GREEN.
- Mutation B — remove the `pickerRows` gate at `resolvers.ts:801`:
```
 ❯ clarifyPickerRanking.test.ts  (24 tests | 1 failed | 23 skipped)
 FAIL ... > pickerRows=false (doc-editor /m): an only policy leaves the list byte-identical to the no-policy list
 AssertionError: expected '[{"key":"vendor-product:VP-A","label"…' to be '[{"key":"vendor-product:VP-A","label"…' // Object.is equality
```
  (with the concept-scoped collapse in place the editor still lost `VP-B`/`MAT-1`,
  proving the byte-stability pin needs the gate, not just the scoping).
  Restored → GREEN.

## Residuals — still OPEN (this unit does NOT close criterion (1))
- **D3 OPEN**: the streamed ontology tier is re-merged CLIENT-side at
  `ClarificationPicker.tsx:815`, after the resolver returns, and the mint floor
  (`pinBottom`) is always appended. A single `only` card can still show a mint
  row / client-merged ontology row. Different seam — u2fix3.
- **D6 OPEN**: selection-policy loader id guard / limit 50.
- **D7 OPEN**: `preselected` is still not a declared field on `SlashSuggestion`
  in `types.ts` (read structurally in the test only).

## Commits
- 41a8c0adddad226a49005f9b67050ab0fe1df4c7 — product + test
- (this report commit)

L2-MATERIAL-SELECTION-POLICY-1 UNIT u2fix2 DONE 41a8c0adddad226a49005f9b67050ab0fe1df4c7
