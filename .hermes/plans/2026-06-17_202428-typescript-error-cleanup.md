# TypeScript Error Cleanup Plan

> **For Hermes:** Execute this plan task-by-task. Verify `pnpm run typecheck` after each phase.

**Goal:** Reduce TypeScript errors from 540 to 0 across server and app workspaces.

**Architecture:** Errors fall into 6 categories. Each phase targets one category. Phases are ordered from quickest/biggest impact to hardest.

**Tech Stack:** TypeScript 5.3 (server, strict + exactOptionalPropertyTypes), TypeScript 5.3 (app, strict), vitest 1, @testing-library/jest-dom

---

## Phase 1: Remove unused imports/variables (62 errors, ~20 min)

**Error codes:** TS6133 (31), TS6196 (12)
**Risk:** Zero — purely removing dead code.

### Task 1.1: Clean server unused imports/variables

**Files (14 errors):**
- `server/src/compiler/pipeline/passes/DeterministicPrecompilePass.ts:633` — unused `tags`
- `server/src/compiler/pipeline/passes/EventsEmitPass.ts:200` — unused `phases`
- `server/src/compiler/pipeline/passes/LocalProtocolPasses.ts:312` — unused `step`
- `server/src/compiler/pipeline/passes/ProtocolExtractPass.ts:75` — unused `evidenceCitations`
- `server/src/compiler/pipeline/fixtures/FixtureDiff.ts:51` — unused `expectedContainsActual`
- `server/src/compiler/pipeline/fixtures/FixtureRunner.ts:16` — unused `FileAttachment`
- `server/src/compiler/directives/Directive.ts:15` — unused `MountedPipette`
- `server/src/compiler/pipeline/passes/LabContextResolvePass.ts:17` — unused `PassDiagnostic`
- `server/src/api/handlers/UIHandlers.ts:454,455,465` — unused `recordId`, `query`, `resolvedLimit`
- `server/src/api/handlers/ProcurementHandlers.ts:10` — unused `RecordEnvelope`; `:58` — unused `sourceType`

**Step 1:** Open each file, locate the unused import/variable, delete the import or variable.

**Step 2:** Run `pnpm --filter server exec tsc --noEmit 2>&1 | grep "TS6133\|TS6196"` to verify all gone.

**Expected:** 14 fewer server errors.

### Task 1.2: Clean app unused imports/variables

**Files (43 errors across ~30 files):**

Production code (15 errors):
- `src/components/registry/SlideOverEditor.tsx:24,25` — unused `uiSpec`, `schema`
- `src/editor/RawRecordEditor.tsx:11` — unused `TapTabEditor`
- `src/editor/RecordViewer.tsx:23,24` — unused `uiSpec`, `schema`
- `src/editor/material/VendorProductBuilderModal.tsx:28` — unused `VENDOR_SEARCH_VENDORS`
- `src/editor/taptab/widgets/ReflistWidget.tsx:59,62` — unused `refKind`, `onRefSelect`
- `src/graph/BindingMode/BindingModeEditor.tsx:5,94` — unused `PlatformManifest`, `compileError`
- `src/graph/BindingMode/SampleBindingPanel.tsx:36` — unused `currentSampleMap`
- `src/knowledge/browser/CreateNodeModal.tsx:11,69,70` — unused `isDirty`, `originalData`, `isDirtyState`
- `src/knowledge/browser/RecordPreviewPanel.tsx:17` — unused `JSONContent`
- `src/knowledge/browser/RecordPreviewPanel.tsx:205` — unused `f`
- `src/pages/RecordRegistryPage.tsx:1` — unused `useMemo`
- `src/protocol-ide/CommentBadge.tsx:6` — unused `CommentAnchor`
- `src/protocol-ide/FeedbackCommentForm.tsx:17,44` — unused `onSubmit`, `label`
- `src/protocol-ide/ProtocolIdeActionRail.tsx:33,166` — unused `useState`, `session`
- `src/protocol-ide/ProtocolIdeIntakePane.tsx:28` — unused `ProtocolIdeSession`
- `src/protocol-ide/ProtocolIdeSourcePane.tsx:113` — unused `session`

