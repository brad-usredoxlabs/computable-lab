/**
 * Bridge: labware data → the physical facts equipment acceptance matches on.
 *
 * The predicate (`EquipmentAcceptanceService`) deliberately takes FACTS, not
 * labware ids, so this is the one place that reads a vessel and says what it
 * physically is: footprint, height class, well count, plate design family, tube
 * size. Everything comes from data already on the labware or its definition —
 * nothing is inferred from a name or a legacy enum (the old `plate_96` collapse).
 */
import { getLabwareDefinitionRegistry } from '../registry/LabwareDefinitionRegistry.js';
import type { ItemPhysicalFacts } from './EquipmentAcceptanceService.js';

/** Structural slice of an editor labware / labware record payload. */
export interface LabwareLike {
  labwareId?: string;
  id?: string;
  name?: string;
  labwareType?: string;
  definitionId?: string;
  addressing?: {
    type?: string;
    rows?: number;
    columns?: number;
    linear_count?: number;
  };
  /** Stamped at build time from the definition's vendor dimensions. */
  physicalFootprintMm?: { length: number; width: number };
  physical_geometry?: { overall_dimensions_mm?: { length: number; width: number } };
}

/** SBS / ANSI plate outline, in mm. */
const SBS_MM = { length: 127, width: 85 };
const SBS_TOLERANCE_MM = 2;

function resolution(labware: LabwareLike) {
  const stamped = labware.physicalFootprintMm;
  const fromDefinition = labware.definitionId
    ? getLabwareDefinitionRegistry().get(labware.definitionId)
    : undefined;
  const vendor = labware.physical_geometry?.overall_dimensions_mm
    ?? (fromDefinition?.physical_geometry as { overall_dimensions_mm?: { length: number; width: number } } | undefined)
        ?.overall_dimensions_mm;
  return { dims: stamped ?? vendor, definition: fromDefinition };
}

/**
 * Physical facts of a vessel, for acceptance matching. Facts that data does not
 * carry are LEFT ABSENT — the predicate then rejects with "not recorded", which is
 * how a data gap gets surfaced instead of quietly fitting everything.
 */
export function labwarePhysicalFacts(labware: LabwareLike): ItemPhysicalFacts {
  const { dims, definition } = resolution(labware);
  const label = labware.name ?? labware.labwareId ?? labware.id ?? 'labware';
  const addressing = labware.addressing;

  const isTubeLike = /tube/i.test(labware.labwareType ?? '')
    || /tube/i.test(labware.definitionId ?? '');

  const facts: ItemPhysicalFacts = {
    itemKind: isTubeLike ? 'tube' : 'labware',
    label,
  };

  if (dims) {
    const isSbs =
      Math.abs(dims.length - SBS_MM.length) <= SBS_TOLERANCE_MM
      && Math.abs(dims.width - SBS_MM.width) <= SBS_TOLERANCE_MM;
    facts.footprint = isSbs ? 'sbs' : `${dims.length}x${dims.width}`;
  }

  if (addressing?.type === 'grid' && typeof addressing.rows === 'number' && typeof addressing.columns === 'number') {
    facts.wellCounts = addressing.rows * addressing.columns;
  } else if (typeof addressing?.linear_count === 'number') {
    facts.wellCounts = addressing.linear_count;
  }

  if (definition?.height_class) {
    facts.heightClass = definition.height_class;
  }
  if (definition?.design_family) {
    facts.designFamily = definition.design_family;
  }
  if (/flask/i.test(labware.labwareType ?? '')) {
    facts.isFlask = true;
  }
  return facts;
}
