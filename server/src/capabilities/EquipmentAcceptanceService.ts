/**
 * Equipment acceptance — "can this equipment take this item for this verb?"
 *
 * The predicate is DATA-driven (2026-09-19 rulings, D2 rev 2): the equipment's
 * capability record says which verbs it supports and what the seat can take
 * (`constraints.accepts`, matched on PHYSICAL facts — SBS footprint, height class,
 * well count, plate design family, tube size — never a list of labware ids).
 *
 * Three verdicts, and the middle one matters:
 *   - `accepted`  — a capability matched and the item satisfies its seat.
 *   - `rejected`  — the equipment has capability data and this item breaks a
 *                   stated constraint (or the equipment has no capability for the
 *                   verb at all). Reason names the failed fact.
 *   - `unknown`   — there is no capability data to judge with. This is NOT an
 *                   accept: missing data is flagged to the user, never silently
 *                   allowed or degraded.
 *
 * Nothing here is hardcoded per equipment: change the ECP- record and the verdict
 * changes.
 */
import type {
  EquipmentCapabilityService,
} from './EquipmentCapabilityService.js';

/** Physical facts of the thing being placed — resolved from labware data. */
export interface ItemPhysicalFacts {
  /** `tube` matters: a tube-only seat (heat block) rejects labware outright. */
  itemKind: 'labware' | 'tube' | 'other';
  /** `sbs` | `any` | `lengthxwidth` in mm (e.g. `127x85`). */
  footprint?: string;
  heightClass?: 'standard' | 'deepwell' | 'tall';
  wellCounts?: number;
  /** CURIE of the vendor plate design (e.g. `CL:thermo_384_pcr_design`). */
  designFamily?: string;
  /** Size literal for tube seats, e.g. `1.5ml`. */
  tubeSizeClass?: string;
  isFlask?: boolean;
  label?: string;
}

export interface AcceptanceRequest {
  equipmentId: string;
  verbId: string;
  item: ItemPhysicalFacts;
  methodId?: string;
}

export type AcceptanceVerdict = 'accepted' | 'rejected' | 'unknown';

export interface AcceptanceResult {
  verdict: AcceptanceVerdict;
  /** Human-readable, naming the fact that decided it. Never a bare boolean. */
  reason: string;
  seat?: string;
  capabilityRecordId?: string;
}

interface SeatConstraints {
  seat?: string;
  addressing?: string;
  capacity?: number | string;
  accepts?: {
    mode?: 'none' | 'open' | 'by_class';
    footprint?: string;
    height_class?: string[];
    well_counts?: number[];
    tube_size_class?: string;
    flask?: boolean;
    design_family?: string;
  };
  heat?: { from?: string[] };
}

const verbName = (verbId: string): string => verbId.replace(/^VERB-/, '').toLowerCase().replace(/_/g, ' ');

export class EquipmentAcceptanceService {
  constructor(private readonly capabilityService: EquipmentCapabilityService) {}

  async evaluate(request: AcceptanceRequest): Promise<AcceptanceResult> {
    const inventory = await this.capabilityService.inventoryEquipmentCapabilities(request.equipmentId);
    const equipmentLabel = inventory.equipment?.name ?? request.equipmentId;
    const itemLabel = request.item.label ?? request.item.itemKind;
    const verb = verbName(request.verbId);

    if (!inventory.equipment) {
      return {
        verdict: 'unknown',
        reason: `No equipment record ${request.equipmentId} — cannot judge what it takes.`,
      };
    }

    if (inventory.entries.length === 0) {
      return {
        verdict: 'unknown',
        reason:
          `No capability data for ${equipmentLabel}: it is not recorded what it can do or take, `
          + `so "${verb} ${itemLabel}" is flagged for the user rather than assumed.`,
      };
    }

    const forVerb = inventory.entries.filter(
      (entry) => entry.verbId === request.verbId && (entry.methodIds.length === 0 || (request.methodId ? entry.methodIds.includes(request.methodId) : false)),
    );

    if (forVerb.length === 0) {
      const supported = inventory.entries.map((entry) => verbName(entry.verbId)).join(', ');
      return {
        verdict: 'rejected',
        reason: `${equipmentLabel} cannot ${verb} — its recorded capabilities are: ${supported}.`,
      };
    }

    // Judge on the most specific (equipment-level) matching capability.
    for (const entry of forVerb) {
      const constraints = (entry.constraints ?? {}) as SeatConstraints;
      const verdict = this.judge(constraints, request.item);
      if (verdict === null) {
        const mode = constraints.accepts?.mode;
        const seatPhrase = constraints.seat ? ` on its ${constraints.seat} seat` : '';
        return {
          verdict: 'accepted',
          reason:
            `${equipmentLabel} accepts ${itemLabel} for ${verb}${seatPhrase}: `
            + (mode === 'open'
              ? 'the seat is open, so anything that physically fits is accepted.'
              : 'the item matches every physical fact this seat requires.'),
          ...(constraints.seat ? { seat: constraints.seat } : {}),
          capabilityRecordId: entry.capabilityRecordId,
        };
      }
      if (verdict === 'no-acceptance-data') continue;
      return {
        verdict: 'rejected',
        reason: `${equipmentLabel} cannot ${verb} ${itemLabel}: ${verdict}`,
        ...(constraints.seat ? { seat: constraints.seat } : {}),
        capabilityRecordId: entry.capabilityRecordId,
      };
    }

    return {
      verdict: 'unknown',
      reason:
        `${equipmentLabel} records ${verb} but not what it can take, so ${itemLabel} is flagged for `
        + `the user rather than assumed to fit.`,
    };
  }