Test code (28 errors):
- `src/graph/BindingMode/SampleBindingPanel.test.tsx` — 16 errors, all unused
- `src/editor/taptab/widgets/ChipComboboxWidget.test.tsx` — 10 errors
- `src/editor/RawRecordEditor.test.tsx` — 10 errors (includes unknown `mockClient`)
- `src/protocol-ide/ProtocolIdeActionRail.test.tsx` — 10 errors
- `src/graph/BindingMode/BindingModeEditor.test.tsx` — 10 errors
- `src/components/registry/SlideOverEditor.test.tsx` — 9 errors
- `src/protocol-ide/ProtocolIdeShell.PlanExecutionButton.test.tsx` — 8 errors
- `src/protocol-ide/ProtocolIdeLabContextPanel.test.tsx` — 8 errors
- `src/pages/RecordRegistryPage.test.tsx` — 7 errors
- `src/protocol-ide/ProtocolIdeShell.test.tsx` — 6 errors
- `src/protocol-ide/ProtocolIdeGraphReviewSurface.test.tsx` — 5 errors
- `src/protocol-ide/ProtocolIdeExportActions.test.tsx` — 5 errors
- `src/extensions/ExtensionContext.test.tsx` — 4 errors

**Step 1:** Open each file, remove unused imports and variables.

**Step 2:** Run `pnpm --filter app exec tsc --noEmit 2>&1 | grep "TS6133\|TS6196"` to verify.

**Expected:** 43 fewer app errors.

---

## Phase 2: Fix test assertion types — 283 errors, ~30 min

**Root cause:** `tsc` doesn't know about vitest globals. When tsc type-checks test files, it doesn't recognize `expect(element).toHaveTextContent()` because:
- `expect` is a vitest global not declared for tsc
- `toHaveTextContent` etc. come from `@testing-library/jest-dom` type augmentation of vitest's `Assertion`
- The app has `src/vitest.d.ts` which imports the augmentation, but tsc doesn't know vitest's base types

**Fix:** Add vitest types to the app tsconfig so tsc knows the `Assertion` type and globals.

### Task 2.1: Add vitest types to app tsconfig

**File:** `app/tsconfig.json`

**Step 1:** Check if `vitest` is already in devDependencies. It is (v1.6.0).

**Step 2:** Create `app/src/vitest-globals.d.ts` (or modify existing `app/src/vitest.d.ts`):

```typescript
// Bring in vitest globals for tsc --noEmit type checking
/// <reference types="vitest/globals" />
import '@testing-library/jest-dom/vitest';
```

**Step 3:** In `app/tsconfig.json`, ensure `include` covers this file. Current include is `"src"` — already covers it.

**Step 4:** Run `pnpm --filter app exec tsc --noEmit 2>&1 | grep "error TS2339" | head` to verify reduction.

**Expected:** ~283 fewer app errors (all TS2339 in test files).

### Task 2.2: Verify test assertion errors are eliminated

**Step 1:** Run full `pnpm --filter app exec tsc --noEmit 2>&1 | grep "error TS"` and confirm TS2339 count in test files is ~0.

**Step 2:** If residual TS2339 errors remain in test files, they're real (not assertion-related) and belong in Phase 5.

---

## Phase 3: Fix `exactOptionalPropertyTypes` violations — 48 errors, ~60 min

**Root cause:** Server tsconfig has `exactOptionalPropertyTypes: true`. With this flag, `foo?: string` means "absent or string" — NOT "absent, string, or undefined". Passing `undefined` to an optional property is a type error.

**Error codes:** TS2375 (6), TS2379 (4), TS2412 (4), TS2418 (4)

### Task 3.1: Fix UIHandlers.ts exact optional violations

**File:** `server/src/api/handlers/UIHandlers.ts:152`

**Error:** `Type 'ProcurementManifest | undefined' is not assignable to type 'ProcurementManifest'`

**Fix:** Check the `ProcurementManifest` type in `ProtocolIdeProjectionContracts.ts`. If it should accept `undefined`, widen the property type to `ProcurementManifest | undefined`. If it should be absent when not set, use conditional property assignment:
```typescript
// Instead of: obj.manifest = maybeUndefined
// Use:
const result: SomeType = { ...base };
if (manifest != null) result.manifest = manifest;
```

