# Beaker and Flask Labware Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Add beaker and flask labware types (6 sizes each) to the event editor, visible in the labware menu, lawn-only compatible, with distinct beaker/flask shaped icons.

**Architecture:** Follow the established pattern for lawn-only bench equipment (like `tubeset_4way_*`). Each glassware size is a single-vessel labware with `addressing.type: 'single'` and `lawnOnly: true`. A new `glassware` UI category groups them in the add-labware dialog. Rendering reuses the existing single-vessel SVG path.

**Tech Stack:** TypeScript, React, Vitest. Single file modified: `app/src/types/labware.ts`, plus tests and dialog.

---

## Background

### How labware types work

Each labware type is defined in `app/src/types/labware.ts` across several structures:

1. **`LabwareType` union** (line 34-76): The enum of all valid type strings
2. **`LABWARE_TYPE_LABELS`** (line 81-118): Display name per type
3. **`LABWARE_TYPE_ICONS`** (line 123-160): Emoji/icon per type
4. **`LABWARE_CATEGORIES`** (line 167-204): Maps type to category (`plate` | `reservoir` | `tube` | `tiprack`)
5. **`LABWARE_CONFIGS`** (line 308+): Full runtime config per type (addressing, geometry, colors, `lawnOnly`, etc.)
6. **`isLawnOnlyLabwareType()`** (line 1158): Reads `lawnOnly` from `LABWARE_CONFIGS` — no code changes needed for new types

### How lawn-only works

- `validatePlacement()` in `placementRules.ts` (line 49) calls `isLawnOnlyLabwareType()` and rejects slot placements
- `AddLabwareDialog.tsx` (line 58) filters out lawn-only types when `surfaceKind === 'slot'`
- Both are **config-driven** — adding `lawnOnly: true` to a LABWARE_CONFIGS entry automatically enforces the constraint

### How single-vessel rendering works

- `LabwareGlyph.tsx` (line 92-103): When `drawnCols === 1 && drawnRows === 1`, draws a single circle with optional inner mark
- `DeckVisualizationPanel.tsx` (line 289-293): `SingleTubeSvg` renders a circle in a rounded rect frame
- Beakers and flasks use `addressing.type: 'single'`, so they follow this exact path — no new SVG needed

### New types

12 new labware types (2 shapes x 6 sizes):

| Type | Label |
|------|-------|
| `beaker_25ml` | 25 mL Beaker |
| `beaker_50ml` | 50 mL Beaker |
| `beaker_100ml` | 100 mL Beaker |
| `beaker_250ml` | 250 mL Beaker |
| `beaker_500ml` | 500 mL Beaker |
| `beaker_1000ml` | 1 L Beaker |
| `flask_25ml` | 25 mL Flask |
| `flask_50ml` | 50 mL Flask |
| `flask_100ml` | 100 mL Flask |
| `flask_250ml` | 250 mL Flask |
| `flask_500ml` | 500 mL Flask |
| `flask_1000ml` | 1 L Flask |

Volume geometry per size:

| Size | maxVolume_uL | minVolume_uL |
|------|-------------|-------------|
| 25 mL | 25000 | 1000 |
| 50 mL | 50000 | 2000 |
| 100 mL | 100000 | 5000 |
| 250 mL | 250000 | 5000 |
| 500 mL | 500000 | 10000 |
| 1000 mL | 1000000 | 20000 |

---

### Task 1: Add new types to `LabwareType` union

**Objective:** Extend the `LabwareType` union enum with 12 new type strings.

**Files:**
- Modify: `app/src/types/labware.ts:34-76`

**Step 1: Add the 12 new types to the union**

Find the `LabwareType` union (lines 34-76) and add these 12 entries at the end, before the closing pipe:

```typescript
  // Lawn-only glassware — freeform bench vessels (beakers and flasks)
  | 'beaker_25ml'
  | 'beaker_50ml'
  | 'beaker_100ml'
  | 'beaker_250ml'
  | 'beaker_500ml'
  | 'beaker_1000ml'
  | 'flask_25ml'
  | 'flask_50ml'
  | 'flask_100ml'
  | 'flask_250ml'
  | 'flask_500ml'
  | 'flask_1000ml'
```

