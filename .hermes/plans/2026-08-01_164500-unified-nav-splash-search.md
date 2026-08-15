# Unified Navigation + Splash Page + Search/Sort Infrastructure Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Unify the two separate navigation systems (GlobalNavbar route navigation + ProjectTabStrip workspace tabs) into a single tab-based system where top-level destinations (Projects, Runs, Lab, Claims) open as tabs within the workspace, replace the StudyPickerPopover + button with a splash page, and build a shared search/sort component driven by the relationships schema.

**Architecture:** The current system has TWO independent navigation layers: (1) GlobalNavbar uses `useNavigate()` to switch React Router routes, completely leaving the workspace context; (2) ProjectTabStrip manages workspace tabs but only for studies. These need to merge: every navigation action (clicking Projects, clicking a run, clicking a lab entity) opens/activates a workspace tab. The workspace becomes the single container, and the splash page replaces the StudyPicker as the new-tab landing surface.

**Tech Stack:** React, TypeScript, React Router, vitest

---

## Current State Analysis

### THREE Tab Systems (Not Two)

Investigation revealed three competing tab state stores:

| System | State Store | Scope | Persistence | Where Used |
|--------|------------|-------|-------------|------------|
| **WorkspaceContext** | Per-study reducer | Study-scoped tabs (deck, pdf, project-details, etc.) | Server: workspace.yaml | ProjectWorkspacePage |
| **OpenTabsContext** | Session-level reducer | Global tabs (project, run, claim, lab-entity, collection) | localStorage: `cl-open-tabs` | WorkspaceTabStrip (new) |
| **ProjectTabStrip / useOpenStudies** | Session hook | Study-only tabs | localStorage | Old study picker |

### Two Navigation Systems

```
GlobalNavbar (NAV #1)
  - 4 destination buttons: Projects, Runs, Claims, Lab
  - Uses useNavigate() → switches React Router routes
  - Completely LEAVES the workspace shell when clicked
  - Independent of ALL tab state stores

WorkspaceTabStrip (NAV #2 — the "new" unified strip)
  - Uses OpenTabsContext (localStorage)
  - Has entity-typed tabs (project, run, claim, lab-entity)
  - "+" button is a DEAD BUTTON — no onClick handler!
  - Not rendered on collection pages (they pass topbarTabs={<div/>})

ProjectTabStrip (NAV #2 — the "old" study strip)
  - Uses useOpenStudies (localStorage, study-only)
  - "+" opens StudyPickerPopover
  - Only rendered in ProjectWorkspacePage
```

### The Core Conflict

When inside a workspace with 3 tabs open (Project A, Run 1, Claim X) and you click "Claims" in GlobalNavbar:
1. React Router navigates to /claims
2. ClaimCollectionView renders with `topbarTabs={<div />}` — tab strip is replaced with empty div
3. OpenTabsContext still has the 3 tabs in localStorage, but they're invisible
4. User has lost access to their workspace session

### The "+" Button Problem

- WorkspaceTabStrip's "+" is a DEAD BUTTON (no onClick)
- ProjectTabStrip's "+" opens StudyPickerPopover (deprecated concept)
- CreateMenu's "+ Create" navigates to collection views (doesn't open a tab)

### Key Files

| File | Role |
|------|------|
| `app/src/shared/shell/GlobalNavbar.tsx` | NAV #1 — top-level 4-destination nav |
| `app/src/shared/shell/WorkspaceTabStrip.tsx` | NAV #2 (new) — unified tab strip, DEAD "+" button |
| `app/src/shared/shell/OpenTabsContext.tsx` | NAV #2 state store — localStorage session tabs |
| `app/src/event-editor/projects/ProjectTabStrip.tsx` | NAV #2 (old) — study-only tab strip with StudyPicker |
| `app/src/event-editor/workspace/WorkspaceContext.tsx` | Per-study workspace state — server-persisted |
| `app/src/event-editor/workspace/types.ts` | WorkspaceTab union (11 tab kinds) |
| `app/src/shared/shell/AppShell.tsx` | Shell — renders GlobalNavbar + topbarTabs |
| `app/src/App.tsx` | Route definitions |

