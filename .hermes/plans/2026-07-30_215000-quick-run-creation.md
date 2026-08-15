# Quick Run Creation — Skip TapTab, Jump to Event Editor

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** When a user clicks "+ New Run" on a project, immediately create a run record with a date-based default name and open the event editor (deck canvas) — bypassing the TapTab record-create form entirely. The run name is displayed on screen and click-to-editable.

**Architecture:** The current flow opens a `record-create` workspace tab hosting a TapTab form panel. The new flow creates the run record via `apiClient.createRecord()` with a sensible default name (date + "Run" + sequence), then opens a `deck` workspace tab bound to the new run — the same pattern `RunRow.openMethodDeck()` uses for existing runs without a method. An editable title component in the deck toolbar allows inline renaming, which persists to the run record via `apiClient.updateRecord()` and updates the workspace tab title via `ws.renameTab()`.

**Tech Stack:** React 18, TypeScript (exactOptionalPropertyTypes), react-router-dom, Fastify, CSS custom properties (--cl-* tokens)

---

## Current State

### "New Run" flow (what we're replacing)
1. User clicks "+ New Run" on `ProjectDetailsView` (line 228)
2. `openNewRunDirect()` calls `ws.openTab({ kind: 'record-create', nodeType: 'run', studyId })`
3. `ProjectWorkspacePage.LeftPane` renders `<RecordCreatePanel>` (line 274)
4. User fills in a TapTab form with title, recordId, etc.
5. On save: `POST /api/records` creates the run, then `onCreated()` closes the tab
6. User must then find the run in the Find tab and click it to open the deck

### Existing "open deck for run" flow (what we're replicating)
File: `app/src/event-editor/projects/ProjectDetailsView.tsx:430-470`

```typescript
const openMethodDeck = useCallback(async () => {
  const summary = await getRunMethod(run.recordId)
  if (!summary.hasMethod || !summary.methodEventGraphId) {
    // No method — open a fresh canvas bound to the run
    ws.openTab({
      id: `tab-deck-new-${run.recordId}`,
      kind: 'deck',
      eventGraphId: '',
      runId: run.recordId,
      title: run.title,
    })
    return
  }
  // Method exists — open with the event graph
  ws.openTab({
    id: `tab-deck-${summary.methodEventGraphId}`,
    kind: 'deck',
    eventGraphId: summary.methodEventGraphId,
    title: run.title,
  })
}, [run.recordId, run.title, ws])
```

### Run record creation
- `apiClient.createRecord(schemaId, payload)` — POST /api/records
- `schemaId`: `"https://computable-lab.com/schema/computable-lab/run.schema.yaml"`
- Required fields: `kind: "run"`, `recordId: "RUN-..."`, `studyId`, `status: "planned"`
- Optional: `title`, `experimentId`, `shortSlug`, etc.
- `recordId` is generated client-side: `RUN-${slug}-${rand4}` (from `RecordCreatePanel.tsx:72`)
- `ID_PREFIXES` map: `app/src/event-editor/create/RecordCreatePanel.tsx:46`

### Run schema (after Phase 4)
File: `schema/studies/run.schema.yaml`
- Required: `kind`, `recordId`, `studyId`, `status`
- Optional: `experimentId`, `title`, `shortSlug`, `status` (enum: planned|in_progress|completed|aborted|failed|superseded)

### Deck toolbar (where title will go)
File: `app/src/event-editor/viewer/deck/DeckToolbar.tsx`
- Currently renders: UndoRedo, DeckModeSwitcher, VocabSwitcher, ToolSwitcher, TipChip, EventGraphChip
- No title display exists
- The toolbar is rendered in `AppShell`'s `viewerToolbar` slot (above the left pane)

### Tab rename
- `ws.renameTab(tabId, title)` — updates workspace tab title in state, persists to workspace.yaml
- `apiClient.updateRecord(recordId, payload)` — updates the run record on the server
- No inline-edit pattern exists in the codebase

