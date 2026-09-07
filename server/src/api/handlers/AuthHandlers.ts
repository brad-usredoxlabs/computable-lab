import type { FastifyReply, FastifyRequest } from 'fastify';
import type { RecordStore } from '../../store/types.js';
import type { CredentialStore } from '../../security/CredentialStore.js';
import type { SessionStore } from '../../security/SessionStore.js';
import type { LocalIdentityService } from '../../security/LocalIdentityService.js';
import { verifyPassword, hashPassword } from '../../security/CredentialStore.js';

export interface AuthHandlerOptions {
  store: RecordStore;
  credentialStore: CredentialStore;
  sessionStore: SessionStore;
  identityService?: LocalIdentityService;
}

function payloadOf(env: { payload?: unknown } | null | undefined): Record<string, unknown> {
  const p = env?.payload;
  return p && typeof p === 'object' ? (p as Record<string, unknown>) : {};
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** Find an active user record by username (or displayName fallback). */
async function findUserByUsername(store: RecordStore, username: string) {
  const users = await store.list({ kind: 'user', limit: 10000 });
  const exact = users.find((u) => {
    const p = payloadOf(u);
    return (asString(p.username) ?? '').toLowerCase() === username.toLowerCase();
  });
  if (exact) return exact;
  return users.find((u) => {
    const p = payloadOf(u);
    return (asString(p.displayName) ?? '').toLowerCase() === username.toLowerCase();
  }) ?? null;
}

export function createAuthHandlers(options: AuthHandlerOptions) {
  const { store, credentialStore, sessionStore, identityService } = options;

  return {
    // POST /auth/login  { username, password }
    async login(
      request: FastifyRequest<{ Body: { username?: string; password?: string } }>,
      reply: FastifyReply,
    ): Promise<unknown> {
      const username = asString(request.body?.username);
      const password = asString(request.body?.password);
      if (!username || !password) {
        reply.status(400);
        return { error: 'BAD_REQUEST', message: 'username and password are required' };
      }

      const user = await findUserByUsername(store, username);
      if (!user || payloadOf(user).status !== 'active') {
        reply.status(401);
        return { error: 'INVALID_CREDENTIALS', message: 'Invalid username or password' };
      }
      const userId = user.recordId;

      const verifier = await credentialStore.getVerifier(userId);
      if (!verifier) {
        // Existing users without a password can't log in yet (see A4/A5).
        reply.status(401);
        return { error: 'INVALID_CREDENTIALS', message: 'Invalid username or password' };
      }
      if (!verifyPassword(password, verifier)) {
        reply.status(401);
        return { error: 'INVALID_CREDENTIALS', message: 'Invalid username or password' };
      }

      const token = await sessionStore.create(userId);
      return { success: true, token, userId };
    },

    // POST /auth/logout  (revokes the presented session token)
    async logout(request: FastifyRequest, _reply: FastifyReply): Promise<unknown> {
      const token = headerString(request.headers['x-cl-session']);
      if (token) await sessionStore.revoke(token);
      return { success: true };
    },

    // POST /auth/set-password  { password }  (self-service: sets the CURRENT user's password)
    // Lets a pre-auth user (e.g. USR-BRAD, created before auth existed) establish
    // a password so they can actually log in. Resolves the caller from the
    // request (session/x-user-id), so a user can only set their OWN password.
    async setPassword(
      request: FastifyRequest<{ Body: { password?: string } }>,
      reply: FastifyReply,
    ): Promise<unknown> {
      if (!identityService) {
        reply.status(503);
        return { error: 'APP_NOT_READY', message: 'Identity service not configured.' };
      }
      const password = asString(request.body?.password);
      if (!password || password.length < 8) {
        reply.status(400);
        return { error: 'BAD_REQUEST', message: 'password is required (min 8 chars)' };
      }
      const resolved = await identityService.resolveRequestUser(request);
      if (!resolved.userId || resolved.isSystem || !(await store.get(resolved.userId))) {
        reply.status(403);
        return { error: 'NO_CURRENT_USER', message: 'No concrete current user to set a password for (system identity).' };
      }
      await credentialStore.setVerifier(resolved.userId, hashPassword(password));
      return { success: true, userId: resolved.userId };
    },
  };
}

function headerString(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export type AuthHandlers = ReturnType<typeof createAuthHandlers>;