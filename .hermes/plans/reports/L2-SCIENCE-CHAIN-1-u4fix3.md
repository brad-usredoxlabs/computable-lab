# L2-PROMPT2-SCIENCE-CHAIN-1 u4fix3 Report

**Defect D-1 (MINOR):** Test at `server/src/ai/shorthandDraftRefEnrichment.test.ts:55` had an overclaiming name — claimed it asserted `material_spec_ref` and `composition_snapshot` but only asserted `typeof details.material_ref === 'object'` and `kind === 'draft'`.

**Fix:** Renamed test case from "enriches a bound single-ref add_material with material_spec_ref and composition_snapshot" to "mints a draft material_ref for a bound single-ref add_material without a store". No production or assertion changes.

**Verify:**
- Pre-edit `grep -c "material_spec_ref and composition_snapshot"` = 1 (line 55)
- Post-edit `grep -c` = 0 (exit code 1, confirming zero matches)
- `npx vitest run src/ai/shorthandDraftRefEnrichment.test.ts`: 7 tests passed, 0 failed

L2-PROMPT2-SCIENCE-CHAIN-1-u4fix3 UNIT unit DONE 9f8318bd9f8bccd2f51b37d8c004d96430006f06
