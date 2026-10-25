# /registry: theme-legible rail, full-width editor, real record refs, provenance

Date: 2026-10-17 19:26
Repo: /mnt/vast/home/brad/git/computable-lab (branch `main`)
Scope: `app/src/pages/RecordRegistryPage.tsx`, `app/src/components/registry/*`,
`app/src/editor/taptab/*`, `schema/lab/*.ui.yaml`, `server/src/ui/UISpecLoader.ts`

## Goal

Make the /registry surface theme-correct and legible, let the record editor use the
full center-pane width, render record-reference fields (person / training-material /
equipment …) as record pickers instead of ontology search, and give every selected
record a Provenance affordance.

## Current context / assumptions (all verified live on :5174 / :3001)

1. **Right-hand rail is Tailwind-light-only.** `RelatedRecordsCard.tsx` (rendered by
   `RecordRegistryPage` into `DocumentShell`'s `rail`, i.e. the right-hand column of
   the editor, showing related records *with their registry kind badges* and
   `via <refField>`) uses fixed utility colors: `text-gray-400` (#9ca3af) for
   `via personRef`, `text-gray-900` for the label, on a rail whose background is
   `var(--shell-rail-bg)` → `var(--cl-bg-elev)` = `#f6f8fa`. Light grey on near-white:
   exactly the "illegible" report. Tailwind classes never react to
   `data-theme="light"` on `.cl-app`, because this app is Tailwind v4 with
   `@import "tailwindcss"` and no `@custom-variant dark` — so `dark:` variants cannot
   follow the theme either. `RecordRegistryPage.tsx` has the same problem in its own
   chrome (`bg-white`, `text-gray-900`, `bg-blue-500`, `text-red-600`, …).
   Established precedent for the fix: `app/src/event-editor/right-pane/ai/ChangesPanel.css`
   + `ChangesPanel.styling.test.tsx` (token-only CSS, no hex/rgba, asserted by test).

2. **Editor column is capped at 720px.** `app/src/editor/taptab/taptab.css:12`
   `--shell-column-max: 720px` and `:436-446`
   `.taptab-editor-container { max-width: var(--shell-column-max); margin: 0 auto; }`.
   On a wide screen the record is a 720px strip inside a ~1600px pane. Nothing in the
   UI can widen it. Fix must not resize every other TapTab surface (`/record`,
   protocol IDE), so the width becomes an explicit `DocumentShell` prop.

3. **Every ref field opens ontology/vocab search.** `training-record.ui.yaml` already
   declares `widget: "ref"` + `refKind: "person"` / `"training-material"`, and the
   projection forwards it — live proof:
   `POST /api/ui/schema/<training-record.schema.yaml>/editor-draft` →
   `{"path":"$.personRef","widget":"ref","refKind":"person"}`.
   But `WidgetRenderer.tsx:312` routes **all** `widget === 'ref'` to `RefCombobox`
   (local vocab tags + OLS ontology terms). The record picker already exists
   (`RecordRefPicker.tsx`, exported, currently unused). Worse: `FieldRow.tsx:80`
   commits a bare **string** for non-ontology picks, while `personRef` must be
   `{kind:'record', type:'person', id:'PER-…'}` — so a "successful" pick cannot save.

4. **Provenance data exists but is never shown.** Live `GET /api/records?kind=training-record`:
   payload carries `createdAt`, `updatedAt`, `createdBy`; envelope `meta` carries
   `contentSha`, `commitSha`, `path`; `GET /api/records/:id/revisions` exists and is
   already used by `SignOffReceipt.tsx`. `RecordRegistryPage` throws `meta` away in
   `handleSelectRecord` and renders no provenance anywhere.

Assumptions: dev stack already running (vite :5174 → API :3001). Backend spec cache is
loaded at boot — restart :3001 after editing any `*.ui.yaml`.

## Architecture / proposed approach

Four independent, small changes, each behind a red test: (A) move the two registry
surfaces off fixed Tailwind palettes onto `--cl-*` design tokens in per-surface CSS
files, exactly like `ChangesPanel`; (B) add an explicit `width="full"` mode to
`DocumentShell` and use it from the registry so the editing column fills the main
pane; (C) introduce one declarative widget name `record-ref` (declared in
`*.ui.yaml`, validated by `UISpecLoader`, dispatched by `WidgetRenderer` to
`RecordRefPicker`, committing the canonical `ref` object from
`schema/core/datatypes/ref.schema.yaml`); (D) add a token-styled `RecordProvenanceCard`
(`<details>`) to the registry rail, fed by envelope `meta` + payload timestamps +
the existing revisions endpoint.

## Step-by-step tasks

Every task: write the failing test, run it (must fail), implement, re-run (must pass),
commit with the given message. Commands assume repo root.

---

### Task 1 — RED: RelatedRecordsCard must be token-styled

Create `app/src/components/registry/RelatedRecordsCard.styling.test.tsx`:

```tsx
/**
 * The registry's right-hand rail (related records + their kinds) rendered as
 * light grey on near-white: it used fixed Tailwind palette utilities, which
 * never follow `.cl-app[data-theme]`. Token-only CSS, like ChangesPanel.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const dir = resolve(process.cwd(), 'src/components/registry')
const tsx = readFileSync(resolve(dir, 'RelatedRecordsCard.tsx'), 'utf8')
const css = readFileSync(resolve(dir, 'RelatedRecordsCard.css'), 'utf8')

const REQUIRED = [
  '.related-records',
  '.related-records__title',
  '.related-records__empty',
  '.related-records__rows',
  '.related-records__row',
  '.related-records__kind',
  '.related-records__label',
  '.related-records__via',
]

describe('RelatedRecordsCard styling (theme tokens)', () => {
  it('imports its per-surface stylesheet', () => {
    expect(tsx).toContain("import './RelatedRecordsCard.css'")
  })

  it('uses no fixed Tailwind palette utilities', () => {
    expect(tsx).not.toMatch(/\b(?:bg|text|border|divide)-(?:white|black|gray|slate|blue|red|emerald|amber|orange)-\d{2,3}\b/)
  })

  it('defines every class it renders', () => {
    for (const selector of REQUIRED) expect(css, `missing ${selector}`).toContain(selector)
  })

  it('is token-only: no hex/rgb/hsl colours', () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(css).not.toMatch(/\brgba?\(/)
    expect(css).not.toMatch(/\bhsla?\(/)
    expect(css).toContain('var(--cl-text)')
  })
})
```

Run: `cd app && npx vitest run src/components/registry/RelatedRecordsCard.styling.test.tsx`
Expected: FAIL (file `RelatedRecordsCard.css` does not exist → readFileSync throws).

### Task 2 — GREEN: token CSS + class swap for RelatedRecordsCard

Create `app/src/components/registry/RelatedRecordsCard.css`:

```css
/* Registry rail card — related records + their registry kinds.
 * Token-only (--cl-*): reads the active theme; never fixed palette shades. */
.related-records {
  color: var(--cl-text);
}

.related-records__title {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--cl-text);
}

.related-records__empty {
  font-size: 13px;
  color: var(--cl-text-faint);
}

.related-records__rows {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.related-records__row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 8px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--cl-text);
  text-align: left;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.related-records__row:hover {
  background: var(--cl-bg-elev-2);
}

.related-records__kind {
  flex-shrink: 0;
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--cl-accent-soft);
  color: var(--cl-text-dim);
}

.related-records__label {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.related-records__via {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--cl-text-faint);
}
```

Replace the body of `RelatedRecordsCard.tsx` below the `useEffect` (keep the fetch
logic and props exactly as they are):

```tsx
  if (loading) {
    return <div className="related-records__empty">Loading related...</div>;
  }

  if (related.length === 0) {
    return <div className="related-records__empty">No related records</div>;
  }

  return (
    <div className="related-records">
      <h3 className="related-records__title">Related Records</h3>
      <div className="related-records__rows">
        {related.map((item) => (
          <button
            key={item.recordId}
            onClick={() => onNavigate(item.recordId)}
            className="related-records__row"
          >
            <span className="related-records__kind">{item.kind}</span>
            <span className="related-records__label">{item.title}</span>
            <span className="related-records__via">via {item.refField}</span>
          </button>
        ))}
      </div>
    </div>
  );
```

Add `import './RelatedRecordsCard.css';` after the existing imports.

Run: `cd app && npx vitest run src/components/registry/RelatedRecordsCard.styling.test.tsx`
Expected: PASS (4 tests).

Commit: `git add app/src/components/registry/RelatedRecordsCard.tsx app/src/components/registry/RelatedRecordsCard.css app/src/components/registry/RelatedRecordsCard.styling.test.tsx && git commit -m "fix(registry): token-style the related-records rail (theme-legible kinds)"`

### Task 3 — RED: RecordRegistryPage must be token-styled

Create `app/src/pages/RecordRegistryPage.styling.test.tsx` reusing Task 1's shape:

```tsx
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const dir = resolve(process.cwd(), 'src/pages')
const tsx = readFileSync(resolve(dir, 'RecordRegistryPage.tsx'), 'utf8')
const css = readFileSync(resolve(dir, 'RecordRegistryPage.css'), 'utf8')

const REQUIRED = [
  '.registry-page', '.registry-list', '.registry-list__tabs', '.registry-tab',
  '.registry-tab--active', '.registry-list__actions', '.registry-btn',
  '.registry-btn--primary', '.registry-btn--ghost', '.registry-kind-picker',
  '.registry-kind-chip', '.registry-kind-chip--active', '.registry-error',
  '.registry-list__archived', '.registry-list__archived-label',
  '.registry-list__search', '.registry-list__scroll', '.registry-list__empty',
  '.registry-list__rows', '.registry-row', '.registry-row--selected',
  '.registry-row__title', '.registry-row__meta', '.registry-kind-badge',
  '.registry-editor-body', '.registry-editor-empty', '.registry-placeholder',
  '.registry-placeholder__title', '.registry-placeholder__hint',
  '.registry-note', '.registry-save-error', '.registry-dirty-dot', '.registry-rail',
]

describe('RecordRegistryPage styling (theme tokens)', () => {
  it('imports its per-surface stylesheet', () => {
    expect(tsx).toContain("import './RecordRegistryPage.css'")
  })

  it('uses no fixed Tailwind palette utilities', () => {
    expect(tsx).not.toMatch(/\b(?:bg|text|border|divide)-(?:white|black|gray|slate|blue|red|emerald|amber|orange)-\d{2,3}\b/)
  })

  it('defines every class it renders', () => {
    for (const selector of REQUIRED) expect(css, `missing ${selector}`).toContain(selector)
  })

  it('is token-only: no hex/rgb/hsl colours', () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(css).not.toMatch(/\brgba?\(/)
    expect(css).not.toMatch(/\bhsla?\(/)
    expect(css).toContain('var(--cl-bg-elev)')
  })
})
```

Run: `cd app && npx vitest run src/pages/RecordRegistryPage.styling.test.tsx`
Expected: FAIL (no CSS file).

### Task 4 — GREEN: RecordRegistryPage.css + className swaps

Create `app/src/pages/RecordRegistryPage.css` (verbatim):

```css
/* /registry — record list + document editor chrome.
 * Token-only (--cl-*): every colour follows .cl-app[data-theme]. */
.registry-page {
  display: flex;
  height: 100%;
  min-height: 0;
  color: var(--cl-text);
  background: var(--cl-bg);
}

.registry-list {
  width: 20rem;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--cl-border);
  background: var(--cl-bg-elev);
}

.registry-list__tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 8px;
  border-bottom: 1px solid var(--cl-border);
}

.registry-tab {
  appearance: none;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--cl-text-dim);
  padding: 4px 8px;
  font-size: 12px;
  cursor: pointer;
}

.registry-tab:hover {
  background: var(--cl-bg-elev-2);
  color: var(--cl-text);
}

.registry-tab--active {
  background: var(--cl-accent-soft);
  color: var(--cl-accent);
  font-weight: 600;
}

.registry-list__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border-bottom: 1px solid var(--cl-border);
}

.registry-btn {
  appearance: none;
  border: 1px solid var(--cl-border);
  border-radius: 4px;
  background: var(--cl-bg-elev-2);
  color: var(--cl-text);
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
}

.registry-btn:hover:not(:disabled) {
  border-color: var(--cl-border-strong);
}

.registry-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.registry-btn--primary {
  background: var(--cl-accent);
  border-color: var(--cl-accent);
  color: var(--cl-on-accent);
}

.registry-btn--primary:hover:not(:disabled) {
  background: var(--cl-accent-hover);
  border-color: var(--cl-accent-hover);
}

.registry-btn--ghost {
  background: transparent;
  border-color: transparent;
  color: var(--cl-text-dim);
}

.registry-btn--ghost:hover:not(:disabled) {
  background: var(--cl-bg-elev-2);
  color: var(--cl-text);
}

.registry-kind-picker {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}

.registry-kind-chip {
  border: 1px solid var(--cl-border);
  border-radius: 4px;
  background: transparent;
  color: var(--cl-text-dim);
  padding: 4px 8px;
  font-size: 12px;
  cursor: pointer;
}

.registry-kind-chip--active {
  background: var(--cl-accent-soft);
  border-color: var(--cl-accent);
  color: var(--cl-accent);
  font-weight: 600;
}

.registry-error {
  padding: 8px;
  border-bottom: 1px solid var(--cl-border);
  font-size: 12px;
  color: var(--cl-danger);
}

.registry-list__archived {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border-bottom: 1px solid var(--cl-border);
}

.registry-list__archived-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--cl-text-dim);
}

.registry-list__archived input {
  accent-color: var(--cl-accent);
}

.registry-list__search {
  padding: 8px;
  border-bottom: 1px solid var(--cl-border);
}

.registry-list__scroll {
  flex: 1;
  overflow-y: auto;
}

.registry-list__empty {
  padding: 32px 0;
  text-align: center;
  font-size: 13px;
  color: var(--cl-text-dim);
}

.registry-list__rows {
  display: flex;
  flex-direction: column;
}

.registry-row {
  padding: 10px 12px;
  border-left: 4px solid transparent;
  border-bottom: 1px solid var(--cl-border);
  cursor: pointer;
}

.registry-row:hover {
  background: var(--cl-bg-elev-2);
}

.registry-row--selected {
  background: var(--cl-accent-soft);
  border-left-color: var(--cl-accent);
}

.registry-row__title {
  font-size: 13px;
  font-weight: 600;
  color: var(--cl-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.registry-row__meta {
  margin-top: 4px;
}

.registry-kind-badge {
  display: inline-block;
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--cl-bg-elev-2);
  color: var(--cl-text-dim);
  font-size: 11px;
}

.registry-editor-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.registry-editor-empty {
  color: var(--cl-text-dim);
}

.registry-placeholder {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--cl-text-dim);
}

.registry-placeholder__title {
  margin: 0;
  font-size: 16px;
}

.registry-placeholder__hint {
  margin-top: 8px;
  font-size: 13px;
  color: var(--cl-text-faint);
}

.registry-note {
  font-size: 12px;
  color: var(--cl-accent);
}

.registry-save-error {
  font-size: 12px;
  color: var(--cl-danger);
}

.registry-dirty-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--cl-warn);
}

.registry-rail {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
  border-top: 1px solid var(--cl-border);
}
```

Add `import './RecordRegistryPage.css';` after the existing imports in
`RecordRegistryPage.tsx`, then apply exactly these className replacements (left =
current string, right = replacement; keep `data-testid`s untouched):

| line ~ | current className | replacement |
|---|---|---|
| 557 | `flex h-full min-h-0` | `registry-page` |
| 559 | `w-80 flex-shrink-0 flex flex-col border-r border-gray-200 bg-white` | `registry-list` |
| 561 | `flex flex-wrap gap-1 border-b border-gray-200 p-2` | `registry-list__tabs` |
| 566-570 | `` `px-2 py-1 text-xs rounded ${activeTab === tab.id ? 'bg-blue-100 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-100'}` `` | `` `registry-tab${activeTab === tab.id ? ' registry-tab--active' : ''}` `` |
| 580 | `p-2 border-b border-gray-100 flex items-center gap-2` | `registry-list__actions` |
| 588 | `bg-blue-500 text-white px-3 py-1.5 rounded text-xs font-medium hover:bg-blue-600 disabled:opacity-50` | `registry-btn registry-btn--primary` |
| 593 | `flex items-center gap-1` | `registry-kind-picker` |
| 598-602 | `` `px-2 py-1 text-xs rounded border ${pendingCreateKind === kind ? 'bg-blue-100 text-blue-700 font-medium border-blue-300' : 'text-gray-600 hover:bg-gray-100 border-gray-200'}` `` | `` `registry-kind-chip${pendingCreateKind === kind ? ' registry-kind-chip--active' : ''}` `` |
| 609 | `px-2 py-1 text-xs rounded bg-blue-500 text-white font-medium hover:bg-blue-600` | `registry-btn registry-btn--primary` |
| 619 | `px-2 py-1 text-xs rounded text-gray-600 hover:bg-gray-100` | `registry-btn registry-btn--ghost` |
| 627 | `p-2 text-xs text-red-600 border-b border-gray-100` | `registry-error` |
| 635 | `p-2 border-b border-gray-100 flex items-center gap-2` | `registry-list__archived` |
| 636 | `flex items-center gap-2 text-xs text-gray-700` | `registry-list__archived-label` |
| 647 | `p-2 border-b border-gray-100` | `registry-list__search` |
| 666 | `flex-1 overflow-y-auto` | `registry-list__scroll` |
| 668, 670 | `text-sm text-center py-8 text-gray-500` | `registry-list__empty` |
| 672 | `divide-y divide-gray-100` | `registry-list__rows` |
| 683-685 | `` `p-3 cursor-pointer hover:bg-gray-50 ${isSelected ? 'bg-blue-50 border-l-4 border-blue-500' : 'border-l-4 border-transparent'}` `` | `` `registry-row${isSelected ? ' registry-row--selected' : ''}` `` |
| 687 | `font-medium text-sm text-gray-900 truncate` | `registry-row__title` |
| 688 | `text-xs text-gray-500 mt-1` | `registry-row__meta` |
| 689 | `inline-block px-2 py-0.5 rounded-full bg-gray-100 text-gray-600` | `registry-kind-badge` |
| 717, 725 | `bg-blue-500 text-white px-4 py-2 rounded text-sm font-medium hover:bg-blue-600 disabled:opacity-50` | `registry-btn registry-btn--primary` |
| 732 | `border border-gray-300 text-gray-700 px-4 py-2 rounded text-sm font-medium hover:bg-gray-50` | `registry-btn registry-btn--ghost` |
| 737 | `text-xs text-blue-700` | `registry-note` |
| 742 | `w-2 h-2 rounded-full bg-orange-400` | `registry-dirty-dot` |
| 744 | `text-red-500 text-xs` | `registry-save-error` |
| 751 | `border-t border-gray-100 p-4` | `registry-rail` |
| 762 | `flex-1 overflow-y-auto p-4` | `registry-editor-body` |
| 780 | `text-gray-500` | `registry-editor-empty` |
| 788 | `flex-1 flex items-center justify-center text-gray-500` | `registry-placeholder` |
| 790 | `text-lg` | `registry-placeholder__title` |
| 791 | `text-sm mt-2` | `registry-placeholder__hint` |

The `<h3 className="text-sm font-medium text-gray-700 mb-2">Related Records</h3>`
inside the old rail markup moves into `RelatedRecordsCard` (already done in Task 2),
so the rail wrapper keeps only the card.

Run: `cd app && npx vitest run src/pages/RecordRegistryPage.styling.test.tsx`
Expected: PASS. Then the page's existing suites must stay green:

`cd app && npx vitest run src/pages/RecordRegistryPage` → PASS (5 files).

Commit: `git add app/src/pages/RecordRegistryPage.tsx app/src/pages/RecordRegistryPage.css app/src/pages/RecordRegistryPage.styling.test.tsx && git commit -m "fix(registry): token-style the /registry page chrome (light+dark legible)"`

---

### Task 5 — RED: DocumentShell gains an explicit full-width mode

Add to `app/src/editor/taptab/DocumentShell.test.tsx`:

```tsx
describe('DocumentShell width mode', () => {
  it('defaults to the prose (capped) column', () => {
    render(
      <DocumentShell topBar={<DocumentShellHeader title="T" />}>
        <div>content</div>
      </DocumentShell>,
    )
    const shell = screen.getByRole('banner').parentElement!
    expect(shell.className).toContain('document-shell')
    expect(shell.className).not.toContain('document-shell--width-full')
  })

  it('width="full" lets the editing column fill the pane', () => {
    render(
      <DocumentShell topBar={<DocumentShellHeader title="T" />} width="full">
        <div>content</div>
      </DocumentShell>,
    )
    const shell = screen.getByRole('banner').parentElement!
    expect(shell.className).toContain('document-shell--width-full')
  })
})
```

Run: `cd app && npx vitest run src/editor/taptab/DocumentShell.test.tsx`
Expected: FAIL (prop does not exist / class absent).

### Task 6 — GREEN: DocumentShell prop + CSS

In `DocumentShell.tsx` add to `DocumentShellProps`:

```ts
  /**
   * Column width posture. 'prose' (default) keeps the capped paper column every
   * existing surface expects; 'full' lets the column fill the main pane — used
   * by the registry, whose records are wide diagnostic/QMS forms, not prose.
   */
  width?: 'prose' | 'full'
```

Destructure it with `width = 'prose'`, and change the outer div:

```tsx
    <div className={`document-shell document-shell--width-${width} ${className}`}>
```

Append to `app/src/editor/taptab/taptab.css` (after the `.document-shell__column` rule):

```css
/* Full-width posture: the registry's wide forms use the whole main pane. */
.document-shell--width-full .document-shell__column {
  padding: 1.25rem 1.5rem;
}

.document-shell--width-full .document-shell__column .taptab-editor-container {
  max-width: none;
  box-shadow: none;
}
```

Then in `RecordRegistryPage.tsx`, pass the prop on `<DocumentShell ...>`:

```tsx
          width="full"
```

Run: `cd app && npx vitest run src/editor/taptab/DocumentShell.test.tsx`
Expected: PASS.

Commit: `git add app/src/editor/taptab/DocumentShell.tsx app/src/editor/taptab/DocumentShell.test.tsx app/src/editor/taptab/taptab.css app/src/pages/RecordRegistryPage.tsx && git commit -m "feat(editor): DocumentShell width=full; registry editor uses the pane width"`

---

### Task 7 — RED: `record-ref` widget selects records, not ontology terms

Create `app/src/editor/taptab/extensions/WidgetRenderer.recordRef.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { WidgetRenderer } from './WidgetRenderer'

vi.mock('../tabNavPlugin', () => ({ focusAdjacentTabField: vi.fn() }))
vi.mock('../../../shared/api/client', () => ({
  apiClient: {
    listRecordsByKind: vi.fn(async () => ({
      records: [
        { recordId: 'PER-1', payload: { kind: 'person', id: 'PER-1', displayName: 'Dennis Bray' } },
        { recordId: 'PER-2', payload: { kind: 'person', id: 'PER-2', displayName: 'Ada Lovelace' } },
      ],
      total: 2,
    })),
  },
}))

function renderRecordRef(value: unknown) {
  const onCommit = vi.fn()
  render(
    <WidgetRenderer
      widget={'record-ref' as never}
      value={value}
      readOnly={false}
      options={null}
      refKind="person"
      onCommit={onCommit}
      onCancel={() => {}}
      onRefSelect={() => {}}
    />,
  )
  return { onCommit }
}

describe('record-ref widget', () => {
  afterEach(cleanup)

  it('lists records of the declared ref kind instead of opening ontology search', async () => {
    renderRecordRef(null)
    fireEvent.click(document.querySelector('.taptab-widget-value')!)
    expect(await screen.findByText('Dennis Bray')).toBeInTheDocument()
    expect(document.querySelector('.ref-combobox')).toBeNull()
  })

  it('commits the canonical ref object (kind/type/id/label)', async () => {
    const { onCommit } = renderRecordRef(null)
    fireEvent.click(document.querySelector('.taptab-widget-value')!)
    const option = await screen.findByText('Dennis Bray')
    fireEvent.click(option.closest('li')!)
    await waitFor(() => expect(onCommit).toHaveBeenCalledWith({
      kind: 'record', type: 'person', id: 'PER-1', label: 'Dennis Bray',
    }))
  })

  it('displays an existing ref as "label (id)"', () => {
    renderRecordRef({ kind: 'record', type: 'person', id: 'PER-2', label: 'Ada Lovelace' })
    expect(screen.getByText('Ada Lovelace (PER-2)')).toBeInTheDocument()
  })
})
```

Run: `cd app && npx vitest run src/editor/taptab/extensions/WidgetRenderer.recordRef.test.tsx`
Expected: FAIL (widget `record-ref` falls through to the generic text input; no list).

### Task 8 — GREEN(1): register the widget name in client + server

`app/src/editor/taptab/types.ts` — add `| 'record-ref'` to `WidgetType` after `'ref'`:

```ts
  | 'ref'
  | 'record-ref'
```

`app/src/shared/forms/suggestionPlan.ts` — treat it as a structured ref:

```ts
const isRef = widget === 'ref' || widget === 'reflist' || widget === 'record-ref';
```

`app/src/editor/taptab/refValue.ts` — line 21:

```ts
const REF_VALUE_WIDGETS = new Set(['ref', 'record-ref'])
```

`server/src/ui/types.ts` — add `| 'record-ref'` to `WidgetType` (comment:
`// Single record reference (record picker, canonical ref object)`).

`server/src/ui/UISpecLoader.ts` — line ~21 set, add `'record-ref'`; and line 288:

```ts
    if (['ref', 'reflist', 'record-ref'].includes(field.widget as string)) {
```

Run: `cd app && npx tsc --noEmit` and `cd server && npx tsc --noEmit`
Expected: exit 0 both.

### Task 9 — GREEN(2): rewrite RecordRefPicker as a kind-scoped record picker

Replace `app/src/editor/taptab/RecordRefPicker.tsx` wholesale:

```tsx
/**
 * RecordRefPicker — pick a RECORD of a declared kind (person, equipment,
 * training-material, …). Used by the `record-ref` widget; the ontology/vocab
 * search (RefCombobox) is for terms, never for records.
 *
 * The option list comes from the record list itself (GET /records?kind=…), not
 * from the full-text index: freshly created records have no index title, so a
 * query-only search would show nothing. Local substring filtering runs over
 * id/label; no server round-trip per keystroke.
 *
 * Commit shape is the canonical ref (schema/core/datatypes/ref.schema.yaml):
 * { kind: 'record', type: <refKind>, id, label }.
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { apiClient } from '../../shared/api/client';

export interface RecordRefSelection {
  kind: 'record';
  type: string;
  id: string;
  label: string;
}

export interface RecordRefPickerProps {
  value: string;
  /** Record kind to search (the ui.yaml `refKind`). */
  refKind: string;
  onSelect: (ref: RecordRefSelection) => void;
  onCancel: () => void;
}

interface Option {
  recordId: string;
  label: string;
}

function labelOf(payload: Record<string, unknown>, recordId: string): string {
  for (const key of ['displayName', 'name', 'title', 'label', 'id']) {
    const v = payload[key];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return recordId;
}

export function RecordRefPicker({ value, refKind, onSelect, onCancel }: RecordRefPickerProps) {
  const [query, setQuery] = useState(value);
  const [options, setOptions] = useState<Option[] | null>(null);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    let cancelled = false;
    setOptions(null);
    apiClient
      .listRecordsByKind(refKind, 200)
      .then((r) => {
        if (cancelled) return;
        setOptions(
          r.records.map((rec) => ({
            recordId: rec.recordId,
            label: labelOf(rec.payload as Record<string, unknown>, rec.recordId),
          })),
        );
      })
      .catch(() => { if (!cancelled) setOptions([]); });
    return () => { cancelled = true; };
  }, [refKind]);

  const filtered = useMemo(() => {
    if (!options) return [];
    const q = query.trim().toLowerCase();
    if (q.length === 0) return options;
    return options.filter(
      (o) => o.recordId.toLowerCase().includes(q) || o.label.toLowerCase().includes(q),
    );
  }, [options, query]);

  useEffect(() => { setHighlightIndex(0); }, [query]);

  const commit = (option: Option) => {
    onSelect({ kind: 'record', type: refKind, id: option.recordId, label: option.label });
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlightIndex((p) => Math.min(p + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightIndex((p) => Math.max(p - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); const o = filtered[highlightIndex]; if (o) commit(o); }
    else if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
  };

  return (
    <div className="record-ref-picker">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        onClick={(e) => e.stopPropagation()}
        className="taptab-inline-input"
        autoFocus
      />
      <ul className="record-ref-picker__list">
        {options === null ? (
          <li className="record-ref-picker__empty">Loading {refKind} records…</li>
        ) : filtered.length === 0 ? (
          <li className="record-ref-picker__empty">No {refKind} records match “{query}”</li>
        ) : (
          filtered.slice(0, 50).map((o, i) => (
            <li
              key={o.recordId}
              className={`record-ref-picker__item${i === highlightIndex ? ' record-ref-picker__item--active' : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => commit(o)}
            >
              <span className="record-ref-picker__label">{o.label}</span>
              <span className="record-ref-picker__id">{o.recordId}</span>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
```

Add styles next to the existing `.ref-combobox` rules in
`app/src/editor/taptab/taptab.css` (keep them token-only):

```css
/* Record ref picker (kind-scoped record choice, not ontology search) */
.record-ref-picker {
  position: relative;
  width: 100%;
}

.record-ref-picker__list {
  position: absolute;
  z-index: 40;
  left: 0;
  right: 0;
  top: 100%;
  margin: 2px 0 0;
  padding: 4px 0;
  list-style: none;
  max-height: 240px;
  overflow-y: auto;
  background: var(--shell-surface);
  border: 1px solid var(--shell-border);
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
}

.record-ref-picker__item {
  display: flex;
  gap: 8px;
  align-items: baseline;
  padding: 4px 8px;
  font-size: 13px;
  color: var(--shell-text-primary);
  cursor: pointer;
}

.record-ref-picker__item--active,
.record-ref-picker__item:hover {
  background: var(--shell-accent-soft);
}

.record-ref-picker__label {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.record-ref-picker__id {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--shell-text-muted);
}

.record-ref-picker__empty {
  padding: 4px 8px;
  font-size: 12px;
  color: var(--shell-text-muted);
}
```

Note: `box-shadow` uses a literal rgba — that is a shadow, not text colour; the
Task 1/3 token tests only scan the *page/rail* CSS files, not `taptab.css`.

### Task 10 — GREEN(3): dispatch in WidgetRenderer

In `app/src/editor/taptab/extensions/WidgetRenderer.tsx`:

1. Import: `import { RecordRefPicker } from '../RecordRefPicker';`
2. Immediately before the existing `if ((widget === 'ref' || widget === 'combobox') && editing)`
   block, insert:

```tsx
  // Record references (person, equipment, training-material …) are RECORDS, not
  // vocabulary terms: the picker lists records of the ui.yaml-declared refKind
  // and commits the canonical ref object.
  if (widget === 'record-ref' && editing) {
    return (
      <RecordRefPicker
        value={editText}
        refKind={refKind || 'default'}
        onSelect={(ref) => { onCommit(ref); setEditing(false); }}
        onCancel={handleRefCancel}
      />
    );
  }
```

Run: `cd app && npx vitest run src/editor/taptab/extensions/WidgetRenderer.recordRef.test.tsx`
Expected: PASS (3 tests). Then `cd app && npx vitest run src/editor/taptab` → PASS.

Commit: `git add app/src/editor/taptab app/src/shared/forms/suggestionPlan.ts server/src/ui/types.ts server/src/ui/UISpecLoader.ts && git commit -m "feat(editor): record-ref widget — pick records of a declared kind, commit canonical refs"`

### Task 11 — GREEN(4): declare `record-ref` in the training UI spec

In `schema/lab/training-record.ui.yaml`, convert the three ref fields to the new
widget — exactly:

```yaml
    - path: "$.personRef"
      widget: "record-ref"
      label: "Person"
      required: true
      refKind: "person"
    - path: "$.trainingMaterialRef"
      widget: "record-ref"
      label: "Training Material"
      required: true
      refKind: "training-material"
    - path: "$.trainerRef"
      widget: "record-ref"
      label: "Trainer"
      refKind: "person"
```

Then the same substitution for the other registry kinds so the tab is consistent
(`widget: "ref"` → `widget: "record-ref"` only where the field references a RECORD
kind, never a vocabulary domain such as `user`):

- `schema/lab/person.ui.yaml` — none (no ref fields).
- `schema/lab/equipment.ui.yaml` — `$.equipmentClassRef` (equipment-class), `$.instrumentRef` (instrument).
- `schema/lab/equipment-class.ui.yaml` — its record refs only.
- `schema/lab/training-material.ui.yaml` — `$.supersededByRef` (training-material). Leave `$.reviewerRef`/`$.approverRef` (`refKind: person`, record kind) as `record-ref` too — person IS a record kind.
- `schema/lab/competency-authorization.ui.yaml` — `$.personRef`, `$.approvedByRef`.
- `schema/lab/equipment-training-requirement.ui.yaml` — `$.equipmentRef`, `$.equipmentClassRef`.
- `schema/lab/instrument.ui.yaml` — `$.equipmentRef`.
- `schema/lab/calibration-record.ui.yaml` — `$.equipmentRef`, `$.performedByRef`.
- `schema/lab/qualification-record.ui.yaml` — `$.equipmentRef`, `$.performedByRef`.
- `schema/lab/controlled-document.ui.yaml` — **leave as `ref`**: `refKind: user` is a
  lifecycle identity (`USR-*`), not a registry kind.

Do NOT touch `schema/workflow/*` or `protocol.ui.yaml` in this change.

Restart the backend so the spec cache reloads (find the exact PID, never a blanket
kill):

```bash
ss -tlnp | grep ':3001'
# note the pid= of the node process, then
kill <pid>
cd server && npm run dev   # or restart via ./start-app.sh
```

Verify the live projection emits the new widget:

```bash
curl -s -X POST "http://localhost:3001/api/ui/schema/https%3A%2F%2Fcomputable-lab.com%2Fschema%2Fcomputable-lab%2Ftraining-record.schema.yaml/editor-draft" \
  -H 'content-type: application/json' -d '{}' | grep -o '"path":"\$\.\(personRef\|trainerRef\|trainingMaterialRef\)","label":"[^"]*","widget":"[^"]*"'
```
Expected (three lines): `"widget":"record-ref"` for personRef, trainerRef,
trainingMaterialRef.

Commit: `git add schema/lab/*.ui.yaml && git commit -m "spec(registry): declare record-ref for record-reference fields"`

### Task 12 — RED/GREEN: UISpecLoader accepts the new widget (server test)

Create `server/src/ui/UISpecRecordRef.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createUISpecLoader } from './index.js'
import { projectRecord } from './EditorProjectionService.js'

const UI = (name: string) => resolve(process.cwd(), '..', 'schema', 'lab', name)

describe('record-ref widget (training-record.ui.yaml)', () => {
  it('loads without spec errors', async () => {
    const loader = createUISpecLoader()
    const content = await readFile(UI('training-record.ui.yaml'), 'utf-8')
    const res = loader.load(content, UI('training-record.ui.yaml'))
    expect(res.errors ?? []).toEqual([])
    expect(res.success).toBe(true)
  })

  it('projects the three ref slots as record-ref with their record kinds', async () => {
    const loader = createUISpecLoader()
    const content = await readFile(UI('training-record.ui.yaml'), 'utf-8')
    const res = loader.load(content, UI('training-record.ui.yaml'))
    const projection = projectRecord(
      res.spec!,
      { kind: 'training-record', id: 'TRR-TEST' },
      res.spec!.schemaId,
      'TRR-TEST',
    )
    const byPath = new Map(projection.slots.map((s) => [s.path, s]))
    expect(byPath.get('$.personRef')!.widget).toBe('record-ref')
    expect(byPath.get('$.personRef')!.refKind).toBe('person')
    expect(byPath.get('$.trainerRef')!.refKind).toBe('person')
    expect(byPath.get('$.trainingMaterialRef')!.refKind).toBe('training-material')
  })
})
```

Run: `cd server && npx vitest run src/ui/UISpecRecordRef.test.ts`
Expected: PASS after Tasks 8 and 11. If it fails with `invalid widget type
'record-ref'`, the `VALID_WIDGET_TYPES` edit is missing. If it fails on the
import path, check `server/src/ui/index.ts` exports `createUISpecLoader`
(`grep -n "createUISpecLoader" server/src/ui/index.ts`).

Commit: `git add server/src/ui/UISpecRecordRef.test.ts && git commit -m "test(ui): record-ref widget is declared and projected for training-record"`

---

### Task 13 — RED: provenance card

Create `app/src/components/registry/RecordProvenanceCard.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { RecordProvenanceCard } from './RecordProvenanceCard'

const mocked = vi.hoisted(() => ({ listRecordRevisions: vi.fn() }))
vi.mock('../../shared/api/client', () => ({ apiClient: { listRecordRevisions: mocked.listRecordRevisions } }))

beforeEach(() => {
  mocked.listRecordRevisions.mockReset()
  mocked.listRecordRevisions.mockResolvedValue({ records: [] })
})

describe('RecordProvenanceCard', () => {
  it('renders nothing for a create draft (no record id)', () => {
    const { container } = render(<RecordProvenanceCard recordId="" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows who/when from envelope meta', async () => {
    render(
      <RecordProvenanceCard
        recordId="TRR-DEMO-1"
        meta={{ createdBy: 'USR-BRAD', createdAt: '2026-10-03T15:10:21.437Z', contentSha: 'dd544a153b87cbb4c6d663876aa9360f15152176', path: 'records/training-record/TRR-DEMO-1__untitled.yaml' }}
      />,
    )
    expect(screen.getByTestId('record-provenance')).toBeInTheDocument()
    expect(screen.getByText('USR-BRAD')).toBeInTheDocument()
    expect(screen.getByText('2026-10-03T15:10:21.437Z')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('records/training-record/TRR-DEMO-1__untitled.yaml')).toBeInTheDocument())
  })

  it('falls back to payload timestamps when meta is absent', () => {
    render(
      <RecordProvenanceCard
        recordId="TRR-X"
        payload={{ createdBy: 'USR-A', createdAt: '2026-01-01T00:00:00.000Z' }}
      />,
    )
    expect(screen.getByText('USR-A')).toBeInTheDocument()
  })

  it('shows a revision count only when revisions exist', async () => {
    mocked.listRecordRevisions.mockResolvedValue({ records: [{}, {}, {}] })
    render(<RecordProvenanceCard recordId="TRR-Y" meta={{ createdBy: 'USR-B' }} />)
    await waitFor(() => expect(screen.getByText('3')).toBeInTheDocument())
  })
})
```

Run: `cd app && npx vitest run src/components/registry/RecordProvenanceCard.test.tsx`
Expected: FAIL (module not found).

### Task 14 — GREEN: RecordProvenanceCard + rail wiring

Create `app/src/components/registry/RecordProvenanceCard.tsx`:

```tsx
/**
 * RecordProvenanceCard — the registry's "where did this come from" carrot.
 *
 * Registry records carry envelope `meta` (createdAt/createdBy/updatedAt,
 * contentSha/gitCommit, path) and FAIRCommon payload timestamps; the audit
 * trail itself is the repo's git history plus record-revision snapshots
 * (`GET /records/:id/revisions`). This card surfaces those facts read-only and
 * collapses by default. It INVENTS nothing: a create draft has no record id
 * and renders nothing; an unavailable revision count renders no row.
 */
import { useEffect, useState } from 'react'
import { apiClient } from '../../shared/api/client'
import './RecordProvenanceCard.css'

export interface RecordProvenanceMeta {
  createdAt?: string
  createdBy?: string
  updatedAt?: string
  contentSha?: string
  gitCommit?: string
  commitSha?: string
  path?: string
}

export interface RecordProvenanceCardProps {
  recordId: string
  meta?: RecordProvenanceMeta
  payload?: Record<string, unknown>
}

function Row({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="provenance__row">
      <dt className="provenance__label">{label}</dt>
      <dd className="provenance__value" title={title ?? value}>{value}</dd>
    </div>
  )
}

export function RecordProvenanceCard({ recordId, meta, payload }: RecordProvenanceCardProps) {
  const [revisions, setRevisions] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    setRevisions(null)
    if (!recordId) return () => { cancelled = true }
    apiClient
      .listRecordRevisions(recordId)
      .then((r) => { if (!cancelled) setRevisions(r.records.length) })
      .catch(() => { if (!cancelled) setRevisions(null) })
    return () => { cancelled = true }
  }, [recordId])

  const p = payload ?? {}
  const createdBy = meta?.createdBy ?? (typeof p.createdBy === 'string' ? p.createdBy : undefined)
  const createdAt = meta?.createdAt ?? (typeof p.createdAt === 'string' ? p.createdAt : undefined)
  const updatedAt = meta?.updatedAt ?? (typeof p.updatedAt === 'string' ? p.updatedAt : undefined)
  const sha = meta?.gitCommit ?? meta?.contentSha ?? meta?.commitSha

  if (!recordId || (!createdBy && !createdAt && !updatedAt && !sha && !meta?.path)) return null

  return (
    <details className="provenance" data-testid="record-provenance">
      <summary className="provenance__summary">Provenance</summary>
      <dl className="provenance__rows">
        {createdBy ? <Row label="Created by" value={createdBy} /> : null}
        {createdAt ? <Row label="Created" value={createdAt} /> : null}
        {updatedAt ? <Row label="Updated" value={updatedAt} /> : null}
        {sha ? <Row label="Content" value={sha.slice(0, 12)} title={sha} /> : null}
        {meta?.path ? <Row label="File" value={meta.path} /> : null}
        {revisions !== null && revisions > 0 ? <Row label="Revisions" value={String(revisions)} /> : null}
      </dl>
    </details>
  )
}
```

Create `app/src/components/registry/RecordProvenanceCard.css`:

```css
.provenance { color: var(--cl-text); }
.provenance__summary { cursor: pointer; font-size: 13px; font-weight: 600; color: var(--cl-text); }
.provenance__summary:hover { color: var(--cl-accent); }
.provenance__rows { margin: 8px 0 0; display: flex; flex-direction: column; gap: 4px; }
.provenance__row { display: flex; gap: 8px; font-size: 12px; }
.provenance__label { flex: 0 0 76px; color: var(--cl-text-faint); }
.provenance__value {
  flex: 1 1 auto;
  min-width: 0;
  margin: 0;
  color: var(--cl-text-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

Wire it into `RecordRegistryPage.tsx`:

1. `import { RecordProvenanceCard } from '../components/registry/RecordProvenanceCard';`
2. Keep envelope meta on the selection:

```ts
interface RecordMetaLike {
  createdAt?: string;
  createdBy?: string;
  updatedAt?: string;
  contentSha?: string;
  gitCommit?: string;
  commitSha?: string;
  path?: string;
}

interface RecordData {
  recordId: string;
  schemaId: string;
  payload: Record<string, unknown>;
  meta?: RecordMetaLike;
}
```

3. `handleSelectRecord` signature and body:

```ts
  const handleSelectRecord = (record: {
    recordId: string;
    payload: Record<string, unknown>;
    meta?: RecordMetaLike;
  }) => {
    const recordData: RecordData = {
      recordId: record.recordId,
      schemaId: (record.payload as { schemaId?: string }).schemaId || '',
      payload: record.payload,
      ...(record.meta ? { meta: record.meta } : {}),
    };
```

4. The list row click and the combobox edit branch pass the envelope meta:

```tsx
onClick={() => handleSelectRecord({ recordId: record.recordId, payload: record.payload, ...(record.meta ? { meta: record.meta } : {}) })}
```

and

```tsx
handleSelectRecord({ recordId: record.recordId, payload: record.payload, ...(record.meta ? { meta: record.meta } : {}) });
```

5. `refreshSelectedRecord` keeps the fresh meta:

```ts
      setSelectedRecord({
        recordId: fresh.recordId,
        schemaId: fresh.schemaId,
        payload: fresh.payload,
        ...(fresh.meta ? { meta: fresh.meta } : {}),
      });
```

6. Always render the rail when a record is selected, provenance first:

```tsx
          rail={
            selectedRecord ? (
              <div className="registry-rail">
                <RecordProvenanceCard
                  recordId={selectedRecord.recordId}
                  {...(selectedRecord.meta ? { meta: selectedRecord.meta } : {})}
                  payload={selectedRecord.payload}
                />
                {selectedRecord.recordId && editorMode !== 'create' ? (
                  <RelatedRecordsCard
                    recordId={selectedRecord.recordId}
                    onNavigate={(id) => {
                      window.open(`/records/${encodeURIComponent(id)}`, '_blank');
                    }}
                  />
                ) : null}
              </div>
            ) : undefined
          }
```

Run: `cd app && npx vitest run src/components/registry/RecordProvenanceCard.test.tsx`
Expected: PASS (4 tests). Then the page suites: `cd app && npx vitest run src/pages/RecordRegistryPage` → PASS.

Commit: `git add app/src/components/registry/RecordProvenanceCard.tsx app/src/components/registry/RecordProvenanceCard.css app/src/components/registry/RecordProvenanceCard.test.tsx app/src/pages/RecordRegistryPage.tsx && git commit -m "feat(registry): provenance carrot in the record rail (meta + revisions)"`

---

### Task 15 — RED: rail resizer exists only when opted in

Append to `app/src/editor/taptab/DocumentShell.test.tsx`:

```tsx
describe('DocumentShell resizable rail', () => {
  it('has no drag handle by default (fixed rail everywhere else)', () => {
    render(
      <DocumentShell topBar={<DocumentShellHeader title="T" />} rail={<div>rail</div>}>
        <div>content</div>
      </DocumentShell>,
    )
    expect(screen.queryByRole('separator')).toBeNull()
  })

  it('railResizable renders a vertical splitter before the rail', () => {
    render(
      <DocumentShell
        topBar={<DocumentShellHeader title="T" />}
        rail={<div>rail</div>}
        railResizable
      >
        <div>content</div>
      </DocumentShell>,
    )
    const splitter = screen.getByRole('separator')
    expect(splitter.getAttribute('aria-orientation')).toBe('vertical')
    expect(splitter.className).toBe('document-shell__rail-resizer')
  })
})
```

Run: `cd app && npx vitest run src/editor/taptab/DocumentShell.test.tsx`
Expected: FAIL (prop does not exist / no separator).

### Task 16 — GREEN: pointer-drag rail width, persisted

Ruled by Brad 2026-10-17: rail width becomes user-draggable once the column
fills the pane. Mechanism: plain pointer events on a splitter div — NOT
`react-resizable-panels` (that would mean re-platforming `DocumentShell`'s flex
layout; the AppShell drag/persist pattern is the precedent, the splitter here is
~40 lines). Opt-in only: `RawRecordEditor` and `SlideOverEditor` keep the fixed
320px rail.

In `DocumentShell.tsx`:

1. Add to `DocumentShellProps`:

```ts
  /**
   * Let the user drag the rail's left edge. Width persists to localStorage and
   * clamps to [220px, 40% of the body]. Off by default — only the registry
   * opts in; other surfaces keep the fixed --shell-rail-width.
   */
  railResizable?: boolean
```

2. Destructure `railResizable = false`. When `rail && railResizable && !railBelow`,
   render the splitter immediately before the `<aside>` and drive the width via a
   CSS custom property on `.document-shell__body` (the rail's `flex-basis` already
   reads `var(--shell-rail-width)`, so no other consumer changes):

```tsx
  const bodyRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)

  const startDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragging(true)
    const move = (ev: PointerEvent) => {
      const body = bodyRef.current
      if (!body) return
      const rect = body.getBoundingClientRect()
      const w = Math.min(Math.max(rect.right - ev.clientX, 220), rect.width * 0.4)
      body.style.setProperty('--shell-rail-width', `${w}px`)
    }
    const up = (ev: PointerEvent) => {
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerup', up)
      setDragging(false)
      const body = bodyRef.current
      if (!body) return
      const rect = body.getBoundingClientRect()
      const w = Math.min(Math.max(rect.right - ev.clientX, 220), rect.width * 0.4)
      try { localStorage.setItem('cl-registry-rail-width', String(Math.round(w))) } catch { /* private mode */ }
    }
    document.addEventListener('pointermove', move)
    document.addEventListener('pointerup', up)
  }
```

```tsx
      <div className="document-shell__body" ref={bodyRef}>
        <div className="document-shell__column">{children}</div>

        {rail && railResizable && !railBelow && (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize rail"
            tabIndex={0}
            onPointerDown={startDrag}
            className={`document-shell__rail-resizer${dragging ? ' document-shell__rail-resizer--dragging' : ''}`}
          />
        )}
```

3. Restore the saved width on mount (effect on `railResizable`): read
   `localStorage.getItem('cl-registry-rail-width')`, and if numeric set the same
   custom property on `bodyRef.current`. Keyboard: `onKeyDown` on the splitter —
   ArrowLeft/ArrowRight nudge the width by 16px through the identical clamp and
   persist path.

Append to `app/src/editor/taptab/taptab.css` (token-only):

```css
/* Draggable rail splitter (opt-in; registry only) */
.document-shell__rail-resizer {
  flex: 0 0 5px;
  cursor: col-resize;
  background: transparent;
  border-left: 1px solid var(--shell-border);
  margin-left: -1px; /* overlaps the rail's own border */
}

.document-shell__rail-resizer:hover,
.document-shell__rail-resizer--dragging {
  background: var(--shell-accent-soft);
}

.document-shell__rail-resizer:focus-visible {
  outline: 2px solid var(--shell-accent);
  outline-offset: -2px;
}

body { user-select: auto; }
body.cl-rail-dragging { user-select: none; cursor: col-resize; }
```

(Toggle `cl-rail-dragging` on `document.body` inside `startDrag`/`up` so text in
the column never highlights mid-drag. While dragging, also set
`pointer-events: none` on `.document-shell__column` via the
`--dragging` state class if selection bleed-through survives `user-select`.)

In `RecordRegistryPage.tsx`, pass `railResizable` on its `<DocumentShell ...>`.

Run: `cd app && npx vitest run src/editor/taptab/DocumentShell.test.tsx`
Expected: PASS (existing suites + 2 new). Then
`cd app && npx vitest run src/editor/taptab` → PASS.

Commit: `git add app/src/editor/taptab/DocumentShell.tsx app/src/editor/taptab/DocumentShell.test.tsx app/src/editor/taptab/taptab.css app/src/pages/RecordRegistryPage.tsx && git commit -m "feat(editor): draggable registry rail (pointer splitter, localStorage-persisted)"`

---

## Tests / validation

1. Full typecheck: `npm run typecheck` (root) → exit 0, no output errors.
2. Targeted unit suites:
   - `cd app && npx vitest run src/pages/RecordRegistryPage src/components/registry src/editor/taptab`
   - `cd server && npx vitest run src/ui`
   Expect all green.
3. Browser verification (MANDATORY — unit tests + curl do not count; SOP rule 12).
   Both servers are already up (:5174 → :3001). Using the browser tool against
   `http://localhost:5174/registry`:
   a. Click the **Training** tab, click the `TRR-DEMO-1` row.
   b. Read the rail colours (must be theme ink, not light grey):
      ```js
      (() => {
        const el = document.querySelector('.document-shell__rail .related-records__title');
        const cs = el && getComputedStyle(el);
        return { color: cs && cs.color, bg: getComputedStyle(document.querySelector('.cl-app')).backgroundColor };
      })()
      ```
      Dark (default): `color: rgb(230, 237, 243)`, app bg `rgb(14, 17, 22)`.
      Light (`localStorage.setItem('cl-theme','light')` + reload):
      `color: rgb(31, 35, 40)`, app bg `rgb(255, 255, 255)`.
      Verdict rule: colour must equal the theme's `--cl-text` — never the old
      `rgb(156, 163, 175)` (#9ca3af).
   c. Width: with a 1600px viewport,
      ```js
      document.querySelector('.taptab-editor-container').getBoundingClientRect().width
      ```
      Expected > 900 (was 720).
   d. Refs: in the Training tab press **Create** → Confirm, click the **Person**
      field. Expected: a list of `person` records (PER-…), NOT an ontology/tag
      dropdown; picking one shows `Dennis Bray (PER-DEMO-AUTHOR)`-style value.
      Save, then confirm the payload is an object:
      ```bash
      curl -s "http://localhost:3001/api/records?kind=training-record&limit=5" | grep -o '"personRef":{[^}]*}'
      ```
      Expected `{"kind":"record","type":"person","id":"PER-…","label":"…"}` — never a bare string.
   e. Provenance: on the saved record the rail shows a collapsed **Provenance**
      disclosure; opening it lists Created by / Created / Updated / Content / File.
      (RULED: collapsed `<details>` is the accepted form — no newest-revision id.)
   f. Draggable rail: drag the splitter left of the rail ~200px, then reload the
      page. Expected: rail follows the pointer, clamps at 220px min / 40% max, and
      after reload the width persists (`localStorage.getItem('cl-registry-rail-width')`
      matches the rail's measured width ±2px). Other DocumentShell surfaces
      (`/record` raw editor) show NO splitter.
4. Commit the plan file itself if the repo tracks `.hermes/plans` (it currently
   does not — leave it untracked, per existing practice).

## Risks, tradeoffs, open questions

- **Widget name is declared in four places** (client `WidgetType`, client
  `refValue`, server `WidgetType`, server `VALID_WIDGET_TYPES`). Miss the server one
  and every edited `*.ui.yaml` fails loader validation (the spec silently falls back
  to inferred widgets). Task 12's server test is the guard.
- **Backend spec cache**: `*.ui.yaml` edits do not hot-reload into :3001. Restart by
  PID; never `pkill`.
- **Blast radius of the page restyle**: `RecordRegistryPage` has 5 suites that mock
  `ProjectionTapTabEditor`; they assert `data-testid`s and copy, not classes, so the
  swap is safe. Re-run them.
- **`record-ref` in create mode**: the picker lists records of the kind, so a brand
  new record can reference an existing person/training-material even before the
  index has a title for it (that is why the list endpoint is used, not
  `/tree/search`).
- **`label` on the ref object**: `ref.schema.yaml` evaluates `label` and sets no
  `additionalProperties: false`, and the root `unevaluatedProperties: false` sees
  `label` as evaluated through the `$ref` — so the label is schema-legal. If a
  future schema tightens `additionalProperties`, drop the label rather than widening
  the schema.
- **Deliberately out of scope**: `schema/workflow/*` refs (planned-run, protocol-ide,
  robot-plan) and `controlled-document.authorRef` (`refKind: user`, a lifecycle
  identity). Convert them in a follow-up once the widget has proven itself in the
  registry.
- **RULED 2026-10-17 (rail width)**: draggable — added as Tasks 15/16. Scope
  stayed opt-in: only `RecordRegistryPage` gets `railResizable`; the rail's
  `flex-basis` already reads `var(--shell-rail-width)`, so dragging sets that one
  custom property on `.document-shell__body` and touches no other surface.
- **RULED 2026-10-17 (provenance disclosure)**: collapsed `<details>` is
  sufficient — no inline newest-revision-id. The revisions count row stays.
