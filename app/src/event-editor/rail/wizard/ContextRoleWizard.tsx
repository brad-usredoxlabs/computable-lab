/**
 * ContextRoleWizard — six-panel modal that replaces the old flat
 * ContextRoleEditorModal. Owns its own draft (discarded on close) and walks
 * the user through Identity → Control kind → Recipe → Mechanism → Readout →
 * Review. On submit it POSTs:
 *   1. one `context-role` record,
 *   2. zero or more atomic `claim` records (one per mechanism edge),
 *   3. an optional `mechanism-model` record wrapping those claims,
 * then bubbles up a GroupDraft so the rail can assign the selected wells.
 */

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { apiClient } from '../../../shared/api/client'
import type { WellId } from '../../../types/plate'
import type { GroupDraft, RoleDefinitionDraft } from '../state'
import {
  cloneChannel,
  cloneRequiredMaterials,
} from '../state'
import {
  WIZARD_STEPS,
  createEmptyWizardDraft,
  deriveClaimDrafts,
  deriveMechanismModelDraft,
  deriveRoleDefinition,
  isStepValid,
  shouldSkipControlKind,
  slugify,
  wizardDraftFromRoleDefinition,
  type ContextRoleWizardDraft,
  type WizardStep,
} from './WizardDraft'
import { Step1Identity } from './steps/Step1Identity'
import { Step2ControlKind } from './steps/Step2ControlKind'
import { Step3Recipe } from './steps/Step3Recipe'
import { Step4Mechanism } from './steps/Step4Mechanism'
import { Step5Readout } from './steps/Step5Readout'
import { Step6Review } from './steps/Step6Review'

const CONTEXT_ROLE_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/context-role.schema.yaml'

export interface WizardSubmitResult {
  group: GroupDraft
  roleDefinition: RoleDefinitionDraft
  isNewRole: boolean
  authoredClaimIds: string[]
  authoredMechanismId: string | null
}

interface Props {
  isOpen: boolean
  selectedWells: WellId[]
  /** When editing an existing role, the rail seeds this. */
  existingRole?: RoleDefinitionDraft | null
  existingGroup?: GroupDraft | null
  onCancel: () => void
  onSubmit: (result: WizardSubmitResult) => void
  onError: (message: string) => void
}

