# L2-MATERIAL-SELECTION-POLICY-1 Unit 1 Report

## Item
L2-MATERIAL-SELECTION-POLICY-1 (lane 2, worktree L2-MATERIAL-SELECTION-POLICY-1-u1-lane2,
branch cl/lane2-matselpolicy-u1-l2t1205)

## Unit 1: schema/lint/ui triplet + only-uniqueness loader

### Decisions
- Cross-record `only` uniqueness check lives in the loader (MaterialSelectionPolicy.ts), NOT in the lint engine. LintEngine.ts:143 silently skips scope != 'record', so a collection-scope rule would never fire (REVIEWER BAIT 1).
- `only`, `default`, `alternative` are three distinct selection modes (REVIEWER BAIT 2). `only` suppresses clarification; `default` pre-selects while others remain; `alternative` is non-default but valid.
- `material_ref` and `vendor_product_ref` use the existing ref schema idiom ($ref to ./datatypes/ref.schema.yaml) — NOT bare strings.
- No vendor literals anywhere (REVIEWER BAIT 5). Test fixtures use synthetic refs like CHEBI:EXAMPLE-1, VPR-EXAMPLE-1.
- The loader does NOT register the kind anywhere. SchemaLoader.ts:130 and LintSpecLoader.ts:219 discover by directory scan (REVIEWER BAIT 8).

### Changed Files
1. schema/lab/material-selection-policy.schema.yaml (NEW) — $id: https://computable-lab.com/schema/computable-lab/material-selection-policy.schema.yaml
2. schema/lab/material-selection-policy.lint.yaml (NEW) — record-scope rules only (since must be non-empty; non-only must carry reason)
3. schema/lab/material-selection-policy.ui.yaml (NEW) — minimal display/form block
4. server/src/materials/MaterialSelectionPolicy.ts (NEW) — normalizeMaterialSelectionPolicies() returns Map<conceptKey, policies[]>, throws on duplicate 'only' naming both recordIds
5. server/src/materials/MaterialSelectionPolicy.test.ts (NEW) — 3 tests: schema discovery + valid record, duplicate-only throws, missing vendor_product_ref fails schema

### Verified Legs
- Leg (1) schema discovery: PASS — the real SchemaLoader finds the new schema by $id
- Leg (2) duplicate-only rejection: PASS — loader throws naming both record IDs
- Leg (3) schema validation: PASS — Ajv rejects missing vendor_product_ref

### Not Claimed Here
- Picker behavior (unit 2 / L2-LAB-MATERIAL-CREATE-1)
- Deletion-restores-asking (unit 2 / L2-LAB-MATERIAL-CREATE-1)
- Any app/ or API changes

### Verification Results
- Targeted test: 3 passed (3), MaterialSelectionPolicy.test.ts
- Neighboring suite: 7 passed (7), MaterialProfileRegistry.test.ts (baseline)
- Typecheck: 0 errors (tsc -p . --noEmit)
- Mutation probe: deleting the throw branch causes test leg (b) to FAIL (expected [Function] to throw an error)
- Tree clean at exit

L2-MATERIAL-SELECTION-POLICY-1-u1 UNIT 1 DONE 020446dc8c651ba29569e92af7fd7e392dd01482
