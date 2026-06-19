# Material Instantiation Bug Fix — INVALID_MATERIAL_USAGE

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Fix the `INVALID_MATERIAL_USAGE` error that occurs when accepting AI-proposed material placements (cells) in the event editor, caused by `upsertProposedCellsInstance` creating `material-instance` records with fields that violate the schema.

**Architecture:** The server runs `normalizeEventGraphMaterialUsage` before saving an event graph. For `add_material` events with cells+count, it calls `upsertProposedCellsInstance` to create a `material-instance` record. The function uses `lifecycleProvenance` which adds `status: 'proposed'`, `lifecycleId`, and `provenance` — but these fields don't exist in the `material-instance` schema.

**Tech Stack:** TypeScript, Ajv validation, YAML schemas, vitest

---

## The Complete Data Flow

### Step 1: AI Proposes Material Placement

When the AI proposes adding cells to the event graph, it creates an `add_material` event with:

```yaml
event_type: add_material
eventId: EVT_ADD_CELLS
details:
  material_ref:
    kind: ontology
    id: CL:0000123
    label: "HepG2 Cells"
  count: 10000
  volume:
    value: 200
    unit: uL
```

### Step 2: User Accepts Placement

The user clicks "Accept" in the AI chat panel. The frontend sends the event graph to the backend for validation and storage.

### Step 3: Server Normalizes Material Usage

`RecordHandlers.ts` calls `normalizeEventGraphMaterialUsage` before saving:

```typescript
// RecordHandlers.ts:275
const payload = await normalizeEventGraphMaterialUsage(
  store, EVENT_GRAPH_SCHEMA_ID, payload, materialUsageOptions
);
```

### Step 4: Grounding Pass — Ontology → Local Material

`normalizeAddMaterialDetailsMaterialRefs` runs first, converting the ontology ref to a local material record:

```typescript
// AddMaterialSupport.ts:433-456
async function normalizeAddMaterialDetailsMaterialRefs(store, details) {
  const materialRef = normalizeGroundableRef(details.material_ref, 'material');
  if (materialRef && materialRef.kind !== 'record') {
    // Ontology ref → mint local material record
    out.material_ref = await ensureLocalMaterialRef(store, materialRef, ...);
  }
  return out;
}
```

`ensureLocalMaterialRef` calls `ensureLocalMaterialForOntology` which:
1. Searches for existing local material with matching CURIE
2. If not found, creates `MAT-CL-0000123` with `domain: 'cell_line'`
3. Returns `{ kind: 'record', id: 'MAT-CL-0000123', type: 'material' }`

The grounded `material_ref` is now:
```json
{ "kind": "record", "id": "MAT-CL-0000123", "type": "material" }
```

### Step 5: Materialization Pass — Bare Concept → Instance

After grounding, the normalizer detects: cells (material domain) + count → create a material instance.

```typescript
// AddMaterialSupport.ts:639-654
const proposedSpecRef =
  (await upsertProposedMaterialSpecFromComposition(...))
  ?? (await upsertProposedMaterialSpecFromSingleActive(...));

const proposedInstanceRef = proposedSpecRef
  ? null
  : await upsertProposedCellsInstance(store, eventGraphId, eventId, groundedDetails);
```

