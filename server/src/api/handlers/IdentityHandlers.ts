import type { FastifyReply, FastifyRequest } from 'fastify';
import type { RecordStore } from '../../store/types.js';
import type { RecordEnvelope } from '../../types/RecordEnvelope.js';
import { LocalIdentityService, USER_SCHEMA_ID } from '../../security/LocalIdentityService.js';
import {
  AuthorizationService,
  ACCESS_POLICY_SCHEMA_ID,
  POLICY_ROOT_KINDS,
} from '../../security/AuthorizationService.js';
import type { AccessGrant } from '../../security/AccessControlService.js';

/**
 * Thin convenience endpoints that surface the (already enforced) local
 * identity / groups / access-policy model to the UI. Everything here delegates
 * to the existing security services — no new policy semantics are introduced.
 */

const GROUP_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/group.schema.yaml';
const VALID_ROLES = ['owner', 'admin', 'editor', 'operator', 'qa', 'viewer'] as const;
const VALID_VISIBILITY = ['private', 'shared', 'public'] as const;

export interface IdentityHandlerOptions {
  store: RecordStore;
  identityService: LocalIdentityService;
  authorizationService: AuthorizationService;
}

interface UserSummary {
  recordId: string;
  username?: string;
  displayName?: string;
  status?: string;
  email?: string;
}

interface GroupSummary {
  recordId: string;
  name?: string;
  displayName?: string;
  status?: string;
  memberUserIds: string[];
  memberGroupIds: string[];
}

interface AclShape {
  recordId: string;
  visibility: string;
  ownerUserId: string;
  grants: AccessGrant[];
}

function payloadOf(env: RecordEnvelope | null | undefined): Record<string, unknown> {
  return env?.payload && typeof env.payload === 'object' ? (env.payload as Record<string, unknown>) : {};
}

