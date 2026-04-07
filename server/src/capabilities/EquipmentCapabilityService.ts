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

export class EquipmentCapabilityService {
  constructor(private readonly store: Pick<RecordStore, 'list'>) {}

  async resolveEquipmentSupport(input: CapabilityResolutionRequest): Promise<CapabilityResolutionResult> {
    const equipmentEnvelopes = await this.store.list({ kind: 'equipment' });
    const equipment = equipmentEnvelopes
      .map((envelope) => asPayload<EquipmentPayload>(envelope))
      .find((payload) => payload?.id === input.equipmentId);

    if (!equipment) {
      return { supported: false, matches: [] };
    }

    const equipmentClassId = payloadRecordId(equipment.equipmentClassRef);

    const [equipmentClassEnvelopes, capabilityEnvelopes, verbEnvelopes] = await Promise.all([
      equipmentClassId ? this.store.list({ kind: 'equipment-class' }) : Promise.resolve([]),
      this.store.list({ kind: 'equipment-capability' }),
      this.store.list({ kind: 'verb-definition' }),
    ]);

    const equipmentClass = equipmentClassEnvelopes
      .map((envelope) => asPayload<EquipmentClassPayload>(envelope))
      .find((payload) => payload?.id === equipmentClassId);

    const verb = verbEnvelopes
      .map((envelope) => asPayload<VerbDefinitionPayload>(envelope))
      .find((payload) => payload?.id === input.verbId);

    const matches = capabilityEnvelopes
      .map((envelope) => asPayload<EquipmentCapabilityPayload>(envelope))
      .filter((payload): payload is EquipmentCapabilityPayload => payload !== null && payload.status === 'active')
      .flatMap((payload): ResolvedEquipmentCapability[] => {
        const source =
          payload.equipmentRef?.id === input.equipmentId
            ? 'equipment'
            : payload.equipmentClassRef?.id === equipmentClassId
              ? 'equipment-class'
              : null;

        if (!source) return [];

        return payload.capabilities
          .filter((capability) => capability.verbRef.id === input.verbId && matchesMethodScope(capability.methodIds, input.methodId))
          .map((capability) => ({
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
      supported: matches.length > 0,
      equipment,
      ...(equipmentClass ? { equipmentClass } : {}),
      ...(verb ? { verb } : {}),
      matches,
    };
  }
}
