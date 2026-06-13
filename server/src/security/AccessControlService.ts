export type AccessRole = 'owner' | 'admin' | 'editor' | 'operator' | 'qa' | 'viewer';
export type AccessAction = 'read' | 'write' | 'operate' | 'quality-review' | 'admin';

export interface AccessGrant {
  principalType: 'user' | 'group';
  principalId: string;
  role: AccessRole;
}

export interface AccessPolicyRecord {
  kind: 'access-policy';
  recordId: string;
  visibility: 'private' | 'shared' | 'public';
  ownerUserId: string;
  grants: AccessGrant[];
}

export interface GroupRecord {
  kind: 'group';
  recordId: string;
  memberUserIds?: string[];
  memberGroupIds?: string[];
}

const ROLE_ACTIONS: Record<AccessRole, Set<AccessAction>> = {
  owner: new Set(['read', 'write', 'operate', 'quality-review', 'admin']),
  admin: new Set(['read', 'write', 'operate', 'quality-review', 'admin']),
  editor: new Set(['read', 'write']),
  operator: new Set(['read', 'operate']),
  qa: new Set(['read', 'quality-review']),
  viewer: new Set(['read']),
};

export interface CanAccessInput {
  policy: AccessPolicyRecord | null | undefined;
  userId: string | null | undefined;
  action: AccessAction;
}

/**
 * Deterministic evaluator for local-first record access policies.
 *
 * It intentionally has no persistence or HTTP coupling; handlers can load the
 * relevant policy/group records and call this service during a later enforcement
 * phase without changing policy semantics.
 */
export class AccessControlService {
  private readonly groupsById: Map<string, GroupRecord>;

  constructor(groups: GroupRecord[] = []) {
    this.groupsById = new Map(groups.map((group) => [group.recordId, group]));
  }

  canAccess({ policy, userId, action }: CanAccessInput): boolean {
    if (!policy) return true;
    if (action === 'read' && policy.visibility === 'public') return true;
    if (!userId) return false;
    if (policy.ownerUserId === userId) return true;

    for (const grant of policy.grants) {
      if (!ROLE_ACTIONS[grant.role].has(action)) continue;
      if (grant.principalType === 'user' && grant.principalId === userId) return true;
      if (grant.principalType === 'group' && this.groupContainsUser(grant.principalId, userId)) return true;
    }

    return false;
  }

  private groupContainsUser(groupId: string, userId: string, visited = new Set<string>()): boolean {
    if (visited.has(groupId)) return false;
    visited.add(groupId);

    const group = this.groupsById.get(groupId);
    if (!group) return false;
    if (group.memberUserIds?.includes(userId)) return true;
    return group.memberGroupIds?.some((childGroupId) => this.groupContainsUser(childGroupId, userId, visited)) ?? false;
  }
}
