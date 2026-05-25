import type { Ref } from '../../types/ref'
import type { WellId } from '../../types/plate'

export type OutcomeDirection = 'increased' | 'decreased' | 'no_change' | 'mixed' | 'unknown'

export type GroupRole =
  | 'sample'
  | 'untreated'
  | 'vehicle_control'
  | 'positive_control'
  | 'negative_control'
  | 'no_cells'
  | 'blank'
  | 'custom'

export type ChannelDraft =
  | { kind: 'readout-ref'; ref: Ref; label: string; excitationNm?: number; emissionNm?: number }
  | { kind: 'custom'; label: string; excitationNm: number | null; emissionNm: number | null }

export interface RequiredMaterialDraft {
  id: string
  label: string
  materialRef: Ref | null
  optional?: boolean
}

export interface RoleDefinitionDraft {
  id: string
  name: string
  roleType: GroupRole
  description: string
  channel: ChannelDraft
  requiredMaterials: RequiredMaterialDraft[]
  expectedDirection: OutcomeDirection
  roleRef?: Ref
  isSeeded?: boolean
}

export interface GroupDraft {
  id: string
  name: string
  role: GroupRole
  roleType: GroupRole
  roleRef?: Ref
  wells: WellId[]
  channel: ChannelDraft
  requiredMaterials: RequiredMaterialDraft[]
  expectedDirection: OutcomeDirection
  notes: string
  validation?: {
    missingRequiredMaterialIds: string[]
    checkedAt: string
  }
}

export interface KnowledgeDraft {
  groups: GroupDraft[]
  roleDefinitions: RoleDefinitionDraft[]
  roleSaveError?: string | null
}

export interface ProtocolDraft {
  title: string
  summary: string
}

export type ReadoutChannelPreset = 'cellrox-deep-red' | 'nadh-autofluorescence' | 'custom'

export interface ReadoutDraft {
  channelPreset: ReadoutChannelPreset
  excitationNm: number | null
  emissionNm: number | null
  instrumentLabel: string
}

export interface PlateRailDraft {
  knowledge: KnowledgeDraft
  protocol: ProtocolDraft
  readout: ReadoutDraft
}

export interface PlateRailPatch {
  knowledge?: Partial<KnowledgeDraft>
  protocol?: Partial<ProtocolDraft>
  readout?: Partial<ReadoutDraft>
}

export const CELLROX_DEEP_RED_EXCITATION_NM = 644
export const CELLROX_DEEP_RED_EMISSION_NM = 665
export const NADH_AUTOFLUORESCENCE_EXCITATION_NM = 340
export const NADH_AUTOFLUORESCENCE_EMISSION_NM = 460

export const ROS_CELLROX_CHANNEL: ChannelDraft = {
  kind: 'custom',
  label: 'CellROX Deep Red',
  excitationNm: CELLROX_DEEP_RED_EXCITATION_NM,
  emissionNm: CELLROX_DEEP_RED_EMISSION_NM,
}

export const ROS_FAR_RED_READOUT_CHANNEL: ChannelDraft = {
  kind: 'readout-ref',
  label: 'Far-Red Fluorescence',
  excitationNm: 640,
  emissionNm: 665,
  ref: {
    kind: 'record',
    id: 'RDEF-PLATE-FAR_RED-ROS',
    type: 'readout-definition',
    label: 'Far-Red Fluorescence',
  },
}

export const MMP_FITC_CHANNEL: ChannelDraft = {
  kind: 'readout-ref',
  label: 'FITC Fluorescence',
  excitationNm: 485,
  emissionNm: 535,
  ref: {
    kind: 'record',
    id: 'RDEF-PLATE-FITC-MMP',
    type: 'readout-definition',
    label: 'FITC Fluorescence',
  },
}

export const CHANNEL_OPTIONS: ChannelDraft[] = [
  ROS_CELLROX_CHANNEL,
  ROS_FAR_RED_READOUT_CHANNEL,
  MMP_FITC_CHANNEL,
]

export const GROUP_ROLE_OPTIONS: Array<{ value: GroupRole; label: string; defaultDirection: OutcomeDirection }> = [
  { value: 'sample', label: 'Sample', defaultDirection: 'unknown' },
  { value: 'untreated', label: 'Untreated', defaultDirection: 'no_change' },
  { value: 'vehicle_control', label: 'Vehicle control', defaultDirection: 'no_change' },
  { value: 'positive_control', label: 'Positive control', defaultDirection: 'increased' },
  { value: 'negative_control', label: 'Negative control', defaultDirection: 'decreased' },
  { value: 'no_cells', label: 'No cells', defaultDirection: 'decreased' },
  { value: 'blank', label: 'Blank', defaultDirection: 'decreased' },
  { value: 'custom', label: 'Custom', defaultDirection: 'unknown' },
]

function draftId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

