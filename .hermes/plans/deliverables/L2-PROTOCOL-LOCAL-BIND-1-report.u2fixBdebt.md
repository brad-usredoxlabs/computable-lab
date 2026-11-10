# L2-PROTOCOL-LOCAL-BIND-1 — unit u2fixBdebt (lane 2)

Worktree: /home/brad/cl-wt/L2-LOCALBIND-u2fixBdebt-lane2
Branch: cl/lane2-localbind-u2fixbdebt-0516
Base: 2d3235d6 (trunk cl/integration-2 tip, measured 2026-11-10T05:13 EST)

## Scope

Owned files: server/src/protocol/roleBindingWrite.ts, server/src/protocol/roleBindingWrite.test.ts, this report.

## Defects fixed (from advc c2, filed in reviews/L2-LOCALBIND-u2fixB-advc-c2-l2t0435.md VERDICT FIX 3)

1. material-lot lot read only checked `payload.lot_number`, ignoring `supplier.vendor_lot`. The canonical reader at shelfLookup.ts:251 uses `supplier.vendor_lot` first, falling back to `lot_number`. A lot carrying only `supplier.vendor_lot` silently wrote NO lotNumber.
2. The `aliquot` arm at roleBindingWrite.ts:60 was unpinned — deleting it left 7/7 GREEN, so a regression ships invisibly.
3. The test comment claimed fixtures were "schema-valid" when they were not (material-instance missing `name` + required ref, material-lot missing `material_ref`). The correction: fixtures are shaped to the schemas' required keys and declared lot paths, but are not Ajv-validated (env() injects `payload.recordId` which is not in any schema).

## Changes

### roleBindingWrite.ts
- `lotOfPayload` material-lot arm now reads `supplier.vendor_lot` first via `asObject`/`stringField`, falling back to `lot_number`. Reuses existing helpers; no new coercion logic.
- Docstring updated to state the precedence and reference shelfLookup as the canonical reader.
- The `material-instance || aliquot` arm unchanged. The labware path unchanged. The `...(lotNumber ? { lotNumber } : {})` spread unchanged.

### roleBindingWrite.test.ts
- Existing lot test: added missing required keys (`name` + `material_ref` for material-instance; `material_ref` for material-lot) so "shaped to the schema" is accurate. Comment replaced with honest wording.
- New test: `prefers supplier.vendor_lot over lot_number for material-lot` — three cases:
  (a) vendor_lot only -> VL-9, (b) vendor_lot + lot_number -> vendor_lot wins (VL-9), (c) aliquot with lot.lot_number -> L-55 (pins the arm advc could delete green).
- Existing LOT-1 case (no supplier, expects L-88) preserved as fallback pin.

## Mutation probes

Mutation A: deleted `|| kind === 'aliquot'` at roleBindingWrite.ts:60. Result: 1 failed | 7 passed (the aliquot assertion failed — LOT-2 passes but ALQ-1 does not). Confirmed the aliquot arm is pinned. Reverted.

Mutation B: reverted vendor_lot preference to `stringField(payload, 'lot_number')`. Result: 1 failed | 7 passed (Case A LOT-2 fails — no lotNumber when only vendor_lot exists). Confirmed vendor_lot is required. Reverted.

## Verification

roleBindingWrite.test.ts: 8 passed (baseline 7, +1 new).
roleBindingWrite.test.ts + roleBindingProposal.test.ts: 14 passed (baseline 13, +1 new).
tsc: pre-existing errors only (missing @types/node, npm deps in unrelated files). No errors in changed files.

## Note (out of scope)

roleBindingProposal.ts:66 reads a camelCase payload.lotNumber for all kinds (no kind branch), so its asymmetry versus the write half is a different defect and still needs an architect ruling. Not touched here.

## Commits

10753d42 test(protocol): u2fixBdebt RED — material-lot vendor_lot + aliquot lot arms
96f48f87 fix(protocol): u2fixBdebt — material-lot lot read prefers supplier.vendor_lot

L2-PROTOCOL-LOCAL-BIND-1 (L2-LOCALBIND-u2fixBdebt) UNIT u2fixBdebt DONE 9c16dad1fa298a00a11c3293a49990b9e59ef13b

L2-LOCALBIND-u2fixBdebt-pw2 UNIT unit DONE 02b415a387177c28f080735a31a9a3e961948aae
