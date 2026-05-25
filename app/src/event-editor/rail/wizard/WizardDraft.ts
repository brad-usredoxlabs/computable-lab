/**
 * Wizard draft model + derive functions for the New-Group wizard.
 *
 * The wizard collects biologist-language inputs across six panels (identity,
 * control kind, recipe, mechanism, readout, review) and then derives:
 *   - a `RoleDefinitionDraft` compatible with the existing rail reducer,
 *   - 0..N `claim` record payloads (one per authored mechanism edge),
 *   - an optional `mechanism-model` record payload (when ≥1 edge exists).
 *
 * The derive functions are pure so they can be unit-tested without rendering.
 */

import type { Ref } from '../../../types/ref'
import {
  ROS_CELLROX_CHANNEL,
  cloneChannel,
  cloneRequiredMaterials,
  createRequiredMaterial,
  type ChannelDraft,
  type GroupRole,
  type OutcomeDirection,
  type RequiredMaterialDraft,
  type RoleDefinitionDraft,
} from '../state'

// =============================================================================
// Recipe and mechanism shapes
// =============================================================================

export type RecipeAxis =
  | 'chemical'
  | 'organism'
  | 'anatomy'
  | 'cellular-compartment'
  | 'cell-line'
  | 'other'

export interface RecipeItem {
  /** Local id, used by mechanism edges. */
  id: string
  axis: RecipeAxis
  /** Ontology / record ref. Null for ungrounded free-text rows. */
  termRef: Ref | null
  /** Display label (defaults to termRef.label or termRef.id). */
  label: string
  notes?: string
}

export interface MechanismPredicate {
  id: string
  label: string
  namespace: string
}

export type MechanismEdgeObject =
  | { kind: 'ontology'; ref: Ref; label: string }
  | { kind: 'group-outcome' }
  | { kind: 'free-text'; label: string }

export interface MechanismEdge {
  id: string
  /** Subject is either a recipe item or the group's overall measured outcome. */
  subject: { kind: 'recipe'; itemId: string } | { kind: 'group-outcome' }
  predicate: MechanismPredicate
  object: MechanismEdgeObject
  note?: string
}

// =============================================================================
// Readout shape
// =============================================================================

export type ReadoutMethod = 'fluorescence' | 'absorbance' | 'luminescence'

export interface WizardReadout {
  indicatorRef: Ref | null
  indicatorLabel: string
  method: ReadoutMethod
  excitationNm: number | null
  emissionNm: number | null
  /** When the user pinned a registry channel (RDEF-*), this carries the ref. */
  channelRef: Ref | null
  expectedDirection: OutcomeDirection
}

// =============================================================================
// Top-level wizard draft
// =============================================================================

export type ControlKind = 'biological' | 'instrument' | 'sample' | 'blank'

export interface WizardIdentity {
  roleType: GroupRole
  name: string
}

export interface ContextRoleWizardDraft {
  identity: WizardIdentity
  controlKind: ControlKind | null
  recipe: RecipeItem[]
  mechanism: MechanismEdge[]
  readout: WizardReadout
  notes: string
}

// =============================================================================
// Constructors
// =============================================================================

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

export function createRecipeItem(input?: Partial<RecipeItem>): RecipeItem {
  return {
    id: input?.id ?? newId('RCP'),
    axis: input?.axis ?? 'chemical',
    termRef: input?.termRef ?? null,
    label: input?.label ?? '',
    ...(input?.notes !== undefined ? { notes: input.notes } : {}),
  }
}

export function createMechanismEdge(input?: Partial<MechanismEdge>): MechanismEdge {
  return {
    id: input?.id ?? newId('EDG'),
    subject: input?.subject ?? { kind: 'group-outcome' },
    predicate: input?.predicate ?? { id: '', label: '', namespace: '' },
    object: input?.object ?? { kind: 'free-text', label: '' },
    ...(input?.note !== undefined ? { note: input.note } : {}),
  }
}