function kindOf(env: RecordEnvelope | null | undefined): string | undefined {
  const p = payloadOf(env);
  return typeof p.kind === 'string' ? p.kind : env?.meta?.kind;
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function summarizeUser(env: RecordEnvelope): UserSummary {
  const p = payloadOf(env);
  const out: UserSummary = { recordId: env.recordId };
  const username = str(p.username);
  if (username) out.username = username;
  const displayName = str(p.displayName);
  if (displayName) out.displayName = displayName;
  const status = str(p.status);
  if (status) out.status = status;
  const email = str(p.email);
  if (email) out.email = email;
  return out;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function summarizeGroup(env: RecordEnvelope): GroupSummary {
  const p = payloadOf(env);
  const out: GroupSummary = {
    recordId: env.recordId,
    memberUserIds: stringArray(p.memberUserIds),
    memberGroupIds: stringArray(p.memberGroupIds),
  };
  const name = str(p.name);
  if (name) out.name = name;
  const displayName = str(p.displayName);
  if (displayName) out.displayName = displayName;
  const status = str(p.status);
  if (status) out.status = status;
  return out;
}

function aclFromEnvelope(env: RecordEnvelope | null | undefined): AclShape | null {
  const p = payloadOf(env);
  if (p.kind !== 'access-policy') return null;
  if (typeof p.recordId !== 'string' || typeof p.ownerUserId !== 'string') return null;
  if (!VALID_VISIBILITY.includes(p.visibility as (typeof VALID_VISIBILITY)[number])) return null;
  return {
    recordId: p.recordId,
    visibility: p.visibility as string,
    ownerUserId: p.ownerUserId,
    grants: sanitizeGrants(p.grants),
  };
}

function sanitizeGrants(value: unknown): AccessGrant[] {
  if (!Array.isArray(value)) return [];
  const out: AccessGrant[] = [];
  for (const g of value) {
    if (!g || typeof g !== 'object') continue;
    const row = g as Record<string, unknown>;
    const principalType = row.principalType;
    const principalId = row.principalId;
    const role = row.role;
    if (principalType !== 'user' && principalType !== 'group') continue;
    if (typeof principalId !== 'string') continue;
    if (!VALID_ROLES.includes(role as (typeof VALID_ROLES)[number])) continue;
    out.push({ principalType, principalId, role: role as AccessGrant['role'] });
  }
  return out;
}

/** Transitively resolve which groups contain a user (mirrors AccessControlService). */
function groupsContainingUser(userId: string, groups: GroupSummary[]): GroupSummary[] {
  const byId = new Map(groups.map((g) => [g.recordId, g]));
  const contains = (groupId: string, visited: Set<string>): boolean => {
    if (visited.has(groupId)) return false;
    visited.add(groupId);
    const g = byId.get(groupId);
    if (!g) return false;
    if (g.memberUserIds.includes(userId)) return true;
    return g.memberGroupIds.some((child) => contains(child, visited));
  };
  return groups.filter((g) => contains(g.recordId, new Set()));
}

function groupSlug(name: string): string {
  const slug = name.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `GRP-${slug || 'GROUP'}`;
}

function userSlug(name: string): string {
  const slug = name.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `USR-${slug || 'USER'}`;
}

export function createIdentityHandlers(options: IdentityHandlerOptions) {
  const { store, identityService, authorizationService } = options;

  async function loadGroupSummaries(): Promise<GroupSummary[]> {
    const groups = await store.list({ kind: 'group', limit: 10000 });
    return groups.map(summarizeGroup);
  }

  return {
    // GET /api/me
    async getMe(request: FastifyRequest, _reply: FastifyReply) {
      const resolved = await identityService.resolveRequestUser(request);
      const groups = resolved.userId ? groupsContainingUser(resolved.userId, await loadGroupSummaries()) : [];
      return {
        userId: resolved.userId,
        isSystem: resolved.isSystem,
        user: resolved.userRecord ? summarizeUser(resolved.userRecord) : null,
        groups: groups.map((g) => ({ recordId: g.recordId, name: g.name, displayName: g.displayName })),
        ...(resolved.reason ? { reason: resolved.reason } : {}),
      };
    },

    // GET /api/users
    async listUsers(_request: FastifyRequest, _reply: FastifyReply) {
      const users = await store.list({ kind: 'user', limit: 1000 });
      return {
        users: users
          .filter((u) => payloadOf(u).status === 'active')
          .map(summarizeUser),
      };
    },

    // POST /api/users  { displayName, username? }
    async createUser(
      request: FastifyRequest<{ Body: { displayName?: string; username?: string } }>,
      reply: FastifyReply,
    ) {
      const displayName = str(request.body?.displayName);
      if (!displayName) {
        reply.status(400);
        return { error: 'BAD_REQUEST', message: 'displayName is required' };
      }
      const username = str(request.body?.username) ?? displayName.toLowerCase().replace(/\s+/g, '-');
      const recordId = userSlug(username);
      if (await store.exists(recordId)) {
        reply.status(409);
        return { error: 'CONFLICT', message: `User already exists: ${recordId}` };
      }
      const now = new Date().toISOString();
      const envelope: RecordEnvelope = {
        recordId,
        schemaId: USER_SCHEMA_ID,
        payload: {
          kind: 'user',
          recordId,
          username,
          displayName,
          status: 'active',
          createdAt: now,
          updatedAt: now,
        },
        meta: { createdAt: now, updatedAt: now, createdBy: 'system' },
      };
      const result = await store.create({ envelope, message: `Create user ${recordId}` });
      if (!result.success) {
        reply.status(400);
        return { error: 'USER_CREATE_FAILED', message: result.error ?? 'Failed to create user' };
      }
      return summarizeUser(result.envelope ?? envelope);
    },

    // GET /api/records/:id/access-policy
    async getAccessPolicy(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
      const { id } = request.params;
      const record = await store.get(id);
      if (!record) {
        reply.status(404);
        return { error: 'NOT_FOUND', message: `Record not found: ${id}` };
      }
      const resolved = await identityService.resolveRequestUser(request);
      if (!(await authorizationService.canAccess(resolved.userId, 'read', record))) {
        reply.status(404);
        return { error: 'NOT_FOUND', message: `Record not found: ${id}` };
      }
      const kind = kindOf(record);
      const isPolicyRoot = Boolean(kind && POLICY_ROOT_KINDS.has(kind));
      const direct = aclFromEnvelope(await authorizationService.findPolicyForRecord(id));
      const effective = await authorizationService.resolveEffectivePolicy(record);
      const canAdmin = await authorizationService.canAccess(resolved.userId, 'admin', record);
      const canWrite = await authorizationService.canAccess(resolved.userId, 'write', record);
      return {
        recordId: id,
        kind: kind ?? null,
        isPolicyRoot,
        canAdmin,
        canWrite,
        direct,
        effective: effective
          ? { recordId: effective.recordId, visibility: effective.visibility, ownerUserId: effective.ownerUserId, grants: effective.grants }
          : null,
        inherited: !direct && Boolean(effective),
      };
    },

    // PUT /api/records/:id/access-policy
    async putAccessPolicy(
      request: FastifyRequest<{ Params: { id: string }; Body: { visibility?: string; grants?: unknown } }>,
      reply: FastifyReply,
    ) {
      const { id } = request.params;
      const visibility = request.body?.visibility;
      if (!VALID_VISIBILITY.includes(visibility as (typeof VALID_VISIBILITY)[number])) {
        reply.status(400);
        return { error: 'BAD_REQUEST', message: `visibility must be one of ${VALID_VISIBILITY.join(', ')}` };
      }
      const grants = sanitizeGrants(request.body?.grants);
      // Reject grants whose principalId doesn't match its declared type prefix.
      for (const g of grants) {
        const ok = g.principalType === 'user' ? g.principalId.startsWith('USR-') : g.principalId.startsWith('GRP-');
        if (!ok) {
          reply.status(400);
          return { error: 'BAD_REQUEST', message: `grant principalId ${g.principalId} does not match principalType ${g.principalType}` };
        }
      }

      const record = await store.get(id);
      if (!record) {
        reply.status(404);
        return { error: 'NOT_FOUND', message: `Record not found: ${id}` };
      }
      const kind = kindOf(record);
      if (!kind || !POLICY_ROOT_KINDS.has(kind)) {
        reply.status(400);
        return { error: 'BAD_REQUEST', message: `Access policy can only be set on policy-root records (${[...POLICY_ROOT_KINDS].join(', ')})` };
      }
      const resolved = await identityService.resolveRequestUser(request);
      if (!(await authorizationService.canAccess(resolved.userId, 'admin', record))) {
        reply.status(403);
        return { error: 'ACCESS_DENIED', message: `User ${resolved.userId ?? '(unknown)'} cannot change sharing for ${id}` };
      }

      // Ensure a base ACL exists, then update visibility + grants on it.
      let policyEnv = await authorizationService.findPolicyForRecord(id);
      if (!policyEnv) {
        policyEnv = await authorizationService.ensureOwnerPolicy(record, resolved.userId ?? '');
      }
      if (!policyEnv) {
        reply.status(500);
        return { error: 'POLICY_CREATE_FAILED', message: `Could not create an access policy for ${id}` };
      }

      const now = new Date().toISOString();
      const existing = payloadOf(policyEnv);
      const updatedEnvelope: RecordEnvelope = {
        ...policyEnv,
        schemaId: policyEnv.schemaId ?? ACCESS_POLICY_SCHEMA_ID,
        payload: {
          ...existing,
          kind: 'access-policy',
          recordId: policyEnv.recordId,
          visibility,
          grants,
          updatedAt: now,
        },
        meta: { ...(policyEnv.meta ?? {}), updatedAt: now },
      };

      const result = await store.update({
        envelope: updatedEnvelope,
        message: `Update access policy for ${id}`,
        skipLint: true,
      });
      if (!result.success) {
        reply.status(500);
        return { error: 'POLICY_UPDATE_FAILED', message: result.error ?? 'Failed to update access policy' };
      }
      return aclFromEnvelope(result.envelope ?? updatedEnvelope);
    },

    // GET /api/groups
    async listGroups(_request: FastifyRequest, _reply: FastifyReply) {
      return { groups: await loadGroupSummaries() };
    },

    // POST /api/groups  { name, displayName }
    async createGroup(
      request: FastifyRequest<{ Body: { name?: string; displayName?: string } }>,
      reply: FastifyReply,
    ) {
      const name = str(request.body?.name);
      const displayName = str(request.body?.displayName) ?? name;
      if (!name || !displayName) {
        reply.status(400);
        return { error: 'BAD_REQUEST', message: 'name and displayName are required' };
      }
      const recordId = groupSlug(name);
      if (await store.exists(recordId)) {
        reply.status(409);
        return { error: 'CONFLICT', message: `Group already exists: ${recordId}` };
      }
      const resolved = await identityService.resolveRequestUser(request);
      const now = new Date().toISOString();
      const envelope: RecordEnvelope = {
        recordId,
        schemaId: GROUP_SCHEMA_ID,
        payload: {
          kind: 'group',
          recordId,
          name,
          displayName,
          status: 'active',
          memberUserIds: [],
          memberGroupIds: [],
          createdAt: now,
          updatedAt: now,
        },
        meta: { createdAt: now, updatedAt: now, createdBy: resolved.userId ?? 'system' },
      };
      const result = await store.create({ envelope, message: `Create group ${recordId}` });
      if (!result.success) {
        reply.status(400);
        return { error: 'GROUP_CREATE_FAILED', message: result.error ?? 'Failed to create group' };
      }
      return summarizeGroup(result.envelope ?? envelope);
    },

    // POST /api/groups/:id/members  { principalType, principalId }
    async addGroupMember(
      request: FastifyRequest<{ Params: { id: string }; Body: { principalType?: string; principalId?: string } }>,
      reply: FastifyReply,
    ) {
      const { id } = request.params;
      const principalType = request.body?.principalType;
      const principalId = str(request.body?.principalId);
      if ((principalType !== 'user' && principalType !== 'group') || !principalId) {
        reply.status(400);
        return { error: 'BAD_REQUEST', message: 'principalType (user|group) and principalId are required' };
      }
      const prefixOk = principalType === 'user' ? principalId.startsWith('USR-') : principalId.startsWith('GRP-');
      if (!prefixOk) {
        reply.status(400);
        return { error: 'BAD_REQUEST', message: `principalId ${principalId} does not match principalType ${principalType}` };
      }
      const group = await store.get(id);
      if (!group || kindOf(group) !== 'group') {
        reply.status(404);
        return { error: 'NOT_FOUND', message: `Group not found: ${id}` };
      }
      const summary = summarizeGroup(group);
      const field = principalType === 'user' ? 'memberUserIds' : 'memberGroupIds';
      const members = field === 'memberUserIds' ? summary.memberUserIds : summary.memberGroupIds;
      if (!members.includes(principalId)) members.push(principalId);

      const now = new Date().toISOString();
      const updated: RecordEnvelope = {
        ...group,
        payload: { ...payloadOf(group), memberUserIds: summary.memberUserIds, memberGroupIds: summary.memberGroupIds, updatedAt: now },
        meta: { ...(group.meta ?? {}), updatedAt: now },
      };
      const result = await store.update({ envelope: updated, message: `Add ${principalId} to ${id}` });
      if (!result.success) {
        reply.status(400);
        return { error: 'GROUP_UPDATE_FAILED', message: result.error ?? 'Failed to update group' };
      }
      return summarizeGroup(result.envelope ?? updated);
    },

    // DELETE /api/groups/:id/members/:principalId
    async removeGroupMember(
      request: FastifyRequest<{ Params: { id: string; principalId: string } }>,
      reply: FastifyReply,
    ) {
      const { id, principalId } = request.params;
      const group = await store.get(id);
      if (!group || kindOf(group) !== 'group') {
        reply.status(404);
        return { error: 'NOT_FOUND', message: `Group not found: ${id}` };
      }
      const summary = summarizeGroup(group);
      const now = new Date().toISOString();
      const updated: RecordEnvelope = {
        ...group,
        payload: {
          ...payloadOf(group),
          memberUserIds: summary.memberUserIds.filter((m) => m !== principalId),
          memberGroupIds: summary.memberGroupIds.filter((m) => m !== principalId),
          updatedAt: now,
        },
        meta: { ...(group.meta ?? {}), updatedAt: now },
      };
      const result = await store.update({ envelope: updated, message: `Remove ${principalId} from ${id}` });
      if (!result.success) {
        reply.status(400);
        return { error: 'GROUP_UPDATE_FAILED', message: result.error ?? 'Failed to update group' };
      }
      return summarizeGroup(result.envelope ?? updated);
    },
  };
}

export type IdentityHandlers = ReturnType<typeof createIdentityHandlers>;