**Step 2: Verify TypeScript compiles**

Run: `cd app && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add app/src/types/labware.ts
git commit -m "type(labware): add beaker and flask type strings to LabwareType union"
```

---

### Task 2: Add `glassware` category and update `LabwareCategory` type

**Objective:** Add `glassware` as a new category for grouping in the UI.

**Files:**
- Modify: `app/src/types/labware.ts:165`

**Step 1: Extend the `LabwareCategory` type**

Change line 165 from:
```typescript
export type LabwareCategory = 'plate' | 'reservoir' | 'tube' | 'tiprack'
```
to:
```typescript
export type LabwareCategory = 'plate' | 'reservoir' | 'tube' | 'tiprack' | 'glassware'
```

**Step 2: Verify TypeScript compiles**

Run: `cd app && npx tsc --noEmit`
Expected: Errors in `AddLabwareDialog.tsx` because `CATEGORY_ORDER` and `CATEGORY_LABELS` don't include `'glassware'` yet. This is expected — we'll fix it in Task 6.

**Step 3: Commit**

```bash
git add app/src/types/labware.ts
git commit -m "type(labware): add glassware to LabwareCategory union"
```

---

### Task 3: Add labels for beaker and flask types

**Objective:** Add display names for all 12 new types in `LABWARE_TYPE_LABELS`.

**Files:**
- Modify: `app/src/types/labware.ts:81-118`

**Step 1: Add 12 entries to `LABWARE_TYPE_LABELS`**

Add at the end of the object (before the closing `}`):

```typescript
  beaker_25ml: '25 mL Beaker',
  beaker_50ml: '50 mL Beaker',
  beaker_100ml: '100 mL Beaker',
  beaker_250ml: '250 mL Beaker',
  beaker_500ml: '500 mL Beaker',
  beaker_1000ml: '1 L Beaker',
  flask_25ml: '25 mL Flask',
  flask_50ml: '50 mL Flask',
  flask_100ml: '100 mL Flask',
  flask_250ml: '250 mL Flask',
  flask_500ml: '500 mL Flask',
  flask_1000ml: '1 L Flask',
```

**Step 2: Verify TypeScript compiles**

Run: `cd app && npx tsc --noEmit`
Expected: Still errors about missing entries in `LABWARE_TYPE_ICONS` and `LABWARE_CATEGORIES` (expected — those come next)

**Step 3: Commit**

```bash
git add app/src/types/labware.ts
git commit -m "feat(labware): add display labels for beaker and flask types"
```

---

### Task 4: Add icons for beaker and flask types

**Objective:** Assign distinct icons to beakers and flasks in `LABWARE_TYPE_ICONS`.

**Files:**
- Modify: `app/src/types/labware.ts:123-160`

**Step 1: Choose icons**

