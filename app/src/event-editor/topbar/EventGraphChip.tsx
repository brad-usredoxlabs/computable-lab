import { Link } from 'react-router-dom'
import { useEventEditor } from '../EventEditorContext'
import { eventEditorGraphPath, shortEventGraphId } from '../eventGraphRouting'

export function EventGraphChip() {
  const { state } = useEventEditor()
  if (!state.eventGraphId) {
    return (
      <span className="graph-chip" data-state="unsaved" title="This event graph has not been saved yet">
        Unsaved graph
      </span>
    )
  }

  const commitSha = state.eventGraphSave?.sha
  const isNoChanges = commitSha === 'no-changes'
  const statusText = commitSha ? (isNoChanges ? 'No changes' : `Saved ${commitSha.slice(0, 7)}`) : 'Saved'
  const title = [
    `Saved event graph ${state.eventGraphId}`,
    state.eventGraphSave?.message ? `Commit: ${state.eventGraphSave.message}` : null,
    commitSha ? `SHA: ${commitSha}` : null,
  ].filter(Boolean).join(' | ')

  return (
    <Link
      className="graph-chip"
      data-state="saved"
      to={eventEditorGraphPath(state.eventGraphId, state.runId)}
      title={title}
    >
      <span>Graph {shortEventGraphId(state.eventGraphId)}</span>
      <span className="graph-chip__status">{statusText}</span>
    </Link>
  )
}
