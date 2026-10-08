# Phase 2 completion — left nav pane tabs (Protocol | Search | Details) + permanent AI chat column

## Goal
Restructure the run workspace's three-pane agent harness so the LEFT navigation pane hosts a tabbed switcher between Protocol | Search | Details (the three non-AI tools that currently live in the tabbed `RightPane`), and the RIGHT pane becomes a permanent AI chat column (`ChatContextHeader` + `AiTabPanel`) with no tab strip.

## Current context / assumptions (verified by inspection)
- `RunWorkspacePage.tsx:137-149` already mounts the three-pane shell:
  - `navPane={<ProtocolNavPanel title={title} />}` — the step-CONCEPT navigation rail (left),
  - `rightPane={<RightPane />}` — the tabbed AI/Search/Details/Protocol panel (right),
  - `children` = `DeckViewer` (center action).
- `AppShell.tsx:252-293` already renders the three-pane split `nav | action | chat` when `navPane` is non-null; `rightPane` fills the `--chat` pane. **So no shell change is needed — only which components fill `navPane` and `rightPane`.**
- `RightPane.tsx` (shared) renders a 4-tab strip (AI · Search · Details · Protocol) driven by `WorkspaceContext.rightPaneMode`, default `'ai'` (`workspace/types.ts:235,272`). `RunPaneMode` (`RunWorkspacePage.tsx:159-168`) sets it to `'protocol'` on run mount.
- The three non-AI panels are self-contained and reusable:
  - `ProtocolTabPanel` (`right-pane/protocol/ProtocolTabPanel.tsx`) — requires props `runId: string | null` and `studyId: string` (line 89-93). Rich protocol surface (run header, attach, steps).
  - `SearchTabPanel` (`right-pane/search/SearchTabPanel.tsx`) — prop-less, reads `useWorkspace().state.studyId`.
  - `DetailsTabPanel` (`right-pane/details/DetailsTabPanel.tsx`) — prop-less, reads `useWorkspace()` + `useEventEditor()` + `useFocusModals()` (all already mounted above the shell in `RunWorkspacePage`).
- `ProtocolNavPanel` is the current left nav content (step-concept rail that focuses a step on the deck). It is the harness's **navigation** piece and is asserted by the committed e2e `app/e2e/three-pane-harness.spec.ts` (`[data-testid="protocol-nav"]`). It must stay reachable (see layout decision below).
- `AiTabPanel` is prop-less and portable; `ChatContextHeader` already exists. Together they ARE the permanent chat column (already wired in `RightPane.tsx:92-93`).
- `RightPane` is ALSO used by `ProjectWorkspacePage.tsx:200` (two-pane). It must be left functionally intact for that surface.
- App typecheck (`npx tsc --noEmit -p app/tsconfig.json`) is currently clean; `assistStream`/`draftPreview`/`ChatContextHeader` unit tests pass.

