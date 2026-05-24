import { useEventEditor } from '../EventEditorContext'
import type { WellId } from '../../types/plate'
import {
  getPlateRailDraft,
  type KnowledgeDraft,
  type RoleAssignment,
} from './state'

/**
 * Knowledge section of the rail. Phase 3 captures the user's intent —
 * what they're claiming about the currently selected wells — as draft
 * state. Phase 4 turns this draft into real `context`, `claim`, and
 * `assertion` records via the existing semantics APIs.
 */

interface Props {
  placementId: string
  selectedWells: WellId[]
}

const ROLE_OPTIONS: { value: RoleAssignment; label: string }[] = [
  { value: 'positive-control', label: 'Positive control' },
  { value: 'negative-control', label: 'Negative control' },
  { value: 'experimental', label: 'Experimental' },
  { value: 'untreated', label: 'Untreated' },
]

export function KnowledgeRailSection({ placementId, selectedWells }: Props) {
  const { state, actions } = useEventEditor()
  const draft = getPlateRailDraft(state.plateRail, placementId).knowledge

  const patch = (next: Partial<KnowledgeDraft>) =>
    actions.updatePlateRail(placementId, { knowledge: next })

  const anchoredCount = draft.wells.length
  const canAnchor = selectedWells.length > 0
  const anchorMatchesSelection =
    anchoredCount > 0
    && anchoredCount === selectedWells.length
    && selectedWells.every((w) => draft.wells.includes(w))

  return (
    <section className="plate-rail__section" data-section="knowledge">
      <h3 className="plate-rail__section-title">Knowledge</h3>
      <p className="plate-rail__section-help">
        Describe the claim this group of wells represents. In Phase 4
        this becomes a context + claim + assertion linked to the read.
      </p>

      <label className="plate-rail__field">
        <span className="plate-rail__field-label">Context label</span>
        <input
          type="text"
          className="plate-rail__input"
          placeholder="e.g. ROS positive control"
          value={draft.contextLabel}
          onChange={(e) => patch({ contextLabel: e.target.value })}
        />
      </label>

      <label className="plate-rail__field">
        <span className="plate-rail__field-label">Role</span>
        <select
          className="plate-rail__input"
          value={draft.role ?? ''}
          onChange={(e) =>
            patch({ role: (e.target.value || null) as RoleAssignment | null })
          }
        >
          <option value="">— select —</option>
          {ROLE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>

      <label className="plate-rail__field">
        <span className="plate-rail__field-label">Claim</span>
        <textarea
          className="plate-rail__textarea"
          rows={3}
          placeholder="HepG2 + growth medium + complex I blocker produces ROS"
          value={draft.claimText}
          onChange={(e) => patch({ claimText: e.target.value })}
        />
      </label>

      <div className="plate-rail__anchor-row">
        <span className="plate-rail__anchor-status">
          {anchoredCount === 0
            ? 'No wells anchored yet'
            : `${anchoredCount} well${anchoredCount === 1 ? '' : 's'} anchored`}
        </span>
        <button
          type="button"
          className="plate-rail__secondary-btn"
          disabled={!canAnchor || anchorMatchesSelection}
          onClick={() => patch({ wells: [...selectedWells] })}
        >
          {anchorMatchesSelection ? 'Anchored to selection' : 'Anchor to selection'}
        </button>
      </div>
    </section>
  )
}
