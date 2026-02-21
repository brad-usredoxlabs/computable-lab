import type { AppContext } from '../server.js';
import type { RecordEnvelope } from '../types/RecordEnvelope.js';

const PROTOCOL_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/protocol.schema.yaml';

type Ref = {
  kind: 'record' | 'ontology';
  id: string;
  type?: string;
  namespace?: string;
  label?: string;
  uri?: string;
};

type EventGraphEvent = {
  eventId?: unknown;
  event_type?: unknown;
  t_offset?: unknown;
  details?: unknown;
  notes?: unknown;
};

type EventGraphLabware = {
  labwareId?: unknown;
  labwareType?: unknown;
};

type EventGraphPayload = {
  id?: unknown;
  name?: unknown;
  description?: unknown;
  tags?: unknown;
  events?: unknown;
  labwares?: unknown;
};

type ProtocolRoleSet = {
  labwareRoles: Array<{ roleId: string; description?: string; expectedLabwareKinds?: string[] }>;
  materialRoles: Array<{ roleId: string; description?: string; allowedMaterialIds?: string[] }>;
  instrumentRoles: Array<{ roleId: string; description?: string; allowedInstrumentIds?: string[] }>;
};

function parseSuffixNumber(id: string, prefix: string): number | null {
  if (!id.startsWith(`${prefix}-`)) return null;
  const suffix = id.slice(prefix.length + 1);
  if (!/^\d+$/.test(suffix)) return null;
  return Number.parseInt(suffix, 10);
}

function toIdToken(input: string): string {
  const trimmed = input.trim().toLowerCase();
  const normalized = trimmed.replaceAll(/[^a-z0-9]+/g, '_').replaceAll(/^_+|_+$/g, '');
  return normalized.length > 0 ? normalized : 'unknown';
}

function normalizeRef(input: unknown, fallbackType?: string): Ref | null {
  if (typeof input === 'string' && input.trim().length > 0) {
    return {
      kind: 'record',
      id: input.trim(),
      ...(fallbackType ? { type: fallbackType } : {}),
    };
  }
  if (input === null || typeof input !== 'object') return null;
  const obj = input as Record<string, unknown>;
  if (obj['kind'] !== 'record' && obj['kind'] !== 'ontology') return null;
  if (typeof obj['id'] !== 'string' || obj['id'].trim().length === 0) return null;
  const normalized: Ref = {
    kind: obj['kind'],
    id: obj['id'].trim(),
  };
  if (typeof obj['type'] === 'string' && obj['type'].trim().length > 0) normalized.type = obj['type'].trim();
  if (typeof obj['namespace'] === 'string' && obj['namespace'].trim().length > 0) normalized.namespace = obj['namespace'].trim();
  if (typeof obj['label'] === 'string' && obj['label'].trim().length > 0) normalized.label = obj['label'].trim();
  if (typeof obj['uri'] === 'string' && obj['uri'].trim().length > 0) normalized.uri = obj['uri'].trim();
  if (!normalized.type && fallbackType && normalized.kind === 'record') normalized.type = fallbackType;
  return normalized;
}

function asStringArray(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input.filter((v): v is string => typeof v === 'string' && v.trim().length > 0).map((v) => v.trim());
}

function wellSelectorFromList(wells: unknown): { kind: 'all' } | { kind: 'explicit'; wells: string[] } {
  const values = asStringArray(wells);
  if (values.length === 0) return { kind: 'all' };
  return { kind: 'explicit', wells: values };
}

export class ProtocolExtractionError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class ProtocolExtractionService {
  private readonly ctx: AppContext;

  constructor(ctx: AppContext) {
    this.ctx = ctx;
  }

  private async nextProtocolId(): Promise<string> {
    const protocols = await this.ctx.store.list({ kind: 'protocol' });
    let max = 0;
    for (const protocol of protocols) {
      const n = parseSuffixNumber(protocol.recordId, 'PRT');
      if (n !== null && n > max) max = n;
    }
    return `PRT-${String(max + 1).padStart(6, '0')}`;
  }

