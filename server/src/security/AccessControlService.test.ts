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
});
