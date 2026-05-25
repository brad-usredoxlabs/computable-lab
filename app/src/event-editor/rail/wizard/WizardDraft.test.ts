import { describe, expect, it } from 'vitest'
import {
  createEmptyWizardDraft,
  createMechanismEdge,
  createRecipeItem,
  deriveChannel,
  deriveClaimDrafts,
  deriveMechanismModelDraft,
  deriveRoleDefinition,
  isStepValid,
  wizardDraftFromRoleDefinition,
} from './WizardDraft'
import type { Ref } from '../../../types/ref'

const CHEBI_CLOFIBRATE: Ref = {
  kind: 'ontology',
  id: 'CHEBI:23034',
  namespace: 'CHEBI',
  label: 'clofibrate',
}

const CHEBI_HEPG2: Ref = {
  kind: 'ontology',
  id: 'CL:0000182',
  namespace: 'CL',
  label: 'hepatocyte',
}

const ROS_OUTCOME: Ref = {
  kind: 'ontology',
  id: 'GO:0006979',
  namespace: 'GO',
  label: 'response to oxidative stress',
}

describe('deriveRoleDefinition', () => {
  it('builds a RoleDefinitionDraft from a wizard with one chemical row', () => {
    const draft = createEmptyWizardDraft()
    draft.identity = { roleType: 'positive_control', name: 'ROS positive control' }
    draft.controlKind = 'biological'
    draft.recipe = [createRecipeItem({ axis: 'chemical', termRef: CHEBI_CLOFIBRATE, label: 'clofibrate' })]
    draft.readout = {
      indicatorRef: null,
      indicatorLabel: 'CellROX Deep Red',
      method: 'fluorescence',
      excitationNm: 644,
      emissionNm: 665,
      channelRef: null,
      expectedDirection: 'increased',
    }

    const role = deriveRoleDefinition(draft)

    expect(role.name).toBe('ROS positive control')
    expect(role.roleType).toBe('positive_control')
    expect(role.expectedDirection).toBe('increased')
    expect(role.id).toBe('CR-ros-positive-control')
    expect(role.channel.kind).toBe('custom')
    if (role.channel.kind === 'custom') {
      expect(role.channel.label).toBe('CellROX Deep Red')
      expect(role.channel.excitationNm).toBe(644)
      expect(role.channel.emissionNm).toBe(665)
    }
    expect(role.requiredMaterials).toHaveLength(1)
    expect(role.requiredMaterials[0]!.materialRef).toEqual(CHEBI_CLOFIBRATE)
    expect(role.requiredMaterials[0]!.label).toBe('clofibrate')
  })

  it('preserves existing roleRef when re-deriving for an edit', () => {
    const draft = createEmptyWizardDraft()
    draft.identity = { roleType: 'positive_control', name: 'Existing' }
    const existingRoleRef: Ref = { kind: 'record', id: 'CR-existing', type: 'context-role', label: 'Existing' }
    const role = deriveRoleDefinition(draft, { existingRoleRef, existingId: 'CR-existing' })
    expect(role.id).toBe('CR-existing')
    expect(role.roleRef).toEqual(existingRoleRef)
  })

  it('uses a registry channel ref when channelRef is present', () => {
    const channelRef: Ref = {
      kind: 'record',
      id: 'RDEF-PLATE-FAR_RED-ROS',
      type: 'readout-definition',
      label: 'Far-Red Fluorescence',
    }
    const channel = deriveChannel({
      indicatorRef: null,
      indicatorLabel: 'CellROX',
      method: 'fluorescence',
      excitationNm: 640,
      emissionNm: 665,
      channelRef,
      expectedDirection: 'increased',
    })
    expect(channel.kind).toBe('readout-ref')
    if (channel.kind === 'readout-ref') {
      expect(channel.ref).toEqual(channelRef)
      expect(channel.excitationNm).toBe(640)
      expect(channel.emissionNm).toBe(665)
    }
  })
})

