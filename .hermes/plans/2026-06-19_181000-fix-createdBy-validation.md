# Fix `createdBy` Validation Error on Material Instance Creation

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Fix `Validation failed: /: Unknown property: createdBy` when accepting AI-generated placements that create material instances.

**Architecture:** The `material-instance` schema references `FAIRCommon` via `allOf` which defines `createdBy` as a valid property. A manual test confirms that when all 141 schemas are loaded, `createdBy` IS valid. The error only occurs at runtime, suggesting the issue is either: (1) the schema is not being loaded correctly, or (2) `createdBy` is being added by code that shouldn't add it.

**Tech Stack:** TypeScript, Ajv 2020, JSON Schema

---

## Root Cause Analysis

### What we know:
1. `material-instance` schema has `allOf: - $ref: "./common.schema.yaml#/$defs/FAIRCommon"` which defines `createdBy`
2. A manual test loading all 141 schemas confirms `createdBy` IS valid
3. The error only occurs at runtime when accepting AI placements
4. `lifecycleProvenance` adds `provenance.createdBy` (nested), NOT root-level `createdBy`
5. The update paths in `upsertImplicitMaterialInstance` and `upsertProposedCellsInstance` preserve `createdBy` from existing payloads

### Hypothesis:
The `createdBy` field is being added to the material-instance payload at the root level by code that shouldn't add it there. The `lifecycleProvenance` helper (used for `material-spec`) adds `status: 'proposed'`, `lifecycleId`, and `provenance` - all of which violate the `material-instance` schema. This was already fixed for `upsertProposedCellsInstance` (commit `eac76f8`), but the `createdBy` preservation logic in the update path is also problematic.

### The real issue:
The `material-instance` schema has `unevaluatedProperties: false` at the root level. The `FAIRCommon` mixin defines `createdBy` as valid. But the update paths explicitly preserve `createdAt`, `createdBy`, and `updatedAt` from existing payloads. If an existing payload was created with these fields (possibly by an older version of the code), the update path preserves them. But the schema should allow them via `FAIRCommon`.

**However** - the test confirms `createdBy` IS allowed when all schemas are loaded. So the issue is likely that the payload has `createdBy` in the wrong place, or the validation is happening with a schema that doesn't have `FAIRCommon` loaded.

## Proposed Fix

### Task 1: Remove `createdAt/createdBy/updatedAt` preservation from material-instance update paths

**Objective:** Stop explicitly preserving FAIRCommon provenance fields in material-instance update paths, since they're not defined at the root level of the `material-instance` schema (they're in `FAIRCommon` via `allOf`).

**Files:**
- Modify: `server/src/materials/AddMaterialSupport.ts:590-595` (upsertImplicitMaterialInstance update path)
- Modify: `server/src/materials/AddMaterialSupport.ts:513-518` (upsertProposedCellsInstance update path - if it exists)

**Step 1: Check if upsertProposedCellsInstance has an update path**

Read lines 318-360 of `AddMaterialSupport.ts` to check if `upsertProposedCellsInstance` has an update path that preserves `createdAt/createdBy/updatedAt`.

**Step 2: Remove `createdAt/createdBy/updatedAt` from upsertImplicitMaterialInstance update path**

Change lines 590-595 from:
```typescript
const mergedPayload: Record<string, unknown> = {
  ...(existing.payload as Record<string, unknown>),
  ...payload,
  createdAt: (existing.payload as Record<string, unknown>)['createdAt'],
  createdBy: (existing.payload as Record<string, unknown>)['createdBy'],
  updatedAt: new Date().toISOString(),
};
```

To:
```typescript
const mergedPayload: Record<string, unknown> = {
  ...(existing.payload as Record<string, unknown>),
  ...payload,
};
```

Rationale: The `...payload` spread already includes `prepared_on` and `status` which are the relevant fields for material-instance. The FAIRCommon fields (`createdAt`, `createdBy`, `updatedAt`) are defined in `FAIRCommon` via `allOf`, so they should be allowed by the schema. But explicitly preserving them from the existing payload can cause issues if the existing payload has stale or incorrect values.

**Step 3: Run tests**

Run: `cd server && timeout 60 pnpm vitest run src/materials/AddMaterialSupport.test.ts -- --run`
Expected: 10 passed

**Step 4: Commit**

```bash
git add server/src/materials/AddMaterialSupport.ts
git commit -m "fix(materials): remove createdAt/createdBy/updatedAt preservation from material-instance update"
```

### Task 2: Verify FAIRCommon is being applied correctly

**Objective:** Confirm that `createdBy` is actually allowed by the `material-instance` schema at runtime.

**Files:**
- No code changes needed

**Step 1: Add debug logging to the validation path**

Add a temporary debug log to `server/src/store/RecordStoreImpl.ts` to print the schema being used and the validation result.

**Step 2: Test the AI placement flow**

Accept an AI placement in the event editor and check the server logs.

**Step 3: Remove debug logging**

Remove the temporary debug log.

**Step 4: Commit**

```bash
git add server/src/store/RecordStoreImpl.ts
git commit -m "fix(materials): verify FAIRCommon is applied to material-instance"
```

## Verification

1. Accept an AI-generated placement in the event editor
2. Verify no `Validation failed: /: Unknown property: createdBy` error
3. Verify the material-instance is created with the correct schema

## Risks

- Removing `createdAt/createdBy/updatedAt` preservation may affect provenance tracking. However, these fields are defined in `FAIRCommon` via `allOf`, so they should be allowed by the schema.
- If the existing payload has `createdBy` at the root level, removing the preservation logic means it won't be preserved on update. This is correct behavior - `createdBy` should be set at creation time, not updated.
