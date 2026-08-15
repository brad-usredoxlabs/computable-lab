# Major UI Overhaul Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Transform the computable-lab UI from a study-only workspace into a multi-entity workspace with typed tabs (Projects, Runs, Claims, Lab), a global navbar, color-coded tabs, contextual right pane, and global search — as specified in `specs/computable-lab-ui-specification.md`.

**Architecture:** The current UI is a single-destination workspace (`/project/:studyId`) with study-only topbar tabs, 7 left-pane tab kinds, and 5 right-pane modes that are study-scoped. The overhaul generalizes the workspace tab system to support multiple primary entity types (projects, runs, claims, lab entities), replaces the study-only topbar with a 4-destination global navbar + typed workspace tabs, contextualizes the right pane to the active tab's entity type, and adds a global search bar. The existing run-centered event editor (deck, event graph, protocol execution) is preserved as the highest-value surface.

**Tech Stack:** React 18, TypeScript (exactOptionalPropertyTypes), react-router-dom, react-resizable-panels, TipTap 3, Vitest, CSS custom properties (--cl-* tokens), Fastify backend, YAML schema-driven records

---

## Current State Summary

### Routes (app/src/App.tsx)
- `/` → WelcomePage (recent projects deck)
- `/create/study` → CreateStudyPage (TapTab-first project creation)
- `/project/:studyId` → ProjectWorkspacePage (the main workspace)
- `/project/:studyId/event-graph/:eventGraphId` → ProjectWorkspacePage (deep-link to deck)
- `/project/:studyId/run/:runId` → RunWorkspacePage (plan/execute toggle)
- `/event-editor/*` → legacy redirects into project workspace
- `/browser`, `/protocols` → LegacyModeRedirect (redirect to workspace)
- `/literature` → LiteraturePage
- `/protocol-builder` → ProtocolBuilderPage
- `/settings` → SettingsRoute

### Topbar (app/src/event-editor/projects/ProjectTabStrip.tsx)
- Browser-tab style strip, one tab per open STUDY
- Study list stored in localStorage via `useOpenStudies` / `openStudiesStorage`
- Click → navigate to `/project/:studyId`
- Close (×) → remove from open studies, navigate to sibling
- "+" → StudyPickerPopover (search + create)
- Trailing: WorkspaceShareButton, UserSwitcher, SettingsMenuButton

### Left Pane (app/src/event-editor/workspace/types.ts)
WorkspaceTab union — 7 kinds, all within a study:
- `deck` → DeckViewer (event graph canvas, optionally bound to runId)
- `pdf` → PdfViewer
- `document` → DocumentEditor
- `project-details` → ProjectDetailsView (experiments → runs tree + artifacts)
- `record-create` → RecordCreatePanel (TapTab creation surface)
- `record-edit` → RecordEditPanel (TapTab editor for existing records)
- `execution` → ExecutionTabShell (execution view)
State persists per-study to `workspace.yaml` (server-side: `server/src/workspace/types.ts`)

### Right Pane (app/src/event-editor/right-pane/RightPane.tsx)
5 modes, one active at a time, stored in WorkspaceContext:
- `ai` → AiTabPanel (chat with context assembly)
- `find` → FindTabPanel (study tree: experiments → runs + artifacts)
- `search` → SearchTabPanel (study-scoped artifact text search)
- `details` → DetailsTabPanel (deck-only: single-plate Materials/Groups/Notes/Read)
- `protocol` → ProtocolTabPanel (protocol steps, play buttons, execution)

### AI System Prompts (app/src/event-editor/right-pane/ai/systemPromptForViewer.ts)
6 variants, keyed on viewer kind:
- `deck` → event-graph drafting prompt
- `pdf` → protocol builder prompt (lab adaptation)
- `document` → scientific authoring prompt
- `project-details` → project overview prompt (navigate/summarize)
- `execution` → real-time execution guidance prompt
- `null` (NO_VIEWER) → generic "no viewer open" prompt
NO prompts exist for project, run, claim, or lab-entity contexts as primary types.

