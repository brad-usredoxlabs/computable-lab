import type { RecordEnvelope } from '../types/RecordEnvelope.js';
import type { RecordStore } from '../store/types.js';
import {
  AccessControlService,
  type AccessAction,
  type AccessGrant,
  type AccessPolicyRecord,
  type GroupRecord,
  type ProjectPolicyIndex,
  type Visibility,
} from './AccessControlService.js';
import { OwnershipPolicyService } from './OwnershipPolicyService.js';

export const ACCESS_POLICY_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/access-policy.schema.yaml';

/**
 * IB-L1-PERF-1: request-scoped ACL snapshot. Built ONCE per list request
 * (`buildAclSnapshot`) and consumed by every `canAccess` in that request so
 * the visibility hot path never re-scans the access-policy / group collections
 * per record. Lifetime is the REQUEST: the next request rebuilds, so
 * write-visibility is automatic and a stale-ACL class of security defect
 * cannot exist. NO TTL, NO cross-request cache, NO invalidation machinery.
 *
 * The snapshot changes data LOADING only. Every structure is built from the
 * exact same `store.list` passes and coercion the unsnapshotted path performs,
 * in the same order, so every decision is identical (pinned by
 * AclRequestSnapshot.test.ts T4 parity).
 */
export interface AclSnapshot {
  /** Every access-policy envelope from the snapshot's single list pass, in list order. */
  policyEnvelopes: RecordEnvelope[];
  /** resourceRef.id -> FIRST matching policy envelope (matches findPolicyForRecord's `.find` semantics). */
  policyByResource: Map<string, RecordEnvelope>;
  /** Coerced group records from the snapshot's single group list pass. */
  groups: GroupRecord[];
  /** Project (study) policy index, built from the same policy pass (same last-wins loop as loadProjectPolicies). */
  projectPolicies: ProjectPolicyIndex;
}

/**
 * OWN-15 (OQ2 adjudication (c)): the typed, observable refusal emitted at mint
 * when a declared principal (a defaultGrants entry or the stamped owner) does
 * not resolve against the users/groups surfaces. The grant is stripped and the
 * refusal is threaded out of ensureOwnerPolicy through the typed
 * `mintRefusalsOut` channel and surfaced response-level as the top-level
 * `mintRefusals` array of the create/PUT response envelope (OWN-15 FIX-2) —
 * never silently dropped, never a payload field smuggled into the minted ACL.
 */