  private buildLabwareRoles(payload: EventGraphPayload): {
    roleByLabwareId: Map<string, string>;
    roles: ProtocolRoleSet['labwareRoles'];
  } {
    const roleByLabwareId = new Map<string, string>();
    const roles: ProtocolRoleSet['labwareRoles'] = [];
    const seen = new Set<string>();
    const labwares = Array.isArray(payload.labwares) ? (payload.labwares as EventGraphLabware[]) : [];

    for (const labware of labwares) {
      if (typeof labware.labwareId !== 'string' || labware.labwareId.trim().length === 0) continue;
      const labwareId = labware.labwareId.trim();
      const token = toIdToken(labwareId);
      let roleId = `labware_${token}`;
      let i = 2;
      while (seen.has(roleId)) {
        roleId = `labware_${token}_${i}`;
        i += 1;
      }
      seen.add(roleId);
      roleByLabwareId.set(labwareId, roleId);
      const expectedKinds = typeof labware.labwareType === 'string' && labware.labwareType.trim().length > 0
        ? [labware.labwareType.trim()]
        : undefined;
      roles.push({
        roleId,
        description: `Bound from event graph labware ${labwareId}`,
        ...(expectedKinds ? { expectedLabwareKinds: expectedKinds } : {}),
      });
    }
    return { roleByLabwareId, roles };
  }

