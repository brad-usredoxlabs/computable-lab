/**
 * App.tsx — root router.
 *
 * UI Overhaul Phase 1: adds collection routes (/projects, /runs, /claims,
 * /lab), redirects / to /projects, and redirects the old run workspace URL
 * to /runs/:runId.
 *
 * Active routes:
 *   - `/projects`               — project collection grid (Phase 1 stub)
 *   - `/runs`                   — run collection (Phase 1 stub)
 *   - `/claims`                 — claim collection (Phase 1 stub)
 *   - `/lab` and `/lab/:category` — lab collection (Phase 1 stub)
 *   - `/project/:studyId`        — project workspace (existing, fully implemented)
 *   - `/project/:studyId/event-graph/:eventGraphId` — deep-link to deck
 *   - `/create/study`            — TapTab-first project creation
 *   - `/event-editor/*`          — legacy redirects
 *   - `/literature`              — intake funnel
 *   - `/protocol-builder`       — standalone protocol builder
 *   - `/settings`                — off-nav settings
 *
 * Redirects:
 *   - `/` → `/projects`
 *   - `/project/:studyId/run/:runId` → `/runs/:runId`
 */

import { Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom'
import { ErrorBoundary } from './shell/ErrorBoundary'
import { SelectionProvider } from './shared/context/SelectionContext'
import { ThemeProvider } from './shared/shell'
import { OpenTabsProvider } from './shared/shell/OpenTabsContext'
import { useMentionNavigation } from './shared/taptab/slashMenu'
import { Slot } from './extensions'
import { useRecordHistory } from './shared/shell/useRecordHistory'
import './shared/styles/tokens.css'

const EventEditorPage = lazy(async () => import('./event-editor/EventEditorPage').then((m) => ({ default: m.EventEditorPage })))
const ProjectWorkspacePage = lazy(async () => import('./event-editor/projects/ProjectWorkspacePage').then((m) => ({ default: m.ProjectWorkspacePage })))
const SettingsRoute = lazy(async () => import('./settings/SettingsRoute').then((m) => ({ default: m.SettingsRoute })))
const LegacyModeRedirect = lazy(async () => import('./event-editor/projects/LegacyModeRedirect').then((m) => ({ default: m.LegacyModeRedirect })))
const LiteraturePage = lazy(async () => import('./literature/LiteraturePage').then((m) => ({ default: m.LiteraturePage })))
const CreateStudyPage = lazy(async () => import('./welcome/CreateStudyPage').then((m) => ({ default: m.CreateStudyPage })))
const ProtocolBuilderPage = lazy(async () => import('./protocol-builder/ProtocolBuilderPage').then((m) => ({ default: m.ProtocolBuilderPage })))
const RunWorkspacePage = lazy(async () => import('./run/RunWorkspacePage').then((m) => ({ default: m.RunWorkspacePage })))
// Phase 1: collection view stubs
const ProjectCollectionView = lazy(async () => import('./collections/ProjectCollectionView').then((m) => ({ default: m.ProjectCollectionView })))
const RunCollectionView = lazy(async () => import('./collections/RunCollectionView').then((m) => ({ default: m.RunCollectionView })))
const ClaimCollectionView = lazy(async () => import('./collections/ClaimCollectionView').then((m) => ({ default: m.ClaimCollectionView })))
const LabCollectionView = lazy(async () => import('./collections/LabCollectionView').then((m) => ({ default: m.LabCollectionView })))
// Phase 7: Claim workspace
const ClaimWorkspace = lazy(async () => import('./claims/ClaimWorkspace').then((m) => ({ default: m.ClaimWorkspace })))
// Phase 8: Lab entity workspace
const LabEntityWorkspace = lazy(async () => import('./lab/LabEntityWorkspace').then((m) => ({ default: m.LabEntityWorkspace })))
const IngestionPage = lazy(async () => import('./ingestion/IngestionPage').then((m) => ({ default: m.IngestionPage })))
const SplashRoute = lazy(async () => import('./shared/shell/SplashRoute').then((m) => ({ default: m.SplashRoute })))
const HomeRedirect = lazy(async () => import('./shared/shell/HomeRedirect').then((m) => ({ default: m.HomeRedirect })))
// Phase 2a: standalone artifact viewer routes
const ArtifactHostPage = lazy(async () => import('./shared/shell/ArtifactHostPage').then((m) => ({ default: m.ArtifactHostPage })))
const RecordHostPage = lazy(async () => import('./shared/shell/RecordHostPage').then((m) => ({ default: m.RecordHostPage })))

function DeferredRoute({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<div style={{ padding: '1rem' }}>Loading...</div>}>{children}</Suspense>
}

/** Renders nothing; wires the document-level mention-click handler. Must
 *  live inside BrowserRouter so it can call useNavigate. */
function MentionNavigator(): null {
  useMentionNavigation()
  return null
}

/** Records entity views to the recent store on route change. */
function RecordHistoryListener(): null {
  useRecordHistory()
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

/** Redirect /project/:studyId/run/:runId → /runs/:runId.
 *  Navigate doesn't interpolate route params, so we read them with useParams. */
function RunWorkspaceRedirect() {
  const { runId } = useParams<{ runId: string }>()
  return <Navigate to={runId ? `/runs/${runId}` : '/runs'} replace />
}

export function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <SelectionProvider>
          <OpenTabsProvider>
            <BrowserRouter>
              <MentionNavigator />
              <RecordHistoryListener />
              <Routes>
              {/* Phase 1: `/` redirects to `/projects` (WelcomePage subsumed
                  by the ProjectCollectionView). */}
              <Route path="/" element={<DeferredRoute><HomeRedirect /></DeferredRoute>} />

              {/* Phase 1: collection views */}
              <Route path="/projects" element={<DeferredRoute><ProjectCollectionView /></DeferredRoute>} />
              <Route path="/runs" element={<DeferredRoute><RunCollectionView /></DeferredRoute>} />
              <Route path="/claims" element={<DeferredRoute><ClaimCollectionView /></DeferredRoute>} />
              <Route path="/claims/:claimId" element={<DeferredRoute><ClaimWorkspace /></DeferredRoute>} />
              <Route path="/lab" element={<DeferredRoute><LabCollectionView /></DeferredRoute>} />
              <Route path="/lab/:category" element={<DeferredRoute><LabCollectionView /></DeferredRoute>} />
              <Route path="/lab/:category/:entityId" element={<DeferredRoute><LabEntityWorkspace /></DeferredRoute>} />
              <Route path="/ingestion" element={<DeferredRoute><IngestionPage /></DeferredRoute>} />
              <Route path="/ingestion/:tab" element={<DeferredRoute><IngestionPage /></DeferredRoute>} />
              <Route path="/splash" element={<DeferredRoute><SplashRoute /></DeferredRoute>} />

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

              {/* Phase 1: Run workspace moved from /project/:studyId/run/:runId
                  to /runs/:runId. Old route redirects for one release cycle. */}
              <Route path="/project/:studyId/run/:runId" element={<RunWorkspaceRedirect />} />
              <Route path="/runs/:runId" element={<DeferredRoute><RunWorkspacePage /></DeferredRoute>} />

              {/* Phase 2a: standalone artifact routes (PDF + document) */}
              <Route path="/artifact/:kind/:artifactId" element={<DeferredRoute><ArtifactHostPage /></DeferredRoute>} />

              {/* Phase 2b: record editors as their own top-level tabs */}
              <Route path="/record/:recordId" element={<DeferredRoute><RecordHostPage /></DeferredRoute>} />
              <Route path="/record/new/:nodeType/:parentId?" element={<DeferredRoute><RecordHostPage /></DeferredRoute>} />

              {/* /settings is a real page in the new UI: off-nav, reached
                  from the brand menu, but with a URL, deep linking, and
                  browser-back like every other shell page. */}
              <Route path="/settings" element={<DeferredRoute><SettingsRoute /></DeferredRoute>} />
              {/* Phase 7: retired legacy URLs do not redirect. */}
              <Route path="*" element={<NotFoundRoute />} />
              </Routes>
            </BrowserRouter>
          </OpenTabsProvider>
        </SelectionProvider>
      </ThemeProvider>
    </ErrorBoundary>
  )
}