### CSS Tokens (app/src/shared/styles/tokens.css)
Dark default, light via `[data-theme='light']`:
- `--cl-bg`, `--cl-bg-elev`, `--cl-bg-elev-2` (surface layers)
- `--cl-border`, `--cl-border-strong`
- `--cl-text`, `--cl-text-dim`, `--cl-text-faint`
- `--cl-accent` (#58a6ff blue), `--cl-accent-soft`
- `--cl-danger` (#f85149 red), `--cl-warn` (#d29922 amber), `--cl-preview` (#be4bdb purple)
- `--cl-on-accent` (text on accent fill)
- No per-entity-type color tokens exist yet

### Schema Hierarchy
- `study.schema.yaml` → kind: "study", has `primaryClaimIds[]`, does NOT enumerate children
- `experiment.schema.yaml` → kind: "experiment", REQUIRED: `studyId` (the hierarchy we're killing)
- `run.schema.yaml` → kind: "run", REQUIRED: `experimentId` + `studyId`
- `claim.schema.yaml` → EXISTS: kind: "claim", reusable semantic statement, status, evidence refs
- `assertion.schema.yaml` → claim evaluated in a specific scope, supported by evidence
- `evidence.schema.yaml` → links sources to assertions
- Lab entities: `protocol.schema.yaml`, `material.schema.yaml`, `material-spec.schema.yaml`, `material-instance.schema.yaml`, `labware.schema.yaml`, `equipment.schema.yaml`, `person.schema.yaml` (via `schema/people/`)

### Existing Search Infrastructure
- `SearchTabPanel.tsx` — study-scoped artifact text search (filters artifact list)
- `app/src/knowledge/browser/SearchBar.tsx` — record browser search (legacy /browser)
- `app/src/browser/SearchBar.tsx` — DSL-based URL search (legacy /browser)
- Server: `POST /api/ai/search-records` (AI-powered record search)
- Server: JSON-LD search handlers (`createJsonLdSearchHandlers`)
- Server: `GET /api/tree/search` (full-text search records)
- No global cross-entity-type search bar exists in the topbar

---

## Discrepancies Between Spec and Codebase

1. **Spec says "Projects | Runs | Claims | Lab" navbar.** Codebase has study-only topbar. No runs/claims/lab collection views exist.
2. **Spec says tabs should have types.** Codebase: all topbar tabs are studies. Left-pane tabs are study-scoped viewer surfaces, not entity-type tabs.
3. **Spec says kill the experiment hierarchy.** Schema requires `experimentId` on runs. `ProjectDetailsView` is built around experiments → runs tree. `experimentId` is referenced in ~25 files.
4. **Spec says right pane should be contextualized to tab type.** Current right pane is study-scoped. `FindTabPanel` shows experiment→run tree. `DetailsTabPanel` only works for deck tabs. System prompts have no project/run/claim/lab context.
5. **Spec says global search bar in navbar.** No global search bar exists. Search is study-scoped or legacy browser-only.
6. **Spec mentions color-coded tabs.** No per-type color tokens exist in tokens.css.

---

## Phased Implementation

### Phase 0: CSS Token Foundation — Per-Entity-Type Colors
Add color tokens for project, run, claim, and lab entity types to the --cl-* token system. These will be used by tab color-coding, navbar icons, and chip/card styling throughout the overhaul.

### Phase 1: Global Navbar — Replace Study-Only Topbar
Replace the `ProjectTabStrip` with a `GlobalNavbar` containing the 4 primary destinations (Projects, Runs, Claims, Lab) + global search bar + create menu. Retain the workspace tab strip below it. This is the shell-level change that makes everything else possible.

### Phase 2: Generalize Workspace Tab Types
Extend `WorkspaceTab` union to include typed entity tabs (project, run, claim, lab-entity) alongside existing viewer tabs (deck, pdf, document). Color-code tabs by type. Generalize the workspace context to be per-session (not per-study).

### Phase 3: Collection Views — Projects, Runs, Claims, Lab
Create collection view components for each of the 4 primary destinations. These replace the WelcomePage for projects and create new run/claim/lab collection pages.

### Phase 4: Kill the Experiment Hierarchy
Make `experimentId` optional on run schema and run creation. Migrate `ProjectDetailsView` from experiments→runs tree to a flat runs list with saved views/tags. Add "+ New Run" directly on the project workspace.

### Phase 5: Contextual Right Pane — Per-Entity-Type Context
Refactor the right pane to consume a `ContextDescriptor` (per spec §12.3) instead of reading raw workspace state. Each right-pane tab adapts its behavior to the active entity type. Add system prompts for project, run, claim, and lab-entity contexts.

### Phase 6: Global Search Bar
Implement the navbar search bar that retrieves projects, runs, claims, lab entities, and documents in one result set. Wire to existing server-side search endpoints.

### Phase 7: Claim Workspace
Build the claim workspace view (statement, status, evidence ledger, connections, history) and claim collection view with operational filters.

### Phase 8: Lab Workspace
Build the lab collection view with category navigation (protocols, materials, labware, instruments, people) and lab entity workspace views.

---

## Phase 0: CSS Token Foundation — Per-Entity-Type Colors

### Task 0.1: Add entity-type color tokens to tokens.css

**Objective:** Add CSS custom properties for project, run, claim, and lab entity type accents.

**Files:**
- Modify: `app/src/shared/styles/tokens.css`

**Step 1: Add type color tokens (dark theme)**

Add after the existing `--cl-preview` line in the `.cl-app` block:

```css
  /* Entity-type accent colors for tab coding, chips, and icons.
     Each type gets a hue; the accent is used for tab borders, chip
     backgrounds, and icon tints. Soft variants for backgrounds. */
  --cl-type-project: #58a6ff;        /* blue — same as --cl-accent */
  --cl-type-project-soft: rgba(88, 166, 255, 0.12);
  --cl-type-run: #3fb950;            /* green */
  --cl-type-run-soft: rgba(63, 185, 80, 0.12);
  --cl-type-claim: #d29922;          /* amber */
  --cl-type-claim-soft: rgba(210, 153, 34, 0.12);
  --cl-type-lab: #be4bdb;            /* purple — same as --cl-preview */
  --cl-type-lab-soft: rgba(190, 75, 219, 0.12);
```

**Step 2: Add light theme overrides**

Add inside `.cl-app[data-theme='light']`:

```css
  --cl-type-project: #0969da;
  --cl-type-project-soft: rgba(9, 105, 218, 0.1);
  --cl-type-run: #1a7f37;
  --cl-type-run-soft: rgba(26, 127, 55, 0.1);
  --cl-type-claim: #9a6700;
  --cl-type-claim-soft: rgba(154, 103, 0, 0.1);
  --cl-type-lab: #8250df;
  --cl-type-lab-soft: rgba(130, 80, 223, 0.1);
```

**Step 3: Verify typecheck**

Run: `cd /home/brad/git/computable-lab && npm run typecheck -w app`
Expected: PASS (CSS changes don't affect TS)

**Step 4: Commit**

```bash
git add app/src/shared/styles/tokens.css
git commit -m "feat(ui): add per-entity-type color tokens for tab color-coding"
```

---

## Phase 1: Global Navbar — Replace Study-Only Topbar

### Task 1.1: Create GlobalNavbar component

**Objective:** Build the persistent global navbar with 4 destinations + search + create menu.

**Files:**
- Create: `app/src/shared/shell/GlobalNavbar.tsx`
- Create: `app/src/shared/shell/GlobalNavbar.css`
- Modify: `app/src/shared/shell/AppShell.tsx` (add navbar slot to workspace layout)

**Step 1: Write GlobalNavbar component**

```tsx
// app/src/shared/shell/GlobalNavbar.tsx
/**
 * GlobalNavbar — persistent top-level navigation bar with 4 primary
 * destinations (Projects, Runs, Claims, Lab), global search, and
 * create menu. Sits above the workspace tab strip in the AppShell.
 *
 * Spec reference: specs/computable-lab-ui-specification.md §4.1
 */

import { useNavigate, useLocation } from 'react-router-dom'
import { SettingsMenuButton } from '../../event-editor/projects/SettingsMenuButton'
import { UserSwitcher } from './UserSwitcher'
import { GlobalSearchBar } from './GlobalSearchBar'
import { CreateMenu } from './CreateMenu'
import './GlobalNavbar.css'

type PrimaryDestination = 'projects' | 'runs' | 'claims' | 'lab'

const DESTINATIONS: { id: PrimaryDestination; label: string; path: string }[] = [
  { id: 'projects', label: 'Projects', path: '/projects' },
  { id: 'runs', label: 'Runs', path: '/runs' },
  { id: 'claims', label: 'Claims', path: '/claims' },
  { id: 'lab', label: 'Lab', path: '/lab' },
]

export function GlobalNavbar() {
  const navigate = useNavigate()
  const location = useLocation()

  // Determine active destination from URL
  const activeDest = DESTINATIONS.find((d) =>
    location.pathname.startsWith(d.path),
  ) ?? (location.pathname.startsWith('/project/') ? DESTINATIONS[0] : null)

  return (
    <div className="global-navbar" data-testid="global-navbar">
      <div className="global-navbar__brand">
        <span className="global-navbar__brand-text">Computable Lab</span>
      </div>
      <nav className="global-navbar__destinations" role="navigation">
        {DESTINATIONS.map((dest) => (
          <button
            key={dest.id}
            type="button"
            className={
              activeDest?.id === dest.id
                ? 'global-navbar__dest global-navbar__dest--active'
                : 'global-navbar__dest'
            }
            data-testid={`global-nav-${dest.id}`}
            onClick={() => navigate(dest.path)}
          >
            {dest.label}
          </button>
        ))}
      </nav>
      <div className="global-navbar__search">
        <GlobalSearchBar />
      </div>
      <div className="global-navbar__actions">
        <CreateMenu />
      </div>
      <div className="global-navbar__trailing">
        <UserSwitcher />
        <SettingsMenuButton />
      </div>
    </div>
  )
}
```

**Step 2: Write GlobalNavbar CSS**

```css
/* app/src/shared/shell/GlobalNavbar.css */

.global-navbar {
  display: flex;
  align-items: center;
  gap: var(--cl-spacing-sm, 8px);
  height: var(--cl-topbar-height);
  padding: 0 12px;
  background: var(--cl-bg-elev);
  border-bottom: 1px solid var(--cl-border);
}

.global-navbar__brand {
  font-weight: 600;
  font-size: 14px;
  color: var(--cl-text);
  white-space: nowrap;
  margin-right: 8px;
}

.global-navbar__destinations {
  display: flex;
  gap: 0;
}

.global-navbar__dest {
  padding: 6px 12px;
  border: none;
  background: transparent;
  color: var(--cl-text-dim);
  font-size: 13px;
  cursor: pointer;
  border-radius: 4px;
  transition: color 0.15s, background 0.15s;
}

.global-navbar__dest:hover {
  color: var(--cl-text);
  background: var(--cl-bg-elev-2);
}

.global-navbar__dest--active {
  color: var(--cl-accent);
  background: var(--cl-accent-soft);
}

.global-navbar__search {
  flex: 1;
  max-width: 400px;
  margin: 0 auto;
}

.global-navbar__actions {
  display: flex;
  align-items: center;
}

.global-navbar__trailing {
  display: flex;
  align-items: center;
  gap: 4px;
}
```

**Step 3: Wire into AppShell workspace layout**

Modify `AppShell.tsx` workspace header to render GlobalNavbar above the tab strip. The workspace topbar becomes a two-row header: GlobalNavbar (row 1) + WorkspaceTabStrip (row 2).

In `AppShell.tsx`, change the workspace header from:
```tsx
<header className="topbar topbar--workspace">{topbarTabs}</header>
```
To:
```tsx
<header className="topbar topbar--workspace">
  <GlobalNavbar />
  <div className="topbar__tabs">{topbarTabs}</div>
</header>
```

Add import: `import { GlobalNavbar } from './GlobalNavbar'`

**Step 4: Write failing test**

```tsx
// app/src/shared/shell/GlobalNavbar.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { GlobalNavbar } from './GlobalNavbar'

describe('GlobalNavbar', () => {
  it('renders all 4 primary destinations', () => {
    render(
      <MemoryRouter>
        <GlobalNavbar />
      </MemoryRouter>,
    )
    expect(screen.getByTestId('global-nav-projects')).toBeDefined()
    expect(screen.getByTestId('global-nav-runs')).toBeDefined()
    expect(screen.getByTestId('global-nav-claims')).toBeDefined()
    expect(screen.getByTestId('global-nav-lab')).toBeDefined()
  })

  it('renders global search bar', () => {
    render(
      <MemoryRouter>
        <GlobalNavbar />
      </MemoryRouter>,
    )
    expect(screen.getByTestId('global-search-bar')).toBeDefined()
  })
})
```

**Step 5: Run test to verify failure**

Run: `cd /home/brad/git/computable-lab && npm run test:unit -w app -- --grep GlobalNavbar`
Expected: FAIL — GlobalSearchBar not yet created

**Step 6: Create minimal stubs for GlobalSearchBar and CreateMenu**

```tsx
// app/src/shared/shell/GlobalSearchBar.tsx
export function GlobalSearchBar() {
  return (
    <input
      className="global-search-bar"
      data-testid="global-search-bar"
      placeholder="Find anything…"
    />
  )
}
```

```tsx
// app/src/shared/shell/CreateMenu.tsx
export function CreateMenu() {
  return (
    <button
      className="create-menu"
      data-testid="create-menu"
      type="button"
    >
      + Create
    </button>
  )
}
```

**Step 7: Run test to verify pass**

Run: `cd /home/brad/git/computable-lab && npm run test:unit -w app -- --grep GlobalNavbar`
Expected: PASS

**Step 8: Commit**

```bash
git add app/src/shared/shell/GlobalNavbar.tsx app/src/shared/shell/GlobalNavbar.css \
  app/src/shared/shell/GlobalNavbar.test.tsx app/src/shared/shell/GlobalSearchBar.tsx \
  app/src/shared/shell/CreateMenu.tsx app/src/shared/shell/AppShell.tsx
git commit -m "feat(ui): add GlobalNavbar with 4 destinations + search + create stubs"
```

### Task 1.2: Add collection route stubs

**Objective:** Add route definitions for `/projects`, `/runs`, `/claims`, `/lab` so the navbar destinations resolve.

**Files:**
- Modify: `app/src/App.tsx`
- Create: `app/src/collections/ProjectCollectionView.tsx`
- Create: `app/src/collections/RunCollectionView.tsx`
- Create: `app/src/collections/ClaimCollectionView.tsx`
- Create: `app/src/collections/LabCollectionView.tsx`

**Step 1: Create collection view stubs**

Each stub is a minimal placeholder that renders inside AppShell:

```tsx
// app/src/collections/ProjectCollectionView.tsx
import { AppShell } from '../shared/shell'
import { GlobalNavbar } from '../shared/shell/GlobalNavbar'

export function ProjectCollectionView() {
  return (
    <AppShell brand="Projects" layout="workspace">
      <div data-testid="project-collection-view">
        <h1>Projects</h1>
        <p>Project collection grid will appear here.</p>
      </div>
    </AppShell>
  )
}
```

Repeat for RunCollectionView, ClaimCollectionView, LabCollectionView with appropriate test IDs and labels.

**Step 2: Add routes to App.tsx**

Add these routes (before the catch-all `*` route):

```tsx
const ProjectCollectionView = lazy(async () => import('./collections/ProjectCollectionView').then((m) => ({ default: m.ProjectCollectionView })))
const RunCollectionView = lazy(async () => import('./collections/RunCollectionView').then((m) => ({ default: m.RunCollectionView })))
const ClaimCollectionView = lazy(async () => import('./collections/ClaimCollectionView').then((m) => ({ default: m.ClaimCollectionView })))
const LabCollectionView = lazy(async () => import('./collections/LabCollectionView').then((m) => ({ default: m.LabCollectionView })))
```

Add inside `<Routes>`:
```tsx
<Route path="/projects" element={<DeferredRoute><ProjectCollectionView /></DeferredRoute>} />
<Route path="/runs" element={<DeferredRoute><RunCollectionView /></DeferredRoute>} />
<Route path="/claims" element={<DeferredRoute><ClaimCollectionView /></DeferredRoute>} />
<Route path="/lab" element={<DeferredRoute><LabCollectionView /></DeferredRoute>} />
<Route path="/lab/:category" element={<DeferredRoute><LabCollectionView /></DeferredRoute>} />
```

**Step 3: Verify typecheck**

Run: `cd /home/brad/git/computable-lab && npm run typecheck -w app`
Expected: PASS

**Step 4: Commit**

```bash
git add app/src/App.tsx app/src/collections/
git commit -m "feat(ui): add collection view route stubs for projects, runs, claims, lab"
```

### Task 1.3: Generalize AppShell workspace header for two-row layout

**Objective:** Update AppShell's workspace header CSS to support the GlobalNavbar row above the tab strip.

**Files:**
- Modify: `app/src/shared/shell/AppShell.css`

**Step 1: Update workspace topbar CSS**

The `.topbar--workspace` needs to be a flex column with two rows:

```css
.topbar--workspace {
  display: flex;
  flex-direction: column;
  border-bottom: 1px solid var(--cl-border);
}

.topbar--workspace .global-navbar {
  flex-shrink: 0;
}

.topbar--workspace .topbar__tabs {
  flex-shrink: 0;
  border-top: 1px solid var(--cl-border);
}
```

**Step 2: Verify in browser (manual)**

Run: `cd /home/brad/git/computable-lab && npm run dev -w app`
Open: http://localhost:5174/
Expected: GlobalNavbar appears as top row, project tab strip below it.

**Step 3: Commit**

```bash
git add app/src/shared/shell/AppShell.css
git commit -m "feat(ui): two-row workspace header (global navbar + tab strip)"
```

---

## Phase 2: Generalize Workspace Tab Types

### Task 2.1: Extend WorkspaceTab union with entity-type tabs

**Objective:** Add `project`, `run`, `claim`, and `lab-entity` tab kinds to the WorkspaceTab union.

**Files:**
- Modify: `app/src/event-editor/workspace/types.ts`
- Modify: `server/src/workspace/types.ts`

**Step 1: Add new tab kinds to frontend types.ts**

Add to the `WorkspaceTab` union:

```typescript
  | {
      id: string
      kind: 'project'
      /** Study record ID. */
      studyId: string
      title: string
    }
  | {
      id: string
      kind: 'run'
      /** Run record ID. */
      runId: string
      /** The event graph ID for the run's method deck, if it has one. */
      eventGraphId?: string
      title: string
    }
  | {
      id: string
      kind: 'claim'
      /** Claim record ID. */
      claimId: string
      title: string
    }
  | {
      id: string
      kind: 'lab-entity'
      /** Schema ID of the lab entity (protocol, material, labware, equipment, person). */
      schemaId: string
      /** Record ID of the lab entity. */
      recordId: string
      /** Short label for the entity type (e.g. "protocol", "material"). */
      entityType: string
      title: string
    }
```

Add a helper for stable tab IDs:

```typescript
/** Stable id for a project tab — one per study. */
export function projectTabId(studyId: string): string {
  return `project:${studyId}`
}

/** Stable id for a run tab so re-clicking the same run focuses it. */
export function runTabId(runId: string): string {
  return `run:${runId}`
}

/** Stable id for a claim tab. */
export function claimTabId(claimId: string): string {
  return `claim:${claimId}`
}

/** Stable id for a lab-entity tab. */
export function labEntityTabId(recordId: string): string {
  return `lab:${recordId}`
}
```

**Step 2: Add entity type helper**

```typescript
/** The primary entity type of a workspace tab, for color-coding and
 *  right-pane context selection. Returns null for viewer-only tabs
 *  (deck, pdf, document) that don't represent a primary entity. */
export type EntityTabType = 'project' | 'run' | 'claim' | 'lab'

export function entityTabType(tab: WorkspaceTab): EntityTabType | null {
  switch (tab.kind) {
    case 'project':
      return 'project'
    case 'run':
    case 'execution':
    case 'deck':
      return 'run'
    case 'claim':
      return 'claim'
    case 'lab-entity':
    case 'record-edit':
      return 'lab'
    case 'pdf':
    case 'document':
    case 'project-details':
    case 'record-create':
      return null
    default: {
      const _exhaustive: never = tab
      return _exhaustive ?? null
    }
  }
}
```

**Step 3: Mirror changes in server-side types.ts**

Add the same tab kinds to `server/src/workspace/types.ts` WorkspaceTab union, update `parseWorkspaceState` to accept the new kinds, and bump version to 4.

**Step 4: Write failing test**

```typescript
// app/src/event-editor/workspace/types.test.ts
import { describe, it, expect } from 'vitest'
import { entityTabType, projectTabId, runTabId, claimTabId } from './types'

describe('entityTabType', () => {
  it('returns "project" for project tabs', () => {
    expect(entityTabType({ id: 'p1', kind: 'project', studyId: 'STU-1', title: 'P' })).toBe('project')
  })
  it('returns "run" for run tabs', () => {
    expect(entityTabType({ id: 'r1', kind: 'run', runId: 'RUN-1', title: 'R' })).toBe('run')
  })
  it('returns "claim" for claim tabs', () => {
    expect(entityTabType({ id: 'c1', kind: 'claim', claimId: 'CLM-1', title: 'C' })).toBe('claim')
  })
  it('returns "lab" for lab-entity tabs', () => {
    expect(entityTabType({ id: 'l1', kind: 'lab-entity', schemaId: 's', recordId: 'M-1', entityType: 'material', title: 'M' })).toBe('lab')
  })
  it('returns null for pdf tabs', () => {
    expect(entityTabType({ id: 'pdf1', kind: 'pdf', artifactId: 'a1', title: 'P' })).toBe(null)
  })
})
```

**Step 5: Run test, verify pass**

Run: `cd /home/brad/git/computable-lab && npm run test:unit -w app -- --grep "entityTabType"`
Expected: PASS

**Step 6: Commit**

```bash
git add app/src/event-editor/workspace/types.ts app/src/event-editor/workspace/types.test.ts \
  server/src/workspace/types.ts
git commit -m "feat(ui): add project/run/claim/lab-entity tab kinds to WorkspaceTab"
```

### Task 2.2: Color-code workspace tabs by entity type

**Objective:** Apply per-type color accents to workspace tab strip tabs using CSS classes.

**Files:**
- Modify: `app/src/event-editor/projects/ProjectTabStrip.tsx` (rename to WorkspaceTabStrip)
- Create: `app/src/shared/shell/WorkspaceTabStrip.tsx`
- Create: `app/src/shared/shell/WorkspaceTabStrip.css`

**Step 1: Create WorkspaceTabStrip component**

This replaces `ProjectTabStrip` and renders tabs of any entity type with color coding. It reads from a generalized "open tabs" store (Phase 2.3) instead of just open studies.

```tsx
// app/src/shared/shell/WorkspaceTabStrip.tsx
/**
 * WorkspaceTabStrip — browser-tab style strip of open workspace tabs.
 * Generalized from ProjectTabStrip to support any entity type.
 * Tabs are color-coded by entity type (project=blue, run=green,
 * claim=amber, lab=purple).
 */

import { useNavigate } from 'react-router-dom'
import { useOpenTabs } from './OpenTabsContext'
import { entityTabType, type WorkspaceTab } from '../../event-editor/workspace/types'
import './WorkspaceTabStrip.css'

const TYPE_LABELS: Record<string, string> = {
  project: 'P',
  run: 'R',
  claim: 'C',
  lab: 'L',
}

export function WorkspaceTabStrip() {
  const { tabs, activeTabId, closeTab } = useOpenTabs()
  const navigate = useNavigate()

  return (
    <div className="workspace-tab-strip" role="tablist">
      {tabs.map((tab) => {
        const entityType = entityTabType(tab)
        const typeClass = entityType ? `workspace-tab--${entityType}` : ''
        const isActive = tab.id === activeTabId
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={
              isActive
                ? `workspace-tab workspace-tab--active ${typeClass}`
                : `workspace-tab ${typeClass}`
            }
            data-testid={`workspace-tab-${tab.id}`}
            onClick={() => navigate(tabPath(tab))}
          >
            {entityType ? (
              <span className="workspace-tab__type-badge">
                {TYPE_LABELS[entityType]}
              </span>
            ) : null}
            <span className="workspace-tab__label">{tab.title}</span>
            <span
              className="workspace-tab__close"
              onClick={(e) => {
                e.stopPropagation()
                closeTab(tab.id)
              }}
            >
              ×
            </span>
          </button>
        )
      })}
      <button className="workspace-tab__add" type="button">+</button>
    </div>
  )
}

function tabPath(tab: WorkspaceTab): string {
  switch (tab.kind) {
    case 'project': return `/projects/${tab.studyId}`
    case 'run': return `/runs/${tab.runId}`
    case 'claim': return `/claims/${tab.claimId}`
    case 'lab-entity': return `/lab/${tab.recordId}`
    case 'deck': return `/project/${tab.eventGraphId}` // temporary
    default: return '/'
  }
}
```

**Step 2: Write CSS with type-color classes**

```css
/* app/src/shared/shell/WorkspaceTabStrip.css */

.workspace-tab-strip {
  display: flex;
  align-items: stretch;
  gap: 0;
  overflow-x: auto;
  scrollbar-width: thin;
}

.workspace-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border: none;
  border-top: 2px solid transparent;
  background: transparent;
  color: var(--cl-text-dim);
  cursor: pointer;
  white-space: nowrap;
  font-size: 13px;
  transition: color 0.15s, background 0.15s, border-color 0.15s;
}

.workspace-tab:hover {
  background: var(--cl-bg-elev-2);
}

.workspace-tab--active {
  color: var(--cl-text);
  background: var(--cl-bg-elev);
}

/* Type color-coding: top border tint */
.workspace-tab--project.workspace-tab--active { border-top-color: var(--cl-type-project); }
.workspace-tab--run.workspace-tab--active { border-top-color: var(--cl-type-run); }
.workspace-tab--claim.workspace-tab--active { border-top-color: var(--cl-type-claim); }
.workspace-tab--lab.workspace-tab--active { border-top-color: var(--cl-type-lab); }

/* Non-active tabs get a subtle left-edge tint */
.workspace-tab--project { border-top-color: var(--cl-type-project-soft); }
.workspace-tab--run { border-top-color: var(--cl-type-run-soft); }
.workspace-tab--claim { border-top-color: var(--cl-type-claim-soft); }
.workspace-tab--lab { border-top-color: var(--cl-type-lab-soft); }

.workspace-tab__type-badge {
  font-weight: 700;
  font-size: 10px;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 3px;
}

.workspace-tab--project .workspace-tab__type-badge {
  background: var(--cl-type-project-soft);
  color: var(--cl-type-project);
}
.workspace-tab--run .workspace-tab__type-badge {
  background: var(--cl-type-run-soft);
  color: var(--cl-type-run);
}
.workspace-tab--claim .workspace-tab__type-badge {
  background: var(--cl-type-claim-soft);
  color: var(--cl-type-claim);
}
.workspace-tab--lab .workspace-tab__type-badge {
  background: var(--cl-type-lab-soft);
  color: var(--cl-type-lab);
}

.workspace-tab__close {
  margin-left: 4px;
  opacity: 0.5;
  cursor: pointer;
}
.workspace-tab__close:hover { opacity: 1; }

.workspace-tab__add {
  border: none;
  background: transparent;
  color: var(--cl-text-dim);
  cursor: pointer;
  padding: 6px 10px;
  font-size: 16px;
}
.workspace-tab__add:hover { color: var(--cl-text); }
```

**Step 3: Commit**

```bash
git add app/src/shared/shell/WorkspaceTabStrip.tsx app/src/shared/shell/WorkspaceTabStrip.css
git commit -m "feat(ui): add color-coded WorkspaceTabStrip with type badges"
```

### Task 2.3: Create OpenTabsContext — generalized tab store

**Objective:** Replace the per-study `WorkspaceContext` and per-user `useOpenStudies` with a session-level open-tabs store that tracks all open workspace tabs regardless of entity type.

**Files:**
- Create: `app/src/shared/shell/OpenTabsContext.tsx`

This is the critical architectural piece. The current system has two tab layers:
1. `useOpenStudies` (localStorage) — which studies are open (topbar tabs)
2. `WorkspaceContext` (per-study workspace.yaml) — which viewer tabs are open within that study

The new system unifies these into a single session-level open-tabs list. Each tab carries its entity type and object ID. The right-pane mode and scroll state are per-tab.

```tsx
// app/src/shared/shell/OpenTabsContext.tsx
/**
 * OpenTabsContext — session-level store for all open workspace tabs.
 * Replaces the study-only useOpenStudies + per-study WorkspaceContext
 * with a unified tab store that supports projects, runs, claims, and
 * lab entities.
 *
 * Persists to localStorage (session-level, per-user, like the old
 * openStudiesStorage). The right-pane mode is stored per-tab so
 * switching tabs restores the right-pane selection.
 */

import {
  createContext,
  useCallback,
  useContext,
  useReducer,
  type ReactNode,
} from 'react'
import type { WorkspaceRightPaneMode, WorkspaceTab } from '../event-editor/workspace/types'

export interface OpenTabState {
  tab: WorkspaceTab
  activeRightPaneMode: WorkspaceRightPaneMode
  rightPaneScrollState?: number
}

export interface OpenTabsState {
  tabs: OpenTabState[]
  activeTabId: string | null
}

type OpenTabsAction =
  | { type: 'open'; tab: WorkspaceTab; activate?: boolean }
  | { type: 'close'; tabId: string }
  | { type: 'activate'; tabId: string }
  | { type: 'set-right-pane-mode'; tabId: string; mode: WorkspaceRightPaneMode }
  | { type: 'replace'; state: OpenTabsState }

function openTabsReducer(state: OpenTabsState, action: OpenTabsAction): OpenTabsState {
  switch (action.type) {
    case 'open': {
      const existing = state.tabs.find((t) => t.tab.id === action.tab.id)
      if (existing) {
        const shouldActivate = action.activate ?? true
        return {
          ...state,
          activeTabId: shouldActivate ? action.tab.id : state.activeTabId,
        }
      }
      const newEntry: OpenTabState = {
        tab: action.tab,
        activeRightPaneMode: defaultRightPaneMode(action.tab),
      }
      const shouldActivate = action.activate ?? true
      return {
        tabs: [...state.tabs, newEntry],
        activeTabId: shouldActivate ? action.tab.id : state.activeTabId,
      }
    }
    case 'close': {
      const nextTabs = state.tabs.filter((t) => t.tab.id !== action.tabId)
      let nextActive = state.activeTabId
      if (state.activeTabId === action.tabId) {
        const closedIndex = state.tabs.findIndex((t) => t.tab.id === action.tabId)
        const right = nextTabs[closedIndex]
        const left = nextTabs[closedIndex - 1]
        nextActive = right?.tab.id ?? left?.tab.id ?? null
      }
      return { tabs: nextTabs, activeTabId: nextActive }
    }
    case 'activate':
      if (!state.tabs.some((t) => t.tab.id === action.tabId)) return state
      return { ...state, activeTabId: action.tabId }
    case 'set-right-pane-mode':
      return {
        ...state,
        tabs: state.tabs.map((t) =>
          t.tab.id === action.tabId
            ? { ...t, activeRightPaneMode: action.mode }
            : t,
        ),
      }
    case 'replace':
      return action.state
    default:
      return state
  }
}

function defaultRightPaneMode(tab: WorkspaceTab): WorkspaceRightPaneMode {
  switch (tab.kind) {
    case 'project': return 'find'
    case 'run': return 'ai'
    case 'claim': return 'ai'
    case 'lab-entity': return 'find'
    case 'deck': return 'ai'
    case 'execution': return 'protocol'
    case 'pdf': return 'ai'
    case 'document': return 'ai'
    case 'project-details': return 'find'
    case 'record-create': return 'ai'
    case 'record-edit': return 'ai'
    default: return 'ai'
  }
}

const OpenTabsContext = createContext<OpenTabsContextValue | null>(null)

export interface OpenTabsContextValue {
  state: OpenTabsState
  openTab: (tab: WorkspaceTab, activate?: boolean) => void
  closeTab: (tabId: string) => void
  activateTab: (tabId: string) => void
  setRightPaneMode: (tabId: string, mode: WorkspaceRightPaneMode) => void
}

export function OpenTabsProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(openTabsReducer, { tabs: [], activeTabId: null })

  const value: OpenTabsContextValue = {
    state,
    openTab: (tab, activate) => dispatch({ type: 'open', tab, ...(activate !== undefined ? { activate } : {}) }),
    closeTab: (tabId) => dispatch({ type: 'close', tabId }),
    activateTab: (tabId) => dispatch({ type: 'activate', tabId }),
    setRightPaneMode: (tabId, mode) => dispatch({ type: 'set-right-pane-mode', tabId, mode }),
  }

  return <OpenTabsContext.Provider value={value}>{children}</OpenTabsContext.Provider>
}

export function useOpenTabs(): OpenTabsContextValue {
  const ctx = useContext(OpenTabsContext)
  if (!ctx) throw new Error('useOpenTabs must be used inside <OpenTabsProvider>')
  return ctx
}
```

**Step 1: Write the reducer test**

```typescript
// app/src/shared/shell/OpenTabsContext.test.tsx
import { describe, it, expect } from 'vitest'
import { openTabsReducer } from './OpenTabsContext'

// ... tests for open, close, activate, set-right-pane-mode
```

**Step 2: Run test, verify pass**

**Step 3: Commit**

```bash
git add app/src/shared/shell/OpenTabsContext.tsx app/src/shared/shell/OpenTabsContext.test.tsx
git commit -m "feat(ui): add OpenTabsContext session-level tab store"
```

---

## Phase 3: Collection Views

### Task 3.1: ProjectCollectionView — project card grid

**Objective:** Replace the WelcomePage with a proper project collection view that shows project cards with metadata.

**Files:**
- Modify: `app/src/collections/ProjectCollectionView.tsx`
- Create: `app/src/collections/ProjectCollectionView.css`
- Create: `app/src/collections/ProjectCard.tsx`

The project collection fetches all studies via the existing `getStudyTree()` endpoint and renders a card grid. Each card shows title, last activity, active run count, and status. Clicking a card opens a project workspace tab.

**Step 1: Write failing test**

```tsx
// app/src/collections/ProjectCollectionView.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ProjectCollectionView } from './ProjectCollectionView'

describe('ProjectCollectionView', () => {
  it('renders project cards', async () => {
    render(<MemoryRouter><ProjectCollectionView /></MemoryRouter>)
    expect(screen.getByTestId('project-collection-view')).toBeDefined()
  })
})
```

**Step 2: Implement ProjectCollectionView**

Uses existing `getStudyTree()` from `app/src/shared/api/treeClient.ts` to fetch studies. Renders a responsive card grid. Each card has a "+ New Run" action (spec §5.1).

**Step 3: Run test, verify pass**

**Step 4: Commit**

```bash
git add app/src/collections/ProjectCollectionView.tsx app/src/collections/ProjectCollectionView.css \
  app/src/collections/ProjectCard.tsx app/src/collections/ProjectCollectionView.test.tsx
git commit -m "feat(ui): project collection view with card grid"
```

### Task 3.2: RunCollectionView — chronological run list

**Objective:** Build the runs collection view with chronological grouping and filters.

**Files:**
- Modify: `app/src/collections/RunCollectionView.tsx`
- Create: `app/src/collections/RunCollectionView.css`

Groups runs by: In progress, Today, Yesterday, This week, Recently viewed, All runs. Filters: project, claim, status, person, date, material, protocol, instrument.

This requires a new server endpoint: `GET /api/runs` (list all runs across studies, with filters). Currently runs are only accessible through the study tree.

**Step 1: Add server endpoint for run listing**

Modify: `server/src/api/routes.ts` — add `GET /api/runs` handler that queries all run records with optional filters.

**Step 2: Add API client function**

Modify: `app/src/shared/api/client.ts` — add `listRuns(filters)` function.

**Step 3: Implement RunCollectionView**

**Step 4: Commit**

```bash
git add server/src/api/routes.ts app/src/shared/api/client.ts \
  app/src/collections/RunCollectionView.tsx app/src/collections/RunCollectionView.css
git commit -m "feat(ui): run collection view with chronological grouping and filters"
```

### Task 3.3: ClaimCollectionView — claim operational views

**Objective:** Build the claims collection with operational views (recently updated, needs evidence, well supported, contested, etc.).

**Files:**
- Modify: `app/src/collections/ClaimCollectionView.tsx`
- Create: `app/src/collections/ClaimCollectionView.css`

Requires `GET /api/claims` endpoint (list all claim records with status filters).

**Step 1: Add server endpoint for claim listing**

**Step 2: Implement ClaimCollectionView**

**Step 3: Commit**

```bash
git add server/src/api/routes.ts app/src/collections/ClaimCollectionView.tsx \
  app/src/collections/ClaimCollectionView.css
git commit -m "feat(ui): claim collection view with operational status filters"
```

### Task 3.4: LabCollectionView — lab entity categories

**Objective:** Build the lab collection view with category navigation (Protocols, Materials, Labware, Instruments, People, Documents).

**Files:**
- Modify: `app/src/collections/LabCollectionView.tsx`
- Create: `app/src/collections/LabCollectionView.css`

The lab collection uses the existing schema-driven record browser infrastructure. Each category maps to a schema ID prefix. The `?category=` URL parameter selects the active category.

**Step 1: Implement LabCollectionView**

Uses existing `searchRecords` from `app/src/shared/api/treeClient.ts` with schema type filters.

**Step 2: Commit**

```bash
git add app/src/collections/LabCollectionView.tsx app/src/collections/LabCollectionView.css
git commit -m "feat(ui): lab collection view with category navigation"
```

---

## Phase 4: Kill the Experiment Hierarchy

### Task 4.1: Make experimentId optional on run schema

**Objective:** Remove the requirement that runs have an `experimentId`. Runs can link directly to a study.

**Files:**
- Modify: `schema/studies/run.schema.yaml`
- Modify: `schema/studies/experiment.schema.yaml` (make `studyId` optional so experiments can be standalone tags)

**Step 1: Read the current run schema**

Read `schema/studies/run.schema.yaml` to find the `experimentId` required field.
Current required fields: `kind`, `recordId`, `experimentId`, `status`.
`studyId` is currently OPTIONAL — needs to become the primary parent reference.

**Step 2: Make experimentId optional, promote studyId**

Change `experimentId` from `required` to optional in the schema. Move `studyId` to required. Keep `experimentId` as an optional backward-compatible link.

```yaml
required:
  - kind
  - recordId
  - studyId
  - status
# experimentId removed from required — now optional
```

**Step 3: Test schema loads**

Run: `cd /home/brad/git/computable-lab && cd server && npx tsx -e "import { loadAllSchemas } from './src/schema/loader'; loadAllSchemas({ basePath: '../schema', recursive: true }).then(s => console.log('Loaded', s.size, 'schemas'))"`
Expected: "Loaded N schemas" (no errors)

**Step 4: Commit**

```bash
git add schema/studies/run.schema.yaml schema/studies/experiment.schema.yaml
git commit -m "feat(schema): make experimentId optional on runs — breaks mandatory hierarchy"
```

### Task 4.1b: Update server-side types and tree logic for optional experimentId

**Objective:** Update server-side code that assumes `experimentId` is always present on runs.

**Files (6 server files identified by subagent investigation):**
- Modify: `server/src/run-workspace/RunWorkspaceService.ts` — `RunSummary.experimentId` is `string` (required); make it `string | undefined` (optional)
- Modify: `server/src/store/RecordStoreImpl.ts` — `experimentId` stamping into links metadata needs to handle missing values
- Modify: `server/src/index/IndexManager.ts` — Tree building assumes 3-level hierarchy (study → experiment → run). Need flat structure: runs can appear directly under studies. Artifacts scoped by `experimentId` need fallback to study-level.
- Modify: `server/src/api/handlers/TreeHandlers.ts` — `InventoryUsageAnchor.experimentId` needs to be optional
- Modify: `server/src/security/AuthorizationService.ts` — `experimentId` in authorization chain needs fallback to `studyId` when absent
- Modify: `server/src/mcp/tools/treeTools.ts` — `experimentId` in run context needs to be optional

**Step 1: Update RunSummary type**

In `RunWorkspaceService.ts`, change `experimentId: string` to `experimentId?: string` (or `string | undefined` respecting exactOptionalPropertyTypes).

**Step 2: Update IndexManager tree building**

The tree builder currently constructs `study → experiments → runs`. It needs to also support `study → runs` directly for runs without an experimentId. Runs with an experimentId still appear under their experiment AND in a flat study-level list.

**Step 3: Update TreeHandlers**

Make `InventoryUsageAnchor.experimentId` optional and handle the case where it's absent.

**Step 4: Update AuthorizationService**

When a run has no `experimentId`, authorization falls back to the `studyId` chain.

**Step 5: Test server**

Run: `cd /home/brad/git/computable-lab && npm run typecheck -w server`
Expected: PASS

Run: `cd /home/brad/git/computable-lab && npm run test:run -w server`
Expected: PASS (may need to update tests that assume experimentId is present)

**Step 6: Commit**

```bash
git add server/src/run-workspace/RunWorkspaceService.ts server/src/store/RecordStoreImpl.ts \
  server/src/index/IndexManager.ts server/src/api/handlers/TreeHandlers.ts \
  server/src/security/AuthorizationService.ts server/src/mcp/tools/treeTools.ts
git commit -m "feat(server): support optional experimentId across run workspace, tree, and auth"
```

### Task 4.1c: Update frontend types for optional experimentId

**Objective:** Update frontend types that assume `experimentId` is always present on runs.

**Files:**
- Modify: `app/src/types/tree.ts` — `RunTreeNode.experimentId` becomes optional; `RunContext.experimentId` becomes optional; add direct `runs: RunTreeNode[]` to `StudyTreeNode` alongside `experiments`
- Modify: `app/src/event-editor/workspace/types.ts` — `record-create` tab kind's `experimentId` becomes truly optional (already `?` but code assumes it's present for runs)
- Modify: `app/src/shared/context/BrowserContext.tsx` — `runContext` computation needs to handle runs without experiments
- Modify: `app/src/knowledge/browser/StudyTree.tsx` — Tree rendering needs 2-level option (study → runs) alongside 3-level
- Modify: `app/src/knowledge/browser/CreateNodeModal.tsx` — Run creation no longer requires `experimentId` pre-population
- Modify: `app/src/event-editor/create/RecordCreatePanel.tsx` — Remove `experimentId` from required read-only paths for runs

**Step 1: Update tree types**

In `app/src/types/tree.ts`:
- Change `RunTreeNode.experimentId: string` to `experimentId?: string`
- Add `runs: RunTreeNode[]` to `StudyTreeNode` (direct runs, not grouped by experiment)
- Change `RunContext.experimentId` to optional

**Step 2: Update BrowserContext**

The `runContext` computation in `BrowserContext.tsx` (lines 108-119) iterates `study → experiments → runs`. Add a path that also iterates `study → runs` directly.

**Step 3: Run typecheck**

Run: `cd /home/brad/git/computable-lab && npm run typecheck -w app`
Expected: PASS (fix any downstream type errors from making experimentId optional)

**Step 4: Commit**

```bash
git add app/src/types/tree.ts app/src/event-editor/workspace/types.ts \
  app/src/shared/context/BrowserContext.tsx app/src/knowledge/browser/StudyTree.tsx \
  app/src/knowledge/browser/CreateNodeModal.tsx app/src/event-editor/create/RecordCreatePanel.tsx
git commit -m "feat(app): support optional experimentId in frontend types and tree"
```

### Task 4.2: Add "+ New Run" directly on ProjectDetailsView

**Objective:** Allow creating a run directly from a project, without first creating an experiment.

**Files:**
- Modify: `app/src/event-editor/projects/ProjectDetailsView.tsx`

**Step 1: Add a "+ New Run" button at the project level**

In the Experiments section header, add a button next to "+ New experiment" that creates a run directly with `studyId` prefilled and no `experimentId`.

```tsx
const openNewRun = useCallback(() => {
  ws.openTab({
    id: recordCreateTabId('run', studyId),
    kind: 'record-create',
    nodeType: 'run',
    studyId,
    title: 'New run',
  })
}, [studyId, ws])
```

Add a "RUNS" section above the experiments tree that lists all runs for the study (flat list, not grouped by experiment). This becomes the primary navigation; the experiments tree becomes secondary/optional.

**Step 2: Write failing test**

Test that the "+ New Run" button exists at the project level and opens a record-create tab without experimentId.

**Step 3: Run test, verify failure**

**Step 4: Implement**

**Step 5: Run test, verify pass**

**Step 6: Commit**

```bash
git add app/src/event-editor/projects/ProjectDetailsView.tsx
git commit -m "feat(ui): add +New Run directly on project, no experiment required"
```

### Task 4.3: Add flat runs list to ProjectDetailsView

**Objective:** Show a flat list of all runs linked to the project, not grouped by experiment.

**Files:**
- Modify: `app/src/event-editor/projects/ProjectDetailsView.tsx`

Add a "RUNS" section that fetches all runs for the study (across all experiments) and displays them chronologically. The existing experiments tree remains as a secondary "Saved Views" section.

**Step 1: Add API function to list runs by study**

Modify: `app/src/shared/api/treeClient.ts` — add `getRunsByStudy(studyId)` that fetches all runs linked to a study.

**Step 2: Add RUNS section to ProjectDetailsView**

**Step 3: Commit**

```bash
git add app/src/shared/api/treeClient.ts app/src/event-editor/projects/ProjectDetailsView.tsx
git commit -m "feat(ui): flat runs list on project view, experiments become secondary"
```

---

## Phase 5: Contextual Right Pane

### Task 5.1: Create ContextDescriptor type and provider

**Objective:** Implement the `ContextDescriptor` from spec §12.3 that all right-pane tabs consume.

**Files:**
- Create: `app/src/shared/context/ContextDescriptor.ts`
- Create: `app/src/shared/context/ContextDescriptorContext.tsx`

**Step 1: Define ContextDescriptor**

```typescript
// app/src/shared/context/ContextDescriptor.ts
/**
 * ContextDescriptor — describes the active workspace context for the
 * right-hand pane. All right-pane tabs consume this descriptor so their
 * scope stays synchronized.
 *
 * Spec reference: specs/computable-lab-ui-specification.md §12.3
 */

export type ContextObjectType =
  | 'project'
  | 'run'
  | 'claim'
  | 'protocol'
  | 'material'
  | 'labware'
  | 'equipment'
  | 'person'
  | 'document'

export interface ContextDescriptor {
  objectType: ContextObjectType
  objectId: string
  label: string
  /** Optional subobject selected in the main canvas (e.g. wells, events). */
  selectedSubobject?: {
    objectType: string
    objectId: string
    label: string
  }
  /** Projects linked to the active object. */
  linkedProjectIds?: string[]
  /** Permission flags. */
  permissions: string[]
}
```

**Step 2: Create ContextDescriptorProvider**

This provider reads the active workspace tab from `OpenTabsContext` and builds a `ContextDescriptor` for the right pane.

**Step 3: Commit**

```bash
git add app/src/shared/context/ContextDescriptor.ts app/src/shared/context/ContextDescriptorContext.tsx
git commit -m "feat(ui): add ContextDescriptor for right-pane context resolution"
```

### Task 5.2: Add per-entity-type system prompts

**Objective:** Add AI system prompts for project, run, claim, and lab-entity contexts.

**Files:**
- Modify: `app/src/event-editor/right-pane/ai/systemPromptForViewer.ts`

**Step 1: Add new system prompts**

Add prompts for each entity type, following the spec's context descriptions (§5.3, §6.6, §7.4, §8.x):

```typescript
const PROJECT: ViewerSystemPrompt = {
  id: 'entity.project',
  label: 'Project (overview)',
  body: 'You are assisting with a computable-lab project. The project is a durable statement of purpose that gathers related graph objects. Help the user with: project questions, summaries, planning, and graph-grounded recommendations. Answer "what changed this week?", "which assumption is weakest?", "what should happen next?"',
}

const RUN: ViewerSystemPrompt = {
  id: 'entity.run',
  label: 'Run (execution)',
  body: 'You are assisting with a computable-lab run — the primary unit of laboratory work. The run contains the event graph, plate state, protocol execution, materials, instruments, results, and evidence. Help the user: compare results to prior controls, draft claims from results, understand the event graph, and interpret semantic context.',
}

const CLAIM: ViewerSystemPrompt = {
  id: 'entity.claim',
  label: 'Claim (evidence)',
  body: 'You are assisting with a computable-lab claim — an addressable scientific statement that accumulates supporting, contradictory, or qualifying evidence. Help the user: summarize contradictory evidence, identify missing evidence, propose discriminating experiments, and compare claim revisions.',
}

const LAB_ENTITY: ViewerSystemPrompt = {
  id: 'entity.lab',
  label: 'Lab entity (resource)',
  body: 'You are assisting with a reusable lab entity (protocol, material, labware, instrument, or person). Help the user understand the entity capabilities, versions, history, relationships to runs and claims, and calibration/maintenance status.',
}
```

**Step 2: Update systemPromptKindForTab to use entity types**

```typescript
export function systemPromptKindForTab(
  tab: WorkspaceTab | null,
): SystemPromptKind {
  if (!tab) return null
  switch (tab.kind) {
    case 'project': return 'project'
    case 'run':
    case 'execution':
    case 'deck': return 'run'
    case 'claim': return 'claim'
    case 'lab-entity':
    case 'record-edit': return 'lab-entity'
    case 'pdf': return 'pdf'
    case 'document': return 'document'
    case 'project-details': return 'project-details'
    case 'record-create': return null
    default: {
      const _exhaustive: never = tab
      return _exhaustive ?? null
    }
  }
}
```

**Step 3: Commit**

```bash
git add app/src/event-editor/right-pane/ai/systemPromptForViewer.ts
git commit -m "feat(ui): add per-entity-type AI system prompts for right pane"
```

### Task 5.2b: Align server-side surface prompts with new entity types

**Objective:** Add server-side AI surface preambles for project, run, claim, and lab-entity contexts. Currently the frontend sends surface IDs that the server doesn't handle (execution, workspace.document, workspace.project-details, workspace.none fall through to generic preamble).

**Files:**
- Modify: `server/src/ai/systemPrompt.ts` — add new surface preambles
- Modify: `server/src/ai/types.ts` (or wherever `AiSurface` is defined) — add new surface types

**Step 1: Add new surface types**

In `systemPrompt.ts`, extend the `AiSurface` type:

```typescript
type AiSurface =
  | 'event-editor'
  | 'workspace.deck'
  | 'run-workspace'
  | `run-workspace:${'overview' | 'plan' | 'biology' | 'readouts' | 'results' | 'claims'}`
  | 'materials'
  | 'formulations'
  | 'ingestion'
  | 'literature'
  | 'protocol-ide'
  | 'protocol-builder'
  // New entity-type surfaces
  | 'entity.project'
  | 'entity.run'
  | 'entity.claim'
  | 'entity.lab'
  | 'execution'
  | 'workspace.document'
  | 'workspace.project-details'
```

**Step 2: Add surface preambles**

In the `SURFACE_PREAMBLES` map, add entries for each new surface. These should mirror the frontend system prompts from Task 5.2:

```typescript
'entity.project': 'You are assisting with a computable-lab project. ...',
'entity.run': 'You are assisting with a computable-lab run. ...',
'entity.claim': 'You are assisting with a computable-lab claim. ...',
'entity.lab': 'You are assisting with a reusable lab entity. ...',
'execution': 'You are assisting with an active protocol execution run. ...',
'workspace.document': 'You are helping author a scientific document. ...',
'workspace.project-details': 'You are assisting with a project overview. ...',
```

**Step 3: Update buildSurfaceAwarePrompt routing**

In `buildSurfaceAwarePrompt()`, add cases for the new surfaces so they use their preambles instead of falling through to the generic path.

**Step 4: Test**

Run: `cd /home/brad/git/computable-lab && npm run typecheck -w server`
Expected: PASS

Run: `cd /home/brad/git/computable-lab && npm run test:run -w server`
Expected: PASS

**Step 5: Commit**

```bash
git add server/src/ai/systemPrompt.ts server/src/ai/types.ts
git commit -m "feat(ai): add server-side surface preambles for project/run/claim/lab contexts"
```

### Task 5.3: Refactor RightPane to consume ContextDescriptor

**Objective:** Update RightPane and each tab panel to use the ContextDescriptor instead of raw workspace state.

**Files:**
- Modify: `app/src/event-editor/right-pane/RightPane.tsx`
- Modify: `app/src/event-editor/right-pane/find/FindTabPanel.tsx`
- Modify: `app/src/event-editor/right-pane/ai/AiTabPanel.tsx`
- Modify: `app/src/event-editor/right-pane/search/SearchTabPanel.tsx`
- Modify: `app/src/event-editor/right-pane/details/DetailsTabPanel.tsx`
- Modify: `app/src/event-editor/right-pane/protocol/ProtocolTabPanel.tsx`

Each panel is updated to:
1. Read the ContextDescriptor from context
2. Switch behavior based on `objectType`
3. Show/hide relevant sections per entity type
4. Display the context scope header ("RUN 421 / plate-1 / wells A1–A6")

**Step 1: Add ContextScopeHeader to RightPane**

```tsx
// In RightPane.tsx, add scope header above tabs
function ContextScopeHeader({ descriptor }: { descriptor: ContextDescriptor | null }) {
  if (!descriptor) return null
  const parts = [descriptor.label]
  if (descriptor.selectedSubobject) {
    parts.push(descriptor.selectedSubobject.label)
  }
  return (
    <div className="right-pane__scope" data-testid="right-pane-scope">
      {parts.join(' / ')}
    </div>
  )
}
```

**Step 2: Update FindTabPanel to switch on entity type**

When `objectType === 'project'`: show project's runs, claims, resources (current behavior minus experiment grouping).
When `objectType === 'run'`: show run's materials, events, results, linked claims.
When `objectType === 'claim'`: show supporting/contradicting runs, related claims, projects.
When `objectType === 'protocol'` / `'material'` / etc.: show runs using this entity, claims referencing it.

**Step 3: Commit**

```bash
git add app/src/event-editor/right-pane/
git commit -m "feat(ui): contextualize right pane to active entity type"
```

---

## Phase 6: Global Search Bar

### Task 6.1: Implement GlobalSearchBar with cross-entity search

**Objective:** Build the global search bar that retrieves projects, runs, claims, lab entities, and documents in one result set.

**Files:**
- Modify: `app/src/shared/shell/GlobalSearchBar.tsx`
- Create: `app/src/shared/shell/GlobalSearchBar.css`
- Modify: `server/src/api/routes.ts` (add unified search endpoint)

**Step 1: Add server-side unified search endpoint**

Add `GET /api/search?q=<query>` that searches across all record types using the existing JSON-LD search infrastructure. Returns results grouped by type:

```json
{
  "results": [
    { "type": "project", "id": "STU-1", "title": "DHVC", "score": 0.9 },
    { "type": "run", "id": "RUN-42", "title": "First Titration", "score": 0.8 },
    { "type": "claim", "id": "CLM-1", "title": "Cytation 5 quantifies dsDNA", "score": 0.7 }
  ]
}
```

**Step 2: Implement GlobalSearchBar**

```tsx
// app/src/shared/shell/GlobalSearchBar.tsx
import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import './GlobalSearchBar.css'

interface SearchResult {
  type: 'project' | 'run' | 'claim' | 'protocol' | 'material' | 'labware' | 'equipment' | 'person' | 'document'
  id: string
  title: string
  score: number
}

export function GlobalSearchBar() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (query.length < 2) { setResults([]); return }
    setLoading(true)
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`)
        const data = await res.json()
        setResults(data.results ?? [])
        setOpen(true)
      } catch { setResults([]) }
      finally { setLoading(false) }
    }, 200)
    return () => clearTimeout(timer)
  }, [query])

  const handleSelect = (result: SearchResult) => {
    setOpen(false)
    setQuery('')
    const path = resultPath(result)
    navigate(path)
  }

  return (
    <div className="global-search-bar" data-testid="global-search-bar">
      <input
        ref={inputRef}
        type="text"
        className="global-search-bar__input"
        placeholder="Find anything…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && results.length > 0 ? (
        <div className="global-search-bar__results" role="listbox">
          {results.map((r) => (
            <button
              key={`${r.type}:${r.id}`}
              type="button"
              role="option"
              className={`global-search-bar__result global-search-bar__result--${r.type}`}
              onClick={() => handleSelect(r)}
            >
              <span className="global-search-bar__result-type">{r.type}</span>
              <span className="global-search-bar__result-title">{r.title}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function resultPath(r: SearchResult): string {
  switch (r.type) {
    case 'project': return `/projects/${r.id}`
    case 'run': return `/runs/${r.id}`
    case 'claim': return `/claims/${r.id}`
    default: return `/lab/${r.id}`
  }
}
```

**Step 3: Write CSS**

```css
.global-search-bar {
  position: relative;
  width: 100%;
}

.global-search-bar__input {
  width: 100%;
  padding: 6px 10px;
  border: 1px solid var(--cl-border);
  border-radius: 4px;
  background: var(--cl-bg);
  color: var(--cl-text);
  font-size: 13px;
}

.global-search-bar__input:focus {
  outline: none;
  border-color: var(--cl-accent);
}

.global-search-bar__results {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: var(--cl-bg-elev);
  border: 1px solid var(--cl-border);
  border-radius: 4px;
  max-height: 320px;
  overflow-y: auto;
  z-index: 100;
}

.global-search-bar__result {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  border: none;
  background: transparent;
  color: var(--cl-text);
  text-align: left;
  cursor: pointer;
}

.global-search-bar__result:hover {
  background: var(--cl-bg-elev-2);
}

.global-search-bar__result-type {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  padding: 2px 6px;
  border-radius: 3px;
  background: var(--cl-bg-elev-2);
  color: var(--cl-text-dim);
  min-width: 60px;
  text-align: center;
}

.global-search-bar__result--project .global-search-bar__result-type {
  color: var(--cl-type-project);
  background: var(--cl-type-project-soft);
}
.global-search-bar__result--run .global-search-bar__result-type {
  color: var(--cl-type-run);
  background: var(--cl-type-run-soft);
}
.global-search-bar__result--claim .global-search-bar__result-type {
  color: var(--cl-type-claim);
  background: var(--cl-type-claim-soft);
}
```

**Step 4: Write failing test**

```tsx
// app/src/shared/shell/GlobalSearchBar.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { GlobalSearchBar } from './GlobalSearchBar'

describe('GlobalSearchBar', () => {
  it('renders search input with placeholder', () => {
    render(<MemoryRouter><GlobalSearchBar /></MemoryRouter>)
    expect(screen.getByPlaceholderText('Find anything…')).toBeDefined()
  })
})
```

**Step 5: Run test, verify pass**

**Step 6: Commit**

```bash
git add app/src/shared/shell/GlobalSearchBar.tsx app/src/shared/shell/GlobalSearchBar.css \
  app/src/shared/shell/GlobalSearchBar.test.tsx server/src/api/routes.ts
git commit -m "feat(ui): global search bar with cross-entity-type results"
```

### Task 6.2: Implement CreateMenu with entity-type options

**Objective:** Build the "+ Create" dropdown with New Run (dominant), New Project, New Claim, and lab entity creation options.

**Files:**
- Modify: `app/src/shared/shell/CreateMenu.tsx`
- Create: `app/src/shared/shell/CreateMenu.css`

**Step 1: Implement CreateMenu**

```tsx
// app/src/shared/shell/CreateMenu.tsx
import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import './CreateMenu.css'

export function CreateMenu() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const items = [
    { label: 'New Run', path: '/runs/new', dominant: true },
    { label: 'New Project', path: '/create/study' },
    { label: 'New Claim', path: '/claims/new' },
    { label: 'New Protocol', path: '/lab/protocols/new' },
    { label: 'New Material', path: '/lab/materials/new' },
  ]

  return (
    <div className="create-menu" ref={ref}>
      <button
        type="button"
        className="create-menu__button"
        data-testid="create-menu"
        onClick={() => setOpen(!open)}
      >
        + Create
      </button>
      {open ? (
        <div className="create-menu__dropdown" role="menu">
          {items.map((item) => (
            <button
              key={item.path}
              type="button"
              role="menuitem"
              className={
                item.dominant
                  ? 'create-menu__item create-menu__item--dominant'
                  : 'create-menu__item'
              }
              onClick={() => {
                setOpen(false)
                navigate(item.path)
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add app/src/shared/shell/CreateMenu.tsx app/src/shared/shell/CreateMenu.css
git commit -m "feat(ui): CreateMenu dropdown with New Run as dominant action"
```

---

## Phase 7: Claim Workspace

### Task 7.1: ClaimWorkspace — statement, evidence ledger, connections

**Objective:** Build the claim workspace view per spec §7.2.

**Files:**
- Create: `app/src/claims/ClaimWorkspace.tsx`
- Create: `app/src/claims/ClaimWorkspace.css`
- Create: `app/src/claims/EvidenceLedger.tsx`
- Create: `app/src/claims/ClaimConnections.tsx`

**Step 1: Add route**

```tsx
// In App.tsx
const ClaimWorkspace = lazy(async () => import('./claims/ClaimWorkspace').then((m) => ({ default: m.ClaimWorkspace })))
<Route path="/claims/:claimId" element={<DeferredRoute><ClaimWorkspace /></DeferredRoute>} />
```

**Step 2: Implement ClaimWorkspace**

Renders claim statement, status, scope, evidence ledger (supporting/contradictory/qualifying/inconclusive), connections (projects, runs, related claims, protocols), and revision history.

**Step 3: Commit**

```bash
git add app/src/claims/
git commit -m "feat(ui): claim workspace with evidence ledger and connections"
```

---

## Phase 8: Lab Workspace

### Task 8.1: LabEntityWorkspace — protocol/material/labware/instrument views

**Objective:** Build the lab entity workspace per spec §8.

**Files:**
- Create: `app/src/lab/LabEntityWorkspace.tsx`
- Create: `app/src/lab/LabEntityWorkspace.css`
- Create: `app/src/lab/ProtocolView.tsx`
- Create: `app/src/lab/MaterialView.tsx`
- Create: `app/src/lab/EquipmentView.tsx`

**Step 1: Add routes**

```tsx
// In App.tsx
const LabEntityWorkspace = lazy(async () => import('./lab/LabEntityWorkspace').then((m) => ({ default: m.LabEntityWorkspace })))
<Route path="/lab/:category/:entityId" element={<DeferredRoute><LabEntityWorkspace /></DeferredRoute>} />
```

**Step 2: Implement LabEntityWorkspace**

Reads the entity record and renders the appropriate view based on schema ID. Protocol view shows steps, versions, compatible labware. Material view shows hierarchy (concept → formulation → instance). Equipment view shows status, calibration, recent runs.

**Step 3: Commit**

```bash
git add app/src/lab/
git commit -m "feat(ui): lab entity workspace with protocol/material/equipment views"
```

---

## Risks, Tradeoffs, and Open Questions

### Risks

1. **Schema migration blast radius.** Making `experimentId` optional on runs touches ~25 files that reference `experimentId`. The migration must be done carefully — existing runs still have `experimentId`, and code that reads it must handle absence gracefully.

2. **Workspace state migration.** The current `workspace.yaml` is per-study (version 3). The new system needs a session-level tab store. The migration path: existing `workspace.yaml` files still work for per-study viewer tabs (deck, pdf, document), but entity-type tabs (project, run, claim, lab) are tracked in the session-level store only.

3. **Two tab systems in transition.** During the transition period, the old `ProjectTabStrip` and the new `WorkspaceTabStrip` need to coexist. The plan replaces `ProjectTabStrip` with `WorkspaceTabStrip` in Phase 2, but the old `WorkspaceContext` (per-study) still manages viewer tabs within a study. The `OpenTabsContext` manages entity-type tabs at the session level. The right pane reads from both.

4. **Server endpoints.** Several new server endpoints are needed: `GET /api/runs` (list runs across studies), `GET /api/claims` (list claims), `GET /api/search` (unified search). The existing JSON-LD search infrastructure can be leveraged.

5. **Run workspace page duplication.** There's already a `RunWorkspacePage` at `/project/:studyId/run/:runId` with plan/execute mode toggle. The new run workspace tab (`/runs/:runId`) needs to either replace or redirect to this. The spec says the existing run-centered editor is preserved.

### Tradeoffs

1. **Gradual vs big-bang.** This plan is phased so each phase delivers incremental value. Phase 1 (navbar) can ship without Phase 4 (experiment removal). However, the full spec vision requires all phases.

2. **Per-study vs per-session workspace state.** The current per-study `workspace.yaml` allows teammates to share layout. The new session-level `OpenTabsContext` is per-user (localStorage). This is a deliberate tradeoff — tabs are a personal session concept, not a shared layout.

3. **Color-coding scope.** Color tokens are defined as CSS custom properties, not per-component. This means all tabs of the same type share the same color, which is simple but limits per-instance customization.

### Open Questions

1. **Should `/project/:studyId` redirect to `/projects/:studyId`?** The spec uses `/projects/:projectId` but the existing code uses `/project/:studyId`. We need to decide on naming — "project" vs "study" terminology. The spec calls them "Projects" but the schema calls them "studies".

2. **What happens to the WelcomePage (`/`)?** With the global navbar, `/` could redirect to `/projects` (the project collection). The WelcomePage's recent-projects deck is subsumed by the ProjectCollectionView.

3. **Does the existing `RunWorkspacePage` at `/project/:studyId/run/:runId` get replaced by `/runs/:runId`?** Or does it stay as a deep-link that redirects? The spec says the run editor is preserved, so the existing event editor surface stays — only the URL and shell change.

4. **Lab entity creation flows.** The spec mentions "+ Create" should include lab entity types (New Protocol, New Material). The existing `RecordCreatePanel` (TapTab-first) can be reused for these. Do we need new routes like `/lab/protocols/new` or can we reuse the workspace tab mechanism?

5. **How deep should the initial claim and lab entity workspaces go?** The spec describes rich detail (evidence ledgers, calibration timelines, etc.). The plan creates the shell in Phases 7-8, but the full depth of each view is a follow-on effort.

---

## Verification Checklist

After all phases:

- [ ] Global navbar shows Projects, Runs, Claims, Lab destinations
- [ ] Workspace tabs are color-coded by entity type (P=blue, R=green, C=amber, L=purple)
- [ ] Tab strip shows type badge + title + close button
- [ ] Global search bar returns cross-entity-type results
- [ ] Create menu offers New Run (dominant), New Project, New Claim, New Protocol, New Material
- [ ] Project collection view shows cards with metadata
- [ ] Run collection view shows chronological grouping + filters
- [ ] Claim collection view shows operational status filters
- [ ] Lab collection view shows category navigation
- [ ] User can create a run without creating an experiment first
- [ ] Run can link to multiple projects
- [ ] Right pane scope header shows active context
- [ ] AI system prompt changes based on active entity type
- [ ] Find tab searches across all graph object types
- [ ] Search tab performs external research
- [ ] Details tab shows semantic context, not just database fields
- [ ] Protocol tab distinguishes templates from run-specific instances
- [ ] All CSS uses --cl-* tokens (no hardcoded colors)
- [ ] `npm run typecheck` passes for both workspaces
- [ ] `npm run test:unit -w app` passes
- [ ] `npm run test:run -w server` passes
