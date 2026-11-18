# L2-LAB-MATERIAL-CREATE-1 u1fix2 — advc c2 D1 MINOR: negative-render pin

## Summary
advc c2 review flagged one MINOR D1: the pin "shows '+ New material' on the materials category only"
never asserted absence on non-materials categories. Deleting the `activeCategory === 'materials'`
guard leaves 5/5 green, so the pin is vacuous against its own title.

## Change
Added one `it` block to `app/src/collections/LabCollectionView.test.tsx`:
render at `initialEntries ['/lab/labware']` and assert
`expect(screen.queryByTestId('lab-category-new-material')).toBeNull()`.

## Verification

### Green run (product correct)
```
Test Files  1 passed (1)
      Tests  6 passed (6)
```

### Mutation probe RED (guard removed)
```
 FAIL  src/collections/LabCollectionView.test.tsx > LabCollectionView > does NOT show "+ New material" on non-materials categories
AssertionError: expected <button type="button" …(2)></button> to be null
Test Files  1 failed (1)
      Tests  1 failed | 5 passed (6)
```

### Typecheck
```
npx tsc --noEmit  →  rc=0, zero output
```

### Files changed
`app/src/collections/LabCollectionView.test.tsx` (+22 lines, 1 file)

L2-LAB-MATERIAL-CREATE-1-u1fix2 UNIT unit DONE 28c5c3b8b46cce94b0eb711758101eed0dd50974
