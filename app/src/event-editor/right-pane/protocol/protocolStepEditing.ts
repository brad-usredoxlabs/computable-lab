import type { ProtocolRoleSummary, ProtocolResources, ProtocolStepSummary } from '../../protocol/ProtocolSelectionContext'

type Payload = Record<string, unknown>
type Step = Record<string, unknown> & { stepId: string }

/** Read a role list (labwareRoles / instrumentRoles) into rail summaries.
 *  A declaration without a roleId is dropped — it names nothing. */
function roleSummaries(value: unknown): ProtocolRoleSummary[] {
  if (!Array.isArray(value)) return []
  return (value as Payload[]).flatMap((role) => {
    const roleId = typeof role?.roleId === 'string' ? role.roleId.trim() : ''
    if (!roleId) return []
    const description = typeof role.description === 'string' ? role.description.trim() : ''
    // Design refs ride along so the AI's attached-protocol block (PROTO-AI-6)
    // can show WHAT a role binds to, not just that it exists.
    const kinds = (v: unknown): string[] | undefined =>
      Array.isArray(v) && v.length > 0 ? v.filter((x): x is string => typeof x === 'string' && x.length > 0) : undefined
    const expectedLabwareKinds = kinds(role.expectedLabwareKinds)
    const allowedInstrumentIds = kinds(role.allowedInstrumentIds)
    return [{
      roleId,
      ...(description ? { description } : {}),
      ...(expectedLabwareKinds ? { expectedLabwareKinds } : {}),
      ...(allowedInstrumentIds ? { allowedInstrumentIds } : {}),
    }]
  })
}

/**
 * The protocol's DECLARED labware + equipment roles, for the rail's collapsible
 * resource sections. Unlike `editableProtocolSteps` this never throws: roles
 * are readable on an inherited or locked protocol too — what the assay needs is
 * exactly the context the biologist wants while realizing a step.
 */
export function protocolResourceSummaries(payload: Payload): ProtocolResources {
  const roles = (payload.roles ?? {}) as Payload
  return {
    labwares: roleSummaries(roles.labwareRoles),
    equipment: roleSummaries(roles.instrumentRoles),
  }
}

export function editableProtocolSteps(payload: Payload): Step[] {
  if (payload.kind !== 'protocol') throw new Error('These steps are inherited. Edit the source protocol to change its instructions.')
  if (payload.lifecycleId && ['approved', 'effective', 'superseded', 'archived'].includes(String(payload.state))) {
    throw new Error('This controlled protocol is locked. Create a draft copy before editing its steps.')
  }
  if (!Array.isArray(payload.steps)) throw new Error('The protocol has no steps to edit.')
  return payload.steps as Step[]
}

export function stepSummaries(payload: Payload): ProtocolStepSummary[] {
  return (payload.steps as Step[]).map((step, index) => ({
    stepId: step.stepId, label: String(step.label ?? ''), ordinal: Number(step.ordinal ?? index + 1),
    ...(typeof step.description === 'string' ? { description: step.description } : {}),
  }))
}

/** Update only declared branch membership lists; provenance stays untouched. */
function updateMembership(payload: Payload, anchorId: string, insertedId?: string, position?: 'before' | 'after'): Payload {
  const list = (value: unknown) => Array.isArray(value) ? value.flatMap(id => id !== anchorId ? [id]
    : insertedId ? position === 'before' ? [insertedId, id] : [id, insertedId] : []) : value
  const fields = (value: Payload, keys: string[]) => Object.fromEntries(Object.entries(value).map(([key, data]) => [key, keys.includes(key) ? list(data) : data]))
  return {
    ...payload,
    ...(Array.isArray(payload.variants) ? { variants: payload.variants.map(v => fields(v, ['stepIds'])) } : {}),
    ...(Array.isArray(payload.branch_axes) ? { branch_axes: payload.branch_axes.map(axis => ({
      ...fields(axis, ['shared_stepIds']),
      conditions: axis.conditions.map((condition: Payload) => fields(condition, ['then_stepIds', 'else_stepIds'])),
    })) } : {}),
  }
}

export function insertProtocolStep(payload: Payload, anchorId: string, position: 'before' | 'after', step: Step): Payload {
  const steps = [...editableProtocolSteps(payload)]
  const index = steps.findIndex(s => s.stepId === anchorId)
  if (index < 0) throw new Error('This step no longer exists. Reload the protocol.')
  if (steps.some(s => s.stepId === step.stepId)) throw new Error('The new step identifier already exists.')
  const anchor = steps[index]!
  steps.splice(index + (position === 'after' ? 1 : 0), 0, {
    ...(anchor.phaseId ? { phaseId: anchor.phaseId } : {}), ...step,
  })
  return { ...updateMembership(payload, anchorId, step.stepId, position), steps: steps.map((s, i) => ({ ...s, ordinal: i + 1 })) }
}