## Architecture / proposed approach
Create two new components and rewire `RunWorkspacePage` to use them; leave `RightPane`, `AppShell`, and `ProjectWorkspacePage` untouched (except removing the now-dead `RunPaneMode`). Left pane becomes `RunNavPane` — a vertical column: breadcrumb + step-concept rail on top (the harness navigation), then a tab strip [Protocol | Search | Details] whose body swaps among `ProtocolTabPanel` / `SearchTabPanel` / `DetailsTabPanel`. Right pane becomes `AgentChatPane` — `ChatContextHeader` + `AiTabPanel` filling the column, no tabs. Run-mode tab selection is local component state defaulting to Protocol (kept inside `RunNavPane`; lifted to a `navPaneMode` in `WorkspaceContext` only when Phase 4's AI-driven jump needs to switch it).

---

## Step-by-step tasks

### Task 1 — (RED) failing test: AgentChatPane renders the permanent AI column
File: `app/src/agent/AgentChatPane.test.tsx` (new; create `app/src/agent/` if absent).
```tsx
// app/src/agent/AgentChatPane.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AgentChatPane } from './AgentChatPane'

vi.mock('../event-editor/right-pane/ai/AiTabPanel', () => ({
  AiTabPanel: () => <div data-testid="ai-tab-panel">ai</div>,
}))

describe('AgentChatPane', () => {
  it('renders the chat context header and the AI panel, with no tab strip', () => {
    render(<AgentChatPane />)
    expect(screen.getByTestId('chat-context-header')).toBeInTheDocument()
    expect(screen.getByTestId('ai-tab-panel')).toBeInTheDocument()
    expect(screen.queryByRole('tablist')).toBeNull()
  })
})
```
Run, confirm RED (module `./AgentChatPane` missing):
```
cd app && npx vitest run src/agent/AgentChatPane.test.tsx   # → cannot find module './AgentChatPane'
```

### Task 2 — (GREEN) implement AgentChatPane
File: `app/src/agent/AgentChatPane.tsx` (new).
```tsx
// app/src/agent/AgentChatPane.tsx — the permanent AI chat column of the
// three-pane agent harness. No tab strip: the whole right column is chat
// (context header + conversation), per plan §9-Phase 2.
import { ChatContextHeader } from '../event-editor/right-pane/ai/ChatContextHeader'
import { AiTabPanel } from '../event-editor/right-pane/ai/AiTabPanel'
import './AgentChatPane.css'

export function AgentChatPane() {
  return (
    <div className="agent-chat-pane" data-testid="agent-chat-pane">
      <div className="agent-chat-pane__header">
        <ChatContextHeader />
      </div>
      <div className="agent-chat-pane__body">
        <AiTabPanel />
      </div>
    </div>
  )
}
```
File: `app/src/agent/AgentChatPane.css` (new) — use ONLY existing `--cl-*` tokens (SOUL rule 7 / skills pitfall on tokens):
```css
.agent-chat-pane { display: flex; flex-direction: column; height: 100%; min-width: 0; }
.agent-chat-pane__header { flex-shrink: 0; border-bottom: 1px solid var(--cl-border); }
.agent-chat-pane__body { flex: 1; min-height: 0; display: flex; flex-direction: column; }
```
Run, confirm GREEN, then typecheck:
```
cd app && npx vitest run src/agent/AgentChatPane.test.tsx    # → 1 passed
cd app && npx tsc --noEmit                                    # → clean
```
Commit: `feat(harness): permanent AI chat column (AgentChatPane)`.

### Task 3 — (RED) failing test: RunNavPane shows Protocol | Search | Details tabs
File: `app/src/run/RunNavPane.test.tsx` (new).
```tsx
// app/src/run/RunNavPane.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RunNavPane } from './RunNavPane'

vi.mock('../event-editor/right-pane/protocol/ProtocolTabPanel', () => ({
  ProtocolTabPanel: ({ runId, studyId }: { runId: string | null; studyId: string }) => (
    <div data-testid="protocol-panel">protocol:{runId}:{studyId}</div>
  ),
}))
vi.mock('../event-editor/right-pane/search/SearchTabPanel', () => ({
  SearchTabPanel: () => <div data-testid="search-panel">search</div>,
}))
vi.mock('../event-editor/right-pane/details/DetailsTabPanel', () => ({
  DetailsTabPanel: () => <div data-testid="details-panel">details</div>,
}))

describe('RunNavPane', () => {
  it('defaults to the Protocol tab', () => {
    render(<RunNavPane runId="RUN-X" studyId="S1" />)
    expect(screen.getByTestId('protocol-panel')).toBeInTheDocument()
    expect(screen.queryByTestId('search-panel')).toBeNull()
  })
  it('switches to Search on tab click', () => {
    render(<RunNavPane runId="RUN-X" studyId="S1" />)
    fireEvent.click(screen.getByRole('tab', { name: /search/i }))
    expect(screen.getByTestId('search-panel')).toBeInTheDocument()
  })
  it('switches to Details on tab click', () => {
    render(<RunNavPane runId="RUN-X" studyId="S1" />)
    fireEvent.click(screen.getByRole('tab', { name: /details/i }))
    expect(screen.getByTestId('details-panel')).toBeInTheDocument()
  })
})
```
Run, confirm RED (`./RunNavPane` missing).

### Task 4 — (GREEN) implement RunNavPane
File: `app/src/run/RunNavPane.tsx` (new).
```tsx
// app/src/run/RunNavPane.tsx — the left navigation column of the three-pane
// agent harness. Top: the run breadcrumb + protocol step-concept rail (the
// harness navigation). Below: a tab strip switching the Protocol | Search |
// Details tool panels. Right column is the permanent AI chat (AgentChatPane).
import { useState } from 'react'
import { ProtocolNavPanel } from '../event-editor/right-pane/protocol/ProtocolNavPanel'
import { ProtocolTabPanel } from '../event-editor/right-pane/protocol/ProtocolTabPanel'
import { SearchTabPanel } from '../event-editor/right-pane/search/SearchTabPanel'
import { DetailsTabPanel } from '../event-editor/right-pane/details/DetailsTabPanel'
import './RunNavPane.css'

export interface RunNavPaneProps {
  title?: string
  runId: string | null
  studyId: string
}

type NavTab = 'protocol' | 'search' | 'details'

const TABS: { mode: NavTab; label: string }[] = [
  { mode: 'protocol', label: 'Protocol' },
  { mode: 'search', label: 'Search' },
  { mode: 'details', label: 'Details' },
]

export function RunNavPane({ title, runId, studyId }: RunNavPaneProps) {
  const [tab, setTab] = useState<NavTab>('protocol')
  return (
    <div className="run-nav-pane" data-testid="run-nav-pane">
      <div className="run-nav-pane__rail">
        <ProtocolNavPanel title={title} />
      </div>
      <div className="run-nav-pane__tabs" role="tablist">
        {TABS.map(({ mode, label }) => (
          <button
            key={mode}
            type="button"
            role="tab"
            aria-selected={tab === mode}
            className={tab === mode ? 'run-nav-pane__tab run-nav-pane__tab--active' : 'run-nav-pane__tab'}
            data-testid={`run-nav-tab-${mode}`}
            onClick={() => setTab(mode)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="run-nav-pane__body">
        {tab === 'protocol' ? <ProtocolTabPanel runId={runId} studyId={studyId} /> : null}
        {tab === 'search' ? <SearchTabPanel /> : null}
        {tab === 'details' ? <DetailsTabPanel /> : null}
      </div>
    </div>
  )
}
```
File: `app/src/run/RunNavPane.css` (new) — reuse existing `--cl-*` tokens and mirror `rightPane.css`'s tab styles (copy the `.right-pane__tab` rules verbatim as `.run-nav-pane__tab`, and `.run-nav-pane__tabs`/`--active` accordingly):
```css
.run-nav-pane { display: flex; flex-direction: column; height: 100%; min-width: 0; }
.run-nav-pane__rail { flex-shrink: 0; max-height: 45%; overflow-y: auto; border-bottom: 1px solid var(--cl-border); }
.run-nav-pane__tabs { display: flex; gap: 0; border-bottom: 1px solid var(--cl-border); background: var(--cl-bg-elev-2); flex-shrink: 0; }
.run-nav-pane__tab { appearance: none; background: transparent; border: 0; border-bottom: 2px solid transparent; color: var(--cl-text-dim); padding: 8px 16px; font: inherit; font-size: 12px; font-weight: 500; cursor: pointer; }
.run-nav-pane__tab--active { color: var(--cl-text); border-bottom-color: var(--cl-accent); }
.run-nav-pane__body { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; }
```
Run Task 3 → GREEN. Typecheck. Commit: `feat(harness): left nav tabs (Protocol | Search | Details)`.

### Task 5 — (RED) failing shell wiring test: RunWorkspacePage passes nav + chat panes
File: `app/src/run/RunWorkspaceShell.test.tsx` (new) — assert the shell forwards distinct nav/action/chat panes (extend the existing three-pane contract).
```tsx
// app/src/run/RunWorkspaceShell.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RunWorkspaceShell } from './RunWorkspaceShell'

// The shell is thin (forwards props to AppShell); assert it passes the three
// panes through by checking AppShell is called with them. Mock AppShell to
// capture props.
import * as AppShell from '../shared/shell/AppShell'
const appShellSpy = vi.spyOn(AppShell, 'AppShell')

describe('RunWorkspaceShell', () => {
  it('passes distinct navPane / leftPane / rightPane to AppShell', () => {
    render(
      <RunWorkspaceShell navPane={<div data-testid="navpane" />} rightPane={<div data-testid="chatpane" />}>
        <div data-testid="action" />
      </RunWorkspaceShell>,
    )
    expect(appShellSpy).toHaveBeenCalled()
    const calls = appShellSpy.mock.calls
    // last call for the rendered instance
    const props = calls[calls.length - 1][0] as { navPane?: unknown; leftPane?: unknown; rightPane?: unknown }
    expect(props.navPane).not.toBeNull()
    expect(props.leftPane).not.toBeNull()
    expect(props.rightPane).not.toBeNull()
    expect(props.navPane).not.toBe(props.leftPane)
    expect(props.leftPane).not.toBe(props.rightPane)
  })
})
```
Run → RED (expectations about distinctness nominal; ensure it actually fails before implementing Task 6's wiring at the page, or adjust to assert `RunWorkspacePage` passes `RunNavPane`/`AgentChatPane`).

### Task 6 — (GREEN) rewire RunWorkspacePage to the new panes
Edit `app/src/run/RunWorkspacePage.tsx`:
- Replace import `RightPane` (`../event-editor/right-pane/RightPane`) with `import { AgentChatPane } from '../agent/AgentChatPane'` and `import { RunNavPane } from './RunNavPane'`.
- Change the `RunWorkspaceShell` props (lines 137-139):
  ```tsx
  <RunWorkspaceShell
    navPane={<RunNavPane title={title} runId={runId} studyId={resolvedStudyId} />}
    rightPane={<AgentChatPane />}
    ...
  >
  ```
- Remove the now-dead `RunPaneMode` component + its mount at `RunWorkspacePage.tsx:130` and the `useEffect` at `:159-168` (it referenced `setRightPaneMode('protocol')`, which is superseded by `RunNavPane`'s own default `'protocol'`). Remove the now-unused `useRef` import if it becomes unused.
- Confirm `RightPane` is no longer imported by `RunWorkspacePage` (it remains used by `ProjectWorkspacePage` — leave it in place).
Run Task 5 → GREEN; full typecheck + app unit tests:
```
cd app && npx tsc --noEmit
cd app && npx vitest run src/run src/agent src/event-editor/right-pane/ai
```
Commit: `feat(harness): wire run workspace to RunNavPane tabs + permanent AI chat`.

### Task 7 — Update the committed e2e for the new layout
Edit `app/e2e/three-pane-harness.spec.ts`:
- The "AI tab" is permanent now, so the spec must NOT open it via an AI tab button. Replace the `aiTab.click()` step at lines ~44-48 with an assertion that `[data-testid="agent-chat-pane"]` is always visible alongside the nav rail.
- Assert the new left tabs: `[data-testid="run-nav-tab-protocol"]` visible and active by default; clicking `run-nav-tab-search` renders the Search panel (`[data-testid="search-panel"]` or SearchTabPanel's `data-testid="right-pane-tab-search"`-adjacent testid — verify the actual SearchTabPanel root testid before hardcoding).
- Keep the `[data-testid="protocol-nav"]` rail assertion (it is still rendered at the top of `RunNavPane`).
Run (committed, SOUL rule 12 gate):
```
cd app && npx playwright test e2e/three-pane-harness.spec.ts --project=chromium
```
Expected: all tests pass. Fix any testid drift against the real panels before claiming done.

### Task 8 — (optional, only if Detail/Search need persistence) lift nav tab state to WorkspaceContext
If Brad wants the active nav tab to persist per-study (mirroring `rightPaneMode`), add `navPaneMode: 'protocol' | 'search' | 'details'` to `WorkspaceState` (`event-editor/workspace/types.ts`) and replace `RunNavPane`'s `useState` with `useWorkspace().state.navPaneMode` / a `setNavPaneMode` dispatcher. Skip unless asked — local state (Task 4) is the YAGNI default.

---

## Tests / validation summary
| Task | Command (`cd app`) | Expected |
|---|---|---|
| 1 RED | `npx vitest run src/agent/AgentChatPane.test.tsx` | cannot find module `./AgentChatPane` |
| 2 GREEN | `npx vitest run src/agent/AgentChatPane.test.tsx` | 1 passed |
| 3 RED | `npx vitest run src/run/RunNavPane.test.tsx` | cannot find module `./RunNavPane` |
| 4 GREEN | `npx vitest run src/run/RunNavPane.test.tsx` | 3 passed |
| 5 RED | `npx vitest run src/run/RunWorkspaceShell.test.tsx` | fails on distinctness/virtual |
| 6 GREEN | `npx vitest run src/run src/agent src/event-editor/right-pane/ai` | all pass |
| typecheck | `npx tsc --noEmit` | exit 0, no output |
| e2e (SOUL 12) | `npx playwright test e2e/three-pane-harness.spec.ts --project=chromium` | all pass |

## Risks, tradeoffs, open questions
- **RightPane stays for ProjectWorkspacePage.** The left-nav-tab redesign is scoped to the run harness only; `ProjectWorkspacePage` keeps its existing two-pane tabbed `RightPane`. Do NOT delete `RightPane` or change its tab set — that would break the project workspace.
- **Step-concept rail placement (decision).** The plan keeps `ProtocolNavPanel` as a persistent rail at the top of the left nav pane (it is the harness NAVIGATION and is asserted by the committed e2e `protocol-nav` testid), with the Protocol | Search | Details tabs BELOW it. Alternative: fold the rail into the Protocol tab only. Keeping it always-visible preserves the "click a step to focus it on the deck" interaction and the existing e2e — recommended. If Brad prefers the rail only inside the Protocol tab, move it from `run-nav-pane__rail` into the `tab === 'protocol'` branch (one-line change) and update the e2e rail assertion.
- **Nav pane width.** `ProtocolTabPanel` (the richest panel) now renders in the 18%-default left column. It is resizable (drag), but the user should confirm the Protocol tab is usable at that width; if not, bump the nav pane `defaultSize` (AppShell.tsx:262) only after checking it doesn't crowd the center deck.
- **`RunPaneMode` removal.** It only set `rightPaneMode='protocol'`; `RunNavPane` owns tab state now, so it's dead for the run surface. Removing it is safe; if any other surface reads run-side `rightPaneMode`, re-check before deleting.
- **Task 5's test is thin/fuzzy.** The spy-based distinctness assertion is nominal; the real gate is Task 7's Playwright run plus the Task 6 wiring visibly working in the browser. If the spy proves brittle, prefer rendering `RunWorkspacePage` under its providers (heavy) or drop Task 5 and rely on Task 7 — do not over-invest.
- **Persistence of nav tab (open question).** Default is session-local `useState`. Lifting to `WorkspaceContext` (Task 8) is deferred until Phase 4's AI-driven jump needs to programmatically switch the nav tab — YAGNI now.
