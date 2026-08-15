# Run-to-Project Breadcrumb Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Add a context-aware breadcrumb in the deck toolbar that shows the project path the user followed to reach a run, with a click-to-navigate-back behavior like a browser back button.

**Architecture:** The workspace is per-study — `ProjectWorkspacePage` receives `studyId` from the URL (`/project/:studyId`) and the `WorkspaceProvider` holds that studyId throughout the session. When a user opens a run from within a project, the deck tab already lives inside that project's workspace context. The breadcrumb reads the workspace's `studyId` (the "how I got here" context) rather than querying the run record for its `projectIds[]` (which could be multiple). This means the breadcrumb shows the project you navigated FROM, not all projects the run belongs to — exactly like a browser back button. For direct run access (e.g. `/runs/:runId` from the global search or runs collection), there's no project context, so the breadcrumb is absent or shows the run's own `projectIds` as clickable links.

**Tech Stack:** React 18, TypeScript (exactOptionalPropertyTypes), react-router-dom, CSS custom properties (--cl-* tokens)

---

## Current State

### How runs are opened from projects
1. User is at `/project/:studyId` — `ProjectWorkspacePage` wraps in `WorkspaceProvider studyId={studyId}`
2. User clicks a run in `ProjectDetailsView` → `openMethodDeck()` calls `ws.openTab({ kind: 'deck', eventGraphId, runId, title })`
3. The deck tab opens inside the SAME project workspace — the workspace's `studyId` is the project context
4. `DeckToolbar` receives the `tab` (with `runId` and `title`) but has no breadcrumb

### How runs are opened directly (not from a project)
1. User clicks a run from `/runs` collection or global search
2. Navigates to `/runs/:runId` — `RunWorkspacePage` (no `WorkspaceProvider`, no project context)
3. No breadcrumb needed, or breadcrumb shows run's `projectIds` as links

### What the DeckToolbar currently shows
- `EditableTitle` with the run name (leftmost)
- Separator
- UndoRedo, DeckModeSwitcher, VocabSwitcher, ToolSwitcher, TipChip, EventGraphChip

### What the workspace knows
- `ws.state.studyId` — the project that owns this workspace
- `ws.state.tabs` — all open tabs
- `ws.state.activeTabId` — the active tab

### What the deck tab knows
- `tab.runId` — the run's record ID
- `tab.title` — the run's display name
- The tab does NOT carry `studyId` — the workspace context holds it

---

## Proposed Approach

Add a `RunBreadcrumb` component to the DeckToolbar, positioned BEFORE the EditableTitle. It shows:

```
[Project Name] › [Run Name]
```

