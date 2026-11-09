# L2-PROMPT2-SCIENCE-CHAIN-1 — unit u7carrierref Report

**Unit:** per-row carrier record ref (materialSpecRef from component_ref)
**Branch:** cl/lane2-sciencechain1-u7carrierref
**Base:** ae0b09dd

## Step 0 — Precondition
- `git rev-parse --short HEAD` -> ae0b09dd
- `isFormulationCarrierRow` at eventGraph.ts:450
- Precondition PASSED

## Baseline
- mixtureShare.test.ts: 14 passed (14)
- tsc --noEmit: 10 errors (pre-existing, none in eventGraph.ts)

## Step 1 — RED Pin (C-9)
Added C-9: two-entry snapshot with record-kind component_refs (id: MAT-PR9-TEST-DMSO / MAT-PR9-TEST-SOLUTE),
NO event-level material_spec_ref. Asserts solvent row derives fractionOfMixture and carries the per-row id.
Raw failure: `TypeError: .toMatch() expects to receive a string, but got undefined`
Also recut C-5 leg 2: plain-string refs ('solute', 'carrier') instead of record-kind objects, keeping
the toBeUndefined() assertion.

## Step 2 — Implementation (createLedgerEntry options)
- Added `materialSpecRef?: string` to the options interface
- `specRef = options?.materialSpecRef ?? getRecordId(details.material_spec_ref)` — per-row wins, event-level fallback
- Spread: `...(specRef ? { materialSpecRef: specRef } : {})` — safe under exactOptionalPropertyTypes

## Step 3 — Implementation (applyAddMaterial call site)
- Extract `rowSpecRef` from componentRef only when `kind === 'record'` and `id` is a string
- Plain string refs are NOT passed through (getRecordId would return the string verbatim)
- Spread: `...(rowSpecRef ? { materialSpecRef: rowSpecRef } : {})`

## Step 4 — Re-pin suppression leg
C-5 leg 2 recut with plain-string refs to verify string-ref suppression still works.

## Step 5 — Neutering Proof
- Neutered: removed `rowSpecRef` spread -> C-9 FAILED (1 failed | 14 passed)
- Restored: `...(rowSpecRef ? { materialSpecRef: rowSpecRef } : {})` -> all 15 passed
- git checkout restored original code

## Verification
- mixtureShare.test.ts: 15 passed (15)
- addMaterialAttribution.test.ts: 9 passed (9)
- tsc --noEmit: 10 errors (delta: 0 — no new errors in eventGraph.ts)
- git diff --stat: 3 files (eventGraph.ts +17, test +26, report)
- git status: clean

## Precedence
Per-row materialSpecRef WINS over event-level material_spec_ref. Event-level is the fallback
for single-entry/legacy rows. C-9 proves precedence (no event-level ref, per-row id used).

## Scope
- No server changes (ChatbotCompilePasses.ts untouched)
- No YAML changes
- No formatter changes (materialRefLabels.ts, mixtureShareFormat.ts untouched)
- Criteria 2/3 re-enabled at the client level; remain RED on :5193 until server emission leg lands

## Reviewer Bait Checklist
1. VACUOUS PIN: Neuter proof shows C-9 fails without the fix
2. DELETED SUPPRESSION LEG: C-5 leg 2 preserved with plain-string refs, still asserts toBeUndefined()
3. FAKE REF FROM A STRING: record-kind gate (kind === 'record' && typeof id === 'string')
4. HARDCODE BOUNDARY: no 'solvent'/'DMSO'/'MAT-...' in eventGraph.ts
5. exactOptionalPropertyTypes: all spreads use ternary (cond ? { x } : {})
6. SCOPE CREEP: server untouched
7. OVERCLAIM: no browser/live claim, no YAML edited
8. PRECEDENCE AMBIGUITY: per-row wins, event-level fallback — proven in C-9

L2-PROMPT2-SCIENCE-CHAIN-1-u7carrierref UNIT unit DONE 5941c5021df9477ea4af192637f007dbb46f3a3b
