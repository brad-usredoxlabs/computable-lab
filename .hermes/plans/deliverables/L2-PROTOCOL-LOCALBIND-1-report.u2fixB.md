# L2-PROTOCOL-LOCAL-BIND-1 — unit u2fixB report

Date: 2026-11-10
Worktree: /home/brad/cl-wt/L2-PROTOCOL-LOCALBIND-u1fix-lane2
Branch: cl/lane2-protocol-localbind-1-u1fix-l2t2355
Base HEAD at start: dc91ec50

## Defect
`server/src/protocol/roleBindingWrite.ts:122` read a top-level camelCase
`payload.lotNumber`, a field that exists in no record schema (only in the
binding's own planned-run schema). Every schema-valid material target therefore
got a binding WITHOUT `lotNumber`; only the schema-invalid fixture in
roleBindingWrite.test.ts:87/88 produced one.

## Decisions (measured, not invented)
Schema paths verified first-hand in this worktree:
- material-instance: `payload.lot.lot_number` (schema/lab/material-instance.schema.yaml, `lot` object properties)
- aliquot: `payload.lot.lot_number` (schema/lab/aliquot.schema.yaml, `lot` object)
- material-lot: `payload.lot_number` (schema/lab/material-lot.schema.yaml:27, direct property)
- vendor-product: no lot field anywhere in schema/lab/vendor-product.schema.yaml -> absent, never `undefined`

Fix: one helper `lotOfPayload(kind, payload)` in roleBindingWrite.ts selecting
per target kind; unknown kinds yield `undefined` so the existing spread keeps
the property absent (exactOptionalPropertyTypes). No record-id lists, no changes
to roleBindingProposal.ts / PlannedRunHandlers.ts / schema/**.

## Files changed
- server/src/protocol/roleBindingWrite.ts — helper + call site (lines ~52-63, ~137)
- server/src/protocol/roleBindingWrite.test.ts — fixture replaced with schema-valid
  material-instance (`{ lot: { lot_number: 'L-77' } }`), material-lot
  (`{ lot_number: 'L-88' }`), and vendor-product asserting absent
- .hermes/plans/deliverables/L2-PROTOCOL-LOCALBIND-1-report.u2fixB.md (this file)

## Commits
1. df322912 test(u2fixB): lotNumber read is vacuous - schema-valid material-instance fixture fails at HEAD
2. ea559509ac2bede2caea98a55077892021e7df7a fix(u2fixB): read lot from payload.lot.lot_number / lot_number per target kind
3. docs(u2fixB): report + exit marker

## Verification (run from <worktree>/server)
RED at HEAD dc91ec50 with new fixture only:
  `npx vitest run src/protocol/roleBindingWrite.test.ts`
  -> 1 failed | 6 passed; material-instance leg received no `lotNumber`
  (diff: expected "lotNumber": "L-77", received object without it).
GREEN after fix:
  `npx vitest run src/protocol/roleBindingWrite.test.ts` -> 7/7 passed
  `npx vitest run src/protocol/roleBindingProposal.test.ts` -> 6/6 passed
  `npx tsc --noEmit` -> TSC_EXIT=0
  `git -c core.fileMode=false status --porcelain` -> empty
Receipts for RED/GREEN were captured in-session; large logs not committed.

## Next actions
None in scope. Independent browser/adversarial review owns acceptance.

L2-PROTOCOL-LOCAL-BIND-1-u2fixB UNIT unit DONE ea559509ac2bede2caea98a55077892021e7df7a
