import type { WellId } from '../../types/plate'
import { MaterialsRailSection } from './MaterialsRailSection'
import { KnowledgeRailSection } from './KnowledgeRailSection'
import { ProtocolRailSection } from './ProtocolRailSection'
import { ReadoutRailSection } from './ReadoutRailSection'

/**
 * Right rail for the focused single-plate view. It keeps the common
 * plate setup workflow close to the wells: add materials, assign well
 * groups, capture notes, and choose the reader signal. Draft state lives
 * in `EventEditorContext` keyed by `placementId`.
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
      <ProtocolRailSection placementId={placementId} />
      <ReadoutRailSection placementId={placementId} />
    </aside>
  )
}
