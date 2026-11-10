/**
 * Role binding write half of the universal->local seam (sibling of
 * roleBindingProposal.ts). Every posted roleId must be declared on an attached
 * protocol, and each ref's `type` comes from the target record's own kind, not
 * a literal. Reads only; the caller persists the run.
 */

import type { RecordEnvelope, RecordStore } from '../store/types.js';
import { protocolIdsOf } from './runProtocolList.js';
import { declaredRolesOf } from './roleBindingProposal.js';

export interface BindingLists {
  labware?: Array<{ roleId: string; labwareInstanceRef: string }>;
  materials?: Array<{ roleId: string; materialInstanceRef: string }>;
}

export interface WriteRoleBindingsDeps {
  store: Pick<RecordStore, 'get'>;
  run: RecordEnvelope;
  bindings: BindingLists;
}

export type RoleBindingWriteErrorCode =
  | 'NOT_A_DECLARED_ROLE'
  | 'UNKNOWN_BINDING_TARGET'
  | 'BINDING_TARGET_HAS_NO_KIND';

export type RoleBindingWriteResult =
  | { ok: true; bindings: Record<string, unknown> }
  | { ok: false; code: RoleBindingWriteErrorCode; message: string };

type Obj = Record<string, unknown>;

function asObject(value: unknown): Obj | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Obj) : undefined;
}

function stringField(obj: Obj, key: string): string | undefined {
  const value = obj[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** roleIds under one `roles.<key>` array; roleId is the only field read. */
function declaredRoleIds(roles: Obj, key: string): string[] {
  const entries = Array.isArray(roles[key]) ? (roles[key] as unknown[]) : [];
  return entries.flatMap((entry) => {
    const roleId = asObject(entry) ? stringField(asObject(entry)!, 'roleId') : undefined;
    return roleId ? [roleId] : [];
  });
}

/**
 * The lot identifier each target kind actually carries in its record schema:
 * material-instance/aliquot nest it at `payload.lot.lot_number`, material-lot
 * keeps `payload.lot_number`, and vendor-product has no lot field at all.
 * Mirrors the canonical reader in MaterialPrepHandlers.
 */
function lotOfPayload(kind: string, payload: Obj): string | undefined {
  if (kind === 'material-lot') return stringField(payload, 'lot_number');
  if (kind === 'material-instance' || kind === 'aliquot') {
    const lot = asObject(payload.lot);
    return lot ? stringField(lot, 'lot_number') : undefined;
  }
  return undefined;
}

function fail(code: RoleBindingWriteErrorCode, message: string): RoleBindingWriteResult {
  return { ok: false, code, message };
}

export async function writeRoleBindings(
  deps: WriteRoleBindingsDeps,
): Promise<RoleBindingWriteResult> {
  const { store, run, bindings: request } = deps;
  const runPayload = asObject(run.payload) ?? {};
  const updated: Record<string, unknown> = { ...(asObject(runPayload.bindings) ?? {}) };

  const declared = new Set<string>();
  for (const protocolId of protocolIdsOf(runPayload)) {
    // Same resolution as the read half: declarations live on the universal
    // protocol reached via inherits_from.id, never on the local-protocol.
    const roles = await declaredRolesOf(store, protocolId);
    for (const key of ['labwareRoles', 'materialRoles']) {
      for (const roleId of declaredRoleIds(roles, key)) declared.add(roleId);
    }
  }

  const posted = [
    ...(request.labware ?? []).map((b) => ({ roleId: b.roleId, targetId: b.labwareInstanceRef })),
    ...(request.materials ?? []).map((b) => ({ roleId: b.roleId, targetId: b.materialInstanceRef })),
  ];
  const undeclared = posted.find((b) => !declared.has(b.roleId));
  if (undeclared) {
    return fail('NOT_A_DECLARED_ROLE', `roleId '${undeclared.roleId}' is not declared on any attached protocol`);
  }

  const targets = new Map<string, RecordEnvelope | null>();
  const load = async (id: string): Promise<RecordEnvelope | null> => {
    if (!targets.has(id)) targets.set(id, await store.get(id));
    return targets.get(id) ?? null;
  };
  const kindOf = async (
    label: string,
    id: string,
  ): Promise<{ kind: string } | { failure: RoleBindingWriteResult }> => {
    const envelope = await load(id);
    if (!envelope) return { failure: fail('UNKNOWN_BINDING_TARGET', `${label} binding target '${id}' does not exist`) };
    const kind = envelope.meta?.kind ?? stringField(asObject(envelope.payload) ?? {}, 'kind');
    if (!kind) return { failure: fail('BINDING_TARGET_HAS_NO_KIND', `binding target '${id}' names no record kind`) };
    return { kind };
  };

  if (request.labware && request.labware.length > 0) {
    const roles = new Set(request.labware.map((b) => b.roleId));
    const kept = ((updated.labware as Obj[] | undefined) ?? []).filter(
      (b) => typeof b.roleId !== 'string' || !roles.has(b.roleId as string),
    );
    for (const binding of request.labware) {
      const resolved = await kindOf('labware', binding.labwareInstanceRef);
      if ('failure' in resolved) return resolved.failure;
      kept.push({
        roleId: binding.roleId,
        labwareInstanceRef: { kind: 'record', id: binding.labwareInstanceRef, type: resolved.kind },
      });
    }
    updated.labware = kept;
  }

  if (request.materials && request.materials.length > 0) {
    const roles = new Set(request.materials.map((b) => b.roleId));
    const kept = ((updated.materials as Obj[] | undefined) ?? []).filter(
      (b) => typeof b.roleId !== 'string' || !roles.has(b.roleId as string),
    );
    for (const binding of request.materials) {
      const resolved = await kindOf('material', binding.materialInstanceRef);
      if ('failure' in resolved) return resolved.failure;
      const lotNumber = lotOfPayload(
        resolved.kind,
        asObject((await load(binding.materialInstanceRef))?.payload) ?? {},
      );
      kept.push({
        roleId: binding.roleId,
        materialRef: { kind: 'record', id: binding.materialInstanceRef, type: resolved.kind },
        ...(lotNumber ? { lotNumber } : {}), // exactOptionalPropertyTypes: absent, never undefined
      });
    }
    updated.materials = kept;
  }

  return { ok: true, bindings: updated };
}
