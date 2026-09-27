import type { RecordStore } from '../store/types.js';

export interface RoleGrant {
  userId: string;
  lifecycleId?: string;
  roles: string[];
}

/**
 * Resolves QMS lifecycle roles for a user from role-grant records.
 * A grant with lifecycleId applies only to that lifecycle; without, to all.
 * Unscoped queries (no lifecycleId argument) see all grants as a superset.
 */
export class RoleResolver {
  constructor(private readonly store: RecordStore) {}

  async rolesFor(userId: string, lifecycleId?: string): Promise<string[]> {
    const grants = await this.store.list({ kind: 'role-grant', limit: 10000 });
    const roles = new Set<string>();
    for (const g of grants) {
      const p = (g.payload ?? {}) as Record<string, unknown>;
      if (p.userId !== userId) continue;
      const grantLifecycle = typeof p.lifecycleId === 'string' ? p.lifecycleId : undefined;
      if (grantLifecycle !== undefined && lifecycleId !== undefined && grantLifecycle !== lifecycleId) continue;
      if (Array.isArray(p.roles)) {
        for (const r of p.roles) if (typeof r === 'string') roles.add(r);
      }
    }
    return [...roles];
  }
}
