/**
 * Role binding proposals — the READ half of the universal->local binding seam.
 * Derives each declared role's candidates from existing records: no writes,
 * no guesses, no fuzzy text matching. Role declarations live on the UNIVERSAL
 * protocol a local-protocol inherits from (`inherits_from.id`). Selectors are
 * ONLY the declarations:
 *  - expectedLabwareKinds[] -> `labware` records by recordId
 *  - allowedMaterialIds[]   -> `material` records by recordId, plus `vendor-product`
 *    records whose `material_ref.id` matches, plus `material-instance` records
 *    provenance-chained to a declared id (via material_ref or vendor_product_ref)
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
  state: 'proposed' | 'ambiguous' | 'unbound' | 'bound';
  candidates: BindingCandidate[];
  bound?: BindingCandidate;
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
  const bindings = asObject(runPayload.bindings);

  // Index labware bindings by roleId
  const labwareBindingsByRole = new Map<string, string>();
  for (const entry of Array.isArray(bindings?.labware) ? (bindings.labware as unknown[]) : []) {
    const binding = asObject(entry);
    if (!binding) continue;
    const roleId = stringField(binding, 'roleId');
    if (!roleId) continue;
    const ref = asObject(binding.labwareInstanceRef);
    const refId = ref ? stringField(ref, 'id') : undefined;
    if (refId) labwareBindingsByRole.set(roleId, refId);
  }

  // Index material bindings by roleId
  const materialBindingsByRole = new Map<string, string>();
  for (const entry of Array.isArray(bindings?.materials) ? (bindings.materials as unknown[]) : []) {
    const binding = asObject(entry);
    if (!binding) continue;
    const roleId = stringField(binding, 'roleId');
    if (!roleId) continue;
    const ref = asObject(binding.materialRef);
    const refId = ref ? stringField(ref, 'id') : undefined;
    if (refId) materialBindingsByRole.set(roleId, refId);
  }

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

      // List labware-instances once (cached by listKind); group by labwareId (definition id).
      const labwareInstances = await listKind('labware-instance');
      const instancesByDef = new Map<string, RecordEnvelope[]>();
      for (const inst of labwareInstances) {
        const defId = stringField(asObject(inst.payload) ?? {}, 'labwareId');
        if (defId && declared.has(defId)) {
          const group = instancesByDef.get(defId) ?? [];
          group.push(inst);
          instancesByDef.set(defId, group);
        }
      }

      const candidates: BindingCandidate[] = [];
      for (const envelope of await listKind('labware')) {
        if (declared.has(envelope.recordId)) {
          const grouped = instancesByDef.get(envelope.recordId);
          if (grouped && grouped.length > 0) {
            for (const inst of grouped) {
              candidates.push(candidateOf(inst, 'labware-instance'));
            }
          } else {
            candidates.push(candidateOf(envelope, 'labware'));
          }
        }
      }
      candidates.sort(byRecordId);

      // Check binding: does a binding exist for this role and does the target resolve?
      const boundRefId = labwareBindingsByRole.get(roleId);
      if (boundRefId) {
        const boundEnvelope = await store.get(boundRefId);
        if (boundEnvelope) {
          const boundCandidate = candidateOf(boundEnvelope, 'labware');
          roles.push({
            ...base,
            state: 'bound',
            candidates,
            bound: boundCandidate,
          });
          continue;
        }
        // Dangling binding: target doesn't exist
        const fallbackState = stateOf(candidates);
        roles.push({
          ...base,
          state: fallbackState,
          candidates,
          ...(candidates.length === 0
            ? { reason: `binding target '${boundRefId}' does not exist; no labware record matches role '${roleId}' expectedLabwareKinds: ${kinds.join(', ')}` }
            : { reason: `binding target '${boundRefId}' does not exist` }),
        });
        continue;
      }

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
      // material-instance: provenance-chained to a declared id via material_ref (direct)
      // or vendor_product_ref -> material_ref (one-hop). Uses byId map for dedup.
      for (const envelope of await listKind('material-instance')) {
        const payload = asObject(envelope.payload) ?? {};
        const materialRef = asObject(payload.material_ref);
        const materialId = materialRef ? stringField(materialRef, 'id') : undefined;
        if (materialId && declared.has(materialId)) {
          const lotObj = asObject(payload.lot);
          const lotNumber = lotObj ? stringField(lotObj, 'lot_number') : undefined;
          byId.set(envelope.recordId, {
            recordId: envelope.recordId,
            recordKind: envelope.meta?.kind ?? stringField(payload, 'kind') ?? 'material-instance',
            label: labelOf(payload, envelope.recordId),
            ...(lotNumber ? { lotNumber } : {}),
          });
          continue;
        }
        // One-hop via vendor_product_ref
        const vendorProductRef = asObject(payload.vendor_product_ref);
        if (vendorProductRef) {
          const vprId = stringField(vendorProductRef, 'id');
          if (vprId) {
            const vprEnvelope = await store.get(vprId);
            if (vprEnvelope) {
              const vprPayload = asObject(vprEnvelope.payload) ?? {};
              const vprMaterialRef = asObject(vprPayload.material_ref);
              const vprMaterialId = vprMaterialRef ? stringField(vprMaterialRef, 'id') : undefined;
              if (vprMaterialId && declared.has(vprMaterialId)) {
                const lotObj = asObject(payload.lot);
                const lotNumber = lotObj ? stringField(lotObj, 'lot_number') : undefined;
                byId.set(envelope.recordId, {
                  recordId: envelope.recordId,
                  recordKind: envelope.meta?.kind ?? stringField(payload, 'kind') ?? 'material-instance',
                  label: labelOf(payload, envelope.recordId),
                  ...(lotNumber ? { lotNumber } : {}),
                });
              }
            }
          }
        }
      }
      const candidates = [...byId.values()].sort(byRecordId);

      // Check binding: does a binding exist for this role and does the target resolve?
      const boundRefId = materialBindingsByRole.get(roleId);
      if (boundRefId) {
        const boundEnvelope = await store.get(boundRefId);
        if (boundEnvelope) {
          const boundCandidate = candidateOf(boundEnvelope, 'material');
          roles.push({
            ...base,
            state: 'bound',
            candidates,
            bound: boundCandidate,
          });
          continue;
        }
        // Dangling binding: target doesn't exist
        const fallbackState = stateOf(candidates);
        roles.push({
          ...base,
          state: fallbackState,
          candidates,
          ...(candidates.length === 0
            ? { reason: `binding target '${boundRefId}' does not exist; no material or vendor-product record matches role '${roleId}' allowedMaterialIds: ${allowedIds.join(', ')}` }
            : { reason: `binding target '${boundRefId}' does not exist` }),
        });
        continue;
      }

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
