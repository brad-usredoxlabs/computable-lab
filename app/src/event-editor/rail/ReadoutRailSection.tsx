import { useEventEditor } from '../EventEditorContext'
import {
  CELLROX_DEEP_RED_EMISSION_NM,
  CELLROX_DEEP_RED_EXCITATION_NM,
  getPlateRailDraft,
  type ReadoutChannelPreset,
  type ReadoutDraft,
} from './state'

/**
 * Readout section of the rail. Phase 3 captures the channel + instrument
 * intent against the knowledge anchor; Phase 5 builds the actual
 * Gemini `instrument-appliance-job` from this draft.
 *
 * Default preset is CellROX Deep Red (Ex/Em 644/665) since that's the
 * target of the vertical slice.
 */

interface Props {
  placementId: string
}

export function ReadoutRailSection({ placementId }: Props) {
  const { state, actions } = useEventEditor()
  const draft = getPlateRailDraft(state.plateRail, placementId).readout

  const patch = (next: Partial<ReadoutDraft>) =>
    actions.updatePlateRail(placementId, { readout: next })

  const onPresetChange = (preset: ReadoutChannelPreset) => {
    if (preset === 'cellrox-deep-red') {
      patch({
        channelPreset: 'cellrox-deep-red',
        excitationNm: CELLROX_DEEP_RED_EXCITATION_NM,
        emissionNm: CELLROX_DEEP_RED_EMISSION_NM,
      })
    } else {
      patch({ channelPreset: 'custom' })
    }
  }

  const onNumberChange = (
    key: 'excitationNm' | 'emissionNm',
    raw: string,
  ) => {
    const trimmed = raw.trim()
    if (trimmed === '') {
      patch({ [key]: null, channelPreset: 'custom' })
      return
    }
    const parsed = Number(trimmed)
    if (!Number.isFinite(parsed)) return
    patch({ [key]: parsed, channelPreset: 'custom' })
  }

  return (
    <section className="plate-rail__section" data-section="readout">
      <h3 className="plate-rail__section-title">Readout</h3>
      <p className="plate-rail__section-help">
        Bind the knowledge claim to a plate-reader channel. Defaults to
        CellROX Deep Red.
      </p>

      <label className="plate-rail__field">
        <span className="plate-rail__field-label">Channel preset</span>
        <select
          className="plate-rail__input"
          value={draft.channelPreset}
          onChange={(e) => onPresetChange(e.target.value as ReadoutChannelPreset)}
        >
          <option value="cellrox-deep-red">CellROX Deep Red (Ex/Em 644/665)</option>
          <option value="custom">Custom</option>
        </select>
      </label>

      <div className="plate-rail__field-row">
        <label className="plate-rail__field">
          <span className="plate-rail__field-label">Excitation (nm)</span>
          <input
            type="number"
            className="plate-rail__input"
            value={draft.excitationNm ?? ''}
            onChange={(e) => onNumberChange('excitationNm', e.target.value)}
          />
        </label>
        <label className="plate-rail__field">
          <span className="plate-rail__field-label">Emission (nm)</span>
          <input
            type="number"
            className="plate-rail__input"
            value={draft.emissionNm ?? ''}
            onChange={(e) => onNumberChange('emissionNm', e.target.value)}
          />
        </label>
      </div>

      <label className="plate-rail__field">
        <span className="plate-rail__field-label">Instrument</span>
        <input
          type="text"
          className="plate-rail__input"
          placeholder="e.g. Gemini EM"
          value={draft.instrumentLabel}
          onChange={(e) => patch({ instrumentLabel: e.target.value })}
        />
      </label>
    </section>
  )
}
