import { useParams } from 'react-router-dom'
import { EventEditorProvider } from './EventEditorContext'
import { EventEditorShell } from './EventEditorShell'
import './styles/eventEditor.css'

export function EventEditorPage() {
  const params = useParams<{ runId?: string }>()
  return (
    <EventEditorProvider runId={params.runId}>
      <EventEditorShell />
    </EventEditorProvider>
  )
}

export default EventEditorPage
