/**
 * Role binding proposals — the READ half of the universal->local binding seam.
 * Derives each declared role's candidates from existing records: no writes,
 * no guesses, no fuzzy text matching. Role declarations live on the UNIVERSAL
 * protocol a local-protocol inherits from (`inherits_from.id`). Selectors are
 * ONLY the declarations:
 *  - expectedLabwareKinds[] -> `labware` records by recordId
 *  - allowedMaterialIds[]   -> `material` records by recordId, plus `vendor-product`
 *    records whose `material_ref.id` matches
 */

import type { RecordEnvelope, RecordStore } from '../store/types.js';
import { protocolIdsOf } from './runProtocolList.js';

export interface BindingCandidate {
  recordId: string;
  recordKind: string;
  label: string;
  lotNumber?: string;
}

export interface RoleProposal {
  roleId: string;
  roleKind: 'labware' | 'material';
  state: 'proposed' | 'ambiguous' | 'unbound';
  candidates: BindingCandidate[];
  reason?: string;
}

export interface RoleBindingProposals {
  protocols: Array<{ protocolId: string; roles: RoleProposal[] }>;
}

export interface ProposeRoleBindingsDeps {
  store: Pick<RecordStore, 'get' | 'list'>;
  run: RecordEnvelope;
}

type Obj = Record<string, unknown>;

function asObject(value: unknown): Obj | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Obj)
    : undefined;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function stringField(obj: Obj, key: string): string | undefined {
  const value = obj[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** Label from record data only; the record id is the last resort. */
function labelOf(payload: Obj, recordId: string): string {
  return stringField(payload, 'name')
    ?? stringField(payload, 'label')
    ?? stringField(payload, 'title')
    ?? recordId;
}

function candidateOf(envelope: RecordEnvelope, fallbackKind: string): BindingCandidate {
  const payload = asObject(envelope.payload) ?? {};
  const lotNumber = stringField(payload, 'lotNumber');
  return {
    recordId: envelope.recordId,
    recordKind: envelope.meta?.kind ?? stringField(payload, 'kind') ?? fallbackKind,
    label: labelOf(payload, envelope.recordId),
    ...(lotNumber ? { lotNumber } : {}), // exactOptionalPropertyTypes: absent, never undefined
  };
}

function byRecordId(a: BindingCandidate, b: BindingCandidate): number {
  return a.recordId < b.recordId ? -1 : a.recordId > b.recordId ? 1 : 0;
}

function unbound(base: Pick<RoleProposal, 'roleId' | 'roleKind'>, reason: string): RoleProposal {
  return { ...base, state: 'unbound', candidates: [], reason };
}

function stateOf(candidates: BindingCandidate[]): RoleProposal['state'] {
  return candidates.length === 0 ? 'unbound' : candidates.length === 1 ? 'proposed' : 'ambiguous';
}

/**
 * Declared roles of a run's local-protocol: the declarations live on the
 * universal protocol reached via `inherits_from.id` (see
 * RunPlanBindingPasses: resolve inherits_from, then load the canonical
 * protocol). A local-protocol that declares its own `roles` wins defensively.
 * No declarations anywhere -> no roles: never invent one.
 */
export async function declaredRolesOf(
  store: Pick<RecordStore, 'get'>,
  protocolId: string,
): Promise<Obj> {
  const localPayload = asObject((await store.get(protocolId))?.payload) ?? {};
  const ownRoles = asObject(localPayload.roles);
  if (ownRoles) return ownRoles;

  const inheritsFrom = asObject(localPayload.inherits_from);
  const universalId = inheritsFrom ? stringField(inheritsFrom, 'id') : undefined;
  if (!universalId) return {};

  const universalPayload = asObject((await store.get(universalId))?.payload) ?? {};
  return asObject(universalPayload.roles) ?? {};
}

export async function proposeRoleBindings(
  deps: ProposeRoleBindingsDeps,
): Promise<RoleBindingProposals> {
  const { store, run } = deps;
  const runPayload = asObject(run.payload) ?? {};

  const listCache = new Map<string, Promise<RecordEnvelope[]>>();
  const listKind = (kind: string): Promise<RecordEnvelope[]> => {
    let pending = listCache.get(kind);
    if (!pending) {
      pending = store.list({ kind });
      listCache.set(kind, pending);
    }
    return pending;
  };

  const protocols: RoleBindingProposals['protocols'] = [];

  for (const protocolId of protocolIdsOf(runPayload)) {
    const rolesObj = await declaredRolesOf(store, protocolId);
    const roles: RoleProposal[] = [];

    for (const entry of Array.isArray(rolesObj.labwareRoles) ? rolesObj.labwareRoles : []) {
      const role = asObject(entry);
      const roleId = role ? stringField(role, 'roleId') : undefined;
      if (!role || !roleId) continue;
      const kinds = asStringArray(role.expectedLabwareKinds);
      const base = { roleId, roleKind: 'labware' as const };

      if (kinds.length === 0) {
        roles.push(unbound(base, `role '${roleId}' declares no expectedLabwareKinds; labware binding cannot be derived without a declaration`));
        continue;
      }

      const declared = new Set(kinds);
      const candidates: BindingCandidate[] = [];
      for (const envelope of await listKind('labware')) {
        if (declared.has(envelope.recordId)) {
          candidates.push(candidateOf(envelope, 'labware'));
        }
      }
      candidates.sort(byRecordId);
      roles.push({
        ...base,
        state: stateOf(candidates),
        candidates,
        ...(candidates.length === 0
          ? { reason: `no labware record matches role '${roleId}' expectedLabwareKinds: ${kinds.join(', ')}` }
          : {}),
      });
    }

    for (const entry of Array.isArray(rolesObj.materialRoles) ? rolesObj.materialRoles : []) {
      const role = asObject(entry);
      const roleId = role ? stringField(role, 'roleId') : undefined;
      if (!role || !roleId) continue;
      const allowedIds = asStringArray(role.allowedMaterialIds);
      const base = { roleId, roleKind: 'material' as const };

      if (allowedIds.length === 0) {
        roles.push(unbound(base, `role '${roleId}' declares no allowedMaterialIds; material binding cannot be derived without a declaration`));
        continue;
      }

      const declared = new Set(allowedIds);
      const byId = new Map<string, BindingCandidate>();
      for (const envelope of await listKind('material')) {
        if (declared.has(envelope.recordId)) {
          byId.set(envelope.recordId, candidateOf(envelope, 'material'));
        }
      }
      for (const envelope of await listKind('vendor-product')) {
        const payload = asObject(envelope.payload) ?? {};
        const materialRef = asObject(payload.material_ref);
        const materialId = materialRef ? stringField(materialRef, 'id') : undefined;
        if (materialId && declared.has(materialId)) {
          byId.set(envelope.recordId, candidateOf(envelope, 'vendor-product'));
        }
      }
      const candidates = [...byId.values()].sort(byRecordId);
      roles.push({
        ...base,
        state: stateOf(candidates),
        candidates,
        ...(candidates.length === 0
          ? { reason: `no material or vendor-product record matches role '${roleId}' allowedMaterialIds: ${allowedIds.join(', ')}` }
          : {}),
      });
    }

    protocols.push({ protocolId, roles });
  }

  return { protocols };
}
