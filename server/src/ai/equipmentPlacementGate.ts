/**
 * Instruments are placed with `equipmentRequirements`, never as an event.
 *
 * Reported failure (2026-09-20): asked to put the lab's Eppendorf ThermoMixer on the
 * deck, the model emitted
 *   { event_type: 'place_tube', details: { labwareId: 'eqp:CL:heater_shaker:…' } }
 * — a TUBE event, whose `labwareId` points at an instrument (an entity with no
 * wells). The intent was plainly "place this instrument on the bench", so this gate
 * converts that (wrong channel) into the right field instead of passing a bogus
 * tube event on to the deck, and says what it did.
 *
 * Anything that is not an equipment reference is left untouched: this only fires on
 * an id that cannot be labware.
 */
import type { AgentEquipmentRequirement } from './types.js';

/** An `eqp:`-minted editor entity id (`eqp:CL:heater_shaker:mu93hr7z:ypzwpx`). */
const MINTED_EQUIPMENT_ID = /^eqp:CL:([a-z0-9_]+):/i;
/** A durable record id: `EQP-` (an instance) or `EQC-` (a class). */
const EQUIPMENT_RECORD_ID = /^EQ[PC]-/i;

interface EventLike {
  eventId?: string;
  event_type?: string;
  verb?: string;
  details?: Record<string, unknown>;
  notes?: string;
}

export interface EquipmentPlacementGateResult<T> {
  events: T[];
  /** The converted placements: the instrument, on the bench, through the right field. */
  equipmentRequirements: AgentEquipmentRequirement[];
  /** User-facing explanations for every conversion. */
  notes: string[];
}

/**
 * The labware reference an event carries, if any: `details.labwareId` is where the
 * tube/transfer events put it, and `details.target.labwareId` is the other spelling
 * seen in drafts.
 */
function labwareRef(event: EventLike): string | undefined {
  const details = event.details ?? {};
  const direct = details.labwareId;
  if (typeof direct === 'string' && direct.length > 0) return direct;
  const target = details.target;
  if (target && typeof target === 'object') {
    const nested = (target as { labwareId?: unknown }).labwareId;
    if (typeof nested === 'string' && nested.length > 0) return nested;
  }
  return undefined;
}

/** The equipment spelling a requirement should carry for a given id. */
function requirementFor(id: string): AgentEquipmentRequirement {
  if (EQUIPMENT_RECORD_ID.test(id)) {
    // `EQP-` is an instance record; `EQC-` is a class record. Both are placed by id.
    return { recordId: id };
  }
  const minted = MINTED_EQUIPMENT_ID.exec(id);
  if (minted?.[1]) {
    // A minted editor entity: place its generic kind, so the deck can resolve it.
    return { classCurie: `equipment:${minted[1]}` };
  }
  return { recordId: id };
}

/**
 * The same rule applied to the placement field itself: a draft that places a
 * GENERIC stand-in (`classCurie` with no record) while the user named a specific
 * record should place the record. Only fires when the draft did not already name
 * that record — a draft that deliberately places two different instruments is left
 * alone.
 */
export function preferNamedEquipment(
  requirements: AgentEquipmentRequirement[],
  options: { namedEquipmentIds?: string[]; namedEquipmentLabels?: Record<string, string> } = {},
): { equipmentRequirements: AgentEquipmentRequirement[]; notes: string[] } {
  const named = (options.namedEquipmentIds ?? []).filter((id) => id.length > 0);
  if (named.length !== 1) return { equipmentRequirements: requirements, notes: [] };
  const target = named[0]!;
  const alreadyNamesIt = requirements.some((requirement) => requirement.recordId === target);
  if (alreadyNamesIt) return { equipmentRequirements: requirements, notes: [] };
  const standInIndex = requirements.findIndex(
    (requirement) => !requirement.recordId && typeof requirement.classCurie === 'string',
  );
  if (standInIndex < 0) return { equipmentRequirements: requirements, notes: [] };

  const standIn = requirements[standInIndex]!;
  const replacement: AgentEquipmentRequirement = { recordId: target };
  const label = options.namedEquipmentLabels?.[target] ?? standIn.handle;
  if (label) replacement.handle = label;
  const next = [...requirements];
  next[standInIndex] = replacement;
  return {
    equipmentRequirements: next,
    notes: [
      `Placed ${label ?? target} — the instrument you named — instead of the generic ${standIn.classCurie} stand-in the draft proposed.`,
    ],
  };
}

export function gateEquipmentPlacementEvents<T extends EventLike>(
  events: T[],
  options: { namedEquipmentIds?: string[]; namedEquipmentLabels?: Record<string, string> } = {},
): EquipmentPlacementGateResult<T> {
  const kept: T[] = [];
  const equipmentRequirements: AgentEquipmentRequirement[] = [];
  const notes: string[] = [];
  const named = (options.namedEquipmentIds ?? []).filter((id) => id.length > 0);
  const seen = new Set<string>();

  for (const event of events) {
    const ref = labwareRef(event);
    if (!ref || (!MINTED_EQUIPMENT_ID.test(ref) && !EQUIPMENT_RECORD_ID.test(ref))) {
      kept.push(event);
      continue;
    }

    // The user may have named the instrument explicitly (an `[[equipment:EQP-…]]`
    // mention). That beats whatever the draft reached for.
    const preferred = named.find((id) => id !== ref);
    const effective = preferred ?? ref;
    const requirement = requirementFor(effective);
    // Carry the user's own wording as the handle, so the bench shows "Eppendorf
    // ThermoMixer C" rather than a generic kind label.
    const label = options.namedEquipmentLabels?.[effective];
    if (label) requirement.handle = label;
    const key = requirement.recordId ?? requirement.classCurie ?? effective;
    if (!seen.has(key)) {
      seen.add(key);
      equipmentRequirements.push(requirement);
    }

    const verb = event.verb ?? event.event_type ?? 'event';
    notes.push(
      `${verb} referenced the instrument ${ref} as if it were labware. `
      + `An instrument has no wells, so it was placed on the bench instead`
      + (preferred ? `, using the instrument you named (${preferred}).` : '.'),
    );
  }

  return { events: kept, equipmentRequirements, notes };
}
