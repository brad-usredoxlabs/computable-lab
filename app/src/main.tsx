import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import './index.css'
import { ExtensionProvider, Slot, loadManifest } from './extensions'

async function bootstrap(): Promise<void> {
  const root = createRoot(document.getElementById('root')!)
  const manifest = await loadManifest()
  const url = new URL(window.location.href)
  const isLabwareFixture = url.searchParams.get('screen') === 'labware-editor' && url.searchParams.has('fixture')

  if (isLabwareFixture) {
    const { LabwareEventEditor } = await import('./graph/LabwareEventEditor')
    const { LabwareEditorProvider } = await import('./graph/context/LabwareEditorContext')
    const { AiPanelProvider } = await import('./shared/context/AiPanelContext')
    const { OpenTabsProvider } = await import('./shared/shell/OpenTabsContext')
    root.render(
      <StrictMode>
        <ExtensionProvider manifest={manifest}>
          <AiPanelProvider>
            {/* g6leg2a (g5 leg2): the fixture arm never mounted
                OpenTabsProvider, so useOpenTabs() (reached via
                useSurfaceChat -> useWorkstateExecutor ->
                useApplySessionDocument) threw and the page blanked.
                Mount it bare — userId is optional and falls back to
                getCurrentUserId() inside OpenTabsProvider. */}
            <OpenTabsProvider>
              <LabwareEditorProvider>
                <BrowserRouter>
                  <Routes>
                    <Route path="*" element={<LabwareEventEditor />} />
                  </Routes>
                </BrowserRouter>
                <Slot name="chat.panel.global" />
              </LabwareEditorProvider>
            </OpenTabsProvider>
          </AiPanelProvider>
        </ExtensionProvider>
      </StrictMode>
    )
    return
  }

  const { App } = await import('./App')
  const { AiPanelProvider } = await import('./shared/context/AiPanelContext')
  const { CurrentUserProvider } = await import('./shared/identity/CurrentUserProvider')
  root.render(
    <StrictMode>
      <ExtensionProvider manifest={manifest}>
        <CurrentUserProvider>
          <AiPanelProvider>
            <App />
          </AiPanelProvider>
        </CurrentUserProvider>
      </ExtensionProvider>
    </StrictMode>
  )
}

void bootstrap()