---

## Phased Implementation

### Phase 1: Unified Tab Navigation

Make the workspace tab strip handle ALL entity types, not just studies. Clicking Projects/Runs/Lab/Claims in the GlobalNavbar opens a collection tab instead of navigating away.

### Phase 2: Splash Page

Replace the StudyPickerPopover with a splash page that opens when clicking "+". The splash page has top-level nav chips + recently used items as searchable chips.

### Phase 3: Shared Search/Sort Component

Extract the ad-hoc search/sort UI from collection views into a reusable component. Add relationship-based filtering.

### Phase 4: Relationship-Driven Navigation

Use the relationships schema to show "related items" chips on entity pages and enable cross-entity navigation.

---

## Phase 1: Unified Tab Navigation

### Task 1.1: Add collection tab kinds to WorkspaceTab

**Objective:** Extend the WorkspaceTab union to include collection tabs (projects, runs, lab, claims).

**Files:**
- Modify: `app/src/event-editor/workspace/types.ts`

Add new tab kinds:

```typescript
| {
    id: string
    kind: 'collection'
    /** Which collection: projects, runs, claims, lab */
    collection: 'projects' | 'runs' | 'claims' | 'lab'
    /** Optional category within lab (materials, protocols, etc.) */
    labCategory?: string
    title: string
  }
```

Add a stable ID helper:

```typescript
export function collectionTabId(collection: string, labCategory?: string): string {
  return labCategory ? `collection:${collection}:${labCategory}` : `collection:${collection}`
}
```

