# REPORT — u9 composition-prefetch wire (SCIENCECHAIN-u9compwire)

## Task
Wire the store-backed material-spec composition prefetch into the SCIENTIST-INTENT
resolve_roles registration (compileScientistIntent.ts:219), threaded from the
shorthand caller which holds the store — so a bound material-spec record that
DOES carry formulation.composition expands into solute+solvent snapshot entries
instead of the legacy self-referential single entry with role:'other'.

Gate 4 D1, the emit-side. Receipts at
/home/brad/.hermes/cl/lanes/2/receipts/L2-PROMPT2-SCIENCE-CHAIN-1-gate4-l2t2945/REPORT.md

## Changes Made

### 1. Helper extraction — `buildMaterialCompositionLookup` (Commit bb1b31c2)
- Extracted the composition prefetch loop from runChatbotCompile.ts into
  a shared async function exported from ChatbotCompilePasses.ts
- Updated runChatbotCompile.ts to import and use the shared helper
  (behavior stays byte-identical)
- Updated imports in ChatbotCompilePasses.ts to add RecordStore type

### 2. Deps field + wiring + GREEN (Commit cc646ebb)
- Added `materialComposition` optional field to `ScientistIntentCompileDeps`
  with doc-comment citing gate 4 D1
- Wired the field into `createResolveRolesPass()` registration at line 219
  using conditional spread (absent => byte-identical behavior)
- Added `answeredSlots` to `ShorthandCompileDeps` and threaded it through
  to `compileScientistIntent`
- Added `answeredSlots` to `compileShorthandDeterministically` deps interface
- Built composition lookup in `compileShorthandDeterministically` via the
  shared `buildMaterialCompositionLookup` helper and passed as `materialComposition`
  to `compileScientistIntent`

### 3. RED test (Commit ff264613)
- `server/src/ai/shorthandChat.compositionEmit.u9.test.ts` — tests that a
  material-spec record with formulation.composition (solute + solvent) expands
  into TWO snapshot entries via the shorthand path

## Owned Files Changed (5 files)
1. `server/src/compiler/scientistIntent/compileScientistIntent.ts` — added `materialComposition` to deps, wired into line 219
2. `server/src/ai/shorthandChat.ts` — threaded composition prefetch and `answeredSlots` through
3. `server/src/ai/runChatbotCompile.ts` — refactored to use shared helper
4. `server/src/compiler/pipeline/passes/ChatbotCompilePasses.ts` — extracted `buildMaterialCompositionLookup`
5. `server/src/ai/shorthandChat.compositionEmit.u9.test.ts` — RED/GREEN test

## Raw Verification Output

### New test PASS
```
 ✓ src/ai/shorthandChat.compositionEmit.u9.test.ts  (1 test) 166ms
 Test Files  1 passed (1)
      Tests  1 passed (1)
```

### runChatbotCompileCompositionPrefetch.test.ts — baseline
```
 ✓ src/ai/runChatbotCompileCompositionPrefetch.test.ts  (10 tests) 39ms
 Test Files  1 passed (1)
      Tests  10 passed (10)
```

### ResolveRoles.compositionExpand.test.ts — baseline
```
 ✓ src/compiler/pipeline/passes/ResolveRoles.compositionExpand.test.ts  (4 tests) 4ms
 Test Files  1 passed (1)
      Tests  4 passed (4)
```

### shorthandChat.labwareIdBinding.test.ts — baseline
```
 ✓ src/ai/shorthandChat.labwareIdBinding.test.ts  (5 tests) 103ms
 Test Files  1 passed (1)
      Tests  5 passed (5)
```

### TypeScript check (tsc --noEmit)
```
src/storage/S3StorageProvider.ts(87,33): error TS2307: Cannot find module '@aws-sdk/client-s3' or its corresponding type declarations.
```
Only the pre-existing S3 error (AWS SDK not installed). Zero new errors introduced.

## Commit Chain
```
cc646ebb u9: wire materialComposition into ScientistIntentCompileDeps + shorthandChat threading + GREEN test (Gate 4 D1)
bb1b31c2 u9: extract buildMaterialCompositionLookup helper + refactor runChatbotCompile to use shared helper (Gate 4 D1)
ff264613 RED test: u9 composition-prefetch wire — verify material-spec emits TWO snapshot entries (Gate 4 D1)
```

SCIENCECHAIN-u9compwire UNIT u9 DONE cc646ebb49808aeadb14a17c3e128f97778b07af
