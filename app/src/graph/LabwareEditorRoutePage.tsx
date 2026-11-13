/**
 * L2-SUBPROTOCOL-EXPAND-1 g6leg2b — product-door route for the labware
 * event editor. The six in-app doors navigate to
 * `/labware-editor?id=<graphId>&runId=<runId>` (RecordBrowser /
 * ComponentLibraryPage / LoadTemplateModal); App.tsx previously had no
 * such route, so they fell into the `path="*"` 404 catch-all.
 *
 * This page is the third mount point of LabwareEventEditor (after
 * RunEditorRouter's fall-through arm and main.tsx's fixture arm —
 * g4labmount, 9eade927): it wraps the editor in the SAME
 * LabwareEditorProvider, because the editor calls useLabwareEditor(),
 * which throws outside a provider. The editor reads its ids from the
 * query string (?id=, ?runId=), so the route path carries no params.
 */
import { Suspense, lazy } from 'react'
import { LabwareEditorProvider } from './context/LabwareEditorContext'

const LabwareEventEditor = lazy(
  async () => import('./LabwareEventEditor').then((m) => ({ default: m.LabwareEventEditor })),
)

export function LabwareEditorRoutePage() {
  return (
    <LabwareEditorProvider>
      <Suspense fallback={<div className="labware-editor-route">Loading editor...</div>}>
        <LabwareEventEditor />
      </Suspense>
    </LabwareEditorProvider>
  )
}
