# L2-LAB-INVENTORY-CREATE-1 / unit modalmount — gate D1 fix

Worktree: /home/brad/cl-wt/L2-LABINV-modalmount-lane2
Branch: cl/lane2-labinv-modalmount-1915
Base: 5b38efaa421147d05a46f6b1f8fb5aa6b781c16e

## What changed (2 files, render tree + one test)

1. app/src/collections/LabCollectionView.tsx — the non-embedded return no longer
   renders `<AppShell/>` with the two dialogs as siblings. Both
   `LabwareInstanceCreateModal` and `MaterialReceivingDoor` now mount inside the
   `leftPane` fragment, i.e. under AppShell's `.cl-app` root, so the
   `.lab-modal__*` rules' `var(--cl-*)` tokens resolve. Props unchanged.
   `if (embedded) return collectionContent` untouched; AppShell children is
   dropped on `layout="workspace"`, hence leftPane is the correct slot.
   Modal components, labModalStyles.ts, tokens.css and AppShell not touched.
   `position: fixed` backdrop still covers the viewport (no transformed ancestor).

2. app/src/collections/LabCollectionView.test.tsx — new pin:
   render materials category, click `lab-category-receive-lot`, assert
   `document.querySelector('.cl-app .lab-modal__backdrop')` is non-null.

## RED output (test commit ca84180c)

  ❯ src/collections/LabCollectionView.test.tsx (14 tests | 1 failed)
    mounts the receiving door inside the .cl-app token scope (gate D1)
      → expected null not to be null
  Tests  1 failed | 13 passed (14)

This independently reproduces gate D1 at DOM level: the backdrop existed but as
a sibling of `.cl-app`.

## GREEN output (fix commit 898ca32f)

  Test Files  1 passed (1)
  Tests  14 passed (14)   (13 pre-existing + the new pin)

## tsc

`cd app && npx tsc --noEmit -p tsconfig.json` — no errors in
src/collections/LabCollectionView.tsx or LabCollectionView.test.tsx. The fresh
worktree reports 13 unrelated pre-existing diagnostics: TS2307 missing modules
(yaml, ajv, prosemirror-view) because server/node_modules deps are absent here,
and 3 TS7006 in src/event-editor/create/RecordCreatePanel.gc16-widget-commit.test.tsx.
None touch scope; both files owned by this unit typecheck cleanly.

## Files

- app/src/collections/LabCollectionView.tsx
- app/src/collections/LabCollectionView.test.tsx
- /home/brad/.hermes/cl/lanes/2/reports/L2-LABINV-modalmount-1847.md

## Verification commands

  cd app && npx vitest run src/collections/LabCollectionView.test.tsx
  cd app && npx tsc --noEmit -p tsconfig.json

## Next: browser reviewer must confirm on the served revision that
getComputedStyle(.lab-modal).backgroundColor is not rgba(0,0,0,0).

L2-LAB-INVENTORY-CREATE-1 UNIT unit DONE 898ca32f90853cc3d786e5266ba3d19eb34cfb8f