Update `entityTabType` to handle the new kind (returns null for collections — they're not entity-specific).

**Commit:**
```bash
git add app/src/event-editor/workspace/types.ts
git commit -m "feat: add collection tab kind to WorkspaceTab union"
```

### Task 1.2: Make GlobalNavbar open tabs instead of navigating

**Objective:** When inside a workspace, clicking Projects/Runs/Lab/Claims opens a collection tab. When NOT in a workspace (standalone collection page), navigate normally.

**Files:**
- Modify: `app/src/shared/shell/GlobalNavbar.tsx`

The GlobalNavbar needs to detect if it's inside a workspace context. If yes, use `ws.openTab()` instead of `navigate()`. If no, fall back to `navigate()`.

```typescript
import { useWorkspace } from '../../event-editor/workspace/WorkspaceContext'
import { collectionTabId, type WorkspaceTab } from '../../event-editor/workspace/types'

export function GlobalNavbar() {
  const navigate = useNavigate()
  const location = useLocation()
  const ws = useWorkspace() // Returns null if not in workspace context

  const handleDestination = (dest: { id: string; path: string; label: string }) => {
    if (ws) {
      // Inside workspace — open as a tab
      const tab: WorkspaceTab = {
        id: collectionTabId(dest.id),
        kind: 'collection',
        collection: dest.id as 'projects' | 'runs' | 'claims' | 'lab',
        title: dest.label,
      }
      ws.openTab(tab, true)
    } else {
      // Standalone — navigate normally
      navigate(dest.path)
    }
  }

  // ... use handleDestination in onClick
}
```

**Important:** `useWorkspace()` must return null when not in a workspace context (not throw). Check if WorkspaceContext supports this — if not, create a `useOptionalWorkspace()` hook.

**Commit:**
```bash
git add app/src/shared/shell/GlobalNavbar.tsx
git commit -m "feat: GlobalNavbar opens collection tabs inside workspace"
```

### Task 1.3: Render collection tabs in the workspace

**Objective:** When a collection tab is active, render the corresponding CollectionView inside the workspace left pane instead of navigating away.

**Files:**
- Modify: `app/src/event-editor/projects/ProjectWorkspacePage.tsx` (or wherever the workspace body is rendered)

The workspace body currently renders the active tab's content (deck, pdf, project-details, etc.). Add a case for `kind: 'collection'` that renders the appropriate CollectionView component.

```typescript
case 'collection': {
  switch (tab.collection) {
    case 'projects': return <ProjectCollectionView embedded />
    case 'runs': return <RunCollectionView embedded />
    case 'claims': return <ClaimCollectionView embedded />
    case 'lab': return <LabCollectionView embedded initialCategory={tab.labCategory} />
  }
}
```

The `embedded` prop tells the collection view to skip its own AppShell wrapper and just render the content.

**Commit:**
```bash
git add app/src/event-editor/projects/ProjectWorkspacePage.tsx
git commit -m "feat: render collection views as workspace tabs"
```

### Task 1.4: Update collection views to support embedded mode

**Objective:** Add an `embedded` prop to each collection view that skips the AppShell wrapper.

**Files:**
- Modify: `app/src/collections/ProjectCollectionView.tsx`
- Modify: `app/src/collections/RunCollectionView.tsx`
- Modify: `app/src/collections/LabCollectionView.tsx`
- Modify: `app/src/collections/ClaimCollectionView.tsx` (if exists)

Each view gains:
```typescript
export function ProjectCollectionView({ embedded = false }: { embedded?: boolean }) {
  // ... existing content ...
  if (embedded) return collectionContent
  return <AppShell brand="Projects" layout="workspace" ...>{collectionContent}</AppShell>
}
```

**Commit:**
```bash
git add app/src/collections/
git commit -m "feat: add embedded mode to collection views"
```

### Task 1.5: Update ProjectTabStrip to show all tab types

**Objective:** The tab strip currently only shows study tabs. It should show ALL workspace tabs (collections, projects, runs, lab entities, etc.).

**Files:**
- Modify: `app/src/event-editor/projects/ProjectTabStrip.tsx`

Rename to `WorkspaceTabStrip` (or create a new component). Read tabs from WorkspaceContext instead of fetching studies separately. Each tab gets a color-coded badge based on its entity type.

```typescript
const ws = useWorkspace()
const tabs = ws.state.tabs
const activeTabId = ws.state.activeTabId

// Render each tab with appropriate label, icon, and close button
tabs.map(tab => {
  const label = tab.title
  const typeColor = entityTabType(tab) // 'project', 'run', 'claim', 'lab', null
  // ...
})
```

**Commit:**
```bash
git add app/src/event-editor/projects/ProjectTabStrip.tsx
git commit -m "feat: tab strip shows all workspace tab types"
```

---

## Phase 2: Splash Page

### Task 2.1: Create SplashPage component

**Objective:** Replace the StudyPickerPopover with a splash page that opens when clicking "+".

**Files:**
- Create: `app/src/shared/shell/SplashPage.tsx`
- Create: `app/src/shared/shell/SplashPage.css`

The splash page has:
1. Top-level nav chips: Projects, Runs, Lab, Claims (clicking opens a collection tab)
2. Searchable, scrollable list of recently used items as chips
3. "Create new" actions

```typescript
export function SplashPage({ onOpenCollection, onOpenEntity, onCreateNew }: {
  onOpenCollection: (collection: string) => void
  onOpenEntity: (tab: WorkspaceTab) => void
  onCreateNew: (type: string) => void
}) {
  const [query, setQuery] = useState('')
  const [recent, setRecent] = useState<WorkspaceTab[]>([])

  // Fetch recently used items from workspace history
  // (Could use session_search API or a new /recent endpoint)

  const filtered = recent.filter(item =>
    item.title.toLowerCase().includes(query.toLowerCase())
  )

  return (
    <div className="splash-page">
      <div className="splash-page__nav">
        {['projects', 'runs', 'lab', 'claims'].map(col => (
          <button key={col} onClick={() => onOpenCollection(col)}>
            {col.charAt(0).toUpperCase() + col.slice(1)}
          </button>
        ))}
      </div>
      <input
        type="text"
        placeholder="Search recent items..."
        value={query}
        onChange={e => setQuery(e.target.value)}
      />
      <div className="splash-page__recent">
        {filtered.map(item => (
          <button key={item.id} onClick={() => onOpenEntity(item)}>
            <span className="splash-page__chip-type">{entityTabType(item) ?? 'view'}</span>
            <span className="splash-page__chip-title">{item.title}</span>
          </button>
        ))}
      </div>
      <div className="splash-page__create">
        <button onClick={() => onCreateNew('study')}>+ New Project</button>
        <button onClick={() => onCreateNew('run')}>+ New Run</button>
      </div>
    </div>
  )
}
```

**Commit:**
```bash
git add app/src/shared/shell/SplashPage.tsx app/src/shared/shell/SplashPage.css
git commit -m "feat: add SplashPage component for new-tab landing"
```

### Task 2.2: Wire SplashPage into the tab strip "+" button

**Objective:** Replace StudyPickerPopover with SplashPage.

**Files:**
- Modify: `app/src/event-editor/projects/ProjectTabStrip.tsx` (or the new WorkspaceTabStrip)

The "+" button now opens the SplashPage as a modal/overlay or as a special "splash" tab.

```typescript
{pickerOpen ? (
  <SplashPage
    onOpenCollection={(col) => {
      const tab: WorkspaceTab = {
        id: collectionTabId(col),
        kind: 'collection',
        collection: col as any,
        title: col.charAt(0).toUpperCase() + col.slice(1),
      }
      ws.openTab(tab, true)
      setPickerOpen(false)
    }}
    onOpenEntity={(tab) => {
      ws.openTab(tab, true)
      setPickerOpen(false)
    }}
    onCreateNew={(type) => {
      setPickerOpen(false)
      if (type === 'study') navigate('/create/study')
    }}
  />
) : null}
```

### Task 2.3: Track recently used items

**Objective:** Maintain a list of recently opened tabs to show on the splash page.

**Files:**
- Modify: `app/src/event-editor/workspace/WorkspaceContext.tsx`

Add a `recentTabs` array to workspace state (or use a separate localStorage-backed store). Every time a tab is opened/activated, prepend it to the recent list (deduped, max 20).

```typescript
// In the workspace reducer, on openTab:
const recent = [action.tab, ...state.recentTabs.filter(t => t.id !== action.tab.id)].slice(0, 20)
return { ...state, tabs: [...], activeTabId: ..., recentTabs: recent }
```

---

## Phase 3: Shared Search/Sort Component

### Task 3.1: Create CollectionSearchSort component

**Objective:** Extract the ad-hoc search/sort UI into a reusable component.

**Files:**
- Create: `app/src/shared/components/CollectionSearchSort.tsx`
- Create: `app/src/shared/components/CollectionSearchSort.css`

```typescript
export interface SortField {
  id: string
  label: string
}

export interface CollectionSearchSortProps {
  query: string
  onQueryChange: (q: string) => void
  sortField: string
  onSortFieldChange: (field: string) => void
  sortDirection: 'asc' | 'desc'
  onSortDirectionChange: (dir: 'asc' | 'desc') => void
  sortFields: SortField[]
  placeholder?: string
}

export function CollectionSearchSort({
  query, onQueryChange,
  sortField, onSortFieldChange,
  sortDirection, onSortDirectionChange,
  sortFields, placeholder,
}: CollectionSearchSortProps) {
  return (
    <div className="collection-search-sort">
      <input
        type="text"
        className="collection-search-sort__input"
        value={query}
        onChange={e => onQueryChange(e.target.value)}
        placeholder={placeholder ?? 'Search...'}
      />
      <span className="collection-search-sort__label">Sort:</span>
      <div className="collection-search-sort__buttons">
        {sortFields.map(field => (
          <button
            key={field.id}
            className={`collection-search-sort__btn ${sortField === field.id ? 'collection-search-sort__btn--active' : ''}`}
            onClick={() => onSortFieldChange(field.id)}
          >
            {field.label}
            {sortField === field.id && (
              <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
```

### Task 3.2: Refactor collection views to use shared component

Replace the ad-hoc search/sort in each collection view with `<CollectionSearchSort>`.

**Files:**
- Modify: `app/src/collections/ProjectCollectionView.tsx`
- Modify: `app/src/collections/RunCollectionView.tsx`
- Modify: `app/src/collections/LabCollectionView.tsx`

### Task 3.3: Add type filter to search/sort

**Objective:** The shared component supports a `typeFilter` prop so the Lab page can filter by entity type (materials, protocols, etc.) and a unified search can filter across all entity types.

```typescript
export interface CollectionSearchSortProps {
  // ... existing props ...
  typeFilter?: string
  onTypeFilterChange?: (type: string) => void
  typeOptions?: Array<{ id: string; label: string }>
}
```

When `typeOptions` is provided, render a type filter dropdown. This lets the Lab page show "All | Protocols | Materials | Labware | Equipment" as filter chips.

---

## Phase 4: Relationship-Driven Navigation (Future)

### Task 4.1: Add relationship query endpoint

**Objective:** Backend endpoint to query relationships for a given entity.

**Files:**
- Create: `server/src/api/handlers/RelationshipHandlers.ts`
- Modify: `server/src/api/routes.ts`

`GET /relationships?entityId=RUN-001` → returns all relationship records where sourceId or targetId = RUN-001.

### Task 4.2: Show related items on entity pages

**Objective:** On the LabEntityWorkspace or RunWorkspacePage, show a "Related items" section with chips for each related entity.

**Files:**
- Modify: `app/src/lab/LabEntityWorkspace.tsx`
- Create: `app/src/shared/components/RelatedItems.tsx`

Clicking a related item chip opens it as a new workspace tab.

---

## Risks and Tradeoffs

1. **Workspace state scope** — Currently workspace state is per-study. Collection tabs (Projects, Runs, Lab) don't belong to a specific study. Either: (a) make a global workspace that's not study-scoped, or (b) allow collection tabs in any study's workspace. Option (b) is simpler but means collection tabs appear in every study's workspace.yaml.

2. **Route vs tab navigation** — Some URLs (/projects, /runs, /lab) are direct routes that render standalone pages. When inside a workspace, these should become tabs. When standalone, they should still work as routes. The `embedded` prop handles this, but the GlobalNavbar needs to detect context.

3. **StudyPicker deprecation** — The StudyPickerPopover is used in multiple places. Replacing it with SplashPage is a breaking change for any code that imports it.

4. **Search/sort refactoring** — Each collection view has slightly different sort fields and search logic. The shared component needs to be flexible enough to accommodate all of them without becoming a configuration nightmare.

5. **Recent items tracking** — Needs a storage mechanism. Workspace state is per-study YAML, but recent items should be global. localStorage is the simplest option.

---

## Open Questions

1. Should the workspace become global (not per-study) to support collection tabs properly?
2. Should the splash page be a full-page overlay or a tab that opens in the workspace?
3. Should recently used items be persisted to localStorage, a server-side profile, or the workspace YAML?
4. Should the relationships endpoint be a new API or use the existing JSON-LD search index?
5. Should the shared search/sort component also handle pagination, or is that separate?

---

## Verification

After each phase:

1. Frontend tests: `cd app && npx vitest run`
2. TypeScript: `cd app && npx tsc --noEmit`
3. Manual test after Phase 1: Inside a project workspace, click "Runs" in GlobalNavbar → should open a Runs collection tab in the workspace, not navigate away
4. Manual test after Phase 2: Click "+" in tab strip → should show splash page with nav + recent items
5. Manual test after Phase 3: All collection pages should use the shared search/sort component
