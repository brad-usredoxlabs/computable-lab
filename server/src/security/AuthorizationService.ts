import type { RecordEnvelope } from '../types/RecordEnvelope.js';
import type { RecordStore } from '../store/types.js';
import {
  AccessControlService,
  type AccessAction,
  type AccessPolicyRecord,
  type GroupRecord,
} from './AccessControlService.js';

export const ACCESS_POLICY_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/access-policy.schema.yaml';

export const POLICY_ROOT_KINDS = new Set(['study', 'experiment', 'run', 'planned-run']);

function payloadOf(envelope: RecordEnvelope | null | undefined): Record<string, unknown> {
  return (envelope?.payload && typeof envelope.payload === 'object')
    ? envelope.payload as Record<string, unknown>
    : {};
}

function kindOf(envelope: RecordEnvelope | null | undefined): string | undefined {
  const payload = payloadOf(envelope);
  return typeof payload.kind === 'string' ? payload.kind : envelope?.meta?.kind;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function sanitizeRecordIdPart(recordId: string): string {
  return recordId.replace(/[^A-Za-z0-9_-]/g, '-').toUpperCase();
}

function coercePolicy(envelope: RecordEnvelope | null | undefined): AccessPolicyRecord | null {
  const payload = payloadOf(envelope);
  if (payload.kind !== 'access-policy') return null;
  if (typeof payload.recordId !== 'string') return null;
  if (typeof payload.ownerUserId !== 'string') return null;
  if (payload.visibility !== 'private' && payload.visibility !== 'shared' && payload.visibility !== 'public') return null;
  const grants = Array.isArray(payload.grants) ? payload.grants : [];
  return {
    kind: 'access-policy',
    recordId: payload.recordId,
    visibility: payload.visibility,
    ownerUserId: payload.ownerUserId,
    grants: grants.filter((grant): grant is AccessPolicyRecord['grants'][number] => {
      if (!grant || typeof grant !== 'object') return false;
      const g = grant as Record<string, unknown>;
      return (g.principalType === 'user' || g.principalType === 'group')
        && typeof g.principalId === 'string'
        && ['owner', 'admin', 'editor', 'operator', 'qa', 'viewer'].includes(String(g.role));
    }),
  };
}

function coerceGroup(envelope: RecordEnvelope): GroupRecord | null {
  const payload = payloadOf(envelope);
  if (payload.kind !== 'group') return null;
  if (typeof payload.recordId !== 'string') return null;
  return {
    kind: 'group',
    recordId: payload.recordId,
    memberUserIds: Array.isArray(payload.memberUserIds) ? payload.memberUserIds.filter((id): id is string => typeof id === 'string') : [],
    memberGroupIds: Array.isArray(payload.memberGroupIds) ? payload.memberGroupIds.filter((id): id is string => typeof id === 'string') : [],
  };
}

function getResourceRefId(policyEnvelope: RecordEnvelope): string | undefined {
  const payload = payloadOf(policyEnvelope);
  const resourceRef = payload.resourceRef;
  if (!resourceRef || typeof resourceRef !== 'object') return undefined;
  return asString((resourceRef as Record<string, unknown>).id);
}

function parentIds(envelope: RecordEnvelope): string[] {
  const payload = payloadOf(envelope);
  const links = payload.links && typeof payload.links === 'object'
    ? payload.links as Record<string, unknown>
    : {};
  const candidates = [
    payload.runId,
    links.runId,
    payload.plannedRunId,
    links.plannedRunId,
    payload.experimentId,
    links.experimentId,
    payload.studyId,
    links.studyId,
  ];
  return [...new Set(candidates.map(asString).filter((id): id is string => Boolean(id) && id !== envelope.recordId))];
}

export class AuthorizationService {
  constructor(private readonly store: RecordStore) {}

  async canAccess(userId: string | null | undefined, action: AccessAction, record: RecordEnvelope): Promise<boolean> {
    const effectivePolicy = await this.resolveEffectivePolicy(record);
    const groups = await this.loadGroups();
    return new AccessControlService(groups).canAccess({ policy: effectivePolicy, userId, action });
  }

  async ensureOwnerPolicy(resource: RecordEnvelope, ownerUserId: string): Promise<RecordEnvelope | null> {
    const resourceKind = kindOf(resource);
    if (!resourceKind || !POLICY_ROOT_KINDS.has(resourceKind)) return null;
    const existing = await this.findPolicyForRecord(resource.recordId);
    if (existing) return existing;

    const now = new Date().toISOString();
    const policyRecordId = `ACL-${sanitizeRecordIdPart(resource.recordId)}`;
    const payload = {
      kind: 'access-policy',
      recordId: policyRecordId,
      resourceRef: {
        kind: 'record',
        id: resource.recordId,
        type: resourceKind,
        label: asString(payloadOf(resource).title) ?? asString(payloadOf(resource).name) ?? resource.recordId,
      },
      visibility: 'private',
      ownerUserId,
      grants: [],
      createdAt: now,
      updatedAt: now,
    };
    const envelope: RecordEnvelope = {
      recordId: policyRecordId,
      schemaId: ACCESS_POLICY_SCHEMA_ID,
      payload,
      meta: {
        createdAt: now,
        updatedAt: now,
        createdBy: ownerUserId,
      },
    };

    const result = await this.store.create({
      envelope,
      message: `Create access policy for ${resource.recordId}`,
      skipLint: true,
    });
    if (!result.success) {
      console.warn(`Failed to create access policy for ${resource.recordId}: ${result.error ?? 'unknown error'}`);
      return null;
    }
    return result.envelope ?? envelope;
  }

  async resolveEffectivePolicy(record: RecordEnvelope, visited = new Set<string>()): Promise<AccessPolicyRecord | null> {
    if (visited.has(record.recordId)) return null;
    visited.add(record.recordId);

    if (kindOf(record) === 'access-policy') {
      return coercePolicy(record);
    }

    const direct = await this.findPolicyForRecord(record.recordId);
    const directPolicy = coercePolicy(direct);
    if (directPolicy) return directPolicy;

    for (const parentId of parentIds(record)) {
      const parent = await this.store.get(parentId);
      if (!parent) continue;
      const inherited = await this.resolveEffectivePolicy(parent, visited);
      if (inherited) return inherited;
    }

    return null;
  }

  async findPolicyForRecord(recordId: string): Promise<RecordEnvelope | null> {
    const policies = await this.store.list({ kind: 'access-policy', limit: 10000 });
    return policies.find((policy) => getResourceRefId(policy) === recordId) ?? null;
  }

  private async loadGroups(): Promise<GroupRecord[]> {
    const groups = await this.store.list({ kind: 'group', limit: 10000 });
    return groups.map(coerceGroup).filter((group): group is GroupRecord => group !== null);
  }
}