export function createEmptyWizardDraft(): ContextRoleWizardDraft {
  return {
    identity: { roleType: 'positive_control', name: '' },
    controlKind: null,
    recipe: [createRecipeItem()],
    mechanism: [],
    readout: {
      indicatorRef: null,
      indicatorLabel: '',
      method: 'fluorescence',
      excitationNm: ROS_CELLROX_CHANNEL.kind === 'custom' ? ROS_CELLROX_CHANNEL.excitationNm : null,
      emissionNm: ROS_CELLROX_CHANNEL.kind === 'custom' ? ROS_CELLROX_CHANNEL.emissionNm : null,
      channelRef: null,
      expectedDirection: 'increased',
    },
    notes: '',
  }
}

/** Hydrate a wizard draft from an existing RoleDefinitionDraft (Edit flow). */
export function wizardDraftFromRoleDefinition(
  role: RoleDefinitionDraft,
  notes = '',
): ContextRoleWizardDraft {
  const channel = role.channel
  const isFluorescent = channel.kind === 'readout-ref' || channel.kind === 'custom'
  const channelRef = channel.kind === 'readout-ref' ? channel.ref : null
  return {
    identity: { roleType: role.roleType, name: role.name },
    controlKind: deriveControlKindFromRoleType(role.roleType),
    recipe: role.requiredMaterials.map((item) =>
      createRecipeItem({
        id: item.id,
        axis: axisForRef(item.materialRef),
        termRef: item.materialRef,
        label: item.label,
      }),
    ),
    mechanism: [],
    readout: {
      indicatorRef: null,
      indicatorLabel: channel.label,
      method: isFluorescent ? 'fluorescence' : 'fluorescence',
      excitationNm: channel.kind === 'readout-ref' ? channel.excitationNm ?? null : channel.excitationNm,
      emissionNm: channel.kind === 'readout-ref' ? channel.emissionNm ?? null : channel.emissionNm,
      channelRef,
      expectedDirection: role.expectedDirection,
    },
    notes,
  }
}

function deriveControlKindFromRoleType(roleType: GroupRole): ControlKind | null {
  switch (roleType) {
    case 'sample':
    case 'untreated':
    case 'vehicle_control':
      return 'sample'
    case 'blank':
    case 'no_cells':
      return 'blank'
    case 'positive_control':
    case 'negative_control':
      return null
    default:
      return null
  }
}

function axisForRef(ref: Ref | null): RecipeAxis {
  if (!ref) return 'other'
  if (ref.kind === 'ontology') {
    const ns = ref.namespace.toLowerCase()
    if (ns === 'chebi') return 'chemical'
    if (ns === 'ncbitaxon') return 'organism'
    if (ns === 'uberon') return 'anatomy'
    if (ns === 'go') return 'cellular-compartment'
    if (ns === 'cl') return 'cell-line'
  }
  return 'other'
}

// =============================================================================
// Per-step validation
// =============================================================================

export type WizardStep = 'identity' | 'control-kind' | 'recipe' | 'mechanism' | 'readout' | 'review'

export const WIZARD_STEPS: WizardStep[] = [
  'identity',
  'control-kind',
  'recipe',
  'mechanism',
  'readout',
  'review',
]

export function shouldSkipControlKind(roleType: GroupRole): boolean {
  return (
    roleType === 'sample' ||
    roleType === 'untreated' ||
    roleType === 'blank' ||
    roleType === 'no_cells' ||
    roleType === 'vehicle_control'
  )
}

export function isStepValid(step: WizardStep, draft: ContextRoleWizardDraft): boolean {
  switch (step) {
    case 'identity':
      return draft.identity.name.trim().length > 0
    case 'control-kind':
      return draft.controlKind !== null
    case 'recipe':
      return draft.recipe.some((row) => row.termRef !== null || row.label.trim().length > 0)
    case 'mechanism':
      return draft.mechanism.every(
        (edge) => edge.predicate.id.length > 0 && describeEdgeObject(edge.object).length > 0,
      )
    case 'readout':
      if (draft.readout.indicatorLabel.trim().length === 0 && !draft.readout.indicatorRef) return false
      if (draft.readout.method === 'fluorescence') {
        return draft.readout.excitationNm !== null && draft.readout.emissionNm !== null
      }
      return true
    case 'review':
      return true
  }
}

function describeEdgeObject(obj: MechanismEdgeObject): string {
  switch (obj.kind) {
    case 'ontology':
      return obj.label || obj.ref.id
    case 'group-outcome':
      return 'group-outcome'
    case 'free-text':
      return obj.label.trim()
  }
}