// ---------------------------------------------------------------------------
// Declared-role ops (PROTO-AI-8). The AI applier drives these through the SAME
// edit gates the step editor uses: a kind-only/inherited protocol and a
// content-locked controlled document cannot have their declared resources
// rewritten by an accepted proposal. Like `updateMembership`, only the DECLARED
// list is touched — a protocol with no `instrumentRoles` does not gain one from
// a labware edit, and sibling role lists (materialRoles, layoutTemplateRoles…)
// ride through untouched. An emptied list pops cleanly; an emptied `roles`
// object pops with it, so the record never carries `labwareRoles: []`.
// ---------------------------------------------------------------------------

type RoleListKey = 'labwareRoles' | 'instrumentRoles'

/** The kind/lock gates of `editableProtocolSteps`, without the steps requirement. */
function assertRolesEditable(payload: Payload, listKey: RoleListKey): void {
  if (payload.kind !== 'protocol') throw new Error(`These roles are inherited. Edit the source protocol to change its ${listKey}.`)
  if (payload.lifecycleId && ['approved', 'effective', 'superseded', 'archived'].includes(String(payload.state))) {
    throw new Error('This controlled protocol is locked. Create a draft copy before editing its declared roles.')
  }
}

function editRoleList(payload: Payload, listKey: RoleListKey, edit: (declared: Payload[]) => Payload[]): Payload {
  assertRolesEditable(payload, listKey)
  const roles = (payload.roles ?? {}) as Payload
  const declared = Array.isArray(roles[listKey]) ? roles[listKey] as Payload[] : []
  const next = edit(declared)
  const nextRoles: Payload = { ...roles }
  if (next.length > 0) nextRoles[listKey] = next
  else delete nextRoles[listKey]
  const updated: Payload = { ...payload }
  if (Object.keys(nextRoles).length > 0) updated.roles = nextRoles
  else delete updated.roles
  return updated
}

function requireRole(declared: Payload[], roleId: string, listKey: RoleListKey): Payload {
  const found = declared.find(role => role.roleId === roleId)
  if (!found) throw new Error(`Role '${roleId}' is not a declared ${listKey === 'labwareRoles' ? 'labware' : 'equipment'} role of this protocol.`)
  return found
}

/** Declare a new labware role. A duplicate roleId is a rejection, not a merge. */
export function addLabwareRole(payload: Payload, role: Payload): Payload {
  return editRoleList(payload, 'labwareRoles', declared => {
    if (declared.some(existing => existing.roleId === role.roleId)) throw new Error(`Labware role '${role.roleId}' already exists.`)
    return [...declared, role]
  })
}

/** Update an existing labware role; only the listed fields change. */
export function updateLabwareRole(payload: Payload, roleId: string, changes: Payload): Payload {
  return editRoleList(payload, 'labwareRoles', declared => {
    requireRole(declared, roleId, 'labwareRoles')
    return declared.map(role => role.roleId === roleId ? { ...role, ...changes } : role)
  })
}

/** Remove a labware role; deleting the last one pops `roles.labwareRoles` cleanly. */
export function deleteLabwareRole(payload: Payload, roleId: string): Payload {
  return editRoleList(payload, 'labwareRoles', declared => {
    requireRole(declared, roleId, 'labwareRoles')
    return declared.filter(role => role.roleId !== roleId)
  })
}

/** Declare a new instrument role. A duplicate roleId is a rejection, not a merge. */
export function addInstrumentRole(payload: Payload, role: Payload): Payload {
  return editRoleList(payload, 'instrumentRoles', declared => {
    if (declared.some(existing => existing.roleId === role.roleId)) throw new Error(`Equipment role '${role.roleId}' already exists.`)
    return [...declared, role]
  })
}

/** Update an existing instrument role; only the listed fields change. */
export function updateInstrumentRole(payload: Payload, roleId: string, changes: Payload): Payload {
  return editRoleList(payload, 'instrumentRoles', declared => {
    requireRole(declared, roleId, 'instrumentRoles')
    return declared.map(role => role.roleId === roleId ? { ...role, ...changes } : role)
  })
}

/** Remove an instrument role; deleting the last one pops `roles.instrumentRoles` cleanly. */
export function deleteInstrumentRole(payload: Payload, roleId: string): Payload {
  return editRoleList(payload, 'instrumentRoles', declared => {
    requireRole(declared, roleId, 'instrumentRoles')
    return declared.filter(role => role.roleId !== roleId)
  })
}

export function deleteProtocolStep(payload: Payload, stepId: string): Payload {
  const steps = editableProtocolSteps(payload)
  const step = steps.find(s => s.stepId === stepId)
  if (!step) throw new Error('This step no longer exists. Reload the protocol.')
  if (steps.length === 1) throw new Error('A protocol needs at least one step. Add another step before deleting this one.')
  const execution = step.executionMeta as { startedAt?: string; completedAt?: string } | undefined
  if (execution?.startedAt || execution?.completedAt) throw new Error('This step has already been executed and cannot be deleted.')
  return { ...updateMembership(payload, stepId), steps: steps.filter(s => s.stepId !== stepId).map((s, i) => ({ ...s, ordinal: i + 1 })) }
}