### Task 3.2: Fix ProtocolIdeIssueCardService.ts exact optional violations

**File:** `server/src/protocol/ProtocolIdeIssueCardService.ts:343`

**Error:** `generatedAt` passed as `undefined` to optional property.

**Fix:** Use conditional assignment pattern. Either:
```typescript
const card: IssueCard = { ...base };
if (generatedAt != null) card.generatedAt = generatedAt;
```
Or widen the type to accept `| undefined`.

### Task 3.3: Fix ExtractHandlers.ts exact optional violations

**File:** `server/src/api/handlers/ExtractHandlers.ts:188`

**Error:** Object literal with `?: AmbiguitySpan[]` etc. not assignable with `exactOptionalPropertyTypes`.

**Fix:** Same pattern — use conditional property assignment or widen the `ExtractionCandidate` type.

### Task 3.4: Fix ProtocolIdeProjectionContracts.ts exact optional violations

**File:** `server/src/protocol/ProtocolIdeProjectionContracts.ts:379,494`

**Errors:** Two large type assignments with optional properties being set to `undefined`.

**Fix:** Inspect `OverlaySummaryToggles` and `ProjectionResponse` types. Either:
1. Widen the types to accept `| undefined` on the affected properties
2. Use conditional assignment in callers

### Task 3.5: Fix ProtocolIdeOverlaySummaryService.ts exact optional violations

**File:** `server/src/protocol/ProtocolIdeOverlaySummaryService.ts:721`

**Error:** `BudgetSummary` type violation.

**Fix:** Check `BudgetSummary` type definition. Widen or use conditional assignment.

### Task 3.6: Fix EventsEmitPass.ts exact optional violations

**File:** `server/src/compiler/pipeline/passes/EventsEmitPass.ts:337`

**Error:** `PassResult` with `diagnostics: PassDiagnostic[] | undefined`.

**Fix:** Check `PassResult` type — widen `diagnostics` to `PassDiagnostic[] | undefined` or use conditional assignment.

### Task 3.7: Fix FixtureTypes.ts exact optional violations

**File:** `server/src/compiler/pipeline/fixtures/FixtureTypes.ts:130`

**Fix:** `FixtureInput` type — widen affected properties or fix at call site.

### Task 3.8: Fix ZymoNormalization.ts exact optional violations

**File:** `server/src/ingestion/vendor-protocol/ZymoNormalization.ts:438`

**Fix:** `ProtocolAdaptationGap` type — widen or fix at call site.

### Task 3.9: Fix EditorSuggestionService.ts exact optional violations

**File:** `server/src/ui/EditorSuggestionService.ts`

**Fix:** 8 errors total. Trace each to the affected type definition and apply conditional assignment or type widening.

### Task 3.10: Fix EditorProjectionService.ts exact optional violations

**File:** `server/src/ui/EditorProjectionService.ts`

**Fix:** 8 errors total. Same pattern.

**Verification:** Run `pnpm --filter server exec tsc --noEmit 2>&1 | grep "TS2375\|TS2379\|TS2412\|TS2418"` — should be 0.

---

## Phase 4: Fix broken imports & real bugs — 19 errors, ~45 min

### Task 4.1: Fix BiologyVerbExpander.ts self-import & missing types

**File:** `server/src/compiler/biology/BiologyVerbExpander.ts:112-121`

**Bug:** Line 112 does `import type { PlateEventPrimitive } from '../../biology/BiologyVerbExpander.js'` — this is a circular self-import. Lines 114-121 use `Pass`, `PassRunArgs`, `PassResult`, `PassDiagnostic` without importing them.

**Fix:**
1. Remove the self-import (line 112) — `PlateEventPrimitive` is already defined in this file (line 108)
2. Import missing types from the pipeline types module:
```typescript
import type { Pass, PassRunArgs, PassResult, PassDiagnostic } from '../../pipeline/types';
```
(Verify the actual import path — likely `../../pipeline/types.ts` or similar)

### Task 4.2: Fix vendorCatalogPage.ts duplicate object properties

