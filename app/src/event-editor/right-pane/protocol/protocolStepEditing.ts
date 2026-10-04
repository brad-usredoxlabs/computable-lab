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
    return [{ roleId, ...(description ? { description } : {}) }]
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

export function deleteProtocolStep(payload: Payload, stepId: string): Payload {
  const steps = editableProtocolSteps(payload)
  const step = steps.find(s => s.stepId === stepId)
  if (!step) throw new Error('This step no longer exists. Reload the protocol.')
  if (steps.length === 1) throw new Error('A protocol needs at least one step. Add another step before deleting this one.')
  const execution = step.executionMeta as { startedAt?: string; completedAt?: string } | undefined
  if (execution?.startedAt || execution?.completedAt) throw new Error('This step has already been executed and cannot be deleted.')
  return { ...updateMembership(payload, stepId), steps: steps.filter(s => s.stepId !== stepId).map((s, i) => ({ ...s, ordinal: i + 1 })) }
}
