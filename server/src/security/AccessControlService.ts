export type AccessRole = 'owner' | 'admin' | 'editor' | 'operator' | 'qa' | 'viewer';
export type AccessAction = 'read' | 'write' | 'operate' | 'quality-review' | 'admin';
export type Visibility = 'private' | 'shared' | 'public';
export type AccessPrincipalType = 'user' | 'group' | 'project';

export interface AccessGrant {
  principalType: AccessPrincipalType;
  principalId: string;
  role: AccessRole;
}

export interface AccessPolicyRecord {
  kind: 'access-policy';
  recordId: string;
  visibility: Visibility;
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
  /** Required only when a policy carries a `project` grant. */
  projectPolicies?: ProjectPolicyIndex;
}

/** Read-only view of project (study) policies, used to resolve project grants. */
export interface ProjectPolicyIndex {
  get(projectId: string): AccessPolicyRecord | null;
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

  canAccess({ policy, userId, action, projectPolicies }: CanAccessInput): boolean {
    if (!policy) return true;
    if (action === 'read' && policy.visibility === 'public') return true;
    if (!userId) return false;
    if (policy.ownerUserId === userId) return true;

    for (const grant of policy.grants) {
      if (!ROLE_ACTIONS[grant.role].has(action)) continue;
      if (grant.principalType === 'user' && grant.principalId === userId) return true;
      if (grant.principalType === 'group' && this.groupContainsUser(grant.principalId, userId)) return true;
      if (grant.principalType === 'project') {
        const projectPolicy = projectPolicies?.get(grant.principalId);
        if (projectPolicy && this.principalIsMember(projectPolicy, userId)) return true;
      }
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

  /** Project membership = the project policy's owner, a listed user/group, or a public project. */
  private principalIsMember(projectPolicy: AccessPolicyRecord, userId: string): boolean {
    if (projectPolicy.ownerUserId === userId) return true;
    if (projectPolicy.visibility === 'public') return true;
    return projectPolicy.grants.some((grant) => {
      if (grant.principalType === 'user') return grant.principalId === userId;
      if (grant.principalType === 'group') return this.groupContainsUser(grant.principalId, userId);
      // Project principals deliberately do NOT chain (plan §T6 stop boundary).
      return false;
    });
  }
}