  async saveFromEventGraph(input: {
    eventGraphId: string;
    title?: string;
    tags?: string[];
  }): Promise<{ recordId: string; envelope: RecordEnvelope }> {
    if (typeof input.eventGraphId !== 'string' || input.eventGraphId.trim().length === 0) {
      throw new ProtocolExtractionError('BAD_REQUEST', 'eventGraphId is required', 400);
    }

    const sourceEnvelope = await this.ctx.store.get(input.eventGraphId.trim());
    if (!sourceEnvelope) {
      throw new ProtocolExtractionError('NOT_FOUND', `Event graph not found: ${input.eventGraphId}`, 404);
    }

    const payload = sourceEnvelope.payload as EventGraphPayload;
    if (!Array.isArray(payload.events)) {
      throw new ProtocolExtractionError('BAD_REQUEST', `Source record ${input.eventGraphId} does not contain an events array`, 400);
    }

    const recordId = await this.nextProtocolId();
    const eventGraphName = typeof payload.name === 'string' && payload.name.trim().length > 0 ? payload.name.trim() : sourceEnvelope.recordId;
    const protocolTitle = typeof input.title === 'string' && input.title.trim().length > 0
      ? input.title.trim()
      : `${eventGraphName} Protocol`;

    const { roleByLabwareId, roles: labwareRoles } = this.buildLabwareRoles(payload);
    const materialRoleById = new Map<string, string>();
    const materialRoles: ProtocolRoleSet['materialRoles'] = [];
    const instrumentRoles: ProtocolRoleSet['instrumentRoles'] = [];

    const ensureLabwareRole = (refInput: unknown): string => {
      const ref = normalizeRef(refInput, 'labware');
      if (!ref) return 'labware_unknown';
      const key = ref.id;
      const existing = roleByLabwareId.get(key);
      if (existing) return existing;
      const roleId = `labware_${toIdToken(key)}`;
      if (!labwareRoles.some((r) => r.roleId === roleId)) {
        labwareRoles.push({
          roleId,
          description: `Inferred labware role for ${key}`,
        });
      }
      roleByLabwareId.set(key, roleId);
      return roleId;
    };

    const ensureMaterialRole = (refInput: unknown): { materialRole: string; materialId?: string } => {
      const ref = normalizeRef(refInput, 'material');
      if (!ref) return { materialRole: 'material_unknown' };
      const key = ref.id;
      const existing = materialRoleById.get(key);
      if (existing) return { materialRole: existing, materialId: key };
      const roleId = `material_${toIdToken(key)}`;
      materialRoleById.set(key, roleId);
      materialRoles.push({
        roleId,
        description: `Inferred material role for ${key}`,
        allowedMaterialIds: [key],
      });
      return { materialRole: roleId, materialId: key };
    };

    const ensurePrimaryInstrumentRole = (): string => {
      const roleId = 'instrument_primary';
      if (!instrumentRoles.some((r) => r.roleId === roleId)) {
        instrumentRoles.push({
          roleId,
          description: 'Primary instrument role inferred from read events',
        });
      }
      return roleId;
    };

    const steps = (payload.events as EventGraphEvent[]).map((event, idx) => {
      const eventType = typeof event.event_type === 'string' ? event.event_type : 'other';
      const details = (event.details && typeof event.details === 'object') ? (event.details as Record<string, unknown>) : {};
      const stepId = typeof event.eventId === 'string' && event.eventId.trim().length > 0
        ? event.eventId.trim()
        : `step_${String(idx + 1).padStart(3, '0')}`;
      const plannedOffset = typeof event.t_offset === 'string' && event.t_offset.trim().length > 0 ? event.t_offset.trim() : undefined;
      const notes = typeof event.notes === 'string' && event.notes.trim().length > 0 ? event.notes.trim() : undefined;

      if (eventType === 'add_material') {
        const targetRole = ensureLabwareRole(details['labwareInstanceId']);
        const material = ensureMaterialRole(details['materialId']);
        return {
          stepId,
          kind: 'add_material',
          target: { labwareRole: targetRole },
          wells: wellSelectorFromList(details['wells']),
          material: {
            materialRole: material.materialRole,
            ...(material.materialId ? { materialId: material.materialId } : {}),
          },
          volume_uL: typeof details['volume_uL'] === 'number' ? details['volume_uL'] : 0.1,
          ...(notes ? { notes } : {}),
          ...(plannedOffset ? { plannedOffset } : {}),
        };
      }
      if (eventType === 'transfer') {
        const source = (details['source'] && typeof details['source'] === 'object') ? details['source'] as Record<string, unknown> : {};
        const target = (details['target'] && typeof details['target'] === 'object') ? details['target'] as Record<string, unknown> : {};
        return {
          stepId,
          kind: 'transfer',
          source: {
            labwareRole: ensureLabwareRole(source['labwareInstanceId']),
            wells: wellSelectorFromList(source['wells']),
          },
          target: {
            labwareRole: ensureLabwareRole(target['labwareInstanceId']),
            wells: wellSelectorFromList(target['wells']),
          },
          volume_uL: typeof details['volume_uL'] === 'number' ? details['volume_uL'] : 0.1,
          ...(notes ? { notes } : {}),
          ...(plannedOffset ? { plannedOffset } : {}),
        };
      }
      if (eventType === 'mix') {
        return {
          stepId,
          kind: 'mix',
          target: { labwareRole: ensureLabwareRole(details['labwareInstanceId']) },
          wells: wellSelectorFromList(details['wells']),
          ...(typeof details['cycles'] === 'number' ? { cycles: details['cycles'] } : {}),
          ...(typeof details['volume_uL'] === 'number' ? { volume_uL: details['volume_uL'] } : {}),
          ...(notes ? { notes } : {}),
          ...(plannedOffset ? { plannedOffset } : {}),
        };
      }
      if (eventType === 'wash') {
        return {
          stepId,
          kind: 'wash',
          target: { labwareRole: ensureLabwareRole(details['labwareInstanceId']) },
          wells: wellSelectorFromList(details['wells']),
          cycles: typeof details['cycles'] === 'number' ? details['cycles'] : 1,
          ...(typeof details['washVolume_uL'] === 'number' ? { washVolume_uL: details['washVolume_uL'] } : {}),
          ...(notes ? { notes } : {}),
          ...(plannedOffset ? { plannedOffset } : {}),
        };
      }
      if (eventType === 'incubate') {
        return {
          stepId,
          kind: 'incubate',
          target: { labwareRole: ensureLabwareRole(details['labwareInstanceId']) },
          duration_min: typeof details['duration_min'] === 'number' ? details['duration_min'] : 0.1,
          ...(Array.isArray(details['wells']) ? { wells: wellSelectorFromList(details['wells']) } : {}),
          ...(typeof details['temperature_C'] === 'number' ? { temperature_C: details['temperature_C'] } : {}),
          ...(notes ? { notes } : {}),
          ...(plannedOffset ? { plannedOffset } : {}),
        };
      }
      if (eventType === 'read') {
        const modality = typeof details['modality'] === 'string' ? details['modality'] : 'other';
        return {
          stepId,
          kind: 'read',
          target: { labwareRole: ensureLabwareRole(details['labwareInstanceId']) },
          modality,
          ...(Array.isArray(details['wells']) ? { wells: wellSelectorFromList(details['wells']) } : {}),
          ...(Array.isArray(details['channels']) ? { channels: asStringArray(details['channels']) } : {}),
          instrumentRole: ensurePrimaryInstrumentRole(),
          ...(notes ? { notes } : {}),
          ...(plannedOffset ? { plannedOffset } : {}),
        };
      }
      if (eventType === 'harvest') {
        const from = (details['from'] && typeof details['from'] === 'object') ? details['from'] as Record<string, unknown> : {};
        return {
          stepId,
          kind: 'harvest',
          source: { labwareRole: ensureLabwareRole(from['labwareInstanceId']) },
          wells: wellSelectorFromList(from['wells']),
          ...(typeof details['volume_uL'] === 'number' ? { volume_uL: details['volume_uL'] } : {}),
          ...(notes ? { notes } : {}),
          ...(plannedOffset ? { plannedOffset } : {}),
        };
      }
      return {
        stepId,
        kind: 'other',
        description: notes ?? `Autogenerated from unsupported event type: ${eventType}`,
        ...(plannedOffset ? { plannedOffset } : {}),
      };
    });

    const sourceTags = asStringArray(payload.tags);
    const inputTags = Array.isArray(input.tags) ? input.tags.filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0).map((tag) => tag.trim()) : [];
    const mergedTags = Array.from(new Set([...sourceTags, ...inputTags, 'autogenerated', 'source:event-graph']));