export function createRequiredMaterial(label = 'required material', materialRef: Ref | null = null): RequiredMaterialDraft {
  return { id: draftId('REQ'), label, materialRef }
}

function roleRef(id: string, label: string): Ref {
  return { kind: 'record', id, type: 'context-role', label }
}

export const SEEDED_ROLE_DEFINITIONS: RoleDefinitionDraft[] = [
  {
    id: 'CR-ros-positive-control',
    name: 'Positive control for ROS',
    roleType: 'positive_control',
    description: 'Wells expected to produce a high ROS fluorescence signal.',
    channel: ROS_CELLROX_CHANNEL,
    requiredMaterials: [
      createRequiredMaterial('cells'),
      createRequiredMaterial('media'),
      createRequiredMaterial('complex I inhibitor'),
      createRequiredMaterial('indicator'),
    ],
    expectedDirection: 'increased',
    roleRef: roleRef('CR-ros-positive-control', 'Positive control for ROS'),
    isSeeded: true,
  },
  {
    id: 'CR-ros-negative-control',
    name: 'Negative control for ROS',
    roleType: 'negative_control',
    description: 'Wells expected to produce a low ROS fluorescence signal.',
    channel: ROS_CELLROX_CHANNEL,
    requiredMaterials: [
      createRequiredMaterial('cells'),
      createRequiredMaterial('media'),
      createRequiredMaterial('indicator'),
    ],
    expectedDirection: 'decreased',
    roleRef: roleRef('CR-ros-negative-control', 'Negative control for ROS'),
    isSeeded: true,
  },
  {
    id: 'CR-mmp-positive-control',
    name: 'Positive control for MMP',
    roleType: 'positive_control',
    description: 'Wells expected to produce a positive mitochondrial membrane potential control signal.',
    channel: MMP_FITC_CHANNEL,
    requiredMaterials: [createRequiredMaterial('cells'), createRequiredMaterial('media'), createRequiredMaterial('indicator')],
    expectedDirection: 'increased',
    roleRef: roleRef('CR-mmp-positive-control', 'Positive control for MMP'),
    isSeeded: true,
  },
  {
    id: 'CR-mmp-negative-control',
    name: 'Negative control for MMP',
    roleType: 'negative_control',
    description: 'Wells expected to produce a low mitochondrial membrane potential signal.',
    channel: MMP_FITC_CHANNEL,
    requiredMaterials: [createRequiredMaterial('cells'), createRequiredMaterial('media'), createRequiredMaterial('indicator')],
    expectedDirection: 'decreased',
    roleRef: roleRef('CR-mmp-negative-control', 'Negative control for MMP'),
    isSeeded: true,
  },
  {
    id: 'CR-blank',
    name: 'Blank',
    roleType: 'blank',
    description: 'No-sample wells used to estimate background signal.',
    channel: ROS_CELLROX_CHANNEL,
    requiredMaterials: [createRequiredMaterial('media'), createRequiredMaterial('indicator')],
    expectedDirection: 'decreased',
    roleRef: roleRef('CR-blank', 'Blank'),
    isSeeded: true,
  },
  {
    id: 'CR-no-cells',
    name: 'No cells',
    roleType: 'no_cells',
    description: 'Wells containing assay reagents without cells.',
    channel: ROS_CELLROX_CHANNEL,
    requiredMaterials: [createRequiredMaterial('media'), createRequiredMaterial('indicator')],
    expectedDirection: 'decreased',
    roleRef: roleRef('CR-no-cells', 'No cells'),
    isSeeded: true,
  },
  {
    id: 'CR-sample',
    name: 'Sample',
    roleType: 'sample',
    description: 'Experimental sample wells.',
    channel: ROS_CELLROX_CHANNEL,
    requiredMaterials: [createRequiredMaterial('cells'), createRequiredMaterial('media'), createRequiredMaterial('indicator')],
    expectedDirection: 'unknown',
    roleRef: roleRef('CR-sample', 'Sample'),
    isSeeded: true,
  },
]

export const DEFAULT_PLATE_RAIL_DRAFT: PlateRailDraft = {
  knowledge: {
    groups: [],
    roleDefinitions: SEEDED_ROLE_DEFINITIONS,
    roleSaveError: null,
  },
  protocol: {
    title: '',
    summary: '',
  },
  readout: {
    channelPreset: 'cellrox-deep-red',
    excitationNm: CELLROX_DEEP_RED_EXCITATION_NM,
    emissionNm: CELLROX_DEEP_RED_EMISSION_NM,
    instrumentLabel: '',
  },
}

export function cloneChannel(channel: ChannelDraft): ChannelDraft {
  return channel.kind === 'readout-ref'
    ? { ...channel, ref: { ...channel.ref } }
    : { ...channel }
}