// =============================================================================
// Derive functions — pure, unit-testable
// =============================================================================

/** Convert wizard input → RoleDefinitionDraft compatible with rail state. */
export function deriveRoleDefinition(
  draft: ContextRoleWizardDraft,
  opts?: { existingRoleRef?: Ref; existingId?: string },
): RoleDefinitionDraft {
  const channel: ChannelDraft = deriveChannel(draft.readout)
  const requiredMaterials: RequiredMaterialDraft[] = draft.recipe.map((item) =>
    item.termRef
      ? {
          id: item.id,
          label: item.label || item.termRef.label || item.termRef.id,
          materialRef: item.termRef,
        }
      : {
          id: item.id,
          label: item.label || 'required element',
          materialRef: null,
        },
  )
  const baseId = opts?.existingId ?? `CR-${slugify(draft.identity.name)}`
  return {
    id: baseId,
    name: draft.identity.name,
    roleType: draft.identity.roleType,
    description: draft.notes || '',
    channel,
    requiredMaterials: cloneRequiredMaterials(requiredMaterials.length > 0 ? requiredMaterials : [createRequiredMaterial()]),
    expectedDirection: draft.readout.expectedDirection,
    ...(opts?.existingRoleRef ? { roleRef: opts.existingRoleRef } : {}),
  }
}

export function deriveChannel(readout: WizardReadout): ChannelDraft {
  if (readout.channelRef && readout.channelRef.kind === 'record') {
    const channel: ChannelDraft = {
      kind: 'readout-ref',
      ref: readout.channelRef,
      label: readout.indicatorLabel || readout.channelRef.label || readout.channelRef.id,
    }
    if (readout.excitationNm !== null) channel.excitationNm = readout.excitationNm
    if (readout.emissionNm !== null) channel.emissionNm = readout.emissionNm
    return cloneChannel(channel)
  }
  return cloneChannel({
    kind: 'custom',
    label: readout.indicatorLabel || 'Custom channel',
    excitationNm: readout.excitationNm,
    emissionNm: readout.emissionNm,
  })
}

// =============================================================================
// Authored knowledge records (atomic claims + mechanism-model)
// =============================================================================

export interface AuthoredClaim {
  schemaId: string
  id: string
  payload: Record<string, unknown>
  /** Local edge id this claim was authored for (lets the mechanism-model link back). */
  forEdgeId: string
}

export interface AuthoredMechanismModel {
  schemaId: string
  id: string
  payload: Record<string, unknown>
}

const CLAIM_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/claim.schema.yaml'
const MECHANISM_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/mechanism-model.schema.yaml'
const RO_CAUSES = { kind: 'ontology', id: 'RO:0002411', namespace: 'RO', label: 'causes' } as const

export function deriveClaimDrafts(draft: ContextRoleWizardDraft, slugBase: string): AuthoredClaim[] {
  return draft.mechanism
    .filter((edge) => edge.predicate.id.length > 0)
    .map((edge, index) => {
      const subject = subjectRefForEdge(edge, draft)
      const object = objectRefForEdge(edge, draft)
      const id = `CLM-${slugBase}-${index + 1}`
      const statement = buildClaimStatement(subject, edge.predicate, object)
      const payload: Record<string, unknown> = {
        kind: 'claim',
        id,
        statement,
        subject,
        predicate: {
          kind: 'ontology',
          id: edge.predicate.id,
          namespace: edge.predicate.namespace,
          label: edge.predicate.label,
        },
        object,
      }
      return { schemaId: CLAIM_SCHEMA_ID, id, payload, forEdgeId: edge.id }
    })
}