**File:** `server/src/ingestion/adapters/vendorCatalogPage.ts:91-92`

**Bug:** `CURRENCY_SYMBOLS` object has `'kr'` key defined three times (SEK, NOK, DKK on lines 91-93).

**Fix:** Replace with a single entry or restructure. Options:
```typescript
// Option A: Pick one (SEK is most common)
'kr': 'SEK',

// Option B: Map to multiple currencies
'kr': 'SEK|NOK|DKK',
```
Or restructure to handle ambiguous symbols in `detectCurrencyFromSymbol`.

### Task 4.3: Fix ProtocolIdeIntakePane.tsx variable used before assignment

**File:** `app/src/protocol-ide/ProtocolIdeIntakePane.tsx:290`

**Bug:** Variable `source` is used before being assigned.

**Fix:** Read the surrounding code to understand the control flow. Likely a missing `const source = ...` before line 290, or a variable hoisting issue.

### Task 4.4: Fix src/index.ts duplicate exports

**File:** `server/src/index.ts`

**Errors:** Duplicate exports `slugify` and `EditorProjectionResponse`.

**Fix:** Read the file, find duplicate `export` statements, remove one of each.

### Task 4.5: Fix ProtocolIdeSourcePane.tsx missing module

**File:** `app/src/protocol-ide/ProtocolIdeSourcePane.tsx:27`

**Error:** Cannot find module `../../types/ingestion`

**Fix:** 
1. Search for the actual module path: `find app/src -name "*ingestion*" -type f`
2. If the file exists at a different path, update the import
3. If it doesn't exist, check git history or create stub types

### Task 4.6: Fix RecordPreviewPanel.tsx broken imports

**File:** `app/src/knowledge/browser/RecordPreviewPanel.tsx:13,17`

**Errors:** 
- `buildProjectionDocument` not exported from `../../editor/taptab/TapTabEditor`
- `JSONContent` not exported from `../../editor/taptab/documentMapper`

**Fix:**
1. Check what IS exported from those modules: `grep "export" app/src/editor/taptab/TapTabEditor.ts` and `grep "export" app/src/editor/taptab/documentMapper.ts`
2. Fix import paths or create missing exports
3. If types have moved, update import to correct location

---

## Phase 5: Fix null/undefined guards & type drift — 46 errors, ~60 min

### Task 5.1: Server null guards (16 errors)

**Files:**
- `server/src/api/handlers/ExtractHandlers.ts:88` — possibly undefined
- `server/src/compiler/biology/BiologyVerbExpander.ts:138,139` — undefined index/argument
- `server/src/compiler/directives/Directive.ts:89` — possibly undefined
- `server/src/compiler/pipeline/PipelineRunner.ts:120,123` — undefined index
- `server/src/compiler/pipeline/passes/DeterministicPrecompilePass.ts:285` — possibly undefined
- `server/src/compiler/pipeline/passes/LabContextResolvePass.ts:80` — possibly undefined
- `server/src/ingestion/adapters/vendorCatalogPage.ts:69,133,145,195,200,248,251,271,311` — 8 possibly undefined

**Fix pattern:** Add null checks before access:
```typescript
// Instead of: x.prop
// Use: x?.prop or x && x.prop
// Or: guard at top of function
if (!x) return;
```

### Task 5.2: Server type drift (28 errors)

**Files & patterns:**

**ProtocolIdeOverlaySummaryService.ts (11 errors):**
- `:268` — `instanceId: string | undefined` → `string`. Fix: widen type or guard.
- `:476-480` — `DirectiveKind` doesn't include `'pipette_mount'`/`'pipette_swap'`. Fix: check `DirectiveKind` enum definition, add missing values or fix the comparison.
- `:734` — Cannot find name `LabwareInstance`. Fix: add missing import.
- `:743` — `materials` is of type `unknown`. Fix: add type assertion or proper typing.

**ProtocolIdeIssueCardService.ts (10 errors):**
- `:272-276` — `sourceAnchor` doesn't exist on `FeedbackComment`. Fix: check type definition, add property or use type guard.
- `:349-350` — `graphAnchor` doesn't exist on `FeedbackComment`. Same pattern.
- `:544,619` — Spread types may only be created from object types. Fix: add null guard before spread.