### Protocol spec vision (tmp/protocol-spec.md)
Key quotes that inform this plan:
- "Whenever a run is created, the event graph should open immediately with a default name based on the date and protocol name displayed at the top of the canvas that a user can click on and rename"
- "this should go straight to the editor, we are trying to make the system non-record-based-from-the-user-perspective"
- "Let's try to make useful defaults to name runs and assume that the logged in user is the executor"
- Run lifecycle: plan → execute → analyze, with all phases editable

---

## Phased Implementation

### Phase 1: Quick Run Creation — Bypass TapTab, Open Deck Directly

### Task 1.1: Create `quickCreateRun` helper function

**Objective:** A reusable function that creates a run record via API and returns the recordId + default title.

**Files:**
- Create: `app/src/event-editor/create/quickCreateRun.ts`

**Step 1: Write the helper**

```typescript
// app/src/event-editor/create/quickCreateRun.ts
/**
 * quickCreateRun — creates a run record via POST /api/records and returns
 * the recordId + default title. Bypasses the TapTab RecordCreatePanel.
 *
 * The default name is date-based: "2026-07-30 Run" (recency sortable).
 * If a protocolName is provided, it becomes "2026-07-30 <protocolName>".
 *
 * The recordId follows the existing convention: RUN-<slug>-<rand4>.
 */

import { apiClient } from '../../shared/api/client'

const RUN_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/run.schema.yaml'

function slugify(text: string, max: number): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, max)
}

function generateRunId(title: string): string {
  const slug = slugify(title, 24) || 'untitled'
  const rand = Math.random().toString(36).slice(2, 6)
  return `RUN-${slug}-${rand}`
}

function todayDateStr(): string {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export interface QuickCreateRunResult {
  recordId: string
  title: string
}

export async function quickCreateRun(options: {
  studyId: string
  experimentId?: string
  protocolName?: string
}): Promise<QuickCreateRunResult> {
  const dateStr = todayDateStr()
  const title = options.protocolName
    ? `${dateStr} ${options.protocolName}`
    : `${dateStr} Run`

  const recordId = generateRunId(title)
  const shortSlug = slugify(title, 30)

  const payload: Record<string, unknown> = {
    kind: 'run',
    recordId,
    studyId: options.studyId,
    status: 'planned',
    title,
    shortSlug,
  }

  // experimentId is optional — only include if provided (exactOptionalPropertyTypes)
  if (options.experimentId) {
    payload.experimentId = options.experimentId
  }

  await apiClient.createRecord(RUN_SCHEMA_ID, payload)

  return { recordId, title }
}
```

**Step 2: Verify typecheck**

Run: `cd /home/brad/git/computable-lab && npm run typecheck -w app`
Expected: PASS

**Step 3: Commit**

```bash
git add app/src/event-editor/create/quickCreateRun.ts
git commit -m "feat(ui): add quickCreateRun helper — creates run via API with date-based name"
```

### Task 1.2: Replace `openNewRunDirect` with quick-create + open deck

**Objective:** When user clicks "+ New Run" on ProjectDetailsView, create the run and open a deck tab bound to it — skipping the TapTab form.

**Files:**
- Modify: `app/src/event-editor/projects/ProjectDetailsView.tsx`

**Step 1: Replace the callback**

Replace the `openNewRunDirect` callback (around line 179):

```typescript
// OLD:
const openNewRunDirect = useCallback(() => {
  ws.openTab({
    id: recordCreateTabId('run', studyId),
    kind: 'record-create',
    nodeType: 'run',
    studyId,
    title: 'New run',
  })
}, [studyId, ws])

// NEW:
const [creatingRun, setCreatingRun] = useState(false)

const openNewRunDirect = useCallback(async () => {
  setCreatingRun(true)
  try {
    const result = await quickCreateRun({ studyId })
    // Open a fresh deck canvas bound to the new run — same pattern as
    // RunRow.openMethodDeck for runs without a method event graph.
    ws.openTab({
      id: `tab-deck-new-${result.recordId}`,
      kind: 'deck',
      eventGraphId: '',
      runId: result.recordId,
      title: result.title,
    })
    // Switch right pane to protocol mode so user sees protocol steps
    ws.setRightPaneMode('protocol')
  } catch (err) {
    window.alert(err instanceof Error ? err.message : String(err))
  } finally {
    setCreatingRun(false)
  }
}, [studyId, ws])
```

