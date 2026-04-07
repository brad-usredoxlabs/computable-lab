import type { TransferDetails } from './events'

export const OPERATION_TEMPLATE_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/operation-template.schema.yaml'

export type OperationTemplateCategory =
  | 'transfer'
  | 'serial_dilution'
  | 'add_material'
  | 'wash'
  | 'incubate'
  | 'read'
  | 'custom'

export interface OperationTemplateRecord {
  kind: 'operation-template'
  id: string
  name: string
  version?: number
  category: OperationTemplateCategory
  scope: 'well' | 'plate' | 'program'
  description?: string
  visibility?: 'personal' | 'team'
  status?: 'active' | 'deprecated'
  base_event_type: 'transfer' | 'multi_dispense' | 'add_material' | 'wash' | 'incubate' | 'read'
  semantic_defaults?: {
    transfer_mode?: 'transfer' | 'multi_dispense'
    volume?: { value: number; unit: string }
    dead_volume?: { value: number; unit: 'uL' | 'mL' | '%' }
    discard_to_waste?: boolean
  }
  execution_defaults?: TransferDetails['execution_hints']
  tags?: string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function operationTemplateActionType(templateId: string): string {
  return `operation-template:${templateId}`
}

export function parseOperationTemplateEnvelope(envelope: { recordId: string; payload: unknown }): OperationTemplateRecord | null {
  const payload = envelope.payload
  if (!isRecord(payload)) return null
  if (payload.kind !== 'operation-template') return null
  const id = typeof payload.id === 'string' && payload.id.trim() ? payload.id.trim() : envelope.recordId
  if (!id) return null
  const name = typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim() : id
  const category = typeof payload.category === 'string' ? payload.category.trim() as OperationTemplateCategory : 'custom'
  const scope = payload.scope === 'well' || payload.scope === 'plate' || payload.scope === 'program' ? payload.scope : 'program'
  const baseEventType = payload.base_event_type === 'transfer'
    || payload.base_event_type === 'multi_dispense'
    || payload.base_event_type === 'add_material'
    || payload.base_event_type === 'wash'
    || payload.base_event_type === 'incubate'
    || payload.base_event_type === 'read'
    ? payload.base_event_type
    : null
  if (!baseEventType) return null
  const semanticDefaults = isRecord(payload.semantic_defaults) ? payload.semantic_defaults : null
  const executionDefaults = isRecord(payload.execution_defaults) ? payload.execution_defaults as TransferDetails['execution_hints'] : undefined
  return {
    kind: 'operation-template',
    id,
    name,
    ...(typeof payload.version === 'number' ? { version: payload.version } : {}),
    category,
    scope,
    ...(typeof payload.description === 'string' && payload.description.trim() ? { description: payload.description.trim() } : {}),
    ...(payload.visibility === 'personal' || payload.visibility === 'team' ? { visibility: payload.visibility } : {}),
    ...(payload.status === 'active' || payload.status === 'deprecated' ? { status: payload.status } : {}),
    base_event_type: baseEventType,
    ...(semanticDefaults
      ? {
          semantic_defaults: {
            ...(semanticDefaults.transfer_mode === 'transfer' || semanticDefaults.transfer_mode === 'multi_dispense'
              ? { transfer_mode: semanticDefaults.transfer_mode }
              : {}),
            ...(isRecord(semanticDefaults.volume) && typeof semanticDefaults.volume.value === 'number' && typeof semanticDefaults.volume.unit === 'string'
              ? { volume: { value: semanticDefaults.volume.value, unit: semanticDefaults.volume.unit } }
              : {}),
            ...(isRecord(semanticDefaults.dead_volume)
              && typeof semanticDefaults.dead_volume.value === 'number'
              && (semanticDefaults.dead_volume.unit === 'uL' || semanticDefaults.dead_volume.unit === 'mL' || semanticDefaults.dead_volume.unit === '%')
              ? { dead_volume: { value: semanticDefaults.dead_volume.value, unit: semanticDefaults.dead_volume.unit } }
              : {}),
            ...(typeof semanticDefaults.discard_to_waste === 'boolean' ? { discard_to_waste: semanticDefaults.discard_to_waste } : {}),
          },
        }
      : {}),
    ...(executionDefaults ? { execution_defaults: executionDefaults } : {}),
    ...(Array.isArray(payload.tags)
      ? { tags: payload.tags.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0) }
      : {}),
  }
}

export function formatOperationTemplateLabel(template: OperationTemplateRecord): string {
  return template.version ? `${template.name} v${template.version}` : template.name
}
