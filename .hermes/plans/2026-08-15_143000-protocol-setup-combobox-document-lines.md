# Protocol-Panning "This assay needs" — document-style editable combobox rows + section headers + CSS

**Date:** 2026-08-15 (session with live draft run `RUN-wednesday-afternoon-run-2ze0`)

## Goal

Make the standard **local-first → then-ontology → then-locally-defined term combobox** work for
materials, labwares and equipment in the Protocol tab (right pane) for an ingested protocol in
Protocol Planning mode. Per user's explicit expectations:

1. Each section has a **header**: Materials, Labwares, Equipment.
2. Each ingested role is **ghosted into a TapTab line item** — an editable rich-text document line,
   NOT an HTML-form row.
3. When the user **starts typing in that line, the combobox kicks in** (slash-menu: `/l` `/e` `/m`,
   local-first → ontology → create-new).

## Current state (verified live, 2026-08-15)

- **Widget:** `app/src/editor/taptab/widgets/LocalProtocolSetupWidgets.tsx` → `SetupSectionWidget`.
  Renders each row as an HTML-form row: `<span role>` + `<span desc>` + `suggested`/`pending` badge
  + remove `<button>`. The slash-combobox (`ProtocolMentionEditor`) exists ONLY in the separate
  `+ Add` form — NOT on existing/suggestion rows.
- **Headers:** none per section — only one shared `<h3>This assay needs</h3>` in `ProtocolTabPanel`.
- **CSS:** the styles for `.taptab-setup-row*`, `.taptab-protocol-mention-editor*` live in
  `app/src/editor/taptab/taptab.css`, imported only by `taptab/index.ts`, `RecordCreatePanel`,
  `RecordEditPanel`. The protocol-planning right pane imports only `protocolTabPanel.css`
  (`.protocol-setup-sections` container). **Result: the whole "This assay needs" panel is unstyled**
  — the exact "lacks any CSS" symptom. Confirmed live: `taptabCssLoaded=false`,
  `row0Display=block border=rgb(31,35,40) pad=0`.
- **Mention editor:** `ProtocolAuthoringWidgets.tsx` `ProtocolMentionEditor` is the slash-combobox
  (TipTap + slashMenu ext, triggers on `/`; `defaultSlashCommand` primes `/l `/`/e `/`/m `).
  Reference per-row document-line usage: `ProtocolStepRolesWidget` renders one `ProtocolMentionEditor`
  per step. `onCommit(text, mentions)` gives picks.
- **TapTab consumer:** `WidgetRenderer.tsx` also renders `SetupSectionWidget` (kind/value/readOnly/
  onCommit, no suggestionRows). Must not break.

## Design

Redesign `SetupSectionWidget` rows to document-style editable lines:

- **Section header** inside the widget: `KIND_COPY` gains a `title` ('Labwares'/'Equipment'/'Materials');
  render `<h4 className="protocol-setup-sections__subtitle">`.
- **Each row** (editable, non-readonly) = a `ProtocolMentionEditor` rich-text line:
  - seeded with `description ?? role` (human-readable ghost label),
  - `serialize="readable"`, no auto-prime on focus (keeps ghost label visible; typing `/l `/`/e `/`/m `
    opens the combobox — "kicks in when you write"),
  - `onCommit(text, mentions)` → set `ref` from `mentions[0]` via `mentionToSetupRef`, update visible
    label to `mentions[0].label`.
- **Suggestion rows** (in `suggestionRows`, no ref) get a dashed ghost wrapper class
  `taptab-setup-line--suggested` + a `suggested` tag.
- **Bound rows** (have ref): show `RefBadge` (removable clears ref) so the concrete binding is visible.
- **Read-only rows** (preview state): render plain text line (no editor) + `suggested` tag when in
  suggestionRows.
- Remove button + `+ Add {noun}` flow unchanged.

## CSS

- **Root-cause fix per the documented rule ("a component must import its OWN stylesheet")**:
  add `import '../taptab.css'` to `LocalProtocolSetupWidgets.tsx` AND to
  `ProtocolAuthoringWidgets.tsx` (owner of `ProtocolMentionEditor` + slash-menu DOM). `taptab.css` is a
  shared stylesheet already imported by `taptab/index.ts`; Vite dedupes CSS so this only guarantees it
  is present in the protocol-pane context.
- Add `.protocol-setup-sections__subtitle` + `.taptab-setup-line`, `--suggested` ghost styles, and the
  document-line look (left accent rail, gap) to `protocolTabPanel.css` or `taptab.css` (prefer taptab.css
  so TapTab form shares the line look; subtitle into protocolTabPanel.css).

## Files

| File | Change |
|---|---|
| `app/src/editor/taptab/widgets/LocalProtocolSetupWidgets.tsx` | import taptab.css; KIND_COPY title; header; row→editable line; commitRow(mentions→ref) |
| `app/src/editor/taptab/widgets/ProtocolAuthoringWidgets.tsx` | import taptab.css (own the mention-editor DOM) |
| `app/src/editor/taptab/taptab.css` | `.taptab-setup-line` document-line styles |
| `app/src/event-editor/right-pane/protocol/protocolTabPanel.css` | `.protocol-setup-sections__subtitle` |
| `app/src/editor/taptab/widgets/LocalProtocolSetupWidgets.test.tsx` | update tests for new row structure (editable lines, headers, ref-from-mention) |

## Verification

1. `cd app && npx tsc --noEmit` → clean.
2. `cd app && npx vitest run src/editor/taptab/widgets/LocalProtocolSetupWidgets.test.tsx` → pass.
3. Regression: `ProtocolTabPanel.test.tsx` + `WidgetRenderer`-area still green (record baseline first).
4. Live browser on `http://computable:5174/runs/RUN-wednesday-afternoon-run-2ze0?mode=protocol-planning`:
   - `.taptab-setup-row` computed style has real padding/border (not `pad=0`),
   - each section shows header (Labwares/Equipment/Materials),
   - a suggestion row is an editable `.taptab-protocol-mention-editor` line; typing `/l` opens the slash menu.

## Repo warning (multi-actor)

Other agents commit to this tree mid-session. Before each commit: `git status --short` +
`git reflog -5`; stage ONLY the files named above. Never `git add -A`.

TypeScript: `exactOptionalPropertyTypes` — never assign `undefined` to an optional field; use
conditional spreads.