export function deriveMechanismModelDraft(
  draft: ContextRoleWizardDraft,
  claims: AuthoredClaim[],
  slugBase: string,
): AuthoredMechanismModel | null {
  if (claims.length === 0) return null

  type NodeOut = { id: string; kind: string; label: string; ref?: Ref }
  const nodesByKey = new Map<string, NodeOut>()
  function ensureNode(key: string, defaultKind: string, defaultLabel: string, ref?: Ref): string {
    const existing = nodesByKey.get(key)
    if (existing) return existing.id
    const node: NodeOut = { id: key, kind: defaultKind, label: defaultLabel }
    if (ref) node.ref = ref
    nodesByKey.set(key, node)
    return node.id
  }

  const recipeById = new Map(draft.recipe.map((item) => [item.id, item]))
  const edges = draft.mechanism
    .map((edge) => {
      const claim = claims.find((c) => c.forEdgeId === edge.id)
      if (!claim) return null
      let subjectNodeId: string
      if (edge.subject.kind === 'recipe') {
        const item = recipeById.get(edge.subject.itemId)
        if (!item) return null
        subjectNodeId = ensureNode(
          item.id,
          axisToNodeKind(item.axis),
          item.label || item.termRef?.label || item.termRef?.id || 'recipe-item',
          item.termRef ?? undefined,
        )
      } else {
        subjectNodeId = ensureNode('group-outcome', 'feature', 'Group outcome')
      }
      let objectNodeId: string
      if (edge.object.kind === 'ontology') {
        objectNodeId = ensureNode(
          edge.object.ref.id,
          'state',
          edge.object.label || edge.object.ref.label || edge.object.ref.id,
          edge.object.ref,
        )
      } else if (edge.object.kind === 'group-outcome') {
        objectNodeId = ensureNode('group-outcome', 'feature', 'Group outcome')
      } else {
        objectNodeId = ensureNode(
          `free-${slugify(edge.object.label)}`,
          'state',
          edge.object.label,
        )
      }
      return {
        id: `E-${slugify(edge.predicate.label)}-${edge.id.slice(0, 6)}`,
        claim_ref: {
          kind: 'record',
          id: claim.id,
          type: 'claim',
          label: claim.payload.statement as string | undefined,
        },
        subject: subjectNodeId,
        object: objectNodeId,
      }
    })
    .filter((edge): edge is NonNullable<typeof edge> => edge !== null)

  if (edges.length === 0) return null

  const id = `MECH-${slugBase}`
  const payload: Record<string, unknown> = {
    kind: 'mechanism-model',
    id,
    title: `Mechanism for ${draft.identity.name}`,
    nodes: Array.from(nodesByKey.values()).map((node) => {
      const out: Record<string, unknown> = { id: node.id, kind: node.kind, label: node.label }
      if (node.ref) out.ref = node.ref
      return out
    }),
    edges,
  }
  return { schemaId: MECHANISM_SCHEMA_ID, id, payload }
}

function subjectRefForEdge(edge: MechanismEdge, draft: ContextRoleWizardDraft): Ref {
  const subject = edge.subject
  if (subject.kind === 'recipe') {
    const item = draft.recipe.find((r) => r.id === subject.itemId)
    if (item && item.termRef) return item.termRef
    if (item) return freeTextRef(item.label)
  }
  return freeTextRef(draft.identity.name || 'group-outcome')
}

function objectRefForEdge(edge: MechanismEdge, draft: ContextRoleWizardDraft): Ref {
  if (edge.object.kind === 'ontology') return edge.object.ref
  if (edge.object.kind === 'free-text') return freeTextRef(edge.object.label)
  return freeTextRef(`${draft.identity.name || 'group'} outcome`)
}

function freeTextRef(label: string): Ref {
  return { kind: 'ontology', id: `local:${slugify(label)}`, namespace: 'computable-lab', label: label || 'free-text' }
}

function buildClaimStatement(subject: Ref, predicate: MechanismPredicate, object: Ref): string {
  const s = subject.label || subject.id
  const o = object.label || object.id
  return `${s} ${predicate.label} ${o}`
}

function axisToNodeKind(axis: RecipeAxis): string {
  switch (axis) {
    case 'chemical':
      return 'perturbation'
    case 'organism':
    case 'cell-line':
      return 'state'
    case 'anatomy':
    case 'cellular-compartment':
      return 'state'
    case 'other':
      return 'state'
  }
}

function slugify(value: string): string {
  const slug = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return slug || `r-${Date.now().toString(36)}`
}

// Keep `RO_CAUSES` exported in case callers want a default predicate.
export const DEFAULT_PREDICATE: MechanismPredicate = {
  id: RO_CAUSES.id,
  label: RO_CAUSES.label,
  namespace: RO_CAUSES.namespace,
}

export { describeEdgeObject, slugify }
