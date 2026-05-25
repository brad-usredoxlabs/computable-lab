import { useEventEditor } from '../EventEditorContext'
import { getPlateRailDraft, type ProtocolDraft } from './state'

interface Props {
  placementId: string
}

export function ProtocolRailSection({ placementId }: Props) {
  const { state, actions } = useEventEditor()
  const draft = getPlateRailDraft(state.plateRail, placementId).protocol

  const patch = (next: Partial<ProtocolDraft>) =>
    actions.updatePlateRail(placementId, { protocol: next })

  return (
    <section className="plate-rail__section" data-section="notes">
      <h3 className="plate-rail__section-title">Notes</h3>
      <label className="plate-rail__field">
        <span className="plate-rail__field-label">Experiment name</span>
        <input
          type="text"
          className="plate-rail__input"
          value={draft.title}
          onChange={(e) => patch({ title: e.target.value })}
        />
      </label>
      <label className="plate-rail__field">
        <span className="plate-rail__field-label">Why this plate is being run</span>
        <textarea
          className="plate-rail__textarea"
          rows={4}
          value={draft.summary}
          onChange={(e) => patch({ summary: e.target.value })}
        />
      </label>
    </section>
  )
}
