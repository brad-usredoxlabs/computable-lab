import { Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Layout } from './shell/Layout'
import { ErrorBoundary } from './shell/ErrorBoundary'
import { SchemaList } from './editor/SchemaList'
import { RecordList } from './editor/RecordList'
import { RecordViewer } from './editor/RecordViewer'
import { RawRecordEditor } from './editor/RawRecordEditor'
import { SettingsPage } from './shell/SettingsPage'
import { IngestionPage } from './ingestion/IngestionPage'
import { ExtractionReviewPage } from './extraction/ExtractionReviewPage'
import { ExtractionDraftsListPage } from './extraction/ExtractionDraftsListPage'

const LabwareEventEditor = lazy(async () => import('./graph/LabwareEventEditor').then((module) => ({ default: module.LabwareEventEditor })))
const RunWorkspacePage = lazy(async () => import('./graph/RunWorkspacePage').then((module) => ({ default: module.RunWorkspacePage })))
const RecordBrowser = lazy(() => import('./knowledge/RecordBrowser'))
const RecordRegistryPage = lazy(() => import('./pages/RecordRegistryPage'))
const LiteratureExplorer = lazy(async () => import('./knowledge/LiteratureExplorer').then((module) => ({ default: module.LiteratureExplorer })))
const ComponentLibraryPage = lazy(async () => import('./knowledge/ComponentLibraryPage').then((module) => ({ default: module.ComponentLibraryPage })))
const FormulationsPage = lazy(async () => import('./editor/FormulationsPage').then((module) => ({ default: module.FormulationsPage })))
const MaterialsPage = lazy(async () => import('./editor/MaterialsPage').then((module) => ({ default: module.MaterialsPage })))
const LabwareTestPage = lazy(async () => import('./pages/LabwareTestPage').then((module) => ({ default: module.default })))
const ProtocolIdePage = lazy(async () => import('./protocol-ide/ProtocolIdePage').then((module) => ({ default: module.ProtocolIdePage })))
const RunEditorRouter = lazy(async () => import('./graph/RunEditorRouter').then((module) => ({ default: module.RunEditorRouter })))

function DeferredRoute({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<div style={{ padding: '1rem' }}>Loading...</div>}>{children}</Suspense>
}

export function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            {/* Redirect root to browser */}
            <Route index element={<Navigate to="/browser" replace />} />
            
            {/* Schema browser */}
            <Route path="schemas" element={<SchemaList />} />
            
            {/* Records for a schema */}
            <Route path="schemas/:schemaId/records" element={<RecordList />} />
            
            {/* Record detail view */}
            <Route path="records/:recordId" element={<RecordViewer />} />
            
            {/* Edit existing record */}
            <Route path="records/:recordId/edit" element={<RawRecordEditor />} />
            
            {/* Create new record (schemaId in query param) */}
            <Route path="new" element={<RawRecordEditor />} />
            
            {/* Multi-Labware Event Editor */}
            <Route path="labware-editor" element={<DeferredRoute><LabwareEventEditor /></DeferredRoute>} />
            <Route path="runs/:runId" element={<DeferredRoute><RunWorkspacePage /></DeferredRoute>} />
            <Route path="runs/:runId/editor" element={<DeferredRoute><RunEditorRouter /></DeferredRoute>} />
            <Route path="runs/:runId/editor/:mode" element={<DeferredRoute><LabwareEventEditor /></DeferredRoute>} />
            
            {/* Settings */}
            <Route path="settings" element={<SettingsPage />} />

            {/* Ingestion */}
            <Route path="ingestion" element={<IngestionPage />} />
            
            {/* Literature & Bio-Source Explorer */}
            <Route path="literature" element={<DeferredRoute><LiteratureExplorer /></DeferredRoute>} />

            {/* Component + Protocol Library */}
            <Route path="component-library" element={<DeferredRoute><ComponentLibraryPage /></DeferredRoute>} />

            {/* Formulations */}
            <Route path="formulations" element={<DeferredRoute><FormulationsPage /></DeferredRoute>} />
            <Route path="materials" element={<DeferredRoute><MaterialsPage /></DeferredRoute>} />

            {/* Record Browser */}
            <Route path="browser" element={<DeferredRoute><RecordBrowser /></DeferredRoute>} />

            {/* Record Registry */}
            <Route path="registry" element={<DeferredRoute><RecordRegistryPage /></DeferredRoute>} />

            {/* Labware Test Page - for testing LabwarePicker */}
            <Route path="labware-test" element={<DeferredRoute><LabwareTestPage /></DeferredRoute>} />

            {/* Extraction Drafts List */}
            <Route path="extraction" element={<ExtractionDraftsListPage />} />
            
            {/* Extraction Review */}
            <Route path="extraction/review/:recordId" element={<ExtractionReviewPage />} />

            {/* Protocol IDE */}
            <Route path="protocol-ide" element={<DeferredRoute><ProtocolIdePage /></DeferredRoute>} />
            <Route path="protocol-ide/:sessionId" element={<DeferredRoute><ProtocolIdePage /></DeferredRoute>} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
