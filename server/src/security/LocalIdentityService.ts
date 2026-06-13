import type { FastifyRequest } from 'fastify';
import type { RecordEnvelope } from '../types/RecordEnvelope.js';
import type { RecordStore } from '../store/types.js';

export const LOCAL_ADMIN_USER_ID = 'USR-LOCAL-ADMIN';
export const USER_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/user.schema.yaml';

export interface ResolvedRequestUser {
  userId: string | null;
  userRecord?: RecordEnvelope;
  isSystem: boolean;
  reason?: string;
}

function headerString(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function isActiveUser(envelope: RecordEnvelope | null): envelope is RecordEnvelope {
  if (!envelope) return false;
  const payload = envelope.payload as Record<string, unknown>;
  return payload.kind === 'user' && payload.status === 'active';
}

export class LocalIdentityService {
  constructor(private readonly store: RecordStore) {}

  async ensureLocalAdminUser(): Promise<RecordEnvelope | null> {
    const existingUsers = await this.store.list({ kind: 'user', limit: 1000 });
    const activeUser = existingUsers.find((user) => isActiveUser(user));
    if (activeUser) return activeUser;

    const existingAdmin = await this.store.get(LOCAL_ADMIN_USER_ID);
    if (isActiveUser(existingAdmin)) return existingAdmin;

    const now = new Date().toISOString();
    const envelope: RecordEnvelope = {
      recordId: LOCAL_ADMIN_USER_ID,
      schemaId: USER_SCHEMA_ID,
      payload: {
        kind: 'user',
        recordId: LOCAL_ADMIN_USER_ID,
        username: 'local-admin',
        displayName: 'Local Admin',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      },
      meta: {
        createdAt: now,
        updatedAt: now,
        createdBy: 'system',
      },
    };

    const created = await this.store.create({
      envelope,
      message: 'Bootstrap local admin user',
      skipLint: true,
    });
    if (!created.success) {
      console.warn(`Failed to bootstrap local admin user: ${created.error ?? 'unknown error'}`);
      return null;
    }
    return created.envelope ?? envelope;
  }

  async resolveRequestUser(request: FastifyRequest): Promise<ResolvedRequestUser> {
    const explicitUserId =
      headerString(request.headers['x-user-id']) ??
      headerString(request.headers['x-computable-user-id']);

    if (explicitUserId) {
      const record = await this.store.get(explicitUserId);
      if (!isActiveUser(record)) {
        return {
          userId: null,
          isSystem: false,
          reason: `Unknown or inactive user: ${explicitUserId}`,
        };
      }
      return { userId: explicitUserId, userRecord: record, isSystem: false };
    }

    const admin = await this.ensureLocalAdminUser();
    if (!isActiveUser(admin)) {
      return {
        userId: null,
        isSystem: false,
        reason: 'No active local user is available',
      };
    }

    return { userId: LOCAL_ADMIN_USER_ID, userRecord: admin, isSystem: true };
  }
}
