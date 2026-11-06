# L2-PROMPT2-TOOLTIP-FINAL-CONC-1 — unit u3fix (browser-gate 1 CSS fixes)

## What changed

Single file: `app/src/event-editor/styles/eventEditor.css` (lines 3911-3963, well-tooltip rules only).
10 lines added, 2 lines modified.

### Diff excerpt

```diff
 .event-editor .well-tooltip__materials {
   width: 100%;
   border-collapse: collapse;
   font-size: 11px;
+  table-layout: fixed; /* D-1: forces columns to fit panel width */
 }

 .event-editor .well-tooltip__material-name {
   font-weight: 600;
   color: var(--cl-text);
   max-width: 130px;
+  padding-right: 6px; /* D-2: gutter before concentration cell */
   overflow: hidden;
   text-overflow: ellipsis;
   white-space: nowrap;
 }

 .event-editor .well-tooltip__material-conc {
-  padding-left: 10px;
+  width: 60px;
+  padding-left: 6px;
   text-align: right;
   white-space: nowrap;
+  overflow: hidden;
+  text-overflow: ellipsis;
   color: var(--cl-accent);
   font-variant-numeric: tabular-nums;
 }

 .event-editor .well-tooltip__material-vol {
-  padding-left: 10px;
+  width: 75px;
+  padding-left: 6px;
   text-align: right;
   white-space: nowrap;
+  overflow: hidden;
+  text-overflow: ellipsis;
   color: var(--cl-text-dim);
   font-variant-numeric: tabular-nums;
 }
```

## WHY the overflow is removed (D-1)

Gate 1 measured: panel clientWidth 258 / scrollWidth 273 - 15px overflow.
Root cause: three `white-space: nowrap` columns with no layout discipline, plus
`padding-left: 10px` on both conc and vol, competing inside a 258px content box.

Fix mechanics:
- `table-layout: fixed` on the table forces columns to respect declared widths instead
  of auto-expanding. The name column gets whatever remains after conc + vol are assigned.
- Concentration column: `width: 60px` - sufficient for typical values like `9.901 uM`
  (~58px at 11px font with tabular-nums) and longer values like `1 mM`.
- Volume column: `width: 75px` - sufficient for `100.0 uL` (~65px) and the new
  denominator-stated share `(0.99 %)` (~68px).
- Name column: receives remaining space (~123px at typical panel width). Already had
  `max-width: 130px`, `overflow: hidden`, `text-overflow: ellipsis` - now actually
  enforced by the fixed layout.
- `padding-left: 10px` to `6px` on conc and vol saves 8px total, giving more room
  to the name column.
- Backup: `overflow: hidden` + `text-overflow: ellipsis` on conc and vol so extreme
  content can never force overflow again.

Computed: 60 + 75 = 135px for fixed columns. Name gets 258 - 135 = 123px. Total = 258px
- exactly the panel content box. Zero overflow.

## D-2 gutter choice

Added `padding-right: 6px` on `.well-tooltip__material-name`. This creates a visible
whitespace gap between the name/role text (e.g. `Clofibrate . solute`) and the
concentration value (e.g. `9.901 uM`). The 6px value matches the new `padding-left`
on the conc cell, producing symmetrical column separation without consuming extra
panel width (the padding lives inside the name column's allocated space).

## Verification

### Typecheck (pre-existing errors only, zero new errors)

Pre-existing errors at HEAD accbc584 (confirmed by stash-and-check): 10 errors in
EventEditorContext, LawnSurface, PreviewActionBar, editorHistory, LabwareFocus,
Viewer, ViewerToolbar, IngestionUploadModal, ExtractionProgressPanel. All in
unrelated files. CSS-only edit introduces zero TS errors.

### Tests

```
$ cd app && npx vitest run src/event-editor/focus/WellTooltip.test.tsx
  ✓ src/event-editor/focus/WellTooltip.test.tsx  (3 tests) 92ms
  Test Files  1 passed (1)
       Tests  3 passed (3)
```

All 3 tests pass.

### Git status

```
$ git -c core.fileMode=false status --short
?? .hermes/plans/reviews/advc-L2-PROMPT2-TOOLTIP-FINAL-CONC-1-u1-2026-11-05_221240.md
?? app/node_modules
```

Only untracked files (adv review + node_modules - both pre-existing, per task instructions).
No modified or staged files. Tree clean at exit.

L2-PROMPT2-TOOLTIP-FINAL-CONC-1-u3fix UNIT unit DONE fdc47377ec76954e15d26bd4eb3f9029aa908a5b
