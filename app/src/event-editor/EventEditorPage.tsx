import { useParams } from 'react-router-dom'
import { EventEditorProvider } from './EventEditorContext'
import { EventEditorShell } from './EventEditorShell'
import { ThemeProvider } from './lib/useTheme'
import './styles/eventEditor.css'

export function EventEditorPage() {
  const params = useParams<{ runId?: string }>()
  return (
    <ThemeProvider>
      <EventEditorProvider runId={params.runId}>
        <EventEditorShell />
      </EventEditorProvider>
    </ThemeProvider>
  )
}

export default EventEditorPage
