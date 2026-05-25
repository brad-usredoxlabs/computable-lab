import { useMemo } from 'react'
import { useEventEditor } from '../EventEditorContext'
import {
  channelKey,
  channelLabel,
  getPlateRailDraft,
  type ChannelDraft,
  type GroupDraft,
  type ReadoutDraft,
} from './state'

interface Props {
  placementId: string
}

interface ChannelSummary {
  channel: ChannelDraft
  groups: GroupDraft[]
  hasPositiveControl: boolean
  hasNegativeControl: boolean
}

export function ReadoutRailSection({ placementId }: Props) {
  const { state, actions } = useEventEditor()
  const draft = getPlateRailDraft(state.plateRail, placementId)

  const patch = (next: Partial<ReadoutDraft>) =>
    actions.updatePlateRail(placementId, { readout: next })

  const channels = useMemo(() => {
    const byKey = new Map<string, ChannelSummary>()
    for (const group of draft.knowledge.groups) {
      const key = channelKey(group.channel)
      const existing = byKey.get(key)
      if (existing) {
        existing.groups.push(group)
        existing.hasPositiveControl = existing.hasPositiveControl || group.roleType === 'positive_control'
        existing.hasNegativeControl = existing.hasNegativeControl || group.roleType === 'negative_control'
      } else {
        byKey.set(key, {
          channel: group.channel,
          groups: [group],
          hasPositiveControl: group.roleType === 'positive_control',
          hasNegativeControl: group.roleType === 'negative_control',
        })
      }
    }
    return Array.from(byKey.values())
  }, [draft.knowledge.groups])

  return (
    <section className="plate-rail__section" data-section="readout">
      <h3 className="plate-rail__section-title">Read</h3>

      {channels.length === 0 ? (
        <p className="plate-rail__section-help">
          Assign group roles to define the plate-reader channels needed for this plate.
        </p>
      ) : (
        <div className="plate-rail__channel-summary-list">
          {channels.map((summary) => (
            <div key={channelKey(summary.channel)} className="plate-rail__channel-summary">
              <strong>{channelLabel(summary.channel)}</strong>
              <span>{summary.groups.length} group{summary.groups.length === 1 ? '' : 's'}</span>
              <span data-state={summary.hasPositiveControl ? 'present' : 'missing'}>
                {summary.hasPositiveControl ? 'positive control set' : 'missing positive control'}
              </span>
              <span data-state={summary.hasNegativeControl ? 'present' : 'missing'}>
                {summary.hasNegativeControl ? 'negative control set' : 'missing negative control'}
              </span>
            </div>
          ))}
        </div>
      )}

      <label className="plate-rail__field">
        <span className="plate-rail__field-label">Instrument</span>
        <input
          type="text"
          className="plate-rail__input"
          placeholder="e.g. Gemini EM"
          value={draft.readout.instrumentLabel}
          onChange={(e) => patch({ instrumentLabel: e.target.value })}
        />
      </label>
    </section>
  )
}