export function ContextRoleWizard({
  isOpen,
  selectedWells,
  existingRole,
  existingGroup,
  onCancel,
  onSubmit,
  onError,
}: Props) {
  const [draft, setDraft] = useState<ContextRoleWizardDraft>(() => createEmptyWizardDraft())
  const [stepIndex, setStepIndex] = useState(0)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Reset wizard whenever the modal opens — partial state is discarded on close.
  useEffect(() => {
    if (!isOpen) return
    if (existingRole) {
      setDraft(wizardDraftFromRoleDefinition(existingRole, existingGroup?.notes ?? ''))
    } else {
      setDraft(createEmptyWizardDraft())
    }
    setStepIndex(0)
    setSaveError(null)
  }, [isOpen, existingRole, existingGroup])

  const step: WizardStep = WIZARD_STEPS[stepIndex] ?? 'identity'

  // The control-kind panel is silently skipped for sample/blank-style roles so
  // the wizard stays one-question-per-panel.
  const skipControlKind = shouldSkipControlKind(draft.identity.roleType)
  useEffect(() => {
    if (skipControlKind && draft.controlKind === null) {
      const inferred = draft.identity.roleType === 'sample' || draft.identity.roleType === 'untreated' || draft.identity.roleType === 'vehicle_control'
        ? 'sample'
        : 'blank'
      setDraft((current) => ({ ...current, controlKind: inferred }))
    }
  }, [skipControlKind, draft.controlKind, draft.identity.roleType])

  const visibleSteps = useMemo<WizardStep[]>(
    () => WIZARD_STEPS.filter((s) => !(s === 'control-kind' && skipControlKind)),
    [skipControlKind],
  )
  const visibleIndex = visibleSteps.indexOf(step)
  const isLast = visibleIndex === visibleSteps.length - 1
  const isFirst = visibleIndex === 0

  const onChange = (patch: Partial<ContextRoleWizardDraft>) => {
    setDraft((current) => ({ ...current, ...patch }))
  }

  const goNext = () => {
    if (!isStepValid(step, draft)) return
    const nextStep = visibleSteps[Math.min(visibleSteps.length - 1, visibleIndex + 1)]
    if (!nextStep) return
    setStepIndex(WIZARD_STEPS.indexOf(nextStep))
  }

  const goBack = () => {
    const prevStep = visibleSteps[Math.max(0, visibleIndex - 1)]
    if (!prevStep) return
    setStepIndex(WIZARD_STEPS.indexOf(prevStep))
  }

  const submit = async () => {
    setSaving(true)
    setSaveError(null)
    try {
      const slugBase = slugify(draft.identity.name) || 'group'
      const existingRef = existingRole?.roleRef
      const existingId = existingRole?.id
      const role = deriveRoleDefinition(draft, {
        ...(existingRef ? { existingRoleRef: existingRef } : {}),
        ...(existingId ? { existingId } : {}),
      })

      // 1. Save context-role record (if not an existing seeded one and no ref yet).
      let savedRole: RoleDefinitionDraft = role
      if (!existingRef && !existingRole?.isSeeded) {
        const payload = buildContextRolePayload(role)
        try {
          await apiClient.createRecord(CONTEXT_ROLE_SCHEMA_ID, payload)
          savedRole = {
            ...role,
            roleRef: { kind: 'record', id: role.id, type: 'context-role', label: role.name },
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Could not save role definition'
          setSaveError(`Role: ${message}`)
          onError(message)
          setSaving(false)
          return
        }
      }

      // 2. Save claim records, one per authored edge.
      const claimDrafts = deriveClaimDrafts(draft, slugBase)
      const authoredClaimIds: string[] = []
      const claimSchemaId = 'https://computable-lab.com/schema/computable-lab/claim.schema.yaml'
      for (const claim of claimDrafts) {
        try {
          await apiClient.createRecord(claimSchemaId, claim.payload)
          authoredClaimIds.push(claim.id)
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Could not save claim'
          setSaveError(`Claim ${claim.id}: ${message}`)
          // Continue — the role itself was saved; mechanism step is optional.
        }
      }

      // 3. Save mechanism-model wrapping the saved claims.
      let authoredMechanismId: string | null = null
      const mechanism = deriveMechanismModelDraft(draft, claimDrafts, slugBase)
      if (mechanism && authoredClaimIds.length === claimDrafts.length) {
        try {
          await apiClient.createRecord(mechanism.schemaId, mechanism.payload)
          authoredMechanismId = mechanism.id
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Could not save mechanism-model'
          setSaveError(`Mechanism: ${message}`)
        }
      }

      const group = buildGroupDraft(savedRole, existingGroup, selectedWells, draft.notes)
      onSubmit({
        group,
        roleDefinition: savedRole,
        isNewRole: !existingRole,
        authoredClaimIds,
        authoredMechanismId,
      })
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  const stepContent = renderStep(step, draft, onChange, selectedWells, saving, saveError)
  const nextDisabled = !isStepValid(step, draft) || saving

  return createPortal(
    <div
      className="cl-wizard__scrim"
      role="presentation"
      onPointerDown={(e) => {
        e.stopPropagation()
        if (e.target === e.currentTarget && !saving) onCancel()
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className="cl-wizard__dialog"
        role="dialog"
        aria-modal="true"
        aria-label="New group wizard"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="cl-wizard__header">
          <div className="cl-wizard__title">
            {existingRole ? 'Edit group' : 'New group'}
            <span className="cl-wizard__subtitle">
              {selectedWells.length === 1 ? '1 selected well' : `${selectedWells.length} selected wells`}
            </span>
          </div>
          <button type="button" className="cl-wizard__close" aria-label="Close" onClick={onCancel}>
            ×
          </button>
        </header>

        <StepIndicator steps={visibleSteps} currentIndex={visibleIndex} />

        <div className="cl-wizard__body">{stepContent}</div>

        <footer className="cl-wizard__footer">
          <button
            type="button"
            className="cl-wizard__secondary-btn"
            onClick={isFirst ? onCancel : goBack}
            disabled={saving}
          >
            {isFirst ? 'Cancel' : 'Back'}
          </button>
          {isLast ? (
            <button
              type="button"
              className="cl-wizard__primary-btn"
              onClick={() => {
                void submit()
              }}
              disabled={selectedWells.length === 0 || saving}
            >
              {saving ? 'Saving…' : existingRole ? 'Save changes' : 'Save group'}
            </button>
          ) : (
            <button
              type="button"
              className="cl-wizard__primary-btn"
              onClick={goNext}
              disabled={nextDisabled}
            >
              Next
            </button>
          )}
        </footer>
      </div>
    </div>,
    document.body,
  )
}

function renderStep(
  step: WizardStep,
  draft: ContextRoleWizardDraft,
  onChange: (patch: Partial<ContextRoleWizardDraft>) => void,
  selectedWells: WellId[],
  saving: boolean,
  saveError: string | null,
) {
  switch (step) {
    case 'identity':
      return <Step1Identity draft={draft} onChange={onChange} />
    case 'control-kind':
      return <Step2ControlKind draft={draft} onChange={onChange} />
    case 'recipe':
      return <Step3Recipe draft={draft} onChange={onChange} />
    case 'mechanism':
      return <Step4Mechanism draft={draft} onChange={onChange} />
    case 'readout':
      return <Step5Readout draft={draft} onChange={onChange} />
    case 'review':
      return (
        <Step6Review draft={draft} selectedWells={selectedWells} saving={saving} saveError={saveError} />
      )
  }
}

function StepIndicator({ steps, currentIndex }: { steps: WizardStep[]; currentIndex: number }) {
  return (
    <ol className="cl-wizard__steps" aria-label="Wizard progress">
      {steps.map((step, index) => (
        <li
          key={step}
          className={`cl-wizard__step-pill ${
            index === currentIndex
              ? 'cl-wizard__step-pill--current'
              : index < currentIndex
              ? 'cl-wizard__step-pill--done'
              : ''
          }`}
        >
          <span className="cl-wizard__step-pill-num">{index + 1}</span>
          <span className="cl-wizard__step-pill-label">{STEP_LABELS[step]}</span>
        </li>
      ))}
    </ol>
  )
}

const STEP_LABELS: Record<WizardStep, string> = {
  identity: 'Identity',
  'control-kind': 'Kind',
  recipe: 'Recipe',
  mechanism: 'Mechanism',
  readout: 'Readout',
  review: 'Review',
}

function buildContextRolePayload(role: RoleDefinitionDraft): Record<string, unknown> {
  return {
    kind: 'context-role',
    id: role.id,
    name: role.name,
    description: role.description || `User-defined ${role.name}`,
    applicable_domains: [],
    prerequisites: role.requiredMaterials
      .filter((item) => item.materialRef)
      .map((item) => ({
        type: 'has_material',
        label: item.label,
        material_ref: item.materialRef,
        optional: item.optional === true,
      })),
    expected_outcome: {
      role_type: role.roleType,
      direction: role.expectedDirection,
      channel:
        role.channel.kind === 'readout-ref'
          ? { readout_def_ref: role.channel.ref, label: role.channel.label }
          : {
              label: role.channel.label,
              excitation_nm: role.channel.excitationNm,
              emission_nm: role.channel.emissionNm,
            },
    },
  }
}

function buildGroupDraft(
  role: RoleDefinitionDraft,
  existing: GroupDraft | null | undefined,
  selectedWells: WellId[],
  notes: string,
): GroupDraft {
  return {
    id: existing?.id ?? `GROUP-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    name: role.name,
    role: role.roleType,
    roleType: role.roleType,
    ...(role.roleRef ? { roleRef: role.roleRef } : {}),
    wells: existing?.wells?.length ? existing.wells : selectedWells,
    channel: cloneChannel(role.channel),
    requiredMaterials: cloneRequiredMaterials(role.requiredMaterials),
    expectedDirection: role.expectedDirection,
    notes,
  }
}