When the user is inside a project workspace (`/project/:studyId`), the breadcrumb shows the project name as a clickable link that navigates back to the project-details tab. The run name is shown as the current page (not clickable — it's already editable via EditableTitle).

When the user accessed the run directly (not from a project), the breadcrumb fetches the run's `projectIds` from the record and shows each as a clickable link. If no projects are linked, no breadcrumb is shown.

The key insight: **the workspace's `studyId` is the navigation context** (how you got here), while the run's `projectIds` is the **data context** (what the run is linked to). The breadcrumb shows the navigation context first, with data-context projects as secondary links if different.

---

## Phased Implementation

### Task 1: Create `RunBreadcrumb` component

**Objective:** A breadcrumb component that shows project → run path with click-to-navigate.

**Files:**
- Create: `app/src/event-editor/viewer/deck/RunBreadcrumb.tsx`
- Create: `app/src/event-editor/viewer/deck/RunBreadcrumb.css`

**Step 1: Write the component**

```tsx
// app/src/event-editor/viewer/deck/RunBreadcrumb.tsx
/**
 * RunBreadcrumb — context-aware breadcrumb showing the project path
 * the user followed to reach this run.
 *
 * Two modes:
 * 1. Inside a project workspace (ws.state.studyId is set):
 *    Shows [Project Name] › as a clickable link back to the project.
 *    The project name is fetched from the study tree.
 *
 * 2. Direct run access (no workspace context):
 *    Fetches the run's projectIds and shows each as a clickable link.
 *    If no projects linked, renders nothing.
 *
 * The run name itself is NOT shown in the breadcrumb — it's already
 * displayed by the EditableTitle to the right. The breadcrumb only
 * shows the "parent" path.
 */

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWorkspace } from '../../workspace/WorkspaceContext'
import { apiClient } from '../../../shared/api/client'
import { getStudyTree } from '../../../shared/api/treeClient'
import './RunBreadcrumb.css'

export interface RunBreadcrumbProps {
  /** The run's recordId, for fetching projectIds when no workspace context. */
  runId?: string
}

export function RunBreadcrumb({ runId }: RunBreadcrumbProps) {
  const ws = useWorkspace()
  const navigate = useNavigate()
  const [projectName, setProjectName] = useState<string | null>(null)
  const [linkedProjects, setLinkedProjects] = useState<Array<{ id: string; title: string }>>([])

  const workspaceStudyId = ws.state.studyId

  // Mode 1: Inside a project workspace — fetch the study's title
  useEffect(() => {
    if (!workspaceStudyId) return
    let cancelled = false
    getStudyTree()
      .then((res) => {
        if (cancelled) return
        const study = res.studies.find((s) => s.recordId === workspaceStudyId)
        if (study) setProjectName(study.title)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [workspaceStudyId])

  // Mode 2: Direct access — fetch the run's projectIds from its record
  useEffect(() => {
    if (!runId || workspaceStudyId) return
    let cancelled = false
    apiClient.getRecord(runId)
      .then((record) => {
        if (cancelled) return
        const payload = record.payload as Record<string, unknown>
        const ids = payload.projectIds
        if (Array.isArray(ids) && ids.length > 0) {
          // Fetch each project's title
          Promise.all(
            ids.map(async (id: string) => {
              try {
                const rec = await apiClient.getRecord(id)
                const p = rec.payload as Record<string, unknown>
                return { id, title: typeof p.title === 'string' ? p.title : id }
              } catch {
                return { id, title: id }
              }
            })
          ).then((projects) => {
            if (!cancelled) setLinkedProjects(projects)
          })
        }
        // Also check singular studyId as fallback
        if (typeof payload.studyId === 'string' && !Array.isArray(ids)) {
          apiClient.getRecord(payload.studyId)
            .then((rec) => {
              if (cancelled) return
              const p = rec.payload as Record<string, unknown>
              setLinkedProjects([{
                id: payload.studyId as string,
                title: typeof p.title === 'string' ? p.title : payload.studyId as string,
              }])
            })
            .catch(() => {})
        }
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [runId, workspaceStudyId])

  // Mode 1: workspace context breadcrumb
  if (workspaceStudyId && projectName) {
    return (
      <span className="run-breadcrumb" data-testid="run-breadcrumb">
        <button
          type="button"
          className="run-breadcrumb__link"
          onClick={() => {
            // Switch to project-details tab if open, otherwise navigate
            const detailsTab = ws.state.tabs.find(
              (t) => t.kind === 'project-details',
            )
            if (detailsTab) {
              ws.activateTab(detailsTab.id)
            } else {
              navigate(`/project/${workspaceStudyId}`)
            }
          }}
          title={`Back to ${projectName}`}
        >
          {projectName}
        </button>
        <span className="run-breadcrumb__sep" aria-hidden>›</span>
      </span>
    )
  }

  // Mode 2: direct access — show linked projects
  if (linkedProjects.length > 0) {
    return (
      <span className="run-breadcrumb" data-testid="run-breadcrumb">
        {linkedProjects.map((project, i) => (
          <span key={project.id}>
            {i > 0 ? <span className="run-breadcrumb__sep" aria-hidden>, </span> : null}
            <button
              type="button"
              className="run-breadcrumb__link"
              onClick={() => navigate(`/project/${project.id}`)}
              title={`Open ${project.title}`}
            >
              {project.title}
            </button>
          </span>
        ))}
        <span className="run-breadcrumb__sep" aria-hidden>›</span>
      </span>
    )
  }

  // No breadcrumb
  return null
}

**Step 2: Write the CSS**

```css
/* app/src/event-editor/viewer/deck/RunBreadcrumb.css */

.run-breadcrumb {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: var(--cl-text-dim);
  flex-shrink: 0;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.run-breadcrumb__link {
  border: none;
  background: transparent;
  color: var(--cl-text-dim);
  font-size: 13px;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 3px;
  transition: color 0.15s, background 0.15s;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 150px;
}

.run-breadcrumb__link:hover {
  color: var(--cl-type-project);
  background: var(--cl-type-project-soft);
}

.run-breadcrumb__sep {
  color: var(--cl-text-faint);
  font-size: 14px;
  flex-shrink: 0;
}
```

**Step 3: Verify typecheck**

Run: `cd /home/brad/git/computable-lab && npm run typecheck -w app`
Expected: PASS

**Step 4: Commit**

```bash
git add app/src/event-editor/viewer/deck/RunBreadcrumb.tsx app/src/event-editor/viewer/deck/RunBreadcrumb.css
git commit -m "feat(ui): add RunBreadcrumb component for run-to-project navigation"
```

### Task 2: Wire RunBreadcrumb into DeckToolbar

**Objective:** Add the breadcrumb to the deck toolbar, before the EditableTitle.

**Files:**
- Modify: `app/src/event-editor/viewer/deck/DeckToolbar.tsx`

**Step 1: Import and render RunBreadcrumb**

In `DeckToolbar.tsx`, add import:

```typescript
import { RunBreadcrumb } from './RunBreadcrumb'
```

In the JSX, add RunBreadcrumb before EditableTitle:

```tsx
{hasRun ? (
  <>
    <RunBreadcrumb runId={runId} />
    <EditableTitle
      title={tabTitle ?? 'Untitled Run'}
      onCommit={handleRename}
      testId="run-title"
    />
  </>
) : null}
```

The breadcrumb shows the project path, the EditableTitle shows the run name. Together they form: `[Project] › [Run Name]`.

**Step 2: Verify typecheck**

Run: `cd /home/brad/git/computable-lab && npm run typecheck -w app`
Expected: PASS

**Step 3: Commit**

```bash
git add app/src/event-editor/viewer/deck/DeckToolbar.tsx
git commit -m "feat(ui): wire RunBreadcrumb into DeckToolbar before editable title"
```

---

## How It Works

### Scenario 1: User opens a run from within a project
1. User is at `/project/STU-dhvc` looking at ProjectDetailsView
2. Clicks a run → `openMethodDeck()` opens a deck tab
3. DeckToolbar renders: `[DHVC] › [2026-07-30 Run]`
4. Clicking "DHVC" switches to the project-details tab (stays in same workspace)
5. The run name is editable via the EditableTitle

### Scenario 2: User opens a run from /runs collection
1. User is at `/runs` and clicks a run → navigates to `/runs/:runId`
2. DeckToolbar has no workspace context (RunWorkspacePage doesn't use WorkspaceProvider)
3. RunBreadcrumb fetches the run's `projectIds` from its record
4. Shows: `[DHVC] › [Run Name]` (or multiple projects if linked)
5. Clicking "DHVC" navigates to `/project/STU-dhvc`

### Scenario 3: New run created from a project
1. User clicks "+ New Run" on ProjectDetailsView
2. `quickCreateRun` creates the run with `studyId` set
3. Deck opens with breadcrumb: `[DHVC] › [2026-07-30 Run]`
4. Clicking "DHVC" goes back to the project

### Scenario 4: Run with no project links
1. No `projectIds` and no `studyId` on the run record
2. RunBreadcrumb renders nothing — just the EditableTitle shows
3. `[Run Name]` with no breadcrumb prefix

---

## Files Likely to Change

| File | Change |
|------|--------|
| `app/src/event-editor/viewer/deck/RunBreadcrumb.tsx` | Create — breadcrumb component |
| `app/src/event-editor/viewer/deck/RunBreadcrumb.css` | Create — breadcrumb styling |
| `app/src/event-editor/viewer/deck/DeckToolbar.tsx` | Modify — add RunBreadcrumb before EditableTitle |

## Tests / Validation

1. `npm run typecheck -w app` — typecheck passes
2. Manual: Open a project, click a run, verify breadcrumb shows project name › run name
3. Manual: Click the project name in breadcrumb, verify it goes back to project details
4. Manual: Open `/runs`, click a run, verify breadcrumb shows linked project(s)
5. Manual: Create a new run from a project, verify breadcrumb shows the project

## Risks, Tradeoffs, and Open Questions

1. **Performance**: Mode 2 (direct access) fetches the run record + each linked project record. This is a few API calls on mount. Acceptable — it's a one-time fetch with caching by the browser.

2. **getStudyTree() call in Mode 1**: The breadcrumb fetches the full study tree to get the project title. This is already cached by the browser and used by other components. Alternatively, we could store the project title in the workspace state to avoid the fetch.

3. **Multiple projects in direct-access mode**: If a run is linked to 3 projects, the breadcrumb shows all 3 as comma-separated links. This could get wide. The CSS truncates with ellipsis at 200px max-width. An alternative would be a dropdown, but YAGNI — start with inline links.

4. **RunWorkspacePage doesn't use WorkspaceProvider**: The `RunWorkspacePage` at `/runs/:runId` renders its own shell without `WorkspaceProvider`. So `useWorkspace()` will throw in Mode 2. The RunBreadcrumb needs to handle this — either use `useOptionalWorkspace()` (returns null outside provider) or wrap in a try/catch. The plan uses `useWorkspace()` which works for Mode 1 (inside workspace) but needs `useOptionalWorkspace()` for Mode 2.

**Fix for Mode 2**: Use `useOptionalWorkspace()` instead of `useWorkspace()` — it returns null outside a provider, and the component falls through to Mode 2 (direct access).