    const protocolPayload: Record<string, unknown> = {
      kind: 'protocol',
      recordId,
      title: protocolTitle,
      description: typeof payload.description === 'string' && payload.description.trim().length > 0
        ? payload.description.trim()
        : `Autogenerated from event graph ${sourceEnvelope.recordId}`,
      state: 'draft',
      tags: mergedTags,
      steps,
      roles: {
        ...(labwareRoles.length > 0 ? { labwareRoles } : {}),
        ...(materialRoles.length > 0 ? { materialRoles } : {}),
        ...(instrumentRoles.length > 0 ? { instrumentRoles } : {}),
      },
    };

    const envelope: RecordEnvelope = {
      recordId,
      schemaId: PROTOCOL_SCHEMA_ID,
      payload: protocolPayload,
    };

    const createResult = await this.ctx.store.create({
      envelope,
      message: `Create protocol ${recordId} from event graph ${sourceEnvelope.recordId}`,
    });
    if (!createResult.success || !createResult.envelope) {
      if (createResult.validation && !createResult.validation.valid) {
        throw new ProtocolExtractionError('VALIDATION_ERROR', 'Protocol validation failed', 422);
      }
      if (createResult.lint && !createResult.lint.valid) {
        throw new ProtocolExtractionError('LINT_ERROR', 'Protocol lint failed', 422);
      }
      throw new ProtocolExtractionError('CREATE_FAILED', createResult.error ?? 'Failed to create protocol', 400);
    }

    return {
      recordId,
      envelope: createResult.envelope,
    };
  }
}
