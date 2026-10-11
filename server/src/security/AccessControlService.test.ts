import { describe, expect, it } from 'vitest';
import { AccessControlService, type AccessPolicyRecord, type GroupRecord } from './AccessControlService.js';

const policy: AccessPolicyRecord = {
  kind: 'access-policy',
  recordId: 'ACL-DEMO',
  visibility: 'private',
  ownerUserId: 'USR-OWNER',
  grants: [
    { principalType: 'user', principalId: 'USR-VIEWER', role: 'viewer' },
    { principalType: 'group', principalId: 'GRP-EDITORS', role: 'editor' },
  ],
};

const groups: GroupRecord[] = [
  { kind: 'group', recordId: 'GRP-EDITORS', memberUserIds: ['USR-EDITOR'], memberGroupIds: ['GRP-NESTED'] },
  { kind: 'group', recordId: 'GRP-NESTED', memberUserIds: ['USR-NESTED'] },
];

describe('AccessControlService', () => {
  it('allows owners to do every action', () => {
    const acl = new AccessControlService(groups);
    expect(acl.canAccess({ policy, userId: 'USR-OWNER', action: 'admin' })).toBe(true);
    expect(acl.canAccess({ policy, userId: 'USR-OWNER', action: 'write' })).toBe(true);
  });

  it('applies role-scoped user and group grants', () => {
    const acl = new AccessControlService(groups);
    expect(acl.canAccess({ policy, userId: 'USR-VIEWER', action: 'read' })).toBe(true);
    expect(acl.canAccess({ policy, userId: 'USR-VIEWER', action: 'write' })).toBe(false);
    expect(acl.canAccess({ policy, userId: 'USR-EDITOR', action: 'write' })).toBe(true);
    expect(acl.canAccess({ policy, userId: 'USR-NESTED', action: 'write' })).toBe(true);
  });

  it('keeps current single-user behavior when no policy exists', () => {
    const acl = new AccessControlService();
    expect(acl.canAccess({ policy: null, userId: undefined, action: 'write' })).toBe(true);
  });

  // §T6 (plan 2026-10-10_192635, verbatim): project principal contract.
  it('propagates a project grant to EVERY project member, and to nobody else', () => {
    const projectPolicy = {
      kind: 'access-policy' as const,
      recordId: 'ACL-STU-A',
      visibility: 'private' as const,
      ownerUserId: 'USR-OWNER',
      grants: [
        { principalType: 'group' as const, principalId: 'GRP-MITO', role: 'editor' as const },
        { principalType: 'user' as const, principalId: 'USR-MEMBER-2', role: 'editor' as const },
      ],
    };
    const target = {
      kind: 'access-policy' as const,
      recordId: 'ACL-PRT-1',
      visibility: 'private' as const,
      ownerUserId: 'USR-OWNER',
      grants: [{ principalType: 'project' as const, principalId: 'STU-A', role: 'editor' as const }],
    };
    const index = { get: (id: string) => (id === 'STU-A' ? projectPolicy : null) };
    const groups = [
      { kind: 'group' as const, recordId: 'GRP-MITO', memberUserIds: ['USR-MEMBER-1'] },
      { kind: 'group' as const, recordId: 'GRP-NESTED', memberUserIds: ['USR-MEMBER-3'] },
    ];
    const svc = new AccessControlService(groups);

    // Every route into project membership: owner, group member, directly-granted user.
    expect(svc.canAccess({ policy: target, userId: 'USR-OWNER', action: 'write', projectPolicies: index })).toBe(true);
    expect(svc.canAccess({ policy: target, userId: 'USR-MEMBER-1', action: 'write', projectPolicies: index })).toBe(true);
    expect(svc.canAccess({ policy: target, userId: 'USR-MEMBER-2', action: 'write', projectPolicies: index })).toBe(true);
    // Not a member => no access, and an unresolved project id never opens up.
    expect(svc.canAccess({ policy: target, userId: 'USR-STRANGER', action: 'write', projectPolicies: index })).toBe(false);
    expect(svc.canAccess({ policy: target, userId: 'USR-MEMBER-1', action: 'write', projectPolicies: { get: () => null } })).toBe(false);
  });

  // §T6 additive assertions (orchestrator-accepted deviation): only the grant loop
  // can answer these — the owner short-circuit is not involved.
  it('enforces project grants through the grant loop only (role-scoped, nested, non-chaining)', () => {
    const groups = [
      { kind: 'group' as const, recordId: 'GRP-MITO', memberUserIds: ['USR-MEMBER-1'], memberGroupIds: ['GRP-NESTED'] },
      { kind: 'group' as const, recordId: 'GRP-NESTED', memberUserIds: ['USR-MEMBER-3'] },
    ];
    const svc = new AccessControlService(groups);
    const target = {
      kind: 'access-policy' as const,
      recordId: 'ACL-PRT-2',
      visibility: 'private' as const,
      ownerUserId: 'USR-OWNER',
      grants: [{ principalType: 'project' as const, principalId: 'STU-A', role: 'editor' as const }],
    };

    // Editor-role project grant: a member gets the grant role's actions, never admin.
    const privateProject = {
      kind: 'access-policy' as const,
      recordId: 'ACL-STU-A',
      visibility: 'private' as const,
      ownerUserId: 'USR-OWNER',
      grants: [{ principalType: 'group' as const, principalId: 'GRP-MITO', role: 'editor' as const }],
    };
    const index = { get: (id: string) => (id === 'STU-A' ? privateProject : null) };
    expect(svc.canAccess({ policy: target, userId: 'USR-MEMBER-1', action: 'write', projectPolicies: index })).toBe(true);
    expect(svc.canAccess({ policy: target, userId: 'USR-MEMBER-1', action: 'admin', projectPolicies: index })).toBe(false);

    // A user reachable ONLY via nested memberGroupIds on the study policy is a member.
    expect(svc.canAccess({ policy: target, userId: 'USR-MEMBER-3', action: 'write', projectPolicies: index })).toBe(true);

    // A public study admits a stranger as a member — but only for the grant role's actions.
    const publicProject = { ...privateProject, visibility: 'public' as const };
    const publicIndex = { get: (id: string) => (id === 'STU-A' ? publicProject : null) };
    expect(svc.canAccess({ policy: target, userId: 'USR-STRANGER', action: 'write', projectPolicies: publicIndex })).toBe(true);
    expect(svc.canAccess({ policy: target, userId: 'USR-STRANGER', action: 'admin', projectPolicies: publicIndex })).toBe(false);

    // Project principals do NOT chain: membership via a project grant on the study
    // policy (pointing at another study) is not membership (plan §T6 stop boundary).
    const chainedProject = {
      ...privateProject,
      grants: [{ principalType: 'project' as const, principalId: 'STU-B', role: 'editor' as const }],
    };
    const chainedIndex = {
      get: (id: string) => (id === 'STU-A' ? chainedProject : id === 'STU-B' ? privateProject : null),
    };
    expect(svc.canAccess({ policy: target, userId: 'USR-MEMBER-1', action: 'write', projectPolicies: chainedIndex })).toBe(false);
  });
});