export function cloneRequiredMaterials(materials: RequiredMaterialDraft[]): RequiredMaterialDraft[] {
  return materials.map((item) => ({
    ...item,
    materialRef: item.materialRef ? { ...item.materialRef } : null,
  }))
}

export function createRoleDefinitionDraft(input?: Partial<RoleDefinitionDraft>): RoleDefinitionDraft {
  const base = SEEDED_ROLE_DEFINITIONS[0]
  return {
    id: input?.id ?? draftId('ROLE'),
    name: input?.name ?? 'New role',
    roleType: input?.roleType ?? 'custom',
    description: input?.description ?? '',
    channel: input?.channel ? cloneChannel(input.channel) : cloneChannel(base.channel),
    requiredMaterials: input?.requiredMaterials ? cloneRequiredMaterials(input.requiredMaterials) : [createRequiredMaterial()],
    expectedDirection: input?.expectedDirection ?? 'unknown',
    ...(input?.roleRef ? { roleRef: { ...input.roleRef } } : {}),
    ...(input?.isSeeded ? { isSeeded: true } : {}),
  }
}

export function createGroupDraft(input?: {
  role?: GroupRole
  roleDefinition?: RoleDefinitionDraft
  selectedWells?: WellId[]
  name?: string
}): GroupDraft {
  const roleDefinition = input?.roleDefinition
  const role = input?.role ?? roleDefinition?.roleType ?? 'sample'
  const option = GROUP_ROLE_OPTIONS.find((item) => item.value === role)
  const label = input?.name ?? roleDefinition?.name ?? option?.label ?? 'Group'
  const defaultChannel = roleDefinition?.channel ?? ROS_CELLROX_CHANNEL
  return {
    id: draftId('GROUP'),
    name: label,
    role,
    roleType: role,
    ...(roleDefinition?.roleRef ? { roleRef: { ...roleDefinition.roleRef } } : {}),
    wells: input?.selectedWells ?? [],
    channel: cloneChannel(defaultChannel),
    requiredMaterials: cloneRequiredMaterials(roleDefinition?.requiredMaterials ?? []),
    expectedDirection: roleDefinition?.expectedDirection ?? option?.defaultDirection ?? 'unknown',
    notes: '',
  }
}

function normalizeKnowledge(knowledge?: Partial<KnowledgeDraft>): KnowledgeDraft {
  const groups = (knowledge?.groups ?? []).map((group) => {
    const role = group.role ?? group.roleType ?? 'sample'
    const option = GROUP_ROLE_OPTIONS.find((item) => item.value === role)
    return {
      ...group,
      role,
      roleType: group.roleType ?? role,
      channel: group.channel ? cloneChannel(group.channel) : cloneChannel(ROS_CELLROX_CHANNEL),
      requiredMaterials: cloneRequiredMaterials(group.requiredMaterials ?? []),
      expectedDirection: group.expectedDirection ?? option?.defaultDirection ?? 'unknown',
      notes: group.notes ?? '',
      wells: group.wells ?? [],
    } as GroupDraft
  })
  const customRoles = knowledge?.roleDefinitions ?? []
  const roleDefinitionsById = new Map<string, RoleDefinitionDraft>()
  for (const role of SEEDED_ROLE_DEFINITIONS) roleDefinitionsById.set(role.id, createRoleDefinitionDraft(role))
  for (const role of customRoles) roleDefinitionsById.set(role.id, createRoleDefinitionDraft(role))
  return {
    groups,
    roleDefinitions: Array.from(roleDefinitionsById.values()),
    roleSaveError: knowledge?.roleSaveError ?? null,
  }
}

export function applyPlateRailPatch(
  draft: PlateRailDraft,
  patch: PlateRailPatch,
): PlateRailDraft {
  return {
    knowledge: patch.knowledge
      ? normalizeKnowledge({ ...draft.knowledge, ...patch.knowledge })
      : normalizeKnowledge(draft.knowledge),
    protocol: patch.protocol
      ? { ...draft.protocol, ...patch.protocol }
      : draft.protocol,
    readout: patch.readout
      ? { ...draft.readout, ...patch.readout }
      : draft.readout,
  }
}

export function getPlateRailDraft(
  rail: Record<string, PlateRailDraft>,
  placementId: string,
): PlateRailDraft {
  return rail[placementId] ? applyPlateRailPatch(rail[placementId], {}) : DEFAULT_PLATE_RAIL_DRAFT
}

export function channelKey(channel: ChannelDraft): string {
  if (channel.kind === 'readout-ref') return channel.ref.id
  return `${channel.label}:${channel.excitationNm ?? ''}:${channel.emissionNm ?? ''}`
}

export function channelLabel(channel: ChannelDraft): string {
  const suffix = channel.excitationNm && channel.emissionNm
    ? ` (Ex/Em ${channel.excitationNm}/${channel.emissionNm})`
    : ''
  return `${channel.label}${suffix}`
}
