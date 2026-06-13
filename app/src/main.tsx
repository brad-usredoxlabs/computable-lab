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
    const { AiPanelProvider } = await import('./shared/context/AiPanelContext')
    root.render(
      <StrictMode>
        <ExtensionProvider manifest={manifest}>
          <AiPanelProvider>
            <BrowserRouter>
              <Routes>
                <Route path="*" element={<LabwareEventEditor />} />
              </Routes>
            </BrowserRouter>
            <Slot name="chat.panel.global" />
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
