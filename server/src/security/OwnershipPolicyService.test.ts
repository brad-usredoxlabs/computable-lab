// server/src/security/OwnershipPolicyService.test.ts
import { describe, expect, it } from 'vitest';
import { MemoryRecordStore } from '../test-support/MemoryRecordStore.js';
import type { RecordEnvelope } from '../types/RecordEnvelope.js';
import {
  OWNERSHIP_POLICY_SCHEMA_ID,
  OwnershipPolicyService,
} from './OwnershipPolicyService.js';

function docEnv(): RecordEnvelope {
  return {
    recordId: 'OWN-LAB-DEFAULT',
    schemaId: OWNERSHIP_POLICY_SCHEMA_ID,
    payload: {
      kind: 'ownership-policy',
      recordId: 'OWN-LAB-DEFAULT',
      title: 'Lab policy',
      scope: { type: 'lab', id: 'lab' },
      labOwnerUserId: 'USR-LOCAL-ADMIN',
      fallback: { owner: 'creator', visibility: 'private', filedTo: 'none', editRoles: ['owner'], shareTargets: ['user'] },
      kindRules: [
        { kind: 'local-protocol', owner: 'creator', visibility: 'private', filedTo: 'active-project', editRoles: ['owner', 'editor'], shareTargets: ['project', 'lab'] },
        { kind: 'instrument', owner: 'lab', visibility: 'public', filedTo: 'none', editRoles: ['owner', 'admin'], shareTargets: ['user', 'group', 'lab'], defaultGrants: [{ principalType: 'group', principalId: 'GRP-LAB-ADMINS', role: 'admin' }] },
      ],
    },
  };
}

describe('OwnershipPolicyService', () => {
  it('resolves a kind rule with its origin', async () => {
    const service = new OwnershipPolicyService(new MemoryRecordStore([docEnv()]));
    const rule = await service.ruleFor('instrument');
    expect(rule?.owner).toBe('lab');
    expect(rule?.visibility).toBe('public');
    expect(rule?.origin).toEqual({ policyRecordId: 'OWN-LAB-DEFAULT', source: 'kind' });
  });

  it('falls back for an unlisted kind', async () => {
    const service = new OwnershipPolicyService(new MemoryRecordStore([docEnv()]));
    const rule = await service.ruleFor('claim');
    expect(rule?.visibility).toBe('private');
    expect(rule?.origin.source).toBe('fallback');
  });

  it('resolves create defaults: lab-owned kinds use the lab owner user', async () => {
    const service = new OwnershipPolicyService(new MemoryRecordStore([docEnv()]));
    const defaults = await service.defaultsForCreate({ kind: 'instrument', creatorUserId: 'USR-BRAD' });
    expect(defaults?.ownerUserId).toBe('USR-LOCAL-ADMIN');
    expect(defaults?.visibility).toBe('public');
  });

  it('resolves create defaults: creator-owned kinds file into the active project', async () => {
    const service = new OwnershipPolicyService(new MemoryRecordStore([docEnv()]));
    const defaults = await service.defaultsForCreate({ kind: 'local-protocol', creatorUserId: 'USR-BRAD' });
    expect(defaults?.ownerUserId).toBe('USR-BRAD');
    expect(defaults?.filedTo).toBe('active-project');
  });

  it('returns null when no document is installed (no declared defaults)', async () => {
    const service = new OwnershipPolicyService(new MemoryRecordStore([]));
    expect(await service.ruleFor('protocol')).toBeNull();
    expect(await service.defaultsForCreate({ kind: 'protocol', creatorUserId: 'USR-BRAD' })).toBeNull();
  });

  it('carries the declared default grants (multi-user: the lab admin group)', async () => {
    const service = new OwnershipPolicyService(new MemoryRecordStore([docEnv()]));
    const defaults = await service.defaultsForCreate({ kind: 'instrument', creatorUserId: 'USR-BRAD' });
    expect(defaults?.grants).toEqual([{ principalType: 'group', principalId: 'GRP-LAB-ADMINS', role: 'admin' }]);
  });

  it('evaluates creator-owned defaults PER USER — two authors get two private records', async () => {
    const service = new OwnershipPolicyService(new MemoryRecordStore([docEnv()]));
    const a = await service.defaultsForCreate({ kind: 'local-protocol', creatorUserId: 'USR-A' });
    const b = await service.defaultsForCreate({ kind: 'local-protocol', creatorUserId: 'USR-B' });
    expect(a?.ownerUserId).toBe('USR-A');
    expect(b?.ownerUserId).toBe('USR-B');
    expect(a?.grants).toEqual([]);
    expect(b?.grants).toEqual([]);
  });

  it('reports the allowed share targets for a kind', async () => {
    const service = new OwnershipPolicyService(new MemoryRecordStore([docEnv()]));
    expect(await service.shareTargetsFor('instrument')).toEqual(['user', 'group', 'lab']);
  });
});
