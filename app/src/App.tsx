/**
 * App.tsx — root router.
 *
 * Phase 7 retired every legacy route. The appliance now has four endpoint
 * routes plus supporting routes:
 *   - `/browser`     (Phase 3) — schema-driven record browser.
 *   - `/event-editor` (proven Phase 0 model) — live deck authoring.
 *   - `/event-editor/:eventGraphId` — resume a saved event graph.
 *   - `/protocols`   (Phase 5) — protocol authoring + foundry + jobs.
 *   - `/literature`  (Phase 6) — intake funnel.
 *   - `/event-editor/fixit` — standalone full-screen Fix-It tab.
 *   - `/settings` — off-nav settings page reached from the brand menu.
 *
 * `/runs/:runId/event-editor` is the same EventEditorPage at a deep-link
 * URL; it isn't a separate endpoint. Settings, Theme, and About are exposed
 * through the brand menu inside AppShell (top-left brand click), not the nav.
 *
 * The mention click handler (`MentionNavigator`) sits inside BrowserRouter
 * so it can call useNavigate; it routes `[[kind:id|label]]` pill clicks
 * to `/browser?id=…&type=…`.
 */

import { Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ErrorBoundary } from './shell/ErrorBoundary'
import { SelectionProvider } from './shared/context/SelectionContext'
import { ThemeProvider } from './shared/shell'
import { useMentionNavigation } from './shared/taptab/slashMenu'
import { Slot } from './extensions'
import './shared/styles/tokens.css'

const EventEditorPage = lazy(async () => import('./event-editor/EventEditorPage').then((m) => ({ default: m.EventEditorPage })))
const ProjectWorkspacePage = lazy(async () => import('./event-editor/projects/ProjectWorkspacePage').then((m) => ({ default: m.ProjectWorkspacePage })))
const SettingsRoute = lazy(async () => import('./settings/SettingsRoute').then((m) => ({ default: m.SettingsRoute })))
const LegacyModeRedirect = lazy(async () => import('./event-editor/projects/LegacyModeRedirect').then((m) => ({ default: m.LegacyModeRedirect })))
const LiteraturePage = lazy(async () => import('./literature/LiteraturePage').then((m) => ({ default: m.LiteraturePage })))
const WelcomePage = lazy(async () => import('./welcome/WelcomePage').then((m) => ({ default: m.WelcomePage })))
const CreateStudyPage = lazy(async () => import('./welcome/CreateStudyPage').then((m) => ({ default: m.CreateStudyPage })))
const ProtocolBuilderPage = lazy(async () => import('./protocol-builder/ProtocolBuilderPage').then((m) => ({ default: m.ProtocolBuilderPage })))

function DeferredRoute({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<div style={{ padding: '1rem' }}>Loading...</div>}>{children}</Suspense>
}

/** Renders nothing; wires the document-level mention-click handler. Must
 *  live inside BrowserRouter so it can call useNavigate. */
function MentionNavigator(): null {
  useMentionNavigation()
  return null
}

function NotFoundRoute() {
  return (
    <main style={{ padding: '2rem' }} data-testid="not-found-route">
      <h1>404</h1>
      <p>That route is not part of this appliance UI.</p>
    </main>
  )
}

export function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <SelectionProvider>
          <BrowserRouter>
            <MentionNavigator />
            <Routes>
              {/* Phase 12: `/` is the Welcome screen — a deck of recently-
                  opened projects + an "Open all projects" picker. The
                  project workspace lives at `/project/:studyId` and there
                  are no in-workspace modes; navigation within a project is
                  the right-pane Find tab. */}
              <Route path="/" element={<DeferredRoute><WelcomePage /></DeferredRoute>} />
              {/* Creation-entry-points spec §4.1: project creation needs a
                  home before any workspace exists. TapTab-first surface;
                  ?title= carries the picker's unmatched search query. */}
              <Route path="/create/study" element={<DeferredRoute><CreateStudyPage /></DeferredRoute>} />
              <Route path="/project/:studyId" element={<DeferredRoute><ProjectWorkspacePage /></DeferredRoute>} />
              <Route path="/project/:studyId/event-graph/:eventGraphId" element={<DeferredRoute><ProjectWorkspacePage /></DeferredRoute>} />

              {/* Phase 10: legacy /event-editor routes resolve their parent
                  study and redirect into /project/:studyId/event-graph/:id. */}
              <Route path="/event-editor" element={<DeferredRoute><EventEditorPage /></DeferredRoute>} />
              <Route path="/event-editor/fixit" element={<DeferredRoute><Slot name="event-editor.fix-it-route" /></DeferredRoute>} />
              <Route path="/event-editor/:eventGraphId" element={<DeferredRoute><EventEditorPage /></DeferredRoute>} />
              <Route path="/runs/:runId/event-editor" element={<DeferredRoute><EventEditorPage /></DeferredRoute>} />

              {/* Phase 11: legacy global endpoints redirect into the workspace's
                  mode dispatcher. Each preserves its query string so deep-links
                  to ?view=foundry / ?type=material / etc. survive. */}
              <Route path="/browser" element={<DeferredRoute><LegacyModeRedirect mode="browser" /></DeferredRoute>} />
              <Route path="/protocols" element={<DeferredRoute><LegacyModeRedirect mode="protocols" /></DeferredRoute>} />
              <Route path="/literature" element={<DeferredRoute><LiteraturePage /></DeferredRoute>} />
              {/* Standalone Protocol Builder page */}
              <Route path="/protocol-builder" element={<DeferredRoute><ProtocolBuilderPage /></DeferredRoute>} />
              {/* /settings is a real page in the new UI: off-nav, reached
                  from the brand menu, but with a URL, deep linking, and
                  browser-back like every other shell page. */}
              <Route path="/settings" element={<DeferredRoute><SettingsRoute /></DeferredRoute>} />
              {/* Phase 7: retired legacy URLs do not redirect. */}
              <Route path="*" element={<NotFoundRoute />} />
            </Routes>
          </BrowserRouter>
        </SelectionProvider>
      </ThemeProvider>
    </ErrorBoundary>
  )
}