- Beakers: `🧫` (petri dish — cylindrical, open top, visually suggestive of a beaker)
- Flasks: `🧪` (test tube — already used for tubes, but it's the standard flask/tube emoji)

Alternative: Use the same emoji family for consistency with existing types. Since `🧪` is already used for all tube types, let's use:
- Beakers: `🫙` (jar — wide mouth, cylindrical) or `🧫` 
- Flasks: `🍶` (sake bottle — narrow neck, bulbous body) or keep `🧪` 

**Decision:** Use `🧫` for beakers and `🍶` for flasks to distinguish them visually from tubes (`🧪`).

**Step 2: Add 12 entries to `LABWARE_TYPE_ICONS`**

```typescript
  beaker_25ml: '🧫',
  beaker_50ml: '🧫',
  beaker_100ml: '🧫',
  beaker_250ml: '🧫',
  beaker_500ml: '🧫',
  beaker_1000ml: '🧫',
  flask_25ml: '🍶',
  flask_50ml: '🍶',
  flask_100ml: '🍶',
  flask_250ml: '🍶',
  flask_500ml: '🍶',
  flask_1000ml: '🍶',
```

**Step 3: Verify TypeScript compiles**

Run: `cd app && npx tsc --noEmit`

**Step 4: Commit**

```bash
git add app/src/types/labware.ts
git commit -m "feat(labware): add icons for beaker and flask types"
```

---

### Task 5: Add category mappings for beaker and flask types

**Objective:** Map all 12 new types to the `glassware` category in `LABWARE_CATEGORIES`.

**Files:**
- Modify: `app/src/types/labware.ts:167-204`

**Step 1: Add 12 entries to `LABWARE_CATEGORIES`**

```typescript
  beaker_25ml: 'glassware',
  beaker_50ml: 'glassware',
  beaker_100ml: 'glassware',
  beaker_250ml: 'glassware',
  beaker_500ml: 'glassware',
  beaker_1000ml: 'glassware',
  flask_25ml: 'glassware',
  flask_50ml: 'glassware',
  flask_100ml: 'glassware',
  flask_250ml: 'glassware',
  flask_500ml: 'glassware',
  flask_1000ml: 'glassware',
```

**Step 2: Verify TypeScript compiles**

Run: `cd app && npx tsc --noEmit`

**Step 3: Commit**

```bash
git add app/src/types/labware.ts
git commit -m "feat(labware): map beaker and flask types to glassware category"
```

---

### Task 6: Add LABWARE_CONFIGS entries for all 12 types

**Objective:** Add full runtime configurations for beaker and flask types with addressing, geometry, color, and `lawnOnly: true`.

**Files:**
- Modify: `app/src/types/labware.ts` (add after the last existing entry in `LABWARE_CONFIGS`, before the closing `}`)

**Step 1: Add beaker configs**

Each beaker uses `addressing.type: 'single'`, `layoutFamily: 'tube'` (so it renders as a single vessel circle), `lawnOnly: true`, and `wellShape: 'round'`. Color: a cool blue-green to distinguish from tubes (which use `#fd7e14` orange). Use `#20c997` (teal) for beakers.

```typescript
  // --- Beakers (lawn-only glassware) ---
  beaker_25ml: {
    labwareType: 'beaker_25ml',
    addressing: { type: 'single' },
    geometry: { maxVolume_uL: 25000, minVolume_uL: 1000, wellShape: 'round' },
    layoutFamily: 'tube',
    orientationPolicy: 'rotatable',
    color: '#20c997',
    lawnOnly: true,
  },
  beaker_50ml: {
    labwareType: 'beaker_50ml',
    addressing: { type: 'single' },
    geometry: { maxVolume_uL: 50000, minVolume_uL: 2000, wellShape: 'round' },
    layoutFamily: 'tube',
    orientationPolicy: 'rotatable',
    color: '#20c997',
    lawnOnly: true,
  },
  beaker_100ml: {
    labwareType: 'beaker_100ml',
    addressing: { type: 'single' },
    geometry: { maxVolume_uL: 100000, minVolume_uL: 5000, wellShape: 'round' },
    layoutFamily: 'tube',
    orientationPolicy: 'rotatable',
    color: '#20c997',
    lawnOnly: true,
  },
  beaker_250ml: {
    labwareType: 'beaker_250ml',
    addressing: { type: 'single' },
    geometry: { maxVolume_uL: 250000, minVolume_uL: 5000, wellShape: 'round' },
    layoutFamily: 'tube',
    orientationPolicy: 'rotatable',
    color: '#20c997',
    lawnOnly: true,
  },
  beaker_500ml: {
    labwareType: 'beaker_500ml',
    addressing: { type: 'single' },
    geometry: { maxVolume_uL: 500000, minVolume_uL: 10000, wellShape: 'round' },
    layoutFamily: 'tube',
    orientationPolicy: 'rotatable',
    color: '#20c997',
    lawnOnly: true,
  },
  beaker_1000ml: {
    labwareType: 'beaker_1000ml',
    addressing: { type: 'single' },
    geometry: { maxVolume_uL: 1000000, minVolume_uL: 20000, wellShape: 'round' },
    layoutFamily: 'tube',
    orientationPolicy: 'rotatable',
    color: '#20c997',
    lawnOnly: true,
  },
```

**Step 2: Add flask configs**

Flasks use the same structure but a different color: `#7950f2` (purple) to distinguish from beakers.

```typescript
  // --- Flasks (lawn-only glassware) ---
  flask_25ml: {
    labwareType: 'flask_25ml',
    addressing: { type: 'single' },
    geometry: { maxVolume_uL: 25000, minVolume_uL: 1000, wellShape: 'round' },
    layoutFamily: 'tube',
    orientationPolicy: 'rotatable',
    color: '#7950f2',
    lawnOnly: true,
  },
  flask_50ml: {
    labwareType: 'flask_50ml',
    addressing: { type: 'single' },
    geometry: { maxVolume_uL: 50000, minVolume_uL: 2000, wellShape: 'round' },
    layoutFamily: 'tube',
    orientationPolicy: 'rotatable',
    color: '#7950f2',
    lawnOnly: true,
  },
  flask_100ml: {
    labwareType: 'flask_100ml',
    addressing: { type: 'single' },
    geometry: { maxVolume_uL: 100000, minVolume_uL: 5000, wellShape: 'round' },
    layoutFamily: 'tube',
    orientationPolicy: 'rotatable',
    color: '#7950f2',
    lawnOnly: true,
  },
  flask_250ml: {
    labwareType: 'flask_250ml',
    addressing: { type: 'single' },
    geometry: { maxVolume_uL: 250000, minVolume_uL: 5000, wellShape: 'round' },
    layoutFamily: 'tube',
    orientationPolicy: 'rotatable',
    color: '#7950f2',
    lawnOnly: true,
  },
  flask_500ml: {
    labwareType: 'flask_500ml',
    addressing: { type: 'single' },
    geometry: { maxVolume_uL: 500000, minVolume_uL: 10000, wellShape: 'round' },
    layoutFamily: 'tube',
    orientationPolicy: 'rotatable',
    color: '#7950f2',
    lawnOnly: true,
  },
  flask_1000ml: {
    labwareType: 'flask_1000ml',
    addressing: { type: 'single' },
    geometry: { maxVolume_uL: 1000000, minVolume_uL: 20000, wellShape: 'round' },
    layoutFamily: 'tube',
    orientationPolicy: 'rotatable',
    color: '#7950f2',
    lawnOnly: true,
  },
```

**Step 3: Verify TypeScript compiles**

Run: `cd app && npx tsc --noEmit`

**Step 4: Commit**

```bash
git add app/src/types/labware.ts
git commit -m "feat(labware): add LABWARE_CONFIGS for beaker and flask types (lawn-only glassware)"
```

---

### Task 7: Add `glassware` category to AddLabwareDialog

**Objective:** Make the glassware category visible in the labware picker dialog.

**Files:**
- Modify: `app/src/event-editor/deck/AddLabwareDialog.tsx:26-32`

**Step 1: Add `glassware` to `CATEGORY_ORDER`**

Change line 26 from:
```typescript
const CATEGORY_ORDER: LabwareCategory[] = ['plate', 'reservoir', 'tube', 'tiprack']
```
to:
```typescript
const CATEGORY_ORDER: LabwareCategory[] = ['plate', 'reservoir', 'tube', 'tiprack', 'glassware']
```

**Step 2: Add label in `CATEGORY_LABELS`**

Change lines 27-32 from:
```typescript
const CATEGORY_LABELS: Record<LabwareCategory, string> = {
  plate: 'Plates',
  reservoir: 'Reservoirs',
  tube: 'Tubes',
  tiprack: 'Tip Racks',
}
```
to:
```typescript
const CATEGORY_LABELS: Record<LabwareCategory, string> = {
  plate: 'Plates',
  reservoir: 'Reservoirs',
  tube: 'Tubes',
  tiprack: 'Tip Racks',
  glassware: 'Glassware',
}
```

**Step 3: Verify TypeScript compiles**

Run: `cd app && npx tsc --noEmit`
Expected: No errors now — all Record types are satisfied

**Step 4: Verify the dialog renders in the browser**

If a dev server is running, open the event editor and click "+ Add labware" on a lawn surface. Confirm:
- A "Glassware" section appears with 12 items (6 beakers, 6 flasks)
- Each item shows the correct emoji icon and label
- The items are hidden when adding to a deck slot (lawn-only filtering)

**Step 5: Commit**

```bash
git add app/src/event-editor/deck/AddLabwareDialog.tsx
git commit -m "feat(labware): add glassware category to labware picker dialog"
```

---

### Task 8: Add lawn-only placement tests for beaker and flask

**Objective:** Verify that beaker and flask types are correctly rejected on deck slots and allowed on lawns.

**Files:**
- Modify: `app/src/event-editor/lib/placementRules.test.ts`

**Step 1: Add test cases**

Append to the existing `validatePlacement — lawn-only labware` describe block:

```typescript
  it('rejects beaker types on an automation slot', () => {
    const labware = createLabware('beaker_500ml')
    const result = validatePlacement({
      platform: PLATFORM,
      variant: VARIANT,
      location: { kind: 'slot', slotId: 'A1' },
      labware,
    })
    expect(result.ok).toBe(false)
    expect(result.errors.join(' ')).toMatch(/freeform bench/i)
  })

  it('allows beaker types on a lawn surface', () => {
    const labware = createLabware('beaker_250ml')
    const result = validatePlacement({
      platform: PLATFORM,
      variant: VARIANT,
      location: { kind: 'lawn', xMm: 100, yMm: 50 },
      labware,
    })
    expect(result.ok).toBe(true)
  })

  it('rejects flask types on an automation slot', () => {
    const labware = createLabware('flask_1000ml')
    const result = validatePlacement({
      platform: PLATFORM,
      variant: VARIANT,
      location: { kind: 'slot', slotId: 'A1' },
      labware,
    })
    expect(result.ok).toBe(false)
    expect(result.errors.join(' ')).toMatch(/freeform bench/i)
  })

  it('allows flask types on a lawn surface', () => {
    const labware = createLabware('flask_250ml')
    const result = validatePlacement({
      platform: PLATFORM,
      variant: VARIANT,
      location: { kind: 'lawn', xMm: 100, yMm: 50 },
      labware,
    })
    expect(result.ok).toBe(true)
  })
```

**Step 2: Run the tests**

Run: `cd app && npx vitest run src/event-editor/lib/placementRules.test.ts`
Expected: All tests pass (including the 4 new ones)

**Step 3: Commit**

```bash
git add app/src/event-editor/lib/placementRules.test.ts
git commit -m "test(labware): add placement validation tests for beaker and flask lawn-only types"
```

---

### Task 9: Add LabwareGlyph tests for beaker and flask

**Objective:** Verify that beaker and flask labware render as single vessels (1 shape) in the deck glyph view.

**Files:**
- Modify: `app/src/event-editor/deck/LabwareGlyph.test.tsx`

**Step 1: Add test cases**

Append a new test to the existing describe block:

```typescript
  it('draws a single vessel for beaker and flask types', () => {
    // Beakers and flasks are single-vessel glassware (addressing: 'single')
    expect(shapeCount('beaker_500ml')).toBe(1)
    expect(shapeCount('beaker_25ml')).toBe(1)
    expect(shapeCount('flask_250ml')).toBe(1)
    expect(shapeCount('flask_1000ml')).toBe(1)
  })
```

**Step 2: Run the tests**

Run: `cd app && npx vitest run src/event-editor/deck/LabwareGlyph.test.tsx`
Expected: All tests pass

**Step 3: Commit**

```bash
git add app/src/event-editor/deck/LabwareGlyph.test.tsx
git commit -m "test(labware): add glyph rendering tests for beaker and flask single-vessel types"
```

---

### Task 10: Add `isLawnOnlyLabwareType` test for new types

**Objective:** Verify the helper function correctly identifies all beaker and flask types as lawn-only.

**Files:**
- Modify: `app/src/event-editor/lib/placementRules.test.ts` (or create a new test in `app/src/types/labware.test.ts` if it exists)

**Step 1: Add test cases**

Append to the placement rules test file:

```typescript
describe('isLawnOnlyLabwareType — glassware', () => {
  it('identifies all beaker types as lawn-only', () => {
    expect(isLawnOnlyLabwareType('beaker_25ml')).toBe(true)
    expect(isLawnOnlyLabwareType('beaker_50ml')).toBe(true)
    expect(isLawnOnlyLabwareType('beaker_100ml')).toBe(true)
    expect(isLawnOnlyLabwareType('beaker_250ml')).toBe(true)
    expect(isLawnOnlyLabwareType('beaker_500ml')).toBe(true)
    expect(isLawnOnlyLabwareType('beaker_1000ml')).toBe(true)
  })

  it('identifies all flask types as lawn-only', () => {
    expect(isLawnOnlyLabwareType('flask_25ml')).toBe(true)
    expect(isLawnOnlyLabwareType('flask_50ml')).toBe(true)
    expect(isLawnOnlyLabwareType('flask_100ml')).toBe(true)
    expect(isLawnOnlyLabwareType('flask_250ml')).toBe(true)
    expect(isLawnOnlyLabwareType('flask_500ml')).toBe(true)
    expect(isLawnOnlyLabwareType('flask_1000ml')).toBe(true)
  })
})
```

Add the import at the top of the file:
```typescript
import { isLawnOnlyLabwareType } from '../../types/labware'
```

**Step 2: Run the tests**

Run: `cd app && npx vitest run src/event-editor/lib/placementRules.test.ts`
Expected: All tests pass

**Step 3: Commit**

```bash
git add app/src/event-editor/lib/placementRules.test.ts
git commit -m "test(labware): add isLawnOnlyLabwareType tests for glassware types"
```

---

### Task 11: Final verification — full test suite and typecheck

**Objective:** Confirm the full app test suite passes and TypeScript compiles cleanly.

**Step 1: Run the full typecheck**

Run: `npm run typecheck -w app`
Expected: No errors

**Step 2: Run relevant tests**

Run: `npm run test:unit -w app`
Expected: All tests pass

**Step 3: Manual browser verification (if dev server is running)**

1. Open the event editor with a freeform deck/lawn surface
2. Click "+ Add" in the labware list
3. Confirm "Glassware" section appears with 12 items
4. Beakers show `🧫` icon, flasks show `🍶` icon
5. Click a beaker — it should be placed on the lawn
6. Try adding a beaker to a deck slot — it should be filtered out or rejected by placement validation

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat(labware): add 12 beaker and flask labware types with lawn-only glassware category"
```

---

## Summary of changes

| File | Changes |
|------|---------|
| `app/src/types/labware.ts` | Add 12 types to union, labels, icons, categories, configs. Add `glassware` to category type. |
| `app/src/event-editor/deck/AddLabwareDialog.tsx` | Add `glassware` to category order and labels |
| `app/src/event-editor/lib/placementRules.test.ts` | Add lawn-only placement tests + isLawnOnlyLabwareType tests |
| `app/src/event-editor/deck/LabwareGlyph.test.tsx` | Add single-vessel glyph tests |

## Risks and tradeoffs

1. **Emoji icons are platform-dependent.** `🧫` and `🍶` render differently on macOS vs Linux vs Windows. If the user wants true SVG beaker/flask shapes (like the reservoir SVGs in `DeckVisualizationPanel.tsx`), that would require a new Task 0 to create `BeakerSvg` and `FlaskSvg` components. The current plan reuses the single-vessel circle rendering.

2. **Color choices are subjective.** Teal (`#20c997`) for beakers and purple (`#7950f2`) for flasks were chosen to not clash with existing tube orange (`#fd7e14`) or plate blue (`#339af0`). The user may want to adjust.

3. **Volume ranges are estimates.** The `minVolume_uL` values are practical minimums (what you'd actually use in a lab), not hard physical limits. Adjust based on actual lab practices.

## Open questions

- Should beakers and flasks have volume graduation marks in the visualization? (Not in scope for this plan — would require custom SVG components)
- Should there be subtypes (Erlenmeyer flask vs volumetric flask)? Starting with a single flask type; subtypes can be added later if needed.
