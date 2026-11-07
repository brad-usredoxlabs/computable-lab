# L2-SCIENCE-CHAIN-1 u5matref Report

## Unit: u5matref (L2-PROMPT2-SCIENCE-CHAIN-1)
## Task: Expand bound formulation composition entries into composition_snapshot

## Summary
Expanded `buildMaterialEmission` in `createResolveRolesPass` to accept an optional
`materialComposition` callback that returns formulation composition entries. When
the callback returns entries, they replace the legacy single-entry snapshot
(`[{ component_ref: typedRef, role: 'other' }]`). A prefetch in `runChatbotCompile.ts`
builds a `Map<recordId, entries>` from material-spec records' `formulation.composition`.

## Changed Files
1. `server/src/compiler/pipeline/passes/ChatbotCompilePasses.ts`
   - Added `ResolveRolesPassOptions` interface with optional `materialComposition` callback
   - Modified `createResolveRolesPass(opts?)` to accept options
   - Modified `buildMaterialEmission` to use the callback when available, falling back to legacy behavior

2. `server/src/ai/runChatbotCompile.ts`
   - Prefetch material-spec records from store (only when `args.deps.store` exists)
   - Build `Map<recordId, composition[]>` from each record's `formulation.composition`
   - Pass lookup closure to `createResolveRolesPass` (key omitted when absent, never undefined)

3. `server/src/compiler/pipeline/passes/ResolveRoles.compositionExpand.test.ts` (NEW)
   - 4 tests: legacy no-callback, expanded snapshot, callback returns undefined, role-based expansion path

## Verification Results

### Tests
```
cd server && npx vitest run src/compiler/pipeline/passes/ResolveRoles.compositionExpand.test.ts src/compiler/pipeline/passes/ResolveRoles.test.ts

✓ src/compiler/pipeline/passes/ResolveRoles.compositionExpand.test.ts (4 tests) 4ms
✓ src/compiler/pipeline/passes/ResolveRoles.test.ts (17 tests) 8ms

Test Files  2 passed (2)
Tests  21 passed (21)
```

### Typecheck
```
cd server && npx tsc --noEmit -p .
```
Result: 0 error lines (clean)

### Tree Status
```
git -c core.fileMode=false status --short
```
Result: clean (no output)

## Commits
1. 427ccec7 - u5matref: RED test + buildMaterialEmission composition expansion
2. 8fba7bca - u5matref: implement composition expansion in buildMaterialEmission
3. b9a81737 - u5matref: wire composition prefetch in runChatbotCompile
4. c3930028 - u5matref: fix schemaId to full URI for material-spec list filter

## Prefetch Cost
One `store.list()` call per compile with `schemaId` filter for material-spec records.
All material-spec envelopes are scanned; only those with non-empty `formulation.composition`
are added to the lookup map. Zero I/O when store is absent.

## Before/After Snapshot Shape (Two-Component Case)
Before:
```json
{
  "material_ref": { "kind": "record", "type": "material", "id": "MSP-PR9-TEST-CLO-1MM" },
  "composition_snapshot": [
    { "component_ref": { "kind": "record", "type": "material", "id": "MSP-PR9-TEST-CLO-1MM" }, "role": "other" }
  ]
}
```

After:
```json
{
  "material_ref": { "kind": "record", "type": "material", "id": "MSP-PR9-TEST-CLO-1MM" },
  "composition_snapshot": [
    { "component_ref": { "kind": "record", "type": "material", "id": "MAT-CLOFIBRATE" }, "role": "solute" },
    { "component_ref": { "kind": "record", "type": "material", "id": "MAT-DMSO" }, "role": "solvent" }
  ]
}
```

## Golden Files
No golden files were modified.

## Invariants Preserved
- `createResolveRolesPass()` with no argument is valid (compileScientistIntent.ts:219)
- Single-component formulations keep their one-entry snapshot
- eventId/well/ordering, role expansion, counter semantics untouched
- `material_ref` stays `{kind:'record',type:'material',id}`
- Zero role literals ('solvent', 'solute') in TS — roles come from entry data

L2-PROMPT2-SCIENCE-CHAIN-1-u5matrefr UNIT u5matref DONE 30e37d682bf1834db320a8dc19c36e435bc2d8ac
