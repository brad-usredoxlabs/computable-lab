import type { InstrumentKind } from './labware'
import type { FootprintMm } from './labwareFootprint'
import type { Ref } from '../shared/ref'

/**
 * First-class bench equipment: an EQP- equipment record (or one minted from an
 * equipment-class). This is NOT labware — it has no wells, no geometry, no
 * volume. `instrumentKind` drives only the silhouette glyph; capability lives
 * in the linked equipment-class or generic kind (settingsDefinition) and the
 * concrete `settings` on this entity.
 */
export interface Equipment {
  /** Stable editor-scoped id for this placed equipment entity. */
  equipmentId: string
  /** The EQP- record id when placed from a real record; absent for a mint. */
  recordId?: string
  name: string
  /** Drives the bench silhouette (water bath, qPCR, heater-shaker, ...). */
  instrumentKind: InstrumentKind
  /**
   * The equipment-class this instance realizes. Either an `EQC-` equipment-class
   * record, or a CURIE for a generic computable-lab class (`CL:water_bath`,
   * `CL:heat_block`, …) — the generic entries are ontology-style, per the
   * 2026-09-19 ruling. Consumers must treat an id containing `:` as a CURIE.
   */
  equipmentClassRef?: Ref
  /**
   * Concrete configuration for this instance, keyed by the class
   * settingsDefinition — e.g. `{ temperature_c: 55 }` for a water bath.
   * Declarative data, never labware geometry.
   */
  settings?: Record<string, unknown>
  /**
   * Physical bench footprint in mm, stamped from the bound equipment-class's
   * `physical_geometry.overall_dimensions_mm`. Absent until a class declares real
   * dimensions — the deck then falls back to the rendered tile size (see
   * `equipmentFootprintMm`), which is a screen stand-in, not a specification.
   */
  physicalFootprintMm?: FootprintMm
  notes?: string
}