import { useState } from 'react'
import { useEventEditor } from '../EventEditorContext'
import type { WellId } from '../../types/plate'
import type { Ref } from '../../types/ref'
import type { AddMaterialDetails, PlateEvent } from '../../types/events'
import { getAddMaterialRef } from '../../types/events'
import {
  channelLabel,
  cloneChannel,
  cloneRequiredMaterials,
  createGroupDraft,
  getPlateRailDraft,
  SEEDED_ROLE_DEFINITIONS,
  type GroupDraft,
  type RequiredMaterialDraft,
  type RoleDefinitionDraft,
} from './state'
import { ContextRoleWizard, type WizardSubmitResult } from './wizard'

interface Props {
  placementId: string
  selectedWells: WellId[]
}

const QUICK_ROLE_IDS = ['CR-ros-positive-control', 'CR-ros-negative-control', 'CR-blank', 'CR-sample']

function refId(ref: string | Ref | undefined): string | null {
  if (!ref) return null
  if (typeof ref === 'string') return ref
  return ref.id
}

function sameRef(a: Ref | null | undefined, b: string | Ref | undefined): boolean {
  const aId = refId(a ?? undefined)
  const bId = refId(b)
  return Boolean(aId && bId && aId === bId)
}

function materialRefsByWell(events: PlateEvent[], placementId: string, wells: WellId[]): Map<WellId, Array<string | Ref>> {
  const targetWells = new Set(wells)
  const refs = new Map<WellId, Array<string | Ref>>()
  for (const well of wells) refs.set(well, [])
  for (const event of events) {
    if (event.event_type !== 'add_material') continue
    const details = event.details as AddMaterialDetails
    if (details.labwareId !== placementId) continue
    const materialRef = getAddMaterialRef(details)
    if (!materialRef) continue
    for (const well of details.wells ?? []) {
      if (!targetWells.has(well)) continue
      refs.get(well)?.push(materialRef)
    }
  }
  return refs
}

function validationForRequirements(
  requirements: RequiredMaterialDraft[],
  events: PlateEvent[],
  placementId: string,
  wells: WellId[],
): { missingIds: string[]; checkedAt: string } {
  const refsByWell = materialRefsByWell(events, placementId, wells)
  const missingIds = requirements
    .filter((requirement) => {
      if (!requirement.materialRef || wells.length === 0) return true
      return !wells.every((well) =>
        (refsByWell.get(well) ?? []).some((materialRef) => sameRef(requirement.materialRef, materialRef)),
      )
    })
    .map((requirement) => requirement.id)
  return { missingIds, checkedAt: new Date().toISOString() }
}