**ZymoNormalization.ts (10 errors):**
- `:142,163,184` — Type arrays not assignable to `NormalizedProtocolRole[]`. Fix: inspect `NormalizedProtocolRole` type and ensure role objects have all required fields.
- `:176,191,194` — Properties `normalizedId`, `status` don't exist on union type arms. Fix: either ensure all union arms have these properties, or use type narrowing.
- `:299` — `number | undefined` not assignable to `number`. Fix: null guard.
- `:369` — `ProtocolStepAdaptation` mismatch. Fix: check type definition.

**DeterministicPrecompilePass.ts (5 errors):**
- `:636` — `undefined` must have iterator method. Fix: guard before destructure.
- `:638,645` — `deckSlot` doesn't exist on type. Fix: check type definition or use as assertion.
- `:651` — `WellMatch[]` not assignable to `string[]`. Fix: map or widen type.
- `:1388` — `prepMatch.index` possibly undefined. Fix: null guard.

**Other:**
- `server/src/compiler/pipeline/passes/ProtocolExtractPass.ts:80` — Unused `@ts-expect-error` directive. Fix: remove the directive (the error it was suppressing is now gone).
- `server/src/compiler/pipeline/passes/QuadrantStampExpander.ts:35` — Cast `PatternEvent` to `Record<string, unknown>`. Fix: cast through `unknown`.
- `server/src/compiler/pipeline/fixtures/FixtureDiff.ts:226` — Same cast pattern.
- `server/src/compiler/pipeline/fixtures/FixtureRunner.ts:31` — `target_kind` doesn't exist on `ExtractionDraftBody`. Fix: check type definition.

### Task 5.3: App null guards & type drift (38 errors)

**Files:**

**BindingModeEditor.tsx (12 errors):**
- `:112,154,285` — Cast `Record<string, unknown>` to `PlannedRunPayload`. Fix: cast through `unknown`: `as unknown as PlannedRunPayload`
- `:173,177` — Cast to `LocalProtocolPayload`. Same pattern.
- `:252` — `RunPlanCompileResult` mismatch. Fix: check type shape.
- `:319,320` — `roleType?: string` not assignable to `roleType: string`. Fix: widen type or add default.
- `:328` — `string | undefined` not assignable to `string`. Fix: null guard or default.
- `:342` — Labware type mismatch. Fix: check `Labware` type.

**RecordPreviewPanel.tsx (7 errors):**
- `:84,439` — `ProjectionSlot[]` type mismatch. Fix: check if slot types have drifted.
- `:231,235` — Implicit any on parameters. Fix: add type annotations.

**WorkspaceContext.tsx (2 errors):**
- `:158,166` — `WorkspaceState` not assignable to `WorkspaceStateApi & WorkspaceState`. Fix: check intersection type.

**AiTabPanel.tsx (2 errors):**
- `:232,266` — `activeDeckScope` doesn't exist on type. Fix: add property to context type.

**systemPromptForViewer.ts (1 error):**
- `:30` — Type `"document" | "deck" | ...` not assignable to `SystemPromptKind`. Fix: widen `SystemPromptKind` type.

**Other (3 errors):**
- `RunEditorRouter.tsx:32,48` — `kind` doesn't exist on `RecordEnvelope`. Fix: check type.
- `BudgetDocumentSurface.tsx:85` — Spread type may only be created from object types. Fix: null guard.

---

## Phase 6: Verification & regression

### Task 6.1: Final typecheck

**Step 1:** Run `pnpm run typecheck` (covers both workspaces)
**Expected:** 0 errors

### Task 6.2: Test verification

**Step 1:** Run `pnpm run test:unit` (server) and `pnpm --filter app exec vitest run` (app)
**Expected:** No new test failures beyond pre-existing ones

### Task 6.3: Git commit