Add import at the top:
```typescript
import { quickCreateRun } from '../create/quickCreateRun'
```

Add `useState` to the imports from 'react' if not already present.

**Step 2: Update the button to show loading state**

Update the button (around line 226):

```typescript
<button
  type="button"
  className="project-details-view__create-btn"
  onClick={() => void openNewRunDirect()}
  disabled={creatingRun}
  data-testid="project-details-new-run-direct"
  title="Create a run and open the event editor"
>
  {creatingRun ? 'Creating…' : '+ New Run'}
</button>
```

**Step 3: Verify typecheck**

Run: `cd /home/brad/git/computable-lab && npm run typecheck -w app`
Expected: PASS

**Step 4: Commit**

```bash
git add app/src/event-editor/projects/ProjectDetailsView.tsx
git commit -m "feat(ui): +New Run opens event editor directly — bypasses TapTab form"
```

### Task 1.3: Also replace per-experiment "+ Run" with quick-create

**Objective:** The per-experiment "+ Run" button in `ExperimentRow` should also use the quick-create flow.

**Files:**
- Modify: `app/src/event-editor/projects/ProjectDetailsView.tsx`

**Step 1: Update `openNewRun` in `ExperimentRow`**

Replace the `openNewRun` callback in the `ExperimentRow` component (around line 334):

```typescript
// OLD:
const openNewRun = useCallback(() => {
  ws.openTab({
    id: recordCreateTabId('run', experiment.recordId),
    kind: 'record-create',
    nodeType: 'run',
    studyId,
    experimentId: experiment.recordId,
    title: 'New run',
  })
}, [experiment.recordId, studyId, ws])

// NEW:
const [creatingRun, setCreatingRun] = useState(false)

const openNewRun = useCallback(async () => {
  setCreatingRun(true)
  try {
    const result = await quickCreateRun({
      studyId,
      experimentId: experiment.recordId,
    })
    ws.openTab({
      id: `tab-deck-new-${result.recordId}`,
      kind: 'deck',
      eventGraphId: '',
      runId: result.recordId,
      title: result.title,
    })
    ws.setRightPaneMode('protocol')
  } catch (err) {
    window.alert(err instanceof Error ? err.message : String(err))
  } finally {
    setCreatingRun(false)
  }
}, [experiment.recordId, studyId, ws])
```

**Step 2: Update the button to show loading state**

```typescript
<button
  type="button"
  className="project-details-view__create-btn project-details-view__create-btn--row"
  onClick={() => void openNewRun()}
  disabled={creatingRun}
  data-testid={`project-details-new-run-${experiment.recordId}`}
  title={`Create a run under ${experiment.title}`}
>
  {creatingRun ? '…' : '+ Run'}
</button>
```

**Step 3: Verify typecheck**

Run: `cd /home/brad/git/computable-lab && npm run typecheck -w app`
Expected: PASS

**Step 4: Commit**

```bash
git add app/src/event-editor/projects/ProjectDetailsView.tsx
git commit -m "feat(ui): per-experiment +Run also uses quick-create flow"
```

---

### Phase 2: Editable Run Title in Deck Toolbar

### Task 2.1: Create `EditableTitle` component

**Objective:** A reusable inline-editable title component that displays text, becomes an input on click, and calls back on commit.

**Files:**
- Create: `app/src/shared/shell/EditableTitle.tsx`
- Create: `app/src/shared/shell/EditableTitle.css`

**Step 1: Write the component**

