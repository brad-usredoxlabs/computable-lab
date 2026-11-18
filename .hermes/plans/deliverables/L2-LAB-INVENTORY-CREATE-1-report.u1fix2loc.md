# L2-LAB-INVENTORY-CREATE-1 — UNIT u1fix2loc-fix1 Report

## Summary
Cycle c2 from adversarial review: zero product-behavior change. Strengthened test file with non-canonical enum, added kind-only location leg, removed dead guard, added Ajv schema-convention assertion.

## Changes
- app/src/collections/LabwareInstanceCreateModal.test.tsx (edited)
  - DEFECT 2: Changed mock enum from canonical ['bench', 'incubator', 'freezer', 'instrument', 'rack', 'other'] to non-canonical ['workbench', 'cold-room']
  - DEFECT 2: Added assertion (vi) that getSchemaSpy was called with labware-instance schema id and option values match served enum exactly
  - DEFECT 2: Added leg (vii) where schema exposes NO location.kind.enum — select renders only placeholder
  - DEFECT 3: Added leg (v) — kind selected, location label empty, payload.location deep-equals { kind: 'workbench' }
  - DEFECT 5: Removed dead guard (if block checking kind !== 'other'); replaced with expect(payload).not.toHaveProperty('location')
  - Updated existing tests (iii), (iv) to use 'workbench' instead of 'bench'
- server/src/validation/LabwareInstanceLocationKind.test.ts (new)
  - DEFECT 4: Ajv-level schema assertion proving kind 'somewhere' REJECTED and 'bench' ACCEPTED

## Test Results

### Baseline (before edits) — 4/4 pass
```
 ✓ src/collections/LabwareInstanceCreateModal.test.tsx  (4 tests) 110ms
 Test Files  1 passed (1)
      Tests  4 passed (4)
```

### After edits — 7/7 pass
```
 ✓ src/collections/LabwareInstanceCreateModal.test.tsx  (7 tests) 119ms
 Test Files  1 passed (1)
      Tests  7 passed (7)
```

### Server Ajv test — 2/2 pass
```
 ✓ src/validation/LabwareInstanceLocationKind.test.ts  (2 tests) 338ms
 Test Files  1 passed (1)
      Tests  2 passed (2)
```

### Mutation self-check (hardcoded enum in modal) — 4 failures
```
 ❯ src/collections/LabwareInstanceCreateModal.test.tsx  (7 tests | 4 failed)
   (iv) location carries the chosen kind when selected from the dropdown
     → expected undefined not to be undefined
   (v) location is kind-only (no label key) when label input is empty
     → expected undefined to deeply equal { kind: 'workbench' }
   (vi) rendered option values match the served schema enum exactly
     → expected "spy" to be called with arguments: [ Array(1) ]; Number of calls: 0
   (vii) when schema exposes no location.kind.enum, select renders no real kind options
     → expected [ '', 'bench', 'incubator', …(4) ] to deeply equal [ '' ]
```

### Mutation self-check — revert to 7/7 green
```
 ✓ src/collections/LabwareInstanceCreateModal.test.tsx  (7 tests) 119ms
 Test Files  1 passed (1)
      Tests  7 passed (7)
```

### MUTANT D — unconditional label — 1 failure (test v)
```
 FAIL  LabwareInstanceCreateModal > (v) location is kind-only (no label key) when label input is empty
   → expected { kind: 'workbench', label: '' } to deeply equal { kind: 'workbench' }
```

## Commit
333877f59a7d940f9873a78637bd50eb2fdb85e1

L2-LABINV-u1fix2loc-fix1 UNIT unit DONE 333877f59a7d940f9873a78637bd50eb2fdb85e1
