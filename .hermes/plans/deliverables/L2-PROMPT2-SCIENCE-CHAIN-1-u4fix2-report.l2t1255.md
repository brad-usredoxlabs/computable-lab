# L2-PROMPT2-SCIENCE-CHAIN-1 u4fix2 Report

## Unit
u4fix2 — Close 3 defects from adversarial review of u4fix (advc-u4fix)

## Defects Fixed
- D1 (major): enrichDraftResultEvents wire had no test pin — a future refactor could silently unwire it. Added D1 pin test that asserts material_ref presence on compiler-draft events. Proven NON-VACUOUS: commenting out AgentOrchestrator.ts:3247-3253 makes the pin RED (1 failed | 19 skipped), restoring makes it GREEN.
- D2 (minor): Fallback fabricated draft ref for CURIE-shaped labels (e.g., CHEBI:17790 -> mint:CHEBI:17790). Fixed: added `isCurieShaped(materialLabel)` guard before minting.
- D3 (minor): Fallback appended conflicting material_ref when sibling record refs (e.g., material_spec_ref) already present. Fixed: added `Object.keys(RECORD_REF_FIELDS).some(...)` guard mirroring enrichAddMaterialRefs :739.

## Changed Files
1. `server/src/ai/materialRefLabels.ts` — Added 2 guards in the enrichDraftResultEvents fallback loop (:822-826): skip CURIE-shaped labels, skip when sibling record ref present.
2. `server/src/ai/shorthandDraftRefEnrichment.test.ts` — Added 2 new cases: CURIE-shaped label refusal, sibling-ref refusal.
3. `server/src/ai/AgentOrchestrator.shorthandChat.test.ts` — Added 1 new D1 pin test: asserts material_ref on compiler-draft events.

## Verification
- `shorthandDraftRefEnrichment.test.ts`: 7 passed (7) [was 5 passed]
- `AgentOrchestrator.shorthandChat.test.ts`: 3 failed | 17 passed (20) [was 3 failed | 16 passed — same 3 pre-existing failures]
- Typecheck: EXIT=0
- Git tree: clean

## D1 Pin Mutation Evidence
- Wire commented out: `1 failed | 19 skipped` — pin RED ✓
- Wire restored: pin GREEN ✓

L2-PROMPT2-SCIENCE-CHAIN-1-u4fix2 UNIT u4fix2 DONE 3d979d0dd6ee3c0cad9a00a118c0abc61827d666
