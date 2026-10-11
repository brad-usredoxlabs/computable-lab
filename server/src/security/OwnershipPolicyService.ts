/**
 * OwnershipPolicyService — resolves the lab's declared ownership/sharing
 * defaults for a record kind from `ownership-policy` documents.
 *
 * The document is DATA; this service only reads it. It decides nothing: it
 * resolves declarations and reports each answer's origin so the UI and the AI
 * can explain WHY a record was made private / lab-visible / project-filed.
 */
import type { RecordEnvelope, RecordStore } from '../store/types.js';
import type { AccessGrant, Visibility } from './AccessControlService.js';

export const OWNERSHIP_POLICY_KIND = 'ownership-policy';
export const OWNERSHIP_POLICY_SCHEMA_ID =
  'https://computable-lab.com/schema/computable-lab/ownership-policy.schema.yaml';
export const DEFAULT_OWNERSHIP_POLICY_RECORD_ID = 'OWN-LAB-DEFAULT';

export type OwnershipScope = 'creator' | 'lab';
export type ShareTarget = 'user' | 'group' | 'project' | 'lab';
export type FiledTo = 'none' | 'active-project';

export interface KindRule {
  owner: OwnershipScope;
  visibility: Visibility;
  filedTo: FiledTo;
  editRoles: string[];
  shareTargets: ShareTarget[];
  /**
   * Grants stamped onto the new record's access-policy. The multi-user lever:
   * lab-owned kinds name an admin GROUP here so shared resources are not
   * administered by the single labOwnerUserId. Empty for creator-private kinds
   * (a new draft is granted to nobody — sharing is explicit).
   */
  defaultGrants: AccessGrant[];
  publishRole?: string;
}

export interface ResolvedKindRule extends KindRule {
  origin: { policyRecordId: string; source: 'kind' | 'fallback' };
}

export interface OwnershipPolicyDoc {
  recordId: string;
  scope: { type: 'lab' | 'project'; id: string };
  labOwnerUserId: string;
  fallback: KindRule;
  kindRules: Record<string, KindRule>;
}

export interface CreateDefaults {
  ownerUserId: string;
  visibility: Visibility;
  filedTo: FiledTo;
  /** Grants to stamp on the access-policy at creation (may be empty). */
  grants: AccessGrant[];
  origin: ResolvedKindRule['origin'];
}

const VISIBILITIES: Visibility[] = ['private', 'shared', 'public'];
const SHARE_TARGETS: ShareTarget[] = ['user', 'group', 'project', 'lab'];
const ACL_ROLES: string[] = ['owner', 'admin', 'editor', 'operator', 'qa', 'viewer'];

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** Coerce one declared default grant; anything malformed is dropped, never guessed. */
function coerceGrant(raw: unknown): AccessGrant | null {
  const g = asRecord(raw);
  const principalType = g.principalType;
  if (principalType !== 'user' && principalType !== 'group' && principalType !== 'project') return null;
  const principalId = asString(g.principalId);
  if (!principalId) return null;
  const role = asString(g.role);
  if (!role || !ACL_ROLES.includes(role)) return null;
  // 'project' principal admitted per OWN-6 (handoff from the OWN-5 pinned seam)
  return { principalType, principalId, role: role as AccessGrant['role'] };
}

function coerceKindRule(raw: unknown): KindRule | null {
  const r = asRecord(raw);
  const owner = r.owner === 'lab' ? 'lab' : r.owner === 'creator' ? 'creator' : null;
  const visibility = VISIBILITIES.includes(r.visibility as Visibility) ? (r.visibility as Visibility) : null;
  if (!owner || !visibility) return null;
  const filedTo: FiledTo = r.filedTo === 'active-project' ? 'active-project' : 'none';
  const publishRole = asString(r.publishRole);
  return {
    owner,
    visibility,
    filedTo,
    editRoles: asArray(r.editRoles).filter((x): x is string => typeof x === 'string'),
    shareTargets: asArray(r.shareTargets).filter((x): x is ShareTarget => SHARE_TARGETS.includes(x as ShareTarget)),
    defaultGrants: asArray(r.defaultGrants).map(coerceGrant).filter((g): g is AccessGrant => g !== null),
    ...(publishRole !== undefined ? { publishRole } : {}),
  };
}

/** Coerce a stored record into a policy document. Returns null for anything malformed. */
export function coerceOwnershipPolicy(env: RecordEnvelope | null | undefined): OwnershipPolicyDoc | null {
  const payload = asRecord(env?.payload);
  if (payload.kind !== OWNERSHIP_POLICY_KIND) return null;
  const recordId = asString(payload.recordId);
  const labOwnerUserId = asString(payload.labOwnerUserId);
  const fallback = coerceKindRule(payload.fallback);
  if (!recordId || !labOwnerUserId || !fallback) return null;

  const scopeRaw = asRecord(payload.scope);
  const kindRules: Record<string, KindRule> = {};
  for (const entry of asArray(payload.kindRules)) {
    const kind = asString(asRecord(entry).kind);
    const rule = coerceKindRule(entry);
    if (kind && rule) kindRules[kind] = rule;
  }

  return {
    recordId,
    scope: { type: scopeRaw.type === 'project' ? 'project' : 'lab', id: asString(scopeRaw.id) ?? 'lab' },
    labOwnerUserId,
    fallback,
    kindRules,
  };
}

export class OwnershipPolicyService {
  constructor(private readonly store: RecordStore) {}

  /** The active lab-scope document, else the first document, else null. */
  async activeLabPolicy(): Promise<OwnershipPolicyDoc | null> {
    const records = await this.store.list({ kind: OWNERSHIP_POLICY_KIND, limit: 100 });
    const docs = records
      .map(coerceOwnershipPolicy)
      .filter((doc): doc is OwnershipPolicyDoc => doc !== null);
    return docs.find((doc) => doc.scope.type === 'lab') ?? docs[0] ?? null;
  }

  /** The rule that governs `kind`, with the origin of the answer. */
  async ruleFor(kind: string): Promise<ResolvedKindRule | null> {
    const doc = await this.activeLabPolicy();
    if (!doc) return null;
    const rule = doc.kindRules[kind];
    if (rule) return { ...rule, origin: { policyRecordId: doc.recordId, source: 'kind' } };
    return { ...doc.fallback, origin: { policyRecordId: doc.recordId, source: 'fallback' } };
  }

  /** Defaults applied when creating a record of `kind`. Null = nothing declared. */
  async defaultsForCreate(input: { kind: string; creatorUserId: string }): Promise<CreateDefaults | null> {
    const doc = await this.activeLabPolicy();
    const rule = await this.ruleFor(input.kind);
    if (!doc || !rule) return null;
    return {
      ownerUserId: rule.owner === 'lab' ? doc.labOwnerUserId : input.creatorUserId,
      visibility: rule.visibility,
      filedTo: rule.filedTo,
      grants: rule.defaultGrants,
      origin: rule.origin,
    };
  }

  /** Legal share targets for `kind`. Null = nothing declared (UI falls back to all). */
  async shareTargetsFor(kind: string): Promise<ShareTarget[] | null> {
    const rule = await this.ruleFor(kind);
    return rule ? rule.shareTargets : null;
  }
}