```bash
git add -A
git commit -m "fix(types): resolve 540 TypeScript errors across server and app

- Remove 62 unused imports/variables (TS6133, TS6196)
- Fix test assertion types with vitest globals reference (TS2339)
- Fix exactOptionalPropertyTypes violations with conditional assignment
- Fix broken imports (BiologyVerbExpander self-import, missing modules)
- Fix duplicate object properties in vendorCatalogPage
- Fix variable used before assignment in ProtocolIdeIntakePane
- Fix type drift in ZymoNormalization, BindingModeEditor, etc.
- Add null/undefined guards across 20+ files"
```

---

## Summary Table

| Phase | Category | Server Errors | App Errors | Total | Est. Time | Risk |
|-------|----------|---------------|------------|-------|-----------|------|
| 1 | Unused code | 14 | 43 | 57 | 20 min | None |
| 2 | Test assertions | 0 | 283 | 283 | 30 min | Low |
| 3 | exactOptionalPropertyTypes | 14 | 0 | 14 | 60 min | Medium |
| 4 | Broken imports & real bugs | 9 | 6 | 15 | 45 min | Medium |
| 5 | Null guards & type drift | 28 | 18 | 46 | 60 min | Medium |
| 6 | Verification | — | — | — | 15 min | None |
| **Total** | | **143** | **397** | **540** | **~3.25h** | |

## Files By Error Count (top 20)

| File | Errors | Phase |
|------|--------|-------|
| `app/src/extraction/ExtractionReviewPage.test.tsx` | 63 | 2 |
| `app/src/editor/taptab/DocumentShell.test.tsx` | 29 | 2 |
| `app/src/extraction/ExtractionDraftsListPage.test.tsx` | 23 | 2 |
| `app/src/protocol-ide/ProtocolIdeIntakePane.test.tsx` | 19 | 2 |
| `app/src/graph/BindingMode/SampleBindingPanel.test.tsx` | 16 | 1 |
| `app/src/protocol-ide/ProtocolIdeSourcePane.test.tsx` | 17 | 2 |
| `app/src/knowledge/browser/RecordPreviewPanel.test.tsx` | 17 | 2 |
| `app/src/graph/BindingMode/BindingModeEditor.compile.test.tsx` | 17 | 2 |
| `app/src/graph/BindingMode/BindingModeEditor.test.tsx` | 10 | 1+2 |
| `server/src/ingestion/adapters/vendorCatalogPage.ts` | 12 | 4+5 |
| `server/src/protocol/ProtocolIdeOverlaySummaryService.ts` | 11 | 1+3+5 |
| `server/src/protocol/ProtocolIdeIssueCardService.ts` | 10 | 3+5 |
| `server/src/ingestion/vendor-protocol/ZymoNormalization.ts` | 10 | 3+5 |
| `server/src/ui/EditorSuggestionService.ts` | 8 | 1+3 |
| `server/src/ui/EditorProjectionService.ts` | 8 | 3 |
| `server/src/protocol/ProtocolIdeProjectionContracts.ts` | 8 | 3 |
| `app/src/graph/BindingMode/BindingModeEditor.tsx` | 12 | 1+5 |
| `server/src/compiler/pipeline/passes/RunPlanValidationPasses.ts` | 8 | 3 |
| `server/src/compiler/pipeline/passes/DeterministicPrecompilePass.ts` | 7 | 1+5 |
| `server/src/compiler/biology/BiologyVerbExpander.ts` | 7 | 4+5 |

## Risks & Tradeoffs

1. **exactOptionalPropertyTypes fixes:** Widen types vs conditional assignment. Widening is safer (less behavioral change) but technically less strict. Conditional assignment is stricter but requires more code changes. **Recommendation:** Use conditional assignment for new code paths, widen types for existing ones to minimize risk.

2. **Test assertion fix:** Adding `vitest/globals` reference may expose other test typing issues. The 283 TS2339 errors are all assertion-related; if the reference fixes them, great. If it exposes new errors, those are real and should be addressed in Phase 5.

3. **Type widening in ZymoNormalization:** This file has the most complex type mismatches. Rather than widening types, inspect whether the normalization logic actually produces the correct shape and fix the data, not the types.

4. **BiologyVerbExpander self-import:** This is a clear bug — the file imports from itself and uses undefined types. The fix requires identifying the correct import path for `Pass`, `PassRunArgs`, etc.
