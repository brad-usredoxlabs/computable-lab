import { useEventEditor } from '../EventEditorContext'
import { formatVolume } from '../../graph/lib/eventGraph'

export function TipChip() {
  const { state, actions } = useEventEditor()
  const tip = state.tipState

  if (tip.kind === 'empty') {
    return (
      <span className="tip-chip" data-loaded="false" title="Pipette tip is empty">
        <span className="tip-chip__dot" />
        <span className="tip-chip__label">tip</span>
        <span className="tip-chip__value">empty</span>
      </span>
    )
  }

  return (
    <button
      type="button"
      className="tip-chip"
      data-loaded="true"
      title={`Loaded with ${tip.sourceLabel} from ${tip.sourceLabwareId} ${tip.sourceWells.join(', ')}. Click to drop tip.`}
      onClick={() => actions.clearTip()}
    >
      <span className="tip-chip__dot" />
      <span className="tip-chip__label">tip</span>
      <span className="tip-chip__value">{formatVolume(tip.volume_uL)}</span>
      <span className="tip-chip__source">{tip.sourceLabel}</span>
      <span className="tip-chip__drop">drop ✕</span>
    </button>
  )
}
