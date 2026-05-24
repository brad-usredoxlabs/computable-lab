import type { WellId } from '../../types/plate'

/**
 * Materials section of the single-plate workflow rail. The actual
 * Add-Material modal is owned by `LabwareFocus` so it can share the
 * already-rendered selection/labware state — this section just decides
 * when to open it and from which wells.
 */

interface Props {
  selectedWells: WellId[]
  onAddMaterial: (wells: WellId[]) => void
}

export function MaterialsRailSection({ selectedWells, onAddMaterial }: Props) {
  const hasSelection = selectedWells.length > 0
  return (
    <section className="plate-rail__section" data-section="materials">
      <h3 className="plate-rail__section-title">Materials</h3>
      <p className="plate-rail__section-help">
        Select wells on the plate, then add a material. Existing
        formulations, prepared instances, vendor reagents, and ontology
        terms are all searchable from the picker.
      </p>
      <button
        type="button"
        className="plate-rail__primary-btn"
        disabled={!hasSelection}
        onClick={() => onAddMaterial(selectedWells)}
      >
        {hasSelection
          ? `Add material to ${selectedWells.length} selected well${selectedWells.length === 1 ? '' : 's'}`
          : 'Select wells to add material'}
      </button>
    </section>
  )
}
