import type { Ref } from './ref'

export interface MaterialLot {
  kind: 'material-lot'
  id: string
  title?: string
  material_ref: Ref
  lot_number?: string
  source_context_ref?: Ref
  source_event_graph_ref?: Ref
  tags?: string[]
}

export interface PlateLayoutTemplate {
  kind: 'plate-layout-template'
  recordId: string
  title: string
  labware_ref: Ref
  assignment_mode?: 'explicit' | 'parameterized' | 'hybrid'
  assignments: Array<{
    selector:
      | { kind: 'explicit'; wells: string[] }
      | { kind: 'range'; start: string; end: string }
      | { kind: 'region'; region: string }
    inputs: Array<{
      source: 'material_ref' | 'material_lot_ref' | 'context_ref' | 'binding_slot'
      material_ref?: Ref
      material_lot_ref?: Ref
      context_ref?: Ref
      binding_slot?: string
      role?: string
      amount?: { value: number; unit: string }
      concentration?: { value: number; unit: string }
    }>
    notes?: string
  }>
  lane_groups?: Array<{
    lane_id: string
    label?: string
    wells: string[]
    replicate_index?: number
  }>
}

export interface LibraryBundle {
  kind: 'library-bundle'
  recordId: string
  title: string
  version?: string
  entries: Array<{
    entry_id: string
    ref: Ref
    role_tags?: string[]
    position_hint?: string
  }>
  default_layout_template_ref?: Ref
}

export interface PlateSnapshot {
  kind: 'plate-snapshot'
  recordId: string
  title: string
  labware_ref: Ref
  source_event_graph_ref?: Ref
  wells: Array<{
    well: string
    context_ref: Ref
    role?: string
    notes?: string
  }>
}

export interface ContextPromotion {
  kind: 'context-promotion'
  recordId: string
  source_context_refs: Ref[]
  source_event_graph_ref?: Ref
  output_kind: 'material-lot' | 'plate-snapshot' | 'library-bundle'
  output_ref: Ref
  method?: string
  notes?: string
  tags?: string[]
}

export interface PromoteContextRequest {
  sourceContextIds: string[]
  outputKind: 'material-lot' | 'plate-snapshot'
  outputId?: string
  title?: string
  tags?: string[]
  sourceEventGraphRef?: Ref
  materialRef?: Ref
  labwareRef?: Ref
  wellMappings?: Array<{
    well: string
    contextId: string
    role?: string
  }>
}

export interface PromoteContextResponse {
  success: boolean
  outputRecordId?: string
  promotionRecordId?: string
  outputKind?: string
  error?: string
}

export interface LibraryAssetEntry {
  id: string
  type: string
  label: string
  schemaId: string
  keywords?: string[]
}

export interface LibraryAssetListResponse {
  items: LibraryAssetEntry[]
  total: number
}