  /**
   * Returns null when the item satisfies the seat, a reason string when it breaks
   * a stated constraint, and 'no-acceptance-data' when the seat says nothing about
   * what it takes (so another capability may still answer).
   */
  private judge(constraints: SeatConstraints, item: ItemPhysicalFacts): string | null | 'no-acceptance-data' {
    const accepts = constraints.accepts;
    if (!accepts || !accepts.mode) return 'no-acceptance-data';

    if (accepts.mode === 'none') {
      return 'it takes nothing.';
    }
    if (accepts.mode === 'open') {
      return null;
    }

    const failures: string[] = [];
    if (accepts.tube_size_class) {
      // A tube seat takes tubes and nothing else — a plate on a heat block is the
      // classic wrong seat.
      if (item.itemKind !== 'tube') {
        return `its ${constraints.seat ?? 'seat'} takes tubes only (a heat block has fixed tube positions), not ${item.itemKind}.`;
      }
      if (accepts.tube_size_class !== 'any' && item.tubeSizeClass && item.tubeSizeClass !== accepts.tube_size_class) {
        failures.push(`it takes ${accepts.tube_size_class} tubes, not ${item.tubeSizeClass}`);
      }
    }
    if (accepts.footprint && accepts.footprint !== 'any') {
      if (!item.footprint) {
        failures.push(`its acceptance is keyed on a ${accepts.footprint} footprint, which is not recorded for ${item.label ?? item.itemKind}`);
      } else if (item.footprint !== accepts.footprint && item.footprint !== 'any') {
        failures.push(`it takes ${accepts.footprint} items, not ${item.footprint}`);
      }
    }
    if (accepts.height_class && accepts.height_class.length > 0) {
      if (!item.heightClass) {
        failures.push(`its acceptance is keyed on height class (${accepts.height_class.join('/')}), which is not recorded for ${item.label ?? item.itemKind}`);
      } else if (!accepts.height_class.includes(item.heightClass)) {
        failures.push(`it takes ${accepts.height_class.join('/')} height, not ${item.heightClass}`);
      }
    }
    if (accepts.well_counts && accepts.well_counts.length > 0) {
      if (typeof item.wellCounts !== 'number') {
        failures.push(`it takes ${accepts.well_counts.join('/')}-well plates, which is not recorded for ${item.label ?? item.itemKind}`);
      } else if (!accepts.well_counts.includes(item.wellCounts)) {
        failures.push(`it takes ${accepts.well_counts.join('/')}-well plates, not ${item.wellCounts}-well`);
      }
    }
    if (accepts.design_family) {
      if (!item.designFamily) {
        failures.push(`it takes plates of design family ${accepts.design_family}, which is not recorded for ${item.label ?? item.itemKind}`);
      } else if (item.designFamily !== accepts.design_family) {
        failures.push(`it takes design family ${accepts.design_family}, not ${item.designFamily}`);
      }
    }
    if (accepts.flask === true && item.isFlask !== true) {
      failures.push('it takes flasks');
    }
    if (accepts.flask === false && item.isFlask === true) {
      failures.push('it does not take flasks');
    }

    return failures.length === 0 ? null : failures.join('; ') + '.';
  }
}