export interface MintPrincipalRefusal {
  kind: 'unresolvable-principal';
  resourceRecordId: string;
  principalType: 'user' | 'group' | 'project';
  principalId: string;
  reason: string;
}

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
      return (g.principalType === 'user' || g.principalType === 'group' || g.principalType === 'project')
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
  constructor(
    private readonly store: RecordStore,
    private readonly ownershipPolicy?: OwnershipPolicyService,
  ) {}

  async canAccess(userId: string | null | undefined, action: AccessAction, record: RecordEnvelope, snapshot?: AclSnapshot): Promise<boolean> {
    // OWN-15 (OQ3 adjudication) — the ONE declared delegation rule: the owner of
    // the record an access-policy row references satisfies `admin` on that ACL
    // row. Checked here (this service owns store access), never branched per
    // handler; every call site keeps its single canAccess(..., 'admin', ...) call.
    if (await this.referencedRecordOwnerSatisfiesAdmin(userId, action, record, snapshot)) return true;
    const effectivePolicy = await this.resolveEffectivePolicy(record, new Set<string>(), snapshot);
    const groups = snapshot ? snapshot.groups : await this.loadGroups();
    const projectPolicies = snapshot ? snapshot.projectPolicies : await this.loadProjectPolicies();
    return new AccessControlService(groups).canAccess({ policy: effectivePolicy, userId, action, projectPolicies });
  }

  /**
   * IB-L1-PERF-1: build the request-scoped ACL snapshot — ONE pass over the
   * access-policy collection, ONE pass over groups, project index computed
   * from the already-listed policies (no re-list). Call ONCE per list request
   * and thread the result into every canAccess of that request. Lifetime is
   * the request only: nothing is stored on the service, so the next request
   * rebuilds and write-visibility is automatic.
   */
  async buildAclSnapshot(): Promise<AclSnapshot> {
    const policyEnvelopes = await this.store.list({ kind: 'access-policy', limit: 10000 });
    const policyByResource = new Map<string, RecordEnvelope>();
    for (const env of policyEnvelopes) {
      const resourceId = getResourceRefId(env);
      if (resourceId && !policyByResource.has(resourceId)) policyByResource.set(resourceId, env);
    }
    const groups = (await this.store.list({ kind: 'group', limit: 10000 }))
      .map(coerceGroup)
      .filter((group): group is GroupRecord => group !== null);
    // Same last-wins loop as loadProjectPolicies, over the already-listed
    // policies — identical index, zero extra store.list.
    const byResource = new Map<string, AccessPolicyRecord>();
    for (const env of policyEnvelopes) {
      const coerced = coercePolicy(env);
      const resourceId = getResourceRefId(env);
      if (coerced && resourceId) byResource.set(resourceId, coerced);
    }
    return {
      policyEnvelopes,
      policyByResource,
      groups,
      projectPolicies: { get: (projectId: string) => byResource.get(projectId) ?? null },
    };
  }

  /**
   * OWN-15 delegation (narrow rule only): `record` is `kind: access-policy` with
   * a resolvable `resourceRef.id`, and `userId` is the owner of the REFERENCED
   * record — its DECLARED policy-chain owner (resolved WITHOUT the ACL row under
   * test, so a bad ACL never vouches for its own owner). admin-on-ACL is NOT
   * same-as-owning-the-record: this never feeds resolveEffectivePolicy, and a
   * non-owner still falls through to the normal evaluation (and still 403s).
   */
  private async referencedRecordOwnerSatisfiesAdmin(
    userId: string | null | undefined,
    action: AccessAction,
    record: RecordEnvelope,
    snapshot?: AclSnapshot,
  ): Promise<boolean> {
    if (action !== 'admin' || !userId) return false;
    if (kindOf(record) !== 'access-policy') return false;
    const resourceId = getResourceRefId(record);
    if (!resourceId || resourceId === record.recordId) return false;
    const owner = await this.ownerOfReferencedRecord(resourceId, record.recordId, snapshot);
    return owner !== null && owner === userId;
  }

  /**
   * The owner of the record an ACL row references, resolved ONLY through the
   * DECLARED policy chain and WITHOUT the ACL row under test (a bad ACL must
   * never vouch for its own owner — that is the self-lock this rule breaks).
   * Order: another ACL row on the same resource → the parent inheritance chain.
   * `meta.createdBy` is NOT ownership (OWN-15 FIX-1, advreview l1t1720): a
   * creator whose id is not declared as owner by the policy chain must NOT pass
   * `admin` on an ACL row re-pointed at a different owner — honoring createdBy
   * here was a revocation-bypass. Null when no declared owner resolves (never
   * guessed).
   */
  private async ownerOfReferencedRecord(resourceId: string, excludeAclRecordId: string, snapshot?: AclSnapshot): Promise<string | null> {
    const referenced = await this.store.get(resourceId);
    if (!referenced) return null;

    // Snapshot path: same envelopes, same order, same skip/coerce loop — just
    // no per-call store.list. Absent snapshot keeps today's behavior exactly.
    const policies = snapshot ? snapshot.policyEnvelopes : await this.store.list({ kind: 'access-policy', limit: 10000 });
    for (const env of policies) {
      if (env.recordId === excludeAclRecordId) continue;
      if (getResourceRefId(env) !== resourceId) continue;
      const coerced = coercePolicy(env);
      if (coerced) return coerced.ownerUserId;
    }

    for (const parentId of parentIds(referenced)) {
      const parent = await this.store.get(parentId);
      if (!parent) continue;
      const inherited = await this.resolveEffectivePolicy(parent, new Set<string>([excludeAclRecordId]), snapshot);
      if (inherited) return inherited.ownerUserId;
    }

    return null;
  }

  /**
   * Mints the owner policy for `resource`.
   *
   * OWN-15 FIX-2 (advreview l1t1720): `mintRefusalsOut` is the TYPED CHANNEL
   * for honest refusals. When a declared principal (a defaultGrants entry or
   * the stamped owner) does not resolve, the grant is stripped and a
   * MintPrincipalRefusal is pushed into this array AND logged. Callers surface
   * it response-level (the create/PUT response envelope's top-level
   * `mintRefusals` array) — the refusal is never smuggled into the minted
   * record's payload, and the create is never failed (adjudicated semantics:
   * strip + report, record still minted creator-owned).
   */
  async ensureOwnerPolicy(
    resource: RecordEnvelope,
    ownerUserId: string,
    mintRefusalsOut?: MintPrincipalRefusal[],
  ): Promise<RecordEnvelope | null> {
    const resourceKind = kindOf(resource);
    // Stamp an owner policy for EVERY record kind except the identity/admin
    // kinds that are self-referential (users/groups/access-policies manage
    // access rather than being subject to it). This gives every lab item
    // (protocol, material, result, data-reference, claim, ...) a private
    // owner so list/browse filtering is meaningful and sharing is explicit.
    const SELF_MANAGING_KINDS = new Set(['user', 'group', 'access-policy']);
    if (!resourceKind || SELF_MANAGING_KINDS.has(resourceKind)) return null;
    const existing = await this.findPolicyForRecord(resource.recordId);
    if (existing) return existing;

    const now = new Date().toISOString();
    const policyRecordId = `ACL-${sanitizeRecordIdPart(resource.recordId)}`;
    const defaults = this.ownershipPolicy
      ? await this.ownershipPolicy.defaultsForCreate({ kind: resourceKind, creatorUserId: ownerUserId })
      : null;
    const visibility: Visibility = defaults?.visibility ?? 'private';
    // OWN-15 (binding ruling R2): the CREATING user is the stamped owner. No
    // substitution path remains — the document's labOwnerUserId is no longer
    // consumed at create-stamp time (OwnershipPolicyService.defaultsForCreate
    // now returns the creator for every rule, lab kinds included).
    const resolvedOwnerUserId = ownerUserId;
    // OWN-15 (criterion 3 / OQ2 adjudication (c)): declared grants are validated
    // against the users/groups surfaces BEFORE persisting. An unresolvable
    // principal is REFUSED HONESTLY — stripped from the minted ACL with a typed,
    // observable refusal (never a silent inert grant like today's coerceGrant
    // drops / groupContainsUser false). The record is never left ownerless/open.
    const grants: AccessGrant[] = await this.validateDeclaredGrants(resource.recordId, defaults?.grants ?? [], mintRefusalsOut);
    // Owner resolvability: the creator is always stamped (never ownerless), but
    // an owner with no active user record is reported loudly, never silently.
    if (!(await this.userPrincipalResolves(resolvedOwnerUserId))) {
      const refusal: MintPrincipalRefusal = {
        kind: 'unresolvable-principal',
        resourceRecordId: resource.recordId,
        principalType: 'user',
        principalId: resolvedOwnerUserId,
        reason: 'the stamped owner has no active user record on the users surface; the ACL is still minted creator-owned (never ownerless)',
      };
      mintRefusalsOut?.push(refusal);
      console.warn('[acl-mint-refusal]', JSON.stringify(refusal));
    }
    // Fallback when no ownership-policy document is installed mirrors the
    // pre-existing behaviour (creator-private, no grants) so a bare repo never
    // widens access. The document is the authority; see plan D9.
    const payload = {
      kind: 'access-policy',
      recordId: policyRecordId,
      resourceRef: {
        kind: 'record',
        id: resource.recordId,
        type: resourceKind,
        label: asString(payloadOf(resource).title) ?? asString(payloadOf(resource).name) ?? resource.recordId,
      },
      visibility,
      ownerUserId: resolvedOwnerUserId,
      grants,
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

  async resolveEffectivePolicy(record: RecordEnvelope, visited = new Set<string>(), snapshot?: AclSnapshot): Promise<AccessPolicyRecord | null> {
    if (visited.has(record.recordId)) return null;
    visited.add(record.recordId);

    if (kindOf(record) === 'access-policy') {
      return coercePolicy(record);
    }

    const direct = await this.findPolicyForRecord(record.recordId, snapshot);
    const directPolicy = coercePolicy(direct);
    if (directPolicy) return directPolicy;

    for (const parentId of parentIds(record)) {
      const parent = await this.store.get(parentId);
      if (!parent) continue;
      const inherited = await this.resolveEffectivePolicy(parent, visited, snapshot);
      if (inherited) return inherited;
    }

    return null;
  }

  async findPolicyForRecord(recordId: string, snapshot?: AclSnapshot): Promise<RecordEnvelope | null> {
    if (snapshot) return snapshot.policyByResource.get(recordId) ?? null;
    const policies = await this.store.list({ kind: 'access-policy', limit: 10000 });
    return policies.find((policy) => getResourceRefId(policy) === recordId) ?? null;
  }

  /**
   * One-time backfill: stamp an owner policy on every policy-root record that
   * doesn't already resolve one (directly or via a parent). Without this,
   * records created before access policies existed have no ACL and are treated
   * as open to everyone — so a non-owner user could read/write them. Owner is
   * the record's `meta.createdBy` when it's a USR-* id; records without a
   * real USR-* creator are left open (never guessed).
   * Idempotent: re-running creates nothing once everything is covered. Studies
   * are processed before their children so the children inherit (no redundant
   * child ACLs). Returns the number of policies created.
   */
  async backfillOwnerPolicies(_defaultOwnerId: string): Promise<number> {
    let created = 0;
    // Parents before children so a stamped study covers its experiments/runs,
    // then all browseable lab kinds (protocols, materials, data-references,
    // claims, results, etc.) so they are private-to-owner rather than open.
    const BACKFILL_KINDS = [
      'study', 'experiment', 'planned-run', 'run',
      'protocol', 'local-protocol', 'material', 'material-spec', 'material-instance',
      'aliquot', 'data-reference', 'claim', 'assertion', 'evidence', 'measurement',
      'measurement-context', 'well-group', 'artifact', 'analysis-run',
      'analysis-output-artifact', 'event-graph', 'planned-protocol',
    ];
    for (const kind of BACKFILL_KINDS) {
      const records = await this.store.list({ kind, limit: 100000 });
      for (const record of records) {
        if (await this.resolveEffectivePolicy(record)) continue;
        // Only stamp an owner when the record has a real USR-* creator. If it
        // was created by the system (seeds, imports) there is no trustworthy
        // owner to guess — leave it open (no policy) rather than silently
        // locking it to the admin. Backfill must never guess an owner.
        const createdBy = record.meta?.createdBy;
        if (typeof createdBy !== 'string' || !createdBy.startsWith('USR-')) continue;
        if (await this.ensureOwnerPolicy(record, createdBy)) created += 1;
      }
    }
    return created;
  }

  private async loadGroups(): Promise<GroupRecord[]> {
    const groups = await this.store.list({ kind: 'group', limit: 10000 });
    return groups.map(coerceGroup).filter((group): group is GroupRecord => group !== null);
  }

  /**
   * OWN-15 (criterion 3): validate every declared default grant against the
   * identity surfaces the record API itself exposes (users: `kind: user`
   * records with status active — the LocalIdentityService.ts:23-27 predicate;
   * groups: `kind: group` records — the GET /api/groups surface). An
   * unresolvable principal is REFUSED HONESTLY: the grant is stripped and a
   * typed MintPrincipalRefusal is logged. Never a silent inert grant.
   */
  private async validateDeclaredGrants(
    resourceRecordId: string,
    declared: AccessGrant[],
    mintRefusalsOut?: MintPrincipalRefusal[],
  ): Promise<AccessGrant[]> {
    if (declared.length === 0) return declared;
    const kept: AccessGrant[] = [];
    for (const grant of declared) {
      const resolves =
        grant.principalType === 'user' ? await this.userPrincipalResolves(grant.principalId)
        : grant.principalType === 'group' ? await this.groupPrincipalResolves(grant.principalId)
        : await this.projectPrincipalResolves(grant.principalId);
      if (resolves) {
        kept.push(grant);
        continue;
      }
      const refusal: MintPrincipalRefusal = {
        kind: 'unresolvable-principal',
        resourceRecordId,
        principalType: grant.principalType,
        principalId: grant.principalId,
        reason: `declared default grant '${grant.principalType}:${grant.principalId}' does not resolve on the ${grant.principalType} surface — the grant is REFUSED (stripped at mint), not stamped inert`,
      };
      mintRefusalsOut?.push(refusal);
      console.warn('[acl-mint-refusal]', JSON.stringify(refusal));
    }
    return kept;
  }

  /** Users surface: an active `kind: user` record (IdentityHandlers.listUsers / LocalIdentityService predicate). */
  private async userPrincipalResolves(userId: string): Promise<boolean> {
    const users = await this.store.list({ kind: 'user', limit: 10000 });
    return users.some((env) => {
      const payload = payloadOf(env);
      return (env.recordId === userId || payload.recordId === userId)
        && payload.kind === 'user' && payload.status === 'active';
    });
  }

  /** Groups surface: a `kind: group` record (GET /api/groups / loadGroupSummaries). */
  private async groupPrincipalResolves(groupId: string): Promise<boolean> {
    const groups = await this.store.list({ kind: 'group', limit: 10000 });
    return groups.some((env) => {
      const payload = payloadOf(env);
      return (env.recordId === groupId || payload.recordId === groupId) && payload.kind === 'group';
    });
  }

  /** Project surface: a study-scope record carrying its own resolvable policy. */
  private async projectPrincipalResolves(studyId: string): Promise<boolean> {
    const record = await this.store.get(studyId);
    if (!record) return false;
    const kind = kindOf(record);
    return kind === 'study' || kind === 'experiment' || kind === 'run' || kind === 'planned-run';
  }

  /** resourceRef id -> policy, for resolving `project` grants (study records). */
  private async loadProjectPolicies(): Promise<ProjectPolicyIndex> {
    const policies = await this.store.list({ kind: 'access-policy', limit: 10000 });
    const byResource = new Map<string, AccessPolicyRecord>();
    for (const env of policies) {
      const coerced = coercePolicy(env);
      const resourceId = getResourceRefId(env);
      if (coerced && resourceId) byResource.set(resourceId, coerced);
    }
    return { get: (projectId: string) => byResource.get(projectId) ?? null };
  }
}