describe('deriveClaimDrafts and deriveMechanismModelDraft', () => {
  function clofibrateDraft() {
    const draft = createEmptyWizardDraft()
    draft.identity = { roleType: 'positive_control', name: 'ROS positive control' }
    draft.controlKind = 'biological'
    const clofibrate = createRecipeItem({ axis: 'chemical', termRef: CHEBI_CLOFIBRATE, label: 'clofibrate' })
    const hepg2 = createRecipeItem({ axis: 'cell-line', termRef: CHEBI_HEPG2, label: 'HepG2' })
    draft.recipe = [clofibrate, hepg2]
    draft.mechanism = [
      createMechanismEdge({
        subject: { kind: 'recipe', itemId: clofibrate.id },
        predicate: { id: 'RO:0002406', label: 'directly activates', namespace: 'RO' },
        object: { kind: 'ontology', ref: ROS_OUTCOME, label: 'ROS' },
      }),
    ]
    draft.readout = {
      indicatorRef: null,
      indicatorLabel: 'CellROX Deep Red',
      method: 'fluorescence',
      excitationNm: 644,
      emissionNm: 665,
      channelRef: null,
      expectedDirection: 'increased',
    }
    return draft
  }

  it('emits one claim per authored edge', () => {
    const draft = clofibrateDraft()
    const claims = deriveClaimDrafts(draft, 'ros-positive-control')
    expect(claims).toHaveLength(1)
    const [claim] = claims
    expect(claim!.id).toBe('CLM-ros-positive-control-1')
    expect(claim!.payload.kind).toBe('claim')
    expect(claim!.payload.subject).toEqual(CHEBI_CLOFIBRATE)
    expect(claim!.payload.object).toEqual(ROS_OUTCOME)
    expect(claim!.payload.statement).toContain('directly activates')
  })

  it('skips edges with empty predicates', () => {
    const draft = clofibrateDraft()
    draft.mechanism.push(
      createMechanismEdge({
        subject: { kind: 'group-outcome' },
        predicate: { id: '', label: '', namespace: '' },
        object: { kind: 'free-text', label: 'incomplete' },
      }),
    )
    const claims = deriveClaimDrafts(draft, 'slug')
    expect(claims).toHaveLength(1)
  })

  it('builds a mechanism-model when ≥1 claim was authored', () => {
    const draft = clofibrateDraft()
    const claims = deriveClaimDrafts(draft, 'ros')
    const mech = deriveMechanismModelDraft(draft, claims, 'ros-positive-control')
    expect(mech).not.toBeNull()
    expect(mech!.id).toBe('MECH-ros-positive-control')
    expect(mech!.payload.kind).toBe('mechanism-model')
    const nodes = mech!.payload.nodes as Array<Record<string, unknown>>
    expect(nodes.length).toBeGreaterThanOrEqual(2)
    const edges = mech!.payload.edges as Array<Record<string, unknown>>
    expect(edges).toHaveLength(1)
    const claimRef = edges[0]!.claim_ref as { id: string }
    expect(claimRef.id).toBe(claims[0]!.id)
  })

  it('returns null mechanism-model when no edges have predicates', () => {
    const draft = clofibrateDraft()
    draft.mechanism = []
    const claims = deriveClaimDrafts(draft, 'slug')
    expect(claims).toHaveLength(0)
    const mech = deriveMechanismModelDraft(draft, claims, 'slug')
    expect(mech).toBeNull()
  })
})

describe('isStepValid', () => {
  it('blocks identity when name is empty', () => {
    const draft = createEmptyWizardDraft()
    expect(isStepValid('identity', draft)).toBe(false)
    draft.identity.name = 'Sample'
    expect(isStepValid('identity', draft)).toBe(true)
  })

  it('control-kind needs a non-null choice', () => {
    const draft = createEmptyWizardDraft()
    expect(isStepValid('control-kind', draft)).toBe(false)
    draft.controlKind = 'biological'
    expect(isStepValid('control-kind', draft)).toBe(true)
  })

  it('readout needs Ex/Em when method is fluorescence', () => {
    const draft = createEmptyWizardDraft()
    draft.readout.indicatorLabel = 'CellROX'
    draft.readout.excitationNm = null
    expect(isStepValid('readout', draft)).toBe(false)
    draft.readout.excitationNm = 644
    draft.readout.emissionNm = 665
    expect(isStepValid('readout', draft)).toBe(true)
  })

  it('readout skips Ex/Em when method is luminescence', () => {
    const draft = createEmptyWizardDraft()
    draft.readout.indicatorLabel = 'Glo'
    draft.readout.method = 'luminescence'
    draft.readout.excitationNm = null
    draft.readout.emissionNm = null
    expect(isStepValid('readout', draft)).toBe(true)
  })

  it('mechanism step is satisfied with zero edges (optional panel)', () => {
    const draft = createEmptyWizardDraft()
    expect(isStepValid('mechanism', draft)).toBe(true)
  })
})

describe('wizardDraftFromRoleDefinition', () => {
  it('round-trips channel and required materials for a seeded role', () => {
    const draft = createEmptyWizardDraft()
    draft.identity = { roleType: 'positive_control', name: 'POS' }
    draft.controlKind = 'biological'
    draft.recipe = [createRecipeItem({ axis: 'chemical', termRef: CHEBI_CLOFIBRATE, label: 'clofibrate' })]
    draft.readout = {
      indicatorRef: null,
      indicatorLabel: 'CellROX Deep Red',
      method: 'fluorescence',
      excitationNm: 644,
      emissionNm: 665,
      channelRef: null,
      expectedDirection: 'increased',
    }
    const role = deriveRoleDefinition(draft)
    const rehydrated = wizardDraftFromRoleDefinition(role)
    expect(rehydrated.identity.name).toBe('POS')
    expect(rehydrated.recipe).toHaveLength(1)
    expect(rehydrated.recipe[0]!.termRef).toEqual(CHEBI_CLOFIBRATE)
    expect(rehydrated.readout.expectedDirection).toBe('increased')
  })
})
