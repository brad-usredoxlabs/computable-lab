import type { WellId } from '../../types/plate'
import { MaterialsRailSection } from './MaterialsRailSection'
import { KnowledgeRailSection } from './KnowledgeRailSection'
import { ReadoutRailSection } from './ReadoutRailSection'

/**
 * Right rail for the focused single-plate view. Composes the Phase 3
 * Materials / Knowledge / Readout sections. The Protocol section is
 * deferred to Phase 4, where it lands alongside the narrative record
 * the TapTab editor will be bound to.
 *
 * Draft state for Knowledge and Readout lives in `EventEditorContext`
 * keyed by `placementId`, so closing/reopening the focus view or
 * changing the well selection does not reset it.
 */

interface Props {
  placementId: string
  selectedWells: WellId[]
  onAddMaterial: (wells: WellId[]) => void
}

export function PlateRail({ placementId, selectedWells, onAddMaterial }: Props) {
  return (
    <aside className="plate-rail" aria-label="Plate workflow">
      <MaterialsRailSection
        selectedWells={selectedWells}
        onAddMaterial={onAddMaterial}
      />
      <KnowledgeRailSection
        placementId={placementId}
        selectedWells={selectedWells}
      />
      <ReadoutRailSection placementId={placementId} />
    </aside>
  )
}
