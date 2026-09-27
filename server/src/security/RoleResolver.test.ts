import { describe, expect, it, vi } from 'vitest';
import type { RecordEnvelope } from '../store/types.js';
import type { RecordStore } from '../store/types.js';
import { RoleResolver } from './RoleResolver.js';

function envelope(recordId: string, payload: Record<string, unknown>): RecordEnvelope {
  return { recordId, payload } as unknown as RecordEnvelope;
}

function storeWith(grants: Array<{ recordId: string; payload: Record<string, unknown> }>): RecordStore {
  return {
    list: vi.fn().mockResolvedValue(grants.map((g) => envelope(g.recordId, g.payload))),
  } as unknown as RecordStore;
}

describe('RoleResolver', () => {
  const grants = [
    { recordId: 'GRANT-1', payload: { userId: 'USR-A', roles: ['approver'] } },
    {
      recordId: 'GRANT-2',
      payload: { userId: 'USR-A', lifecycleId: 'document-control', roles: ['reviewer'] },
    },
  ];

  it('merges global grants with lifecycle-scoped grants for the matching lifecycle', async () => {
    const resolver = new RoleResolver(storeWith(grants));
    const roles = await resolver.rolesFor('USR-A', 'document-control');
    expect(roles).toContain('approver');
    expect(roles).toContain('reviewer');
  });

  it('excludes lifecycle-scoped grants that do not match the queried lifecycle', async () => {
    const resolver = new RoleResolver(storeWith(grants));
    const roles = await resolver.rolesFor('USR-A', 'lab-vocabulary-control');
    expect(roles).toContain('approver');
    expect(roles).not.toContain('reviewer');
  });

  it('treats unscoped queries as a superset: all grants apply', async () => {
    // Unscoped queries see all grants as a superset: a lifecycle-scoped
    // grant's roles are included when no lifecycleId is queried.
    const resolver = new RoleResolver(storeWith(grants));
    const roles = await resolver.rolesFor('USR-A');
    expect(roles).toContain('approver');
    expect(roles).toContain('reviewer');
  });

  it('returns no roles for an unknown user', async () => {
    const resolver = new RoleResolver(storeWith(grants));
    expect(await resolver.rolesFor('USR-Z')).toEqual([]);
  });

  it('ignores malformed grant payloads without crashing', async () => {
    const malformed = [
      { recordId: 'GRANT-BAD-1', payload: { userId: 'USR-A', roles: 'not-an-array' } },
      { recordId: 'GRANT-BAD-2', payload: { userId: 42, roles: ['reviewer'] } },
      { recordId: 'GRANT-BAD-3', payload: { userId: 'USR-A', roles: ['reviewer', 7, null] } },
    ];
    const resolver = new RoleResolver(storeWith(malformed));
    const roles = await resolver.rolesFor('USR-A');
    // Non-string roles are dropped; wrong userId type never matches.
    expect(roles).toEqual(['reviewer']);
  });
});