```typescript
// app/src/shared/shell/EditableTitle.tsx
/**
 * EditableTitle — displays a title that becomes an input on click.
 * Calls onCommit(title) when the user presses Enter or blurs the input.
 * Esc cancels the edit and restores the original title.
 *
 * Used for the run name in the deck toolbar.
 */

import { useState, useRef, useEffect, type KeyboardEvent } from 'react'
import './EditableTitle.css'

export interface EditableTitleProps {
  title: string
  onCommit: (title: string) => void
  /** Optional placeholder when title is empty. */
  placeholder?: string
  /** Test ID for the display span. */
  testId?: string
}

export function EditableTitle({ title, onCommit, placeholder, testId }: EditableTitleProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(title)
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus the input when entering edit mode
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  // Reset draft when title prop changes (e.g. external rename)
  useEffect(() => {
    setDraft(title)
  }, [title])

  const startEdit = () => {
    setDraft(title)
    setEditing(true)
  }

  const commit = () => {
    const trimmed = draft.trim()
    if (trimmed && trimmed !== title) {
      onCommit(trimmed)
    }
    setEditing(false)
  }

  const cancel = () => {
    setDraft(title)
    setEditing(false)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      commit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      cancel()
    }
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="editable-title__input"
        data-testid={testId ? `${testId}-input` : 'editable-title-input'}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={commit}
      />
    )
  }

  return (
    <span
      className="editable-title__display"
      data-testid={testId ?? 'editable-title'}
      onClick={startEdit}
      title="Click to rename"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          startEdit()
        }
      }}
    >
      {title || placeholder || 'Untitled'}
    </span>
  )
}
```

**Step 2: Write the CSS**

```css
/* app/src/shared/shell/EditableTitle.css */

.editable-title__display {
  cursor: text;
  font-size: 14px;
  font-weight: 600;
  color: var(--cl-text);
  padding: 2px 6px;
  border-radius: 3px;
  border: 1px solid transparent;
  transition: border-color 0.15s, background 0.15s;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 300px;
  display: inline-block;
  outline: none;
}

.editable-title__display:hover {
  background: var(--cl-bg-elev-2);
  border-color: var(--cl-border);
}

.editable-title__input {
  font-size: 14px;
  font-weight: 600;
  color: var(--cl-text);
  padding: 2px 6px;
  border: 1px solid var(--cl-accent);
  border-radius: 3px;
  background: var(--cl-bg);
  outline: none;
  max-width: 300px;
}
```

**Step 3: Write a test**

```typescript
// app/src/shared/shell/EditableTitle.test.tsx
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { EditableTitle } from './EditableTitle'

afterEach(() => cleanup())

describe('EditableTitle', () => {
  it('displays the title', () => {
    render(<EditableTitle title="My Run" onCommit={() => {}} />)
    expect(screen.getByText('My Run')).toBeDefined()
  })

  it('enters edit mode on click', () => {
    render(<EditableTitle title="My Run" onCommit={() => {}} testId="title" />)
    fireEvent.click(screen.getByTestId('title'))
    expect(screen.getByTestId('title-input')).toBeDefined()
  })

  it('commits on Enter', () => {
    const onCommit = vi.fn()
    render(<EditableTitle title="My Run" onCommit={onCommit} testId="title" />)
    fireEvent.click(screen.getByTestId('title'))
    const input = screen.getByTestId('title-input')
    fireEvent.change(input, { target: { value: 'New Name' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onCommit).toHaveBeenCalledWith('New Name')
  })

  it('cancels on Escape', () => {
    const onCommit = vi.fn()
    render(<EditableTitle title="My Run" onCommit={onCommit} testId="title" />)
    fireEvent.click(screen.getByTestId('title'))
    const input = screen.getByTestId('title-input')
    fireEvent.change(input, { target: { value: 'New Name' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(onCommit).not.toHaveBeenCalled()
    expect(screen.getByText('My Run')).toBeDefined()
  })

  it('does not commit if title unchanged', () => {
    const onCommit = vi.fn()
    render(<EditableTitle title="My Run" onCommit={onCommit} testId="title" />)
    fireEvent.click(screen.getByTestId('title'))
    fireEvent.keyDown(screen.getByTestId('title-input'), { key: 'Enter' })
    expect(onCommit).not.toHaveBeenCalled()
  })
})
```

**Step 4: Run test**

