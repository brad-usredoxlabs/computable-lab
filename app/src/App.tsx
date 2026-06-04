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
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ErrorBoundary } from './shell/ErrorBoundary'
import { SelectionProvider } from './shared/context/SelectionContext'
import { ThemeProvider } from './shared/shell'
import { useMentionNavigation } from './shared/taptab/slashMenu'
import { Slot } from './extensions'
import './shared/styles/tokens.css'

const BrowserPage = lazy(async () => import('./browser/BrowserPage').then((m) => ({ default: m.BrowserPage })))
const ProtocolsPage = lazy(async () => import('./protocols/ProtocolsPage').then((m) => ({ default: m.ProtocolsPage })))
const LiteraturePage = lazy(async () => import('./literature/LiteraturePage').then((m) => ({ default: m.LiteraturePage })))
const EventEditorPage = lazy(async () => import('./event-editor/EventEditorPage').then((m) => ({ default: m.EventEditorPage })))
const ProjectWorkspacePage = lazy(async () => import('./event-editor/projects/ProjectWorkspacePage').then((m) => ({ default: m.ProjectWorkspacePage })))
const SettingsRoute = lazy(async () => import('./settings/SettingsRoute').then((m) => ({ default: m.SettingsRoute })))

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
              <Route path="/" element={<Navigate to="/browser" replace />} />
              <Route path="/browser" element={<DeferredRoute><BrowserPage /></DeferredRoute>} />
              <Route path="/event-editor" element={<DeferredRoute><EventEditorPage /></DeferredRoute>} />
              <Route path="/event-editor/fixit" element={<DeferredRoute><Slot name="event-editor.fix-it-route" /></DeferredRoute>} />
              <Route path="/event-editor/:eventGraphId" element={<DeferredRoute><EventEditorPage /></DeferredRoute>} />
              <Route path="/runs/:runId/event-editor" element={<DeferredRoute><EventEditorPage /></DeferredRoute>} />
              {/* Phase 3 of the workspace redesign — additive route. Existing
                  /event-editor routes stay live and unmodified; this is the
                  new home for the project (study-as-project) workspace shell
                  with topbar tabs, viewer pane, and right-pane modes. The
                  legacy routes will redirect here in Phase 10's cutover. */}
              <Route path="/project/:studyId" element={<DeferredRoute><ProjectWorkspacePage /></DeferredRoute>} />
              {/* Phase 10: the legacy `/event-editor/:eventGraphId` route
                  redirects here. ProjectWorkspacePage reads the param and
                  auto-opens a deck tab on top of the workspace. */}
              <Route path="/project/:studyId/event-graph/:eventGraphId" element={<DeferredRoute><ProjectWorkspacePage /></DeferredRoute>} />
              <Route path="/protocols" element={<DeferredRoute><ProtocolsPage /></DeferredRoute>} />
              <Route path="/literature" element={<DeferredRoute><LiteraturePage /></DeferredRoute>} />
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