`upsertProposedCellsInstance` (lines 318-354) is called because:
- No `material_spec_ref` exists (it's cells, not a chemical)
- No `aliquot_ref` or `material_instance_ref` exists
- `material_ref.kind === 'record'` (grounded to local material)
- `count` is a number > 0

### Step 6: THE BUG — Invalid Payload Created

`upsertProposedCellsInstance` creates this payload:

```typescript
const payload = {
  kind: 'material-instance',
  id: instanceId,                    // MINST-IMPLICIT-EVG_MQLEF7VD_19LR_AI_EVT_ADD_CELLS
  name,
  material_ref: materialRef,
  status: 'proposed',               // ← BUG: NOT in material-instance enum!
  ...lifecycleProvenance(...),       // ← BUG: adds lifecycleId + provenance
  tags: ['ai-draft', 'cells'],
};
```

`lifecycleProvenance` adds:
```typescript
{
  status: 'proposed',               // ← Overwrites the above!
  lifecycleId: 'lab-vocabulary-control',  // ← NOT in schema!
  provenance: { source, sourceLabel, createdBy, createdAt, note }  // ← NOT in schema!
}
```

### Step 7: Schema Validation Fails

`material-instance.schema.yaml` defines:

```yaml
status:
  type: string
  enum: [ available, reserved, consumed, expired, discarded ]

# No lifecycleId
# No provenance
unevaluatedProperties: false
```

Validation rejects:
1. `/status: Must be one of: available, reserved, consumed, expired, discarded` — `'proposed'` is not valid
2. `/: must NOT have unevaluated properties` — `lifecycleId` is not defined
3. `/: must NOT have unevaluated properties` — `provenance` is not defined

Error thrown:
```
MaterialUsagePolicyError: Failed to create proposed material instance MINST-IMPLICIT-EVG_MQLEF7VD_19LR_AI_EVT_ADD_CELLS: /status: Must be one of: available, reserved, consumed, expired, discarded; /: must NOT have unevaluated properties; /: must NOT have unevaluated properties
```

---

## Root Cause Analysis

### Why This Happened

The `lifecycleProvenance` function was designed for `material-spec` records, which HAVE these fields:

**material-spec.schema.yaml** (lines 36-65):
```yaml
status:
  enum: [ proposed, in_review, active, rejected, deprecated ]

lifecycleId:
  const: "lab-vocabulary-control"

provenance:
  type: object
  additionalProperties: false
  properties:
    source: { enum: [ ai_mention, compiler, human, import ] }
    sourceCurie: { type: string }
    sourceLabel: { type: string }
    createdBy: { type: string }
    createdAt: { format: date-time }
    note: { type: string }
```

But `material-instance.schema.yaml` does NOT have these fields:

**material-instance.schema.yaml** (line 84-86):
```yaml
status:
  type: string
  enum: [ available, reserved, consumed, expired, discarded ]
```

The material hierarchy has different lifecycle semantics:
- **material-spec** = vocabulary curation lifecycle (`proposed` → `in_review` → `active`)
- **material-instance** = physical inventory lifecycle (`available` → `reserved` → `consumed`)
- **material** (concept) = vocabulary curation lifecycle (same as material-spec)

### The Schema Design

```
Material (concept) — status: proposed/in_review/active/rejected/deprecated
  ↓ formulation
Material Spec — status: proposed/in_review/active/rejected/deprecated
  ↓ instantiation
Material Instance — status: available/reserved/consumed/expired/discarded
  ↓ aliquoting
Aliquot — status: available/reserved/consumed/expired/discarded
```

The compiler was using the vocabulary lifecycle on a physical inventory record.

---

## The Fix

### Task 1: Fix `upsertProposedCellsInstance` Payload

**Files:**
- Modify: `server/src/materials/AddMaterialSupport.ts:335-343`

**Change:**

Remove `lifecycleProvenance` spread and use correct `material-instance` fields:

```typescript
// BEFORE:
const payload: Record<string, unknown> = {
  kind: 'material-instance',
  id: instanceId,
  name,
  material_ref: materialRef,
  status: 'proposed',
  ...lifecycleProvenance(name, eventGraphId, eventId, ...),
  tags: ['ai-draft', 'cells'],
};

// AFTER:
const payload: Record<string, unknown> = {
  kind: 'material-instance',
  id: instanceId,
  name,
  material_ref: materialRef,
  status: 'available',  // Valid enum value for material-instance
  tags: ['ai-draft', 'cells'],
  description: `Proposed cells instance from accepted add-material ${eventGraphId}:${eventId}.`,
  prepared_on: new Date().toISOString(),
};
```

### Task 2: Verify `upsertProposedMaterialSpecFromComposition` and `upsertProposedMaterialSpecFromSingleActive` Still Work

These functions use `lifecycleProvenance` which IS valid for `material-spec` records. They should be left as-is, but verify they don't accidentally spread `lifecycleProvenance` into a `material-instance`.

**Files:**
- Review: `server/src/materials/AddMaterialSupport.ts:205-256` (composition spec)
- Review: `server/src/materials/AddMaterialSupport.ts:265-310` (single active spec)

Both create `material-spec` records, so `lifecycleProvenance` is correct.

### Task 3: Run Existing Tests

**Files:**
- Test: `server/src/materials/AddMaterialSupport.test.ts`

```bash
cd /home/brad/git/computable-foundry
timeout 60 pnpm vitest run src/materials/AddMaterialSupport.test.ts
```

### Task 4: Add Regression Test

Create a test that verifies `upsertProposedCellsInstance` creates a valid `material-instance` payload.

**Files:**
- Create: `server/src/materials/AddMaterialSupport.cells.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { normalizeEventGraphMaterialUsage } from './AddMaterialSupport.js';
import { createMockStore } from '../testing/mockStore.js';

describe('upsertProposedCellsInstance', () => {
  it('should create material-instance with valid status enum value', async () => {
    const store = createMockStore();
    const graph = {
      id: 'EVT-TEST-001',
      events: [{
        eventId: 'EVT_ADD_CELLS',
        event_type: 'add_material',
        details: {
          material_ref: { kind: 'record', id: 'MAT-HEPG2', type: 'material' },
          count: 10000,
          volume: { value: 200, unit: 'uL' },
        },
      }],
    };
    const result = await normalizeEventGraphMaterialUsage(store, EVENT_GRAPH_SCHEMA_ID, graph);
    // Verify the material-instance was created with status: 'available'
  });
});
```

---

## Files to Change

| File | Action | Lines |
|------|--------|-------|
| `server/src/materials/AddMaterialSupport.ts` | Modify | 335-343 (remove lifecycleProvenance, fix status) |

## Verification

1. Run `pnpm vitest run src/materials/AddMaterialSupport.test.ts` — all existing tests pass
2. Run `pnpm vitest run src/materials/AddMaterialSupport.cells.test.ts` — new test passes
3. Accept an AI-proposed cells placement in the event editor — no more `INVALID_MATERIAL_USAGE` error

## Risks

- **Low:** The change is localized to one function. No schema changes needed.
- **Medium:** If `upsertImplicitMaterialInstance` also uses `lifecycleProvenance` incorrectly, it has the same bug. Check line 537-612.

## Open Questions

- Should `material-instance` schema gain `provenance` and `lifecycleId` fields? This would allow the compiler to track provenance for AI-proposed instances. Currently the schema treats instances as physical inventory, not vocabulary concepts. Adding these fields would blur the hierarchy.
- Should the `material-instance` schema gain `status: 'proposed'`? This would allow instances to be in a "pending curation" state before becoming `available`. Currently the schema jumps straight to `available`.

---

## Summary

**The Bug:** `upsertProposedCellsInstance` uses `lifecycleProvenance` which adds `status: 'proposed'`, `lifecycleId`, and `provenance` fields to a `material-instance` record. The `material-instance` schema only allows `status: [available, reserved, consumed, expired, discarded]` and doesn't define `lifecycleId` or `provenance`.

**The Fix:** Remove `lifecycleProvenance` from `upsertProposedCellsInstance` and use `status: 'available'` (the correct lifecycle value for a newly created physical instance).

**The Root Cause:** `lifecycleProvenance` was designed for `material-spec` (vocabulary curation lifecycle) but was reused for `material-instance` (physical inventory lifecycle). The two have different status enums and field definitions.

**The General Approach for Instantiating a New Term:**

1. **Ground:** Convert ontology CURIE → local material record (`MAT-CL-0000123`) via `ensureLocalMaterialForOntology`
2. **Materialize:** Convert bare concept + experimental details → concrete instance/spec via `upsertProposed*`
3. **Validate:** Schema validation (Ajv) ensures all fields match the schema definition
4. **Store:** Persist the record to the embedded Git repository

The material hierarchy is strict: concept → formulation → instance → aliquot. Each layer has its own schema, status enum, and lifecycle. The compiler must respect these boundaries.