Run: `cd /home/brad/git/computable-lab && npx vitest run --environment jsdom app/src/shared/shell/EditableTitle.test.tsx`
Expected: PASS (5 tests)

**Step 5: Commit**

```bash
git add app/src/shared/shell/EditableTitle.tsx app/src/shared/shell/EditableTitle.css \
  app/src/shared/shell/EditableTitle.test.tsx
git commit -m "feat(ui): add EditableTitle component for inline title editing"
```

### Task 2.2: Add editable run title to the deck toolbar

**Objective:** Show the run name in the deck toolbar with click-to-edit, persisting changes to both the workspace tab and the run record.

**Files:**
- Modify: `app/src/event-editor/viewer/deck/DeckToolbar.tsx`
- Modify: `app/src/event-editor/viewer/deck/DeckToolbar.tsx` (add CSS import or inline styles)

**Step 1: Add EditableTitle to DeckToolbar**

The DeckToolbar needs to know the active workspace tab to get the runId and title. The `ViewerToolbar` already passes `tab` to `DeckToolbar` — wait, actually `DeckToolbar` doesn't receive props. Let me check...

Actually, `DeckToolbar` is rendered by `ViewerToolbar` which receives `tab: WorkspaceTab | null`. Currently `DeckToolbar` takes no props. We need to pass the tab (or at least the title and runId) down.

Modify `ViewerToolbar.tsx` to pass the tab to `DeckToolbar`:

```typescript
// In ViewerToolbar.tsx, change:
case 'deck':
  return <DeckToolbar />
// To:
case 'deck':
  return <DeckToolbar tab={tab} />
```

Then modify `DeckToolbar.tsx`:

```typescript
// app/src/event-editor/viewer/deck/DeckToolbar.tsx

import { useState } from 'react'
import { UndoRedoControls } from '../../topbar/UndoRedoControls'
import { DeckModeSwitcher } from '../../topbar/DeckModeSwitcher'
import { VocabSwitcher } from '../../topbar/VocabSwitcher'
import { ToolSwitcher } from '../../topbar/ToolSwitcher'
import { TipChip } from '../../topbar/TipChip'
import { EventGraphChip } from '../../topbar/EventGraphChip'
import { useEventEditor } from '../../EventEditorContext'
import { useWorkspace } from '../../workspace/WorkspaceContext'
import { EditableTitle } from '../../../shared/shell/EditableTitle'
import { apiClient } from '../../../shared/api/client'
import type { WorkspaceTab } from '../../workspace/types'

export interface DeckToolbarProps {
  tab: WorkspaceTab | null
}

export function DeckToolbar({ tab }: DeckToolbarProps) {
  const { state } = useEventEditor()
  const ws = useWorkspace()
  const [renaming, setRenaming] = useState(false)
  const runDeckLocked = state.runDeckLock?.locked === true

  // Only show the editable title for deck tabs that have a runId
  const hasRun = tab?.kind === 'deck' && tab.runId
  const runId = tab?.kind === 'deck' ? tab.runId : undefined
  const tabTitle = tab?.kind === 'deck' ? tab.title : undefined

  const handleRename = async (newTitle: string) => {
    if (!tab || !runId) return
    // Update the workspace tab title immediately (optimistic)
    ws.renameTab(tab.id, newTitle)
    // Persist to the run record on the server
    try {
      const existing = await apiClient.getRecord(runId)
      const payload = existing.payload as Record<string, unknown>
      payload.title = newTitle
      await apiClient.updateRecord(runId, payload)
    } catch (err) {
      // Revert the tab title on failure
      ws.renameTab(tab.id, tabTitle ?? 'Run')
      console.error('Failed to rename run:', err)
    }
  }

  return (
    <div className="event-editor viewer-toolbar viewer-toolbar--deck">
      {hasRun ? (
        <EditableTitle
          title={tabTitle ?? 'Untitled Run'}
          onCommit={handleRename}
          testId="run-title"
        />
      ) : null}
      <span className="deck-toolbar__separator" aria-hidden />
      <UndoRedoControls />
      {!runDeckLocked ? (
        <>
          <DeckModeSwitcher />
          <VocabSwitcher />
        </>
      ) : null}
      <ToolSwitcher />
      <TipChip />
      <EventGraphChip />
    </div>
  )
}
```

