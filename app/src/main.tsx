import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import './index.css'

async function bootstrap(): Promise<void> {
  const root = createRoot(document.getElementById('root')!)
  const url = new URL(window.location.href)
  const isLabwareFixture = url.searchParams.get('screen') === 'labware-editor' && url.searchParams.has('fixture')

  if (isLabwareFixture) {
    const { LabwareEventEditor } = await import('./graph/LabwareEventEditor')
    const { AiPanelProvider } = await import('./shared/context/AiPanelContext')
    const { AiChatPanel } = await import('./shared/ai/AiChatPanel')
    root.render(
      <StrictMode>
        <AiPanelProvider>
          <BrowserRouter>
            <Routes>
              <Route path="*" element={<LabwareEventEditor />} />
            </Routes>
          </BrowserRouter>
          <AiChatPanel />
        </AiPanelProvider>
      </StrictMode>
    )
    return
  }

  const { App } = await import('./App')
  root.render(
    <StrictMode>
      <App />
    </StrictMode>
  )
}

void bootstrap()
