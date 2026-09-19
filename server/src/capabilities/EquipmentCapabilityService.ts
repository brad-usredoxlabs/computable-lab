import type { RecordStore } from '../store/types.js';
import type { RecordEnvelope } from '../types/RecordEnvelope.js';
import type {
  CapabilityResolutionRequest,
  CapabilityResolutionResult,
  EquipmentCapabilityPayload,
  EquipmentClassPayload,
  EquipmentPayload,
  ResolvedEquipmentCapability,
  VerbDefinitionPayload,
} from '../types/capabilityAuthorization.js';

function payloadRecordId(ref?: { id?: string } | null): string | undefined {
  return ref?.id;
}

function asPayload<T>(envelope: RecordEnvelope): T | null {
  return envelope.payload as T;
}

function matchesMethodScope(methodIds: string[] | undefined, requestedMethodId?: string): boolean {
  if (!Array.isArray(methodIds) || methodIds.length === 0) return true;
  if (!requestedMethodId) return false;
  return methodIds.includes(requestedMethodId);
}

/**
 * Every capability item that applies to one piece of equipment, independent of
 * verb. Needed to tell "this equipment genuinely cannot do that verb" (a real
 * rejection) apart from "we have no capability data at all for it" (which must be
 * flagged to the user, never silently allowed or refused).
 */
export interface EquipmentCapabilityEntry {
  capabilityRecordId: string;
  source: 'equipment' | 'equipment-class';
  verbId: string;
  methodIds: string[];
  backendImplementations: string[];
  constraints?: Record<string, unknown>;
  notes?: string;
}

export interface EquipmentCapabilityInventory {
  equipment?: EquipmentPayload;
  equipmentClass?: EquipmentClassPayload;
  entries: EquipmentCapabilityEntry[];
}

export class EquipmentCapabilityService {
  constructor(private readonly store: Pick<RecordStore, 'list'>) {}

  /**
   * Capability inventory for an equipment instance: the instance's own capability
   * records plus those of its class. The class may be an `EQC-` record OR a `CL:`
   * generic-kind CURIE — in both cases the class ref's `id` is the join key, so a
   * generic kind's capabilities resolve exactly like a vendor model's.
   */
  async inventoryEquipmentCapabilities(equipmentId: string): Promise<EquipmentCapabilityInventory> {
    const equipmentEnvelopes = await this.store.list({ kind: 'equipment' });
    const equipment = equipmentEnvelopes
      .map((envelope) => asPayload<EquipmentPayload>(envelope))
      .find((payload) => payload?.id === equipmentId);

    if (!equipment) {
      return { entries: [] };
    }

    const equipmentClassId = payloadRecordId(equipment.equipmentClassRef);

    const [equipmentClassEnvelopes, capabilityEnvelopes] = await Promise.all([
      equipmentClassId ? this.store.list({ kind: 'equipment-class' }) : Promise.resolve([]),
      this.store.list({ kind: 'equipment-capability' }),
    ]);

    const equipmentClass = equipmentClassEnvelopes
      .map((envelope) => asPayload<EquipmentClassPayload>(envelope))
      .find((payload) => payload?.id === equipmentClassId);

    const entries = capabilityEnvelopes
      .map((envelope) => asPayload<EquipmentCapabilityPayload>(envelope))
      .filter((payload): payload is EquipmentCapabilityPayload => payload !== null && payload.status === 'active')
      .flatMap((payload): EquipmentCapabilityEntry[] => {
        const source =
          payload.equipmentRef?.id === equipmentId
            ? 'equipment'
            : payload.equipmentClassRef?.id === equipmentClassId
              ? 'equipment-class'
              : null;

        if (!source) return [];

        return payload.capabilities.map((capability) => ({
          capabilityRecordId: payload.id,
          source,
          verbId: capability.verbRef.id,
          methodIds: capability.methodIds ?? [],
          backendImplementations: capability.backendImplementations ?? [],
          ...(capability.constraints ? { constraints: capability.constraints } : {}),
          ...(capability.notes ? { notes: capability.notes } : {}),
        }));
      })
      .sort((left, right) => {
        if (left.source === right.source) return left.capabilityRecordId.localeCompare(right.capabilityRecordId);
        return left.source === 'equipment' ? -1 : 1;
      });

    return {
      equipment,
      ...(equipmentClass ? { equipmentClass } : {}),
      entries,
    };
  }

  async resolveEquipmentSupport(input: CapabilityResolutionRequest): Promise<CapabilityResolutionResult> {
    const inventory = await this.inventoryEquipmentCapabilities(input.equipmentId);
    const { equipment, equipmentClass } = inventory;

    if (!equipment) {
      return { supported: false, matches: [] };
    }

    const verbEnvelopes = await this.store.list({ kind: 'verb-definition' });
    const verb = verbEnvelopes
      .map((envelope) => asPayload<VerbDefinitionPayload>(envelope))
      .find((payload) => payload?.id === input.verbId);

    const matches = inventory.entries
      .filter((entry) => entry.verbId === input.verbId && matchesMethodScope(entry.methodIds, input.methodId))
      .map((entry): ResolvedEquipmentCapability => ({
        capabilityRecordId: entry.capabilityRecordId,
        source: entry.source,
        verbId: entry.verbId,
        methodIds: entry.methodIds,
        backendImplementations: entry.backendImplementations,
        ...(entry.constraints ? { constraints: entry.constraints } : {}),
        ...(entry.notes ? { notes: entry.notes } : {}),
      }));

    return {
      supported: matches.length > 0,
      equipment,
      ...(equipmentClass ? { equipmentClass } : {}),
      ...(verb ? { verb } : {}),
      matches,
    };
  }
}