**Step 2: Add separator CSS**

Add to the existing event-editor CSS or inline:
```css
.deck-toolbar__separator {
  width: 1px;
  height: 20px;
  background: var(--cl-border);
  margin: 0 4px;
  flex-shrink: 0;
}
```

**Step 3: Verify typecheck**

Run: `cd /home/brad/git/computable-lab && npm run typecheck -w app`
Expected: PASS

**Step 4: Commit**

```bash
git add app/src/event-editor/viewer/deck/DeckToolbar.tsx app/src/event-editor/viewer/ViewerToolbar.tsx
git commit -m "feat(ui): add editable run title to deck toolbar — click to rename, persists to server"
```

---

### Phase 3: Auto-switch right pane to Protocol tab on new run

### Task 3.1: Auto-switch to Protocol tab when opening a new run deck

**Objective:** Per the protocol spec, when a new run is created the Protocol tab should be active so the user sees protocol steps alongside the empty deck.

This is already included in Task 1.2 — the `openNewRunDirect` callback calls `ws.setRightPaneMode('protocol')` after opening the deck tab. No additional work needed.

---

## Files Likely to Change

| File | Change |
|------|--------|
| `app/src/event-editor/create/quickCreateRun.ts` | Create — helper to create run via API with date-based name |
| `app/src/event-editor/projects/ProjectDetailsView.tsx` | Modify — replace openNewRunDirect + openNewRun with quick-create flow |
| `app/src/shared/shell/EditableTitle.tsx` | Create — inline-editable title component |
| `app/src/shared/shell/EditableTitle.css` | Create — styling for editable title |
| `app/src/shared/shell/EditableTitle.test.tsx` | Create — tests for editable title |
| `app/src/event-editor/viewer/deck/DeckToolbar.tsx` | Modify — add EditableTitle, accept tab prop |
| `app/src/event-editor/viewer/ViewerToolbar.tsx` | Modify — pass tab to DeckToolbar |

## Tests / Validation

1. `npx vitest run --environment jsdom app/src/shared/shell/EditableTitle.test.tsx` — 5 tests
2. `npm run typecheck -w app` — typecheck passes
3. `npm run typecheck -w server` — typecheck passes (no server changes expected)
4. Manual: Open a project, click "+ New Run", verify:
   - Run is created (check via API or Find tab)
   - Deck canvas opens immediately (no TapTab form)
   - Run name appears in toolbar with date prefix (e.g. "2026-07-30 Run")
   - Click the name → input appears → type new name → Enter → name persists
   - Close and reopen the run — name is still the edited name

## Risks, Tradeoffs, and Open Questions

1. **Race condition on createRecord**: If the API call is slow, the user sees a "Creating…" state. This is acceptable — the alternative (optimistically opening a deck tab before the record exists) would fail when the deck tries to save.

2. **RecordId collisions**: The 4-character random suffix (`rand4`) gives ~1.3M combinations per slug. Sufficient for a single lab appliance.

3. **Optimistic rename revert**: If `updateRecord` fails after `renameTab`, we revert the tab title. The user might see a flicker. This is the correct tradeoff — the optimistic update makes the UI feel instant.

4. **No experimentId on direct runs**: Runs created via "+ New Run" (not via an experiment) have no `experimentId`. This is by design (Phase 4 of the UI overhaul). The run still has `studyId` and appears in the project's flat runs list.

5. **Protocol tab empty state**: When a new run has no protocol, the Protocol tab in the right pane will show its empty state. This is correct — the user can add a protocol later. The protocol spec says "A blank run has no steps."

6. **Date format**: Using `YYYY-MM-DD` for recency sortability. The spec says "starting with the date 2026-07-30 so that it is recency sortable." If multiple runs are created on the same day, they'll have the same date prefix — the random suffix in the recordId differentiates them.
