## L2-PROMPT2-RESOLVE-OR-AUTHOR-1 Unit u1

**Delivery**: find-then-author seam in `server/src/materials/formulationGrounding.ts`
- `findOrAuthorFormulation` — identity = concept + concentration + solvent
- One call-site swap in `upsertProposedMaterialSpecFromSingleActive` (AddMaterialSupport.ts)
- Tests: `formulationGrounding.test.ts`

**Fixes**:
- 6b0aaff8: tsc clean
- 78658b86: advc c1 — D1 solvent identity, D2 no fabricated ontology, D3 SolventUnresolvableError, D6 test rename

**Verification (measured)**:
- vitest 2 files / 14 tests passed
- tsc --noEmit: 0 errors in materials/

L2-PROMPT2-RESOLVE-OR-AUTHOR-1 UNIT u1 DONE 78658b86