export function KnowledgeRailSection({ placementId, selectedWells }: Props) {
  const { state, actions } = useEventEditor()
  const draft = getPlateRailDraft(state.plateRail, placementId).knowledge
  const [wizard, setWizard] = useState<{
    existingRole: RoleDefinitionDraft | null
    existingGroup: GroupDraft | null
  } | null>(null)
  const [selectedRoleId, setSelectedRoleId] = useState('CR-ros-positive-control')

  const roleDefinitions =
    draft.roleDefinitions.length > 0 ? draft.roleDefinitions : SEEDED_ROLE_DEFINITIONS

  const patchKnowledge = (
    groups: GroupDraft[],
    nextRoles = roleDefinitions,
    roleSaveError: string | null = null,
  ) =>
    actions.updatePlateRail(placementId, {
      knowledge: { groups, roleDefinitions: nextRoles, roleSaveError },
    })

  /** One-click apply for already-defined roles (quick buttons + "Use role"). */
  const applyRoleDirectly = (role: RoleDefinitionDraft) => {
    if (selectedWells.length === 0) return
    const newGroup = createGroupDraft({
      role: role.roleType,
      roleDefinition: role,
      selectedWells,
      name: role.name,
    })
    const validation = validationForRequirements(
      newGroup.requiredMaterials,
      state.events ?? [],
      placementId,
      newGroup.wells,
    )
    newGroup.validation = {
      missingRequiredMaterialIds: validation.missingIds,
      checkedAt: validation.checkedAt,
    }
    patchKnowledge([...draft.groups, newGroup])
  }

  const openWizardForNew = () => setWizard({ existingRole: null, existingGroup: null })

  const openWizardForGroup = (group: GroupDraft) => {
    const role =
      roleDefinitions.find((item) => item.roleRef?.id === group.roleRef?.id || item.id === group.roleRef?.id) ??
      null
    setWizard({ existingRole: role, existingGroup: group })
  }

  const applySelectedRole = () => {
    const role = roleDefinitions.find((item) => item.id === selectedRoleId) ?? roleDefinitions[0]
    if (role) applyRoleDirectly(role)
  }

  const handleWizardSubmit = (result: WizardSubmitResult) => {
    const validation = validationForRequirements(
      result.group.requiredMaterials,
      state.events ?? [],
      placementId,
      result.group.wells,
    )
    const groupWithValidation: GroupDraft = {
      ...result.group,
      channel: cloneChannel(result.group.channel),
      requiredMaterials: cloneRequiredMaterials(result.group.requiredMaterials),
      validation: {
        missingRequiredMaterialIds: validation.missingIds,
        checkedAt: validation.checkedAt,
      },
    }
    const isEdit = wizard?.existingGroup != null
    const groups = isEdit
      ? draft.groups.map((group) =>
          group.id === wizard?.existingGroup?.id ? groupWithValidation : group,
        )
      : [...draft.groups, groupWithValidation]

    const nextRoles = result.roleDefinition.roleRef
      ? [
          ...roleDefinitions.filter(
            (role) =>
              role.id !== result.roleDefinition.id &&
              role.roleRef?.id !== result.roleDefinition.roleRef?.id,
          ),
          result.roleDefinition,
        ]
      : roleDefinitions

    patchKnowledge(groups, nextRoles, null)
    setWizard(null)
  }

  return (
    <section className="plate-rail__section" data-section="groups">
      <div className="plate-rail__section-header-row">
        <h3 className="plate-rail__section-title">Groups</h3>
        <button type="button" className="plate-rail__secondary-btn" onClick={openWizardForNew}>
          New group
        </button>
      </div>

      <div className="plate-rail__quick-actions" aria-label="Assign selected wells">
        {QUICK_ROLE_IDS.map((roleId) => {
          const role =
            roleDefinitions.find((item) => item.id === roleId) ??
            SEEDED_ROLE_DEFINITIONS.find((item) => item.id === roleId)
          if (!role) return null
          return (
            <button
              key={role.id}
              type="button"
              className="plate-rail__secondary-btn"
              disabled={selectedWells.length === 0}
              onClick={() => applyRoleDirectly(role)}
            >
              {role.name}
            </button>
          )
        })}
      </div>

      <div className="plate-rail__role-picker">
        <label className="plate-rail__field">
          <span className="plate-rail__field-label">Role</span>
          <select
            className="plate-rail__input"
            value={selectedRoleId}
            onChange={(e) => setSelectedRoleId(e.target.value)}
          >
            {roleDefinitions.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="plate-rail__secondary-btn"
          disabled={selectedWells.length === 0}
          onClick={applySelectedRole}
        >
          Use role
        </button>
      </div>

      {draft.roleSaveError ? (
        <div className="context-role-warning" role="status">
          Role saved as plate draft only: {draft.roleSaveError}
        </div>
      ) : null}

      {draft.groups.length === 0 ? (
        <p className="plate-rail__section-help">
          Select wells, then choose a role. Quick buttons apply a seeded role directly; <strong>New group</strong>{' '}
          walks you through a wizard for novel controls.
        </p>
      ) : null}

      {draft.groups.map((group) => (
        <article key={group.id} className="plate-rail__group-card">
          <div className="plate-rail__group-card-header">
            <strong>{group.name}</strong>
            <button
              type="button"
              className="plate-rail__icon-btn"
              aria-label={`Remove ${group.name}`}
              onClick={() => patchKnowledge(draft.groups.filter((item) => item.id !== group.id))}
            >
              ×
            </button>
          </div>

          <div className="plate-rail__group-meta">
            <span>
              {group.wells.length === 0
                ? 'No wells assigned'
                : `${group.wells.length} well${group.wells.length === 1 ? '' : 's'} assigned`}
            </span>
            <span>{channelLabel(group.channel)}</span>
            <span>{group.expectedDirection.replace('_', ' ')}</span>
          </div>

          {group.requiredMaterials.length > 0 ? (
            <div className="plate-rail__requirements-summary">
              {group.requiredMaterials.map((item) => (
                <span
                  key={item.id}
                  data-state={
                    group.validation?.missingRequiredMaterialIds.includes(item.id) ? 'missing' : 'present'
                  }
                >
                  {item.label}
                  {item.materialRef?.label ? `: ${item.materialRef.label}` : ''}
                </span>
              ))}
            </div>
          ) : null}

          <div className="plate-rail__anchor-row">
            <button
              type="button"
              className="plate-rail__secondary-btn"
              disabled={selectedWells.length === 0}
              onClick={() =>
                patchKnowledge(
                  draft.groups.map((item) =>
                    item.id === group.id ? { ...item, wells: [...selectedWells] } : item,
                  ),
                )
              }
            >
              Use selection
            </button>
            <button
              type="button"
              className="plate-rail__secondary-btn"
              onClick={() => openWizardForGroup(group)}
            >
              Edit
            </button>
          </div>
        </article>
      ))}

      <ContextRoleWizard
        isOpen={wizard !== null}
        selectedWells={wizard?.existingGroup?.wells?.length ? wizard.existingGroup.wells : selectedWells}
        existingRole={wizard?.existingRole ?? null}
        existingGroup={wizard?.existingGroup ?? null}
        onCancel={() => setWizard(null)}
        onSubmit={handleWizardSubmit}
        onError={(message) =>
          actions.updatePlateRail(placementId, { knowledge: { roleSaveError: message } })
        }
      />
    </section>
  )
}
